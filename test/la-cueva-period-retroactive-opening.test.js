"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261109230000_la_cueva_period_retroactive_opening.sql"),
  "utf8"
);

test("retroactive opening is an admin-only atomic session creation with immutable opening inventory", () => {
  assert.match(migration, /bc7_admin_abrir_jornada_existente/);
  assert.match(migration, /bc_actor_is_admin\(\)/);
  assert.match(migration, /turno_jornada_inventario_cortes/);
  assert.match(migration, /turno_jornada_inventario_lineas/);
  assert.match(migration, /turno_tramos/);
  assert.match(migration, /estado='EN_CURSO'/);
  assert.match(migration, /stock_global_modificado',false/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.bc7_admin_abrir_jornada_existente/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.bc7_admin_abrir_jornada_existente[\s\S]*TO authenticated/);
  const opening = migration.slice(migration.indexOf("FUNCTION public.bc7_admin_abrir_jornada_existente"), migration.indexOf("FUNCTION public.bc5_cerrar_jornada"));
  assert.doesNotMatch(opening, /\bUPDATE\s+public\.stock\b|\bINSERT\s+INTO\s+public\.stock\b|\bDELETE\s+FROM\s+public\.stock\b/i);
  assert.match(opening, /s\.cantidad-coalesce\(\(/);
  assert.match(opening, /stock_sistema_reconstruido_descontando_entradas_vinculadas/);
});

test("period ranges and imported lines are validated before any session is created", () => {
  assert.match(migration, /p_fecha_fin-p_fecha_inicio > 30/);
  assert.match(migration, /p_inicio_real_at > now\(\)/);
  assert.match(migration, /v_expected=0 OR v_count<>v_expected OR v_distinct<>v_count/);
  assert.match(migration, /fecha BETWEEN p_fecha_inicio AND p_fecha_fin/);
  assert.match(migration, /t\.fecha>p_inicio_real_at/);
  assert.match(migration, /t\.estado='completada'/);
});

test("existing transfers are linked by immutable reference, never recreated", () => {
  assert.match(migration, /turno_jornada_entradas_vinculadas/);
  assert.match(migration, /transferencia_id uuid NOT NULL REFERENCES public\.transferencias/);
  assert.match(migration, /UNIQUE \(transferencia_id\)/);
  assert.match(migration, /INSERT INTO public\.turno_jornada_entradas_vinculadas/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+public\.transferencias\b/i);
});

test("multi-day close uses the period end date", () => {
  assert.match(migration, /fecha_fin date/);
  assert.match(migration, /v_fecha_fin := coalesce\(v_programacion\.fecha_fin,v_programacion\.fecha\)/);
  assert.match(migration, /v_local::date<>v_fecha_fin/);
});


test("admin UI exposes the retroactive period opening workflow and only confirms after preview",()=>{
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "../public/service-worker.js"), "utf8");
  assert.match(ui, /Registrar jornada ya iniciada/);
  assert.match(ui, /bc7_previsualizar_apertura_existente/);
  assert.match(ui, /bc7_admin_abrir_jornada_existente/);
  assert.match(ui, /column.*Fin|norm\\(v\\)==='fin'/);
  assert.match(ui, /stock general no se modificará/i);
  assert.match(app, /bc7-periodo-apertura-ui\\.js/);
  assert.match(sw, /bc7-periodo-apertura-ui\\.js/);
  assert.match(app, /VERSION="9\\.5\\.90"/);
  assert.match(sw, /BC_SW_VERSION = "9\\.5\\.90"/);
});


test("Jornada reinvestments remain pending until admin approval applies stock and cash",()=>{
  const create = migration.slice(migration.indexOf("FUNCTION public.bc7_registrar_reinversion_jornada"), migration.indexOf("FUNCTION public.listar_aprobaciones_admin"));
  const resolve = migration.slice(migration.indexOf("FUNCTION public.resolver_aprobacion_operativa"));
  assert.match(create, /'PENDIENTE'/);
  assert.doesNotMatch(create, /INSERT INTO public\\.stock|lotes_compra|registrar_movimiento_caja/);
  assert.match(migration, /'reinversion'::text/);
  assert.match(resolve, /v_reinversion\\.estado<>'PENDIENTE'/);
  assert.match(resolve, /INSERT INTO public\\.stock/);
  assert.match(resolve, /private\\.registrar_movimiento_caja/);
  assert.match(resolve, /'APROBADA' ELSE 'RECHAZADA'/);
});


test("dependienta can read only assigned jornada finance and reinvestment approval remains admin-gated",()=>{
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/bc7-jornada-ui.js"), "utf8");
  const approvals = fs.readFileSync(path.join(__dirname, "../public/js/aprobaciones-admin.js"), "utf8");
  assert.ok(ui.includes("const showReinvestments=state.admin||isAssigned;"));
  assert.ok(ui.includes("canReadThisType=state.admin||can('turnos','ver')"));
  assert.ok(ui.includes("no afecta stock ni caja hasta que la apruebes"));
  assert.ok(approvals.includes("reinversiones','editar_any'"));
  assert.ok(approvals.includes("🛒 Reinversión pendiente"));
  assert.ok(approvals.includes("const isMoney=isExpense||type==='reinversion';"));
});


test("only the Dueño role receives reinvestment approval authority",()=>{
  assert.ok(migration.includes("lower(btrim(r.nombre))='dueño'"));
  assert.ok(migration.includes("'reinversiones','editar_any'"));
});
test("programming trigger prevents warehouse and responsible overlap across a full period",()=>{
  assert.ok(migration.includes("CREATE TRIGGER bc5_jornada_no_overlap"));
  assert.ok(migration.includes("fecha_fin,trabaja,responsable_id,estado"));
  assert.ok(migration.includes("p.fecha<=v_fin AND coalesce(p.fecha_fin,p.fecha)>=NEW.fecha"));
  assert.ok(migration.includes("generate_series(NEW.fecha::timestamp,v_fin::timestamp"));
});
