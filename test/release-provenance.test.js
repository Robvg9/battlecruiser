"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildReleaseManifest } = require("../scripts/write-release-manifest.js");

const root = path.join(__dirname, "..");
const deploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-pwa.yml"), "utf8");
const quality = fs.readFileSync(path.join(root, ".github/workflows/quality.yml"), "utf8");
const verifier = fs.readFileSync(path.join(__dirname, "verify-production-version.js"), "utf8");

test("release manifest records the exact source SHA, run ID, and aligned app/SW versions", () => {
  const sha = "abcdef0123456789abcdef0123456789abcdef01";
  const manifest = buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";',
    swSource: 'var BC_SW_VERSION = "9.5.16";',
    sourceSha: sha,
    workflowRunId: "39999999999",
  });
  assert.deepEqual(manifest, {
    source_sha: sha,
    app_version: "9.5.16",
    service_worker_version: "9.5.16",
    workflow_run_id: "39999999999",
  });
});

test("manifest generation rejects mismatched versions or a non-full git SHA", () => {
  assert.throws(() => buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";', swSource: 'var BC_SW_VERSION = "9.5.15";',
    sourceSha: "a".repeat(40), workflowRunId: "123",
  }), /versions differ/);
  assert.throws(() => buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";', swSource: 'var BC_SW_VERSION = "9.5.16";',
    sourceSha: "short", workflowRunId: "123",
  }), /40-character git SHA/);
});

test("production deploy generates and smoke-tests the release manifest", () => {
  assert.match(deploy, /node scripts\/write-release-manifest\.js/);
  assert.match(deploy, /release\.json\?bc_deploy_ready=/);
  assert.match(deploy, /BATTLECRUISER_PWA_LIVE_EXACT_SHA=PASS/);
  assert.match(deploy, /GITHUB_SHA/);
});

test("post-deploy Quality compares LIVE release SHA with workflow_run.head_sha", () => {
  assert.match(quality, /github\.event\.workflow_run\.head_sha/);
  assert.match(quality, /BC_EXPECTED_RELEASE_SHA/);
});

test("LIVE verifier checks source SHA and both deployed app/SW versions", () => {
  assert.match(verifier, /service-worker\.js\?bc_verify=/);
  assert.match(verifier, /release\.json\?bc_verify=/);
  assert.match(verifier, /source_sha/);
  assert.match(verifier, /expectedSha/);
  assert.match(verifier, /app\.js version mismatch/);
  assert.match(verifier, /Service Worker mismatch/);
});
