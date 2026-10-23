"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const appPath = path.join(__dirname, "..", "public", "app.js");
const swPath = path.join(__dirname, "..", "public", "service-worker.js");
const appSource = fs.readFileSync(appPath, "utf8");
const swSource = fs.readFileSync(swPath, "utf8");
const appMatch = appSource.match(/const VERSION=["']([^"']+)["']/);
const swMatch = swSource.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/);
if (!appMatch) throw new Error("Could not determine expected app version from public/app.js.");
if (!swMatch) throw new Error("Could not determine expected service-worker version from public/service-worker.js.");

const expectedAppVersion = appMatch[1];
const expectedSwVersion = swMatch[1];
if (expectedAppVersion !== expectedSwVersion) {
  throw new Error("Local release is inconsistent: app.js=" + expectedAppVersion + ", service-worker.js=" + expectedSwVersion);
}
const expectedSha = String(process.env.BC_EXPECTED_RELEASE_SHA || "").trim().toLowerCase();
if (expectedSha && !/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error("BC_EXPECTED_RELEASE_SHA must be a full 40-character commit SHA.");
}
const baseUrl = "https://battlecruiser.robvg9.workers.dev";
const PROVENANCE_RE = /BC_RELEASE_SOURCE_SHA=([0-9a-f]{40});\s*BC_RELEASE_APP_VERSION=([^;\s]+);\s*BC_RELEASE_SERVICE_WORKER_VERSION=([^;\s]+);\s*BC_RELEASE_WORKFLOW_RUN_ID=(\d+)/;

function describeError(error) {
  if (!error) return "unknown error";
  const parts = [];
  if (error.message) parts.push(error.message);
  if (error.code) parts.push("code=" + error.code);
  if (error.errno) parts.push("errno=" + error.errno);
  if (error.syscall) parts.push("syscall=" + error.syscall);
  if (error.hostname) parts.push("hostname=" + error.hostname);
  if (error.cause) parts.push("cause=" + describeError(error.cause));
  if (error.name && error.name !== "Error") parts.push("name=" + error.name);
  return parts.length ? parts.join(" | ") : String(error);
}
function requestWithHttps(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error("HTTP " + (res.statusCode || "unknown") + " for " + url));
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
  });
}
async function requestWithFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
async function request(url) {
  if (typeof fetch === "function") {
    try {
      return await requestWithFetch(url);
    } catch (fetchError) {
      try {
        return await requestWithHttps(url);
      } catch (httpsError) {
        throw new Error("fetch: " + describeError(fetchError) + "; https: " + describeError(httpsError));
      }
    }
  }
  return requestWithHttps(url);
}
function readProvenance(source, assetName) {
  const match = String(source).match(PROVENANCE_RE);
  if (!match) throw new Error("LIVE " + assetName + " is missing valid embedded release provenance.");
  return {
    source_sha: match[1].toLowerCase(),
    app_version: match[2],
    service_worker_version: match[3],
    workflow_run_id: match[4],
  };
}
async function verifyOnce(attempt) {
  const stamp = Date.now() + "-" + attempt;
  const [liveApp, liveSw] = await Promise.all([
    request(baseUrl + "/app.js?bc_verify=" + stamp + "-app"),
    request(baseUrl + "/service-worker.js?bc_verify=" + stamp + "-sw"),
  ]);
  const liveAppMatch = liveApp.match(/const VERSION=["']([^"']+)["']/);
  const liveSwMatch = liveSw.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/);
  if (!liveAppMatch) throw new Error("LIVE app.js has no readable VERSION.");
  if (!liveSwMatch) throw new Error("LIVE Service Worker has no readable BC_SW_VERSION.");
  if (liveAppMatch[1] !== expectedAppVersion) {
    throw new Error("LIVE app.js version mismatch: expected " + expectedAppVersion + ", got " + liveAppMatch[1]);
  }
  if (liveSwMatch[1] !== expectedSwVersion) {
    throw new Error("LIVE Service Worker mismatch: expected " + expectedSwVersion + ", got " + liveSwMatch[1]);
  }
  const appRelease = readProvenance(liveApp, "app.js");
  const swRelease = readProvenance(liveSw, "service-worker.js");
  if (JSON.stringify(appRelease) !== JSON.stringify(swRelease)) {
    throw new Error("LIVE app and Service Worker provenance disagree: " + JSON.stringify({appRelease, swRelease}));
  }
  if (appRelease.app_version !== expectedAppVersion || appRelease.service_worker_version !== expectedSwVersion) {
    throw new Error("LIVE embedded release versions mismatch: " + JSON.stringify({appRelease, expectedAppVersion, expectedSwVersion}));
  }
  if (expectedSha && appRelease.source_sha !== expectedSha) {
    throw new Error("LIVE source SHA mismatch: expected " + expectedSha + ", got " + appRelease.source_sha);
  }
  console.log("[production-release] PASS — app=" + expectedAppVersion + ", service-worker=" + expectedSwVersion
    + ", source_sha=" + appRelease.source_sha + ", workflow_run_id=" + appRelease.workflow_run_id);
  if (expectedSha) console.log("[production-release] EXACT_SHA=PASS");
  else console.log("[production-release] SHA observed; exact comparison omitted for manual dispatch.");
}
(async () => {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await verifyOnce(attempt);
      return;
    } catch (error) {
      console.log("[production-release] attempt " + attempt + " failed: " + describeError(error));
    }
    if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error("Production is not serving the expected app/Service Worker release provenance.");
})().catch((error) => {
  console.error("[production-release] FAIL", error);
  process.exitCode = 1;
});
