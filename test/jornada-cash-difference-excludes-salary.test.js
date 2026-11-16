"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261115120000_jornada_cash_difference_excludes_salary.sql","utf8");
const jornada=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const owner=fs.readFileSync("public/js/jornada-owner-review.js","utf8");
const pwa=fs.readFileSync("public/app.js","utf8");

test("Jornada cash reconciliation excludes accrued salary while retaining it as separate payroll",()=>{
  assert.match(migration,/v_sales_total-v_expenses-v_reinvestments,2/);
  assert.match(migration,/v_adjusted_sales-coalesce/);
  assert.match(migration,/efectivo_esperado_despues_de_gastos_reinversiones/);
  assert.match(migration,/El salario se acumula y paga por separado/);
  assert.match(jornada,/Efectivo esperado \(sin salario\)/);
  assert.match(jornada,/Sobrante \/ faltante de caja/);
  assert.match(jornada,/se acumula en CuevaCoin y se paga después/);
  assert.match(owner,/Efectivo esperado \(sin salario\)/);
  assert.match(owner,/Sobrante \/ faltante de caja/);
  assert.match(owner,/se acumula en CuevaCoin y se paga después/);
  assert.match(pwa,/VERSION="9\.5\.117"/);
});
