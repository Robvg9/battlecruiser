"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const migration=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261023122714_step7_jornada_inventory_ui.sql"),"utf8");
const ui=fs.readFileSync(path.join(__dirname,"../public/js/bc7-jornada-ui.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
const sw=fs.readFileSync(path.join(__dirname,"../public/service-worker.js"),"utf8");
const nav=fs.readFileSync(path.join(__dirname,"../public/js/permisos-navegacion.js"),"utf8");
const jornadaCss=fs.readFileSync(path.join(__dirname,"../public/bc7-jornada-inventory-mobile.css"),"utf8");
const adminApprovals=fs.readFileSync(path.join(__dirname,"../public/js/aprobaciones-admin.js"),"utf8");
const multiDayCashMigration=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261113230000_admin_label_final_cash_by_master_turno_day.sql"),"utf8");

test("Step 7 has session-scoped, immutable inventory snapshots and gates start/close server-side",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.turno_jornada_inventario_cortes/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.turno_jornada_inventario_lineas/);
  assert.match(migration,/CONSTRAINT turno_jornada_corte_unico_tipo UNIQUE \(turno_sesion_id,tipo\)/);
  assert.match(migration,/BEFORE UPDATE OF estado ON public\.turno_sesiones/);
  assert.match(migration,/Antes de abrir la jornada debes confirmar el inventario inicial/);
  assert.match(migration,/Antes de cerrar la jornada debes confirmar el inventario final/);
  assert.match(migration,/public\.crear_merma\(v_s\.almacen_id,p_producto_id,p_cantidad,btrim\(p_motivo\),NULL,v_s\.id,p_idempotency_key\)/);
  assert.match(migration,/public\.crear_baja\(v_s\.almacen_id,p_producto_id,p_cantidad,btrim\(p_motivo\),NULL,v_s\.id,p_idempotency_key\)/);
  assert.match(migration,/REVOKE ALL ON TABLE public\.turno_jornada_inventario_cortes,public\.turno_jornada_inventario_lineas[\s\S]*FROM PUBLIC,anon,authenticated/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.bc7_guardar_inventario_jornada\(uuid,text,jsonb,text\) TO authenticated/);
  assert.doesNotMatch(migration,/\bDROP\s+TABLE\b|\bTRUNCATE\s/i);
});

test("Step 7 interface uses the canonical jornada RPCs and explicit safe-write confirmations",()=>{
  for(const rpc of ["bc5_mis_jornadas","bc5_guardar_patron_jornada","bc5_previsualizar_jornada","bc5_crear_jornada_unica","bc5_reprogramar_jornada","bc5_iniciar_jornada","bc5_cerrar_jornada","bc7_obtener_inventario_jornada","bc7_guardar_inventario_jornada","bc7_registrar_ajuste_jornada","bc7_registrar_bajas_multiple_jornada","bc7_registrar_gasto_jornada","bc7_registrar_reinversion_jornada","bc7_finanzas_jornada","bc7_ventas_jornada","bc_declarar_dinero","bc7_movimientos_sesion"]) {
    assert.ok(ui.includes(rpc),`UI no wired to ${rpc}`);
  }
  assert.match(ui,/confirm\(/);
  assert.match(ui,/dataset\.bc7Busy/);
  assert.match(ui,/navigator\.onLine/);
  assert.match(ui,/data-tab="jornada"/);
  assert.match(ui,/window\.__BC7_JORNADA__\s*=\s*\{/);
  assert.match(ui,/Registrar baja o merma|Registrar baja|Registrar merma/,"la interfaz ofrece los ajustes permitidos");
  assert.match(ui,/data-bc7-ajust-cause/,"cada ajuste exige un motivo explícito");
  const opStart=ui.indexOf("const op='<div class=\"bc7-panel-stack\">");
  const opEnd=ui.indexOf("const mov='<div class=\"bc7-panel-stack\">",opStart);
  assert.ok(opStart>=0&&opEnd>opStart,"one operation panel exists");
  const operationPanel=ui.slice(opStart,opEnd);
  assert.ok(operationPanel.includes("bc7-checklist-section-source")&&operationPanel.includes("fin+adjustment"),"cash, finance and adjustment content remain available to their focused checklist modals");
  assert.doesNotMatch(ui,/data-bc7-workspace-tab="finanzas"/,"finances are no longer a separate task tab");
  const financeStart=ui.indexOf("function financeFormHtml(detail,isAssigned,status){");
  const financeEnd=ui.indexOf("function cashDaysManagerShellHtml(detail,isAssigned,status){",financeStart);
  assert.ok(financeStart>=0&&financeEnd>financeStart,"finance forms render in the unified operation panel");
  const financeMarkup=ui.slice(financeStart,financeEnd);
  for(const control of ["data-bc7-finance-form=\"gasto\"","data-bc7-finance-form=\"reinversion\"","bc7-inventory-settlement","Registrar gasto","Registrar reinversión"]) {
    assert.ok(financeMarkup.includes(control),`finance content must include ${control}`);
  }
  assert.match(ui,/data-bc7-adjust-form/,"baja/merma form is composed in the same operation panel");
  assert.match(ui,/Hay bajas preparadas que todavía no se han enviado/,"checklist evidence cannot silently discard unsent Baja form input");
  assert.match(ui,/Confirmar que no faltan más bajas/,"the checklist action is explicit that it only confirms no more requests remain");
  assert.match(ui,/El botón inferior solo confirma que no faltan más registros/,"the modal explains that evidence confirmation does not save incomplete Baja rows");
  assert.match(multiDayCashMigration,/COALESCE\(t\.dias_turno,s\.numero_dia\)::text/,"final cash declaration uses the final day of the master multi-day Turno");
  assert.match(multiDayCashMigration,/JOIN public\.turnos t ON t\.id=s\.turno_id/,"the administrative queue resolves the master Turno day count");

  assert.match(ui,/data-bc7-adjustment-row/,"a baja request contains a repeatable list of product lines");
  assert.match(ui,/data-bc7-adjustment-add/,"the user can add multiple products to one baja request");
  assert.match(ui,/bc7_registrar_bajas_multiple_jornada/,"multiple bajas are sent through the Jornada-aware grouped RPC");
  assert.match(ui,/result=await rpc\('bc7_registrar_bajas_multiple_jornada'/,"the frontend reads back the grouped request state");
  assert.match(ui,/bajaState==='APROBADA'/,"the UI distinguishes server-side auto-approval from a pending approval list");
  assert.match(ui,/p_motivo_general:reason/,"the list shares one administrative reason");
  assert.match(ui,/friendlyError\(e,'adjustment'\)/,"stock errors are reported as inventory errors, not schedule-creation errors");
  assert.match(ui,/data-stock=/,"each candidate product carries its current available stock into validation");
  assert.match(ui,/detail\.productos_ajuste/,"the adjustment picker loads every active catalog product for the current warehouse");
  assert.match(ui,/AGOTADO · stock 0/,"out-of-stock products remain visible and searchable in the picker");
  assert.match(ui,/line\.stock<=0/,"the form refuses to submit a Baja when the selected product has no stock");
  assert.match(ui,/availableAdjustmentProducts=products\.filter\(p=>Number\(p\.stock_actual\)>0\)/,"only positive-stock products enable Baja/Merma submission");
  assert.match(ui,/bc7_productos_ajuste_jornada/,"the full catalog is loaded from a warehouse-scoped server RPC");
  assert.match(ui,/new Set\(lines\.map\(line=>line\.producto_id\)\)/,"duplicate products in one list are blocked before submission");
  assert.match(ui,/data-bc7-reinvestment-unit-cost/,"reinvestment captures the unit cost");
  assert.match(ui,/Math\.round\(quantity\*unitCost\*100\)\/100/,"reinvestment total is derived from quantity multiplied by unit cost");
  assert.match(ui,/data-bc7-reinvestment-estimate/,"the reinvestment form previews the calculated total");
  assert.match(jornadaCss,/#tab-jornada #bc7-movements \.bc7-table-wrap[\s\S]*overflow-x: auto !important/,"movement table scrolls inside its own container");
  assert.match(jornadaCss,/#tab-jornada #bc7-movements \.bc7-movements-table[\s\S]*min-width: 760px/,"movement columns remain readable without pushing the refresh action outside the panel");
  assert.match(ui,/data-bc7-ajust-type/,"cuando el rol tiene ambos permisos se puede elegir baja o merma");
  for(const cause of ["Producto vencido","Producto roto o dañado","Consumo del dueño","Otra causa"]) assert.ok(ui.includes(cause),`falta el motivo ${cause}`);
  assert.match(ui,/const adjustmentStorageType=canCreateBaja\?'baja':'merma'/,"el tipo predeterminado respeta los permisos disponibles");
  assert.match(ui,/openForSession:\s*async function\(sessionId\)/);
  assert.match(ui,/openWorkspace\(sessionId\)/);
  assert.match(nav,/jornada: "turnos"/, "jornada is mapped to the canonical turnos.ver permission");
  assert.match(nav,/return !!seccion && tienePermiso\(seccion, "ver"\)/, "routes require the effective read permission");
  assert.match(nav,/if \(tab === "ventas" && esDependienta\(\)\) return false/, "Dependienta keeps the ordinary POS route hidden");
  assert.match(nav,/RUTAS_PERSONALES = \{ conectividad: true, preferencias: true \}/, "only the two explicit personal routes bypass business permissions");
  assert.match(ui,/data-tab=.?ventas/);
});


test("canonical Jornada planner applies the database two-day minimum in input and save paths",()=>{
  assert.match(ui,/id="bc7-days-count" type="number" min="2" max="31"/);
  assert.match(ui,/function scheduleDayCount\(\)/);
  assert.match(ui,/const n=scheduleDayCount\(\)/);
  assert.match(ui,/bc5_crear_jornada_unica/);
});

test("Jornada POS UI separates payment methods and cash declaration from gross sales",()=>{
  assert.match(ui,/cashDeclarationHtml\(detail\)/);
  assert.match(ui,/renderSalesLedger\(host,data\)/);
  assert.match(ui,/bc7_ventas_jornada/);
  assert.match(ui,/Ventas por forma de pago/);
  assert.match(ui,/NO_DECLARADO/);
  assert.match(ui,/bc7_liquidacion_inventario_jornada/);
  assert.match(ui,/Efectivo esperado/);
  assert.match(ui,/No equivale al efectivo esperado/);
  assert.match(ui,/ventas nuevas vinculadas de forma verificable/);
  assert.ok(sw.includes("./js/ventas.js?v=20261105.2"));
  assert.ok(sw.includes("./js/venta-turno-ui.js?v=9.4.46"));
  assert.ok(sw.includes("./js/m27-6b-venta-payload-pres.js?v=27.6b2"));
});

test("iniciar una jornada relee la sesión mayorista y recalcula el archivo POS",()=>{
  const helperAt=ui.indexOf("async function refreshPosArchiveAfterSessionStart()");
  const startAt=ui.indexOf("async function startSession(btn)");
  const closeAt=ui.indexOf("async function closeSession(form)",startAt);
  assert.ok(helperAt>=0 && startAt>helperAt && closeAt>startAt,"la política de sesión debe tener helper dedicado junto a apertura");
  const helper=ui.slice(helperAt,startAt);
  const start=ui.slice(startAt,closeAt);
  assert.match(helper,/await window\.__BC_M25_refrescarTurno\(\)/,"primero refresca el turno canónico cuando está disponible");
  assert.match(helper,/await window\.refrescarTurnoActual\(\)/,"incluye la ruta de compatibilidad para refrescar el turno");
  assert.match(helper,/window\.__BC_M74_SYNC_POS_ARCHIVE__\('jornada-started'\)/,"después de refrescar vuelve a evaluar el POS archivado");
  const open=start.indexOf("await rpc('bc5_iniciar_jornada'");
  const refresh=start.indexOf("await refreshPosArchiveAfterSessionStart()");
  const reload=start.indexOf("await loadCalendar()");
  assert.ok(open>=0 && refresh>open && reload>refresh,"la secuencia debe ser: backend abre, refrescar sesión/POS, recargar el workspace");
});

test("The Step 7 bundle is version aligned and available in the offline shell",()=>{
  const appVersion = app.match(/const VERSION="([^"]+)"/);
  const workerVersion = sw.match(/BC_SW_VERSION = "([^"]+)"/);
  assert.ok(appVersion && workerVersion);
  assert.equal(workerVersion[1], appVersion[1]);
  const marker = '["bc7-jornada-ui.js","';
  const start = app.indexOf(marker);
  assert.ok(start >= 0, "Step 7 UI module must be registered in the app loader");
  const valueStart = start + marker.length;
  const end = app.indexOf('"', valueStart);
  const moduleVersion = app.slice(valueStart, end);
  assert.equal(moduleVersion,"7.29");
  assert.ok(sw.includes("./js/bc7-jornada-ui.js?v=" + moduleVersion));
  assert.ok(app.includes('["aprobaciones-admin.js","20261113.4"]'));
  assert.ok(sw.includes("./js/aprobaciones-admin.js?v=20261113.4"));
  assert.ok(sw.includes("./bc7-jornada-inventory-mobile.css?v=20261113.4"));
});


test("Dependienta can open her active jornada without searching a future-only calendar range",()=>{
  assert.match(ui,/rpc\('turno_actual_usuario'/);
  assert.match(ui,/id="bc7-current-session-card"/);
  assert.match(ui,/data-bc7-current-open/);
  assert.match(ui,/data-bc7-current-finance/);
  assert.match(ui,/addDays\(today,-7\)/);
  assert.match(ui,/state\.currentSession\?\.turno_sesion_id/);
});


test("Jornada handover precedes Owner cash count and automatic calculation",()=>{
  for(const rpcName of ["bc7_estado_confirmaciones_jornada","bc7_confirmar_bloque_jornada","bc7_productos_ajuste_jornada","bc5_contar_dinero_entregado"]) {
    assert.ok(ui.includes(rpcName),`Jornada workflow must call ${rpcName}`);
  }
  assert.match(ui,/Checklist de Sheila/);
  assert.match(ui,/¿Ya pusiste todos los gastos\?/);
  assert.match(ui,/¿Ya pusiste todas las reinversiones\?/);
  assert.match(ui,/¿Ya pusiste todas las bajas\?/);
  assert.match(ui,/Las entradas\/transferencias las registra el Dueño/);
  assert.match(ui,/lista_para_conteo/);
  assert.match(ui,/lista_para_calcular/);
  assert.doesNotMatch(ui,/detail\.checklist\?\.lista_para_calcular!==true/);
  assert.match(ui,/LISTA_PARA_ENTREGA/);
  assert.match(ui,/Jornada entregada al Dueño/);
  assert.match(ui,/Cálculos automáticos completados/);
  assert.match(ui,/[Ee]l Turno todavía no está cerrado/);
});

test("Cash declaration can be saved before the final inventory unlocks jornada closure",()=>{
  assert.match(ui,/async function saveCashDeclaration\(form/);
  assert.match(ui,/data-bc7-save-cash/);
  assert.match(ui,/data-bc7-save-cash-days/);
  assert.match(ui,/saveCashDaysWorkspace\(form,\{requireComplete:true,skipConfirm:true\}\)/);
  assert.match(ui,/rpc\('bc_declarar_dinero'/);
  assert.match(ui,/El cierre se habilitará al confirmar el inventario final/);
  assert.match(ui,/Finalizar jornada/);
});

test("Jornada inventory count table exposes labelled cells for accessible mobile product cards",()=>{
  assert.match(ui,/bc7-table-wrap\{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto/);
  assert.match(ui,/bc7-table\{width:100%;min-width:720px/);
  assert.match(ui,/bc7-table-wide\{min-width:980px/);
  assert.match(ui,/bc7-table-scroll-hint/);
  assert.match(ui,/bc7-count-table/);
  assert.match(ui,/data-label="Conteo físico actual"/);
  assert.match(ui,/data-bc7-count=/);
});

test("Daily cash approvals display the feminine state labels returned by the server",()=>{
  assert.match(ui,/APROBADA:'Aprobada'/);
  assert.match(ui,/RECHAZADA:'Rechazada'/);
  assert.match(ui,/status==='APROBADA'/);
});
