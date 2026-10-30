"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildReleaseManifest, releaseManifestFilename } = require("../scripts/write-release-manifest.js");

const root = path.join(__dirname, "..");
const deploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-pwa.yml"), "utf8");
const deployScript = fs.readFileSync(path.join(__dirname, "deploy-production-pwa.js"), "utf8");
const quality = fs.readFileSync(path.join(root, ".github/workflows/quality.yml"), "utf8");
const selfHosted = fs.readFileSync(path.join(root, ".github/workflows/selfhosted-windows-test.yml"), "utf8");
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

test("production deploy uses standard hosted Windows and persists the exact LIVE release manifest", () => {
  assert.match(deploy, /^    runs-on: windows-latest$/m);
  assert.ok(deploy.includes("run: node test/deploy-production-pwa.js"));
  assert.ok(deploy.includes("test-results/release/release-*.json"));
  assert.ok(deploy.includes("name: battlecruiser-release-provenance-${{ github.run_id }}"));
  assert.ok(deploy.includes("test-results/deploy-pwa-log.txt"));
  assert.ok(deploy.includes("if-no-files-found: warn"));
  assert.ok(deployScript.includes("writeReleaseManifest()"));
  assert.ok(deployScript.includes('const filename = "release-" + expected.source_sha + ".json";'));
  assert.ok(deployScript.includes("PASS BATTLECRUISER_PWA_LIVE_EXACT_SHA"));
  assert.ok(deployScript.includes("workflow_run_id"));
  assert.ok(deployScript.includes("writeFileSync(path.join(artifactDir, filename)"));
  assert.ok(deployScript.includes("CLOUDFLARE_API_TOKEN"));
});

test("post-deploy Quality downloads the provenance artifact from the exact Deploy workflow_run", () => {
  assert.match(quality, /actions: read/);
  assert.match(quality, /actions\/download-artifact@v4/);
  assert.match(quality, /name: battlecruiser-release-provenance-\$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(quality, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(quality, /name: battlecruiser-release-provenance-\$\{\{ github\.event\.workflow_run\.id \}\}[\s\S]*?path: test-results\s/);
  assert.doesNotMatch(quality, /path: test-results\/release/, "download destination must preserve the artifact's release/ subfolder exactly once");
  assert.match(quality, /BC_EXPECTED_RELEASE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(quality, /BC_EXPECTED_DEPLOY_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(quality, /if: github\.event_name == 'workflow_run'/);
});

test("LIVE release verifier checks the downloaded artifact against exact SHA, versions and deploy run ID", () => {
  assert.match(verifier, /test-results", "release", releaseFilename/);
  assert.match(verifier, /source_sha: expectedSha/);
  assert.match(verifier, /workflow_run_id: expectedRunId/);
  assert.match(verifier, /EXACT_SHA=PASS/);
  assert.doesNotMatch(verifier, /request\(baseUrl \+ "\/" \+ releaseFilename/);
});

test("Chromium LIVE E2E uses the same run-bound artifact but keeps byte-exact core asset checks", () => {
  assert.match(quality, /name: battlecruiser-release-provenance-\$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(liveOfflineE2e, /path\.join\(OUTPUT_DIR, "release", releaseFilename\)/);
  assert.match(liveOfflineE2e, /workflow_run_id: expectedRunId/);
  assert.match(liveOfflineE2e, /sha256\(candidate\.body\) !== sha256\(sourceReference\)/);
  assert.doesNotMatch(liveOfflineE2e, /fetchText\(BASE_URL \+ "\/" \+ releaseFilename/);
  assert.match(liveOfflineE2e, /BC_EXPECTED_RELEASE_SHA/);
  assert.match(liveOfflineE2e, /BC_EXPECTED_DEPLOY_RUN_ID/);
  assert.match(liveOfflineE2e, /const maxAttempts = isProductionBase && isMainJs \? 30 : 4/);
  assert.match(liveOfflineE2e, /timeoutMs = 20000/);
  assert.match(liveOfflineE2e, /isProductionBase \? 20000 : 35000/);
  const suiteStep = quality.indexOf("- name: Full automated suite");
  const deployStep = quality.indexOf("- name: Deploy isolated PR preview");
  const assetsStep = quality.indexOf("- name: Wait for isolated preview assets");
  const e2eStep = quality.indexOf("- name: Run real-browser offline recovery E2E");
  assert.ok(suiteStep >= 0 && deployStep > suiteStep && assetsStep > deployStep && e2eStep > assetsStep);
  assert.match(quality, /^    runs-on: windows-latest$/m,
    "Quality must run on a standard hosted Windows runner for PR and post-deploy verification");
  assert.doesNotMatch(quality, /self-hosted|ROBVG/,
    "product Quality must not depend on the local runner");
  assert.match(selfHosted, /^    runs-on: windows-latest$/m,
    "the Windows regression suite must run independently of the local runner");
  assert.match(selfHosted, /- name: Full automated suite/,
    "the hosted Windows regression must keep the complete application suite");
  assert.match(quality, /github\.event_name == 'workflow_run' && github\.event\.workflow_run\.conclusion == 'success'/);
});

test("hosted Windows regression does not race exact-SHA release verification against deploy", () => {
  assert.match(selfHosted, /Exact LIVE SHA verification is serialized in quality\.yml's workflow_run/);
  assert.doesNotMatch(selfHosted, /node test\/verify-production-version\.js/);
});
