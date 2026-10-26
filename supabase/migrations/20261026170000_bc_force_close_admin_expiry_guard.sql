-- BattleCruiser — forward correction for the deployed expired-turn recovery RPC.
-- The earlier migration was applied before the server-side expiry/state guards were added.
-- This migration replaces the RPC definition only; it changes no business rows.
-- Preserve ADMIN, reason, state, period, expiry, audit and no-fabricated-data protections.

CREATE OR REPLACE FUNCTION public.bc7_guard_jornada_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.bloque='JORNADA' AND NEW.jornada_programacion_id IS NOT NULL
     AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF NEW.estado='EN_CURSO' AND OLD.estado IN ('PENDIENTE','PROGRAMADA') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.turno_jornada_inventario_cortes c
        WHERE c.turno_sesion_id=NEW.id AND c.tipo='INICIAL' AND c.estado='CONFIRMADO'
      ) THEN
        RAISE EXCEPTION 'Antes de abrir la jornada debes confirmar el inventario inicial.' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.estado='COMPLETADA' AND OLD.estado='EN_CURSO' THEN
      -- Normal close still requires a final physical count. Only this ADMIN
      -- transaction's explicitly audited, session-scoped recovery may bypass it.
      IF NEW.cierre_forzado IS TRUE
         AND auth.uid() IS NOT NULL
         AND public.bc_actor_is_admin()
         AND EXISTS (
           SELECT 1 FROM public.turno_eventos e
           WHERE e.turno_id=NEW.turno_id
             AND e.actor_user_id=auth.uid()
             AND e.tipo='TURNO_CIERRE_FORZADO_ADMIN'
             AND e.payload->>'cierre_jornada_forzado_sin_conteo_final'='true'
             AND coalesce(e.payload->'sesiones_en_curso_ids','[]'::jsonb) ? NEW.id::text
         ) THEN
        NULL;
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.turno_jornada_inventario_cortes c
        WHERE c.turno_sesion_id=NEW.id AND c.tipo='FINAL' AND c.estado='CONFIRMADO'
      ) THEN
        RAISE EXCEPTION 'Antes de cerrar la jornada debes confirmar el inventario final.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bc_forzar_cierre_turno_admin(
  p_turno_id uuid,
  p_motivo text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_turno public.turnos;
  v_motivo text := NULLIF(btrim(coalesce(p_motivo, '')), '');
  v_now timestamptz := now();
  v_sesiones_en_curso integer := 0;
  v_sesiones_canceladas integer := 0;
  v_sesiones_afectadas integer := 0;
  v_tramos_cerrados integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.bc_actor_is_admin() THEN
    RAISE EXCEPTION 'Solo ADMIN puede forzar el cierre de un turno.' USING ERRCODE = '42501';
  END IF;

  IF v_motivo IS NULL OR length(v_motivo) < 12 THEN
    RAISE EXCEPTION 'El motivo del cierre forzado es obligatorio (mínimo 12 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'El motivo del cierre forzado no puede superar 1000 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_turno
  FROM public.turnos
  WHERE id = p_turno_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno no encontrado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_turno.estado_maestro = 'CANCELADO' THEN
    RETURN jsonb_build_object('id', p_turno_id, 'estado', 'CANCELADO', 'ya_cerrado', true);
  END IF;

  IF v_turno.estado = 'CERRADO' AND v_turno.estado_maestro = 'CERRADO' THEN
    RETURN jsonb_build_object('id', p_turno_id, 'estado', 'CERRADO', 'ya_cerrado', true);
  END IF;

  IF coalesce(v_turno.estado_maestro, '') NOT IN ('ABIERTO', 'EN_CURSO', 'PENDIENTE_APROBACION')
     OR coalesce(v_turno.estado, '') NOT IN ('ABIERTO', 'EN_CURSO', 'PENDIENTE_APROBACION') THEN
    RAISE EXCEPTION 'El turno no está en un estado operativo recuperable.' USING ERRCODE = 'P0001';
  END IF;

  IF v_turno.fecha IS NULL OR v_turno.dias_turno IS NULL OR v_turno.dias_turno < 1 THEN
    RAISE EXCEPTION 'No se puede forzar el cierre: falta un período de turno verificable.' USING ERRCODE = '22023';
  END IF;

  IF (v_turno.fecha + (greatest(coalesce(v_turno.dias_turno, 1) - 1, 0) * interval '1 day'))::date >= current_date THEN
    RAISE EXCEPTION 'El turno todavía no está vencido. El cierre forzado se limita a períodos anteriores a hoy.' USING ERRCODE = '22023';
  END IF;

  -- Lock related rows so the session allowlist and event counts cannot drift.
  PERFORM 1 FROM public.turno_sesiones
  WHERE turno_id = p_turno_id
  ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.turno_tramos
  WHERE turno_id = p_turno_id AND estado = 'ACTIVO'
  ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_sesiones_en_curso
  FROM public.turno_sesiones
  WHERE turno_id = p_turno_id AND estado = 'EN_CURSO';

  SELECT count(*) INTO v_sesiones_canceladas
  FROM public.turno_sesiones
  WHERE turno_id = p_turno_id AND estado IN ('PENDIENTE', 'PROGRAMADA');

  -- Close only active tramos belonging to this master turn.
  UPDATE public.turno_tramos
  SET estado = 'COMPLETADO',
      fin_at = coalesce(fin_at, v_now)
  WHERE turno_id = p_turno_id AND estado = 'ACTIVO';
  GET DIAGNOSTICS v_tramos_cerrados = ROW_COUNT;

  -- Insert the audit BEFORE completing any modern JORNADA session: its trigger
  -- requires this session-scoped ADMIN event to authorize the no-final-count path.
  INSERT INTO public.turno_eventos(turno_id, actor_user_id, tipo, payload)
  VALUES (
    p_turno_id,
    v_uid,
    'TURNO_CIERRE_FORZADO_ADMIN',
    jsonb_build_object(
      'motivo', v_motivo,
      'sesiones_en_curso_cerradas', v_sesiones_en_curso,
      'sesiones_pendientes_canceladas', v_sesiones_canceladas,
      'sesiones_afectadas', v_sesiones_en_curso + v_sesiones_canceladas,
      'sesiones_en_curso_ids', coalesce((
        SELECT jsonb_agg(s.id::text ORDER BY s.id)
        FROM public.turno_sesiones s
        WHERE s.turno_id = p_turno_id AND s.estado = 'EN_CURSO'
      ), '[]'::jsonb),
      'cierre_jornada_forzado_sin_conteo_final', true,
      'tramos_activos_cerrados', v_tramos_cerrados,
      'declaraciones_dinero_creadas', 0,
      'conteos_inventario_creados', 0,
      'turno_fecha_inicio', v_turno.fecha,
      'turno_fecha_fin', (v_turno.fecha + greatest(coalesce(v_turno.dias_turno, 1) - 1, 0)),
      'requiere_revision_manual', true
    )
  );

  -- Preserve completed history. Sessions not yet started are cancelled;
  -- sessions in progress are marked completed with cierre_forzado=true.
  UPDATE public.turno_sesiones
  SET estado = CASE
        WHEN estado IN ('PENDIENTE', 'PROGRAMADA') THEN 'CANCELADA'
        WHEN estado = 'EN_CURSO' THEN 'COMPLETADA'
        ELSE estado
      END,
      cierre_forzado = true,
      updated_at = v_now
  WHERE turno_id = p_turno_id
    AND estado IN ('PENDIENTE', 'PROGRAMADA', 'EN_CURSO');
  GET DIAGNOSTICS v_sesiones_afectadas = ROW_COUNT;

  -- Both fields are part of the live/legacy bridge contract. Updating only
  -- estado_maestro leaves turno_actual_usuario able to see a zombie ABIERTO.
  UPDATE public.turnos
  SET estado = 'CERRADO',
      estado_maestro = 'CERRADO',
      cierre_real = coalesce(cierre_real, v_now),
      actualizado_en = v_now
  WHERE id = p_turno_id;



  RETURN jsonb_build_object(
    'id', p_turno_id,
    'estado', 'CERRADO',
    'forzado', true,
    'motivo', v_motivo,
    'sesiones_completadas', v_sesiones_en_curso,
    'sesiones_canceladas', v_sesiones_canceladas,
    'sesiones_afectadas', v_sesiones_afectadas,
    'tramos_cerrados', v_tramos_cerrados,
    'requiere_revision_manual', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bc_forzar_cierre_turno_admin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bc_forzar_cierre_turno_admin(uuid, text) TO authenticated;
