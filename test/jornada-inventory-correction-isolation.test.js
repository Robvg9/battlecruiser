"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261118000001_jornada_inventory_correction_isolation.sql","utf8");
const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");

test("initial inventory correction is an audited overlay and leaves source rows immutable",()=>{
  assert.ok(migration.includes("CHECK (tipo IN ('FINAL','INICIAL'))"));
  assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.bc7_corregir_inventario_inicial_jornada"));
  assert.ok(migration.includes("'PRECIO_HISTORICO_JORNADA'"));
  assert.ok(migration.includes("precio histórico de la jornada cuando esté registrado"));
  assert.ok(migration.includes("'INVENTARIO_INICIAL_CORREGIDO'"));
  assert.ok(migration.includes("'corte_original_conservado',true"));
  assert.ok(migration.includes("'recepcion_original_conservada',true"));
  assert.ok(migration.includes("'stock_global_modificado',false"));
  assert.ok(migration.includes("UPDATE public.turno_jornada_inventario_correcciones"));
  assert.equal(migration.includes("UPDATE public.turno_jornada_inventario_lineas"),false);
});

test("settlement and live balance use only Bajas/Mermas owned by this jornada",()=>{
  assert.ok(migration.includes("m.turno_sesion_id=v_s.id"));
  assert.ok(migration.includes("b.turno_sesion_id=v_s.id"));
  assert.ok(migration.includes("mr.turno_sesion_id=v_s.id"));
  assert.ok(migration.includes("m.turno_sesion_id = p_turno_sesion_id"));
  assert.ok(migration.includes("b.turno_sesion_id = p_turno_sesion_id"));
});

test("a correction to the initial cut drives the settlement, balance and workspace readback",()=>{
  assert.ok(migration.includes("c.tipo='INICIAL'"));
  assert.ok(migration.includes("adj.cantidad_corregida"));
  assert.ok(migration.includes("'cantidad_original',l.cantidad_contada"));
  assert.ok(migration.includes("'cantidad_corregida',adj.cantidad_corregida"));
});

test("stale shared handovers are refreshed and forced to recount before a receipt is inserted",()=>{
  assert.ok(migration.includes("INVENTARIO_ENTREGA_REQUIERE_RECUENTO_POR_CORRECCION_ORIGEN"));
  assert.ok(migration.includes("SET estado='REQUIERE_RECUENTO',actualizado_en=now()"));
  assert.ok(migration.includes("'recepcion_creada',false"));
  assert.ok(migration.includes("RETURN jsonb_build_object("));
  assert.ok(ui.includes("result&&result.requiere_recuento"));
  assert.ok(ui.includes("la recepción NO se guardó"));
});

test("PWA loads the changed Jornada module from a refreshed release cache",()=>{
  assert.ok(app.includes('const VERSION="9.5.128"'));
  assert.ok(app.includes('["bc7-jornada-ui.js","7.44"]'));
  assert.ok(sw.includes('var BC_SW_VERSION = "9.5.128"'));
  assert.ok(sw.includes("bc7-jornada-ui.js?v=7.44"));
});
