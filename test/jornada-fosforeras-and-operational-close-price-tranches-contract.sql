-- Regression contract for the two historical corrections in migration
-- 20261124220000_jornada_fosforeras_restore_and_operationally_closed_price_tranches.sql.
DO $test$
DECLARE
  v_price_function text := pg_get_functiondef(
    'public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)'::regprocedure
  );
  v_price_proc oid := 'public.bc7_guardar_tramos_precio_jornada(uuid,uuid,jsonb,text)'::regprocedure;
  v_rls boolean;
  v_search_path text[];
BEGIN
  IF position(
    'v_s.estado NOT IN (''COMPLETADA'',''CERRADA_OPERATIVAMENTE'')'
    IN v_price_function
  )=0 THEN
    RAISE EXCEPTION 'FAIL: Owner price-tranche correction must accept both COMPLETADA and CERRADA_OPERATIVAMENTE sessions.';
  END IF;

  IF position('coalesce(t.estado_maestro,t.estado) IN (''CERRADO'',''CANCELADO'')' IN v_price_function)=0 THEN
    RAISE EXCEPTION 'FAIL: historical price-tranche corrections must remain frozen after the master Turn is closed or cancelled.';
  END IF;

  IF position('auth.uid() IS NULL OR NOT public.bc_actor_is_admin()' IN v_price_function)=0
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_price_proc)
     OR NOT has_function_privilege('authenticated',v_price_proc,'EXECUTE')
     OR has_function_privilege('anon',v_price_proc,'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: price-tranche correction must remain Admin-only SECURITY DEFINER and not executable by anon.';
  END IF;

  SELECT proconfig INTO v_search_path FROM pg_proc WHERE oid=v_price_proc;
  IF NOT ('search_path=public, pg_temp'=ANY(coalesce(v_search_path,ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'FAIL: price-tranche function must pin search_path to public, pg_temp.';
  END IF;

  IF position('abs(v_sum-v_sold)>0.0001' IN v_price_function)=0
     OR position('PRECIOS_POR_TRAMOS_JORNADA' IN v_price_function)=0
     OR position('turno_jornada_eventos' IN v_price_function)=0 THEN
    RAISE EXCEPTION 'FAIL: price-tranche correction must still enforce the exact sold-unit sum and write its Jornada audit event.';
  END IF;

  SELECT relrowsecurity INTO v_rls
  FROM pg_class
  WHERE oid='public.turno_jornada_precio_tramos'::regclass;
  IF NOT coalesce(v_rls,false) THEN
    RAISE EXCEPTION 'FAIL: historical price-tranche table must retain RLS.';
  END IF;

  IF position('jsonb_array_length(p_tramos)<1' IN v_price_function)=0
     OR position('Indica entre uno y treinta tramos.' IN v_price_function)=0
     OR position('jsonb_array_length(p_tramos)<2' IN v_price_function)>0
     OR position('Indica entre dos y treinta tramos.' IN v_price_function)>0 THEN
    RAISE EXCEPTION 'FAIL: an Owner must be able to record a single real price tranche while the backend still validates the array.';
  END IF;

  RAISE NOTICE 'PASS Jornada single-price tranche + operational close Admin correction; exact units, master-Turn freeze, ACL and RLS preserved.';
END
$test$;
