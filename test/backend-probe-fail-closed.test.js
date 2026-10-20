"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "network-core.js"), "utf8");

function createProbe(getUser, online = true) {
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
    client: { auth: { getUser } },
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

test("unexpected non-network exception fails closed instead of falsely marking backend online", async () => {
  const probe = createProbe(async function () { throw new Error("Unexpected local runtime exception"); });
  const result = await probe.window.sondearBackend();
  assert.equal(result, false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "offline");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "probe_error");
  assert.deepEqual(probe.connectivity, ["offline"]);
});

test("a returned auth error proves the server responded but does not claim an authenticated user", async () => {
  const probe = createProbe(async function () {
    return { data: { user: null }, error: { message: "Invalid JWT", status: 401 } };
  });
  const result = await probe.window.sondearBackend();
  assert.equal(result, true);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "online");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "server_responded_with_auth_error");
  assert.deepEqual(probe.connectivity, ["online"]);
});

test("a successful real auth response marks backend online", async () => {
  const probe = createProbe(async function () {
    return { data: { user: { id: "owner-test" } }, error: null };
  });
  const result = await probe.window.sondearBackend();
  assert.equal(result, true);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "online");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "response_ok");
  assert.deepEqual(probe.connectivity, ["online"]);
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
  const probe = createProbe(async function () { called = true; return { data: { user: null }, error: null }; }, false);
  const result = await probe.window.sondearBackend();
  assert.equal(result, false);
  assert.equal(called, false);
  assert.equal(probe.window.__BC_BACKEND_PROBE__.status, "offline");
  assert.equal(probe.window.__BC_BACKEND_PROBE__.reason, "device_offline");
  assert.deepEqual(probe.connectivity, ["offline"]);
});
