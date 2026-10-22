-- Controlled rollback for migration 20261022040000_bc4_reconcile_masareal_fifo_historical_costs.sql.
-- Restores ONLY the backed-up unit-cost columns; never rewrites quantities, stock, or sale totals.
-- Run only after reviewing the exact before-image and only if the reconciled values must be reverted.
BEGIN;

DO $rollback$
DECLARE
  v_backup private.bc_step4_masareal_fifo_cost_reconciliation_20261022%ROWTYPE;
  v_rows integer;
BEGIN
  SELECT * INTO v_backup
  FROM private.bc_step4_masareal_fifo_cost_reconciliation_20261022
  WHERE reconciliation_key='masareal_factor10_fifo_2026-10-22';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The reconciliation before-image does not exist; rollback aborted.';
  END IF;
  IF jsonb_array_length(v_backup.lots_before)<>7 OR jsonb_array_length(v_backup.sale_lines_before)<>12 THEN
    RAISE EXCEPTION 'The saved before-image does not contain exactly 7 lots and 12 sale lines; rollback aborted.';
  END IF;

  UPDATE public.lotes_compra AS current_row
     SET costo_unitario=before_row.costo_unitario
    FROM jsonb_populate_recordset(NULL::public.lotes_compra, v_backup.lots_before) AS before_row
   WHERE current_row.id=before_row.id
     AND current_row.costo_unitario=150;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>7 THEN
    RAISE EXCEPTION 'Expected to restore 7 unit costs; restored %; transaction rolled back.',v_rows;
  END IF;

  UPDATE public.ventas_lineas AS current_row
     SET costo_unitario_fifo=before_row.costo_unitario_fifo
    FROM jsonb_populate_recordset(NULL::public.ventas_lineas, v_backup.sale_lines_before) AS before_row
   WHERE current_row.id=before_row.id
     AND current_row.costo_unitario_fifo=150;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>12 THEN
    RAISE EXCEPTION 'Expected to restore 12 sale-line costs; restored %; transaction rolled back.',v_rows;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_populate_recordset(NULL::public.lotes_compra, v_backup.lots_before) AS before_row
    JOIN public.lotes_compra current_row ON current_row.id=before_row.id
    WHERE current_row.costo_unitario IS DISTINCT FROM before_row.costo_unitario
  ) OR EXISTS (
    SELECT 1 FROM jsonb_populate_recordset(NULL::public.ventas_lineas, v_backup.sale_lines_before) AS before_row
    JOIN public.ventas_lineas current_row ON current_row.id=before_row.id
    WHERE current_row.costo_unitario_fifo IS DISTINCT FROM before_row.costo_unitario_fifo
  ) THEN
    RAISE EXCEPTION 'Rollback read-back mismatch; transaction rolled back.';
  END IF;

  RAISE NOTICE 'Rollback PASS: restored the before-image cost columns only. Stock quantities and sale totals were not changed.';
END;
$rollback$;

COMMIT;
