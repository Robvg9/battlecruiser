"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const baseMigration = read("supabase/migrations/20261104183000_product_mixed_inventory_variants.sql");
const migration = read("supabase/migrations/20261107130000_mixed_variant_warehouse_stock_minimums.sql");
const conversionMigration = read("supabase/migrations/20261107211007_mixed_inventory_conversion_composite_minimum.sql");
const purchaseMinimumMigration = read("supabase/migrations/20261109180500_defer_stock_minimum_for_purchases.sql");
const detail = read("public/js/inventario-detalle.js");
const purchase = read("public/js/compra-multiple.js");
const inventory = read("public/js/m53-inventario-centro.js");
const operations = read("public/js/ui-operaciones-hub.js");
const approvals = read("public/js/aprobaciones-admin.js");
const index = read("public/index.html");
const finance = read("public/js/operaciones-financieras.js");
const vales = read("public/js/vales.js");
const app = read("public/app.js");
const serviceWorker = read("public/service-worker.js");

test("Purchases can add stock before a minimum is configured, then leave minimum setup pending", () => {
  assert.match(purchaseMinimumMigration, /app\.bc_purchase_stock_write/);
  assert.match(purchaseMinimumMigration, /private\.bc_apply_stock_purchase_increment/);
  assert.match(purchaseMinimumMigration, /CREATE OR REPLACE FUNCTION public\.registrar_compra\(/);
  assert.match(purchaseMinimumMigration, /CREATE OR REPLACE FUNCTION public\.registrar_compra_multiple\(/);
  const purchaseFunctions = purchaseMinimumMigration.slice(purchaseMinimumMigration.indexOf("CREATE OR REPLACE FUNCTION public.registrar_compra("));
  assert.doesNotMatch(purchaseFunctions, /INSERT INTO public\.stock/i);
  assert.match(purchaseFunctions, /PERFORM private\.bc_apply_stock_purchase_increment/);
  assert.match(purchase, /async function revisarMinimosPendientesCompra/);
  assert.match(purchase, /Ahora configura el stock mínimo en/);
  assert.match(purchase, /await mostrarResultadoCompraRegistrada/);
});
test("Every stock row has a non-null minimum and existing nulls are safely initialized", () => {
  assert.match(migration, /UPDATE public\.stock SET minimo=0 WHERE minimo IS NULL/);
  assert.match(migration, /ALTER TABLE public\.stock ALTER COLUMN minimo SET NOT NULL/);
  assert.match(migration, /ALTER TABLE public\.stock ALTER COLUMN minimo SET DEFAULT 0/);
  assert.match(migration, /UPDATE OF cantidad,producto_id,almacen_id,minimo ON public\.stock/);
  assert.match(migration, /NEW\.minimo IS DISTINCT FROM OLD\.minimo/);
  assert.match(migration, /NEW\.minimo::text IN \('NaN','Infinity','-Infinity'\)/);
  assert.match(migration, /p_minimo::text IN \('NaN','Infinity','-Infinity'\)/);
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
  assert.match(migration, /NOT public\.bc_actor_is_admin\(\)/);
  assert.match(migration, /LEFT JOIN public\.productos_stock_mixto_minimos vm ON vm\.producto_id=v\.id AND vm\.almacen_id=a\.id/);
  assert.match(migration, /'minimo',coalesce\(vm\.minimo,0\)/);
  assert.match(migration, /'estado',CASE WHEN coalesce\(vm\.minimo,0\)<=0 THEN 'sin_minimo'/);
  assert.match(conversionMigration, /sum\(coalesce\(vm\.minimo,0\)\)/);
  assert.match(conversionMigration, /THEN 'bajo'/);
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
  assert.match(detail, /Mínimo compuesto/);
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

test("Operations uses live catalogs for expenses/reinvestments and opens Baja through the batch editor", () => {
  assert.match(operations, /async function ensureOperationCatalogs\(required\)/);
  for (const name of ["openGasto", "openReinversion"]) {
    assert.match(operations, new RegExp("async function " + name + "\\(\\)[\\s\\S]*?await ensureOperationCatalogs\\("));
  }
  assert.match(operations, /window\.refrescarAlmacenes/);
  assert.match(operations, /window\.refrescarProductos/);
  assert.match(operations, /async function openBaja\(\)/);
  assert.match(operations, /window\.abrirBajasMultiple/);
  assert.ok(operations.includes("await ensureOperationCatalogs(false)"));
  assert.ok(operations.includes("await ensureOperationCatalogs(true)"));
});

test("Baja entry is one authenticated multi-product list, not a duplicate finance form", () => {
  const bajas = read("public/js/bajas-multiple.js");
  assert.match(bajas, /id="bc-bajas-multiple-form"/);
  assert.match(bajas, /id="bc-baja-add"/);
  assert.match(bajas, /crear_bajas_multiple/);
  assert.doesNotMatch(bajas, /hasSession/);
   assert.doesNotMatch(bajas, /auth\.getSession\(\)/);
  assert.doesNotMatch(finance, /crear_baja|form-salida-producto/);
  assert.doesNotMatch(approvals, /rpc\('crear_baja'/);
});

test("The legacy vale type keeps its stored value but is presented as Baja", () => {
  assert.match(index, /<option value="merma">Baja<\/option>/);
  assert.match(vales, /merma: "Baja"/);
  assert.doesNotMatch(vales, /merma: "Merma"/);
  assert.match(index, /js\/vales\.js\?v=20261107\.1/);
  assert.match(read("public/service-worker.js"), /\.\/js\/vales\.js\?v=20261107\.1/);
});

test("Release cache keys and Service Worker precache match the modified inventory and Operations modules", () => {
  assert.match(app, /const VERSION="9\.5\.93"/);
  assert.match(app, /m53-inventario-centro\.js","53\.7/);
  assert.match(app, /ui-operaciones-hub\.js","43\.2/);
  assert.ok(app.includes('["operaciones-financieras.js","20261108.5"]'));
  assert.ok(app.includes('["aprobaciones-admin.js","20261110.2"]'));
  assert.match(app, /inventario-detalle\.js","71"/);
  assert.match(app, /compra-multiple\.js","27\.16"/);
  assert.ok(app.includes('["movimiento-multiple.js","20261109.1"]'));
  assert.match(index, /productos\.js\?v=20261109\.3/);
  assert.match(index, /style\.css\?v=9\.5\.93/);
  assert.match(index, /almacenes\.js\?v=20261109\.1/);
  assert.match(index, /app\.js\?v=9\.5\.93/);
  assert.match(index, /v9\.5\.93 — BattleCruiser/);
  assert.match(serviceWorker, /BC_SW_VERSION = "9\.5\.93"/);
  for (const asset of [
    "inventario-detalle.js?v=71",
    "operaciones-financieras.js?v=20261108.5",
    "aprobaciones-admin.js?v=20261110.2",
    "ui-operaciones-hub.js?v=43.2",
    "almacenes.js?v=20261109.1",
    "m53-inventario-centro.js?v=53.8",
    "movimiento-multiple.js?v=20261109.1",
    "productos.js?v=20261109.3",
    "compra-multiple.js?v=27.16",
    "aprobaciones-admin.js?v=20261110.2",
    "bajas-multiple.js?v=1.6"
  ]) assert.ok(serviceWorker.includes(asset), "missing SW precache asset " + asset);
});

test("Baja card opens the shared batch form with predefined reasons and required Otro detail", () => {
  const bajas = read("public/js/bajas-multiple.js");
  assert.match(operations, /title: 'Registrar baja'/);
  assert.match(operations, /window\.abrirBajasMultiple/);
  assert.match(operations, /can\('bajas', 'ver'\) && can\('bajas', 'crear'\)/);
  for (const reason of ["Rotura", "Hechado a perder", "El Jefe lo cogió", "Vencimiento", "Daño o deterioro", "Pérdida", "Consumo interno", "Otro"]) {
    assert.ok(bajas.includes("'" + reason + "'"), "missing Baja reason " + reason);
  }
  assert.match(bajas, /other\.required = reason\.value === 'Otro'/);
  assert.match(bajas, /api\.rpc\('crear_bajas_multiple'/);
  assert.doesNotMatch(operations, /rpc\('crear_baja'/);
  assert.doesNotMatch(approvals, /rpc\('crear_baja'/);
  assert.ok(approvals.includes("Baja pendiente"));
});
