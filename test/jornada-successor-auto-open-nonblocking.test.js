"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const ui=read("public/js/bc7-jornada-ui.js");
const migration=read("supabase/migrations/20261125010000_jornada_successor_auto_open_nonblocking_receipt.sql");
const receiptContract=read("test/jornada-recepcion-issue333-contract.sql");
const runner=read("test/step7-jornada-postgres-windows-ci.js");
const app=read("public/app.js");
const sw=read("public/service-worker.js");

test("retroactive successor opens automatically after accepted physical receipt and scheduled start",()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.bc7_procesar_sucesoras_programadas/);
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.bc7_asegurar_inicio_sucesora_programada/);
  assert.match(migration,/p\.hora_inicio_prevista/);
  assert.match(migration,/bc5_cerrar_jornadas_operativas_vencidas/);
  assert.match(migration,/cron\.alter_job/);
  assert.doesNotMatch(migration,/UPDATE\s+cron\.job/i);
  assert.match(ui,/bc7_asegurar_inicio_sucesora_programada/);
  assert.doesNotMatch(ui,/El dueño debe activar esta jornada retroactiva/);
  assert.doesNotMatch(ui,/Motivo obligatorio de apertura retroactiva/);
});

test("physical receipt differences are accepted and visible rather than blocking operation",()=>{
  assert.match(migration,/INVENTARIO_RECEPCION_DISCREPANCIAS_INFORMATIVAS/);
  assert.match(migration,/SET estado='ACEPTADA'/);
  assert.match(migration,/diferencias_informativas/);
  assert.match(ui,/alertas_continuidad/);
  assert.match(ui,/Discrepancia de inventario entre Jornadas/);
  assert.match(receiptContract,/1-diff receipt must auto-accept without Owner review/);
  assert.match(receiptContract,/15-diff receipt must auto-accept without Owner review/);
});

test("previous FINAL receives audit overlays; original cut and global stock remain immutable",()=>{
  assert.match(migration,/turno_jornada_inventario_correcciones/);
  assert.match(migration,/movimientos_intermedios_detectados/);
  assert.doesNotMatch(migration,/UPDATE\s+public\.turno_jornada_inventario_lineas\b/i);
  assert.doesNotMatch(migration,/UPDATE\s+public\.stock\b/i);
  assert.match(receiptContract,/previous FINAL correction overlay missing/);
  assert.match(receiptContract,/public\.stock changed/);
});

test("retail Jornada payment automation remains out of scope",()=>{
  assert.doesNotMatch(migration,/CuevaCoin|pago_automatico|payroll|pago_salario/i);
  assert.match(app,/VERSION="9\.5\.167"/);
  assert.match(app,/bc7-jornada-ui\.js","7\.68"/);
  assert.match(sw,/BC_SW_VERSION = "9\.5\.167"/);
});
