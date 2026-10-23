"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "20261023090000_step6_inventory_movements_adjustments_settlement.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

test("Step 6 keeps the movement RPC signatures and stable result schemas", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reporte_movimiento_inventario\(\s*p_desde date DEFAULT NULL,\s*p_hasta date DEFAULT NULL,\s*p_producto_id uuid DEFAULT NULL,\s*p_almacen_id uuid DEFAULT NULL,\s*p_limite integer DEFAULT 100,\s*p_offset integer DEFAULT 0/s);
  assert.match(sql, /RETURNS TABLE\(\s*fecha timestamptz,\s*tipo text,\s*producto text,\s*almacen text,\s*cantidad numeric,\s*direccion text,\s*operacion_id uuid/s);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.movimientos_producto\(\s*p_producto_id uuid DEFAULT NULL,\s*p_almacen_id uuid DEFAULT NULL,\s*p_desde date DEFAULT NULL,\s*p_hasta date DEFAULT NULL,\s*p_tipo text DEFAULT NULL,\s*p_limite integer DEFAULT 100,\s*p_offset integer DEFAULT 0/s);
  assert.match(sql, /costo_unitario numeric,\s*usuario text,\s*operacion_id uuid/s);
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.resolver_aprobacion_operativa("));
  assert.ok(sql.includes("p_comentario text DEFAULT NULL"));
  assert.ok(sql.includes("p_cantidad_real numeric DEFAULT NULL"));
  assert.ok(sql.includes("p_monto_real numeric DEFAULT NULL"));
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.registrar_cuadre("));
  assert.ok(sql.includes("p_idempotency_key uuid DEFAULT NULL"));
  assert.ok(sql.includes("p_observacion text DEFAULT NULL"));
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.revisar_cuadre("));
  assert.match(sql, /SET search_path TO 'public', 'pg_temp'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.movimientos_producto[\s\S]*?FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.movimientos_producto[\s\S]*?TO authenticated, service_role/);
});

test("Both movement reports include purchase inflows and only approved inventory adjustments", () => {
  assert.match(sql, /lc\.origen='compra'/);
  assert.match(sql, /'entrada'::text/);
  assert.match(sql, /WHERE m\.estado='APROBADA'/);
  assert.match(sql, /WHERE b\.estado='APROBADA'/);
  assert.match(sql, /'merma'::text/);
  assert.match(sql, /'baja'::text/);
  assert.match(sql, /'transferencia_salida'/);
  assert.match(sql, /'transferencia_entrada'/);
  assert.match(sql, /p_desde > p_hasta/);
  assert.match(sql, /ORDER BY 1 DESC/);
});

test("Inventory adjustment approvals are least-privilege, reasoned and bounded", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.resolver_aprobacion_operativa/);
  assert.match(sql, /public\.tiene_permiso\('gastos','editar_any'\)/);
  assert.match(sql, /public\.tiene_permiso\('mermas','editar_any'\)/);
  assert.match(sql, /public\.tiene_permiso\('bajas','editar_any'\)/);
  assert.match(sql, /p_tipo IN \('merma','baja'\)/);
  assert.match(sql, /v_cant_real<=0 OR v_cant_real>v_cant/);
  assert.match(sql, /public\._aplicar_salida_aprobada\(v_alm,v_prod,v_cant_real\)/);
  assert.ok(sql.includes("p_decision='RECHAZAR' AND NULLIF(btrim(p_comentario),'') IS NULL"));
});

test("Settlement functions reject null/invalid decisions and serialize against the target row", () => {
  assert.match(sql, /p_dinero_declarado IS NULL OR p_dinero_declarado<0/);
  assert.match(sql, /SELECT \* INTO c FROM public\.cuadres WHERE id=p_cuadre_id FOR UPDATE/);
  assert.match(sql, /p_decision IS NULL OR p_decision NOT IN \('aprobar','rechazar','devolver'\)/);
  assert.match(sql, /El cuadre debe estar declarado o vuelto a declarar antes de revisarlo/);
  assert.match(sql, /El cuadre ya fue resuelto/);
  assert.match(sql, /private\.reclamar_idempotencia/);
  assert.match(sql, /public\.registrar_auditoria\('cuadre'/);
});

test("The migration is additive and does not delete or truncate production history", () => {
  assert.ok(sql.startsWith("-- Step 6/15"));
  assert.ok(sql.includes("BEGIN;"));
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\s+(?:TABLE\s+)?public\./i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+public\.(?:stock|ventas|ventas_lineas|lotes_compra|transferencias|transferencias_lineas|vales_salida|mermas|bajas|cuadres)\b/i);
});
