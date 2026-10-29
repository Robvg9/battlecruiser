"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "public/js/productos.js"), "utf8");

function createContext() {
  const html =
    "<!doctype html><html lang='es'><head></head><body>" +
    "<form id='form-producto'>" +
      "<input id='prod-editando-id' type='hidden' value=''>" +
      "<input id='prod-nombre' value=''>" +
      "<select id='prod-categoria'>" +
        "<option value=''>Categoría</option>" +
        "<option value='cat-drinks'>Bebidas</option>" +
        "<option value='cat-food'>Alimentos</option>" +
      "</select>" +
      "<input id='prod-unidad' value=''>" +
      "<input id='prod-precio-normal' type='number' value=''>" +
      "<input id='prod-precio-mayorista' type='number' value=''>" +
      "<input id='prod-imagen-input' type='file' accept='image/jpeg,image/png,image/jpg'>" +
      "<div id='prod-imagen-preview-wrap' class='hidden'>" +
        "<img id='prod-imagen-preview' alt='Vista previa'>" +
        "<button type='button' id='prod-imagen-quitar'>Quitar imagen</button>" +
      "</div>" +
      "<div id='msg-prod-imagen'></div>" +
      "<button type='submit' id='prod-submit-btn'>Agregar producto</button>" +
      "<button type='button' id='prod-cancelar-edicion' class='hidden'>Cancelar edición</button>" +
    "</form>" +
    "<input id='productos-buscar' type='search'>" +
    "<div id='lista-productos'></div>" +
    "</body></html>";

  const dom = new JSDOM(html, {
    url: "https://battlecruiser-products-step4.test/",
    runScripts: "outside-only"
  });

  const { window } = dom;
  window.safeInit = (id, initialize) => {
    if (window.document.getElementById(id)) initialize();
  };
  window.setMsg = (id, message, success) => {
    const node = window.document.getElementById(id);
    if (node) {
      node.textContent = String(message || "");
      node.dataset.success = String(!!success);
    }
  };
  window.estaRealmenteDesconectado = () => false;
  window.URL.createObjectURL = (file) => {
    window.__lastPreviewFile = file;
    return "blob:product-fixture-preview";
  };
  window._cache = { productos: [], stock: [] };
  window.document.getElementById("form-producto").scrollIntoView = () => {};
  window.eval(SOURCE);
  return { dom, window };
}

function fixtureProduct(overrides = {}) {
  return {
    id: "product-edit-fixture",
    nombre: "Cerveza fixture",
    unidad: "botella",
    precio_normal: 12.5,
    precio_mayorista: 10.25,
    imagen_url: "https://images.example.test/product.png",
    categorias: { nombre: "Bebidas" },
    ...overrides
  };
}

function setSelectedFile(window, file) {
  const input = window.document.getElementById("prod-imagen-input");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: file ? [file] : []
  });
}

test("Paso 4 RWHT 019/021: editar producto carga ID y categoría existentes en el formulario", () => {
  const { dom, window } = createContext();
  try {
    window.iniciarEdicionProducto(fixtureProduct());
    assert.equal(window.document.getElementById("prod-editando-id").value, "product-edit-fixture");
    assert.equal(window.document.getElementById("prod-nombre").value, "Cerveza fixture");
    assert.equal(window.document.getElementById("prod-unidad").value, "botella");
    assert.equal(window.document.getElementById("prod-precio-normal").value, "12.5");
    assert.equal(window.document.getElementById("prod-precio-mayorista").value, "10.25");
    assert.equal(window.document.getElementById("prod-categoria").value, "cat-drinks");
    assert.equal(window.document.getElementById("prod-submit-btn").textContent, "Guardar cambios");
    assert.equal(window.document.getElementById("prod-cancelar-edicion").classList.contains("hidden"), false);
    assert.equal(window.document.getElementById("prod-imagen-preview").dataset.guardada, "true");
    assert.equal(window.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), false);
  } finally {
    dom.window.close();
  }
});

test("Paso 4 RWHT 019/028: cancelar edición limpia el ID y restaura el formulario de alta", () => {
  const { dom, window } = createContext();
  try {
    window.iniciarEdicionProducto(fixtureProduct());
    window.cancelarEdicionProducto();
    assert.equal(window.document.getElementById("prod-editando-id").value, "");
    assert.equal(window.document.getElementById("prod-nombre").value, "");
    assert.equal(window.document.getElementById("prod-categoria").value, "");
    assert.equal(window.document.getElementById("prod-precio-normal").value, "");
    assert.equal(window.document.getElementById("prod-precio-mayorista").value, "");
    assert.equal(window.document.getElementById("prod-submit-btn").textContent, "Agregar producto");
    assert.equal(window.document.getElementById("prod-cancelar-edicion").classList.contains("hidden"), true);
    assert.equal(window.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), true);
    assert.equal(window.document.getElementById("prod-imagen-preview").hasAttribute("src"), false);
    assert.equal(window.document.getElementById("prod-imagen-preview").dataset.guardada, "false");
  } finally {
    dom.window.close();
  }
});

test("Paso 4 RWHT 025: archivo PNG válido crea vista previa local sin subirlo", () => {
  const { dom, window } = createContext();
  try {
    const file = { name: "fixture.png", type: "image/png", size: 128 };
    setSelectedFile(window, file);
    window.document.getElementById("prod-imagen-input").dispatchEvent(
      new window.Event("change", { bubbles: true })
    );
    assert.equal(window.__lastPreviewFile, file);
    assert.equal(window.document.getElementById("prod-imagen-preview").getAttribute("src"), "blob:product-fixture-preview");
    assert.equal(window.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), false);
    assert.equal(window.document.getElementById("msg-prod-imagen").textContent, "");
  } finally {
    dom.window.close();
  }
});

test("Paso 4 RWHT 025: tipo de imagen no permitido se rechaza y no muestra vista previa", () => {
  const { dom, window } = createContext();
  try {
    setSelectedFile(window, { name: "fixture.txt", type: "text/plain", size: 128 });
    window.document.getElementById("prod-imagen-input").dispatchEvent(
      new window.Event("change", { bubbles: true })
    );
    assert.match(window.document.getElementById("msg-prod-imagen").textContent, /Formato no permitido/);
    assert.equal(window.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), true);
    assert.equal(window.__lastPreviewFile, undefined);
  } finally {
    dom.window.close();
  }
});

test("Paso 4 RWHT 025: imágenes que exceden 5 MB se rechazan sin previsualizar", () => {
  const { dom, window } = createContext();
  try {
    setSelectedFile(window, { name: "large.png", type: "image/png", size: 5 * 1024 * 1024 + 1 });
    window.document.getElementById("prod-imagen-input").dispatchEvent(
      new window.Event("change", { bubbles: true })
    );
    assert.match(window.document.getElementById("msg-prod-imagen").textContent, /máximo 5MB/);
    assert.equal(window.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), true);
    assert.equal(window.__lastPreviewFile, undefined);
  } finally {
    dom.window.close();
  }
});

test("Paso 4 RWHT 026: quitar una imagen nueva borra el archivo seleccionado sin llamar a backend", () => {
  const { dom, window } = createContext();
  try {
    const file = { name: "fixture.png", type: "image/png", size: 128 };
    setSelectedFile(window, file);
    window.document.getElementById("prod-imagen-input").dispatchEvent(
      new window.Event("change", { bubbles: true })
    );
    window.document.getElementById("prod-imagen-quitar").click();
    assert.equal(window.document.getElementById("prod-editando-id").value, "");
    assert.equal(window.document.getElementById("prod-imagen-input").value, "");
    assert.equal(window.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), true);
    assert.equal(window.document.getElementById("msg-prod-imagen").textContent, "");
  } finally {
    dom.window.close();
  }
});
