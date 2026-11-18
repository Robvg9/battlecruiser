"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const MIGRATION=read("supabase/migrations/20261118090000_jornada_inventory_product_set_archive_late_transfers.sql");
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
test("product archive is reversible, audited and guarded by stock/open-cut checks",()=>{
 assert.ok(MIGRATION.includes("ADD COLUMN IF NOT EXISTS archivado_at"));assert.ok(MIGRATION.includes("CREATE TABLE IF NOT EXISTS public.productos_archivo_historial"));assert.ok(MIGRATION.includes("ON DELETE RESTRICT"));
 const archive=MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.bc_producto_archivar"),MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc_producto_restaurar"));
 const restore=MIGRATION.slice(MIGRATION.indexOf("FUNCTION public.bc_producto_restaurar"));
 assert.ok(archive.includes("s.cantidad<>0"));assert.ok(archive.includes("turno_jornada_inventario_cortes"));assert.ok(archive.includes("activo=false"));assert.ok(archive.includes("INSERT INTO public.productos_archivo_historial"));
 assert.ok(restore.includes("activo=true"));assert.ok(restore.includes("archivado_at=NULL"));assert.ok(restore.includes("INSERT INTO public.productos_archivo_historial"));
 assert.ok(MIGRATION.includes("REVOKE ALL ON TABLE public.productos_archivo_historial FROM PUBLIC,anon,authenticated"));
});
test("archived products leave operational selectors and can be restored from their own list",()=>{
 assert.ok(PRODUCTS.includes("p.archivado_at"));assert.ok(PRODUCTS.includes("Productos archivados"));assert.ok(PRODUCTS.includes("btn-archivar-producto"));assert.ok(PRODUCTS.includes("btn-restaurar-producto"));
 assert.ok(PRODUCTS.includes("bc_producto_archivar"));assert.ok(PRODUCTS.includes("bc_producto_restaurar"));assert.ok(PRODUCTS.includes("No se borrarán ventas, compras ni movimientos"));
});
test("Jornada Movimientos displays pending late inbound transfers and supports one-time attribution",()=>{
 assert.ok(JORNADA.includes("bc7_transferencias_pendientes_vinculo_jornada"));assert.ok(JORNADA.includes("renderPendingInboundTransfers"));assert.ok(JORNADA.includes("data-bc7-movement-link-transfer"));
 assert.ok(JORNADA.includes("bc7_vincular_transferencia_jornada"));assert.ok(JORNADA.includes("no se ejecuta otra transferencia"));
});
test("historical importer is generic and visibly exceptional",()=>{
 assert.ok(IMPORTER.includes("Importar cierre externo · uso excepcional"));assert.ok(IMPORTER.includes("recupera la jornada sucesora"));
 assert.equal(/Adriana|Sheyla|09:07|15:16|07:15|2026-11-09|2026-11-10/.test(IMPORTER),false);
});
test("gross profit is foregrounded without an invented clean-profit formula",()=>{
 assert.ok(OWNER.includes("Ganancia bruta estimada"));assert.ok(OWNER.includes("Ganancia limpia"));assert.ok(OWNER.includes("Fórmula pendiente de definir"));
 assert.ok(OWNER.includes("Efectivo esperado (sin salario)"));assert.ok(OWNER.includes("positivo = sobrante; negativo = faltante"));
});
test("PWA release versions stay aligned",()=>{
 assert.ok(APP.includes('VERSION="9.5.126"'));assert.ok(SW.includes('BC_SW_VERSION = "9.5.126"'));assert.ok(INDEX.includes("9.5.126"));
 assert.ok(APP.includes('["bc7-jornada-ui.js","7.42"]'));assert.ok(SW.includes("bc7-jornada-ui.js?v=7.42"));
});
