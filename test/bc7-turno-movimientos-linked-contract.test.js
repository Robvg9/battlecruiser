"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8").toLowerCase();
const MIGRATION = read("supabase/migrations/20261112140000_bc7_linked_jornada_movements.sql");
const FIXTURE = read("test/bc7-turno-movimientos-linked-fixture.sql");
const CONTRACT = read("test/bc7-turno-movimientos-linked-contract.sql");

test("linked inbound transfer attribution honors exact session link without broad date inference", () => {
  assert.match(MIGRATION, /linked\.turno_sesion_id\s*=\s*v_s\.id/);
  assert.match(MIGRATION, /linked\.transferencia_id\s*=\s*t\.id/);
  assert.match(MIGRATION, /or exists\s*\([\s\S]*tr\.usuario_id\s*=\s*t\.creado_por/);
  assert.match(FIXTURE, /turno_jornada_entradas_vinculadas/);
  assert.match(FIXTURE, /97200000-0000-0000-0000-000000000001/);
  assert.match(FIXTURE, /97200000-0000-0000-0000-000000000002/);
  assert.match(CONTRACT, /explicit transfer link must appear once/);
  assert.match(CONTRACT, /unlinked transfer by an unrelated actor must not be inferred/);
  assert.match(CONTRACT, /explicit jornada links must never leak/);
});

test("approved adjustments follow their explicit source session even when ADMIN reviews later", () => {
  assert.match(MIGRATION, /m\.turno_sesion_id\s*=\s*v_s\.id/);
  assert.match(MIGRATION, /b\.turno_sesion_id\s*=\s*v_s\.id/);
  assert.match(FIXTURE, /99200000-0000-0000-0000-000000000001/);
  assert.match(FIXTURE, /99300000-0000-0000-0000-000000000001/);
  assert.match(CONTRACT, /approved session-linked merma\/baja must remain/);
});
