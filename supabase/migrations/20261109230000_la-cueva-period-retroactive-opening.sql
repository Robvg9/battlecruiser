BEGIN;

ALTER TABLE public.turno_jornada_programacion ADD COLUMN IF NOT EXISTS fecha_fin date;
UPDATE public.turno_jornada_programacion SET fecha_fin=fecha WHERE fecha_fin IS NULL;

CREATE OR REPLACE FUNCTION public.bc5_guard_jornada_assignment_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_fin date:=coalesce(NEW.fecha_fin,NEW.fecha);
  v_dia date;
BEGIN
  IF NEW.estado='PROGRAMADA' AND NEW.trabaja AND NEW.responsable_id IS NOT NULL THEN
    FOR v_dia IN
      SELECT dia::date FROM generate_series(NEW.fecha::timestamp,v_fin::timestamp,interval '1 day') AS dias(dia)
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('bc5-responsable:'||NEW.responsable_id::text||':'||v_dia::text,0));
      PERFORM pg_advisory_xact_lock(hashtextextended('bc5-almacen:'||NEW.almacen_id::text||':'||v_dia::text,0));
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM public.turno_jornada_programacion p
      WHERE p.id IS DISTINCT FROM NEW.id AND p.responsable_id=NEW.responsable_id
        AND p.fecha<=v_fin AND coalesce(p.fecha_fin,p.fecha)>=NEW.fecha
        AND p.estado='PROGRAMADA' AND p.trabaja
    ) THEN
      RAISE EXCEPTION 'La persona ya tiene otra jornada programada que se solapa con este período.' USING ERRCODE='23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.turno_jornada_programacion p
      WHERE p.id IS DISTINCT FROM NEW.id AND p.almacen_id=NEW.almacen_id
        AND p.fecha<=v_fin AND coalesce(p.fecha_fin,p.fecha)>=NEW.fecha
        AND p.estado='PROGRAMADA' AND p.trabaja
    ) THEN
      RAISE EXCEPTION 'El almacén ya tiene otra jornada programada que se solapa con este período.' USING ERRCODE='23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.turno_sesiones s
      JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
      JOIN public.turnos t ON t.id=s.turno_id
      WHERE s.fecha BETWEEN NEW.fecha AND v_fin
        AND s.jornada_programacion_id IS NULL
        AND s.estado NOT IN ('COMPLETADA','CANCELADA')
        AND a.usuario_id=NEW.responsable_id AND a.retirado_at IS NULL
        AND coalesce(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')
    ) THEN
      RAISE EXCEPTION 'La persona tiene una asignación legacy pendiente dentro del período; reconcíliela primero.' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc5_jornada_no_overlap ON public.turno_jornada_programacion;
CREATE TRIGGER bc5_jornada_no_overlap
BEFORE INSERT OR UPDATE OF almacen_id,fecha,fecha_fin,trabaja,responsable_id,estado
ON public.turno_jornada_programacion
FOR EACH ROW EXECUTE FUNCTION public.bc5_guard_jornada_assignment_conflicts();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.turno_jornada_programacion'::regclass AND conname='turno_jornada_programacion_rango_fechas_chk') THEN
    ALTER TABLE public.turno_jornada_programacion
      ADD CONSTRAINT turno_jornada_programacion_rango_fechas_chk
      CHECK (fecha_fin IS NULL OR fecha_fin>=fecha);
  END IF;
END $$;

-- Keep legacy one-day reinvestments approved; Jornada requests are inserted as PENDIENTE.
ALTER TABLE public.reinversiones ADD COLUMN IF NOT EXISTS estado text;
UPDATE public.reinversiones SET estado='APROBADA' WHERE estado IS NULL;
ALTER TABLE public.reinversiones ALTER COLUMN estado SET DEFAULT 'APROBADA';
ALTER TABLE public.reinversiones ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.reinversiones
  ADD COLUMN IF NOT EXISTS revisado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revisado_nombre text,
  ADD COLUMN IF NOT EXISTS comentario_revision text,
  ADD COLUMN IF NOT EXISTS fecha_revision timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reinversiones'::regclass AND conname='reinversiones_estado_chk') THEN
    ALTER TABLE public.reinversiones ADD CONSTRAINT reinversiones_estado_chk CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA'));
  END IF;
END $$;

INSERT INTO public.permisos(role_id,seccion,accion,permitido)
SELECT r.id,p.seccion,p.accion,true
FROM public.roles r
CROSS JOIN (VALUES ('turnos','ver'),('gastos','crear'),('reinversiones','crear')) AS p(seccion,accion)
WHERE lower(btrim(r.nombre)) IN ('dependienta','dependientas') AND r.activo=true
ON CONFLICT(role_id,seccion,accion) DO UPDATE SET permitido=EXCLUDED.permitido;

-- The UI and backend must accept both the singular and plural role label used in existing accounts.
CREATE OR REPLACE FUNCTION public.bc5_jornada_responsable_elegible(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.roles r ON r.id=u.role_id
    WHERE u.id=p_usuario_id AND u.activo=true
      AND r.activo=true
      AND lower(btrim(r.nombre)) IN ('dependienta','dependientas','dueño','dueno')
  );
$function$;

-- The owner is the only role allowed to approve reinvestment requests.
INSERT INTO public.permisos(role_id,seccion,accion,permitido)
SELECT r.id,'reinversiones','editar_any',true
FROM public.roles r WHERE lower(btrim(r.nombre))='dueño' AND r.activo=true
ON CONFLICT(role_id,seccion,accion) DO UPDATE SET permitido=EXCLUDED.permitido;

CREATE TABLE IF NOT EXISTS public.turno_jornada_entradas_vinculadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  transferencia_id uuid NOT NULL REFERENCES public.transferencias(id) ON DELETE RESTRICT,
  vinculado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  vinculado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_entrada_transferencia_unica UNIQUE(transferencia_id),
  CONSTRAINT turno_jornada_entrada_sesion_transferencia_unica UNIQUE(turno_sesion_id,transferencia_id)
);
REVOKE ALL ON TABLE public.turno_jornada_entradas_vinculadas FROM PUBLIC,anon,authenticated;

ALTER TABLE public.reinversiones
  ADD COLUMN IF NOT EXISTS estado text;
UPDATE public.reinversiones SET estado='APROBADA' WHERE estado IS NULL;
ALTER TABLE public.reinversiones ALTER COLUMN estado SET DEFAULT 'APROBADA';
ALTER TABLE public.reinversiones ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.reinversiones
  ADD COLUMN IF NOT EXISTS revisado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revisado_nombre text,
  ADD COLUMN IF NOT EXISTS comentario_revision text,
  ADD COLUMN IF NOT EXISTS fecha_revision timestamptz;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.reinversiones'::regclass AND conname='reinversiones_estado_chk') THEN
    ALTER TABLE public.reinversiones ADD CONSTRAINT reinversiones_estado_chk CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA'));
  END IF;
END $$;

INSERT INTO public.permisos(role_id,seccion,accion,permitido)
SELECT r.id,p.seccion,p.accion,true
FROM public.roles r
CROSS JOIN (VALUES ('turnos','ver'),('gastos','crear'),('reinversiones','crear')) AS p(seccion,accion)
WHERE lower(btrim(r.nombre))='dependienta' AND r.activo=true
ON CONFLICT(role_id,seccion,accion) DO UPDATE SET permitido=EXCLUDED.permitido;



CREATE OR REPLACE FUNCTION public.bc7_previsualizar_apertura_existente(p_almacen_id uuid,p_fecha_inicio date,p_fecha_fin date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_result jsonb; v_agrupar boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede previsualizar una apertura retroactiva.' USING ERRCODE='42501';
  END IF;
  IF p_almacen_id IS NULL OR p_fecha_inicio IS NULL OR p_fecha_fin IS NULL
     OR p_fecha_fin<p_fecha_inicio OR p_fecha_fin-p_fecha_inicio>30 THEN
    RAISE EXCEPTION 'Período inválido: debe abarcar entre 1 y 31 días.' USING ERRCODE='22023';
  END IF;
  SELECT (a.tipo='minorista') INTO v_agrupar FROM public.almacenes a
  WHERE a.id=p_almacen_id AND a.activo=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Almacén inexistente o inactivo.' USING ERRCODE='23503'; END IF;
  SELECT jsonb_build_object(
    'productos',CASE WHEN v_agrupar THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'producto_padre_id',NULL,'es_familia',EXISTS(
          SELECT 1 FROM public.productos h WHERE h.producto_padre_id=p.id AND h.activo=true
        ),
        'stock_sistema',coalesce((
          SELECT sum(s.cantidad)
          FROM public.stock s JOIN public.productos sp ON sp.id=s.producto_id
          WHERE s.almacen_id=p_almacen_id AND (sp.id=p.id OR sp.producto_padre_id=p.id)
        ),0)
      ) ORDER BY p.nombre,p.id)
      FROM public.productos p
      WHERE p.activo=true AND p.producto_padre_id IS NULL
    ),'[]'::jsonb) ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'producto_padre_id',p.producto_padre_id,'es_familia',false,'stock_sistema',s.cantidad
      ) ORDER BY p.nombre,p.id)
      FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
      WHERE s.almacen_id=p_almacen_id AND p.activo=true
    ),'[]'::jsonb) END,
    'transferencias',coalesce((
      SELECT jsonb_agg(q.item ORDER BY q.fecha)
      FROM (
        SELECT t.fecha,jsonb_build_object(
          'id',t.id,'fecha',t.fecha,'hora_local',to_char(t.fecha AT TIME ZONE 'America/Havana','HH24:MI'),
          'fecha_local',(t.fecha AT TIME ZONE 'America/Havana')::date,
          'origen',ao.nombre,'lineas',count(tl.id),'unidades',coalesce(sum(tl.cantidad),0)
        ) AS item
        FROM public.transferencias t
        JOIN public.almacenes ao ON ao.id=t.almacen_origen_id
        LEFT JOIN public.transferencias_lineas tl ON tl.transferencia_id=t.id
        WHERE t.almacen_destino_id=p_almacen_id AND t.estado='completada'
          AND (t.fecha AT TIME ZONE 'America/Havana')::date BETWEEN p_fecha_inicio AND p_fecha_fin
        GROUP BY t.id,t.fecha,ao.nombre
      ) q
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_previsualizar_apertura_existente(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_previsualizar_apertura_existente(uuid,date,date) TO authenticated;

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

  SELECT * INTO v_cfg FROM public.turno_jornada_configuracion WHERE almacen_id=p_almacen_id;
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
     hora_fin_prevista,zona_horaria,patron_id,estado,motivo_ajuste,creado_por,actualizado_por)
  VALUES(v_turno.id,p_almacen_id,1,p_fecha_inicio,p_fecha_fin,true,p_responsable_id,
    v_hour_start,v_hour_end,v_timezone,NULL,'PROGRAMADA',
    coalesce(nullif(btrim(p_observacion),''),'Registro administrativo de jornada ya iniciada.'),v_uid,v_uid)
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

  UPDATE public.turno_sesiones SET estado='EN_CURSO',updated_at=now() WHERE id=v_sesion.id;
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

CREATE OR REPLACE FUNCTION public.bc5_cerrar_jornada(p_turno_sesion_id uuid,p_motivo_excepcion text DEFAULT NULL)
RETURNS public.turno_sesiones
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_sesion public.turno_sesiones;
  v_programacion public.turno_jornada_programacion;
  v_local timestamp without time zone;
  v_ahora_minuto time;
  v_fecha_fin date;
  v_result public.turno_sesiones;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_sesion FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_sesion.bloque<>'JORNADA' OR v_sesion.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'No es una sesión de jornada única válida.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_programacion FROM public.turno_jornada_programacion WHERE id=v_sesion.jornada_programacion_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programación de jornada no encontrada.' USING ERRCODE='23503'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.turno_asignaciones a WHERE a.turno_sesion_id=v_sesion.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL) THEN
    RAISE EXCEPTION 'Solo el responsable asignado puede cerrar esta jornada.' USING ERRCODE='42501';
  END IF;
  IF v_sesion.estado<>'EN_CURSO' THEN RAISE EXCEPTION 'La jornada no está en curso.' USING ERRCODE='23514'; END IF;
  v_fecha_fin:=coalesce(v_programacion.fecha_fin,v_programacion.fecha);
  v_local:=now() AT TIME ZONE v_programacion.zona_horaria;
  v_ahora_minuto:=date_trunc('minute',v_local)::time;
  IF (v_local::date<>v_fecha_fin OR v_ahora_minuto<>v_programacion.hora_fin_prevista)
     AND trim(coalesce(p_motivo_excepcion,''))='' THEN
    RAISE EXCEPTION 'Cierre anticipado o tardío: debe registrar un motivo antes de cerrar.' USING ERRCODE='23514';
  END IF;
  v_result:=public.bc_cerrar_turno_sesion(p_turno_sesion_id);
  INSERT INTO public.turno_eventos(turno_id,turno_sesion_id,actor_user_id,tipo,payload)
  VALUES(v_sesion.turno_id,v_sesion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    jsonb_build_object('fecha_fin_programada',v_fecha_fin,'hora_programada',v_programacion.hora_fin_prevista,
      'hora_real',v_ahora_minuto,'fecha_real',v_local::date,'zona_horaria',v_programacion.zona_horaria,
      'motivo',nullif(trim(p_motivo_excepcion),'')));
  INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_programacion.almacen_id,v_programacion.id,auth.uid(),
    CASE WHEN v_local::date=v_fecha_fin AND v_ahora_minuto=v_programacion.hora_fin_prevista THEN 'JORNADA_CERRADA' ELSE 'JORNADA_CERRADA_CON_EXCEPCION' END,
    nullif(trim(p_motivo_excepcion),''),jsonb_build_object('estado_sesion',v_sesion.estado),
    jsonb_build_object('estado_sesion',v_result.estado,'fecha_real',v_local::date,'fecha_fin_programada',v_fecha_fin,'hora_real',v_ahora_minuto));
  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.bc5_cerrar_jornada(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_movimientos_sesion(p_turno_sesion_id uuid)
 RETURNS TABLE(fecha timestamp with time zone, tipo text, producto text, almacen text, cantidad numeric, costo_unitario numeric, usuario text, operacion_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_uid uuid := auth.uid();
  v_fecha_inicio date;
  v_fecha_fin date;
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
  v_fecha_inicio := v_s.fecha;
  v_fecha_fin := v_s.fecha;
  IF v_s.jornada_programacion_id IS NOT NULL THEN
    SELECT p.fecha,coalesce(p.fecha_fin,p.fecha)
      INTO v_fecha_inicio,v_fecha_fin
    FROM public.turno_jornada_programacion p
    WHERE p.id=v_s.jornada_programacion_id;
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
    AND (lc.fecha_compra AT TIME ZONE 'America/Havana')::date BETWEEN v_fecha_inicio AND v_fecha_fin
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
    AND (v.fecha AT TIME ZONE 'America/Havana')::date BETWEEN v_fecha_inicio AND v_fecha_fin
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
    AND (t.fecha AT TIME ZONE 'America/Havana')::date BETWEEN v_fecha_inicio AND v_fecha_fin
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
    AND (t.fecha AT TIME ZONE 'America/Havana')::date BETWEEN v_fecha_inicio AND v_fecha_fin
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = t.creado_por
        AND t.fecha >= tr.inicio_at
        AND (tr.fin_at IS NULL OR t.fecha < tr.fin_at)
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
    AND (vs.fecha AT TIME ZONE 'America/Havana')::date BETWEEN v_fecha_inicio AND v_fecha_fin
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
    'merma'::text,
    p.nombre::text,
    a.nombre::text,
    -m.cantidad,
    NULL::numeric,
    COALESCE(m.revisado_nombre, m.creado_nombre, '')::text,
    m.id
  FROM public.mermas m
  JOIN public.productos p ON p.id = m.producto_id
  JOIN public.almacenes a ON a.id = m.almacen_id
  WHERE m.estado = 'APROBADA'
    AND m.almacen_id = v_s.almacen_id
    AND (COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) AT TIME ZONE 'America/Havana')::date BETWEEN v_fecha_inicio AND v_fecha_fin
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = COALESCE(m.revisado_por, m.creado_por)
        AND COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) >= tr.inicio_at
        AND (tr.fin_at IS NULL OR COALESCE(m.fecha_revision, m.actualizado_en, m.creado_en) < tr.fin_at)
    )

  UNION ALL

  SELECT
    COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en),
    'baja'::text,
    p.nombre::text,
    a.nombre::text,
    -b.cantidad,
    NULL::numeric,
    COALESCE(b.revisado_nombre, b.creado_nombre, '')::text,
    b.id
  FROM public.bajas b
  JOIN public.productos p ON p.id = b.producto_id
  JOIN public.almacenes a ON a.id = b.almacen_id
  WHERE b.estado = 'APROBADA'
    AND b.almacen_id = v_s.almacen_id
    AND (COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) AT TIME ZONE 'America/Havana')::date BETWEEN v_fecha_inicio AND v_fecha_fin
    AND EXISTS (
      SELECT 1 FROM public.turno_tramos tr
      WHERE tr.turno_sesion_id = v_s.id
        AND tr.usuario_id = COALESCE(b.revisado_por, b.creado_por)
        AND COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) >= tr.inicio_at
        AND (tr.fin_at IS NULL OR COALESCE(b.fecha_revision, b.actualizado_en, b.creado_en) < tr.fin_at)
    )
  ORDER BY 1 DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bc7_preparar_entrega_inventario_jornada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_destino uuid;
  v_fecha_destino date;
  v_entrega uuid;
BEGIN
  IF NEW.tipo <> 'FINAL' THEN RETURN NEW; END IF;

  SELECT * INTO v_s
  FROM public.turno_sesiones
  WHERE id=NEW.turno_sesion_id AND bloque='JORNADA'
    AND jornada_programacion_id IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_p FROM public.turno_jornada_programacion p WHERE p.id=v_s.jornada_programacion_id;
  v_fecha_destino := coalesce(v_p.fecha_fin,v_s.fecha)+1;

  SELECT s.id INTO v_destino
  FROM public.turno_sesiones s
  WHERE s.fecha=v_fecha_destino
    AND s.almacen_id=v_s.almacen_id
    AND s.bloque='JORNADA'
    AND s.jornada_programacion_id IS NOT NULL
    AND s.estado IN ('PENDIENTE','PROGRAMADA')
  ORDER BY s.id
  LIMIT 1;

  -- A legacy INITIAL already recorded before this feature remains historical and is not relinked.
  IF v_destino IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.turno_jornada_inventario_cortes c
    WHERE c.turno_sesion_id=v_destino AND c.tipo='INICIAL'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.turno_jornada_inventario_entregas
    (almacen_id,turno_id,origen_sesion_id,origen_corte_id,destino_sesion_id,fecha_destino,
     estado,creado_por)
  VALUES
    (v_s.almacen_id,v_s.turno_id,v_s.id,NEW.id,v_destino,v_fecha_destino,
     CASE WHEN v_destino IS NULL THEN 'PENDIENTE_PROGRAMACION' ELSE 'PENDIENTE_RECEPCION' END,
     NEW.confirmado_por)
  ON CONFLICT (origen_sesion_id) DO NOTHING
  RETURNING id INTO v_entrega;

  IF v_entrega IS NULL THEN
    SELECT id INTO v_entrega
    FROM public.turno_jornada_inventario_entregas
    WHERE origen_sesion_id=v_s.id;
  END IF;

  -- Always reconcile missing immutable detail rows on retry. The FINAL cut and its
  -- line items may be persisted in separate statements before the deferred trigger fires.
  INSERT INTO public.turno_jornada_inventario_entrega_lineas
    (entrega_id,producto_id,cantidad_declarada)
  SELECT v_entrega,l.producto_id,l.cantidad_contada
  FROM public.turno_jornada_inventario_lineas l
  WHERE l.corte_id=NEW.id
  ON CONFLICT (entrega_id,producto_id) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.turno_jornada_eventos
    WHERE tipo='INVENTARIO_ENTREGA_PREPARADA'
      AND estado_despues->>'entrega_id'=v_entrega::text
  ) THEN
    RETURN NEW;
  END IF;

  IF v_entrega IS NOT NULL THEN
    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    VALUES
      (v_s.almacen_id,v_s.jornada_programacion_id,NEW.confirmado_por,
       'INVENTARIO_ENTREGA_PREPARADA',
       'Entrega compartida generada desde el inventario final confirmado.',
       jsonb_build_object('sesion_origen_id',v_s.id,'corte_final_id',NEW.id),
       jsonb_build_object('entrega_id',v_entrega,'sesion_destino_id',v_destino,
         'fecha_destino',v_fecha_destino));
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bc7_finanzas_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN
    RAISE EXCEPTION 'La sesión no corresponde a una jornada única.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin()
     AND (
       NOT public.tiene_permiso('turnos','ver')
       OR NOT EXISTS (
         SELECT 1 FROM public.turno_asignaciones a
         WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado con turnos.ver o ADMIN puede consultar estas finanzas.' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'gastos',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',g.id,'concepto',g.concepto,'descripcion',g.descripcion,'monto',g.monto,
        'estado',g.estado,'creado_en',g.creado_en,'creado_nombre',g.creado_nombre,
        'revisado_nombre',g.revisado_nombre,'comentario_revision',g.comentario_revision,
        'fecha_revision',g.fecha_revision
      ) ORDER BY g.creado_en,g.id)
      FROM public.gastos g
      WHERE g.turno_sesion_id=v_s.id
    ),'[]'::jsonb),
    'reinversiones',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',r.id,'proveedor',r.proveedor,'fecha',r.fecha,'total',r.total,
        'usuario_nombre',r.usuario_nombre,'estado',r.estado,'revisado_nombre',r.revisado_nombre,'comentario_revision',r.comentario_revision,'fecha_revision',r.fecha_revision,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',rl.producto_id,'producto',p.nombre,
            'cantidad_base',rl.cantidad_base,'costo_total',rl.costo_total,
            'costo_unitario',rl.costo_unitario
          ) ORDER BY p.nombre,p.id)
          FROM public.reinversiones_lineas rl
          JOIN public.productos p ON p.id=rl.producto_id
          WHERE rl.reinversion_id=r.id
        ),'[]'::jsonb)
      ) ORDER BY r.fecha,r.id)
      FROM public.reinversiones r
      WHERE r.turno_sesion_id=v_s.id
    ),'[]'::jsonb),
    'mermas',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',m.id,'producto',p.nombre,'producto_id',m.producto_id,
        'cantidad',m.cantidad,'motivo',m.motivo,'estado',m.estado,
        'creado_en',m.creado_en,'creado_nombre',m.creado_nombre,
        'revisado_nombre',m.revisado_nombre,'comentario_revision',m.comentario_revision,
        'fecha_revision',m.fecha_revision
      ) ORDER BY m.creado_en,m.id)
      FROM public.mermas m
      JOIN public.productos p ON p.id=m.producto_id
      WHERE m.turno_sesion_id=v_s.id
    ),'[]'::jsonb),
    'bajas',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',b.id,'producto',p.nombre,'producto_id',b.producto_id,
        'cantidad',b.cantidad,'motivo',b.motivo,'estado',b.estado,
        'creado_en',b.creado_en,'creado_nombre',b.creado_nombre,
        'revisado_nombre',b.revisado_nombre,'comentario_revision',b.comentario_revision,
        'fecha_revision',b.fecha_revision
      ) ORDER BY b.creado_en,b.id)
      FROM public.bajas b
      JOIN public.productos p ON p.id=b.producto_id
      WHERE b.turno_sesion_id=v_s.id
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bc7_registrar_reinversion_jornada(
  p_turno_sesion_id uuid,p_lineas jsonb,p_idempotency_key uuid,p_proveedor text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones; v_t public.turno_tramos; v_id uuid;
  v_existing_session uuid; v_existing_tramo uuid; v_uid uuid:=auth.uid(); v_nombre text;
  v_line jsonb; v_producto uuid; v_presentacion uuid; v_cantidad_presentacion numeric;
  v_cantidad_base numeric; v_costo_total numeric; v_total numeric:=0; v_unitario numeric;
BEGIN
  IF NOT public.tiene_permiso('reinversiones','crear') THEN RAISE EXCEPTION 'No tienes permiso para registrar reinversiones.' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL OR p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array'
     OR jsonb_array_length(p_lineas)=0 OR jsonb_array_length(p_lineas)>100 THEN
    RAISE EXCEPTION 'La reinversión requiere entre 1 y 100 líneas y clave de idempotencia.' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_proveedor,''))>180 THEN RAISE EXCEPTION 'El proveedor no puede superar 180 caracteres.' USING ERRCODE='22023'; END IF;
  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_idempotency_key::text,0));
  SELECT id,turno_sesion_id,turno_tramo_id INTO v_id,v_existing_session,v_existing_tramo
  FROM public.reinversiones WHERE idempotency_key=p_idempotency_key AND usuario_id=v_uid LIMIT 1 FOR UPDATE;
  IF v_id IS NOT NULL THEN
    IF v_existing_session IS DISTINCT FROM v_s.id OR v_existing_tramo IS DISTINCT FROM v_t.id THEN
      RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otra reinversión/jornada.' USING ERRCODE='23505';
    END IF;
    RETURN v_id;
  END IF;
  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=v_uid;
  INSERT INTO public.reinversiones
    (almacen_id,ciclo_id,sesion_id,turno_id,proveedor,fecha,total,usuario_id,usuario_nombre,
     idempotency_key,turno_sesion_id,turno_tramo_id,estado)
  VALUES(v_s.almacen_id,NULL,NULL,v_s.turno_id,NULLIF(btrim(coalesce(p_proveedor,'')),''),now(),0,
    v_uid,v_nombre,p_idempotency_key,v_s.id,v_t.id,'PENDIENTE')
  RETURNING id INTO v_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lineas)
  LOOP
    v_producto:=nullif(v_line->>'producto_id','')::uuid;
    v_presentacion:=nullif(v_line->>'presentacion_id','')::uuid;
    v_cantidad_presentacion:=nullif(v_line->>'cantidad_presentacion','')::numeric;
    v_costo_total:=nullif(v_line->>'costo_total','')::numeric;
    IF v_producto IS NULL OR v_costo_total IS NULL OR v_costo_total<=0 THEN
      RAISE EXCEPTION 'Cada línea requiere producto y costo total positivo.' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.productos p JOIN public.stock s ON s.producto_id=p.id AND s.almacen_id=v_s.almacen_id WHERE p.id=v_producto AND p.activo=true) THEN
      RAISE EXCEPTION 'El producto no pertenece al catálogo activo del almacén.' USING ERRCODE='23503';
    END IF;
    IF v_presentacion IS NOT NULL THEN
      SELECT unidades_base INTO v_cantidad_base FROM public.obtener_conversion_presentacion(v_producto,v_presentacion,v_cantidad_presentacion);
    ELSE
      v_cantidad_base:=nullif(v_line->>'cantidad_base','')::numeric;
    END IF;
    IF v_cantidad_base IS NULL OR v_cantidad_base<=0 THEN RAISE EXCEPTION 'La cantidad recibida debe ser positiva.' USING ERRCODE='22023'; END IF;
    v_unitario:=v_costo_total/v_cantidad_base;
    INSERT INTO public.reinversiones_lineas(reinversion_id,producto_id,presentacion_id,cantidad_presentacion,cantidad_base,costo_total,costo_unitario)
    VALUES(v_id,v_producto,v_presentacion,v_cantidad_presentacion,v_cantidad_base,v_costo_total,v_unitario);
    v_total:=v_total+v_costo_total;
  END LOOP;
  IF v_total<=0 THEN RAISE EXCEPTION 'El total de la reinversión debe ser positivo.' USING ERRCODE='22023'; END IF;
  UPDATE public.reinversiones SET total=v_total WHERE id=v_id;
  INSERT INTO public.turno_jornada_eventos(almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_s.almacen_id,v_s.jornada_programacion_id,v_uid,'REINVERSION_SOLICITADA',
    NULLIF(btrim(coalesce(p_proveedor,'')),''),jsonb_build_object('sesion_id',v_s.id,'tramo_id',v_t.id),
    jsonb_build_object('reinversion_id',v_id,'total',v_total,'lineas',p_lineas,'estado','PENDIENTE',
      'stock_global_modificado',false,'caja_modificada',false));
  RETURN v_id;
END;
$function$;

;

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

    -- One row per parent request, not one row for each product in its list.
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

    -- Keep standalone/legacy single Baja records individually actionable.
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
      ('Reinversión pendiente · '||coalesce(nullif(r.proveedor,''),'Proveedor no especificado'))::text,
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

    ORDER BY 3 DESC;
END;
$function$
;

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
  v_reinversion public.reinversiones;
  v_entrega public.turno_jornada_entregas_diarias;
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
      SELECT estado,almacen_id,producto_id,cantidad
      INTO v_estado,v_alm,v_prod,v_cant
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
      -- Stock and FIFO lot depletion run in this same transaction.
      PERFORM public._aplicar_salida_aprobada(v_alm,v_prod,v_cant_real);
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
        INSERT INTO public.stock(producto_id,almacen_id,cantidad,minimo)
        VALUES(v_line.producto_id,v_reinversion.almacen_id,v_line.cantidad_base,0)
        ON CONFLICT(producto_id,almacen_id)
        DO UPDATE SET cantidad=public.stock.cantidad+excluded.cantidad,updated_at=now();
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
$function$
;

-- Calendar and workspace reads expose the full period, while retaining one session row.
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
      'es_responsable',p.responsable_id=auth.uid()
    ) ORDER BY p.fecha,p.numero_dia
  ),'[]'::jsonb)
  INTO v_result
  FROM public.turno_jornada_programacion p
  LEFT JOIN public.turno_sesiones s ON s.jornada_programacion_id=p.id
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

CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_jornada(p_turno_sesion_id uuid,p_tipo text,p_lineas jsonb,p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones; v_uid uuid:=auth.uid();
  v_existing public.turno_jornada_inventario_cortes;
  v_corte_id uuid; v_origen_corte_id uuid; v_grouped boolean:=false;
  v_expected integer; v_count integer; v_distinct integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF upper(coalesce(p_tipo,'')) NOT IN ('INICIAL','FINAL') THEN RAISE EXCEPTION 'Tipo de inventario inválido.' USING ERRCODE='22023'; END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas)<>'array' THEN RAISE EXCEPTION 'El conteo debe ser una lista de productos y cantidades.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id FOR UPDATE;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS (SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=v_uid AND a.retirado_at IS NULL)
  ) THEN RAISE EXCEPTION 'Solo el responsable asignado con turnos.ver puede registrar este inventario.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_existing FROM public.turno_jornada_inventario_cortes
  WHERE turno_sesion_id=v_s.id AND tipo=upper(p_tipo) FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('id',v_existing.id,'tipo',v_existing.tipo,'estado',v_existing.estado,
      'origen_corte_id',v_existing.origen_corte_id,'idempotente',true,
      'mensaje','El conteo ya estaba confirmado; no se sobrescribió.');
  END IF;
  IF upper(p_tipo)='INICIAL' AND v_s.estado NOT IN ('PENDIENTE','PROGRAMADA') THEN
    RAISE EXCEPTION 'El inventario inicial debe confirmarse antes de abrir la jornada.' USING ERRCODE='23514';
  END IF;
  IF upper(p_tipo)='FINAL' AND v_s.estado<>'EN_CURSO' THEN
    RAISE EXCEPTION 'El inventario final solo puede confirmarse durante la jornada.' USING ERRCODE='23514';
  END IF;
  IF NULLIF(btrim(coalesce(p_observacion,'')),'') IS NOT NULL AND length(p_observacion)>1000 THEN
    RAISE EXCEPTION 'La observación no puede superar 1000 caracteres.' USING ERRCODE='22023';
  END IF;
  IF upper(p_tipo)='INICIAL' THEN
    SELECT c.id INTO v_origen_corte_id FROM public.turno_sesiones ps
    JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=ps.id
    WHERE ps.turno_id=v_s.turno_id AND ps.numero_dia=v_s.numero_dia-1
      AND ps.fecha<v_s.fecha AND ps.bloque='JORNADA' AND ps.estado='COMPLETADA'
      AND c.tipo='FINAL' AND c.estado='CONFIRMADO' LIMIT 1;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') INTO v_grouped;
  IF v_grouped THEN
    IF upper(p_tipo)='INICIAL' THEN
      SELECT count(*) INTO v_expected FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL;
    ELSE
      SELECT count(*) INTO v_expected FROM (
        SELECT l.producto_id FROM public.turno_jornada_inventario_cortes c
        JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
        WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
        UNION
        SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
        FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
        WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
      ) expected;
    END IF;
  ELSE
    SELECT count(*) INTO v_expected FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
    WHERE s.almacen_id=v_s.almacen_id AND p.activo=true;
  END IF;
  SELECT count(*),count(DISTINCT (x.value->>'producto_id')::uuid)
    INTO v_count,v_distinct FROM jsonb_array_elements(p_lineas) x(value);
  IF v_count=0 OR v_count<>v_expected OR v_distinct<>v_count THEN
    RAISE EXCEPTION 'El conteo debe incluir una sola línea por producto/familia activa (% esperadas; % recibidas).',v_expected,v_count
      USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
    LEFT JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid AND p.activo=true
    WHERE jsonb_typeof(x.value)<>'object' OR p.id IS NULL
      OR coalesce(x.value->>'cantidad','') !~ '^([0-9]+([.][0-9]{1,3})?|[.][0-9]{1,3})$'
      OR (v_grouped AND p.producto_padre_id IS NOT NULL)
      OR (NOT v_grouped AND NOT EXISTS(SELECT 1 FROM public.stock s WHERE s.almacen_id=v_s.almacen_id AND s.producto_id=p.id))
  ) THEN RAISE EXCEPTION 'Producto/familia o cantidad inválida en el conteo.' USING ERRCODE='22023'; END IF;
  IF v_grouped AND upper(p_tipo)='FINAL' AND EXISTS (
    SELECT e.producto_id FROM (
      SELECT l.producto_id FROM public.turno_jornada_inventario_cortes c
      JOIN public.turno_jornada_inventario_lineas l ON l.corte_id=c.id
      WHERE c.turno_sesion_id=v_s.id AND c.tipo='INICIAL'
      UNION
      SELECT DISTINCT coalesce(p.producto_padre_id,p.id)
      FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
    ) e
    WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_lineas) x(value)
      WHERE (x.value->>'producto_id')::uuid=e.producto_id)
  ) THEN RAISE EXCEPTION 'El inventario final debe incluir los productos de apertura y los que tengan stock durante la jornada.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.turno_jornada_inventario_cortes
    (turno_sesion_id,tipo,estado,creado_por,confirmado_por,observacion,origen_corte_id)
  VALUES(v_s.id,upper(p_tipo),'CONFIRMADO',v_uid,v_uid,NULLIF(btrim(p_observacion),''),v_origen_corte_id)
  RETURNING id INTO v_corte_id;
  INSERT INTO public.turno_jornada_inventario_lineas(corte_id,producto_id,cantidad_contada,stock_sistema)
  SELECT v_corte_id,p.id,(x.value->>'cantidad')::numeric,
    CASE WHEN v_grouped THEN coalesce((
      SELECT sum(s.cantidad) FROM public.stock s JOIN public.productos sp ON sp.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND (sp.id=p.id OR sp.producto_padre_id=p.id)
    ),0) ELSE s.cantidad END
  FROM jsonb_array_elements(p_lineas) x(value)
  JOIN public.productos p ON p.id=(x.value->>'producto_id')::uuid
  LEFT JOIN public.stock s ON s.almacen_id=v_s.almacen_id AND s.producto_id=p.id;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_s.almacen_id,v_s.jornada_programacion_id,v_uid,
    CASE WHEN upper(p_tipo)='INICIAL' THEN 'INVENTARIO_INICIAL_CONFIRMADO' ELSE 'INVENTARIO_FINAL_CONFIRMADO' END,
    NULLIF(btrim(p_observacion),''),jsonb_build_object('sesion_id',v_s.id,'estado',v_s.estado),
    jsonb_build_object('corte_id',v_corte_id,'tipo',upper(p_tipo),'cantidad_lineas',v_count,
      'origen_corte_id',v_origen_corte_id,'inventario_agrupado_por_familia',v_grouped));
  RETURN jsonb_build_object('id',v_corte_id,'tipo',upper(p_tipo),'estado','CONFIRMADO',
    'cantidad_lineas',v_count,'origen_corte_id',v_origen_corte_id,'inventario_agrupado_por_familia',v_grouped);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_obtener_inventario_jornada(p_turno_sesion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_result jsonb;
  v_agrupar boolean:=false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' OR v_s.jornada_programacion_id IS NULL THEN
    RAISE EXCEPTION 'La sesión no corresponde al modelo de jornada única.' USING ERRCODE='23503';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE='23503'; END IF;
  SELECT (a.tipo='minorista') INTO v_agrupar
  FROM public.almacenes a WHERE a.id=v_s.almacen_id;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS (
      SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Solo el responsable asignado con turnos.ver puede consultar esta jornada.' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'sesion',jsonb_build_object(
      'id',v_s.id,'turno_id',v_s.turno_id,'almacen_id',v_s.almacen_id,
      'numero_dia',v_s.numero_dia,'fecha',v_s.fecha,'fecha_fin',coalesce(v_p.fecha_fin,v_s.fecha),'bloque',v_s.bloque,
      'estado',v_s.estado,'hora_inicio_prevista',v_p.hora_inicio_prevista,
      'hora_fin_prevista',v_p.hora_fin_prevista,'zona_horaria',v_p.zona_horaria,
      'responsable_id',v_p.responsable_id,'programacion_id',v_p.id,'es_minorista',v_agrupar
    ),
    'productos',CASE WHEN v_agrupar THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'stock_actual',coalesce((
          SELECT sum(s.cantidad) FROM public.stock s JOIN public.productos sp ON sp.id=s.producto_id
          WHERE s.almacen_id=v_s.almacen_id AND (sp.id=p.id OR sp.producto_padre_id=p.id)
        ),0),
        'minimo',coalesce((
          SELECT sum(s.minimo) FROM public.stock s JOIN public.productos sp ON sp.id=s.producto_id
          WHERE s.almacen_id=v_s.almacen_id AND (sp.id=p.id OR sp.producto_padre_id=p.id)
        ),0),
        'es_familia',EXISTS(SELECT 1 FROM public.productos h WHERE h.producto_padre_id=p.id AND h.activo=true)
      ) ORDER BY p.nombre,p.id)
      FROM public.productos p WHERE p.activo=true AND p.producto_padre_id IS NULL
    ),'[]'::jsonb) ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id',p.id,'nombre',p.nombre,'unidad',p.unidad,
        'stock_actual',s.cantidad,'minimo',s.minimo
      ) ORDER BY p.nombre,p.id)
      FROM public.stock s JOIN public.productos p ON p.id=s.producto_id
      WHERE s.almacen_id=v_s.almacen_id AND p.activo=true
    ),'[]'::jsonb) END,
    'cortes',coalesce((
      SELECT jsonb_object_agg(c.tipo,jsonb_build_object(
        'id',c.id,'tipo',c.tipo,'estado',c.estado,'creado_por',c.creado_por,
        'confirmado_por',c.confirmado_por,'creado_en',c.creado_en,
        'confirmado_en',c.confirmado_en,'observacion',c.observacion,
        'origen_corte_id',c.origen_corte_id,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada,
            'stock_sistema',l.stock_sistema,'diferencia',l.cantidad_contada-l.stock_sistema
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      ))
      FROM public.turno_jornada_inventario_cortes c
      WHERE c.turno_sesion_id=v_s.id
    ),'{}'::jsonb),
    'apertura_previa',(
      SELECT jsonb_build_object(
        'corte_id',c.id,'sesion_id',ps.id,'numero_dia',ps.numero_dia,'fecha',ps.fecha,
        'lineas',coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'producto_id',l.producto_id,'cantidad_contada',l.cantidad_contada
          ) ORDER BY p.nombre,p.id)
          FROM public.turno_jornada_inventario_lineas l
          JOIN public.productos p ON p.id=l.producto_id
          WHERE l.corte_id=c.id
        ),'[]'::jsonb)
      )
      FROM public.turno_sesiones ps
      JOIN public.turno_jornada_inventario_cortes c ON c.turno_sesion_id=ps.id
      WHERE ps.turno_id=v_s.turno_id AND ps.numero_dia=v_s.numero_dia-1
        AND ps.fecha<v_s.fecha AND ps.bloque='JORNADA' AND ps.estado='COMPLETADA'
        AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
      LIMIT 1
    ),
    'entrega_compartida',public.bc7_estado_entrega_inventario_jornada(v_s.id),
    'tramo_activo',(
      SELECT jsonb_build_object('id',t.id,'usuario_id',t.usuario_id,'inicio_at',t.inicio_at)
      FROM public.turno_tramos t
      WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
      ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1
    ),
    'declaracion_dinero',(
      SELECT jsonb_build_object(
        'id',d.id,
        'turno_tramo_id',d.turno_tramo_id,
        'monto',d.monto,
        'moneda',d.moneda,
        'estado_aprobacion',d.estado_aprobacion,
        'declarado_at',d.declarado_at,
        'monto_contado',d.monto_contado,
        'contado_por',d.contado_por,
        'contado_at',d.contado_at,
        'observacion_conteo',d.observacion_conteo,
        'diferencia',d.diferencia,
        'aprobado_por',d.aprobado_por,
        'aprobado_at',d.aprobado_at
      )
      FROM public.turno_declaraciones d
      WHERE d.turno_sesion_id=v_s.id
        AND d.turno_tramo_id=coalesce(
          (SELECT t.id FROM public.turno_tramos t
           WHERE t.turno_sesion_id=v_s.id AND t.estado='ACTIVO'
           ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1),
          (SELECT t.id FROM public.turno_tramos t
           WHERE t.turno_sesion_id=v_s.id
           ORDER BY t.inicio_at DESC NULLS LAST,t.created_at DESC NULLS LAST LIMIT 1)
        )
      ORDER BY d.declarado_at DESC NULLS LAST,d.created_at DESC NULLS LAST LIMIT 1
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$
;


-- La Cueva: liquidación por diferencias de inventario y entrega diaria de efectivo.
-- The rate is deliberately NULL until the owner configures it; no historical rate is inferred.
ALTER TABLE public.turno_jornada_configuracion
  ADD COLUMN IF NOT EXISTS salario_porcentaje numeric(6,3),
  ADD COLUMN IF NOT EXISTS salario_porcentaje_actualizado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS salario_porcentaje_actualizado_en timestamptz;
DO $salary_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.turno_jornada_configuracion'::regclass
      AND conname='turno_jornada_salario_porcentaje_chk'
  ) THEN
    ALTER TABLE public.turno_jornada_configuracion
      ADD CONSTRAINT turno_jornada_salario_porcentaje_chk
      CHECK (salario_porcentaje IS NULL OR salario_porcentaje BETWEEN 0 AND 100);
  END IF;
END;
$salary_constraint$;

CREATE TABLE IF NOT EXISTS public.turno_jornada_entregas_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_sesion_id uuid NOT NULL REFERENCES public.turno_sesiones(id) ON DELETE RESTRICT,
  turno_tramo_id uuid NOT NULL REFERENCES public.turno_tramos(id) ON DELETE RESTRICT,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  monto_declarado numeric(14,2) NOT NULL CHECK (monto_declarado>=0),
  monto_aprobado numeric(14,2),
  estado text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA')),
  observacion text,
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_nombre text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  revisado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revisado_nombre text,
  comentario_revision text,
  fecha_revision timestamptz,
  idempotency_key uuid NOT NULL,
  CONSTRAINT turno_jornada_entrega_diaria_fecha_unica UNIQUE(turno_sesion_id,fecha),
  CONSTRAINT turno_jornada_entrega_diaria_actor_key UNIQUE(creado_por,idempotency_key),
  CONSTRAINT turno_jornada_entrega_diaria_aprobado_chk
    CHECK (monto_aprobado IS NULL OR monto_aprobado>=0)
);
CREATE INDEX IF NOT EXISTS turno_jornada_entregas_diarias_fecha_idx
  ON public.turno_jornada_entregas_diarias(turno_sesion_id,fecha);
ALTER TABLE public.turno_jornada_entregas_diarias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turno_jornada_entregas_diarias FROM PUBLIC,anon,authenticated;

-- Only the Dueño role receives the new daily-cash approval permission.
INSERT INTO public.permisos(role_id,seccion,accion,permitido)
SELECT r.id,'entregas_caja','editar_any',true
FROM public.roles r
WHERE lower(btrim(r.nombre)) IN ('dueño','dueno') AND r.activo=true
ON CONFLICT(role_id,seccion,accion) DO UPDATE SET permitido=EXCLUDED.permitido;

CREATE OR REPLACE FUNCTION public.bc7_configurar_salario_porcentaje_jornada(
  p_almacen_id uuid,p_porcentaje numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_old numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('reinversiones','editar_any') THEN
    RAISE EXCEPTION 'Solo Dueño puede configurar el porcentaje salarial.' USING ERRCODE='42501';
  END IF;
  IF p_almacen_id IS NULL OR p_porcentaje IS NULL OR p_porcentaje<0 OR p_porcentaje>100 THEN
    RAISE EXCEPTION 'El porcentaje debe estar entre 0 y 100.' USING ERRCODE='22023';
  END IF;
  SELECT salario_porcentaje INTO v_old
  FROM public.turno_jornada_configuracion
  WHERE almacen_id=p_almacen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe configuración de jornada para el almacén.' USING ERRCODE='23503'; END IF;
  UPDATE public.turno_jornada_configuracion
  SET salario_porcentaje=p_porcentaje,
      salario_porcentaje_actualizado_por=auth.uid(),
      salario_porcentaje_actualizado_en=now(),
      actualizado_por=auth.uid(),
      actualizado_en=now()
  WHERE almacen_id=p_almacen_id;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(p_almacen_id,auth.uid(),'SALARIO_PORCENTAJE_CONFIGURADO',
    'Configuración del porcentaje de salario por ventas comprobadas.',
    jsonb_build_object('salario_porcentaje',v_old),
    jsonb_build_object('salario_porcentaje',p_porcentaje));
  RETURN jsonb_build_object('ok',true,'almacen_id',p_almacen_id,'salario_porcentaje',p_porcentaje);
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_configurar_salario_porcentaje_jornada(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_configurar_salario_porcentaje_jornada(uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_registrar_entrega_diaria_jornada(
  p_turno_sesion_id uuid,p_fecha date,p_monto numeric,
  p_observacion text DEFAULT NULL,p_idempotency_key uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_t public.turno_tramos;
  v_id uuid;
  v_existing_session uuid;
  v_existing_date date;
  v_existing_amount numeric;
  v_existing_state text;
  v_nombre text;
  v_uid uuid:=auth.uid();
  v_fecha_fin date;
  v_hoy date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  IF p_fecha IS NULL OR p_monto IS NULL OR p_monto<0 OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Fecha, importe igual o mayor que cero y clave de idempotencia son obligatorios.' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_observacion,''))>500 THEN
    RAISE EXCEPTION 'La observación no puede superar 500 caracteres.' USING ERRCODE='22023';
  END IF;
  v_t:=public.bc7_validar_tramo_responsable_jornada(p_turno_sesion_id);
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el período de esta jornada.' USING ERRCODE='23503'; END IF;
  v_fecha_fin:=coalesce(v_p.fecha_fin,v_p.fecha);
  v_hoy:=(now() AT TIME ZONE coalesce(nullif(v_p.zona_horaria,''),'America/Havana'))::date;
  IF p_fecha<v_p.fecha OR p_fecha>=v_fecha_fin OR p_fecha>v_hoy THEN
    RAISE EXCEPTION 'La entrega diaria solo puede registrarse para una fecha trabajada anterior al último día de cierre y no futura.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.almacenes a WHERE a.id=v_s.almacen_id AND a.tipo='minorista') THEN
    RAISE EXCEPTION 'La entrega diaria por este flujo está habilitada para almacenes minoristas.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||p_idempotency_key::text,0));
  SELECT id,turno_sesion_id,fecha,monto_declarado
    INTO v_id,v_existing_session,v_existing_date,v_existing_amount
  FROM public.turno_jornada_entregas_diarias
  WHERE creado_por=v_uid AND idempotency_key=p_idempotency_key
  LIMIT 1 FOR UPDATE;
  IF v_id IS NOT NULL THEN
    IF v_existing_session IS DISTINCT FROM v_s.id
       OR v_existing_date IS DISTINCT FROM p_fecha
       OR v_existing_amount IS DISTINCT FROM p_monto THEN
      RAISE EXCEPTION 'La clave de idempotencia ya pertenece a otra entrega diaria.' USING ERRCODE='23505';
    END IF;
    RETURN v_id;
  END IF;
  SELECT nombre INTO v_nombre FROM public.usuarios WHERE id=v_uid;
  SELECT id,estado,monto_declarado
    INTO v_id,v_existing_state,v_existing_amount
  FROM public.turno_jornada_entregas_diarias
  WHERE turno_sesion_id=v_s.id AND fecha=p_fecha
  LIMIT 1 FOR UPDATE;
  IF v_id IS NOT NULL THEN
    IF v_existing_state<>'RECHAZADA' THEN
      RAISE EXCEPTION 'Ya existe una entrega diaria para esta fecha. Consulta su estado antes de reenviar.' USING ERRCODE='23505';
    END IF;
    UPDATE public.turno_jornada_entregas_diarias
    SET turno_tramo_id=v_t.id,monto_declarado=p_monto,monto_aprobado=NULL,
        estado='PENDIENTE',observacion=nullif(btrim(coalesce(p_observacion,'')),''),
        creado_por=v_uid,creado_nombre=v_nombre,creado_en=now(),idempotency_key=p_idempotency_key,
        revisado_por=NULL,revisado_nombre=NULL,comentario_revision=NULL,fecha_revision=NULL
    WHERE id=v_id;
    INSERT INTO public.turno_jornada_eventos
      (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
    VALUES(v_s.almacen_id,v_s.jornada_programacion_id,v_uid,'ENTREGA_DIARIA_REENVIADA',
      nullif(btrim(coalesce(p_observacion,'')),''),
      jsonb_build_object('entrega_id',v_id,'fecha',p_fecha,'monto_declarado',v_existing_amount,'estado','RECHAZADA'),
      jsonb_build_object('entrega_id',v_id,'monto_declarado',p_monto,'estado','PENDIENTE'));
    RETURN v_id;
  END IF;
  INSERT INTO public.turno_jornada_entregas_diarias
    (turno_sesion_id,turno_tramo_id,almacen_id,fecha,monto_declarado,observacion,
     creado_por,creado_nombre,idempotency_key)
  VALUES(v_s.id,v_t.id,v_s.almacen_id,p_fecha,p_monto,
    nullif(btrim(coalesce(p_observacion,'')),''),v_uid,v_nombre,p_idempotency_key)
  RETURNING id INTO v_id;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES(v_s.almacen_id,v_s.jornada_programacion_id,v_uid,'ENTREGA_DIARIA_DECLARADA',
    nullif(btrim(coalesce(p_observacion,'')),''),
    jsonb_build_object('sesion_id',v_s.id,'tramo_id',v_t.id,'fecha',p_fecha),
    jsonb_build_object('entrega_id',v_id,'monto_declarado',p_monto,'estado','PENDIENTE'));
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_registrar_entrega_diaria_jornada(uuid,date,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_registrar_entrega_diaria_jornada(uuid,date,numeric,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bc7_entregas_diarias_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_s public.turno_sesiones; v_p public.turno_jornada_programacion; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_s FROM public.turno_sesiones WHERE id=p_turno_sesion_id;
  IF NOT FOUND OR v_s.bloque<>'JORNADA' THEN RAISE EXCEPTION 'Jornada no encontrada.' USING ERRCODE='23503'; END IF;
  IF NOT public.bc_actor_is_admin() AND (
    NOT public.tiene_permiso('turnos','ver')
    OR NOT EXISTS(SELECT 1 FROM public.turno_asignaciones a
      WHERE a.turno_sesion_id=v_s.id AND a.usuario_id=auth.uid() AND a.retirado_at IS NULL)
  ) THEN RAISE EXCEPTION 'Solo el responsable asignado o ADMIN puede consultar entregas diarias.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion WHERE id=v_s.jornada_programacion_id;
  SELECT jsonb_build_object(
    'salario_porcentaje',(SELECT c.salario_porcentaje FROM public.turno_jornada_configuracion c WHERE c.almacen_id=v_s.almacen_id),
    'fecha_inicio',v_p.fecha,
    'fecha_fin',coalesce(v_p.fecha_fin,v_p.fecha),
    'entregas',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',e.id,'fecha',e.fecha,'monto_declarado',e.monto_declarado,
        'monto_aprobado',e.monto_aprobado,'estado',e.estado,'observacion',e.observacion,
        'creado_nombre',e.creado_nombre,'creado_en',e.creado_en,
        'revisado_nombre',e.revisado_nombre,'comentario_revision',e.comentario_revision,
        'fecha_revision',e.fecha_revision
      ) ORDER BY e.fecha,e.creado_en)
      FROM public.turno_jornada_entregas_diarias e WHERE e.turno_sesion_id=v_s.id
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_entregas_diarias_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_entregas_diarias_jornada(uuid) TO authenticated;

-- Read-only sale calculation: a product family is one inventory line, with no flavour split.
CREATE OR REPLACE FUNCTION public.bc7_liquidacion_inventario_jornada(p_turno_sesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_s public.turno_sesiones;
  v_p public.turno_jornada_programacion;
  v_turno public.turnos;
  v_initial public.turno_jornada_inventario_cortes;
  v_final public.turno_jornada_inventario_cortes;
  v_is_retail boolean:=false;
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
  v_rate:=(SELECT c.salario_porcentaje FROM public.turno_jornada_configuracion c WHERE c.almacen_id=v_s.almacen_id);

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
      AND r.fecha_revision>v_start_at AND r.fecha_revision<=v_end_at
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
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at
      AND coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)<=v_end_at
    UNION ALL
    SELECT CASE WHEN v_is_retail THEN coalesce(p.producto_padre_id,p.id) ELSE p.id END,
           'BAJA',b.cantidad::numeric
    FROM public.bajas b
    JOIN public.productos p ON p.id=b.producto_id
    WHERE b.almacen_id=v_s.almacen_id AND b.estado='APROBADA'
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at
      AND coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)<=v_end_at
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
  calculated AS (
    SELECT i.product_id,pi.nombre,pi.unidad,i.qty initial_qty,coalesce(f.qty,0) final_qty,
      coalesce(mt.transfer_in,0) transfer_in,coalesce(mt.purchases_in,0) purchases_in,
      coalesce(mt.reinvestment_in,0) reinvestment_in,coalesce(mt.transfer_out,0) transfer_out,
      coalesce(mt.vales_out,0) vales_out,coalesce(mt.merma_out,0) merma_out,coalesce(mt.bajas_out,0) bajas_out,
      (i.qty+coalesce(mt.transfer_in,0)+coalesce(mt.purchases_in,0)+coalesce(mt.reinvestment_in,0)
        -coalesce(mt.transfer_out,0)-coalesce(mt.vales_out,0)-coalesce(mt.merma_out,0)-coalesce(mt.bajas_out,0)-coalesce(f.qty,0)) sold_qty,
      pi.precio_unitario,pi.estado_precio
    FROM initial_lines i
    JOIN price_info pi ON pi.product_id=i.product_id
    LEFT JOIN final_lines f ON f.product_id=i.product_id
    LEFT JOIN movement_totals mt ON mt.product_id=i.product_id
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

  SELECT coalesce(sum(g.monto),0),count(*) FILTER(WHERE g.estado='PENDIENTE')
    INTO v_expenses,v_pending_expenses
  FROM public.gastos g WHERE g.turno_sesion_id=v_s.id AND g.estado IN ('APROBADO','PENDIENTE');
  SELECT coalesce(sum(r.total),0),count(*) FILTER(WHERE r.estado='PENDIENTE')
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
  v_cash_received:=CASE WHEN v_final_counted IS NOT NULL AND v_final_cash_state='APROBADO'
    THEN v_daily_cash+v_final_counted ELSE NULL END;
  v_expected_cash:=CASE WHEN v_sales_total IS NOT NULL AND v_salary IS NOT NULL
    THEN round(v_sales_total-v_expenses-v_reinvestments-v_salary,2) ELSE NULL END;
  v_difference:=CASE WHEN v_cash_received IS NOT NULL AND v_expected_cash IS NOT NULL
    THEN round(v_cash_received-v_expected_cash,2) ELSE NULL END;
  v_complete:=v_initial.id IS NOT NULL AND v_final.id IS NOT NULL
    AND v_total_lines>0 AND v_priced_lines=v_total_lines AND v_negative_lines=0
    AND v_rate IS NOT NULL AND v_daily_pending=0 AND v_daily_missing=0
    AND v_pending_expenses=0 AND v_pending_reinvestments=0 AND v_pending_adjustments=0
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
    'pendientes',jsonb_build_object(
      'gastos',v_pending_expenses,'reinversiones',v_pending_reinvestments,
      'ajustes',v_pending_adjustments,'entregas_diarias',v_daily_pending,'entregas_diarias_faltantes',v_daily_missing
    )
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.bc7_liquidacion_inventario_jornada(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bc7_liquidacion_inventario_jornada(uuid) TO authenticated;

COMMIT;
