"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const fixtureProducts = [
  { id: "p1", nombre: "Cerveza Bucanero" },
  { id: "p2", nombre: "Cerveza Mayabe" },
  { id: "p3", nombre: "Masareal" }
];
const source = fs.readFileSync(path.join(__dirname, "../public/js/ventas.js"), "utf8").replace(
  'let ventaProductosLista = []; // lista completa de productos, para el buscador',
  'let ventaProductosLista = window.__bcFixtureProductosLista = ' +
    JSON.stringify(fixtureProducts) +
    '; // lista completa de productos, para el buscador'
);

test("Ventas: product search filters by name, shows empty state, selects result and clears safely", () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <input id="venta-producto-buscar" type="search">
    <select id="venta-producto"><option value="">Elegí un producto…</option></select>
    <div id="venta-producto-resultados" class="hidden"></div>
  </body></html>`, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  const document = window.document;
  let stockRefreshes = 0;

  try {
    window.safeInit = (id, fn) => { if (document.getElementById(id)) fn(); };
    window.fillSelect = (select, rows, valueKey, labelFn, keepFirst) => {
      const first = keepFirst ? select.querySelector("option") : null;
      select.innerHTML = "";
      if (first) select.appendChild(first);
      for (const row of rows) {
        const option = document.createElement("option");
        option.value = row[valueKey];
        option.textContent = labelFn(row);
        select.appendChild(option);
      }
    };
    window.actualizarStockDisponibleUI = () => { stockRefreshes++; };
    window.eval(source);
    const search = document.getElementById("venta-producto-buscar");
    const select = document.getElementById("venta-producto");
    const results = document.getElementById("venta-producto-resultados");
    const initialProducts = window.__bcFixtureProductosLista.map(p => p.id).join(',');

    search.value = "bUcAnErO";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.equal(results.classList.contains("hidden"), false, "matching query opens result list");
    assert.deepEqual(
      Array.from(results.querySelectorAll(".venta-buscar-resultado-item")).map(node => node.textContent),
      ["Cerveza Bucanero"],
      "search is case-insensitive and shows only matching products"
    );
    assert.deepEqual(
      Array.from(select.options).map(option => option.textContent),
      ["Elegí un producto…", "Cerveza Bucanero"],
      "the underlying select remains filtered for accessibility/compatibility"
    );

    results.querySelector(".venta-buscar-resultado-item").click();
    assert.equal(select.value, "p1", "choosing a result updates the real product select");
    assert.equal(search.value, "Cerveza Bucanero", "selection synchronizes the search input");
    assert.equal(results.classList.contains("hidden"), true, "selection closes the result list");
    assert.equal(stockRefreshes, 1, "selection refreshes available stock UI");

    search.value = "no-existe-rwht";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.equal(results.classList.contains("hidden"), false);
    assert.match(results.textContent, /Sin coincidencias/i, "nonmatching search has a visible empty state");
    assert.equal(select.options.length, 1, "no-match filter keeps only placeholder option");

    search.value = "";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.equal(results.classList.contains("hidden"), true, "clearing the query closes results");
    assert.deepEqual(
      Array.from(select.options).map(option => option.value),
      ["", "p1", "p2", "p3"],
      "clearing restores the entire product list"
    );
    assert.equal(window.__bcFixtureProductosLista.map(p => p.id).join(','), initialProducts,
      "search and restore must not mutate the base product array");
  } finally {
    dom.window.close();
  }
});
