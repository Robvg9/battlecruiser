"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const ui = fs.readFileSync("public/js/bc7-jornada-ui.js", "utf8");

test("completed Jornada sessions remain openable from the calendar in read-only mode", () => {
  const marker = ui.indexOf("const isTerminal");
  assert.ok(marker >= 0, "calendar terminal-state classification must exist");
  const row = ui.slice(Math.max(0, marker - 700), marker + 900);
  assert.match(row, /const viewable=status==='COMPLETADA'/);
  assert.match(row, /viewable\?'Ver jornada':'Gestionar jornada'/);
  assert.match(row, /data-bc7-open=/);
  assert.match(row, /const isTerminal=\['COMPLETADA','CERRADA','CERRADO','CERRADA_OPERATIVAMENTE','CANCELADA','CANCELADO'\]/);
  assert.match(row, /state\.admin&&!isTerminal/,
    "rescheduling remains unavailable for completed or cancelled sessions");
});

test("opening a historical session reads server detail without writing or reopening it", () => {
  const start = ui.indexOf("async function openWorkspace(sessionId){");
  const end = ui.indexOf("\n  async function saveCount(form)", start);
  assert.ok(start >= 0 && end > start, "openWorkspace must exist");
  const open = ui.slice(start, end);
  assert.match(open, /rpc\('bc7_obtener_inventario_jornada'/);
  assert.match(open, /rpc\('bc7_estado_entrega_inventario_jornada'/);
  assert.doesNotMatch(open, /rpc\('bc7_admin_iniciar_sucesora_retroactiva'/,
    "viewing a completed historical session must not open or mutate it");
});
