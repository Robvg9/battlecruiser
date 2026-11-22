-- Atomic and audited movement of a future multi-day Jornada period.
-- This migration is additive. It never rewrites historical or started sessions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.turno_jornada_reprogramacion_idempotencia (
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  turno_id uuid NOT NULL REFERENCES public.turnos(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  resultado jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turno_jornada_reprogramacion_idempotencia_pk
    PRIMARY KEY (actor_user_id, idempotency_key)
);

ALTER TABLE public.turno_jornada_reprogramacion_idempotencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turno_jornada_reprogramacion_idempotencia
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bc5_reprogramar_periodo_jornada(
  p_turno_id uuid,
  p_fecha_inicio date,
  p_motivo text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_turno public.turnos;
  v_cfg public.turno_jornada_configuracion;
  v_payload jsonb;
  v_existing_payload jsonb;
  v_existing_result jsonb;
  v_local_today date;
  v_delta integer;
  v_days integer;
  v_min_day integer;
  v_max_day integer;
  v_end_date date;
  v_row public.turno_jornada_programacion;
  v_updated public.turno_jornada_programacion;
  v_session_id uuid;
  v_session_state text;
  v_rows_moved integer := 0;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN autenticado puede mover el período de una Jornada.'
      USING ERRCODE = '42501';
  END IF;
  IF p_turno_id IS NULL OR p_fecha_inicio IS NULL
     OR p_idempotency_key IS NULL
     OR nullif(btrim(coalesce(p_motivo,'')),'') IS NULL
     OR length(p_motivo) > 1000 THEN
    RAISE EXCEPTION 'Turno, nueva fecha, motivo y llave de idempotencia son obligatorios; el motivo admite hasta 1000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'turno_id',p_turno_id,
    'fecha_inicio',p_fecha_inicio,
    'motivo',btrim(p_motivo)
  );

  -- Serialize a retry using the same actor/key before touching any Jornada row.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'bc5-period-reschedule:' || v_uid::text || ':' || p_idempotency_key::text, 0
  ));

  SELECT payload,resultado
    INTO v_existing_payload,v_existing_result
  FROM public.turno_jornada_reprogramacion_idempotencia
  WHERE actor_user_id=v_uid AND idempotency_key=p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'La llave de idempotencia ya fue utilizada con otra operación.'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_existing_result || jsonb_build_object('idempotente',true);
  END IF;

  SELECT * INTO v_turno
  FROM public.turnos
  WHERE id=p_turno_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno no encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- Match the lock order of normal Jornada start (session -> programming -> master).
  -- NOWAIT deliberately converts concurrent opens/edits into a safe retry, rather
  -- than allowing a deadlock or moving dates while a session is being opened.
  BEGIN
    PERFORM s.id
    FROM public.turno_sesiones s
    WHERE s.turno_id=p_turno_id
    ORDER BY s.numero_dia,s.id
    FOR UPDATE NOWAIT;

    PERFORM p.id
    FROM public.turno_jornada_programacion p
    WHERE p.turno_id=p_turno_id
    ORDER BY p.numero_dia,p.id
    FOR UPDATE NOWAIT;

    SELECT * INTO v_turno
    FROM public.turnos
    WHERE id=p_turno_id
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Turno no encontrado.' USING ERRCODE = 'P0002';
    END IF;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'La Jornada se está abriendo o editando en este momento. No se movió ninguna fecha; vuelve a intentarlo.'
      USING ERRCODE = '55P03';
  END;

  IF coalesce(v_turno.estado_maestro,v_turno.estado) NOT IN ('PROGRAMADO','PENDIENTE') THEN
    RAISE EXCEPTION 'Solo se puede mover un período que todavía no ha comenzado.'
      USING ERRCODE = '23514';
  END IF;
  IF v_turno.dias_turno IS NULL OR v_turno.dias_turno NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'El Turno no tiene una duración válida para reprogramar.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.turno_sesiones s
    WHERE s.turno_id=p_turno_id
      AND (s.bloque <> 'JORNADA' OR s.jornada_programacion_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'El Turno contiene sesiones del modelo anterior; no se puede mover como Jornada única.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cfg
  FROM public.turno_jornada_configuracion
  WHERE almacen_id=v_turno.almacen_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe configuración horaria para el almacén de esta Jornada.'
      USING ERRCODE = 'P0002';
  END IF;
  v_local_today := (now() AT TIME ZONE v_cfg.zona_horaria)::date;
  IF p_fecha_inicio < v_local_today THEN
    RAISE EXCEPTION 'No se admiten fechas de inicio pasadas. Usa una corrección retroactiva auditada.'
      USING ERRCODE = '22023';
  END IF;
  v_delta := p_fecha_inicio - v_turno.fecha;
  IF v_delta = 0 THEN
    RAISE EXCEPTION 'El período ya comienza en esa fecha; no hay nada que mover.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*),min(numero_dia),max(numero_dia)
    INTO v_days,v_min_day,v_max_day
  FROM public.turno_jornada_programacion
  WHERE turno_id=p_turno_id;
  IF v_days <> v_turno.dias_turno OR v_min_day <> 1 OR v_max_day <> v_turno.dias_turno THEN
    RAISE EXCEPTION 'La programación del Turno está incompleta; se requiere exactamente una fila por día.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.turno_jornada_programacion p
    WHERE p.turno_id=p_turno_id
      AND (
        p.almacen_id IS DISTINCT FROM v_turno.almacen_id
        OR p.fecha IS DISTINCT FROM v_turno.fecha + (p.numero_dia - 1)
        OR p.estado='CANCELADA'
        OR (p.trabaja AND (p.estado<>'PROGRAMADA' OR p.responsable_id IS NULL))
        OR (NOT p.trabaja AND (p.estado<>'DESCANSO' OR p.responsable_id IS NOT NULL))
      )
  ) THEN
    RAISE EXCEPTION 'La programación contiene fechas, estados o responsables inconsistentes; corrígela antes de mover el período.'
      USING ERRCODE = '23514';
  END IF;

  -- A working day must have one matching not-yet-started Jornada session.
  -- A rest day may have no session or a CANCELADA child kept as history.
  IF EXISTS (
    SELECT 1
    FROM public.turno_jornada_programacion p
    LEFT JOIN public.turno_sesiones s
      ON s.jornada_programacion_id=p.id AND s.turno_id=p.turno_id
    WHERE p.turno_id=p_turno_id
      AND (
        (p.trabaja AND (
          s.id IS NULL OR s.almacen_id IS DISTINCT FROM p.almacen_id
          OR s.numero_dia IS DISTINCT FROM p.numero_dia
          OR s.fecha IS DISTINCT FROM p.fecha
          OR s.bloque<>'JORNADA'
          OR s.estado NOT IN ('PENDIENTE','PROGRAMADA')
        ))
        OR
        (NOT p.trabaja AND s.id IS NOT NULL AND (
          s.bloque<>'JORNADA' OR s.estado<>'CANCELADA'
        ))
      )
  ) THEN
    RAISE EXCEPTION 'Una sesión no coincide con su día programado o ya cambió de estado. El período no se puede mover.'
      USING ERRCODE = '23514';
  END IF;

  -- Any trace of actual work or a physical/financial action makes the period immutable.
  IF EXISTS (
    SELECT 1
    FROM public.turno_sesiones s
    WHERE s.turno_id=p_turno_id
      AND (
        EXISTS (SELECT 1 FROM public.turno_tramos t WHERE t.turno_sesion_id=s.id)
        OR EXISTS (SELECT 1 FROM public.turno_jornada_inventario_cortes c WHERE c.turno_sesion_id=s.id)
        OR EXISTS (SELECT 1 FROM public.turno_declaraciones d WHERE d.turno_sesion_id=s.id)
        OR EXISTS (SELECT 1 FROM public.turno_eventos e WHERE e.turno_sesion_id=s.id)
      )
  ) THEN
    RAISE EXCEPTION 'El período ya tiene actividad, inventario o registros financieros; no se pueden mover sus fechas.'
      USING ERRCODE = '23514';
  END IF;

  v_end_date := v_turno.fecha + (v_turno.dias_turno - 1);
  -- Descending for a forward move and ascending for a backward move. This
  -- vacates overlapping source dates before the partial unique indexes are hit.
  IF v_delta > 0 THEN
    FOR v_row IN
      SELECT * FROM public.turno_jornada_programacion
      WHERE turno_id=p_turno_id
      ORDER BY fecha DESC,numero_dia DESC
    LOOP
      v_before := to_jsonb(v_row);
      SELECT s.id,s.estado INTO v_session_id,v_session_state
      FROM public.turno_sesiones s
      WHERE s.jornada_programacion_id=v_row.id AND s.turno_id=p_turno_id
      ORDER BY s.id LIMIT 1;

      UPDATE public.turno_jornada_programacion
      SET fecha=fecha+v_delta,
          actualizado_por=v_uid,
          actualizado_en=now()
      WHERE id=v_row.id
      RETURNING * INTO v_updated;

      -- A cancelled child on a rest day is retained at its original date as
      -- historical evidence; the live schedule row is what moves on the board.
      IF v_row.trabaja THEN
        UPDATE public.turno_sesiones
        SET fecha=v_updated.fecha,updated_at=now()
        WHERE id=v_session_id;
      END IF;

      v_after := to_jsonb(v_updated) || jsonb_build_object(
        'sesion_id',v_session_id,
        'sesion_estado',v_session_state,
        'sesion_fecha_movida',v_row.trabaja
      );
      INSERT INTO public.turno_jornada_eventos
        (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
      VALUES
        (v_updated.almacen_id,v_updated.id,v_uid,'JORNADA_PERIODO_REPROGRAMADO',
         btrim(p_motivo),
         v_before,
         v_after || jsonb_build_object(
           'fecha_inicio_anterior',v_turno.fecha,
           'fecha_inicio_nueva',p_fecha_inicio,
           'desplazamiento_dias',v_delta
         ));
      v_rows_moved := v_rows_moved + 1;
    END LOOP;
  ELSE
    FOR v_row IN
      SELECT * FROM public.turno_jornada_programacion
      WHERE turno_id=p_turno_id
      ORDER BY fecha ASC,numero_dia ASC
    LOOP
      v_before := to_jsonb(v_row);
      SELECT s.id,s.estado INTO v_session_id,v_session_state
      FROM public.turno_sesiones s
      WHERE s.jornada_programacion_id=v_row.id AND s.turno_id=p_turno_id
      ORDER BY s.id LIMIT 1;

      UPDATE public.turno_jornada_programacion
      SET fecha=fecha+v_delta,
          actualizado_por=v_uid,
          actualizado_en=now()
      WHERE id=v_row.id
      RETURNING * INTO v_updated;

      IF v_row.trabaja THEN
        UPDATE public.turno_sesiones
        SET fecha=v_updated.fecha,updated_at=now()
        WHERE id=v_session_id;
      END IF;

      v_after := to_jsonb(v_updated) || jsonb_build_object(
        'sesion_id',v_session_id,
        'sesion_estado',v_session_state,
        'sesion_fecha_movida',v_row.trabaja
      );
      INSERT INTO public.turno_jornada_eventos
        (almacen_id,programacion_id,actor_user_id,tipo,motivo,estado_antes,estado_despues)
      VALUES
        (v_updated.almacen_id,v_updated.id,v_uid,'JORNADA_PERIODO_REPROGRAMADO',
         btrim(p_motivo),
         v_before,
         v_after || jsonb_build_object(
           'fecha_inicio_anterior',v_turno.fecha,
           'fecha_inicio_nueva',p_fecha_inicio,
           'desplazamiento_dias',v_delta
         ));
      v_rows_moved := v_rows_moved + 1;
    END LOOP;
  END IF;

  UPDATE public.turnos
  SET fecha=p_fecha_inicio,actualizado_en=now()
  WHERE id=p_turno_id;

  v_result := jsonb_build_object(
    'turno_id',p_turno_id,
    'fecha_inicio_anterior',v_turno.fecha,
    'fecha_inicio',p_fecha_inicio,
    'fecha_fin',v_end_date+v_delta,
    'dias_total',v_turno.dias_turno,
    'desplazamiento_dias',v_delta,
    'filas_movidas',v_rows_moved,
    'idempotente',false
  );

  INSERT INTO public.turno_jornada_reprogramacion_idempotencia
    (actor_user_id,idempotency_key,turno_id,payload,resultado)
  VALUES (v_uid,p_idempotency_key,p_turno_id,v_payload,v_result);

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.bc5_reprogramar_periodo_jornada(uuid,date,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bc5_reprogramar_periodo_jornada(uuid,date,text,uuid)
  TO authenticated;

COMMENT ON FUNCTION public.bc5_reprogramar_periodo_jornada(uuid,date,text,uuid) IS
  'Moves a complete, future, not-yet-started Jornada period atomically. Locks rows with NOWAIT, preserves cancelled rest-day sessions as historical rows, blocks sessions with activity/inventory/finance, enforces partial unique indexes, writes per-day audit events and is idempotent per actor/key.';

COMMIT;
