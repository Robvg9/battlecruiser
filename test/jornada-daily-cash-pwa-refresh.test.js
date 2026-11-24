"use strict";
const { assertPwaReleaseAligned, assertModuleCacheAligned } = require("./helpers/pwa-release-contract");

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

test("PWA shell, Jornada UI and approvals stay aligned with the current release", () => {
  assertPwaReleaseAligned(assert,{app:APP,serviceWorker:SW,index:INDEX});
  assert.ok(INDEX.includes('js/offline.js?v=9.5.103'));
  assert.ok(SW.includes('./js/offline.js?v=9.5.103'));
  assertModuleCacheAligned(assert,{app:APP,serviceWorker:SW,moduleName:"bc7-jornada-ui.js"});
  assertModuleCacheAligned(assert,{app:APP,serviceWorker:SW,moduleName:"aprobaciones-admin.js"});
});

test("PWA update banner waits for the user-approved worker activation before reloading", () => {
  assert.match(APP, /var button = document\.createElement\("button"\)/);
  assert.match(APP, /button\.textContent = "Actualizar ahora"/);
  assert.match(APP, /button\.addEventListener\("click"/);
  assert.match(APP, /aviso\.appendChild\(button\)/);
  assert.match(APP, /waiting\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(APP, /latestWorker\.state === "activated"/);
  assert.match(APP, /latestWorker\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(APP, /if \(waitingVersion === currentVersion\)[\s\S]*?waiting\.postMessage/);
  assert.match(APP, /esVersionMasNueva\(waitingVersion, currentVersion\)/);
  assert.match(APP, /esVersionMasNueva\(latestVersion, window\.__BC_VERSION__\)/);
  assert.match(APP, /window\.location\.reload\(\)/);
  assert.doesNotMatch(APP, /controllerchange[\s\S]*?window\.location\.reload/);
  assert.doesNotMatch(APP, /waiting\.state === "activated"/);
});

test("finance and operation refresh recognize the authenticated active jornada as assigned", () => {
  assert.match(UI, /const activeSessionId=String\(state\.currentSession\?\.turno_sesion_id\|\|''\);/);
  assert.match(UI,/activeSessionId===sessionId/);
  assert.match(UI,/if\(tab==='operacion'&&state\.detail\)\{\s*ensureWorkspaceOperationData\(state\.detail\);\s*if\(state\.workspaceOperationLoaded\)\{\s*loadCashDaysWorkspace\(state\.detail\);\s*loadFinances\(state\.detail\);\s*\}\s*\}/);
  assert.match(UI,/const sessionId=String\(detail\.sesion\.id\)/);
  assert.match(UI,/state\.workspaceOperationLoaded=true;\s*state\.workspaceOperationPromise=null;\s*renderWorkspace\(detail\)/);
  assert.match(UI,/activateWorkspaceTab\(state\.workspaceTab\)/);
  assert.match(UI,/detail\.server_responsible_access=!!accessResult\.ok/);
  assert.match(UI,/Promise\.allSettled\(/);
  assert.match(UI,/detail\.server_responsible_access/);
});

test("cash, expenses, reinvestments, adjustments and reconciliation share the same compact operation panel", () => {
  const start = UI.indexOf("const op='<div class=\"bc7-panel-stack\">");
  const end = UI.indexOf("const mov='<div class=\"bc7-panel-stack\">", start);
  assert.ok(start >= 0 && end > start);
  const panel = UI.slice(start, end);
  assert.ok(panel.includes("bc7-checklist-section-source")&&panel.includes("fin+adjustment"));
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

test("retail Step 5 is a per-date cash workflow with no period-wide declaration", () => {
  assert.match(UI, /data-bc7-cash-mode="daily"/);
  assert.match(UI, /cashDaysManagerShellHtml\(detail,isAssigned,status\)/);
  assert.match(UI, /function renderCashDaysWorkspace\(detail\)/);
  assert.match(UI, /for\(let index=0;index<totalDays;index\+\+\)/);
  assert.match(UI, /data-bc7-cash-day-amount/);
  assert.doesNotMatch(UI, /id="bc7-cash"/);
  assert.doesNotMatch(UI, /data-bc7-final-cash-count/);
  assert.doesNotMatch(UI, /data-bc7-admin-cash-declaration/);
  assert.match(UI, /data-bc7-save-cash-days/);
  assert.match(UI, /data-bc7-close-form/);
  assert.doesNotMatch(UI, /data-bc7-open-final-cash/);
  assert.doesNotMatch(UI, /data-bc7-daily-cash-form/);
  assert.doesNotMatch(UI, /submitDailyCash\(form\)/);
});

test("every date uses the daily RPC with idempotency and server readback before success", () => {
  const start = UI.indexOf("async function saveCashDaysWorkspace(form,options){");
  const end = UI.indexOf("async function saveAdminCashDeclaration", start);
  assert.ok(start >= 0 && end > start, "unified cash saver exists");
  const block = UI.slice(start, end);
  assert.match(block, /freshIdempotencyKey\(\)/);
  assert.match(block, /rpc\('bc7_registrar_entrega_diaria_jornada'/);
  assert.match(block, /rpc\('bc7_entregas_diarias_jornada'/);
  assert.match(block, /missingRows/);
  assert.match(block, /Conservé las claves para evitar duplicados/);
  assert.doesNotMatch(block, /saveCashDeclaration/);
  assert.doesNotMatch(block, /isFinal/);
  assert.doesNotMatch(block, /bc_declarar_dinero/);
  assert.ok(block.indexOf("missingRows.length") < block.indexOf("Paso 5 enviado y confirmado"));
  assert.match(block, /Entregas diarias guardadas y confirmadas por el servidor/);
  assert.match(block, /No hace falta declarar un total final/);
});

test("handover requires every date and does not create a second final-period cash declaration", () => {
  const start = UI.indexOf("async function closeSession(form){");
  const end = UI.indexOf("async function submitAdjustment(form){", start);
  assert.ok(start >= 0 && end > start, "closeSession exists");
  const block = UI.slice(start, end);
  assert.match(block, /saveCashDaysWorkspace\(form,\{requireComplete:true,skipConfirm:true\}\)/);
  const cashSaveStart=UI.indexOf("async function saveCashDaysWorkspace(form,options){");
  const cashSaveEnd=UI.indexOf("async function saveAdminCashDeclaration",cashSaveStart);
  assert.ok(cashSaveStart>=0&&cashSaveEnd>cashSaveStart,"daily cash saver exists");
  const cashSave=UI.slice(cashSaveStart,cashSaveEnd);
  assert.match(cashSave,/Faltan importes de estos días/);
  const dailyBranch=block.slice(0,block.indexOf("}else{"));
  assert.match(dailyBranch,/saveCashDaysWorkspace\(form,\{requireComplete:true,skipConfirm:true\}\)/);
  assert.doesNotMatch(dailyBranch,/bc_declarar_dinero/);
  assert.match(dailyBranch,/checklist\?\.declaracion_dinero\?\.completado===true/);
  assert.doesNotMatch(dailyBranch,/declaracion_dinero\.monto/);
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
test("daily cash PWA does not render an additional final declaration or cash-count form", () => {
  const start=UI.indexOf("function renderCashDaysWorkspace(detail){");
  const end=UI.indexOf("async function loadCashDaysWorkspace",start);
  assert.ok(start>=0&&end>start);
  const block=UI.slice(start,end);
  assert.doesNotMatch(block,/data-bc7-final-cash-count|data-bc7-admin-cash-declaration|#bc7-cash/);
  assert.match(block,/data-bc7-cash-day-row/);
  assert.match(block,/Resumen del Paso 5/);
  assert.match(block,/fechas registradas/);
});


test("retail Step 5 accepts ordinary ISO dates before rendering daily entries",()=>{
  const start=UI.indexOf("function renderCashDaysWorkspace(detail){");
  const end=UI.indexOf("async function loadCashDaysWorkspace",start);
  assert.ok(start>=0&&end>start);
  const block=UI.slice(start,end);
  const validGuard = "if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(firstDate)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(lastDate)";
  const invalidGuard = "if(!/^\\\\d{4}";
  assert.ok(block.includes(validGuard),"ISO date validation must use digit classes");
  assert.equal(block.includes(invalidGuard),false,"a double-escaped digit class would reject real dates");
});
test("saving a period with all dates already recorded does not create duplicates",()=>{
  const start=UI.indexOf("async function saveCashDaysWorkspace(form,options){");
  const end=UI.indexOf("async function saveAdminCashDeclaration",start);
  assert.ok(start>=0&&end>start);
  const block=UI.slice(start,end);
  assert.match(block,/if\(!operations\.length&&!options\.requireComplete\)/);
  assert.match(block,/if\(!operations\.length&&!options\.requireComplete\)/);
  assert.match(block,/No hay importes diarios nuevos que enviar/);
  assert.match(block,/if\(options\.requireComplete&&missing\.length\)/);
  assert.match(block,/Faltan importes de estos días/);
  assert.doesNotMatch(block,/declaración final del período/);
});
