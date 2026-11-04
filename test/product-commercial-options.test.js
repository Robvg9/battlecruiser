"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const M26_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m26-ui-integridad.js"),
  "utf8"
);

function fixture() {
  const html = [
    "<!doctype html><html><head></head><body>",
    "<section id='tab-productos' class='tab-panel'>",
    "<form id='form-producto'>",
    "<input type='hidden' id='prod-editando-id' value=''>",
    "<input id='prod-nombre' value=''>",
    "<select id='prod-categoria'><option value=''>Sin categoría</option><option value='cat-1'>Bebidas</option></select>",
    "<input id='prod-unidad' value='unidad'>",
    "<datalist id='unidades-comunes'><option value='unidad'></option></datalist>",
    "<input id='prod-precio-normal' type='number' value='10'>",
    "<input id='prod-precio-mayorista' type='number' value=''>",
    "<div class='prod-imagen-campo'><label class='prod-imagen-label'>Imagen</label><input id='prod-imagen-input' type='file'></div>",
    "<fieldset id='prod-presentaciones-config'><select id='prod-pres-min'><option value=''>Selecciona</option></select><select id='prod-pres-may-habilitado'><option value='no'>No</option><option value='si'>Sí</option></select></fieldset>",
    "<button id='prod-cancelar-edicion' type='button'>Cancelar edición</button>",
    "<button id='prod-submit-btn' type='submit'>Guardar producto</button>",
    "</form>",
    "<input id='productos-buscar'><div id='lista-productos'></div>",
    "</section></body></html>"
  ].join("");

  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://battlecruiser.test/",
    pretendToBeVisual: true
  });
  const window = dom.window;
  const document = window.document;
  window.eval(M26_SOURCE);
  assert.equal(window.__BCM26_ensureCommercialOptions(), true);
  return { dom, window, document };
}

test("one master button contains category, optional wholesale price and both approved presentation pairs", (t) => {
  const c = fixture();
  t.after(() => c.dom.window.close());
  const d = c.document;

  const toggle = d.getElementById("bc-product-commercial-toggle");
  const panel = d.getElementById("bc-product-commercial-panel");
  const basic = d.querySelector(".bc-product-form-fields");

  assert.ok(toggle, "the master commercial-options button must exist");
  assert.ok(panel, "the commercial options panel must exist");
  assert.equal(d.querySelectorAll("#bc-product-commercial-toggle").length, 1);
  assert.equal(d.querySelectorAll("#bc-product-commercial-panel").length, 1);
  assert.ok(panel.contains(d.getElementById("prod-categoria")));
  assert.ok(panel.contains(d.getElementById("prod-precio-mayorista")));
  assert.ok(!basic.contains(d.getElementById("prod-categoria")));
  assert.ok(!basic.contains(d.getElementById("prod-precio-mayorista")));
  assert.equal(d.getElementById("prod-precio-mayorista").required, false);
  assert.equal(d.getElementById("prod-precio-mayorista").placeholder, "Precio mayorista (opcional)");

  assert.equal(d.getElementById("prod-presentaciones-config"), null,
    "the old mandatory presentation selector block must be removed");
  assert.equal(d.querySelectorAll("#prod-pres-min,#prod-pres-may,#prod-pres-may-habilitado,#prod-pres-may-factor").length, 0,
    "legacy presentation selects and the old wholesale toggle must not survive");

  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(panel.hidden, true);
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(panel.hidden, false);
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(panel.hidden, true);
});

test("a new product starts collapsed; editing an existing configured product opens the same panel", (t) => {
  const c = fixture();
  t.after(() => c.dom.window.close());
  const d = c.document;
  const w = c.window;
  const panel = d.getElementById("bc-product-commercial-panel");
  const toggle = d.getElementById("bc-product-commercial-toggle");

  w.__BCM26_openProductModal();
  assert.equal(d.getElementById("bc-product-modal").classList.contains("hidden"), false);
  assert.equal(panel.hidden, true, "new products start with optional settings collapsed");

  d.getElementById("prod-editando-id").value = "product-existing";
  d.getElementById("prod-categoria").value = "cat-1";
  d.getElementById("prod-precio-mayorista").value = "8.50";
  w.__BCM26_openProductModal();
  assert.equal(panel.hidden, false, "editing a product with commercial settings opens the panel");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(d.querySelectorAll("#bc-product-commercial-toggle").length, 1,
    "opening and reopening edit must not create duplicate controls");
});
