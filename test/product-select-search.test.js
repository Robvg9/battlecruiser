"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "product-select-search.js"), "utf8");

test("product search filters static and dynamically inserted product selects without replacing option values", async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(`<!doctype html><body>
    <label><span>Producto</span><select id="trf-producto">
      <option value="" disabled selected hidden>Producto</option>
      <option value="juice">Jugo La Estancia</option>
      <option value="water">Agua</option>
    </select></label>
    <label><span>Categoría</span><select id="prod-categoria">
      <option value="">Categoría</option><option value="1">Bebidas</option>
    </select></label>
    <input id="venta-producto-buscar"><select id="venta-producto"><option value="">Producto</option></select>
  </body>`, { runScripts: "outside-only" });
  try {
    dom.window.eval(source);
    const select = dom.window.document.getElementById("trf-producto");
    const input = select.parentElement.querySelector(".bc-product-select-search");
    assert.ok(input, "transfer product picker receives a search field");
    input.value = "jugo";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(select.options[1].hidden, false);
    assert.equal(select.options[2].hidden, true);
    assert.equal(select.options[1].value, "juice", "filtering keeps original option IDs");
    assert.equal(dom.window.document.querySelector("#prod-categoria").parentElement.querySelector(".bc-product-select-search"), null,
      "category selector is not treated as a product selector");
    assert.equal(dom.window.document.querySelector("#venta-producto").closest(".bc-product-select-search-wrap"), null,
      "the existing sale product search is not duplicated");

    const host = dom.window.document.createElement("div");
    host.innerHTML = '<select id="mov-multiple-producto"><option value="">Producto</option><option value="a">Refresco</option></select>';
    dom.window.document.body.appendChild(host);
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    assert.ok(host.querySelector(".bc-product-select-search"), "dynamic operations pickers also receive search");
  } finally {
    dom.window.close();
  }
});

test("product selector module is loaded by the app and cached by the service worker", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "..", "public", "service-worker.js"), "utf8");
  assert.match(app, /\["product-select-search\.js","1\.0"\]/);
  assert.match(sw, /product-select-search\.js\?v=1\.0/);
});
