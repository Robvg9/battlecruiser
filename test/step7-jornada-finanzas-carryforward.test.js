"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATION = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/20261031010121_step7_jornada_finanzas_carryforward.sql"),
  "utf8"
);
const FINANCE_READ_MIGRATION = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/20261101154629_step4_assigned_jornada_finance_read.sql"),
  "utf8"
);
const SALES_MIGRATION = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/20261102010000_step4_jornada_sales_provenance.sql"),
  "utf8"
);
const CASH_READBACK_MIGRATION = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/20261102020000_step4_jornada_cash_count_readback.sql"),
  "utf8"
);
const UI = fs.readFileSync(
  path.join(__dirname, "..", "public/js/bc7-jornada-ui.js"),
  "utf8"
);
const FINANCE_CONTRACT = fs.readFileSync(
  path.join(__dirname, "..", "test/step7-jornada-finanzas-contract.sql"),
  "utf8"
);
const PG_CI = fs.readFileSync(
  path.join(__dirname, "..", "test/step7-jornada-postgres-windows-ci.js"),
  "utf8"
);
const PG_WORKFLOW = fs.readFileSync(
  path.join(__dirname, "..", ".github/workflows/step7-jornada-postgres.yml"),
  "utf8"
);

test("Jornada finance adds separate session/tranche provenance without repointing legacy FKs", () => {
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS turno_sesion_id uuid/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS turno_tramo_id uuid/);
  assert.match(MIGRATION, /gastos_turno_sesion_id_fkey[\s\S]*REFERENCES public\.turno_sesiones\(id\)/);
  assert.match(MIGRATION, /gastos_turno_tramo_id_fkey[\s\S]*REFERENCES public\.turno_tramos\(id\)/);
  assert.match(MIGRATION, /reinversiones_turno_sesion_id_fkey[\s\S]*REFERENCES public\.turno_sesiones\(id\)/);
  assert.match(MIGRATION, /reinversiones_turno_tramo_id_fkey[\s\S]*REFERENCES public\.turno_tramos\(id\)/);
  assert.match(MIGRATION, /NEW\.sesion_id IS NOT NULL OR NEW\.ciclo_id IS NOT NULL/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_registrar_gasto_jornada/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_registrar_reinversion_jornada/);
  assert.doesNotMatch(MIGRATION, /\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\s+public\.(gastos|reinversiones|turno_sesiones)/i);
});

test("Jornada finance RPCs require permission, assigned worker, active tramo and idempotency", () => {
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc7_validar_tramo_responsable_jornada/);
  assert.match(MIGRATION, /v_s\.estado<>'EN_CURSO'/);
  assert.match(MIGRATION, /v_p\.responsable_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(MIGRATION, /a\.usuario_id=auth\.uid\(\) AND a\.retirado_at IS NULL/);
  assert.match(MIGRATION, /tramo_activo/);
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc7_registrar_gasto_jornada/);
  assert.match(MIGRATION, /tiene_permiso\('gastos','crear'\)/);
  assert.match(MIGRATION, /pg_advisory_xact_lock/);
  assert.match(MIGRATION, /INSERT INTO public\.gastos[\s\S]*'PENDIENTE'/);
  assert.doesNotMatch(MIGRATION, /public\.crear_gasto\(/);
  assert.match(MIGRATION, /p_idempotency_key/);
  assert.match(MIGRATION, /GASTO_SOLICITADO/);
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc7_registrar_reinversion_jornada/);
  assert.match(MIGRATION, /tiene_permiso\('reinversiones','crear'\)/);
  assert.match(MIGRATION, /public\.registrar_reinversion_multiple\(/);
  assert.match(MIGRATION, /REINVERSION_REGISTRADA/);
  assert.match(MIGRATION, /v_s\.turno_id,p_idempotency_key/);
});

test("Reinvestment preserves provider and serializes actor/key retries", () => {
  const start=MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_registrar_reinversion_jornada");
  const end=MIGRATION.indexOf("$function$;",start);
  assert.ok(start>=0&&end>start);
  const fn=MIGRATION.slice(start,end);
  assert.match(fn,/pg_advisory_xact_lock/);
  assert.match(fn,/NULLIF\(btrim\(coalesce\(p_proveedor,''\)\),''\)/);
  assert.match(fn,/v_s\.turno_id,p_idempotency_key/);
});

test("PostgreSQL 17 workflow applies the finance and Jornada sales migration and exercises the contract", () => {
  assert.match(PG_CI,/test\/step7-jornada-finanzas-fixture\.sql/);
  assert.match(PG_CI,/supabase\/migrations\/20261102010000_step4_jornada_sales_provenance\.sql/);
  assert.match(FINANCE_CONTRACT,/bc7_registrar_venta_jornada/);
  assert.match(PG_CI,/test\/step7-jornada-finanzas-contract\.sql/);
  assert.match(PG_WORKFLOW,/supabase\/migrations\/20261102010000_step4_jornada_sales_provenance\.sql/);
  assert.match(PG_WORKFLOW,/test\/step7-jornada-finanzas-contract\.sql/);
  assert.match(PG_CI,/supabase\/migrations\/20261031010121_step7_jornada_finanzas_carryforward\.sql/);
  assert.match(PG_CI,/supabase\/migrations\/20261101154629_step4_assigned_jornada_finance_read\.sql/);
  assert.match(PG_CI,/test\/step7-jornada-finanzas-contract\.sql/);
  assert.match(PG_WORKFLOW,/supabase\/migrations\/20261031010121_step7_jornada_finanzas_carryforward\.sql/);
  assert.match(PG_WORKFLOW,/supabase\/migrations\/20261101154629_step4_assigned_jornada_finance_read\.sql/);
  assert.match(PG_WORKFLOW,/test\/step7-jornada-finanzas-fixture\.sql/);
  assert.match(PG_WORKFLOW,/test\/step7-jornada-finanzas-contract\.sql/);
});

test("Jornada POS records exact session/tranche and payment method without backfilling legacy sales", () => {
  assert.match(SALES_MIGRATION, /ADD COLUMN IF NOT EXISTS turno_sesion_id uuid/);
  assert.match(SALES_MIGRATION, /ADD COLUMN IF NOT EXISTS turno_tramo_id uuid/);
  assert.match(SALES_MIGRATION, /ADD COLUMN IF NOT EXISTS metodo_pago text NOT NULL DEFAULT 'NO_DECLARADO'/);
  assert.match(SALES_MIGRATION, /ventas_jornada_link_pair_chk/);
  assert.match(SALES_MIGRATION, /ventas_actor_idempotency_uidx/);
  assert.match(SALES_MIGRATION, /bc7_validar_tramo_responsable_jornada\(p_turno_sesion_id\)/);
  assert.match(SALES_MIGRATION, /v_t\.id IS DISTINCT FROM p_turno_tramo_id/);
  assert.match(SALES_MIGRATION, /v_s\.bloque<>'JORNADA'/);
  assert.match(SALES_MIGRATION, /p_metodo_pago NOT IN \('EFECTIVO','TRANSFERENCIA','TARJETA','OTRO'\)/);
  assert.match(SALES_MIGRATION, /idempotency_payload_hash/);
  assert.match(SALES_MIGRATION, /pg_advisory_xact_lock/);
  assert.match(SALES_MIGRATION, /public\.registrar_venta\(v_s\.almacen_id,p_lineas,gen_random_uuid\(\),v_tipo_precio\)/);
  assert.match(SALES_MIGRATION, /WHERE v\.turno_sesion_id=v_s\.id/);
  assert.match(SALES_MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc7_registrar_venta_jornada/);
  assert.match(SALES_MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc7_ventas_jornada/);
  const schemaChanges = SALES_MIGRATION.slice(0, SALES_MIGRATION.indexOf("CREATE OR REPLACE FUNCTION"));
  assert.doesNotMatch(schemaChanges, /UPDATE\s+public\.ventas\s+SET\s+turno_sesion_id/i,
    "schema migration must not backfill or relink historical sales");
  assert.match(SALES_MIGRATION, /UPDATE public\.ventas[\s\S]*WHERE id=v_venta_id AND creado_por=v_uid/,
    "only the sale just created in the current transaction may receive its session provenance");
  assert.doesNotMatch(SALES_MIGRATION, /\bDELETE\s+FROM\s+public\.ventas\b|\bTRUNCATE\s+public\.ventas\b/i);
});

test("Jornada read model returns owner-counted cash fields without writing declaration rows", () => {
  assert.match(CASH_READBACK_MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc7_obtener_inventario_jornada/);
  for (const field of ["monto_contado","contado_por","contado_at","observacion_conteo","diferencia","aprobado_por","aprobado_at"]) {
    assert.ok(CASH_READBACK_MIGRATION.includes("'"+field+"'"),"missing readback field "+field);
  }
  assert.match(CASH_READBACK_MIGRATION, /tiene_permiso\('turnos','ver'\)/);
  assert.match(CASH_READBACK_MIGRATION, /turno_asignaciones a/);
  assert.doesNotMatch(CASH_READBACK_MIGRATION, /\bINSERT\s+INTO\s+public\.turno_declaraciones\b|\bUPDATE\s+public\.turno_declaraciones\b|\bDELETE\s+FROM\s+public\.turno_declaraciones\b/i);
  assert.match(FINANCE_CONTRACT, /Jornada inventory readback omitted owner counted cash/);
  assert.match(PG_CI, /supabase\/migrations\/20261102020000_step4_jornada_cash_count_readback\.sql/);
  assert.ok(PG_WORKFLOW.includes("supabase/migrations/20261102020000_step4_jornada_cash_count_readback.sql"));
});

test("assigned responsible can read the full finance ledger for their own jornada only", () => {
  const start = FINANCE_READ_MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_finanzas_jornada");
  const end = FINANCE_READ_MIGRATION.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, "bc7_finanzas_jornada debe estar redefinida");
  const fn = FINANCE_READ_MIGRATION.slice(start, end);
  assert.match(fn, /tiene_permiso\('turnos','ver'\)/);
  assert.match(fn, /a\.turno_sesion_id=v_s\.id AND a\.usuario_id=auth\.uid\(\) AND a\.retirado_at IS NULL/);
  assert.doesNotMatch(fn, /responsable_id=auth\.uid\(\)/, "finance history must require a current assignment, not a stale scheduling row");
  assert.doesNotMatch(fn, /tiene_permiso\('(gastos|reinversiones|mermas|bajas)','ver'\)/, "assigned read must not require broad module visibility grants");
  for (const section of ["gastos", "reinversiones", "mermas", "bajas"]) {
    assert.match(fn, new RegExp("'" + section + "',coalesce\\(\\("), section + " must be returned for the assigned session");
  }
  for (const scope of [
    /g\.turno_sesion_id=v_s\.id/,
    /r\.turno_sesion_id=v_s\.id/,
    /m\.turno_sesion_id=v_s\.id/,
    /b\.turno_sesion_id=v_s\.id/
  ]) assert.match(fn, scope, "each ledger section must remain scoped to the one authorized session");
  assert.doesNotMatch(fn, /\bINSERT\s+INTO\b|\bUPDATE\s+public\.|\bDELETE\s+FROM\b/i, "the finance ledger RPC must remain read-only");
  assert.match(FINANCE_READ_MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_finanzas_jornada\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(FINANCE_READ_MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc7_finanzas_jornada\(uuid\) TO authenticated/);
});

test("Jornada inventory read and write RPCs require turnos.ver for non-admin assigned users", () => {
  const readStart = MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_obtener_inventario_jornada");
  const readEnd = MIGRATION.indexOf("$function$;", readStart);
  assert.ok(readStart >= 0 && readEnd > readStart, "bc7_obtener_inventario_jornada must be replaced");
  const readFn = MIGRATION.slice(readStart, readEnd);
  assert.match(readFn, /NOT public\.tiene_permiso\('turnos','ver'\)/);
  assert.match(readFn, /a\.turno_sesion_id=v_s\.id AND a\.usuario_id=auth\.uid\(\) AND a\.retirado_at IS NULL/);

  const writeStart = MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_jornada");
  const writeEnd = MIGRATION.indexOf("$function$;", writeStart);
  assert.ok(writeStart >= 0 && writeEnd > writeStart, "bc7_guardar_inventario_jornada must be replaced");
  const writeFn = MIGRATION.slice(writeStart, writeEnd);
  assert.match(writeFn, /NOT public\.tiene_permiso\('turnos','ver'\)/);
  assert.match(writeFn, /a\.turno_sesion_id=v_s\.id AND a\.usuario_id=v_uid AND a\.retirado_at IS NULL/);
});

test("previous confirmed final cut is only a source for a new physical initial cut", () => {
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS origen_corte_id uuid/);
  assert.match(MIGRATION, /turno_jornada_corte_origen_fkey/);
  assert.match(MIGRATION, /CHECK \(origen_corte_id IS NULL OR tipo='INICIAL'\)/);
  assert.match(MIGRATION, /'apertura_previa'/);
  assert.match(MIGRATION, /ps\.numero_dia=v_s\.numero_dia-1/);
  assert.match(MIGRATION, /ps\.estado='COMPLETADA'/);
  assert.match(MIGRATION, /c\.tipo='FINAL' AND c\.estado='CONFIRMADO'/);
  assert.match(MIGRATION, /INSERT INTO public\.turno_jornada_inventario_cortes[\s\S]*origen_corte_id/);
  assert.match(MIGRATION, /idempotente/);
  assert.doesNotMatch(MIGRATION, /UPDATE\s+public\.stock/i);
});

test("Step 7 shows prior count only as an editable physical recount reference", () => {
  assert.match(UI, /detail\.apertura_previa/);
  assert.match(UI, /openingLines\.get\(String\(p\.producto_id\)\)/);
  assert.match(UI, /prior\?esc\(prior\.cantidad_contada\)/);
  assert.match(UI, /Debes volver a contar físicamente cada producto/);
  assert.match(UI, /nuevo corte requiere confirmación física explícita/);
  assert.match(UI, /corte final anterior/);
  assert.match(UI, /data-bc7-finance-form="gasto"/);
  assert.match(UI, /data-bc7-finance-form="reinversion"/);
  assert.match(UI, /bc7_registrar_gasto_jornada/);
  assert.match(UI, /bc7_registrar_reinversion_jornada/);
  assert.match(UI, /bc7_finanzas_jornada/);
  assert.match(UI, /No la envíes otra vez con una referencia nueva; el formulario conserva la referencia original para evitar duplicados/);
  assert.match(UI, /state\.admin\|\|can\('gastos','ver'\)/);
  assert.match(UI, /state\.admin\|\|can\('reinversiones','ver'\)/);
});
