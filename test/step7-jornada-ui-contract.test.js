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
  for(const rpc of ["bc5_mis_jornadas","bc5_guardar_patron_jornada","bc5_previsualizar_jornada","bc5_crear_jornada_unica","bc5_reprogramar_jornada","bc5_iniciar_jornada","bc5_cerrar_jornada","bc7_obtener_inventario_jornada","bc7_guardar_inventario_jornada","bc7_registrar_ajuste_jornada","bc_declarar_dinero","bc7_movimientos_sesion"]) {
    assert.ok(ui.includes(rpc),`UI no wired to ${rpc}`);
  }
  assert.match(ui,/confirm\(/);
  assert.match(ui,/dataset\.bc7Busy/);
  assert.match(ui,/navigator\.onLine/);
  assert.match(ui,/data-tab="jornada"/);
  assert.match(ui,/window\.__BC7_JORNADA__\s*=\s*\{/);
  assert.match(ui,/openForSession:\s*async function\(sessionId\)/);
  assert.match(ui,/openWorkspace\(sessionId\)/);
  assert.match(nav,/jornada: "turnos"/, "jornada is mapped to the canonical turnos.ver permission");
  assert.match(ui,/data-tab=.?ventas/);
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
  assert.ok(sw.includes("./js/bc7-jornada-ui.js?v=" + moduleVersion));
});
