"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const ui=read("public/js/bc7-jornada-ui.js");
const migration=read("supabase/migrations/20261123183000_jornada_responsable_completar_cinco_pasos.sql");
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

test("Step 5 lives inside the checklist and requires all date deliveries plus the worker final declaration",()=>{
  assert.match(ui,/openChecklistSection\('declaracion_dinero'\)/);
  assert.match(ui,/data-bc7-checklist-open="declaracion_dinero"/);
  assert.match(ui,/requireComplete:true/);
  assert.match(ui,/declaracion_registrada===true/);
  assert.match(ui,/bc5_responsable_declarar_dinero_jornada/);
  assert.match(ui,/finalSaved=declarationMatches&&detail\.checklist/);
  assert.match(migration,/v_daily_registered=v_daily_expected/);
  assert.match(migration,/DINERO_DECLARACION_RESPONSABLE_SUSTITUYE_TRANSCRIPCION/);
});

test("sealed step 5 is not rendered as a separate action-area panel",()=>{
  const start=ui.indexOf("else if(status==='CERRADA_OPERATIVAMENTE'&&s.es_minorista===true)");
  const end=ui.indexOf("}else{",start);
  const sealedBranch=ui.slice(start,end);
  assert.doesNotMatch(sealedBranch,/cashDaysManagerShellHtml/);
  assert.match(ui,/cashDaysManagerShellHtml\(detail,isAssigned,status\).*bc7-checklist-section-source/);
});

test("dynamic Jornada assets and PWA shell versions are aligned",()=>{
  assert.match(app,/\["bc7-jornada-ui\.js","7\.54"\]/);
  assert.match(sw,/bc7-jornada-ui\.js\?v=7\.54/);
  assert.match(app,/9\.5\.150/);
  assert.match(sw,/9\.5\.150/);
});
