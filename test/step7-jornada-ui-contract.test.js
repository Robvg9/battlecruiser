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
  for(const rpc of ["bc5_mis_jornadas","bc5_guardar_patron_jornada","bc5_previsualizar_jornada","bc5_crear_jornada_unica","bc5_reprogramar_jornada","bc5_iniciar_jornada","bc5_cerrar_jornada","bc7_obtener_inventario_jornada","bc7_guardar_inventario_jornada","bc7_registrar_ajuste_jornada","bc_declarar_dinero","movimientos_producto"]) {
    assert.ok(ui.includes(rpc),`UI no wired to ${rpc}`);
  }
  assert.match(ui,/confirm\(/);
  assert.match(ui,/dataset\.bc7Busy/);
  assert.match(ui,/navigator\.onLine/);
  assert.match(ui,/data-tab="jornada"/);
  assert.match(nav,/if \(tab === "jornada"\)[\s\S]*?setTabVisible\(btn, true\)/, "jornada navigation must remain visible; write permissions are server-gated");
  assert.match(nav,/rol\.indexOf\("dependienta"\) >= 0[\s\S]*?setTabVisible\(btn, false\)/, "the ordinary sales tab is hidden only for dependienta role");
  assert.match(nav,/jornada: "turnos"/);
  assert.match(ui,/data-tab=.?ventas/);
});

test("The Step 7 bundle is version aligned and available in the offline shell",()=>{
  assert.match(app,/const VERSION=["']9\.5\.18["']/);
  assert.match(app,/\["bc7-jornada-ui\.js","7\.1"\]/);
  assert.match(sw,/BC_SW_VERSION\s*=\s*["']9\.5\.18["']/);
  assert.match(sw,/\.\/js\/bc7-jornada-ui\.js\?v=7\.1/);
});
