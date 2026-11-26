"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(__dirname, "..", "supabase/migrations/20261126135000_jornada_initial_rectification_syncs_previous_final.sql"), "utf8");
const helperStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.bc7_sync_previous_final_from_successor_initial");
const rpcStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.bc7_corregir_inventario_inicial_jornada");
const helper = migration.slice(helperStart, rpcStart);
const rpc = migration.slice(rpcStart);

test("an INITIAL correction resolves only its exact confirmed predecessor FINAL and accepted handover", () => {
  assert.ok(helperStart >= 0 && rpcStart > helperStart);
  assert.match(helper, /v_initial\.origen_corte_id/);
  assert.match(helper, /id=v_initial\.origen_corte_id[\s\S]*?tipo='FINAL'[\s\S]*?estado='CONFIRMADO'/);
  assert.match(helper, /destino_sesion_id=v_successor\.id[\s\S]*?estado='ACEPTADA'/);
  assert.match(helper, /recepciones[\s\S]*?estado='ACEPTADA'/);
});

test("only stock movement of the corrected product family within the actual handover interval blocks propagation", () => {
  assert.match(helper, /v_start:=coalesce\(v_source\.corte_operativo_at,v_source_cut\.confirmado_en\)/);
  assert.match(helper, /v_end:=v_receipt\.recibido_en/);
  assert.match(helper, /coalesce\(mp\.producto_padre_id,mp\.id\)=v_family_id/);
  for (const table of ["transferencias","ventas","vales_salida","lotes_compra","reinversiones","bajas","mermas","stock"]) {
    assert.ok(helper.includes("public." + table), "movement guard missing " + table);
  }
  assert.match(helper, /turno_jornada_inventario_entregas other_delivery/);
  assert.match(helper, /MOVIMIENTO_DEL_PRODUCTO_EN_INTERVALO/);
});

test("a safe correction appends a FINAL overlay and preserves original cuts, receipt and global stock", () => {
  assert.match(helper, /INSERT INTO public\.turno_jornada_inventario_correcciones\([\s\S]*?tipo,cantidad_original,cantidad_corregida/);
  assert.match(helper, /source_cut_rows_modified',false/);
  assert.match(helper, /successor_initial_rows_modified',false/);
  assert.match(helper, /receipt_rows_modified',false/);
  assert.match(helper, /global_stock_modified',false/);
  assert.match(helper, /catalog_modified',false/);
  assert.doesNotMatch(helper, /UPDATE public\.turno_jornada_inventario_cortes/);
  assert.doesNotMatch(helper, /UPDATE public\.turno_jornada_inventario_lineas/);
  assert.doesNotMatch(helper, /UPDATE public\.turno_jornada_inventario_recepcion_lineas/);
  assert.doesNotMatch(helper, /UPDATE public\.stock/);
});

test("the initial correction RPC invokes predecessor synchronization and reports both outcomes", () => {
  assert.match(rpc, /bc7_sync_previous_final_from_successor_initial\(\s*v_s\.id,v_product_id,v_new_qty,auth\.uid\(\)/);
  assert.match(rpc, /finales_anteriores_sincronizados',v_final_syncs/);
  assert.match(rpc, /finales_anteriores_requieren_revision',v_final_sync_blocked/);
  assert.match(rpc, /JORNADA_FINAL_RECTIFICADO_DESDE_INICIAL_SUCESOR/);
});

test("a blocked propagation writes continuity evidence on both jornadas instead of silently changing the predecessor", () => {
  assert.match(helper, /IF v_has_movement THEN[\s\S]*?JORNADA_INVENTARIO_DISCREPANCIA_CONTINUIDAD/);
  assert.match(helper, /synchronized',false,'blocked',true/);
  assert.match(helper, /synchronized',true,'blocked',false/);
});
