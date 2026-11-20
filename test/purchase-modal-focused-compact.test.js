"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const PURCHASE = fs.readFileSync(path.join(__dirname, "..", "public/js/compra-multiple.js"), "utf8");
const PICKER = fs.readFileSync(path.join(__dirname, "..", "public/js/product-select-search.js"), "utf8");
const STYLE = fs.readFileSync(path.join(__dirname, "..", "public/style.css"), "utf8");

function createPurchaseWindow(t) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body><main class='main-content'></main></body></html>",
    { url: "https://battlecruiser.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const w = dom.window;
  const rpcCalls = [];
  let readCalls = 0;
  const fromTables = [];

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
    from: (table) => {
      readCalls++;
      fromTables.push(table);
      if (table !== "stock") throw new Error("La pantalla de nueva compra no debe leer el historial de compras.");
      const query = {
        select: () => query,
        eq: () => query,
        in: async () => ({ data: [{ producto_id: "product-1", minimo: 0 }], error: null })
      };
      return query;
    }
  };

  w.eval(PURCHASE);
  if (!w.__BC_COMPRAS_ACTIVAR && w.document.readyState === "loading") {
    w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  }
  t.after(() => w.close());
  return { w, rpcCalls, fromTables, get readCalls() { return readCalls; } };
}

const tick = (w) => new Promise((resolve) => w.setTimeout(resolve, 0));

async function chooseProductAndFill(w, d, productId, quantity, cost) {
  const checkbox = d.querySelector('[data-compra-select="' + productId + '"]');
  assert.ok(checkbox, "product picker contains " + productId);
  checkbox.checked = true;
  checkbox.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.equal(d.getElementById("compra-product-next").disabled, false);
  d.getElementById("compra-product-next").click();

  let row = null;
  for (let attempt = 0; attempt < 12 && !row; attempt++) {
    await tick(w);
    row = d.querySelector('[data-compra-detail="' + productId + '"]');
  }
  assert.ok(row, "step 2 contains the selected product");
  row.querySelector("[data-compra-quantity]").value = String(quantity);
  row.querySelector("[data-compra-cost]").value = String(cost);
  row.querySelector("[data-compra-quantity]").dispatchEvent(new w.Event("input", { bubbles: true }));
  row.querySelector("[data-compra-cost]").dispatchEvent(new w.Event("input", { bubbles: true }));
}


test("modal de Nueva Compra queda enfocado en registrar y no muestra historial", async (t) => {
  const { w } = createPurchaseWindow(t);
  await w.__BC_COMPRAS_ACTIVAR();

  const panel = w.document.getElementById("tab-compras");
  assert.ok(panel);
  assert.match(panel.textContent, /PASO 1 DE 2/);
  assert.doesNotMatch(panel.textContent, /Últimas compras|Historial|Compra de proveedor|Proveedor → BattleCruiser/);
  assert.equal(w.document.getElementById("compra-multiple-historial"), null);
  assert.ok(w.document.getElementById("compra-multiple-almacen"));
  assert.ok(w.document.getElementById("compra-multiple-proveedor"));
  assert.ok(w.document.getElementById("compra-multiple-fecha"));
  assert.ok(w.document.getElementById("compra-product-picker"));
  assert.ok(w.document.getElementById("compra-product-search"));
  assert.ok(w.document.getElementById("compra-product-next"));
  assert.equal(w.document.getElementById("compra-step-details").hidden, true);
  assert.equal(w.document.getElementById("compra-multiple-legacy-editor").hidden, true);
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
  await chooseProductAndFill(w, d, "product-1", 12, 3.5);
  assert.equal(d.getElementById("compra-step-products").hidden, true);
  assert.equal(d.getElementById("compra-step-details").hidden, false);
  assert.match(d.getElementById("compra-multiple-n-lineas").textContent, /1 producto seleccionado/);

  d.getElementById("compra-multiple-confirmar").click();
  await tick(w);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "registrar_compra_multiple");
  assert.equal(rpcCalls[0].payload.p_almacen_id, "warehouse-1");
  assert.equal(rpcCalls[0].payload.p_lineas.length, 1);
  assert.equal(rpcCalls[0].payload.p_lineas[0].producto_id, "product-1");
  assert.equal(rpcCalls[0].payload.p_lineas[0].cantidad, 12);
  assert.equal(rpcCalls[0].payload.p_lineas[0].costo_unitario, 3.5);
  assert.equal(ctx.readCalls, 1);
  assert.deepEqual(ctx.fromTables, ["stock"]);
  assert.match(d.getElementById("compra-multiple-msg").textContent, /Compra registrada/);
  assert.match(d.getElementById("compra-multiple-msg").textContent, /Ahora configura el stock mínimo en Almacén principal para: Arroz/);
});

test("una compra con varias líneas nunca se fragmenta si falla el RPC de lista", async (t) => {
  const ctx = createPurchaseWindow(t);
  const { w, rpcCalls } = ctx;
  await w.__BC_COMPRAS_ACTIVAR();
  const d = w.document;
  d.getElementById("compra-multiple-almacen").value = "warehouse-1";
  await chooseProductAndFill(w, d, "product-1", 12, 3.5);
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


test("Nueva Compra styles the visible searchable-picker buttons, not only hidden native selects", async (t) => {
  const { w } = createPurchaseWindow(t);
  await w.__BC_COMPRAS_ACTIVAR();

  const style = w.document.createElement("style");
  style.textContent = STYLE;
  w.document.head.appendChild(style);
  w.eval(PICKER);
  await tick(w);

  const select = w.document.getElementById("compra-multiple-almacen");
  assert.ok(select, "warehouse selector remains a native accessible select");
  assert.ok(select.classList.contains("bc-product-picker-native-select"), "warehouse selector uses the shared picker");
  const trigger = select.parentElement.querySelector(":scope > .bc-product-picker-trigger");
  assert.ok(trigger, "warehouse destination has a visible searchable picker button");
  assert.ok(trigger.closest("#tab-compras .compra-cabecera"), "warehouse picker remains in the purchase header");
  assert.ok(w.document.getElementById("compra-product-search"), "products use the visible two-step picker");
  assert.ok(w.document.querySelector("#compra-product-picker [data-compra-select]"), "each product is a selectable row");
  assert.equal(w.document.getElementById("compra-multiple-legacy-editor").hidden, true);

  const overrideStart = STYLE.indexOf(
    "#tab-compras .compra-cabecera .bc-product-picker-field > .bc-product-picker-trigger,"
  );
  const overrideEnd = STYLE.indexOf("\n}", overrideStart);
  assert.ok(overrideStart >= 0 && overrideEnd > overrideStart,
    "purchase-specific styles must target the visible custom picker buttons");
  const override = STYLE.slice(overrideStart, overrideEnd);
  assert.ok(override.includes("background: var(--void"));
  assert.ok(override.includes("color: var(--text"));
  assert.ok(override.includes("border: 1px solid"));
  assert.ok(overrideStart > STYLE.indexOf(".inline-form button"),
    "the custom-button override must come after the generic gold inline-form button rule");

  assert.ok(STYLE.includes(
    "#tab-compras .compra-cabecera .bc-product-picker-field > .bc-product-picker-trigger:focus-visible"
  ));
});
