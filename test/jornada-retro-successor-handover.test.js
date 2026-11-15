"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const migration=fs.readFileSync("supabase/migrations/20261115132235_jornada_retro_successor_handover.sql","utf8");
const jornada=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");

test("closed master turns are normalized and future approvals close both state fields",()=>{
  assert.ok(migration.includes("estado='CERRADO',estado_maestro='CERRADO'"));
  assert.ok(migration.includes("t.estado_maestro='CERRADO' AND t.estado<>'CERRADO'"));
});
test("successor is programmed from existing handover and requires physical reception before starting",()=>{
  assert.ok(migration.includes("bc7_admin_programar_sucesora_pendiente"));
  assert.ok(migration.includes("PENDIENTE_PROGRAMACION"));
  assert.ok(migration.includes("PENDIENTE_RECEPCION"));
  assert.ok(migration.includes("bc7_admin_iniciar_sucesora_retroactiva"));
  assert.ok(migration.includes("v_delivery.estado<>'ACEPTADA'"));
});
test("retail handover counts parent families and aggregates variants",()=>{
  assert.ok(migration.includes("p.producto_padre_id IS NULL"));
  assert.ok(migration.includes("sp.producto_padre_id=rl.producto_id"));
  assert.ok(migration.includes("inventario_agrupado_por_familia"));
});
test("closed master turns freeze late movement classification",()=>{
  assert.ok(migration.includes("El Turno está cerrado. Las bajas/mermas quedaron congeladas"));
  assert.ok(migration.includes("bc7_clasificar_movimientos_fuera_corte"));
});
test("owner-approved physical differences produce an audited correction of previous final",()=>{
  assert.ok(migration.includes("bc7_corregir_inventario_final_jornada(v_e.origen_sesion_id,v_correcciones"));
  assert.ok(migration.includes("El Turno está cerrado. Solo se permite corregir"));
  assert.ok(migration.includes("_bc7_crear_inicial_desde_entrega"));
});
test("completed sessions expose no operational management or rescheduling",()=>{
  assert.ok(jornada.includes("const isTerminal=['COMPLETADA','CANCELADA','CANCELADO'].includes(status)"));
  assert.ok(jornada.includes("!rest&&!isTerminal&&r.sesion_id"));
  assert.ok(jornada.includes("state.admin&&!isTerminal"));
});
test("incoming count is blank by default",()=>{
  assert.ok(jornada.includes('placeholder="Contar físicamente"'));
});
test("PWA release and service worker cache keys are aligned",()=>{
  assert.ok(app.includes('const VERSION="9.5.113"'));
  assert.ok(app.includes('["bc7-jornada-ui.js","7.31"]'));
  assert.ok(app.includes('["m68-ventas-pos-definitivo.js","9.5.113"]'));
  assert.ok(sw.includes('BC_SW_VERSION = "9.5.113"'));
  assert.ok(sw.includes('bc7-jornada-ui.js?v=7.31'));
  assert.ok(sw.includes('m68-ventas-pos-definitivo.js?v=9.5.113'));
});
