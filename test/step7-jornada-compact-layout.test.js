"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8"),sw=fs.readFileSync("public/service-worker.js","utf8");
test("Step 7 folds help/admin and keeps first view to the calendar",()=>{
 assert.match(ui,/<details id="bc7-help-details" class="bc7-help">/);
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
 assert.match(ui,/if\(tab==='operacion'&&state\.detail\)\{\s*loadCashDaysWorkspace\(state\.detail\);\s*loadFinances\(state\.detail\);/);
 assert.match(ui,/if\(tab==='movimientos'&&state\.detail\)loadMovements\(state\.detail\)/);
 assert.doesNotMatch(ui,/if\(tab==='finanzas'&&state\.detail\)loadFinances/);
  assert.match(ui,/const op='<div class="bc7-panel-stack">'\+checks\+actionArea\+'<div class="bc7-checklist-section-source" hidden>'\+fin\+adjustment\+'<\\/div>'\+calculation/);
 assert.match(ui,/!initial\?'open'/);
});
test("compact Step 7 updates app loader and offline cache",()=>{
 assert.match(app,/const VERSION="9.5.103"/);
 assert.match(app,/\["bc7-jornada-ui\.js","7\.27"\]/);
 assert.match(sw,/BC_SW_VERSION = "9.5.103"/);
 assert.match(sw,/bc7-jornada-ui\.js\?v=7\.27/);
 assert.match(ui,/v7\.27 — catálogo completo para ajustes y checklist de cinco pasos/);
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
