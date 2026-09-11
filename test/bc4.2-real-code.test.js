"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const corePath = path.join(__dirname, "..", "public", "js", "core.js");

function loadMoneyFromProduction() {
  const source = fs.readFileSync(corePath, "utf8");
  const match = source.match(/function money\(n\)\{([\s\S]*?)\}\nfunction fechaCorta/);
  assert.ok(match, "No se encontró money() en core.js");

  const sandbox = {};
  vm.runInNewContext(`this.money = function money(n){${match[1]}}`, sandbox, {
    filename: "core.js:money",
  });
  return sandbox.money;
}

test("BC-4.2: money nunca expone -0.00", () => {
  const money = loadMoneyFromProduction();

  assert.equal(money(-0.001), "0.00");
  assert.equal(money(-0), "0.00");
  assert.equal(money(0), "0.00");
  assert.equal(money(0.0049), "0.00");
  assert.equal(money(0.005), "0.01");
  assert.equal(money(-12.345), "-12.35");
  assert.equal(money("abc"), "0.00");
});
