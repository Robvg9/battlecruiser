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
      '<button class="tab-btn" data-tab="compras"></button>' +
      '<button class="tab-btn" data-tab="movimientos"></button>' +
      '<button type="button" id="btn-productos-ir-compras-movimientos">Ir a Movimientos · Nueva compra</button>' +
      '<section id="tab-movimientos" class="tab-panel visible"><div class="bc-m51-hero"><div><h2>Movimientos</h2></div></div></section>' +
      '<div id="panel-root">' +
        '<section id="tab-transferencias" class="tab-panel"><form id="transfer-form"><input id="transfer-test" aria-label="Transferencia input"></form></section>' +
        '<section id="tab-compras" class="tab-panel"><form id="purchase-form"><input id="compra-test" aria-label="Compra input"></form></section>' +
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
  assert.ok(modal.querySelector("#transfer-test"));
  assert.equal(modal.querySelector("#tab-transferencias").classList.contains("visible"), true);
  modal.querySelector(".bc165-close").click();
  assert.equal(window.document.getElementById("bc165-overlay"), null);
  assert.equal(window.document.getElementById("tab-transferencias").parentElement.id, "panel-root");
});

test("Paso 4: abrir Nueva Compra muestra el formulario dentro del mismo modal identificable", (t) => {
  const { window } = setup(t);
  window.document.querySelector('[data-bc165="compras"]').click();
  const modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal);
  assert.ok(modal.querySelector("#tab-compras"));
  assert.ok(modal.querySelector("#compra-test"));
  const css = window.document.getElementById("bc165-css").textContent;
  assert.match(css, /\.bc165-overlay #tab-compras/);
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
  assert.ok(modal.querySelector("#transfer-test"), "el formulario de transferencia debe estar en el modal antes del reintento");

  const delays = window.__BC165_runPendingTimers();
  assert.ok(delays.includes(300), "la prueba debe reproducir el segundo intento de inicialización");
  modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal, "el modal debe permanecer abierto");
  assert.ok(modal.querySelector("#transfer-test"), "la inicialización repetida no debe ocultar ni sacar el formulario");
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
  assert.ok(modal.querySelector("#compra-test"), "el formulario de compra debe estar en el modal antes del reintento");

  window.__BC165_runPendingTimers();
  modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal, "el modal debe permanecer abierto");
  assert.ok(modal.querySelector("#compra-test"), "la inicialización repetida no debe ocultar ni sacar el formulario");
  assert.equal(modal.querySelector("#tab-compras").classList.contains("bc165-placeholder"), false,
    "el panel de compra activo nunca debe volver al estado placeholder");

  modal.querySelector(".bc165-close").click();
  assert.equal(window.document.getElementById("tab-compras").parentElement.id, "panel-root",
    "el panel debe volver a su padre original al cerrar");
});


test("Paso 4: la ruta heredada de Productos redirige al único formulario de compra en Movimientos", (t) => {
  const { window } = setup(t);
  const moveButton = window.document.querySelector('.tab-btn[data-tab="movimientos"]');
  let moveClicks = 0;
  moveButton.addEventListener("click", () => { moveClicks++; });

  window.document.getElementById("btn-productos-ir-compras-movimientos").click();
  assert.equal(moveClicks, 1, "la ruta de Productos debe navegar a Movimientos");
  window.__BC165_runPendingTimers();

  const modal = window.document.getElementById("bc165-overlay");
  assert.ok(modal, "la navegación canónica debe abrir el modal de compra");
  assert.ok(modal.querySelector("#tab-compras"), "el formulario único de compra debe estar dentro del modal");
  assert.ok(modal.querySelector("#compra-test"), "el formulario único debe permitir introducir campos");
});
