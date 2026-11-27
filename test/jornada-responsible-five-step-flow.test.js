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
const dailyApprovalMigration=read("supabase/migrations/20261124001500_jornada_daily_approvals_replace_owner_cash_count.sql");
const transferMigration=read("supabase/migrations/20261121193906_jornada_operational_close_and_transfer_attribution.sql");
const attributionMigration=read("supabase/migrations/20261124200000_jornada_session_inventory_attribution_hardening.sql");
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

test("Step 1 requires exactly one daily entry per period date and no worker final-total declaration",()=>{
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
  assert.doesNotMatch(ui,/bc7_contar_efectivo_dueno_jornada|data-bc7-final-cash-count|countFinalCash/);
  assert.match(ui,/Verificación del efectivo por aprobaciones diarias/);
  assert.match(dailyApprovalMigration,/v_daily_approved=v_daily_expected/);
  assert.match(dailyApprovalMigration,/v_cash_received:=CASE/);
  assert.match(dailyApprovalMigration,/coalesce\(v_daily_cash,0\)/);
  assert.doesNotMatch(dailyApprovalMigration,/turno_jornada_conteos_caja/);
  assert.match(dailyApprovalMigration,/requiere_conteo_fisico',false/);
  assert.match(dailyApprovalMigration,/PENDIENTE_APROBACION_DIARIA/);
});

test("sealed step 5 is mounted only inside the checklist source container",()=>{
  const start=ui.indexOf("else if(status==='CERRADA_OPERATIVAMENTE'&&s.es_minorista===true)");
  const end=ui.indexOf("}else{",start);
  const sealedBranch=ui.slice(start,end);
  assert.doesNotMatch(sealedBranch,/cashDaysManagerShellHtml/);
  assert.match(ui,/const op=.*cashDaysManagerShellHtml/);
});
test("dynamic Jornada assets and PWA shell versions are aligned",()=>{
  assert.match(ui,/\/\/ v7\.69 — add Jornada payroll expense categories and keep the Bajas checklist mounted after review submission\./);
  assert.match(app,/\["bc7-jornada-ui\.js","7\.69"\]/);
  assert.match(sw,/bc7-jornada-ui\.js\?v=7\.69/);
  assert.match(app,/9\.5\.170/);
  assert.match(sw,/BC_SW_VERSION = "9\.5\.170"/);
});


test("sending a Bajas review request keeps the active Bajas modal open for explicit final confirmation",()=>{
  const start=ui.indexOf("async function submitAdjustment(form){");
  const end=ui.indexOf("async function openRetroSuccessorPanel",start);
  assert.ok(start>=0&&end>start,"adjustment submission handler exists");
  const submit=ui.slice(start,end);
  assert.match(submit,/const keepBajasPanelOpen=checklistModalContext\?\.key==='bajas'&&!!checklistModalContext\.root\?\.isConnected/);
  assert.match(submit,/if\(keepBajasPanelOpen\)\{/);
  assert.match(submit,/form\.reset\(\);[\s\S]*?syncAdjustmentRows\(form\)/);
  assert.match(submit,/if\(keepBajasPanelOpen\)\{[\s\S]*?modalState\.textContent=[\s\S]*?return;[\s\S]*?if\(reopenBajas\)closeChecklistModal/);
  assert.match(submit,/La sección Bajas sigue abierta/);
  assert.match(submit,/Confirmar que no faltan más bajas/);
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

test("sealed transfer-line attribution surfaces server rejection and keeps every safety guard",()=>{
  assert.match(ui,/bc7_vincular_lineas_transferencia_jornada/);
  assert.match(ui,/selectedLineIds/);
  assert.match(ui,/p_transferencia_linea_ids:selectedLineIds/);
  assert.match(ui,/reason\.trim\(\)\.length<15/);
  assert.match(ui,/friendlyError\(error,'transfer'\)/);
  assert.match(ui,/context==='transfer'&&\(code==='23514'\|\|code==='23505'\)\) message=raw/);
  assert.match(attributionMigration,/v_s\.estado NOT IN \('PROGRAMADA','EN_CURSO','COMPLETADA','CERRADA_OPERATIVAMENTE'\)/);
  assert.match(attributionMigration,/v_s\.turno_id/);
  assert.match(attributionMigration,/t\.estado='ABIERTO'/);
  assert.match(attributionMigration,/v_t\.fecha<=v_period_end/);
  assert.match(attributionMigration,/v_t\.almacen_destino_id<>v_s\.almacen_id/);
  assert.match(attributionMigration,/v_existing_count>0/);
  assert.match(attributionMigration,/TRANSFERENCIA_LINEAS_RETROACTIVAS_VINCULADAS/);
  assert.match(attributionMigration,/Esta acción fue retirada/);
});


test("final Jornada handover form reads the exact daily rows entered in Step 5",()=>{
  const start=ui.indexOf("async function saveCashDaysWorkspace(form,options){");
  const end=ui.indexOf("async function saveAdminCashDeclaration",start);
  const save=ui.slice(start,end);
  assert.match(save,/const dayRoot=document\.querySelector\('#bc7-cash-days-manager \[data-bc7-close-form\]'\)\|\|form/);
  assert.match(save,/dayRoot\.querySelectorAll\('\[data-bc7-cash-day-row\]'\)/);
  assert.match(save,/if\(options\.date&&date!==String\(options\.date\)\)continue/);
  assert.match(ui,/data-bc7-save-cash-day/);
  const closeStart=ui.indexOf("async function closeSession(form){");
  const closeEnd=ui.indexOf("let checklistModalContext=null",closeStart);
  const close=ui.slice(closeStart,closeEnd);
  assert.match(close,/saveCashDaysWorkspace\(form,\{requireComplete:true,skipConfirm:true,verifyOnly:true\}\)/);
  assert.doesNotMatch(close,/declaracion_dinero\.monto\)\);/);
});
