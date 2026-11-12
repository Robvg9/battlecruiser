"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const APP = read("public/app.js");
const INDEX = read("public/index.html");
const SW = read("public/service-worker.js");
const UI = read("public/js/bc7-jornada-ui.js");

test("PWA shell pins one fresh 9.5.96 release across index, app and service worker", () => {
  assert.match(APP, /const VERSION="9\.5\.96";/);
  assert.match(INDEX, /app\.js\?v=9\.5\.96/);
  assert.match(INDEX, /app-footer-version">v9\.5\.96 — BattleCruiser/);
  assert.match(SW, /BC_SW_VERSION = "9\.5\.96"/);
  assert.match(SW, /\.\/app\.js\?v=9\.5\.96/);
});

test("PWA update notice creates its action button before binding the click", () => {
  assert.match(APP, /var button = document\.createElement\("button"\)/);
  assert.match(APP, /button\.textContent = "Actualizar ahora"/);
  assert.match(APP, /button\.addEventListener\("click"/);
  assert.match(APP, /notice\.appendChild\(button\)/);
  assert.doesNotMatch(APP, /notice\.querySelector\("button"\)\.addEventListener/);
});

test("finance refresh recognizes the authenticated active jornada as assigned", () => {
  assert.match(UI, /const activeSessionId=String\(state\.currentSession\?\.turno_sesion_id\|\|''\);/);
  assert.match(UI, /activeSessionId===String\(detail\.sesion\.id\|\|''\)/);
});

test("daily cash submission requires a server readback before clearing the idempotency key", () => {
  const start = UI.indexOf("async function submitDailyCash(form){");
  const end = UI.indexOf("async function submitSalaryRate(form){", start);
  assert.ok(start >= 0 && end > start, "submitDailyCash block exists");
  const block = UI.slice(start, end);
  assert.match(block, /state\.dailyCashData=null/);
  assert.match(block, /arr\(state\.dailyCashData\?\.entregas\)\.find/);
  assert.match(block, /Conservé la referencia para evitar duplicados/);
  assert.ok(block.indexOf("if(!confirmedRow)") < block.indexOf("form.reset()"));
  assert.ok(block.indexOf("if(!confirmedRow)") < block.indexOf("keyField.value=''"));
});

test("the last day is explained and linked to the final cash declaration", () => {
  assert.match(UI, /Último día · /);
  assert.match(UI, /data-bc7-open-final-cash/);
  assert.match(UI, /El efectivo del último día/);
  assert.match(UI, /activateWorkspaceTab\('inventario'\)/);
});
