"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const index = read("public/index.html");
const m75 = read("public/js/m75-productos-ui-compacto.js");
const catalogos = read("public/js/catalogos.js");
const m26 = read("public/js/m26-ui-integridad.js");
const roles = read("public/js/roles-en-usuarios.js");
const products = read("public/js/productos.js");
const productPolish = read("public/js/hotfix-pulido-20260903.js");

test("Administration exposes only compact category management", () => {
  const dom = new JSDOM(index);
  try {
    const d = dom.window.document;
    const admin = d.getElementById("tab-config");
    assert.ok(admin);
    assert.ok(admin.querySelector(".bc-admin-categories #bc-categories-open"));
    assert.equal(admin.querySelector(".bc-admin-roles"), null);
    assert.equal(admin.querySelector(".bc-admin-heading"), null);
    for (const id of ["form-nuevo-rol", "lista-roles", "msg-roles"]) {
      assert.equal(d.getElementById(id), null, id + " must not be rendered in Administration");
    }
    for (const id of ["form-categoria", "lista-categorias", "msg-config"]) {
      assert.equal(d.querySelectorAll("#" + id).length, 1, id + " must remain unique");
    }
    assert.ok(admin.querySelector("#bc-modal-categorias #form-categoria"));
    assert.ok(admin.querySelector("#bc-modal-categorias #lista-categorias"));
    assert.ok(admin.querySelector("#bc-modal-categorias[role=dialog]"));
    assert.doesNotMatch(admin.innerHTML, /Roles y permisos|Permisos inteligentes|Presentaciones comerciales/);
  } finally { dom.window.close(); }
});

test("product form requires a real category and retail defaults to base unit times one", () => {
  const dom = new JSDOM(index);
  try {
    const d = dom.window.document;
    const category = d.getElementById("prod-categoria");
    assert.ok(category && category.tagName === "SELECT" && category.required);
    assert.equal(d.getElementById("prod-unidad").getAttribute("list"), null);
    assert.equal(d.getElementById("prod-inventario-mixto").type, "checkbox");
    for (const id of ["prod-pres-min", "prod-pres-may", "prod-pres-may-habilitado", "bc-pres-normal-name", "bc-pres-normal-factor"]) {
      assert.equal(d.getElementById(id), null, id + " is a retired retail/legacy input");
    }
    assert.match(m26, /prod-inventario-mixto-toggle input\{appearance:auto;width:18px!important;height:18px!important;min-width:18px!important;min-height:18px!important;max-width:18px!important;max-height:18px!important/);
    assert.match(m26, /flex:0 0 18px!important/);
    assert.match(products, /fillSelect\(document\.getElementById\("prod-categoria"\), categorias, "id", \(c\) => c\.nombre, true\)/);
    assert.match(products, /window\.refrescarSelectorCategoriasProducto=refrescarSelectorCategoriasProducto/);
    assert.doesNotMatch(productPolish, /<p class="bc-pres-optional-note"|Venta minorista:|<strong>unidad minorista automática<\/strong>/,
      "la venta al detalle usa la unidad base × 1 sin mostrar un control o nota comercial minorista");
    assert.match(productPolish, /if\(!isWholesale\).*?factor:1/s,
      "minorista remains an internal base-unit calculation, not a configurable field");
  } finally { dom.window.close(); }
});

test("category deletion remains guarded when products reference the category", () => {
  assert.match(catalogos, /catalogo-delete-btn/);
  assert.match(catalogos, /No se puede eliminar: hay productos asociados/);
  assert.match(catalogos, /from\("productos"\)/);
  assert.match(catalogos, /from\("categorias"\)\.delete\(\)\.eq\("id", row\.id\)/);
});

test("the obsolete smart-permissions panel is not initialized", () => {
  const boot = roles.slice(roles.indexOf("function boot()"), roles.indexOf("window.bcOpenRolesModal"));
  assert.ok(boot.length > 0, "roles module boot must be present");
  assert.doesNotMatch(boot, /ensureRolesHelpModal\(\)|relocateSmartPermissionsHelp\(\)|ensureSmartPermissionsObserver\(\)/);
  assert.doesNotMatch(roles, /Solo lectura|Operación|Inventario|Administrador operativo/);
});

test("M75 gives Administration a single full-width category control", () => {
  assert.ok(m75.includes("#tab-config .bc-admin-grid{display:block!important;width:100%!important;margin:0!important}"));
  assert.ok(m75.includes("#tab-config .bc-admin-card.bc-admin-categories{display:flex!important;flex-direction:row!important"));
  assert.ok(m75.includes("#tab-config .bc-admin-categories #bc-categories-open{width:auto!important"));
});
