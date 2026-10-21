"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(ROOT, "public/js/configuracion-ajustes-migrados-20260903.js"),
  "utf8"
);

test("preference switches expose accessible names and descriptions", () => {
  assert.match(source, /role=\\\"switch\\\"/);
  assert.match(source, /aria-label=\\\"/);
  assert.match(source, /aria-describedby=\\\"/);
  assert.match(source, /aria-checked=\\\"false\\\"/);
  assert.match(source, /<small id=\\\".*-help\\\">/);
  assert.match(source, /<span aria-hidden=\\\"true\\\"><\/span>/);
});

test("preference switch checked state follows persisted local preference values", () => {
  assert.match(source, /input\.checked = !!prefs\[mapping\[id\]\]/);
  assert.match(source, /input\.setAttribute\("aria-checked", String\(input\.checked\)\)/);
  assert.match(source, /prefs\[key\] = input\.checked;\s*input\.setAttribute\("aria-checked", String\(input\.checked\)\)/);
});

test("native switch inputs retain a real accessible hit target and keyboard focus", () => {
  assert.match(source, /\.cfg-aj-toggle input\{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:2\}/);
  assert.match(source, /\.cfg-aj-toggle span\{[^}]*pointer-events:none\}/);
  assert.match(source, /\.cfg-aj-toggle input:focus-visible\+span\{outline:2px solid var\(--gold-bright\);outline-offset:3px\}/);
});
test("all six preference switches remain connected to their existing preference keys", () => {
  for (const entry of [
    ['cfg-aj-auto-refresh', 'autoRefresh', 'Actualización automática'],
    ['cfg-aj-sync-auto', 'syncAuto', 'Sincronización automática'],
    ['cfg-aj-sync-open', 'syncOnOpen', 'Sincronizar al abrir app'],
    ['cfg-aj-sync-wifi', 'syncWifiOnly', 'Sincronizar solo en Wi‑Fi'],
    ['cfg-aj-notify', 'notifications', 'Notificaciones'],
    ['cfg-aj-compact', 'compacto', 'Modo compacto']
  ]) {
    const [id, key, label] = entry;
    assert.ok(source.includes('rowToggle("' + id + '", "' + label + '"'), 'missing switch: ' + id);
    assert.ok(source.includes('"' + id + '": "' + key + '"'), 'missing preference mapping: ' + id);
  }
});
