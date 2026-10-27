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
  v_boundary_found boolean;
  v_other_shift_found boolean;
BEGIN
  SELECT count(*), array_agg(tipo ORDER BY tipo)
  INTO v_count, v_types
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000001');

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'Expected 6 movements for morning session; got % with types %', v_count, v_types;
  END IF;
  IF NOT (v_types @> ARRAY['compra','venta','transferencia_salida','vale','merma','baja']::text[]) THEN
    RAISE EXCEPTION 'Archive did not return every expected movement type: %', v_types;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000001')
    WHERE operacion_id='96000000-0000-0000-0000-000000000002'
  ) INTO v_boundary_found;
  IF v_boundary_found THEN
    RAISE EXCEPTION 'A movement at the exclusive end of the session was incorrectly attributed.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000001')
    WHERE producto='Jugo'
  ) INTO v_other_shift_found;
  IF v_other_shift_found THEN
    RAISE EXCEPTION 'A purchase from the second session was incorrectly attributed to the first session.';
  END IF;

  SELECT count(*) INTO v_session_2_count
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000002');
  IF v_session_2_count <> 1 THEN
    RAISE EXCEPTION 'Expected only the second-session purchase; got % rows.', v_session_2_count;
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
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000002');
  IF v_session_2_count <> 1 THEN
    RAISE EXCEPTION 'A session participant with turnos:ver must be able to see their own session archive.';
  END IF;
  BEGIN
    PERFORM 1 FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'An unrelated authenticated user must not be able to read the session movement archive.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$test$;
ROLLBACK;
