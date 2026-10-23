"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "20261023050000_step5_jornada_unica_backend.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

test("Step 5 adds a single 07:00–23:00 jornada with an explicit Cuban timezone default", () => {
  assert.match(sql, /hora_inicio time NOT NULL DEFAULT TIME '07:00'/);
  assert.match(sql, /hora_fin time NOT NULL DEFAULT TIME '23:00'/);
  assert.match(sql, /zona_horaria text NOT NULL DEFAULT 'America\/Havana'/);
  assert.match(sql, /hora_inicio < hora_fin/);
});

test("schedule supports explicit work/rest rotation without inferring a pattern", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.turno_jornada_patrones/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.turno_jornada_patron_dias/);
  assert.match(sql, /trabaja boolean NOT NULL/);
  assert.match(sql, /responsable_id uuid REFERENCES auth\.users\(id\)/);
  assert.match(sql, /bc5_guardar_patron_jornada/);
  assert.match(sql, /No existe patrón activo ni programación explícita/);
});

test("new journey is one session per working day, with explicit rest records", () => {
  assert.match(sql, /CHECK \(bloque = ANY \(ARRAY\['MANANA'::text, 'TARDE'::text, 'JORNADA'::text\]\)\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS turno_sesiones_unica_jornada_programada/);
  assert.match(sql, /'JORNADA_UNICA_CREADA'/);
  assert.match(sql, /'DESCANSO'/);
  assert.match(sql, /bc5_crear_jornada_unica/);
});

test("legacy MANANA/TARDE history is preserved and mixed-model rows are rejected", () => {
  assert.match(sql, /bloque IN \('MANANA','TARDE'\) AND jornada_programacion_id IS NULL/);
  assert.match(sql, /bc5_guard_no_mixed_jornada_blocks/);
  assert.match(sql, /No se puede mezclar JORNADA con MANANA\/TARDE/);
  assert.match(sql, /No se puede mezclar MANANA\/TARDE con JORNADA/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.turno_sesiones/i);
  assert.doesNotMatch(sql, /UPDATE\s+public\.turno_sesiones\s+SET\s+bloque\s*=/i);
});

test("date/responsible conflicts are guarded between new schedules and active legacy assignments", () => {
  assert.match(sql, /turno_jornada_un_responsable_dia/);
  assert.match(sql, /bc5_guard_jornada_assignment_conflicts/);
  assert.match(sql, /bc5_guard_legacy_assignment_conflicts/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /La persona ya tiene otra jornada programada para esa fecha/);
  assert.match(sql, /La persona ya tiene una jornada nueva programada para esa fecha/);
});

test("all new tables have RLS and no direct Data API table grants", () => {
  assert.match(sql, /ALTER TABLE public\.turno_jornada_configuracion ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.turno_jornada_patrones ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.turno_jornada_patron_dias ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.turno_jornada_programacion ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.turno_jornada_eventos ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/);
});

test("privileged RPCs require authenticated ADMIN and deny anon/public execution", () => {
  for (const fn of [
    "bc5_configurar_horario_jornada",
    "bc5_obtener_configuracion_jornada",
    "bc5_guardar_patron_jornada",
    "bc5_previsualizar_jornada",
    "bc5_crear_jornada_unica",
    "bc5_reprogramar_jornada",
    "bc5_listar_patrones_jornada",
    "bc5_obtener_programacion_jornada",
  ]) {
    assert.match(sql, new RegExp("REVOKE ALL ON FUNCTION public\\." + fn + "\\("));
    assert.match(sql, new RegExp("GRANT EXECUTE ON FUNCTION public\\." + fn + "\\([\\s\\S]*?TO authenticated;"));
  }
  assert.match(sql, /IF auth\.uid\(\) IS NULL OR NOT public\.bc_actor_is_admin\(\) THEN/);
});
