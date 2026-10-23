"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m26-10-categorias-ventas.js"),
  "utf8"
);

const CATEGORIES = [
  { id: "cat-drinks", nombre: "Bebidas", activo: true },
  { id: "cat-sweets", nombre: "Confituras", activo: true },
  { id: "cat-disabled", nombre: "Oculta", activo: false }
];
const PRODUCTS = [
  { id: "p-water", nombre: "Agua", categoria_id: "cat-drinks" },
  { id: "p-juice", nombre: "Jugo", categoria_id: "cat-drinks" },
  { id: "p-jam", nombre: "Mermelada", categoria_id: "cat-sweets" }
];

async function waitFor(predicate, timeout = 2200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  return Boolean(predicate());
}

function visibleProductIds(window) {
  return Array.from(window.document.querySelectorAll("#catalogo-grid [data-producto-id]"))
    .map((node) => node.getAttribute("data-producto-id"));
}

function clickCategory(window, id) {
  const button = Array.from(window.document.querySelectorAll("#catalogo-categorias .catalogo-chip"))
    .find((node) => node.dataset.categoriaId === id);
  assert.ok(button, "debe existir el chip de categoría " + (id || "Todos"));
  button.click();
}

test("Paso 4 Ventas: las categorías filtran productos y Todos restablece la lista", async (t) => {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
    "<nav id='tabs'><button type='button' class='tab-btn' data-tab='ventas'>Ventas</button></nav>" +
    "<section id='tab-ventas' class='tab-panel'>" +
      "<div id='catalogo-categorias'></div>" +
      "<div id='catalogo-grid'></div>" +
    "</section></body></html>",
    { url: "https://battlecruiser-sales-categories.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  window.cargarCategorias = async () => CATEGORIES.map((row) => ({ ...row }));
  window.renderCatalogoGrid = () => {
    const categoryId = String(window.catalogoCategoriaActiva || "");
    const rows = categoryId ? PRODUCTS.filter((p) => p.categoria_id === categoryId) : PRODUCTS;
    const grid = window.document.getElementById("catalogo-grid");
    grid.innerHTML = "";
    rows.forEach((p) => {
      const card = window.document.createElement("article");
      card.className = "catalogo-card";
      card.setAttribute("data-producto-id", p.id);
      card.textContent = p.nombre;
      grid.appendChild(card);
    });
  };

  window.eval(SOURCE);
  t.after(() => window.close());

  assert.ok(await waitFor(() => window.document.getElementById("tabs").dataset.bcM2610stable === "1"),
    "el módulo debe instalar el listener de navegación");
  window.document.querySelector("#tabs [data-tab='ventas']").click();
  assert.ok(await waitFor(() => window.document.querySelectorAll("#catalogo-categorias .catalogo-chip").length === 3),
    "deben mostrarse Todos y las dos categorías activas");
  assert.ok(await waitFor(() => visibleProductIds(window).length === 3),
    "Todos debe mostrar los tres productos fixture");

  assert.equal(window.document.querySelectorAll("#catalogo-categorias .catalogo-chip[data-categoria-id='cat-disabled']").length, 0,
    "categorías inactivas no se ofrecen al usuario");
  clickCategory(window, "cat-drinks");
  assert.ok(await waitFor(() => visibleProductIds(window).length === 2),
    "Bebidas debe filtrar el catálogo");
  assert.deepEqual(visibleProductIds(window), ["p-water", "p-juice"]);
  assert.ok(window.document.querySelector("#catalogo-categorias .catalogo-chip[data-categoria-id='cat-drinks']").classList.contains("activo"),
    "el chip seleccionado debe reflejar estado activo");

  clickCategory(window, "cat-sweets");
  assert.ok(await waitFor(() => visibleProductIds(window).length === 1),
    "Confituras debe filtrar el catálogo");
  assert.deepEqual(visibleProductIds(window), ["p-jam"]);

  clickCategory(window, "");
  assert.ok(await waitFor(() => visibleProductIds(window).length === 3),
    "Todos debe restaurar el catálogo completo");
  assert.deepEqual(visibleProductIds(window), ["p-water", "p-juice", "p-jam"]);
  assert.ok(window.document.querySelector("#catalogo-categorias .catalogo-chip[data-categoria-id='']").classList.contains("activo"),
    "Todos debe quedar marcado activo");
});
