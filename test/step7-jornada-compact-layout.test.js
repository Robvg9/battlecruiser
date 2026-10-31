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
test("opening one jornada exposes four task tabs",()=>{
 assert.match(ui,/data-bc7-back-calendar/);
 for(const tab of ["inventario","operacion","finanzas","movimientos"]){
  assert.ok(ui.includes('data-bc7-workspace-tab="'+tab+'"'));
  assert.ok(ui.includes('data-bc7-workspace-panel="'+tab+'"'));
 }
 assert.match(ui,/activateWorkspaceTab\(state\.workspaceTab\)/);
 assert.match(ui,/if\(tab==='movimientos'&&state\.detail\)loadMovements\(state\.detail\)/);
 assert.match(ui,/if\(tab==='finanzas'&&state\.detail\)loadFinances\(state\.detail\)/);
 assert.match(ui,/!initial\?'open'/);
});
test("compact Step 7 updates app loader and offline cache",()=>{
 assert.match(app,/const VERSION="9\.5\.46"/);
 assert.match(app,/\["bc7-jornada-ui\.js","7\.11"\]/);
 assert.match(sw,/BC_SW_VERSION = "9\.5\.46"/);
 assert.match(sw,/bc7-jornada-ui\.js\?v=7\.11/);
 assert.match(ui,/v7\.11 — controles móviles compactos y responsables identificados/);
});

test("Step 7 keeps the work checkbox compact on Android mobile",()=>{
 assert.match(ui,/\.bc7-day-row \.bc7-check\{[^}]*width:max-content/);
 assert.match(ui,/\.bc7-day-row \.bc7-check input\[type=checkbox\]\{[^}]*width:18px!important[^}]*min-height:18px!important/);
 assert.match(ui,/\.bc7-day-row \.bc7-check\{width:max-content!important;max-width:100%;justify-content:flex-start\}/);
 assert.doesNotMatch(ui,/\.bc7-day-row \.bc7-check\{width:100%/);
});
