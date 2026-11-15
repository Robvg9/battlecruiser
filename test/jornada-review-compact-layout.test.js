"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const REVIEW=read("public/js/jornada-owner-review.js");
const MIGRATION=read("supabase/migrations/20261114190000_jornada_historical_price_cost_overrides.sql");
const TRANCHE_MIGRATION=read("supabase/migrations/20261115003500_jornada_historic_price_tranches.sql");
const APP=read("public/app.js"),SW=read("public/service-worker.js");

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


test("Historical value and final-count editors show save progress and backend errors inside the floating modal",()=>{
  assert.match(REVIEW,/data-bcjr-values-status/);
  assert.match(REVIEW,/Guardando valores históricos de esta Jornada/);
  assert.match(REVIEW,/No se pudo guardar: /);
  assert.match(REVIEW,/Reintentar guardado/);
  assert.match(REVIEW,/data-bcjr-count-status/);
  assert.match(REVIEW,/Guardando corrección de inventario/);
  assert.match(REVIEW,/No se guardó: introduce un precio o costo válido/);
  assert.match(REVIEW,/No se guardó: introduce una cantidad final válida/);
  assert.equal(REVIEW.split("finally{busy=false;if(report").length-1,4,"all historical editors must release busy and refresh the review state");
});

test("Historic sale price tranches are audited, quantity-balanced and included in liquidation revenue",()=>{
  assert.match(REVIEW,/data-bcjr-open-tranches/);
  assert.match(REVIEW,/bc7_guardar_tramos_precio_jornada/);
  assert.match(REVIEW,/precio_tramos/);
  assert.match(TRANCHE_MIGRATION,/CREATE TABLE IF NOT EXISTS public\.turno_jornada_precio_tramos/);
  assert.match(TRANCHE_MIGRATION,/abs\(v_sum-v_sold\)>0\.0001/);
  assert.match(TRANCHE_MIGRATION,/round\(sum\(t\.cantidad\*t\.precio_unitario\),2\)/);
  assert.match(TRANCHE_MIGRATION,/PRECIOS_POR_TRAMOS/);
  assert.match(TRANCHE_MIGRATION,/auth\.uid\(\)/);
});


test("Historical costs can be reviewed and saved for all missing-cost products in one audited RPC",()=>{
  assert.match(REVIEW,/data-bcjr-open-bulk-costs/);
  assert.match(REVIEW,/data-bcjr-bulk-costs-save/);
  assert.match(REVIEW,/bc7_ajustar_valores_producto_jornada/);
  assert.match(REVIEW,/p_ajustes:adjustments/);
  assert.match(REVIEW,/verifiedHistoricCosts/);
  assert.match(REVIEW,/Los vacíos no se guardarán/);
  assert.match(REVIEW,/No modifican el catálogo/);
  assert.match(APP,/VERSION="9\\.5\\.111"/);
  assert.match(SW,/BC_SW_VERSION = "9\\.5\\.111"/);
});
