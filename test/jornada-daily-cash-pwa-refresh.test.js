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
const CSS = read("public/style.css");

test("PWA shell pins one fresh 9.5.101 release and Jornada UI 7.25", () => {
  assert.ok(APP.includes('const VERSION="9.5.101";'));
  assert.ok(INDEX.includes('style.css?v=9.5.100'));
  assert.ok(INDEX.includes('app.js?v=9.5.101'));
  assert.ok(INDEX.includes('js/offline.js?v=9.5.100'));
  assert.ok(INDEX.includes('app-footer-version">v9.5.101 — BattleCruiser'));
  assert.ok(SW.includes('BC_SW_VERSION = "9.5.101"'));
  assert.ok(SW.includes('./app.js?v=9.5.101'));
  assert.ok(SW.includes('./style.css?v=9.5.100'));
  assert.ok(SW.includes('./js/offline.js?v=9.5.100'));
  assert.ok(APP.includes('["bc7-jornada-ui.js","7.25"]'));
  assert.ok(SW.includes('./js/bc7-jornada-ui.js?v=7.25'));
  assert.ok(APP.includes('["aprobaciones-admin.js","20261113.2"]'));
  assert.ok(SW.includes('./js/aprobaciones-admin.js?v=20261113.2'));
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
  assert.match(UI,/if\(tab==='operacion'&&state\.detail\)\{\s*loadCashDaysWorkspace\(state\.detail\);\s*loadFinances\(state\.detail\);\s*\}/);
});

test("cash, expenses, reinvestments, adjustments and reconciliation share the same compact operation panel", () => {
  const start = UI.indexOf("const op='<div class=\"bc7-panel-stack\">");
  const end = UI.indexOf("const mov='<div class=\"bc7-panel-stack\">", start);
  assert.ok(start >= 0 && end > start);
  const panel = UI.slice(start, end);
  assert.ok(panel.includes("actionArea+fin+adjustment"));
  assert.doesNotMatch(UI, /data-bc7-workspace-tab="finanzas"/);
  const financeStart=UI.indexOf("function financeFormHtml(detail,isAssigned,status){");
  const financeEnd=UI.indexOf("function cashDaysManagerShellHtml(detail,isAssigned,status){",financeStart);
  assert.ok(financeStart>=0&&financeEnd>financeStart);
  const finance=UI.slice(financeStart,financeEnd);
  for (const item of ["data-bc7-finance-form=\"gasto\"","data-bc7-finance-form=\"reinversion\"","bc7-inventory-settlement","Registrar gasto","Registrar reinversión"]) {
    assert.ok(finance.includes(item), "missing in one-panel finance section: " + item);
  }
  assert.match(UI, /data-bc7-adjust-form/);
  assert.match(UI, /loadCashDaysWorkspace\(state\.detail\);\s*loadFinances\(state\.detail\)/);
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
  const cashSaveStart=UI.indexOf("async function saveCashDaysWorkspace(form,options){");
  const cashSaveEnd=UI.indexOf("function cashDeclarationHtml(detail){",cashSaveStart);
  assert.ok(cashSaveStart>=0&&cashSaveEnd>cashSaveStart,"daily cash saver exists");
  const cashSave=UI.slice(cashSaveStart,cashSaveEnd);
  assert.match(cashSave,/Faltan importes de estos días/);
  assert.match(block, /bc_declarar_dinero/);
  assert.match(block, /bc5_cerrar_jornada/);
  assert.match(block, /finalState!=='COMPLETADA'/);
  assert.match(block, /No se repitió la escritura/);
  assert.match(block, /rpc\('bc7_estado_confirmaciones_jornada'/);
  assert.match(block, /lista_para_conteo/);
  assert.match(block, /rpc\('bc5_cerrar_jornada'/);
  assert.doesNotMatch(block, /rpc\('bc7_liquidacion_inventario_jornada'/,
    "la liquidación no puede bloquear el traspaso; se ejecuta en la fase del Dueño");
  assert.doesNotMatch(block, /pending\.gastos|pending\.reinversiones|pending\.ajustes|pending\.entregas_diarias_faltantes|salario_porcentaje/,
    "las aprobaciones pendientes pertenecen a la fase posterior al traspaso");
});


test("mobile Jornada uses labelled inventory cards and stable cash/header layouts", () => {
  assert.ok(CSS.includes(".bc7-final-count-list"));
  const finalCountStart=UI.indexOf("?'<div class=\"bc7-final-count-list\"");
  const initialCountStart=UI.indexOf(":'<p class=\"bc7-table-scroll-hint\"",finalCountStart);
  const finalCountTemplate=UI.slice(finalCountStart,initialCountStart);
  assert.ok(finalCountTemplate.includes("bc7-final-count-product"));
  assert.ok(finalCountTemplate.includes("data-bc7-count"));
  assert.doesNotMatch(finalCountTemplate,/Referencia anterior|Stock actual|Restock actual/);
  assert.ok(CSS.includes(".bc7-final-count-row"));
  assert.match(UI, /data-bc7-count=/);
  assert.match(UI,/data-label="Referencia anterior"/); // solo inventario inicial: sigue siendo referencia histórica, nunca conteo final
  assert.match(UI, /<details class="bc7-finance-fold"><summary>Registrar gasto/);
  assert.match(UI, /<details class="bc7-finance-fold"><summary>Registrar reinversión/);
  assert.ok(CSS.includes("content: attr(data-label)"));
  assert.ok(CSS.includes("#tab-jornada .bc7-jornada[data-bc7-cash-day-row]"));
  assert.ok(CSS.includes("#app-shell.visible>.app-header"));
  assert.ok(CSS.includes("#app-shell.visible > header.app-header.app-header > .header-right"));
  assert.ok(CSS.includes("#app-shell.visible>.app-header #mi-cuenta-btn"));
  assert.ok(CSS.includes("#app-shell.visible>.app-header #logout-btn"));
});
test("Owner can count the declared final cash only after session completion without redeclaring it", () => {
  assert.match(UI, /data-bc7-final-cash-count/);
  assert.match(UI, /data-bc7-final-cash-amount/);
  assert.match(UI, /rpc\('bc5_contar_dinero_entregado'/);
  assert.match(UI, /p_declaracion_id:declarationId,p_monto_contado:amount/);
  assert.ok(UI.includes("String(state.detail?.sesion?.estado||'').toUpperCase()!=='COMPLETADA'"));
  assert.match(UI, /declaration\.monto_contado==null/);
  assert.match(UI, /No copies el importe declarado|no copies el importe declarado/i);
  assert.doesNotMatch(UI, /bc5_contar_dinero_entregado\([^)]*declaration\.monto/);
});
