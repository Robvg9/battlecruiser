"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const appPath = path.join(__dirname, "..", "public", "app.js");
const appSource = fs.readFileSync(appPath, "utf8");
const match = appSource.match(/const VERSION="([^"]+)"/);
if (!match) {
  throw new Error("Could not determine expected application version from public/app.js.");
}
const expected = match[1];
const pattern = `const VERSION="${expected}"`;
const baseUrl = "https://battlecruiser.robvg9.workers.dev/app.js";

function describeError(error) {
  if (!error) return "unknown error";
  const parts = [];
  if (error.message) parts.push(error.message);
  if (error.code) parts.push(`code=${error.code}`);
  if (error.errno) parts.push(`errno=${error.errno}`);
  if (error.syscall) parts.push(`syscall=${error.syscall}`);
  if (error.hostname) parts.push(`hostname=${error.hostname}`);
  if (error.cause) parts.push(`cause=${describeError(error.cause)}`);
  if (error.name && error.name !== "Error") parts.push(`name=${error.name}`);
  return parts.length ? parts.join(" | ") : String(error);
}

function requestWithHttps(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "Cache-Control": "no-cache" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`HTTP ${res.statusCode || "unknown"}`));
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
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      // Fall through to https.get for a second diagnostic path.
      try {
        return await requestWithHttps(url);
      } catch (httpsError) {
        const combined = new Error(
          `fetch: ${describeError(fetchError)}; https: ${describeError(httpsError)}`
        );
        throw combined;
      }
    }
  }
  return requestWithHttps(url);
}

(async () => {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const url = `${baseUrl}?bc_verify=${Date.now()}-${attempt}`;
      const body = await request(url);
      if (body.includes(pattern)) {
        console.log(`[production-version] PASS — ${expected}`);
        return;
      }
      console.log(`[production-version] attempt ${attempt}: expected ${expected} not present (body length=${body.length})`);
    } catch (error) {
      console.log(`[production-version] attempt ${attempt} failed: ${describeError(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error(`Production is not serving expected version ${expected}.`);
})().catch((error) => {
  console.error("[production-version] FAIL", error);
  process.exitCode = 1;
});
