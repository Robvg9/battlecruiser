"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const index = read("public/index.html");
const m75 = read("public/js/m75-productos-ui-compacto.js");
const catalogos = read("public/js/catalogos.js");
const m26 = read("public/js/m26-ui-integridad.js");
const roles = read("public/js/roles-en-usuarios.js");

test("Administration has one compact home for roles, categories and units", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(index);
  try {
    const d = dom.window.document, admin = d.getElementById("tab-config");
    assert.ok(admin && admin.querySelector(".bc-admin-grid"));
    assert.ok(admin.querySelector(".bc-admin-roles"));
    assert.ok(admin.querySelector(".bc-admin-catalogs"));
    for (const id of ["form-nuevo-rol","form-categoria","lista-categorias","form-unidad","lista-unidades"]) {
      assert.equal(d.querySelectorAll("#" + id).length, 1, id + " must remain unique");
    }
    for (const id of ["form-categoria","lista-categorias","form-unidad","lista-unidades"]) {
      assert.ok(admin.querySelector(".bc-admin-subcard #" + id));
    }
  } finally { dom.window.close(); }
});

test("presentations and role permissions have one Administration entry, not duplicate management actions", () => {
  assert.match(m75, /bc-product-presentations-entry/);
  assert.match(m75, /Administrar presentaciones comerciales/);
  assert.match(catalogos, /Presentaciones comerciales/);
  assert.doesNotMatch(catalogos, /prod-nom-categorias-slot|prod-nom-unidades-slot/);
  assert.doesNotMatch(m26, /'lista-categorias':\s*'prod-nom-|\s*'lista-unidades':\s*'prod-nom-/);
  assert.match(m26, /'lista-presentaciones-catalogo':\s*'prod-nom-presentaciones-slot'/);
  assert.match(m26, /'pp-lista-asociaciones':\s*'prod-nom-presentaciones-slot'/);
  assert.doesNotMatch(roles, /ud-btn-roles|rolesBtn = document\.createElement/);
  assert.match(roles, /bc-btn-config-roles/);
  assert.match(roles, /max-height:min\\(84vh,680px\\)/);
  assert.match(roles, /rol-permisos-panel\\{max-height:240px;overflow:auto/);
});

test("Administration module styles are compact and catalog lists are bounded", () => {
  assert.match(m75, /#tab-config \.bc-admin-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(m75, /max-height:132px;overflow:auto/);
  assert.match(index, /bc-nav-group-label">Sistema<\/span>/);
});
