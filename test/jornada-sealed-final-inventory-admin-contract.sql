\set ON_ERROR_STOP on
DO $sealed_final_inventory_admin_contract$
DECLARE
  v_admin text:=pg_get_functiondef('public.bc7_admin_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,text,text,uuid)'::regprocedure);
  v_liquidation text:=pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  v_owner_checklist text:=pg_get_functiondef('public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure);
  v_acl boolean;
BEGIN
  IF v_admin NOT LIKE '%bc_actor_is_admin%'
     OR v_admin NOT LIKE '%CERRADA_OPERATIVAMENTE%'
     OR v_admin NOT LIKE '%v_turn.estado<>''ABIERTO''%'
     OR v_admin NOT LIKE '%estado_maestro%'
     OR v_admin NOT LIKE '%corte_operativo_at%'
     OR v_admin NOT LIKE '%INICIAL%'
     OR v_admin NOT LIKE '%idempotency_key%'
     OR v_admin NOT LIKE '%source_sha256%'
     OR v_admin NOT LIKE '%bc7_jornada_saldos_operativos%'
     OR v_admin NOT LIKE '%stock_global_modificado%' THEN
    RAISE EXCEPTION 'FAIL: sealed final inventory ADMIN RPC is missing its authority, cutoff, initial-product, idempotency, source-hash or no-stock-mutation guards.';
  END IF;

  IF v_liquidation NOT LIKE '%THEN v_s.corte_operativo_at%' THEN
    RAISE EXCEPTION 'FAIL: liquidation does not use the immutable operational cutoff for a sealed session.';
  END IF;

  SELECT has_function_privilege('authenticated',
    'public.bc7_admin_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,text,text,uuid)',
    'EXECUTE')
     AND NOT has_function_privilege('anon',
    'public.bc7_admin_registrar_inventario_final_sellado_jornada(uuid,jsonb,text,text,text,uuid)',
    'EXECUTE')
  INTO v_acl;
  IF NOT v_acl THEN
    RAISE EXCEPTION 'FAIL: ADMIN capture RPC grants are not narrowed to authenticated callers.';
  END IF;

  IF v_owner_checklist NOT LIKE '%BC7_SEALED_OWNER_BLOCK_GATE_V2%'
     OR v_owner_checklist NOT LIKE '%v_master_turn.estado<>''ABIERTO''%'
     OR v_owner_checklist NOT LIKE '%estado_maestro%'
     OR v_owner_checklist NOT LIKE '%fin_at=v_s.corte_operativo_at%'
     OR v_owner_checklist NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'FAIL: sealed owner checklist must lock the session/master Turn, require the exact operational tranche and reject a closed master Turn.';
  END IF;

  RAISE NOTICE 'PASS sealed final inventory ADMIN contract: authorization, immutable cutoff, source hash, idempotency, initial product set, historic ledger and execution grants.';
END
$sealed_final_inventory_admin_contract$;
