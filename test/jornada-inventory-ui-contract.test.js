"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("public/app.js", "utf8");
const sw = fs.readFileSync("public/service-worker.js", "utf8");
const index = fs.readFileSync("public/index.html", "utf8");
const m53 = fs.readFileSync("public/js/m53-inventario-centro.js", "utf8");
const detail = fs.readFileSync("public/js/inventario-detalle.js", "utf8");
const legacyHistory = fs.readFileSync("public/js/bc7-legacy-history.js", "utf8");
const legacyTurns = fs.readFileSync("public/js/m29-turnos-organizacion.js", "utf8");
const warehouses = fs.readFileSync("public/js/almacenes.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261111031000_bc_jornada_current_inventory_and_unit_base.sql", "utf8");

test("M53 9.5.96 loads and is cached with one shared build key", () => {
  assert.match(app, /const VERSION="9\.5\.96"/);
  assert.match(sw, /BC_SW_VERSION = "9\.5\.96"/);
  assert.match(app, /\["m53-inventario-centro\.js","53\.9"\]/);
  assert.match(sw, /\.\/js\/m53-inventario-centro\.js\?v=53\.9/);
  assert.match(m53, /M53\.9/);
});

test("mixed family parent summary replaces both family and child ordinary rows", () => {
  assert.match(m53, /const mixedParentIds = new Set\(\)/);
  assert.match(m53, /mixedParentIds\.add\(String\(row\.producto_id\)\)/);
  assert.match(m53, /!mixedVariantIds\.has\(productId\) && !mixedParentIds\.has\(productId\)/);
  assert.match(detail, /variantId && warehouseId && getClient\(\)/);
  assert.match(detail, /esc\(variant\.nombre/);
});

test("undistributed opening inventory is visible as a generic family row without an editable variant", () => {
  assert.match(migration, /Inventario inicial sin distribuir/);
  assert.match(detail, /const variantId = variant\.producto_id \|\| ''/);
  assert.match(detail, /variantId && warehouseId && getClient\(\)/);
});

test("product editor explains the retail base-unit and wholesale-presentation rule", () => {
  assert.match(index, /id="bc-unidad-base-note"/);
  assert.match(index, /almacenes minoristas siempre controlan existencias por unidades/);
  assert.match(index, /presentaciones con factor de conversión/);
});


test("legacy history remains nested in canonical Jornada while legacy turn creation is disabled", () => {
  assert.match(app, /\["bc7-legacy-history\.js","1\.0"\]/);
  assert.match(sw, /bc7-legacy-history\.js\?v=1\.0/);
  assert.match(legacyHistory, /Historial y expedientes anteriores/);
  assert.match(legacyHistory, /host\.appendChild\(legacyRoot\)/);
  assert.match(legacyTurns, /LEGACY_CREATION_ENABLED = false/);
  assert.match(legacyTurns, /var btnHtml = ''/);
});

test("warehouse detail reads jornada-projected balances without changing the raw transaction cache", () => {
  assert.match(warehouses, /client\.rpc\("inventario_enriquecido"/);
  assert.match(warehouses, /client\.rpc\("inventario_mixto_enriquecido"/);
  assert.match(warehouses, /bcConTimeoutLocal\(Promise\.all/);
  assert.match(warehouses, /_cache\.stock_visual/);
  assert.match(warehouses, /\|\| s\.producto \|\| "—"/);
  assert.match(warehouses, /const unidad = s\.unidad \|\| \(p && p\.unidad\) \|\| "unidad"/);
  assert.match(warehouses, /\|\| a\.producto \|\| ""/);
  assert.match(warehouses, /function stockDelAlmacen\(almacenId\)[\s\S]*_cache\.stock/);
  assert.match(warehouses, /function stockVisualDelAlmacen\(almacenId\)[\s\S]*_cache\.stock_visual/);
  assert.match(warehouses, /client\.from\("stock"\)\.select\("producto_id, almacen_id, cantidad, minimo"\)/);
  assert.match(warehouses, /_cache\.stock = Array\.isArray\(stock\)/);
  assert.match(warehouses, /return \(_cache\.stock \|\| \[\]\)\.filter/);
  assert.match(index, /js\/almacenes\.js\?v=20261111\.1/);
  assert.match(sw, /js\/almacenes\.js\?v=20261111\.1/);
});
