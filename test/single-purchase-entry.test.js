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
  assert.doesNotMatch(purchase, /tab\\.id\\s*=\\s*['"]btn-tab-compras['"]/,
    "the purchase module must not add a separate Compras menu tab");
  assert.doesNotMatch(purchase, /tab\\.dataset\\.tab\\s*=\\s*['"]compras['"]/,
    "the purchase module must not register a duplicate navigation route");
  assert.match(purchase, /section\\.id\\s*=\\s*['"]tab-compras['"]/,
    "the canonical purchase form panel must remain available for the movement modal");
  assert.match(purchase, /compra-multiple-confirmar/,
    "the existing canonical multi-line purchase form must remain intact");
  assert.ok(movementModal.includes("ensure('compras','Nueva Compra')"),
    "Movimientos must keep the Nueva Compra entry point");
  assert.ok(movementModal.includes("window.__BC165_open=open"),
    "the movement modal must still be able to open the purchase panel");
});

test("Productos no longer exposes the legacy second purchase form", () => {
  assert.match(index, /id="compra-canal-unico"/,
    "Productos must explain where the single purchase workflow lives");
  assert.match(index, /Movimientos → Nueva compra/,
    "the guidance must send staff to the canonical purchase route");
  assert.match(index, /<div id="legacy-product-purchase" class="hidden" hidden>[\\s\\S]*?<form id="form-compra"/,
    "keep the legacy form in the DOM for compatibility, but completely hidden from staff");
  assert.match(index, /#legacy-product-purchase\\[hidden\\]\\{display:none!important\\}/,
    "the hidden legacy purchase wrapper must not be overridden by older CSS");
});

test("single purchase route cache versions match release 9.5.32", () => {
  assert.ok(app.includes('["compra-multiple.js","27.9"]'));
  assert.ok(app.includes('["hotfix-16-5-movimientos-operaciones-flotantes-20260902.js","16.8"]'));
  assert.match(app, /const VERSION="9\\.5\\.32"/);
  assert.match(serviceWorker, /BC_SW_VERSION\\s*=\\s*"9\\.5\\.32"/);
  assert.ok(serviceWorker.includes("./js/hotfix-16-5-movimientos-operaciones-flotantes-20260902.js?v=16.8"));
});
