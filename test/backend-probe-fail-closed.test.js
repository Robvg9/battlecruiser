"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "network-core.js"), "utf8");

function createProbe(fetchImpl, online = true, options = {}) {
  const connectivity = [];
  const window = {
    sondearBackend: async function () { return true; },
    esErrorDeRed: function (error) {
      const message = String((error && (error.message || error.code || error.name)) || error || "").toLowerCase();
      return /failed to fetch|fetch failed|networkerror|network request failed|load failed|timeout|err_internet_disconnected|err_network|aborterror|network/.test(message);
    }
  };
  const sandbox = {
    window,
    navigator: { onLine: online },
    SUPABASE_URL: options.url === undefined ? "https://test-project.supabase.co" : options.url,
    SUPABASE_ANON_KEY: options.apiKey === undefined ? "test-publishable-key" : options.apiKey,
    fetch: fetchImpl,
    marcarConectividadReal: function (state) { connectivity.push(state); },
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    Error,
    TypeError,
    console: { info: function () {}, warn: function () {} }
  };
  vm.runInNewContext(source, sandbox, { filename: "network-core.js" });
  return { window, connectivity };
}

test("probe checks both Auth and Data API without depending on an owner session", async () => {
  const requests = [];
  const probe = createProbe(async function (url, init) {
    requests.push({ url, init });
    return { ok: true, status: 200 };
  });
  const result = await probe.window.sondearBackend();
  assert.equal(result, true);
  assert.equal(requests.length, 2, "Auth and Data API are checked in parallel.");
  assert.deepEqual(requests.map((r) => r.url).sort(), [
    "https://test-project.supabase.co/auth/v1/health",
    "https://test-project.supabase.co/rest/v1/"
  ].sort());
  for (const request of requests) {
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.headers.apikey, "test-publishable-key");
    assert.equal(request.init.cache, "no-store");
  }
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "online");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "response_ok");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.httpStatus, 200);
  assert.ok(["auth", "data-api"].includes(probe.window.__BC_BACKEND_PROBE__.service));
  assert.deepEqual(probe.connectivity, ["online"]);
});

test("a non-OK result records HTTP status and needs two consecutive failed probes to mark offline", async () => {
  const probe = createProbe(async function () { return { ok: false, status: 503 }; });
  assert.equal(await probe.window.sondearBackend(), false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "degraded");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "server_http_error");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.httpStatus, 503);
  assert.deepEqual(probe.connectivity, [], "One missed probe must not flip the whole app offline.");
  assert.equal(await probe.window.sondearBackend(), false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "degraded");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.consecutiveFailures, 2);
  assert.deepEqual(probe.connectivity, ["offline"]);
});

test("unexpected runtime exceptions fail closed without making a single miss equal a full outage", async () => {
  const probe = createProbe(async function () { throw new Error("Unexpected local runtime exception"); });
  assert.equal(await probe.window.sondearBackend(), false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "degraded");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "probe_error");
  assert.deepEqual(probe.connectivity, []);
  await probe.window.sondearBackend();
  assert.deepEqual(probe.connectivity, ["offline"]);
});

test("a rejected network request is degraded first and offline only after a repeat failure", async () => {
  const probe = createProbe(async function () { throw new TypeError("Failed to fetch"); });
  assert.equal(await probe.window.sondearBackend(), false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "degraded");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "network_error");
  assert.deepEqual(probe.connectivity, []);
  await probe.window.sondearBackend();
  assert.deepEqual(probe.connectivity, ["offline"]);
});

test("navigator offline is reported distinctly without making a network request", async () => {
  let called = false;
  const probe = createProbe(async function () {
    called = true;
    return { ok: true, status: 200 };
  }, false);
  const result = await probe.window.sondearBackend();
  assert.equal(result, false);
  assert.equal(called, false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "offline");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "device_offline");
  assert.deepEqual(probe.connectivity, ["offline"]);
});

test("configuration shows health probe failures without mislabeling HTTP responses", () => {
  const configSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "configuracion.js"), "utf8");
  assert.match(configSource, /probe\.reason === "server_http_error" \? "Respuesta HTTP no válida"/);
  assert.match(configSource, /probe\.reason === "probe_config_missing" \? "Sondeo sin configuración"/);
  assert.match(configSource, /probe\.reason === "probe_error" \? "Error de sondeo"/);
  assert.match(configSource, /probe\.httpStatus/);
  assert.match(configSource, /Diagnóstico sanitizado; no incluye credenciales ni tokens/);
});

test("missing public endpoint configuration fails closed", async () => {
  let called = false;
  const probe = createProbe(async function () {
    called = true;
    return { ok: true, status: 200 };
  }, true, { url: "", apiKey: "" });
  const result = await probe.window.sondearBackend();
  assert.equal(result, false);
  assert.equal(called, false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "probe_config_missing");
  assert.deepEqual(probe.connectivity, ["offline"]);
});
