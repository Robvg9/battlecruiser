"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20261022040000_bc4_reconcile_masareal_fifo_historical_costs.sql"),
  "utf8"
);

test("reconciliation pins all seven reviewed lots and twelve sale lines", () => {
  for (const id of [
    "3ecb5800-5cbd-4b2f-9243-3b80f7cf9be8",
    "c77ebe79-2fd3-4a55-9c4d-b829bb070503",
    "eb2f5af4-3cb1-46f6-bcc8-2e6d3d445e25",
    "36a47496-63d9-4f0e-a2e2-34e620c3b2e8",
    "4ebb53e2-8526-4ea1-87dd-4b54b2fc624d",
    "521a655a-e867-491b-a6f8-d79244e6a949",
    "b1f6ab10-14f4-4e9a-8560-6d9e93b55ed8",
  ]) assert.ok(migration.includes(id), "missing reviewed lot " + id);
  for (const id of [
    "e4b0e86f-ab87-4733-9451-7db3d12de267",
    "42233e42-f831-41f7-8beb-40673ef9316b",
    "ba1aef09-c2fc-44f9-9a7d-60b4c645790a",
    "ecdacb6e-80b6-4dbf-a12c-0ac71c44a792",
    "61a502d4-d603-4249-b110-b51b6a6dbd0b",
    "2745520c-2a01-4cc5-98c3-201e1ea6a292",
    "21928e1f-8f1b-420d-b35b-4dcf3245a4af",
    "f6cf6298-8a4f-40f7-b733-542f13c3b3a5",
    "f3dca385-9736-4bab-93e8-b997c149dbfa",
    "c153e5f8-2686-4cf9-a63f-5cbe75729618",
    "bd38653d-acc1-4cf2-87a0-fec03212bc00",
    "ef939c0b-4694-486c-af41-121f95a3041a",
  ]) assert.ok(migration.includes(id), "missing reviewed sale line " + id);
});

test("migration guards before-image, creates private backup, and checks row counts", () => {
  assert.match(migration, /CREATE TABLE private\.bc_step4_masareal_fifo_cost_reconciliation_20261022/);
  assert.match(migration, /lots_before jsonb NOT NULL/);
  assert.match(migration, /sale_lines_before jsonb NOT NULL/);
  assert.match(migration, /Expected to update 7 lots/);
  assert.match(migration, /Expected to update 12 sale lines/);
  assert.match(migration, /v_units_remaining<>475/);
  assert.match(migration, /v_sales_revenue<>5000/);
  assert.match(migration, /v_lot_value<>3750/);
  assert.match(migration, /REVOKE ALL ON TABLE private\.bc_step4_masareal_fifo_cost_reconciliation_20261022 FROM PUBLIC, anon, authenticated/);
});

test("historical reconciliation never changes stock quantities or sale totals", () => {
  assert.doesNotMatch(migration, /UPDATE public\.stock\b/i);
  assert.doesNotMatch(migration, /UPDATE public\.ventas\s+SET/i);
  assert.match(migration, /UPDATE public\.lotes_compra\s+SET costo_unitario=150/);
  assert.match(migration, /UPDATE public\.ventas_lineas\s+SET costo_unitario_fifo=150/);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
});
