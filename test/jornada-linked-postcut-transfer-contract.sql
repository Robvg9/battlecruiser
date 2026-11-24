-- Structural regression contract for the linked-transfer cutoff override.
-- The disposable Step 7 fixture intentionally rolls back its operational rows
-- before this test; assert the compiled settlement function keeps the exact
-- session link and lower opening boundary in its executable definition.
DO $test$
DECLARE
  v_function text := pg_get_functiondef(
    'public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure
  );
BEGIN
  IF position('linked_override.turno_sesion_id=v_s.id' IN v_function)=0 THEN
    RAISE EXCEPTION 'Settlement must scope retroactive transfer override to the exact Jornada session.';
  END IF;

  IF position('linked_override.transferencia_id=t.id' IN v_function)=0 THEN
    RAISE EXCEPTION 'Settlement must scope retroactive transfer override to the exact linked transfer.';
  END IF;

  IF position('t.fecha>v_start_at' IN v_function)=0 THEN
    RAISE EXCEPTION 'Explicit transfer link must never bypass the inherited opening boundary.';
  END IF;

  IF position('t.fecha<=v_end_at' IN v_function)=0 THEN
    RAISE EXCEPTION 'Normal transfers must retain the operational upper time boundary.';
  END IF;

  RAISE NOTICE 'PASS: explicit retroactive transfer override is exact-session/exact-transfer scoped and preserves the inherited opening and normal cutoff boundaries.';
END
$test$;
