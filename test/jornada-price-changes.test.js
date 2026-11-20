"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261119000000_jornada_persistent_price_changes.sql","utf8");
const costMigration=fs.readFileSync("supabase/migrations/20261119193000_jornada_price_change_optional_cost.sql","utf8");
const ui=fs.readFileSync("public/js/jornada-price-changes.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");

test("Jornada price changes are server-owned, audited, and wait for a physical count",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.turno_jornada_cambios_precio/);
  assert.match(migration,/estado='PENDIENTE_CONTEO'/);
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.bc7_solicitar_cambios_precio_jornada/);
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.bc7_confirmar_cambios_precio_conteo/);
  assert.match(migration,/precio_normal=v_change\.precio_anterior/);
  assert.match(migration,/SET precio_normal=v_change\.precio_nuevo/);
  assert.match(migration,/stock_sistema=v_expected/);
  assert.match(migration,/stock_contado=v_counted/);
  assert.match(migration,/unidades_vendidas_precio_anterior=v_sold_before/);
  assert.match(migration,/bc7_jornada_saldos_operativos\(v_s\.id\)/);
  assert.ok(migration.includes("tr.usuario_id=auth.uid()") && migration.includes("tr.estado='ACTIVO'"), "the pending price gate is scoped to the active worker");
  assert.match(migration,/estado text NOT NULL DEFAULT 'PENDIENTE_CONTEO'/);
  assert.match(migration,/bc7_jornada_precio_pendiente_close_guard/);
  assert.ok(migration.includes("REVOKE ALL ON FUNCTION public.bc7_bloquear_cierre_con_cambios_precio_pendientes() FROM PUBLIC, anon, authenticated;"), "trigger helper must not be RPC-callable");
  assert.match(migration,/REVOKE ALL ON public\.turno_jornada_cambios_precio FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.bc7_confirmar_cambios_precio_conteo\(uuid,jsonb\) TO authenticated/);
  assert.match(costMigration,/ADD COLUMN IF NOT EXISTS costo_anterior/);
  assert.match(costMigration,/ADD COLUMN IF NOT EXISTS costo_nuevo/);
  assert.match(costMigration,/v_new_cost/);
  assert.match(costMigration,/costo_unitario_referencia=coalesce\(v_change\.costo_nuevo/);
  assert.match(costMigration,/app\.bc_product_values_source/);
});

test("The price-change gate values each sale tranche once and blocks inconsistent totals",()=>{
  assert.match(migration,/sum\(c\.unidades_vendidas_precio_anterior\)/);
  assert.match(migration,/sum\(c\.unidades_vendidas_precio_anterior\*c\.precio_anterior\)/);
  assert.match(migration,/greatest\(0,\(x\.value->>'unidades_vendidas'\)::numeric-pt\.old_price_units\)\*pt\.latest_price/);
  assert.match(migration,/precio_tramos_inconsistentes/);
  assert.match(migration,/precio_cambios_aplicado/);
  assert.match(migration,/Expected liquidation insertion point not found exactly once/);
  assert.match(migration,/Expected Owner review pricing expression not found exactly once/);
});

test("Movimientos exposes bulk price changes and the assigned worker cannot dismiss the stock-count gate",()=>{
  assert.match(ui,/data-bc-jpc-owner-open/);
  assert.match(ui,/actions\.appendChild\(button\)/,"price change action joins the shared movements action bar");
  assert.match(ui,/bc165-action/,"price change button uses the same icon-button style as transfer and purchase");
  assert.match(ui,/Cambios de precio/);
  assert.match(ui,/data-bc-jpc-cost/);
  assert.match(ui,/Nuevo costo \(opcional\)/);
  assert.match(ui,/costo_nuevo:/);
  assert.match(ui,/item\.costo_nuevo!=null/);
  assert.match(ui,/bc-jpc-dialog bc165-modal/,"price change modal reuses the shared operation modal shell");
  assert.match(ui,/bc7_cambios_precio_contexto/);
  assert.match(ui,/bc7_solicitar_cambios_precio_jornada/);
  assert.match(ui,/bc7_mis_cambios_precio_pendientes/);
  assert.match(ui,/bc7_confirmar_cambios_precio_conteo/);
  assert.match(ui,/Conteo obligatorio por cambio de precio/);
  assert.match(ui,/Cuenta cada producto ahora/);
  assert.match(ui,/data-bc-jpc-count/);
  const countGate=ui.slice(ui.indexOf("function gateHtml"),ui.indexOf("function renderGate"));
  assert.ok(countGate.length>0);
  assert.doesNotMatch(countGate,/data-bc-jpc-close/);
  assert.match(ui,/setInterval\(refreshPending, 20000\)/);
  assert.match(ui,/No se activó ningún precio/);
  const ownerRows=ui.slice(ui.indexOf("function renderOwnerProducts"),ui.indexOf("function ownerModalHtml"));
  assert.match(ownerRows,/<div class="bc-jpc-product">/);
  assert.ok(ownerRows.includes("const checkboxId = 'bc-jpc-select-'") && ownerRows.includes("<label for=\"' + esc(checkboxId)"), "each product checkbox has an explicit associated label");
  assert.doesNotMatch(ownerRows,/<label class="bc-jpc-product">/,
    "product rows must not nest multiple interactive inputs inside one label");
});

test("Price-change UI is versioned, loaded in the app and precached for PWA startup",()=>{
  assert.match(app,/const VERSION="9.5.129"/);
  assert.match(app,/\["jornada-price-changes.js","1.0.1"\]/);
  assert.match(sw,/BC_SW_VERSION = "9.5.129"/);
  assert.match(sw,/\.\/js\/jornada-price-changes\.js\?v=1\.0\.1/);
});
