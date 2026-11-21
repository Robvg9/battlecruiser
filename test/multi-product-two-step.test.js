"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync("public/js/" + file, "utf8");
const purchase = read("compra-multiple.js");
const transfer = read("movimiento-multiple.js");
const bajas = read("bajas-multiple.js");

test("Compra: select products first, then edit selected products and preserve presentation conversion", () => {
  assert.match(purchase, /PASO 1 DE 2/);
  assert.match(purchase, /PASO 2 DE 2/);
  assert.match(purchase, /data-compra-select/);
  assert.match(purchase, /data-compra-detail/);
  assert.match(purchase, /collectPurchaseLines/);
  assert.match(purchase, /cantidad_presentacion/);
  assert.match(purchase, /presentacion_id/);
});
test("Transferencias: select first, enter amounts second, and verify stock before commit", () => {
  assert.match(transfer, /PASO 1 DE 2/);
  assert.match(transfer, /PASO 2 DE 2/);
  assert.match(transfer, /data-mov-select/);
  assert.match(transfer, /data-mov-quantity/);
  assert.match(transfer, /collectTransferQuantities/);
  assert.match(transfer, /actualizarInventarioConfirmado\(\)/);
  assert.match(transfer, /validarStock\(/);
});
test("Bajas: select first, then quantities and reasons, retaining idempotency", () => {
  assert.match(bajas, /PASO 1 DE 2/);
  assert.match(bajas, /PASO 2 DE 2/);
  assert.match(bajas, /data-bc-bajas-select/);
  assert.match(bajas, /data-bc-baja-quantity/);
  assert.match(bajas, /persistentRequestKey/);
  assert.match(bajas, /crear_bajas_multiple/);
  assert.match(bajas, /pendingKey/);
  assert.match(bajas, /delete selectedProductIds\[String\(removedLine\.producto_id\)\]/);
});
