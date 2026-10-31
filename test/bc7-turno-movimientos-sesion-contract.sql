-- Executed only in a disposable PostgreSQL 17 test database.
BEGIN;
SELECT set_config('test.bc_admin','true',false);
SELECT set_config('test.perms','reportes:ver',false);
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',false);

DO $test$
DECLARE
  v_count integer;
  v_types text[];
  v_session_2_count integer;
  v_day_2_count integer;
  v_day_2_types text[];
  v_boundary_found boolean;
  v_other_shift_found boolean;
  v_cross_day_found boolean;
  v_turn_state text;
  v_turn_days integer;
  v_turn_sessions integer;
  v_turn_dates integer;
BEGIN
  SELECT count(*), array_agg(tipo ORDER BY tipo)
  INTO v_count, v_types
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000001');

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'Expected 6 movements for day 1 morning; got % with types %', v_count, v_types;
  END IF;
  IF NOT (v_types @> ARRAY['compra','venta','transferencia_salida','vale','merma','baja']::text[]) THEN
    RAISE EXCEPTION 'Archive did not return every expected movement type: %', v_types;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000001')
    WHERE operacion_id='96000000-0000-0000-0000-000000000002'
  ) INTO v_boundary_found;
  IF v_boundary_found THEN
    RAISE EXCEPTION 'A movement at the exclusive end of day 1 session was incorrectly attributed.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000001')
    WHERE operacion_id='95000000-0000-0000-0000-000000000002'
  ) INTO v_other_shift_found;
  IF v_other_shift_found THEN
    RAISE EXCEPTION 'A purchase from day 1 afternoon was incorrectly attributed to day 1 morning.';
  END IF;

  SELECT count(*) INTO v_session_2_count
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000002');
  IF v_session_2_count <> 1 THEN
    RAISE EXCEPTION 'Expected only the day 1 afternoon purchase; got % rows.', v_session_2_count;
  END IF;

  -- Day 2 is a separate business date inside the same already-closed turn.
  SELECT count(*), array_agg(tipo ORDER BY tipo)
  INTO v_day_2_count, v_day_2_types
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000003');
  IF v_day_2_count <> 2
     OR NOT (v_day_2_types @> ARRAY['compra','venta']::text[]) THEN
    RAISE EXCEPTION 'Expected only day 2 morning purchase + sale; got % rows/types %.', v_day_2_count, v_day_2_types;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000003')
    WHERE operacion_id IN (
      '95000000-0000-0000-0000-000000000001',
      '96000000-0000-0000-0000-000000000001'
    )
  ) INTO v_cross_day_found;
  IF v_cross_day_found THEN
    RAISE EXCEPTION 'Day 1 operations leaked into the day 2 archive.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000001')
    WHERE operacion_id IN (
      '95000000-0000-0000-0000-000000000003',
      '96000000-0000-0000-0000-000000000003'
    )
  ) INTO v_cross_day_found;
  IF v_cross_day_found THEN
    RAISE EXCEPTION 'Day 2 operations leaked into the day 1 archive.';
  END IF;

  SELECT count(*) INTO v_session_2_count
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000004');
  IF v_session_2_count <> 1 THEN
    RAISE EXCEPTION 'Expected only the day 2 afternoon purchase; got % rows.', v_session_2_count;
  END IF;

  SELECT t.estado_maestro, t.dias_turno, count(s.id), count(DISTINCT s.fecha)
    INTO v_turn_state, v_turn_days, v_turn_sessions, v_turn_dates
  FROM public.turnos t
  JOIN public.turno_sesiones s ON s.turno_id=t.id
  WHERE t.id='92000000-0000-0000-0000-000000000001'
  GROUP BY t.estado_maestro, t.dias_turno;
  IF v_turn_state <> 'CERRADO' OR v_turn_days <> 2
     OR v_turn_sessions <> 4 OR v_turn_dates <> 2 THEN
    RAISE EXCEPTION 'Read-only archive changed or lost closed-turn history: state %, days %, sessions %, dates %.',
      v_turn_state, v_turn_days, v_turn_sessions, v_turn_dates;
  END IF;

  IF has_function_privilege('anon','public.bc7_movimientos_sesion(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon must not be allowed to execute the session movement RPC.';
  END IF;
  IF NOT has_function_privilege('authenticated','public.bc7_movimientos_sesion(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must be allowed to execute the session movement RPC.';
  END IF;

  PERFORM set_config('test.bc_admin','false',false);
  PERFORM set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',false);
  PERFORM set_config('test.perms','turnos:ver',false);
  SELECT count(*) INTO v_session_2_count
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000004');
  IF v_session_2_count <> 1 THEN
    RAISE EXCEPTION 'A day 2 session participant with turnos:ver must read their own session archive.';
  END IF;
  BEGIN
    PERFORM 1 FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'An unrelated authenticated user must not be able to read another participant session archive.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$test$;
ROLLBACK;
