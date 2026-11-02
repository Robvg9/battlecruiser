"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const MIGRATION = fs.readFileSync("supabase/migrations/20261102010000_step4_jornada_sales_provenance.sql", "utf8");
const POS = fs.readFileSync("public/js/ventas.js", "utf8");
const POS_SESSION_UI = fs.readFileSync("public/js/venta-turno-ui.js", "utf8");
const PRESENTATION_PAYLOAD = fs.readFileSync("public/js/m27-6b-venta-payload-pres.js", "utf8");
const OFFLINE = fs.readFileSync("public/js/offline.js", "utf8");
const JOURNEY_UI = fs.readFileSync("public/js/bc7-jornada-ui.js", "utf8");
const INDEX = fs.readFileSync("public/index.html", "utf8");
const APP = fs.readFileSync("public/app.js", "utf8");
const SW = fs.readFileSync("public/service-worker.js", "utf8");

test("new sales schema is additive and never relinks historic sales", () => {
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS turno_sesion_id uuid/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS turno_tramo_id uuid/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS metodo_pago text NOT NULL DEFAULT 'NO_DECLARADO'/);
  assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS idempotency_key uuid/);
  assert.match(MIGRATION, /ventas_jornada_link_pair_chk/);
  assert.match(MIGRATION, /FOREIGN KEY \(turno_sesion_id\) REFERENCES public\.turno_sesiones\(id\)/);
  assert.match(MIGRATION, /FOREIGN KEY \(turno_tramo_id\) REFERENCES public\.turno_tramos\(id\)/);
  assert.match(MIGRATION, /CHECK \(metodo_pago IN \('NO_DECLARADO','EFECTIVO','TRANSFERENCIA','TARJETA','OTRO'\)\)/);
  assert.match(MIGRATION, /ventas_actor_idempotency_uidx/);
  assert.match(MIGRATION, /ventas_jornada_fecha_idx/);
  const schemaChanges = MIGRATION.slice(0, MIGRATION.indexOf("CREATE OR REPLACE FUNCTION"));
  assert.doesNotMatch(schemaChanges, /UPDATE\s+public\.ventas\s+SET\s+turno_sesion_id/i,
    "additive schema changes must not reassign historic sales");
  assert.ok(MIGRATION.includes("UPDATE public.ventas") && MIGRATION.includes("SET turno_sesion_id=v_s.id"),
    "only the newly inserted sale is linked");
  assert.ok(MIGRATION.includes("WHERE id=v_venta_id AND creado_por=v_uid"),
    "the current actor and new sale ID scope the link update");
  assert.doesNotMatch(MIGRATION, /\bDELETE\s+FROM\s+public\.ventas\b|\bTRUNCATE\s+public\.ventas\b/i);
});

test("Jornada sale writes require the exact currently assigned session and active tranche", () => {
  const start = MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_registrar_venta_jornada");
  const end = MIGRATION.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, "Jornada POS write RPC must exist");
  const fn = MIGRATION.slice(start, end);
  assert.match(fn, /tiene_permiso\('ventas','crear'\)/);
  assert.match(fn, /bc7_validar_tramo_responsable_jornada\(p_turno_sesion_id\)/);
  assert.match(fn, /v_t\.id IS DISTINCT FROM p_turno_tramo_id/);
  assert.match(fn, /v_t\.usuario_id IS DISTINCT FROM v_uid/);
  assert.match(fn, /v_s\.bloque<>'JORNADA'/);
  assert.match(fn, /v_s\.estado<>'EN_CURSO'/);
  assert.match(fn, /p_almacen_id IS DISTINCT FROM v_s\.almacen_id/);
  assert.match(fn, /p_metodo_pago NOT IN \('EFECTIVO','TRANSFERENCIA','TARJETA','OTRO'\)/);
  assert.match(fn, /pg_advisory_xact_lock/);
  assert.match(fn, /idempotency_payload_hash/);
  assert.match(fn, /v_existing_session IS DISTINCT FROM p_turno_sesion_id/);
  assert.match(fn, /v_existing_tramo IS DISTINCT FROM p_turno_tramo_id/);
  assert.match(fn, /v_existing_method IS DISTINCT FROM p_metodo_pago/);
  assert.match(fn, /public\.registrar_venta\(v_s\.almacen_id,p_lineas,gen_random_uuid\(\),v_tipo_precio\)/,
    "pricing, FIFO cost and stock mutation stay in the established trusted server function");
  assert.match(fn, /turno_sesion_id=v_s\.id/);
  assert.match(fn, /turno_tramo_id=v_t\.id/);
  assert.match(fn, /metodo_pago=p_metodo_pago/);
});

test("Jornada sales read returns only exact session-bound sales and enforces read permissions", () => {
  const start = MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_ventas_jornada");
  const end = MIGRATION.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, "Jornada POS read RPC must exist");
  const fn = MIGRATION.slice(start, end);
  assert.match(fn, /tiene_permiso\('turnos','ver'\)/);
  assert.match(fn, /tiene_permiso\('ventas','ver'\)/);
  assert.match(fn, /a\.turno_sesion_id=v_s\.id AND a\.usuario_id=v_uid AND a\.retirado_at IS NULL/);
  assert.match(fn, /WHERE v\.turno_sesion_id=v_s\.id/);
  assert.match(fn, /FILTER \(WHERE v\.metodo_pago='EFECTIVO'\)/);
  assert.match(fn, /FILTER \(WHERE v\.metodo_pago='TRANSFERENCIA'\)/);
  assert.match(fn, /FILTER \(WHERE v\.metodo_pago='TARJETA'\)/);
  assert.match(fn, /FILTER \(WHERE v\.metodo_pago='NO_DECLARADO'\)/);
  assert.doesNotMatch(fn, /WHERE .*\(v\.fecha AT TIME ZONE|v\.creado_por.*tramo.*inicio_at/,
    "the sales ledger must not infer historical attribution from date or approximate time windows");
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_registrar_venta_jornada/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc7_registrar_venta_jornada/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_ventas_jornada/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc7_ventas_jornada/);
});

test("POS routes only a live Jornada through the new endpoint; legacy/offline sales keep their old RPC", () => {
  assert.match(POS, /String\(turnoActual\.bloque \|\| ""\)\.toUpperCase\(\) === "JORNADA"/);
  assert.match(POS, /turnoActual\.turno_sesion_id/);
  assert.match(POS, /turnoActual\.tramo_id/);
  assert.match(POS, /venta-metodo-pago/);
  assert.match(POS, /\["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"\]/);
  assert.match(POS, /tipoOperacionVenta = esJornada \? "venta_jornada" : "venta"/);
  assert.match(POS, /ventaPayload\.p_turno_sesion_id/);
  assert.match(POS, /ventaPayload\.p_turno_tramo_id/);
  assert.match(POS, /ventaPayload\.p_metodo_pago/);
  assert.match(POS, /ejecutarOperacion\(tipoOperacionVenta, ventaPayload\)/);
  assert.match(POS_SESSION_UI, /venta-jornada-payment-wrap/);
  assert.match(PRESENTATION_PAYLOAD, /tipo === "venta" \|\| tipo === "venta_jornada"/);
  assert.match(OFFLINE, /venta: "registrar_venta"/);
  assert.match(OFFLINE, /venta_jornada: "bc7_registrar_venta_jornada"/);
  assert.match(OFFLINE, /op\.tipo === "venta" \|\| op\.tipo === "venta_jornada"/);
  assert.match(OFFLINE, /case "venta":\s*case "venta_jornada":\s*marcarRefrescoPendiente\("stock"\)/);
});

test("Jornada finance shows actual cash declaration/count separately from payment-channel sales", () => {
  assert.match(JOURNEY_UI, /cashDeclarationHtml\(detail\)/);
  assert.match(JOURNEY_UI, /renderSalesLedger\(host,data\)/);
  assert.match(JOURNEY_UI, /bc7_ventas_jornada/);
  assert.match(JOURNEY_UI, /Ventas por forma de pago/);
  assert.match(JOURNEY_UI, /Método no declarado/);
  assert.match(JOURNEY_UI, /El conteo físico del efectivo es independiente del total de ventas/);
  assert.match(INDEX, /id="venta-metodo-pago"/);
  assert.match(INDEX, /id="venta-jornada-payment-wrap"/);
  assert.match(APP, /\["venta-turno-ui\.js","9\.4\.46"\]/);
  assert.match(APP, /\["m27-6b-venta-payload-pres\.js","27\.6b2"\]/);
  assert.match(SW, /BC_SW_VERSION = "9\.5\.54"/);
  assert.match(SW, /ventas\.js\?v=20261102\.1/);
  assert.match(SW, /m68-ventas-pos-definitivo\.js\?v=9\.5\.54/);
  assert.match(SW, /venta-turno-ui\.js\?v=9\.4\.46/);
  assert.match(SW, /m27-6b-venta-payload-pres\.js\?v=27\.6b2/);
});
