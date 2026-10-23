"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const JS_DIR = path.join(__dirname, "..", "public", "js");
const M44 = fs.readFileSync(path.join(JS_DIR, "m44-productos-vistas.js"), "utf8");
const M47 = fs.readFileSync(path.join(JS_DIR, "m47-productos-vista-final.js"), "utf8");
const PREF = "bc_productos_vista_v1";

function createDom() {
  return new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
    "<section id='tab-productos' class='tab-panel'>" +
      "<div id='bc-productos-controles'>" +
        "<input id='productos-buscar'>" +
        "<button type='button' id='bc-productos-agregar'>Agregar producto</button>" +
      "</div>" +
      "<div id='lista-productos'><article class='lista-item' data-ctx-id='p-fixture'>Producto fixture</article></div>" +
    "</section></body></html>",
    { url: "https://battlecruiser-products-view.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
}

async function waitFor(predicate, timeout = 1800) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  return Boolean(predicate());
}

function startModules(window) {
  window.eval(M44);
  window.eval(M47);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
}

function button(window, view) {
  return window.document.querySelector("#tab-productos .bc-m44-view-btn[data-view='" + view + "']");
}

test("Paso 4 productos: los controles Filas/Cuadros cambian clases exclusivas y aria-pressed", async (t) => {
  const dom = createDom();
  const { window } = dom;
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1250));
    window.close();
  });

  startModules(window);
  assert.ok(await waitFor(() => button(window, "rows") && button(window, "cards")),
    "M44 debe exponer ambos controles de vista");
  await new Promise((resolve) => setTimeout(resolve, 1250));

  const list = window.document.getElementById("lista-productos");
  assert.ok(list.classList.contains("bc-productos-cards"), "Cuadros debe ser el modo inicial");
  assert.equal(button(window, "cards").getAttribute("aria-pressed"), "true");
  assert.equal(button(window, "rows").getAttribute("aria-pressed"), "false");

  button(window, "rows").click();
  assert.ok(await waitFor(() => list.classList.contains("bc-productos-filas")),
    "Filas debe aplicar la clase correspondiente");
  assert.equal(list.classList.contains("bc-productos-cards"), false,
    "Filas y Cuadros no deben quedar activos simultáneamente");
  assert.equal(button(window, "rows").getAttribute("aria-pressed"), "true");
  assert.equal(button(window, "cards").getAttribute("aria-pressed"), "false");
  assert.equal(window.localStorage.getItem(PREF), "rows");

  button(window, "cards").click();
  assert.ok(await waitFor(() => list.classList.contains("bc-productos-cards")),
    "Cuadros debe volver a aplicar su clase");
  assert.equal(list.classList.contains("bc-productos-filas"), false);
  assert.equal(button(window, "cards").getAttribute("aria-pressed"), "true");
  assert.equal(button(window, "rows").getAttribute("aria-pressed"), "false");
  assert.equal(window.localStorage.getItem(PREF), "cards");
});

test("Paso 4 productos: la vista Filas guardada se restaura al inicializar la interfaz", async (t) => {
  const dom = createDom();
  const { window } = dom;
  window.localStorage.setItem(PREF, "rows");
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1250));
    window.close();
  });

  startModules(window);
  assert.ok(await waitFor(() => button(window, "rows") && button(window, "cards")),
    "los controles deben instalarse al arrancar");
  await new Promise((resolve) => setTimeout(resolve, 1250));

  const list = window.document.getElementById("lista-productos");
  assert.ok(list.classList.contains("bc-productos-filas"),
    "la preferencia Filas debe aplicarse tras iniciar ambos módulos");
  assert.equal(list.classList.contains("bc-productos-cards"), false);
  assert.equal(button(window, "rows").getAttribute("aria-pressed"), "true");
  assert.equal(button(window, "cards").getAttribute("aria-pressed"), "false");
  assert.equal(window.localStorage.getItem(PREF), "rows");
});
