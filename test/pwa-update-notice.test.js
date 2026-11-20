"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const APP = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const SW = fs.readFileSync(path.join(__dirname, "..", "public", "service-worker.js"), "utf8");
const start = APP.indexOf("function esVersionMasNueva(");
const end = APP.indexOf("\n  }", start) + 4;
assert.ok(start >= 0 && end > start, "app.js debe comparar versiones semánticas");
const compare = new Function(APP.slice(start, end) + "; return esVersionMasNueva;")();

test("un Service Worker igual o más antiguo no genera un aviso falso", () => {
  assert.equal(compare("9.5.132", "9.5.133"), false);
  assert.equal(compare("9.5.133", "9.5.133"), false);
  assert.equal(compare("9.5.134", "9.5.133"), true);
  assert.equal(compare("9.6.0", "9.5.133"), true);
  assert.equal(compare("desconocida", "9.5.133"), false);
  assert.equal(compare("9.5.133-rc1", "9.5.132"), false);
});

test("el aviso valida la versión antes de mostrarla y antes de activarla", () => {
  assert.match(APP, /await leerVersionEsperando\(waiting\)/);
  assert.match(APP, /esVersionMasNueva\(waitingVersion, currentVersion\)/);
  assert.match(APP, /esVersionMasNueva\(latestVersion, window\.__BC_VERSION__\)/);
  assert.match(SW, /BC_GET_VERSION/);
  assert.match(SW, /type: "BC_SW_VERSION", version: BC_SW_VERSION/);
});
