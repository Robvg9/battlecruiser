-- Enforce the operational rule: every Turno spans at least two calendar dates.
-- CREATE OR REPLACE preserves the existing function owner and EXECUTE grants.
CREATE OR REPLACE FUNCTION public.bc5_crear_jornada_unica(p_almacen_id uuid, p_fecha_inicio date, p_dias integer, p_programacion jsonb DEFAULT NULL::jsonb, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cfg public.turno_jornada_configuracion; v_patron public.turno_jornada_patrones;
  v_patron_dia public.turno_jornada_patron_dias; v_item jsonb; v_row jsonb := '[]'::jsonb;
  v_dia integer; v_fecha date; v_offset integer; v_trabaja boolean; v_responsable uuid;
  v_patron_id uuid; v_turno public.turnos; v_programacion public.turno_jornada_programacion;
  v_sesion public.turno_sesiones; v_laborables integer := 0; v_descansos integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede crear una jornada programada.'
      USING ERRCODE = '42501';
  END IF;
  IF p_fecha_inicio IS NULL OR p_dias IS NULL OR p_dias NOT BETWEEN 2 AND 31 THEN
    RAISE EXCEPTION 'La programación debe abarcar entre 2 y 31 días.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id=p_almacen_id AND activo=true) THEN
    RAISE EXCEPTION 'Almacén inexistente o inactivo.' USING ERRCODE = '23503';
  END IF;
  INSERT INTO public.turno_jornada_configuracion (almacen_id)
  VALUES (p_almacen_id) ON CONFLICT (almacen_id) DO NOTHING;
  SELECT * INTO v_cfg FROM public.turno_jornada_configuracion WHERE almacen_id=p_almacen_id;
  IF p_fecha_inicio < (now() AT TIME ZONE v_cfg.zona_horaria)::date THEN
    RAISE EXCEPTION 'No se admiten jornadas retroactivas; use una corrección auditada.'
      USING ERRCODE = '22023';
  END IF;
  IF p_programacion IS NULL THEN
    SELECT * INTO v_patron FROM public.turno_jornada_patrones
    WHERE almacen_id=p_almacen_id AND activo;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe patrón activo ni programación explícita.'
      USING ERRCODE = 'P0002'; END IF;
    v_patron_id := v_patron.id;
  ELSE
    IF jsonb_typeof(p_programacion) <> 'array' OR jsonb_array_length(p_programacion) <> p_dias THEN
      RAISE EXCEPTION 'La programación explícita debe tener una entrada por día.' USING ERRCODE = '22023';
    END IF;
    SELECT count(DISTINCT (x.value->>'numero_dia')::integer)
      INTO v_laborables FROM jsonb_array_elements(p_programacion) AS x(value);
    IF v_laborables <> p_dias THEN
      RAISE EXCEPTION 'Debe existir exactamente una entrada por cada día de 1 a N.' USING ERRCODE = '22023';
    END IF;
    v_laborables := 0;
    v_patron_id := NULL;
  END IF;

  FOR v_dia IN 1..p_dias LOOP
    v_fecha := p_fecha_inicio + (v_dia-1);
    IF p_programacion IS NULL THEN
      v_offset := (((v_fecha-v_patron.fecha_ancla) % v_patron.largo_ciclo)
                   + v_patron.largo_ciclo) % v_patron.largo_ciclo + 1;
      SELECT * INTO v_patron_dia FROM public.turno_jornada_patron_dias
      WHERE patron_id=v_patron.id AND numero_dia=v_offset;
      IF NOT FOUND THEN RAISE EXCEPTION 'Patrón incompleto en día %.',v_offset USING ERRCODE = '23514'; END IF;
      v_trabaja := v_patron_dia.trabaja; v_responsable := v_patron_dia.responsable_id;
    ELSE
      SELECT x.value INTO v_item FROM jsonb_array_elements(p_programacion) AS x(value)
      WHERE (x.value->>'numero_dia')::integer=v_dia;
      IF v_item IS NULL OR jsonb_typeof(v_item)<>'object'
         OR coalesce(v_item->>'trabaja','') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'Entrada inválida para el día %.',v_dia USING ERRCODE = '22023';
      END IF;
      v_trabaja := (v_item->>'trabaja')::boolean;
      v_responsable := nullif(v_item->>'responsable_id','')::uuid;
    END IF;
    IF v_trabaja AND v_responsable IS NULL THEN
      RAISE EXCEPTION 'Día % laborable requiere responsable explícito.',v_dia USING ERRCODE = '22023';
    END IF;
    IF NOT v_trabaja AND v_responsable IS NOT NULL THEN
      RAISE EXCEPTION 'Día % de descanso no puede tener responsable.',v_dia USING ERRCODE = '22023';
    END IF;
    IF v_trabaja AND NOT public.bc5_jornada_responsable_elegible(v_responsable) THEN
      RAISE EXCEPTION 'Responsable no elegible para el día %.',v_dia USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.turno_jornada_programacion p
      WHERE p.almacen_id=p_almacen_id AND p.fecha=v_fecha AND p.estado IN ('PROGRAMADA','DESCANSO')) THEN
      RAISE EXCEPTION 'Ya existe programación para el almacén en %.',v_fecha USING ERRCODE = '23505';
    END IF;
    IF v_trabaja AND EXISTS (
      SELECT 1 FROM public.turno_sesiones s
      JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
      JOIN public.turnos t ON t.id=s.turno_id
      WHERE s.fecha=v_fecha AND s.jornada_programacion_id IS NULL
        AND s.estado NOT IN ('COMPLETADA','CANCELADA') AND a.usuario_id=v_responsable
        AND a.retirado_at IS NULL AND COALESCE(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')) THEN
      RAISE EXCEPTION 'El responsable tiene una asignación legacy pendiente en %.',v_fecha USING ERRCODE = '23505';
    END IF;
    v_row := v_row || jsonb_build_array(jsonb_build_object(
      'numero_dia',v_dia,'fecha',v_fecha,'trabaja',v_trabaja,
      'responsable_id',v_responsable,'estado',CASE WHEN v_trabaja THEN 'PROGRAMADA' ELSE 'DESCANSO' END,
      'hora_inicio_prevista',v_cfg.hora_inicio,'hora_fin_prevista',v_cfg.hora_fin,
      'zona_horaria',v_cfg.zona_horaria,'patron_id',v_patron_id));
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.turnos t WHERE t.almacen_id=p_almacen_id
      AND t.dias_turno IS NOT NULL
      AND COALESCE(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')) THEN
    RAISE EXCEPTION 'Hay un Turno activo para este almacén; reconcílielo antes de crear la jornada nueva.'
      USING ERRCODE = '23505';
  END IF;
  BEGIN
    INSERT INTO public.turnos
      (usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
    VALUES (auth.uid(),NULL,p_almacen_id,p_fecha_inicio,'PROGRAMADO',auth.uid(),auth.uid(),'PROGRAMADO',p_dias)
    RETURNING * INTO v_turno;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya existe un Turno activo o duplicado en este almacén.'
      USING ERRCODE = '23505';
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_row) AS x(value) LOOP
    INSERT INTO public.turno_jornada_programacion
      (turno_id,almacen_id,numero_dia,fecha,trabaja,responsable_id,
       hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,motivo_ajuste,
       creado_por,actualizado_por)
    VALUES (v_turno.id,p_almacen_id,(v_item->>'numero_dia')::integer,(v_item->>'fecha')::date,
       (v_item->>'trabaja')::boolean,nullif(v_item->>'responsable_id','')::uuid,
       (v_item->>'hora_inicio_prevista')::time,(v_item->>'hora_fin_prevista')::time,
       v_item->>'zona_horaria',nullif(v_item->>'patron_id','')::uuid,v_item->>'estado',
       nullif(trim(p_observacion),''),auth.uid(),auth.uid())
    RETURNING * INTO v_programacion;
    IF v_programacion.trabaja THEN
      INSERT INTO public.turno_sesiones
        (turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id)
      VALUES (v_turno.id,p_almacen_id,v_programacion.numero_dia,'JORNADA',
        v_programacion.fecha,'PROGRAMADA',v_programacion.id)
      RETURNING * INTO v_sesion;
      INSERT INTO public.turno_asignaciones
        (turno_sesion_id,turno_id,usuario_id,asignado_por)
      VALUES (v_sesion.id,v_turno.id,v_programacion.responsable_id,auth.uid());
      v_laborables := v_laborables+1;
    ELSE v_descansos := v_descansos+1;
    END IF;
    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,patron_id,actor_user_id,tipo,motivo,estado_despues)
    VALUES (p_almacen_id,v_programacion.id,v_patron_id,auth.uid(),
      CASE WHEN v_programacion.trabaja THEN 'JORNADA_PROGRAMADA' ELSE 'DESCANSO_PROGRAMADO' END,
      coalesce(nullif(trim(p_observacion),''),'Programación creada por ADMIN'),
      to_jsonb(v_programacion));
  END LOOP;
  INSERT INTO public.turno_eventos (turno_id,actor_user_id,tipo,payload)
  VALUES (v_turno.id,auth.uid(),'JORNADA_UNICA_CREADA',jsonb_build_object(
    'modelo','JORNADA','hora_inicio',v_cfg.hora_inicio,'hora_fin',v_cfg.hora_fin,
    'zona_horaria',v_cfg.zona_horaria,'dias_total',p_dias,'dias_laborables',v_laborables,
    'dias_descanso',v_descansos,'patron_id',v_patron_id,'observacion',p_observacion));
  RETURN jsonb_build_object('turno_id',v_turno.id,'almacen_id',p_almacen_id,
    'fecha_inicio',p_fecha_inicio,'dias_total',p_dias,'dias_laborables',v_laborables,
    'dias_descanso',v_descansos,'hora_inicio',v_cfg.hora_inicio,'hora_fin',v_cfg.hora_fin,
    'zona_horaria',v_cfg.zona_horaria,'estado','PROGRAMADO');
END;
$function$
;

