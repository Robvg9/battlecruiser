"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261116180000_jornada_inventory_handover_truth.sql","utf8");
const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");

test("shared handover snapshots the effective FINAL correction",()=>{
  assert.ok(migration.includes("coalesce(c.cantidad_corregida,l.cantidad_contada)"));
  assert.ok(migration.includes("c.tipo='FINAL'"));
  assert.ok(migration.includes("c.vigente=true"));
  assert.ok(migration.includes("ON CONFLICT (entrega_id,producto_id) DO UPDATE"));
});

test("deferred handover retries never rewrite a delivery after a physical receipt attempt",()=>{
  assert.ok(migration.includes("e.estado IN ('PENDIENTE_PROGRAMACION','PENDIENTE_RECEPCION')"));
  assert.ok(migration.includes("WHERE r.entrega_id=EXCLUDED.entrega_id"));
  assert.ok(migration.includes("cantidad_efectiva=NULL"));
});

test("a correction made after handover preparation refreshes only an unreceived delivery",()=>{
  assert.ok(migration.includes("INVENTARIO_ENTREGA_SINCRONIZADA_CORRECCION_FINAL"));
  assert.ok(migration.includes("e.estado IN ('PENDIENTE_PROGRAMACION','PENDIENTE_RECEPCION','REQUIERE_RECUENTO')"));
  assert.ok(migration.includes("r.estado IN ('PENDIENTE_REVISION','ACEPTADA')"));
  assert.ok(migration.includes("SET cantidad_declarada=v_new_qty,cantidad_efectiva=NULL"));
  assert.ok(migration.includes("cantidad_declarada_anterior"));
  assert.ok(migration.includes("cantidad_declarada_actualizada"));
  assert.ok(migration.includes("e.origen_sesion_id=v_s.id"));
  assert.ok(migration.includes("dl.producto_id=v_product_id"));
  assert.ok(migration.includes("FOR UPDATE OF e,dl"));
});

test("owner approval preserves source FINAL and creates destination INITIAL from accepted receipt",()=>{
  const start=migration.indexOf("CREATE OR REPLACE FUNCTION public.bc7_resolver_entrega_jornada(");
  assert.ok(start>=0);
  const resolver=migration.slice(start);
  assert.equal(resolver.includes("PERFORM public.bc7_corregir_inventario_final_jornada"),false);
  assert.ok(resolver.includes("cantidad_efectiva=rl.cantidad_recibida"));
  assert.ok(resolver.includes("_bc7_crear_inicial_desde_entrega"));
  assert.ok(resolver.includes("corte_final_origen_modificado',false"));
  assert.ok(resolver.includes("diferencias_registradas_en_recepcion"));
});

test("inventory table explains the reference balance and difference formula",()=>{
  assert.ok(ui.includes("Saldo del sistema guardado (referencia)"));
  assert.ok(ui.includes("Diferencia inicial = cantidad efectiva compartida menos saldo del sistema guardado"));
  assert.ok(ui.includes("No compara la declaración con la recepción"));
  assert.equal(ui.includes("Cantidad vigente compartida confirmada entre el FINAL de origen y el INITIAL de destino."),false);
});

test("owner review messaging no longer promises to rewrite the previous FINAL",()=>{
  assert.ok(ui.includes("inventario final cerrado del origen permanece intacto"));
  assert.ok(ui.includes("el FINAL del origen no se modificó"));
  assert.equal(ui.includes("Las diferencias corregirán el inventario final anterior"),false);
});

test("jornada UI asset cache keys are refreshed coherently",()=>{
  assert.ok(app.includes('["bc7-jornada-ui.js","7.69"]'));
  assert.ok(sw.includes("bc7-jornada-ui.js?v=7.69"));
  assert.equal(app.includes('["bc7-jornada-ui.js","7.35"]'),false);
  assert.equal(sw.includes("bc7-jornada-ui.js?v=7.35"),false);
});


test("a stale source FINAL correction blocks automatic receipt acceptance and asks for recount",()=>{
  const corrective=fs.readFileSync("supabase/migrations/20261118000001_jornada_inventory_correction_isolation.sql","utf8");
  assert.ok(corrective.includes("INVENTARIO_ENTREGA_REQUIERE_RECUENTO_POR_CORRECCION_ORIGEN"));
  assert.ok(corrective.includes("'requiere_recuento',true"));
  assert.ok(ui.includes("result&&result.requiere_recuento"));
  assert.ok(ui.includes("la recepción NO se guardó"));
});
