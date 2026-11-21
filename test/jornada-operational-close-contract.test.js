"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(ROOT,file),"utf8");
const migration=read("supabase/migrations/20261121180000_jornada_operational_close_and_transfer_attribution.sql");
const ui=read("public/js/bc7-jornada-ui.js");
const owner=read("public/js/jornada-owner-review.js");

test("operational close is a separate state and records cutoff/seal evidence",()=>{
  assert.match(migration,/CERRADA_OPERATIVAMENTE/);
  assert.match(migration,/corte_operativo_at/);
  assert.match(migration,/cierre_operativo_at/);
  assert.match(migration,/cierre_operativo_origen/);
  assert.match(migration,/JORNADA_CERRADA_OPERATIVAMENTE/);
  assert.match(migration,/AUTO_HORA_FIN/);
  assert.match(migration,/MANUAL/);
  assert.match(migration,/bc5_cerrar_jornadas_operativas_vencidas/);
  assert.match(migration,/cron\.schedule/);
});

test("automatic and manual operational seals never fabricate the final stock count or a cash declaration",()=>{
  for(const flag of ["inventario_final_confirmado','false","declaracion_efectivo_creada','false","conciliacion_completada','false"])
    assert.ok(migration.includes(flag));
  assert.match(migration,/IF v_now < v_cutoff AND v_reason IS NULL/);
  assert.match(migration,/corte_operativo_at=v_cutoff/);
});

test("next Jornada can start after the previous session has been operationally sealed",()=>{
  assert.match(migration,/bc5_iniciar_jornada/);
  assert.match(migration,/CERRADA_OPERATIVAMENTE/);
  assert.match(migration,/Una jornada operativa anterior sigue activa para este almacén/);
});

test("Owner may later count cash and reconcile, but final approval still requires calculable liquidation",()=>{
  assert.match(migration,/bc5_contar_dinero_entregado/);
  assert.match(migration,/bc7_estado_confirmaciones_jornada/);
  assert.match(migration,/bc7_resolver_revision_jornada/);
  assert.match(migration,/JORNADA_CONCILIADA_POST_CIERRE_OPERATIVO/);
  assert.match(migration,/v_liq->>'calculable'/);
  assert.match(migration,/No está completa. Revisa precios, movimientos, inventario, salario y efectivo/);
});

test("transfer attribution links only the destination when that warehouse is retail",()=>{
  assert.match(migration,/bc7_vincular_transferencia_jornada_destino_minorista/);
  assert.match(migration,/a\.tipo='minorista'/);
  assert.match(migration,/NEW\.almacen_destino_id/);
  assert.match(migration,/ON CONFLICT \(transferencia_id\) DO NOTHING/);
  assert.match(migration,/Almacen Casa/);
});

test("La Cueva's Jornada row presents operationally sealed as pending reconciliation, not approved red",()=>{
  assert.match(ui,/CERRADA_OPERATIVAMENTE/);
  assert.match(ui,/data-bc7-operational-close/);
  assert.match(ui,/Sellado operativo/);
  assert.match(ui,/no declara efectivo ni confirma inventario/);
});

test("Owner review recognises the sealed state without treating it as final approval",()=>{
  assert.match(owner,/CERRADA_OPERATIVAMENTE/);
  assert.match(owner,/liquidación todavía no calculable/);
});
