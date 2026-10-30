"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATION = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/20261030160000_step7_jornada_finanzas_carryforward.sql"),
  "utf8"
);
const UI = fs.readFileSync(
  path.join(__dirname, "..", "public/js/bc7-jornada-ui.js"),
  "utf8"
);
const BASE_FINANCE = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/20261023053011_step5_jornada_unica_backend.sql"),
  "utf8"
);

test("Jornada finance adds separate session/tranche provenance without repointing legacy FKs", () => {
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS turno_sesion_id uuid/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS turno_tramo_id uuid/);
  assert.match(MIGRATION, /gastos_turno_sesion_id_fkey[\s\S]*REFERENCES public\.turno_sesiones\(id\)/);
  assert.match(MIGRATION, /gastos_turno_tramo_id_fkey[\s\S]*REFERENCES public\.turno_tramos\(id\)/);
  assert.match(MIGRATION, /reinversiones_turno_sesion_id_fkey[\s\S]*REFERENCES public\.turno_sesiones\(id\)/);
  assert.match(MIGRATION, /reinversiones_turno_tramo_id_fkey[\s\S]*REFERENCES public\.turno_tramos\(id\)/);
  assert.match(MIGRATION, /NEW\.sesion_id IS NOT NULL OR NEW\.ciclo_id IS NOT NULL/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_registrar_gasto_jornada/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_registrar_reinversion_jornada/);
  assert.doesNotMatch(MIGRATION, /\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\s+public\.(gastos|reinversiones|turno_sesiones)/i);
  assert.match(BASE_FINANCE, /CREATE OR REPLACE FUNCTION public\.crear_gasto/);
  assert.match(BASE_FINANCE, /CREATE OR REPLACE FUNCTION public\.registrar_reinversion_multiple/);
});

test("Jornada finance RPCs require permission, assigned worker, active tramo and idempotency", () => {
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc7_validar_tramo_responsable_jornada/);
  assert.match(MIGRATION, /v_s\.estado<>'EN_CURSO'/);
  assert.match(MIGRATION, /v_p\.responsable_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(MIGRATION, /a\.usuario_id=auth\.uid\(\) AND a\.retirado_at IS NULL/);
  assert.match(MIGRATION, /tramo_activo/);
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc7_registrar_gasto_jornada/);
  assert.match(MIGRATION, /tiene_permiso\('gastos','crear'\)/);
  assert.match(MIGRATION, /public\.crear_gasto\(/);
  assert.match(MIGRATION, /p_idempotency_key/);
  assert.match(MIGRATION, /GASTO_SOLICITADO/);
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc7_registrar_reinversion_jornada/);
  assert.match(MIGRATION, /tiene_permiso\('reinversiones','crear'\)/);
  assert.match(MIGRATION, /public\.registrar_reinversion_multiple\(/);
  assert.match(MIGRATION, /REINVERSION_REGISTRADA/);
  assert.match(MIGRATION, /p_turno_id,v_s\.turno_id/);
});

test("Jornada finance read respects per-section view permissions", () => {
  const start = MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_finanzas_jornada");
  const end = MIGRATION.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, "bc7_finanzas_jornada debe estar definida");
  const fn = MIGRATION.slice(start, end);
  assert.match(fn, /tiene_permiso\('turnos','ver'\)/);
  assert.match(fn, /tiene_permiso\('gastos','ver'\)/);
  assert.match(fn, /tiene_permiso\('reinversiones','ver'\)/);
  assert.match(fn, /'gastos',CASE WHEN/);
  assert.match(fn, /'reinversiones',CASE WHEN/);
  assert.match(fn, /g\.turno_sesion_id=v_s\.id/);
  assert.match(fn, /r\.turno_sesion_id=v_s\.id/);
});

test("previous confirmed final cut is only a source for a new physical initial cut", () => {
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS origen_corte_id uuid/);
  assert.match(MIGRATION, /turno_jornada_corte_origen_fkey/);
  assert.match(MIGRATION, /CHECK \(origen_corte_id IS NULL OR tipo='INICIAL'\)/);
  assert.match(MIGRATION, /'apertura_previa'/);
  assert.match(MIGRATION, /ps\.numero_dia=v_s\.numero_dia-1/);
  assert.match(MIGRATION, /ps\.estado='COMPLETADA'/);
  assert.match(MIGRATION, /c\.tipo='FINAL' AND c\.estado='CONFIRMADO'/);
  assert.match(MIGRATION, /INSERT INTO public\.turno_jornada_inventario_cortes[\s\S]*origen_corte_id/);
  assert.match(MIGRATION, /idempotente/);
  assert.doesNotMatch(MIGRATION, /UPDATE\s+public\.stock/i);
});

test("Step 7 shows prior count only as an editable physical recount reference", () => {
  assert.match(UI, /detail\.apertura_previa/);
  assert.match(UI, /openingLines\.get\(String\(p\.producto_id\)\)/);
  assert.match(UI, /value="\+'\(prior\?esc\(prior\.cantidad_contada\):''\)/);
  assert.match(UI, /Debes volver a contar físicamente cada producto/);
  assert.match(UI, /nuevo corte requiere confirmación física explícita/);
  assert.match(UI, /corte final anterior/);
  assert.match(UI, /data-bc7-finance-form="gasto"/);
  assert.match(UI, /data-bc7-finance-form="reinversion"/);
  assert.match(UI, /bc7_registrar_gasto_jornada/);
  assert.match(UI, /bc7_registrar_reinversion_jornada/);
  assert.match(UI, /bc7_finanzas_jornada/);
  assert.match(UI, /clave de idempotencia se conserva/);
  assert.match(UI, /state\.admin\|\|can\('gastos','ver'\)/);
  assert.match(UI, /state\.admin\|\|can\('reinversiones','ver'\)/);
});
