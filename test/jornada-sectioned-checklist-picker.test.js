"use strict";
const { assertPwaReleaseAligned, assertModuleCacheAligned } = require("./helpers/pwa-release-contract");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("new multi-product Baja rows reinitialize the searchable picker after cloning", () => {
  const ui = read("public/js/bc7-jornada-ui.js");
  assert.match(ui, /cloneNode\(true\)/);
  assert.match(ui, /closest\('\.bc-product-picker-field'\)/);
  assert.match(ui, /delete select\.dataset\[key\]/);
  assert.match(ui, /__BC_PRODUCT_PICKER_REFRESH__\(select\)/);
  assert.match(ui, /data-bc7-adjustment-add/);
});

test("each attendant checklist item opens its own operational section and has one explicit send action", () => {
  const ui = read("public/js/bc7-jornada-ui.js");
  for (const section of ["gastos", "reinversiones", "bajas"]) assert.ok(ui.includes("key:'"+section+"'"), "missing checklist item: " + section);
  assert.ok(ui.includes("data-bc7-checklist-open=\"'+item.key+'\">"));
  assert.match(ui,/data-bc7-checklist-open="inventario_final"/);
  assert.match(ui,/data-bc7-checklist-open="declaracion_dinero"/);
  assert.match(ui,/function openChecklistSection\(key\)/);
  assert.match(ui,/data-bc7-finance-form="gasto"/);
  assert.match(ui,/data-bc7-finance-form="reinversion"/);
  assert.match(ui,/data-bc7-adjust-form/);
  assert.match(ui,/data-bc7-checklist-toggle/);
  assert.doesNotMatch(ui,/checklistConfirmButtonHtml\(detail,'gastos',isAssigned\)/);
  assert.doesNotMatch(ui,/checklistConfirmButtonHtml\(detail,'reinversiones',isAssigned\)/);
  assert.doesNotMatch(ui,/checklistConfirmButtonHtml\(detail,'bajas',isAssigned\)/);
  const openStart=ui.indexOf("function openChecklistSection(key)");
  const openEnd=ui.indexOf("document.addEventListener('keydown'",openStart);
  const modalOpen=openStart>=0&&openEnd>openStart?ui.slice(openStart,openEnd):"";
  assert.match(modalOpen,/bc7-checklist-modal/);
  assert.match(modalOpen,/data-bc7-checklist-modal-action/);
  assert.match(modalOpen,/Enviar evidencia a Administración/);
  assert.match(modalOpen,/Envía primero la lista completa de bajas o mermas/);
  assert.match(modalOpen,/form\.requestSubmit\(\)/);
  assert.doesNotMatch(modalOpen,/scrollIntoView/);
  assert.match(ui,/bc7-checklist-section-source" hidden/);
  assert.match(ui,/Reabrir sección/);
});
test("final cash declaration and physical count are resolved in one Owner action", () => {
  const admin = read("public/js/aprobaciones-admin.js");
  const migration = read("supabase/migrations/20261119160000_jornada_retroactive_cut_single_cash_count.sql");
  assert.match(admin, /Confirmar conteo físico/);
  assert.match(admin, /rpc\('bc5_contar_dinero_entregado'/);
  assert.doesNotMatch(admin, /Aprobar declaración/);
  assert.match(admin, /Solicitar corrección/);
  assert.match(migration, /La declaración final debe confirmarse con el conteo físico en una sola acción/);
  const countStart = migration.indexOf("DO $patch_one_step_final_cash_count$");
  assert.ok(countStart >= 0);
});

test("PWA release versions stay aligned after the jornada UX update", () => {
  const app = read("public/app.js");
  const sw = read("public/service-worker.js");
  const html = read("public/index.html");
  assertPwaReleaseAligned(assert,{app,serviceWorker:sw,index:html});
  assert.match(app, /bc7-jornada-ui\.js","7\.56"/);
  assert.match(sw, /bc7-jornada-ui\.js\?v=7\.56/);
  assertModuleCacheAligned(assert,{app,serviceWorker:sw,moduleName:"aprobaciones-admin.js"});
});
