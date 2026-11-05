"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "ventas.js"), "utf8");
const start = source.indexOf("let ventaLineas = [];");
const end = source.indexOf("function renderCatalogoCategorias()", start);
assert.ok(start >= 0 && end > start, "must locate the production sales stock/cart helpers");
const productionHelpers = source.slice(start, end);

function harness(stock = 100) {
  const messages = {};
  const attrs = {};
  const info = { textContent: "", className: "msg" };
  const quantity = {
    step: "", min: "", placeholder: "",
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    getAttribute(name) { return attrs[name] ?? null; },
  };
  const elements = {
    "venta-stock-disponible": info,
    "venta-cantidad": quantity,
    "venta-almacen": { value: "wh-1" },
    "venta-producto": { value: "beer-1" },
  };
  const sandbox = {
    _cache: { stock: [{ producto_id: "beer-1", almacen_id: "wh-1", cantidad: stock }] },
    ajustePendiente: () => ({ ajuste: 0, noCalculable: false }),
    document: { getElementById: (id) => elements[id] || null },
    setMsg: (id, message, ok) => { messages[id] = { message, ok }; },
    money: (value) => Number(value).toFixed(2),
    renderVentaLineas: () => {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    productionHelpers +
    "\nventaAlmacenesTipo['wh-1']='mayorista';" +
    "\nventaProductosPrecios['beer-1']={" +
      "nombre:'Cerveza'," +
      "precio_normal:3.5," +
      "precio_mayorista:75," +
      "formato_minorista:{presentacion_id:'unit-1',factor:1,nombre:'Unidad'}," +
      "formato_mayorista:{presentacion_id:'case-24',factor:24,nombre:'Caja'}" +
    "};",
    sandbox
  );
  return { sandbox, messages, info, quantity, attrs, elements };
}

test("POS wholesale: adding one case creates a 24-base-unit reservation and charges one case price", () => {
  const h = harness(100);
  const result = vm.runInContext(
    "agregarLineaVenta('beer-1',1,'wh-1');" +
    "({ line: ventaLineas[0], reserved: cantidadEnCarrito('beer-1',-1) })",
    h.sandbox
  );
  assert.equal(result.line.cantidad, 1);
  assert.equal(result.line.cantidad_base, 24);
  assert.equal(result.line.factor_presentacion, 24);
  assert.equal(result.line.presentacion_id, "case-24");
  assert.equal(result.line.presentacion_nombre, "Caja");
  assert.equal(result.line.subtotal, 75);
  assert.equal(result.reserved, 24);
});

test("POS wholesale: the stock ceiling counts base units, not the visible case count", () => {
  const h = harness(100);
  const result = vm.runInContext(
    "agregarLineaVenta('beer-1',4,'wh-1');" +
    "const accepted = agregarLineaVenta('beer-1',1,'wh-1');" +
    "({ accepted, reserved: cantidadEnCarrito('beer-1',-1), lineCount: ventaLineas.length })",
    h.sandbox
  );
  assert.equal(result.accepted, false, "a fifth case would require 120 base units");
  assert.equal(result.reserved, 96);
  assert.equal(result.lineCount, 1);
  assert.match(h.messages["msg-venta-linea"].message, /disponible: 0\.00 Caja/);
});

test("sale RPC payload carries the presentation count and converted base-unit quantity", () => {
  const h = harness(100);
  const payload = vm.runInContext(
    "agregarLineaVenta('beer-1',1,'wh-1'); payloadLineaVenta(ventaLineas[0])",
    h.sandbox
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(payload)),
    {
      producto_id: "beer-1",
      cantidad: 24,
      presentacion_id: "case-24",
      cantidad_presentacion: 1,
      tipo_precio: "mayorista",
    }
  );
});

test("POS available stock shows whole cases and their equivalent base units", () => {
  const h = harness(100);
  vm.runInContext(
    "agregarLineaVenta('beer-1',1,'wh-1'); actualizarStockDisponibleUI();",
    h.sandbox
  );
  assert.equal(h.attrs.max, "3");
  assert.equal(h.quantity.step, "1");
  assert.match(h.info.textContent, /3\.00 Caja/);
  assert.match(h.info.textContent, /76\.00 unidades base/);
});
