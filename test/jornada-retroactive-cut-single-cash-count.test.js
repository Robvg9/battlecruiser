"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

const FIX=read("supabase/migrations/20261119160000_jornada_retroactive_cut_single_cash_count.sql");
const CASH=read("public/js/aprobaciones-admin.js");
const EXCEPTIONS=read("public/js/turno-cash-handover-ui.js");

test("retroactive inventory liquidation starts from the confirmed initial physical cut",()=>{
  assert.ok(FIX.includes("v_start_at:=coalesce(v_initial.confirmado_en,v_initial.creado_en,v_turno.apertura_real)"));
  assert.ok(FIX.includes("coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at"));
  assert.ok(FIX.includes("coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at"));
  assert.ok(FIX.includes("Expected Jornada initial-cut boundary not found."));
});

test("BEFORE_CORTE classification cannot re-add a movement already contained in the initial inventory snapshot",()=>{
  assert.ok(FIX.includes("AND mr.clasificacion='ANTES_CORTE'))"));
  assert.ok(FIX.includes("coalesce(m.fecha_revision,m.actualizado_en,m.creado_en)>v_start_at"));
  assert.ok(FIX.includes("coalesce(b.fecha_revision,b.actualizado_en,b.creado_en)>v_start_at"));
});

test("final declaration enters the single-step Owner queue only after the Jornada is completed",()=>{
  assert.ok(FIX.includes("public.listar_aprobaciones_admin()"));
  assert.ok(FIX.includes("AND s.estado='COMPLETADA'"));
  assert.ok(FIX.includes("Expected final-cash admin queue branch not found."));
});

test("final cash count is atomic, idempotent, and requires a completed handover",()=>{
  assert.ok(FIX.includes("NOT IN ('PENDIENTE','ESPERANDO_APROBACION','DECLARACION_APROBADA')"));
  assert.ok(FIX.includes("La declaración final debe confirmarse con el conteo físico en una sola acción."));
  assert.ok(CASH.includes("rpc('bc5_contar_dinero_entregado'"));
  assert.ok(CASH.includes("Esta única acción confirmará el efectivo o registrará la diferencia para revisión."));
  assert.ok(CASH.includes("Solicitar corrección"));
});

test("separate cash panel is hidden unless a physical count created a real discrepancy",()=>{
  assert.ok(EXCEPTIONS.includes("DIFERENCIAS DE EFECTIVO"));
  assert.ok(EXCEPTIONS.includes("estado_aprobacion || '').toUpperCase() === 'CON_DIFERENCIA'"));
  assert.ok(EXCEPTIONS.includes("Pending final declarations are counted directly in Centro de Control."));
});
