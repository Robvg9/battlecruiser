"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const jornada=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");

test("closed completed sessions expose neither operational management nor rescheduling",()=>{
  assert.match(jornada,/const isTerminal=\\['COMPLETADA','CANCELADA','CANCELADO'\\]\\.includes\\(status\\)/);
  assert.match(jornada,/\\(!rest&&!isTerminal&&r\\.sesion_id\\)/);
  assert.match(jornada,/if\\(state\\.admin&&!isTerminal\\)/);
});
test("incoming physical count never defaults to the previous employee's declared quantities",()=>{
  assert.match(jornada,/placeholder="Contar físicamente"/);
  assert.doesNotMatch(jornada,/data-bc7-receive-count=[^>]+value=/);
});
test("retroactive successor panel requires an explicit real responsible and owner activation",()=>{
  assert.match(jornada,/bc7_listar_entregas_sucesoras_pendientes/);
  assert.match(jornada,/bc7_admin_programar_sucesora_pendiente/);
  assert.match(jornada,/Selecciona la responsable real/);
  assert.match(jornada,/bc7_admin_iniciar_sucesora_retroactiva/);
  assert.match(jornada,/data-bc7-start-retro/);
});
test("PWA release keys are aligned",()=>{
  assert.match(app,/const VERSION="9\\.5\\.113"/);
  assert.match(app,/bc7-jornada-ui\\.js","7\\.31/);
  assert.match(app,/m68-ventas-pos-definitivo\\.js","9\\.5\\.113/);
  assert.match(sw,/BC_SW_VERSION = "9\\.5\\.113"/);
  assert.match(sw,/bc7-jornada-ui\\.js\\?v=7\\.31/);
  assert.match(sw,/m68-ventas-pos-definitivo\\.js\\?v=9\\.5\\.113/);
});
