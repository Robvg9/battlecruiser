"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const ui = fs.readFileSync("public/js/bc7-jornada-ui.js", "utf8");

test("Jornada pending transfer review exposes each transfer line independently", () => {
  assert.match(ui, /data-bc7-transfer-line-select=/);
  assert.match(ui, /line\.transferencia_linea_id/);
  assert.match(ui, /Atribuir líneas seleccionadas/);
  assert.match(ui, /p_transferencia_linea_ids:selectedLineIds/);
});

test("Jornada preview uses the same line-scoped attribution contract", () => {
  assert.match(ui, /group\.lines\.push\(\{id:item\.transferencia_linea_id/);
  assert.match(ui, /group\.lines\.map\(line=>'<tr><td><input type="checkbox"/);
  assert.match(ui, /bc7_vincular_lineas_transferencia_jornada/);
});

test("No UI path can still invoke whole-transfer retroactive attribution", () => {
  assert.doesNotMatch(ui, /rpc\('bc7_vincular_transferencia_jornada'/);
});

test("Jornada module, loader and Service Worker share the line-attribution release key", () => {
  const app = fs.readFileSync("public/app.js", "utf8");
  const sw = fs.readFileSync("public/service-worker.js", "utf8");
  assert.match(ui, /^\/\/ v7\.66/m);
  assert.match(app, /\["bc7-jornada-ui\.js","7\.66"\]/);
  assert.match(sw, /bc7-jornada-ui\.js\?v=7\.66/);
});
