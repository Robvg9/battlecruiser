-- Isolated-only tests. The caller sets bc.step12.reset_token and bc.step12.reset_request_id.
-- This file performs one deliberate invalid attempt and one forced rollback.
SELECT set_config('bc.step12.reset_token', :'reset_token', false);
SELECT set_config('bc.step12.reset_request_id', :'reset_request_id', false);

DO $step12$
DECLARE
  v_tables text[] := private.bc_step12_wipe_tables();
  v_table text;
  v_count bigint;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_result jsonb;
  v_request uuid := current_setting('bc.step12.reset_request_id')::uuid;
BEGIN
  IF current_setting('bc.step12.reset_token') IS NULL OR length(current_setting('bc.step12.reset_token')) < 32 THEN
    RAISE EXCEPTION 'STEP12_TEST_TOKEN_MISSING';
  END IF;

  -- Wrong token must increment the persistent counter and must not mutate data.
  v_result := private.bc_reset_application_data(
    'invalid-step12-token',
    'CONFIRMO REINICIAR BATTLECRUISER PRODUCCIÓN',
    v_request
  );
  IF v_result->>'code' <> 'reset_authorization_failed' THEN
    RAISE EXCEPTION 'STEP12_INVALID_TOKEN_NOT_REJECTED: %',v_result;
  END IF;
  IF (SELECT attempts FROM private.bc_reset_gate WHERE singleton=true) <> 1 THEN
    RAISE EXCEPTION 'STEP12_RESET_ATTEMPT_NOT_PERSISTED';
  END IF;

  FOR v_table IN SELECT unnest(v_tables) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',v_table) INTO v_count;
    v_before := v_before || jsonb_build_object(v_table,v_count);
  END LOOP;
  SELECT count(*) INTO v_count FROM auth.users;
  v_before := v_before || jsonb_build_object('auth.users',v_count);
  SELECT count(*) INTO v_count FROM storage.objects;
  v_before := v_before || jsonb_build_object('storage.objects',v_count);

  -- A deliberately raised exception rolls back the completed TRUNCATE, ledger,
  -- gate consumption, and audit insert as one PostgreSQL transaction.
  BEGIN
    v_result := private.bc_reset_application_data(
      current_setting('bc.step12.reset_token'),
      'CONFIRMO REINICIAR BATTLECRUISER PRODUCCIÓN',
      v_request
    );
    IF COALESCE((v_result->>'ok')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'STEP12_RESET_CALL_FAILED: %',v_result;
    END IF;
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='BC_STEP12_EXPECTED_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'BC_STEP12_EXPECTED_ROLLBACK' THEN
      RAISE;
    END IF;
  END;

  FOR v_table IN SELECT unnest(v_tables) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',v_table) INTO v_count;
    v_after := v_after || jsonb_build_object(v_table,v_count);
  END LOOP;
  SELECT count(*) INTO v_count FROM auth.users;
  v_after := v_after || jsonb_build_object('auth.users',v_count);
  SELECT count(*) INTO v_count FROM storage.objects;
  v_after := v_after || jsonb_build_object('storage.objects',v_count);

  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'STEP12_ROLLBACK_DATA_MISMATCH: before %, after %',v_before,v_after;
  END IF;
  IF (SELECT consumed_at FROM private.bc_reset_gate WHERE singleton=true) IS NOT NULL THEN
    RAISE EXCEPTION 'STEP12_ROLLBACK_CONSUMED_GATE';
  END IF;
  IF EXISTS (SELECT 1 FROM private.bc_reset_operations WHERE request_id=v_request) THEN
    RAISE EXCEPTION 'STEP12_ROLLBACK_LEFT_LEDGER_ROW';
  END IF;

  RAISE NOTICE 'BC_STEP12_INVALID_TOKEN=PASS';
  RAISE NOTICE 'BC_STEP12_ROLLBACK=PASS';
END;
$step12$;
