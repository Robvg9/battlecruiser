-- Optimize the active Turno model without mass-indexing every FK.
-- Each index below covers an observed FK/query access path.

create index if not exists turno_asignaciones_sesion_turno_idx
  on public.turno_asignaciones (turno_sesion_id, turno_id);

create index if not exists turno_declaraciones_sesion_declarado_idx
  on public.turno_declaraciones (turno_sesion_id, declarado_at desc nulls last, created_at desc nulls last);

create index if not exists turno_entregas_turno_estado_idx
  on public.turno_entregas_inventario (turno_id, estado);

create index if not exists turno_tramos_sesion_turno_idx
  on public.turno_tramos (turno_sesion_id, turno_id);

create index if not exists turno_tramos_usuario_estado_idx
  on public.turno_tramos (usuario_id, estado);
