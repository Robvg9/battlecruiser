"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const worker = require("../preview-worker.mjs").default;

const PREVIEW_ORIGIN = "https://bc-pr-224-battlecruiser.robvg9.workers.dev";
const PRODUCTION_ORIGIN = "https://battlecruiser.robvg9.workers.dev";
const LOGIN_FUNCTION_URL = "https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-username-login";
const LOGIN_PROXY_PATH = "/__bc_preview/functions/v1/bc-username-login";

function assetsBinding() {
  return {
    fetch: async () => new Response("static asset", { status: 200 }),
  };
}

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
    headers: { Origin: PREVIEW_ORIGIN },
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
