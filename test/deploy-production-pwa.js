"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { writeReleaseManifest } = require("../scripts/write-release-manifest.js");

const ROOT = path.resolve(__dirname, "..");
const RESULT_DIR = path.join(ROOT, "test-results");
const LOG_PATH = path.join(RESULT_DIR, "deploy-pwa-log.txt");
const PROD_BASE = "https://battlecruiser.robvg9.workers.dev";
const WRANGLER_ROOT = process.env.BC_WRANGLER_ROOT || "D:\\Databank\\BattleCruiser-CI\\Wrangler";
const VERSION_RE = /const VERSION=["']([^"']+)["']/;
const SW_VERSION_RE = /BC_SW_VERSION\s*=\s*["']([^"']+)["']/;
let logStream;

function log(message) {
  const line = String(message);
  console.log(line);
  if (logStream) logStream.write(line + "\r\n");
}

function runNodeScript(scriptPath, args = [], options = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    env: options.env || process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeout || 12 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.stdout) log(result.stdout.trimEnd());
  if (result.stderr) log(result.stderr.trimEnd());
  if (result.error) throw new Error("Could not start Node script " + scriptPath + ": " + result.error.message);
  if (result.status !== 0) throw new Error("Node script failed (exit " + result.status + "): " + scriptPath);
  return result;
}

function findWranglerEntry() {
  const candidates = [
    path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js"),
    path.join(WRANGLER_ROOT, "node_modules", "wrangler", "bin", "wrangler.js"),
  ];
  for (const item of candidates) {
    if (fs.existsSync(item)) return item;
  }
  throw new Error("Wrangler CLI was not found in node_modules or the D: cache at " + WRANGLER_ROOT);
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.text();
  return { status: response.status, body, url: response.url };
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyLiveRelease(expected) {
  const filename = "release-" + expected.source_sha + ".json";
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const stamp = encodeURIComponent(String(process.env.GITHUB_RUN_ID) + "-" + attempt);
      const [index, app, sw, manifest] = await Promise.all([
        fetchText(PROD_BASE + "/?bc_deploy_ready=" + stamp),
        fetchText(PROD_BASE + "/app.js?bc_deploy_ready=" + stamp + "-app"),
        fetchText(PROD_BASE + "/service-worker.js?bc_deploy_ready=" + stamp + "-sw"),
        fetchText(PROD_BASE + "/" + filename + "?bc_deploy_ready=" + stamp + "-manifest"),
      ]);

      const statusesOk = [index, app, sw, manifest].every(x => x.status === 200);
      const appMatch = app.body.match(VERSION_RE);
      const swMatch = sw.body.match(SW_VERSION_RE);
      if (!statusesOk) {
        log("[deploy smoke] attempt " + attempt + "/30: statuses index=" + index.status +
          " app=" + app.status + " sw=" + sw.status + " manifest=" + manifest.status);
      } else if (!/<html\b/i.test(index.body) || !/BattleCruiser/i.test(index.body)) {
        log("[deploy smoke] attempt " + attempt + "/30: production index does not contain the expected app shell");
      } else if (!appMatch || appMatch[1] !== expected.app_version) {
        log("[deploy smoke] attempt " + attempt + "/30: app version mismatch; expected=" +
          expected.app_version + " actual=" + (appMatch && appMatch[1]));
      } else if (!swMatch || swMatch[1] !== expected.service_worker_version) {
        log("[deploy smoke] attempt " + attempt + "/30: Service Worker version mismatch; expected=" +
          expected.service_worker_version + " actual=" + (swMatch && swMatch[1]));
      } else {
        let liveManifest;
        try { liveManifest = JSON.parse(manifest.body); }
        catch (error) {
          log("[deploy smoke] attempt " + attempt + "/30: LIVE manifest JSON invalid: " + error.message);
          await delay(2000);
          continue;
        }
        const expectedFields = {
          source_sha: expected.source_sha,
          app_version: expected.app_version,
          service_worker_version: expected.service_worker_version,
          workflow_run_id: expected.workflow_run_id,
        };
        const mismatch = Object.entries(expectedFields).find(([key, value]) => String(liveManifest[key]) !== String(value));
        if (mismatch) {
          log("[deploy smoke] attempt " + attempt + "/30: LIVE manifest mismatch " + mismatch[0] +
            " expected=" + mismatch[1] + " actual=" + liveManifest[mismatch[0]]);
        } else {
          const artifactDir = path.join(RESULT_DIR, "release");
          fs.mkdirSync(artifactDir, { recursive: true });
          fs.writeFileSync(path.join(artifactDir, filename), JSON.stringify(liveManifest, null, 2) + "\n", "utf8");
          log("[deploy smoke] PASS — exact LIVE SHA=" + liveManifest.source_sha +
            " app=" + liveManifest.app_version + " service-worker=" + liveManifest.service_worker_version +
            " deploy_run=" + liveManifest.workflow_run_id);
          log("[deploy smoke] persisted LIVE-verified manifest " + filename);
          return;
        }
      }
    } catch (error) {
      log("[deploy smoke] attempt " + attempt + "/30: " + (error && error.message ? error.message : String(error)));
    }
    if (attempt < 30) await delay(2000);
  }
  throw new Error("Production did not serve the exact content-addressed release manifest and aligned PWA assets within 60 seconds.");
}

(async () => {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  logStream = fs.createWriteStream(LOG_PATH, { flags: "w" });
  let failure = null;
  try {
    const sha = String(process.env.GITHUB_SHA || "").trim().toLowerCase();
    const runId = String(process.env.GITHUB_RUN_ID || "").trim();
    const token = String(process.env.CLOUDFLARE_API_TOKEN || "");
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("GITHUB_SHA must be the full checked-out 40-character SHA.");
    if (!/^\d+$/.test(runId)) throw new Error("GITHUB_RUN_ID must be the numeric deploy run ID.");
    if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not available.");
    if (!/^\s*account_id\s*=\s*"/m.test(fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8"))) {
      throw new Error("wrangler.toml has no account_id.");
    }

    for (const required of ["public/index.html", "public/app.js", "public/service-worker.js", "wrangler.toml"]) {
      if (!fs.existsSync(path.join(ROOT, required))) throw new Error("Missing required PWA file: " + required);
    }
    const indexSource = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
    const appSource = fs.readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
    const swSource = fs.readFileSync(path.join(ROOT, "public", "service-worker.js"), "utf8");
    if (!/<html\b/i.test(indexSource) || !/BattleCruiser/i.test(indexSource)) throw new Error("public/index.html failed the shell smoke test.");
    const appMatch = appSource.match(VERSION_RE);
    const swMatch = swSource.match(SW_VERSION_RE);
    if (!appMatch || !swMatch || appMatch[1] !== swMatch[1]) throw new Error("Local app.js and Service Worker versions are missing or misaligned.");

    log("=== Deploy BattleCruiser PWA on the self-hosted Windows runner ===");
    log("Checked-out source SHA: " + sha);
    log("Expected PWA version: " + appMatch[1]);
    log("Runner storage for Wrangler cache: " + WRANGLER_ROOT);

    // Create an immutable content-addressed release manifest for this exact commit/run.
    const localManifest = writeReleaseManifest();
    if (localManifest.source_sha !== sha || localManifest.workflow_run_id !== runId) {
      throw new Error("The local release manifest does not match this deploy workflow SHA/run.");
    }

    const wranglerEntry = findWranglerEntry();
    log("[deploy] Using Wrangler CLI: " + wranglerEntry);
    runNodeScript(wranglerEntry, ["deploy", "--config", "wrangler.toml"], {
      env: process.env,
      timeout: 15 * 60 * 1000,
    });

    log("=== Smoke test production against exact release provenance ===");
    await verifyLiveRelease(localManifest);
    log("PASS BATTLECRUISER_PWA_LIVE_EXACT_SHA");
  } catch (error) {
    failure = error;
    log("FAIL production deploy/smoke: " + (error && error.stack ? error.stack : String(error)));
  } finally {
    if (logStream) {
      logStream.end();
      await new Promise(resolve => logStream.once("close", resolve));
    }
  }
  if (failure) process.exitCode = 1;
})().catch(error => {
  console.error("[deploy] unhandled failure:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
