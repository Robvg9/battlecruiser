"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "productos.js"),
  "utf8"
);

const EDIT_START = SOURCE.indexOf("function iniciarEdicionProducto(p) {");
const EDIT_END = SOURCE.indexOf('safeInit("form-producto"', EDIT_START);
const IMAGE_START = SOURCE.indexOf("function validarArchivoImagenProducto(file) {");
const IMAGE_END = SOURCE.indexOf("let _productosBusqueda", IMAGE_START);
const FORM_START = SOURCE.indexOf('safeInit("form-producto"', IMAGE_START);
const FORM_END = SOURCE.indexOf("let _compraAsociacionesCache", FORM_START);

assert.ok(EDIT_START >= 0 && EDIT_END > EDIT_START, "production edit/cancel handlers must exist");
assert.ok(IMAGE_START >= 0 && IMAGE_END > IMAGE_START, "production image handlers must exist");
assert.ok(FORM_START >= 0 && FORM_END > FORM_START, "production product form handler must exist");

const PRODUCTION_HANDLERS = [
  "const PROD_IMAGEN_TIPOS_VALIDOS = ['image/jpeg', 'image/png', 'image/jpg'];",
  "const PROD_IMAGEN_TAMANO_ORIGINAL_MAX = 15 * 1024 * 1024;",
  "const PROD_IMAGEN_LADO_MAX = 512;",
  "let _productoImagenProcesada = null;",
  "let _productoImagenPreviewObjectUrl = null;",
  SOURCE.slice(EDIT_START, EDIT_END),
  SOURCE.slice(IMAGE_START, IMAGE_END),
  SOURCE.slice(FORM_START, FORM_END)
].join("\n");

function setup() {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<form id='form-producto'>" +
        "<input type='hidden' id='prod-editando-id' value=''>" +
        "<input id='prod-nombre' value=''>" +
        "<select id='prod-categoria'>" +
          "<option value=''>Categoría</option>" +
          "<option value='cat-bebidas'>Bebidas</option>" +
          "<option value='cat-alimentos'>Alimentos</option>" +
        "</select>" +
        "<input id='prod-unidad' value=''>" +
        "<input id='prod-precio-normal' type='number' value=''>" +
        "<input id='prod-precio-mayorista' type='number' value=''>" +
        "<input id='prod-imagen-input' type='file' accept='image/jpeg,image/png'>" +
        "<div id='prod-imagen-preview-wrap' class='hidden'>" +
          "<img id='prod-imagen-preview' data-guardada='false' alt='Vista previa'>" +
          "<button type='button' id='prod-imagen-quitar'>Quitar imagen</button>" +
        "</div>" +
        "<p id='msg-prod-imagen'></p>" +
        "<button type='submit' id='prod-submit-btn'>Agregar producto</button>" +
        "<button type='button' id='prod-cancelar-edicion' class='hidden'>Cancelar edición</button>" +
      "</form>" +
      "<p id='msg-productos'></p>" +
    "</body></html>",
    {
      url: "https://battlecruiser-products-edit.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  const calls = [];
  const rpcCalls = [];
  let refreshCount = 0;

  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.URL.createObjectURL = (file) => "blob:fixture:" + file.name;
  window.URL.revokeObjectURL = () => {};
  window.Image = class {
    constructor() { this.naturalWidth = 1600; this.naturalHeight = 900; }
    set src(value) { this._src = value; if (typeof this.onload === "function") this.onload(); }
  };
  window.HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage: (...args) => { window.__BC_DRAW_IMAGE_ARGS__ = args; } };
  };
  window.HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    window.__BC_CANVAS_SIZE__ = { width: this.width, height: this.height, type, quality };
    callback(new window.Blob(["optimized-image"], { type: "image/jpeg" }));
  };
  window.safeInit = (name, callback) => {
    if (["prod-cancelar-edicion", "prod-imagen-input", "form-producto"].includes(name)) {
      callback();
    }
  };
  window.setMsg = (id, message, ok) => {
    const node = window.document.getElementById(id);
    if (node) {
      node.textContent = String(message || "");
      node.dataset.ok = String(Boolean(ok));
    }
  };
  window.explicarError = (error) => String(error?.message || error || "error fixture");
  window.estaRealmenteDesconectado = () => false;
  window.refrescarProductos = async () => {
    refreshCount += 1;
    return { productos: [], almacenes: [] };
  };
  window.ejecutarOperacion = async (name, params) => {
    calls.push({ name, params: { ...params } });
    return { ok: true, data: "producto-editado-fixture" };
  };
  window.client = {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params: { ...params } });
      return { data: null, error: null };
    }
  };

  window.eval(PRODUCTION_HANDLERS);
  return {
    dom,
    window,
    document: window.document,
    calls,
    rpcCalls,
    get refreshCount() { return refreshCount; }
  };
}

function setFiles(input, files) {
  Object.defineProperty(input, "files", {
    configurable: true,
    get: () => files
  });
}

async function waitFor(predicate, timeoutMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

test("Paso 4 RWHT 019/021: iniciar edición carga el ID oculto y la categoría del producto", (t) => {
  const c = setup();
  t.after(() => c.dom.window.close());

  c.window.iniciarEdicionProducto({
    id: "producto-edit-fixture",
    nombre: "Cerveza fixture",
    unidad: "botella",
    precio_normal: 125,
    precio_mayorista: 110,
    categorias: { nombre: "Bebidas" },
    imagen_url: "https://images.example.invalid/cerveza.png"
  });

  assert.equal(c.document.getElementById("prod-editando-id").value, "producto-edit-fixture");
  assert.equal(c.document.getElementById("prod-nombre").value, "Cerveza fixture");
  assert.equal(c.document.getElementById("prod-unidad").value, "botella");
  assert.equal(c.document.getElementById("prod-precio-normal").value, "125");
  assert.equal(c.document.getElementById("prod-precio-mayorista").value, "110");
  assert.equal(c.document.getElementById("prod-categoria").value, "cat-bebidas");
  assert.equal(c.document.getElementById("prod-submit-btn").textContent, "Guardar cambios");
  assert.equal(c.document.getElementById("prod-cancelar-edicion").classList.contains("hidden"), false);
  assert.equal(c.document.getElementById("prod-imagen-preview").dataset.guardada, "true");
  assert.equal(c.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), false);
});

test("Paso 4 RWHT 019/021: guardar edición envía el ID y la categoría exactos por la operación mock", async (t) => {
  const c = setup();
  t.after(() => c.dom.window.close());

  c.window.iniciarEdicionProducto({
    id: "producto-edit-fixture",
    nombre: "Nombre anterior",
    unidad: "botella",
    precio_normal: 125,
    precio_mayorista: null,
    categorias: { nombre: "Bebidas" },
    imagen_url: null
  });
  c.document.getElementById("prod-nombre").value = "Cerveza actualizada";
  c.document.getElementById("prod-precio-normal").value = "130.5";

  c.document.getElementById("form-producto").dispatchEvent(
    new c.window.Event("submit", { bubbles: true, cancelable: true })
  );

  assert.ok(await waitFor(() => c.calls.length === 1), "el formulario debe ejecutar la actualización mock");
  assert.deepEqual(c.calls[0], {
    name: "producto_actualizar",
    params: {
      p_producto_id: "producto-edit-fixture",
      p_nombre: "Cerveza actualizada",
      p_categoria_id: "cat-bebidas",
      p_unidad: "botella",
      p_precio_normal: 130.5,
      p_precio_mayorista: null
    }
  });
  assert.ok(await waitFor(() => /Producto actualizado/i.test(c.document.getElementById("msg-productos").textContent)),
    "la UI debe terminar la actualización, comunicar el éxito y limpiar el estado");
  assert.equal(c.document.getElementById("prod-editando-id").value, "");
  assert.equal(c.refreshCount, 1);
});

test("Paso 4 RWHT 025: el selector de imagen rechaza formatos no permitidos y archivos mayores de 5 MB", (t) => {
  const c = setup();
  t.after(() => c.dom.window.close());
  const input = c.document.getElementById("prod-imagen-input");
  const wrap = c.document.getElementById("prod-imagen-preview-wrap");

  setFiles(input, [{ name: "malware.pdf", type: "application/pdf", size: 100 }]);
  input.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  assert.match(c.document.getElementById("msg-prod-imagen").textContent, /Formato no permitido/i);
  assert.equal(wrap.classList.contains("hidden"), true);

  setFiles(input, [{ name: "gigante.jpg", type: "image/jpeg", size: 15 * 1024 * 1024 + 1 }]);
  input.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  assert.match(c.document.getElementById("msg-prod-imagen").textContent, /máximo de 15MB/i);
  assert.equal(wrap.classList.contains("hidden"), true);
});

test("Paso 4 RWHT 025: una imagen JPG/PNG se recorta al centro, limita a 512x512 y genera vista previa sin subirla", async (t) => {
  const c = setup();
  t.after(() => c.dom.window.close());
  const input = c.document.getElementById("prod-imagen-input");
  const wrap = c.document.getElementById("prod-imagen-preview-wrap");
  const preview = c.document.getElementById("prod-imagen-preview");

  setFiles(input, [{ name: "producto.png", type: "image/png", size: 2048 }]);
  input.dispatchEvent(new c.window.Event("change", { bubbles: true }));

  assert.ok(await waitFor(() => preview.src === "blob:fixture:producto.jpg"), "la previsualización debe usar el archivo procesado");
  assert.equal(wrap.classList.contains("hidden"), false);
  assert.deepEqual(c.window.__BC_CANVAS_SIZE__, {
    width: 512, height: 512, type: "image/jpeg", quality: 0.84
  });
  assert.deepEqual(c.window.__BC_PRODUCT_IMAGE_DIMENSIONS__, {
    width: 512, height: 512, cropLeft: 350, cropTop: 0, cropSide: 900
  });
  assert.equal(c.window.__BC_PRODUCT_IMAGE_FILE__.type, "image/jpeg");
  assert.equal(c.window.__BC_PRODUCT_IMAGE_FILE__.size, 15);
  assert.match(c.document.getElementById("msg-prod-imagen").textContent, /formato cuadrado/i);
  assert.equal(c.rpcCalls.length, 0, "seleccionar una imagen no debe subirla ni escribir en backend");
  assert.equal(c.calls.length, 0);
});

test("Paso 4 RWHT 026: quitar imagen guardada envía null para el producto en edición y confirma el resultado", async (t) => {
  const c = setup();
  t.after(() => c.dom.window.close());

  c.document.getElementById("prod-editando-id").value = "producto-imagen-fixture";
  c.document.getElementById("prod-imagen-preview").dataset.guardada = "true";
  c.document.getElementById("prod-imagen-preview-wrap").classList.remove("hidden");
  c.document.getElementById("prod-imagen-quitar").click();

  assert.ok(await waitFor(() => c.rpcCalls.length === 1), "quitar imagen debe llamar al RPC de imagen");
  assert.deepEqual(c.rpcCalls[0], {
    name: "actualizar_imagen_producto",
    params: {
      p_producto_id: "producto-imagen-fixture",
      p_imagen_url: null
    }
  });
  assert.ok(await waitFor(() => /Imagen quitada/i.test(c.document.getElementById("msg-prod-imagen").textContent)),
    "la UI debe terminar la eliminación y confirmar el resultado");
  assert.equal(c.document.getElementById("prod-imagen-preview").dataset.guardada, "false");
  assert.equal(c.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), true);
  assert.match(c.document.getElementById("msg-prod-imagen").textContent, /Imagen quitada/i);
  assert.equal(c.refreshCount, 1);
});

test("Paso 4 RWHT 026: quitar imagen guardada sin conexión se bloquea antes del RPC", async (t) => {
  const c = setup();
  t.after(() => c.dom.window.close());
  c.window.estaRealmenteDesconectado = () => true;
  c.document.getElementById("prod-editando-id").value = "producto-imagen-offline-fixture";
  c.document.getElementById("prod-imagen-preview").dataset.guardada = "true";
  c.document.getElementById("prod-imagen-preview-wrap").classList.remove("hidden");

  c.document.getElementById("prod-imagen-quitar").click();
  assert.ok(await waitFor(() => /Necesitas conexión/i.test(c.document.getElementById("msg-prod-imagen").textContent)));
  assert.equal(c.rpcCalls.length, 0, "no debe intentar una escritura cuando está offline");
});

test("Paso 4 RWHT 028: cancelar edición restablece campos, ID y vista previa sin RPC", (t) => {
  const c = setup();
  t.after(() => c.dom.window.close());
  c.window.iniciarEdicionProducto({
    id: "producto-cancel-fixture",
    nombre: "Producto temporal",
    unidad: "unidad",
    precio_normal: 42,
    precio_mayorista: null,
    categorias: { nombre: "Bebidas" },
    imagen_url: "https://images.example.invalid/temp.png"
  });

  c.document.getElementById("prod-cancelar-edicion").click();

  assert.equal(c.document.getElementById("prod-editando-id").value, "");
  assert.equal(c.document.getElementById("prod-nombre").value, "");
  assert.equal(c.document.getElementById("prod-categoria").value, "");
  assert.equal(c.document.getElementById("prod-precio-normal").value, "");
  assert.equal(c.document.getElementById("prod-submit-btn").textContent, "Agregar producto");
  assert.equal(c.document.getElementById("prod-cancelar-edicion").classList.contains("hidden"), true);
  assert.equal(c.document.getElementById("prod-imagen-preview-wrap").classList.contains("hidden"), true);
  assert.equal(c.document.getElementById("prod-imagen-preview").dataset.guardada, "false");
  assert.equal(c.rpcCalls.length, 0);
  assert.equal(c.calls.length, 0);
});
