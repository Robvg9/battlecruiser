"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeTextAsset, textAssetMatches } = require("../scripts/normalize-text-asset.js");

const root = path.join(__dirname, "..");
const verifier = fs.readFileSync(path.join(root, "test/verify-production-version.js"), "utf8");

test("text asset comparison accepts LF/CRLF transport normalization only", () => {
  const source = "const a = 1;\nconst b = 2;\n";
  const windowsResponse = source.replace(/\n/g, "\r\n");
  assert.equal(normalizeTextAsset(windowsResponse), source);
  assert.equal(textAssetMatches(windowsResponse, source), true);
  assert.equal(textAssetMatches(source + "// altered\n", source), false);
});

test("production provenance verifier compares critical text assets after newline normalization", () => {
  assert.ok(verifier.includes('require("../scripts/normalize-text-asset.js")'));
  assert.ok(verifier.includes("textAssetMatches(asset.body, asset.source)"));
});
