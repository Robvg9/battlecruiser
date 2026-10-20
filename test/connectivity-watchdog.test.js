"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "network-core.js"), "utf8");

async function flushMicrotasks() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

function createHarness(responses, options = {}) {
  const timers = new Map();
  const windowListeners = Object.create(null);
  const documentListeners = Object.create(null);
  const diagnosticEvents = [];
  let nextTimerId = 1;
  let requestCount = 0;

  function fakeSetTimeout(callback, delay) {
    const id = nextTimerId++;
    timers.set(id, { id, callback, delay: Number(delay) || 0 });
    return id;
  }
  function fakeClearTimeout(id) { timers.delete(id); }

  const win = {
    __BC_BACKEND_PROBE__: null,
    addEventListener(name, callback) { (windowListeners[name] ||= []).push(callback); },
    dispatchEvent(event) {
      diagnosticEvents.push(event.type);
      for (const callback of windowListeners[event.type] || []) callback(event);
      return true;
    },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    sondearBackend: async function () { return true; },
    esErrorDeRed: function (error) {
      const message = String((error && (error.message || error.code || error.name)) || error || "").toLowerCase();
      return /failed to fetch|fetch failed|networkerror|network request failed|load failed|timeout|err_internet_disconnected|err_network|aborterror|network/.test(message);
    }
  };
  const doc = {
    hidden: options.visible === false,
    visibilityState: options.visible === false ? "hidden" : "visible",
    addEventListener(name, callback) { (documentListeners[name] ||= []).push(callback); },
    getElementById() { return null; }
  };
  const navigator = { onLine: options.online !== false };
  const remaining = [...responses];
  const sandbox = {
    window: win,
    document: doc,
    navigator,
    SUPABASE_URL: "https://test-project.supabase.co",
    SUPABASE_ANON_KEY: "test-publishable-key",
    fetch: function (url, init) {
      requestCount += 1;
      const response = remaining.shift();
      if (typeof response === "function") return response(url, init);
      if (response instanceof Error) return Promise.reject(response);
      return Promise.resolve(response);
    },
    marcarConectividadReal: function (state) { win.__TEST_CONNECTIVITY__ = state; },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    Promise,
    Date,
    Error,
    TypeError,
    Event: class TestEvent { constructor(type) { this.type = type; } },
    console: { info() {}, warn() {} }
  };

  vm.runInNewContext(source, sandbox, { filename: "network-core.js" });

  async function advanceNextTimer() {
    const next = [...timers.values()].sort((a, b) => a.id - b.id)[0];
    assert.ok(next, "Expected a scheduled timer");
    timers.delete(next.id);
    next.callback();
    await flushMicrotasks();
    return next.delay;
  }
  function setVisible(visible) {
    doc.hidden = !visible;
    doc.visibilityState = visible ? "visible" : "hidden";
    for (const callback of documentListeners.visibilitychange || []) callback();
  }
  function emit(name) {
    for (const callback of windowListeners[name] || []) callback({ type: name });
  }

  return {
    window: win, document: doc, navigator, timers, diagnosticEvents,
    requestCount: () => requestCount, advanceNextTimer, setVisible, emit
  };
}

test("heartbeat runs in foreground at 30s and retries a failed probe with bounded 3s backoff", async () => {
  const h = createHarness([
    { ok: true, status: 200 },
    new TypeError("Failed to fetch"),
    { ok: true, status: 200 }
  ]);

  assert.equal(await h.advanceNextTimer(), 0);
  assert.equal(h.requestCount(), 1);
  assert.equal(h.window.__BC_BACKEND_PROBE__.reason, "response_ok");
  assert.equal([...h.timers.values()][0].delay, 30000);

  assert.equal(await h.advanceNextTimer(), 30000);
  assert.equal(h.requestCount(), 2);
  assert.equal(h.window.__BC_BACKEND_PROBE__.reason, "network_error");
  assert.equal([...h.timers.values()][0].delay, 3000);

  assert.equal(await h.advanceNextTimer(), 3000);
  assert.equal(h.requestCount(), 3);
  assert.equal(h.window.__BC_BACKEND_PROBE__.status, "online");
  assert.equal(h.window.__BC_BACKEND_RECOVERY_PENDING__, false);
  assert.ok(h.diagnosticEvents.includes("bc:backend-reconnected"));
});

test("heartbeat stops when hidden and resumes with an immediate real probe", async () => {
  const h = createHarness([
    { ok: true, status: 200 },
    { ok: true, status: 200 }
  ]);
  h.setVisible(false);
  assert.equal(h.timers.size, 0, "No background polling timer should survive visibility:hidden.");
  assert.equal(h.requestCount(), 0);

  h.setVisible(true);
  assert.equal([...h.timers.values()][0].delay, 0, "Resume should trigger an immediate probe.");
  await h.advanceNextTimer();
  assert.equal(h.requestCount(), 1);
  assert.equal([...h.timers.values()][0].delay, 30000);

  h.setVisible(false);
  assert.equal(h.timers.size, 0, "Hiding the PWA cancels its foreground heartbeat.");
  h.setVisible(true);
  await h.advanceNextTimer();
  assert.equal(h.requestCount(), 2);
});

test("concurrent manual and automatic probes share one HTTP request", async () => {
  let finishRequest;
  const h = createHarness([
    () => new Promise((resolve) => { finishRequest = resolve; })
  ]);
  const first = h.window.sondearBackend();
  const second = h.window.sondearBackend();
  assert.equal(h.requestCount(), 1, "Single-flight guard must prevent parallel HTTP probes.");
  finishRequest({ ok: true, status: 200 });
  assert.equal(await first, true);
  assert.equal(await second, true);
});

test("monitor documents foreground/background limits and queue recovery gating", () => {
  const offline = fs.readFileSync(path.join(__dirname, "..", "public", "js", "offline.js"), "utf8");
  const config = fs.readFileSync(path.join(__dirname, "..", "public", "js", "configuracion.js"), "utf8");
  assert.match(source, /POLL_INTERVAL_MS = 30000/);
  assert.match(source, /FIRST_RETRY_MS = 3000/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /pageshow/);
  assert.match(source, /bc:backend-reconnected/);
  assert.match(offline, /if \(!backendDisponible\)/);
  assert.match(offline, /recuperarColaTrasRespuestaConfirmada/);
  assert.match(config, /Vigilancia automática/);
});
