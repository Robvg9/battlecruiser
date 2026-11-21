"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "ui-operaciones-hub.js"),
  "utf8"
);

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<main id="app-shell" class="visible"><section id="tab-operacion" class="tab-panel"></section></main>' +
    "</body></html>",
    { runScripts: "outside-only", url: "https://battlecruiser.test/" }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { configurable: true, value: "complete" });

  const timers = [];
  window.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  window.clearTimeout = () => {};
  window.alert = () => {};
  window.tienePermiso = () => true;
  window.aplicarPermisosAInterfaz = () => true;
  window._cache = {
    productos: [{ id: "p1", nombre: "Producto de prueba", activo: true }],
    almacenes: [{ id: "a1", nombre: "Almacén de prueba", activo: true }]
  };
  window.productosOperativos = (rows) => rows;
  window.client = {
    from(table) {
      const rows = table === "productos" ? window._cache.productos : window._cache.almacenes;
      return {
        select() { return this; },
        order() { return Promise.resolve({ data: rows, error: null }); }
      };
    },
    rpc: async () => ({ data: null, error: null })
  };

  window.eval(SOURCE);

  const boot = timers.shift();
  assert.ok(boot && boot.delay === 400, "Operations boot should be scheduled once");
  boot.callback();
  while (timers.length) {
    const next = timers.shift();
    if (next.delay === 600 || next.delay === 1600) next.callback();
  }

  t.after(() => window.close());
  return window;
}

test("Operations preserves primary action nodes across permission refreshes and opens on the first click", () => {
  const window = setup(t);
  const doc = window.document;
  const grid = doc.getElementById("op-card-grid");
  assert.ok(grid, "Operations primary action grid must exist");

  const gasto = grid.querySelector('[data-op-action="gasto"]');
  assert.ok(gasto, "Gasto primary action must exist");
  const initialButtons = Array.from(grid.querySelectorAll("button"));

  window.aplicarPermisosAInterfaz();
  window.aplicarPermisosAInterfaz();
  window.aplicarPermisosAInterfaz();

  assert.equal(gasto.isConnected, true, "the original pointer target must remain connected");
  assert.equal(grid.querySelector('[data-op-action="gasto"]'), gasto,
    "permission refresh must preserve the same Gasto DOM node");
  assert.deepEqual(Array.from(grid.querySelectorAll("button")), initialButtons,
    "unchanged permissions must not replace primary action nodes");

  gasto.click();
  const modal = doc.getElementById("bc-op-modal");
  assert.ok(modal, "one primary click must synchronously open the Gasto modal");
  assert.match(modal.textContent, /Registrar gasto/);
});
