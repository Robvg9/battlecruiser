"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const read=(relative)=>fs.readFileSync(path.join(__dirname,"..",relative),"utf8");
const migration=read("supabase/migrations/20261102150000_step4_shared_jornada_inventory_handover.sql");
const ui=read("public/js/bc7-jornada-ui.js");
const app=read("public/app.js");
const sw=read("public/service-worker.js");
const pgRunner=read("test/step7-jornada-postgres-windows-ci.js");
const pgWorkflow=read(".github/workflows/step7-jornada-postgres.yml");
const pgContract=read("test/step4-jornada-shared-inventory-contract.sql");

test("Shared inventory handover uses immutable source cuts and one effective quantity ledger",()=>{
  for(const table of [
    "turno_jornada_inventario_entregas",
    "turno_jornada_inventario_entrega_lineas",
    "turno_jornada_inventario_recepciones",
    "turno_jornada_inventario_recepcion_lineas"
  ]){
    assert.match(migration,new RegExp("CREATE TABLE IF NOT EXISTS public\\."+table));
    assert.match(migration,new RegExp("ALTER TABLE public\\."+table+" ENABLE ROW LEVEL SECURITY"));
    assert.match(migration,new RegExp("REVOKE ALL ON TABLE public\\."+table));
  }
  assert.match(migration,/cantidad_declarada numeric/);
  assert.match(migration,/cantidad_recibida numeric/);
  assert.match(migration,/cantidad_efectiva numeric/);
  assert.match(migration,/idempotency_key uuid NOT NULL UNIQUE/);
  assert.match(migration,/decision_por uuid REFERENCES auth\\.users/);
  assert.match(migration,/decision_motivo text/);
  assert.match(migration,/ON DELETE RESTRICT/);
  assert.doesNotMatch(migration,/\\bDROP\\s+TABLE\\b|\\bTRUNCATE\\b/i);
  assert.doesNotMatch(migration,/UPDATE public\\.stock/i,"handover must not mutate global stock/FIFO balances");
});

test("New FINAL generates one deferred handover and reuses the already-programmed next JORNADA",()=>{
  assert.match(migration,/CREATE CONSTRAINT TRIGGER bc7_preparar_entrega_inventario_jornada/);
  assert.match(migration,/DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration,/WHERE s\\.turno_id=v_s\\.turno_id[\\s\\S]*s\\.numero_dia=v_s\\.numero_dia\\+1/);
  assert.match(migration,/estado='PENDIENTE_PROGRAMACION'/);
  assert.match(migration,/El dueño vinculó una jornada ya programada; no se creó una sesión duplicada/);
  assert.match(migration,/v_s\\.numero_dia=o\\.numero_dia\\+1/);
  assert.match(migration,/v_s\\.numero_dia=1/);
  assert.match(pgContract,/count\\(\\*\\) FROM public\\.turno_sesiones WHERE turno_id=v_turno AND numero_dia=3/);
  assert.match(pgContract,/missing next day was not left as an owner-schedulable handover/);
});

test("Reception is complete, idempotent, product-safe, and blocks the destination while disputed",()=>{
  assert.match(migration,/pg_advisory_xact_lock\\(hashtextextended\\(p_idempotency_key::text,0\\)\\)/);
  assert.match(migration,/v_existing\\.payload_hash<>v_hash/);
  assert.match(migration,/El catálogo de productos cambió entre entrega y recepción/);
  assert.match(migration,/v_has_diff/);
  assert.match(migration,/PENDIENTE_REVISION/);
  assert.match(migration,/REQUIERE_RECUENTO/);
  assert.match(migration,/La entrega de inventario tiene una diferencia o recepción pendiente de decisión del dueño/);
  assert.match(pgContract,/20\\)/);
  assert.match(pgContract,/cantidad',18/);
  assert.match(pgContract,/destination jornada opened while its shared receipt was unresolved/);
  assert.match(pgContract,/duplicate receipt key did not return the original attempt/);
  assert.match(pgContract,/Second physical count did not resolve rejected attempt/);
});

test("Only the owner resolves differences; legacy open jornadas have a separate audited recovery",()=>{
  assert.match(migration,/Solo el dueño puede resolver una diferencia de recepción/);
  assert.match(migration,/INVENTARIO_RECEPCION_APROBADA/);
  assert.match(migration,/INVENTARIO_RECEPCION_RECHAZADA/);
  assert.match(migration,/Solo el dueño puede regularizar una jornada legacy abierta sin inventario inicial/);
  assert.match(migration,/INVENTARIO_INICIAL_LEGACY_REGULARIZADO/);
  assert.match(migration,/stock_global_modificado',false/);
  assert.match(pgContract,/Unauthorized worker approval/);
  assert.match(pgContract,/Recover a legacy open jornada that had no initial inventory/);
  assert.match(pgContract,/Reject this count; the employee must recount physically/);
});

test("Jornada UI exposes receiving, owner decision, next-session linking and legacy recovery through RPCs",()=>{
  for(const rpc of [
    "bc7_estado_entrega_inventario_jornada",
    "bc7_recibir_entrega_jornada",
    "bc7_resolver_entrega_jornada",
    "bc7_vincular_entrega_jornada",
    "bc7_regularizar_inicial_jornada_legacy"
  ]) assert.ok(ui.includes(rpc), "missing UI RPC "+rpc);
  for(const marker of [
    "data-bc7-receive-form",
    "data-bc7-delivery-decision",
    "data-bc7-link-delivery",
    "data-bc7-legacy-initial-form",
    "Existencia efectiva compartida",
    "Recepción física de inventario compartido",
    "Regularización legacy"
  ]) assert.ok(ui.includes(marker), "missing UI path "+marker);
  assert.match(ui,/crypto\\.randomUUID\\(\\)/);
  assert.match(ui,/Solo la dependienta asignada puede recibir/);
  assert.match(ui,/Solo el dueño puede resolver/);
});

test("PWA, service worker and module cache are aligned at 9.5.57 / Jornada module 7.13",()=>{
  const version=app.match(/const VERSION="([^"]+)"/);
  const swVersion=sw.match(/BC_SW_VERSION = "([^"]+)"/);
  assert.ok(version&&swVersion);
  assert.equal(version[1],"9.5.57");
  assert.equal(swVersion[1],version[1]);
  assert.match(app,/\\["bc7-jornada-ui\\.js","7\\.13"\\]/);
  assert.ok(sw.includes("./js/bc7-jornada-ui.js?v=7.13"));
  assert.match(app,/\\["m68-ventas-pos-definitivo\\.js","9\\.5\\.57"\\]/);
  assert.ok(sw.includes("./js/m68-ventas-pos-definitivo.js?v=9.5.57"));
  assert.match(ui,/v7\\.13/);
});

test("PostgreSQL 17 disposable CI applies and exercises the Step 4 handover migration",()=>{
  assert.ok(pgRunner.includes("supabase/migrations/20261102150000_step4_shared_jornada_inventory_handover.sql"));
  assert.ok(pgRunner.includes("test/step4-jornada-shared-inventory-contract.sql"));
  assert.ok(pgWorkflow.includes("supabase/migrations/20261102150000_step4_shared_jornada_inventory_handover.sql"));
  assert.ok(pgWorkflow.includes("test/step4-jornada-shared-inventory-contract.sql"));
  assert.match(pgRunner,/13\\/14 Apply Step 4 shared inventory handover/);
  assert.match(pgRunner,/14\\/14 Verify shared receipt/);
});
