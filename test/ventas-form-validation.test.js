"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const VENTAS = fs.readFileSync(path.join(__dirname, "..", "public", "js", "ventas.js"), "utf8");

function formDom() {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
    "<form id='form-venta-linea'>" +
    "<select id='venta-almacen'><option value=''>Almacén</option><option value='alm-1'>La Cueva</option></select>" +
    "<input id='venta-producto-buscar' value=''>" +
    "<select id='venta-producto'><option value=''>Producto</option><option value='prod-1'>Cerveza fixture</option></select>" +
    "<input id='venta-cantidad' type='number' value=''>" +
    "<button type='submit'>Agregar a la venta</button></form>" +
    "<p id='venta-stock-disponible'></p><p id='msg-venta-linea'></p>" +
    "<button id='btn-confirmar-venta' disabled>Confirmar venta</button><p id='msg-venta'></p>" +
    "<div id='venta-lineas'></div><span id='venta-total'></span>" +
    "</body></html>",
    { url: "https://battlecruiser-sale-form.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  const addCalls = [];
  const saleCalls = [];
  window.safeInit = (name, callback) => {
    if (name === "form-venta-linea" || name === "confirmar-venta") callback();
  };
  window.setMsg = (id, message, ok) => {
    const node = window.document.getElementById(id);
    if (node) {
      node.textContent = message;
      node.className = ok ? "msg ok" : "msg error";
    }
  };
  window.agregarLineaVenta = (producto, cantidad, almacen) => {
    addCalls.push({ producto, cantidad, almacen });
    return true;
  };
  window.renderVentaLineas = () => {};
  window.actualizarStockDisponibleUI = () => {};
  window.fillSelect = () => {};
  window.ventaProductosLista = [];

  const formStart = VENTAS.indexOf('safeInit("form-venta-linea", () => {');
  const formEnd = VENTAS.indexOf("\n\n// R10: buscadores de movimientos", formStart);
  assert.ok(formStart >= 0 && formEnd > formStart, "must find the production sales-line form handler");
  window.eval(VENTAS.slice(formStart, formEnd));

  const confirmStart = VENTAS.indexOf('safeInit("confirmar-venta", () => {');
  const confirmEnd = VENTAS.indexOf("\n\nasync function refrescarVentas()", confirmStart);
  assert.ok(confirmStart >= 0 && confirmEnd > confirmStart, "must find the production sale confirmation handler");
  window.ejecutarOperacion = async (...args) => {
    saleCalls.push(args);
    return { ok: true, data: { id: "fixture-sale" } };
  };
  window.explicarError = () => "fixture error";
  window.money = (value) => Number(value).toFixed(2);
  window.safeInit = (name, callback) => {
    if (name === "confirmar-venta") callback();
  };
  window.eval("let ventaLineas = []; let enviandoVenta = false;\n" + VENTAS.slice(confirmStart, confirmEnd));
  window.confirm = () => { throw new Error("unexpected confirm dialog in a validation-only test"); };
  return { dom, window, addCalls, saleCalls };
}

test("Paso 4 venta: almacén vacío bloquea agregar línea antes de cualquier operación", (t) => {
  const c = formDom();
  t.after(() => c.dom.window.close());
  const d = c.window.document;
  d.getElementById("venta-producto").value = "prod-1";
  d.getElementById("venta-cantidad").value = "2";
  d.getElementById("form-venta-linea").dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.match(d.getElementById("msg-venta-linea").textContent, /Elegí un almacén/i);
  assert.equal(c.addCalls.length, 0);
  assert.equal(c.saleCalls.length, 0);
});

test("Paso 4 venta: producto vacío bloquea agregar línea", (t) => {
  const c = formDom();
  t.after(() => c.dom.window.close());
  const d = c.window.document;
  d.getElementById("venta-almacen").value = "alm-1";
  d.getElementById("venta-cantidad").value = "2";
  d.getElementById("form-venta-linea").dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.match(d.getElementById("msg-venta-linea").textContent, /Elegí un producto/i);
  assert.equal(c.addCalls.length, 0);
});

test("Paso 4 venta: cantidad vacía, cero o negativa bloquea agregar línea", (t) => {
  const c = formDom();
  t.after(() => c.dom.window.close());
  const d = c.window.document;
  d.getElementById("venta-almacen").value = "alm-1";
  d.getElementById("venta-producto").value = "prod-1";
  for (const value of ["", "0", "-1"]) {
    d.getElementById("venta-cantidad").value = value;
    d.getElementById("form-venta-linea").dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
    assert.match(d.getElementById("msg-venta-linea").textContent, /La cantidad debe ser mayor a 0/i);
  }
  assert.equal(c.addCalls.length, 0);
  assert.equal(c.saleCalls.length, 0);
});

test("Paso 4 venta: campos válidos llegan al helper de línea y se limpian sin confirmar venta", (t) => {
  const c = formDom();
  t.after(() => c.dom.window.close());
  const d = c.window.document;
  d.getElementById("venta-almacen").value = "alm-1";
  d.getElementById("venta-producto").value = "prod-1";
  d.getElementById("venta-cantidad").value = "2.5";
  d.getElementById("form-venta-linea").dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.deepEqual(c.addCalls, [{ producto: "prod-1", cantidad: 2.5, almacen: "alm-1" }]);
  assert.equal(d.getElementById("venta-cantidad").value, "");
  assert.equal(d.getElementById("venta-producto").value, "");
  assert.equal(c.saleCalls.length, 0, "adding an item is not the same as confirming a sale");
});

test("Paso 4 venta: Confirmar sin almacén o sin líneas detiene la operación antes del diálogo/RPC", (t) => {
  const c = formDom();
  t.after(() => c.dom.window.close());
  const btn = c.window.document.getElementById("btn-confirmar-venta");
  btn.disabled = false;
  btn.click();
  assert.match(c.window.document.getElementById("msg-venta").textContent, /Elegí un almacén/i);
  assert.equal(c.saleCalls.length, 0);
  c.window.document.getElementById("venta-almacen").value = "alm-1";
  btn.click();
  assert.match(c.window.document.getElementById("msg-venta").textContent, /Agregá al menos un producto/i);
  assert.equal(c.saleCalls.length, 0);
});
