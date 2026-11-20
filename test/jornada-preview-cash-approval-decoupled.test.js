"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const MIGRATION=read("supabase/migrations/20261117001442_jornada_cash_declaration_approval_decoupled.sql");
const FIX=read("supabase/migrations/20261119160000_jornada_retroactive_cut_single_cash_count.sql");
const UI=read("public/js/bc7-jornada-ui.js");
const ADMIN=read("public/js/aprobaciones-admin.js");
const APP=read("public/app.js");
const SW=read("public/service-worker.js");

test("Jornada closure checklist is five steps and includes the saved final cash declaration",()=>{
  assert.match(MIGRATION,/v_cash_declared boolean/);
  assert.match(MIGRATION,/v_lista_conteo:=v_gastos AND v_reinversiones AND v_bajas AND v_final AND v_cash_declared/);
  assert.match(MIGRATION,/'declaracion_dinero',jsonb_build_object\('completado',v_cash_declared/);
  assert.match(UI,/data-bc7-checklist-cash/);
  assert.ok(UI.includes("+(cashDeclared?1:0))+'/5</span></div>'"), "the five-step progress counter includes the cash declaration");
  assert.match(UI,/Declaración de dinero/);
});

test("Final declaration and physical cash count are one Owner action in Centro de Control",()=>{
  assert.ok(FIX.includes("bc5_contar_dinero_entregado"));
  assert.ok(FIX.includes("La declaración final debe confirmarse con el conteo físico en una sola acción."));
  assert.ok(FIX.includes("NOT IN ('PENDIENTE','ESPERANDO_APROBACION','DECLARACION_APROBADA')"));
  assert.ok(ADMIN.includes("Confirmar conteo físico"));
  assert.ok(ADMIN.includes("rpc('bc5_contar_dinero_entregado'"));
  assert.ok(ADMIN.includes("rpc('bc7_resolver_declaracion_jornada'"),"rejection remains available to request correction");
  assert.ok(!ADMIN.includes("Aprobar declaración"));
  assert.ok(ADMIN.includes("Registra aquí el efectivo contado físicamente"));
  assert.ok(MIGRATION.includes("IF v_s.estado<>'COMPLETADA' THEN"),"physical count remains blocked until handover");
  assert.ok(MIGRATION.includes("lista_para_conteo"),"the employee checklist remains required");
});

test("Retroactive multi-day balances exclude transfers outside the scheduled period unless explicitly linked",()=>{
  assert.match(MIGRATION,/fecha_programada_fin/);
  assert.match(MIGRATION,/BETWEEN v_session\.fecha_programada AND COALESCE\(v_session\.fecha_programada_fin,v_session\.fecha_programada\)/);
  assert.match(MIGRATION,/BETWEEN v_p\.fecha AND coalesce\(v_p\.fecha_fin,v_p\.fecha\)/);
  assert.match(MIGRATION,/linked\.transferencia_id = t\.id/);
});
test("Retroactive transfer attribution is ADMIN-only, one-time, and auditable from the preview",()=>{
  assert.match(MIGRATION,/CREATE OR REPLACE FUNCTION public\.bc7_vincular_transferencia_jornada/);
  assert.match(MIGRATION,/Solo ADMIN puede atribuir una transferencia histórica/);
  assert.match(MIGRATION,/El Turno maestro debe seguir ABIERTO/);
  assert.match(MIGRATION,/turno_jornada_entradas_vinculadas/);
  assert.match(MIGRATION,/TRANSFERENCIA_RETROACTIVA_VINCULADA/);
  assert.match(MIGRATION,/aplicacion_unica',true/);
  assert.match(MIGRATION,/Esta transferencia ya está vinculada a otra Jornada/);
  assert.match(UI,/data-bc7-link-transfer/);
  assert.match(UI,/rpc\('bc7_vincular_transferencia_jornada'/);
  assert.match(UI,/No se dividirá entre días ni se aplicará a otra jornada/);
});
test("A rejected declaration can be corrected without erasing the prior value from audit history",()=>{
  assert.match(MIGRATION,/DINERO_REDECLARADO/);
  assert.match(MIGRATION,/monto_anterior',v_old_amount/);
  assert.match(MIGRATION,/monto_nuevo',p_monto/);
  assert.match(UI,/String\(declaration\.estado_aprobacion\|\|''\)\.toUpperCase\(\)!=='RECHAZADA'/);
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
  assert.match(block,/const finalDeclaration=detail\.declaracion_dinero/,"the final cash declaration is included separately from daily entries");
  assert.match(block,/finalState==='DECLARACION_APROBADA'\?money\(finalDeclaration\.monto\)/,"approved final declared amount is shown without inventing a daily cash row");
  assert.doesNotMatch(block,/previewTable\(\['Producto','Inicial','Entradas','Salidas','Bajas','Mermas'/,"inventory presents one combined Bajas column");
  assert.doesNotMatch(block,/rpc\('(bc7_guardar|bc7_registrar|bc5_cerrar|bc_declarar)/,
    "preview must not write or close the Jornada");
});

test("PWA caches the new Jornada and single-count modules",()=>{
  assert.ok(APP.includes('const VERSION="9.5.129"'));
  assert.ok(SW.includes('BC_SW_VERSION = "9.5.129"'));
  assert.ok(APP.includes('["bc7-jornada-ui.js","7.44"]'));
  assert.ok(SW.includes("bc7-jornada-ui.js?v=7.44"));
  assert.ok(APP.includes('["aprobaciones-admin.js","20261119.1"]'));
  assert.ok(SW.includes("aprobaciones-admin.js?v=20261119.1"));
  assert.ok(APP.includes('["turno-cash-handover-ui.js","1.2"]'));
  assert.ok(SW.includes("turno-cash-handover-ui.js?v=1.2"));
});
