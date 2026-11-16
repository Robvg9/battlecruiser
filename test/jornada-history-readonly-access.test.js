"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const ui = fs.readFileSync("public/js/bc7-jornada-ui.js", "utf8");

test("completed Jornada sessions remain openable from the calendar in read-only mode", () => {
  const start = ui.indexOf("function rowHtml(r){");
  const end = ui.indexOf("\n  async function loadHours()", start);
  assert.ok(start >= 0 && end > start, "calendar row renderer must exist");
  const row = ui.slice(start, end);
  assert.match(row, /const viewable=status==='COMPLETADA'/);
  assert.match(row, /viewable\?'Ver jornada':'Gestionar jornada'/);
  assert.match(row, /data-bc7-open=/);
  assert.match(row, /const isTerminal=\['COMPLETADA','CANCELADA','CANCELADO'\]/);
  assert.match(row, /if\(state\.admin&&!isTerminal\)/,
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
