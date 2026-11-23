\set ON_ERROR_STOP on
DO $sealed_baja_contract$
DECLARE
  v_balance text := pg_get_functiondef('public.bc7_jornada_saldos_operativos(uuid)'::regprocedure);
  v_catalog text := pg_get_functiondef('public.bc7_productos_ajuste_jornada(uuid)'::regprocedure);
  v_baja text := pg_get_functiondef('public.bc7_registrar_bajas_multiple_jornada(uuid,jsonb,text,uuid)'::regprocedure);
BEGIN
  IF v_balance NOT LIKE '%CERRADA_OPERATIVAMENTE%'
     OR v_balance NOT LIKE '%corte_operativo_at%'
     OR v_balance NOT LIKE '%v_end_at:=v_session.corte_operativo_at%'
     OR v_balance NOT LIKE '%v_linked_end_at%'
     OR v_balance NOT LIKE '%fecha_revision <= v_linked_end_at%' THEN
    RAISE EXCEPTION 'FAIL: sealed operational balance does not preserve cutoff and late linked approvals.';
  END IF;

  IF v_catalog NOT LIKE '%CERRADA_OPERATIVAMENTE%'
     OR v_catalog NOT LIKE '%bc7_jornada_saldos_operativos%' THEN
    RAISE EXCEPTION 'FAIL: adjustment picker does not use the sealed Jornada operational ledger.';
  END IF;

  IF v_baja NOT LIKE '%saldo AS MATERIALIZED%'
     OR v_baja NOT LIKE '%reservado AS MATERIALIZED%'
     OR v_baja NOT LIKE '%v_group.stock_disponible%' THEN
    RAISE EXCEPTION 'FAIL: grouped Baja does not materialize one operational balance and pending reservations.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='bajas_pending_jornada_product_idx'
  ) THEN
    RAISE EXCEPTION 'FAIL: pending Baja reservation index is missing.';
  END IF;

  RAISE NOTICE 'PASS sealed Jornada Baja: immutable cutoff, linked late approvals, picker parity, single balance materialization and reservation index.';
END
$sealed_baja_contract$;
