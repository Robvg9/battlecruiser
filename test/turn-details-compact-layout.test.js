"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const source = read("public/js/m33-turnos-final.js");
const app = read("public/app.js");
const sw = read("public/service-worker.js");

test("M33 keeps its five named steps while using a compact responsive grid", () => {
  assert.ok(source.includes("const titles = ['Información', 'Asignaciones', 'Movimientos', 'Inventario', 'Resumen'];"));
  assert.ok(source.includes("state.step < 5"));
  assert.ok(source.includes(".m33-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:10px;overflow:visible}"));
  assert.ok(source.includes(".m33-step{min-width:0;padding:6px 4px;text-align:center;line-height:1.2;overflow-wrap:anywhere;"));
  assert.doesNotMatch(source, /\.m33-steps\{display:flex;gap:7px;margin-top:14px;overflow:auto\}/);
});

test("M33 contains scrolling inside the dialog and reduces card and archive padding", () => {
  assert.ok(source.includes(".m33-modal{width:min(920px,100%);max-width:100%;box-sizing:border-box;max-height:94vh;max-height:94dvh;overflow:hidden"));
  assert.ok(source.includes(".m33-body{padding:12px 16px;overflow:auto;overscroll-behavior:contain;min-height:0;flex:1 1 auto}"));
  assert.ok(source.includes(".m33-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}"));
  assert.ok(source.includes(".m33-box{padding:8px 9px;"));
  assert.ok(source.includes(".m33-session{padding:7px 0;"));
  assert.ok(source.includes(".m33-archive-day{margin:6px 0;padding:8px;"));
  assert.ok(source.includes(".m33-archive-table th,.m33-archive-table td{padding:6px;"));
});

test("M33 groups session cards on desktop and stacks them on mobile", () => {
  assert.ok(source.includes(".m33-session-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;min-width:0}"));
  assert.ok(source.includes('<div class="m33-session-grid">'));
  assert.ok(source.includes(".m33-session-grid{grid-template-columns:minmax(0,1fr)}"));
  assert.ok(source.includes("@media(max-width:720px){.m33-bg{padding:6px}"));
});

test("application and Service Worker invalidate the compact turn view cache", () => {
  assert.ok(app.includes('const VERSION="9.5.33"'));
  assert.ok(sw.includes('BC_SW_VERSION = "9.5.33"'));
  assert.ok(app.includes('["m33-turnos-final.js","33.9"]'));
  assert.ok(sw.includes("./js/m33-turnos-final.js?v=33.9"));
});
