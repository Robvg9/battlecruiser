"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "20261101005329_fix_turno_admin_permission_boundary.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

test("turn creation permission never confers owner/admin authority", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.bc_actor_is_admin\(\)/);
  assert.match(sql, /public\.tiene_permiso\('turnos','editar_any'\)/);
  assert.match(sql, /public\.tiene_permiso\('ciclos','editar_any'\)/);
  assert.doesNotMatch(sql, /tiene_permiso\('turnos','crear'\)/);
  assert.doesNotMatch(sql, /tiene_permiso\('ciclos','crear'\)/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path TO 'public', 'pg_temp'/);
});
