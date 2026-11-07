"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const baseMigration = read("supabase/migrations/20261104183000_product_mixed_inventory_variants.sql");
const migration = read("supabase/migrations/20261107130000_mixed_variant_warehouse_stock_minimums.sql");
const detail = read("public/js/inventario-detalle.js");
const inventory = read("public/js/m53-inventario-centro.js");
const operations = read("public/js/ui-operaciones-hub.js");
const approvals = read("public/js/aprobaciones-admin.js");
const index = read("public/index.html");
const finance = read("public/js/operaciones-financieras.js");
const app = read("public/app.js");

test("Every stock row has a non-null minimum and existing nulls are safely initialized", () => {
  assert.match(migration, /UPDATE public\.stock SET minimo=0 WHERE minimo IS NULL/);
  assert.match(migration, /ALTER TABLE public\.stock ALTER COLUMN minimo SET NOT NULL/);
  assert.match(migration, /ALTER TABLE public\.stock ALTER COLUMN minimo SET DEFAULT 0/);
  assert.match(migration, /UPDATE OF cantidad,producto_id,almacen_id,minimo ON public\.stock/);
  assert.match(migration, /NEW\.minimo IS DISTINCT FROM OLD\.minimo/);
  assert.match(migration, /UPDATE OF cantidad,producto_id,almacen_id,minimo/);
});

test("The prerequisite mixed-inventory migration remains safe if migration history replays it after the minimum migration", () => {
  assert.match(baseMigration, /LEFT JOIN public\.productos_stock_mixto_minimos vm ON vm\.producto_id=v\.id AND vm\.almacen_id=a\.id/);
  assert.match(baseMigration, /'minimo',coalesce\(vm\.minimo,0\)/);
  assert.match(baseMigration, /'estado',CASE WHEN coalesce\(vm\.minimo,0\)<=0 THEN 'sin_minimo'/);
});

test("Each mixed-inventory flavor has an independent minimum for each warehouse", () => {
  assert.match(migration, /INSERT INTO public\.productos_stock_mixto_minimos\(producto_id,almacen_id,minimo\)/);
  assert.match(migration, /bc_seed_mixed_variant_minimum/);
  assert.match(migration, /bc_actualizar_stock_minimo_obligatorio/);
  assert.match(migration, /p_minimo<=0/);
  assert.match(migration, /bc_actualizar_stock_minimo_variante/);
  assert.match(migration, /INSERT INTO public\.stock\(producto_id,almacen_id,cantidad,minimo,updated_at\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.bc_seed_mixed_variant_minimum\(\) FROM PUBLIC,anon/);
  assert.match(migration, /tiene_permiso\('stock','editar'\)/);
  assert.match(migration, /LEFT JOIN public\.productos_stock_mixto_minimos vm ON vm\.producto_id=v\.id AND vm\.almacen_id=a\.id/);
  assert.match(migration, /'minimo',coalesce\(vm\.minimo,0\)/);
  assert.match(migration, /'estado',CASE WHEN coalesce\(vm\.minimo,0\)<=0 THEN 'sin_minimo'/);
});

test("Inventory detail edits and saves a separate threshold for each flavor", () => {
  assert.match(detail, /data-bc-save-variant-minimum/);
  assert.match(detail, /data-bc-variant-minimum-input/);
  assert.match(detail, /bc_actualizar_stock_minimo_obligatorio/);
  assert.match(detail, /bc_actualizar_stock_minimo_variante/);
  assert.match(detail, /minimum <= 0/);
  assert.match(detail, /min="0.001"/);
  assert.match(index, /data-estado="sin_minimo"/);
  assert.match(index, /<option value="merma">Baja<\/option>/);
  assert.doesNotMatch(index, /<option value="merma">Merma<\/option>/);
  assert.match(inventory, /option value="sin_minimo">Mínimo pendiente/);
  assert.match(inventory, /unassignedProductRows/);
  assert.match(inventory, /__bc_sin_asignacion/);
  assert.match(inventory, /window\.refrescarProductos/);
  assert.match(detail, /variant\.minimo/);
  assert.match(detail, /Mínimos individuales por sabor/);
  assert.match(detail, /data-bc-assign-warehouse/);
  assert.match(detail, /bc_actualizar_stock_minimo_obligatorio/);
  assert.match(detail, /Sin almacenes asignados/);
  assert.match(detail, /merma: 'Baja'/, 'legacy movements must display as Baja');
});

test("Inventory cards and alerts recognize a low flavor even when total product stock is sufficient", () => {
  assert.match(inventory, /variant\.minimo/);
  assert.match(inventory, /variant\.estado === 'sin_minimo'/);
  assert.match(inventory, /minimosPendientes/);
  assert.match(inventory, /minimosPendientes/);
  assert.match(inventory, /mín\. ' \+ qtyFmt\(minimum\)/);
});

test("Operations loads product and warehouse catalogs before opening stock-related forms", () => {
  assert.match(operations, /async function ensureOperationCatalogs\(required\)/);
  for (const name of ["openGasto", "openBaja", "openReinversion"]) {
    assert.match(operations, new RegExp("async function " + name + "\\(\\)[\\s\\S]*?await ensureOperationCatalogs\\("));
  }
  assert.match(operations, /window\.refrescarAlmacenes/);
  assert.match(operations, /window\.refrescarProductos/);
  assert.match(operations, /window\.productosOperativos\(rows\)/);
  assert.ok(operations.includes("await ensureOperationCatalogs(false)"));
  assert.ok(operations.includes("await ensureOperationCatalogs(true)"));
  assert.ok(operations.includes("No se pudieron cargar los productos y almacenes activos."));
});

test("The financial operations panel loads catalogs before building inventory forms and registers only Baja", () => {
  assert.match(finance, /async function ensureCatalogs\(\)/);
  assert.match(finance, /window\.refrescarProductos/);
  assert.match(finance, /window\.refrescarAlmacenes/);
  assert.match(finance, /async function start\(\)/);
  assert.match(finance, /refreshSelectors\(\)/);
  assert.match(finance, /crear_baja/);
  assert.doesNotMatch(finance, /crear_merma/);
  assert.match(finance, /Motivo de la baja/);
  assert.match(finance, /Otro/);
  for (const reason of ["Rotura", "Hechado a perder", "El Jefe lo cogió", "Vencimiento", "Daño o deterioro", "Pérdida", "Consumo interno", "Otro"]) {
    assert.ok(finance.includes('value="' + reason + '"') || finance.includes(">" + reason + "<"), "missing financial Baja reason " + reason);
  }
});

test("Release cache keys are refreshed for the modified inventory and Operations modules", () => {
  assert.match(app, /m53-inventario-centro\.js","53\.6/);
  assert.match(app, /ui-operaciones-hub\.js","43\.0/);
  assert.match(app, /operaciones-financieras\.js","20261107\.2/);
  assert.match(app, /aprobaciones-admin\.js","20261107\.1/);
});

test("Merma is presented as Baja with selectable predefined reasons and a required detail for Otro", () => {
  assert.match(operations, /title: 'Registrar baja'/);
  assert.match(operations, /title: 'Registrar baja', desc:/);
  assert.match(operations, /can\('bajas', 'ver'\) && can\('bajas', 'crear'\)/);
  for (const reason of ["Rotura", "Hechado a perder", "El Jefe lo cogió", "Vencimiento", "Daño o deterioro", "Pérdida", "Consumo interno", "Otro"]) {
    assert.ok(operations.includes('value="' + reason + '"'), "missing reason " + reason);
  }
  assert.match(operations, /otherInput\.required = isOther/);
  assert.match(operations, /rpc\('crear_baja'/);
  assert.ok(approvals.includes("Baja pendiente"));
  assert.match(approvals, /async function ensureForms\(\)/);
  assert.match(approvals, /window\.refrescarProductos/);
  assert.match(approvals, /window\.refrescarAlmacenes/);
  assert.match(approvals, /rpc\('crear_baja'/);
  for (const reason of ["Rotura", "Hechado a perder", "El Jefe lo cogió", "Vencimiento", "Daño o deterioro", "Pérdida", "Consumo interno", "Otro"]) {
    assert.ok(approvals.includes('value="' + reason + '"'), "missing approval Baja reason " + reason);
  }
});
