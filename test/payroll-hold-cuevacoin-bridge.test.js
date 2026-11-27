"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=path=>fs.readFileSync(path,"utf8");
const bc=read("supabase/migrations/20261126162000_jornada_payroll_hold_cuevacoin_bridge.sql");
const bridge=read("public/js/payroll-bridge.js");
const jornada=read("public/js/bc7-jornada-ui.js");
const owner=read("public/js/jornada-owner-review.js");
const app=read("public/app.js");
const sw=read("public/service-worker.js");

test("salary snapshot is created only from an owner-approved closed Jornada and preserves history",()=>{
  assert.match(bc,/AFTER UPDATE OF estado_maestro ON public\.turnos/);
  assert.match(bc,/NEW\.estado_maestro[\s\S]*'CERRADO'[\s\S]*bc7_payroll_snapshot_turn\(NEW\.id\)/);
  assert.match(bc,/ON CONFLICT\(turno_id,usuario_id\) DO NOTHING/);
  assert.match(bc,/categoria_nomina text NOT NULL DEFAULT 'LEGACY'/);
  assert.doesNotMatch(bc,/UPDATE public\.gastos SET categoria_nomina='SALARIOS'/);
});

test("successor release requires an accepted physical handover in the same warehouse",()=>{
  assert.match(bc,/turno_jornada_inventario_entregas e/);
  assert.match(bc,/e\.estado='ACEPTADA'/);
  assert.match(bc,/e\.almacen_id=src\.almacen_id AND src\.almacen_id=dst\.almacen_id/);
  assert.match(bc,/src\.estado='COMPLETADA' AND dst\.estado='COMPLETADA'/);
  assert.match(bc,/ORDER BY coalesce\(p2\.fecha_fin,p2\.fecha\) DESC/);
  assert.match(bc,/ORDER BY p3\.fecha,p3\.numero_dia/);
  assert.match(owner,/BCPayrollBridge\.processAutomatic/);
});

test("salary and withdrawal RPCs require owner identity and CuevaCoin transaction confirmation",()=>{
  assert.match(bc,/bc7_payroll_assert_admin/);
  assert.match(bc,/Solo el Dueño\/Admin autenticado puede operar nómina/);
  assert.match(bc,/bc7_payroll_begin_credit/);
  assert.match(bc,/bc7_payroll_finish_credit/);
  assert.match(bc,/bc7_payroll_begin_withdrawal/);
  assert.match(bc,/bc7_payroll_finish_withdrawal/);
  assert.match(bc,/cuevacoin_pago_estado='APLICADO'/);
  assert.match(bc,/No se puede aprobar un retiro de salario sin confirmar el débito en CuevaCoin/);
  assert.doesNotMatch(bridge,/\+\s*\+\(employeeRows/);
  assert.match(bridge,/action:'save_mapping'/);
  assert.match(bridge,/action:'credit_salary'/);
  assert.match(bridge,/action:'withdraw_salary'/);
  assert.doesNotMatch(bridge,/SERVICE_ROLE_KEY/);
});

test("Jornada expenses capture SALARIOS and cafeteria supplies separately; payroll module is cached offline",()=>{
  assert.match(jornada,/UTILES_DE_LA_CAFETERIA/);
  assert.match(jornada,/bc7_payroll_registrar_gasto_jornada/);
  assert.match(bridge,/data-bc7-expense-beneficiary/);
  assert.match(bridge,/No modifica CuevaCoin/);
  assert.match(app,/\["payroll-bridge\.js","1\.2"\]/);
  assert.match(sw,/\.\/js\/payroll-bridge\.js\?v=1\.2/);
  assert.match(app,/\["bc7-jornada-ui\.js","7\.70"\]/);
  assert.match(sw,/\.\/js\/bc7-jornada-ui\.js\?v=7\.70/);
});

test("Nómina is mounted from Administration and remains separate from approval requests",()=>{
  const approvals=read("public/js/aprobaciones-admin.js");
  const index=read("public/index.html");
  assert.match(index,/bc-admin-payroll[\\s\\S]*data-bcpay-open-admin/);
  assert.match(bridge,/async function openAdminModal/);
  assert.match(bridge,/data-bcpay-open-admin/);
  assert.match(bridge,/bc-payroll-admin-modal/);
  assert.doesNotMatch(approvals,/bc-payroll-admin-host|mountAdminPanel/);
  assert.match(approvals,/payrollIds/);
});
