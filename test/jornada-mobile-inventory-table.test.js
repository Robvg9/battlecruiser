"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "public/service-worker.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/bc7-jornada-inventory-mobile.css"), "utf8");

test("Jornada mobile inventory loads its horizontal-table override after the base stylesheet", () => {
  const baseAt = index.indexOf('href="style.css?v=9.5.99"');
  const inventoryAt = index.indexOf('href="bc7-jornada-inventory-mobile.css?v=20261112.1"');
  assert.ok(baseAt >= 0, "the base stylesheet must remain loaded");
  assert.ok(inventoryAt > baseAt, "the Jornada override must load after the base stylesheet");
  assert.ok(sw.includes("./bc7-jornada-inventory-mobile.css?v=20261112.1"),
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
