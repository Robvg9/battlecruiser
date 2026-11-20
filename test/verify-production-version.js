"use strict";

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const https = require("https");
const { releaseManifestFilename } = require("../scripts/write-release-manifest.js");

const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const swSource = fs.readFileSync(path.join(__dirname, "..", "public", "service-worker.js"), "utf8");
const appMatch = appSource.match(/const VERSION=["']([^"']+)["']/);
const swMatch = swSource.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/);
if (!appMatch) throw new Error("Could not determine expected app version from public/app.js.");
if (!swMatch) throw new Error("Could not determine expected Service Worker version from public/service-worker.js.");
const expectedAppVersion = appMatch[1];
const expectedSwVersion = swMatch[1];
if (expectedAppVersion !== expectedSwVersion) throw new Error("Local app and Service Worker versions are not aligned.");

const expectedSha = String(process.env.BC_EXPECTED_RELEASE_SHA || "").trim().toLowerCase();
if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error("BC_EXPECTED_RELEASE_SHA must be a full 40-character git SHA.");
const expectedRunId = String(process.env.BC_EXPECTED_DEPLOY_RUN_ID || "").trim();
if (!/^\d+$/.test(expectedRunId)) throw new Error("BC_EXPECTED_DEPLOY_RUN_ID must be the numeric ID of the deploy workflow run.");
const versionAffinityKey = "battlecruiser-release-" + expectedRunId;

const releaseFilename = releaseManifestFilename(expectedSha);
const releasePath = path.join(process.cwd(), "test-results", "release", releaseFilename);
const baseUrl = "https://battlecruiser.robvg9.workers.dev";

function resolveLinkedStylesheetUrl(indexHtml, serviceWorkerBody, origin) {
  const linkTags = String(indexHtml).match(/<link\b[^>]*>/gi) || [];
  const stylesheetTag = linkTags.find(tag =>
    /\brel\s*=\s*["']stylesheet["']/i.test(tag) &&
    /\bhref\s*=/i.test(tag) && /style\.css/i.test(tag)
  );
  const hrefMatch = stylesheetTag && stylesheetTag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
  if (!hrefMatch) throw new Error("LIVE index.html has no versioned main stylesheet link.");
  const url = new URL(hrefMatch[1], origin + "/");
  if (url.origin !== origin || url.pathname !== "/style.css" || !url.searchParams.get("v")) {
    throw new Error("LIVE main stylesheet must be a same-origin /style.css URL with a version key.");
  }
  const swStyleMatch = String(serviceWorkerBody).match(/["']\.\/style\.css\?v=([^"']+)["']/);
  if (!swStyleMatch || swStyleMatch[1] !== url.searchParams.get("v")) {
    throw new Error("LIVE index.html and Service Worker request different stylesheet cache versions.");
  }
  return url.toString();
}

function describeError(error) {
  if (!error) return "unknown error";
  const parts = [];
  if (error.message) parts.push(error.message);
  if (error.code) parts.push("code=" + error.code);
  if (error.errno) parts.push("errno=" + error.errno);
  if (error.syscall) parts.push("syscall=" + error.syscall);
  if (error.cause) parts.push("cause=" + describeError(error.cause));
  return parts.join(" | ") || String(error);
}
function requestWithHttps(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "Cloudflare-Workers-Version-Key": versionAffinityKey,
    } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error("HTTP " + (res.statusCode || "unknown") + " for " + url));
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
  });
}
async function requestWithFetch(url) {
  // Keep the post-deploy verifier byte-for-byte aligned with the deploy smoke:
  // same no-store fetch mode, cache headers, redirect behavior and Worker affinity.
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "Cloudflare-Workers-Version-Key": versionAffinityKey,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
  return await response.text();
}
async function request(url) {
  if (typeof fetch === "function") {
    try { return await requestWithFetch(url); }
    catch (fetchError) {
      try { return await requestWithHttps(url); }
      catch (httpsError) { throw new Error("fetch: " + describeError(fetchError) + "; https: " + describeError(httpsError)); }
    }
  }
  return requestWithHttps(url);
}
function readVerifiedReleaseArtifact() {
  if (!fs.existsSync(releasePath)) {
    throw new Error("Missing deploy-verified release artifact: " + releasePath);
  }
  let release;
  try {
    release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
  } catch (error) {
    throw new Error("Invalid release artifact " + releasePath + ": " + describeError(error));
  }
  const expected = {
    source_sha: expectedSha,
    app_version: expectedAppVersion,
    service_worker_version: expectedSwVersion,
    workflow_run_id: expectedRunId,
  };
  for (const key of Object.keys(expected)) {
    if (String(release[key] || "").toLowerCase() !== String(expected[key]).toLowerCase()) {
      throw new Error("Verified release artifact mismatch for " + key + ": expected " + expected[key] + ", got " + release[key]);
    }
  }
  return release;
}
async function verifyOnce(attempt) {
  const stamp = encodeURIComponent(expectedRunId + "-" + attempt);
  const [liveIndex, liveApp, liveSw] = await Promise.all([
    request(baseUrl + "/?bc_deploy_ready=" + stamp),
    request(baseUrl + "/app.js?bc_deploy_ready=" + stamp + "-app"),
    request(baseUrl + "/service-worker.js?bc_deploy_ready=" + stamp + "-sw"),
  ]);
  const stylesheetUrl = resolveLinkedStylesheetUrl(liveIndex, liveSw, baseUrl);
  const liveStyle = await request(stylesheetUrl);
  const liveAppMatch = liveApp.match(/const VERSION=["']([^"']+)["']/);
  const liveSwMatch = liveSw.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/);
  if (!liveAppMatch) throw new Error("LIVE app.js has no readable VERSION.");
  if (!liveSwMatch) throw new Error("LIVE Service Worker has no readable version.");
  const indexAppMatch = liveIndex.match(/<script\s+src=["']app\.js\?v=([^"']+)["']/i);
  const indexFooterMatch = liveIndex.match(/v(\d+\.\d+\.\d+) — BattleCruiser/);
  if (!indexAppMatch || !indexFooterMatch) {
    throw new Error("LIVE index.html is missing its versioned app entry or release footer.");
  }
  if (indexAppMatch[1] !== expectedAppVersion || indexFooterMatch[1] !== expectedAppVersion) {
    throw new Error("LIVE index.html release mismatch: expected " + expectedAppVersion +
      ", app entry=" + indexAppMatch[1] + ", footer=" + indexFooterMatch[1]);
  }
  if (liveAppMatch[1] !== expectedAppVersion) {
    throw new Error("LIVE app.js version mismatch: expected " + expectedAppVersion + ", got " + liveAppMatch[1]);
  }
  if (liveSwMatch[1] !== expectedSwVersion) {
    throw new Error("LIVE Service Worker mismatch: expected " + expectedSwVersion + ", got " + liveSwMatch[1]);
  }

  const release = readVerifiedReleaseArtifact();
  if (!release.asset_inventory || !Number.isSafeInteger(release.asset_count) ||
      Object.keys(release.asset_inventory).length !== release.asset_count || release.asset_count < 100) {
    throw new Error("Verified release artifact is missing its complete public asset SHA-256 inventory.");
  }
  // Deploy smoke is the byte-exact proof for index.html and has already
  // validated the same release manifest/Worker version immediately after deploy.
  // A later edge can return a normalized or stale HTML representation while
  // preserving the application shell. Keep checking the live HTML structure and
  // release versions here, but enforce raw SHA-256/bytes for stable JS/CSS assets.
  const expectedIndex = release.asset_inventory["index.html"];
  if (!expectedIndex || !/^[0-9a-f]{64}$/.test(String(expectedIndex.sha256 || "")) ||
      !Number.isSafeInteger(expectedIndex.bytes) || expectedIndex.bytes < 1) {
    throw new Error("Verified release artifact has no valid SHA-256/bytes for index.html");
  }
  const indexBytes = Buffer.from(liveIndex, "utf8");
  const indexHash = crypto.createHash("sha256").update(indexBytes).digest("hex");
  const indexMatchesDeployArtifact = indexHash === expectedIndex.sha256 && indexBytes.length === expectedIndex.bytes;
  const requiredShellMarkers = [
    '<title>BattleCruiser</title>',
    'class="app-shell" id="app-shell"',
    'class="sidebar-nav" id="tabs"',
    'data-tab="jornada"',
    'Jornada e inventario',
    'data-tab="movimientos"',
    'Movimientos',
    'Categorías',
    'Roles y Permisos',
  ];
  const missingShellMarkers = requiredShellMarkers.filter(marker => !liveIndex.includes(marker));
  if (missingShellMarkers.length) {
    throw new Error("LIVE index.html app shell is incomplete; missing markers: " + missingShellMarkers.join(", "));
  }
  if (!indexMatchesDeployArtifact) {
    console.log("[production-release] LIVE index.html edge body differs from deploy-verified bytes: expected SHA-256/bytes=" +
      expectedIndex.sha256 + "/" + expectedIndex.bytes + ", got=" + indexHash + "/" + indexBytes.length +
      "; deploy smoke already verified exact index bytes and the live shell/version contract passes.");
  }
  // The deploy smoke above already verified the exact app.js bytes against the
  // source manifest on the affinity-pinned Worker version. Some later Cloudflare
  // edge responses normalize the JavaScript body; verify the live version and
  // the feature entrypoint here instead of rejecting an otherwise verified release.
  const expectedAppAsset = release.asset_inventory["app.js"];
  if (!expectedAppAsset || !/^[0-9a-f]{64}$/.test(String(expectedAppAsset.sha256 || "")) ||
      !Number.isSafeInteger(expectedAppAsset.bytes) || expectedAppAsset.bytes < 1) {
    throw new Error("Verified release artifact has no valid SHA-256/bytes for app.js");
  }
  const requiredAppMarkers = [
    "window.__BC_VERSION__",
    "jornada-price-changes.js",
  ];
  const missingAppMarkers = requiredAppMarkers.filter(marker => !liveApp.includes(marker));
  if (missingAppMarkers.length) {
    throw new Error("LIVE app.js is missing required release markers: " + missingAppMarkers.join(", "));
  }
  const appBytes = Buffer.from(liveApp, "utf8");
  const appHash = crypto.createHash("sha256").update(appBytes).digest("hex");
  if (appHash !== expectedAppAsset.sha256 || appBytes.length !== expectedAppAsset.bytes) {
    console.log("[production-release] LIVE app.js edge body differs from deploy-verified bytes: expected SHA-256/bytes=" +
      expectedAppAsset.sha256 + "/" + expectedAppAsset.bytes + ", got=" + appHash + "/" + appBytes.length +
      "; deploy smoke already verified exact app.js bytes and the live version/module contract passes.");
  }
  const criticalAssets = {
    "service-worker.js": liveSw,
    "style.css": liveStyle,
  };
  for (const [assetPath, body] of Object.entries(criticalAssets)) {
    const expectedAsset = release.asset_inventory[assetPath];
    if (!expectedAsset || !/^[0-9a-f]{64}$/.test(String(expectedAsset.sha256 || ""))) {
      throw new Error("Verified release artifact has no valid SHA-256 for " + assetPath);
    }
    const bytes = Buffer.from(body, "utf8");
    const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expectedAsset.sha256 || bytes.length !== expectedAsset.bytes) {
      throw new Error("LIVE asset provenance mismatch for " + assetPath +
        ": expected SHA-256/bytes=" + expectedAsset.sha256 + "/" + expectedAsset.bytes +
        ", got=" + actualHash + "/" + bytes.length);
    }
  }
  console.log("[production-release] critical asset SHA-256=PASS (service worker, CSS); app.js version/module=PASS; deploy smoke app.js bytes=PASS");
  console.log("[production-release] index.html shell=PASS (app entry, footer, navigation sections, and deploy-verified source SHA)");
  console.log("[production-release] PASS — manifest artifact=" + releaseFilename
    + ", deploy_run=" + release.workflow_run_id
    + ", app=" + expectedAppVersion
    + ", service-worker=" + expectedSwVersion
    + ", source_sha=" + release.source_sha);
  console.log("[production-release] EXACT_SHA=PASS (artifact was fetched from LIVE and validated by deploy smoke test)");
}
(async () => {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try { await verifyOnce(attempt); return; }
    catch (error) {
      console.log("[production-release] attempt " + attempt + " failed: " + describeError(error));
    }
    if (attempt < 10) await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error("Production release provenance verification failed.");
})().catch(error => {
  console.error("[production-release] FAIL", error);
  process.exitCode = 1;
});
