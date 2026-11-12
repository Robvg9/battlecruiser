-- Post-migration fixture: explicit linked transfer and owner-approved adjustments.
-- This file only runs in the disposable PostgreSQL 17 CI database.
INSERT INTO public.transferencias(
  id,almacen_origen_id,almacen_destino_id,fecha,creado_por,estado
) VALUES
  ('97200000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   '2026-10-27 15:50:00+00',
   '91000000-0000-0000-0000-000000000002',
   'completada'),
  ('97200000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   '2026-10-27 15:52:00+00',
   '91000000-0000-0000-0000-000000000002',
   'completada');

INSERT INTO public.transferencias_lineas(id,transferencia_id,producto_id,cantidad)
VALUES
  ('97300000-0000-0000-0000-000000000001',
   '97200000-0000-0000-0000-000000000001',
   '31000000-0000-0000-0000-000000000001',4),
  ('97300000-0000-0000-0000-000000000002',
   '97200000-0000-0000-0000-000000000002',
   '31000000-0000-0000-0000-000000000001',9);

-- Only the first transfer is explicitly linked to the employee's Jornada.
-- Both were created by another actor, so a creator/tranche-only filter misses it.
INSERT INTO public.turno_jornada_entradas_vinculadas(
  turno_sesion_id,transferencia_id,vinculado_por
) VALUES (
  '93000000-0000-0000-0000-000000000001',
  '97200000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001'
);

-- These requests were created during the Jornada and explicitly reference it,
-- but ADMIN reviewed them after the worker's tranche had ended.
INSERT INTO public.mermas(
  id,almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre,
  fecha_revision,actualizado_en,revisado_por,revisado_nombre,creado_en,turno_sesion_id,turno_tramo_id
) VALUES (
  '99200000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  2,'fixture explícito','APROBADA',
  '91000000-0000-0000-0000-000000000001','Responsable fixture',
  '2026-10-27 19:00:00+00','2026-10-27 19:00:00+00',
  '91000000-0000-0000-0000-000000000002','ADMIN fixture',
  '2026-10-27 15:45:00+00',
  '93000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001'
);

INSERT INTO public.bajas(
  id,almacen_id,producto_id,cantidad,motivo,estado,creado_por,creado_nombre,
  fecha_revision,actualizado_en,revisado_por,revisado_nombre,creado_en,turno_sesion_id,turno_tramo_id
) VALUES (
  '99300000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  3,'fixture explícito','APROBADA',
  '91000000-0000-0000-0000-000000000001','Responsable fixture',
  '2026-10-27 19:05:00+00','2026-10-27 19:05:00+00',
  '91000000-0000-0000-0000-000000000002','ADMIN fixture',
  '2026-10-27 15:46:00+00',
  '93000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001'
);
