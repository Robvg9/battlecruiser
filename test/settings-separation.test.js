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
  assert.doesNotMatch(scrollFix, /trigger\.click\(\)|tab\.appendChild\(panel\)|bc-aj-panel/);
});

test("account and logout actions remain in appropriate locations", () => {
  assert.match(index, /id="mi-cuenta-btn"/);
  assert.match(index, /id="logout-btn"/);
  assert.match(account, /getElementById\('bc-account-password'\)/);
  assert.doesNotMatch(account, /getElementById\('change-pass-btn'\)/);
});

test("Conectividad exposes diagnostic actions; Configuración remains for admin/catalogs", () => {
  assert.match(connectivity, /Conectividad y mantenimiento/);
  assert.match(connectivity, /cfg-refrescar-diag/);
  assert.match(connectivity, /cfg-actualizar-app/);
  assert.match(index, /id="tab-config"/);
  assert.match(index, /id="form-nuevo-rol"/);
  assert.match(index, /id="form-categoria"/);
  assert.match(index, /id="form-unidad"/);
});
