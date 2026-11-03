"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const JS_DIR = path.join(__dirname, "..", "public", "js");
const MISSION_C_SOURCE = fs.readFileSync(path.join(JS_DIR, "mision-c-editar-tipo-almacen-modal.js"), "utf8");
const M277_SOURCE = fs.readFileSync(path.join(JS_DIR, "m27-7-almacenes-modal.js"), "utf8");

function waitFor(predicate, timeoutMs = 1200) {
  const started = Date.now();
  return new Promise((resolve) => {
    function tick() {
      if (predicate()) return resolve(true);
      if (Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(tick, 10);
    }
    tick();
  });
}

function createContext(t) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
    '<section id="tab-almacenes">' +
      '<div id="alm-acciones-menu" class="hidden"></div>' +
      '<form id="form-almacen" class="hidden">' +
        '<input id="alm-editando-id"><input id="alm-nombre">' +
        '<select id="alm-tipo"><option value="">Tipo de almacén</option></select>' +
      "</form>" +
      '<select id="alm-selector"><option value="">Elegí un almacén</option></select>' +
      '<button id="alm-crear-btn" type="button">Crear almacén</button>' +
      '<button id="alm-editar-btn" type="button">Editar almacén</button>' +
      '<button id="alm-toggle-btn" type="button">Activar / desactivar</button>' +
      '<div id="msg-almacenes"></div></section></body></html>',
    { url: "https://battlecruiser-warehouse-modal.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { configurable: true, value: "complete" });
  window.eval("var _cache = { almacenes: [] }; var _usuarioActualId = 'owner-fixture';");
  const calls = [];
  const refreshed = [];
  const selected = [];
  window.setMsg = (id, message) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = message;
  };
  window.ejecutarOperacion = async (type, payload) => {
    calls.push({ type, payload });
    return { ok: true, offline: false, data: "warehouse-fixture-" + calls.length };
  };
  window.refrescarAlmacenes = async () => { refreshed.push(true); return []; };
  window.cargarStockAlmacenes = async () => [];
  window.seleccionarAlmacen = (id) => selected.push(id);

  // Misión C monta primero el modal de edición. M27.7 se monta después,
  // reproduciendo el orden real de carga configurado en public/app.js.
  window.eval(MISSION_C_SOURCE);
  window.eval(M277_SOURCE);
  t.after(() => window.close());
  return { window, calls, refreshed, selected };
}

test("M27.7: crear almacén ejecuta el RPC con nombre y todos los tipos válidos", async (t) => {
  const { window, calls, selected } = createContext(t);
  const root = window.document.getElementById("bc-alm-modal");
  assert.ok(root, "el modal de creación debe existir");
  const cases = [
    { type: "almacenamiento", rpcType: "almacenamiento" },
    { type: "minorista", rpcType: "venta" },
    { type: "mayorista", rpcType: "mayorista" }
  ];

  for (const [index, item] of cases.entries()) {
    window.__BC_M277_openCreateAlmacen();
    const name = root.querySelector("#bc-m277-modal-nombre");
    const save = root.querySelector("#bc-m277-modal-guardar");
    const status = root.querySelector("#bc-m277-modal-status");
    assert.ok(name && save && status, "el formulario debe resolver sus propios campos y mensajes, sin IDs de Misión C");
    assert.equal(window.document.getElementById("bc-m277-modal-nombre"), name,
      "el selector global debe resolver el input de creación y no el párrafo del modal de edición");
    name.value = "Bodega fixture " + (index + 1);
    root.querySelector('.bc-alm-tipo[data-tipo="' + item.type + '"]').click();
    save.click();

    assert.equal(await waitFor(() => calls.length === index + 1), true,
      "Guardar debe invocar ejecutarOperacion para " + item.type);
    assert.deepEqual(calls[index], {
      type: "almacen",
      payload: { p_nombre: "Bodega fixture " + (index + 1), p_tipo: item.rpcType }
    });
    assert.equal(await waitFor(() => selected.length === index + 1), true,
      "el almacén creado debe seleccionarse tras refrescar el catálogo");
    assert.equal(selected[index], "warehouse-fixture-" + (index + 1));
  }
});

test("M27.7: el error de validación se muestra dentro del modal visible", (t) => {
  const { window } = createContext(t);
  window.__BC_M277_openCreateAlmacen();
  const root = window.document.getElementById("bc-alm-modal");
  root.querySelector("#bc-m277-modal-guardar").click();
  assert.match(root.querySelector("#bc-m277-modal-status").textContent, /Completá el nombre/i);
  assert.equal(window.document.getElementById("bc-alm-modal-status").textContent, "",
    "el estado de Misión C no debe recibir mensajes pertenecientes al modal de creación");
});
