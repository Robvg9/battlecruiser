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
  if (appVersion !== swVersion) {
    throw new Error("App and Service Worker versions differ: " + appVersion + " != " + swVersion);
  }
  const runId = String(workflowRunId || "").trim();
  if (!/^\d+$/.test(runId)) throw new Error("workflowRunId must be a numeric GitHub Actions run ID.");
  return {
    source_sha: sha,
    app_version: appVersion,
    service_worker_version: swVersion,
    workflow_run_id: runId,
  };
}

function stampReleaseHtml({ indexSource, appSource, swSource, sourceSha, workflowRunId }) {
  const manifest = buildReleaseManifest({ appSource, swSource, sourceSha, workflowRunId });
  const html = String(indexSource);
  if (html.includes("BC_RELEASE_SOURCE_SHA=")) {
    throw new Error("index.html already contains release provenance; refusing to append a duplicate marker.");
  }
  if (String(appSource).includes("BC_RELEASE_SOURCE_SHA=") || String(swSource).includes("BC_RELEASE_SOURCE_SHA=")) {
    throw new Error("Source JavaScript already contains release provenance; refusing to stamp cached JS assets.");
  }
  const marker = "<!-- BC_RELEASE_SOURCE_SHA=" + manifest.source_sha
    + "; BC_RELEASE_APP_VERSION=" + manifest.app_version
    + "; BC_RELEASE_SERVICE_WORKER_VERSION=" + manifest.service_worker_version
    + "; BC_RELEASE_WORKFLOW_RUN_ID=" + manifest.workflow_run_id + " -->";
  return {
    manifest,
    indexSource: html.replace(/\s*$/, "") + "\n\n" + marker + "\n",
    appSource: String(appSource),
    swSource: String(swSource),
  };
}

function writeReleaseManifest() {
  const root = path.join(__dirname, "..");
  const indexPath = path.join(root, "public", "index.html");
  const appPath = path.join(root, "public", "app.js");
  const swPath = path.join(root, "public", "service-worker.js");
  const stamped = stampReleaseHtml({
    indexSource: fs.readFileSync(indexPath, "utf8"),
    appSource: fs.readFileSync(appPath, "utf8"),
    swSource: fs.readFileSync(swPath, "utf8"),
    sourceSha: process.env.GITHUB_SHA,
    workflowRunId: process.env.GITHUB_RUN_ID,
  });
  fs.writeFileSync(indexPath, stamped.indexSource, "utf8");
  console.log("[release] exact source provenance stamped in index.html (JS/SW left byte-identical): "
    + stamped.manifest.source_sha + " app=" + stamped.manifest.app_version
    + " run=" + stamped.manifest.workflow_run_id);
  return stamped.manifest;
}

if (require.main === module) {
  try { writeReleaseManifest(); }
  catch (error) {
    console.error("[release] FAIL", error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { buildReleaseManifest, stampReleaseHtml, writeReleaseManifest };
