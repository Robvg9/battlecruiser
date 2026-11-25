"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const migration = read("supabase/migrations/20261125224135_warehouse_dependent_salary_configuration.sql");
const warehouses = read("public/js/almacenes.js");
const ownerReview = read("public/js/jornada-owner-review.js");
const jornadaUi = read("public/js/bc7-jornada-ui.js");
const app = read("public/app.js");
const sw = read("public/service-worker.js");
const index = read("public/index.html");
const css = read("public/style.css");
const postgresRunner = read("test/step7-jornada-postgres-windows-ci.js");

test("salary rules are scoped to a dependent and warehouse, with audit history and protected RPC access", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.almacen_dependienta_configuracion/);
  assert.match(migration, /UNIQUE \(almacen_id, usuario_id\)/);
  assert.match(migration, /salario_porcentaje_permanente/);
  assert.match(migration, /salario_porcentaje_temporal/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.almacen_dependienta_eventos/);
  assert.match(migration, /ALTER TABLE public\.almacen_dependienta_configuracion ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.almacen_dependienta_eventos ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.almacen_dependienta_configuracion FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /bc8_listar_dependientas_almacen/);
  assert.match(migration, /bc8_configurar_dependienta_almacen/);
  assert.match(migration, /bc8_aplicar_salario_dependienta_programada/);
  assert.match(migration, /SALARIO_TEMPORAL_APLICADO/);
  assert.match(migration, /bc_actor_is_admin\(\)/);
  assert.doesNotMatch(migration, /UPDATE public\.turno_jornada_configuracion\s+SET\s+salario_porcentaje/i);
});

test("permanent changes affect only future unstarted Jornada snapshots; one-time changes target the next shift", () => {
  assert.match(migration, /upper\(p_vigencia_tipo\) = 'PERMANENTE'/);
  assert.match(migration, /upper\(p_vigencia_tipo\) = 'PROXIMA_JORNADA'/);
  assert.match(migration, /p\.fecha >= v_local_today/);
  assert.match(migration, /s\.estado IN \('PENDIENTE','PROGRAMADA'\)/);
  assert.match(migration, /NOT EXISTS \([\s\S]*FROM public\.turno_tramos t WHERE t\.turno_sesion_id = s\.id/);
  assert.match(migration, /NEW\.salario_porcentaje := v_config\.salario_porcentaje_temporal/);
  assert.match(migration, /NEW\.salario_porcentaje := v_config\.salario_porcentaje_permanente/);
  assert.match(migration, /salario_temporal_programacion_id/);
});

test("warehouse panel lets the Owner assign, unassign and configure each dependent", () => {
  for (const marker of [
    "Personal y salarios",
    "Asignar dependienta",
    "Guardar porcentaje",
    "Quitar del almacén",
    "Permanente · futuras jornadas",
    "Solo próxima jornada",
    "bc8_listar_dependientas_almacen",
    "bc8_configurar_dependienta_almacen",
    "data-bc-alm-equipo-action",
    "Necesitas conexión para guardar la configuración salarial"
  ]) assert.ok(warehouses.includes(marker), marker);
  assert.match(css, /\.bc-alm-equipo/);
});

test("owner review no longer offers or displays a per-session salary percentage editor", () => {
  assert.doesNotMatch(ownerReview, /Porcentaje salarial y cálculo/);
  assert.doesNotMatch(ownerReview, /data-bcjr-salary-input/);
  assert.doesNotMatch(ownerReview, /bc7_configurar_salario_porcentaje_jornada/);
  assert.match(ownerReview, /Configura el porcentaje salarial de esta dependienta desde la sección Almacenes/);
  assert.match(ownerReview, /'Salario'/);
});

test("the Jornada dashboard no longer duplicates Phase 2 financial calculations", () => {
  const start = jornadaUi.indexOf("function calculationPhaseHtml(detail){");
  const end = jornadaUi.indexOf("function previewValue(value)", start);
  assert.ok(start >= 0 && end > start, "calculation summary helper should remain as an empty compatibility function");
  const helper = jornadaUi.slice(start, end);
  assert.match(helper, /return ''/);
  assert.doesNotMatch(helper, /Fase 2|Cálculos automáticos completados|Ventas estimadas|Salario calculado/);
  assert.doesNotMatch(jornadaUi, /Fase 2 · Cálculos automáticos completados/);
});

test("PostgreSQL 17 runner applies and exercises the new production migration", () => {
  assert.ok(postgresRunner.includes('applySql("supabase/migrations/20261125224135_warehouse_dependent_salary_configuration.sql")'));
  assert.ok(postgresRunner.includes('applySql("test/warehouse-dependent-salary-config-contract.sql")'));
  assert.match(read("test/warehouse-dependent-salary-config-contract.sql"), /one-time 8%% salary was not stamped/i);
  assert.match(read("test/warehouse-dependent-salary-config-contract.sql"), /already-started Jornada snapshot/i);
});

test("PWA shell and module cache versions are aligned for the new release", () => {
  assert.match(index, /v9\.5\.162 — BattleCruiser/);
  assert.match(index, /app\.js\?v=9\.5\.162/);
  assert.match(index, /almacenes\.js\?v=20261125\.1/);
  assert.match(sw, /BC_SW_VERSION = "9\.5\.162"/);
  assert.match(sw, /jornada-owner-review\.js\?v=1\.18/);
  assert.match(sw, /almacenes\.js\?v=20261125\.1/);
  assert.match(app, /\["bc7-jornada-ui\.js","7\.66"\]/);
  assert.match(app, /\["jornada-owner-review\.js","1\.18"\]/);
});
