-- Index the idempotency table's Turno FK for efficient parent checks and deletes.
BEGIN;

CREATE INDEX IF NOT EXISTS turno_jornada_reprogramacion_turno_id_idx
  ON public.turno_jornada_reprogramacion_idempotencia (turno_id);

COMMIT;
