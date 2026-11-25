"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const migration=read("supabase/migrations/20261123150600_jornada_sealed_final_inventory_admin_capture.sql");
const ui=read("public/js/bc7-jornada-ui.js");
const app=read("public/app.js");
const sw=read("public/service-worker.js");
const runner=read("test/step7-jornada-postgres-windows-ci.js");

test("forward migration recognizes the checklist function shape left by the already-applied LIVE historical migration",()=>{
  assert.match(migration,/patch_live_sealed_owner_checklist_shape/);
  assert.match(migration,/BC7_SEALED_OWNER_BLOCK_GATE_V1/);
  assert.match(migration,/AND fin_at=v_s\.corte_operativo_at/);
  assert.match(migration,/v_master_turn public\.turnos/);
  assert.match(migration,/FOR UPDATE/);
});

test("sealed final inventory capture is ADMIN-only, cutoff-bound and restricted to the original opening product set",()=>{
  assert.match(migration,/bc_actor_is_admin/);
  assert.match(migration,/v_s\.estado<>'CERRADA_OPERATIVAMENTE'/);
  assert.match(migration,/v_turn\.estado<>'ABIERTO'/);
  assert.match(migration,/v_turn\.estado_maestro/);
  assert.match(migration,/v_initial_cut/);
  assert.match(migration,/initial_line\.corte_id=v_initial_cut/);
  assert.match(migration,/bc7_jornada_saldos_operativos/);
  assert.match(migration,/source_sha256/);
  assert.match(migration,/idempotency_key/);
  assert.match(migration,/stock_global_modificado',false/);
});

test("sealed historic inventory upload keeps post-cutoff warehouse movements out of liquidation",()=>{
  assert.match(migration,/WHEN v_s\.estado=''CERRADA_OPERATIVAMENTE'' AND v_s\.corte_operativo_at IS NOT NULL/);
  assert.match(migration,/THEN v_s\.corte_operativo_at/);
});

test("Jornada UI supports responsible physical count with audited ADMIN CSV fallback",()=>{
  assert.match(ui,/data-bc7-sealed-final-capture/);
  assert.match(ui,/data-bc7-sealed-final-capture="responsible"/);
  assert.match(ui,/sealedResponsibleCapture/);
  assert.match(ui,/bc7_responsable_registrar_inventario_final_sellado_jornada/);
  assert.match(ui,/bc7_admin_registrar_inventario_final_sellado_jornada/);
  assert.match(ui,/parseSealedInventoryCsv/);
  assert.match(ui,/Producto ID/);
  assert.match(ui,/Final físico al corte/);
  assert.match(ui,/sha256File/);
  assert.match(ui,/freshIdempotencyKey/);
});

test("PWA loader and offline shell request the current Jornada module",()=>{
  assert.match(app,/\["bc7-jornada-ui\.js","7\.66"\]/);
  assert.match(sw,/bc7-jornada-ui\.js\?v=7\.66/);
});

test("PostgreSQL 17 runner exercises sealed admin capture and its real database contract",()=>{
  assert.match(runner,/20261123150600_jornada_sealed_final_inventory_admin_capture\.sql/);
  assert.match(runner,/jornada-sealed-final-inventory-admin-contract\.sql/);
  assert.match(runner,/jornada-sealed-final-inventory-admin-functional\.sql/);
});
