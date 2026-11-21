"use strict";

const fs = require("node:fs");
const path = require("node:path");

const previewName = process.env.BC_PREVIEW_NAME;
if (!previewName || !/^[a-z0-9-]+$/.test(previewName)) {
  throw new Error("BC_PREVIEW_NAME is missing or invalid.");
}
const base = "https://" + previewName + ".robvg9.workers.dev";
const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const swSource = fs.readFileSync(path.join(__dirname, "..", "public", "service-worker.js"), "utf8");
const expectedAppVersion = (appSource.match(/const VERSION="([^"]*)"/) || [])[1];
const expectedSwVersion = (swSource.match(/BC_SW_VERSION = "([^"]*)"/) || [])[1];
if (!expectedAppVersion || !expectedSwVersion) {
  throw new Error("Could not read app.js / Service Worker version from source.");
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchText(assetPath, attempt) {
  const url = base + assetPath + "?bc_preview_ready=" + attempt;
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  const body = await response.text();
  return { status: response.status, body, url: response.url };
}

async function verifyPreviewAuthProxy(functionSlug) {
  const endpoint = base + "/__bc_preview/functions/v1/" + functionSlug;
  const preflight = await fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      Origin: base,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "apikey, content-type",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (
    preflight.status !== 204 ||
    preflight.headers.get("access-control-allow-origin") !== base ||
    !String(preflight.headers.get("access-control-allow-methods") || "").includes("POST")
  ) {
    throw new Error(
      functionSlug + " preview CORS preflight failed: status=" + preflight.status +
      " allow-origin=" + String(preflight.headers.get("access-control-allow-origin") || "missing")
    );
  }

  // Safe no-credential diagnostic: the proxy must reach the real Edge Function,
  // which intentionally rejects GET with 405 before auth, rate-limit or DB work.
  const diagnostic = await fetch(endpoint, {
    method: "GET",
    headers: { Origin: base },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await diagnostic.text();
  if (diagnostic.status !== 405 || !body.includes("Método no permitido.")) {
    throw new Error(
      functionSlug + " preview proxy did not reach the expected Edge Function: status=" +
      diagnostic.status + " body=" + body.slice(0, 160)
    );
  }
  console.log("[preview-auth] PASS — " + functionSlug + " CORS proxy + upstream route");
}

async function verifyPreviewAuthProxies() {
  await Promise.all([
    verifyPreviewAuthProxy("bc-username-login"),
    verifyPreviewAuthProxy("bc-password-recovery-admin"),
  ]);
}

(async () => {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const [index, app, sw] = await Promise.all([
        fetchText("/index.html", attempt),
        fetchText("/app.js", attempt),
        fetchText("/service-worker.js", attempt),
      ]);
      const aligned =
        index.status === 200 &&
        app.status === 200 &&
        sw.status === 200 &&
        app.body.includes('const VERSION="' + expectedAppVersion + '"') &&
        sw.body.includes('BC_SW_VERSION = "' + expectedSwVersion + '"');
      if (aligned) {
        console.log(
          "[preview] PASS — index.html, app.js and Service Worker HTTP 200; app=" +
          expectedAppVersion + " sw=" + expectedSwVersion
        );
        await verifyPreviewAuthProxies();
        // Return normally so Undici/Node can close completed fetch sockets cleanly.
        return;
      }
      console.log(
        "[preview] attempt " + attempt + "/30: index=" + index.status +
        " app=" + app.status + " service-worker=" + sw.status +
        " expected app=" + expectedAppVersion + " sw=" + expectedSwVersion
      );
    } catch (error) {
      console.log("[preview] attempt " + attempt + "/30: " + (error?.message || String(error)));
    }
    await delay(2000);
  }
  throw new Error("Preview assets or authenticated Edge Function proxy failed within 60 seconds.");
})().catch((error) => {
  console.error("[preview] FAIL:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
