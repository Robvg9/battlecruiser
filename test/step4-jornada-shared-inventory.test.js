"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const migration = read("supabase/migrations/20261102150000_step4_shared_jornada_inventory_handover.sql");
const ui = read("public/js/bc7-jornada-ui.js");
const app = read("public/app.js");
const sw = read("public/service-worker.js");
const pgRunner = read("test/step7-jornada-postgres-windows-ci.js");
const pgWorkflow = read(".github/workflows/step7-jornada-postgres.yml");
const pgContract = read("test/step4-jornada-shared-inventory-contract.sql");

test("Shared inventory handover uses immutable source cuts and one effective quantity ledger", () => {
  for (const table of [
    "turno_jornada_inventario_entregas",
    "turno_jornada_inventario_entrega_lineas",
    "turno_jornada_inventario_recepciones",
    "turno_jornada_inventario_recepcion_lineas"
  ]) {
    assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public." + table));
    assert.ok(migration.includes("ALTER TABLE public." + table + " ENABLE ROW LEVEL SECURITY"));
    assert.ok(migration.includes("REVOKE ALL ON TABLE public." + table));
  }
  for (const marker of [
    "cantidad_declarada numeric",
    "cantidad_recibida numeric",
    "cantidad_efectiva numeric",
    "idempotency_key uuid NOT NULL UNIQUE",
    "decision_por uuid REFERENCES auth.users",
    "decision_motivo text",
    "ON DELETE RESTRICT"
  ]) assert.ok(migration.includes(marker), "missing schema invariant: " + marker);
  assert.equal(migration.includes("DROP TABLE"), false);
  assert.equal(migration.includes("TRUNCATE"), false);
  assert.equal(migration.includes("UPDATE public.stock"), false, "handover must not mutate global stock/FIFO balances");
  const functionNames = [...migration.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-zA-Z0-9_]+)/g)].map((match) => match[1]);
  assert.equal(functionNames.length, 10);
  assert.equal(new Set(functionNames).size, functionNames.length, "migration must not duplicate function declarations");
});

test("New FINAL generates one deferred handover and reuses the already-programmed next JORNADA", () => {
  for (const marker of [
    "CREATE CONSTRAINT TRIGGER bc7_preparar_entrega_inventario_jornada",
    "DEFERRABLE INITIALLY DEFERRED",
    "WHERE s.turno_id=v_s.turno_id",
    "s.numero_dia=v_s.numero_dia+1",
    "estado='PENDIENTE_PROGRAMACION'",
    "El dueño vinculó una jornada ya programada; no se creó otra sesión duplicada",
    "v_s.numero_dia=o.numero_dia+1",
    "v_s.numero_dia=1"
  ]) assert.ok(migration.includes(marker), "missing handover invariant: " + marker);
  assert.ok(pgContract.includes("count(*) FROM public.turno_sesiones WHERE turno_id=v_turno AND numero_dia=3"));
  assert.ok(pgContract.includes("missing next day was not left as an owner-schedulable handover"));
  assert.ok(pgContract.includes("handover created a duplicate or unrequested next-day session"));
});

test("Reception is complete, idempotent, product-safe, and blocks the destination while disputed", () => {
  for (const marker of [
    "pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0))",
    "v_existing.payload_hash<>v_hash",
    "El catálogo de productos cambió entre entrega y recepción",
    "v_has_diff",
    "PENDIENTE_REVISION",
    "REQUIERE_RECUENTO",
    "La entrega de inventario tiene una diferencia o recepción pendiente de decisión del dueño"
  ]) assert.ok(migration.includes(marker), "missing receipt invariant: " + marker);
  for (const marker of [
    "jsonb_build_object('producto_id',v_pan,'cantidad',20)",
    "jsonb_build_object('producto_id',v_pan,'cantidad',18)",
    "destination jornada opened while its shared receipt was unresolved",
    "duplicate receipt key did not return the original attempt",
    "new equal physical recount did not resolve rejected attempt"
  ]) assert.ok(pgContract.includes(marker), "missing PostgreSQL scenario: " + marker);
});

test("Only the owner resolves differences; legacy open jornadas have a separate audited recovery", () => {
  for (const marker of [
    "Solo el dueño puede resolver una diferencia de recepción",
    "INVENTARIO_RECEPCION_APROBADA",
    "INVENTARIO_RECEPCION_RECHAZADA",
    "Solo el dueño puede regularizar una jornada legacy abierta sin inventario inicial",
    "INVENTARIO_INICIAL_LEGACY_REGULARIZADO",
    "stock_global_modificado',false"
  ]) assert.ok(migration.includes(marker), "missing owner/legacy invariant: " + marker);
  for (const marker of [
    "Unauthorized worker approval",
    "Recover a legacy open jornada that had no initial inventory",
    "Reject this count; the employee must recount physically",
    "Second physical count matches declared inventory"
  ]) assert.ok(pgContract.includes(marker), "missing PostgreSQL scenario: " + marker);
});

test("Jornada UI exposes receiving, owner decision, next-session linking and legacy recovery through RPCs", () => {
  for (const rpc of [
    "bc7_estado_entrega_inventario_jornada",
    "bc7_recibir_entrega_jornada",
    "bc7_resolver_entrega_jornada",
    "bc7_vincular_entrega_jornada",
    "bc7_regularizar_inicial_jornada_legacy"
  ]) assert.ok(ui.includes(rpc), "missing UI RPC " + rpc);
  for (const marker of [
    "data-bc7-receive-form",
    "data-bc7-delivery-decision",
    "data-bc7-link-delivery",
    "data-bc7-legacy-initial-form",
    "Existencia efectiva compartida",
    "Recepción física de inventario compartido",
    "Regularización legacy",
    "Aprobar recepción",
    "Rechazar y exigir recuento"
  ]) assert.ok(ui.includes(marker), "missing UI path: " + marker);
  assert.ok(ui.includes("crypto.randomUUID()"));
  assert.ok(ui.includes("Vas a registrar el conteo físico recibido"));
  assert.ok(ui.includes("Solo el dueño puede regularizar"));
});

test("PWA, service worker and module cache are aligned at 9.5.57 / Jornada module 7.13", () => {
  const version = app.match(/const VERSION="([^"]+)"/);
  const swVersion = sw.match(/BC_SW_VERSION = "([^"]+)"/);
  assert.ok(version && swVersion);
  assert.equal(version[1], "9.5.57");
  assert.equal(swVersion[1], version[1]);
  assert.ok(app.includes('["bc7-jornada-ui.js","7.13"]'));
  assert.ok(sw.includes("./js/bc7-jornada-ui.js?v=7.13"));
  assert.ok(app.includes('["m68-ventas-pos-definitivo.js","9.5.57"]'));
  assert.ok(sw.includes("./js/m68-ventas-pos-definitivo.js?v=9.5.57"));
  assert.ok(ui.includes("// v7.13"));
});

test("PostgreSQL 17 disposable CI applies and exercises the Step 4 handover migration", () => {
  assert.ok(pgRunner.includes("supabase/migrations/20261102150000_step4_shared_jornada_inventory_handover.sql"));
  assert.ok(pgRunner.includes("test/step4-jornada-shared-inventory-contract.sql"));
  assert.ok(pgWorkflow.includes("supabase/migrations/20261102150000_step4_shared_jornada_inventory_handover.sql"));
  assert.ok(pgWorkflow.includes("test/step4-jornada-shared-inventory-contract.sql"));
  assert.ok(pgRunner.includes("13/14 Apply Step 4 shared inventory handover"));
  assert.ok(pgRunner.includes("14/14 Verify shared receipt"));
});
