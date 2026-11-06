"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const m53Source = fs.readFileSync(path.join(root, "public/js/m53-inventario-centro.js"), "utf8");
const detailSource = fs.readFileSync(path.join(root, "public/js/inventario-detalle.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "public/js/core.js"), "utf8");

const rows = [
  { producto_id: "biz", producto: "Bizcocho", almacen: "Almacén Casa", almacen_id: "a1", cantidad: 70, minimo: 5, unidad: "u", estado: "normal", valor_inventario: 123456.78 },
  { producto_id: "biz", producto: "Bizcocho", almacen: "La Cueva", almacen_id: "a2", cantidad: 200, minimo: 10, unidad: "u", estado: "normal", valor_inventario: 345678.90 },
  { producto_id: "cafe", producto: "Café", almacen: "Almacén Casa", almacen_id: "a1", cantidad: 2, minimo: 5, unidad: "kg", estado: "bajo", valor_inventario: 2500 },
  { producto_id: "cafe", producto: "Café", almacen: "La Cueva", almacen_id: "a2", cantidad: 4, minimo: 4, unidad: "kg", estado: "normal", valor_inventario: 5000 },
  { producto_id: "harina", producto: "Harina", almacen: "Almacén Casa", almacen_id: "a1", cantidad: 0, minimo: 2, unidad: "kg", estado: "agotado", valor_inventario: 0 }
];

async function waitFor(predicate, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

async function boot(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<section id='tab-inventario' class='tab-panel visible'>" +
        "<div class='pendientes-header'><h3>Inventario</h3><span id='inv-conn-info'></span></div>" +
        "<p class='muted'>Inventario de prueba.</p>" +
        "<div class='mando-filtros'><select id='inv-filtro-estado'>" +
          "<option value='todos'>Todos</option><option value='bajo'>Bajo mínimo</option>" +
          "<option value='agotado'>Agotados</option><option value='normal'>Normales</option>" +
        "</select></div>" +
        "<div id='inv-detalle' class='lista'></div><div id='lista-stock-bajo'></div>" +
      "</section></body></html>",
    { url: "https://battlecruiser-inventory-grouped.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  window.tienePermiso = () => true;
  window.poblarSelectAlmacenes = () => {};
  window.escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  window.numberFmt = (value, options) => new Intl.NumberFormat("es-ES", {
    useGrouping: true, maximumFractionDigits: 2, ...(options || {})
  }).format(value);
  window.money = (value) => new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value);
  window.client = {
    rpc: async (name) => {
      if (name === "inventario_enriquecido") return { data: rows.map((row) => ({ ...row })), error: null };
      if (name === "inventario_mixto_enriquecido") return { data: [], error: null };
      throw new Error("RPC inesperado en prueba: " + name);
    }
  };
  window.eval(m53Source);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  assert.ok(await waitFor(() => typeof window.refrescarInventario === "function"), "M53 debe instalar su API");
  await window.refrescarInventario();
  assert.ok(await waitFor(() => window.document.querySelectorAll("#inv-detalle [data-inv-producto]").length === 3),
    "deben mostrarse tres productos agrupados");
  t.after(() => window.close());
  return { window, dom };
}

test("Inventario: un solo producto agrupa almacenes, cantidades, mínimos y estados", async (t) => {
  const { window } = await boot(t);
  const cards = Array.from(window.document.querySelectorAll("#inv-detalle [data-inv-producto]"));
  const bizcocho = cards.filter((card) => card.getAttribute("data-inv-producto") === "biz");
  assert.equal(bizcocho.length, 1, "Bizcocho aparece una sola vez aunque tenga existencias en dos almacenes");
  assert.match(bizcocho[0].textContent, /Almacén Casa/);
  assert.match(bizcocho[0].textContent, /La Cueva/);
  assert.match(bizcocho[0].textContent, /70 u/);
  assert.match(bizcocho[0].textContent, /200 u/);
  assert.match(bizcocho[0].textContent, /mín 5/);
  assert.match(bizcocho[0].textContent, /mín 10/);
  assert.match(bizcocho[0].textContent, /Disponible/);
  assert.doesNotMatch(bizcocho[0].textContent, /123456|345678|469135|Inversión|Valor inventario/i);
  assert.equal(window.document.querySelectorAll("#inv-detalle [data-inv-producto]").length, 3);
  assert.deepEqual(window._invFilas.find((row) => row.producto_id === "biz").almacenes.map((x) => x.almacen),
    ["Almacén Casa", "La Cueva"]);
});

test("Inventario: contadores no duplican productos y elimina el indicador Unidades", async (t) => {
  const { window } = await boot(t);
  const metrics = window.document.getElementById("inv-resumen").textContent;
  assert.match(metrics, /Valor inventario/);
  assert.match(metrics, /Productos\s*3/);
  assert.match(metrics, /Bajo mínimo\s*1/);
  assert.match(metrics, /Agotados\s*1/);
  assert.doesNotMatch(metrics, /Unidades/);
});

test("Inventario: cuadros y filas alternan y conservan la preferencia", async (t) => {
  const { window } = await boot(t);
  const list = window.document.getElementById("inv-detalle");
  const rowsButton = window.document.querySelector('[data-m53-view="list"]');
  const gridButton = window.document.querySelector('[data-m53-view="grid"]');
  assert.ok(rowsButton && gridButton, "deben existir ambos controles de vista");
  rowsButton.click();
  assert.equal(list.className, "bc-m53-list");
  assert.equal(window.localStorage.getItem("bc_inventario_vista"), "list");
  gridButton.click();
  assert.equal(list.className, "bc-m53-grid");
  assert.equal(window.localStorage.getItem("bc_inventario_vista"), "grid");
});

test("Formato numérico global y modal de producto no exponen valor de inversión", () => {
  assert.match(coreSource, /function numberFmt\(value,options\)/);
  assert.match(coreSource, /part\.type===\"group\"\?\"\\u202f\"/);
  assert.match(coreSource, /function money\(n\)/);
  assert.match(detailSource, /warehouse\.minimo/);
  assert.match(detailSource, /warehouse\.cantidad/);
  assert.doesNotMatch(detailSource, /moneySafe|Costo promedio|Valor del inventario|valor_inventario/);
});
