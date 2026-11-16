"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const MIGRATION=read("supabase/migrations/20261116200000_jornada_cash_declaration_approval_decoupled.sql");
const UI=read("public/js/bc7-jornada-ui.js");
const ADMIN=read("public/js/aprobaciones-admin.js");
const APP=read("public/app.js");
const SW=read("public/service-worker.js");

test("Jornada closure checklist is five steps and includes the saved final cash declaration",()=>{
  assert.match(MIGRATION,/v_cash_declared boolean/);
  assert.match(MIGRATION,/v_lista_conteo:=v_gastos AND v_reinversiones AND v_bajas AND v_final AND v_cash_declared/);
  assert.match(MIGRATION,/'declaracion_dinero',jsonb_build_object\('completado',v_cash_declared/);
  assert.match(UI,/data-bc7-checklist-cash/);
  assert.match(UI,/\)\/5<\/span>/);
  assert.match(UI,/Declaración de dinero/);
});

test("Final declaration approval is independent and available before session completion",()=>{
  assert.match(MIGRATION,/CREATE OR REPLACE FUNCTION public\.bc7_resolver_declaracion_jornada/);
  assert.match(MIGRATION,/DECLARACION_APROBADA/);
  assert.match(MIGRATION,/GRANT EXECUTE ON FUNCTION public\.bc7_resolver_declaracion_jornada/);
  assert.match(MIGRATION,/d\.estado_aprobacion,/);
  assert.doesNotMatch(MIGRATION,/CASE WHEN s\.estado='COMPLETADA' THEN d\.estado_aprobacion ELSE 'ESPERANDO_ENTREGA'/);
  assert.match(ADMIN,/Aprobar declaración/);
  assert.match(ADMIN,/rpc\('bc7_resolver_declaracion_jornada'/);
  assert.doesNotMatch(ADMIN,/rpc\('bc5_contar_dinero_entregado'/);
  assert.match(MIGRATION,/IF v_s\.estado<>'COMPLETADA' THEN/,"physical cash count remains blocked until handover");
  assert.match(MIGRATION,/DECLARACION_APROBADA/,"approved declaration remains eligible for later physical count");
});

test("Retroactive multi-day balances exclude transfers outside the scheduled period unless explicitly linked",()=>{
  assert.match(MIGRATION,/fecha_programada_fin/);
  assert.match(MIGRATION,/BETWEEN v_session\.fecha_programada AND COALESCE\(v_session\.fecha_programada_fin,v_session\.fecha_programada\)/);
  assert.match(MIGRATION,/BETWEEN v_p\.fecha AND coalesce\(v_p\.fecha_fin,v_p\.fecha\)/);
  assert.match(MIGRATION,/linked\.transferencia_id = t\.id/);
});
test("Retroactive transfer attribution is ADMIN-only, one-time, and auditable from the preview",()=>{
  assert.match(MIGRATION,/CREATE OR REPLACE FUNCTION public\\.bc7_vincular_transferencia_jornada/);
  assert.match(MIGRATION,/Solo ADMIN puede atribuir una transferencia histórica/);
  assert.match(MIGRATION,/El Turno maestro debe seguir ABIERTO/);
  assert.match(MIGRATION,/turno_jornada_entradas_vinculadas/);
  assert.match(MIGRATION,/TRANSFERENCIA_RETROACTIVA_VINCULADA/);
  assert.match(MIGRATION,/aplicacion_unica',true/);
  assert.match(MIGRATION,/Esta transferencia ya está vinculada a otra Jornada/);
  assert.match(UI,/data-bc7-link-transfer/);
  assert.match(UI,/rpc\\('bc7_vincular_transferencia_jornada'/);
  assert.match(UI,/No se dividirá entre días ni se aplicará a Adriana/);
});
test("A rejected declaration can be corrected without erasing the prior value from audit history",()=>{
  assert.match(MIGRATION,/DINERO_REDECLARADO/);
  assert.match(MIGRATION,/monto_anterior',v_old_amount/);
  assert.match(MIGRATION,/monto_nuevo',p_monto/);
  assert.match(UI,/estado_aprobacion\|\|'\)\.toUpperCase\(\)!=='RECHAZADA'/);
});

test("Workbook preview is read-only and includes movements, adjustments, finance and cash",()=>{
  const start=UI.indexOf("async function openJornadaPreview");
  const end=UI.indexOf("function renderWorkspace(detail)",start);
  assert.ok(start>=0&&end>start);
  const block=UI.slice(start,end);
  for(const token of ["bc7_liquidacion_inventario_jornada","bc7_movimientos_sesion","bc7_finanzas_jornada","bc7_entregas_diarias_jornada","bc7_transferencias_pendientes_vinculo_jornada","PREVISUALIZACIÓN SIN CAMBIOS AUTOMÁTICOS","finance?.bajas","finance?.mermas","Bajas registradas","Mermas registradas","Transferencias","data-bc7-preview-jornada"]) {
    assert.ok(UI.includes(token), "missing preview token: "+token);
  }
  assert.doesNotMatch(block,/rpc\('(bc7_guardar|bc7_registrar|bc5_cerrar|bc_declarar)/,
    "preview must not write or close the Jornada");
});

test("PWA caches the new Jornada and admin approval modules",()=>{
  assert.match(APP,/const VERSION="9\.5\.121"/);
  assert.match(SW,/BC_SW_VERSION = "9\.5\.121"/);
  assert.match(APP,/\["bc7-jornada-ui\.js","7\.37"\]/);
  assert.match(SW,/bc7-jornada-ui\.js\?v=7\.37/);
  assert.match(APP,/\["aprobaciones-admin\.js","20261116\.1"\]/);
  assert.match(SW,/aprobaciones-admin\.js\?v=20261116\.1/);
});
