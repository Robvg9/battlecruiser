"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATION = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20261027184823_bc7_turno_movimientos_sesion_20261027.sql"),
  "utf8"
).toLowerCase();
const FIXTURE = fs.readFileSync(
  path.join(__dirname, "bc7-turno-movimientos-sesion-fixture.sql"),
  "utf8"
).toLowerCase();
const CONTRACT = fs.readFileSync(
  path.join(__dirname, "bc7-turno-movimientos-sesion-contract.sql"),
  "utf8"
).toLowerCase();

test("archivo por turno es una función de solo lectura y exige sesión autenticada", () => {
  assert.match(MIGRATION, /create or replace function public\.bc7_movimientos_sesion\(p_turno_sesion_id uuid\)/);
  assert.match(MIGRATION, /v_uid uuid := auth\.uid\(\)/);
  assert.match(MIGRATION, /if v_uid is null/);
  assert.match(MIGRATION, /tiene_permiso\('reportes', 'ver'\)[\s\S]*and not public\.tiene_permiso\('turnos', 'ver'\)/);
  assert.match(MIGRATION, /raise exception.*using errcode = '42501'/s);
  assert.match(MIGRATION, /returns table/);
  assert.doesNotMatch(MIGRATION, /\b(insert into|update public\.|delete from|truncate)\b/);
});

test("la atribución al turno requiere la sesión exacta, el usuario, el almacén y el tramo temporal", () => {
  assert.match(MIGRATION, /tr\.turno_sesion_id = v_s\.id/);
  assert.match(MIGRATION, /p\.responsable_id = v_uid/);
  assert.match(MIGRATION, /p\.id = v_s\.jornada_programacion_id/);
  assert.match(MIGRATION, /tr\.usuario_id = v\.creado_por/);
  assert.match(MIGRATION, /tr\.usuario_id = t\.creado_por/);
  assert.match(MIGRATION, /tr\.inicio_at/);
  assert.match(MIGRATION, /tr\.fin_at is null or/);
  assert.match(MIGRATION, /v_s\.almacen_id/);
  assert.match(MIGRATION, /at time zone 'america\/havana'\)::date = v_s\.fecha/);
});

test("el contrato PostgreSQL cubre un turno cerrado de dos fechas y evita cruces entre días", () => {
  assert.match(FIXTURE, /estado_maestro,\s*dias_turno[\s\S]*?'cerrado',\s*2\s*\n\);/);
  assert.match(FIXTURE, /,2,'manana','2026-10-28'/);
  assert.match(CONTRACT, /day 2 is a separate business date/);
  assert.match(CONTRACT, /day 1 operations leaked into the day 2 archive/);
  assert.match(CONTRACT, /day 2 operations leaked into the day 1 archive/);
  assert.match(CONTRACT, /v_turn_sessions <> 4 or v_turn_dates <> 2/);
});

test("función con privilegios limitados a usuarios autenticados", () => {
  assert.match(MIGRATION, /revoke all on function public\.bc7_movimientos_sesion\(uuid\) from public/);
  assert.match(MIGRATION, /revoke all on function public\.bc7_movimientos_sesion\(uuid\) from anon/);
  assert.match(MIGRATION, /grant execute on function public\.bc7_movimientos_sesion\(uuid\) to authenticated/);
});
