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

test("probe calls the Supabase Auth health endpoint without depending on an owner session", async () => {
  let request;
  const probe = createProbe(async function (url, init) {
    request = { url, init };
    return { ok: true, status: 200 };
  });
  const result = await probe.window.sondearBackend();
  assert.equal(result, true);
  assert.equal(request.url, "https://test-project.supabase.co/auth/v1/health");
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.headers.apikey, "test-publishable-key");
  assert.equal(request.init.cache, "no-store");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "online");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "response_ok");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.httpStatus, 200);
  assert.deepEqual(probe.connectivity, ["online"]);
});

test("a non-OK health response fails closed while recording only the HTTP status", async () => {
  const probe = createProbe(async function () { return { ok: false, status: 503 }; });
  const result = await probe.window.sondearBackend();
  assert.equal(result, false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "offline");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "server_http_error");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.httpStatus, 503);
  assert.deepEqual(probe.connectivity, ["offline"]);
});

test("unexpected non-network exceptions fail closed instead of falsely marking backend online", async () => {
  const probe = createProbe(async function () { throw new Error("Unexpected local runtime exception"); });
  const result = await probe.window.sondearBackend();
  assert.equal(result, false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "offline");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "probe_error");
  assert.deepEqual(probe.connectivity, ["offline"]);
});

test("a rejected network request remains offline", async () => {
  const probe = createProbe(async function () { throw new TypeError("Failed to fetch"); });
  const result = await probe.window.sondearBackend();
  assert.equal(result, false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "offline");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "network_error");
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
