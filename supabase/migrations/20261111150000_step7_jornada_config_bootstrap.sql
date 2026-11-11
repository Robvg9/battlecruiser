BEGIN;

-- Backfill only missing store configuration rows for already-open sessions.
-- The hours/time zone are copied from the exact current jornada programming row;
-- existing rows are untouched and salary_porcentaje is deliberately not supplied.
INSERT INTO public.turno_jornada_configuracion
  (almacen_id,hora_inicio,hora_fin,zona_horaria)
SELECT DISTINCT ON (s.almacen_id)
  s.almacen_id,
  p.hora_inicio_prevista,
  p.hora_fin_prevista,
  coalesce(nullif(p.zona_horaria,''),'America/Havana')
FROM public.turno_sesiones s
JOIN public.turno_jornada_programacion p ON p.id=s.jornada_programacion_id
WHERE s.estado='EN_CURSO'
  AND p.trabaja=true
  AND p.hora_inicio_prevista IS NOT NULL
  AND p.hora_fin_prevista IS NOT NULL
  AND p.hora_inicio_prevista < p.hora_fin_prevista
  AND NOT EXISTS (
    SELECT 1 FROM public.turno_jornada_configuracion c
    WHERE c.almacen_id=s.almacen_id
  )
ORDER BY s.almacen_id,p.fecha DESC,s.id DESC
ON CONFLICT (almacen_id) DO NOTHING;


-- Repair the retroactive-open path and the explicit owner salary-rate path.
-- No session state, inventory snapshot, transfer reference, cash declaration
-- or saved salary percentage is rewritten.

CREATE OR REPLACE FUNCTION public.bc7_admin_abrir_jornada_existente(
  p_almacen_id uuid,p_fecha_inicio date,p_fecha_fin date,p_inicio_real_at timestamptz,
  p_responsable_id uuid,p_lineas jsonb,p_transferencias_ids uuid[] DEFAULT '{}'::uuid[],p_observacion text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_cfg public.turno_jornada_configuracion;
  v_turno public.turnos; v_programacion public.turno_jornada_programacion;
  v_sesion public.turno_sesiones; v_corte_id uuid; v_tramo public.turno_tramos;
  v_expected integer; v_count integer; v_distinct integer; v_days integer;
  v_local timestamp without time zone; v_timezone text:='America/Havana';
  v_hour_start time:='07:00'; v_hour_end time:='23:00';
  v_ids uuid[]:=coalesce(p_transferencias_ids,'{}'::uuid[]);
  v_agrupar boolean:=false;
BEGIN
  IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede registrar una jornada ya iniciada.' USING ERRCODE='42501';
  END IF;
  IF p_almacen_id IS NULL OR p_fecha_inicio IS NULL OR p_fecha_fin IS NULL
     OR p_fecha_fin<p_fecha_inicio OR p_fecha_fin-p_fecha_inicio>30 THEN
    RAISE EXCEPTION 'El período debe abarcar entre 1 y 31 días.' USING ERRCODE='22023';
  END IF;
  IF p_inicio_real_at IS NULL OR p_inicio_real_at>now() THEN
    RAISE EXCEPTION 'La fecha y hora real de inicio son obligatorias y no pueden estar en el futuro.' USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN
    RAISE EXCEPTION 'Debes importar el inventario inicial completo.' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_observacion,''))>1000 THEN
    RAISE EXCEPTION 'La observación no puede superar 1000 caracteres.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.almacenes WHERE id=p_almacen_id AND activo=true) THEN
    RAISE EXCEPTION 'El almacén no existe o está inactivo.' USING ERRCODE='23503';
  END IF;
  SELECT (a.tipo='minorista') INTO v_agrupar
  FROM public.almacenes a WHERE a.id=p_almacen_id;
  IF NOT public.bc5_jornada_responsable_elegible(p_responsable_id) THEN
    RAISE EXCEPTION 'La responsable debe estar activa y tener rol Dependienta o Dueño.' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('bc7-period-warehouse:'||p_almacen_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('bc7-period-responsible:'||p_responsable_id::text,0));

  -- Retroactive opening must provision the store schedule row before the
  -- programming snapshot is created. Defaults remain 07:00–23:00 / Havana,
  -- and salario_porcentaje remains NULL until the Dueño explicitly sets it.
  INSERT INTO public.turno_jornada_configuracion (almacen_id)
  VALUES (p_almacen_id) ON CONFLICT (almacen_id) DO NOTHING;
  SELECT * INTO v_cfg FROM public.turno_jornada_configuracion
  WHERE almacen_id=p_almacen_id FOR UPDATE;
  IF FOUND THEN
    v_timezone:=coalesce(nullif(v_cfg.zona_horaria,''),'America/Havana');
    v_hour_start:=v_cfg.hora_inicio; v_hour_end:=v_cfg.hora_fin;
  END IF;
  v_local:=p_inicio_real_at AT TIME ZONE v_timezone;
  IF v_local::date<>p_fecha_inicio THEN
    RAISE EXCEPTION 'El inicio real debe pertenecer a la fecha inicial del período.' USING ERRCODE='22023';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.turnos t
    WHERE t.almacen_id=p_almacen_id AND t.dias_turno IS NOT NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) THEN RAISE EXCEPTION 'El almacén ya tiene un turno activo o pendiente.' USING ERRCODE='23505'; END IF;

  IF EXISTS(
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.almacen_id=p_almacen_id AND p.fecha<=p_fecha_fin
      AND coalesce(p.fecha_fin,p.fecha)>=p_fecha_inicio AND p.estado IN ('PROGRAMADA','DESCANSO')
  ) THEN RAISE EXCEPTION 'Ya existe programación del almacén dentro del período.' USING ERRCODE='23505'; END IF;

  IF EXISTS(
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.responsable_id=p_responsable_id AND p.trabaja=true AND p.estado='PROGRAMADA'
      AND p.fecha<=p_fecha_fin AND coalesce(p.fecha_fin,p.fecha)>=p_fecha_inicio
  ) OR EXISTS(
    SELECT 1 FROM public.turno_sesiones s
    JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
    JOIN public.turnos t ON t.id=s.turno_id
    WHERE s.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND s.estado NOT IN ('COMPLETADA','CANCELADA')
      AND a.usuario_id=p_responsable_id AND a.retirado_at IS NULL
      AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
  ) OR EXISTS(
    SELECT 1 FROM public.turno_tramos tr WHERE tr.usuario_id=p_responsable_id AND tr.estado='ACTIVO'
  ) THEN RAISE EXCEPTION 'La responsable tiene otra jornada o tramo operativo activo dentro del período.' USING ERRCODE='23505'; END IF;

  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
  INTO v_count,v_distinct FROM jsonb_array_elements(p_lineas) x(value);
  IF v_agrupar THEN
    SELECT count(*) INTO v_expected FROM public.productos p
    WHERE p.activo=true AND p.producto_padre_id IS NULL;
    IF v_expected=0 OR v_count<>v_expected OR v_distinct<>v_count THEN
      RAISE EXCEPTION 'El inventario agrupado debe incluir una línea por producto o familia activa (% esperadas; % recibidas).',v_expected,v_count
        USING ERRCODE='22023';
    END IF;
    IF EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
      LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
      WHERE jsonb_typeof(x.value)<>'object' OR p.id IS NULL OR p.producto_padre_id IS NOT NULL
        OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
    ) THEN RAISE EXCEPTION 'El archivo contiene productos/familias no reconocidos o cantidades inválidas.' USING ERRCODE='22023'; END IF;
  ELSE
    SELECT count(*) INTO v_expected
    FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
    WHERE s.almacen_id=p_almacen_id AND p.activo=true;
    IF v_expected=0 OR v_count<>v_expected OR v_distinct<>v_count THEN
      RAISE EXCEPTION 'El inventario debe contener exactamente una línea por SKU activo con stock (% esperado; % recibidos).',v_expected,v_count
        USING ERRCODE='22023';
    END IF;
    IF EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
      LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
      WHERE jsonb_typeof(x.value)<>'object' OR p.id IS NULL
        OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
        OR NOT EXISTS(SELECT 1 FROM public.stock s WHERE s.almacen_id=p_almacen_id AND s.producto_id=p.id)
    ) THEN RAISE EXCEPTION 'El archivo contiene productos no reconocidos o cantidades inválidas.' USING ERRCODE='22023'; END IF;
  END IF;

  IF cardinality(v_ids)<>(SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN
    RAISE EXCEPTION 'La selección contiene transferencias duplicadas.' USING ERRCODE='22023';
  END IF;
  IF cardinality(v_ids)>0 AND (
    SELECT count(*) FROM public.transferencias t
    WHERE t.id=ANY(v_ids) AND t.estado='completada' AND t.almacen_destino_id=p_almacen_id
      AND t.fecha>p_inicio_real_at
      AND (t.fecha AT TIME ZONE v_timezone)::date BETWEEN p_fecha_inicio AND p_fecha_fin
  )<>cardinality(v_ids) THEN
    RAISE EXCEPTION 'Cada entrada debe ser una transferencia completada hacia este almacén y posterior al inventario inicial.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.turno_jornada_entradas_vinculadas WHERE transferencia_id=ANY(v_ids)) THEN
    RAISE EXCEPTION 'Una o más transferencias ya están vinculadas a otra jornada.' USING ERRCODE='23505';
  END IF;

  v_days:=(p_fecha_fin-p_fecha_inicio)+1;
  INSERT INTO public.turnos(usuario_id,usuario_nombre,almacen_id,fecha,estado,apertura_real,creado_por,created_by,estado_maestro,dias_turno)
  VALUES(v_uid,NULL,p_almacen_id,p_fecha_inicio,'PROGRAMADO',p_inicio_real_at,v_uid,v_uid,'PROGRAMADO',v_days)
  RETURNING * INTO v_turno;

  INSERT INTO public.turno_jornada_programacion
    (turno_id,almacen_id,numero_dia,fecha,fecha_fin,trabaja,responsable_id,hora_inicio_prevista,
     hora_fin_prevista,zona_horaria,patron_id,estado,motivo_ajuste,creado_por,actualizado_por,salario_porcentaje)
  VALUES(v_turno.id,p_almacen_id,1,p_fecha_inicio,p_fecha_fin,true,p_responsable_id,
    v_hour_start,v_hour_end,v_timezone,NULL,'PROGRAMADA',
    coalesce(nullif(btrim(p_observacion),''),'Registro administrativo de jornada ya iniciada.'),v_uid,v_uid,v_cfg.salario_porcentaje)
  RETURNING * INTO v_programacion;

  INSERT INTO public.turno_sesiones(turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id)
  VALUES(v_turno.id,p_almacen_id,1,'JORNADA',p_fecha_inicio,'PROGRAMADA',v_programacion.id)
  RETURNING * INTO v_sesion;

  INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por,motivo)
  VALUES(v_sesion.id,v_turno.id,p_responsable_id,v_uid,'Responsable de jornada ya iniciada.');

  IF EXISTS(
    SELECT 1 FROM public.stock s
    WHERE s.almacen_id=p_almacen_id
      AND s.cantidad < coalesce((
        SELECT sum(tl.cantidad)
        FROM public.transferencias t
        JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
        WHERE t.id=ANY(v_ids) AND tl.producto_id=s.producto_id
      ),0)
  ) THEN
    RAISE EXCEPTION 'El stock actual no permite reconstruir el saldo anterior a las transferencias seleccionadas.' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.turno_jornada_inventario_cortes(turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion,origen_corte_id)
  VALUES(v_sesion.id,'INICIAL','CONFIRMADO',v_uid,v_uid,
    coalesce(nullif(btrim(p_observacion),''),'Inventario inicial importado desde el cierre físico de la jornada anterior.'),NULL)
  RETURNING id INTO v_corte_id;

  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_corte_id,p.id,(x.value->>'cantidad')::numeric,
    CASE WHEN v_agrupar THEN coalesce((
      SELECT sum(s.cantidad)
      FROM public.stock s JOIN public.productos sp ON sp.id=s.producto_id
      WHERE s.almacen_id=p_almacen_id AND (sp.id=p.id OR sp.producto_padre_id=p.id)
    ),0)-coalesce((
      SELECT sum(tl.cantidad)
      FROM public.transferencias t
      JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
      JOIN public.productos tp ON tp.id=tl.producto_id
      WHERE t.id=ANY(v_ids) AND (tp.id=p.id OR tp.producto_padre_id=p.id)
    ),0)
    ELSE s.cantidad-coalesce((
      SELECT sum(tl.cantidad)
      FROM public.transferencias t
      JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
      WHERE t.id=ANY(v_ids) AND tl.producto_id=s.producto_id
    ),0) END
  FROM jsonb_array_elements(p_lineas) x(value)
  JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid
  LEFT JOIN public.stock s ON s.almacen_id=p_almacen_id AND s.producto_id=p.id;

  INSERT INTO public.turno_tramos(turno_sesion_id,turno_id,usuario_id,tipo,estado,inicio_at)
  VALUES(v_sesion.id,v_turno.id,p_responsable_id,'NORMAL','ACTIVO',p_inicio_real_at)
  RETURNING * INTO v_tramo;

  UPDATE public.turno_sesiones SET estado='EN_CURSO',updated_at=now(),apertura_retroactiva=true WHERE id=v_sesion.id;
  UPDATE public.turnos SET estado='ABIERTO',estado_maestro='EN_CURSO',apertura_real=p_inicio_real_at,actualizado_en=now() WHERE id=v_turno.id;

  INSERT INTO public.turno_jornada_entradas_vinculadas(turno_sesion_id,transferencia_id,vinculado_por)
  SELECT v_sesion.id,x,v_uid FROM unnest(v_ids) x;

  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,turno_tramo_id,actor_user_id,tipo,payload)
  VALUES(v_turno.id,v_sesion.id,v_tramo.id,v_uid,'JORNADA_RETROACTIVA_REGISTRADA',
    jsonb_build_object('fecha_inicio',p_fecha_inicio,'fecha_fin',p_fecha_fin,'inicio_real_at',p_inicio_real_at,
      'responsable_id',p_responsable_id,'corte_inicial_id',v_corte_id,'transferencias_vinculadas',to_jsonb(v_ids),
      'stock_global_modificado',false,'stock_sistema_reconstruido_descontando_entradas_vinculadas',true));

  INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(p_almacen_id,v_programacion.id,v_uid,'JORNADA_RETROACTIVA_REGISTRADA',nullif(btrim(p_observacion),''),
    jsonb_build_object('estado','NO_REGISTRADA'),
    jsonb_build_object('sesion_id',v_sesion.id,'tramo_id',v_tramo.id,'fecha_inicio',p_fecha_inicio,
      'fecha_fin',p_fecha_fin,'responsable_id',p_responsable_id,'corte_inicial_id',v_corte_id));

  RETURN jsonb_build_object('turno_id',v_turno.id,'sesion_id',v_sesion.id,'tramo_id',v_tramo.id,
    'programacion_id',v_programacion.id,'corte_inicial_id',v_corte_id,'fecha_inicio',p_fecha_inicio,
    'fecha_fin',p_fecha_fin,'dias',v_days,'responsable_id',p_responsable_id,
    'transferencias_vinculadas',to_jsonb(v_ids),'estado','EN_CURSO','stock_global_modificado',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_admin_abrir_jornada_existente(uuid,date,date,timestamptz,uuid,jsonb,uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_admin_abrir_jornada_existente(uuid,date,date,timestamptz,uuid,jsonb,uuid[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_configurar_salario_porcentaje_jornada(
  p_turno_sesion_id uuid,p_porcentaje numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_old numeric;
  v_store_old numeric;
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
  IF v_s.estado IN ('COMPLETADA','CERRADA','CANCELADA') THEN
    RAISE EXCEPTION 'No se puede cambiar el porcentaje de una jornada cerrada o cancelada.' USING ERRCODE='23514';
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
  UPDATE public.turno_jornada_configuracion
  SET salario_porcentaje=p_porcentaje,
      salario_porcentaje_actualizado_por=auth.uid(),
      salario_porcentaje_actualizado_en=now(),
      actualizado_por=auth.uid(),
      actualizado_en=now()
  WHERE almacen_id=v_s.almacen_id;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_s.almacen_id,v_p.id,auth.uid(),'SALARIO_PORCENTAJE_CONFIGURADO',
    'Se fijó el porcentaje salarial de esta jornada; el valor queda congelado al cerrarla.',
    jsonb_build_object('salario_porcentaje_jornada',v_old,'salario_porcentaje_predeterminado',v_store_old),
    jsonb_build_object('salario_porcentaje_jornada',p_porcentaje,'salario_porcentaje_predeterminado',p_porcentaje));
  RETURN jsonb_build_object('ok',true,'turno_sesion_id',v_s.id,'salario_porcentaje',p_porcentaje);
END;
$function$;

REVOKE ALL ON FUNCTION public.bc7_configurar_salario_porcentaje_jornada(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_configurar_salario_porcentaje_jornada(uuid,numeric) TO authenticated;

COMMIT;
