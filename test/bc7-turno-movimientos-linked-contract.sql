-- Explicit session-link attribution contract. Disposable PostgreSQL 17 only.
BEGIN;
SELECT set_config('test.bc_admin','true',false);
SELECT set_config('test.perms','reportes:ver',false);
SELECT set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',false);

DO $test$
DECLARE
  v_linked integer;
  v_unlinked integer;
  v_adjustments integer;
  v_cross_session integer;
BEGIN
  SELECT count(*) INTO v_linked
  FROM public.bc7_movimientos_sesion('91000000-0000-0000-0000-000000000007')
  WHERE operacion_id='97200000-0000-0000-0000-000000000001'
    AND tipo='transferencia_entrada';
  IF v_linked<>1 THEN
    RAISE EXCEPTION 'Explicit transfer link must appear once in its assigned Jornada; rows=%',v_linked;
  END IF;

  SELECT count(*) INTO v_unlinked
  FROM public.bc7_movimientos_sesion('91000000-0000-0000-0000-000000000007')
  WHERE operacion_id='97200000-0000-0000-0000-000000000002';
  IF v_unlinked<>0 THEN
    RAISE EXCEPTION 'Unlinked transfer by an unrelated actor must not be inferred from date/warehouse alone.';
  END IF;

  SELECT count(*) INTO v_adjustments
  FROM public.bc7_movimientos_sesion('91000000-0000-0000-0000-000000000007')
  WHERE operacion_id IN (
    '99200000-0000-0000-0000-000000000001',
    '99300000-0000-0000-0000-000000000001'
  );
  IF v_adjustments<>2 THEN
    RAISE EXCEPTION 'Approved session-linked Merma/Baja must remain in the original Jornada after later ADMIN review; rows=%',v_adjustments;
  END IF;

  SELECT count(*) INTO v_cross_session
  FROM public.bc7_movimientos_sesion('93000000-0000-0000-0000-000000000002')
  WHERE operacion_id IN (
    '97200000-0000-0000-0000-000000000001',
    '97200000-0000-0000-0000-000000000002',
    '99200000-0000-0000-0000-000000000001',
    '99300000-0000-0000-0000-000000000001'
  );
  IF v_cross_session<>0 THEN
    RAISE EXCEPTION 'Explicit Jornada links must never leak into another session.';
  END IF;
END
$test$;
ROLLBACK;
