"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const core = read("public/js/core.js");
const app = read("public/app.js");
const serviceWorker = read("public/service-worker.js");

function appModules() {
  const start = app.indexOf("const modules=[");
  assert.ok(start >= 0, "app.js must expose its authoritative module registry");
  const end = app.indexOf("];", start);
  assert.ok(end > start, "app.js module registry must be closed");
  return [...app.slice(start, end).matchAll(/\["([^"]+\.js)",\s*"([^"]*)"\]/g)]
    .map((match) => ({ name: match[1], version: match[2] }));
}

function precachedVersion(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = serviceWorker.match(new RegExp('"\\./js/' + escaped + '\\?v=([^"]+)"'));
  return match ? match[1] : null;
}

test("PWA loader: core.js no longer races app.js for the three versioned modules", () => {
  for (const name of ["compra-multiple.js", "movimiento-multiple.js", "inventario-detalle.js"]) {
    assert.doesNotMatch(core, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("PWA loader: app.js has one authoritative version per module", () => {
  const modules = appModules();
  const names = modules.map((item) => item.name);
  assert.equal(modules.length, 118, "unexpected change to the audited module inventory");
  assert.equal(new Set(names).size, names.length, "a module must appear once in app.js");

  const expected = {
    "compra-multiple.js": "27.16",
    "movimiento-multiple.js": "20261109.1",
    "inventario-detalle.js": "72",
  };
  for (const [name, version] of Object.entries(expected)) {
    const matches = modules.filter((item) => item.name === name);
    assert.equal(matches.length, 1, name + " must have one app.js entry");
    assert.equal(matches[0].version, version, name + " app.js version drifted");
    assert.equal(precachedVersion(name), version, name + " Service Worker precache version drifted");
  }
});

test("PWA loader: UI_READY waits for actual module load attempts and reports degraded loads", () => {
  assert.doesNotMatch(app, /setTimeout\(terminarBootUI,\s*1500\)/,
    "UI_READY must not be resolved by an optimistic 1.5 second timer");
  assert.match(app, /Promise\.all\(pendientes\)\.then\(terminarBootUI\)/,
    "UI_READY must wait for module load attempts");
  assert.match(app, /__BC_MODULE_LOAD_STATE__/,
    "module readiness diagnostics must be available to the application");
  assert.match(app, /status:"degraded"/,
    "failed or timed-out modules must produce an explicit degraded state");
  assert.match(app, /__BC_UI_READY_DEGRADED__/,
    "the degraded readiness state must be externally observable");
});

test("Service Worker: offline fallback never ignores an explicit asset version", () => {
  assert.doesNotMatch(serviceWorker, /ignoreSearch\s*:\s*true/,
    "ignoreSearch can serve bytes from an incompatible query-string version");
  const start = serviceWorker.indexOf("function cachedFallback(request)");
  const end = serviceWorker.indexOf("self.addEventListener(\"fetch\"", start);
  assert.ok(start >= 0 && end > start, "cached fallback must be testable");
  const fallback = serviceWorker.slice(start, end);
  assert.match(fallback, /cache\.match\(request\)/,
    "same-version cached assets must be matched by their full request URL");
  assert.match(fallback, /if\(url\.search\) return Response\.error\(\)/,
    "an explicitly versioned request must fail closed when that exact version is absent");
  assert.match(fallback, /candidates\.length !== 1/,
    "unversioned fallback must reject ambiguous cached pathname variants");
});
