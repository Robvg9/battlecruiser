"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const jornada = read("public/js/bc7-jornada-ui.js");
const app = read("public/app.js");
const sw = read("public/service-worker.js");

test("Jornada checkbox controls are excluded from the wide text-field rule", () => {
  assert.ok(jornada.includes('#tab-jornada .bc7-table input:not([type="checkbox"])'));
  assert.equal(jornada.includes("#tab-jornada .bc7-table input{width:96px"), false,
    "96px sizing must not apply to checkbox controls");
  assert.ok(jornada.includes('#tab-jornada .bc7-table input[type="checkbox"]{appearance:auto;width:20px;height:20px;min-width:20px;min-height:20px;max-width:20px;padding:0;margin:0;accent-color:var(--gold-bright,#c9a24d);cursor:pointer;vertical-align:middle;box-sizing:border-box}'));
});

test("Jornada checkbox revision is cache-busted in the release shell", () => {
  assert.ok(app.includes('["bc7-jornada-ui.js","7.5"]'));
  assert.ok(sw.includes("./js/bc7-jornada-ui.js?v=7.5"));
  assert.ok(app.includes('const VERSION="9.5.33"'));
  assert.ok(sw.includes('BC_SW_VERSION = "9.5.33"'));
});
