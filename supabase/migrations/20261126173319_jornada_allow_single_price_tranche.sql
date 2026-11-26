-- Allow a single real sale-price tranche in an audited historical Jornada.
-- Preserve the exact sold-quantity sum, Owner-only SECURITY DEFINER, session-state
-- allowance, master-turn freeze and audit event implemented by earlier migrations.
DO $allow_single_price_tranche$
DECLARE
  v_function text := pg_get_functiondef(
    'public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)'::regprocedure
  );
  v_old_guard text := $old$
 IF jsonb_array_length(p_tramos)<2 OR jsonb_array_length(p_tramos)>30 THEN
  RAISE EXCEPTION 'Indica entre dos y treinta tramos.' USING ERRCODE='22023';
 END IF;
$old$;
  v_new_guard text := $new$
 IF jsonb_array_length(p_tramos)<1 OR jsonb_array_length(p_tramos)>30 THEN
  RAISE EXCEPTION 'Indica entre uno y treinta tramos.' USING ERRCODE='22023';
 END IF;
$new$;
BEGIN
  IF position(v_new_guard IN v_function)=0 THEN
    IF position(v_old_guard IN v_function)=0 THEN
      RAISE EXCEPTION 'Price-tranche row-count guard changed unexpectedly; refusing to rewrite the function.';
    END IF;
    v_function := replace(v_function, v_old_guard, v_new_guard);
    EXECUTE v_function;
  END IF;

  IF position(v_new_guard IN pg_get_functiondef(
    'public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)'::regprocedure
  ))=0 THEN
    RAISE EXCEPTION 'Single-tranche validation guard was not installed.';
  END IF;
  IF position('v_s.estado NOT IN (' || quote_literal('COMPLETADA') || ',' || quote_literal('CERRADA_OPERATIVAMENTE') || ')'
     IN pg_get_functiondef('public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)'::regprocedure))=0
     OR position('coalesce(t.estado_maestro,t.estado) IN (' || quote_literal('CERRADO') || ',' || quote_literal('CANCELADO') || ')'
     IN pg_get_functiondef('public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'Existing session-state and master-Turn freeze protections must remain unchanged.';
  END IF;
END
$allow_single_price_tranche$;
