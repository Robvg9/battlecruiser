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
test("daily cash is reviewed by the Owner per date, without a second period-wide physical count", () => {
  const admin=read("public/js/aprobaciones-admin.js");
  const dailyMigration=read("supabase/migrations/20261123210000_jornada_cash_per_day_and_transfer_attribution.sql");
  const ui=read("public/js/bc7-jornada-ui.js");
  assert.match(admin,/const isDailyCash=x\.tipo==='entrega_diaria'/);
  assert.match(admin,/Solo el importe aprobado se suma al dinero recogido de la jornada/);
  assert.match(admin,/isFinalCash/,"legacy declarations remain distinguishable from daily entries");
  assert.match(dailyMigration,/BC7_CASH_PER_DAY_STEP5_V1/);
  assert.match(dailyMigration,/v_daily_approved=v_daily_expected/);
  assert.match(dailyMigration,/PENDIENTE_APROBACION_ENTREGAS_DIARIAS/);
  const shellStart=ui.indexOf("function cashDaysManagerShellHtml(detail,isAssigned,status){");
  const renderEnd=ui.indexOf("async function loadCashDaysWorkspace(detail){",shellStart);
  assert.ok(shellStart>=0&&renderEnd>shellStart);
  const retailDailyView=ui.slice(shellStart,renderEnd);
  assert.doesNotMatch(retailDailyView,/data-bc7-final-cash-count|data-bc7-admin-cash-declaration|#bc7-cash/);
});

test("PWA release versions stay aligned after the jornada UX update", () => {
  const app = read("public/app.js");
  const sw = read("public/service-worker.js");
  const html = read("public/index.html");
  assertPwaReleaseAligned(assert,{app,serviceWorker:sw,index:html});
  assert.match(app, /bc7-jornada-ui\.js","7\.55"/);
  assert.match(sw, /bc7-jornada-ui\.js\?v=7\.55/);
  assertModuleCacheAligned(assert,{app,serviceWorker:sw,moduleName:"aprobaciones-admin.js"});
});
