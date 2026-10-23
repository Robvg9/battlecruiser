"use strict";
const fs = require("fs");
const path = require("path");

function extractVersion(source, pattern, label) {
  const match = String(source).match(pattern);
  if (!match) throw new Error("Could not determine " + label + ".");
  return match[1];
}
function buildReleaseManifest({ appSource, swSource, sourceSha, workflowRunId }) {
  const sha = String(sourceSha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("sourceSha must be a full 40-character git SHA.");
  const appVersion = extractVersion(appSource, /const VERSION=["']([^"']+)["']/, "app.js version");
  const swVersion = extractVersion(swSource, /BC_SW_VERSION\s*=\s*["']([^"']+)["']/, "Service Worker version");
  if (appVersion !== swVersion) throw new Error("App and Service Worker versions differ: " + appVersion + " != " + swVersion);
  const runId = String(workflowRunId || "").trim();
  if (!/^\d+$/.test(runId)) throw new Error("workflowRunId must be a numeric GitHub Actions run ID.");
  return { source_sha: sha, app_version: appVersion, service_worker_version: swVersion, workflow_run_id: runId };
}
function releaseManifestFilename(sourceSha) {
  const sha = String(sourceSha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("sourceSha must be a full 40-character git SHA.");
  return "release-" + sha + ".json";
}
function writeReleaseManifest() {
  const root = path.join(__dirname, "..");
  const manifest = buildReleaseManifest({
    appSource: fs.readFileSync(path.join(root, "public", "app.js"), "utf8"),
    swSource: fs.readFileSync(path.join(root, "public", "service-worker.js"), "utf8"),
    sourceSha: process.env.GITHUB_SHA,
    workflowRunId: process.env.GITHUB_RUN_ID,
  });
  const filename = releaseManifestFilename(manifest.source_sha);
  fs.writeFileSync(path.join(root, "public", filename), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("[release] immutable content-addressed manifest: public/" + filename);
  return { ...manifest, filename, path: "public/" + filename };
}
if (require.main === module) {
  try { writeReleaseManifest(); }
  catch (error) {
    console.error("[release] FAIL", error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}
module.exports = { buildReleaseManifest, releaseManifestFilename, writeReleaseManifest };
