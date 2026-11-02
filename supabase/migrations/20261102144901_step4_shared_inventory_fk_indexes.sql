-- Step 4/15 — cover the new shared-inventory foreign keys for predictable FK checks.
BEGIN;
CREATE INDEX IF NOT EXISTS turno_jornada_entregas_turno_idx
  ON public.turno_jornada_inventario_entregas(turno_id);
CREATE INDEX IF NOT EXISTS turno_jornada_entregas_creado_por_idx
  ON public.turno_jornada_inventario_entregas(creado_por);
CREATE INDEX IF NOT EXISTS turno_jornada_entrega_lineas_producto_idx
  ON public.turno_jornada_inventario_entrega_lineas(producto_id);
CREATE INDEX IF NOT EXISTS turno_jornada_recepciones_recibido_por_idx
  ON public.turno_jornada_inventario_recepciones(recibido_por);
CREATE INDEX IF NOT EXISTS turno_jornada_recepciones_decision_por_idx
  ON public.turno_jornada_inventario_recepciones(decision_por)
  WHERE decision_por IS NOT NULL;
CREATE INDEX IF NOT EXISTS turno_jornada_recepcion_lineas_producto_idx
  ON public.turno_jornada_inventario_recepcion_lineas(producto_id);
COMMIT;
