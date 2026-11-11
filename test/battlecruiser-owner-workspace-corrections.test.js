"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const permissions = read("public/js/permisos-navegacion.js");
const navigation = read("public/js/navegacion.js");
const products = read("public/js/productos.js");
const inventory = read("public/js/m53-inventario-centro.js");
const inventoryDetail = read("public/js/inventario-detalle.js");
const operations = read("public/js/ui-operaciones-hub.js");
const quickActions = read("public/js/bc-owner-quick-actions.js");
const legacyHistory = read("public/js/bc7-legacy-history.js");
const legacyTurns = read("public/js/m29-turnos-organizacion.js");

test("Jornada e inventario is the only visible route for current and historical journey aliases", () => {
  assert.match(permissions, /turnos:\s*true[\s\S]*ciclos:\s*true/);
  assert.match(permissions, /"resumen",\s*"jornada",\s*"comunicacion"/);
  assert.match(navigation, /tab === "turnos" \|\| tab === "ciclos"[\s\S]*tab = "jornada"/);
  assert.match(permissions, /ciclos:\s*true/);
  assert.match(legacyHistory, /document\.getElementById\('ciclos-m18-root'\)/);
  assert.match(legacyHistory, /host\.appendChild\(legacyRoot\)/);
  assert.match(legacyHistory, /Historial y expedientes anteriores/);
  assert.match(legacyTurns, /LEGACY_CREATION_ENABLED = false/);
  assert.match(legacyTurns, /var btnHtml = ''/);
  assert.match(legacyTurns, /if \(!state\.isAdmin \|\| !LEGACY_CREATION_ENABLED\) return false/);
});

test("M53 resolves warehouse UUIDs on mixed-family rows before enabling variant minimum edits", () => {
  assert.match(inventory, /const mixedRowsWithWarehouseIds = mixedRows\.map/);
  assert.match(inventory, /warehouseIdByName\.get\(key\)/);
  assert.match(inventory, /ordinaryVisibleRows\.concat\(mixedRowsWithWarehouseIds/);
  assert.match(inventoryDetail, /data-bc-save-variant-minimum/);
  assert.match(inventoryDetail, /data-variant-id/);
  assert.match(inventoryDetail, /data-warehouse-id/);
});

test("saved product families reload variants from Supabase and cannot be accidentally switched off", () => {
  assert.match(products, /api\.from\("productos"\)[\s\S]*\.eq\("producto_padre_id", productId\)/);
  assert.match(products, /mixedToggle\.checked = familyConfigured/);
  assert.match(products, /mixedToggle\.disabled = familyConfigured/);
  assert.match(products, /familyDataUnavailable/);
  assert.match(products, /mixedToggle\.disabled = false/);
});

test("Operations hub exposes four compact primary create actions and keeps admin functions under More options", () => {
  const mainCards = operations.match(/cards\.push\(\{ tone:/g) || [];
  assert.equal(mainCards.length, 4);
  assert.match(operations, /title: 'Agregar gasto'/);
  assert.match(operations, /title: 'Agregar baja'/);
  assert.match(operations, /title: 'Agregar reinversión'/);
  assert.match(operations, /title: 'Reportar incidencia'/);
  assert.match(operations, /op-secondary-details/);
  assert.match(operations, /buildSecondaryActions/);
});

test("Control Center shortcuts use existing purchase, transfer, low-stock, Jornada and pending workflows", () => {
  for (const label of ["Nueva compra", "Nueva transferencia", "Stock bajo", "Jornada actual", "Pendientes"]) {
    assert.ok(quickActions.includes(label), "missing shortcut: " + label);
  }
  assert.match(quickActions, /window\.__BC165_open\('compras'\)/);
  assert.match(quickActions, /window\.__BC165_open\('transferencias'\)/);
  assert.match(quickActions, /window\.__BC_openStockBajo\(\)/);
  assert.match(quickActions, /window\.irATab\('jornada'\)/);
  assert.match(quickActions, /window\.irATab\('pendientes'\)/);
});
