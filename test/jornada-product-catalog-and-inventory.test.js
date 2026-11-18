"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const MIGRATION=read("supabase/migrations/20261118090000_jornada_inventory_product_set_archive_late_transfers.sql");
const CASH_SIGN_MIGRATION=read("supabase/migrations/20261118100000_jornada_cash_difference_excel_sign_convention.sql");
const PERIOD_PRODUCTS_MIGRATION=read("supabase/migrations/20261118190000_jornada_final_inventory_includes_period_products.sql");
const PRODUCTS=read("public/js/productos.js");
const JORNADA=read("public/js/bc7-jornada-ui.js");
const IMPORTER=read("public/js/bc7-periodo-apertura-ui.js");
const OWNER=read("public/js/jornada-owner-review.js");
const APP=read("public/app.js");
const SW=read("public/service-worker.js");
const INDEX=read("public/index.html");
test("Jornada inventory read and write share one exact product/family universe",()=>{
 assert.ok(MIGRATION.includes("CREATE OR REPLACE FUNCTION public.bc7_jornada_productos_corte"));
 const readFn=MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.bc7_obtener_inventario_jornada"),MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_jornada"));
 const writeFn=MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.bc7_guardar_inventario_jornada"));
 assert.ok(readFn.includes("bc7_jornada_productos_corte"));assert.ok(writeFn.includes("bc7_jornada_productos_corte"));
 assert.ok(writeFn.includes("expected.producto_id=p.id"));assert.ok(writeFn.includes("exactamente los productos/familias válidos"));
 assert.equal(readFn.includes("p.created_at < ("),false);
});
test("final inventory includes products created during the scheduled period even when the inherited opening cut has no line",()=>{
 const helper=PERIOD_PRODUCTS_MIGRATION.slice(
  PERIOD_PRODUCTS_MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_jornada_productos_corte"),
  PERIOD_PRODUCTS_MIGRATION.indexOf("REVOKE ALL ON FUNCTION public.bc7_jornada_productos_corte")
 );
 assert.ok(helper.includes("bc7_jornada_productos_corte(v_s.id,'INICIAL')"));
 assert.ok(helper.includes("period_products.producto_id"));
 assert.ok(helper.includes("c.tipo='INICIAL'"));
 assert.ok(helper.includes("root.archivado_at IS NULL"));
 const writer=PERIOD_PRODUCTS_MIGRATION.slice(
  PERIOD_PRODUCTS_MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_jornada")
 );
 assert.ok(writer.includes("FROM public.bc7_jornada_productos_corte(v_s.id,upper(p_tipo))"));
 assert.ok(writer.includes("exactamente los productos/familias válidos para este corte"));
});

test("archiving a product does not erase it from a completed Jornada's historical final inventory",()=>{
  const helper=MIGRATION.slice(MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_jornada_productos_corte"),MIGRATION.indexOf("ALTER TABLE public.productos"));
  const openingEvidence=helper.slice(helper.indexOf("SELECT DISTINCT l.producto_id"),helper.indexOf("UNION"));
  const stockEvidence=helper.slice(helper.indexOf("FROM public.stock"),helper.indexOf("UNION",helper.indexOf("FROM public.stock")));
  const reinvestEvidence=helper.slice(helper.indexOf("FROM public.reinversiones"),helper.indexOf("UNION",helper.indexOf("FROM public.reinversiones")));
  const transferEvidence=helper.slice(helper.indexOf("FROM public.transferencias"),helper.indexOf(") SELECT e.producto_id",helper.indexOf("FROM public.transferencias")));
  assert.ok(stockEvidence.includes("root.archivado_at IS NULL"));
  assert.equal(reinvestEvidence.includes("archivado_at"),false);
  assert.equal(reinvestEvidence.includes("p.activo=true"),false);
  assert.equal(transferEvidence.includes("archivado_at"),false);
  assert.equal(transferEvidence.includes("p.activo=true"),false);

  assert.ok(openingEvidence.includes("c.tipo='INICIAL'"));
  assert.equal(openingEvidence.includes("archivado_at"),false);
  assert.equal(openingEvidence.includes("root.activo=true"),false);
  const getter=MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.bc7_obtener_inventario_jornada"),MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_guardar_inventario_jornada"));
  assert.ok(getter.includes("FROM public.productos p"));
  assert.ok(getter.includes("WHERE p.producto_padre_id IS NULL"));
  assert.equal(getter.includes("p.archivado_at IS NULL"),false);
});

test("product archive is reversible, audited and guarded by stock/open-cut checks",()=>{
 assert.ok(MIGRATION.includes("ADD COLUMN IF NOT EXISTS archivado_at"));assert.ok(MIGRATION.includes("CREATE TABLE IF NOT EXISTS public.productos_archivo_historial"));assert.ok(MIGRATION.includes("ON DELETE RESTRICT"));
 const archive=MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.bc_producto_archivar"),MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc_producto_restaurar"));
 const restore=MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.bc_producto_restaurar"));
 assert.ok(archive.includes("v_producto.activo IS DISTINCT FROM true"));
 assert.ok(archive.includes("s.cantidad<>0"));assert.ok(archive.includes("turno_jornada_inventario_cortes"));assert.ok(archive.includes("activo=false"));assert.ok(archive.includes("INSERT INTO public.productos_archivo_historial"));
 assert.ok(restore.includes("activo=true"));assert.ok(restore.includes("archivado_at=NULL"));assert.ok(restore.includes("INSERT INTO public.productos_archivo_historial"));
 assert.ok(MIGRATION.includes("REVOKE ALL ON TABLE public.productos_archivo_historial FROM PUBLIC,anon,authenticated"));
});
test("archived products leave operational selectors and can be restored from their own list",()=>{
 assert.ok(PRODUCTS.includes("p.archivado_at"));assert.ok(PRODUCTS.includes("Productos archivados"));assert.ok(PRODUCTS.includes("btn-archivar-producto"));assert.ok(PRODUCTS.includes("btn-restaurar-producto"));
 assert.ok(PRODUCTS.includes("bc_producto_archivar"));
 assert.ok(PRODUCTS.includes("btn-editar-producto:not(.btn-archivar-producto):not(.btn-restaurar-producto)"));assert.ok(PRODUCTS.includes("bc_producto_restaurar"));assert.ok(PRODUCTS.includes("No se borrarán ventas, compras ni movimientos"));
});
test("Jornada Movimientos displays pending late inbound transfers and supports one-time attribution",()=>{
 assert.ok(JORNADA.includes("bc7_transferencias_pendientes_vinculo_jornada"));assert.ok(JORNADA.includes("renderPendingInboundTransfers"));assert.ok(JORNADA.includes("data-bc7-movement-link-transfer"));
 assert.ok(JORNADA.includes("bc7_vincular_transferencia_jornada"));assert.ok(JORNADA.includes("no se ejecuta otra transferencia"));
});
test("historical importer is generic and visibly exceptional",()=>{
 assert.ok(IMPORTER.includes("Importar cierre externo · uso excepcional"));assert.ok(IMPORTER.includes("recupera la jornada sucesora"));
 assert.equal(/Adriana|Sheyla|09:07|15:16|07:15|2026-11-09|2026-11-10/.test(IMPORTER),false);
});
test("owner review correction form uses a generic source description for any Jornada",()=>{
 assert.ok(OWNER.includes("Evidencia documental de precios y costos históricos correspondiente a esta jornada."));
 assert.equal(/Noviembre-09-10-Sheyla\.xlsx|Adriana|Sheyla/.test(OWNER),false);
});

test("gross profit is foregrounded without an invented clean-profit formula",()=>{
 assert.ok(OWNER.includes("Ganancia bruta estimada"));assert.ok(OWNER.includes("Ganancia limpia"));assert.ok(OWNER.includes("Fórmula pendiente de definir"));
 assert.ok(OWNER.includes("Efectivo esperado (sin salario)"));assert.ok(OWNER.includes("negativo = sobrante; positivo = faltante"));
});
test("cash difference sign matches the spreadsheet convention in settlement and owner review",()=>{
  assert.ok(CASH_SIGN_MIGRATION.includes("round(v_expected_cash-v_cash_received,2)"));
  assert.equal(CASH_SIGN_MIGRATION.includes("round(v_cash_received-v_expected_cash,2)"),false);
  assert.ok(CASH_SIGN_MIGRATION.includes("bc7_obtener_revision_jornada_rectificada"));
  assert.ok(CASH_SIGN_MIGRATION.includes("round(v_expected-(v_liq->>'dinero_recogido_total')::numeric,2)"));
  assert.ok(OWNER.includes("negativo = sobrante; positivo = faltante"));
  assert.ok(JORNADA.includes("− sobrante · + faltante"));
});

test("PWA release versions stay aligned",()=>{
 assert.ok(APP.includes('VERSION="9.5.126"'));assert.ok(SW.includes('BC_SW_VERSION = "9.5.126"'));assert.ok(INDEX.includes("9.5.126"));
 assert.ok(APP.includes('["bc7-jornada-ui.js","7.42"]'));assert.ok(SW.includes("bc7-jornada-ui.js?v=7.42"));
});
