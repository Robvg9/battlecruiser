"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync(
  "supabase/migrations/20261116180000_jornada_sync_pending_handover_after_final_correction.sql",
  "utf8"
);
const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");

test("new handovers snapshot the current owner-corrected source FINAL",()=>{
  assert.ok(migration.includes("coalesce(c.cantidad_corregida,l.cantidad_contada)"));
  assert.ok(migration.includes("c.tipo='FINAL'"));
  assert.ok(migration.includes("c.vigente=true"));
});

test("a final correction refreshes only handovers without a pending or accepted receipt",()=>{
  assert.ok(migration.includes("e.estado IN ('PENDIENTE_PROGRAMACION','PENDIENTE_RECEPCION','REQUIERE_RECUENTO')"));
  assert.ok(migration.includes("r.estado IN ('PENDIENTE_REVISION','ACEPTADA')"));
  assert.ok(migration.includes("SET cantidad_declarada=v_new_qty"));
  assert.ok(migration.includes("INVENTARIO_ENTREGA_SINCRONIZADA_CORRECCION_FINAL"));
  assert.ok(migration.includes("cantidad_declarada_anterior"));
  assert.ok(migration.includes("cantidad_declarada_actualizada"));
});

test("inventory history labels stored system stock as a reference, not as received quantity",()=>{
  assert.ok(ui.includes("Stock de referencia capturado al confirmar el corte"));
  assert.ok(ui.includes("Diferencia vs. referencia"));
  assert.ok(ui.includes("No es la diferencia entre lo declarado y lo recibido"));
});

test("Jornada module cache key is aligned after the UI change",()=>{
  assert.ok(app.includes('["bc7-jornada-ui.js","7.36"]'));
  assert.ok(sw.includes("bc7-jornada-ui.js?v=7.36"));
  assert.ok(ui.includes("// v7.36 —"));
});
