"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m55-productos-import.js"),
  "utf8"
);

const APP_SOURCE = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const INDEX_SOURCE = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const SW_SOURCE = fs.readFileSync(path.join(__dirname, "..", "public", "service-worker.js"), "utf8");

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body><p id='msg-productos'></p></body></html>",
    { url: "https://battlecruiser.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  const rpcCalls = [];
  window.tienePermiso = () => true;
  window.setMsg = () => {};
  window._cache = {
    categorias: [{ id: "cat-bebidas", nombre: "Bebidas", activo: true }]
  };
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  Object.defineProperty(window.crypto, "randomUUID", {
    value: () => "idempotency-test",
    configurable: true
  });
  window.client = {
    rpc: async (name, payload) => {
      rpcCalls.push({ name, payload });
      return { data: "producto-creado-1", error: null };
    }
  };
  let downloadedBlob = null;
  let downloadedName = null;
  window.URL.createObjectURL = (blob) => {
    downloadedBlob = blob;
    return "blob:plantilla-test";
  };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {
    downloadedName = this.download;
  };

  window.eval(SOURCE);
  window.__BCM55_openOffline();
  t.after(() => window.close());
  return {
    window,
    rpcCalls,
    getDownloadedBlob: () => downloadedBlob,
    getDownloadedName: () => downloadedName
  };
}

async function waitFor(predicate, timeout = 1200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

test("M55: Importar Excel abre primero el paso de descarga, no el selector de archivos", async (t) => {
  const c = setup(t);
  const d = c.window.document;
  assert.match(d.getElementById("bc-m55-body").textContent, /PASO 1 DE 2/);
  assert.ok(d.getElementById("bc-m55-template-download"));
  assert.equal(d.getElementById("bc-m55-file"), null, "el selector de importación no debe aparecer en el paso 1");

  d.getElementById("bc-m55-template-download").click();
  assert.equal(c.getDownloadedName(), "plantilla_productos_battlecruiser.csv");
  assert.ok(c.getDownloadedBlob(), "debe generarse un archivo descargable");

  const csv = await new Promise((resolve, reject) => {
    const reader = new c.window.FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer el CSV generado."));
    reader.readAsText(c.getDownloadedBlob(), "utf-8");
  });
  assert.ok(csv.replace(/"/g, "").includes("nombre;categoria;unidad;precio_normal;precio_mayorista;formato_venta;factor_venta"));
  assert.ok(csv.startsWith("\uFEFF"), "el CSV debe llevar BOM UTF-8 para conservar tildes en Excel");

  d.getElementById("bc-m55-continue").click();
  assert.match(d.getElementById("bc-m55-body").textContent, /PASO 2 DE 2/);
  assert.ok(d.getElementById("bc-m55-file"), "el selector aparece solamente en el paso 2");
  assert.equal(c.rpcCalls.length, 0, "descargar la plantilla nunca debe crear productos");
});

test("M55: importa usando el mismo contrato de precio y formato mayorista del formulario actual", async (t) => {
  const c = setup(t);
  const d = c.window.document;
  d.getElementById("bc-m55-continue").click();
  const input = d.getElementById("bc-m55-file");
  const file = {
    name: "productos.csv",
    text: async () => [
      "nombre;categoria;unidad;precio_normal;precio_mayorista;formato_venta;factor_venta",
      "Cerveza;Bebidas;botella;650;600;Caja x 24;24"
    ].join("\r\n")
  };
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new c.window.Event("change"));
  assert.ok(await waitFor(() => d.getElementById("bc-m55-run")), "debe cargar la vista previa");
  assert.match(d.getElementById("bc-m55-preview").textContent, /Plantilla válida/);

  d.getElementById("bc-m55-run").click();
  assert.ok(await waitFor(() => c.rpcCalls.length === 1), "debe ejecutar una sola alta");
  const call = c.rpcCalls[0];
  assert.equal(call.name, "bc_guardar_producto_catalogo");
  assert.equal(call.payload.p_nombre, "Cerveza");
  assert.equal(call.payload.p_categoria_id, "cat-bebidas");
  assert.equal(call.payload.p_unidad, "botella");
  assert.equal(call.payload.p_precio_normal, 650);
  assert.equal(call.payload.p_precio_mayorista, 600);
  assert.equal(call.payload.p_presentacion_normal, "botella");
  assert.equal(call.payload.p_factor_normal, 1);
  assert.equal(call.payload.p_presentacion_mayorista, "Caja x 24");
  assert.equal(call.payload.p_factor_mayorista, 24);
  assert.equal(call.payload.p_idempotency_key, "idempotency-test");
  assert.match(d.getElementById("bc-m55-result").textContent, /1 producto\(s\) procesado\(s\)/);
});

test("M55: rechaza categoría inexistente y no envía registros al servidor", async (t) => {
  const c = setup(t);
  const d = c.window.document;
  d.getElementById("bc-m55-continue").click();
  const input = d.getElementById("bc-m55-file");
  const file = {
    name: "productos.csv",
    text: async () => [
      "nombre;categoria;unidad;precio_normal;precio_mayorista;formato_venta;factor_venta",
      "Cerveza;Categoría inventada;botella;650;;;"
    ].join("\r\n")
  };
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new c.window.Event("change"));
  assert.ok(await waitFor(() => d.getElementById("bc-m55-run")));
  assert.match(d.getElementById("bc-m55-preview").textContent, /no existe o está inactiva/);
  assert.equal(d.getElementById("bc-m55-run").disabled, true);
  assert.equal(c.rpcCalls.length, 0);
});

test("M55: app shell y Service Worker publican la versión y caché nuevas del importador", () => {
  assert.match(APP_SOURCE, /const VERSION="9\.5\.65"/);
  assert.match(APP_SOURCE, /m55-productos-import\.js","55\.2"/);
  assert.match(INDEX_SOURCE, /app\.js\?v=9\.5\.65/);
  assert.match(SW_SOURCE, /BC_SW_VERSION = "9\.5\.65"/);
  assert.match(SW_SOURCE, /app\.js\?v=9\.5\.65/);
  assert.match(SW_SOURCE, /m55-productos-import\.js\?v=55\.2/);
});
