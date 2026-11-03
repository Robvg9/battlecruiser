"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const M26_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m26-ui-integridad.js"),
  "utf8"
);
const M171_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "hotfix-17-1-productos-import-flow-20260903.js"),
  "utf8"
);

function fixture() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <section id="tab-productos" class="tab-panel">
      <form id="form-producto" class="inline-form">
        <input type="hidden" id="prod-editando-id" value="">
        <input id="prod-nombre" value="">
        <select id="prod-categoria"><option value="">Categoría</option><option value="cat-1">Bebidas</option></select>
        <input id="prod-unidad" value="unidad">
        <input id="prod-precio-normal" type="number" value="">
        <input id="prod-precio-mayorista" type="number" value="">
        <div class="prod-imagen-campo"><input id="prod-imagen-input" type="file"></div>
        <fieldset id="prod-presentaciones-config"></fieldset>
        <button type="submit" id="prod-submit-btn">Guardar producto</button>
        <button type="button" id="prod-cancelar-edicion" class="hidden">Cancelar edición</button>
      </form>
      <div class="productos-buscador-controles"><input id="productos-buscar"></div>
      <div id="lista-productos" class="lista"></div>
      <p id="msg-productos"></p>
    </section>
  </body></html>`, {
    url: "https://battlecruiser-products-modal.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.renderProductosLista = function () {};
  window.eval(M26_SOURCE);
  window.eval(M171_SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  return { dom, window, document: window.document };
}

async function waitFor(predicate, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return Boolean(predicate());
}

test("Productos: alta usa el modal M26 existente y no crea un segundo overlay", async (t) => {
  const c = fixture();
  t.after(() => c.dom.window.close());

  assert.ok(await waitFor(() => typeof c.window.__BC171_open === "function"),
    "el adaptador M17.1 debe conectarse al modal M26");
  const button = c.document.getElementById("bc-productos-agregar");
  const modal = c.document.getElementById("bc-product-modal");
  const form = c.document.getElementById("form-producto");

  assert.ok(button, "debe existir el botón nativo de Productos");
  assert.equal(button.textContent, "Registrar nuevo producto");
  assert.equal(c.document.querySelectorAll("#tab-productos button").length >= 1, true);
  assert.equal(c.document.getElementById("bc171-add"), null, "no debe crearse otro botón de alta");
  assert.equal(c.document.getElementById("bc171-overlay"), null, "no debe crearse un segundo overlay");
  assert.equal(form.parentElement.id, "bc-product-form-host", "el formulario debe permanecer dentro del host M26");
  assert.ok(modal.classList.contains("hidden"), "el modal inicia cerrado");

  // Simula el clic humano real en el botón que M26 administra.
  button.click();
  assert.equal(modal.classList.contains("hidden"), false, "el modal nativo debe abrir sin bloquear la PWA");
  assert.equal(c.document.getElementById("bc171-overlay"), null);
  assert.equal(c.document.getElementById("form-producto"), form, "el mismo formulario debe conservarse");

  // M17.3 prepara el ID antes de abrir; abrir el modal no puede borrarlo.
  c.document.getElementById("prod-editando-id").value = "producto-edicion-77";
  c.document.getElementById("prod-nombre").value = "Producto de edición";
  assert.equal(c.window.__BC171_open(), true);
  assert.equal(c.document.getElementById("prod-editando-id").value, "producto-edicion-77");
  assert.equal(c.document.getElementById("bc-product-modal-title").textContent, "Editar producto");

  assert.equal(c.window.__BC171_close(), true);
  assert.equal(modal.classList.contains("hidden"), true, "el adaptador debe cerrar el mismo modal");
  assert.equal(form.parentElement.id, "bc-product-form-host");
});

