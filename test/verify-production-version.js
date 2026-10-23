"use strict";

const fs = require("fs");
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

const releaseFilename = releaseManifestFilename(expectedSha);
const releasePath = path.join(process.cwd(), "test-results", "release", releaseFilename);
const baseUrl = "https://battlecruiser.robvg9.workers.dev";

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
    const req = https.get(url, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }, (res) => {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }, signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
    return await response.text();
  } finally { clearTimeout(timer); }
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
  const stamp = Date.now() + "-" + attempt;
  const [liveApp, liveSw] = await Promise.all([
    request(baseUrl + "/app.js?bc_verify=" + stamp + "-app"),
    request(baseUrl + "/service-worker.js?bc_verify=" + stamp + "-sw"),
  ]);
  const liveAppMatch = liveApp.match(/const VERSION=["']([^"']+)["']/);
  const liveSwMatch = liveSw.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/);
  if (!liveAppMatch) throw new Error("LIVE app.js has no readable VERSION.");
  if (!liveSwMatch) throw new Error("LIVE Service Worker has no readable version.");
  if (liveAppMatch[1] !== expectedAppVersion) {
    throw new Error("LIVE app.js version mismatch: expected " + expectedAppVersion + ", got " + liveAppMatch[1]);
  }
  if (liveSwMatch[1] !== expectedSwVersion) {
    throw new Error("LIVE Service Worker mismatch: expected " + expectedSwVersion + ", got " + liveSwMatch[1]);
  }

  const release = readVerifiedReleaseArtifact();
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
