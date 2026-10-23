// Step 4/15 — read-only, in-memory regression for the M53 Inventory filters.
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m53-inventario-centro.js"),
  "utf8"
);

const FIXTURES = [
  { producto_id: "p-buc", producto: "Cerveza Bucanero", almacen_id: "lc", almacen: "La Cueva", cantidad: 10, minimo: 2, estado: "normal", valor_inventario: 500 },
  { producto_id: "p-mas", producto: "Masareal", almacen_id: "lc", almacen: "La Cueva", cantidad: 1, minimo: 5, estado: "bajo", valor_inventario: 100 },
  { producto_id: "p-gua", producto: "Malta Guajira", almacen_id: "tmo", almacen: "TuMejor Opción", cantidad: 0, minimo: 1, estado: "agotado", valor_inventario: 0 },
  { producto_id: "p-may", producto: "Cerveza Mayabe", almacen_id: "tmo", almacen: "TuMejor Opción", cantidad: 8, minimo: 2, estado: "normal", valor_inventario: 320 },
];

function waitFor(condition, timeoutMs = 1500, intervalMs = 5) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (condition()) return resolve(true);
      if (Date.now() >= deadline) return reject(new Error("Timed out waiting for inventory filter render"));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function mount() {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><section id="tab-inventario" class="tab-panel">' +
      '<div class="pendientes-header"><h3>Inventario</h3><span id="inv-conn-info"></span></div>' +
      '<div class="mando-filtros"></div><div id="inv-detalle"></div>' +
    '</section></body></html>',
    { url: "https://battlecruiser.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  const calls = [];
  Object.defineProperty(window.document, "readyState", { value: "complete", configurable: true });
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  window.tienePermiso = () => true;
  window.poblarSelectAlmacenes = (select) => {
    if (!select) return;
    const selected = select.value;
    select.innerHTML =
      '<option value="">Todos los almacenes</option>' +
      '<option value="lc">La Cueva</option>' +
      '<option value="tmo">TuMejor Opción</option>';
    select.value = selected || "";
  };
  window.client = {
    rpc: async (name, params) => {
      calls.push({ name, params: params || {} });
      if (name !== "inventario_enriquecido") {
        return { data: null, error: { message: "Unexpected RPC: " + name } };
      }
      const warehouse = params && params.p_almacen_id;
      const rows = warehouse ? FIXTURES.filter((row) => row.almacen_id === warehouse) : FIXTURES;
      return { data: rows.map((row) => ({ ...row })), error: null };
    },
  };
  window.eval(SOURCE);
  const tab = window.document.getElementById("tab-inventario");
  tab.classList.add("visible");
  return { dom, window, document: window.document, calls, tab };
}

function names(document) {
  return Array.from(document.querySelectorAll("#inv-detalle .bc-m53-card-name"))
    .map((node) => node.textContent.trim());
}

function dispatch(window, element, type) {
  element.dispatchEvent(new window.Event(type, { bubbles: true }));
}

test("M53 inventory filters: state, search, warehouse Apply and Clear use read-only RPC fixtures", async (t) => {
  const { dom, window, document, calls, tab } = mount();
  t.after(() => dom.window.close());

  assert.equal(typeof window.refrescarInventario, "function", "M53 should expose the refresh hook");
  await window.refrescarInventario();
  assert.deepEqual(names(document), [
    "Cerveza Bucanero",
    "Masareal",
    "Malta Guajira",
    "Cerveza Mayabe",
  ]);

  const state = document.getElementById("inv-filtro-estado-select");
  const search = document.getElementById("inv-buscar");
  const warehouse = document.getElementById("inv-filtro-almacen");
  const apply = document.getElementById("inv-refrescar-btn");
  const clear = document.getElementById("inv-limpiar-btn");
  assert.ok(state && search && warehouse && apply && clear, "all filter controls should be present");

  state.value = "agotado";
  dispatch(window, state, "change");
  assert.deepEqual(names(document), ["Malta Guajira"], "Agotados filters the cards by state");

  state.value = "todos";
  dispatch(window, state, "change");
  search.value = "Bucanero";
  dispatch(window, search, "input");
  assert.deepEqual(names(document), ["Cerveza Bucanero"], "search narrows the list by product name");

  warehouse.value = "lc";
  state.value = "bajo";
  search.value = "";
  const countBeforeApply = calls.length;
  apply.click();
  await waitFor(() => calls.length > countBeforeApply && names(document).join("|") === "Masareal");
  assert.equal(calls.at(-1).name, "inventario_enriquecido");
  assert.equal(calls.at(-1).params.p_almacen_id, "lc", "Apply sends the selected warehouse to the read-only RPC");
  assert.deepEqual(names(document), ["Masareal"], "warehouse and state filters compose");

  const countBeforeClear = calls.length;
  clear.click();
  await waitFor(() =>
    calls.length > countBeforeClear &&
    names(document).length === FIXTURES.length &&
    state.value === "todos" &&
    warehouse.value === "" &&
    search.value === ""
  );
  assert.deepEqual(names(document), [
    "Cerveza Bucanero",
    "Masareal",
    "Malta Guajira",
    "Cerveza Mayabe",
  ], "Clear restores the complete fixture list");
  assert.ok(calls.every((call) => call.name === "inventario_enriquecido"), "test issues only read-only inventory RPCs");
  assert.equal(window._invFilas.length, FIXTURES.length, "visible inventory cache matches the restored fixture rows");
});
