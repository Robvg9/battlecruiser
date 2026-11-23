\set ON_ERROR_STOP on
DO $postseal_final_inventory_contract$
DECLARE
  v_writer text:=pg_get_functiondef('public.bc7_guardar_inventario_jornada(uuid,text,jsonb,text)'::regprocedure);
  v_postseal text:=pg_get_functiondef('public.bc7_guardar_inventario_final_post_sello_jornada(uuid,jsonb,text,text,text)'::regprocedure);
  v_owner text:=pg_get_functiondef('public.bc7_confirmar_bloque_jornada(uuid,text,boolean)'::regprocedure);
  v_liquidation text:=pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
BEGIN
  IF v_writer NOT LIKE '%bc7.postseal_inventory_session%'
     OR v_writer NOT LIKE '%corte_operativo_at%'
     OR v_writer NOT LIKE '%turnos t%'
     OR v_writer NOT LIKE '%t.estado=''ABIERTO''%' THEN
    RAISE EXCEPTION 'FAIL: legacy final-count writer does not enforce the transaction-scoped post-seal gate.';
  END IF;

  IF v_postseal NOT LIKE '%CERRADA_OPERATIVAMENTE%'
     OR v_postseal NOT LIKE '%turno_tramos%'
     OR v_postseal NOT LIKE '%fin_at=v_s.corte_operativo_at%'
     OR v_postseal NOT LIKE '%v_p.responsable_id%'
     OR v_postseal NOT LIKE '%p_fuente_documental%'
     OR v_postseal NOT LIKE '%p_fuente_content_hash%'
     OR v_postseal NOT LIKE '%^[0-9a-f]{64}$%'
     OR v_postseal NOT LIKE '%corte_fisico_at=v_s.corte_operativo_at%'
     OR v_postseal NOT LIKE '%postseal_payload_hash%'
     OR v_postseal NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'FAIL: post-seal final inventory RPC is missing the evidence, exact-tranche, cutoff or idempotency guard.';
  END IF;

  IF v_owner NOT LIKE '%t.estado=''ABIERTO''%'
     OR v_owner NOT LIKE '%tr.fin_at=v_s.corte_operativo_at%'
     OR v_owner NOT LIKE '%jp.responsable_id%' THEN
    RAISE EXCEPTION 'FAIL: sealed Owner checklist no longer requires the exact assigned tranche and open master Turn.';
  END IF;

  IF v_liquidation NOT LIKE '%v_final.registrado_post_sello%'
     OR v_liquidation NOT LIKE '%v_final.corte_fisico_at%'
     OR v_liquidation NOT LIKE '%v_s.corte_operativo_at%' THEN
    RAISE EXCEPTION 'FAIL: historical final inventory entry time can still shift the immutable physical cutoff.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='turno_jornada_inventario_cortes'
      AND column_name='fuente_content_hash'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='turno_jornada_inventario_cortes'
      AND column_name='corte_fisico_at'
  ) THEN
    RAISE EXCEPTION 'FAIL: historical physical-cut provenance columns are missing.';
  END IF;

  RAISE NOTICE 'PASS post-seal final inventory: source SHA-256, exact assigned tranche, open Turn, immutable cutoff, retry safety, Owner checklist gate and historical liquidation cutoff.';
END
$postseal_final_inventory_contract$;
