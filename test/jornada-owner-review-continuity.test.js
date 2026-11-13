"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const MIG=read("supabase/migrations/20261113230500_jornada_owner_review_continuity.sql");
const ADMIN=read("public/js/aprobaciones-admin.js");
const JOURNEY=read("public/js/bc7-jornada-ui.js");
const REVIEW=read("public/js/jornada-owner-review.js");
const APP=read("public/app.js"),SW=read("public/service-worker.js"),INDEX=read("public/index.html");

test("A pending owner approval never blocks a new non-overlapping Jornada schedule",()=>{
  assert.match(MIG,/DROP INDEX IF EXISTS public\.ux_turnos_maestro_unico_activo_por_almacen/);
  assert.match(MIG,/WHERE estado='ABIERTO' AND dias_turno IS NULL/);
  assert.doesNotMatch(MIG,/Hay un Turno activo para este almac.n; reconc.lielo antes de crear la jornada nueva/);
  assert.match(MIG,/GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT/);
});
test("The delayed handover after 23:00 no longer needs an exception reason",()=>{
  assert.match(MIG,/v_tardia AND trim\(coalesce\(p_motivo_excepcion,''\)\)=''/);
  assert.match(MIG,/JORNADA_ENTREGADA_TARDE/);
  assert.match(MIG,/fin_operativo_at/);
  assert.match(JOURNEY,/Entregar los datos después de las 23:00 no requiere motivo/);
});
test("The active operational session and employee tranche guards remain in the original start function",()=>{
  assert.doesNotMatch(MIG,/DROP INDEX IF EXISTS public\.ux_turno_sesion_activa_almacen/);
  assert.match(MIG,/turno_tramos/);
  assert.match(MIG,/turno_jornada_programacion/);
});
test("Completed Jornada reviews stay visible after cash is counted",()=>{
  assert.match(MIG,/'jornada_revision'::text/);
  assert.match(MIG,/NOT EXISTS\(SELECT 1 FROM public\.turno_revisiones tr[\s\S]*tr\.estado='APROBADO'/);
  assert.match(ADMIN,/x\.tipo==='jornada_revision'/);
  assert.match(ADMIN,/bcAbrirRevisionJornada/);
  assert.match(JOURNEY,/data-bc7-open-owner-review/);
});
test("Owner review shows product-level revenue, cost provenance, profit and post-cut movements",()=>{
  assert.match(MIG,/bc7_obtener_revision_jornada/);
  assert.match(MIG,/COSTO_PROMEDIO_PONDERADO_LOTES/);
  assert.match(MIG,/movimientos_posteriores_corte/);
  assert.match(MIG,/bc7_clasificar_movimientos_fuera_corte/);
  assert.match(MIG,/bc7_resolver_revision_jornada/);
  for(const field of ["inventario_inicial","inventario_final","unidades_vendidas","importe_estimado","costo_vendido_estimado","ganancia_bruta_estimada","margen_bruto_estimado"])assert.ok(REVIEW.includes(field),field);
});
test("Salary percentage can be explicitly set after a completed session but before master approval",()=>{
  assert.match(MIG,/v_master_estado IN \('CERRADO','CANCELADO'\)/);
  assert.match(MIG,/bc7_configurar_salario_porcentaje_jornada/);
  assert.match(REVIEW,/bc7_configurar_salario_porcentaje_jornada/);
  assert.match(REVIEW,/Es una decisión del Dueño; no se aplica un valor predeterminado/);
});
test("The app shell loads the new owner review module and keeps cache versions aligned",()=>{
  assert.match(APP,/VERSION="9\.5\.105"/);
  assert.match(APP,/jornada-owner-review\.js","1\.0"/);
  assert.match(SW,/BC_SW_VERSION = "9\.5\.105"/);
  assert.match(SW,/jornada-owner-review\.js\?v=1\.0/);
  assert.match(INDEX,/v9\.5\.105/);
});
