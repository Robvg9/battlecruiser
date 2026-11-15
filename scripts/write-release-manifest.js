"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function extractVersion(source, pattern, label) {
  const match = String(source).match(pattern);
  if (!match) throw new Error("Could not determine " + label + ".");
  return match[1];
}

function normalizeAssetPath(assetPath) {
  const normalized = String(assetPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Invalid public asset path: " + assetPath);
  }
  return normalized;
}

function buildAssetInventory(assetFiles) {
  const inventory = {};
  const entries = Array.isArray(assetFiles) ? assetFiles.slice() : [];
  entries.sort((a, b) => String(a.path).localeCompare(String(b.path), "en"));

  for (const asset of entries) {
    const assetPath = normalizeAssetPath(asset && asset.path);
    if (/^release-[0-9a-f]{40}\.json$/i.test(path.posix.basename(assetPath))) continue;
    if (Object.prototype.hasOwnProperty.call(inventory, assetPath)) {
      throw new Error("Duplicate public asset path: " + assetPath);
    }
    const bytes = Buffer.isBuffer(asset.content)
      ? asset.content
      : Buffer.from(String(asset.content == null ? "" : asset.content), "utf8");
    inventory[assetPath] = {
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    };
  }
  if (!Object.keys(inventory).length) throw new Error("Public asset inventory cannot be empty.");
  return inventory;
}

function collectPublicAssets(publicDir) {
  const root = path.resolve(publicDir);
  const files = [];
  function walk(directory, prefix) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error("Symlinks are not allowed in the public release asset tree: " + relative);
      }
      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else if (entry.isFile() && !/^release-[0-9a-f]{40}\.json$/i.test(entry.name)) {
        files.push({ path: relative, content: fs.readFileSync(absolute) });
      }
    }
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error("Public asset directory does not exist: " + root);
  }
  walk(root, "");
  return buildAssetInventory(files);
}

function buildReleaseManifest({ appSource, swSource, sourceSha, workflowRunId, assetInventory }) {
  const sha = String(sourceSha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("sourceSha must be a full 40-character git SHA.");
  const appVersion = extractVersion(appSource, /const VERSION=["']([^"']+)["']/, "app.js version");
  const swVersion = extractVersion(swSource, /BC_SW_VERSION\s*=\s*["']([^"']+)["']/, "Service Worker version");
  if (appVersion !== swVersion) throw new Error("App and Service Worker versions differ: " + appVersion + " != " + swVersion);
  const runId = String(workflowRunId || "").trim();
  if (!/^\d+$/.test(runId)) throw new Error("workflowRunId must be a numeric GitHub Actions run ID.");
  const assets = assetInventory && Object.keys(assetInventory).length
    ? assetInventory
    : null;
  if (!assets) throw new Error("assetInventory must describe every public release asset.");
  for (const [assetPath, details] of Object.entries(assets)) {
    normalizeAssetPath(assetPath);
    if (!details || !/^[0-9a-f]{64}$/.test(String(details.sha256 || "")) ||
        !Number.isSafeInteger(details.bytes) || details.bytes < 0) {
      throw new Error("Invalid SHA-256/byte size for public asset: " + assetPath);
    }
  }
  return {
    source_sha: sha,
    app_version: appVersion,
    service_worker_version: swVersion,
    workflow_run_id: runId,
    asset_count: Object.keys(assets).length,
    asset_inventory: assets,
  };
}

function releaseManifestFilename(sourceSha) {
  const sha = String(sourceSha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("sourceSha must be a full 40-character git SHA.");
  return "release-" + sha + ".json";
}

function writeReleaseManifest() {
  const root = path.join(__dirname, "..");
  const publicDir = path.join(root, "public");
  const manifest = buildReleaseManifest({
    appSource: fs.readFileSync(path.join(publicDir, "app.js"), "utf8"),
    swSource: fs.readFileSync(path.join(publicDir, "service-worker.js"), "utf8"),
    sourceSha: process.env.GITHUB_SHA,
    workflowRunId: process.env.GITHUB_RUN_ID,
    assetInventory: collectPublicAssets(publicDir),
  });
  const filename = releaseManifestFilename(manifest.source_sha);
  fs.writeFileSync(path.join(publicDir, filename), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("[release] immutable content-addressed manifest: public/" + filename +
    " (" + manifest.asset_count + " assets with SHA-256)");
  return { ...manifest, filename, path: "public/" + filename };
}

if (require.main === module) {
  try { writeReleaseManifest(); }
  catch (error) {
    console.error("[release] FAIL", error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}
module.exports = {
  buildAssetInventory,
  buildReleaseManifest,
  collectPublicAssets,
  releaseManifestFilename,
  writeReleaseManifest,
};
