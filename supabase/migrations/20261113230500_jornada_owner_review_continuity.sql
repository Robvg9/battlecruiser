BEGIN;

-- Operational continuity is independent from the Owner's administrative review.
DROP INDEX IF EXISTS public.ux_turnos_maestro_unico_activo_por_almacen;
DROP INDEX IF EXISTS public.turnos_unico_abierto_por_usuario;
CREATE UNIQUE INDEX turnos_unico_abierto_por_usuario
  ON public.turnos(usuario_id)
  WHERE estado='ABIERTO' AND dias_turno IS NULL;


CREATE TABLE IF NOT EXISTS public.turno_jornada_movimiento_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  tipo_movimiento text NOT NULL CHECK (tipo_movimiento IN ('BAJA','MERMA')),
  movimiento_id uuid NOT NULL,
  clasificacion text NOT NULL CHECK (clasificacion IN ('ANTES_CORTE','DESPUES_CORTE')),
  comentario text NOT NULL CHECK (length(trim(comentario))>0),
  revisado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  revisado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(turno_sesion_id,tipo_movimiento,movimiento_id)
);
ALTER TABLE public.turno_jornada_movimiento_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turno_jornada_movimiento_revision FROM PUBLIC,anon,authenticated;


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
  v_error text;
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

  -- Administrative review of a completed master Turn is independent from the next schedule.
  -- Date/responsible conflicts and the active-session unique index remain enforced.
  BEGIN
    INSERT INTO public.turnos
      (usuario_id,usuario_nombre,almacen_id,fecha,estado,creado_por,created_by,estado_maestro,dias_turno)
    VALUES (auth.uid(),NULL,p_almacen_id,p_fecha_inicio,'PROGRAMADO',auth.uid(),auth.uid(),'PROGRAMADO',p_dias)
    RETURNING * INTO v_turno;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    RAISE EXCEPTION '%', v_error USING ERRCODE = '23505';
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
$function$;

CREATE OR REPLACE FUNCTION public.bc5_cerrar_jornada(p_turno_sesion_id uuid, p_motivo_excepcion text DEFAULT NULL::text)
 RETURNS turno_sesiones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sesion public.turno_sesiones;
  v_programacion public.turno_jornada_programacion;
  v_local timestamp without time zone;
  v_ahora_minuto time;
  v_fecha_fin date;
  v_result public.turno_sesiones;
  v_tramo public.turno_tramos;
  v_liquidacion jsonb;
  v_fin_programado timestamp without time zone;
  v_fin_operativo timestamptz;
  v_tardia boolean := false;
  v_temprana boolean := false;
  v_tipo_evento text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_sesion FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.bloque<>'JORNADA' OR v_sesion.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'No es una sesión de jornada única válida.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_programacion FROM public.turno_jornada_programacion WHERE id=v_sesion.jornada_programacion_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programación de jornada no encontrada.' USING ERRCODE='23503';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_sesion.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede cerrar esta jornada.' USING ERRCODE='42501';
  END IF;
  IF v_sesion.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La jornada no está en curso.' USING ERRCODE='23514';
  END IF;

  IF EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_sesion.almacen_id AND a.tipo='minorista') THEN
    v_liquidacion:=public.bc7_liquidacion_inventario_jornada(v_sesion.id);
    IF coalesce((v_liquidacion->>'faltan_cortes')::boolean,true) THEN
      RAISE EXCEPTION 'No se puede entregar: falta confirmar el inventario inicial o final.' USING ERRCODE='23514';
    END IF;
    IF coalesce((public.bc7_estado_confirmaciones_jornada(v_sesion.id)->>'lista_para_conteo')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'No se puede entregar la jornada: Sheila debe completar gastos, reinversiones, bajas e inventario final.' USING ERRCODE='23514';
    END IF;
    -- Cash count, outstanding approvals and settlement calculation belong to the Owner phase,
    -- after this session handover. The master Turn remains open for final review.
  END IF;

  v_fecha_fin:=coalesce(v_programacion.fecha_fin,v_programacion.fecha);
  v_local:=now() AT TIME ZONE coalesce(nullif(v_programacion.zona_horaria,''),'America/Havana');
  v_ahora_minuto:=date_trunc('minute',v_local)::time;
  v_fin_programado:=v_fecha_fin+v_programacion.hora_fin_prevista;
  v_temprana:=v_local<v_fin_programado;
  v_tardia:=v_local>v_fin_programado;
  IF v_temprana AND trim(coalesce(p_motivo_excepcion,''))='' THEN
    RAISE EXCEPTION 'Cierre anticipado: registra el motivo antes de entregar la jornada.' USING ERRCODE='23514';
  END IF;
  -- A late data-entry/handover after the planned operational end is normal.
  -- Unless an overtime reason is explicitly supplied, the operational tranche ends
  -- at the programmed schedule; the administrative handover remains timestamped now().
  IF v_tardia AND trim(coalesce(p_motivo_excepcion,''))='' THEN
    v_fin_operativo:=v_fin_programado AT TIME ZONE coalesce(nullif(v_programacion.zona_horaria,''),'America/Havana');
    v_tipo_evento:='JORNADA_ENTREGADA_TARDE';
  ELSE
    v_fin_operativo:=now();
    IF v_temprana OR v_tardia THEN
      v_tipo_evento:='JORNADA_CERRADA_CON_EXCEPCION';
    ELSE
      v_tipo_evento:='JORNADA_CERRADA';
    END IF;
  END IF;

  -- Complete the Jornada transition here; the public legacy helper now rejects
  -- direct calls for block=JORNADA and remains available only to legacy blocks.
  SELECT * INTO v_tramo FROM public.turno_tramos
  WHERE turno_sesion_id=v_sesion.id AND estado='ACTIVO'
  ORDER BY inicio_at DESC NULLS LAST,created_at DESC NULLS LAST
  LIMIT 1 FOR UPDATE;
  IF v_tramo.id IS NULL THEN
    RAISE EXCEPTION 'La jornada EN_CURSO no tiene un tramo activo.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.turno_declaraciones d
    WHERE d.turno_tramo_id=v_tramo.id AND d.usuario_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Antes de cerrar la jornada debes declarar el dinero entregado.' USING ERRCODE='23514';
  END IF;
  UPDATE public.turno_tramos SET estado='COMPLETADO',fin_at=v_fin_operativo WHERE id=v_tramo.id;
  UPDATE public.turno_sesiones SET estado='COMPLETADA',updated_at=now()
  WHERE id=v_sesion.id RETURNING * INTO v_result;
  UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',cierre_real=NULL,actualizado_en=now()
  WHERE id=v_sesion.turno_id;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo)
  VALUES(v_sesion.turno_id,v_sesion.id,v_tramo.id,auth.uid(),'SESION_CERRADA');

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES(v_sesion.turno_id,v_sesion.id,auth.uid(),
    v_tipo_evento,
    jsonb_build_object('fecha_fin_programada',v_fecha_fin,'hora_programada',v_programacion.hora_fin_prevista,
      'fin_operativo_at',v_fin_operativo,'entregado_admin_at',now(),
      'registro_administrativo_tardio',v_tardia AND trim(coalesce(p_motivo_excepcion,''))='',
      'hora_real',v_ahora_minuto,'fecha_real',v_local::date,'zona_horaria',v_programacion.zona_horaria,
      'motivo',nullif(trim(p_motivo_excepcion),'')));
  INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_programacion.almacen_id,v_programacion.id,auth.uid(),
    v_tipo_evento,
    nullif(trim(p_motivo_excepcion),''),jsonb_build_object('estado_sesion',v_sesion.estado),
    jsonb_build_object('estado_sesion',v_result.estado,'fecha_real',v_local::date,'fecha_fin_programada',v_fecha_fin,'hora_real',v_ahora_minuto,
      'fin_operativo_at',v_fin_operativo,'entregado_admin_at',now(),'registro_administrativo_tardio',v_tardia AND trim(coalesce(p_motivo_excepcion,''))=''));
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc7_configurar_salario_porcentaje_jornada(p_turno_sesion_id uuid, p_porcentaje numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_old numeric;
  v_store_old numeric;
  v_master_estado text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('reinversiones','editar_any') THEN
    RAISE EXCEPTION 'Solo Dueño puede configurar el porcentaje salarial.' USING ERRCODE='42501';
  END IF;
  IF p_turno_sesion_id IS NULL OR p_porcentaje IS NULL OR p_porcentaje<0 OR p_porcentaje>100 THEN
    RAISE EXCEPTION 'El porcentaje debe estar entre 0 y 100.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id AND bloque='JORNADA';
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe la jornada indicada.' USING ERRCODE='23503'; END IF;
  IF v_s.estado='CANCELADA' THEN
    RAISE EXCEPTION 'No se puede configurar el salario de una jornada cancelada.' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(estado_maestro,estado) INTO v_master_estado
  FROM public.turnos WHERE id=v_s.turno_id;
  IF v_master_estado IN ('CERRADO','CANCELADO')
     OR EXISTS(SELECT 1 FROM public.turno_revisiones r WHERE r.turno_id=v_s.turno_id AND r.estado='APROBADO') THEN
    RAISE EXCEPTION 'El Turno ya fue aprobado o cerrado; el porcentaje salarial quedó congelado.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion
  WHERE id=v_s.jornada_programacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe la programación de esta jornada.' USING ERRCODE='23503'; END IF;
  v_old:=v_p.salario_porcentaje;
  IF v_old IS NOT NULL AND v_old IS DISTINCT FROM p_porcentaje THEN
    RAISE EXCEPTION 'El porcentaje salarial de esta jornada ya quedó fijado; solo puede cambiarse antes de asignarlo.' USING ERRCODE='23514';
  END IF;
  -- A retroactively opened session may predate its store configuration row.
  -- Recreate it from the exact schedule already stored on this programming row;
  -- never infer or set the salary percentage during this bootstrap.
  INSERT INTO public.turno_jornada_configuracion
    (almacen_id,hora_inicio,hora_fin,zona_horaria)
  VALUES (
    v_s.almacen_id,
    v_p.hora_inicio_prevista,
    v_p.hora_fin_prevista,
    coalesce(nullif(v_p.zona_horaria,''),'America/Havana')
  )
  ON CONFLICT (almacen_id) DO NOTHING;
  SELECT salario_porcentaje INTO v_store_old
  FROM public.turno_jornada_configuracion
  WHERE almacen_id=v_s.almacen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe configuración de jornada para el almacén.' USING ERRCODE='23503'; END IF;
  UPDATE public.turno_jornada_programacion
  SET salario_porcentaje=p_porcentaje,actualizado_por=auth.uid(),actualizado_en=now()
  WHERE id=v_p.id;
  -- A retroactive Owner setting for an already completed session must not
  -- silently change the store-wide default used by future schedules.
  IF v_s.estado<>'COMPLETADA' THEN
    UPDATE public.turno_jornada_configuracion
    SET salario_porcentaje=p_porcentaje,
        salario_porcentaje_actualizado_por=auth.uid(),
        salario_porcentaje_actualizado_en=now(),
        actualizado_por=auth.uid(),
        actualizado_en=now()
    WHERE almacen_id=v_s.almacen_id;
  END IF;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_s.almacen_id,v_p.id,auth.uid(),'SALARIO_PORCENTAJE_CONFIGURADO',
    'Se fijó el porcentaje salarial de esta jornada; el valor queda congelado al cerrarla.',
    jsonb_build_object('salario_porcentaje_jornada',v_old,'salario_porcentaje_predeterminado',v_store_old),
    jsonb_build_object('salario_porcentaje_jornada',p_porcentaje,'salario_porcentaje_predeterminado',CASE WHEN v_s.estado='COMPLETADA' THEN v_store_old ELSE p_porcentaje END));
  RETURN jsonb_build_object('ok',true,'turno_sesion_id',v_s.id,'salario_porcentaje',p_porcentaje);
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
    SELECT l.producto_id AS product_id,l.cantidad_contada::numeric AS qty
    FROM public.turno_jornada_inventario_lineas l
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
        OR (t.fecha AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date>v_p.fecha
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
  SELECT count(*),count(*) FILTER(WHERE precio_unitario IS NOT NULL AND sold_qty>=0),
         count(*) FILTER(WHERE sold_qty<0),coalesce(sum(sold_qty),0),
         CASE WHEN count(*) FILTER(WHERE precio_unitario IS NULL OR sold_qty<0)>0 THEN NULL
              ELSE round(sum(sold_qty*precio_unitario),2) END,
         coalesce(jsonb_agg(jsonb_build_object(
           'producto_id',product_id,'nombre',nombre,'unidad',unidad,
           'inventario_inicial',initial_qty,'transferencias_entrada',transfer_in,
           'compras',purchases_in,'reinversiones_entrada',reinvestment_in,
           'transferencias_salida',transfer_out,'vales_salida',vales_out,
           'mermas_aprobadas',merma_out,'bajas_aprobadas',bajas_out,
           'inventario_final',final_qty,'unidades_vendidas',sold_qty,
           'precio_unitario',precio_unitario,'estado_precio',estado_precio,
           'importe_estimado',CASE WHEN precio_unitario IS NOT NULL AND sold_qty>=0 THEN round(sold_qty*precio_unitario,2) ELSE NULL END
         ) ORDER BY nombre,product_id),'[]'::jsonb)
    INTO v_total_lines,v_priced_lines,v_negative_lines,v_total_units,v_sales_total,v_lines
  FROM calculated;

  -- Do not present provisional sales or salary as if the missing final stock were zero.
  IF v_initial.id IS NULL OR v_final.id IS NULL THEN
    v_total_lines:=0;
    v_priced_lines:=0;
    v_negative_lines:=0;
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
  v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL AND v_salary IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments-v_salary,2) ELSE NULL END;
  v_difference:=CASE WHEN v_cash_received IS NOT NULL AND v_expected_cash IS NOT NULL
    THEN round(v_cash_received-v_expected_cash,2) ELSE NULL END;
  IF v_pending_post>0 THEN
    -- Hide provisional values: omitting an unclassified movement must never
    -- appear as extra sales, cash or salary.
    v_total_units:=NULL;
    v_sales_total:=NULL;
    v_salary:=NULL;
    v_expected_cash:=NULL;
    v_difference:=NULL;
    v_lines:='[]'::jsonb;
  END IF;
  v_complete:=v_initial.id IS NOT NULL AND v_final.id IS NOT NULL
    AND v_total_lines>0 AND v_priced_lines=v_total_lines AND v_negative_lines=0
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
    'efectivo_esperado_despues_de_gastos_reinversiones_salario',v_expected_cash,
    'diferencia',v_difference,
    'faltan_cortes',NOT(v_initial.id IS NOT NULL AND v_final.id IS NOT NULL),
    'familias_sin_precio',v_total_lines-v_priced_lines,
    'familias_con_vendidas_negativas',v_negative_lines,
    'movimientos_posteriores_pendientes',v_pending_post,
    'pendientes',jsonb_build_object(
      'gastos',v_pending_expenses,'reinversiones',v_pending_reinvestments,
      'ajustes',v_pending_adjustments,'movimientos_posteriores_corte',v_pending_post,
      'entregas_diarias',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing
    )
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
      CASE WHEN s.estado='COMPLETADA' THEN d.estado_aprobacion ELSE 'ESPERANDO_ENTREGA' END,
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



CREATE OR REPLACE FUNCTION public.bc7_clasificar_movimientos_fuera_corte(
  p_turno_sesion_id uuid,
  p_decisiones jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_final public.turno_jornada_inventario_cortes;
  v_item jsonb;
  v_tipo text;
  v_id uuid;
  v_clasificacion text;
  v_comentario text;
  v_count integer:=0;
  v_pending integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede clasificar movimientos posteriores al corte.' USING ERRCODE='42501';
  END IF;
  IF p_decisiones IS NULL OR jsonb_typeof(p_decisiones)<>'array' OR jsonb_array_length(p_decisiones)=0 THEN
    RAISE EXCEPTION 'Selecciona una clasificación para cada movimiento y escribe el motivo.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id AND bloque='JORNADA';
  IF NOT FOUND OR v_s.estado<>'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se pueden revisar movimientos de una jornada completada.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
  IF v_final.id IS NULL THEN RAISE EXCEPTION 'Falta el inventario final confirmado.' USING ERRCODE='23514'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_decisiones) x(value) LOOP
    v_tipo:=upper(coalesce(v_item->>'tipo',''));
    v_id:=nullif(v_item->>'id','')::uuid;
    v_clasificacion:=upper(coalesce(v_item->>'clasificacion',''));
    v_comentario:=trim(coalesce(v_item->>'comentario',''));
    IF v_tipo NOT IN ('BAJA','MERMA') OR v_id IS NULL
       OR v_clasificacion NOT IN ('ANTES_CORTE','DESPUES_CORTE')
       OR v_comentario='' THEN
      RAISE EXCEPTION 'Cada movimiento requiere tipo, ID, clasificación y motivo.' USING ERRCODE='22023';
    END IF;
    IF v_tipo='BAJA' AND NOT EXISTS(
      SELECT 1 FROM public.bajas b WHERE b.id=v_id AND b.turno_sesion_id=v_s.id
        AND b.estado='APROBADA' AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en
    ) THEN
      RAISE EXCEPTION 'La baja indicada no pertenece a los movimientos posteriores al inventario final.' USING ERRCODE='23503';
    END IF;
    IF v_tipo='MERMA' AND NOT EXISTS(
      SELECT 1 FROM public.mermas m WHERE m.id=v_id AND m.turno_sesion_id=v_s.id
        AND m.estado='APROBADA' AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en
    ) THEN
      RAISE EXCEPTION 'La merma indicada no pertenece a los movimientos posteriores al inventario final.' USING ERRCODE='23503';
    END IF;
    INSERT INTO public.turno_jornada_movimiento_revision(
      turno_sesion_id,tipo_movimiento,movimiento_id,clasificacion,comentario,revisado_por,revisado_at
    ) VALUES(v_s.id,v_tipo,v_id,v_clasificacion,v_comentario,auth.uid(),now())
    ON CONFLICT(turno_sesion_id,tipo_movimiento,movimiento_id) DO UPDATE
      SET clasificacion=EXCLUDED.clasificacion,comentario=EXCLUDED.comentario,
          revisado_por=EXCLUDED.revisado_por,revisado_at=EXCLUDED.revisado_at;
    v_count:=v_count+1;
  END LOOP;
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES(v_s.turno_id,v_s.id,auth.uid(),'MOVIMIENTOS_POST_CORTE_CLASIFICADOS',
    jsonb_build_object('movimientos_revisados',v_count,'decisiones',p_decisiones));
  SELECT count(*) INTO v_pending FROM (
    SELECT b.id FROM public.bajas b WHERE b.turno_sesion_id=v_s.id AND b.estado='APROBADA'
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA' AND mr.movimiento_id=b.id)
    UNION ALL
    SELECT m.id FROM public.mermas m WHERE m.turno_sesion_id=v_s.id AND m.estado='APROBADA'
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en
      AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
        WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA' AND mr.movimiento_id=m.id)
  ) pending;
  RETURN jsonb_build_object('ok',true,'revisados',v_count,'pendientes',v_pending);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.bc7_obtener_revision_jornada(p_turno_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_turn public.turnos;
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_final public.turno_jornada_inventario_cortes;
  v_liq jsonb;
  v_lines jsonb;
  v_post jsonb;
  v_sessions jsonb:='[]'::jsonb;
  v_cost_covered integer;
  v_cost_total integer;
  v_pending_post integer;
  v_cash_declared numeric;
  v_cash_counted numeric;
  v_cash_state text;
  v_cash_declared_at timestamptz;
  v_cash_counted_at timestamptz;
  v_revision public.turno_revisiones;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede consultar la revisión integral.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_turn FROM public.turnos WHERE id=p_turno_id AND dias_turno IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe un Turno de jornadas para revisar.' USING ERRCODE='23503'; END IF;
  SELECT * INTO v_revision FROM public.turno_revisiones WHERE turno_id=v_turn.id;
  FOR v_s IN SELECT * FROM public.turno_sesiones
    WHERE turno_id=v_turn.id AND bloque='JORNADA' ORDER BY numero_dia
  LOOP
    SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
    SELECT * INTO v_final FROM public.turno_jornada_inventario_cortes
      WHERE turno_sesion_id=v_s.id AND tipo='FINAL' AND estado='CONFIRMADO';
    v_liq:=public.bc7_liquidacion_inventario_jornada(v_s.id);
    SELECT coalesce(jsonb_agg(
      x.value || jsonb_build_object(
        'costo_unitario_estimado',c.costo_unitario,
        'estado_costo',CASE WHEN c.costo_unitario IS NULL THEN 'SIN_COSTO_COMPROBADO' ELSE 'COSTO_PROMEDIO_PONDERADO_LOTES' END,
        'costo_vendido_estimado',CASE WHEN c.costo_unitario IS NOT NULL AND (x.value->>'unidades_vendidas')::numeric>=0
          THEN round((x.value->>'unidades_vendidas')::numeric*c.costo_unitario,2) ELSE NULL END,
        'ganancia_bruta_estimada',CASE WHEN c.costo_unitario IS NOT NULL AND x.value->>'importe_estimado' IS NOT NULL
          THEN round((x.value->>'importe_estimado')::numeric-
            ((x.value->>'unidades_vendidas')::numeric*c.costo_unitario),2) ELSE NULL END,
        'margen_bruto_estimado',CASE WHEN c.costo_unitario IS NOT NULL
          AND nullif((x.value->>'importe_estimado')::numeric,0) IS NOT NULL
          THEN round(100*(((x.value->>'importe_estimado')::numeric-
            ((x.value->>'unidades_vendidas')::numeric*c.costo_unitario))/
            (x.value->>'importe_estimado')::numeric),2) ELSE NULL END
      ) ORDER BY x.value->>'nombre'
    ),'[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(coalesce(v_liq->'lineas','[]'::jsonb)) x(value)
    LEFT JOIN LATERAL (
      SELECT round(sum(l.cantidad_inicial*l.costo_unitario)/nullif(sum(l.cantidad_inicial),0),2) costo_unitario
      FROM public.lotes_compra l
      JOIN public.productos p ON p.id=l.producto_id
      WHERE l.almacen_id=v_s.almacen_id
        AND coalesce(p.producto_padre_id,p.id)=(x.value->>'producto_id')::uuid
        AND l.fecha_compra<=coalesce(v_final.confirmado_en,now())
        AND coalesce(l.costo_unitario,0)>0
    ) c ON true;
    SELECT count(*) FILTER(WHERE x.value->>'estado_costo'<>'SIN_COSTO_COMPROBADO'),
           count(*)
      INTO v_cost_covered,v_cost_total
    FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value);
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'tipo',m.tipo,'id',m.id,'producto',m.producto,'cantidad',m.cantidad,
        'estado',m.estado,'creado_en',m.creado_en,'fecha_revision',m.fecha_revision,'motivo',m.motivo,
        'clasificacion',r.clasificacion,'comentario_revision',r.comentario
      ) ORDER BY m.creado_en,m.producto),'[]'::jsonb),
      count(*) FILTER(WHERE r.clasificacion IS NULL)
      INTO v_post,v_pending_post
    FROM (
      SELECT 'BAJA'::text tipo,b.id,p.nombre producto,b.cantidad,b.estado,b.creado_en,coalesce(b.fecha_revision,b.actualizado_en) AS fecha_revision,b.motivo
      FROM public.bajas b JOIN public.productos p ON p.id=b.producto_id
      WHERE b.turno_sesion_id=v_s.id AND b.estado='APROBADA'
        AND v_final.id IS NOT NULL AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_final.confirmado_en
      UNION ALL
      SELECT 'MERMA'::text,m.id,p.nombre,m.cantidad,m.estado,m.creado_en,coalesce(m.fecha_revision,m.actualizado_en) AS fecha_revision,m.motivo
      FROM public.mermas m JOIN public.productos p ON p.id=m.producto_id
      WHERE m.turno_sesion_id=v_s.id AND m.estado='APROBADA'
        AND v_final.id IS NOT NULL AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_final.confirmado_en
    ) m
    LEFT JOIN public.turno_jornada_movimiento_revision r
      ON r.turno_sesion_id=v_s.id AND r.tipo_movimiento=m.tipo AND r.movimiento_id=m.id;
    SELECT d.monto,d.monto_contado,d.estado_aprobacion,d.declarado_at,d.contado_at
      INTO v_cash_declared,v_cash_counted,v_cash_state,v_cash_declared_at,v_cash_counted_at
    FROM public.turno_declaraciones d
    WHERE d.turno_sesion_id=v_s.id
    ORDER BY d.declarado_at DESC NULLS LAST LIMIT 1;
    v_liq:=coalesce(v_liq,'{}'::jsonb) || jsonb_build_object(
      'lineas',coalesce(v_lines,'[]'::jsonb),
      'costos_con_cobertura',coalesce(v_cost_covered,0),
      'costos_sin_cobertura',greatest(0,coalesce(v_cost_total,0)-coalesce(v_cost_covered,0)),
      'familias_total_costo',coalesce(v_cost_total,0),
      'ganancia_bruta_parcial',(
        SELECT sum((x.value->>'ganancia_bruta_estimada')::numeric)
        FROM jsonb_array_elements(coalesce(v_lines,'[]'::jsonb)) x(value)
        WHERE x.value->>'ganancia_bruta_estimada' IS NOT NULL
      ),
      'movimientos_posteriores_corte',coalesce(v_post,'[]'::jsonb),
      'movimientos_posteriores_pendientes',coalesce(v_pending_post,0),
      'ganancia_bruta_es_total',coalesce(v_cost_covered,0)=coalesce(v_cost_total,0)
        AND coalesce((v_liq->>'familias_sin_precio')::integer,0)=0
        AND coalesce((v_liq->>'familias_con_vendidas_negativas')::integer,0)=0
    );
    v_sessions:=v_sessions||jsonb_build_array(jsonb_build_object(
      'id',v_s.id,'numero_dia',v_s.numero_dia,'fecha',v_p.fecha,'fecha_fin',coalesce(v_p.fecha_fin,v_p.fecha),
      'estado',v_s.estado,'responsable_id',v_p.responsable_id,
      'hora_inicio',v_p.hora_inicio_prevista,'hora_fin',v_p.hora_fin_prevista,
      'salario_porcentaje',v_p.salario_porcentaje,
      'efectivo',CASE WHEN v_cash_state IS NULL THEN NULL ELSE jsonb_build_object(
        'declarado',v_cash_declared,'contado',v_cash_counted,'estado',v_cash_state,
        'declarado_at',v_cash_declared_at,'contado_at',v_cash_counted_at) END,
      'liquidacion',v_liq
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'turno',jsonb_build_object('id',v_turn.id,'almacen_id',v_turn.almacen_id,
      'almacen_nombre',(SELECT a.nombre FROM public.almacenes a WHERE a.id=v_turn.almacen_id),
      'fecha',v_turn.fecha,'dias_turno',v_turn.dias_turno,
      'estado',v_turn.estado,'estado_maestro',v_turn.estado_maestro,
      'creado_en',v_turn.creado_en,'observacion',v_turn.observacion),
    'revision',CASE WHEN v_revision.id IS NULL THEN NULL ELSE jsonb_build_object(
      'estado',v_revision.estado,'comentario',v_revision.comentario,
      'revisado_at',v_revision.revisado_at) END,
    'sesiones',v_sessions
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_obtener_revision_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_obtener_revision_jornada(uuid) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.bc7_resolver_revision_jornada(
  p_turno_id uuid,p_decision text,p_comentario text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_turn public.turnos;
  v_s public.turno_sesiones;
  v_liq jsonb;
  v_pending integer;
  v_revision public.turno_revisiones;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo el Dueño/Admin puede resolver la revisión del Turno.' USING ERRCODE='42501';
  END IF;
  IF upper(coalesce(p_decision,'')) NOT IN ('APROBAR','RECHAZAR') THEN
    RAISE EXCEPTION 'La decisión debe ser APROBAR o RECHAZAR.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_turn FROM public.turnos WHERE id=p_turno_id AND dias_turno IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado.' USING ERRCODE='23503'; END IF;
  IF coalesce(v_turn.estado_maestro,v_turn.estado) IN ('CERRADO','CANCELADO') THEN
    RAISE EXCEPTION 'El Turno ya está cerrado o cancelado.' USING ERRCODE='23514';
  END IF;
  IF upper(p_decision)='RECHAZAR' THEN
    IF length(trim(coalesce(p_comentario,'')))=0 THEN
      RAISE EXCEPTION 'Escribe el motivo de la corrección solicitada.' USING ERRCODE='22023';
    END IF;
    UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',actualizado_en=now()
      WHERE id=v_turn.id;
    INSERT INTO public.turno_revisiones(turno_id,estado,revisado_por,revisado_at,comentario)
    VALUES(v_turn.id,'PENDIENTE',NULL,NULL,trim(p_comentario))
    ON CONFLICT(turno_id) DO UPDATE SET estado='PENDIENTE',revisado_por=NULL,revisado_at=NULL,
      comentario=EXCLUDED.comentario;
    INSERT INTO public.turno_eventos(turno_id,actor_user_id,tipo,payload)
    VALUES(v_turn.id,auth.uid(),'JORNADA_REVISION_RECHAZADA',
      jsonb_build_object('motivo',trim(p_comentario),'accion','CORRECCION_SOLICITADA'));
    RETURN jsonb_build_object('ok',true,'estado','EN_CURSO','decision','CORRECCION_SOLICITADA');
  END IF;
  FOR v_s IN SELECT * FROM public.turno_sesiones WHERE turno_id=v_turn.id AND bloque='JORNADA'
  LOOP
    IF v_s.estado NOT IN ('COMPLETADA','CANCELADA') THEN
      RAISE EXCEPTION 'La sesión del día % todavía no está completada.' ,v_s.numero_dia USING ERRCODE='23514';
    END IF;
    IF v_s.estado='COMPLETADA' THEN
      SELECT count(*) INTO v_pending
      FROM (
        SELECT b.id FROM public.bajas b
        JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
        WHERE b.turno_sesion_id=v_s.id AND b.estado='APROBADA' AND b.creado_en>c.confirmado_en
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='BAJA' AND mr.movimiento_id=b.id)
        UNION ALL
        SELECT m.id FROM public.mermas m
        JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=v_s.id AND c.tipo='FINAL'
        WHERE m.turno_sesion_id=v_s.id AND m.estado='APROBADA' AND m.creado_en>c.confirmado_en
          AND NOT EXISTS(SELECT 1 FROM public.turno_jornada_movimiento_revision mr
            WHERE mr.turno_sesion_id=v_s.id AND mr.tipo_movimiento='MERMA' AND mr.movimiento_id=m.id)
      ) pending;
      IF v_pending>0 THEN
        RAISE EXCEPTION 'Hay % bajas/mermas aprobadas después del inventario final sin clasificar. Revisa cuándo ocurrieron antes de aprobar.',v_pending USING ERRCODE='23514';
      END IF;
      v_liq:=public.bc7_liquidacion_inventario_jornada(v_s.id);
      IF coalesce((v_liq->>'calculable')::boolean,false) IS NOT TRUE THEN
        RAISE EXCEPTION 'La liquidación del día % no está completa. Revisa precios, movimientos, inventario, salario y efectivo. Detalle: %',
          v_s.numero_dia,v_liq USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  IF coalesce(v_turn.estado_maestro,v_turn.estado)='EN_CURSO' THEN
    PERFORM public.bc_enviar_turno_a_aprobacion(v_turn.id);
  END IF;
  PERFORM public.bc_aprobar_turno(v_turn.id,nullif(trim(p_comentario),''));
  RETURN jsonb_build_object('ok',true,'estado','CERRADO','decision','APROBADO');
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_resolver_revision_jornada(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_resolver_revision_jornada(uuid,text,text) TO authenticated,service_role;


COMMIT;
