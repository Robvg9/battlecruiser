"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/ventas.js"), "utf8");
const match = source.match(/function actualizarStockDisponibleUI\(\) \{[\s\S]*?\n\}/);
assert.ok(match, "actualizarStockDisponibleUI helper must exist");

function makeEnvironment(missingSelector, emptySelections = false) {
  const info = { textContent: "stale stock message", className: "msg error" };
  const quantity = {
    attributes: { max: "7" },
    removeAttribute(name) { delete this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = String(value); }
  };
  const selectors = {
    "venta-stock-disponible": info,
    "venta-cantidad": quantity,
    "venta-almacen": { value: emptySelections ? "" : "warehouse-1" },
    "venta-producto": { value: emptySelections ? "" : "product-1" }
  };
  if (missingSelector) selectors[missingSelector] = null;

  const sandbox = {
    document: {
      getElementById(id) {
        return Object.prototype.hasOwnProperty.call(selectors, id) ? selectors[id] : null;
      }
    }
  };
  vm.runInNewContext(match[0] + "\nthis.actualizarStockDisponibleUI = actualizarStockDisponibleUI;", sandbox);
  return { run: sandbox.actualizarStockDisponibleUI, info, quantity };
}

for (const missingSelector of ["venta-almacen", "venta-producto"]) {
  test(`actualizarStockDisponibleUI tolerates missing optional ${missingSelector}`, () => {
    const { run, info, quantity } = makeEnvironment(missingSelector);

    assert.doesNotThrow(run);
    assert.equal(info.textContent, "");
    assert.equal(info.className, "msg");
    assert.equal(quantity.attributes.max, undefined);
  });
}

test("actualizarStockDisponibleUI leaves empty selections safe", () => {
  const { run, info, quantity } = makeEnvironment(null, true);

  assert.doesNotThrow(run);
  assert.equal(info.textContent, "");
  assert.equal(info.className, "msg");
  assert.equal(quantity.attributes.max, undefined);
});
