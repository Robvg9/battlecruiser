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
const presentations = read("public/js/presentaciones.js");

test("Administration keeps compact roles and categories and removes the presentations catalogue", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(index);
  try {
    const d = dom.window.document, admin = d.getElementById("tab-config");
    assert.ok(admin && admin.querySelector(".bc-admin-grid"));
    assert.ok(admin.querySelector(".bc-admin-roles"));
    assert.ok(admin.querySelector(".bc-admin-categories"));
    for (const id of ["form-nuevo-rol","form-categoria","lista-categorias","msg-config"]) {
      assert.equal(d.querySelectorAll("#" + id).length, 1, id + " must remain unique");
    }
    for (const id of ["form-presentacion-nueva","lista-presentaciones-catalogo","pp-producto-select","pp-lista-asociaciones","form-pp-nueva"]) {
      assert.equal(d.querySelectorAll("#" + id).length, 0, id + " belongs to the retired Administration catalogue");
    }
    assert.ok(admin.querySelector("#bc-modal-categorias #form-categoria"));
    assert.ok(admin.querySelector("#bc-modal-categorias #lista-categorias"));
    assert.ok(admin.querySelector("#bc-modal-categorias[role=dialog]"));
    assert.ok(admin.querySelector(".bc-admin-roles #bc-btn-config-roles") || admin.querySelector(".bc-admin-roles"));
    assert.ok(admin.querySelector(".bc-admin-categories #bc-categories-open"));
    assert.equal(d.querySelectorAll("#form-unidad,#lista-unidades").length, 0, "units must not be a second catalogue");
    assert.equal(d.querySelectorAll(".presentaciones-panel").length, 0);
    assert.equal(d.querySelectorAll("#prod-pres-min,#prod-pres-may,#prod-pres-may-habilitado,#bc-pres-normal-name,#bc-pres-normal-factor").length, 0);
    assert.equal(d.getElementById("prod-categoria").tagName, "SELECT");
    assert.equal(d.getElementById("prod-categoria").required, true);
    assert.equal(d.getElementById("prod-unidad").getAttribute("list"), null);
  } finally { dom.window.close(); }
});

test("the retired presentations catalogue stays absent and role permissions no longer show the smart-permissions legend", () => {
  assert.match(m75, /function moveNomenclatureToAdmin\(\)/);
  assert.doesNotMatch(m75, /Administrar presentaciones comerciales/);
  assert.match(catalogos, /tabla: "categorias"/);
  assert.doesNotMatch(catalogos, /tabla: "unidades"/);
  assert.doesNotMatch(catalogos, /prod-nom-categorias-slot|prod-nom-unidades-slot/);
  assert.doesNotMatch(m26, /'lista-categorias':\s*'prod-nom-|\s*'lista-unidades':\s*'prod-nom-/);
  assert.doesNotMatch(m26, /lista-presentaciones-catalogo.*prod-nom-/);
  assert.doesNotMatch(m26, /pp-lista-asociaciones.*prod-nom-/);
  assert.ok(!roles.includes("rolesBtn = document.createElement"));
  assert.match(roles, /bc-btn-config-roles/);
  assert.ok(roles.includes("max-height:min(84vh,680px)"));
  assert.match(roles, /bc-btn-roles-help/);
  assert.match(roles, /bc-modal-roles-help/);
  assert.match(roles, /function openRolesHelp\(\)/);
  assert.match(roles, /relocateSmartPermissionsHelp\(\)/);
  assert.match(roles, /ensureSmartPermissionsObserver\(\)/);
  assert.doesNotMatch(index, /presentaciones-panel|form-presentacion-nueva|lista-presentaciones-catalogo|pp-producto-select|pp-lista-asociaciones|form-pp-nueva/);
  assert.doesNotMatch(roles, /Solo lectura|Operación|Inventario|Administrador operativo/);
  assert.doesNotMatch(index, /bc-pres-normal-name|bc-pres-normal-factor|prod-pres-min|prod-pres-may/);
  assert.match(catalogos, /catalogo-delete-btn/);
  assert.match(catalogos, /No se puede eliminar: hay productos asociados/);
  assert.ok(roles.includes("rol-permisos-panel{max-height:240px;overflow:auto"));
});

test("Administration module styles are compact and catalog lists are bounded", () => {
  assert.ok(m75.includes("#tab-config .bc-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))"));
  assert.ok(m75.includes("max-height:132px;overflow:auto"));
  assert.ok(index.includes('bc-nav-group-label">Sistema</span>'));
  assert.ok(m75.includes("#tab-config .bc-admin-subcard .lista .lista-item-acciones{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap}"));
  assert.ok(m75.includes(".catalogo-edit-btn") && m75.includes(".catalogo-delete-btn"));
  assert.ok(m75.includes(".catalogo-delete-btn{border-color:rgba(220,105,90,.48);color:#e0a29a}"));
  assert.doesNotMatch(m75, /#bc-product-presentations-entry\{|#tab-config \.bc-admin-presentations|#tab-config \.presentaciones-panel\{/,
    "M75 must not reintroduce styles that show the retired presentations UI");

});


test("roles permissions help uses one canonical guide and never relocates repeated role matrices",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","public","js","roles-en-usuarios.js"),"utf8");
  const start=source.indexOf("function relocateSmartPermissionsHelp()");
  const end=source.indexOf("function ensureSmartPermissionsObserver()",start);
  assert.ok(start>=0 && end>start,"canonical help function must exist");
  const helper=source.slice(start,end);
  assert.match(helper,/data-bc-roles-help-single/);
  assert.match(helper,/host\.innerHTML/);
  assert.doesNotMatch(helper,/appendChild\(block\)/);
  assert.match(helper,/Los usuarios heredan los permisos del rol/);
});


test("Categories open from an Administration tile and reuse one existing modal/form/list",()=>{
  const {JSDOM}=require("jsdom");
  const dom=new JSDOM(index);
  try {
    const d=dom.window.document;
    const modal=d.getElementById("bc-modal-categorias");
    assert.ok(d.getElementById("bc-categories-open"));
    assert.ok(modal);
    assert.equal(modal.getAttribute("aria-hidden"),"true");
    assert.equal(d.querySelectorAll("#form-categoria").length,1);
    assert.equal(d.querySelectorAll("#lista-categorias").length,1);
    assert.equal(d.querySelectorAll("#msg-config").length,1);
  } finally { dom.window.close(); }
});
