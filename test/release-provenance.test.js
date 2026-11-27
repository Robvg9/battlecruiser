"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildAssetInventory, buildReleaseManifest, collectPublicAssets, releaseManifestFilename } = require("../scripts/write-release-manifest.js");
const { extractWorkerVersionId, buildWorkerVersionBaseUrl } = require("../scripts/cloudflare-worker-version.js");

const root = path.join(__dirname, "..");
const deploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-pwa.yml"), "utf8");
const deployScript = fs.readFileSync(path.join(__dirname, "deploy-production-pwa.js"), "utf8");
const releaseWriterSource = fs.readFileSync(path.join(root, "scripts", "write-release-manifest.js"), "utf8");
const workerVersionSource = fs.readFileSync(path.join(root, "scripts", "cloudflare-worker-version.js"), "utf8");
const quality = fs.readFileSync(path.join(root, ".github/workflows/quality.yml"), "utf8");
const selfHosted = fs.readFileSync(path.join(root, ".github/workflows/selfhosted-windows-test.yml"), "utf8");
const verifier = fs.readFileSync(path.join(__dirname, "verify-production-version.js"), "utf8");
const liveOfflineE2e = fs.readFileSync(path.join(__dirname, "live-offline-e2e.js"), "utf8");

test("Cloudflare deploy smoke pins every live check to the exact Wrangler Worker Version URL", () => {
  const versionId = "e8034d32-4cc9-4e1d-b491-6458d9fd2673";
  const output = "Deployed battlecruiser triggers (0.31 sec)\\nCurrent Version ID: " + versionId;
  assert.equal(extractWorkerVersionId(output), versionId);
  assert.equal(buildWorkerVersionBaseUrl("https://battlecruiser.robvg9.workers.dev", versionId),
    "https://e8034d32-battlecruiser.robvg9.workers.dev");
  assert.throws(() => extractWorkerVersionId("Deployed without a version id"), /Current Version ID/);
  assert.throws(() => buildWorkerVersionBaseUrl("http://battlecruiser.robvg9.workers.dev", versionId), /HTTPS/);
  assert.throws(() => buildWorkerVersionBaseUrl("https://battlecruiser.robvg9.workers.dev", "bad"), /full Cloudflare UUID/);
  assert.match(workerVersionSource, /Current Version ID:/);
});

test("release manifest records exact source SHA, numeric run ID and aligned app/SW versions", () => {
  const sha = "abcdef0123456789abcdef0123456789abcdef01";
  const assetInventory = buildAssetInventory([
    { path: "index.html", content: "<html>ok</html>" },
    { path: "app.js", content: 'const VERSION="9.5.16";' },
  ]);
  const manifest = buildReleaseManifest({
    appSource: 'const VERSION="9.5.16";',
    swSource: 'var BC_SW_VERSION = "9.5.16";',
    sourceSha: sha,
    workflowRunId: "39999999999",
    assetInventory,
  });
  assert.equal(manifest.source_sha, sha);
  assert.equal(manifest.app_version, "9.5.16");
  assert.equal(manifest.service_worker_version, "9.5.16");
  assert.equal(manifest.workflow_run_id, "39999999999");
  assert.equal(manifest.asset_count, 2);
  assert.deepEqual(Object.keys(manifest.asset_inventory), ["app.js", "index.html"]);
  assert.deepEqual(manifest.asset_inventory["app.js"], {
    sha256: "57387868c142a387ccbee6fc03e7151f4c406baddeae487a39750e37e8811652",
    bytes: 23,
  });
  assert.deepEqual(manifest.asset_inventory["index.html"], {
    sha256: "b6c951ed9485262465aa9b940f7e9b7df577e3a299a33f8c86fdda98f66a9fdc",
    bytes: 15,
  });
});

test("release asset inventory is stable, complete, and excludes the generated manifest", () => {
  const entries = buildAssetInventory([
    { path: "z/icon.svg", content: "<svg/>" },
    { path: "manifest.json", content: "self-reference" },
    { path: "app.js", content: "hello" },
  ]);
  assert.deepEqual(Object.keys(entries), ["app.js", "z/icon.svg"]);
  assert.equal(entries["app.js"].bytes, 5);
  assert.equal(entries["app.js"].sha256,
    require("node:crypto").createHash("sha256").update("hello").digest("hex"));
  assert.throws(() => buildAssetInventory([{ path: "../escape.js", content: "x" }]), /Invalid public asset path/);
  assert.throws(() => buildAssetInventory([{ path: "app.js", content: "x" }, { path: "app.js", content: "y" }]), /Duplicate public asset path/);
  assert.throws(() => buildAssetInventory([]), /cannot be empty/);
});

test("asset collection reads the full public tree and excludes the PWA manifest to avoid a self-referential hash", () => {
  const inventory = collectPublicAssets(path.join(root, "public"));
  assert.ok(Object.keys(inventory).length > 100, "public inventory should cover the deployed application, not a hand-picked subset");
  for (const required of ["index.html", "app.js", "service-worker.js", "style.css", "js/core.js", "js/bc7-jornada-ui.js"]) {
    assert.ok(inventory[required], "missing public release asset " + required);
    assert.match(inventory[required].sha256, /^[0-9a-f]{64}$/);
  }
  assert.ok(!Object.keys(inventory).some(name => /^release-[0-9a-f]{40}\.json$/i.test(name) || name === "manifest.json"),
    "a generated manifest must not hash itself or prior manifests");
});

test("release provenance uses an immutable SHA-addressed JSON file and leaves the installable PWA manifest untouched", () => {
  const sha = "fedcba9876543210fedcba9876543210fedcba98";
  const otherSha = "abcdef0123456789abcdef0123456789abcdef01";
  assert.equal(releaseManifestFilename(sha), "release-" + sha + ".json");
  assert.equal(releaseManifestFilename(otherSha), "release-" + otherSha + ".json");
  assert.notEqual(releaseManifestFilename(sha), releaseManifestFilename(otherSha));
  assert.throws(() => releaseManifestFilename("short"), /40-character git SHA/);
  assert.throws(() => releaseManifestFilename("../" + "a".repeat(40)), /40-character git SHA/);
  assert.match(releaseWriterSource, /const releasePath = path\.join\(publicDir, filename\)/);
  assert.match(releaseWriterSource, /fs\.writeFileSync\(releasePath, JSON\.stringify\(manifest/);
  assert.doesNotMatch(releaseWriterSource, /embedReleaseProvenance|build_provenance|pwaManifestPath/,
    "release provenance must not overwrite the installable public/manifest.json");
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
  assert.ok(deploy.includes("test-results/release/deployment.json"));
  assert.ok(deploy.includes("name: battlecruiser-release-provenance-${{ github.run_id }}"));
  assert.ok(deploy.includes("test-results/deploy-pwa-log.txt"));
  assert.ok(deploy.includes("if-no-files-found: warn"));
  assert.ok(deployScript.includes("writeReleaseManifest()"));
  assert.ok(deployScript.includes("releaseManifestFilename(expected.source_sha)"));
  assert.ok(deployScript.includes("liveManifest = JSON.parse(manifest.body);"));
  assert.ok(deployScript.includes("LIVE release manifest invalid"));
  assert.ok(deployScript.includes("buildWorkerVersionBaseUrl(PROD_BASE, workerVersionId)"));
  assert.ok(deployScript.includes("worker_version_url: versionBaseUrl"));
  assert.ok(deployScript.includes("deployment.json"));
  assert.ok(deployScript.includes("battlecruiser-release-"));
  assert.ok(deployScript.includes("PASS BATTLECRUISER_PWA_LIVE_EXACT_SHA"));
  assert.ok(deployScript.includes("workflow_run_id"));
  assert.ok(deployScript.includes("asset_inventory"));
  assert.ok(deployScript.includes("critical_asset_SHA256=PASS"));
  assert.ok(deployScript.includes('"style.css": style.body'));
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
  assert.ok(verifier.includes("buildWorkerVersionBaseUrl(productionBaseUrl, deployment.worker_version_id)"));
  assert.ok(verifier.includes("deployment.worker_version_url"));
  assert.match(verifier, /indexFooterMatch/);
  assert.match(verifier, /EXACT_SHA=PASS/);
  assert.ok(verifier.includes("release.asset_inventory"));
  assert.ok(verifier.includes("critical text assets exact after LF/CRLF normalization"));
  assert.ok(verifier.includes("deploy smoke raw SHA/bytes=PASS"), "deploy smoke retains the byte-exact SHA-256 proof");
  assert.ok(deployScript.includes('"app.js": app.body'),
    "the deploy smoke must keep the byte-exact app.js proof");
  assert.ok(verifier.includes('const requiredAppMarkers = ['));
  assert.ok(verifier.includes('"jornada-price-changes.js"'));
  assert.ok(verifier.includes('"service-worker.js": { body: liveSw, source: swSource }'));
  assert.ok(verifier.includes('"style.css": { body: liveStyle, source: fs.readFileSync'));
  assert.doesNotMatch(verifier, /"app\\.js": liveApp/,
    "the later edge verifier uses the live app version/feature markers after the deploy smoke's byte-exact proof");
  assert.doesNotMatch(verifier, /"index\.html": liveIndex/,
    "post-deploy Quality must not compare an edge-normalized HTML response as raw source bytes");
  assert.ok(verifier.includes('class="app-shell" id="app-shell"'));
  assert.ok(verifier.includes('data-tab="jornada"'));
  assert.ok(verifier.includes('data-tab="movimientos"'));
  assert.ok(verifier.includes("Roles y Permisos"));
  assert.doesNotMatch(verifier, /request\(baseUrl \+ "\/" \+ releaseFilename/);
});


test("post-deploy verifier uses the exact no-store URL and cache-header contract as deploy smoke", () => {
  assert.ok(deployScript.includes('cache: "no-store"'));
  assert.ok(verifier.includes('cache: "no-store"'));
  assert.ok(deployScript.includes('"cache-control": "no-cache"'));
  assert.ok(verifier.includes('"cache-control": "no-cache"'));
  assert.ok(deployScript.includes('"Cloudflare-Workers-Version-Key": versionKey'));
  assert.ok(verifier.includes('"Cloudflare-Workers-Version-Key": versionAffinityKey'));
  assert.ok(deployScript.includes('"/?bc_deploy_ready=" + stamp'));
  assert.ok(verifier.includes('"/?bc_deploy_ready=" + stamp'));
  assert.ok(deployScript.includes('"/app.js?bc_deploy_ready=" + stamp + "-app"'));
  assert.ok(verifier.includes('"/app.js?bc_deploy_ready=" + stamp + "-app"'));
  assert.doesNotMatch(verifier, /bc_verify=|Expires:/,
    "the post-deploy verifier must not use a different cache key or extra cache directives");
});

test("deploy smoke and post-deploy LIVE verifier pin related requests to the same Cloudflare Worker version", () => {
  assert.ok(deployScript.includes("const workerVersionBaseUrl = buildWorkerVersionBaseUrl(PROD_BASE, workerVersionId)"));
  assert.ok(verifier.includes("const baseUrl = deployment.worker_version_url"));
  assert.doesNotMatch(deployScript + verifier, /Cloudflare-Workers-Version-Key|versionAffinityKey/);
});

test("Chromium LIVE E2E uses the same run-bound artifact but keeps byte-exact core asset checks", () => {
  assert.match(quality, /name: battlecruiser-release-provenance-\$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(liveOfflineE2e, /path\.join\(OUTPUT_DIR, "release", releaseFilename\)/);
  assert.match(liveOfflineE2e, /workflow_run_id: expectedRunId/);
  assert.ok(liveOfflineE2e.includes("releaseManifestFilename(expectedReleaseSha)"));
  assert.ok(liveOfflineE2e.includes("deployment.worker_version_url"));
  assert.ok(liveOfflineE2e.includes("deployment.json"));
  assert.doesNotMatch(liveOfflineE2e, /Cloudflare-Workers-Version-Key|LIVE_VERSION_AFFINITY_KEY/);
  assert.ok(liveOfflineE2e.includes('Fetch.enable", {'));
  assert.ok(liveOfflineE2e.includes('Fetch.continueRequest'));
  assert.doesNotMatch(liveOfflineE2e, /Network\.setExtraHTTPHeaders/,
    "LIVE version affinity must not leak to Supabase/CDN cross-origin requests");
  assert.match(liveOfflineE2e, /startupPerformanceCold/);
  assert.match(liveOfflineE2e, /startupPerformanceWarm/);
  assert.match(liveOfflineE2e, /startupPerformanceColdWarmComparison/);
  assert.match(liveOfflineE2e, /serviceWorkerController/);
  assert.match(liveOfflineE2e, /domInteractiveMs/);
  assert.match(liveOfflineE2e, /duplicateScriptPathnames/);
  assert.match(liveOfflineE2e, /scriptTransferBytes/);
  assert.match(liveOfflineE2e, /releaseCriticalAssetHashes/);
  assert.match(liveOfflineE2e, /sha256Raw/);
  assert.match(liveOfflineE2e, /fetch\(\x27\/index\.html\x27,\{cache:\x27no-store\x27\}\)/);
  assert.ok(liveOfflineE2e.includes("productionEdgeAssetCheck"));
  assert.ok(liveOfflineE2e.includes("deploy-smoke-raw-sha+edge-shell-version"));
  assert.ok(liveOfflineE2e.includes("deploy-smoke-raw-sha+edge-version-feature-markers"));
  assert.ok(liveOfflineE2e.includes("rawSha256VerifiedByExactDeploySmoke: true"));
  assert.ok(liveOfflineE2e.includes("if (!isProductionBase)"), "PR preview assets must remain source-exact");
  assert.ok(liveOfflineE2e.includes("LIVE index.html no conserva el shell"), "LIVE edge HTML must retain the versioned shell contract");
  assert.doesNotMatch(liveOfflineE2e, /fetchText\(BASE_URL \+ "\/" \+ releaseFilename/);
  assert.match(liveOfflineE2e, /BC_EXPECTED_RELEASE_SHA/);
  assert.match(liveOfflineE2e, /BC_EXPECTED_DEPLOY_RUN_ID/);
  assert.ok(liveOfflineE2e.includes('cache: "no-store"'), "LIVE E2E core asset reads must bypass stale CDN/browser caches like the deploy smoke");
  assert.match(liveOfflineE2e, /const maxAttempts = isProductionBase \? 30 : 4/);
  assert.match(liveOfflineE2e, /edgeCheck: live\.edgeCheck/);
  assert.match(liveOfflineE2e, /actualAsset && actualAsset\.edgeCheck/);
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

test("post-deploy Quality treats LIVE index.html as a shell contract while Deploy smoke retains byte-exact proof", () => {
  assert.ok(verifier.includes('const expectedIndex = release.asset_inventory["index.html"]'));
  assert.ok(verifier.includes("indexMatchesDeployArtifact"));
  assert.ok(verifier.includes("requiredShellMarkers"));
  assert.ok(verifier.includes("LIVE index.html app shell is incomplete"));
  assert.ok(verifier.includes("LIVE index.html edge body differs from deploy-verified bytes"));
  assert.ok(deployScript.includes('"index.html": index.body'));
  assert.ok(deployScript.includes("criticalMismatch"));
});
