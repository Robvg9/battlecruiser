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
  window.eval(archiveSource);
  // In outside-only JSDOM, dispatch startup so the navigation guard is installed before direct calls.
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  window.__BC_M74_SYNC_POS_ARCHIVE__();
  return { dom, window, navigations };
}
function tick(window, ms = 10) { return new Promise(resolve => window.setTimeout(resolve, ms)); }

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
    const archiveCss = window.document.getElementById("bc-m74-pos-archive-css").textContent;
    assert.ok(archiveCss.includes('#tabs .tab-btn[data-tab="ventas"].bc-pos-archived{opacity:.62!important;cursor:not-allowed!important;}'), "archived Ventas remains in its fixed sidebar slot");
    assert.doesNotMatch(archiveCss, /#tabs \\.tab-btn\\[data-tab="ventas"\\]\\.bc-pos-archived\\{display:none/, "the sidebar row must never be display:none because the next item would shift into its place");
    assert.equal(button.getAttribute("aria-disabled"), "true");
    assert.equal(button.style.display, "", "M74 must not write a display style on the sidebar row");
    assert.ok(archiveCss.includes("#tab-ventas.bc-pos-archived-panel,#tab-ventas.bc-pos-archived-panel.visible{display:none"), "the panel must stay hidden even if M68 POS layout has not initialized");
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
    assert.equal(button.getAttribute("aria-disabled"), "false");
    openWholesale.window.irATab("ventas");
    assert.deepEqual(openWholesale.navigations, ["ventas"]);
  } finally { openWholesale.dom.window.close(); }

  for (const turno of [null, { estado: "CERRADO", almacen_id: "tmo" }, { estado: "ABIERTO", almacen_id: "unknown" }]) {
    const app = createApp(warehouses, turno);
    try { assert.equal(app.window.__BC_POS_ARCHIVED__, true); }
    finally { app.dom.window.close(); }
  }
});

test("M74 espera al refresco async del turno antes de habilitar el POS mayorista", async () => {
  const warehouses = [
    { id: "cueva", tipo: "minorista", activo: true },
    { id: "tmo", tipo: "mayorista", activo: true }
  ];
  const { dom, window } = createApp(warehouses, null, async function () {
    await new Promise(resolve => window.setTimeout(resolve, 10));
    window._turnoActual = { estado: "ABIERTO", almacen_id: "tmo" };
    return window._turnoActual;
  });
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    assert.equal(window.__BC_POS_ARCHIVED__, true);
    await window.refrescarTurnoActual();
    await tick(window, 260);
    assert.equal(window.__BC_POS_ARCHIVED__, false, "visibility must be recalculated after the Promise resolves and stabilizes");
    assert.equal(button.getAttribute("data-bc-pos-availability"), "wholesale");
    assert.equal(button.getAttribute("aria-disabled"), "false");
  } finally {
    dom.window.close();
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
    await tick(window, 260);
    assert.equal(button.classList.contains("bc-pos-archived"), false);
    window.irATab("ventas");
    assert.ok(navigations.includes("ventas"));

    panel.classList.add("visible");
    button.classList.add("active");
    window._turnoActual = { estado: "CERRADO", almacen_id: "tmo" };
    assert.equal(window.__BC_M74_SYNC_POS_ARCHIVE__(), false);
    await tick(window, 260);
    assert.ok(button.classList.contains("bc-pos-archived"));
    assert.equal(button.classList.contains("active"), false);
    assert.equal(panel.classList.contains("visible"), false);
    await tick(window);
    assert.ok(navigations.includes("jornada"), "al perder sesión mayorista, vuelve a Jornada");
    assert.ok(panel.querySelector("#lista-ventas"));
  } finally { dom.window.close(); }
});

test("M74 keeps Ventas stable across transient refresh states", async () => {
  const warehouses = [
    { id: "cueva", tipo: "minorista", activo: true },
    { id: "tmo", tipo: "mayorista", activo: true }
  ];
  const { dom, window } = createApp(warehouses, { estado: "ABIERTO", almacen_id: "cueva" });
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    assert.equal(window.__BC_POS_ARCHIVED__, true);

    window._turnoActual = { estado: "ABIERTO", almacen_id: "tmo" };
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    window._turnoActual = null;
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    window._turnoActual = { estado: "ABIERTO", almacen_id: "tmo" };
    window.__BC_M74_SYNC_POS_ARCHIVE__();

    assert.equal(window.__BC_POS_ARCHIVED__, true, "rapid intermediate states must not flip the menu");
    assert.ok(button.classList.contains("bc-pos-archived"));
    await tick(window, 260);
    assert.equal(window.__BC_POS_ARCHIVED__, false, "a stable wholesale session enables POS");
    assert.equal(button.getAttribute("data-bc-pos-availability"), "wholesale");
    assert.equal(button.getAttribute("aria-disabled"), "false");

    window._cache.almacenes = [];
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    assert.equal(window.__BC_POS_ARCHIVED__, false, "a transient empty cache must not hide POS immediately");
    assert.equal(button.classList.contains("bc-pos-archived"), false);
    window._cache.almacenes = warehouses;
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    await tick(window, 260);
    assert.equal(window.__BC_POS_ARCHIVED__, false);
  } finally {
    dom.window.close();
  }
});

test("the sidebar does not render a literal backslash-n between Movimientos and Jornada", () => {
  const start = index.indexOf('data-tab="movimientos"');
  const end = index.indexOf('data-tab="ciclos"');
  assert.ok(start >= 0 && end > start, "the operational menu entries must exist");
  const navBlock = index.slice(start, end).replace(/\r\n/g, "\n");
  assert.equal(navBlock.includes("\\n"), false, "literal backslash-n must not appear in the menu");
  const expected = 'data-tab="movimientos">Movimientos</button>\n        <button class="tab-btn" data-tab="turnos">Turnos</button>\n        <button class="tab-btn" data-tab="jornada">Jornada e inventario</button>';
  assert.ok(navBlock.includes(expected), "the menu entries must be separate, normally spaced buttons");
});

test("M74 does not flip Ventas during an async session refresh", async () => {
  const warehouses = [
    { id: "cueva", tipo: "minorista", activo: true },
    { id: "tmo", tipo: "mayorista", activo: true }
  ];
  let appWindow;
  let availabilityHeldDuringRefresh = false;
  const { dom, window } = createApp(warehouses, { estado: "ABIERTO", almacen_id: "tmo" }, async function () {
    appWindow._turnoActual = null;
    appWindow.__BC_M74_SYNC_POS_ARCHIVE__();
    await tick(appWindow, 260);
    const button = appWindow.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    availabilityHeldDuringRefresh = appWindow.__BC_POS_ARCHIVED__ === false &&
      !button.classList.contains("bc-pos-archived");
    appWindow._turnoActual = { estado: "ABIERTO", almacen_id: "tmo" };
    return appWindow._turnoActual;
  });
  appWindow = window;
  try {
    await window.refrescarTurnoActual();
    assert.equal(availabilityHeldDuringRefresh, true, "intermediate data must not hide the live wholesale POS during refresh");
    assert.equal(window.__BC_POS_ARCHIVED__, false);
    assert.equal(window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]').getAttribute("data-bc-pos-availability"), "wholesale");
  } finally {
    dom.window.close();
  }
});

test("M74 blocks a click immediately after a wholesale session turns retail", async () => {
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
    assert.equal(window.__BC_POS_ARCHIVED__, false, "the open wholesale session exposes POS");

    window._turnoActual = { estado: "ABIERTO", almacen_id: "cueva" };
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    assert.equal(window.__BC_POS_ARCHIVED__, false, "the visual transition is intentionally debounced");
    button.click();
    await tick(window, 15);
    assert.equal(navigations.includes("ventas"), false, "the current non-wholesale session blocks the click immediately");

    await tick(window, 260);
    assert.equal(window.__BC_POS_ARCHIVED__, true, "the visual state follows the settled retail session");
    assert.ok(button.classList.contains("bc-pos-archived"));
  } finally {
    dom.window.close();
  }
});


test("Ventas keeps a fixed sidebar slot while M74 and the global visibility normalizer run", async () => {
  const warehouses = [
    { id: "cueva", tipo: "minorista", activo: true },
    { id: "tmo", tipo: "mayorista", activo: true }
  ];
  const { dom, window } = createApp(warehouses, { estado: "ABIERTO", almacen_id: "cueva" });
  try {
    const button = window.document.querySelector('#tabs .tab-btn[data-tab="ventas"]');
    window.eval(navVisibilitySource);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
    await tick(window, 60);

    assert.equal(button.style.getPropertyValue("display"), "", "the normalizer must not force a competing display value onto Ventas");
    assert.equal(button.classList.contains("hidden"), false);
    assert.equal(button.getAttribute("aria-disabled"), "true");

    window._turnoActual = { estado: "ABIERTO", almacen_id: "tmo" };
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    await tick(window, 260);
    assert.equal(button.style.getPropertyValue("display"), "", "enabling POS must not change the row's layout slot");
    assert.equal(button.getAttribute("aria-disabled"), "false");

    window._turnoActual = null;
    window.__BC_M74_SYNC_POS_ARCHIVE__();
    await tick(window, 260);
    assert.equal(button.style.getPropertyValue("display"), "", "disabling POS must not collapse the row or move the next entry");
    assert.equal(button.classList.contains("hidden"), false);
    assert.equal(button.getAttribute("aria-disabled"), "true");
  } finally {
    dom.window.close();
  }
});
