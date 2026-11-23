"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const ui=read("public/js/bc7-jornada-ui.js");
const migration=read("supabase/migrations/20261123183000_jornada_responsable_completar_cinco_pasos.sql");
const cashMigration=read("supabase/migrations/20261123193000_jornada_daily_cash_without_final_declaration.sql");
const app=read("public/app.js");
const sw=read("public/service-worker.js");

test("assigned worker can confirm completeness after seal and completed blocks hide new-entry forms",()=>{
  assert.match(ui,/if\(!isAssigned\)return ''/);
  assert.match(ui,/detail\.checklist\?\.gastos\?\.completado!==true/);
  assert.match(ui,/detail\.checklist\?\.reinversiones\?\.completado!==true/);
  assert.match(ui,/detail\.checklist\?\.bajas\?\.completado!==true/);
  assert.match(ui,/data-bc7-checklist-toggle/);
  assert.match(migration,/BC7_SEALED_WORKER_BLOCK_CONFIRM_V3/);
  assert.doesNotMatch(migration,/Solo ADMIN puede confirmar bloques/);
  assert.doesNotMatch(migration,/Todavía hay gastos pendientes de revisión/);
});

test("sealed final physical inventory is entered directly by the assigned worker in the PWA",()=>{
  assert.match(ui,/sealedResponsibleCapture/);
  assert.match(ui,/data-bc7-sealed-final-capture="responsible"/);
  assert.match(ui,/bc7_responsable_registrar_inventario_final_sellado_jornada/);
  assert.match(migration,/bc7_validar_tramo_responsable_jornada/);
  assert.match(migration,/initial_line|il\.corte_id=v_initial_cut/);
  assert.match(migration,/v_s\.corte_operativo_at/);
  assert.match(migration,/stock_global_modificado',false/);
  assert.match(migration,/bc7_validar_bloque_abierto_jornada/);
  assert.match(migration,/quote_literal\('reinversiones'\)/);
  assert.match(migration,/p_idempotency_key\);/);
});

test("Step 5 requires exactly one daily entry per period date and no worker final-total declaration",()=>{
  assert.match(ui,/openChecklistSection\('declaracion_dinero'\)/);
  assert.match(ui,/data-bc7-checklist-open="declaracion_dinero"/);
  assert.match(ui,/requireComplete:true/);
  const renderStart=ui.indexOf("function renderCashDaysWorkspace(detail){");
  const renderEnd=ui.indexOf("async function loadCashDaysWorkspace(detail){",renderStart);
  assert.ok(renderStart>=0&&renderEnd>renderStart);
  const dailyRenderer=ui.slice(renderStart,renderEnd);
  assert.match(dailyRenderer,/for\(let index=0;index<totalDays;index\+\+\)/);
  assert.match(dailyRenderer,/data-bc7-cash-day-amount/);
  assert.doesNotMatch(dailyRenderer,/Declaración final del período|data-bc7-admin-cash-declaration|data-bc7-rectify-cash-declaration|id="bc7-cash"/);
  const saveStart=ui.indexOf("async function saveCashDaysWorkspace(form,options){");
  const saveEnd=ui.indexOf("async function saveAdminCashDeclaration",saveStart);
  assert.ok(saveStart>=0&&saveEnd>saveStart);
  const saveBlock=ui.slice(saveStart,saveEnd);
  assert.doesNotMatch(saveBlock,/saveCashDeclaration|finalOperation|declaración final/);
  assert.match(ui,/bc7_estado_conteo_efectivo_jornada/);
  assert.match(ui,/bc7_contar_efectivo_dueno_jornada/);
  assert.match(cashMigration,/v_daily_registered=v_daily_expected/);
  assert.match(cashMigration,/turno_jornada_conteos_caja/);
  assert.match(cashMigration,/THEN v_final_counted ELSE NULL END/);
  assert.doesNotMatch(cashMigration,/v_daily_cash\+v_final_counted/);
});

test("sealed step 5 is mounted only inside the checklist source container",()=>{
  const start=ui.indexOf("else if(status==='CERRADA_OPERATIVAMENTE'&&s.es_minorista===true)");
  const end=ui.indexOf("}else{",start);
  const sealedBranch=ui.slice(start,end);
  assert.doesNotMatch(sealedBranch,/cashDaysManagerShellHtml/);
  assert.match(ui,/const op=.*cashDaysManagerShellHtml/);
});
test("dynamic Jornada assets and PWA shell versions are aligned",()=>{
  assert.match(app,/\["bc7-jornada-ui\.js","7\.55"\]/);
  assert.match(sw,/bc7-jornada-ui\.js\?v=7\.55/);
  assert.match(app,/9\.5\.151/);
  assert.match(sw,/9\.5\.151/);
});
