-- Jornada: five-step handover checklist and independent final cash declaration approval.
-- Generated against the production function signatures; no existing jornada records are rewritten.
BEGIN;

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
$function$


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
$function$


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
    RAISE EXCEPTION 'El conteo físico requiere que Sheila haya completado los cuatro checks antes de entregar la jornada.' USING ERRCODE='23514';
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

  IF coalesce(v_d.estado_aprobacion,'') NOT IN ('PENDIENTE','ESPERANDO_APROBACION','DECLARACION_APROBADA') THEN
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
$function$


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
  IF p_decision NOT IN ('APROBAR','RECHAZAR') THEN
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
    IF r.estado_aprobacion<>'RECHAZADA' OR r.monto_contado IS NOT NULL THEN
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
$function$


COMMIT;
