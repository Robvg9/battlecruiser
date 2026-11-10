"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261109230000_la-cueva-period-retroactive-opening.sql"), "utf8");
const jornada = fs.readFileSync(path.join(__dirname, "../public/js/bc7-jornada-ui.js"), "utf8");
const approvals = fs.readFileSync(path.join(__dirname, "../public/js/aprobaciones-admin.js"), "utf8");
const postgresContract = fs.readFileSync(path.join(__dirname, "la-cueva-period-settlement-contract.sql"), "utf8");

test("La Cueva exposes retail mode and preserves the shared inventory handover read model", () => {
  assert.match(migration, /'es_minorista',v_agrupar/);
  assert.match(migration, /'entrega_compartida',public\.bc7_estado_entrega_inventario_jornada\(v_s\.id\)/);
  assert.equal((migration.match(/CREATE TABLE IF NOT EXISTS public\.turno_jornada_entradas_vinculadas/g) || []).length, 1);
});

test("inventory settlement uses immutable snapshot lines and never derives retail sales from POS", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.bc7_liquidacion_inventario_jornada");
  const end = migration.indexOf("REVOKE ALL ON FUNCTION public.bc7_liquidacion_inventario_jornada", start);
  const fn = migration.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(fn, /FROM public\.turno_jornada_inventario_lineas l\s+WHERE l\.corte_id=v_initial\.id/);
  assert.match(fn, /FROM public\.turno_jornada_inventario_lineas l\s+WHERE l\.corte_id=v_final\.id/);
  assert.match(fn, /i\.qty\+coalesce\(mt\.transfer_in,0\)/);
  assert.match(fn, /-coalesce\(f\.qty,0\)\) sold_qty/);
  assert.match(fn, /precio_unitario/);
  assert.match(fn, /precio_normal/);
  assert.doesNotMatch(fn, /ventas_lineas|bc7_ventas_jornada|registrar_venta/);
  assert.match(fn, /'ventas_estimadas',v_sales_total/);
  assert.match(fn, /'salario_calculado',v_salary/);
  assert.match(fn, /'diferencia',v_difference/);
});

test("daily cash is period-scoped, idempotent, pending by default, and owner-approved", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.turno_jornada_entregas_diarias/);
  assert.match(migration, /UNIQUE\(turno_sesion_id,fecha\)/);
  assert.match(migration, /UNIQUE\(creado_por,idempotency_key\)/);
  assert.match(migration, /'PENDIENTE'/);\n  assert.match(migration, /v_daily_missing:=greatest\\(0,v_daily_expected-v_daily_approved\\)/);\n  assert.match(migration, /v_daily_missing=0/);\n  assert.match(migration, /v_existing_state<>'RECHAZADA'/);\n  assert.match(migration, /entregas_diarias_faltantes/);
  assert.match(migration, /p_fecha<v_p\.fecha OR p_fecha>=v_fecha_fin OR p_fecha>v_hoy/);
  assert.match(migration, /public\.tiene_permiso\('entregas_caja','editar_any'\)/);
  assert.match(migration, /p_tipo='entrega_diaria'/);
  assert.match(migration, /monto_aprobado=CASE WHEN p_decision='APROBAR'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.bc7_configurar_salario_porcentaje_jornada/);
  assert.match(migration, /salario_porcentaje BETWEEN 0 AND 100/);
});

test("La Cueva UI shows daily cash, owner-configured salary, and inventory-derived settlement, not retail POS sales", () => {
  assert.match(jornada, /const isRetail=detail\.sesion\.es_minorista===true/);
  assert.match(jornada, /const showSales=!isRetail/);
  assert.match(jornada, /bc7_entregas_diarias_jornada/);
  assert.match(jornada, /bc7_registrar_entrega_diaria_jornada/);
  assert.match(jornada, /bc7_configurar_salario_porcentaje_jornada/);
  assert.match(jornada, /bc7_liquidacion_inventario_jornada/);
  assert.match(jornada, /data-bc7-daily-cash-form/);
  assert.match(jornada, /data-bc7-salary-rate-form/);
});

test("owner approval UI understands daily-cash records and zero-value counts", () => {
  assert.match(approvals, /can\('entregas_caja','editar_any'\)/);
  assert.match(approvals, /entrega_diaria/);
  assert.match(approvals, /isDailyCash\?real<0:real<=0/);
  assert.match(approvals, /p_monto_real:isMoney\?real:null/);
});

test("PostgreSQL contract verifies delta formula, pending approval, idempotent retry, and reconciliation", () => {
  assert.match(postgresContract, /v_daily_retry IS DISTINCT FROM v_daily_id/);
  assert.match(postgresContract, /ventas_estimadas/);
  assert.match(postgresContract, /salario_calculado/);
  assert.match(postgresContract, /efectivo_esperado_despues_de_gastos_reinversiones_salario/);
  assert.match(postgresContract, /diferencia/);
  assert.match(postgresContract, /v_result->>'calculable'/);\n  assert.match(postgresContract, /already represented in the imported initial count/);\n  assert.match(postgresContract, /turno_jornada_entradas_vinculadas/);
});
