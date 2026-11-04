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
    for (const id of ["form-nuevo-rol","form-categoria","lista-categorias","form-presentacion-nueva","lista-presentaciones-catalogo","pp-producto-select","pp-lista-asociaciones","form-pp-nueva"]) {
      assert.equal(d.querySelectorAll("#" + id).length, 1, id + " must remain unique");
    }
    assert.ok(admin.querySelector(".bc-admin-subcard #form-categoria"));
    assert.equal(d.querySelectorAll("#form-unidad,#lista-unidades").length, 0, "units must not be a second catalogue");
    assert.ok(admin.querySelector(".presentaciones-panel"));
    assert.equal(d.querySelectorAll("#tab-productos .presentaciones-panel").length, 0);
  } finally { dom.window.close(); }
});

test("presentations and role permissions have one Administration entry, not duplicate management actions", () => {
  assert.match(m75, /function moveNomenclatureToAdmin\(\)/);
  assert.doesNotMatch(m75, /Administrar presentaciones comerciales/);
  assert.match(catalogos, /Presentaciones comerciales/);
  assert.doesNotMatch(catalogos, /prod-nom-categorias-slot|prod-nom-unidades-slot/);
  assert.doesNotMatch(m26, /'lista-categorias':\s*'prod-nom-|\s*'lista-unidades':\s*'prod-nom-/);
  assert.doesNotMatch(m26, /lista-presentaciones-catalogo.*prod-nom-/);
  assert.doesNotMatch(m26, /pp-lista-asociaciones.*prod-nom-/);
  assert.ok(!roles.includes("rolesBtn = document.createElement"));
  assert.match(roles, /bc-btn-config-roles/);
  assert.ok(roles.includes("max-height:min(84vh,680px)"));
  assert.ok(roles.includes("rol-permisos-panel{max-height:240px;overflow:auto"));
});

test("Administration module styles are compact and catalog lists are bounded", () => {
  assert.ok(m75.includes("#tab-config .bc-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))"));
  assert.ok(m75.includes("max-height:132px;overflow:auto"));
  assert.ok(index.includes('bc-nav-group-label">Sistema</span>'));
});
