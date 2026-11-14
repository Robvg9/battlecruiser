"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const MIG=read("supabase/migrations/20261113230500_jornada_owner_review_continuity.sql");
const SQL_CONTRACT=read("test/jornada-owner-review-continuity-contract.sql");
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
  assert.match(REVIEW,/m\.fecha_revision/);
  assert.match(REVIEW,/<th>Aprobado<\/th>/);
  for(const field of ["inventario_inicial","inventario_final","unidades_vendidas","importe_estimado","costo_vendido_estimado","ganancia_bruta_estimada","margen_bruto_estimado"])assert.ok(REVIEW.includes(field),field);
});
test("Unpriced products with zero sales do not block the Jornada settlement",()=>{
  assert.match(MIG,/precio_unitario IS NULL AND sold_qty>0/);
  assert.match(MIG,/v_missing_price_sold=0/);
  assert.match(MIG,/'familias_sin_precio',v_missing_price_sold/);
});
test("The Owner review does not display zero profit or cost when provisional rows are hidden",()=>{
  assert.ok(REVIEW.includes("No calculable"));
  assert.ok(REVIEW.includes("Las ventas y ganancias provisionales están ocultas"));
  assert.ok(REVIEW.includes("todavía no se ha completado."));
});
test("Salary percentage can be explicitly set after a completed session but before master approval",()=>{
  assert.match(MIG,/v_master_estado IN \('CERRADO','CANCELADO'\)/);
  assert.match(MIG,/bc7_configurar_salario_porcentaje_jornada/);
  assert.match(REVIEW,/bc7_configurar_salario_porcentaje_jornada/);
  assert.match(REVIEW,/Es una decisión del Dueño; no se aplica un valor predeterminado/);
});
test("The disposable PostgreSQL contract asserts RLS, operational guards, RPC grants and queue wiring",()=>{
  for(const token of ["ux_turnos_maestro_unico_activo_por_almacen","ux_turno_sesion_activa_almacen","turno_tramo_activo_unico","jornada_revision","bc7_obtener_revision_jornada","bc7_clasificar_movimientos_fuera_corte","bc7_resolver_revision_jornada"])assert.ok(SQL_CONTRACT.includes(token),token);
});
test("The app shell loads the new owner review module and keeps cache versions aligned",()=>{
  assert.match(APP,/VERSION="9\.5\.106"/);
  assert.match(APP,/jornada-owner-review\.js","1\.1"/);
  assert.match(SW,/BC_SW_VERSION = "9\.5\.106"/);
  assert.match(SW,/jornada-owner-review\.js\?v=1\.1/);
  assert.match(INDEX,/v9\.5\.106/);
});


test("Unclassified post-cutoff Bajas and Mermas block provisional sales and salary",()=>{
  assert.match(MIG,/v_pending_post/);
  assert.match(MIG,/coalesce\(b\.fecha_revision,b\.actualizado_en,b\.creado_en\)/);
  assert.match(MIG,/coalesce\(m\.fecha_revision,m\.actualizado_en,m\.creado_en\)/);
  assert.match(MIG,/IF v_pending_post>0 THEN/);
  assert.match(MIG,/v_sales_total:=NULL/);
  assert.match(MIG,/v_salary:=NULL/);
  assert.match(MIG,/v_complete[\s\S]*v_pending_post=0/);
});


test("Owner review modal uses BattleCruiser theme tokens and accessible light surfaces",()=>{
  assert.match(REVIEW,/background:var\(--stone,#122a24\);color:var\(--text,#f5efe3\)/);
  assert.ok(REVIEW.includes("body.bc-theme-light .bcjr-dialog{background:#e9e4da;color:#202722}"));
  assert.ok(REVIEW.includes("body.bc-theme-light .bcjr-card{background:#f3efe6"));
  assert.match(REVIEW,/bcjr-field select option/);
});
test("Owner review product inventory is collapsed behind an explicit detail control",()=>{
  assert.match(REVIEW,/<details class="bcjr-inventory"><summary>/);
  assert.match(REVIEW,/Ver inventario y liquidación por producto/);
  assert.match(REVIEW,/bcjr-inventory\[open\]>summary/);
  assert.match(APP,/VERSION="9\.5\.106"/);
  assert.match(APP,/jornada-owner-review\.js","1\.1"/);
  assert.match(SW,/BC_SW_VERSION = "9\.5\.106"/);
  assert.match(SW,/jornada-owner-review\.js\?v=1\.1/);
  assert.match(INDEX,/v9\.5\.106/);
});


test("Post-cutoff classification controls remain visible and usable on mobile without a wide table",()=>{
  assert.match(REVIEW,/bcjr-movement-card/);
  assert.match(REVIEW,/bcjr-movement-decision/);
  assert.match(REVIEW,/Antes del inventario final/);
  assert.match(REVIEW,/Después del inventario final/);
  assert.match(REVIEW,/Guardar clasificación auditada/);
  assert.doesNotMatch(REVIEW,/bcjr-movement-list.*<table/);
});


test("Owner review primary action keeps sufficient dark-mode contrast",()=>{
  assert.ok(REVIEW.includes(".bcjr-btn.primary{background:#315d4a;color:white;border-color:transparent}"));
  assert.ok(REVIEW.includes("body.bc-theme-light .bcjr-btn.primary{background:#315d4a;color:#fff"));
});


test("Light theme review surfaces override global white table and input styles",()=>{
  assert.ok(REVIEW.includes("background:#f3efe6!important;color:#202722!important;border-color:#c9bfac!important"));
  assert.ok(REVIEW.includes("background:#f8f5ed!important;color:#202722!important;border-color:#b8ad98!important"));
});


test("Inventory detail control remains available even while calculation lines are blocked",()=>{
  assert.ok(REVIEW.includes("Datos pendientes de clasificación"));
  assert.ok(REVIEW.includes("Todavía no hay líneas de inventario calculadas para mostrar"));
  assert.ok(REVIEW.includes("vuelve a abrir esta revisión para consultar la tabla por producto"));
});
