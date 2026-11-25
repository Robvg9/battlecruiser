BEGIN;

-- Una relación de personal por almacén. El porcentaje queda ligado a la dependienta,
-- no a todo el almacén. Las jornadas ya iniciadas/cerradas conservan su snapshot.
CREATE TABLE IF NOT EXISTS public.almacen_dependienta_configuracion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  activo boolean NOT NULL DEFAULT true,
  salario_porcentaje_permanente numeric(5,2),
  salario_porcentaje_temporal numeric(5,2),
  salario_temporal_programacion_id uuid,
  salario_temporal_consumido_en timestamptz,
  creado_por uuid REFERENCES auth.users(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users(id),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT almacen_dependienta_porcentaje_permanente_ck
    CHECK (salario_porcentaje_permanente IS NULL OR salario_porcentaje_permanente BETWEEN 0 AND 100),
  CONSTRAINT almacen_dependienta_porcentaje_temporal_ck
    CHECK (salario_porcentaje_temporal IS NULL OR salario_porcentaje_temporal BETWEEN 0 AND 100),
  CONSTRAINT almacen_dependienta_temporal_consumo_ck
    CHECK (salario_temporal_consumido_en IS NULL OR salario_temporal_programacion_id IS NOT NULL),
  CONSTRAINT almacen_dependienta_almacen_usuario_uk UNIQUE (almacen_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS almacen_dependienta_activas_idx
  ON public.almacen_dependienta_configuracion (almacen_id, usuario_id)
  WHERE activo = true;

CREATE TABLE IF NOT EXISTS public.almacen_dependienta_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id),
  accion text NOT NULL CHECK (accion IN (
    'ASIGNADA','DESASIGNADA','SALARIO_PERMANENTE_CONFIGURADO',
    'SALARIO_TEMPORAL_CONFIGURADO','SALARIO_TEMPORAL_APLICADO'
  )),
  estado_antes jsonb,
  estado_despues jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS almacen_dependienta_eventos_lookup_idx
  ON public.almacen_dependienta_eventos (almacen_id, usuario_id, creado_en DESC);

ALTER TABLE public.almacen_dependienta_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.almacen_dependienta_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.almacen_dependienta_configuracion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.almacen_dependienta_eventos FROM PUBLIC, anon, authenticated;

-- Conserva el comportamiento vigente sin inventar asignaciones nuevas:
-- cada dependienta que forma parte de un patrón activo o de una jornada futura/no iniciada
-- queda vinculada a su almacén y recibe el porcentaje histórico configurado para ese almacén.
WITH responsables AS (
  SELECT p.almacen_id, p.responsable_id AS usuario_id
  FROM public.turno_jornada_programacion p
  WHERE p.trabaja = true AND p.estado = 'PROGRAMADA'
    AND p.fecha >= (now() AT TIME ZONE COALESCE((
      SELECT cfg.zona_horaria FROM public.turno_jornada_configuracion cfg
      WHERE cfg.almacen_id = p.almacen_id
    ), 'America/Havana'))::date
    AND p.responsable_id IS NOT NULL
  UNION
  SELECT patron.almacen_id, dia.responsable_id
  FROM public.turno_jornada_patrones patron
  JOIN public.turno_jornada_patron_dias dia ON dia.patron_id = patron.id
  WHERE patron.activo = true AND dia.trabaja = true AND dia.responsable_id IS NOT NULL
  UNION
  SELECT s.almacen_id, a.usuario_id
  FROM public.turno_sesiones s
  JOIN public.turno_asignaciones a ON a.turno_sesion_id = s.id
  WHERE s.estado IN ('PENDIENTE','PROGRAMADA')
    AND s.bloque = 'JORNADA' AND a.retirado_at IS NULL
)
INSERT INTO public.almacen_dependienta_configuracion
  (almacen_id, usuario_id, activo, salario_porcentaje_permanente, creado_por, actualizado_por)
SELECT DISTINCT r.almacen_id, r.usuario_id, true,
       COALESCE(latest.salario_porcentaje, cfg.salario_porcentaje),
       NULL, NULL
FROM responsables r
JOIN public.almacenes al ON al.id = r.almacen_id AND al.activo = true
JOIN public.usuarios u ON u.id = r.usuario_id AND u.activo = true AND u.archivado = false
JOIN public.roles rol ON rol.id = u.role_id AND rol.activo = true
LEFT JOIN public.turno_jornada_configuracion cfg ON cfg.almacen_id = r.almacen_id
LEFT JOIN LATERAL (
  SELECT p.salario_porcentaje
  FROM public.turno_jornada_programacion p
  JOIN public.turno_sesiones s
    ON s.jornada_programacion_id = p.id AND s.turno_id = p.turno_id
  WHERE p.almacen_id = r.almacen_id AND p.responsable_id = r.usuario_id
    AND p.trabaja = true AND p.estado = 'PROGRAMADA'
    AND p.fecha >= (now() AT TIME ZONE COALESCE(cfg.zona_horaria, 'America/Havana'))::date
    AND s.estado IN ('PENDIENTE','PROGRAMADA')
    AND p.salario_porcentaje IS NOT NULL
  ORDER BY p.fecha, p.numero_dia
  LIMIT 1
) latest ON true
WHERE lower(btrim(rol.nombre)) IN ('dependienta','dependientas')
ON CONFLICT (almacen_id, usuario_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bc8_listar_dependientas_almacen(p_almacen_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_asignadas jsonb;
  v_disponibles jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede administrar el equipo del almacén.'
      USING ERRCODE = '42501';
  END IF;
  IF p_almacen_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.almacenes WHERE id = p_almacen_id
  ) THEN
    RAISE EXCEPTION 'Almacén inexistente.' USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'usuario_id', c.usuario_id,
      'nombre', u.nombre,
      'activo', c.activo,
      'salario_porcentaje_permanente', c.salario_porcentaje_permanente,
      'salario_porcentaje_temporal', c.salario_porcentaje_temporal,
      'salario_temporal_programacion_id', c.salario_temporal_programacion_id,
      'salario_temporal_fecha', (
        SELECT p.fecha FROM public.turno_jornada_programacion p
        WHERE p.id = c.salario_temporal_programacion_id
      ),
      'salario_temporal_consumido_en', c.salario_temporal_consumido_en,
      'asignado_en', c.creado_en,
      'actualizado_en', c.actualizado_en
    ) ORDER BY u.nombre
  ), '[]'::jsonb)
  INTO v_asignadas
  FROM public.almacen_dependienta_configuracion c
  JOIN public.usuarios u ON u.id = c.usuario_id
  WHERE c.almacen_id = p_almacen_id AND c.activo = true;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('usuario_id', u.id, 'nombre', u.nombre)
    ORDER BY u.nombre
  ), '[]'::jsonb)
  INTO v_disponibles
  FROM public.usuarios u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.activo = true AND u.archivado = false AND r.activo = true
    AND lower(btrim(r.nombre)) IN ('dependienta','dependientas')
    AND NOT EXISTS (
      SELECT 1 FROM public.almacen_dependienta_configuracion c
      WHERE c.almacen_id = p_almacen_id AND c.usuario_id = u.id AND c.activo = true
    );

  RETURN jsonb_build_object(
    'almacen_id', p_almacen_id,
    'dependientas', v_asignadas,
    'disponibles', v_disponibles
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc8_configurar_dependienta_almacen(
  p_almacen_id uuid,
  p_usuario_id uuid,
  p_asignada boolean,
  p_salario_porcentaje numeric,
  p_vigencia_tipo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_row public.almacen_dependienta_configuracion;
  v_timezone text;
  v_local_today date;
  v_target_id uuid;
  v_target_date date;
  v_aplicacion text := 'PENDIENTE';
  v_action text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede configurar el equipo y los salarios del almacén.'
      USING ERRCODE = '42501';
  END IF;
  IF p_almacen_id IS NULL OR p_usuario_id IS NULL OR p_asignada IS NULL THEN
    RAISE EXCEPTION 'Almacén, dependienta y decisión de asignación son obligatorios.'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id = p_almacen_id AND activo = true) THEN
    RAISE EXCEPTION 'El almacén no existe o está inactivo.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    JOIN public.roles r ON r.id = u.role_id
    WHERE u.id = p_usuario_id AND u.activo = true AND u.archivado = false
      AND r.activo = true
      AND lower(btrim(r.nombre)) IN ('dependienta','dependientas')
  ) THEN
    RAISE EXCEPTION 'Solo se pueden asignar dependientas activas y no archivadas.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(zona_horaria, 'America/Havana')
  INTO v_timezone
  FROM public.turno_jornada_configuracion
  WHERE almacen_id = p_almacen_id;
  v_timezone := COALESCE(v_timezone, 'America/Havana');
  v_local_today := (now() AT TIME ZONE v_timezone)::date;

  SELECT to_jsonb(c) INTO v_before
  FROM public.almacen_dependienta_configuracion c
  WHERE c.almacen_id = p_almacen_id AND c.usuario_id = p_usuario_id
  FOR UPDATE;

  IF p_asignada = false THEN
    UPDATE public.almacen_dependienta_configuracion
    SET activo = false, actualizado_por = auth.uid(), actualizado_en = now()
    WHERE almacen_id = p_almacen_id AND usuario_id = p_usuario_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La dependienta no está asignada a este almacén.'
        USING ERRCODE = 'P0002';
    END IF;
    v_action := 'DESASIGNADA';
    v_aplicacion := 'SIN_CAMBIOS_EN_JORNADAS_YA_PROGRAMADAS';
  ELSE
    IF p_salario_porcentaje IS NULL OR p_salario_porcentaje < 0 OR p_salario_porcentaje > 100 THEN
      RAISE EXCEPTION 'El porcentaje salarial debe estar entre 0 y 100.'
        USING ERRCODE = '22023';
    END IF;
    IF upper(coalesce(p_vigencia_tipo,'')) NOT IN ('PERMANENTE','PROXIMA_JORNADA') THEN
      RAISE EXCEPTION 'La vigencia debe ser PERMANENTE o PROXIMA_JORNADA.'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.almacen_dependienta_configuracion (
      almacen_id, usuario_id, activo,
      salario_porcentaje_permanente, salario_porcentaje_temporal,
      salario_temporal_programacion_id, salario_temporal_consumido_en,
      creado_por, actualizado_por, actualizado_en
    )
    VALUES (
      p_almacen_id, p_usuario_id, true,
      CASE WHEN upper(p_vigencia_tipo) = 'PERMANENTE' THEN p_salario_porcentaje ELSE NULL END,
      CASE WHEN upper(p_vigencia_tipo) = 'PROXIMA_JORNADA' THEN p_salario_porcentaje ELSE NULL END,
      NULL, NULL, auth.uid(), auth.uid(), now()
    )
    ON CONFLICT (almacen_id, usuario_id) DO UPDATE
    SET activo = true,
        salario_porcentaje_permanente = CASE
          WHEN upper(p_vigencia_tipo) = 'PERMANENTE' THEN EXCLUDED.salario_porcentaje_permanente
          ELSE almacen_dependienta_configuracion.salario_porcentaje_permanente
        END,
        salario_porcentaje_temporal = EXCLUDED.salario_porcentaje_temporal,
        salario_temporal_programacion_id = NULL,
        salario_temporal_consumido_en = NULL,
        actualizado_por = auth.uid(),
        actualizado_en = now()
    RETURNING * INTO v_row;

    IF upper(p_vigencia_tipo) = 'PERMANENTE' THEN
      -- Solo se actualizan snapshots todavía no iniciados. El historial queda congelado.
      UPDATE public.turno_jornada_programacion p
      SET salario_porcentaje = p_salario_porcentaje,
          actualizado_por = auth.uid(),
          actualizado_en = now()
      FROM public.turno_sesiones s
      WHERE s.jornada_programacion_id = p.id
        AND s.turno_id = p.turno_id
        AND s.estado IN ('PENDIENTE','PROGRAMADA')
        AND p.almacen_id = p_almacen_id
        AND p.responsable_id = p_usuario_id
        AND p.trabaja = true AND p.estado = 'PROGRAMADA'
        AND p.fecha >= v_local_today
        AND NOT EXISTS (
          SELECT 1 FROM public.turno_tramos t WHERE t.turno_sesion_id = s.id
        );
      v_action := CASE WHEN v_before IS NULL
        THEN 'ASIGNADA' ELSE 'SALARIO_PERMANENTE_CONFIGURADO' END;
      v_aplicacion := 'TODAS_LAS_JORNADAS_FUTURAS_NO_INICIADAS';
    ELSE
      SELECT p.id, p.fecha
      INTO v_target_id, v_target_date
      FROM public.turno_jornada_programacion p
      JOIN public.turno_sesiones s
        ON s.jornada_programacion_id = p.id AND s.turno_id = p.turno_id
      WHERE p.almacen_id = p_almacen_id
        AND p.responsable_id = p_usuario_id
        AND p.trabaja = true AND p.estado = 'PROGRAMADA'
        AND p.fecha >= v_local_today
        AND s.estado IN ('PENDIENTE','PROGRAMADA')
        AND NOT EXISTS (
          SELECT 1 FROM public.turno_tramos t WHERE t.turno_sesion_id = s.id
        )
      ORDER BY p.fecha, p.numero_dia
      LIMIT 1
      FOR UPDATE OF p, s;

      IF v_target_id IS NOT NULL THEN
        UPDATE public.turno_jornada_programacion
        SET salario_porcentaje = p_salario_porcentaje,
            actualizado_por = auth.uid(),
            actualizado_en = now()
        WHERE id = v_target_id;
        UPDATE public.almacen_dependienta_configuracion
        SET salario_temporal_programacion_id = v_target_id,
            salario_temporal_consumido_en = now(),
            actualizado_por = auth.uid(),
            actualizado_en = now()
        WHERE almacen_id = p_almacen_id AND usuario_id = p_usuario_id;
        v_aplicacion := 'ASIGNADA_A_PROXIMA_JORNADA_PROGRAMADA';
      ELSE
        v_aplicacion := 'PENDIENTE_HASTA_PROXIMA_JORNADA';
      END IF;
      v_action := CASE WHEN v_before IS NULL
        THEN 'ASIGNADA' ELSE 'SALARIO_TEMPORAL_CONFIGURADO' END;
    END IF;

    SELECT * INTO v_row
    FROM public.almacen_dependienta_configuracion
    WHERE almacen_id = p_almacen_id AND usuario_id = p_usuario_id;
  END IF;

  v_after := to_jsonb(v_row);
  INSERT INTO public.almacen_dependienta_eventos
    (almacen_id, usuario_id, actor_user_id, accion, estado_antes, estado_despues)
  VALUES (p_almacen_id, p_usuario_id, auth.uid(), v_action, v_before, v_after);

  RETURN jsonb_build_object(
    'ok', true,
    'almacen_id', p_almacen_id,
    'usuario_id', p_usuario_id,
    'asignada', v_row.activo,
    'vigencia', upper(coalesce(p_vigencia_tipo,'PERMANENTE')),
    'aplicacion', v_aplicacion,
    'programacion_id', v_target_id,
    'fecha', v_target_date
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc8_aplicar_salario_dependienta_programada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_config public.almacen_dependienta_configuracion;
  v_timezone text;
  v_local_today date;
  v_prior_id uuid;
  v_uses_temporary boolean := false;
BEGIN
  -- Si se cancela, cambia de responsable o deja de trabajar, libera una
  -- asignación temporal pendiente que estuviera reservada para esta fila.
  IF TG_OP = 'UPDATE'
     AND OLD.responsable_id IS NOT NULL
     AND (
       OLD.responsable_id IS DISTINCT FROM NEW.responsable_id
       OR OLD.almacen_id IS DISTINCT FROM NEW.almacen_id
       OR NEW.trabaja IS DISTINCT FROM true
       OR NEW.estado IS DISTINCT FROM 'PROGRAMADA'
     ) THEN
    UPDATE public.almacen_dependienta_configuracion
    SET salario_temporal_programacion_id = NULL,
        salario_temporal_consumido_en = NULL,
        actualizado_en = now()
    WHERE almacen_id = OLD.almacen_id
      AND usuario_id = OLD.responsable_id
      AND salario_temporal_programacion_id = OLD.id;
  END IF;

  IF NEW.trabaja IS DISTINCT FROM true
     OR NEW.estado IS DISTINCT FROM 'PROGRAMADA'
     OR NEW.responsable_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT lower(btrim(r.nombre))
  INTO v_role
  FROM public.usuarios u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = NEW.responsable_id
    AND u.activo = true AND u.archivado = false AND r.activo = true;

  IF v_role IN ('dueño','dueno') THEN
    -- El rol Dueño conserva el comportamiento legado si alguna vez se programa.
    IF NEW.salario_porcentaje IS NULL THEN
      SELECT c.salario_porcentaje INTO NEW.salario_porcentaje
      FROM public.turno_jornada_configuracion c
      WHERE c.almacen_id = NEW.almacen_id;
    END IF;
    RETURN NEW;
  END IF;

  IF v_role IS NULL OR v_role NOT IN ('dependienta','dependientas') THEN
    RAISE EXCEPTION 'La responsable no existe, está inactiva o no tiene el rol Dependienta.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_config
  FROM public.almacen_dependienta_configuracion c
  WHERE c.almacen_id = NEW.almacen_id
    AND c.usuario_id = NEW.responsable_id
    AND c.activo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Antes de programar la Jornada, asigna esta dependienta al almacén desde la sección Almacenes.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(c.zona_horaria, 'America/Havana')
  INTO v_timezone
  FROM public.turno_jornada_configuracion c
  WHERE c.almacen_id = NEW.almacen_id;
  v_local_today := (now() AT TIME ZONE COALESCE(v_timezone,'America/Havana'))::date;

  IF v_config.salario_porcentaje_temporal IS NOT NULL THEN
    IF v_config.salario_temporal_programacion_id = NEW.id THEN
      v_uses_temporary := true;
    ELSIF v_config.salario_temporal_programacion_id IS NULL THEN
      SELECT p.id INTO v_prior_id
      FROM public.turno_jornada_programacion p
      WHERE p.id IS DISTINCT FROM NEW.id
        AND p.almacen_id = NEW.almacen_id
        AND p.responsable_id = NEW.responsable_id
        AND p.trabaja = true AND p.estado = 'PROGRAMADA'
        AND p.fecha >= v_local_today
        AND NOT EXISTS (
          SELECT 1 FROM public.turno_sesiones s
          WHERE s.jornada_programacion_id = p.id
            AND s.estado NOT IN ('PENDIENTE','PROGRAMADA')
        )
      ORDER BY p.fecha, p.numero_dia
      LIMIT 1;

      v_uses_temporary := v_prior_id IS NULL;
      IF v_prior_id IS NOT NULL THEN
        SELECT (NEW.fecha, NEW.numero_dia) < (p.fecha, p.numero_dia)
        INTO v_uses_temporary
        FROM public.turno_jornada_programacion p
        WHERE p.id = v_prior_id;
      END IF;
    END IF;
  END IF;

  IF v_uses_temporary THEN
    NEW.salario_porcentaje := v_config.salario_porcentaje_temporal;
    IF v_config.salario_temporal_programacion_id IS NULL THEN
      UPDATE public.almacen_dependienta_configuracion
      SET salario_temporal_programacion_id = NEW.id,
          salario_temporal_consumido_en = now(),
          actualizado_en = now()
      WHERE almacen_id = NEW.almacen_id AND usuario_id = NEW.responsable_id;

      INSERT INTO public.almacen_dependienta_eventos
        (almacen_id, usuario_id, actor_user_id, accion, estado_antes, estado_despues)
      VALUES (
        NEW.almacen_id, NEW.responsable_id, auth.uid(), 'SALARIO_TEMPORAL_APLICADO',
        to_jsonb(v_config),
        jsonb_build_object('programacion_id',NEW.id,'fecha',NEW.fecha,
          'salario_porcentaje',v_config.salario_porcentaje_temporal)
      );
    END IF;
  ELSE
    NEW.salario_porcentaje := v_config.salario_porcentaje_permanente;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bc8_aplicar_salario_dependienta_programada
  ON public.turno_jornada_programacion;
CREATE TRIGGER bc8_aplicar_salario_dependienta_programada
  BEFORE INSERT OR UPDATE OF almacen_id, responsable_id, trabaja, estado
  ON public.turno_jornada_programacion
  FOR EACH ROW
  EXECUTE FUNCTION public.bc8_aplicar_salario_dependienta_programada();

-- El RPC anterior ya no debe cambiar el porcentaje global del almacén desde la revisión de una Jornada.
CREATE OR REPLACE FUNCTION public.bc7_configurar_salario_porcentaje_jornada(
  p_turno_sesion_id uuid,
  p_porcentaje numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.tiene_permiso('reinversiones','editar_any') THEN
    RAISE EXCEPTION 'Solo Dueño autenticado puede administrar los porcentajes salariales.'
      USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'El porcentaje salarial se configura por dependienta en la sección Almacenes; no se modifica desde la revisión del turno.'
    USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION public.bc8_listar_dependientas_almacen(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bc8_configurar_dependienta_almacen(uuid,uuid,boolean,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc8_listar_dependientas_almacen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bc8_configurar_dependienta_almacen(uuid,uuid,boolean,numeric,text) TO authenticated;
REVOKE ALL ON FUNCTION public.bc8_aplicar_salario_dependienta_programada() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bc7_configurar_salario_porcentaje_jornada(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc7_configurar_salario_porcentaje_jornada(uuid,numeric) TO authenticated;

COMMIT;
