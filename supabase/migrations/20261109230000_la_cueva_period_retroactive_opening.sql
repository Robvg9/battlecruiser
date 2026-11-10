BEGIN;

-- A Jornada is a period, not one session per calendar day.
ALTER TABLE public.turno_jornada_programacion
  ADD COLUMN IF NOT EXISTS fecha_fin date;

UPDATE public.turno_jornada_programacion
SET fecha_fin = fecha
WHERE fecha_fin IS NULL;

ALTER TABLE public.turno_jornada_programacion
  ALTER COLUMN fecha_fin SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.turno_jornada_programacion'::regclass
      AND conname='turno_jornada_programacion_rango_fechas_chk'
  ) THEN
    ALTER TABLE public.turno_jornada_programacion
      ADD CONSTRAINT turno_jornada_programacion_rango_fechas_chk
      CHECK (fecha_fin >= fecha);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.turno_jornada_entradas_vinculadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  transferencia_id uuid NOT NULL REFERENCES public.transferencias(id) ON DELETE RESTRICT,
  vinculado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  vinculado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_entrada_transferencia_unica UNIQUE (transferencia_id),
  CONSTRAINT turno_jornada_entrada_sesion_transferencia_unica UNIQUE (turno_sesion_id, transferencia_id)
);

REVOKE ALL ON TABLE public.turno_jornada_entradas_vinculadas FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bc7_admin_abrir_jornada_existente(
  p_almacen_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_inicio_real_at timestamptz,
  p_responsable_id uuid,
  p_lineas jsonb,
  p_transferencias_ids uuid[] DEFAULT '{}'::uuid[],
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cfg public.turno_jornada_configuracion;
  v_turno public.turnos;
  v_programacion public.turno_jornada_programacion;
  v_sesion public.turno_sesiones;
  v_corte_id uuid;
  v_tramo public.turno_tramos;
  v_expected integer;
  v_count integer;
  v_distinct integer;
  v_days integer;
  v_local timestamp without time zone;
  v_timezone text := 'America/Havana';
  v_hour_start time := time '07:00';
  v_hour_end time := time '23:00';
  v_ids uuid[] := coalesce(p_transferencias_ids,'{}'::uuid[]);
BEGIN
  IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede registrar una jornada ya iniciada.'
      USING ERRCODE='42501';
  END IF;
  IF p_almacen_id IS NULL OR p_fecha_inicio IS NULL OR p_fecha_fin IS NULL
     OR p_fecha_fin < p_fecha_inicio OR p_fecha_fin-p_fecha_inicio > 30 THEN
    RAISE EXCEPTION 'El período debe abarcar entre 1 y 31 días.'
      USING ERRCODE='22023';
  END IF;
  IF p_inicio_real_at IS NULL OR p_inicio_real_at > now() THEN
    RAISE EXCEPTION 'La fecha y hora real de inicio son obligatorias y no pueden estar en el futuro.'
      USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'Debes importar el inventario inicial completo.'
      USING ERRCODE='22023';
  END IF;
  IF NULLIF(btrim(coalesce(p_observacion,'')),'') IS NOT NULL AND length(p_observacion)>1000 THEN
    RAISE EXCEPTION 'La observación no puede superar 1000 caracteres.'
      USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id=p_almacen_id AND activo=true) THEN
    RAISE EXCEPTION 'El almacén no existe o está inactivo.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc5_jornada_responsable_elegible(p_responsable_id) THEN
    RAISE EXCEPTION 'La responsable debe estar activa y tener rol Dependienta o Dueño.'
      USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('bc7-period-warehouse:'||p_almacen_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('bc7-period-responsible:'||p_responsable_id::text,0));

  SELECT * INTO v_cfg
  FROM public.turno_jornada_configuracion
  WHERE almacen_id=p_almacen_id;
  IF FOUND THEN
    v_timezone := coalesce(nullif(v_cfg.zona_horaria,''),'America/Havana');
    v_hour_start := v_cfg.hora_inicio;
    v_hour_end := v_cfg.hora_fin;
  END IF;
  v_local := p_inicio_real_at AT TIME ZONE v_timezone;
  IF v_local::date <> p_fecha_inicio THEN
    RAISE EXCEPTION 'El inicio real debe pertenecer a la fecha inicial del período.'
      USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.turnos t
    WHERE t.almacen_id=p_almacen_id
      AND t.dias_turno IS NOT NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'El almacén ya tiene un turno activo o pendiente.'
      USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.almacen_id=p_almacen_id
      AND p.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND p.estado IN ('PROGRAMADA','DESCANSO')
  ) THEN
    RAISE EXCEPTION 'Ya existe programación para el almacén dentro del período.'
      USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.turno_jornada_programacion p
    WHERE p.responsable_id=p_responsable_id
      AND p.trabaja=true AND p.estado='PROGRAMADA'
      AND p.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
  ) OR EXISTS (
    SELECT 1
    FROM public.turno_sesiones s
    JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
    JOIN public.turnos t ON t.id=s.turno_id
    WHERE s.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND s.estado NOT IN ('COMPLETADA','CANCELADA')
      AND a.usuario_id=p_responsable_id AND a.retirado_at IS NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) THEN
    RAISE EXCEPTION 'Sheyla/la responsable tiene otra jornada asignada dentro de esas fechas.'
      USING ERRCODE='23505';
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.stock s
  JOIN public.productos p ON p.id=s.producto_id
  WHERE s.almacen_id=p_almacen_id AND p.activo=true;

  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
  INTO v_count,v_distinct
  FROM jsonb_array_elements(p_lineas) AS x(value);

  IF v_expected=0 OR v_count<>v_expected OR v_distinct<>v_count THEN
    RAISE EXCEPTION 'El inventario debe contener exactamente una línea por producto activo con stock (% esperado; % recibidos).',
      v_expected,v_count USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lineas) AS x(value)
    LEFT JOIN public.productos p
      ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
    WHERE jsonb_typeof(x.value)<>'object'
       OR p.id IS NULL
       OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
       OR NOT EXISTS (
         SELECT 1 FROM public.stock s
         WHERE s.almacen_id=p_almacen_id AND s.producto_id=p.id
       )
  ) THEN
    RAISE EXCEPTION 'El archivo contiene productos no reconocidos, repetidos o cantidades inválidas.'
      USING ERRCODE='22023';
  END IF;

  IF cardinality(v_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN
    RAISE EXCEPTION 'La selección contiene transferencias duplicadas.' USING ERRCODE='22023';
  END IF;
  IF cardinality(v_ids)>0 AND (
    SELECT count(*) FROM public.transferencias t
    WHERE t.id=ANY(v_ids)
      AND t.estado='completada'
      AND t.almacen_destino_id=p_almacen_id
      AND t.fecha>p_inicio_real_at
      AND (t.fecha AT TIME ZONE v_timezone)::date BETWEEN p_fecha_inicio AND p_fecha_fin
  ) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Cada entrada debe ser una transferencia completada hacia este almacén y posterior al inventario inicial.'
      USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_entradas_vinculadas
    WHERE transferencia_id=ANY(v_ids)
  ) THEN
    RAISE EXCEPTION 'Una o más transferencias ya están vinculadas a otra jornada.'
      USING ERRCODE='23505';
  END IF;

  v_days := (p_fecha_fin-p_fecha_inicio)+1;

  INSERT INTO public.turnos
    (usuario_id,usuario_nombre,almacen_id,fecha,estado,apertura_real,creado_por,created_by,estado_maestro,dias_turno)
  VALUES
    (v_uid,NULL,p_almacen_id,p_fecha_inicio,'PROGRAMADO',p_inicio_real_at,v_uid,v_uid,'PROGRAMADO',v_days)
  RETURNING * INTO v_turno;

  INSERT INTO public.turno_jornada_programacion
    (turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,
     hora_inicio_prevista,hora_fin_prevista,zona_horaria,patron_id,estado,motivo_ajuste,
     creado_por,actualizado_por)
  VALUES
    (v_turno.id,p_almacen_id,1,p_fecha_inicio,p_fecha_fin,true,p_responsable_id,
     v_hour_start,v_hour_end,v_timezone,NULL,'PROGRAMADA',
     coalesce(nullif(btrim(p_observacion),''),'Registro administrativo de jornada ya iniciada.'),
     v_uid,v_uid)
  RETURNING * INTO v_programacion;

  INSERT INTO public.turno_sesiones
    (turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id)
  VALUES
    (v_turno.id,p_almacen_id,1,'JORNADA',p_fecha_inicio,'PROGRAMADA',v_programacion.id)
  RETURNING * INTO v_sesion;

  INSERT INTO public.turno_asignaciones
    (turno_sesion_id,turno_id,usuario_id,asignado_por,motivo)
  VALUES (v_sesion.id,v_turno.id,p_responsable_id,v_uid,'Responsable de jornada ya iniciada.');

  INSERT INTO public.turno_jornada_inventario_cortes
    (turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion,origen_corte_id)
  VALUES
    (v_sesion.id,'INICIAL','CONFIRMADO',v_uid,v_uid,
     coalesce(nullif(btrim(p_observacion),''),'Inventario inicial importado desde el cierre físico de la jornada anterior.'),
     NULL)
  RETURNING id INTO v_corte_id;

  INSERT INTO public.turno_jornada_inventario_lineas
    (corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_corte_id,(x.value->>'producto_id')::uuid,(x.value->>'cantidad')::numeric,s.cantidad
  FROM jsonb_array_elements(p_lineas) AS x(value)
  JOIN public.stock s
    ON s.almacen_id=p_almacen_id AND s.producto_id=(x.value->>'producto_id')::uuid;

  INSERT INTO public.turno_tramos
    (turno_sesion_id,turno_id,usuario_id,tipo,estado,inicio_at)
  VALUES (v_sesion.id,v_turno.id,p_responsable_id,'NORMAL','ACTIVO',p_inicio_real_at)
  RETURNING * INTO v_tramo;

  UPDATE public.turno_sesiones
  SET estado='EN_CURSO',updated_at=now()
  WHERE id=v_sesion.id;

  UPDATE public.turnos
  SET estado='ABIERTO',estado_maestro='EN_CURSO',apertura_real=p_inicio_real_at,actualizado_en=now()
  WHERE id=v_turno.id;

  INSERT INTO public.turno_jornada_entradas_vinculadas
    (turno_sesion_id,transferencia_id,vinculado_por)
  SELECT v_sesion.id,x,v_uid FROM unnest(v_ids) x;

  INSERT INTO public.turno_eventos
    (turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES
    (v_turno.id,v_sesion.id,v_tramo.id,v_uid,'JORNADA_RETROACTIVA_REGISTRADA',
     jsonb_build_object('fecha_inicio',p_fecha_inicio,'fecha_fin',p_fecha_fin,
       'inicio_real_at',p_inicio_real_at,'responsable_id',p_responsable_id,
       'corte_inicial_id',v_corte_id,'transferencias_vinculadas',to_jsonb(v_ids),
       'stock_global_modificado',false));

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES
    (p_almacen_id,v_programacion.id,v_uid,'JORNADA_RETROACTIVA_REGISTRADA',
     nullif(btrim(p_observacion),''),
     jsonb_build_object('estado','NO_REGISTRADA'),
     jsonb_build_object('sesion_id',v_sesion.id,'tramo_id',v_tramo.id,
       'fecha_inicio',p_fecha_inicio,'fecha_fin',p_fecha_fin,
       'responsable_id',p_responsable_id,'corte_inicial_id',v_corte_id));

  RETURN jsonb_build_object(
    'turno_id',v_turno.id,'sesion_id',v_sesion.id,'tramo_id',v_tramo.id,
    'programacion_id',v_programacion.id,'corte_inicial_id',v_corte_id,
    'fecha_inicio',p_fecha_inicio,'fecha_fin',p_fecha_fin,'dias',v_days,
    'responsable_id',p_responsable_id,'transferencias_vinculadas',to_jsonb(v_ids),
    'estado','EN_CURSO','stock_global_modificado',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_admin_abrir_jornada_existente(uuid,date,date,timestamptz,uuid,jsonb,uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_admin_abrir_jornada_existente(uuid,date,date,timestamptz,uuid,jsonb,uuid[],text) TO authenticated;

-- A period closes on its final date, not on the first date stored in the legacy session row.
CREATE OR REPLACE FUNCTION public.bc5_cerrar_jornada(
  p_turno_sesion_id uuid,
  p_motivo_excepcion text DEFAULT NULL
)
RETURNS public.turno_sesiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_sesion public.turno_sesiones;
  v_programacion public.turno_jornada_programacion;
  v_local timestamp without time zone;
  v_ahora_minuto time;
  v_fecha_fin date;
  v_result public.turno_sesiones;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_sesion FROM public.turno_sesiones
  WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.bloque<>'JORNADA' OR v_sesion.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'No es una sesión de jornada única válida.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_programacion FROM public.turno_jornada_programacion
  WHERE id=v_sesion.jornada_programacion_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programación de jornada no encontrada.' USING ERRCODE='23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.turno_asignaciones a
    WHERE a.turno_sesion_id=v_sesion.id
      AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede cerrar esta jornada.' USING ERRCODE='42501';
  END IF;
  IF v_sesion.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'La jornada no está en curso.' USING ERRCODE='23514';
  END IF;

  v_fecha_fin := coalesce(v_programacion.fecha_fin,v_programacion.fecha);
  v_local := now() AT TIME ZONE v_programacion.zona_horaria;
  v_ahora_minuto := date_trunc('minute',v_local)::time;

  IF (v_local::date<>v_fecha_fin OR v_ahora_minuto<>v_programacion.hora_fin_prevista)
     AND trim(coalesce(p_motivo_excepcion,''))='' THEN
    RAISE EXCEPTION 'Cierre anticipado o tardío: debe registrar un motivo antes de cerrar.'
      USING ERRCODE='23514';
  END IF;

  v_result := public.bc_cerrar_turno_sesion(p_turno_sesion_id);

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES (
    v_sesion.turno_id,v_sesion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista
      THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    jsonb_build_object('fecha_fin_programada',v_fecha_fin,
      'hora_programada',v_programacion.hora_fin_prevista,
      'hora_real',v_ahora_minuto,'fecha_real',v_local::date,
      'zona_horaria',v_programacion.zona_horaria,
      'motivo',nullif(trim(p_motivo_excepcion),''))
  );

  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (
    v_programacion.almacen_id,v_programacion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista
      THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    nullif(trim(p_motivo_excepcion),''),
    jsonb_build_object('estado_sesion',v_sesion.estado),
    jsonb_build_object('estado_sesion',v_result.estado,'fecha_real',v_local::date,
      'fecha_fin_programada',v_fecha_fin,'hora_real',v_ahora_minuto)
  );
  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bc5_cerrar_jornada(uuid,text) TO authenticated;

COMMIT;
