"use strict";
const { assertPwaReleaseAligned, assertModuleCacheAligned } = require("./helpers/pwa-release-contract");
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const migration=fs.readFileSync("supabase/migrations/20261115132235_jornada_retro_successor_handover.sql","utf8");
const inventoryTruth=fs.readFileSync("supabase/migrations/20261116180000_jornada_inventory_handover_truth.sql","utf8");
const jornada=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");
const index=fs.readFileSync("public/index.html","utf8");

const actualCloseMigration=fs.readFileSync("supabase/migrations/20261115134000_jornada_handover_uses_actual_close_date.sql","utf8");

test("closed master turns are normalized and future approvals close both state fields",()=>{
  assert.ok(migration.includes("estado='CERRADO',estado_maestro='CERRADO'"));
  assert.ok(migration.includes("t.estado_maestro='CERRADO' AND t.estado<>'CERRADO'"));
});
test("successor handover follows the actual close date, not stale scheduled end",()=>{
  assert.ok(actualCloseMigration.includes("v_tipo_evento='JORNADA_ENTREGADA_TARDE' THEN v_fecha_fin + 1"));
  assert.ok(actualCloseMigration.includes("ELSE v_local::date + 1"));
  assert.ok(actualCloseMigration.includes("JORNADA_CERRADA_CON_EXCEPCION"));
  assert.ok(actualCloseMigration.includes("INVENTARIO_ENTREGA_DESTINO_RECALCULADO"));
  assert.ok(actualCloseMigration.includes("destino_sesion_id IS NULL"));
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
test("owner-approved physical differences stay on the receipt and do not mutate the previous FINAL",()=>{
  const resolverStart=inventoryTruth.indexOf("CREATE OR REPLACE FUNCTION public.bc7_resolver_entrega_jornada(");
  assert.ok(resolverStart>=0,"the truth migration must replace the resolver");
  const resolver=inventoryTruth.slice(resolverStart);
  assert.ok(resolver.includes("diferencias_registradas_en_recepcion"));
  assert.ok(resolver.includes("corte_final_origen_modificado',false"));
  assert.ok(resolver.includes("_bc7_crear_inicial_desde_entrega"));
  assert.equal(resolver.includes("PERFORM public.bc7_corregir_inventario_final_jornada"),false);
});
test("completed sessions expose read-only viewing but no operational management or rescheduling",()=>{
  assert.ok(jornada.includes("const isTerminal=['COMPLETADA','CERRADA_OPERATIVAMENTE','CANCELADA','CANCELADO'].includes(status)"));
  assert.ok(jornada.includes("const viewable=status==='COMPLETADA'||isOperationallySealed"));
  assert.ok(jornada.includes("viewable?'Ver jornada':'Gestionar jornada'"));
  assert.ok(jornada.includes("data-bc7-open="));
  assert.ok(jornada.includes("state.admin&&!isTerminal"));
});
test("incoming count is blank by default",()=>{
  assert.ok(jornada.includes('placeholder="Contar físicamente"'));
});
test("PWA release and service worker cache keys are aligned",()=>{
  assertPwaReleaseAligned(assert,{app,serviceWorker:sw,index});
  assertModuleCacheAligned(assert,{app,serviceWorker:sw,moduleName:"bc7-jornada-ui.js"});
  assertModuleCacheAligned(assert,{app,serviceWorker:sw,moduleName:"m68-ventas-pos-definitivo.js"});
});
