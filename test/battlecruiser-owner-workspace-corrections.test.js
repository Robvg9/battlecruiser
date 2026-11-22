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
const centerControl = read("public/js/centro-control.js");
const approvals = read("public/js/aprobaciones-admin.js");
const communication = read("public/js/comunicacion.js");
const humanOperations = read("public/js/operacion-humana.js");
const priceChanges = read("public/js/jornada-price-changes.js");
const app = read("public/app.js");
const serviceWorker = read("public/service-worker.js");
const index = read("public/index.html");
const { assertPwaReleaseAligned, assertModuleCacheAligned } = require("./helpers/pwa-release-contract");
const legacyHistory = read("public/js/bc7-legacy-history.js");
const legacyTurns = read("public/js/m29-turnos-organizacion.js");

test("Jornada e inventario is the only visible route for current and historical journey aliases", () => {
  assert.match(permissions, /turnos:\s*true[\s\S]*ciclos:\s*true/);
  assert.match(permissions, /"resumen",\s*"jornada",\s*"comunicacion"/);
  assert.match(navigation, /tab === "turnos" \|\| tab === "ciclos"[\s\S]*tab = "jornada"/);
  assert.match(permissions, /ciclos:\s*true/);
  assert.match(legacyHistory, /const ROOT_ID = 'ciclos-m18-root'/);
  assert.match(legacyHistory, /document\.getElementById\(ROOT_ID\)/);
  assert.match(legacyHistory, /host\.appendChild\(legacyRoot\)/);
  assert.match(legacyHistory, /legacyApi\.renderHome\(\)/);
  assert.match(legacyHistory, /__BC7_LEGACY_ARCHIVE_ONLY__ = true/);
  assert.match(legacyTurns, /__BC7_LEGACY_ARCHIVE_ONLY__ === true/);
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
  const mainCards = operations.match(/cards\.push\(\{ key:/g) || [];
  assert.equal(mainCards.length, 4);
  assert.match(operations, /title: 'Agregar gasto'/);
  assert.match(operations, /title: 'Agregar baja'/);
  assert.match(operations, /title: 'Agregar reinversión'/);
  assert.match(operations, /title: 'Reportar incidencia'/);
  assert.match(operations, /op-secondary-details/);
  assert.match(operations, /buildSecondaryActions/);
});

test("Control Center shortcuts use existing purchase, transfer, low-stock, Jornada and pending workflows", () => {
  for (const label of ["Nueva compra", "Nueva transferencia", "Stock bajo", "Jornada actual", "Pendientes", "Cambios de precio"]) {
    assert.ok(quickActions.includes(label), "missing shortcut: " + label);
  }
  assert.match(quickActions, /window\.__BC165_open\('compras'\)/);
  assert.match(quickActions, /window\.__BC165_open\('transferencias'\)/);
  assert.match(quickActions, /window\.__BC_openStockBajo\(\)/);
  assert.match(quickActions, /window\.irATab\('jornada'\)/);
  assert.match(quickActions, /window\.irATab\('pendientes'\)/);
});

test("Operations dialogs open on the first tap while catalogs load in the visible modal", () => {
  const gasto = operations.slice(operations.indexOf("async function openGasto()"), operations.indexOf("async function openBaja()"));
  const reinversion = operations.slice(operations.indexOf("async function openReinversion()"), operations.indexOf("function openResponsabilidad()"));
  assert.ok(gasto.indexOf("openModal({") >= 0 && gasto.indexOf("openModal({") < gasto.indexOf("ensureOperationCatalogs(false)"),
    "Gasto modal must appear before its optional warehouse refresh");
  assert.ok(reinversion.indexOf("openModal({") >= 0 && reinversion.indexOf("openModal({") < reinversion.indexOf("ensureOperationCatalogs(true, true)"),
    "Reinversion modal must appear before its required catalog request");
  assert.match(reinversion, /submit\.disabled = true/);
  assert.match(reinversion, /submit\.disabled = !ready/);
  assert.match(operations, /@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(operations, /touch-action:manipulation/);
  assert.match(operations, /\.op-card:active\{transform:none\}/);
  assert.match(operations, /bajaOpenPromise/);
});

test("Administrator quick access includes price changes and follows the same server admin gate", () => {
  assert.match(quickActions, /key: 'price-changes', label: 'Cambios de precio'/);
  assert.match(quickActions, /api\.canOpenOwnerModal\(\)/);
  assert.match(quickActions, /bc:price-changes-availability/);
  assert.match(priceChanges, /ownerActionAvailable = isAdmin === true/);
  assert.match(priceChanges, /canOpenOwnerModal: function \(\) \{ return ownerActionAvailable; \}/);
  assert.match(priceChanges, /rpc\('bc_actor_is_admin', \{\}\)/);
  assert.match(quickActions, /repeat\(6,minmax\(0,1fr\)\)/);
});

test("Empty dashboard queues disappear, but live approval, cash and communication workflows remain actionable", () => {
  assert.match(centerControl, /function setDashboardBlockVisible\(content, visible\)/);
  assert.match(centerControl, /if \(total === 0\)[\s\S]*setDashboardBlockVisible\(el, false\)/);
  assert.match(centerControl, /if \(importantes\.length === 0\)[\s\S]*setDashboardBlockVisible\(el, false\)/);
  assert.match(approvals, /Promise\.allSettled\(jobs\.map\(job=>job\.promise\)\)/);
  assert.match(approvals, /setApprovalPanelVisible\(panel,false\)/);
  assert.match(approvals, /function hideApprovalPanel\(\)/);
  assert.match(approvals, /if\(!canAdmin\(\)\)\{hideApprovalPanel\(\);return\}/);
  assert.match(approvals, /setApprovalPanelVisible\(panel,true\);[\s\S]*Sin conexión/);
  assert.match(approvals, /listar_entregas_caja/);
  assert.match(approvals, /function renderEntrega\(x\)/);
  assert.match(approvals, /DECLARADA.*CONTADA/);
  assert.match(communication, /client\.rpc\("contar_no_leidos_global", \{\}\)/);
  assert.match(communication, /function construirAlertasB8\(\)/);
  assert.match(communication, /Mensajes sin leer/);
  assert.match(humanOperations, /Promise\.allSettled\(sources\.map/);
  assert.match(humanOperations, /No se pudieron comprobar todos los avisos de Jornada/);
  assert.match(humanOperations, /function construirAlertasB7\(\)/);
});

test("All revised modules use matching online/offline cache keys in release 9.5.148", () => {
  assert.equal(assertPwaReleaseAligned(assert, { app, serviceWorker, index }).appVersion, "9.5.148");
  assertModuleCacheAligned(assert, { app, serviceWorker, moduleName: "ui-operaciones-hub.js" });
  assertModuleCacheAligned(assert, { app, serviceWorker, moduleName: "bc-owner-quick-actions.js" });
  assertModuleCacheAligned(assert, { app, serviceWorker, moduleName: "jornada-price-changes.js" });
  assertModuleCacheAligned(assert, { app, serviceWorker, moduleName: "aprobaciones-admin.js" });
  assert.match(index, /centro-control\.js\?v=9\.5\.71/);
  assert.match(serviceWorker, /comunicacion\.js\?v=9\.5\.65/);
  assert.match(index, /operacion-humana\.js\?v=9\.5\.65/);
});
