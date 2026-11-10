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

function setup(allowed = true) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<div id="lista-productos">' +
        '<div class="lista-item" data-ctx-tipo="producto" data-ctx-id="p-1" role="button" tabindex="0">' +
          '<span id="product-body">Producto de prueba</span>' +
          '<span class="lista-item-acciones"><button id="edit-button" type="button">Editar</button></span>' +
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

test("card body opens the existing editor when productos.editar is allowed", (t) => {
  const c = setup(true);
  t.after(() => c.dom.window.close());

  c.document.getElementById("product-body").click();

  assert.deepEqual(Array.from(c.window.__edited), ["p-1"]);
  assert.equal(c.document.querySelector('[data-ctx-id="p-1"]').getAttribute("aria-label"), "Editar producto: Producto de prueba");
  assert.equal(c.document.querySelector('[data-ctx-id="p-1"]').getAttribute("tabindex"), "0");
});

test("nested action buttons keep their own action and do not trigger card editing", (t) => {
  const c = setup(true);
  t.after(() => c.dom.window.close());

  c.document.getElementById("edit-button").click();

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

test("card editing stays unavailable without productos.editar", (t) => {
  const c = setup(false);
  t.after(() => c.dom.window.close());
  const card = c.document.querySelector('[data-ctx-id="p-1"]');

  c.document.getElementById("product-body").click();

  assert.deepEqual(Array.from(c.window.__edited), []);
  assert.equal(card.hasAttribute("data-bc-card-editable"), false);
  assert.equal(card.hasAttribute("tabindex"), false);
  assert.equal(card.hasAttribute("role"), false);
});
