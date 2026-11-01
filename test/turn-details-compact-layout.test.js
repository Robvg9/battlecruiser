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
const legacyLayout = read("public/js/m49-turnos-layout-definitivo.js");
const legacyInjector = read("public/js/bc14-5-turnos-manana-tarde.js");
const m22 = read("public/js/m22-sesiones-en-m21.js");
const m29 = read("public/js/m29-turnos-organizacion.js");
const turnosMaestro = read("public/js/turnos-maestro.js");
const hotfixRegresiones = read("public/js/hotfix-regresiones-20260902.js");
const hotfix174 = read("public/js/hotfix-17-4-turnos-tarde-visible-20260903.js");

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
  const appVersion = app.match(/const VERSION="([^"]+)"/);
  const workerVersion = sw.match(/BC_SW_VERSION = "([^"]+)"/);
  assert.ok(appVersion && workerVersion);
  assert.equal(workerVersion[1], appVersion[1]);
  const marker = '["m33-turnos-final.js","';
  const start = app.indexOf(marker);
  assert.ok(start >= 0, "M33 module must be registered");
  const valueStart = start + marker.length;
  const end = app.indexOf('"', valueStart);
  const moduleVersion = app.slice(valueStart, end);
  assert.ok(sw.includes("./js/m33-turnos-final.js?v=" + moduleVersion));
});


test("M33 step 2 keeps every assignment label and selector in a compact horizontal row", () => {
  assert.ok(source.includes(".m33-assignment-grid .m33-assignment-card{display:grid;grid-template-columns:minmax(84px,.56fr) minmax(0,1fr);"));
  assert.ok(source.includes(".m33-assignment-card select{width:100%;min-width:0;max-width:100%;box-sizing:border-box;margin:0!important;padding:7px 8px!important;min-height:38px;font-size:.86rem;"));
  assert.ok(source.includes('class="m33-session-grid m33-assignment-grid"'));
  assert.ok(source.includes("m33-assignment-card\"><label>Jornada · Día "));
  const marker = '["m33-turnos-final.js","';
  const start = app.indexOf(marker);
  assert.ok(start >= 0, "M33 module must be registered");
  const valueStart = start + marker.length;
  const end = app.indexOf('"', valueStart);
  const moduleVersion = app.slice(valueStart, end);
  assert.ok(sw.includes("./js/m33-turnos-final.js?v=" + moduleVersion));
});


test("M33 operational views show one daily jornada and exclude cancelled legacy rows", () => {
  assert.match(source, /const sessions = \(state\.sesiones \|\| \[\]\)\.filter\(activeSession\);/);
  assert.ok(source.includes("<span>Jornadas</span><b>' + groups.length + '</b>"));
  assert.ok(source.includes("'Jornada'"));
});

test("legacy layout modules cannot reintroduce split-shift headings or panels", () => {
  assert.match(legacyLayout, /restoreBody/);
  assert.doesNotMatch(legacyLayout, /Mañana|Tarde|Asignar la misma dependienta en cada bloque/);
  assert.match(legacyInjector, /removeObsoletePanel/);
  assert.doesNotMatch(legacyInjector, /<h4>Tarde|MANANA|TARDE|PM/);
  assert.match(m22, /return 'Jornada diaria'/);
  assert.doesNotMatch(m22, /return 'Mañana'|return 'Tarde'|Mañana \/ tarde/);
  assert.match(m22, /var visibles =/);
  assert.match(m22, /estado === 'CANCELADA' \|\| estado === 'CANCELADO'/);
  assert.match(m22, /String\(assigned\) === String\(me\)/);
  assert.match(m29, /Cada fecha trabajada contará como una sola jornada completa/);
  assert.doesNotMatch(m29, /No se crearán bloques de Mañana\/Tarde/);
  assert.match(turnosMaestro, /return 'Jornada diaria'/);
  assert.doesNotMatch(turnosMaestro, /return 'Mañana'|return 'Tarde'/);
  assert.match(turnosMaestro, /const assigned = s\.usuario_id \|\| s\.asignado_id \|\| null/);
  assert.match(turnosMaestro, /String\(assigned\) === String\(me\)/);
  assert.match(turnosMaestro, /status === 'CANCELADA' \|\| status === 'CANCELADO'/);
});


test("legacy recovery hotfixes cannot append split M33 sections", () => {
  assert.match(hotfixRegresiones, /cleanLegacyTurnoPanels/);
  assert.doesNotMatch(hotfixRegresiones, /groupHtml\('Mañana'|grouped = \\{ MAÑANA|Asignada a otra dependienta/);
  assert.match(hotfix174, /remove\(\)/);
  assert.doesNotMatch(hotfix174, /<h4>Tarde|innerHTML|hub\.open/);
});
