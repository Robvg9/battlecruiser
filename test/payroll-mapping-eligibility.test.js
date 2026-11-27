"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const migration=fs.readFileSync("supabase/migrations/20261127060000_payroll_mapping_dependienta_only.sql","utf8");

test("payroll mapping only lists and links active unarchived BattleCruiser dependientas",()=>{
  assert.match(migration,/JOIN public\.roles r ON r\.id=u\.role_id/);
  assert.match(migration,/r\.activo IS TRUE/);
  assert.match(migration,/lower\(btrim\(r\.nombre\)\) IN \('dependienta','dependientas'\)/);
  assert.match(migration,/u\.activo IS TRUE/);
  assert.match(migration,/coalesce\(u\.archivado,false\) IS FALSE/);
  assert.match(migration,/u\.id<>auth\.uid\(\)/);
  assert.match(migration,/FOR UPDATE OF u/);
  assert.match(migration,/p_bc_usuario_id=auth\.uid\(\)/);
  assert.match(migration,/Esta cuenta CuevaCoin ya está vinculada a otra persona/);
  assert.doesNotMatch(migration,/IN \('dependienta','dependientas','dueño'/);
});

test("the role guard changes functions only; it does not backfill or create payroll data",()=>{
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,3);
  assert.doesNotMatch(migration,/INSERT INTO public\.bc_nomina_salarios/);
  assert.doesNotMatch(migration,/UPDATE public\.perfiles/);
  assert.doesNotMatch(migration,/INSERT INTO public\.transacciones/);
  assert.doesNotMatch(migration,/UPDATE public\.gastos/);
});

test("salary unlock requires the accepted physical handover to the immediately consecutive same-warehouse turn",()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.bc7_payroll_unlock_predecessor/);
  assert.match(migration,/e\.estado='ACEPTADA'/);
  assert.match(migration,/src\.turno_id<>dst\.turno_id/);
  assert.match(migration,/e\.fecha_destino=dp\.fecha/);
  assert.match(migration,/dp\.fecha=coalesce\(sp\.fecha_fin,sp\.fecha\)\\+1/);
  assert.match(migration,/sp\.almacen_id=dp\.almacen_id/);
  assert.match(migration,/source_turn\.estado_maestro[\s\\S]*target_turn\.estado_maestro/);
});
