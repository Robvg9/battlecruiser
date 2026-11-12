"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const APP = read("public/app.js");
const INDEX = read("public/index.html");
const SW = read("public/service-worker.js");
const UI = read("public/js/bc7-jornada-ui.js");

test("PWA shell pins one fresh 9.5.96 release and Jornada UI 7.19", () => {
  assert.match(APP, /const VERSION="9\.5\.96";/);
  assert.match(INDEX, /app\.js\?v=9\.5\.96/);
  assert.match(INDEX, /js\/offline\.js\?v=9\.5\.96/);
  assert.match(INDEX, /app-footer-version">v9\.5\.96 — BattleCruiser/);
  assert.match(SW, /BC_SW_VERSION = "9\.5\.96"/);
  assert.match(SW, /\.\/app\.js\?v=9\.5\.96/);
  assert.match(SW, /\.\/js\/offline\.js\?v=9\.5\.96/);
  assert.match(APP, /\["bc7-jornada-ui\.js","7\.19"\]/);
  assert.match(SW, /\.\/js\/bc7-jornada-ui\.js\?v=7\.19/);
  assert.match(APP, /\["aprobaciones-admin\.js","20261112\.1"\]/);
  assert.match(SW, /\.\/js\/aprobaciones-admin\.js\?v=20261112\.1/);
});

test("PWA update notice creates its action button before binding the click", () => {
  assert.match(APP, /var button = document\.createElement\("button"\)/);
  assert.match(APP, /button\.textContent = "Actualizar ahora"/);
  assert.match(APP, /button\.addEventListener\("click"/);
  assert.match(APP, /notice\.appendChild\(button\)/);
  assert.doesNotMatch(APP, /notice\.querySelector\("button"\)\.addEventListener/);
});

test("finance and operation refresh recognize the authenticated active jornada as assigned", () => {
  assert.match(UI, /const activeSessionId=String\(state\.currentSession\?\.turno_sesion_id\|\|''\);/);
  assert.match(UI, /activeSessionId===String\(detail\.sesion\.id\|\|''\)/);
  assert.match(UI, /if\(tab==='operacion'&&state\.detail\)loadCashDaysWorkspace\(state\.detail\)/);
});

test("retail cash entry and final-day declaration share the same operation/close form", () => {
  assert.match(UI, /data-bc7-cash-mode="daily"/);
  assert.match(UI, /cashDaysManagerShellHtml\(detail,isAssigned,status\)/);
  assert.match(UI, /function renderCashDaysWorkspace\(detail\)/);
  assert.match(UI, /for\(let index=0;index<totalDays;index\+\+\)/);
  assert.match(UI, /data-bc7-cash-day-amount/);
  assert.match(UI, /id="bc7-cash"/);
  assert.match(UI, /data-bc7-save-cash-days/);
  assert.match(UI, /data-bc7-close-form/);
  assert.doesNotMatch(UI, /data-bc7-open-final-cash/);
  assert.doesNotMatch(UI, /data-bc7-daily-cash-form/);
  assert.doesNotMatch(UI, /submitDailyCash\(form\)/);
});

test("previous days use daily RPC with idempotency and server readback before success", () => {
  const start = UI.indexOf("async function saveCashDaysWorkspace(form,options){");
  const end = UI.indexOf("function cashDeclarationHtml(detail){", start);
  assert.ok(start >= 0 && end > start, "unified cash saver exists");
  const block = UI.slice(start, end);
  assert.match(block, /freshIdempotencyKey\(\)/);
  assert.match(block, /rpc\('bc7_registrar_entrega_diaria_jornada'/);
  assert.match(block, /rpc\('bc7_entregas_diarias_jornada'/);
  assert.match(block, /missingRows/);
  assert.match(block, /Conservé las claves para evitar duplicados/);
  assert.match(block, /saveCashDeclaration\(form,true,true\)/);
  assert.ok(block.indexOf("missingRows.length") < block.indexOf("Importes guardados y confirmados"));
  assert.match(block, /Dinero diario actualizado para '\+operations\.length\+'/);
});

test("closing requires every date and confirms the final day before closing the jornada", () => {
  const start = UI.indexOf("async function closeSession(form){");
  const end = UI.indexOf("async function submitAdjustment(form){", start);
  assert.ok(start >= 0 && end > start, "closeSession exists");
  const block = UI.slice(start, end);
  assert.match(block, /saveCashDaysWorkspace\(form,\{requireComplete:true,skipConfirm:true\}\)/);
  assert.match(block, /Faltan importes de estos días/);
  assert.match(block, /bc_declarar_dinero/);
  assert.match(block, /bc5_cerrar_jornada/);
  assert.match(block, /finalState!=='COMPLETADA'/);
  assert.match(block, /No se repitió la escritura/);
});
