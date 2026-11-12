-- Verify that the final cash declaration of a completed single-session JORNADA
-- appears in the administrative approval queue. Disposable PostgreSQL 17 only.
BEGIN;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.bc_admin','true',false);
SELECT set_config('test.perms','entregas_caja:editar_any',false);

DO $test$
DECLARE
  v_session uuid:='91000000-0000-0000-0000-000000000007';
  v_declaration uuid;
  v_count integer;
  v_estado text;
  v_session_state text;
BEGIN
  SELECT id INTO v_declaration
  FROM public.turno_declaraciones
  WHERE turno_sesion_id=v_session
  ORDER BY declarado_at DESC
  LIMIT 1;
  IF v_declaration IS NULL THEN
    RAISE EXCEPTION 'FAIL: Step 7 fixture did not create a final cash declaration';
  END IF;

  SELECT count(*),min(q.estado),min(q.motivo)
    INTO v_count,v_estado,v_session_state
  FROM public.listar_aprobaciones_admin() q
  WHERE q.tipo='declaracion_jornada' AND q.id=v_declaration;

  IF v_count<>1 THEN
    RAISE EXCEPTION 'FAIL: final JORNADA cash declaration must appear once in Centro de Control; rows=%',v_count;
  END IF;
  IF v_estado NOT IN ('PENDIENTE','ESPERANDO_APROBACION') THEN
    RAISE EXCEPTION 'FAIL: final cash declaration has unexpected state in admin queue: %',v_estado;
  END IF;
  IF v_session_state<>'COMPLETADA' THEN
    RAISE EXCEPTION 'FAIL: queue must surface the real session state for the count gate; state=%',v_session_state;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.turno_declaraciones d
    WHERE d.id=v_declaration AND d.monto_contado IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: queue fixture should remain physically uncounted';
  END IF;
END
$test$;
ROLLBACK;
