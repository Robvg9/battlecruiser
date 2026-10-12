"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const corePath = path.join(__dirname, "..", "public", "js", "core.js");

function extractNamedFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `No se encontró ${name}() en core.js`);

  const bodyStart = source.indexOf("{", start);
  assert.ok(bodyStart >= 0, `No se encontró el cuerpo de ${name}()`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if ((ch === "'" || ch === '"' || ch === "`") ) {
      quote = ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  assert.fail(`No se pudo cerrar ${name}()`);
}

function loadMoneyFromProduction() {
  const source = fs.readFileSync(corePath, "utf8");
  const fn = extractNamedFunction(source, "money");

  const sandbox = {};
  vm.runInNewContext(`this.money = ${fn}`, sandbox, {
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
