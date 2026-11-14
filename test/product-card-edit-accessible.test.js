"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "../public/js/bc-product-card-edit.js"),
  "utf8"
);
const PRODUCTS_SOURCE = fs.readFileSync(
  path.join(__dirname, "../public/js/productos.js"),
  "utf8"
);
const APP_SOURCE = fs.readFileSync(
  path.join(__dirname, "../public/app.js"),
  "utf8"
);
const SW_SOURCE = fs.readFileSync(
  path.join(__dirname, "../public/service-worker.js"),
  "utf8"
);
const INDEX_SOURCE = fs.readFileSync(
  path.join(__dirname, "../public/index.html"),
  "utf8"
);

function setup(allowed = true) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<div id="app-shell" data-bc-permisos-cargados="' + (allowed ? "1" : "0") + '">' +
        '<div id="lista-productos">' +
          '<div class="lista-item" data-ctx-tipo="producto" data-ctx-id="p-1" role="button" tabindex="0">' +
            '<span id="product-body">Producto de prueba</span>' +
            '<span class="lista-item-acciones" id="actions-area"><button id="edit-button" type="button">Editar</button></span>' +
          "</div>" +
        "</div>" +
      "</div>" +
    "</body></html>",
    { url: "https://battlecruiser-product-card.test/", runScripts: "outside-only" }
  );

  const { window } = dom;
  window.eval(
    "var _cache = { productos: [{ id: 'p-1', nombre: 'Producto de prueba' }] };" +
    "var _allowed = " + String(allowed) + ";" +
    "function tienePermiso(seccion, accion) { return _allowed && seccion === 'productos' && accion === 'editar'; }" +
    "window.__edited = [];" +
    "function iniciarEdicionProducto(producto) { window.__edited.push(producto.id); }"
  );
  window.eval(SOURCE);
  return { dom, window, document: window.document };
}

test("the real product renderer emits the exact card identity contract", () => {
  assert.match(PRODUCTS_SOURCE, /setAttribute\(["']data-ctx-tipo["'],\s*["']producto["']\)/);
  assert.match(PRODUCTS_SOURCE, /setAttribute\(["']data-ctx-id["'],\s*p\.id/);
  assert.match(PRODUCTS_SOURCE, /function renderProductosLista\s*\(/);
});

test("card body opens the existing editor when productos.editar is allowed", (t) => {
  const c = setup(true);
  t.after(() => c.dom.window.close());

  c.document.getElementById("product-body").click();

  assert.deepEqual(Array.from(c.window.__edited), ["p-1"]);
  const card = c.document.querySelector('[data-ctx-id="p-1"]');
  assert.equal(card.getAttribute("aria-label"), "Editar producto: Producto de prueba");
  assert.equal(card.getAttribute("tabindex"), "0");
  assert.equal(card.getAttribute("data-bc-card-editable"), "1");
});

test("nested action buttons and the surrounding action area never trigger card editing", (t) => {
  const c = setup(true);
  t.after(() => c.dom.window.close());

  c.document.getElementById("edit-button").click();
  c.document.getElementById("actions-area").click();

  assert.deepEqual(Array.from(c.window.__edited), []);
});

test("Enter and Space open the editor from the focused product card", (t) => {
  const c = setup(true);
  t.after(() => c.dom.window.close());
  const card = c.document.querySelector('[data-ctx-id="p-1"]');

  const enter = new c.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  card.dispatchEvent(enter);
  const space = new c.window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  card.dispatchEvent(space);

  assert.deepEqual(Array.from(c.window.__edited), ["p-1", "p-1"]);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(space.defaultPrevented, true);
});

test("card editing and keyboard affordance stay unavailable without productos.editar", (t) => {
  const c = setup(false);
  t.after(() => c.dom.window.close());
  const card = c.document.querySelector('[data-ctx-id="p-1"]');

  c.document.getElementById("product-body").click();

  assert.deepEqual(Array.from(c.window.__edited), []);
  assert.equal(card.hasAttribute("data-bc-card-editable"), false);
  assert.equal(card.hasAttribute("tabindex"), false);
  assert.equal(card.hasAttribute("role"), false);
});

test("cards gain keyboard affordance when permissions finish hydrating after the first render", async (t) => {
  const c = setup(false);
  t.after(() => c.dom.window.close());
  const card = c.document.querySelector('[data-ctx-id="p-1"]');

  assert.equal(card.hasAttribute("tabindex"), false);
  c.window._allowed = true;
  c.document.getElementById("app-shell").setAttribute("data-bc-permisos-cargados", "1");
  await new Promise((resolve) => c.window.setTimeout(resolve, 0));

  assert.equal(card.getAttribute("role"), "button");
  assert.equal(card.getAttribute("tabindex"), "0");
  assert.equal(card.getAttribute("data-bc-card-editable"), "1");
});

test("product-card editor is wired into the current PWA shell and precached with matching version", () => {
  assert.match(APP_SOURCE, /const VERSION\s*=\s*["']9\.5\.108["']/);
  assert.match(APP_SOURCE, /\["bc-product-card-edit\.js",\s*["']1\.1["']\]/);
  assert.match(APP_SOURCE, /password-recovery-admin\.js/);
  assert.match(INDEX_SOURCE, /app\.js\?v=9\.5\.108/);
  assert.match(INDEX_SOURCE, /v9\.5\.108/);
  assert.match(SW_SOURCE, /BC_SW_VERSION\s*=\s*["']9\.5\.108["']/);
  assert.match(SW_SOURCE, /js\/bc-product-card-edit\.js\?v=1\.1/);
});
