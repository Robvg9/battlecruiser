"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261109230000_la_cueva_period_retroactive_opening.sql"),
  "utf8"
);

test("retroactive opening is an admin-only atomic session creation with immutable opening inventory", () => {
  assert.match(migration, /bc7_admin_abrir_jornada_existente/);
  assert.match(migration, /bc_actor_is_admin\(\)/);
  assert.match(migration, /turno_jornada_inventario_cortes/);
  assert.match(migration, /turno_jornada_inventario_lineas/);
  assert.match(migration, /turno_tramos/);
  assert.match(migration, /estado='EN_CURSO'/);
  assert.match(migration, /stock_global_modificado',false/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.bc7_admin_abrir_jornada_existente/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.bc7_admin_abrir_jornada_existente[\s\S]*TO authenticated/);
  assert.doesNotMatch(migration, /\bUPDATE\s+public\.stock\b|\bINSERT\s+INTO\s+public\.stock\b|\bDELETE\s+FROM\s+public\.stock\b/i);
});

test("period ranges and imported lines are validated before any session is created", () => {
  assert.match(migration, /p_fecha_fin-p_fecha_inicio > 30/);
  assert.match(migration, /p_inicio_real_at > now\(\)/);
  assert.match(migration, /v_expected=0 OR v_count<>v_expected OR v_distinct<>v_count/);
  assert.match(migration, /fecha BETWEEN p_fecha_inicio AND p_fecha_fin/);
  assert.match(migration, /t\.fecha>p_inicio_real_at/);
  assert.match(migration, /t\.estado='completada'/);
});

test("existing transfers are linked by immutable reference, never recreated", () => {
  assert.match(migration, /turno_jornada_entradas_vinculadas/);
  assert.match(migration, /transferencia_id uuid NOT NULL REFERENCES public\.transferencias/);
  assert.match(migration, /UNIQUE \(transferencia_id\)/);
  assert.match(migration, /INSERT INTO public\.turno_jornada_entradas_vinculadas/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+public\.transferencias\b/i);
});

test("multi-day close uses the period end date", () => {
  assert.match(migration, /fecha_fin date/);
  assert.match(migration, /v_fecha_fin := coalesce\(v_programacion\.fecha_fin,v_programacion\.fecha\)/);
  assert.match(migration, /v_local::date<>v_fecha_fin/);
});
