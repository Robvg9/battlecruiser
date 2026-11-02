"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Step 11: production money() normalizes negative zero and tiny magnitudes", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "core.js"), "utf8");
  const match = source.match(/function money\\(n\\)\\{[^}]*\\}/);
  assert.ok(match, "production money() must exist in core.js");

  const sandbox = {};
  vm.runInNewContext("this.money = " + match[0], sandbox, { filename: "core.js:money" });
  const money = sandbox.money;

  assert.equal(money(-0.001), "0.00");
  assert.equal(money(-0), "0.00");
  assert.equal(money(0), "0.00");
  assert.equal(money(0.0049), "0.00");
  assert.equal(money(0.005), "0.01");
  assert.equal(money(-12.345), "-12.35");
  assert.equal(money("abc"), "0.00");
});
