-- Allow a successor handover to resume a period whose start date has passed, even when its end date is today or later.

-- Preserve the physical handover, confirmed initial count, actual start time, overlap and responsible-availability gates.

BEGIN;

CREATE OR REPLACE FUNCTION public.bc7_admin_programar_sucesora_pendiente(
 p_entrega_id uuid,p_fecha_fin date,p_responsable_id uuid,p_observacion text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 v_uid uuid:=auth.uid();v_e public.turno_jornada_inventario_entregas;
 v_old_s public.turno_sesiones;v_old_t public.turnos;v_old_p public.turno_jornada_programacion;
 v_cfg public.turno_jornada_configuracion;v_t public.turnos;v_p public.turno_jornada_programacion;v_s public.turno_sesiones;
 v_timezone text:='America/Havana';v_start time:='07:00';v_end time:='23:00';
 v_days integer;v_expected integer;v_line_count integer;v_salary numeric;v_grouped boolean:=false;v_today date;
BEGIN
 IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
  RAISE EXCEPTION 'Solo ADMIN autenticado puede preparar una jornada sucesora atrasada.' USING ERRCODE='42501';
 END IF;
 IF p_entrega_id IS NULL OR p_fecha_fin IS NULL OR p_responsable_id IS NULL
   OR length(btrim(coalesce(p_observacion,'')))<5 OR length(p_observacion)>1000 THEN
  RAISE EXCEPTION 'Completa la fecha final, responsable y motivo (5–1000 caracteres).' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_e FROM public.turno_jornada_inventario_entregas WHERE id=p_entrega_id FOR UPDATE;
 IF NOT FOUND OR v_e.estado<>'PENDIENTE_PROGRAMACION' OR v_e.destino_sesion_id IS NOT NULL THEN
  RAISE EXCEPTION 'La entrega no está pendiente de programación.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_old_s FROM public.turno_sesiones WHERE id=v_e.origen_sesion_id FOR SHARE;
 SELECT * INTO v_old_t FROM public.turnos WHERE id=v_e.turno_id FOR SHARE;
 SELECT * INTO v_old_p FROM public.turno_jornada_programacion WHERE id=v_old_s.jornada_programacion_id;
 IF v_old_s.id IS NULL OR v_old_s.estado<>'COMPLETADA' OR v_old_t.estado_maestro<>'CERRADO'
   OR NOT EXISTS(SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_old_s.id AND c.tipo='FINAL' AND c.estado='CONFIRMADO' AND c.id=v_e.origen_corte_id) THEN
  RAISE EXCEPTION 'El origen debe ser un Turno cerrado con jornada completada e inventario final confirmado.' USING ERRCODE='23514';
 END IF;
 IF p_fecha_fin<v_e.fecha_destino OR p_fecha_fin-v_e.fecha_destino>30 THEN
  RAISE EXCEPTION 'El período sucesor debe abarcar entre 1 y 31 días desde %.',v_e.fecha_destino USING ERRCODE='22023';
 END IF;
 IF NOT public.bc5_jornada_responsable_elegible(p_responsable_id) THEN
  RAISE EXCEPTION 'La responsable debe estar activa y tener rol Dependienta o Dueño.' USING ERRCODE='42501';
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('bc7-period-warehouse:'||v_e.almacen_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('bc7-period-responsible:'||p_responsable_id::text,0));
 SELECT * INTO v_cfg FROM public.turno_jornada_configuracion WHERE almacen_id=v_e.almacen_id FOR SHARE;
 IF FOUND THEN
  v_timezone:=coalesce(nullif(v_cfg.zona_horaria,''),'America/Havana');
  v_start:=v_cfg.hora_inicio;v_end:=v_cfg.hora_fin;v_salary:=v_cfg.salario_porcentaje;
 END IF;
 v_salary:=coalesce(v_salary,v_old_p.salario_porcentaje);
 v_today:=(now() AT TIME ZONE v_timezone)::date;
 IF v_e.fecha_destino>=v_today THEN
  RAISE EXCEPTION 'La fecha inicial de la sucesora debe ser anterior a hoy; para fechas actuales o futuras usa la programación normal.' USING ERRCODE='23514';
 END IF;

 IF EXISTS(SELECT 1 FROM public.turnos t WHERE t.almacen_id=v_e.almacen_id AND t.dias_turno IS NOT NULL
   AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')) THEN
  RAISE EXCEPTION 'El almacén ya tiene otro turno abierto o programado.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.turno_jornada_programacion p
   WHERE p.almacen_id=v_e.almacen_id AND p.fecha<=p_fecha_fin
    AND coalesce(p.fecha_fin,p.fecha)>=v_e.fecha_destino AND p.estado IN ('PROGRAMADA','DESCANSO')) THEN
  RAISE EXCEPTION 'Ya existe una programación que se cruza con el período sucesor.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.turno_jornada_programacion p
   WHERE p.responsable_id=p_responsable_id AND p.trabaja=true AND p.estado='PROGRAMADA'
    AND p.fecha<=p_fecha_fin AND coalesce(p.fecha_fin,p.fecha)>=v_e.fecha_destino)
  OR EXISTS(SELECT 1 FROM public.turno_sesiones s
   JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id JOIN public.turnos t ON t.id=s.turno_id
   WHERE s.fecha BETWEEN v_e.fecha_destino AND p_fecha_fin AND s.estado NOT IN ('COMPLETADA','CANCELADA')
    AND a.usuario_id=p_responsable_id AND a.retirado_at IS NULL
    AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO'))
  OR EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.usuario_id=p_responsable_id AND tr.estado='ACTIVO') THEN
  RAISE EXCEPTION 'La responsable ya tiene otra jornada programada o tramo activo dentro del período.' USING ERRCODE='23505';
 END IF;

 SELECT (a.tipo='minorista') INTO v_grouped FROM public.almacenes a WHERE a.id=v_e.almacen_id AND a.activo=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'El almacén no existe o está inactivo.' USING ERRCODE='23503'; END IF;
 IF v_grouped THEN
  SELECT count(*) INTO v_expected FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL;
 ELSE
  SELECT count(*) INTO v_expected FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=v_e.almacen_id AND p.activo=true;
 END IF;
 SELECT count(*) INTO v_line_count FROM public.turno_jornada_inventario_entrega_lineas WHERE entrega_id=v_e.id;
 IF v_line_count=0 OR v_line_count<>v_expected THEN
  RAISE EXCEPTION 'La entrega heredada contiene % líneas, pero el catálogo actual requiere % productos/familias. No se abrirá una sucesora incompleta.',v_line_count,v_expected USING ERRCODE='23514';
 END IF;

 v_days:=(p_fecha_fin-v_e.fecha_destino)+1;
 INSERT INTO public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
 VALUES(v_uid,NULL,v_e.almacen_id,v_e.fecha_destino,'PROGRAMADO',v_uid,v_uid,'PROGRAMADO',v_days) RETURNING * INTO v_t;
 INSERT INTO public.turno_jornada_programacion(
  turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,hora_inicio_prevista,hora_fin_prevista,
  zona_horaria,patron_id,estado,motivo_ajuste,creado_por,actualizado_por,salario_porcentaje
 ) VALUES(v_t.id,v_e.almacen_id,1,v_e.fecha_destino,p_fecha_fin,true,p_responsable_id,v_start,v_end,
  v_timezone,NULL,'PROGRAMADA','Regularización retroactiva: '||btrim(p_observacion),v_uid,v_uid,v_salary)
 RETURNING * INTO v_p;
 INSERT INTO public.turno_sesiones(turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id,apertura_retroactiva)
 VALUES(v_t.id,v_e.almacen_id,1,'JORNADA',v_e.fecha_destino,'PROGRAMADA',v_p.id,false) RETURNING * INTO v_s;
 INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por,motivo)
 VALUES(v_s.id,v_t.id,p_responsable_id,v_uid,'Responsable de jornada sucesora retroactiva: '||btrim(p_observacion));
 UPDATE public.turno_jornada_inventario_entregas
 SET destino_sesion_id=v_s.id,estado='PENDIENTE_RECEPCION',actualizado_en=now() WHERE id=v_e.id;
 INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 VALUES(v_e.almacen_id,v_p.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',btrim(p_observacion),
  jsonb_build_object('entrega_id',v_e.id,'estado','PENDIENTE_PROGRAMACION'),
  jsonb_build_object('turno_id',v_t.id,'sesion_id',v_s.id,'fecha_inicio',v_e.fecha_destino,
    'fecha_fin',p_fecha_fin,'responsable_id',p_responsable_id,'estado_entrega','PENDIENTE_RECEPCION'));
 INSERT INTO public.turno_eventos(turno_id,actor_user_id,tipo,payload)
 VALUES(v_t.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_PROGRAMADA',
  jsonb_build_object('turno_anterior_id',v_old_t.id,'sesion_anterior_id',v_old_s.id,'entrega_id',v_e.id,
   'sesion_id',v_s.id,'fecha_inicio',v_e.fecha_destino,'fecha_fin',p_fecha_fin,
   'responsable_id',p_responsable_id,'stock_global_modificado',false));
 RETURN jsonb_build_object('turno_id',v_t.id,'sesion_id',v_s.id,'programacion_id',v_p.id,
  'entrega_id',v_e.id,'fecha_inicio',v_e.fecha_destino,'fecha_fin',p_fecha_fin,
  'responsable_id',p_responsable_id,'lineas_inventario',v_line_count,'estado','PROGRAMADA',
  'recepcion','PENDIENTE_RECEPCION','stock_global_modificado',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_admin_iniciar_sucesora_retroactiva(p_turno_sesion_id uuid,p_hora_real time,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
 v_uid uuid:=auth.uid();v_s public.turno_sesiones;v_p public.turno_jornada_programacion;
 v_t public.turnos;v_tr public.turno_tramos;v_delivery public.turno_jornada_inventario_entregas;
 v_start timestamptz;v_today date;
BEGIN
 IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
  RAISE EXCEPTION 'Solo ADMIN autenticado puede abrir una sucesora retroactiva.' USING ERRCODE='42501';
 END IF;
 IF p_hora_real IS NULL OR length(btrim(coalesce(p_motivo,'')))<5 OR length(p_motivo)>1000 THEN
  RAISE EXCEPTION 'Indica la hora real de inicio y un motivo (5–1000 caracteres).' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
 IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL OR v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
  RAISE EXCEPTION 'La sesión sucesora ya no está disponible para apertura retroactiva.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id FOR SHARE;
 SELECT * INTO v_t FROM public.turnos WHERE id=v_s.turno_id FOR UPDATE;
 IF NOT FOUND OR v_t.estado_maestro<>'PROGRAMADO' THEN
  RAISE EXCEPTION 'El Turno sucesor no está programado.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_delivery FROM public.turno_jornada_inventario_entregas WHERE destino_sesion_id=v_s.id FOR UPDATE;
 IF NOT FOUND OR v_delivery.estado<>'ACEPTADA' THEN
  RAISE EXCEPTION 'La recepción física debe estar aceptada antes de abrir la jornada.' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.turno_jornada_inventario_cortes c
  WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO') THEN
  RAISE EXCEPTION 'La recepción no ha generado un inventario inicial completo.' USING ERRCODE='23514';
 END IF;
 v_today:=(now() AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date;
 IF v_today < v_p.fecha THEN
  RAISE EXCEPTION 'La apertura de la sucesora solo puede registrarse cuando la fecha programada de inicio ya llegó.' USING ERRCODE='23514';
 END IF;
 IF p_hora_real<v_p.hora_inicio_prevista OR p_hora_real>=v_p.hora_fin_prevista THEN
  RAISE EXCEPTION 'La hora real debe estar dentro del horario previsto %–%.',v_p.hora_inicio_prevista,v_p.hora_fin_prevista USING ERRCODE='22023';
 END IF;
 v_start:=(v_p.fecha+p_hora_real) AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana');
 IF v_start>now() THEN RAISE EXCEPTION 'La fecha/hora real de inicio no puede estar en el futuro.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.turno_tramos tr WHERE tr.usuario_id=v_p.responsable_id AND tr.estado='ACTIVO') THEN
  RAISE EXCEPTION 'La responsable ya tiene otro tramo operativo activo.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.turno_sesiones s JOIN public.turnos t ON t.id=s.turno_id
  WHERE s.almacen_id=v_s.almacen_id AND s.id<>v_s.id AND s.estado='EN_CURSO'
    AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')) THEN
  RAISE EXCEPTION 'El almacén ya tiene otra jornada en curso.' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado,inicio_at)
 VALUES(v_s.id,v_t.id,v_p.responsable_id,'NORMAL','ACTIVO',v_start) RETURNING * INTO v_tr;
 UPDATE public.turno_sesiones SET estado='EN_CURSO',apertura_retroactiva=true,updated_at=now() WHERE id=v_s.id;
 UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',apertura_real=v_start,actualizado_en=now() WHERE id=v_t.id;
 INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
 VALUES(v_t.id,v_s.id,v_tr.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_INICIADA',
  jsonb_build_object('responsable_id',v_p.responsable_id,'inicio_real_at',v_start,'fecha_inicio',v_p.fecha,
   'fecha_fin',coalesce(v_p.fecha_fin,v_p.fecha),'motivo',btrim(p_motivo),
   'recepcion_id',(SELECT r.id FROM public.turno_jornada_inventario_recepciones r
    WHERE r.entrega_id=v_delivery.id ORDER BY r.intento DESC LIMIT 1)));
 INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
 VALUES(v_s.almacen_id,v_p.id,v_uid,'JORNADA_SUcesora_RETROACTIVA_INICIADA',btrim(p_motivo),
  jsonb_build_object('estado','PROGRAMADA'),jsonb_build_object('estado','EN_CURSO','tramo_id',v_tr.id,'inicio_real_at',v_start));
 RETURN jsonb_build_object('ok',true,'turno_id',v_t.id,'sesion_id',v_s.id,'tramo_id',v_tr.id,
  'responsable_id',v_p.responsable_id,'inicio_real_at',v_start,'estado','EN_CURSO');
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.bc7_admin_programar_sucesora_pendiente(uuid,date,uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.bc7_admin_iniciar_sucesora_retroactiva(uuid,time,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.bc7_admin_iniciar_sucesora_retroactiva(uuid,time,text) TO authenticated;

COMMIT;