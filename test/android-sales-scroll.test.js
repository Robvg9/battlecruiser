"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../public/js/m68-ventas-pos-definitivo.js"),
  "utf8"
);

test("Android Sales POS releases fixed-height scroll locks", () => {
  const patchAt = source.indexOf("Android scroll recovery (Deliverable 9)");
  assert.notEqual(patchAt, -1, "mobile scroll recovery patch must remain present");

  const patch = source.slice(patchAt);
  assert.match(patch, /@media \(max-width: 1023px\), \(hover: none\) and \(pointer: coarse\)/);
  assert.match(patch, /html\.\$\{POS_CLASS\}[\s\S]*?overflow-y: auto !important/);
  assert.match(patch, /\.app-shell\.visible[\s\S]*?height: auto !important/);
  assert.match(patch, /\.main-content[\s\S]*?overflow: visible !important/);
  assert.match(patch, /#tab-ventas\.bc-pos,[\s\S]*?overflow: visible !important/);
  assert.match(patch, /#\$\{SCROLL_ID\}[\s\S]*?overflow-y: auto !important/);
  assert.match(patch, /#\$\{CART_ID\} #venta-lineas[\s\S]*?overflow-y: auto !important/);
});

test("Android Sales POS keeps the cart below the catalog in a scrollable document", () => {
  const patchAt = source.indexOf("Android scroll recovery (Deliverable 9)");
  const patch = source.slice(patchAt);
  assert.match(patch, /grid-template-areas: "topbar" "catalog" "cart" !important/);
  assert.match(patch, /touch-action: pan-y !important/);
  assert.match(patch, /-webkit-overflow-scrolling: touch/);
});
