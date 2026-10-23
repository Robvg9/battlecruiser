"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildReleaseManifest, stampReleaseHtml } = require("../scripts/write-release-manifest.js");

const root = path.join(__dirname, "..");
const deploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-pwa.yml"), "utf8");
const quality = fs.readFileSync(path.join(root, ".github/workflows/quality.yml"), "utf8");
const verifier = fs.readFileSync(path.join(__dirname, "verify-production-version.js"), "utf8");
const liveOfflineE2e = fs.readFileSync(path.join(__dirname, "live-offline-e2e.js"), "utf8");

test("release metadata binds full source SHA, run ID, and aligned app/SW versions", () => {
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

test("provenance is stamped only in index.html and normalization restores exact source bytes", () => {
  const sha = "fedcba9876543210fedcba9876543210fedcba98";
  const appSource = 'const VERSION="9.5.16";';
  const swSource = 'var BC_SW_VERSION = "9.5.16";';
  const indexSource = "<!doctype html>\n<html><body>BattleCruiser</body></html>\n";
  const stamped = stampReleaseHtml({
    indexSource, appSource, swSource, sourceSha: sha, workflowRunId: "40000000001",
  });
  assert.match(stamped.indexSource, new RegExp("BC_RELEASE_SOURCE_SHA=" + sha));
  assert.match(stamped.indexSource, /BC_RELEASE_WORKFLOW_RUN_ID=40000000001/);
  assert.equal(stamped.manifest.source_sha, sha);
  assert.equal(stamped.appSource, appSource);
  assert.equal(stamped.swSource, swSource);
  assert.equal(stamped.indexSource.replace(/\n\n<!-- BC_RELEASE_SOURCE_SHA=.*? -->\n?$/, "\n"), indexSource);
  assert.throws(() => stampReleaseHtml({
    indexSource: stamped.indexSource, appSource, swSource, sourceSha: sha, workflowRunId: "40000000001",
  }), /already contains release provenance/);
});

test("manifest generation rejects mismatched app/SW versions or a non-full source SHA", () => {
  assert.throws(() => buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";', swSource: 'var BC_SW_VERSION = "9.5.15";',
    sourceSha: "a".repeat(40), workflowRunId: "123",
  }), /versions differ/);
  assert.throws(() => buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";', swSource: 'var BC_SW_VERSION = "9.5.16";',
    sourceSha: "short", workflowRunId: "123",
  }), /40-character git SHA/);
});

test("production deploy verifies exact release SHA in index.html and ensures JS assets stay unmodified", () => {
  assert.match(deploy, /node scripts\/write-release-manifest\.js/);
  assert.match(deploy, /index\.html\?bc_deploy_ready=/);
  assert.match(deploy, /BC_RELEASE_SOURCE_SHA=\$GITHUB_SHA/);
  assert.match(deploy, /BATTLECRUISER_PWA_LIVE_EXACT_SHA=PASS/);
  assert.match(deploy, /! grep -Fq "BC_RELEASE_SOURCE_SHA=" \/tmp\/bc-live-app\.js/);
  assert.match(deploy, /! grep -Fq "BC_RELEASE_SOURCE_SHA=" \/tmp\/bc-live-sw\.js/);
});

test("post-deploy Quality compares LIVE HTML release SHA with workflow_run.head_sha", () => {
  assert.match(quality, /github\.event\.workflow_run\.head_sha/);
  assert.match(quality, /BC_EXPECTED_RELEASE_SHA/);
});

test("LIVE verifier checks exact SHA in index.html and validates app/SW versions separately", () => {
  assert.match(verifier, /index\.html\?bc_verify=/);
  assert.match(verifier, /app\.js\?bc_verify=/);
  assert.match(verifier, /service-worker\.js\?bc_verify=/);
  assert.match(verifier, /BC_RELEASE_SOURCE_SHA/);
  assert.match(verifier, /source_sha/);
  assert.match(verifier, /expectedSha/);
  assert.match(verifier, /app\.js version mismatch/);
  assert.match(verifier, /Service Worker mismatch/);
  assert.doesNotMatch(verifier, /release\.json\?bc_verify=/);
});

test("LIVE Chromium E2E normalizes only the trailing HTML marker; app and Service Worker remain byte-exact", () => {
  assert.match(liveOfflineE2e, /normalizeReleaseStampedHtml/);
  assert.match(liveOfflineE2e, /BC_RELEASE_SOURCE_SHA/);
  assert.match(liveOfflineE2e, /BC_EXPECTED_RELEASE_SHA/);
  assert.match(liveOfflineE2e, /index\.html LIVE no coincide byte a byte/);
  assert.match(liveOfflineE2e, /app\.js de LIVE no coincide byte a byte/);
  assert.match(liveOfflineE2e, /Service Worker LIVE no coincide byte a byte/);
  assert.match(liveOfflineE2e, /maxAttempts = needsCurrentReleaseStamp \? 36 : 1/);
  assert.match(quality, /BC_EXPECTED_RELEASE_SHA:.*workflow_run\.head_sha/);
  assert.match(quality, /needs: \[deploy-pr-preview, quality\]/);
  assert.match(quality, /needs\.quality\.result == 'success'/);
});

test("post-deploy exact-SHA verifier retries for edge release propagation", () => {
  assert.match(verifier, /attempt <= 30/);
  assert.match(verifier, /attempt < 30/);
});
