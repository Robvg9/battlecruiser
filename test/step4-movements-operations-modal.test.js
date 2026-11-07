"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "hotfix-16-5-movimientos-operaciones-flotantes-20260902.js"),
  "utf8"
);
const MULTIPLE_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "movimiento-multiple.js"),
  "utf8"
);

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<button class="tab-btn" data-tab="transferencias"></button>' +
      '<section id="tab-movimientos" class="tab-panel visible"><div class="bc-m51-hero"><div><h2>Movimientos</h2></div></div></section>' +
      '<div id="panel-root">' +
        '<section id="tab-transferencias" class="tab-panel" style="display:none!important;visibility:hidden!important;opacity:0!important"><form id="form-transferencia"><label for="trf-origen">Origen</label><select id="trf-origen"><option value="">Origen</option><option value="a">La Cueva</option></select><label for="trf-destino">Destino</label><select id="trf-destino"><option value="">Destino</option><option value="b">Tu mejor opción</option></select><label for="trf-producto">Producto</label><select id="trf-producto"><option value="">Producto</option><option value="p1">Producto 1</option></select><input id="trf-cantidad" type="number"><button type="submit">Transferir</button></form></section>' +
        '<section id="tab-compras" class="tab-panel" style="display:none!important;visibility:hidden!important;opacity:0!important"><form id="purchase-form"><label for="compra-multiple-producto">Producto</label><select id="compra-multiple-producto"><option value="">Producto</option><option value="p1">Producto 1</option></select><button id="compra-multiple-confirmar" type="button">Registrar compra</button></form></section>' +
      "</div></body></html>",
    { runScripts: "outside-only", url: "https://battlecruiser.test/" }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { configurable: true, value: "complete" });
  const pendingTimers = [];
  window.setTimeout = (callback, delay) => {
    if (delay === 0) callback();
    else pendingTimers.push({ callback, delay });
    return pendingTimers.length;
  };
  window.__BC165_runPendingTimers = () => {
    const timers = pendingTimers.splice(0);
    timers.forEach((timer) => timer.callback());
    return timers.map((timer) => timer.delay);
  };
  window.clearTimeout = () => {};
  window._cache = {
    productos: [
      { id: "p1", nombre: "Producto 1", activo: true },
      { id: "p2", nombre: "Producto 2", activo: true }
    ],
    almacenes: [{ id: "a", nombre: "La Cueva" }, { id: "b", nombre: "Tu mejor opción" }],
    stock: [
      { producto_id: "p1", almacen_id: "a", cantidad: 40 },
      { producto_id: "p2", almacen_id: "a", cantidad: 25 }
    ]
  };
  window.productosOperativos = (rows) => rows;
  window.stockDisponibleOrigen = (productId, warehouseId) => {
    const row = window._cache.stock.find((item) => String(item.producto_id) === String(productId) && String(item.almacen_id) === String(warehouseId));
    return row ? { cantidad: row.cantidad, aproximado: false } : { cantidad: 0, aproximado: false };
  };
  window.tienePermiso = () => true;
  window.confirm = () => true;
  window.__transferCalls = [];
  window.ejecutarOperacion = async (type, payload) => {
    window.__transferCalls.push({ type, payload });
    return { ok: true, offline: false, data: "transfer-test-id" };
  };
  window.refrescarTransferencias = async () => {};
  window.refrescarStockYSelects = async () => {};
  window.refrescarAlmacenes = async () => {};
  window.eval(MULTIPLE_SOURCE);
  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, dom };
}

test("Paso 4: los botones Nueva Transferencia y Nueva Compra se montan en Movimientos", (t) => {
  const { window } = setup(t);
  assert.equal(window.__BC165_verify().newTransfer, true);
  assert.equal(window.__BC165_verify().newPurchase, true);
  assert.equal(window.__BC165_verify().purchaseTabHidden, true, "Compras debe abrirse desde Movimientos y no como pestaña independiente");
  assert.equal(window.document.querySelector('.tab-btn[data-tab="compras"]'), null);
  const css = window.document.getElementById("bc165-css").textContent;
  assert.match(css, /\.bc165-actions\{display:flex/);
  assert.match(css, /flex:0 0 auto/);
  assert.doesNotMatch(css, /\.bc165-actions\{[^}]*flex:1 0 100%/);
  assert.match(css, /#tab-transferencias/);
  assert.match(css, /#tab-compras/);
});

test("Transferencias: el modal usa el panel múltiple real y conserva oculto el formulario heredado", (t) => {
  const { window } = setup(t);
  const originalPanel = window.document.getElementById("tab-transferencias");
  const originalForm = window.document.getElementById("form-transferencia");
  let legacySubmitCalls = 0;
  originalForm.addEventListener("submit", (event) => { event.preventDefault(); legacySubmitCalls += 1; });

  window.document.querySelector('[data-bc165="transferencias"]').click();
  const modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal, "el modal debe abrirse");
  const panel = modal.querySelector("#movimiento-multiple-panel");
  assert.ok(panel, "el modal debe contener el panel de transferencia múltiple");
  assert.ok(panel.querySelector("#mov-multiple-origen"));
  assert.ok(panel.querySelector("#mov-multiple-destino"));
  assert.ok(panel.querySelector("#mov-multiple-producto"));
  assert.ok(panel.querySelector("#mov-multiple-cantidad"));
  assert.ok(panel.querySelector("#mov-multiple-lineas"));
  assert.match(panel.textContent, /Se registra una sola transferencia/);
  assert.equal(modal.querySelector("#form-transferencia"), null, "el flujo individual no debe mostrarse en el modal");
  assert.equal(originalPanel.querySelector("#form-transferencia"), originalForm);
  assert.equal(originalForm.style.display, "none", "el formulario heredado permanece oculto");
  assert.equal(originalPanel.parentElement.id, "panel-root");

  originalForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(legacySubmitCalls, 1, "el nodo heredado conserva sus listeners");
  modal.querySelector(".bc165-close").click();
  assert.equal(window.document.getElementById("bc165-overlay"), null);
  assert.equal(originalPanel.querySelector("#movimiento-multiple-panel"), panel, "el panel múltiple vuelve al panel original");
  assert.equal(originalPanel.querySelector("#form-transferencia"), originalForm);
  assert.equal(originalPanel.parentElement.id, "panel-root");
});test("Paso 4: abrir Nueva Compra dispara la carga de catálogo e historial", async (t) => {
  const { window } = setup(t);
  let calls = 0;
  window.__BC_COMPRAS_ACTIVAR = async () => { calls += 1; };
  window.document.querySelector('[data-bc165="compras"]').click();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1, "el modal debe activar la carga al abrirse");
});

test("Paso 4: abrir Nueva Compra muestra el formulario dentro del mismo modal identificable", (t) => {
  const { window } = setup(t);
  window.document.querySelector('[data-bc165="compras"]').click();
  const modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal);
  assert.ok(modal.querySelector("#tab-compras"));
  assert.ok(modal.querySelector("#compra-multiple-confirmar"));
  assert.equal(modal.querySelector("#tab-compras").style.getPropertyValue("display"), "block");
  assert.equal(modal.querySelector("#tab-compras").style.getPropertyPriority("display"), "important");
  const css = window.document.getElementById("bc165-css").textContent;
  assert.match(css, /\.bc165-overlay #tab-compras/);
  modal.querySelector(".bc165-close").click();
  assert.equal(window.document.getElementById("tab-compras").parentElement.id, "panel-root");
  assert.equal(window.document.getElementById("tab-compras").style.getPropertyValue("display"), "none");
});

test("Transferencias: el cargador incluye el módulo múltiple antes del modal y el Service Worker lo precarga", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "..", "public", "service-worker.js"), "utf8");
  const multiple = app.indexOf('"movimiento-multiple.js"');
  const modal = app.indexOf('"hotfix-16-5-movimientos-operaciones-flotantes-20260902.js"');
  const purchaseRepair = app.indexOf('"hotfix-17-5-compra-modal-controls-20260903.js"');
  assert.notEqual(multiple, -1, "app.js debe cargar el módulo de transferencias múltiples");
  assert.ok(multiple < modal, "el panel múltiple debe existir antes de inicializar el modal");
  assert.ok(modal < purchaseRepair, "el módulo del modal debe cargarse antes de su reparador");
  assert.match(sw, /movimiento-multiple\.js\?v=20261106\.1/);
});test("Transferencias: añadir varios productos registra una sola operación con todas las líneas", async (t) => {
  const { window } = setup(t);
  window.document.querySelector('[data-bc165="transferencias"]').click();
  const modal = window.document.getElementById("bc165-overlay");
  const panel = modal.querySelector("#movimiento-multiple-panel");
  panel.querySelector("#mov-multiple-origen").value = "a";
  panel.querySelector("#mov-multiple-destino").value = "b";
  panel.querySelector("#mov-multiple-producto").value = "p1";
  panel.querySelector("#mov-multiple-cantidad").value = "2";
  panel.querySelector("#mov-multiple-add").click();
  panel.querySelector("#mov-multiple-producto").value = "p2";
  panel.querySelector("#mov-multiple-cantidad").value = "3";
  panel.querySelector("#mov-multiple-add").click();
  assert.equal(window.__BC_MOVIMIENTO_MULTIPLE_STATE__().lineas.length, 2);
  panel.querySelector("#mov-multiple-confirmar").click();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(window.__transferCalls.length, 1, "la lista completa debe usar un solo RPC");
  assert.equal(window.__transferCalls[0].type, "transferencia");
  assert.deepEqual(
    JSON.parse(JSON.stringify(window.__transferCalls[0].payload.p_lineas.map((x) => [x.producto_id, x.cantidad]))),
    [["p1", 2], ["p2", 3]]
  );
  assert.equal(window.__transferCalls[0].payload.p_origen_id, "a");
  assert.equal(window.__transferCalls[0].payload.p_destino_id, "b");
  assert.match(panel.querySelector("#mov-multiple-msg").textContent, /una sola operación/);
});

test("Transferencias: permisos y disponibilidad de stock se validan antes de enviar", (t) => {
  const { window } = setup(t);
  window.document.querySelector('[data-bc165="transferencias"]').click();
  const panel = window.document.querySelector("#bc165-overlay #movimiento-multiple-panel");
  panel.querySelector("#mov-multiple-origen").value = "a";
  panel.querySelector("#mov-multiple-destino").value = "b";
  panel.querySelector("#mov-multiple-producto").value = "p1";
  panel.querySelector("#mov-multiple-cantidad").value = "41";
  panel.querySelector("#mov-multiple-add").click();
  assert.equal(window.__BC_MOVIMIENTO_MULTIPLE_STATE__().lineas.length, 0, "no debe aceptar más unidades que el stock");
  assert.match(panel.querySelector("#mov-multiple-msg").textContent, /Stock insuficiente/);
  panel.querySelector("#mov-multiple-cantidad").value = "2";
  panel.querySelector("#mov-multiple-add").click();
  window.tienePermiso = () => false;
  panel.querySelector("#mov-multiple-confirmar").click();
  assert.equal(window.__transferCalls.length, 0, "no debe ejecutar RPC sin permiso");
  assert.match(panel.querySelector("#mov-multiple-msg").textContent, /no tiene permiso/i);
});

test("Transferencias regresión: reintentos del modal no sacan ni duplican el panel múltiple", (t) => {
  const { window } = setup(t);
  const originalPanel = window.document.getElementById("tab-transferencias");
  const multiPanel = window.document.getElementById("movimiento-multiple-panel");
  const legacyForm = window.document.getElementById("form-transferencia");
  window.document.querySelector('[data-bc165="transferencias"]').click();
  let modal = window.document.getElementById("bc165-overlay");
  assert.equal(modal.querySelector("#movimiento-multiple-panel"), multiPanel);
  const delays = window.__BC165_runPendingTimers();
  assert.ok(delays.includes(300));
  modal = window.document.getElementById("bc165-overlay");
  assert.equal(modal.querySelectorAll("#movimiento-multiple-panel").length, 1);
  assert.equal(modal.querySelector("#form-transferencia"), null);
  assert.equal(originalPanel.querySelector("#form-transferencia"), legacyForm);
  modal.querySelector(".bc165-close").click();
  assert.equal(originalPanel.querySelector("#movimiento-multiple-panel"), multiPanel);
  assert.equal(originalPanel.querySelector("#form-transferencia"), legacyForm);
});test("Paso 4 regresión: reintentos de inicialización no vacían un modal de compra abierto", (t) => {
  const { window } = setup(t);
  window.document.querySelector('[data-bc165="compras"]').click();
  let modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal.querySelector("#compra-multiple-confirmar"), "el formulario de compra debe estar en el modal antes del reintento");

  window.__BC165_runPendingTimers();
  modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal, "el modal debe permanecer abierto");
  assert.ok(modal.querySelector("#compra-multiple-confirmar"), "la inicialización repetida no debe ocultar ni sacar el formulario");
  assert.equal(modal.querySelector("#tab-compras").classList.contains("bc165-placeholder"), false,
    "el panel de compra activo nunca debe volver al estado placeholder");

  modal.querySelector(".bc165-close").click();
  assert.equal(window.document.getElementById("tab-compras").parentElement.id, "panel-root",
    "el panel debe volver a su padre original al cerrar");
});


test("Transferencias: recupera catálogos y rellena el panel múltiple al abrir", async (t) => {
  const { window } = setup(t);
  window._cache.productos = [];
  window._cache.almacenes = [];
  ["mov-multiple-origen", "mov-multiple-destino", "mov-multiple-producto"].forEach((id) => {
    window.document.getElementById(id).innerHTML = '<option value="">Selecciona…</option>';
  });
  let warehouseLoads = 0, productLoads = 0;
  window.refrescarAlmacenes = async () => {
    warehouseLoads++;
    window._cache.almacenes = [{ id: "a", nombre: "La Cueva" }, { id: "b", nombre: "Tu mejor opción" }];
  };
  window.refrescarStockYSelects = async () => {
    productLoads++;
    window._cache.productos = [{ id: "p1", nombre: "Producto 1", activo: true }];
  };
  window.document.querySelector('[data-bc165="transferencias"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(warehouseLoads, 1);
  assert.equal(productLoads, 1);
  assert.equal(window.document.querySelectorAll("#mov-multiple-origen option[value='a']").length, 1);
  assert.equal(window.document.querySelectorAll("#mov-multiple-destino option[value='b']").length, 1);
  assert.equal(window.document.querySelectorAll("#mov-multiple-producto option[value='p1']").length, 1);
  const feedback = window.document.querySelector(".bc165-feedback");
  assert.ok(!feedback || feedback.hidden || !feedback.textContent);
});test("Transferencias: sin catálogos presenta el panel y explica el bloqueo sin habilitar el formulario individual", async (t) => {
  const { window } = setup(t);
  window._cache.productos = []; window._cache.almacenes = [];
  window.refrescarAlmacenes = undefined; window.refrescarStockYSelects = undefined; window.refrescarProductos = undefined;
  ["mov-multiple-origen", "mov-multiple-destino", "mov-multiple-producto"].forEach((id) => {
    window.document.getElementById(id).innerHTML = '<option value="">Selecciona…</option>';
  });
  window.document.querySelector('[data-bc165="transferencias"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal.querySelector("#movimiento-multiple-panel"));
  assert.equal(modal.querySelector("#form-transferencia"), null);
  assert.match(modal.querySelector(".bc165-feedback").textContent, /No se pudieron cargar almacenes y productos/);
});test("Paso 4: M49 preserves the daily jornada layout and removes legacy split wrappers", () => {
  const layout = fs.readFileSync(path.join(__dirname, "..", "public", "js", "m49-turnos-layout-definitivo.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(layout, /restoreBody/);
  assert.match(layout, /m33-session-grid/);
  assert.doesNotMatch(layout, /Mañana|Tarde|grid-template-columns/);
  assert.match(app, /\["m49-turnos-layout-definitivo\.js","49\.6"\]/);
});
