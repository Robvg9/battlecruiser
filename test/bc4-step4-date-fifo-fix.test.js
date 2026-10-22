// Regression checks for the Step 4/15 date and purchase-cost fix.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20261022010000_bc4_step4_report_timezone_and_purchase_cost_base_units.sql"), "utf8");
const reportsUi = fs.readFileSync(path.join(root, "public", "js", "reportes.js"), "utf8");

test("all date-filter RPCs use America/Havana calendar dates", () => {
  const required = [
    "reporte_resumen_ejecutivo",
    "reporte_ventas",
    "reporte_transferencias",
    "reporte_vales",
    "reporte_movimiento_inventario",
    "rentabilidad_ventas",
    "historial_compras",
    "movimientos_producto",
  ];
  for (const name of required) {
    assert.match(migration, new RegExp("CREATE OR REPLACE FUNCTION public\\." + name + "\\("), name + " definition is present");
  }
  assert.match(migration, /AT TIME ZONE 'America\/Havana'/);
  assert.doesNotMatch(migration, /\\b[a-z_][a-z0-9_]*\\.(?:fecha|fecha_compra)\\s*::\\s*date\\b/i);
});

test("single and multi-line purchases normalize pack cost to base-unit cost", () => {
  assert.match(migration, /registrar_compra\\(/);
  assert.match(migration, /registrar_compra_multiple\\(/);
  assert.match(migration, /v_costo_unitario_base := p_costo_unitario \/ \(v_cantidad_final \/ p_cantidad_presentacion\)/);
  assert.match(migration, /v_costo_unitario_base := v_costo \/ \(v_cantidad_final \/ v_cantidad_presentacion\)/);
  assert.match(migration, /cantidad_restante,costo_unitario,usuario_id\) values\(p_producto_id,p_almacen_id,v_cantidad_final,v_cantidad_final,v_costo_unitario_base,auth\.uid\(\)\)/);
  assert.match(migration, /cantidad_restante,costo_unitario,fecha_compra,origen,usuario_id,compra_id\) values\(v_producto_id,p_almacen_id,v_cantidad_final,v_cantidad_final,v_costo_unitario_base/);
  // Historical financial rows are intentionally not mutated by this migration.
  assert.doesNotMatch(migration, /UPDATE public\\.lotes_compra\\s+SET\\s+costo_unitario/i);
});

test("Reportes labels and all row renderers use explicit Cuba timezone", () => {
  assert.match(reportsUi, /function fechaHoraReporte\(fecha\)/);
  assert.match(reportsUi, /timeZone:\s*"America\/Havana"/);
  assert.doesNotMatch(reportsUi, /\bfechaHora\(/);
  assert.ok((reportsUi.match(/\bfechaHoraReporte\(/g) || []).length >= 7);
});
