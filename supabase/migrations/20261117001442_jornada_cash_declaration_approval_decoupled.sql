-- Jornada: five-step handover checklist and independent final cash declaration approval.
-- Generated against the production function signatures; no existing jornada records are rewritten.
BEGIN;

-- Preserve a distinct state for approval of the declared amount, before physical cash count.
ALTER TABLE public.turno_declaraciones
  DROP CONSTRAINT IF EXISTS turno_declaraciones_estado_aprobacion_check;
ALTER TABLE public.turno_declaraciones
  ADD CONSTRAINT turno_declaraciones_estado_aprobacion_check
  CHECK (estado_aprobacion = ANY (ARRAY[
    'PENDIENTE'::text,
    'ESPERANDO_APROBACION'::text,
    'DECLARACION_APROBADA'::text,
    'APROBADA'::text,
    'RECHAZADA'::text,
    'CON_DIFERENCIA'::text
  ]));

CREATE OR REPLACE FUNCTION public.bc7_estado_confirmaciones_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_gastos boolean:=false;
  v_reinversiones boolean:=false;
  v_bajas boolean:=false;
  v_final boolean:=false;
  v_lista_conteo boolean:=false;
  v_lista_calculo boolean:=false;
  v_cash_state text;
  v_cash_declared boolean:=false;
  v_liquidacion jsonb;
  v_phase text;
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
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar el checklist.' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(c.gastos_completado,false),
         coalesce(c.reinversiones_completado,false),
         coalesce(c.bajas_completado,false)
    INTO v_gastos,v_reinversiones,v_bajas
  FROM public.turno_jornada_confirmaciones c
  WHERE c.turno_sesion_id=p_turno_sesion_id;
  v_gastos:=coalesce(v_gastos,false);
  v_reinversiones:=coalesce(v_reinversiones,false);
  v_bajas:=coalesce(v_bajas,false);
  SELECT EXISTS(
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=p_turno_sesion_id
      AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
  ) INTO v_final;
  SELECT d.estado_aprobacion INTO v_cash_state
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=p_turno_sesion_id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST
  LIMIT 1;
  v_cash_declared:=v_cash_state IS NOT NULL AND v_cash_state<>'RECHAZADA';
  v_lista_conteo:=v_gastos AND v_reinversiones AND v_bajas AND v_final AND v_cash_declared;
  v_liquidacion:=public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id);
  v_lista_calculo:=v_lista_conteo
    AND v_cash_state='APROBADA'
    AND coalesce((v_liquidacion->>'calculable')::boolean,false);
  v_phase:=CASE
    WHEN NOT v_lista_conteo THEN 'OPERACION'
    WHEN v_s.estado<>'COMPLETADA' THEN 'LISTA_PARA_ENTREGA'
    WHEN v_cash_state IS DISTINCT FROM 'APROBADA' THEN 'PENDIENTE_CONTEO_DUENO'
    WHEN v_lista_calculo THEN 'CALCULAR'
    ELSE 'REVISION_APROBACIONES'
  END;

  RETURN jsonb_build_object(
    'gastos',jsonb_build_object('completado',v_gastos),
    'reinversiones',jsonb_build_object('completado',v_reinversiones),
    'bajas',jsonb_build_object('completado',v_bajas),
    'inventario_final',jsonb_build_object('completado',v_final),
    'declaracion_dinero',jsonb_build_object('completado',v_cash_declared,'estado',v_cash_state),
    'lista_para_conteo',v_lista_conteo,
    'lista_para_calcular',v_lista_calculo,
    'estado_efectivo_final',v_cash_state,
    'fase',v_phase
  );
END;
$function$;
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
      ('Revisión integral de jornada · '||count(*) FILTER(WHERE s.estado='COMPLETADA')::text||' día(s) completado(s)')::text,
      NULL::numeric,
      NULL::numeric,
      coalesce(t.estado_maestro,t.estado),
      ('Turno pendiente de revisión del Dueño · '||coalesce(t.estado_maestro,t.estado))::text
    FROM public.turnos t
    JOIN public.almacenes a ON a.id=t.almacen_id
    JOIN public.turno_sesiones s ON s.turno_id=t.id AND s.bloque='JORNADA'
    LEFT JOIN public.turno_asignaciones ta ON ta.turno_sesion_id=s.id AND ta.retirado_at IS NULL
    LEFT JOIN public.usuarios u ON u.id=ta.usuario_id
    WHERE t.dias_turno IS NOT NULL
      AND public.bc_actor_is_admin()
      AND coalesce(t.estado_maestro,t.estado) IN ('EN_CURSO','PENDIENTE_APROBACION')
      AND NOT EXISTS(SELECT 1 FROM public.turno_revisiones tr
        WHERE tr.turno_id=t.id AND tr.estado='APROBADO')
    GROUP BY t.id,a.nombre,t.creado_en,t.estado_maestro,t.estado
    HAVING count(*) FILTER(WHERE s.estado='COMPLETADA')>0
       AND count(*) FILTER(WHERE s.estado NOT IN ('COMPLETADA','CANCELADA'))=0

    ORDER BY 3 DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.bc5_contar_dinero_entregado(p_declaracion_id uuid, p_monto_contado numeric, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_d public.turno_declaraciones;
  v_s public.turno_sesiones;
  v_contado numeric(14,2);
  v_diferencia numeric(14,2);
  v_diferencia_id uuid;
  v_obs text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede contar el dinero entregado.' USING ERRCODE='42501';
  END IF;
  IF p_declaracion_id IS NULL OR p_monto_contado IS NULL OR p_monto_contado < 0 THEN
    RAISE EXCEPTION 'Introduce un importe contado válido, igual o mayor que cero.' USING ERRCODE='23514';
  END IF;

  v_contado := round(p_monto_contado,2);
  v_obs := nullif(left(btrim(coalesce(p_observacion,'')),1000),'');
  SELECT * INTO v_d
  FROM public.turno_declaraciones
  WHERE id=p_declaracion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la declaración de dinero.' USING ERRCODE='23503';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=v_d.turno_sesion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la jornada asociada a la declaración.' USING ERRCODE='23503';
  END IF;
  IF v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Sheila debe entregar la jornada antes de que el Dueño pueda contar el efectivo.' USING ERRCODE='23514';
  END IF;
  IF coalesce((public.bc7_estado_confirmaciones_jornada(v_s.id)->>'lista_para_conteo')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El conteo físico requiere que la responsable haya completado los cinco pasos antes de entregar la jornada.' USING ERRCODE='23514';
  END IF;

  -- A retry with the exact same physical count is safe. A different amount cannot overwrite evidence.
  IF v_d.monto_contado IS NOT NULL THEN
    IF round(v_d.monto_contado,2) IS DISTINCT FROM v_contado THEN
      RAISE EXCEPTION 'Esta entrega ya tiene un conteo confirmado. No se puede sobrescribir.' USING ERRCODE='23514';
    END IF;
    SELECT id INTO v_diferencia_id
    FROM public.turno_diferencias
    WHERE declaracion_dinero_id=v_d.id
    ORDER BY created_at DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'declaracion_id',v_d.id,
      'estado',v_d.estado_aprobacion,
      'monto_declarado',v_d.monto,
      'monto_contado',v_d.monto_contado,
      'diferencia',v_d.diferencia,
      'diferencia_id',v_diferencia_id,
      'contado_por',v_d.contado_por,
      'contado_at',v_d.contado_at,
      'idempotente',true
    );
  END IF;

  IF coalesce(v_d.estado_aprobacion,'')<>'DECLARACION_APROBADA' THEN
    RAISE EXCEPTION 'La declaración no está pendiente de conteo.' USING ERRCODE='23514';
  END IF;

  v_diferencia := round(v_contado-round(v_d.monto,2),2);

  UPDATE public.turno_declaraciones
  SET monto_contado=v_contado,
      contado_por=auth.uid(),
      contado_at=now(),
      observacion_conteo=v_obs,
      diferencia=v_diferencia,
      estado_aprobacion=CASE WHEN v_diferencia=0 THEN 'APROBADA' ELSE 'CON_DIFERENCIA' END,
      aprobado_por=CASE WHEN v_diferencia=0 THEN auth.uid() ELSE NULL END,
      aprobado_at=CASE WHEN v_diferencia=0 THEN now() ELSE NULL END
  WHERE id=v_d.id
  RETURNING * INTO v_d;

  IF v_diferencia<>0 THEN
    INSERT INTO public.turno_diferencias(
      turno_id,turno_sesion_id,categoria,referencia,esperado,declarado,diferencia,
      usuario_responsable,aprobado,comentario,declaracion_dinero_id
    )
    VALUES(
      v_d.turno_id,v_d.turno_sesion_id,'DINERO',
      'Entrega de dinero · declaración '||v_d.id::text,
      v_d.monto,v_contado,v_diferencia,
      v_d.usuario_id,false,v_obs,v_d.id
    )
    ON CONFLICT (declaracion_dinero_id) WHERE declaracion_dinero_id IS NOT NULL
    DO NOTHING;

    SELECT id INTO v_diferencia_id
    FROM public.turno_diferencias
    WHERE declaracion_dinero_id=v_d.id
    LIMIT 1;
  END IF;

  INSERT INTO public.turno_eventos(
    turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload
  )
  VALUES(
    v_d.turno_id,v_d.turno_sesion_id,v_d.turno_tramo_id,auth.uid(),
    'DINERO_CONTADO_POR_ADMIN',
    jsonb_build_object(
      'declaracion_id',v_d.id,'monto_declarado',v_d.monto,
      'monto_contado',v_contado,'diferencia',v_diferencia,
      'estado',v_d.estado_aprobacion,'diferencia_id',v_diferencia_id,
      'observacion',v_obs
    )
  );

  RETURN jsonb_build_object(
    'declaracion_id',v_d.id,
    'estado',v_d.estado_aprobacion,
    'monto_declarado',v_d.monto,
    'monto_contado',v_d.monto_contado,
    'diferencia',v_d.diferencia,
    'diferencia_id',v_diferencia_id,
    'contado_por',v_d.contado_por,
    'contado_at',v_d.contado_at,
    'idempotente',false
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.bc7_resolver_declaracion_jornada(
  p_declaracion_id uuid,
  p_decision text,
  p_comentario text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_d public.turno_declaraciones;
  v_s public.turno_sesiones;
  v_name text;
  v_next text;
  v_comment text:=nullif(left(btrim(coalesce(p_comentario,'')),1000),'');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.bc_actor_is_admin()
      OR public.tiene_permiso('entregas_caja','editar_any')
      OR public.tiene_permiso('auditoria','editar_any')) THEN
    RAISE EXCEPTION 'No tienes permiso para aprobar declaraciones finales de efectivo.' USING ERRCODE='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('APROBAR','RECHAZAR') THEN
    RAISE EXCEPTION 'Decisión inválida.' USING ERRCODE='23514';
  END IF;
  IF p_decision='RECHAZAR' AND v_comment IS NULL THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_d FROM public.turno_declaraciones
  WHERE id=p_declaracion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la declaración.' USING ERRCODE='23503'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=v_d.turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La declaración no pertenece a una jornada válida.' USING ERRCODE='23503';
  END IF;
  IF v_d.monto_contado IS NOT NULL THEN
    RAISE EXCEPTION 'Esta declaración ya tiene conteo físico; no se puede volver a aprobar.' USING ERRCODE='23514';
  END IF;
  IF coalesce(v_d.estado_aprobacion,'') NOT IN ('PENDIENTE','ESPERANDO_APROBACION') THEN
    RAISE EXCEPTION 'La declaración ya fue resuelta o no está pendiente.' USING ERRCODE='23514';
  END IF;
  SELECT nombre INTO v_name FROM public.usuarios WHERE id=auth.uid();
  v_next:=CASE WHEN p_decision='APROBAR' THEN 'DECLARACION_APROBADA' ELSE 'RECHAZADA' END;
  UPDATE public.turno_declaraciones
  SET estado_aprobacion=v_next,
      aprobado_por=CASE WHEN p_decision='APROBAR' THEN auth.uid() ELSE NULL END,
      aprobado_at=CASE WHEN p_decision='APROBAR' THEN now() ELSE NULL END
  WHERE id=v_d.id;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES(v_d.turno_id,v_d.turno_sesion_id,v_d.turno_tramo_id,auth.uid(),
    CASE WHEN p_decision='APROBAR' THEN 'DECLARACION_FINAL_APROBADA' ELSE 'DECLARACION_FINAL_RECHAZADA' END,
    jsonb_build_object(
      'declaracion_id',v_d.id,'monto_declarado',v_d.monto,
      'estado_anterior',v_d.estado_aprobacion,'estado_nuevo',v_next,
      'comentario',v_comment,'actor_nombre',v_name,
      'requiere_conteo_fisico_independiente',true
    ));
  RETURN jsonb_build_object('ok',true,'declaracion_id',v_d.id,'estado',v_next,
    'monto_declarado',v_d.monto,'conteo_fisico_pendiente',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_resolver_declaracion_jornada(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_resolver_declaracion_jornada(uuid,text,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.bc_declarar_dinero(p_turno_tramo_id uuid, p_monto numeric)
 RETURNS turno_declaraciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t public.turno_tramos; r public.turno_declaraciones; v_old_amount numeric;
begin
  if auth.uid() is null then raise exception 'Usuario no autenticado.' using errcode='42501'; end if;
  select * into t from public.turno_tramos where id=p_turno_tramo_id for update;
  if t.id is null or t.estado not in ('ACTIVO','INTERRUMPIDO','COMPLETADO') then raise exception 'Tramo inválido'; end if;
  if t.usuario_id<>auth.uid() then raise exception 'Solo el operador del tramo puede declarar'; end if;
  if p_monto is null or p_monto<0 then raise exception 'Monto inválido'; end if;
  SELECT * INTO r FROM public.turno_declaraciones WHERE turno_tramo_id=t.id FOR UPDATE;
  IF FOUND THEN
    IF r.estado_aprobacion IS DISTINCT FROM 'RECHAZADA' OR r.monto_contado IS NOT NULL THEN
      RAISE EXCEPTION 'Este tramo ya tiene una declaración de dinero que no puede sobrescribirse.';
    END IF;
    v_old_amount:=r.monto;
    UPDATE public.turno_declaraciones
    SET monto=p_monto,estado_aprobacion='PENDIENTE',aprobado_por=NULL,aprobado_at=NULL,
        monto_contado=NULL,contado_por=NULL,contado_at=NULL,diferencia=NULL,observacion_conteo=NULL
    WHERE id=r.id RETURNING * INTO r;
    INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
    VALUES(t.turno_id,t.turno_sesion_id,t.id,auth.uid(),'DINERO_REDECLARADO',
      jsonb_build_object('declaracion_id',r.id,'monto_anterior',v_old_amount,'monto_nuevo',p_monto,'estado_anterior','RECHAZADA'));
  ELSE
    INSERT INTO public.turno_declaraciones(turno_id,turno_sesion_id,turno_tramo_id,usuario_id,monto)
    VALUES(t.turno_id,t.turno_sesion_id,t.id,t.usuario_id,p_monto) RETURNING * INTO r;
    INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
    VALUES(t.turno_id,t.turno_sesion_id,t.id,auth.uid(),'DINERO_DECLARADO',jsonb_build_object('monto',p_monto));
  END IF;
  return r;
end;
$function$;
CREATE OR REPLACE FUNCTION public.bc7_transferencias_pendientes_vinculo_jornada(p_turno_sesion_id uuid)
RETURNS TABLE(
  transferencia_id uuid,
  fecha_registro timestamptz,
  almacen_origen text,
  almacen_destino text,
  producto text,
  cantidad numeric,
  lineas_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_period_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Solo la responsable asignada o ADMIN puede consultar transferencias pendientes de atribución.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  v_period_end:=((coalesce(v_p.fecha_fin,v_p.fecha)+1)::timestamp
    AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'));
  RETURN QUERY
  SELECT t.id,t.fecha,ao.nombre::text,ad.nombre::text,p.nombre::text,tl.cantidad,
    count(*) OVER(PARTITION BY t.id)::integer
  FROM public.transferencias t
  JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
  JOIN public.productos p ON p.id=tl.producto_id
  JOIN public.almacenes ao ON ao.id=t.almacen_origen_id
  JOIN public.almacenes ad ON ad.id=t.almacen_destino_id
  WHERE t.almacen_destino_id=v_s.almacen_id
    AND lower(t.estado)='completada'
    AND t.fecha>v_period_end
    AND t.fecha<=now()
    AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
      WHERE linked.transferencia_id=t.id)
  ORDER BY t.fecha,t.id,p.nombre;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_transferencias_pendientes_vinculo_jornada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_transferencias_pendientes_vinculo_jornada(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.bc7_jornada_saldos_operativos(p_turno_sesion_id uuid)
 RETURNS TABLE(producto_id uuid, inventario_inicial numeric, entradas numeric, salidas numeric, cantidad_actual numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session record;
  v_initial record;
  v_start_at timestamptz;
  v_end_at timestamptz := now();
BEGIN
  IF p_turno_sesion_id IS NULL THEN
    RAISE EXCEPTION 'turno_sesion_id requerido';
  END IF;

  SELECT
    s.id,
    s.estado,
    s.bloque,
    s.apertura_retroactiva,
    s.almacen_id,
    s.jornada_programacion_id,
    jp.fecha AS fecha_programada,
    jp.fecha_fin AS fecha_programada_fin,
    jp.zona_horaria,
    t.apertura_real,
    a.tipo AS almacen_tipo
  INTO v_session
  FROM public.turno_sesiones s
  JOIN public.turnos t ON t.id = s.turno_id
  JOIN public.turno_jornada_programacion jp ON jp.id = s.jornada_programacion_id
  JOIN public.almacenes a ON a.id = s.almacen_id
  WHERE s.id = p_turno_sesion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la jornada solicitada';
  END IF;

  IF v_session.estado <> 'EN_CURSO'
     OR v_session.bloque <> 'JORNADA'
     OR v_session.jornada_programacion_id IS NULL
     OR v_session.almacen_tipo <> 'minorista' THEN
    RAISE EXCEPTION 'El saldo operativo solo aplica a una jornada minorista activa';
  END IF;

  SELECT c.id, c.confirmado_en, c.creado_en
  INTO v_initial
  FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id = p_turno_sesion_id
    AND c.tipo = 'INICIAL'
    AND c.estado = 'CONFIRMADO'
  ORDER BY c.confirmado_en DESC NULLS LAST, c.creado_en DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La jornada activa no tiene un corte inicial confirmado; se bloquea el saldo global incompleto';
  END IF;

  v_start_at := COALESCE(v_session.apertura_real, v_initial.confirmado_en, v_initial.creado_en);

  IF v_start_at IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar la hora de apertura de la jornada';
  END IF;

  RETURN QUERY
  WITH initial_rows AS (
    SELECT
      l.producto_id,
      SUM(l.cantidad_contada)::numeric AS cantidad
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id = v_initial.id
    GROUP BY l.producto_id
  ),
  movement_rows AS (
    -- Transferencias entrantes. En una apertura retroactiva solo se aceptan
    -- las del día siguiente o las vinculadas expresamente al corte.
    SELECT tl.producto_id, 'ENTRADA'::text AS tipo, tl.cantidad::numeric AS cantidad
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id = t.id
    WHERE t.almacen_destino_id = v_session.almacen_id
      AND LOWER(t.estado) = 'completada'
      AND t.fecha > v_start_at
      AND t.fecha <= v_end_at
      AND (
        NOT COALESCE(v_session.apertura_retroactiva, false)
        OR (t.fecha AT TIME ZONE COALESCE(NULLIF(v_session.zona_horaria, ''), 'America/Havana'))::date BETWEEN v_session.fecha_programada AND COALESCE(v_session.fecha_programada_fin,v_session.fecha_programada)
        OR EXISTS (
          SELECT 1
          FROM public.turno_jornada_entradas_vinculadas x
          WHERE x.turno_sesion_id = p_turno_sesion_id
            AND x.transferencia_id = t.id
        )
      )

    UNION ALL

    -- Transferencias salientes.
    SELECT tl.producto_id, 'SALIDA'::text, tl.cantidad::numeric
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id = t.id
    WHERE t.almacen_origen_id = v_session.almacen_id
      AND LOWER(t.estado) = 'completada'
      AND t.fecha > v_start_at
      AND t.fecha <= v_end_at

    UNION ALL

    -- Compras recibidas en el almacén.
    SELECT lc.producto_id, 'ENTRADA'::text, lc.cantidad_inicial::numeric
    FROM public.lotes_compra lc
    WHERE lc.almacen_id = v_session.almacen_id
      AND LOWER(COALESCE(lc.origen, '')) = 'compra'
      AND lc.fecha_compra > v_start_at
      AND lc.fecha_compra <= v_end_at

    UNION ALL

    -- Reinversiones aprobadas durante esta jornada.
    SELECT rl.producto_id, 'ENTRADA'::text, rl.cantidad_base::numeric
    FROM public.reinversiones r
    JOIN public.reinversiones_lineas rl ON rl.reinversion_id = r.id
    WHERE r.almacen_id = v_session.almacen_id
      AND r.turno_sesion_id = p_turno_sesion_id
      AND r.estado = 'APROBADA'
      AND r.fecha_revision IS NOT NULL
      AND r.fecha_revision > v_start_at
      AND r.fecha_revision <= v_end_at

    UNION ALL

    -- Vales de salida confirmados.
    SELECT vs.producto_id, 'SALIDA'::text, vs.cantidad::numeric
    FROM public.vales_salida vs
    WHERE vs.almacen_id = v_session.almacen_id
      AND vs.fecha > v_start_at
      AND vs.fecha <= v_end_at
      AND UPPER(COALESCE(vs.estado, 'REGISTRADO')) NOT IN
          ('PENDIENTE', 'RECHAZADO', 'CANCELADO', 'ANULADO')

    UNION ALL

    -- Bajas y mermas aprobadas; las solicitudes pendientes no descuentan.
    SELECT m.producto_id, 'SALIDA'::text, m.cantidad::numeric
    FROM public.mermas m
    WHERE m.almacen_id = v_session.almacen_id
      AND m.estado = 'APROBADA'
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) > v_start_at
      AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) <= v_end_at

    UNION ALL

    SELECT b.producto_id, 'SALIDA'::text, b.cantidad::numeric
    FROM public.bajas b
    WHERE b.almacen_id = v_session.almacen_id
      AND b.estado = 'APROBADA'
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) > v_start_at
      AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) <= v_end_at

    UNION ALL

    -- Ventas completadas, si el almacén utiliza POS.
    SELECT vl.producto_id, 'SALIDA'::text, vl.cantidad::numeric
    FROM public.ventas v
    JOIN public.ventas_lineas vl ON vl.venta_id = v.id
    WHERE v.almacen_id = v_session.almacen_id
      AND LOWER(COALESCE(v.estado, '')) IN ('completada', 'completado')
      AND v.fecha > v_start_at
      AND v.fecha <= v_end_at
  ),
  movement_totals AS (
    SELECT
      m.producto_id,
      COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'ENTRADA'), 0)::numeric AS entradas,
      COALESCE(SUM(m.cantidad) FILTER (WHERE m.tipo = 'SALIDA'), 0)::numeric AS salidas
    FROM movement_rows m
    GROUP BY m.producto_id
  ),
  product_ids AS (
    SELECT i.producto_id FROM initial_rows i
    UNION
    SELECT m.producto_id FROM movement_totals m
  )
  SELECT
    ids.producto_id,
    COALESCE(i.cantidad, 0)::numeric AS inventario_inicial,
    COALESCE(m.entradas, 0)::numeric AS entradas,
    COALESCE(m.salidas, 0)::numeric AS salidas,
    (
      COALESCE(i.cantidad, 0)
      + COALESCE(m.entradas, 0)
      - COALESCE(m.salidas, 0)
    )::numeric AS cantidad_actual
  FROM product_ids ids
  LEFT JOIN initial_rows i ON i.producto_id = ids.producto_id
  LEFT JOIN movement_totals m ON m.producto_id = ids.producto_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_turno public.turnos;
  v_initial public.turno_jornada_inventario_cortes;
  v_final public.turno_jornada_inventario_cortes;
  v_is_retail boolean:=false;
  v_retroactive boolean:=false;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_rate numeric;
  v_lines jsonb:='[]'::jsonb;
  v_total_units numeric:=0;
  v_sales_total numeric;
  v_priced_lines integer:=0;
  v_total_lines integer:=0;
  v_negative_lines integer:=0;
  v_missing_price_sold integer:=0;
  v_expenses numeric:=0;
  v_reinvestments numeric:=0;
  v_daily_cash numeric:=0;
  v_daily_pending integer:=0;
  v_daily_expected integer:=0;
  v_daily_approved integer:=0;
  v_daily_missing integer:=0;
  v_pending_expenses integer:=0;
  v_pending_reinvestments integer:=0;
  v_pending_adjustments integer:=0;
  v_pending_post integer:=0;
  v_final_declared numeric;
  v_final_counted numeric;
  v_final_cash_state text;
  v_salary numeric;
  v_expected_cash numeric;
  v_cash_received numeric;
  v_difference numeric;
  v_complete boolean:=false;
  v_negative_details jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde a una jornada registrada.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL)
  ) THEN RAISE EXCEPTION 'Solo el responsable asignado o ADMIN puede consultar esta liquidación.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  SELECT * INTO v_turno FROM public.turnos WHERE id=v_s.turno_id;
  v_retroactive:=coalesce(v_s.apertura_retroactiva,false);
  SELECT (a.tipo='minorista') INTO v_is_retail FROM public.almacenes a WHERE a.id=v_s.almacen_id;
  IF NOT v_is_retail THEN
    RETURN jsonb_build_object('aplica',false,'motivo','La liquidación por diferencia de inventario está habilitada para almacenes minoristas.');
  END IF;
  SELECT * INTO v_initial FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='INICIAL' AND estado='CONFIRMADO';
  SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
  v_start_at:=coalesce(v_turno.apertura_real,v_initial.confirmado_en,v_initial.creado_en);
  v_end_at:=coalesce(v_final.confirmado_en,v_final.creado_en,now());
  v_rate:=v_p.salario_porcentaje;

  -- Approved Bajas/Mermas registered or approved after the immutable final cut
  -- require an explicit Owner decision before sales/salary can be calculated.
  SELECT count(*)::integer INTO v_pending_post
  FROM (
    SELECT b.id FROM public.bajas b
    WHERE b.turno_sesion_id=v_s.id AND b.estado='APROBADA'
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_end_at
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA' AND mr.movimiento_id=b.id)
    UNION ALL
    SELECT m.id FROM public.mermas m
    WHERE m.turno_sesion_id=v_s.id AND m.estado='APROBADA'
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_end_at
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA' AND mr.movimiento_id=m.id)
  ) unresolved;

  WITH initial_lines AS (
    SELECT l.producto_id AS product_id,l.cantidad_contada::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
    WHERE l.corte_id=v_initial.id
  ),
  final_lines AS (
    SELECT l.producto_id AS product_id,
      coalesce(c.cantidad_corregida,l.cantidad_contada)::numeric AS qty,
      l.cantidad_contada::numeric AS original_qty,
      c.cantidad_corregida AS corrected_qty
    FROM public.turno_jornada_inventario_lineas l
    LEFT JOIN public.turno_jornada_inventario_correcciones c
      ON c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
      AND c.producto_id=l.producto_id AND c.vigente
    WHERE l.corte_id=v_final.id
  ),
  movement_events AS (
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END product_id,
           'TRANSFERENCIA_ENTRADA'::text kind,tl.cantidad::numeric qty
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    WHERE t.almacen_destino_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at AND t.fecha<=v_end_at
      AND (NOT v_retroactive
        OR (t.fecha AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date BETWEEN v_p.fecha AND coalesce(v_p.fecha_fin,v_p.fecha)
        OR EXISTS(SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
          WHERE linked.turno_sesion_id=v_s.id AND linked.transferencia_id=t.id))
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'TRANSFERENCIA_SALIDA',tl.cantidad::numeric
    FROM public.transferencias t
    JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
    JOIN public.productos p ON p.id=tl.producto_id
    WHERE t.almacen_origen_id=v_s.almacen_id AND lower(t.estado)='completada'
      AND t.fecha>v_start_at AND t.fecha<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'COMPRA',lc.cantidad_inicial::numeric
    FROM public.lotes_compra lc
    JOIN public.productos p ON p.id=lc.producto_id
    WHERE lc.almacen_id=v_s.almacen_id AND lower(lc.origen)='compra'
      AND lc.fecha_compra>v_start_at AND lc.fecha_compra<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'REINVERSION',rl.cantidad_base::numeric
    FROM public.reinversiones r
    JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
    JOIN public.productos p ON p.id=rl.producto_id
    WHERE r.almacen_id=v_s.almacen_id AND r.turno_sesion_id=v_s.id
      AND r.estado='APROBADA' AND r.fecha_revision IS NOT NULL
      AND r.creado_en>v_start_at AND r.creado_en<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'VALE',vs.cantidad::numeric
    FROM public.vales_salida vs
    JOIN public.productos p ON p.id=vs.producto_id
    WHERE vs.almacen_id=v_s.almacen_id
      AND upper(coalesce(vs.estado,'REGISTRADO')) NOT IN ('PENDIENTE','RECHAZADO','CANCELADO','ANULADO')
      AND vs.fecha>v_start_at AND vs.fecha<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'MERMA',m.cantidad::numeric
    FROM public.mermas m
    JOIN public.productos p ON p.id=m.producto_id
    WHERE m.almacen_id=v_s.almacen_id AND m.estado='APROBADA'
      AND (
        (coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
          AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)<=v_end_at
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
              AND mr.movimiento_id=m.id AND mr.clasificacion='DESPUES_CORTE'))
        OR EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA'
            AND mr.movimiento_id=m.id AND mr.clasificacion='ANTES_CORTE')
      )
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'BAJA',b.cantidad::numeric
    FROM public.bajas b
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
      AND (
        (coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
          AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)<=v_end_at
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
              AND mr.movimiento_id=b.id AND mr.clasificacion='DESPUES_CORTE'))
        OR EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
          WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA'
            AND mr.movimiento_id=b.id AND mr.clasificacion='ANTES_CORTE')
      )
  ),
  movement_totals AS (
    SELECT product_id,
      coalesce(sum(qty) FILTER(WHERE kind='TRANSFERENCIA_ENTRADA'),0) transfer_in,
      coalesce(sum(qty) FILTER(WHERE kind='COMPRA'),0) purchases_in,
      coalesce(sum(qty) FILTER(WHERE kind='REINVERSION'),0) reinvestment_in,
      coalesce(sum(qty) FILTER(WHERE kind='TRANSFERENCIA_SALIDA'),0) transfer_out,
      coalesce(sum(qty) FILTER(WHERE kind='VALE'),0) vales_out,
      coalesce(sum(qty) FILTER(WHERE kind='MERMA'),0) merma_out,
      coalesce(sum(qty) FILTER(WHERE kind='BAJA'),0) bajas_out
    FROM movement_events GROUP BY product_id
  ),
  price_info AS (
    SELECT p.id product_id,p.nombre,p.unidad,
      CASE
        WHEN coalesce(p.precio_normal,0)>0 THEN p.precio_normal
        WHEN count(ch.id)>0
          AND count(ch.precio_normal)=count(ch.id)
          AND min(ch.precio_normal)=max(ch.precio_normal)
          AND min(ch.precio_normal)>0 THEN min(ch.precio_normal)
        ELSE NULL
      END precio_unitario,
      CASE
        WHEN coalesce(p.precio_normal,0)>0 THEN 'PRECIO_FAMILIA'
        WHEN count(ch.id)>0
          AND count(ch.precio_normal)=count(ch.id)
          AND min(ch.precio_normal)=max(ch.precio_normal)
          AND min(ch.precio_normal)>0 THEN 'PRECIO_VARIANTES_UNIFORME'
        WHEN count(ch.id)>0 THEN 'PRECIO_VARIANTES_DIFERENTE_O_INCOMPLETO'
        ELSE 'SIN_PRECIO'
      END estado_precio
    FROM public.productos p
    LEFT JOIN public.productos ch ON ch.producto_padre_id=p.id AND ch.activo=true
    WHERE p.activo=true AND p.producto_padre_id IS NULL
    GROUP BY p.id,p.nombre,p.unidad,p.precio_normal
  ),
  all_product_ids AS (
    SELECT product_id FROM initial_lines
    UNION SELECT product_id FROM final_lines
    UNION SELECT product_id FROM movement_totals
  ),
  calculated AS (
    SELECT ids.product_id,coalesce(pi.nombre,p.nombre) nombre,coalesce(pi.unidad,p.unidad) unidad,
      coalesce(i.qty,0) initial_qty,coalesce(f.qty,0) final_qty,
      f.original_qty final_qty_original,f.corrected_qty final_qty_corrected,
      coalesce(mt.transfer_in,0) transfer_in,coalesce(mt.purchases_in,0) purchases_in,
      coalesce(mt.reinvestment_in,0) reinvestment_in,coalesce(mt.transfer_out,0) transfer_out,
      coalesce(mt.vales_out,0) vales_out,coalesce(mt.merma_out,0) merma_out,coalesce(mt.bajas_out,0) bajas_out,
      (coalesce(i.qty,0)+coalesce(mt.transfer_in,0)+coalesce(mt.purchases_in,0)+coalesce(mt.reinvestment_in,0)
        -coalesce(mt.transfer_out,0)-coalesce(mt.vales_out,0)-coalesce(mt.merma_out,0)-coalesce(mt.bajas_out,0)-coalesce(f.qty,0)) sold_qty,
      pi.precio_unitario,pi.estado_precio
    FROM all_product_ids ids
    JOIN public.productos p ON p.id=ids.product_id
    LEFT JOIN price_info pi ON pi.product_id=ids.product_id
    LEFT JOIN initial_lines i ON i.product_id=ids.product_id
    LEFT JOIN final_lines f ON f.product_id=ids.product_id
    LEFT JOIN movement_totals mt ON mt.product_id=ids.product_id
  )
  SELECT count(*),
         count(*) FILTER(WHERE (precio_unitario IS NOT NULL AND sold_qty>=0) OR sold_qty=0),
         count(*) FILTER(WHERE sold_qty<0),
         count(*) FILTER(WHERE precio_unitario IS NULL AND sold_qty>0),
         coalesce(sum(sold_qty),0),
         CASE WHEN count(*) FILTER(WHERE (precio_unitario IS NULL AND sold_qty>0) OR sold_qty<0)>0 THEN NULL
              ELSE round(coalesce(sum(sold_qty*precio_unitario),0),2) END,
         coalesce(jsonb_agg(jsonb_build_object(
           'producto_id',product_id,'nombre',nombre,'unidad',unidad,
           'inventario_inicial',initial_qty,'transferencias_entrada',transfer_in,
           'compras',purchases_in,'reinversiones_entrada',reinvestment_in,
           'transferencias_salida',transfer_out,'vales_salida',vales_out,
           'mermas_aprobadas',merma_out,'bajas_aprobadas',bajas_out,
           'inventario_final',final_qty,'inventario_final_original',final_qty_original,
           'inventario_final_corregido',final_qty_corrected,'unidades_vendidas',sold_qty,
           'precio_unitario',precio_unitario,'estado_precio',estado_precio,
           'importe_estimado',CASE WHEN precio_unitario IS NOT NULL AND sold_qty>=0 THEN round(sold_qty*precio_unitario,2) ELSE NULL END
         ) ORDER BY nombre,product_id),'[]'::jsonb)
    INTO v_total_lines,v_priced_lines,v_negative_lines,v_missing_price_sold,v_total_units,v_sales_total,v_lines
  FROM calculated;

  -- Do not present provisional sales or salary as if the missing final stock were zero.
  IF v_initial.id IS NULL OR v_final.id IS NULL THEN
    v_total_lines:=0;
    v_priced_lines:=0;
    v_negative_lines:=0;
    v_missing_price_sold:=0;
    v_total_units:=NULL;
    v_sales_total:=NULL;
    v_lines:='[]'::jsonb;
  END IF;

  SELECT coalesce(sum(g.monto) FILTER(WHERE g.estado='APROBADO'),0),
         count(*) FILTER(WHERE g.estado='PENDIENTE')
    INTO v_expenses,v_pending_expenses
  FROM public.gastos g WHERE g.turno_sesion_id=v_s.id AND g.estado IN ('APROBADO','PENDIENTE');
  SELECT coalesce(sum(r.total) FILTER(WHERE r.estado='APROBADA'),0),
         count(*) FILTER(WHERE r.estado='PENDIENTE')
    INTO v_reinvestments,v_pending_reinvestments
  FROM public.reinversiones r WHERE r.turno_sesion_id=v_s.id AND r.estado IN ('APROBADA','PENDIENTE');
  SELECT count(*) INTO v_pending_adjustments
  FROM (
    SELECT 1 FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado='PENDIENTE'
    UNION ALL
    SELECT 1 FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado='PENDIENTE'
  ) pending;
  v_daily_expected:=greatest(0,(coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha)::integer);
  SELECT coalesce(sum(e.monto_aprobado) FILTER(WHERE e.estado='APROBADA'),0),
         count(*) FILTER(WHERE e.estado='PENDIENTE'),
         count(*) FILTER(WHERE e.estado='APROBADA')
    INTO v_daily_cash,v_daily_pending,v_daily_approved
  FROM public.turno_jornada_entregas_diarias e WHERE e.turno_sesion_id=v_s.id;
  v_daily_missing:=greatest(0,v_daily_expected-v_daily_approved);
  SELECT d.monto,d.monto_contado,d.estado_aprobacion
    INTO v_final_declared,v_final_counted,v_final_cash_state
  FROM public.turno_declaraciones d
  WHERE d.turno_sesion_id=v_s.id
  ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1;

  v_salary:=CASE WHEN v_rate IS NOT NULL AND v_sales_total IS NOT NULL
    THEN round(v_sales_total*v_rate/100,2) ELSE NULL END;
  v_cash_received:=CASE WHEN v_final_counted IS NOT NULL AND v_final_cash_state='APROBADA'
    THEN v_daily_cash+v_final_counted ELSE NULL END;
  v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments,2) ELSE NULL END;
  v_difference:=CASE WHEN v_cash_received IS NOT NULL AND v_expected_cash IS NOT NULL
    THEN round(v_cash_received-v_expected_cash,2) ELSE NULL END;
  -- Keep the physical inventory rows visible even while post-cutoff
  -- movements await Owner classification. Preserve a separate diagnostic
  -- for negative calculated sales, but never expose provisional sales/cash.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto_id',x.value->'producto_id',
    'nombre',x.value->'nombre',
    'unidades_vendidas',x.value->'unidades_vendidas',
    'inventario_inicial',x.value->'inventario_inicial',
    'transferencias_entrada',x.value->'transferencias_entrada',
    'compras',x.value->'compras',
    'reinversiones_entrada',x.value->'reinversiones_entrada',
    'transferencias_salida',x.value->'transferencias_salida',
    'vales_salida',x.value->'vales_salida',
    'mermas_aprobadas',x.value->'mermas_aprobadas',
    'bajas_aprobadas',x.value->'bajas_aprobadas',
    'inventario_final',x.value->'inventario_final',
    'inventario_final_original',x.value->'inventario_final_original',
    'inventario_final_corregido',x.value->'inventario_final_corregido'
  ) ORDER BY x.value->>'nombre'),'[]'::jsonb)
  INTO v_negative_details
  FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value)
  WHERE coalesce((x.value->>'unidades_vendidas')::numeric,0)<0;

  IF v_pending_post>0 THEN
    v_total_units:=NULL;
    v_sales_total:=NULL;
    v_salary:=NULL;
    v_expected_cash:=NULL;
    v_difference:=NULL;
    SELECT coalesce(jsonb_agg(
      x.value - ARRAY['unidades_vendidas','importe_estimado']
      ORDER BY x.value->>'nombre'
    ),'[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value);
  END IF;
  v_complete:=v_initial.id IS NOT NULL AND v_final.id IS NOT NULL
    AND v_total_lines>0 AND v_priced_lines=v_total_lines AND v_missing_price_sold=0 AND v_negative_lines=0
    AND v_rate IS NOT NULL AND v_daily_pending=0 AND v_daily_missing=0
    AND v_pending_expenses=0 AND v_pending_reinvestments=0 AND v_pending_adjustments=0
    AND v_pending_post=0
    AND v_cash_received IS NOT NULL;

  RETURN jsonb_build_object(
    'aplica',true,'calculable',v_complete,
    'formula','Inicial + entradas (transferencias/compras/reinversiones) - salidas aprobadas (transferencias/vales/mermas/bajas) - final = unidades vendidas; valoradas al precio normal.',
    'lineas',v_lines,'unidades_vendidas',v_total_units,
    'ventas_estimadas',v_sales_total,'salario_porcentaje',v_rate,'salario_calculado',v_salary,
    'gastos_aprobados',v_expenses,'reinversiones_aprobadas',v_reinvestments,
    'entregas_diarias_aprobadas',v_daily_cash,'entregas_diarias_pendientes',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing,
    'dinero_final_declarado',v_final_declared,'dinero_final_contado',v_final_counted,
    'estado_dinero_final',v_final_cash_state,'dinero_recogido_total',v_cash_received,
    'efectivo_esperado_despues_de_gastos_reinversiones',v_expected_cash,
    'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected_cash,
    'formula_efectivo','Ventas - gastos aprobados - reinversiones aprobadas. El salario se acumula y paga por separado; no se descuenta de esta caja.',
    'diferencia',v_difference,
    'faltan_cortes',NOT(v_initial.id IS NOT NULL AND v_final.id IS NOT NULL),
    'familias_sin_precio',v_missing_price_sold,
    'familias_con_vendidas_negativas',v_negative_lines,
    'familias_vendidas_negativas_detalle',v_negative_details,
    'movimientos_posteriores_pendientes',v_pending_post,
    'pendientes',jsonb_build_object(
      'gastos',v_pending_expenses,'reinversiones',v_pending_reinvestments,
      'ajustes',v_pending_adjustments,'movimientos_posteriores_corte',v_pending_post,
      'entregas_diarias',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing
    )
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.bc7_movimientos_sesion(p_turno_sesion_id uuid)
 RETURNS TABLE(fecha timestamp with time zone, tipo text, producto text, almacen text, cantidad numeric, costo_unitario numeric, usuario text, operacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.tiene_permiso('reportes', 'ver')
     AND NOT public.tiene_permiso('turnos', 'ver') THEN
    RAISE EXCEPTION 'No tienes permiso para consultar movimientos ni turnos.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id = p_turno_sesion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sesión del turno no existe.' USING ERRCODE = '23503';
  END IF;
  IF v_s.jornada_programacion_id IS NOT NULL THEN
    SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  END IF;

  IF NOT public.bc_actor_is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.turnos t
       WHERE t.id = v_s.turno_id
         AND t.usuario_id = v_uid
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.turno_asignaciones a
       WHERE a.turno_sesion_id = v_s.id
         AND a.usuario_id = v_uid
         AND a.retirado_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.turno_jornada_programacion p
       WHERE p.id = v_s.jornada_programacion_id
         AND p.responsable_id = v_uid
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.turno_tramos tr
       WHERE tr.turno_sesion_id = v_s.id
         AND tr.usuario_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Solo el responsable, participante asignado o administrador puede consultar este archivo.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lc.fecha_compra,
    'compra'::text,
    p.nombre::text,
    a.nombre::text,
    lc.cantidad_inicial,
    lc.costo_unitario,
    COALESCE(u.nombre, '')::text,
    lc.id
  FROM public.lotes_compra lc
  JOIN public.productos p ON p.id = lc.producto_id
  JOIN public.almacenes a ON a.id = lc.almacen_id
  LEFT JOIN public.usuarios u ON u.id = lc.usuario_id
  WHERE lc.origen = 'compra'
    AND lc.almacen_id = v_s.almacen_id
    AND (lc.fecha_compra AT TIME ZONE 'America/Havana')::date BETWEEN coalesce(v_p.fecha,v_s.fecha) AND coalesce(v_p.fecha_fin,v_p.fecha,v_s.fecha)
    AND EXISTS (
      SELECT 1
      FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = lc.usuario_id
        AND lc.fecha_compra >= tr.inicio_at
        AND (tr.fin_at IS NULL OR lc.fecha_compra < tr.fin_at)
    )

  UNION ALL

  SELECT
    v.fecha,
    'venta'::text,
    p.nombre::text,
    a.nombre::text,
    -vl.cantidad,
    vl.costo_unitario_fifo,
    COALESCE(u.nombre, '')::text,
    v.id
  FROM public.ventas_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
  JOIN public.productos p ON p.id = vl.producto_id
  JOIN public.almacenes a ON a.id = v.almacen_id
  LEFT JOIN public.usuarios u ON u.id = v.creado_por
  WHERE v.almacen_id = v_s.almacen_id
    AND (v.fecha AT TIME ZONE 'America/Havana')::date BETWEEN coalesce(v_p.fecha,v_s.fecha) AND coalesce(v_p.fecha_fin,v_p.fecha,v_s.fecha)
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = v.creado_por
        AND v.fecha >= tr.inicio_at
        AND (tr.fin_at IS NULL OR v.fecha < tr.fin_at)
    )

  UNION ALL

  SELECT
    t.fecha,
    'transferencia_salida'::text,
    p.nombre::text,
    origen.nombre::text,
    -tl.cantidad,
    NULL::numeric,
    COALESCE(u.nombre, '')::text,
    t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id = tl.transferencia_id
  JOIN public.productos p ON p.id = tl.producto_id
  JOIN public.almacenes origen ON origen.id = t.almacen_origen_id
  LEFT JOIN public.usuarios u ON u.id = t.creado_por
  WHERE t.almacen_origen_id = v_s.almacen_id
    AND (t.fecha AT TIME ZONE 'America/Havana')::date BETWEEN coalesce(v_p.fecha,v_s.fecha) AND coalesce(v_p.fecha_fin,v_p.fecha,v_s.fecha)
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = t.creado_por
        AND t.fecha >= tr.inicio_at
        AND (tr.fin_at IS NULL OR t.fecha < tr.fin_at)
    )

  UNION ALL

  SELECT
    t.fecha,
    'transferencia_entrada'::text,
    p.nombre::text,
    destino.nombre::text,
    tl.cantidad,
    NULL::numeric,
    COALESCE(u.nombre, '')::text,
    t.id
  FROM public.transferencias_lineas tl
  JOIN public.transferencias t ON t.id = tl.transferencia_id
  JOIN public.productos p ON p.id = tl.producto_id
  JOIN public.almacenes destino ON destino.id = t.almacen_destino_id
  LEFT JOIN public.usuarios u ON u.id = t.creado_por
  WHERE t.almacen_destino_id = v_s.almacen_id
    AND (
      -- A single explicit link can attribute a later-registered transfer to this
      -- multi-day Jornada. Otherwise the transfer must be inside the scheduled
      -- period and belong to a responsible worker's active tranche.
      EXISTS (
        SELECT 1 FROM public.turno_jornada_entradas_vinculadas linked
        WHERE linked.turno_sesion_id = v_s.id AND linked.transferencia_id = t.id
      )
      OR (t.fecha AT TIME ZONE 'America/Havana')::date BETWEEN coalesce(v_p.fecha,v_s.fecha) AND coalesce(v_p.fecha_fin,v_p.fecha,v_s.fecha)
    )

  UNION ALL

  SELECT
    vs.fecha,
    'vale'::text,
    p.nombre::text,
    a.nombre::text,
    -vs.cantidad,
    NULL::numeric,
    COALESCE(u.nombre, '')::text,
    vs.id
  FROM public.vales_salida vs
  JOIN public.productos p ON p.id = vs.producto_id
  JOIN public.almacenes a ON a.id = vs.almacen_id
  LEFT JOIN public.usuarios u ON u.id = vs.creado_por
  WHERE vs.almacen_id = v_s.almacen_id
    AND (vs.fecha AT TIME ZONE 'America/Havana')::date BETWEEN coalesce(v_p.fecha,v_s.fecha) AND coalesce(v_p.fecha_fin,v_p.fecha,v_s.fecha)
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = vs.creado_por
        AND vs.fecha >= tr.inicio_at
        AND (tr.fin_at IS NULL OR vs.fecha < tr.fin_at)
    )

  UNION ALL

  SELECT
    COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en),
    CASE m.estado WHEN 'APROBADA' THEN 'merma'
      WHEN 'PENDIENTE' THEN 'merma_pendiente' ELSE 'merma_rechazada' END::text,
    p.nombre::text,
    a.nombre::text,
    CASE WHEN m.estado='APROBADA' THEN -m.cantidad ELSE m.cantidad END,
    NULL::numeric,
    COALESCE(m.revisado_nombre, m.creado_nombre, '')::text,
    m.id
  FROM public.mermas m
  JOIN public.productos p ON p.id = m.producto_id
  JOIN public.almacenes a ON a.id = m.almacen_id
  WHERE m.estado IN ('PENDIENTE','APROBADA','RECHAZADA')
    AND m.almacen_id = v_s.almacen_id
    AND (
      -- Explicit source-session + tranche links are authoritative for pending,
      -- approved and rejected requests. Unlinked legacy records are only inferred
      -- when ADMIN approval falls inside an exact worker tranche.
      (m.turno_sesion_id = v_s.id AND EXISTS (
        SELECT 1 FROM public.turno_tramos tr
        WHERE tr.id=m.turno_tramo_id
          AND tr.turno_sesion_id=v_s.id
          AND tr.usuario_id=m.creado_por
      ))
      OR (
        m.estado='APROBADA'
        AND (COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) AT TIME ZONE 'America/Havana')::date BETWEEN coalesce(v_p.fecha,v_s.fecha) AND coalesce(v_p.fecha_fin,v_p.fecha,v_s.fecha)
        AND EXISTS (
          SELECT 1 FROM public.turno_tramos tr
          WHERE tr.turno_sesion_id = v_s.id
            AND tr.usuario_id = COALESCE(m.revisado_por, m.creado_por)
            AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) >= tr.inicio_at
            AND (tr.fin_at IS NULL OR COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) < tr.fin_at)
        )
      )
    )

  UNION ALL

  SELECT
    COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en),
    CASE b.estado WHEN 'APROBADA' THEN 'baja'
      WHEN 'PENDIENTE' THEN 'baja_pendiente' ELSE 'baja_rechazada' END::text,
    p.nombre::text,
    a.nombre::text,
    CASE WHEN b.estado='APROBADA' THEN -b.cantidad ELSE b.cantidad END,
    NULL::numeric,
    COALESCE(b.revisado_nombre, b.creado_nombre, '')::text,
    b.id
  FROM public.bajas b
  JOIN public.productos p ON p.id = b.producto_id
  JOIN public.almacenes a ON a.id = b.almacen_id
  WHERE b.estado IN ('PENDIENTE','APROBADA','RECHAZADA')
    AND b.almacen_id = v_s.almacen_id
    AND (
      (b.turno_sesion_id = v_s.id AND EXISTS (
        SELECT 1 FROM public.turno_tramos tr
        WHERE tr.id=b.turno_tramo_id
          AND tr.turno_sesion_id=v_s.id
          AND tr.usuario_id=b.creado_por
      ))
      OR (
        b.estado='APROBADA'
        AND (COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) AT TIME ZONE 'America/Havana')::date BETWEEN coalesce(v_p.fecha,v_s.fecha) AND coalesce(v_p.fecha_fin,v_p.fecha,v_s.fecha)
        AND EXISTS (
          SELECT 1 FROM public.turno_tramos tr
          WHERE tr.turno_sesion_id = v_s.id
            AND tr.usuario_id = COALESCE(b.revisado_por, b.creado_por)
            AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) >= tr.inicio_at
            AND (tr.fin_at IS NULL OR COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) < tr.fin_at)
        )
      )
    )

  UNION ALL

  -- Finance events are part of the exact Jornada ledger, not only the global date history.
  SELECT
    COALESCE(g.fecha_revision,g.creado_en),
    CASE g.estado WHEN 'APROBADO' THEN 'gasto'
      WHEN 'PENDIENTE' THEN 'gasto_pendiente' ELSE 'gasto_rechazado' END::text,
    g.concepto::text,
    a.nombre::text,
    NULL::numeric,
    g.monto,
    COALESCE(g.revisado_nombre,g.creado_nombre,'')::text,
    g.id
  FROM public.gastos g
  JOIN public.almacenes a ON a.id=g.almacen_id
  WHERE g.turno_sesion_id=v_s.id
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.id=g.turno_tramo_id
        AND tr.turno_sesion_id=v_s.id
        AND tr.usuario_id=g.creado_por
    )

  UNION ALL

  SELECT
    COALESCE(r.fecha_revision,r.fecha),
    CASE r.estado WHEN 'APROBADA' THEN 'reinversion'
      WHEN 'PENDIENTE' THEN 'reinversion_pendiente' ELSE 'reinversion_rechazada' END::text,
    p.nombre::text,
    a.nombre::text,
    rl.cantidad_base,
    rl.costo_total,
    COALESCE(r.revisado_nombre,r.usuario_nombre,'')::text,
    r.id
  FROM public.reinversiones r
  JOIN public.reinversiones_lineas rl ON rl.reinversion_id=r.id
  JOIN public.productos p ON p.id=rl.producto_id
  JOIN public.almacenes a ON a.id=r.almacen_id
  WHERE r.turno_sesion_id=v_s.id
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.id=r.turno_tramo_id
        AND tr.turno_sesion_id=v_s.id
        AND tr.usuario_id=r.usuario_id
    )

  UNION ALL

  SELECT
    COALESCE(e.fecha_revision,e.creado_en),
    CASE e.estado WHEN 'APROBADA' THEN 'entrega_diaria'
      WHEN 'PENDIENTE' THEN 'entrega_diaria_pendiente' ELSE 'entrega_diaria_rechazada' END::text,
    ('Efectivo recogido · '||e.fecha::text)::text,
    a.nombre::text,
    NULL::numeric,
    COALESCE(e.monto_aprobado,e.monto_declarado),
    COALESCE(e.revisado_nombre,e.creado_nombre,'')::text,
    e.id
  FROM public.turno_jornada_entregas_diarias e
  JOIN public.almacenes a ON a.id=e.almacen_id
  WHERE e.turno_sesion_id=v_s.id
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.id=e.turno_tramo_id
        AND tr.turno_sesion_id=v_s.id
        AND tr.usuario_id=e.creado_por
    )

  UNION ALL

  SELECT
    d.declarado_at,
    'dinero_declarado_final'::text,
    'Declaración final de efectivo'::text,
    a.nombre::text,
    NULL::numeric,
    d.monto,
    COALESCE(u.nombre,'')::text,
    d.id
  FROM public.turno_declaraciones d
  JOIN public.almacenes a ON a.id=v_s.almacen_id
  LEFT JOIN public.usuarios u ON u.id=d.usuario_id
  WHERE d.turno_sesion_id=v_s.id

  UNION ALL

  SELECT
    d.contado_at,
    'dinero_contado_final'::text,
    'Conteo físico del Dueño'::text,
    a.nombre::text,
    NULL::numeric,
    d.monto_contado,
    COALESCE(contador.nombre,'ADMIN')::text,
    d.id
  FROM public.turno_declaraciones d
  JOIN public.almacenes a ON a.id=v_s.almacen_id
  LEFT JOIN public.usuarios contador ON contador.id=d.contado_por
  WHERE d.turno_sesion_id=v_s.id
    AND d.monto_contado IS NOT NULL

  ORDER BY 1 DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.bc7_vincular_transferencia_jornada(
  p_turno_sesion_id uuid,
  p_transferencia_id uuid,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.transferencias;
  v_existing public.turno_jornada_entradas_vinculadas;
  v_link_id uuid;
  v_period_end timestamptz;
  v_line_count integer;
  v_reason text:=nullif(left(btrim(coalesce(p_motivo,'')),1000),'');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede atribuir una transferencia histórica a una Jornada.' USING ERRCODE='42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason)<10 THEN
    RAISE EXCEPTION 'Escribe un motivo de atribución de al menos 10 caracteres.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión destino no corresponde a una Jornada.' USING ERRCODE='23503';
  END IF;
  IF v_s.estado NOT IN ('PROGRAMADA','EN_CURSO','COMPLETADA') THEN
    RAISE EXCEPTION 'La sesión no admite atribuciones históricas en su estado actual.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.turnos t WHERE t.id=v_s.turno_id AND t.estado='ABIERTO') THEN
    RAISE EXCEPTION 'El Turno maestro debe seguir ABIERTO; no se altera un cierre ya aprobado.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  v_period_end:=((coalesce(v_p.fecha_fin,v_p.fecha)+1)::timestamp
    AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'));
  IF coalesce(v_p.fecha_fin,v_p.fecha)>=(now() AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date THEN
    RAISE EXCEPTION 'La atribución retroactiva solo aplica a períodos ya finalizados.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_t FROM public.transferencias WHERE id=p_transferencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe la transferencia indicada.' USING ERRCODE='23503'; END IF;
  IF lower(v_t.estado)<>'completada' OR v_t.almacen_destino_id<>v_s.almacen_id THEN
    RAISE EXCEPTION 'La transferencia debe estar completada y su destino debe ser el almacén de esta Jornada.' USING ERRCODE='23514';
  END IF;
  IF v_t.fecha<=v_period_end THEN
    RAISE EXCEPTION 'La transferencia está fechada dentro del período; no necesita atribución retroactiva.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_existing FROM public.turno_jornada_entradas_vinculadas
  WHERE transferencia_id=v_t.id;
  IF FOUND THEN
    IF v_existing.turno_sesion_id=v_s.id THEN
      RETURN jsonb_build_object('ok',true,'idempotente',true,'vinculo_id',v_existing.id,
        'turno_sesion_id',v_s.id,'transferencia_id',v_t.id);
    END IF;
    RAISE EXCEPTION 'Esta transferencia ya está vinculada a otra Jornada; no se puede duplicar.' USING ERRCODE='23505';
  END IF;
  SELECT count(*)::integer INTO v_line_count FROM public.transferencias_lineas WHERE transferencia_id=v_t.id;
  IF v_line_count=0 THEN RAISE EXCEPTION 'La transferencia no contiene líneas de producto.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.turno_jornada_entradas_vinculadas(turno_sesion_id,transferencia_id,vinculado_por)
  VALUES(v_s.id,v_t.id,auth.uid()) RETURNING id INTO v_link_id;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES(v_s.turno_id,v_s.id,NULL,auth.uid(),'TRANSFERENCIA_RETROACTIVA_VINCULADA',
    jsonb_build_object(
      'vinculo_id',v_link_id,'transferencia_id',v_t.id,
      'fecha_registro_real',v_t.fecha,'periodo_operativo_inicio',v_p.fecha,
      'periodo_operativo_fin',coalesce(v_p.fecha_fin,v_p.fecha),
      'lineas',v_line_count,'almacen_origen_id',v_t.almacen_origen_id,
      'almacen_destino_id',v_t.almacen_destino_id,'motivo',v_reason,
      'aplicacion_unica',true
    ));
  RETURN jsonb_build_object('ok',true,'idempotente',false,'vinculo_id',v_link_id,
    'turno_sesion_id',v_s.id,'transferencia_id',v_t.id,
    'fecha_registro_real',v_t.fecha,'periodo_operativo_inicio',v_p.fecha,
    'periodo_operativo_fin',coalesce(v_p.fecha_fin,v_p.fecha),'lineas',v_line_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_vincular_transferencia_jornada(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_vincular_transferencia_jornada(uuid,uuid,text) TO authenticated;

COMMIT;
