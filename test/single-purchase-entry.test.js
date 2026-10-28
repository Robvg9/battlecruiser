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

test("purchase registration has one user-facing path through Movimientos", () => {
  assert.equal(purchase.includes("tab.id = 'btn-tab-compras'"), false,
    "the purchase module must not add a separate Compras menu tab");
  assert.equal(purchase.includes("tab.dataset.tab = 'compras'"), false,
    "the purchase module must not register a duplicate navigation route");
  assert.ok(purchase.includes("section.id = 'tab-compras'"),
    "the canonical purchase form panel must remain available for the movement modal");
  assert.ok(purchase.includes("compra-multiple-confirmar"),
    "the existing canonical multi-line purchase form must remain intact");
  assert.ok(movementModal.includes("ensure('compras','Nueva Compra')"),
    "Movimientos must keep the Nueva Compra entry point");
  assert.ok(movementModal.includes("window.__BC165_open=open"),
    "the movement modal must still be able to open the purchase panel");
});

test("Productos no longer exposes the legacy second purchase form", () => {
  assert.ok(index.includes('id="compra-canal-unico"'),
    "Productos must explain where the single purchase workflow lives");
  assert.ok(index.includes("Movimientos → Nueva compra"),
    "the guidance must send staff to the canonical purchase route");
  assert.ok(index.includes('<div id="legacy-product-purchase" class="hidden" hidden>'),
    "the legacy form must be hidden from staff but kept for compatibility");
  assert.ok(index.includes('<form id="form-compra" class="inline-form">'),
    "legacy compatibility handlers and safety tests keep their expected form");
  assert.ok(index.includes("#legacy-product-purchase[hidden]{display:none!important}"),
    "older CSS must not make the hidden legacy purchase form visible");
});

test("single purchase route cache versions match release 9.5.33", () => {
  assert.ok(app.includes('["compra-multiple.js","27.9"]'));
  assert.ok(app.includes('["hotfix-16-5-movimientos-operaciones-flotantes-20260902.js","16.8"]'));
  assert.ok(app.includes('const VERSION="9.5.33"'));
  assert.ok(serviceWorker.includes('BC_SW_VERSION = "9.5.33"'));
  assert.ok(serviceWorker.includes("./js/hotfix-16-5-movimientos-operaciones-flotantes-20260902.js?v=16.8"));
});
