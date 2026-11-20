"use strict";
const { assertPwaReleaseAligned } = require("./helpers/pwa-release-contract");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "public/service-worker.js"), "utf8");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/bc7-jornada-inventory-mobile.css"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.json"), "utf8"));

test("Jornada mobile inventory loads its horizontal-table override after the base stylesheet", () => {
  const { appVersion } = assertPwaReleaseAligned(assert,{app,serviceWorker:sw,index});
  const baseAt = index.indexOf('href="style.css?v=' + appVersion + '"');
  const inventoryAt = index.indexOf('href="bc7-jornada-inventory-mobile.css?v=20261116.2"');
  assert.ok(baseAt >= 0, "the base stylesheet must remain loaded");
  assert.ok(inventoryAt > baseAt, "the Jornada override must load after the base stylesheet");
  assert.ok(sw.includes("./bc7-jornada-inventory-mobile.css?v=20261116.2"),
    "the Jornada override must be precached for offline sessions");
});

test("small touch screens keep physical inventory in compact horizontal rows", () => {
  assert.match(css, /@media \(max-width: 759px\), \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /\.bc7-table-wrap[\s\S]*?overflow-x: auto !important/);
  assert.match(css, /\.bc7-count-table\s*\{[^}]*min-width: 760px !important/s);
  assert.match(css, /\.bc7-count-table thead\s*\{[^}]*display: table-header-group !important/s);
  assert.match(css, /\.bc7-count-table tbody\s*\{[^}]*display: table-row-group !important/s);
  assert.match(css, /\.bc7-count-table tbody tr\s*\{[^}]*display: table-row !important/s);
  assert.match(css, /\.bc7-count-table tbody td\s*\{[^}]*display: table-cell !important/s);
  assert.match(css, /\.bc7-count-table tbody td::before\s*\{[^}]*content: none !important/s);
  assert.match(css, /Desliza la tabla hacia los lados para ver todas las columnas/);
  assert.match(css, /\.bc7-count-table tbody td:last-child input\s*\{[^}]*min-height: 42px !important/s);
});


test("installed PWA launches the canonical root route instead of the failing index.html deep path", () => {
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(sw.includes('"./"'), "the canonical root route must remain in the app-shell precache");
});

test("Android receipt quantity field uses a single-column layout and full-width input", () => {
  assert.match(css, /@media \(max-width: 560px\), \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /\.bc7-receive-correction-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/s);
  assert.match(css, /\.bc7-receive-correction-row \.bc7-field input\s*\{[^}]*width:\s*100%/s);
});
