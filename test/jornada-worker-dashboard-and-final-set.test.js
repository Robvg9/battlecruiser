"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const UI=read("public/js/bc7-jornada-ui.js");
const NAV=read("public/js/permisos-navegacion.js");
const INDEX=read("public/index.html");
const APP=read("public/app.js");
const SW=read("public/service-worker.js");
const CSS=read("public/bc7-jornada-inventory-mobile.css");
const MIG=read("supabase/migrations/20261125033000_jornada_dashboard_checklist_final_product_set.sql");
const PRICE=read("public/js/jornada-price-changes.js");
const PRICE_MIG=read("supabase/migrations/20261121031512_jornada_price_context_human_period.sql");

test("daily cash is Step 1 and final inventory remains Step 5",()=>{
  assert.match(UI,/data-bc7-checklist-step="1"/);
  assert.match(UI,/data-bc7-checklist-step="5"/);
  assert.match(UI,/cashRow\+rows\+finalRow\+/);
  assert.match(UI,/Completar paso 1/);
  assert.match(UI,/Dinero del período · Paso 1/);
});

test("Dependienta lands on a dedicated dashboard with direct Jornada shortcuts",()=>{
  assert.match(INDEX,/data-tab="mi-jornada"/);
  assert.match(INDEX,/id="tab-mi-jornada"/);
  assert.match(NAV,/tab === "mi-jornada"\) return esDependienta\(\) && tienePermiso\("turnos", "ver"\)/);
  assert.match(NAV,/"mi-jornada", "resumen"/);
  assert.match(UI,/data-bc7-worker-shortcut/);
  for(const key of ["declaracion_dinero","gastos","reinversiones","bajas","inventario_final"])assert.ok(UI.includes(key));
});

test("Step 1 check refreshes from server and preserves the Owner cash-review action",()=>{
  assert.match(UI,/bc7_estado_confirmaciones_jornada/);
  assert.match(UI,/refreshCashChecklistStep\(latest\)/);
  assert.match(UI,/Revisar y contar efectivo/);
  assert.match(UI,/row\.querySelector\('\.bc7-pill\.ok'\)\?\.remove\(\)/);
});

test("mouse wheel cannot mutate number input values",()=>{
  assert.match(APP,/addEventListener\("wheel"[\s\S]*input\[type=number\][\s\S]*event\.preventDefault\(\)/);
});

test("admin archive distinguishes sealed, pending master-close and truly closed Turnos",()=>{
  assert.match(UI,/bc7-archived-schedule/);
  assert.match(UI,/Pendiente de cuadre/);
  assert.match(UI,/Pendiente de cierre maestro/);
  assert.match(MIG,/turno_estado_maestro/);
  assert.match(MIG,/LEFT JOIN public\.turnos t ON t\.id=p\.turno_id/);
});

test("movement attribution table supports select-all and fits its container",()=>{
  assert.match(UI,/data-bc7-transfer-select-all/);
  assert.match(UI,/host\.onchange/);
  assert.match(CSS,/bc7-pending-inbound-table\{width:100%[^}]*min-width:0/s);
  assert.match(CSS,/overflow-x:hidden!important/);
  assert.match(CSS,/width:16px!important/);
});

test("Baja submission reopens Bajas without confirming there are no more entries",()=>{
  assert.match(UI,/const reopenBajas=storageType==='baja'/);
  assert.match(UI,/openChecklistSection\('bajas'\)/);
  assert.match(UI,/Confirmar que no faltan más bajas/);
  const start=UI.indexOf("async function submitAdjustment(form){");
  const end=UI.indexOf("async function openRetroSuccessorPanel",start);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(UI.slice(start,end),/bc7_confirmar_bloque_jornada/);
});

test("sealed FINAL uses period products while preserving INICIAL and global stock",()=>{
  assert.match(UI,/const products=arr\(detail\.productos\)/);
  assert.match(MIG,/bc7_jornada_productos_corte\(v_s\.id,'FINAL'\)/);
  assert.doesNotMatch(MIG,/UPDATE public\.turno_jornada_inventario_lineas|SET cantidad_contada/);
  assert.match(MIG,/stock_global_modificado',false/);
  assert.match(MIG,/corte_inicial_modificado',false/);
  assert.match(MIG,/INVENTARIO_FINAL_RESPONSABLE_POST_SELLO/);
  assert.match(MIG,/INVENTARIO_FINAL_ADMIN_POST_SELLO/);
});

test("integral admin review requires all five retail steps",()=>{
  assert.match(MIG,/chk\.gastos_completado/);
  assert.match(MIG,/chk\.reinversiones_completado/);
  assert.match(MIG,/chk\.bajas_completado/);
  assert.match(MIG,/final_cut\.tipo='FINAL'/);
  assert.match(MIG,/count\(DISTINCT e\.fecha\)/);
  assert.match(MIG,/e\.estado<>'RECHAZADA'/);
});

test("price-change eligibility remains unchanged in this mission",()=>{
  assert.match(PRICE,/bc7_cambios_precio_contexto/);
  assert.match(PRICE_MIG,/s\.estado='EN_CURSO'/);
  assert.match(PRICE_MIG,/tr\.estado='ACTIVO'/);
  assert.doesNotMatch(MIG,/bc7_cambios_precio_contexto/);
});

test("PWA asset versions are aligned",()=>{
  assert.match(APP,/9\.5\.156/);
  assert.match(SW,/9\.5\.156/);
  assert.match(APP,/bc7-jornada-ui\.js","7\.62"/);
  assert.match(SW,/bc7-jornada-ui\.js\?v=7\.62/);
  assert.match(INDEX,/bc7-jornada-inventory-mobile\.css\?v=20261116\.3/);
  assert.match(SW,/bc7-jornada-inventory-mobile\.css\?v=20261116\.3/);
});
