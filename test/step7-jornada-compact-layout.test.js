"use strict";
const { assertPwaReleaseAligned, assertModuleCacheAligned } = require("./helpers/pwa-release-contract");
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8"),sw=fs.readFileSync("public/service-worker.js","utf8"),index=fs.readFileSync("public/index.html","utf8");
const mobileCss=fs.readFileSync("public/bc7-jornada-inventory-mobile.css","utf8");
test("Step 7 uses a compact help modal and places the active Jornada before planning",()=>{
 assert.match(ui,/class="bc7-help-icon" data-bc7-help-open/);
 assert.match(ui,/id="bc7-help-modal" class="bc7-help-modal" hidden/);
 assert.match(ui,/role="dialog" aria-modal="true" aria-labelledby="bc7-help-title"/);
 assert.match(ui,/data-bc7-help-close/);
 assert.match(ui,/¿Para qué sirve esta sección\?/);
 assert.match(ui,/id="bc7-current-session-card"/);
 assert.match(ui,/id="bc7-calendar-section"/);
 assert.match(mobileCss,/#tab-jornada \.bc7-wrap\{display:flex;flex-direction:column;gap:12px\}/);
 assert.match(mobileCss,/#tab-jornada #bc7-current-session-card\{order:1\}/);
 assert.match(mobileCss,/#tab-jornada #bc7-calendar-section\{order:2\}/);
 assert.match(mobileCss,/#tab-jornada #bc7-admin-details\{order:3\}/);
 assert.match(mobileCss,/#tab-jornada #bc7-workspace\{order:4\}/);
 assert.match(ui,/<details id="bc7-admin-details" class="bc7-admin-details" hidden>/);
 assert.match(ui,/id="bc7-calendar-section"/);
 assert.match(ui,/function setPageMode\(workspace\)/);
 assert.match(ui,/admin\.hidden=!!workspace\|\|!state\.admin/);
});
test("opening one jornada exposes the three task tabs and unifies cash/finance in Operation",()=>{
 assert.match(ui,/data-bc7-back-calendar/);
 for(const tab of ["inventario","operacion","movimientos"]){
  assert.ok(ui.includes('data-bc7-workspace-tab="'+tab+'"'));
  assert.ok(ui.includes('data-bc7-workspace-panel="'+tab+'"'));
 }
 assert.doesNotMatch(ui,/data-bc7-workspace-tab="finanzas"/);
 assert.match(ui,/activateWorkspaceTab\(state\.workspaceTab\)/);
 assert.match(ui,/if\(tab==='operacion'&&state\.detail\)\{\s*ensureWorkspaceOperationData\(state\.detail\);\s*if\(state\.workspaceOperationLoaded\)\{\s*loadCashDaysWorkspace\(state\.detail\);\s*loadFinances\(state\.detail\);\s*\}/);
 assert.match(ui,/if\(tab==='movimientos'&&state\.detail\)loadMovements\(state\.detail\)/);
 assert.doesNotMatch(ui,/if\(tab==='finanzas'&&state\.detail\)loadFinances/);
  assert.ok(ui.includes("const op='<div class=\"bc7-panel-stack\">'+checks+actionArea+'<div class=\"bc7-checklist-section-source\" hidden>'+fin+adjustment+(s.es_minorista===true?cashDaysManagerShellHtml(detail,isAssigned,status):'')+'</div>'+calculation"));
 assert.match(ui,/!initial\?'open'/);
});
test("compact Step 7 updates app loader and offline cache",()=>{
 assertPwaReleaseAligned(assert,{app,serviceWorker:sw,index});
 assertModuleCacheAligned(assert,{app,serviceWorker:sw,moduleName:"bc7-jornada-ui.js"});
 assert.ok(ui.includes("v7.62 — checklist efectivo primero, dashboard de dependienta y vistas administrativas de Jornada."));
});

test("Step 7 keeps the work checkbox compact on Android mobile",()=>{
 assert.match(ui,/\.bc7-day-row \.bc7-check\{[^}]*width:max-content/);
 assert.match(ui,/\.bc7-day-row \.bc7-check input\[type=checkbox\]\{[^}]*width:18px!important[^}]*min-height:18px!important/);
 assert.match(ui,/\.bc7-day-row \.bc7-check\{width:max-content!important;max-width:100%;justify-content:flex-start\}/);
 assert.doesNotMatch(ui,/\.bc7-day-row \.bc7-check\{width:100%/);
});

test("M33 dependent card release is version aligned",()=>{
 assert.match(app,/\["m33-turnos-final\.js","33\.21"\]/);
 assert.match(sw,/m33-turnos-final\.js\?v=33\.21/);
});

test("Jornada workspace title includes the full multi-day period",()=>{
 assert.ok(ui.includes("fmtDateHuman(s.fecha)+(s.fecha_fin&&s.fecha_fin!==s.fecha?' – '+fmtDateHuman(s.fecha_fin):'')"));
});

test("Operation and finance containers stay full width; only daily cash cards use the compact grid",()=>{
  assert.ok(ui.includes("#tab-jornada .bc7-jornada{display:block;grid-template-columns:minmax(0,1fr);min-width:0;width:100%;max-width:100%;box-sizing:border-box;padding:7px!important}"));
  assert.ok(ui.includes("#tab-jornada .bc7-jornada[data-bc7-cash-day-row]{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px}"));
  assert.ok(ui.includes("#tab-jornada .bc7-jornada[data-bc7-cash-day-row] .bc7-jornada-top{display:contents!important}"));
  assert.ok(!ui.includes("#tab-jornada .bc7-jornada-top{display:contents!important}"));
  assert.ok(ui.includes('data-bc7-cash-day-row'));
  assert.ok(ui.includes('data-bc7-finance-form="gasto"'));
  assert.ok(ui.includes('data-bc7-finance-form="reinversion"'));
});
