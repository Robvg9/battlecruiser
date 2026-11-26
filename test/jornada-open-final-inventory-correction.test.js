"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const migration=fs.readFileSync("supabase/migrations/20261126150000_jornada_open_final_inventory_correction.sql","utf8");
const compact=fs.readFileSync("test/step7-jornada-compact-layout.test.js","utf8");

test("ADMIN final inventory corrections allow active jornada session states and remain audited overlays",()=>{
  assert.ok(migration.includes("bc7_corregir_inventario_final_jornada"));
  assert.ok(migration.includes("v_s.estado NOT IN (''COMPLETADA'',''EN_CURSO'',''CERRADA_OPERATIVAMENTE'')"));
  assert.ok(migration.includes("bc_actor_is_admin"));
  assert.ok(migration.includes("turno_jornada_inventario_correcciones"));
  assert.ok(migration.includes("tipo=''FINAL''"));
  assert.ok(migration.includes("coalesce(t.estado_maestro,t.estado)"));
  assert.ok(migration.includes("IN (''CERRADO'',''CANCELADO'')"));
  assert.ok(migration.includes("La función FINAL no conserva el bloqueo del Turno maestro cerrado/cancelado."));
  assert.ok(!migration.includes("UPDATE public.turno_jornada_inventario_lineas"));
  assert.ok(!migration.includes("UPDATE public.stock"));
});

test("compact Jornada UI contract follows the 7.68 module marker",()=>{
  assert.match(compact,/v7\\.68 — keep Bajas checklist mounted after review submission/);
  assert.doesNotMatch(compact,/v7\\.67 — approved Jornada status and realtime calendar refresh/);
});
