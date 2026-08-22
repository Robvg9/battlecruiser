-- BattleCruiser — M18.2 — Compra múltiple: vínculo documento → líneas
-- Producción: 2026-08-22

alter table public.lotes_compra
  add column if not exists compra_id uuid references public.compras(id) on delete set null;
create index if not exists idx_lotes_compra_compra_id on public.lotes_compra(compra_id);

-- La RPC vigente registrar_compra_multiple crea el encabezado en compras y
-- guarda compra_id en cada lote generado. Así una compra de 30 productos
-- queda como UN documento con 30 líneas, sin duplicar el sistema FIFO.
