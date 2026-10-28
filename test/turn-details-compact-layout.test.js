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

test("turn detail preserves its five-step wizard while using compact navigation", () => {
  assert.ok(source.includes("const titles = ['Información', 'Asignaciones', 'Movimientos', 'Inventario', 'Resumen'];"));
  assert.ok(source.includes("state.step < 5"));
  assert.ok(source.includes(".m33-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:10px;overflow:visible}"));
  assert.ok(source.includes(".m33-step{min-width:0;padding:6px 4px;text-align:center;line-height:1.2;overflow-wrap:anywhere;"));
});

test("turn details reduce padding and keep scrolling inside the dialog body", () => {
  assert.ok(source.includes("max-height:94vh;max-height:94dvh;overflow:hidden"));
  assert.ok(source.includes(".m33-body{padding:12px 16px;overflow:auto;overscroll-behavior:contain}"));
  assert.ok(source.includes(".m33-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}"));
  assert.ok(source.includes(".m33-box{padding:8px 9px;"));
  assert.ok(source.includes(".m33-session{padding:7px 0;"));
});

test("mobile turn details wrap steps rather than forcing horizontal scrolling", () => {
  assert.ok(source.includes("@media(max-width:720px){.m33-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.m33-steps{grid-template-columns:repeat(3,minmax(0,1fr))}"));
  assert.ok(source.includes(".m33-head{padding:10px 12px 7px}.m33-body{padding:10px 12px}.m33-foot{padding:9px 12px}"));
});

test("PWA and loader use refreshed compact turn detail cache key", () => {
  assert.ok(app.includes('["m33-turnos-final.js","33.9"]'));
  assert.ok(sw.includes("./js/m33-turnos-final.js?v=33.9"));
});
