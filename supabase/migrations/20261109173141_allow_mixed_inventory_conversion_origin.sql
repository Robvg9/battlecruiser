-- BattleCruiser: allow FIFO lots created by a mixed-inventory flavor conversion.
-- The conversion RPC already writes origen='conversion_mixta'; the original CHECK
-- constraint omitted that valid origin and rejected every conversion transaction.
ALTER TABLE public.lotes_compra
  DROP CONSTRAINT IF EXISTS lotes_compra_origen_check;

ALTER TABLE public.lotes_compra
  ADD CONSTRAINT lotes_compra_origen_check
  CHECK (origen = ANY (ARRAY[
    'compra'::text,
    'transferencia'::text,
    'reinversion'::text,
    'conversion_mixta'::text
  ]));
