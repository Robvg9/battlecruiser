"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const index = fs.readFileSync("public/index.html", "utf8");
const archiveSource = fs.readFileSync("public/js/m74-pos-archive-retail.js", "utf8");

function createApp(warehouses, turno) {
  const dom = new JSDOM(index, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const window = dom.window;
  const navigations = [];
  window._cache = { almacenes: warehouses };
  window._turnoActual = turno;
  window.irATab = function (tab) { navigations.push(tab); return tab; };
  window.eval(archiveSource);
  // In outside-only JSDOM, dispatch startup so the navigation guard is installed before direct calls.
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  window.__BC_M74_SYNC_POS_ARCHIVE__();
  return { dom, window, navigations };
}
function tick(window) { return new Promise(resolve => window.setTimeout(resolve, 10)); }

test("La Cueva minorista se archiva aunque exista otro almacén mayorista", async () => {
  const warehouses = [
    { id: "cueva", nombre: "La Cueva", tipo: "minorista", activo: true },
    { id: "tmo", nombre: "TuMejor Opción", tipo: "mayorista", activo: true }
  ];
  const { dom, window, navigations } = createApp(warehouses, { estado: "ABIERTO", almacen_id: "cueva" });
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    const panel = window.document.getElementById("tab-ventas");
    assert.equal(window.__BC_POS_ARCHIVED__, true);
    assert.ok(button.classList.contains("bc-pos-archived"));
    assert.equal(button.getAttribute("data-bc-pos-availability"), "archived");
    assert.ok(panel.classList.contains("bc-pos-archived-panel"));
    assert.ok(panel.querySelector("#form-venta-linea"), "se conserva el formulario POS");
    assert.ok(panel.querySelector("#lista-ventas"), "se conserva el historial de ventas");
    assert.ok(index.includes('src="js/ventas.js?'), "el código histórico no se elimina");

    window.irATab("ventas");
    await tick(window);
    assert.ok(!navigations.includes("ventas"), "la navegación directa al POS debe quedar bloqueada");
    assert.ok(navigations.includes("jornada"), "la navegación bloqueada dirige a Jornada");
    button.click();
    await tick(window);
    assert.ok(!navigations.includes("ventas"), "un click programático tampoco abre el POS minorista");
  } finally { dom.window.close(); }
});

test("el POS solo se habilita durante un turno ABIERTO de almacén mayorista", () => {
  const warehouses = [
    { id: "cueva", nombre: "La Cueva", tipo: "minorista", activo: true },
    { id: "tmo", nombre: "TuMejor Opción", tipo: "mayorista", activo: true }
  ];
  const openWholesale = createApp(warehouses, { estado: "ABIERTO", almacen_id: "tmo" });
  try {
    const button = openWholesale.window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    assert.equal(openWholesale.window.__BC_POS_ARCHIVED__, false);
    assert.equal(button.classList.contains("bc-pos-archived"), false);
    assert.equal(button.getAttribute("data-bc-pos-availability"), "wholesale");
    openWholesale.window.irATab("ventas");
    assert.deepEqual(openWholesale.navigations, ["ventas"]);
  } finally { openWholesale.dom.window.close(); }

  for (const turno of [null, { estado: "CERRADO", almacen_id: "tmo" }, { estado: "ABIERTO", almacen_id: "unknown" }]) {
    const app = createApp(warehouses, turno);
    try { assert.equal(app.window.__BC_POS_ARCHIVED__, true); }
    finally { app.dom.window.close(); }
  }
});

test("la política reacciona al cambio de sesión sin borrar la sección ni el historial", async () => {
  const { dom, window, navigations } = createApp(
    [{ id: "cueva", tipo: "minorista", activo: true }, { id: "tmo", tipo: "mayorista", activo: true }],
    { estado: "ABIERTO", almacen_id: "cueva" }
  );
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    const panel = window.document.getElementById("tab-ventas");
    window._turnoActual = { estado: "ABIERTO", almacen_id: "tmo" };
    assert.equal(window.__BC_M74_SYNC_POS_ARCHIVE__(), true);
    assert.equal(button.classList.contains("bc-pos-archived"), false);
    window.irATab("ventas");
    assert.ok(navigations.includes("ventas"));

    panel.classList.add("visible");
    button.classList.add("active");
    window._turnoActual = { estado: "CERRADO", almacen_id: "tmo" };
    assert.equal(window.__BC_M74_SYNC_POS_ARCHIVE__(), false);
    assert.ok(button.classList.contains("bc-pos-archived"));
    assert.equal(button.classList.contains("active"), false);
    assert.equal(panel.classList.contains("visible"), false);
    await tick(window);
    assert.ok(navigations.includes("jornada"), "al perder sesión mayorista, vuelve a Jornada");
    assert.ok(panel.querySelector("#lista-ventas"));
  } finally { dom.window.close(); }
});
