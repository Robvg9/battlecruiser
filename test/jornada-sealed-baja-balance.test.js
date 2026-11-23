"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261123030000_jornada_sealed_operational_balance.sql"),"utf8");
const runner=fs.readFileSync(path.join(root,"test/step7-jornada-postgres-windows-ci.js"),"utf8");
const contract=fs.readFileSync(path.join(root,"test/jornada-sealed-baja-balance-contract.sql"),"utf8");
const functional=fs.readFileSync(path.join(root,"test/jornada-sealed-baja-balance-functional.sql"),"utf8");

test("sealed Jornada keeps general warehouse movements behind the immutable cutoff",()=>{
  assert.match(migration,/s\.corte_operativo_at/);
  assert.match(migration,/v_end_at:=v_session\.corte_operativo_at/);
  assert.match(migration,/v_session\.estado NOT IN \('EN_CURSO','CERRADA_OPERATIVAMENTE'\)/);
});

test("approved records explicitly linked to the sealed Jornada can be approved after cutoff",()=>{
  assert.match(migration,/v_linked_end_at timestamptz := now\(\)/);
  assert.match(migration,/r\.fecha_revision <= v_linked_end_at/);
  assert.match(migration,/m\.fecha_revision, m\.actualizado_en, m\.creado_en\) <= v_linked_end_at/);
  assert.match(migration,/b\.fecha_revision, b\.actualizado_en, b\.creado_en\) <= v_linked_end_at/);
});

test("sealed adjustment picker and grouped Baja share the operational ledger",()=>{
  assert.match(migration,/v_s\.estado IN \('EN_CURSO','CERRADA_OPERATIVAMENTE'\)/);
  assert.match(migration,/saldo AS MATERIALIZED \([\s\S]*bc7_jornada_saldos_operativos\(v_s\.id\)/);
  assert.match(migration,/reservado AS MATERIALIZED \([\s\S]*b\.estado='PENDIENTE'/);
  assert.match(migration,/v_stock:=v_group\.stock_disponible/);
});

test("PostgreSQL 17 CI applies the post-close migration and verifies actual database definitions",()=>{
  assert.match(runner,/20261121193906_jornada_operational_close_and_transfer_attribution\.sql/);
  assert.match(runner,/20261123030000_jornada_sealed_operational_balance\.sql/);
  assert.match(runner,/jornada-sealed-baja-balance-contract\.sql/);
  assert.match(contract,/pg_get_functiondef/);
  assert.match(contract,/CERRADA_OPERATIVAMENTE/);
});

test("sealed late Bajas prove cutoff, real saldo, retry, reservation and master-Turn closure",()=>{
  assert.match(migration,/CERRADA_OPERATIVAMENTE/);
  assert.match(runner,/jornada-sealed-baja-balance-functional\.sql/);
  assert.match(functional,/bc7_jornada_saldos_operativos/);
  assert.match(functional,/bc7_productos_ajuste_jornada/);
  assert.match(functional,/bc7_registrar_bajas_multiple_jornada/);
  assert.match(functional,/idempotency/);
  assert.match(functional,/must fail after master Turn closure/i);
  assert.match(functional,/stock_available|stock_disponible|stock_actual/);
});

test("Baja validation remains retry-safe, with targeted lookup indexes",()=>{
  assert.match(migration,/p_idempotency_key/);
  assert.match(migration,/bajas_pending_jornada_product_idx/);
  assert.match(migration,/bajas_approved_jornada_time_idx/);
  assert.match(migration,/mermas_approved_jornada_time_idx/);
  assert.match(migration,/reinversiones_approved_jornada_time_idx/);
});
