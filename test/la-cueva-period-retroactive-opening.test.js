"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261110160751_la_cueva_period_retroactive_opening.sql"),
  "utf8"
);
const configBootstrap = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20261111150000_step7_jornada_config_bootstrap.sql"),
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

test("missing active-store config is backfilled from the persisted schedule without salary or operational rewrites",()=>{
  const backfillStart=configBootstrap.indexOf("INSERT INTO public.turno_jornada_configuracion");
  const openingStart=configBootstrap.indexOf("FUNCTION public.bc7_admin_abrir_jornada_existente");
  const salaryStart=configBootstrap.indexOf("FUNCTION public.bc7_configurar_salario_porcentaje_jornada");
  assert.ok(backfillStart>=0&&openingStart>backfillStart&&salaryStart>openingStart);
  const backfill=configBootstrap.slice(backfillStart,openingStart);
  assert.match(backfill,/FROM public\.turno_sesiones s/);
  assert.match(backfill,/JOIN public\.turno_jornada_programacion p ON p\.id=s\.jornada_programacion_id/);
  assert.match(backfill,/WHERE s\.estado='EN_CURSO'/);
  assert.match(backfill,/p\.hora_inicio_prevista/);
  assert.match(backfill,/p\.hora_fin_prevista/);
  assert.match(backfill,/p\.zona_horaria/);
  assert.match(backfill,/ON CONFLICT \(almacen_id\) DO NOTHING/);
  assert.doesNotMatch(backfill,/salario_porcentaje/i);
  assert.doesNotMatch(backfill,/UPDATE\s+public\.turno_sesiones|UPDATE\s+public\.turnos\b|UPDATE\s+public\.stock|DELETE\s+FROM\s+public\.turno_jornada_inventario/i);
});

test("retroactive opening provisions the warehouse schedule row before reading it",()=>{
  const start=configBootstrap.indexOf("FUNCTION public.bc7_admin_abrir_jornada_existente");
  const end=configBootstrap.indexOf("REVOKE ALL ON FUNCTION public.bc7_admin_abrir_jornada_existente",start);
  assert.ok(start>=0&&end>start);
  const opening=configBootstrap.slice(start,end);
  const insert=opening.indexOf("INSERT INTO public.turno_jornada_configuracion (almacen_id)");
  const lookup=opening.indexOf("SELECT * INTO v_cfg FROM public.turno_jornada_configuracion");
  assert.ok(insert>=0&&lookup>insert);
  assert.match(opening,/ON CONFLICT \(almacen_id\) DO NOTHING/);
  assert.doesNotMatch(opening,/SET\s+salario_porcentaje\s*=/i);
});

test("salary RPC creates only the missing store schedule and stores the owner-selected rate",()=>{
  const start=configBootstrap.indexOf("FUNCTION public.bc7_configurar_salario_porcentaje_jornada");
  const end=configBootstrap.indexOf("REVOKE ALL ON FUNCTION public.bc7_configurar_salario_porcentaje_jornada",start);
  assert.ok(start>=0&&end>start);
  const salary=configBootstrap.slice(start,end);
  assert.match(salary,/INSERT INTO public\.turno_jornada_configuracion/);
  assert.match(salary,/v_p\.hora_inicio_prevista/);
  assert.match(salary,/v_p\.hora_fin_prevista/);
  assert.match(salary,/v_p\.zona_horaria/);
  assert.match(salary,/ON CONFLICT \(almacen_id\) DO NOTHING/);
  assert.match(salary,/SET salario_porcentaje=p_porcentaje/);
  assert.match(configBootstrap,/REVOKE ALL ON FUNCTION public\.bc7_configurar_salario_porcentaje_jornada[\s\S]*FROM PUBLIC,anon/);
  assert.match(configBootstrap,/GRANT EXECUTE ON FUNCTION public\.bc7_configurar_salario_porcentaje_jornada[\s\S]*TO authenticated/);
  assert.doesNotMatch(salary,/salario_porcentaje\s*=\s*(?:5|10|20|25|30|50)(?:\D|$)/);
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
  assert.ok(app.includes('["bc7-periodo-apertura-ui.js","1.7"]'));
  assert.ok(sw.includes("./js/bc7-periodo-apertura-ui.js?v=1.7"));
  assert.ok(app.includes('VERSION="9.5.100"'));
  assert.ok(sw.includes('BC_SW_VERSION = "9.5.100"'));
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
  assert.ok(approvals.includes("const isMoney=isExpense||type==='reinversion'||isDailyCash||isFinalCash;"));
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


test("opening preview imports the selected Excel quantities and exposes family mapping plus system-stock reference",()=>{
  const ui = fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.ok(ui.includes("Columna Fin"));
  assert.ok(ui.includes("stock sistema (referencia)"));
  assert.ok(ui.includes("const tableRows=parsed.map"));
  assert.ok(ui.includes("row.cantidad"));
  assert.ok(ui.includes("product.stock_sistema"));
  assert.ok(ui.includes("data-bc7-period-map"));
});


test("known 07:15 delivery is already part of Adriana's closing count; only 09:07 and 15:16 are selectable",()=>{
  const ui=fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.ok(ui.includes("09:07 y 15:16"));
  assert.ok(ui.includes("Ya incluida en el inventario final de Adriana"));
  assert.ok(ui.includes("no se vinculará"));
  const transferUI=ui.slice(ui.indexOf("function renderTransfers"),ui.indexOf("async function confirmOpening"));
  assert.ok(transferUI.includes("time==='09:07'||time==='15:16'"));
  assert.ok(transferUI.includes("No sumar"));
});


test("minorista Jornada snapshots group flavour variants by parent family without inventing a split",()=>{
  const ui=fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.ok(migration.includes("a.tipo='minorista'"));
  assert.ok(migration.includes("'es_familia',EXISTS("));
  assert.ok(migration.includes("sp.producto_padre_id=p.id"));
  assert.ok(migration.includes("v_grouped AND p.producto_padre_id IS NOT NULL"));
  assert.ok(ui.includes("sin repartir cantidades"));
  assert.ok(ui.includes("· total de familia"));
  assert.ok(ui.includes("data-bc7-period-map"));
  assert.equal(ui.includes("Cada sabor debe tener su propia fila y cantidad en el Excel"),false);
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

test("Excel import stops at the first summary row after the product table",()=>{
  const ui=fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  const parser=ui.slice(ui.indexOf("async function parseInventoryFile"), ui.indexOf("function havanaTimestamp"));
  assert.match(parser, /summaryRows=new Set\(\['ganancias','ingreso','cantidad','calculos','totales'\]\)/);
  assert.match(parser, /if\(summaryRows\.has\(norm\(name\)\)\)break/);
  assert.match(parser, /Cantidad final inválida/);
});

test("opening confirmation unlocks when the real start time or responsible changes",()=>{
  const ui=fs.readFileSync(path.join(__dirname, "../public/js/bc7-periodo-apertura-ui.js"), "utf8");
  assert.match(ui, /\$\('bc7-period-started'\)\.addEventListener\('change',updateConfirm\)/);
  assert.match(ui, /\$\('bc7-period-person'\)\.addEventListener\('change',updateConfirm\)/);
});

test("period opening form version 1.7 is loaded dynamically and precached",()=>{
  const app=fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const sw=fs.readFileSync(path.join(__dirname, "../public/service-worker.js"), "utf8");
  assert.ok(app.includes('["bc7-periodo-apertura-ui.js","1.7"]'));
  assert.ok(sw.includes("./js/bc7-periodo-apertura-ui.js?v=1.7"));
});


test("permission grants keep Dependienta submission separate from Dueño approvals and avoid duplicate DDL",()=>{
  const submissionSeed="CROSS JOIN (VALUES ('turnos','ver'),('gastos','crear'),('reinversiones','crear'))";
  const reinvestmentStateDdl=migration.match(/ALTER TABLE public\.reinversiones\s+ADD COLUMN IF NOT EXISTS estado text;/g)||[];
  assert.equal(migration.split(submissionSeed).length-1,1);
  assert.equal(reinvestmentStateDdl.length,1);
  assert.ok(migration.includes("SELECT r.id,'reinversiones','editar_any',true"));
  assert.ok(migration.includes("WHERE lower(btrim(r.nombre))='dueño'"));
  assert.ok(migration.includes("SELECT r.id,'entregas_caja','editar_any',true"));
  assert.ok(migration.includes("IN ('dueño','dueno')"));
  const settlementContract=fs.readFileSync(path.join(__dirname,"la-cueva-period-settlement-contract.sql"),"utf8");
  assert.match(settlementContract,/Dependienta unexpectedly approved operation type/);
  assert.match(settlementContract,/Dependienta unexpectedly accessed the administrative approval queue/);
});


test("opening preview preserves manual mappings across repeated catalog refreshes",()=>{
  const ui=fs.readFileSync(path.join(__dirname,"../public/js/bc7-periodo-apertura-ui.js"),"utf8");
  assert.ok(ui.includes("function reconcileMappingsWithCatalog(rows,products)"));
  assert.ok(ui.includes("mappingState.set(mappingRowKey(row)"));
  assert.ok(ui.includes("saveRowMapping(row,true)"));
  assert.ok(ui.includes("sessionStorage.setItem(mappingStorageKey"));
  assert.ok(ui.includes("saved.manual"));
  assert.ok(ui.includes("Se restauraron"));
  const preview=ui.slice(ui.indexOf("async function previewOpening"),ui.indexOf("async function createMissingProducts"));
  assert.ok(preview.includes("reconcileMappingsWithCatalog(parsed,products)"));
  assert.equal(preview.includes("row.producto_id=matches.length===1"),false);
});

test("all missing Excel products, including zero-stock rows, are created through the audited catalog RPC",()=>{
  const ui=fs.readFileSync(path.join(__dirname,"../public/js/bc7-periodo-apertura-ui.js"),"utf8");
  assert.ok(ui.includes("function missingProductGroups()"));
  assert.ok(ui.includes("if(row.producto_id||(row.omitir&&row.mappingManual))return;"));
  assert.ok(ui.includes("Number(row.cantidad)===0)options.push"));
  assert.ok(ui.includes("matches.length!==0"));
  assert.ok(ui.includes("callRpc('bc_guardar_producto_catalogo'"));
  assert.ok(ui.includes("p_precio_normal:null"));
  assert.ok(ui.includes("p_categoria_id:null"));
  assert.ok(ui.includes("p_unidad:null"));
  assert.ok(ui.includes("row.omitir=false;"));
  assert.ok(ui.includes("p_idempotency_key:key"));
  assert.ok(ui.includes("No se añadirá stock ni se abrirá la jornada"));
  assert.ok(ui.includes("fichas nuevas pendientes de completar y revisar"));
  assert.ok(ui.includes("draftRows().some(row=>!row.draftDone)"));
  assert.ok(ui.includes("no se crearán duplicados"));
});

test("repeated preview preserves transfer checkbox selection by transfer ID",()=>{
  const ui=fs.readFileSync(path.join(__dirname,"../public/js/bc7-periodo-apertura-ui.js"),"utf8");
  assert.ok(ui.includes("transferSelectionState.set(String(checkbox.value),!!checkbox.checked)"));
  assert.ok(ui.includes("transferSelectionState.has(String(t.id))"));
});
