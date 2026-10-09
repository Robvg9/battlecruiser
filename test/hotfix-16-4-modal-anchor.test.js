"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "hotfix-16-4-agregar-producto-modal-20260902.js"),
  "utf8"
);

test("BC 16.4 modal launcher inserts before a valid direct child of the product tab", () => {
  assert.match(source, /var anchor=form;while\(anchor&&anchor\.parentNode&&anchor\.parentNode!==tab\)anchor=anchor\.parentNode;/);
  assert.match(source, /if\(anchor&&anchor\.parentNode===tab\)tab\.insertBefore\(old,anchor\);else tab\.insertBefore\(old,tab\.firstChild\);/);
  assert.ok(
    !source.includes("tab.insertBefore(old,placeholder.nextSibling)"),
    "must not pass a sibling that belongs to a different parent to #tab-productos.insertBefore"
  );
});

test("BC 16.4 modal restores the form beside the placeholder in its original parent", () => {
  assert.ok(source.includes("placeholder.parentNode.insertBefore(form,placeholder.nextSibling)"));
});
