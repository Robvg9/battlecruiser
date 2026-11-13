"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const worker = require("../preview-worker.mjs").default;
const authSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "public", "js", "auth.js"), "utf8");
const fs = require("node:fs");
const path = require("node:path");
const previewWranglerConfig = fs.readFileSync(path.join(__dirname, "..", "wrangler.preview.toml"), "utf8");
const productionWranglerConfig = fs.readFileSync(path.join(__dirname, "..", "wrangler.toml"), "utf8");

const PREVIEW_ORIGIN = "https://bc-pr-224-battlecruiser.robvg9.workers.dev";
const PRODUCTION_ORIGIN = "https://battlecruiser.robvg9.workers.dev";
const LOGIN_FUNCTION_URL = "https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-username-login";
const LOGIN_PROXY_PATH = "/__bc_preview/functions/v1/bc-username-login";
const RECOVERY_FUNCTION_URL = "https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-password-recovery-admin";
const RECOVERY_PROXY_PATH = "/__bc_preview/functions/v1/bc-password-recovery-admin";

function assetsBinding() {
  return {
    fetch: async () => new Response("static asset", { status: 200 }),
  };
}


test("preview Worker explicitly disables placement and leaves production Worker configuration untouched", () => {
  assert.match(previewWranglerConfig, /^\[placement\]\s*mode = "off"/m);
  assert.doesNotMatch(productionWranglerConfig, /^\[placement\]/m);
});

test("preview admin password recovery POST uses its own allowlisted Edge Function route", async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = null;
  let capturedInit = null;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({ accepted: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": PRODUCTION_ORIGIN },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(new Request(PREVIEW_ORIGIN + RECOVERY_PROXY_PATH, {
    method: "POST",
    headers: {
      Origin: PREVIEW_ORIGIN,
      apikey: "sb_publishable_test_only",
      authorization: "Bearer fixture-owner-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "list" }),
  }), { ASSETS: assetsBinding() });

  assert.equal(capturedUrl, RECOVERY_FUNCTION_URL);
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.get("Origin"), PRODUCTION_ORIGIN);
  assert.equal(capturedInit.headers.get("apikey"), "sb_publishable_test_only");
  assert.equal(capturedInit.headers.get("authorization"), "Bearer fixture-owner-token");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
});

test("preview admin recovery proxy rejects missing and foreign origins", async (t) => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response("unexpected", { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  for (const origin of [null, "https://attacker.example"]) {
    const headers = { apikey: "sb_publishable_test_only", "content-type": "application/json" };
    if (origin) headers.Origin = origin;
    const response = await worker.fetch(new Request(PREVIEW_ORIGIN + RECOVERY_PROXY_PATH, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "request", identifier: "sheyla" }),
    }), { ASSETS: assetsBinding() });
    assert.equal(response.status, 403);
  }
  assert.equal(upstreamCalls, 0);
});

test("preview login POST is forwarded to the existing Edge Function with the allowlisted production Origin", async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = null;
  let capturedInit = null;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({ error: "Usuario o contraseña incorrectos." }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": PRODUCTION_ORIGIN,
      },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(new Request(PREVIEW_ORIGIN + LOGIN_PROXY_PATH, {
    method: "POST",
    headers: {
      Origin: PREVIEW_ORIGIN,
      apikey: "sb_publishable_test_only",
      "content-type": "application/json",
    },
    body: JSON.stringify({ username: "fixture-user", password: "fixture-password" }),
  }), { ASSETS: assetsBinding() });

  assert.equal(capturedUrl, LOGIN_FUNCTION_URL);
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.get("Origin"), PRODUCTION_ORIGIN);
  assert.equal(capturedInit.headers.get("apikey"), "sb_publishable_test_only");
  assert.equal(capturedInit.headers.get("content-type"), "application/json");
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Usuario o contraseña incorrectos." });
});

test("preview login proxy rejects missing or foreign Origin before making an upstream request", async (t) => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response("unexpected", { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  for (const origin of [null, "https://attacker.example"]) {
    const headers = {
      apikey: "sb_publishable_test_only",
      "content-type": "application/json",
    };
    if (origin) headers.Origin = origin;
    const response = await worker.fetch(new Request(PREVIEW_ORIGIN + LOGIN_PROXY_PATH, {
      method: "POST",
      headers,
      body: JSON.stringify({ username: "x", password: "y" }),
    }), { ASSETS: assetsBinding() });
    assert.equal(response.status, 403);
  }
  assert.equal(upstreamCalls, 0);
});

test("preview GET diagnostic reaches the Edge Function without counting an auth attempt", async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedInit = null;
  globalThis.fetch = async (_url, init) => {
    capturedInit = init;
    return new Response(JSON.stringify({ error: "Método no permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(new Request(PREVIEW_ORIGIN + LOGIN_PROXY_PATH, {
    method: "GET",
  }), { ASSETS: assetsBinding() });

  assert.equal(capturedInit.method, "GET");
  assert.equal(capturedInit.headers.get("Origin"), PRODUCTION_ORIGIN);
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "Método no permitido." });
});

test("non-proxy paths remain static assets", async () => {
  const response = await worker.fetch(new Request(PREVIEW_ORIGIN + "/index.html"), {
    ASSETS: assetsBinding(),
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "static asset");
});

test("frontend uses the exact preview-only same-origin login endpoint and keeps LIVE direct", () => {
  assert.match(authSource, /function bcUsernameLoginEndpoint\(\)/);
  assert.match(authSource, /window\.location\.origin === "https:\/\/bc-pr-224-battlecruiser\.robvg9\.workers\.dev"/);
  assert.match(authSource, /\? "\/__bc_preview\/functions\/v1\/bc-username-login"/);
  assert.match(authSource, /: SUPABASE_URL \+ "\/functions\/v1\/bc-username-login"/);
  assert.equal((authSource.match(/bcUsernameLoginEndpoint\(\)/g) || []).length, 2,
    "only login must use the preview endpoint selector");
  assert.match(authSource, /bc-password-recovery-admin/);
  assert.match(authSource, /function bcPasswordRecoveryEndpoint\(\)/);
  assert.equal((authSource.match(/bcPasswordRecoveryEndpoint\(\)/g) || []).length, 3,
    "request and mandatory-change completion must route through the preview endpoint selector");
});
