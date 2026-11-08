"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const approvals = read("public/js/aprobaciones-admin.js");
const finance = read("public/js/operaciones-financieras.js");
const transfers = read("public/js/movimiento-multiple.js");

test("Baja catalog and approval requests wait for the authenticated Supabase session", () => {
  assert.match(approvals, /async function hasLiveSession\(\)/);
  assert.match(approvals, /if\(!canAdmin\(\)\|\|!\(await hasLiveSession\(\)\)\)return/);
  assert.match(approvals, /SIGNED_IN.*INITIAL_SESSION.*TOKEN_REFRESHED/);
});

test("Operations catalog refresh does not query products or warehouses as anon", () => {
  assert.match(finance, /api\.auth\.getSession\(\)/);
  assert.match(finance, /sessionPack\.data\.session\.user/);
  assert.match(finance, /SIGNED_IN.*INITIAL_SESSION.*TOKEN_REFRESHED/);
});

test("Transfer product entry retries authoritative stock when a previous read failed", () => {
  assert.match(transfers, /const needsFreshStock = navigator\.onLine && window\.__BC_STOCK_CONFIRMED__ !== true/);
  assert.match(transfers, /needsFreshStock \|\| !productos\(\)\.length/);
});
