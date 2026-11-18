-- Daily cash handovers belong to every scheduled working date, including fecha_fin.
-- The previous exclusive comparison rejected the final day of a multi-day Jornada.
-- Keep every other validation, idempotency check, audit field, and grant unchanged.

BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_old text := 'IF p_fecha<v_p.fecha OR p_fecha>=v_fecha_fin OR p_fecha>v_hoy THEN';
  v_new text := 'IF p_fecha<v_p.fecha OR p_fecha>v_fecha_fin OR p_fecha>v_hoy THEN';
  v_occurrences integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.bc7_registrar_entrega_diaria_jornada(uuid,date,numeric,text,uuid)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Daily Jornada cash RPC is missing; refusing to patch an unknown schema.';
  END IF;

  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one exclusive final-day comparison in bc7_registrar_entrega_diaria_jornada; found %.',
      v_occurrences;
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END
$migration$;

COMMIT;
