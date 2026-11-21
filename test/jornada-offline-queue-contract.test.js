"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=file=>fs.readFileSync(file,"utf8");
const offline=read("public/js/offline.js");
const jornada=read("public/js/bc7-jornada-ui.js");
const migration=read("supabase/migrations/20261121193906_jornada_operational_close_and_transfer_attribution.sql");

test("Jornada late-operation RPCs reuse the single IndexedDB operation queue",()=>{
  for(const [type,rpc] of [
    ["gasto_jornada","bc7_registrar_gasto_jornada"],
    ["reinversion_jornada","bc7_registrar_reinversion_jornada"],
    ["baja_jornada","bc7_registrar_bajas_multiple_jornada"],
    ["ajuste_jornada","bc7_registrar_ajuste_jornada"]
  ]){
    assert.ok(offline.includes(type+': "'+rpc+'"'),type);
  }
  assert.match(offline,/payload && payload\.p_idempotency_key \|\| crypto\.randomUUID\(\)/);
  assert.match(jornada,/window\.ejecutarOperacion\(queuedType,payload\)/);
  assert.match(jornada,/__bcOfflineQueued:true/);
});

test("Jornada read snapshots are scoped to the existing user cache and only allowlisted reads",()=>{
  assert.match(offline,/BC_RPC_SNAPSHOT_PREFIX = "__bc_rpc_snapshot_v1::"/);
  assert.match(offline,/window\.bcOfflineRememberRpcSnapshot/);
  assert.match(offline,/window\.bcOfflineReadRpcSnapshot/);
  assert.match(jornada,/const OFFLINE_JORNADA_READS=new Set/);
  assert.match(jornada,/bcOfflineRememberRpcSnapshot/);
  assert.match(jornada,/Sin conexión: esta lectura de Jornada todavía no tiene una copia guardada/);
});

test("late entries after operational seal remain limited to the assigned worker and an open master Turn",()=>{
  assert.match(migration,/v_s\.estado NOT IN \('EN_CURSO','CERRADA_OPERATIVAMENTE'\)/);
  assert.match(migration,/v_s\.estado='CERRADA_OPERATIVAMENTE' AND NOT EXISTS \([\s\S]*t\.estado='ABIERTO'/);
  assert.match(migration,/v_s\.estado='CERRADA_OPERATIVAMENTE' AND estado='COMPLETADO'[\s\S]*fin_at=v_s\.corte_operativo_at/);
  assert.match(migration,/v_p\.responsable_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(migration,/v_old text := 'IF NOT FOUND OR v_s\.bloque<>''JORNADA'' OR v_s\.estado<>''EN_CURSO'' THEN'/);
  assert.match(migration,/v_new text := 'IF NOT FOUND OR v_s\.bloque<>''JORNADA'' OR v_s\.estado NOT IN/);
});

test("offline queue confirmation never presents queued operations as applied or approved",()=>{
  assert.match(jornada,/pendiente de sincronización y aprobación/);
  assert.match(jornada,/el stock no se ha modificado/);
  assert.match(jornada,/no cambiarán caja ni inventario antes de aprobarse/);
});
