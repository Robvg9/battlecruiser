"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildReleaseManifest, releaseManifestFilename } = require("../scripts/write-release-manifest.js");

const root = path.join(__dirname, "..");
const deploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-pwa.yml"), "utf8");
const quality = fs.readFileSync(path.join(root, ".github/workflows/quality.yml"), "utf8");
const verifier = fs.readFileSync(path.join(__dirname, "verify-production-version.js"), "utf8");
const liveOfflineE2e = fs.readFileSync(path.join(__dirname, "live-offline-e2e.js"), "utf8");

test("release manifest records exact source SHA, numeric run ID and aligned app/SW versions", () => {
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

test("content-addressed manifest URL is unique to a full commit SHA", () => {
  const sha = "fedcba9876543210fedcba9876543210fedcba98";
  assert.equal(releaseManifestFilename(sha), "release-" + sha + ".json");
  assert.throws(() => releaseManifestFilename("short"), /40-character git SHA/);
  assert.throws(() => releaseManifestFilename("../" + "a".repeat(40)), /40-character git SHA/);
});

test("manifest rejects mismatched app/SW versions, non-full SHA and invalid run ID", () => {
  assert.throws(() => buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";', swSource: 'var BC_SW_VERSION = "9.5.15";',
    sourceSha: "a".repeat(40), workflowRunId: "123",
  }), /versions differ/);
  assert.throws(() => buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";', swSource: 'var BC_SW_VERSION = "9.5.16";',
    sourceSha: "short", workflowRunId: "123",
  }), /40-character git SHA/);
  assert.throws(() => buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";', swSource: 'var BC_SW_VERSION = "9.5.16";',
    sourceSha: "a".repeat(40), workflowRunId: "not-a-run",
  }), /numeric GitHub Actions run ID/);
});

test("deploy writes and smoke-tests the unique current release manifest", () => {
  assert.match(deploy, /node scripts\/write-release-manifest\.js/);
  assert.match(deploy, /release-\$GITHUB_SHA\.json/);
  assert.match(deploy, /release-\$GITHUB_SHA\.json/);
  assert.match(deploy, /BATTLECRUISER_PWA_LIVE_EXACT_SHA=PASS/);
  assert.match(deploy, /workflow_run_id/);
});

test("post-deploy Quality compares the content-addressed manifest with workflow_run.head_sha", () => {
  assert.match(quality, /github\.event\.workflow_run\.head_sha/);
  assert.match(quality, /BC_EXPECTED_RELEASE_SHA/);
  assert.match(quality, /github\.sha/);
  assert.match(verifier, /releaseManifestFilename\(expectedSha\)/);
  assert.match(verifier, /source_sha/);
  assert.match(verifier, /EXACT_SHA=PASS/);
});

test("LIVE Chromium E2E keeps byte-for-byte source checks and verifies the content-addressed manifest", () => {
  assert.doesNotMatch(liveOfflineE2e, /normalizeReleaseStampedAsset/);
  assert.match(liveOfflineE2e, /release-" \+ expectedReleaseSha \+ "\.json/);
  assert.match(liveOfflineE2e, /sha256\(candidate\.body\) !== sha256\(sourceReference\)/);
  assert.match(liveOfflineE2e, /BC_EXPECTED_RELEASE_SHA/);
  assert.match(quality, /BC_EXPECTED_RELEASE_SHA:.*workflow_run\.head_sha/);
  assert.match(quality, /needs: \[deploy-pr-preview, quality\]/);
  assert.match(quality, /needs\.quality\.result == 'success'/);
});

test("post-deploy verifier retries content-addressed release propagation", () => {
  assert.match(verifier, /attempt <= 30/);
  assert.match(verifier, /attempt < 30/);
});
