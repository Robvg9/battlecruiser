-- Disposable PostgreSQL 17 contract for the BattleCruiser payroll bridge.
DO $$
DECLARE
  v_list text;
  v_map text;
  v_unlock text;
  v_trigger text;
BEGIN
  SELECT pg_get_functiondef('public.bc7_payroll_list_employees()'::regprocedure) INTO v_list;
  SELECT pg_get_functiondef('public.bc7_payroll_set_mapping(uuid,uuid)'::regprocedure) INTO v_map;
  SELECT pg_get_functiondef('public.bc7_payroll_unlock_predecessor(uuid)'::regprocedure) INTO v_unlock;
  SELECT pg_get_functiondef('public.bc7_payroll_on_turn_approved()'::regprocedure) INTO v_trigger;

  IF v_list NOT LIKE '%lower(btrim(r.nombre)) IN (''dependienta'',''dependientas'')%' THEN
    RAISE EXCEPTION 'Payroll list does not restrict results to active dependientas';
  END IF;
  IF v_map NOT LIKE '%lower(btrim(r.nombre)) IN (''dependienta'',''dependientas'')%' THEN
    RAISE EXCEPTION 'Payroll mapping does not enforce the Dependienta role server-side';
  END IF;
  IF v_list NOT LIKE '%r.activo IS TRUE%' OR v_map NOT LIKE '%u.activo IS TRUE%' THEN
    RAISE EXCEPTION 'Payroll employee eligibility does not enforce active users/roles';
  END IF;
  IF v_unlock NOT LIKE '%e.estado=''ACEPTADA''%' THEN
    RAISE EXCEPTION 'Salary unlock does not require an accepted inventory handover';
  END IF;
  IF v_unlock NOT LIKE '%dp.fecha=coalesce(sp.fecha_fin,sp.fecha)+1%' THEN
    RAISE EXCEPTION 'Salary unlock does not require the next consecutive warehouse day';
  END IF;
  IF v_unlock NOT LIKE '%sp.almacen_id=dp.almacen_id%' THEN
    RAISE EXCEPTION 'Salary unlock does not require the same warehouse';
  END IF;
  IF v_trigger NOT LIKE '%bc7_payroll_unlock_predecessor(NEW.id)%' THEN
    RAISE EXCEPTION 'Approved successor-turn trigger does not call the salary unlock routine';
  END IF;
  IF has_function_privilege('anon','public.bc7_payroll_list_employees()','EXECUTE')
     OR has_function_privilege('anon','public.bc7_payroll_set_mapping(uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.bc7_payroll_unlock_predecessor(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role must not execute payroll identity or unlock RPCs';
  END IF;
  RAISE NOTICE 'PASS payroll dependent-only mapping and accepted next-day successor unlock';
END
$$;
