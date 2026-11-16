"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const ui = fs.readFileSync("public/js/turnos-maestro.js", "utf8");
const api = fs.readFileSync("public/js/turno-api.js", "utf8");

test("assigned worker can start a scheduled full-day JORNADA, including a retroactive period", () => {
  const start = ui.indexOf("const puedoIniciar =");
  const end = ui.indexOf("if (puedoIniciar)", start);
  assert.ok(start >= 0 && end > start, "scheduled-session start gate must exist");
  const gate = ui.slice(start, end);
  assert.match(gate, /se === 'PENDIENTE' \|\| se === 'PROGRAMADA'/);
  assert.match(gate, /assigned && me && String\(assigned\) === String\(me\)/);
  assert.doesNotMatch(gate, /bloque\s*!==\s*'JORNADA'/,
    "full-day sessions must not be excluded from the assigned worker start action");
  assert.match(ui, /data-tm-iniciar=/);
  assert.match(ui, /API\(\)\.iniciarSesion\(sesionId\)/);
  assert.match(api, /iniciarSesion:s=>callRpc\(RPC\.iniciarSesion,\{p_turno_sesion_id:s\}\)/);
});
