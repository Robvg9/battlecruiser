BEGIN;

-- Sealed final inventory: validate and persist every product belonging to the
-- Jornada's FINAL period set. The original INICIAL cut is never modified.
CREATE OR REPLACE FUNCTION public.bc7_responsable_registrar_inventario_final_sellado_jornada(p_turno_sesion_id uuid, p_lineas jsonb, p_observacion text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_t public.turno_tramos;
  v_turn public.turnos;
  v_initial_cut uuid;
  v_expected integer;
  v_received integer;
  v_distinct integer;
  v_cut_id uuid;
  v_payload_hash text;
  v_existing jsonb;
  v_note text:=coalesce(nullif(left(btrim(coalesce(p_observacion,'')),1000),''),'Conteo físico realizado por la responsable desde la PWA al corte operativo original.');
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('turnos','ver') THEN
    RAISE EXCEPTION 'Solo la responsable asignada con permiso de jornada puede registrar el inventario final.' USING ERRCODE='42501';
  END IF;
  IF p_turno_sesion_id IS NULL OR p_idempotency_key IS NULL
     OR p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array'
     OR jsonb_array_length(p_lineas)=0 OR jsonb_array_length(p_lineas)>500 THEN
    RAISE EXCEPTION 'Jornada, clave anti-duplicados y lista completa de productos son obligatorias.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
       OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
       OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
  ) THEN
    RAISE EXCEPTION 'Cada producto necesita una cantidad física no negativa con hasta 3 decimales.' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
    AND estado='CERRADA_OPERATIVAMENTE'
  FOR UPDATE;
  IF NOT FOUND OR v_s.corte_operativo_at IS NULL THEN
    RAISE EXCEPTION 'El inventario final tardío requiere una Jornada sellada con corte operativo inmutable.' USING ERRCODE='23514';
  END IF;
  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_turn
  FROM public.turnos
  WHERE id=v_s.turno_id
  FOR UPDATE;
  IF NOT FOUND OR v_turn.estado<>'ABIERTO'
     OR coalesce(v_turn.estado_maestro,v_turn.estado)<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El Turno maestro ya está cerrado; no se admite el inventario final tardío.' USING ERRCODE='23514';
  END IF;
  IF v_t.estado<>'COMPLETADO' OR v_t.fin_at IS DISTINCT FROM v_s.corte_operativo_at
     OR v_t.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No se encontró el tramo sellado correspondiente a la responsable.' USING ERRCODE='23514';
  END IF;

  v_payload_hash:=md5(p_lineas::text||'|'||v_note);
  SELECT e.payload INTO v_existing
  FROM public.turno_eventos e
  WHERE e.turno_sesion_id=v_s.id
    AND e.tipo='INVENTARIO_FINAL_RESPONSABLE_POST_SELLO'
    AND e.payload->>'idempotency_key'=p_idempotency_key::text
  ORDER BY e.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    IF v_existing->>'payload_hash' IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'La clave anti-duplicados ya se utilizó con otro conteo.' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'idempotente',true,
      'corte_id',v_existing->>'final_cut_id',
      'productos',v_existing->>'product_count',
      'corte_operativo_at',v_existing->>'corte_operativo_at'
    );
  END IF;

  SELECT c.id INTO v_initial_cut
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
  ORDER BY c.confirmado_en DESC NULLS LAST,c.creado_en DESC
  LIMIT 1;
  IF v_initial_cut IS NULL THEN
    RAISE EXCEPTION 'No existe inventario inicial confirmado para definir los productos del conteo.' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_expected
  FROM public.bc7_jornada_productos_corte(v_s.id,'FINAL');
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_received,v_distinct
  FROM jsonb_array_elements(p_lineas) x(value);
  IF v_expected=0 OR v_received<>v_expected OR v_distinct<>v_received THEN
    RAISE EXCEPTION 'El inventario final debe incluir exactamente los % productos del período; recibió %.',v_expected,v_received USING ERRCODE='23514';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    WHERE NOT EXISTS(
      SELECT 1 FROM public.bc7_jornada_productos_corte(v_s.id,'FINAL') expected
      WHERE expected.producto_id=(x.value->>'producto_id')::uuid
    )
  ) OR EXISTS(
    SELECT 1 FROM public.bc7_jornada_productos_corte(v_s.id,'FINAL') expected
    WHERE NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
      WHERE (x.value->>'producto_id')::uuid=expected.producto_id
    )
  ) THEN
    RAISE EXCEPTION 'El conjunto de productos no coincide exactamente con el inventario FINAL del período.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
  ) THEN
    RAISE EXCEPTION 'Esta Jornada ya tiene un inventario final. No se sobrescribió.' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes(
    turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion
  )
  VALUES(
    v_s.id,'FINAL','CONFIRMADO',auth.uid(),auth.uid(),
    'Registro de responsable posterior al sello · efectivo al corte '||
      to_char(v_s.corte_operativo_at AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI')||
      ' America/Havana · '||v_note
  )
  RETURNING id INTO v_cut_id;

  WITH balances AS (
    SELECT coalesce(p.producto_padre_id,p.id) AS producto_id,
           sum(b.cantidad_actual)::numeric AS cantidad_actual
    FROM public.bc7_jornada_saldos_operativos(v_s.id) b
    JOIN public.productos p ON p.id=b.producto_id
    GROUP BY coalesce(p.producto_padre_id,p.id)
  )
  INSERT INTO public.turno_jornada_inventario_lineas(
    corte_id,producto_id,cantidad_contada,stock_sistema
  )
  SELECT v_cut_id,expected.producto_id,
         (x.value->>'cantidad')::numeric,
         coalesce(balance.cantidad_actual,0)
  FROM public.bc7_jornada_productos_corte(v_s.id,'FINAL') expected
  JOIN jsonb_array_elements(p_lineas) x(value)
    ON (x.value->>'producto_id')::uuid=expected.producto_id
  LEFT JOIN balances balance ON balance.producto_id=expected.producto_id;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload
  )
  VALUES(
    v_s.turno_id,v_s.id,v_t.id,auth.uid(),'INVENTARIO_FINAL_RESPONSABLE_POST_SELLO',
    jsonb_build_object(
      'final_cut_id',v_cut_id,
      'idempotency_key',p_idempotency_key,
      'payload_hash',v_payload_hash,
      'product_count',v_expected,
      'corte_operativo_at',v_s.corte_operativo_at,
      'fecha_efectiva',to_char(v_s.corte_operativo_at AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI'),
      'stock_global_modificado',false,
      'corte_inicial_modificado',false,
      'responsable_id',auth.uid(),
      'observacion',v_note
    )
  );

  RETURN jsonb_build_object(
    'ok',true,'idempotente',false,'corte_id',v_cut_id,
    'productos',v_expected,'corte_operativo_at',v_s.corte_operativo_at,
    'stock_global_modificado',false
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bc7_admin_registrar_inventario_final_sellado_jornada(p_turno_sesion_id uuid, p_lineas jsonb, p_observacion text, p_fuente_documental text, p_fuente_sha256 text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_turn public.turnos;
  v_initial_cut uuid;
  v_expected integer;
  v_received integer;
  v_distinct integer;
  v_cut_id uuid;
  v_payload_md5 text;
  v_existing jsonb;
  v_note text:=nullif(left(btrim(coalesce(p_observacion,'')),900),'');
  v_source text:=nullif(left(btrim(coalesce(p_fuente_documental,'')),300),'');
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede registrar el inventario final histórico de una Jornada sellada.'
      USING ERRCODE='42501';
  END IF;

  IF p_turno_sesion_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Jornada y clave de idempotencia son obligatorias.'
      USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array'
     OR jsonb_array_length(p_lineas)=0 OR jsonb_array_length(p_lineas)>500 THEN
    RAISE EXCEPTION 'Envía la lista completa del inventario final (1–500 productos).'
      USING ERRCODE='22023';
  END IF;
  IF v_note IS NULL OR length(v_note)<5 THEN
    RAISE EXCEPTION 'Explica el origen y la fecha efectiva del conteo (mínimo 5 caracteres).'
      USING ERRCODE='22023';
  END IF;
  IF v_source IS NULL OR coalesce(p_fuente_sha256,'') !~* '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Adjunta un CSV documental y su huella SHA-256 válida.'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    WHERE jsonb_typeof(x.value)<>'object'
       OR coalesce(x.value->>'producto_id','') !~* '^[0-9a-f-]{36}$'
       OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
  ) THEN
    RAISE EXCEPTION 'Cada línea necesita producto_id y una cantidad no negativa con hasta 3 decimales.'
      USING ERRCODE='22023';
  END IF;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_received,v_distinct
  FROM jsonb_array_elements(p_lineas) x(value);
  IF v_received<>v_distinct THEN
    RAISE EXCEPTION 'El CSV repite uno o más productos. Corrige los duplicados antes de enviar.'
      USING ERRCODE='22023';
  END IF;

  -- The source hash, full line payload and idempotency key are retained in
  -- the event ledger. An exact retry is safe, even after a later Turn close.
  v_payload_md5:=md5(p_lineas::text||'|'||v_note||'|'||v_source||'|'||lower(p_fuente_sha256));
  SELECT e.payload INTO v_existing
  FROM public.turno_eventos e
  WHERE e.turno_sesion_id=p_turno_sesion_id
    AND e.tipo='INVENTARIO_FINAL_ADMIN_POST_SELLO'
    AND e.payload->>'idempotency_key'=p_idempotency_key::text
  ORDER BY e.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    IF v_existing->>'payload_md5' IS DISTINCT FROM v_payload_md5 THEN
      RAISE EXCEPTION 'La clave ya se utilizó con otro archivo o conjunto de cantidades.'
        USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'idempotente',true,
      'corte_id',v_existing->>'final_cut_id',
      'productos',v_existing->>'product_count',
      'fecha_efectiva',v_existing->>'corte_operativo_at'
    );
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la Jornada solicitada.'
      USING ERRCODE='23503';
  END IF;
  IF v_s.estado<>'CERRADA_OPERATIVAMENTE' OR v_s.corte_operativo_at IS NULL THEN
    RAISE EXCEPTION 'El registro tardío solo aplica a una Jornada sellada con corte operativo inmutable.'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_turn
  FROM public.turnos
  WHERE id=v_s.turno_id
  FOR UPDATE;
  IF NOT FOUND OR v_turn.estado<>'ABIERTO'
     OR coalesce(v_turn.estado_maestro,v_turn.estado)<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El Turno maestro debe seguir abierto para recibir este inventario histórico.'
      USING ERRCODE='23514';
  END IF;

  SELECT c.id INTO v_initial_cut
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
  ORDER BY c.confirmado_en DESC NULLS LAST,c.creado_en DESC
  LIMIT 1;
  IF v_initial_cut IS NULL THEN
    RAISE EXCEPTION 'No existe inventario inicial confirmado para definir el conjunto histórico de productos.'
      USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_expected
  FROM public.bc7_jornada_productos_corte(v_s.id,'FINAL');
  IF v_expected=0 OR v_received<>v_expected THEN
    RAISE EXCEPTION 'El archivo debe contener exactamente los % productos del período; recibió %.',
      v_expected,v_received USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.bc7_jornada_productos_corte(v_s.id,'FINAL') expected
      WHERE expected.producto_id=(x.value->>'producto_id')::uuid
    )
  ) OR EXISTS (
    SELECT 1 FROM public.bc7_jornada_productos_corte(v_s.id,'FINAL') expected
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
      WHERE (x.value->>'producto_id')::uuid=expected.producto_id
    )
  ) THEN
    RAISE EXCEPTION 'El conjunto de productos no coincide exactamente con el inventario FINAL del período.'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
  ) THEN
    RAISE EXCEPTION 'Esta Jornada ya tiene inventario final. Consulta el corte existente; no se sobrescribe.'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes(
    turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion
  ) VALUES(
    v_s.id,'FINAL','CONFIRMADO',auth.uid(),auth.uid(),
    'Registro ADMIN posterior al sello · efectivo al corte '||
      to_char(v_s.corte_operativo_at AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI')||
      ' America/Havana · fuente '||v_source||' · '||v_note
  ) RETURNING id INTO v_cut_id;

  -- Compare the historic physical count with the sealed operational ledger,
  -- grouped by retail family. Later warehouse-wide transfers stay outside the
  -- ledger; same-session late approvals remain attributable to this Jornada.
  WITH balances AS (
    SELECT coalesce(p.producto_padre_id,p.id) AS producto_id,
           sum(b.cantidad_actual)::numeric AS cantidad_actual
    FROM public.bc7_jornada_saldos_operativos(v_s.id) b
    JOIN public.productos p ON p.id=b.producto_id
    GROUP BY coalesce(p.producto_padre_id,p.id)
  )
  INSERT INTO public.turno_jornada_inventario_lineas(
    corte_id,producto_id,cantidad_contada,stock_sistema
  )
  SELECT v_cut_id,expected.producto_id,
         (x.value->>'cantidad')::numeric,
         coalesce(balance.cantidad_actual,0)
  FROM public.bc7_jornada_productos_corte(v_s.id,'FINAL') expected
  JOIN jsonb_array_elements(p_lineas) x(value)
    ON (x.value->>'producto_id')::uuid=expected.producto_id
  LEFT JOIN balances balance ON balance.producto_id=expected.producto_id;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,actor_user_id,tipo,payload
  ) VALUES(
    v_s.turno_id,v_s.id,auth.uid(),'INVENTARIO_FINAL_ADMIN_POST_SELLO',
    jsonb_build_object(
      'final_cut_id',v_cut_id,
      'idempotency_key',p_idempotency_key,
      'payload_md5',v_payload_md5,
      'source_document',v_source,
      'source_sha256',lower(p_fuente_sha256),
      'product_count',v_expected,
      'corte_operativo_at',v_s.corte_operativo_at,
      'fecha_efectiva',to_char(v_s.corte_operativo_at AT TIME ZONE 'America/Havana','YYYY-MM-DD HH24:MI'),
      'stock_global_modificado',false,
      'corte_inicial_modificado',false,
      'observacion',v_note
    )
  );

  RETURN jsonb_build_object(
    'ok',true,'idempotente',false,'corte_id',v_cut_id,
    'productos',v_expected,'corte_operativo_at',v_s.corte_operativo_at,
    'stock_global_modificado',false
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.bc7_admin_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_admin_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,text,text,uuid) TO authenticated,service_role;

-- Integral review is available only when every retail Jornada session has all five steps.
CREATE OR REPLACE FUNCTION public.listar_aprobaciones_admin()
 RETURNS TABLE(tipo text, id uuid, fecha timestamp with time zone, usuario_nombre text, almacen_nombre text, producto_nombre text, resumen text, monto numeric, cantidad numeric, estado text, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.tiene_permiso('auditoria','editar_any')
    OR public.tiene_permiso('gastos','editar_any')
    OR public.tiene_permiso('mermas','editar_any')
    OR public.tiene_permiso('bajas','editar_any')
    OR public.tiene_permiso('reinversiones','editar_any')
    OR public.tiene_permiso('entregas_caja','editar_any')
  ) THEN
    RAISE EXCEPTION 'Sin permiso para ver aprobaciones administrativas' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT 'gasto'::text,g.id,g.creado_en,g.creado_nombre,a.nombre,NULL::text,
           g.concepto,g.monto,NULL::numeric,g.estado,g.descripcion
    FROM public.gastos g
    LEFT JOIN public.almacenes a ON a.id=g.almacen_id
    WHERE g.estado='PENDIENTE'
      AND (public.tiene_permiso('gastos','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT 'merma'::text,m.id,m.creado_en,m.creado_nombre,a.nombre,p.nombre,
           'Merma de inventario'::text,NULL::numeric,m.cantidad,m.estado,m.motivo
    FROM public.mermas m
    JOIN public.almacenes a ON a.id=m.almacen_id
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.estado='PENDIENTE'
      AND (public.tiene_permiso('mermas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'baja_lista'::text,
      s.id,
      s.creado_en,
      s.creado_nombre,
      a.nombre,
      ('Lista de bajas · '||count(b.id)||' productos')::text,
      'Solicitud agrupada de inventario'::text,
      NULL::numeric,
      sum(b.cantidad),
      'PENDIENTE'::text,
      s.motivo_general
    FROM public.bajas_solicitudes s
    JOIN public.almacenes a ON a.id=s.almacen_id
    JOIN public.bajas b ON b.solicitud_id=s.id AND b.estado='PENDIENTE'
    WHERE s.estado='PENDIENTE'
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))
    GROUP BY s.id,s.creado_en,s.creado_nombre,a.nombre,s.motivo_general

    UNION ALL

    SELECT 'baja'::text,b.id,b.creado_en,b.creado_nombre,a.nombre,p.nombre,
           'Baja individual'::text,NULL::numeric,b.cantidad,b.estado,b.motivo
    FROM public.bajas b
    JOIN public.almacenes a ON a.id=b.almacen_id
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.estado='PENDIENTE'
      AND b.solicitud_id IS NULL
      AND (public.tiene_permiso('bajas','editar_any') OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'reinversion'::text,r.id,r.fecha,r.usuario_nombre,a.nombre,
      (SELECT string_agg(p.nombre, ', ' ORDER BY p.nombre)
       FROM public.reinversiones_lineas rl JOIN public.productos p ON p.id=rl.producto_id
       WHERE rl.reinversion_id=r.id),
      coalesce((
        SELECT string_agg(
          trim(trailing '.' from trim(trailing '0' from rl.cantidad_base::text))
          ||' '||p.nombre||' × '||
          trim(trailing '.' from trim(trailing '0' from rl.costo_unitario::text))||' CUP',
          ' · ' ORDER BY p.nombre,rl.id
        )
        FROM public.reinversiones_lineas rl
        JOIN public.productos p ON p.id=rl.producto_id
        WHERE rl.reinversion_id=r.id
      ),'Reinversión')::text,
      r.total,
      (SELECT sum(rl.cantidad_base) FROM public.reinversiones_lineas rl WHERE rl.reinversion_id=r.id),
      r.estado,
      coalesce(r.proveedor,'')
    FROM public.reinversiones r
    JOIN public.almacenes a ON a.id=r.almacen_id
    WHERE r.estado='PENDIENTE'
      AND r.turno_sesion_id IS NOT NULL
      AND public.tiene_permiso('reinversiones','editar_any')

    UNION ALL

    SELECT 'entrega_diaria'::text,e.id,e.creado_en,e.creado_nombre,a.nombre,
           NULL::text,('Entrega diaria de efectivo · '||e.fecha::text)::text,
           e.monto_declarado,NULL::numeric,e.estado,e.observacion
    FROM public.turno_jornada_entregas_diarias e
    JOIN public.almacenes a ON a.id=e.almacen_id
    WHERE e.estado='PENDIENTE'
      AND public.tiene_permiso('entregas_caja','editar_any')

    UNION ALL

    SELECT
      'declaracion_jornada'::text,
      d.id,
      d.declarado_at,
      COALESCE(u.nombre,'')::text,
      a.nombre,
      NULL::text,
      ('Declaración final de efectivo · Día '||COALESCE(t.dias_turno,s.numero_dia)::text)::text,
      d.monto,
      NULL::numeric,
      d.estado_aprobacion,
      s.estado::text
    FROM public.turno_declaraciones d
    JOIN public.turno_sesiones s ON s.id=d.turno_sesion_id
    JOIN public.turnos t ON t.id=s.turno_id
    JOIN public.almacenes a ON a.id=s.almacen_id
    LEFT JOIN public.usuarios u ON u.id=d.usuario_id
    LEFT JOIN public.turno_jornada_confirmaciones c ON c.turno_sesion_id=s.id
    WHERE s.bloque='JORNADA'
      AND s.estado='COMPLETADA'
      AND coalesce(a.tipo,'')<>'minorista'
      AND d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')
      AND d.monto_contado IS NULL
      AND (public.tiene_permiso('entregas_caja','editar_any')
        OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'recepcion_inventario_jornada'::text,
      e.id,
      coalesce(r.recibido_en,e.actualizado_en,e.creado_en),
      coalesce(ud.nombre,u.nombre,'Responsable')::text,
      a.nombre,
      ('Destino '||sd.fecha::text||' · origen '||so.fecha::text||' · '||coalesce(diff.cnt,0)::text||' diferencia(s)')::text,
      ('Recepción inventario compartido · '||coalesce(lineas.total,0)::text||' productos')::text,
      NULL::numeric,
      coalesce(lineas.total,0)::numeric,
      e.estado,
      coalesce(r.observacion,'')
    FROM public.turno_jornada_inventario_entregas e
    JOIN public.almacenes a ON a.id=e.almacen_id
    JOIN public.turno_sesiones so ON so.id=e.origen_sesion_id
    LEFT JOIN public.turno_sesiones sd ON sd.id=e.destino_sesion_id
    LEFT JOIN public.turno_jornada_programacion pd ON pd.id=sd.jornada_programacion_id
    LEFT JOIN public.usuarios ud ON ud.id=pd.responsable_id
    LEFT JOIN LATERAL (
      SELECT rec.id,rec.recibido_en,rec.recibido_por,rec.observacion
      FROM public.turno_jornada_inventario_recepciones rec
      WHERE rec.entrega_id=e.id
      ORDER BY rec.intento DESC LIMIT 1
    ) r ON true
    LEFT JOIN public.usuarios u ON u.id=r.recibido_por
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total
      FROM public.turno_jornada_inventario_entrega_lineas dl
      WHERE dl.entrega_id=e.id
    ) lineas ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM public.turno_jornada_inventario_recepcion_lineas rl
      WHERE rl.recepcion_id=r.id AND rl.diferencia<>0
    ) diff ON true
    WHERE e.estado='PENDIENTE_REVISION'
      AND (public.bc_actor_is_admin() OR public.tiene_permiso('auditoria','editar_any'))

    UNION ALL

    SELECT
      'jornada_revision'::text,
      t.id,
      coalesce(max(t.actualizado_en),max(s.updated_at),t.creado_en),
      coalesce(max(u.nombre),'Responsable')::text,
      a.nombre,
      NULL::text,
      ('Revisión integral de jornada · '||count(*) FILTER(WHERE s.estado IN ('COMPLETADA','CERRADA_OPERATIVAMENTE'))::text||' día(s) completado(s)')::text,
      NULL::numeric,
      NULL::numeric,
      coalesce(t.estado_maestro,t.estado),
      ('Turno pendiente de revisión del Dueño · '||coalesce(t.estado_maestro,t.estado))::text
    FROM public.turnos t
    JOIN public.almacenes a ON a.id=t.almacen_id
    JOIN public.turno_sesiones s ON s.turno_id=t.id AND s.bloque='JORNADA'
    LEFT JOIN public.turno_asignaciones ta ON ta.turno_sesion_id=s.id AND ta.retirado_at IS NULL
    LEFT JOIN public.usuarios u ON u.id=ta.usuario_id
    LEFT JOIN public.turno_jornada_programacion jp ON jp.id=s.jornada_programacion_id
    LEFT JOIN public.turno_jornada_confirmaciones chk ON chk.turno_sesion_id=s.id
    WHERE t.dias_turno IS NOT NULL
      AND public.bc_actor_is_admin()
      AND coalesce(t.estado_maestro,t.estado) IN ('EN_CURSO','PENDIENTE_APROBACION')
      AND NOT EXISTS(SELECT 1 FROM public.turno_revisiones tr
        WHERE tr.turno_id=t.id AND tr.estado='APROBADO')
    GROUP BY t.id,a.nombre,t.creado_en,t.estado_maestro,t.estado
    HAVING count(*) FILTER(WHERE s.estado IN ('COMPLETADA','CERRADA_OPERATIVAMENTE'))>0
       AND count(*) FILTER(WHERE s.estado NOT IN ('COMPLETADA','CERRADA_OPERATIVAMENTE','CANCELADA'))=0
       AND count(*) FILTER(
         WHERE coalesce(a.tipo,'')='minorista'
           AND s.estado<>'CANCELADA'
           AND NOT (
             jp.id IS NOT NULL
             AND coalesce(chk.gastos_completado,false)
             AND coalesce(chk.reinversiones_completado,false)
             AND coalesce(chk.bajas_completado,false)
             AND EXISTS(
               SELECT 1 FROM public.turno_jornada_inventario_cortes final_cut
               WHERE final_cut.turno_sesion_id=s.id
                 AND final_cut.tipo='FINAL'
                 AND final_cut.estado='CONFIRMADO'
             )
             AND greatest(0,(coalesce(jp.fecha_fin,jp.fecha)-jp.fecha+1)::integer)>0
             AND (
               SELECT count(DISTINCT e.fecha)::integer
               FROM public.turno_jornada_entregas_diarias e
               WHERE e.turno_sesion_id=s.id
                 AND e.fecha BETWEEN jp.fecha AND coalesce(jp.fecha_fin,jp.fecha)
                 AND e.estado<>'RECHAZADA'
             )=greatest(0,(coalesce(jp.fecha_fin,jp.fecha)-jp.fecha+1)::integer)
           )
       )=0

    ORDER BY 3 DESC;
END;
$function$
;

-- The calendar can distinguish a sealed Jornada from a closed master Turno.
CREATE OR REPLACE FUNCTION public.bc5_mis_jornadas(p_fecha_inicio date, p_fecha_fin date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL
     OR p_fecha_fin < p_fecha_inicio OR p_fecha_fin - p_fecha_inicio > 30 THEN
    RAISE EXCEPTION 'El rango de consulta debe contener entre 1 y 31 días.'
      USING ERRCODE = '22023';
  END IF;
  v_is_admin := public.bc_actor_is_admin();
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.id,'turno_id',p.turno_id,'almacen_id',p.almacen_id,
      'numero_dia',p.numero_dia,'fecha',p.fecha,'fecha_fin',coalesce(p.fecha_fin,p.fecha),'trabaja',p.trabaja,
      -- Workers never receive another person's user ID through this read RPC.
      'responsable_id',CASE WHEN v_is_admin OR p.responsable_id=auth.uid()
                            THEN p.responsable_id ELSE NULL END,
      'hora_inicio_prevista',p.hora_inicio_prevista,
      'hora_fin_prevista',p.hora_fin_prevista,'zona_horaria',p.zona_horaria,
      'patron_id',p.patron_id,'estado',p.estado,'motivo_ajuste',p.motivo_ajuste,
      'sesion_id',s.id,'sesion_estado',s.estado,
      'turno_estado',t.estado,'turno_estado_maestro',t.estado_maestro,
      'es_responsable',p.responsable_id=auth.uid()
    ) ORDER BY p.fecha,p.numero_dia
  ),'[]'::jsonb)
  INTO v_result
  FROM public.turno_jornada_programacion p
  LEFT JOIN public.turno_sesiones s ON s.jornada_programacion_id=p.id
  LEFT JOIN public.turnos t ON t.id=p.turno_id
  WHERE p.fecha<=p_fecha_fin AND coalesce(p.fecha_fin,p.fecha)>=p_fecha_inicio
    AND (
      v_is_admin
      OR p.responsable_id=auth.uid()
      OR (
        p.patron_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.turno_jornada_patron_dias d
          WHERE d.patron_id=p.patron_id AND d.responsable_id=auth.uid()
        )
      )
    );
  RETURN v_result;
END;
$function$
;

COMMIT;
