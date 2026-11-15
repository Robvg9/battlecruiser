"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261115142000_restore_cueva_dahiana_successor_20261111_13.sql","utf8");

test("restores the owner-confirmed La Cueva successor period exactly",()=>{
  assert.ok(migration.includes("DATE '2026-11-11'"));
  assert.ok(migration.includes("DATE '2026-11-13'"));
  assert.ok(migration.includes("p.fecha_fin=DATE '2026-11-10'"));
});

test("assigns the real active and eligible responsible Dahiana",()=>{
  assert.ok(migration.includes("u.username='dahiana'"));
  assert.ok(migration.includes("bc5_jornada_responsable_elegible(v_responsible_id)"));
  assert.ok(migration.includes("turno_asignaciones"));
});

test("restores the pending handover without changing inventory or global stock",()=>{
  assert.ok(migration.includes("e.estado='PENDIENTE_PROGRAMACION'"));
  assert.ok(migration.includes("v_line_count<>66"));
  assert.ok(migration.includes("estado='PENDIENTE_RECEPCION'"));
  assert.ok(migration.includes("'stock_global_modificado',false"));
  assert.ok(!/UPDATE\s+public\.stock\b/i.test(migration));
  assert.ok(!/INSERT\s+INTO\s+public\.stock\b/i.test(migration));
  assert.ok(!/turno_jornada_inventario_recepcion_lineas/i.test(migration));
});

test("requires no overlapping warehouse jornada or Dahiana assignment",()=>{
  assert.ok(migration.includes("another open or scheduled master turn"));
  assert.ok(migration.includes("conflicting jornada program"));
  assert.ok(migration.includes("active operational tramo"));
});

test("is production-data aware and does not hardcode generated row UUIDs",()=>{
  assert.ok(migration.includes("No matching unlinked La Cueva handover"));
  assert.ok(!/72f31e51-e83e-4ddf-8110-90e77017052e/i.test(migration));
  assert.ok(!/d2c34c45-16c6-4be2-907e-8036ee8a7cec/i.test(migration));
  assert.ok(!/c494dd3d-1311-42f5-8c97-4408dd578f24/i.test(migration));
});

test("uses the 66-family outgoing handover snapshot, not today's expanded product catalog",()=>{
  assert.ok(migration.includes("immutable product-family snapshot"));
  assert.ok(migration.includes("The payload must match exactly the product families frozen in this delivery."));
  assert.ok(migration.includes("FROM public.turno_jornada_inventario_entrega_lineas"));
  assert.ok(migration.includes("WHERE entrega_id=v_e.id"));
  assert.ok(migration.includes("v_line_count<>66"));
  assert.ok(!/v_line_count<>66 OR v_line_count<>v_expected/.test(migration));
});

test("does not silently copy the outgoing worker's salary percentage",()=>{
  assert.ok(migration.includes("Do not inherit the outgoing worker's jornada-specific salary rate."));
  assert.ok(!migration.includes("v_source_program.salario_porcentaje"));
});

test("historical counts and UI catalog are bounded by the jornada end date",()=>{
  assert.ok(migration.includes("bc7_guardar_inventario_jornada(uuid,text,jsonb,text)"));
  assert.ok(migration.includes("bc7_obtener_inventario_jornada(uuid)"));
  assert.ok(migration.includes("v_period_end + 1"));
  assert.ok(migration.includes("coalesce(v_p.fecha_fin,v_p.fecha) + 1"));
  assert.ok(migration.includes("p.created_at <"));
});

test("restoration audit references the actual source program row",()=>{
  assert.ok(migration.includes("v_source_program public.turno_jornada_programacion%ROWTYPE"));
  assert.ok(migration.includes("SELECT * INTO STRICT v_source_program"));
});

test("refuses to create a successor before the source jornada actually closed",()=>{
  assert.ok(migration.includes("v_source_actual_close_date"));
  assert.ok(migration.includes("v_source_actual_close_date >= DATE '2026-11-11'"));
  assert.ok(migration.includes("No se puede crear la sucesora 11–13"));
});
