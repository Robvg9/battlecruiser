"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

const MIGRATION = read("supabase/migrations/20261031163000_turno_cash_handover_owner_reconciliation.sql");
const CONTRACT = read("test/turno-cash-handover-contract.sql");
const FIXTURE = read("test/turno-cash-handover-fixture.sql");
const STAFF_UI = read("public/js/m33-turnos-final.js");
const JOURNEY_UI = read("public/js/bc7-jornada-ui.js");
const ADMIN_UI = read("public/js/turno-cash-handover-ui.js");
const BOOK_UI = read("public/js/m33-turnos-final.js");
const APP = read("public/app.js");
const SW = read("public/service-worker.js");
const INDEX = read("public/index.html");
const PG_CI = read("test/step7-jornada-postgres-windows-ci.js");
const PG_WORKFLOW = read(".github/workflows/step7-jornada-postgres.yml");
const QUALITY = read(".github/workflows/quality.yml");

test("cash handover extends the modern declaration and difference records additively", () => {
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS monto_contado numeric/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS contado_por uuid/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS contado_at timestamptz/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS diferencia numeric/);
  assert.match(MIGRATION, /declaracion_dinero_id uuid/);
  assert.match(FIXTURE, /CREATE TABLE IF NOT EXISTS public\\.turno_diferencias/);
  assert.match(PG_CI, /turno-cash-handover-fixture\\.sql/);
  assert.match(MIGRATION, /REFERENCES public\.turno_declaraciones\(id\) ON DELETE RESTRICT/);
  assert.match(MIGRATION, /CON_DIFERENCIA/);
  assert.doesNotMatch(MIGRATION, /\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\s+public\.(turnos|turno_sesiones|turno_declaraciones|turno_diferencias)/i);
  assert.match(MIGRATION, /estado_aprobacion IN \('PENDIENTE','ESPERANDO_APROBACION','APROBADA','RECHAZADA','CON_DIFERENCIA'\)/);
});

test("only the authenticated administrator can count cash after a completed session", () => {
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc5_listar_dinero_pendiente_contar/);
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc5_contar_dinero_entregado/);
  assert.match(MIGRATION, /IF NOT public\.bc_actor_is_admin\(\) THEN/);
  assert.match(MIGRATION, /IF v_s\.estado<>'COMPLETADA' THEN/);
  assert.match(MIGRATION, /monto_contado IS NOT NULL/);
  assert.match(MIGRATION, /No se puede sobrescribir/);
  assert.match(MIGRATION, /ON CONFLICT \(declaracion_dinero_id\)/);
  assert.match(MIGRATION, /DINERO_CONTADO_POR_ADMIN/);
  assert.match(MIGRATION, /REVOKE INSERT,UPDATE,DELETE ON TABLE public\.turno_declaraciones,public\.turno_diferencias FROM PUBLIC,anon,authenticated/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc5_contar_dinero_entregado\(uuid,numeric,text\) FROM PUBLIC,anon/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc5_contar_dinero_entregado\(uuid,numeric,text\) TO authenticated,service_role/);
});

test("cash mismatch remains an explicit, auditable difference without automatic adjustment", () => {
  assert.match(MIGRATION, /IF v_diferencia<>0 THEN/);
  assert.match(MIGRATION, /'DINERO'/);
  assert.match(MIGRATION, /v_d\.usuario_id,false,v_obs,v_d\.id/);
  assert.match(MIGRATION, /ELSE 'CON_DIFERENCIA' END/);
  assert.match(MIGRATION, /DINERO_DIFERENCIA_RESUELTA/);
  assert.match(MIGRATION, /IF d\.estado_aprobacion='CON_DIFERENCIA' THEN/);
  assert.match(MIGRATION, /IF s\.bloque='JORNADA' THEN/);
  assert.doesNotMatch(MIGRATION, /UPDATE\s+public\.(stock|productos|movimientos_caja|caja_movimientos)/i);
  assert.match(CONTRACT, /monto_declarado/);
  assert.match(CONTRACT, /'CON_DIFERENCIA'/);
  assert.match(CONTRACT, /diferencia.*<>-8/);
  assert.match(CONTRACT, /cash count\/difference changed cash movements or product stock/);
});

test("assigned staff can declare handed-over cash and close their legacy active session from their own Turn view", () => {
  assert.match(STAFF_UI, /data-m33-declare-cash/);
  assert.match(STAFF_UI, /data-m33-close-legacy-session/);
  assert.match(STAFF_UI, /API\(\)\.listarTramosSesion\(sesionId\)/);
  assert.match(STAFF_UI, /API\(\)\.declararDinero\(active\.id,monto\)/);
  assert.match(STAFF_UI, /API\(\)\.cerrarSesion\(sesionId\)/);
  assert.match(STAFF_UI, /await load\(state\.turno\.id\);\s*renderModal\(\);/);
  assert.match(JOURNEY_UI, /Dinero entregado \(CUP\)/);
  assert.match(JOURNEY_UI, /el administrador lo contará después del cierre/i);
  assert.match(ADMIN_UI, /Dinero entregado pendiente de contar/);
  assert.match(ADMIN_UI, /bc5_contar_dinero_entregado/);
});

test("the owner inbox is RPC-only and exposes count, difference and explicit review", () => {
  assert.match(ADMIN_UI, /bc5_listar_dinero_pendiente_contar/);
  assert.match(ADMIN_UI, /bc5_contar_dinero_entregado/);
  assert.match(ADMIN_UI, /bc_aprobar_diferencia/);
  assert.match(ADMIN_UI, /Diferencia pendiente de revisión/);
  assert.match(ADMIN_UI, /No se ha descontado ni ajustado dinero automáticamente/);
  assert.doesNotMatch(ADMIN_UI, /from\(['"]turno_declaraciones['"]\)/);
  assert.doesNotMatch(ADMIN_UI, /from\(['"]turno_diferencias['"]\)/);
});

test("inventory book reports declared, counted and difference values from the backend", () => {
  assert.match(BOOK_UI, /monto_contado,diferencia,contado_por,contado_at/);
  assert.match(BOOK_UI, /dinero_monto_contado/);
  assert.match(BOOK_UI, /Contado por dueño/);
  assert.match(BOOK_UI, /cashNote = 'La declaración de la responsable y el conteo físico del dueño se guardan por separado/);
});

test("PWA release 9.5.46 loads and precaches the cash handover UI", () => {
  assert.match(APP, /const VERSION="9\.5\.46"/);
  assert.match(APP, /\["turno-cash-handover-ui\.js","1\.0"\]/);
  assert.match(SW, /BC_SW_VERSION = "9\.5\.46"/);
  assert.match(SW, /\.\/js\/turno-cash-handover-ui\.js\?v=1\.0/);
  assert.match(INDEX, /app\.js\?v=9\.5\.46/);
  assert.match(INDEX, /style\.css\?v=9\.5\.46/);
  assert.match(PG_CI, /20261031163000_turno_cash_handover_owner_reconciliation\.sql/);
  assert.match(PG_CI, /turno-cash-handover-contract\.sql/);
  assert.match(PG_WORKFLOW, /20261031163000_turno_cash_handover_owner_reconciliation\.sql/);
  assert.match(PG_WORKFLOW, /turno-cash-handover-contract\.sql/);
  assert.match(QUALITY, /node --check public\/js\/turno-cash-handover-ui\.js/);
});
