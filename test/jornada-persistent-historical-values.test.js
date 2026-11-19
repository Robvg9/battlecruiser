"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261119120000_jornada_persist_historical_product_values.sql","utf8");

test("Product-wide price and cost snapshots are effective-dated, private, and append-only",()=>{
  assert.match(migration,/ADD COLUMN IF NOT EXISTS costo_unitario_referencia/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.productos_valores_historial/);
  assert.match(migration,/effective_at timestamptz NOT NULL/);
  assert.match(migration,/origen text NOT NULL CHECK/);
  assert.match(migration,/ALTER TABLE public\.productos_valores_historial ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/REVOKE ALL ON public\.productos_valores_historial FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/BEFORE UPDATE OR DELETE ON public\.productos_valores_historial/);
  assert.match(migration,/'-infinity'::timestamptz, 'BASELINE'/);
  assert.match(migration,/AFTER INSERT OR UPDATE OF precio_normal, costo_unitario_referencia ON public\.productos/);
});

test("Historical corrections update global product values without deleting session-level evidence",()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.bc7_ajustar_valores_producto_jornada/);
  assert.match(migration,/turno_jornada_valores_correcciones/);
  assert.match(migration,/SET precio_normal=coalesce\(v_price,precio_normal\)/);
  assert.match(migration,/costo_unitario_referencia=coalesce\(v_cost,costo_unitario_referencia\)/);
  assert.match(migration,/app\.bc_product_values_source','JORNADA_CORRECTION'/);
  assert.match(migration,/'valores_producto_persistidos',true/);
  assert.match(migration,/catalogo_modificado',EXISTS/);
});

test("Only the one still-open completed Jornada is initially promoted; closed historical corrections stay local",()=>{
  assert.match(migration,/coalesce\(t\.estado_maestro,t\.estado\) NOT IN \('CERRADO','CANCELADO'\)/);
  assert.match(migration,/IF v_candidate_sessions > 1 THEN/);
  assert.match(migration,/IF v_candidate_sessions = 1 THEN/);
  assert.match(migration,/jv\.turno_sesion_id = v_session_id AND jv\.vigente/);
});

test("Sales read the product price effective at the initial physical cut",()=>{
  assert.match(migration,/h\.effective_at <= coalesce\(v_initial\.confirmado_en,v_start_at,now\(\)\)/);
  assert.match(migration,/persistent_values\.precio_venta_unitario/);
  assert.match(migration,/child_persistent_values\.precio_venta_unitario/);
  assert.match(migration,/Expected liquidation price-history group by not found/);
});

test("Owner review reads persistent product costs effective at the final physical cut",()=>{
  assert.match(migration,/h\.effective_at <= coalesce\(v_final\.confirmado_en,now\(\)\)/);
  assert.match(migration,/coalesce\(jv\.costo_unitario,persistent_values\.costo_unitario,c\.costo_unitario\)/);
  assert.match(migration,/COSTO_PERSISTENTE_PRODUCTO/);
  assert.match(migration,/costo_referencia_producto/);
});
