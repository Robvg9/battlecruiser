"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m53-inventario-centro.js"),
  "utf8"
);

const FIXTURES = [
  { producto_id: "p-normal", producto: "Café", almacen: "Principal", estado: "normal", cantidad: 8, minimo: 2, valor_inventario: 40 },
  { producto_id: "p-bajo", producto: "Azúcar", almacen: "Principal", estado: "bajo", cantidad: 1, minimo: 4, valor_inventario: 5 },
  { producto_id: "p-agotado", producto: "Harina", almacen: "Principal", estado: "agotado", cantidad: 0, minimo: 2, valor_inventario: 0 }
];

async function boot(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<section id='tab-inventario' class='tab-panel visible'>" +
        "<div class='pendientes-header'><h3>Inventario</h3><span id='inv-conn-info'></span></div>" +
        "<p class='muted'>Vista de inventario fixture.</p>" +
        "<div class='mando-filtros'><select id='inv-filtro-estado'>" +
          "<option value='todos'>Todos</option><option value='bajo'>Bajo mínimo</option>" +
          "<option value='agotado'>Agotados</option><option value='normal'>Normales</option>" +
        "</select></div>" +
        "<div id='inv-detalle' class='lista'></div>" +
        "<div id='lista-stock-bajo'></div>" +
      "</section></body></html>",
    { url: "https://battlecruiser-inventory.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  window.tienePermiso = () => true;
  window.poblarSelectAlmacenes = (select) => {
    if (!select) return;
    select.innerHTML = "<option value=''>Todos los almacenes</option><option value='a1'>Principal</option>";
  };
  const calls = [];
  window.client = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      if (name === "inventario_enriquecido") return { data: FIXTURES.map((r) => ({ ...r })), error: null };
      return { data: [], error: null };
    }
  };
  window.escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  window.money = (value) => Number(value || 0).toFixed(2);
  window.eval(SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  const ok = await waitFor(() => typeof window.refrescarInventario === "function", 2000);
  assert.ok(ok, "M53 debe instalar refrescarInventario");
  await window.refrescarInventario();
  assert.ok(await waitFor(() => window.document.querySelectorAll("#inv-detalle [data-inv-producto]").length === 3, 2000),
    "el inventario fixture debe renderizar sus tres filas");
  t.after(() => window.close());
  return { dom, window, calls };
}

async function waitFor(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function visibleIds(window) {
  return Array.from(window.document.querySelectorAll("#inv-detalle [data-inv-producto]"))
    .map((el) => el.getAttribute("data-inv-producto"));
}

function chooseState(window, state) {
  const select = window.document.getElementById("inv-filtro-estado-select");
  assert.ok(select, "el selector de estado de M53 debe existir");
  select.value = state;
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
}

test("Paso 4 inventario: Bajo mínimo muestra solo filas estado=bajo", async (t) => {
  const { window } = await boot(t);
  chooseState(window, "bajo");
  assert.deepEqual(visibleIds(window), ["p-bajo"]);
  assert.match(window.document.getElementById("inv-detalle").textContent, /Azúcar/);
});

test("Paso 4 inventario: Agotados muestra solo filas estado=agotado", async (t) => {
  const { window } = await boot(t);
  chooseState(window, "agotado");
  assert.deepEqual(visibleIds(window), ["p-agotado"]);
  assert.match(window.document.getElementById("inv-detalle").textContent, /Harina/);
});

test("Paso 4 inventario: Normales excluye agotados y bajo mínimo", async (t) => {
  const { window } = await boot(t);
  chooseState(window, "normal");
  assert.deepEqual(visibleIds(window), ["p-normal"]);
  assert.match(window.document.getElementById("inv-detalle").textContent, /Café/);
});

test("Paso 4 inventario: Todos restaura las tres filas sin nueva petición al backend", async (t) => {
  const { window, calls } = await boot(t);
  const before = calls.filter((x) => x.name === "inventario_enriquecido").length;
  chooseState(window, "agotado");
  chooseState(window, "todos");
  assert.deepEqual(visibleIds(window), ["p-normal", "p-bajo", "p-agotado"]);
  assert.equal(calls.filter((x) => x.name === "inventario_enriquecido").length, before,
    "el cambio de filtro debe operar sobre las filas cargadas, no disparar una nueva lectura");
});

test("Paso 4 inventario: búsqueda y limpiar devuelven la vista y filtros a Todos", async (t) => {
  const { window } = await boot(t);
  const search = window.document.getElementById("inv-buscar");
  search.value = "azúcar";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(visibleIds(window), ["p-bajo"]);
  chooseState(window, "bajo");
  window.document.getElementById("inv-limpiar-btn").click();
  assert.ok(await waitFor(() => visibleIds(window).length === 3),
    "limpiar debe repoblar la lista después de refrescar inventario");
  assert.deepEqual(visibleIds(window), ["p-normal", "p-bajo", "p-agotado"]);
  assert.equal(window.document.getElementById("inv-buscar").value, "");
  assert.equal(window.document.getElementById("inv-filtro-estado-select").value, "todos");
});

test("Paso 4 inventario: resultado vacío explica filtros y ofrece limpiarlos", async (t) => {
  const { window } = await boot(t);
  const search = window.document.getElementById("inv-buscar");
  search.value = "no-existe-fixture";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(window.document.getElementById("inv-detalle").textContent, /No hay productos que coincidan con los filtros/i);
  assert.ok(window.document.getElementById("inv-empty-clear"), "debe ofrecer limpiar filtros");
});

test("D13 inventario: al perder conexión se descartan filas antiguas y al reconectar se relee el servidor", async (t) => {
  const { window } = await boot(t);
  const previousRows = visibleIds(window);
  assert.deepEqual(previousRows, ["p-normal", "p-bajo", "p-agotado"]);

  // Simulate an authenticated app client at the RPC boundary. No production
  // account, API credential, or business write is used by this regression.
  let serverRows = [{
    producto_id: "p-fresh",
    producto: "Dato fresco del servidor",
    almacen: "Principal",
    estado: "normal",
    cantidad: 13,
    minimo: 2,
    valor_inventario: 130
  }];
  const reads = [];
  window.client.rpc = async (name, params) => {
    reads.push({ name, params });
    assert.equal(name, "inventario_enriquecido");
    return { data: serverRows.map((row) => ({ ...row })), error: null };
  };

  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  await window.refrescarInventario();

  assert.deepEqual(visibleIds(window), [],
    "when offline, prior in-memory inventory rows must not remain visible");
  assert.equal(window._invFilas.length, 0,
    "the detail-modal row cache must also be cleared while offline");
  assert.match(window.document.getElementById("inv-detalle").textContent, /Sin conexión/i);
  assert.equal(reads.length, 0, "no server RPC is attempted while navigator.onLine is false");

  // Simulate a server-side change that happened while this client was offline.
  serverRows = [{
    producto_id: "p-fresh-2",
    producto: "Inventario actualizado tras reconectar",
    almacen: "TuMejor Opción",
    estado: "normal",
    cantidad: 21,
    minimo: 3,
    valor_inventario: 420
  }];
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  await window.refrescarInventario();

  assert.equal(reads.length, 1, "reconnect refresh must issue a new read-only Supabase RPC");
  assert.equal(reads[0].name, "inventario_enriquecido");
  assert.deepEqual(visibleIds(window), ["p-fresh-2"],
    "the new server result must replace prior rows instead of rendering stale data");
  assert.equal(window._invFilas.length, 1);
  assert.equal(window._invFilas[0].producto_id, "p-fresh-2");
  assert.doesNotMatch(window.document.getElementById("inv-detalle").textContent, /Café|Azúcar|Harina|Dato fresco del servidor/);
  assert.match(window.document.getElementById("inv-conn-info").textContent, /Datos de Supabase/);
  assert.equal(window.document.querySelectorAll("#inv-detalle [data-inv-producto]").length, 1);
});
