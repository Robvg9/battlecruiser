\set ON_ERROR_STOP on
DO $responsible_five_step_contract$
DECLARE
  v_confirm text:=pg_get_functiondef('public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure);
  v_state text:=pg_get_functiondef('public.bc7_estado_confirmaciones_jornada(uuid)'::regprocedure);
  v_cash text:=pg_get_functiondef('public.bc5_responsable_declarar_dinero_jornada(uuid,numeric)'::regprocedure);
  v_inventory text:=pg_get_functiondef('public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid)'::regprocedure);
  v_helper text:=pg_get_functiondef('public.bc7_validar_bloque_abierto_jornada(uuid,text,uuid)'::regprocedure);
  v_gasto text:=pg_get_functiondef('public.bc7_registrar_gasto_jornada(uuid,text,numeric,text,uuid)'::regprocedure);
  v_reinversion text:=pg_get_functiondef('public.bc7_registrar_reinversion_jornada(uuid,jsonb,uuid,text)'::regprocedure);
  v_bajas text:=pg_get_functiondef('public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid)'::regprocedure);
  v_ajuste text:=pg_get_functiondef('public.bc7_registrar_ajuste_jornada(uuid,text,uuid,numeric,text,uuid)'::regprocedure);
  v_acl boolean;
BEGIN
  IF v_confirm NOT LIKE '%bc7_validar_tramo_responsable_jornada%'
     OR v_confirm NOT LIKE '%BC7_SEALED_WORKER_BLOCK_CONFIRM_V3%'
     OR v_confirm LIKE '%Solo ADMIN puede confirmar bloques%'
     OR v_confirm LIKE '%Todavía hay gastos pendientes de revisión%'
     OR v_confirm LIKE '%Todavía hay reinversiones pendientes de revisión%' THEN
    RAISE EXCEPTION 'FAIL: the assigned worker must be able to confirm completeness after seal, independently of Owner approvals.';
  END IF;

  IF v_state NOT LIKE '%DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION%'
     OR v_state NOT LIKE '%v_daily_registered=v_daily_expected%'
     OR v_state NOT LIKE '%declaracion_registrada%'
     OR v_state NOT LIKE '%entregas_diarias_esperadas%' THEN
    RAISE EXCEPTION 'FAIL: Step 5 must require a worker-authored final declaration and every date-specific cash entry.';
  END IF;

  IF v_cash NOT LIKE '%bc7_validar_tramo_responsable_jornada%'
     OR v_cash NOT LIKE '%DINERO_DECLARACION_TRANSCRITA_ADMIN%'
     OR v_cash NOT LIKE '%DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION%'
     OR v_cash NOT LIKE '%transcripcion_original_conservada%'
     OR v_cash NOT LIKE '%declarado_at=now()%' THEN
    RAISE EXCEPTION 'FAIL: worker cash declaration must replace an ADMIN transcription without erasing its audit trail.';
  END IF;

  IF v_inventory NOT LIKE '%bc7_validar_tramo_responsable_jornada%'
     OR v_inventory NOT LIKE '%CERRADA_OPERATIVAMENTE%'
     OR v_inventory NOT LIKE '%corte_operativo_at%'
     OR v_inventory NOT LIKE '%v_initial_cut%'
     OR v_inventory NOT LIKE '%bc7_jornada_saldos_operativos%'
     OR v_inventory NOT LIKE '%stock_global_modificado%'
     OR v_inventory NOT LIKE '%idempotency_key%' THEN
    RAISE EXCEPTION 'FAIL: sealed final inventory must be assigned-worker-only, anchored to the opening product set and immutable cutoff, audited and idempotent.';
  END IF;

  IF v_helper NOT LIKE '%turno_jornada_confirmaciones%'
     OR v_helper NOT LIKE '%idempotency_key%'
     OR v_gasto NOT LIKE '%bc7_validar_bloque_abierto_jornada%'
     OR v_reinversion NOT LIKE '%bc7_validar_bloque_abierto_jornada%'
     OR v_bajas NOT LIKE '%bc7_validar_bloque_abierto_jornada%'
     OR v_ajuste NOT LIKE '%bc7_validar_bloque_abierto_jornada%' THEN
    RAISE EXCEPTION 'FAIL: closed expense, reinvestment, Baja and merma blocks must be protected by server-side locks while exact idempotent retries remain valid.';
  END IF;

  SELECT has_function_privilege('authenticated',
      'public.bc5_responsable_declarar_dinero_jornada(uuid,numeric)','EXECUTE')
     AND NOT has_function_privilege('anon',
      'public.bc5_responsable_declarar_dinero_jornada(uuid,numeric)','EXECUTE')
     AND has_function_privilege('authenticated',
      'public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid)','EXECUTE')
     AND NOT has_function_privilege('anon',
      'public.bc7_responsable_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,uuid)','EXECUTE')
    INTO v_acl;
  IF NOT v_acl THEN
    RAISE EXCEPTION 'FAIL: new responsible-only RPC grants must be limited to authenticated callers.';
  END IF;

  RAISE NOTICE 'PASS responsible five-step contract: worker completion, server-side block locks, idempotent retries, approval separation, date-specific cash, auditable declaration and final physical inventory.';
END
$responsible_five_step_contract$;
