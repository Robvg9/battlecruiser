"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const sql=read("supabase/migrations/20261102144658_step4_shared_jornada_inventory_handover.sql");
const indexes=read("supabase/migrations/20261102144901_step4_shared_inventory_fk_indexes.sql");
const ui=read("public/js/bc7-jornada-ui.js");
const app=read("public/app.js");
const sw=read("public/service-worker.js");
const pg=read("test/step4-jornada-shared-inventory-contract.sql");
const runner=read("test/step7-jornada-postgres-windows-ci.js");
const workflow=read(".github/workflows/step7-jornada-postgres.yml");

test("Shared handover persists immutable declared, received and effective quantities",()=>{
  for(const table of ["turno_jornada_inventario_entregas","turno_jornada_inventario_entrega_lineas","turno_jornada_inventario_recepciones","turno_jornada_inventario_recepcion_lineas"]){
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public."+table),table+" table missing");
    assert.ok(sql.includes("ALTER TABLE public."+table+" ENABLE ROW LEVEL SECURITY"),table+" RLS missing");
    assert.ok(sql.includes("REVOKE ALL ON TABLE public.turno_jornada_inventario_entregas") && sql.includes(table),table+" direct access must remain revoked");
  }
  for(const marker of ["cantidad_declarada numeric","cantidad_recibida numeric","cantidad_efectiva numeric","idempotency_key uuid NOT NULL UNIQUE","ON DELETE RESTRICT"]){
    assert.ok(sql.includes(marker),"missing schema invariant: "+marker);
  }
  assert.ok(!/\bDROP\s+TABLE\b|\bTRUNCATE\b/i.test(sql),"migration must preserve existing records");
  assert.ok(!sql.includes("UPDATE public.stock"),"handover must not rewrite global stock/FIFO");
});

test("FINAL prepares a single next-day handover and never creates a phantom session",()=>{
  for(const marker of ["CREATE CONSTRAINT TRIGGER bc7_preparar_entrega_inventario_jornada","DEFERRABLE INITIALLY DEFERRED","PENDIENTE_PROGRAMACION","El dueño vinculó una jornada ya programada; no se creó una sesión duplicada"]){
    assert.ok(sql.includes(marker),"missing scheduling invariant: "+marker);
  }
  assert.ok(pg.includes("missing next day was not left as an owner-schedulable handover"));
  assert.ok(pg.includes("duplicate or unrequested next-day session"));
});

test("Receipt is complete, idempotent, discrepancy-aware and blocks opening",()=>{
  for(const marker of ["pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0))","El catálogo de productos cambió entre entrega y recepción","PENDIENTE_REVISION","REQUIERE_RECUENTO","La entrega de inventario tiene una diferencia o recepción pendiente de decisión del dueño"]){
    assert.ok(sql.includes(marker),"missing receipt invariant: "+marker);
  }
  for(const marker of ["20","18","destination jornada opened while its shared receipt was unresolved","duplicate receipt key did not return the original attempt","new equal physical recount did not resolve rejected attempt"]){
    assert.ok(pg.includes(marker),"missing PostgreSQL scenario: "+marker);
  }
});

test("Only owner resolves discrepancies; legacy initial inventory recovery is audited",()=>{
  for(const marker of ["Solo el dueño puede resolver una diferencia de recepción","INVENTARIO_RECEPCION_APROBADA","INVENTARIO_RECEPCION_RECHAZADA","Solo el dueño puede regularizar una jornada legacy abierta sin inventario inicial","INVENTARIO_INICIAL_LEGACY_REGULARIZADO","stock_global_modificado"]){
    assert.ok(sql.includes(marker),"missing owner/legacy invariant: "+marker);
  }
  for(const marker of ["Unauthorized worker approval","Recover a legacy open jornada that had no initial inventory","Reject this count; the employee must recount physically"]){
    assert.ok(pg.includes(marker),"missing owner/legacy SQL test: "+marker);
  }
});

test("Jornada interface exposes assigned receipt, owner review, next-session linking and legacy recovery",()=>{
  for(const marker of ["bc7_estado_entrega_inventario_jornada","bc7_recibir_entrega_jornada","bc7_resolver_entrega_jornada","bc7_vincular_entrega_jornada","bc7_regularizar_inicial_jornada_legacy","data-bc7-receive-form","data-bc7-delivery-decision","data-bc7-link-delivery","data-bc7-legacy-initial-form","cantidad_efectiva","Recepción física de inventario compartido","Regularización legacy","randomUUID"]){
    assert.ok(ui.includes(marker),"missing Jornada UI element: "+marker);
  }
});

test("Receipt and legacy recount accept valid decimal physical quantities",()=>{
  for(const fn of ["saveReceipt","saveLegacyInitial"]){
    const start=ui.indexOf("async function "+fn+"(form){");
    assert.notEqual(start,-1,fn+" handler missing");
    const validation=ui.slice(start).split("\n").find(line=>line.includes("const bad=lines.find"));
    assert.ok(validation,fn+" quantity validation missing");
    const digitEscape=String.fromCharCode(92)+"d";
    assert.ok(validation.includes("!/^"+digitEscape+"+"),"valid number matcher must use a single regex escape");
    assert.ok(!validation.includes("!/^"+digitEscape+digitEscape+"+"),"double-escaped digit matcher would reject valid numbers");
  }
});

test("Shared inventory foreign-key index migration covers all six new references",()=>{
  assert.equal((indexes.match(/CREATE INDEX IF NOT EXISTS/g)||[]).length,6);
  for(const column of [
    "turno_jornada_inventario_entregas(turno_id)",
    "turno_jornada_inventario_entregas(creado_por)",
    "turno_jornada_inventario_entrega_lineas(producto_id)",
    "turno_jornada_inventario_recepciones(recibido_por)",
    "turno_jornada_inventario_recepciones(decision_por)",
    "turno_jornada_inventario_recepcion_lineas(producto_id)"
  ]) assert.ok(indexes.includes(column),"missing covering index: "+column);
});

test("PWA and service worker cache are aligned at 9.5.97 / Jornada module 7.21",()=>{
  const version=app.match(/const VERSION="([^"]+)"/);
  const swVersion=sw.match(/BC_SW_VERSION = "([^"]+)"/);
  assert.ok(version&&swVersion,"app/service worker version declaration missing");
  assert.equal(version[1],"9.5.97");
  assert.equal(swVersion[1],version[1]);
  for(const marker of ['["bc7-jornada-ui.js","7.21"]','["m68-ventas-pos-definitivo.js","9.5.97"]']){
    assert.ok(app.includes(marker),"dynamic module cache missing "+marker);
  }
  assert.ok(sw.includes("./js/bc7-jornada-ui.js?v=7.21"));
  assert.ok(sw.includes("./js/m68-ventas-pos-definitivo.js?v=9.5.97"));
  assert.ok(ui.includes("v7.21"));
});

test("PostgreSQL 17 disposable CI executes the Step 4 migration and contract",()=>{
  for(const marker of ["supabase/migrations/20261102144658_step4_shared_jornada_inventory_handover.sql","supabase/migrations/20261102144901_step4_shared_inventory_fk_indexes.sql","test/step4-jornada-shared-inventory-contract.sql"]){
    assert.ok(runner.includes(marker),"PostgreSQL runner missing "+marker);
    assert.ok(workflow.includes(marker),"workflow path filter missing "+marker);
  }
});
