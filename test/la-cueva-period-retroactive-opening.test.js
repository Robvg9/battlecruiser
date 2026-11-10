"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261109230000_la-cueva-period-retroactive-opening.sql"),
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
  assert.ok(migration.includes('p_fecha_fin-p_fecha_inicio>30'));
  assert.match(migration, /p_inicio_real_at\s*>\s*now\(\)/);
  assert.match(migration, /v_expected=0 OR v_count<>v_expected OR v_distinct<>v_count/);
  assert.match(migration, /fecha BETWEEN p_fecha_inicio AND p_fecha_fin/);
  assert.match(migration, /t\.fecha>p_inicio_real_at/);
  assert.match(migration, /t\.estado='completada'/);
});

test("existing transfers are linked by immutable reference, never recreated", () => {
  assert.match(migration, /turno_jornada_entradas_vinculadas/);
  assert.match(migration, /transferencia_id uuid NOT NULL REFERENCES public\.transferencias/);
  assert.ok(migration.includes('UNIQUE(transferencia_id)'));
  assert.match(migration, /INSERT INTO public\.turno_jornada_entradas_vinculadas/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+public\.transferencias\b/i);
});

test("multi-day close uses the period end date", () => {
  assert.match(migration, /fecha_fin date/);
  assert.ok(migration.includes('v_fecha_fin:=coalesce(v_programacion.fecha_fin,v_programacion.fecha)'));
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
  assert.ok(app.includes('["bc7-periodo-apertura-ui.js","1.4"]'));
  assert.ok(sw.includes("./js/bc7-periodo-apertura-ui.js?v=1.4"));
  assert.ok(app.includes('VERSION="9.5.90"'));
  assert.ok(sw.includes('BC_SW_VERSION = "9.5.90"'));
});


test("Jornada reinvestments remain pending until admin approval applies stock and cash",()=>{
  const create = migration.slice(migration.indexOf("FUNCTION public.bc7_registrar_reinversion_jornada"), migration.indexOf("FUNCTION public.listar_aprobaciones_admin"));
  const resolve = migration.slice(migration.indexOf("FUNCTION public.resolver_aprobacion_operativa"));
  assert.ok(create.includes("'PENDIENTE'"));
  assert.equal(/INSERT INTO public\\.stock|lotes_compra|registrar_movimiento_caja/.test(create), false);
  assert.ok(migration.includes("'reinversion'::text"));
  assert.ok(resolve.includes("v_reinversion.estado<>'PENDIENTE'"));
  assert.ok(resolve.includes("INSERT INTO public.stock"));
  assert.ok(resolve.includes("private.registrar_movimiento_caja"));
  assert.ok(resolve.includes("'APROBADA' ELSE 'RECHAZADA'"));
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
  assert.ok(migration.includes("r.nombre))='dueño'"));
  assert.ok(migration.includes("'reinversiones','editar_any'"));
  const approvalStart=migration.indexOf("ELSIF p_tipo='reinversion'");
  const approvalEnd=migration.indexOf("ELSE",approvalStart);
  const approvalBranch=migration.slice(approvalStart,approvalEnd);
  assert.ok(approvalBranch.includes("public.tiene_permiso('reinversiones','editar_any')"));
  assert.equal(approvalBranch.includes("public.tiene_permiso('auditoria','editar_any')"),false);
  const queueStart=migration.indexOf("'reinversion'::text");
  const queueEnd=migration.indexOf("ORDER BY 3 DESC",queueStart);
  const queueBranch=migration.slice(queueStart,queueEnd);
  assert.ok(queueBranch.includes("public.tiene_permiso('reinversiones','editar_any')"));
  assert.equal(queueBranch.includes("public.tiene_permiso('auditoria','editar_any')"),false);
});
test("programming trigger prevents warehouse and responsible overlap across a full period",()=>{
  assert.ok(migration.includes("CREATE TRIGGER bc5_jornada_no_overlap"));
  assert.ok(migration.includes("fecha_fin,trabaja,responsable_id,estado"));
  assert.ok(migration.includes("p.fecha<=v_fin AND coalesce(p.fecha_fin,p.fecha)>=NEW.fecha"));
  assert.ok(migration.includes("generate_series(NEW.fecha::timestamp,v_fin::timestamp"));
});


test("server-side role and permission rules accept the existing plural Dependientas role",()=>{
  assert.ok(migration.includes("IN ('dependienta','dependientas','dueño','dueno')"));
  assert.ok(migration.includes("WHERE lower(btrim(r.nombre)) IN ('dependienta','dependientas') AND r.activo=true"));
  assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.bc5_jornada_responsable_elegible"));
});


test("calendar and jornada workspace expose the complete period and movements filter through period end",()=>{
  const jornada = fs.readFileSync(path.join(__dirname, "../public/js/bc7-jornada-ui.js"), "utf8");
  assert.ok(migration.includes("'fecha_fin',coalesce(p.fecha_fin,p.fecha)"));
  assert.ok(migration.includes("p.fecha<=p_fecha_fin AND coalesce(p.fecha_fin,p.fecha)>=p_fecha_inicio"));
  assert.ok(migration.includes("'fecha_fin',coalesce(v_p.fecha_fin,v_s.fecha)"));
  assert.ok(jornada.includes("r.fecha_fin&&r.fecha_fin!==r.fecha"));
  assert.ok(jornada.includes("d.sesion.fecha_fin||d.sesion.fecha"));
});


test("opening preview shows every imported physical count and labels current stock only as a reference",()=>{
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.ok(ui.includes("Columna Fin del cuadre anterior"));
  assert.ok(ui.includes("Stock actual (referencia)"));
  assert.ok(ui.includes("tableRows"));
  assert.ok(ui.includes("row.cantidad"));
  assert.ok(ui.includes("product.stock_sistema"));
});


test("transfer selection copy does not presume an unverified physical count time",()=>{
  const ui=fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.ok(ui.includes("Las de 09:07 y 15:16 aparecen sugeridas"));
  assert.ok(ui.includes("revisa también la de 07:15 según la hora real del conteo"));
  assert.equal(ui.includes("la de 07:15 ya está incluida en el cierre anterior"), false);
});


test("inventory preview identifies independent flavor variants and refuses implicit parent-stock distribution",()=>{
  const migrationHasVariant= migration.includes("'producto_padre_id',p.producto_padre_id");
  const ui=fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.ok(migrationHasVariant);
  assert.ok(ui.includes("const variantCount=products.filter(p=>p.producto_padre_id).length"));
  assert.ok(ui.includes("Cada sabor debe tener su propia fila y cantidad en el Excel"));
  assert.ok(ui.includes("no se reparte automáticamente un total entre sabores"));
});

test("CSV import supports comma, semicolon and tab delimiters",()=>{
  const ui=fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.ok(ui.includes("const counts="));
  assert.ok(ui.includes("';':0"));
  assert.ok(ui.includes("const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]"));
});

test("opening timestamp is explicitly tied to the initial inventory reference and responsible must be selected",()=>{
  const ui=fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.ok(ui.includes("Fecha y hora real de inicio y conteo inicial"));
  assert.ok(ui.includes("Debe coincidir con el momento de referencia del inventario inicial"));
  assert.ok(ui.includes("Selecciona una responsable"));
});

test("period opening form version 1.4 is loaded dynamically and precached",()=>{
  const app=fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const sw=fs.readFileSync(path.join(__dirname, "../public/service-worker.js"), "utf8");
  assert.ok(app.includes('["bc7-periodo-apertura-ui.js","1.4"]'));
  assert.ok(sw.includes("./js/bc7-periodo-apertura-ui.js?v=1.4"));
});
