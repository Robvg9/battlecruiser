"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const migration = fs.readFileSync(path.join(__dirname, "..", "supabase/migrations/20261107000100_bc_purchase_history_group_id.sql"), "utf8");
test("el historial usa el ID de cabecera de compra para agrupar listas", () => {
  assert.match(migration, /COALESCE\(lc\.compra_id,\s*lc\.id\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.movimientos_producto/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /public\.tiene_permiso\('reportes','ver'\)/);
  assert.match(migration, /LIMIT p_limite OFFSET p_offset/);
});
