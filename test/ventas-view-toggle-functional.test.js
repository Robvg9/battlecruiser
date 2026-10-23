"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "ventas.js"),
  "utf8"
);

function boot(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<section id='tab-ventas'>" +
        "<button type='button' id='venta-vista-btn-buscador'>Buscador</button>" +
        "<button type='button' id='venta-vista-btn-catalogo'>Catálogo</button>" +
        "<div id='venta-modo-buscador'></div>" +
        "<div id='venta-modo-catalogo' class='hidden'></div>" +
      "</section></body></html>",
    { url: "https://battlecruiser-sales-view.test/", runScripts: "dangerously" }
  );
  const { window } = dom;
  const { document } = window;

  // The production module has many independent safeInit blocks. Run only the
  // actual view-toggle initializer for this focused UI contract.
  window.safeInit = (id, fn) => {
    if (id === "venta-vista-toggle") fn();
  };

  const script = document.createElement("script");
  script.textContent = SOURCE;
  document.body.appendChild(script);

  let catalogRenders = 0;
  window.renderCatalogoGrid = () => { catalogRenders += 1; };

  t.after(() => window.close());
  return { window, document, getCatalogRenders: () => catalogRenders };
}

test("Paso 4 Ventas: Catálogo activa su panel y expone aria-pressed verdadero", (t) => {
  const { document, getCatalogRenders } = boot(t);
  document.getElementById("venta-vista-btn-catalogo").click();

  assert.equal(document.getElementById("venta-modo-catalogo").classList.contains("hidden"), false);
  assert.equal(document.getElementById("venta-modo-buscador").classList.contains("hidden"), true);
  assert.equal(document.getElementById("venta-vista-btn-catalogo").getAttribute("aria-pressed"), "true");
  assert.equal(document.getElementById("venta-vista-btn-buscador").getAttribute("aria-pressed"), "false");
  assert.equal(document.getElementById("venta-vista-btn-catalogo").classList.contains("activo"), true);
  assert.equal(getCatalogRenders(), 1, "al entrar al catálogo se actualizan las tarjetas/stock");
});

test("Paso 4 Ventas: Buscador restaura panel, exclusividad y aria-pressed", (t) => {
  const { document, getCatalogRenders } = boot(t);
  const bus = document.getElementById("venta-vista-btn-buscador");
  const cat = document.getElementById("venta-vista-btn-catalogo");

  cat.click();
  bus.click();

  assert.equal(document.getElementById("venta-modo-buscador").classList.contains("hidden"), false);
  assert.equal(document.getElementById("venta-modo-catalogo").classList.contains("hidden"), true);
  assert.equal(bus.getAttribute("aria-pressed"), "true");
  assert.equal(cat.getAttribute("aria-pressed"), "false");
  assert.equal(bus.classList.contains("activo"), true);
  assert.equal(cat.classList.contains("activo"), false);
  assert.equal(getCatalogRenders(), 1, "volver al Buscador no necesita renderizar el catálogo");
});

test("Paso 4 Ventas: alternar repetidamente no deja ambos paneles visibles", (t) => {
  const { document } = boot(t);
  const bus = document.getElementById("venta-vista-btn-buscador");
  const cat = document.getElementById("venta-vista-btn-catalogo");
  for (let i = 0; i < 4; i++) {
    cat.click();
    assert.equal(document.getElementById("venta-modo-buscador").classList.contains("hidden"), true);
    assert.equal(document.getElementById("venta-modo-catalogo").classList.contains("hidden"), false);
    bus.click();
    assert.equal(document.getElementById("venta-modo-buscador").classList.contains("hidden"), false);
    assert.equal(document.getElementById("venta-modo-catalogo").classList.contains("hidden"), true);
  }
  assert.equal(bus.getAttribute("aria-pressed"), "true");
  assert.equal(cat.getAttribute("aria-pressed"), "false");
});
