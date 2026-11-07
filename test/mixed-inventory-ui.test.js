"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const index = read("public/index.html");
const products = read("public/js/productos.js");
const purchases = read("public/js/compra-multiple.js");
const movements = read("public/js/movimiento-multiple.js");
const sales = read("public/js/ventas.js");
const warehouses = read("public/js/almacenes.js");
const finance = read("public/js/operaciones-financieras.js");
const m53 = read("public/js/m53-inventario-centro.js");
const detail = read("public/js/inventario-detalle.js");
const migration = read("supabase/migrations/20261104183000_product_mixed_inventory_variants.sql");
const conversionMigration = read("supabase/migrations/20261107230000_mixed_inventory_conversion_composite_minimum.sql");

test("Mixed inventory stays opt-in and flavor names are entered by the administrator in the product form", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(index);
  try {
    const d = dom.window.document;
    assert.equal(d.querySelectorAll("#prod-inventario-mixto").length, 1);
    assert.equal(d.querySelectorAll("#prod-variantes-editor").length, 1);
    assert.equal(d.querySelectorAll("#prod-variantes-lista").length, 1);
    assert.equal(d.querySelectorAll("#prod-variante-agregar").length, 1);
    assert.match(d.querySelector("#prod-inventario-mixto-settings").textContent, /mínimo compuesto/);
    assert.match(d.querySelector("#prod-inventario-mixto-settings").textContent, /indica manualmente cuántas unidades reales/);
    assert.equal(d.querySelectorAll("#prod-variantes-asignacion").length, 1);
    assert.equal(d.getElementById("prod-inventario-mixto").checked, false,
      "mixed inventory is disabled unless the owner opts in");
    assert.ok(d.getElementById("prod-variantes-lista").closest("#form-producto"));
  } finally {
    dom.window.close();
  }
  assert.match(products, /function productosPrincipales\(rows\)/);
  assert.match(products, /function productosOperativos\(rows\)/);
  assert.match(products, /function obtenerVariantesFormularioProducto\(\)/);
  assert.match(products, /p_variantes:\s*mixedEnabled \? variants : \[\]/);
  assert.match(products, /configurar_producto_inventario_mixto_con_asignaciones/);
  assert.match(products, /bc_obtener_snapshot_conversion_mixta/);
  assert.match(products, /prepararAsignacionesMixtasProducto/);
  assert.match(products, /data-confirm-mixed-conversion/);
  assert.match(products, /minimum <= 0/);
  assert.match(products, /nombre: \(row\.querySelector\("\.prod-variante-nombre"\)/);
  assert.match(products, /new Set\(names\)\.size !== names\.length/);
  assert.match(products, /async function ejecutarProductoMixtoSinCola\(editandoId, payload\)/);
  assert.match(products, /El producto mixto no se guardó ni se encoló/);
  assert.match(products, /if\s*\(needsMixedConfig\)\s*\{\s*resultado = await ejecutarProductoMixtoSinCola/);
  assert.match(products, /String\(v\.producto_padre_id\) === String\(p\.id\) && v\.activo !== false/);
});

test("Every operational product picker selects child flavor IDs, not the mixed parent", () => {
  assert.match(purchases, /productosOperativos\(rows\)/);
  assert.match(movements, /productosOperativos\(rows\)/);
  assert.match(sales, /productosOperativos\(productos\)/);
  assert.match(warehouses, /productosOperativos\(productos\)/);
  assert.match(finance, /productosOperativos\(rows\)/);
  assert.match(warehouses, /fillSelect\(document\.getElementById\("trf-producto"\), productosMovimiento/);
  assert.match(warehouses, /fillSelect\(document\.getElementById\("vale-producto"\), productosMovimiento/);
});

test("Inventory centre replaces variant rows with parent total and a non-navigating expandable breakdown", () => {
  assert.match(m53, /client\.rpc\('inventario_mixto_enriquecido'/);
  assert.match(m53, /mixedVariantIds\.add\(String\(variant\.producto_id\)\)/);
  assert.match(m53, /ordinaryRowsWithWarehouseIds\.filter\(function \(row\)/);
  assert.match(m53, /<details class="bc-m53-variant-details">/);
  assert.match(m53, /Ver stock detallado/);
  assert.match(m53, /qtyFmt\(variant\.cantidad\)/);
  assert.match(detail, /bc-m53-variant-details/);
  assert.match(detail, /event\.stopPropagation\(\)/);
});

test("Mixed inventory migration keeps existing product IDs as the transaction and FIFO key", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS inventario_mixto boolean NOT NULL DEFAULT false/);
  assert.match(migration, /producto_padre_id uuid/);
  assert.match(migration, /variante_nombre text/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.configurar_producto_inventario_mixto/);
  assert.match(migration, /CREATE TRIGGER bc_guard_mixed_stock_sku/);
  assert.match(migration, /CREATE TRIGGER bc_sync_mixed_variant_presentations/);
  assert.match(migration, /l\.producto_id=v\.id AND l\.almacen_id=a\.id/);
  assert.match(migration, /inventario_mixto_enriquecido/);
  assert.match(migration, /no se repartirá automáticamente/);
  assert.match(migration, /No puedes quitar una variante que todavía conserva stock o lotes pendientes/);
  assert.match(migration, /CREATE TRIGGER bc_seed_mixed_stock_for_warehouse/);
  assert.match(conversionMigration, /CREATE TABLE IF NOT EXISTS public\.lotes_compra_conversion_mixta/);
  assert.match(conversionMigration, /configurar_producto_inventario_mixto_con_asignaciones/);
  assert.match(conversionMigration, /bc_obtener_snapshot_conversion_mixta/);
  assert.match(conversionMigration, /historial_compras/);
  assert.match(conversionMigration, /historial_premium_detalle/);
  assert.match(conversionMigration, /sum\(coalesce\(vm\.minimo,0\)\)/);
  assert.match(conversionMigration, /DELETE FROM public\.productos_stock_mixto_minimos WHERE producto_id=p_producto_id/);
  assert.match(conversionMigration, /conversion_mixta/);
});

test("Product catalog query falls back until the optional migration is deployed", () => {
  assert.match(products, /const extended = await client\.from\("productos"\)/);
  assert.match(products, /column .* does not exist\|schema cache/i);
  assert.match(products, /return client\.from\("productos"\)[\s\S]*select\("id, nombre, unidad, precio_normal, precio_mayorista, activo, imagen_url, categoria_id, presentacion_id, categorias\(nombre\), presentaciones\(nombre\)"\)/);
});

test("Cache versions are bumped for the updated PWA inventory and admin assets", () => {
  assert.match(index, /productos\.js\?v=20261107\.2/);
  assert.match(index, /catalogos\.js\?v=20261106\.1/);
  assert.match(index, /app\.js\?v=9\.5\.79/);
  assert.match(read("public/service-worker.js"), /BC_SW_VERSION = "9.5.79"/);
  assert.match(read("public/app.js"), /\["m53-inventario-centro\.js","53.7"\]/);
});
