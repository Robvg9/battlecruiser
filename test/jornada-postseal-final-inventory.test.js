"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const migration=read("supabase/migrations/20261123150000_jornada_postseal_final_inventory_and_checklist.sql");
const ui=read("public/js/bc7-jornada-ui.js");
const app=read("public/app.js");
const sw=read("public/service-worker.js");
const runner=read("test/step7-jornada-postgres-windows-ci.js");
const contract=read("test/jornada-postseal-final-inventory-contract.sql");
const functional=read("test/jornada-sealed-baja-balance-functional.sql");

test("sealed final count is exposed only with the server-verified exact tranche",()=>{
  assert.match(ui,/const postSealFinal=type==='FINAL'&&sessionState==='CERRADA_OPERATIVAMENTE'&&!!detail\.tramo_registrable/);
  assert.match(ui,/data-bc7-count-postseal="true"/);
  assert.match(ui,/data-bc7-count-source/);
  assert.match(ui,/data-bc7-count-source-hash/);
  assert.match(ui,/No uses el stock actual/);
  assert.match(ui,/bc7_guardar_inventario_final_post_sello_jornada/);
  assert.match(ui,/bc7_guardar_inventario_jornada/);
});

test("post-seal final RPC requires source fingerprint, original cutoff and an open master Turn",()=>{
  assert.match(migration,/bc7_guardar_inventario_final_post_sello_jornada/);
  assert.match(migration,/p_fuente_content_hash/);
  assert.match(migration,/^[\s\S]*v_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration,/v_s\.corte_operativo_at/);
  assert.match(migration,/t\.estado='ABIERTO'/);
  assert.match(migration,/tr\.fin_at=v_s\.corte_operativo_at/);
  assert.match(migration,/registrado_post_sello=true/);
});

test("sealed Owner checklist requires the exact assigned tranche while the master Turn stays open",()=>{
  assert.match(migration,/bc7_confirmar_bloque_jornada/);
  assert.match(migration,/jp\.responsable_id/);
  assert.match(migration,/tr\.fin_at=v_s\.corte_operativo_at/);
  assert.match(migration,/El Turno maestro ya está cerrado/);
});

test("post-seal liquidation keeps the original physical cutoff, not the submission timestamp",()=>{
  assert.match(migration,/v_final\.registrado_post_sello/);
  assert.match(migration,/v_final\.corte_fisico_at,v_s\.corte_operativo_at/);
  assert.match(contract,/corte_fisico_at/);
  assert.match(contract,/v_end_at/);
});

test("PostgreSQL 17 CI installs and functionally tests the post-seal final-count path",()=>{
  assert.match(runner,/20261123150000_jornada_postseal_final_inventory_and_checklist\.sql/);
  assert.match(runner,/jornada-postseal-final-inventory-contract\.sql/);
  assert.match(functional,/bc7_guardar_inventario_final_post_sello_jornada/);
  assert.match(functional,/bc7_confirmar_bloque_jornada/);
});

test("the Jornada module cache is invalidated for the historical-count UI",()=>{
  assert.match(app,/\["bc7-jornada-ui\.js","7\.53"\]/);
  assert.match(sw,/bc7-jornada-ui\.js\?v=7\.53/);
});
