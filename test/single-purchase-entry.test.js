"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const purchase = read("public/js/compra-multiple.js");
const movementModal = read("public/js/hotfix-16-5-movimientos-operaciones-flotantes-20260902.js");
const index = read("public/index.html");
const app = read("public/app.js");
const serviceWorker = read("public/service-worker.js");

test("purchase registration has one user-facing route through Movimientos", () => {
  assert.equal(purchase.includes("tab.id = 'btn-tab-compras'"), false);
  assert.equal(purchase.includes("tab.dataset.tab = 'compras'"), false);
  assert.ok(purchase.includes("section.id = 'tab-compras'"));
  assert.ok(purchase.includes("compra-multiple-confirmar"));
  assert.ok(movementModal.includes("ensure('compras','Nueva Compra')"));
  assert.ok(movementModal.includes("window.__BC165_open=open"));
  assert.ok(purchase.includes("window.__BC_COMPRAS_ACTIVAR = cargarDatosYRender;"));
  assert.ok(movementModal.includes("window.__BC_COMPRAS_ACTIVAR==='function'"));
});

test("Productos hides the duplicate legacy purchase form and points to the single route", () => {
  assert.ok(index.includes('id="compra-canal-unico"'));
  assert.ok(index.includes("Movimientos → Nueva compra"));
  assert.ok(index.includes('<div id="legacy-product-purchase" class="hidden" hidden>'));
  assert.ok(index.includes('<form id="form-compra" class="inline-form">'));
  assert.ok(index.includes("#legacy-product-purchase[hidden]{display:none!important}"));
});

test("purchase and movement modal cache keys match the active release", () => {
  assert.ok(app.includes('["compra-multiple.js","27.9"]'));
  assert.ok(app.includes('["hotfix-16-5-movimientos-operaciones-flotantes-20260902.js","16.9"]'));
  const appVersion = app.match(/const VERSION=["']([^"']+)["']/);
  const workerVersion = serviceWorker.match(/BC_SW_VERSION =\\s*["']([^"']+)["']/);
  assert.ok(appVersion && workerVersion);
  assert.equal(workerVersion[1], appVersion[1]);
  assert.ok(serviceWorker.includes("./js/hotfix-16-5-movimientos-operaciones-flotantes-20260902.js?v=16.9"));
  assert.ok(index.includes('app.js?v=' + appVersion[1]));
});
