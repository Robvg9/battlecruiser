"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const index = fs.readFileSync("public/index.html", "utf8");
const archiveSource = fs.readFileSync("public/js/m74-pos-archive-retail.js", "utf8");
const navVisibilitySource = fs.readFileSync("public/js/hotfix-secciones-visibles-20260903.js", "utf8");

function createApp(warehouses, turno, refreshTurno) {
  const dom = new JSDOM(index, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const window = dom.window;
  const navigations = [];
  window._cache = { almacenes: warehouses };
  window._turnoActual = turno;
  if (typeof refreshTurno === "function") window.refrescarTurnoActual = refreshTurno;
  window.irATab = function (tab) { navigations.push(tab); return tab; };
  const salesButton = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
  salesButton.addEventListener("click", function () { window.irATab("ventas"); });
  window.eval(archiveSource);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  window.__BC_M74_SYNC_POS_ARCHIVE__();
  return { dom, window, navigations };
}
function tick(window, ms) { return new Promise(resolve => window.setTimeout(resolve, ms || 10)); }

test("Ventas remains navigable without a session and never hides or reflows its panel", async () => {
  const warehouses = [
    { id: "cueva", nombre: "La Cueva", tipo: "minorista", activo: true },
    { id: "tmo", nombre: "TuMejor Opción", tipo: "mayorista", activo: true }
  ];
  const { dom, window, navigations } = createApp(warehouses, null);
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    const panel = window.document.getElementById("tab-ventas");
    assert.equal(window.__BC_POS_ARCHIVED__, true, "the compatibility flag identifies the missing session");
    assert.equal(window.__BC_POS_NEEDS_SESSION__, true);
    assert.equal(button.disabled, false, "missing session must not disable navigation");
    assert.equal(button.getAttribute("aria-disabled"), "false");
    assert.equal(button.getAttribute("data-bc-pos-availability"), "session-required");
    assert.equal(button.style.display, "", "M74 must preserve the sidebar layout slot");
    assert.ok(window.document.getElementById("bc-m74-pos-archive-css").textContent.includes("opacity:1!important;cursor:pointer!important;"));
    assert.doesNotMatch(window.document.getElementById("bc-m74-pos-archive-css").textContent, /#tab-ventas.*display:none/i);
    assert.ok(!panel.classList.contains("bc-pos-archived-panel"), "the panel stays navigable while showing the no-session guard");
    assert.ok(panel.querySelector("#form-venta-linea"), "the sale form is preserved");
    assert.ok(panel.querySelector("#lista-ventas"), "the sales history is preserved");

    window.irATab("ventas");
    button.click();
    await tick(window);
    assert.deepEqual(navigations, ["ventas", "ventas"], "direct routing and a real click remain navigable");
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-disabled"), "false");
  } finally { dom.window.close(); }
});

test("an open La Cueva retail session enables the POS just like a wholesale session", async () => {
  const warehouses = [
    { id: "cueva", nombre: "La Cueva", tipo: "minorista", activo: true },
    { id: "tmo", nombre: "TuMejor Opción", tipo: "mayorista", activo: true }
  ];
  for (const warehouseId of ["cueva", "tmo"]) {
    const app = createApp(warehouses, { estado: "ABIERTO", almacen_id: warehouseId });
    try {
      const button = app.window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
      assert.equal(app.window.__BC_POS_ARCHIVED__, false, "both sellable warehouse types are valid");
      assert.equal(app.window.__BC_POS_NEEDS_SESSION__, false);
      assert.equal(button.disabled, false);
      assert.equal(button.getAttribute("aria-disabled"), "false");
      assert.equal(button.getAttribute("data-bc-pos-availability"), "active-session");
      app.window.irATab("ventas");
      assert.deepEqual(app.navigations, ["ventas"]);
    } finally { app.dom.window.close(); }
  }
});

test("M74 updates the session hint after an asynchronous turn refresh without blocking navigation", async () => {
  const warehouses = [
    { id: "cueva", tipo: "minorista", activo: true },
    { id: "tmo", tipo: "mayorista", activo: true }
  ];
  const { dom, window, navigations } = createApp(warehouses, null, async function () {
    await tick(window, 10);
    window._turnoActual = { estado: "ABIERTO", almacen_id: "tmo" };
    return window._turnoActual;
  });
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    assert.equal(window.__BC_POS_NEEDS_SESSION__, true);
    await window.refrescarTurnoActual();
    await tick(window, 260);
    assert.equal(window.__BC_POS_NEEDS_SESSION__, false);
    assert.equal(button.getAttribute("data-bc-pos-availability"), "active-session");
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-disabled"), "false");
    window.irATab("ventas");
    assert.deepEqual(navigations, ["ventas"]);
  } finally { dom.window.close(); }
});

test("los cambios de sesión no expulsan a la persona de Ventas ni la redirigen a Jornada", async () => {
  const warehouses = [
    { id: "cueva", tipo: "minorista", activo: true },
    { id: "tmo", tipo: "mayorista", activo: true }
  ];
  const { dom, window, navigations } = createApp(
    warehouses,
    { estado: "ABIERTO", almacen_id: "tmo" }
  );
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    const panel = window.document.getElementById("tab-ventas");
    panel.classList.add("visible");
    window._turnoActual = { estado: "ABIERTO", almacen_id: "cueva" };
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    await tick(window, 260);
    assert.equal(window.__BC_POS_NEEDS_SESSION__, false, "retail is a valid open session");
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-disabled"), "false");

    window._turnoActual = { estado: "CERRADO", almacen_id: "tmo" };
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    await tick(window, 260);
    assert.equal(window.__BC_POS_NEEDS_SESSION__, true);
    assert.equal(button.disabled, false, "expired session affects sales controls, not route navigation");
    assert.equal(button.getAttribute("aria-disabled"), "false");
    assert.equal(panel.classList.contains("visible"), true, "M74 must not eject the user from the panel");
    assert.equal(panel.classList.contains("bc-pos-archived-panel"), false);
    window.irATab("ventas");
    assert.deepEqual(navigations, ["ventas"]);
    assert.equal(navigations.includes("jornada"), false);
  } finally { dom.window.close(); }
});

test("Ventas keeps a fixed sidebar slot when the global visibility normalizer runs", async () => {
  const warehouses = [
    { id: "cueva", tipo: "minorista", activo: true },
    { id: "tmo", tipo: "mayorista", activo: true }
  ];
  const { dom, window } = createApp(warehouses, null);
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    window.eval(navVisibilitySource);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
    await tick(window, 60);
    assert.equal(button.style.getPropertyValue("display"), "", "the normalizer must not write competing display values");
    assert.equal(button.classList.contains("hidden"), false);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-disabled"), "false");

    window._turnoActual = { estado: "ABIERTO", almacen_id: "tmo" };
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    await tick(window, 260);
    assert.equal(button.style.getPropertyValue("display"), "");
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-disabled"), "false");

    window._turnoActual = null;
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    await tick(window, 260);
    assert.equal(button.style.getPropertyValue("display"), "");
    assert.equal(button.classList.contains("hidden"), false);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-disabled"), "false");
  } finally { dom.window.close(); }
});

test("la navegación lateral no contiene un literal backslash-n entre Movimientos y Jornada", () => {
  const start = index.indexOf('data-tab="movimientos"');
  const end = index.indexOf('data-tab="ciclos"');
  assert.ok(start >= 0 && end > start, "the operational menu entries must exist");
  const navBlock = index.slice(start, end).replace(/\r\n/g, "\n");
  assert.equal(navBlock.includes("\\n"), false, "literal backslash-n must not appear in the menu");
  const expected = 'data-tab="movimientos">Movimientos</button>\n        <button class="tab-btn" data-tab="turnos">Turnos</button>\n        <button class="tab-btn" data-tab="jornada">Jornada e inventario</button>';
  assert.ok(navBlock.includes(expected), "the menu entries must be separate buttons with normal spacing");
});
