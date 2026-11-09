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
const transferencias = read("public/js/transferencias.js");
const network = read("public/js/network-core.js");
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
  assert.match(operationsHub, /async function openBaja\(\)/);
  assert.match(operationsHub, /window\.abrirBajasMultiple/);
  assert.doesNotMatch(operationsHub, /rpc\('crear_baja'/);
  assert.doesNotMatch(operationsHub, /rpc\('crear_merma'/);
});

test("Baja form has one authenticated batch entry point and no competing single-row forms", () => {
  const bajas = read("public/js/bajas-multiple.js");
  assert.doesNotMatch(bajas, /async function hasSession/);
   assert.doesNotMatch(bajas, /auth\.getSession\(\)/, "Bajas must not force a preflight refresh that races the rotating refresh token");
  assert.match(bajas, /api\.from\('productos'\)/);
  assert.match(bajas, /api\.from\('almacenes'\)/);
  assert.match(bajas, /api\.rpc\('crear_bajas_multiple'/);
  assert.match(operationsHub, /window\.abrirBajasMultiple/);
  assert.doesNotMatch(finance, /form-salida-producto|rpc\('crear_baja'/);
  assert.doesNotMatch(approvals, /rpc\('crear_baja'/);
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
  assert.match(warehouses, /return cargarStockAlmacenes\(true, true\)/);
  assert.match(warehouses, /_stockCargaForcedPromise/);
});

test("A committed purchase refresh error is reported as a refresh issue, not as a failed purchase", () => {
  assert.match(purchase, /registrar_compra_multiple/);
  assert.equal((purchase.match(/if \(window\.__BC_STOCK_CONFIRMED__ === false\)/g) || []).length, 1);
  assert.match(purchase, /No se pudo confirmar la lectura inmediata del inventario/);
  assert.match(purchase, /await refrescarStockYSelects\(\)/);
  assert.match(purchase, /bcNotificarCambioDatos\('compra', false\)/);
  assert.match(purchase, /async function actualizarYMostrarResultado\(\)/);
  assert.match(purchase, /await mostrarResultadoCompraRegistrada\(/);
});

test("Transfer stock uses a fresh authenticated RPC snapshot and avoids stock reads for unauthorized roles", () => {
  assert.match(transfer, /api\.rpc\('bc_stock_operativo'\)/);
  assert.match(transfer, /__BC_TRANSFER_STOCK_SNAPSHOT__/);
  assert.match(transfer, /__BC_TRANSFER_STOCK_CONFIRMED__/);
  assert.match(transfer, /tienePermiso\('transferencias','crear'\)/);
  assert.match(transfer, /Supabase tardó demasiado/);
  assert.match(transfer, /await actualizarInventarioConfirmado\(\)/);
  assert.match(transfer, /stockRefreshPromise/);
  assert.match(transfer, /window\.__BC_TRANSFER_STOCK_REFRESH__ = actualizarInventarioConfirmado/);
  assert.match(transferencias, /await refreshStock\(\)/);
  assert.match(transferencias, /__BC_TRANSFER_STOCK_CONFIRMED__ !== true/);
  assert.match(transferencias, /__BC_TRANSFER_STOCK_SNAPSHOT__/);
  assert.match(transferencias, /window\.__BC_TRANSFER_STOCK_REFRESH__/);
  assert.match(transferencias, /await refreshStock\(\)/);
  assert.match(transferencias, /No se pudo confirmar el inventario actual desde Supabase/);
  assert.match(transferencias, /__BC_TRANSFER_STOCK_CONFIRMED__ !== true/);
  assert.doesNotMatch(transfer, /refrescarStockYSelects/);
  assert.doesNotMatch(transfer, /window\.__BC_STOCK_ERROR__/);
  assert.match(transfer, /addEventListener\('offline'/);
  assert.match(transfer, /addEventListener\('online'/);
  assert.match(transfer, /<option value="" disabled selected hidden>Origen<\/option>/);
  assert.match(transfer, /<option value="" disabled selected hidden>Destino<\/option>/);
  assert.match(transfer, /<option value="" disabled selected hidden>Producto<\/option>/);
  assert.match(network, /auth\/v1\/health/);
  assert.doesNotMatch(network, /baseUrl \+ "\/rest\/v1\/"/);
});

test("Field labels are hidden, disabled placeholders rather than selectable dropdown entries", () => {
  for (const text of [
    "Seleccionar almacén",
    "Producto",
    "Unidad base",
    "Seleccionar…",
    "Seleccionar motivo"
  ]) {
    assert.ok(
      purchase.includes('disabled selected hidden>' + text) ||
      finance.includes('disabled selected hidden>' + text) ||
      approvals.includes('disabled selected hidden>' + text) ||
      read("public/js/bajas-multiple.js").includes('disabled selected hidden>' + text + '…'),
      "expected hidden disabled placeholder: " + text
    );
  }
  assert.match(index, /<option value="" disabled selected hidden>Selecciona una categoría<\/option>/);
});
