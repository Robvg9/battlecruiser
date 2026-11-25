\\set ON_ERROR_STOP on
-- Structural contract for the Jornada zero-opening inventory omission rule
-- and the operationally closed Owner movement-classification path.
DO $jornada_zero_stock_final_skip_contract$
DECLARE
  v_product_set text:=pg_get_functiondef('public.bc7_jornada_productos_corte(uuid,text)'::regprocedure);
  v_liquidation text:=pg_get_functiondef('public.bc7_liquidacion_inventario_jornada(uuid)'::regprocedure);
  v_classification text:=pg_get_functiondef('public.bc7_clasificar_movimientos_fuera_corte(uuid,jsonb)'::regprocedure);
BEGIN
  IF v_product_set NOT LIKE '%initial_lines%'
     OR v_product_set NOT LIKE '%final_lines%'
     OR v_product_set NOT LIKE '%movement_products%'
     OR v_product_set NOT LIKE '%coalesce(i.qty,0)<>0%'
     OR v_product_set NOT LIKE '%coalesce(f.qty,0)<>0%'
     OR v_product_set NOT LIKE '%m.product_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'FAIL: final product set must omit products with zero initial/final quantities and no attributable movement.';
  END IF;
  IF v_product_set NOT LIKE '%TRANSFERENCIA_ENTRADA%'
     OR v_product_set NOT LIKE '%TRANSFERENCIA_SALIDA%'
     OR v_product_set NOT LIKE '%COMPRA%'
     OR v_product_set NOT LIKE '%REINVERSION%'
     OR v_product_set NOT LIKE '%VALE%'
     OR v_product_set NOT LIKE '%MERMA%'
     OR v_product_set NOT LIKE '%BAJA%' THEN
    RAISE EXCEPTION 'FAIL: zero-stock omission must recognize all Jornada stock movement types.';
  END IF;
  IF v_liquidation NOT LIKE '%eligible_product_ids%'
     OR v_liquidation NOT LIKE '%mt.product_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'FAIL: settlement calculation must use the same required-product filter as the final inventory product set.';
  END IF;
  IF v_classification NOT LIKE '%v_s.estado NOT IN (''COMPLETADA'',''CERRADA_OPERATIVAMENTE'')%'
     OR v_classification NOT LIKE '%coalesce(t.estado_maestro,t.estado) IN (''CERRADO'',''CANCELADO'')%'
     OR v_classification NOT LIKE '%MOVIMIENTOS_POST_CORTE_CLASIFICADOS%' THEN
    RAISE EXCEPTION 'FAIL: post-cutoff classification must accept an operationally closed session while preserving the open master-Turn gate and audit trail.';
  END IF;
  RAISE NOTICE 'PASS Jornada zero-stock final skip + operationally closed classification contract.';
END
$jornada_zero_stock_final_skip_contract$;
