-- Use the active Jornada's immutable opening cut and movement ledger for Bajas.
-- Keep legacy stock/FIFO behavior isolated from Jornada-linked requests.
BEGIN;

CREATE OR REPLACE FUNCTION public.bc7_productos_ajuste_jornada(p_turno_sesion_id uuid)
RETURNS TABLE(
  producto_id uuid,
  nombre text,
  stock_actual numeric,
  minimo numeric,
  producto_padre_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;

  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id
        AND a.usuario_id=auth.uid()
        AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar el catálogo de ajustes.' USING ERRCODE='42501';
  END IF;

  IF v_s.estado='EN_CURSO'
     AND EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') THEN
    RETURN QUERY
    WITH saldo AS (
      SELECT q.producto_id,q.cantidad_actual
      FROM public.bc7_jornada_saldos_operativos(v_s.id) q
    ), reservas AS (
      SELECT b.producto_id,sum(b.cantidad)::numeric AS cantidad
      FROM public.bajas b
      WHERE b.turno_sesion_id=v_s.id AND b.estado='PENDIENTE'
      GROUP BY b.producto_id
    )
    SELECT p.id,p.nombre,
      GREATEST(0,COALESCE(s.cantidad_actual,0)-COALESCE(r.cantidad,0))::numeric,
      COALESCE(st.minimo,0)::numeric,
      p.producto_padre_id
    FROM public.productos p
    LEFT JOIN saldo s ON s.producto_id=p.id
    LEFT JOIN reservas r ON r.producto_id=p.id
    LEFT JOIN public.stock st
      ON st.producto_id=p.id AND st.almacen_id=v_s.almacen_id
    WHERE p.activo IS TRUE
    ORDER BY p.nombre,p.id;
  ELSE
    -- Historical/read-only views use the last confirmed physical final cut,
    -- rather than pretending the raw global stock is the Jornada's live balance.
    RETURN QUERY
    WITH final_rows AS (
      SELECT l.producto_id,sum(l.cantidad_contada)::numeric AS cantidad
      FROM public.turno_jornada_inventario_cortes c
      JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
      WHERE c.turno_sesion_id=v_s.id
        AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
      GROUP BY l.producto_id
    )
    SELECT p.id,p.nombre,
      COALESCE(f.cantidad,st.cantidad,0)::numeric,
      COALESCE(st.minimo,0)::numeric,
      p.producto_padre_id
    FROM public.productos p
    LEFT JOIN final_rows f ON f.producto_id=p.id
    LEFT JOIN public.stock st
      ON st.producto_id=p.id AND st.almacen_id=v_s.almacen_id
    WHERE p.activo IS TRUE
    ORDER BY p.nombre,p.id;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_productos_ajuste_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_productos_ajuste_jornada(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bc7_registrar_bajas_multiple_jornada(
  p_turno_sesion_id uuid,
  p_lineas jsonb,
  p_motivo_general text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_group record;
  v_line record;
  v_stock numeric;
  v_solicitud_id uuid;
  v_existing_hash text;
  v_payload_hash text;
  v_creado_nombre text;
  v_child_key uuid;
  v_baja_id uuid;
  v_result jsonb;
  v_count integer;
  v_estado_solicitud text;
  v_auto_aprobar boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay una sesión autenticada para registrar la lista de Bajas.'
      USING ERRCODE='42501';
  END IF;
  IF NOT public.tiene_permiso('bajas','crear') THEN
    RAISE EXCEPTION 'Sin permiso para registrar bajas.'
      USING ERRCODE='42501';
  END IF;
  IF p_turno_sesion_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La jornada y la referencia anti-duplicados son obligatorias.'
      USING ERRCODE='22023';
  END IF;
  IF p_motivo_general IS NULL OR btrim(p_motivo_general)='' OR length(btrim(p_motivo_general))>200 THEN
    RAISE EXCEPTION 'Escribe un motivo general válido para la lista (máximo 200 caracteres).'
      USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'La lista de Bajas debe contener productos.'
      USING ERRCODE='22023';
  END IF;

  v_count:=jsonb_array_length(p_lineas);
  IF v_count<1 OR v_count>100 THEN
    RAISE EXCEPTION 'La lista debe contener entre 1 y 100 productos.'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid,cantidad numeric,motivo text)
    WHERE x.producto_id IS NULL
      OR x.cantidad IS NULL OR x.cantidad<=0
      OR x.motivo IS NULL OR btrim(x.motivo)=''
      OR length(btrim(x.motivo))>200
  ) THEN
    RAISE EXCEPTION 'Cada producto necesita una cantidad positiva y un motivo válido.'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT x.producto_id
    FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid)
    GROUP BY x.producto_id HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'No repitas el mismo producto. Suma sus cantidades en una sola línea.'
      USING ERRCODE='22023';
  END IF;

  v_payload_hash:=md5(p_turno_sesion_id::text||':'||btrim(p_motivo_general)||':'||p_lineas::text);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text||':'||p_idempotency_key::text,0)
  );

  -- Return the original request on an exact retry, even if the Jornada was
  -- completed after the original request committed but its response was lost.
  SELECT s.id,s.payload_hash
    INTO v_solicitud_id,v_existing_hash
  FROM public.bajas_solicitudes s
  WHERE s.creado_por=auth.uid()
    AND s.idempotency_key=p_idempotency_key
  FOR UPDATE;

  IF v_solicitud_id IS NOT NULL THEN
    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'La referencia anti-duplicados ya pertenece a otra lista de Bajas.'
        USING ERRCODE='23505';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.bajas b
      WHERE b.solicitud_id=v_solicitud_id
        AND b.turno_sesion_id IS DISTINCT FROM p_turno_sesion_id
    ) THEN
      RAISE EXCEPTION 'La lista guardada no coincide con la jornada indicada.'
        USING ERRCODE='23514';
    END IF;
    SELECT jsonb_build_object(
      'solicitud_id',s.id,
      'count',count(b.id),
      'estado',s.estado,
      'bajas',coalesce(
        jsonb_agg(jsonb_build_object('id',b.id,'estado',b.estado) ORDER BY b.creado_en,b.id)
          FILTER(WHERE b.id IS NOT NULL),
        '[]'::jsonb
      )
    )
    INTO v_result
    FROM public.bajas_solicitudes s
    LEFT JOIN public.bajas b ON b.solicitud_id=s.id
    WHERE s.id=v_solicitud_id
    GROUP BY s.id,s.estado;
    RETURN v_result;
  END IF;

  -- The helper verifies the authenticated assignee and returns the active
  -- tranche; the row lock serializes this request with Jornada closure.
  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'Solo se pueden registrar bajas en una Jornada EN_CURSO.'
      USING ERRCODE='23514';
  END IF;
  IF v_t.id IS NULL OR v_t.turno_sesion_id IS DISTINCT FROM v_s.id
     OR v_t.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No se pudo verificar el tramo activo de esta Jornada.'
      USING ERRCODE='42501';
  END IF;

  -- The Jornada opening count and linked movement ledger are the authoritative
  -- inventory. Raw public.stock is a separate warehouse snapshot and does not
  -- contain the immutable opening cut or all linked incoming transfers.
  -- Pending requests reserve quantity so concurrent/repeated lists cannot
  -- oversubscribe the same physical balance.
  FOR v_group IN
    SELECT x.producto_id,sum(x.cantidad) AS cantidad_total
    FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid,cantidad numeric)
    GROUP BY x.producto_id
    ORDER BY x.producto_id
  LOOP
    SELECT GREATEST(
      0,
      COALESCE(saldo.cantidad_actual,0)-COALESCE(reservado.cantidad,0)
    )
    INTO v_stock
    FROM (SELECT 1) AS seed
    LEFT JOIN LATERAL (
      SELECT q.cantidad_actual
      FROM public.bc7_jornada_saldos_operativos(v_s.id) q
      WHERE q.producto_id=v_group.producto_id
    ) saldo ON true
    LEFT JOIN LATERAL (
      SELECT sum(b.cantidad)::numeric AS cantidad
      FROM public.bajas b
      WHERE b.turno_sesion_id=v_s.id
        AND b.producto_id=v_group.producto_id
        AND b.estado='PENDIENTE'
    ) reservado ON true;

    IF COALESCE(v_stock,0)<v_group.cantidad_total THEN
      RAISE EXCEPTION
        'Stock operativo insuficiente para la baja del producto %. Disponible: %, solicitado: %.',
        v_group.producto_id,COALESCE(v_stock,0),v_group.cantidad_total
        USING ERRCODE='P0001';
    END IF;
  END LOOP;

  SELECT u.nombre INTO v_creado_nombre
  FROM public.usuarios u
  WHERE u.id=auth.uid();

  v_auto_aprobar :=
    public.tiene_permiso('bajas','editar_any')
    OR public.tiene_permiso('auditoria','editar_any');

  INSERT INTO public.bajas_solicitudes(
    almacen_id,creado_por,creado_nombre,motivo_general,estado,
    idempotency_key,payload_hash,total_lineas,cantidad_total
  )
  SELECT v_s.almacen_id,auth.uid(),coalesce(v_creado_nombre,''),
         btrim(p_motivo_general),'PENDIENTE',
         p_idempotency_key,v_payload_hash,v_count,sum(x.cantidad)
  FROM jsonb_to_recordset(p_lineas) AS x(producto_id uuid,cantidad numeric)
  RETURNING id INTO v_solicitud_id;

  FOR v_line IN
    SELECT x.producto_id,x.cantidad,btrim(x.motivo) AS motivo,item.ordinality
    FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS item(value,ordinality)
    CROSS JOIN LATERAL jsonb_to_record(item.value) AS x(
      producto_id uuid,cantidad numeric,motivo text
    )
    ORDER BY item.ordinality
  LOOP
    v_child_key:=md5(auth.uid()::text||':'||p_idempotency_key::text||':'||v_line.ordinality::text)::uuid;
    -- Insert directly with Jornada provenance. The generic crear_baja()
    -- endpoint validates legacy public.stock/FIFO and is not suitable here.
    INSERT INTO public.bajas(
      almacen_id,producto_id,cantidad,motivo,ciclo_id,sesion_id,
      creado_por,creado_nombre,estado,idempotency_key,
      turno_sesion_id,turno_tramo_id,solicitud_id,
      revisado_por,revisado_nombre,comentario_revision,fecha_revision
    ) VALUES(
      v_s.almacen_id,v_line.producto_id,v_line.cantidad,
      v_line.motivo,NULL,NULL,
      auth.uid(),coalesce(v_creado_nombre,''),
      CASE WHEN v_auto_aprobar THEN 'APROBADA' ELSE 'PENDIENTE' END,
      v_child_key,
      v_s.id,v_t.id,v_solicitud_id,
      CASE WHEN v_auto_aprobar THEN auth.uid() ELSE NULL END,
      CASE WHEN v_auto_aprobar THEN coalesce(v_creado_nombre,'') ELSE NULL END,
      CASE WHEN v_auto_aprobar THEN
        'Autoaprobada al registrarse: el creador tiene permiso global de aprobación de Bajas.'
        ELSE NULL END,
      CASE WHEN v_auto_aprobar THEN now() ELSE NULL END
    )
    RETURNING id INTO v_baja_id;

    IF v_baja_id IS NULL THEN
      RAISE EXCEPTION 'No se pudo registrar cada producto dentro de la solicitud de Bajas.'
        USING ERRCODE='23514';
    END IF;
  END LOOP;

  UPDATE public.bajas_solicitudes s
  SET total_lineas=(SELECT count(*) FROM public.bajas b WHERE b.solicitud_id=s.id),
      cantidad_total=(SELECT coalesce(sum(b.cantidad),0) FROM public.bajas b WHERE b.solicitud_id=s.id),
      estado=CASE
        WHEN EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE') THEN 'PENDIENTE'
        WHEN EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='RECHAZADA') THEN 'RECHAZADA'
        ELSE 'APROBADA'
      END,
      revisado_por=CASE
        WHEN NOT EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE')
          THEN (SELECT (array_agg(b.revisado_por) FILTER(WHERE b.revisado_por IS NOT NULL))[1]
                FROM public.bajas b WHERE b.solicitud_id=s.id)
        ELSE NULL
      END,
      revisado_nombre=CASE
        WHEN NOT EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE')
          THEN (SELECT max(b.revisado_nombre) FROM public.bajas b WHERE b.solicitud_id=s.id)
        ELSE NULL
      END,
      fecha_revision=CASE
        WHEN NOT EXISTS(SELECT 1 FROM public.bajas b WHERE b.solicitud_id=s.id AND b.estado='PENDIENTE')
          THEN now()
        ELSE NULL
      END
  WHERE s.id=v_solicitud_id;

  SELECT estado INTO v_estado_solicitud
  FROM public.bajas_solicitudes WHERE id=v_solicitud_id;

  INSERT INTO public.turno_jornada_eventos(
    almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues
  )
  VALUES(
    v_s.almacen_id,v_s.jornada_programacion_id,auth.uid(),'BAJA_SOLICITADA',
    btrim(p_motivo_general),
    jsonb_build_object('sesion_id',v_s.id,'tramo_id',v_t.id),
    jsonb_build_object(
      'solicitud_id',v_solicitud_id,'tipo','baja_lista',
      'productos',v_count,'estado',v_estado_solicitud
    )
  );

  SELECT jsonb_build_object(
    'solicitud_id',s.id,
    'count',count(b.id),
    'estado',s.estado,
    'bajas',coalesce(
      jsonb_agg(jsonb_build_object('id',b.id,'estado',b.estado) ORDER BY b.creado_en,b.id),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM public.bajas_solicitudes s
  JOIN public.bajas b ON b.solicitud_id=s.id
  WHERE s.id=v_solicitud_id
  GROUP BY s.id,s.estado;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.resolver_aprobacion_operativa(p_tipo text, p_id uuid, p_decision text, p_comentario text DEFAULT NULL::text, p_cantidad_real numeric DEFAULT NULL::numeric, p_monto_real numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nombre text;
  v_alm uuid;
  v_prod uuid;
  v_cant numeric;
  v_cant_real numeric;
  v_monto numeric;
  v_estado text;
  v_turno_sesion_id uuid;
  v_reinversion public.reinversiones;
  v_entrega record;
  v_line record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE='42501';
  END IF;

  -- Authorization is per operation type; permission to approve expenses must
  -- not implicitly grant authority over inventory waste or write-offs.
  IF p_tipo='gasto' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('gastos','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar gastos.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='merma' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('mermas','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar mermas.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='baja' THEN
    IF NOT (public.tiene_permiso('auditoria','editar_any') OR public.tiene_permiso('bajas','editar_any')) THEN
      RAISE EXCEPTION 'Sin permiso para revisar bajas.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='reinversion' THEN
    IF NOT public.tiene_permiso('reinversiones','editar_any') THEN
      RAISE EXCEPTION 'Sin permiso para revisar reinversiones.' USING ERRCODE='42501';
    END IF;
  ELSIF p_tipo='entrega_diaria' THEN
    IF NOT public.tiene_permiso('entregas_caja','editar_any') THEN
      RAISE EXCEPTION 'Solo Dueño puede revisar entregas diarias de efectivo.' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de aprobación desconocido.';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('APROBAR','RECHAZAR') THEN
    RAISE EXCEPTION 'Decisión inválida.';
  END IF;
  IF p_decision='RECHAZAR' AND NULLIF(btrim(p_comentario),'') IS NULL THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo.';
  END IF;

  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=auth.uid();

  IF p_tipo='gasto' THEN
    SELECT estado,monto INTO v_estado,v_monto
    FROM public.gastos WHERE id=p_id FOR UPDATE;
    IF v_estado IS NULL OR v_estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'Gasto no pendiente o inexistente.';
    END IF;
    IF p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<=0 THEN
      RAISE EXCEPTION 'Monto real inválido.';
    END IF;
    UPDATE public.gastos
    SET monto=CASE WHEN p_decision='APROBAR' AND p_monto_real IS NOT NULL THEN p_monto_real ELSE monto END,
        estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADO' ELSE 'RECHAZADO' END,
        revisado_por=auth.uid(),
        revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),'') ||
          CASE WHEN p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<>v_monto
            THEN ' | Monto declarado: '||v_monto::text||' | Monto aprobado: '||p_monto_real::text ELSE '' END,
        fecha_revision=now(), actualizado_en=now()
    WHERE id=p_id;

  ELSIF p_tipo IN ('merma','baja') THEN
    IF p_tipo='merma' THEN
      SELECT estado,almacen_id,producto_id,cantidad
      INTO v_estado,v_alm,v_prod,v_cant
      FROM public.mermas WHERE id=p_id FOR UPDATE;
    ELSE
      SELECT estado,almacen_id,producto_id,cantidad,turno_sesion_id
      INTO v_estado,v_alm,v_prod,v_cant,v_turno_sesion_id
      FROM public.bajas WHERE id=p_id FOR UPDATE;
    END IF;

    IF v_estado IS NULL OR v_estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La solicitud de ajuste no está pendiente o no existe.';
    END IF;

    IF p_decision='APROBAR' THEN
      v_cant_real:=COALESCE(p_cantidad_real,v_cant);
      IF v_cant_real IS NULL OR v_cant_real<=0 OR v_cant_real>v_cant THEN
        RAISE EXCEPTION 'Cantidad real inválida; debe ser mayor que cero y no superar la cantidad solicitada.';
      END IF;
      -- Legacy adjustments are applied to public.stock/FIFO. Jornada-linked
      -- Bajas are already represented by the Jornada ledger and physical final
      -- count, so applying them globally would double-decrement inventory.
      IF p_tipo='merma' OR v_turno_sesion_id IS NULL THEN
        PERFORM public._aplicar_salida_aprobada(v_alm,v_prod,v_cant_real);
      END IF;
    END IF;

    IF p_tipo='merma' THEN
      UPDATE public.mermas
      SET cantidad=CASE WHEN p_decision='APROBAR' THEN v_cant_real ELSE cantidad END,
          estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          revisado_por=auth.uid(), revisado_nombre=v_nombre,
          comentario_revision=NULLIF(btrim(p_comentario),'') ||
            CASE WHEN p_decision='APROBAR' AND v_cant_real<>v_cant
              THEN ' | Cantidad declarada: '||v_cant::text||' | Cantidad aprobada: '||v_cant_real::text ELSE '' END,
          fecha_revision=now(), actualizado_en=now()
      WHERE id=p_id;
    ELSE
      UPDATE public.bajas
      SET cantidad=CASE WHEN p_decision='APROBAR' THEN v_cant_real ELSE cantidad END,
          estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          revisado_por=auth.uid(), revisado_nombre=v_nombre,
          comentario_revision=NULLIF(btrim(p_comentario),'') ||
            CASE WHEN p_decision='APROBAR' AND v_cant_real<>v_cant
              THEN ' | Cantidad declarada: '||v_cant::text||' | Cantidad aprobada: '||v_cant_real::text ELSE '' END,
          fecha_revision=now(), actualizado_en=now()
      WHERE id=p_id;
    END IF;
  ELSIF p_tipo='reinversion' THEN
    SELECT * INTO v_reinversion FROM public.reinversiones WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR v_reinversion.estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La reinversión no está pendiente o no existe.' USING ERRCODE='23514';
    END IF;
    IF p_decision='APROBAR' THEN
      IF p_monto_real IS NOT NULL AND p_monto_real<>v_reinversion.total THEN
        RAISE EXCEPTION 'El importe debe aprobarse por el total informado; corrige la solicitud antes de aprobar.'
          USING ERRCODE='23514';
      END IF;
      FOR v_line IN
        SELECT rl.producto_id,rl.cantidad_base,rl.costo_unitario
        FROM public.reinversiones_lineas rl
        WHERE rl.reinversion_id=v_reinversion.id
        ORDER BY rl.id
      LOOP
        INSERT INTO public.lotes_compra
          (producto_id,almacen_id,cantidad_inicial,cantidad_restante,costo_unitario,
           fecha_compra,origen,usuario_id,compra_id)
        VALUES
          (v_line.producto_id,v_reinversion.almacen_id,v_line.cantidad_base,
           v_line.cantidad_base,v_line.costo_unitario,v_reinversion.fecha,
           'reinversion',coalesce(v_reinversion.usuario_id,auth.uid()),NULL);
        -- Update an existing warehouse stock row directly. INSERT ... ON CONFLICT
        -- evaluates the BEFORE INSERT minimum guard with minimo=0 before it can
        -- reach the conflict handler, even when the persisted row already has minimo>0.
        UPDATE public.stock st
        SET cantidad=st.cantidad+v_line.cantidad_base,updated_at=now()
        WHERE st.producto_id=v_line.producto_id
          AND st.almacen_id=v_reinversion.almacen_id;
        IF NOT FOUND THEN
          -- A genuinely new stock row still needs an explicit positive minimum.
          INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
          VALUES(v_line.producto_id,v_reinversion.almacen_id,v_line.cantidad_base,0);
        END IF;
      END LOOP;
      PERFORM private.registrar_movimiento_caja(
        v_reinversion.almacen_id,v_reinversion.ciclo_id,v_reinversion.sesion_id,
        v_reinversion.turno_id,'REINVERSION','SALIDA',v_reinversion.total,
        'reinversion',v_reinversion.id,
        coalesce(nullif(trim(v_reinversion.proveedor),''),'Reinversión de inventario')
      );
    END IF;
    UPDATE public.reinversiones
    SET estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
        revisado_por=auth.uid(),revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),''),
        fecha_revision=now()
    WHERE id=p_id;
    IF v_reinversion.turno_sesion_id IS NOT NULL THEN
      INSERT INTO public.turno_jornada_eventos
        (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
      SELECT v_reinversion.almacen_id,s.jornada_programacion_id,auth.uid(),
        CASE WHEN p_decision='APROBAR' THEN 'REINVERSION_APROBADA' ELSE 'REINVERSION_RECHAZADA' END,
        NULLIF(btrim(p_comentario),''),
        jsonb_build_object('reinversion_id',p_id,'estado','PENDIENTE'),
        jsonb_build_object('reinversion_id',p_id,'estado',CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
          'stock_y_caja_aplicados',p_decision='APROBAR')
      FROM public.turno_sesiones s WHERE s.id=v_reinversion.turno_sesion_id;
    END IF;
  ELSIF p_tipo='entrega_diaria' THEN
    SELECT * INTO v_entrega
    FROM public.turno_jornada_entregas_diarias
    WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR v_entrega.estado<>'PENDIENTE' THEN
      RAISE EXCEPTION 'La entrega diaria no está pendiente o no existe.' USING ERRCODE='23514';
    END IF;
    IF p_decision='APROBAR' AND p_monto_real IS NOT NULL AND p_monto_real<0 THEN
      RAISE EXCEPTION 'El importe contado no puede ser negativo.' USING ERRCODE='22023';
    END IF;
    UPDATE public.turno_jornada_entregas_diarias
    SET estado=CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END,
        monto_aprobado=CASE WHEN p_decision='APROBAR' THEN coalesce(p_monto_real,monto_declarado) ELSE NULL END,
        revisado_por=auth.uid(),revisado_nombre=v_nombre,
        comentario_revision=NULLIF(btrim(p_comentario),''),
        fecha_revision=now()
    WHERE id=p_id;
    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    SELECT e.almacen_id,s.jornada_programacion_id,auth.uid(),
      CASE WHEN p_decision='APROBAR' THEN 'ENTREGA_DIARIA_APROBADA' ELSE 'ENTREGA_DIARIA_RECHAZADA' END,
      NULLIF(btrim(p_comentario),''),
      jsonb_build_object('entrega_id',p_id,'fecha',e.fecha,'monto_declarado',e.monto_declarado,'estado','PENDIENTE'),
      jsonb_build_object('entrega_id',p_id,'monto_aprobado',CASE WHEN p_decision='APROBAR' THEN coalesce(p_monto_real,e.monto_declarado) ELSE NULL END,
        'estado',CASE WHEN p_decision='APROBAR' THEN 'APROBADA' ELSE 'RECHAZADA' END)
    FROM public.turno_jornada_entregas_diarias e
    JOIN public.turno_sesiones s ON s.id=e.turno_sesion_id
    WHERE e.id=p_id;
  END IF;

  RETURN jsonb_build_object('ok',true,'tipo',p_tipo,'id',p_id,'decision',p_decision,'revisado_por',v_nombre);
END;
$function$;
REVOKE ALL ON FUNCTION public.resolver_aprobacion_operativa(text,uuid,text,text,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolver_aprobacion_operativa(text,uuid,text,text,numeric,numeric) TO authenticated,service_role;

COMMIT;
