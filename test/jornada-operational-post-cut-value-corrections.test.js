"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261125193000_jornada_closed_operational_value_corrections.sql","utf8");
const contract=fs.readFileSync("test/jornada-operational-post-cut-value-corrections-contract.sql","utf8");
const ui=fs.readFileSync("public/js/jornada-owner-review.js","utf8");

test("Operationally closed value corrections update only the session-level audited override",()=>{
  assert.match(migration,/v_s\.estado NOT IN \('COMPLETADA','CERRADA_OPERATIVAMENTE'\)/);
  assert.match(migration,/IF v_s\.estado='COMPLETADA' THEN[\s\S]*UPDATE public\.productos/);
  assert.match(migration,/'valores_solo_jornada',v_s\.estado='CERRADA_OPERATIVAMENTE'/);
  assert.match(migration,/'catalogo_modificado',v_s\.estado='COMPLETADA' AND EXISTS/);
  assert.match(migration,/'valores_producto_persistidos',v_s\.estado='COMPLETADA'/);
  assert.match(contract,/v_s\.estado NOT IN/);
  assert.match(ui,/data-session-state=/);
  assert.match(ui,/result\?\.valores_solo_jornada!==true/);
  assert.match(ui,/El catálogo global no cambió/);
});

test("Completed Jornadas keep the existing persistent product value path",()=>{
  assert.match(migration,/IF v_s\.estado='COMPLETADA' THEN/);
  assert.match(ui,/fijándolos para futuras Jornadas/);
  assert.match(ui,/result\?\.valores_producto_persistidos!==true/);
});
