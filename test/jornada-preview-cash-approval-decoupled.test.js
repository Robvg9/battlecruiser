"use strict";
const { assertPwaReleaseAligned, assertModuleCacheAligned } = require("./helpers/pwa-release-contract");
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const MIGRATION=read("supabase/migrations/20261117001442_jornada_cash_declaration_approval_decoupled.sql");
const ATTRIBUTION_MIGRATION=read("supabase/migrations/20261124200000_jornada_session_inventory_attribution_hardening.sql");
const RESPONSIBLE_MIGRATION=read("supabase/migrations/20261123183000_jornada_responsable_completar_cinco_pasos.sql");
const DAILY_CASH_MIGRATION=read("supabase/migrations/20261123193000_jornada_daily_cash_without_final_declaration.sql");
const DAILY_APPROVALS_MIGRATION=read("supabase/migrations/20261124001500_jornada_daily_approvals_replace_owner_cash_count.sql");
const FIX=read("supabase/migrations/20261119160000_jornada_retroactive_cut_single_cash_count.sql");
const UI=read("public/js/bc7-jornada-ui.js");
const ADMIN=read("public/js/aprobaciones-admin.js");
const APP=read("public/app.js");
const SW=read("public/service-worker.js");
const INDEX=read("public/index.html");

test("Jornada closure checklist remains five steps and Step 5 is daily-only",()=>{
  assert.match(DAILY_CASH_MIGRATION,/v_cash_registered:=v_daily_expected>0/);
  assert.match(DAILY_CASH_MIGRATION,/v_daily_registered=v_daily_expected/);
  assert.match(UI,/data-bc7-checklist-open="declaracion_dinero"/);
  assert.match(UI,/cashDone\?1:0/);
  const start=UI.indexOf("function checklistHtml(detail,isAssigned,status){");
  const end=UI.indexOf("function calculationPhaseHtml(detail){",start);
  assert.ok(start>=0&&end>start);
  const checklist=UI.slice(start,end);
  assert.match(checklist,/Entregas diarias de efectivo/);
  assert.doesNotMatch(checklist,/Declaración de dinero|total final del período/);
});

test("Approved daily cash is the sole retail cash verification; no second Owner count is required",()=>{
  assert.match(DAILY_APPROVALS_MIGRATION,/CREATE OR REPLACE FUNCTION public\.bc7_estado_conteo_efectivo_jornada/);
  assert.match(DAILY_APPROVALS_MIGRATION,/v_daily_approved=v_daily_expected/);
  assert.match(DAILY_APPROVALS_MIGRATION,/'requiere_conteo_fisico',false/);
  assert.doesNotMatch(DAILY_APPROVALS_MIGRATION,/turno_jornada_conteos_caja/);
  assert.match(UI,/rpc\('bc7_estado_conteo_efectivo_jornada'/);
  assert.match(UI,/Verificación del efectivo por aprobaciones diarias/);
  assert.match(UI,/Cada aprobación diaria del Dueño verifica el importe de esa fecha/);
  assert.doesNotMatch(UI,/data-bc7-final-cash-count|data-bc7-final-cash-amount|countFinalCash|bc7_contar_efectivo_dueno_jornada/);
});
test("Retroactive multi-day balances exclude transfers outside the scheduled period unless explicitly linked",()=>{
  assert.match(MIGRATION,/fecha_programada_fin/);
  assert.match(MIGRATION,/BETWEEN v_session\.fecha_programada AND COALESCE\(v_session\.fecha_programada_fin,v_session\.fecha_programada\)/);
  assert.match(MIGRATION,/BETWEEN v_p\.fecha AND coalesce\(v_p\.fecha_fin,v_p\.fecha\)/);
  assert.match(MIGRATION,/linked\.transferencia_id = t\.id/);
});
test("Retroactive transfer attribution is ADMIN-only, line-scoped, one-time, and auditable from the preview",()=>{
  assert.match(ATTRIBUTION_MIGRATION,/CREATE OR REPLACE FUNCTION public\.bc7_vincular_lineas_transferencia_jornada/);
  assert.match(ATTRIBUTION_MIGRATION,/Solo ADMIN puede atribuir líneas históricas/);
  assert.match(ATTRIBUTION_MIGRATION,/El Turno maestro debe seguir ABIERTO/);
  assert.match(ATTRIBUTION_MIGRATION,/turno_jornada_entradas_lineas_vinculadas/);
  assert.match(ATTRIBUTION_MIGRATION,/TRANSFERENCIA_LINEAS_RETROACTIVAS_VINCULADAS/);
  assert.match(ATTRIBUTION_MIGRATION,/aplicacion_unica',true/);
  assert.match(ATTRIBUTION_MIGRATION,/transferencia_linea_id/);
  assert.match(ATTRIBUTION_MIGRATION,/Esta acción fue retirada/);
  assert.match(ATTRIBUTION_MIGRATION,/REVOKE ALL ON FUNCTION public\.bc7_vincular_transferencia_jornada/);
  assert.match(UI,/data-bc7-transfer-line-select/);
  assert.match(UI,/rpc\('bc7_vincular_lineas_transferencia_jornada'/);
  assert.doesNotMatch(UI,/rpc\('bc7_vincular_transferencia_jornada'/);
  assert.match(UI,/Atribuir líneas seleccionadas/);
  assert.match(UI,/solo las líneas seleccionadas/);
});
test("A rejected final declaration can be corrected without erasing the earlier amount from audit history",()=>{
  assert.match(RESPONSIBLE_MIGRATION,/DINERO_DECLARACION_RESPONSABLE_RECTIFICA_RECHAZO/);
  assert.match(RESPONSIBLE_MIGRATION,/monto_anterior/);
  assert.match(RESPONSIBLE_MIGRATION,/declaracion_responsable_previa_conservada/);
  assert.match(RESPONSIBLE_MIGRATION,/monto_contado IS NOT NULL/);
});
test("Workbook preview is read-only and includes movements, adjustments, finance and cash",()=>{
  const start=UI.indexOf("async function openJornadaPreview");
  const end=UI.indexOf("function renderWorkspace(detail)",start);
  assert.ok(start>=0&&end>start);
  const block=UI.slice(start,end);
  for(const token of ["bc7_liquidacion_inventario_jornada","bc7_movimientos_sesion","bc7_finanzas_jornada","bc7_entregas_diarias_jornada","bc7_transferencias_pendientes_vinculo_jornada","PREVISUALIZACIÓN SIN CAMBIOS AUTOMÁTICOS","finance?.bajas","finance?.mermas","Bajas registradas","Transferencias","data-bc7-preview-jornada"]) {
    assert.ok(UI.includes(token), "missing preview token: "+token);
  }
  assert.match(UI,/<summary>Ver más<\/summary>/,"secondary fields stay behind an inline disclosure");
  assert.match(block,/const bajaRows=\[\.\.\.arr\(finance\?\.bajas\),\.\.\.arr\(finance\?\.mermas\)\]/,"both backend adjustment categories appear under Bajas");
  assert.doesNotMatch(block,/Mermas registradas/,"there is no separate Mermas section");
  assert.match(block,/x\.revisado_nombre\?'ADMIN':'Pendiente'/,"reviewer label is shortened to ADMIN");
  assert.match(block,/previewTable\(\['Fecha de registro','Tipo','Producto','Cantidad','Almacén','Usuario'\],movementRows,6\)/,"all useful movement fields stay visible without an operation ID");
  assert.doesNotMatch(block,/String\(x\.operacion_id/,"movement operation IDs are not rendered");
  assert.doesNotMatch(block,/<b>Operación:<\/b>/,"transfer operation IDs are not shown to the user");
  assert.match(block,/const refreshedDetail=await rpc\('bc7_obtener_inventario_jornada'/,"preview re-reads the latest session state so an approved final-day declaration cannot be hidden by stale workspace data");
  assert.match(block,/Object\.assign\(detail,refreshedDetail\)/,"fresh server detail replaces stale preview state");
  assert.match(block,/detail\.liquidacion=null/,"the preview recalculates settlement from the refreshed state");
  assert.match(block,/Dinero recogido por día/,"the cash table is labelled by the daily amounts, not only the delivery mechanism");
  assert.doesNotMatch(block,/bajas\/mermas|baja\(s\)\/merma\(s\)/,"the preview uses only the Bajas terminology");
  assert.match(block,/const finalDeclaration=detail\.sesion\.es_minorista===true\?null:detail\.declaracion_dinero/,"retail preview excludes the legacy final declaration while non-retail retains it");
  assert.match(block,/finalState==='DECLARACION_APROBADA'\?money\(finalDeclaration\.monto\)/,"approved final declared amount is shown without inventing a daily cash row");
  assert.doesNotMatch(block,/previewTable\(\['Producto','Inicial','Entradas','Salidas','Bajas','Mermas'/,"inventory presents one combined Bajas column");
  assert.doesNotMatch(block,/rpc\('(bc7_guardar|bc7_registrar|bc5_cerrar|bc_declarar)/,
    "preview must not write or close the Jornada");
});

test("PWA caches the new Jornada and single-count modules",()=>{
  assertPwaReleaseAligned(assert,{app:APP,serviceWorker:SW,index:INDEX});
  assertModuleCacheAligned(assert,{app:APP,serviceWorker:SW,moduleName:"bc7-jornada-ui.js"});
  assertModuleCacheAligned(assert,{app:APP,serviceWorker:SW,moduleName:"aprobaciones-admin.js"});
  assertModuleCacheAligned(assert,{app:APP,serviceWorker:SW,moduleName:"turno-cash-handover-ui.js"});
});
