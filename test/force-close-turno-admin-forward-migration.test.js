"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261026170000_bc_force_close_admin_expiry_guard.sql"), "utf8");
const harness = fs.readFileSync(path.join(__dirname, "step7-jornada-postgres-windows-ci.js"), "utf8");
const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "step7-jornada-postgres.yml"), "utf8");
const sqlContract = fs.readFileSync(path.join(__dirname, "force-close-turno-admin-contract.sql"), "utf8");

test("forward recovery migration enforces ADMIN, bounded reason, valid state and verified expiry on the server", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.bc_forzar_cierre_turno_admin/);
  assert.match(migration, /IF v_uid IS NULL THEN/);
  assert.match(migration, /IF NOT public\.bc_actor_is_admin\(\) THEN/);
  assert.match(migration, /length\(v_motivo\) < 12/);
  assert.match(migration, /length\(v_motivo\) > 1000/);
  assert.match(migration, /v_turno\.estado_maestro[\s\S]*v_turno\.estado/);
  assert.match(migration, /v_turno\.fecha IS NULL OR v_turno\.dias_turno IS NULL/);
  assert.match(migration, /v_turno\.fecha[\s\S]*>= current_date/);
  assert.match(migration, /El turno todavía no está vencido/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.bc7_guard_jornada_inventory/);
  assert.match(migration, /cierre_jornada_forzado_sin_conteo_final/);
  assert.match(migration, /sesiones_en_curso_ids/);
});

test("forward migration keeps least-privilege ACL, dual-state reconciliation and no-fabrication audit", () => {
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.bc_forzar_cierre_turno_admin\(uuid, text\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.bc_forzar_cierre_turno_admin\(uuid, text\) TO authenticated/);
  assert.match(migration, /SET estado = 'CERRADO',[\s\S]*estado_maestro = 'CERRADO'/);
  assert.match(migration, /INSERT INTO public\.turno_eventos/);
  assert.match(migration, /'motivo', v_motivo/);
  assert.match(migration, /'declaraciones_dinero_creadas', 0/);
  assert.match(migration, /'conteos_inventario_creados', 0/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+public\.turno_declaraciones/i);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+public\.turno_jornada_inventario_cortes/i);
});

test("PostgreSQL 17 disposable CI applies the forward migration and verifies its real RPC behavior", () => {
  assert.ok(harness.includes('applySql("test/force-close-turno-admin-fixture.sql")'));
  assert.ok(harness.includes('applySql("supabase/migrations/20261026170000_bc_force_close_admin_expiry_guard.sql")'));
  assert.ok(harness.includes('applySql("test/force-close-turno-admin-contract.sql")'));
  assert.match(workflow, /supabase\/migrations\/20261026170000_bc_force_close_admin_expiry_guard\.sql/);
  assert.match(workflow, /test\/force-close-turno-admin-contract\.sql/);
  assert.match(sqlContract, /SQLSTATE '42501'/);
  assert.match(sqlContract, /same-day turn must not be force-closed/);
  assert.match(sqlContract, /future turn must not be force-closed/);
  assert.match(sqlContract, /non-ADMIN call was not rejected/);
  assert.match(sqlContract, /fabricated a cash declaration or inventory cut/i);
  assert.match(sqlContract, /modern jornada normal close bypassed the final-inventory guard/);
  assert.match(sqlContract, /non-ADMIN bypassed final inventory by setting cierre_forzado/);
  assert.match(sqlContract, /audited modern jornada was not completed as force-closed/);
  assert.match(sqlContract, /modern force-close fabricated a final inventory snapshot/);
  assert.ok(sqlContract.includes("DELETE FROM public.turnos"));
  assert.ok(sqlContract.includes("DELETE FROM public.almacenes"));
});
