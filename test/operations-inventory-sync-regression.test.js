"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const products = read("public/js/productos.js");
const inventoryDetail = read("public/js/inventario-detalle.js");
const inventoryCenter = read("public/js/m53-inventario-centro.js");
const operationsHub = read("public/js/ui-operaciones-hub.js");
const finance = read("public/js/operaciones-financieras.js");
const approvals = read("public/js/aprobaciones-admin.js");
const warehouses = read("public/js/almacenes.js");
const purchase = read("public/js/compra-multiple.js");
const transfer = read("public/js/movimiento-multiple.js");
const index = read("public/index.html");

test("Existing product cards expose a direct entry point to configure or edit flavors", () => {
  assert.match(products, /btn-configurar-sabores/);
  assert.match(products, /Configurar sabores/);
  assert.match(products, /Editar sabores/);
  assert.match(products, /toggle\.checked = true/);
  assert.match(products, /agregarFilaVarianteProducto\("", ""\)/);
  assert.match(index, /indica manualmente cuántas unidades reales corresponden a cada sabor/);
});

test("Flavor editor saves a positive minimum independently for each variant and warehouse", () => {
  assert.match(inventoryDetail, /data-bc-save-variant-minimum/);
  assert.match(inventoryDetail, /bc_actualizar_stock_minimo_variante/);
  assert.match(inventoryDetail, /variant\.minimo/);
  assert.match(inventoryDetail, /Mínimo compuesto/);
  assert.match(inventoryDetail, /Cada sabor necesita un mínimo mayor que cero en este almacén/);
  assert.match(inventoryCenter, /inventario_mixto_enriquecido/);
  assert.match(inventoryCenter, /variant\.minimo/);
});

test("Operations hub reloads both catalogs from Supabase instead of trusting non-empty stale cache", () => {
  assert.match(operationsHub, /async function ensureOperationCatalogs\(required\)/);
  assert.match(operationsHub, /api\.from\('productos'\)/);
  assert.match(operationsHub, /categorias\(nombre\),presentaciones\(nombre\)/);
  assert.match(operationsHub, /api\.from\('almacenes'\)/);
  assert.match(operationsHub, /select\('id,nombre,tipo,activo'\)/);
  assert.match(operationsHub, /window\._cache\.productos = Array\.isArray\(results\[0\]\.data\)/);
  assert.match(operationsHub, /window\._cache\.almacenes = Array\.isArray\(results\[1\]\.data\)/);
  assert.match(operationsHub, /window\.bcRefrescarCatalogosOperativos = ensureOperationCatalogs/);
  assert.match(operationsHub, /rpc\('crear_baja'/);
  assert.doesNotMatch(operationsHub, /rpc\('crear_merma'/);
});

test("Finance and approval Baja forms require fresh catalogs before use", () => {
  assert.match(finance, /window\.bcRefrescarCatalogosOperativos\(true\)/);
  assert.match(finance, /catalogReady\s*\?\s*\{products:/);
  assert.match(finance, /rpc\('crear_baja'/);
  assert.match(approvals, /window\.bcRefrescarCatalogosOperativos\(true\)/);
  assert.match(approvals, /catalogsFresh/);
  assert.match(approvals, /No se pudo confirmar la actualización de los catálogos/);
});

test("A forced stock refresh bypasses withCache and updates the shared stock cache", () => {
  assert.match(warehouses, /var stockRequest = force/);
  assert.match(warehouses, /client\.from\("stock"\)\.select\("producto_id, almacen_id, cantidad, minimo"\)/);
  assert.match(warehouses, /_cache\.stock = Array\.isArray\(stock\)/);
  assert.match(warehouses, /await cargarStockAlmacenes\(true\)/);
  assert.match(warehouses, /_cache\.stock = \[\]/);
  assert.match(warehouses, /_stockCargaEstado !== "ok"/);
  assert.match(warehouses, /window\.__BC_STOCK_CONFIRMED__ = true/);
  assert.match(warehouses, /if \(!force\) return _stockCargaPromise/);
  assert.match(warehouses, /pendingRead\.catch/);
  assert.match(warehouses, /return cargarStockAlmacenes\(true\)/);
});

test("A committed purchase refresh error is reported as a refresh issue, not as a failed purchase", () => {
  assert.match(purchase, /registrar_compra_multiple/);
  assert.equal((purchase.match(/if \(window\.__BC_STOCK_CONFIRMED__ === false\)/g) || []).length, 2);
  assert.match(purchase, /No se pudo confirmar la lectura inmediata del inventario/);
  assert.match(purchase, /await refrescarStockYSelects\(\)/);
  assert.match(purchase, /bcNotificarCambioDatos\('compra', false\)/);
});

test("Transfer stock is refreshed after inventory changes and no longer uses the stale post-purchase cache", () => {
  assert.match(transfer, /window\.refrescarStockYSelects\(\)/);
  assert.match(transfer, /No se pudo sincronizar inventario en Transferencias/);
  assert.match(transfer, /detail\.operation === 'compra'/);
  assert.match(transfer, /window\.__BC_STOCK_CONFIRMED__ === false/);
  assert.match(transfer, /<option value="" disabled selected hidden>Origen<\/option>/);
  assert.match(transfer, /<option value="" disabled selected hidden>Destino<\/option>/);
  assert.match(transfer, /<option value="" disabled selected hidden>Producto<\/option>/);
});

test("Field labels are hidden, disabled placeholders rather than selectable dropdown entries", () => {
  for (const text of [
    "Seleccionar almacén",
    "Producto",
    "Unidad base",
    "Seleccionar…",
    "Motivo de la baja"
  ]) {
    assert.ok(
      purchase.includes('disabled selected hidden>' + text) ||
      finance.includes('disabled selected hidden>' + text) ||
      approvals.includes('disabled selected hidden>' + text),
      "expected hidden disabled placeholder: " + text
    );
  }
  assert.match(index, /<option value="" disabled selected hidden>Selecciona una categoría<\/option>/);
});
