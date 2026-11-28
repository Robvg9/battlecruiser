-- Disposable schema compatibility for the parent-period read-RPC contract.
-- Production already has this column; the Step 5 minimal fixture predates it.
ALTER TABLE public.turno_jornada_programacion
  ADD COLUMN IF NOT EXISTS fecha_fin date;
