-- Step 5/15: backend-first model for one daily work journey.
-- Additive and historical-safe: legacy MANANA/TARDE sessions are not rewritten.
-- No production UI is switched by this migration; Step 7 owns that integration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.turno_jornada_configuracion (
  almacen_id uuid PRIMARY KEY REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  hora_inicio time NOT NULL DEFAULT TIME '07:00',
  hora_fin time NOT NULL DEFAULT TIME '23:00',
  zona_horaria text NOT NULL DEFAULT 'America/Havana',
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_config_horas_chk CHECK (hora_inicio < hora_fin)
);

INSERT INTO public.turno_jornada_configuracion (almacen_id)
SELECT a.id FROM public.almacenes a
ON CONFLICT (almacen_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.turno_jornada_patrones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  nombre text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 100),
  largo_ciclo integer NOT NULL CHECK (largo_ciclo BETWEEN 1 AND 31),
  fecha_ancla date NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_patron_id_almacen_key UNIQUE (id, almacen_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS turno_jornada_un_patron_activo_por_almacen
  ON public.turno_jornada_patrones (almacen_id) WHERE activo;

CREATE TABLE IF NOT EXISTS public.turno_jornada_patron_dias (
  patron_id uuid NOT NULL REFERENCES public.turno_jornada_patrones(id) ON DELETE RESTRICT,
  numero_dia integer NOT NULL CHECK (numero_dia BETWEEN 1 AND 31),
  trabaja boolean NOT NULL,
  responsable_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (patron_id, numero_dia),
  CONSTRAINT turno_jornada_patron_responsable_chk CHECK (
    (trabaja AND responsable_id IS NOT NULL) OR (NOT trabaja AND responsable_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.turno_jornada_programacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL REFERENCES public.turnos(id) ON DELETE RESTRICT,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  numero_dia integer NOT NULL CHECK (numero_dia > 0),
  fecha date NOT NULL,
  trabaja boolean NOT NULL,
  responsable_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  hora_inicio_prevista time NOT NULL,
  hora_fin_prevista time NOT NULL,
  zona_horaria text NOT NULL,
  patron_id uuid REFERENCES public.turno_jornada_patrones(id) ON DELETE RESTRICT,
  estado text NOT NULL CHECK (estado IN ('PROGRAMADA','DESCANSO','CANCELADA')),
  motivo_ajuste text,
  creado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actualizado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_programacion_horas_chk CHECK (hora_inicio_prevista < hora_fin_prevista),
  CONSTRAINT turno_jornada_programacion_estado_chk CHECK (
    (estado = 'PROGRAMADA' AND trabaja AND responsable_id IS NOT NULL) OR
    (estado = 'DESCANSO' AND NOT trabaja AND responsable_id IS NULL) OR
    estado = 'CANCELADA'
  ),
  CONSTRAINT turno_jornada_programacion_turno_dia_key UNIQUE (turno_id, numero_dia),
  CONSTRAINT turno_jornada_programacion_id_turno_key UNIQUE (id, turno_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS turno_jornada_un_registro_almacen_dia
  ON public.turno_jornada_programacion (almacen_id, fecha)
  WHERE estado IN ('PROGRAMADA','DESCANSO');

CREATE UNIQUE INDEX IF NOT EXISTS turno_jornada_un_responsable_dia
  ON public.turno_jornada_programacion (responsable_id, fecha)
  WHERE estado = 'PROGRAMADA' AND trabaja AND responsable_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS turno_jornada_programacion_fecha_idx
  ON public.turno_jornada_programacion (almacen_id, fecha, estado);

CREATE TABLE IF NOT EXISTS public.turno_jornada_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  programacion_id uuid REFERENCES public.turno_jornada_programacion(id) ON DELETE RESTRICT,
  patron_id uuid REFERENCES public.turno_jornada_patrones(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  motivo text,
  estado_antes jsonb,
  estado_despues jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS turno_jornada_eventos_almacen_fecha_idx
  ON public.turno_jornada_eventos (almacen_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS turno_jornada_eventos_programacion_idx
  ON public.turno_jornada_eventos (programacion_id, creado_en DESC);

ALTER TABLE public.turno_sesiones
  ADD COLUMN IF NOT EXISTS jornada_programacion_id uuid;

ALTER TABLE public.turno_sesiones
  DROP CONSTRAINT IF EXISTS turno_sesiones_bloque_check;
ALTER TABLE public.turno_sesiones
  ADD CONSTRAINT turno_sesiones_bloque_check
  CHECK (bloque = ANY (ARRAY['MANANA'::text, 'TARDE'::text, 'JORNADA'::text]));

ALTER TABLE public.turno_sesiones
  ADD CONSTRAINT turno_sesiones_jornada_programacion_fk
  FOREIGN KEY (jornada_programacion_id, turno_id)
  REFERENCES public.turno_jornada_programacion (id, turno_id) ON DELETE RESTRICT;

ALTER TABLE public.turno_sesiones
  ADD CONSTRAINT turno_sesiones_jornada_mode_chk
  CHECK (
    (bloque = 'JORNADA' AND jornada_programacion_id IS NOT NULL) OR
    (bloque IN ('MANANA','TARDE') AND jornada_programacion_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS turno_sesiones_unica_jornada_programada
  ON public.turno_sesiones (jornada_programacion_id)
  WHERE jornada_programacion_id IS NOT NULL;

-- Never mix the legacy two-block model and the new single-session model on one day.
CREATE OR REPLACE FUNCTION public.bc5_guard_no_mixed_jornada_blocks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_programacion public.turno_jornada_programacion;
BEGIN
  IF NEW.bloque = 'JORNADA' THEN
    SELECT * INTO v_programacion
    FROM public.turno_jornada_programacion p
    WHERE p.id = NEW.jornada_programacion_id AND p.turno_id = NEW.turno_id
      AND p.numero_dia = NEW.numero_dia AND p.fecha = NEW.fecha
      AND p.estado = 'PROGRAMADA' AND p.trabaja;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'JORNADA requiere programación laborable coincidente en turno, día y fecha.'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.turno_sesiones s
      WHERE s.turno_id = NEW.turno_id AND s.numero_dia = NEW.numero_dia
        AND s.id IS DISTINCT FROM NEW.id AND s.bloque IN ('MANANA','TARDE')
    ) THEN
      RAISE EXCEPTION 'No se puede mezclar JORNADA con MANANA/TARDE en el mismo día.'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.jornada_programacion_id IS NOT NULL THEN
      RAISE EXCEPTION 'Una sesión MANANA/TARDE no puede apuntar a una programación JORNADA.'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.turno_sesiones s
      WHERE s.turno_id = NEW.turno_id AND s.numero_dia = NEW.numero_dia
        AND s.id IS DISTINCT FROM NEW.id AND s.bloque = 'JORNADA'
    ) THEN
      RAISE EXCEPTION 'No se puede mezclar MANANA/TARDE con JORNADA en el mismo día.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc5_turno_sesion_no_mixed_mode ON public.turno_sesiones;
CREATE TRIGGER bc5_turno_sesion_no_mixed_mode
BEFORE INSERT OR UPDATE OF turno_id, numero_dia, fecha, bloque, jornada_programacion_id
ON public.turno_sesiones
FOR EACH ROW EXECUTE FUNCTION public.bc5_guard_no_mixed_jornada_blocks();

CREATE OR REPLACE FUNCTION public.bc5_jornada_responsable_elegible(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.roles r ON r.id = u.role_id
    WHERE u.id = p_usuario_id AND u.activo = true
      AND r.activo = true AND r.nombre IN ('Dependienta','Dueño')
  );
$function$;

-- Enforce responsibility uniqueness between new schedules and old active assignments.
CREATE OR REPLACE FUNCTION public.bc5_guard_jornada_assignment_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.estado = 'PROGRAMADA' AND NEW.trabaja AND NEW.responsable_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'bc5-responsable:' || NEW.responsable_id::text || ':' || NEW.fecha::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'bc5-almacen:' || NEW.almacen_id::text || ':' || NEW.fecha::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.turno_jornada_programacion p
      WHERE p.id IS DISTINCT FROM NEW.id AND p.responsable_id = NEW.responsable_id
        AND p.fecha = NEW.fecha AND p.estado = 'PROGRAMADA' AND p.trabaja
    ) THEN
      RAISE EXCEPTION 'La persona ya tiene otra jornada programada para esa fecha.'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.turno_sesiones s
      JOIN public.turno_asignaciones a ON a.turno_sesion_id = s.id
      JOIN public.turnos t ON t.id = s.turno_id
      WHERE s.fecha = NEW.fecha AND s.jornada_programacion_id IS NULL
        AND s.estado NOT IN ('COMPLETADA','CANCELADA')
        AND a.usuario_id = NEW.responsable_id AND a.retirado_at IS NULL
        AND COALESCE(t.estado_maestro, t.estado) NOT IN ('CERRADO','CANCELADO')
    ) THEN
      RAISE EXCEPTION 'La persona tiene una asignación legacy pendiente en esa fecha; reconcíliela primero.'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc5_jornada_no_overlap ON public.turno_jornada_programacion;
CREATE TRIGGER bc5_jornada_no_overlap
BEFORE INSERT OR UPDATE OF almacen_id, fecha, trabaja, responsable_id, estado
ON public.turno_jornada_programacion
FOR EACH ROW EXECUTE FUNCTION public.bc5_guard_jornada_assignment_conflicts();

CREATE OR REPLACE FUNCTION public.bc5_guard_legacy_assignment_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_fecha date; v_programacion_id uuid;
BEGIN
  IF NEW.retirado_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT s.fecha, s.jornada_programacion_id
    INTO v_fecha, v_programacion_id
  FROM public.turno_sesiones s WHERE s.id = NEW.turno_sesion_id;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'Sesión de turno inexistente.' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'bc5-responsable:' || NEW.usuario_id::text || ':' || v_fecha::text, 0));
  IF v_programacion_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.turno_jornada_programacion p
      WHERE p.id = v_programacion_id AND p.estado = 'PROGRAMADA'
        AND p.trabaja AND p.responsable_id = NEW.usuario_id AND p.fecha = v_fecha
    ) THEN
      RAISE EXCEPTION 'La asignación no coincide con el responsable programado de la jornada.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.turno_jornada_programacion p
    WHERE p.fecha = v_fecha AND p.estado = 'PROGRAMADA' AND p.trabaja
      AND p.responsable_id = NEW.usuario_id
  ) THEN
    RAISE EXCEPTION 'La persona ya tiene una jornada nueva programada para esa fecha.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc5_turno_asignacion_no_overlap ON public.turno_asignaciones;
CREATE TRIGGER bc5_turno_asignacion_no_overlap
BEFORE INSERT OR UPDATE OF usuario_id, turno_sesion_id, retirado_at
ON public.turno_asignaciones
FOR EACH ROW EXECUTE FUNCTION public.bc5_guard_legacy_assignment_conflicts();

CREATE OR REPLACE FUNCTION public.bc5_configurar_horario_jornada(
  p_almacen_id uuid,
  p_hora_inicio time DEFAULT TIME '07:00',
  p_hora_fin time DEFAULT TIME '23:00',
  p_zona_horaria text DEFAULT 'America/Havana'
)
RETURNS public.turno_jornada_configuracion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_before jsonb; v_after public.turno_jornada_configuracion;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede configurar el horario de jornada.'
      USING ERRCODE = '42501';
  END IF;
  IF p_hora_inicio IS NULL OR p_hora_fin IS NULL OR p_hora_inicio >= p_hora_fin THEN
    RAISE EXCEPTION 'El horario debe comenzar antes de terminar dentro del mismo día.'
      USING ERRCODE = '22007';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_zona_horaria) THEN
    RAISE EXCEPTION 'Zona horaria IANA inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id = p_almacen_id AND activo = true) THEN
    RAISE EXCEPTION 'Almacén inexistente o inactivo.' USING ERRCODE = '23503';
  END IF;
  INSERT INTO public.turno_jornada_configuracion (almacen_id)
  VALUES (p_almacen_id) ON CONFLICT (almacen_id) DO NOTHING;
  SELECT to_jsonb(c) INTO v_before FROM public.turno_jornada_configuracion c
  WHERE c.almacen_id = p_almacen_id FOR UPDATE;
  UPDATE public.turno_jornada_configuracion
  SET hora_inicio = p_hora_inicio, hora_fin = p_hora_fin,
      zona_horaria = p_zona_horaria, actualizado_por = auth.uid(), actualizado_en = now()
  WHERE almacen_id = p_almacen_id RETURNING * INTO v_after;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id, actor_user_id, tipo, motivo, estado_antes, estado_despues)
  VALUES (p_almacen_id, auth.uid(), 'HORARIO_CONFIGURADO',
          'Cambio administrativo; los calendarios existentes conservan su horario de programación.',
          v_before, to_jsonb(v_after));
  RETURN v_after;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc5_obtener_configuracion_jornada(p_almacen_id uuid)
RETURNS public.turno_jornada_configuracion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_config public.turno_jornada_configuracion;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede consultar la configuración de jornada.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_config FROM public.turno_jornada_configuracion
  WHERE almacen_id = p_almacen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuración de jornada no encontrada.' USING ERRCODE = 'P0002'; END IF;
  RETURN v_config;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc5_guardar_patron_jornada(
  p_almacen_id uuid,
  p_nombre text,
  p_fecha_ancla date,
  p_patron jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_len integer; v_count integer; v_distinct integer; v_min integer; v_max integer;
  v_new_id uuid; v_item jsonb; v_numero integer; v_trabaja boolean; v_responsable uuid;
  v_old_id uuid; v_old jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede configurar rotación de jornada.'
      USING ERRCODE = '42501';
  END IF;
  IF trim(coalesce(p_nombre,'')) = '' OR length(trim(p_nombre)) > 100
     OR p_fecha_ancla IS NULL OR jsonb_typeof(p_patron) <> 'array' THEN
    RAISE EXCEPTION 'Nombre, fecha ancla y patrón son obligatorios.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id=p_almacen_id AND activo=true) THEN
    RAISE EXCEPTION 'Almacén inexistente o inactivo.' USING ERRCODE = '23503';
  END IF;
  v_len := jsonb_array_length(p_patron);
  IF v_len < 1 OR v_len > 31 THEN
    RAISE EXCEPTION 'El ciclo de rotación debe tener entre 1 y 31 días.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), count(DISTINCT (x.value->>'numero_dia')::integer),
         min((x.value->>'numero_dia')::integer), max((x.value->>'numero_dia')::integer)
    INTO v_count, v_distinct, v_min, v_max
  FROM jsonb_array_elements(p_patron) AS x(value);
  IF v_count <> v_len OR v_distinct <> v_len OR v_min <> 1 OR v_max <> v_len THEN
    RAISE EXCEPTION 'El patrón debe declarar exactamente una fila para cada día del ciclo (1..N).'
      USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_patron) AS x(value) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR coalesce(v_item->>'trabaja','') NOT IN ('true','false') THEN
      RAISE EXCEPTION 'Cada día necesita trabaja=true/false.' USING ERRCODE = '22023';
    END IF;
    v_numero := (v_item->>'numero_dia')::integer;
    v_trabaja := (v_item->>'trabaja')::boolean;
    v_responsable := nullif(v_item->>'responsable_id','')::uuid;
    IF v_numero < 1 OR v_numero > v_len THEN
      RAISE EXCEPTION 'Número de día fuera del ciclo.' USING ERRCODE = '22023';
    END IF;
    IF v_trabaja AND v_responsable IS NULL THEN
      RAISE EXCEPTION 'El día % trabaja, pero no tiene responsable explícito.',v_numero
        USING ERRCODE = '22023';
    END IF;
    IF NOT v_trabaja AND v_responsable IS NOT NULL THEN
      RAISE EXCEPTION 'El día % es descanso y no puede tener responsable.',v_numero
        USING ERRCODE = '22023';
    END IF;
    IF v_trabaja AND NOT public.bc5_jornada_responsable_elegible(v_responsable) THEN
      RAISE EXCEPTION 'El responsable del día % no está activo o no tiene rol elegible.',v_numero
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  SELECT p.id, to_jsonb(p) || jsonb_build_object(
    'dias', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.numero_dia)
                      FROM public.turno_jornada_patron_dias d WHERE d.patron_id=p.id), '[]'::jsonb))
  INTO v_old_id, v_old
  FROM public.turno_jornada_patrones p
  WHERE p.almacen_id=p_almacen_id AND p.activo FOR UPDATE;
  UPDATE public.turno_jornada_patrones SET activo=false
  WHERE almacen_id=p_almacen_id AND activo;
  INSERT INTO public.turno_jornada_patrones
    (almacen_id,nombre,largo_ciclo,fecha_ancla,activo,creado_por)
  VALUES (p_almacen_id,trim(p_nombre),v_len,p_fecha_ancla,true,auth.uid())
  RETURNING id INTO v_new_id;
  INSERT INTO public.turno_jornada_patron_dias (patron_id,numero_dia,trabaja,responsable_id)
  SELECT v_new_id,(x.value->>'numero_dia')::integer,
         (x.value->>'trabaja')::boolean,nullif(x.value->>'responsable_id','')::uuid
  FROM jsonb_array_elements(p_patron) AS x(value);
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,patron_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (p_almacen_id,v_new_id,auth.uid(),'PATRON_ROTACION_ACTUALIZADO',
    'El ciclo y el responsable se definieron explícitamente por administración; no se infiere rotación.',
    v_old,jsonb_build_object('id',v_new_id,'nombre',trim(p_nombre),'largo_ciclo',v_len,
      'fecha_ancla',p_fecha_ancla,
      'dias',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.numero_dia)
              FROM public.turno_jornada_patron_dias d WHERE d.patron_id=v_new_id)));
  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc5_previsualizar_jornada(
  p_almacen_id uuid, p_fecha_inicio date, p_dias integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cfg public.turno_jornada_configuracion; v_patron public.turno_jornada_patrones;
  v_dia public.turno_jornada_patron_dias; v_date date; v_numero integer; v_offset integer;
  v_result jsonb := '[]'::jsonb; v_conflict text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede previsualizar la programación.'
      USING ERRCODE = '42501';
  END IF;
  IF p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 31 OR p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'Rango de programación inválido.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_cfg FROM public.turno_jornada_configuracion WHERE almacen_id=p_almacen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuración de jornada no encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF p_fecha_inicio < (now() AT TIME ZONE v_cfg.zona_horaria)::date THEN
    RAISE EXCEPTION 'No se admiten programaciones retroactivas; use una corrección auditada.'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_patron FROM public.turno_jornada_patrones
  WHERE almacen_id=p_almacen_id AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay patrón activo; configure rotación o introduzca días explícitos.'
    USING ERRCODE = 'P0002'; END IF;
  FOR v_numero IN 1..p_dias LOOP
    v_date := p_fecha_inicio + (v_numero-1);
    v_offset := (((v_date-v_patron.fecha_ancla) % v_patron.largo_ciclo)
                 + v_patron.largo_ciclo) % v_patron.largo_ciclo + 1;
    SELECT * INTO v_dia FROM public.turno_jornada_patron_dias
    WHERE patron_id=v_patron.id AND numero_dia=v_offset;
    IF NOT FOUND THEN RAISE EXCEPTION 'Patrón incompleto en día %.',v_offset USING ERRCODE = '23514'; END IF;
    v_conflict := NULL;
    IF EXISTS (SELECT 1 FROM public.turno_jornada_programacion p
      WHERE p.almacen_id=p_almacen_id AND p.fecha=v_date AND p.estado IN ('PROGRAMADA','DESCANSO')) THEN
      v_conflict := 'Ya existe programación en ese almacén y fecha.';
    ELSIF v_dia.trabaja AND EXISTS (SELECT 1 FROM public.turno_jornada_programacion p
      WHERE p.responsable_id=v_dia.responsable_id AND p.fecha=v_date
        AND p.estado='PROGRAMADA' AND p.trabaja) THEN
      v_conflict := 'El responsable está asignado a otra jornada en esa fecha.';
    ELSIF v_dia.trabaja AND EXISTS (
      SELECT 1 FROM public.turno_sesiones s
      JOIN public.turno_asignaciones a ON a.turno_sesion_id=s.id
      JOIN public.turnos t ON t.id=s.turno_id
      WHERE s.fecha=v_date AND s.jornada_programacion_id IS NULL
        AND s.estado NOT IN ('COMPLETADA','CANCELADA') AND a.usuario_id=v_dia.responsable_id
        AND a.retirado_at IS NULL AND COALESCE(t.estado_maestro,t.estado) NOT IN ('CERRADO','CANCELADO')) THEN
      v_conflict := 'El responsable mantiene una asignación legacy en esa fecha.';
    END IF;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'numero_dia',v_numero,'fecha',v_date,'trabaja',v_dia.trabaja,
      'responsable_id',v_dia.responsable_id,
      'estado',CASE WHEN v_dia.trabaja THEN 'PROGRAMADA' ELSE 'DESCANSO' END,
      'hora_inicio_prevista',v_cfg.hora_inicio,'hora_fin_prevista',v_cfg.hora_fin,
      'zona_horaria',v_cfg.zona_horaria,'patron_id',v_patron.id,
      'conflicto',v_conflict IS NOT NULL,'motivo_conflicto',v_conflict));
  END LOOP;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc5_crear_jornada_unica(
  p_almacen_id uuid,
  p_fecha_inicio date,
  p_dias integer,
  p_programacion jsonb DEFAULT NULL,
  p_observacion text DEFAULT NULL
)
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
  IF p_fecha_inicio IS NULL OR p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'La programación debe abarcar entre 1 y 31 días.' USING ERRCODE = '22023';
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
$function$;

CREATE OR REPLACE FUNCTION public.bc5_reprogramar_jornada(
  p_programacion_id uuid, p_trabaja boolean,
  p_responsable_id uuid DEFAULT NULL, p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_p public.turno_jornada_programacion; v_before jsonb;
  v_sesion public.turno_sesiones; v_activo public.turno_asignaciones;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede reprogramar jornadas.' USING ERRCODE = '42501';
  END IF;
  IF trim(coalesce(p_motivo,'')) = '' THEN
    RAISE EXCEPTION 'La ausencia, sustitución o corrección requiere motivo auditable.' USING ERRCODE = '22023';
  END IF;
  IF p_trabaja AND p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'Una jornada laborable requiere responsable explícito.' USING ERRCODE = '22023';
  END IF;
  IF NOT p_trabaja AND p_responsable_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un descanso no puede tener responsable.' USING ERRCODE = '22023';
  END IF;
  IF p_trabaja AND NOT public.bc5_jornada_responsable_elegible(p_responsable_id) THEN
    RAISE EXCEPTION 'Responsable no elegible.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.turno_jornada_programacion
  WHERE id=p_programacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programación no encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF v_p.estado='CANCELADA' THEN RAISE EXCEPTION 'No se puede editar una programación cancelada.' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.turnos t WHERE t.id=v_p.turno_id
      AND COALESCE(t.estado_maestro,t.estado) NOT IN ('PROGRAMADO','PENDIENTE')) THEN
    RAISE EXCEPTION 'Solo se puede reprogramar una jornada antes de iniciar el Turno.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_sesion FROM public.turno_sesiones
  WHERE jornada_programacion_id=v_p.id FOR UPDATE;
  IF FOUND THEN
    IF v_sesion.estado NOT IN ('PENDIENTE','PROGRAMADA','CANCELADA') THEN
      RAISE EXCEPTION 'No se puede cambiar una jornada que ya comenzó.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_activo FROM public.turno_asignaciones
    WHERE turno_sesion_id=v_sesion.id AND retirado_at IS NULL
    ORDER BY asignado_at DESC NULLS LAST,created_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  END IF;
  v_before := to_jsonb(v_p);
  UPDATE public.turno_jornada_programacion
  SET trabaja=p_trabaja,responsable_id=CASE WHEN p_trabaja THEN p_responsable_id ELSE NULL END,
      estado=CASE WHEN p_trabaja THEN 'PROGRAMADA' ELSE 'DESCANSO' END,
      motivo_ajuste=trim(p_motivo),actualizado_por=auth.uid(),actualizado_en=now()
  WHERE id=v_p.id RETURNING * INTO v_p;
  IF v_sesion.id IS NOT NULL THEN
    IF v_activo.id IS NOT NULL THEN
      UPDATE public.turno_asignaciones SET retirado_at=now(),motivo=trim(p_motivo)
      WHERE id=v_activo.id AND retirado_at IS NULL;
    END IF;
    IF p_trabaja THEN
      IF v_sesion.estado='CANCELADA' THEN
        UPDATE public.turno_sesiones SET estado='PROGRAMADA',updated_at=now()
        WHERE id=v_sesion.id;
      END IF;
      IF v_activo.id IS NULL OR v_activo.usuario_id IS DISTINCT FROM p_responsable_id THEN
        INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
        VALUES (v_sesion.id,v_p.turno_id,p_responsable_id,auth.uid());
      END IF;
    ELSE
      UPDATE public.turno_sesiones SET estado='CANCELADA',updated_at=now()
      WHERE id=v_sesion.id AND estado IN ('PENDIENTE','PROGRAMADA','CANCELADA');
    END IF;
  ELSIF p_trabaja THEN
    INSERT INTO public.turno_sesiones
      (turno_id,almacen_id,numero_dia,bloque,fecha,estado,jornada_programacion_id)
    VALUES (v_p.turno_id,v_p.almacen_id,v_p.numero_dia,'JORNADA',v_p.fecha,'PROGRAMADA',v_p.id)
    RETURNING * INTO v_sesion;
    INSERT INTO public.turno_asignaciones(turno_sesion_id,turno_id,usuario_id,asignado_por)
    VALUES (v_sesion.id,v_p.turno_id,p_responsable_id,auth.uid());
  END IF;
  INSERT INTO public.turno_jornada_eventos
    (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
  VALUES (v_p.almacen_id,v_p.id,auth.uid(),'JORNADA_REPROGRAMADA',trim(p_motivo),v_before,
          to_jsonb(v_p)||jsonb_build_object('sesion_id',v_sesion.id));
  RETURN jsonb_build_object('programacion_id',v_p.id,'fecha',v_p.fecha,'trabaja',v_p.trabaja,
    'responsable_id',v_p.responsable_id,'estado',v_p.estado,'motivo',v_p.motivo_ajuste,
    'sesion_id',v_sesion.id);
END;
$function$;

-- The new tables are never directly writable/readable through the Data API.
-- Use the SECURITY DEFINER RPCs above; RLS remains enabled as defense-in-depth.
ALTER TABLE public.turno_jornada_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_jornada_patrones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_jornada_patron_dias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_jornada_programacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turno_jornada_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.turno_jornada_configuracion, public.turno_jornada_patrones,
  public.turno_jornada_patron_dias, public.turno_jornada_programacion, public.turno_jornada_eventos
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.bc5_guard_no_mixed_jornada_blocks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_jornada_responsable_elegible(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_guard_jornada_assignment_conflicts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_guard_legacy_assignment_conflicts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_configurar_horario_jornada(uuid,time,time,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_obtener_configuracion_jornada(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_guardar_patron_jornada(uuid,text,date,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_previsualizar_jornada(uuid,date,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_crear_jornada_unica(uuid,date,integer,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc5_reprogramar_jornada(uuid,boolean,uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bc5_configurar_horario_jornada(uuid,time,time,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc5_obtener_configuracion_jornada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc5_guardar_patron_jornada(uuid,text,date,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc5_previsualizar_jornada(uuid,date,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc5_crear_jornada_unica(uuid,date,integer,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc5_reprogramar_jornada(uuid,boolean,uuid,text) TO authenticated;

COMMIT;
