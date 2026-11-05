"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", "public", name), "utf8");
const index = read("index.html");
const app = read("app.js");
const navigation = read("js/navegacion.js");
const connectivity = read("js/configuracion.js");
const preferences = read("js/configuracion-ajustes-migrados-20260903.js");
const account = read("js/mi-cuenta.js");
const scrollFix = read("js/hotfix-configuracion-20260902.js");

test("personal preferences and connectivity live in their own navigation sections", () => {
  assert.match(index, /data-tab="conectividad">Conectividad<\/button>/);
  assert.match(index, /data-tab="preferencias">Preferencias<\/button>/);
  assert.match(index, /id="tab-conectividad"/);
  assert.match(index, /id="tab-preferencias"/);
  assert.match(connectivity, /getElementById\("tab-conectividad"\)/);
  assert.match(preferences, /getElementById\("tab-preferencias"\)/);
  assert.match(navigation, /t === "conectividad"/);
});

test("the legacy header Ajustes dropdown and duplicate drawer are not rendered", () => {
  assert.doesNotMatch(index, /id="ajustes-btn"|id="ajustes-menu"|id="change-pass-btn"|id="update-app-btn"/);
  assert.doesNotMatch(app, /ui-ajustes-panel\.js/);
  assert.doesNotMatch(preferences, /Ajustes básicos|Región \/ Conexión|cfg-aj-pass|cfg-aj-data|cfg-aj-update|cfg-aj-logout/);
  assert.doesNotMatch(scrollFix, /trigger\.click\(\)|tab\.appendChild\(panel\)/);
  assert.match(scrollFix, /legacyPanel\.parentNode\.removeChild\(legacyPanel\)/, "stale cached drawer is actively removed");
});

test("account and logout actions remain in appropriate locations", () => {
  assert.match(index, /id="mi-cuenta-btn"/);
  assert.match(index, /id="logout-btn"/);
  assert.match(account, /getElementById\('bc-account-password'\)/);
  assert.doesNotMatch(account, /getElementById\('change-pass-btn'\)/);
  const auth = read("js/auth.js");
  assert.match(auth, /if \(!ajustesBtn \|\| !ajustesMenu\) return;/, "auth.js must tolerate the removed legacy dropdown");
  assert.match(auth, /if \(formPass\) formPass\.addEventListener\("submit"/, "password form must still submit without the old header button");
});

test("Conectividad exposes diagnostics; Administración retains Categories and Roles & Permissions", () => {
  assert.match(connectivity, /Conectividad y mantenimiento/);
  assert.match(connectivity, /cfg-refrescar-diag/);
  assert.match(connectivity, /cfg-actualizar-app/);
  assert.match(index, /id="tab-config"/);
  assert.match(index, /class="cc-bloque bc-admin-card bc-admin-roles" aria-label="Roles y Permisos"/,
    "Administración debe conservar la tarjeta de Roles y Permisos");
  assert.match(index, /class="bc-admin-role-runtime" hidden/,
    "el formulario/lista de roles permanece como punto de montaje del módulo");
  for (const id of ["form-nuevo-rol", "lista-roles", "msg-roles"]) {
    assert.match(index, new RegExp('id="' + id + '"'));
  }
  assert.match(index, /id="bc-categories-open"/);
  assert.match(index, /id="form-categoria"/);
  assert.doesNotMatch(index, /id="form-unidad"|id="lista-unidades"/,
    "Administración no debe conservar un catálogo paralelo de unidades");
  assert.equal((index.match(/class="presentaciones-panel"/g) || []).length, 0,
    "el catálogo administrativo de presentaciones debe estar retirado");
  for (const id of ["form-presentacion-nueva", "lista-presentaciones-catalogo", "pp-producto-select", "pp-lista-asociaciones", "form-pp-nueva"]) {
    assert.equal((index.match(new RegExp('id="' + id + '"', "g")) || []).length, 0, id + " pertenece al panel retirado");
  }
  assert.doesNotMatch(index, /id="prod-unidad"[^>]*list="presentaciones-comunes"/,
    "la unidad base ya no depende del catálogo de presentaciones");
  assert.match(index, /<select id="prod-categoria"[^>]*required/,
    "la categoría es un selector obligatorio en el formulario principal");
  assert.doesNotMatch(index, /bc-pres-normal-name|bc-pres-normal-factor|prod-pres-min|prod-pres-may/);
});
