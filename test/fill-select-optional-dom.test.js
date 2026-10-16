"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/productos.js"), "utf8");
const match = source.match(/function fillSelect\(select, rows, valueKey, labelFn, keepFirst\) \{[\s\S]*?\n\}/);
assert.ok(match, "fillSelect helper must exist");

function makeOption() {
  return { value: "", textContent: "" };
}

const sandbox = {
  document: { createElement: makeOption }
};
vm.runInNewContext(match[0] + "\nthis.fillSelect = fillSelect;", sandbox);

test("fillSelect safely skips a missing optional DOM select", () => {
  assert.doesNotThrow(() => sandbox.fillSelect(null, [{ id: "a", nombre: "Almacén" }], "id", row => row.nombre));
});

test("fillSelect still populates an existing select", () => {
  const children = [];
  const select = {
    innerHTML: "old",
    querySelector: () => null,
    appendChild: child => children.push(child)
  };
  sandbox.fillSelect(select, [{ id: "a", nombre: "Almacén" }], "id", row => row.nombre);
  assert.equal(select.innerHTML, "");
  assert.equal(children.length, 1);
  assert.equal(children[0].value, "a");
  assert.equal(children[0].textContent, "Almacén");
});
