"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const PURCHASE = fs.readFileSync(path.join(__dirname, "..", "public/js/compra-multiple.js"), "utf8");

function createPurchaseWindow(t) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body><main class='main-content'></main></body></html>",
    { url: "https://battlecruiser.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const w = dom.window;
  const rpcCalls = [];
  let readCalls = 0;

  Object.defineProperty(w.navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(w.crypto, "randomUUID", { configurable: true, value: () => "purchase-test-idempotency" });
  w.confirm = () => true;
  w._cache = {
    almacenes: [{ id: "warehouse-1", nombre: "Almacén principal", activo: true }],
    productos: [{ id: "product-1", nombre: "Arroz", activo: true }]
  };
  w.productosOperativos = (rows) => rows;
  w.cargarAsociacionesProducto = async () => [];
  w.client = {
    rpc: async (name, payload) => {
      rpcCalls.push({ name, payload });
      return { data: { ok: true }, error: null };
    },
    from: () => {
      readCalls++;
      throw new Error("La pantalla de nueva compra no debe leer el historial.");
    }
  };

  w.eval(PURCHASE);
  if (!w.__BC_COMPRAS_ACTIVAR && w.document.readyState === "loading") {
    w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  }
  t.after(() => w.close());
  return { w, rpcCalls, get readCalls() { return readCalls; } };
}

const tick = (w) => new Promise((resolve) => w.setTimeout(resolve, 0));

test("modal de Nueva Compra queda enfocado en registrar y no muestra historial", async (t) => {
  const { w } = createPurchaseWindow(t);
  await w.__BC_COMPRAS_ACTIVAR();

  const panel = w.document.getElementById("tab-compras");
  assert.ok(panel);
  assert.match(panel.textContent, /Agregar productos/);
  assert.doesNotMatch(panel.textContent, /Últimas compras|Historial|Compra de proveedor|Proveedor → BattleCruiser/);
  assert.equal(w.document.getElementById("compra-multiple-historial"), null);
  assert.ok(w.document.getElementById("compra-multiple-almacen"));
  assert.ok(w.document.getElementById("compra-multiple-proveedor"));
  assert.ok(w.document.getElementById("compra-multiple-fecha"));
  assert.ok(w.document.getElementById("compra-multiple-producto"));
  assert.ok(w.document.getElementById("compra-multiple-presentacion"));
  assert.ok(w.document.getElementById("compra-multiple-cantidad"));
  assert.ok(w.document.getElementById("compra-multiple-costo"));
  assert.ok(w.document.getElementById("compra-multiple-confirmar"));

  const style = w.document.getElementById("bc-compras-flow-style").textContent;
  assert.match(style, /max-height:calc\(100dvh - 16px\)/);
  assert.match(style, /grid-template-columns/);
  assert.match(style, /position:sticky/);
});

test("confirmar compra conserva el RPC de alta y no consulta compras anteriores", async (t) => {
  const ctx = createPurchaseWindow(t);
  const { w, rpcCalls } = ctx;
  await w.__BC_COMPRAS_ACTIVAR();

  const d = w.document;
  d.getElementById("compra-multiple-almacen").value = "warehouse-1";
  const product = d.getElementById("compra-multiple-producto");
  product.value = "product-1";
  product.dispatchEvent(new w.Event("change"));
  await tick(w);

  d.getElementById("compra-multiple-cantidad").value = "12";
  d.getElementById("compra-multiple-costo").value = "3.5";
  d.getElementById("compra-multiple-add").click();
  assert.match(d.getElementById("compra-multiple-n-lineas").textContent, /1 línea/);

  d.getElementById("compra-multiple-confirmar").click();
  await tick(w);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "registrar_compra_multiple");
  assert.equal(rpcCalls[0].payload.p_almacen_id, "warehouse-1");
  assert.equal(rpcCalls[0].payload.p_lineas.length, 1);
  assert.equal(rpcCalls[0].payload.p_lineas[0].producto_id, "product-1");
  assert.equal(rpcCalls[0].payload.p_lineas[0].cantidad, 12);
  assert.equal(rpcCalls[0].payload.p_lineas[0].costo_unitario, 3.5);
  assert.equal(ctx.readCalls, 0);
  assert.match(d.getElementById("compra-multiple-msg").textContent, /Compra registrada/);
});

test("una compra con varias líneas nunca se fragmenta si falla el RPC de lista", async (t) => {
  const ctx = createPurchaseWindow(t);
  const { w, rpcCalls } = ctx;
  await w.__BC_COMPRAS_ACTIVAR();
  const d = w.document;
  d.getElementById("compra-multiple-almacen").value = "warehouse-1";
  const product = d.getElementById("compra-multiple-producto");
  product.value = "product-1";
  product.dispatchEvent(new w.Event("change"));
  await tick(w);
  d.getElementById("compra-multiple-cantidad").value = "12";
  d.getElementById("compra-multiple-costo").value = "3.5";
  d.getElementById("compra-multiple-add").click();
  w.client.rpc = async (name, payload) => {
    rpcCalls.push({ name, payload });
    return { data: null, error: { code: "42883", message: "registrar_compra_multiple does not exist" } };
  };
  d.getElementById("compra-multiple-confirmar").click();
  await tick(w);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "registrar_compra_multiple");
  assert.match(d.getElementById("compra-multiple-msg").textContent, /No está disponible el registro de compras por lista/);
  assert.doesNotMatch(PURCHASE, /confirmarLineaALinea|ejecutarOperacion\('compra',/);
});
