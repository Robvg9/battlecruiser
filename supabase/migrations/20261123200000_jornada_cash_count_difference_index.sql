-- Index the nullable FK used by Owner cash-count discrepancy resolution.
-- The partial predicate avoids storing entries while no discrepancy exists.
CREATE INDEX IF NOT EXISTS turno_jornada_conteos_caja_diferencia_id_idx
  ON public.turno_jornada_conteos_caja (diferencia_id)
  WHERE diferencia_id IS NOT NULL;

COMMENT ON INDEX public.turno_jornada_conteos_caja_diferencia_id_idx IS
  'Supports ADMIN cash discrepancy resolution and FK checks for the independent Owner count.';
