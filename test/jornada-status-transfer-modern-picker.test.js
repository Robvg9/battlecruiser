"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assertPwaReleaseAligned, assertModuleCacheAligned } = require("./helpers/pwa-release-contract");

const ui = fs.readFileSync(path.join(__dirname, "../public/js/bc7-jornada-ui.js"), "utf8");
const transfer = fs.readFileSync(path.join(__dirname, "../public/js/movimiento-multiple.js"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(__dirname, "../public/service-worker.js"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");

test("Jornada calendar uses the requested status colors and labels", () => {
  const start = ui.indexOf("function rowHtml(r){");
  const end = ui.indexOf("async function loadCalendar()", start);
  assert.ok(start >= 0 && end > start, "calendar row renderer must exist");
  const row = ui.slice(start, end);

  assert.ok(row.includes("const isClosed=['COMPLETADA','CERRADA','CERRADO'].includes(status);"));
  assert.ok(row.includes("const isScheduled=['PROGRAMADA','PROGRAMADO','PENDIENTE'].includes(status);"));
  assert.match(row, /class="bc7-pill closed">Cerrada/);
  assert.match(row, /class="bc7-pill ok">En curso/);
  assert.match(row, /class="bc7-pill warn">Programada/);
  assert.ok(row.includes("const isTerminal=['COMPLETADA','CERRADA_OPERATIVAMENTE','CANCELADA','CANCELADO'].includes(status);"));
  assert.ok(row.includes("const viewable=status==='COMPLETADA'||isOperationallySealed;"));
  assert.ok(ui.includes(".bc7-pill.closed{color:#efaaa2;border-color:#a45353;background:rgba(164,83,83,.10)}"));
});

test("Transferencia keeps only the modern multi-product picker visible", () => {
  assert.match(transfer, /id="mov-transfer-product-picker"/);
  assert.match(transfer, /data-mov-select=/);
  assert.match(transfer, /data-mov-quantity=/);
  assert.match(transfer, /PASO 1 DE 2 · Selecciona los productos/);
  assert.match(transfer, /PASO 2 DE 2 · Cantidades/);
  assert.match(transfer, /mov-transfer-line-editor/);
  assert.ok(transfer.includes(".mov-transfer-line-editor{display:none!important}"),
    "the legacy single-product add editor must stay hidden despite the hidden attribute/CSS cascade");
  assert.match(transfer, /legacyForm\.style\.display = 'none'/,
    "the old one-product transfer form must also remain hidden");
  assert.ok(app.includes('["bc7-jornada-ui.js","7.49"]'));
  assert.ok(serviceWorker.includes("./js/bc7-jornada-ui.js?v=7.49"));
});

test("PWA release and offline module cache are aligned for the transfer UI update", () => {
  assertPwaReleaseAligned(assert, { app, serviceWorker, index });
  assertModuleCacheAligned(assert, { app, serviceWorker, moduleName: "movimiento-multiple.js" });

  const modernModule = app.indexOf('["movimiento-multiple.js","20261121.2"]');
  const transferModal = app.indexOf('["hotfix-16-5-movimientos-operaciones-flotantes-20260902.js","16.13"]');
  assert.ok(modernModule >= 0 && transferModal > modernModule,
    "the multi-product picker must initialize before the transfer modal moves it");
});
