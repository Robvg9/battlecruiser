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
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /flex-wrap:wrap/);
  assert.match(css, /#tab-transferencias/);
  assert.match(css, /#tab-compras/);
});

test("Paso 4: abrir Nueva Transferencia muestra el formulario dentro del modal y permite cerrarlo", (t) => {
  const { window } = setup(t);
  window.document.querySelector('[data-bc165="transferencias"]').click();
  const modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal, "el modal debe usar el ID que consumen los controles de reparación");
  assert.ok(modal.querySelector("#tab-transferencias"));
  assert.ok(modal.querySelector("#trf-origen"));
  assert.equal(modal.querySelector("#tab-transferencias").style.getPropertyValue("display"), "block");
  assert.equal(modal.querySelector("#tab-transferencias").style.getPropertyPriority("display"), "important");
  assert.equal(modal.querySelector("#tab-transferencias").classList.contains("visible"), true);
  modal.querySelector(".bc165-close").click();
  assert.equal(window.document.getElementById("bc165-overlay"), null);
  assert.equal(window.document.getElementById("tab-transferencias").parentElement.id, "panel-root");
  assert.equal(window.document.getElementById("tab-transferencias").style.getPropertyValue("display"), "none");
  assert.equal(window.document.getElementById("tab-transferencias").style.getPropertyPriority("display"), "important");
});

test("Paso 4: abrir Nueva Compra dispara la carga de catálogo e historial", async (t) => {
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

test("Paso 4: el cargador de la PWA incluye el módulo de operaciones flotantes antes del reparador de compra", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const modalModule = app.indexOf('"hotfix-16-5-movimientos-operaciones-flotantes-20260902.js"');
  const purchaseRepair = app.indexOf('"hotfix-17-5-compra-modal-controls-20260903.js"');
  assert.notEqual(modalModule, -1, "app.js debe cargar el módulo que genera los dos botones");
  assert.notEqual(purchaseRepair, -1, "app.js debe cargar el reparador de controles de compra");
  assert.ok(modalModule < purchaseRepair, "el módulo del modal debe cargarse antes de su reparador");
});


test("Paso 4 regresión: reintentos de inicialización no vacían un modal de transferencia abierto", (t) => {
  const { window } = setup(t);
  const trigger = window.document.querySelector('[data-bc165="transferencias"]');
  trigger.click();
  let modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal.querySelector("#trf-origen"), "el formulario de transferencia debe estar en el modal antes del reintento");

  const delays = window.__BC165_runPendingTimers();
  assert.ok(delays.includes(300), "la prueba debe reproducir el segundo intento de inicialización");
  modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal, "el modal debe permanecer abierto");
  assert.ok(modal.querySelector("#trf-origen"), "la inicialización repetida no debe ocultar ni sacar el formulario");
  assert.equal(modal.querySelector("#tab-transferencias").classList.contains("bc165-placeholder"), false,
    "un panel dentro del modal activo nunca debe volver al estado placeholder");

  modal.querySelector(".bc165-close").click();
  assert.equal(window.document.getElementById("tab-transferencias").parentElement.id, "panel-root",
    "el panel debe volver a su padre original al cerrar");
});

test("Paso 4 regresión: reintentos de inicialización no vacían un modal de compra abierto", (t) => {
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


test("Paso 4: Transferencia recupera almacenes y productos al abrirse si los selectores están vacíos", async (t) => {
  const { window } = setup(t);
  ["trf-origen", "trf-destino", "trf-producto"].forEach((id) => {
    window.document.getElementById(id).innerHTML = '<option value="">Selecciona…</option>';
  });
  let warehouseLoads = 0;
  let productLoads = 0;
  window.refrescarAlmacenes = async () => {
    warehouseLoads += 1;
    ["trf-origen", "trf-destino"].forEach((id) => {
      window.document.getElementById(id).innerHTML = '<option value="">Selecciona…</option><option value="a">La Cueva</option><option value="b">Tu mejor opción</option>';
    });
  };
  window.refrescarStockYSelects = async () => {
    productLoads += 1;
    window.document.getElementById("trf-producto").innerHTML = '<option value="">Selecciona…</option><option value="p1">Producto 1</option>';
  };
  window.document.querySelector('[data-bc165="transferencias"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(warehouseLoads, 1);
  assert.equal(productLoads, 1);
  assert.equal(window.document.querySelectorAll("#trf-origen option[value='a']").length, 1);
  assert.equal(window.document.querySelectorAll("#trf-destino option[value='b']").length, 1);
  assert.equal(window.document.querySelectorAll("#trf-producto option[value='p1']").length, 1);
  const feedback = window.document.querySelector(".bc165-feedback");
  assert.ok(!feedback || feedback.hidden || !feedback.textContent, "successful loading leaves no error text");
});

test("Paso 4: una transferencia sin catálogo visible informa del problema en vez de mostrar un modal vacío", async (t) => {
  const { window } = setup(t);
  ["trf-origen", "trf-destino", "trf-producto"].forEach((id) => {
    window.document.getElementById(id).innerHTML = '<option value="">Selecciona…</option>';
  });
  window.document.querySelector('[data-bc165="transferencias"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal.querySelector("#form-transferencia"), "the form itself remains visible");
  assert.match(modal.querySelector(".bc165-feedback").textContent, /No se pudieron cargar almacenes y productos/);
});

test("Paso 4: M49 preserves the daily jornada layout and removes legacy split wrappers", () => {
  const layout = fs.readFileSync(path.join(__dirname, "..", "public", "js", "m49-turnos-layout-definitivo.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(layout, /restoreBody/);
  assert.match(layout, /m33-session-grid/);
  assert.doesNotMatch(layout, /Mañana|Tarde|grid-template-columns/);
  assert.match(app, /\["m49-turnos-layout-definitivo\.js","49\.6"\]/);
});
