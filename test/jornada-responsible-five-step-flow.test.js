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
const transferMigration=read("supabase/migrations/20261121193906_jornada_operational_close_and_transfer_attribution.sql");
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
  const settlementStart=cashMigration.indexOf("v_new := $new$",cashMigration.indexOf("v_cash_received:=CASE"));
  const settlementEnd=cashMigration.indexOf("$new$;",settlementStart)+6;
  const settlement=cashMigration.slice(settlementStart,settlementEnd);
  assert.match(settlement,/v_final_cash_state IN \('APROBADA','APROBADA_CON_DIFERENCIA'\)/);
  assert.doesNotMatch(settlement,/v_daily_cash\+v_final_counted/);
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


test("sending a Bajas review request returns the worker to Bajas and keeps final confirmation explicit",()=>{
  const start=ui.indexOf("async function submitAdjustment(form){");
  const end=ui.indexOf("async function openRetroSuccessorPanel",start);
  assert.ok(start>=0&&end>start,"adjustment submission handler exists");
  const submit=ui.slice(start,end);
  assert.match(submit,/const reopenBajas=storageType==='baja'&&checklistModalContext\?\.key==='bajas'/);
  assert.match(submit,/if\(reopenBajas\)closeChecklistModal\(\{restore:true\}\)/);
  assert.match(submit,/const refreshed=await openWorkspace\(sessionId\)/);
  assert.match(submit,/if\(refreshed&&reopenBajas\)\{openChecklistSection\('bajas'\)/);
  assert.doesNotMatch(submit,/bc7_confirmar_bloque_jornada/,
    "sending the list must never auto-confirm that there are no more Bajas");
  const modalStart=ui.indexOf("function openChecklistSection(key){");
  const modalEnd=ui.indexOf("document.addEventListener('keydown'",modalStart);
  assert.ok(modalStart>=0&&modalEnd>modalStart);
  const modal=ui.slice(modalStart,modalEnd);
  assert.match(modal,/Confirmar que no faltan más bajas/);
  assert.match(modal,/Hay bajas preparadas que todavía no se han enviado/);
  assert.match(modal,/p_bloque:key/);
  assert.match(modal,/p_completado:true/);
});

test("transfer attribution never disguises server errors as schedule conflicts",()=>{
  const start=ui.indexOf("function friendlyError(error,context){");
  const end=ui.indexOf("function ",start+20);
  const helper=ui.slice(start,end);
  const transferBranch=helper.indexOf("context==='transfer'&&(code==='23514'||code==='23505')");
  const duplicateBranch=helper.indexOf("else if(code==='23505')");
  assert.ok(transferBranch>=0&&duplicateBranch>transferBranch,
    "transfer-specific 23514/23505 messages must take precedence over generic schedule errors");
  assert.match(helper,/context==='transfer'&&\(code==='23514'\|\|code==='23505'\)\) message=raw/);
});

test("sealed transfer attribution surfaces the real server rejection and keeps all safety guards",()=>{
  assert.match(ui,/bc7_vincular_transferencia_jornada/);
  assert.match(ui,/reason\.trim\(\)\.length<10/);
  assert.match(ui,/friendlyError\(error,'transfer'\)/);
  assert.match(ui,/context==='transfer'&&\(code==='23514'\|\|code==='23505'\)\) message=raw/);
  assert.match(cashMigration,/v_s\.estado NOT IN \(''PROGRAMADA'',''EN_CURSO'',''COMPLETADA'',''CERRADA_OPERATIVAMENTE''\)/);
  assert.match(transferMigration,/v_t\.fecha<=v_period_end/);
  assert.match(transferMigration,/v_t\.almacen_destino_id<>v_s\.almacen_id/);
  assert.match(transferMigration,/v_existing\.turno_sesion_id=v_s\.id/);
  assert.match(transferMigration,/TRANSFERENCIA_RETROACTIVA_VINCULADA/);
});


test("final Jornada handover form reads the exact daily rows entered in Step 5",()=>{
  const start=ui.indexOf("async function saveCashDaysWorkspace(form,options){");
  const end=ui.indexOf("async function saveAdminCashDeclaration",start);
  const save=ui.slice(start,end);
  assert.match(save,/const dayRoot=document\.querySelector\('#bc7-cash-days-manager \[data-bc7-close-form\]'\)\|\|form/);
  assert.match(save,/dayRoot\.querySelectorAll\('\[data-bc7-cash-day-row\]'\)/);
  const closeStart=ui.indexOf("async function closeSession(form){");
  const closeEnd=ui.indexOf("let checklistModalContext=null",closeStart);
  const close=ui.slice(closeStart,closeEnd);
  assert.match(close,/saveCashDaysWorkspace\(form,\{requireComplete:true,skipConfirm:true\}\)/);
  assert.doesNotMatch(close,/declaracion_dinero\.monto\)\);/);
});
