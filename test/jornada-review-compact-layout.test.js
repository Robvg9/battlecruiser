"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const REVIEW=read("public/js/jornada-owner-review.js");
const MIGRATION=read("supabase/migrations/20261114190000_jornada_historical_price_cost_overrides.sql");

test("Owner review keeps the approval footer outside the scrollable content",()=>{
  assert.match(REVIEW,/\.bcjr-dialog\{display:flex;flex-direction:column/);
  assert.match(REVIEW,/#bcjr-content\{flex:1 1 auto;min-height:0;overflow:auto/);
  assert.match(REVIEW,/\.bcjr-footer\{position:static/);
});
test("Product review can switch between stock and financial columns",()=>{
  assert.match(REVIEW,/data-bcjr-table-view="stock"/);
  assert.match(REVIEW,/data-bcjr-table-view="finance"/);
  assert.match(REVIEW,/data-bcjr-view="stock"/);
  assert.match(REVIEW,/data-bcjr-open-count/);
  assert.match(REVIEW,/x\.inventario_final_original!=null\?/,"count correction is only offered when a final-cut row exists");
  assert.match(REVIEW,/table\.dataset\.bcjrView=view/);
});
test("Review evidence is optional in collapsible panels",()=>{
  assert.match(REVIEW,/class="bcjr-detail"/);
  assert.match(REVIEW,/Entregas y conteo de efectivo/);
  assert.match(REVIEW,/Bajas y mermas para clasificar/);
  assert.match(REVIEW,/Liquidación y desglose financiero/);
});
test("Historical product values are edited through an audited session-only RPC",()=>{
  assert.match(REVIEW,/bc7_ajustar_valores_producto_jornada/);
  assert.match(REVIEW,/No modifican el catálogo ni las ventas futuras/);
  assert.match(MIGRATION,/turno_jornada_valores_correcciones/);
  assert.match(MIGRATION,/CHECK \(precio_venta_unitario IS NOT NULL OR costo_unitario IS NOT NULL\)/);
  assert.match(MIGRATION,/VALORES_HISTORICOS_JORNADA_CORREGIDOS/);
  assert.match(MIGRATION,/catalogo_modificado',false/);
  assert.match(MIGRATION,/REVOKE ALL ON FUNCTION public\.bc7_ajustar_valores_producto_jornada/);
  assert.match(MIGRATION,/GRANT EXECUTE ON FUNCTION public\.bc7_ajustar_valores_producto_jornada.*TO authenticated/);
});
