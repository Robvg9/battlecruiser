\set ON_ERROR_STOP on
DO $jornada_cash_per_day_transfer_contract$
DECLARE
  v_state text:=pg_get_functiondef('public.bc7_estado_confirmaciones_jornada(uuid)'::regprocedure);
  v_liquidation text:=pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  v_transfer text:=pg_get_functiondef('public.bc7_vincular_transferencia_jornada(uuid,uuid,text)'::regprocedure);
BEGIN
  IF v_state NOT LIKE '%BC7_CASH_PER_DAY_STEP5_V1%'
     OR v_state NOT LIKE '%v_daily_approved%'
     OR v_state NOT LIKE '%v_cash_registered:=v_daily_expected>0 AND v_daily_registered=v_daily_expected%'
     OR v_state NOT LIKE '%v_daily_approved=v_daily_expected%'
     OR v_state LIKE '%DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION%' THEN
    RAISE EXCEPTION 'FAIL: Step 5 must complete from per-date cash entries only; no period-wide worker declaration may be required.';
  END IF;

  IF v_liquidation NOT LIKE '%BC7_CASH_PER_DAY_LIQUIDATION_V1%'
     OR v_liquidation NOT LIKE '%coalesce(v_p.fecha_fin,v_p.fecha)-v_p.fecha+1%'
     OR v_liquidation NOT LIKE '%v_daily_cash%'
     OR v_liquidation NOT LIKE '%v_daily_pending=0 AND v_daily_missing=0%' THEN
    RAISE EXCEPTION 'FAIL: liquidation must cover every calendar date inclusively and total approved daily deliveries only.';
  END IF;

  IF v_transfer NOT LIKE '%BC7_TRANSFER_ALLOW_SEALED_JORNADA_V1%'
     OR v_transfer NOT LIKE '%CERRADA_OPERATIVAMENTE%'
     OR v_transfer NOT LIKE '%v_s.estado NOT IN%'
     OR v_transfer NOT LIKE '%v_t.fecha<=v_period_end%'
     OR v_transfer NOT LIKE '%v_s.turno_id%'
     OR v_transfer NOT LIKE '%v_existing.turno_sesion_id=v_s.id%'
     OR v_transfer NOT LIKE '%TRANSFERENCIA_RETROACTIVA_VINCULADA%' THEN
    RAISE EXCEPTION 'FAIL: sealed transfer attribution must retain period, destination, master Turn, uniqueness and audit guards.';
  END IF;

  RAISE NOTICE 'PASS daily-only cash Step 5, inclusive period coverage, approved cash aggregation and audited sealed transfer attribution.';
END
$jornada_cash_per_day_transfer_contract$;
