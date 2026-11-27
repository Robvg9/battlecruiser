"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const offline = read("public/js/offline.js");
const permissions = read("public/js/usuarios-permisos.js");
const style = read("public/style.css");
const indexHtml = read("public/index.html");
const serviceWorker = read("public/service-worker.js");
const app = read("public/app.js");

function loadingOwnerSource() {
  const start = offline.indexOf("let loadingCount = 0;");
  const end = offline.indexOf("// Sondeo real al backend", start);
  assert.ok(start >= 0 && end > start, "offline.js must keep one identifiable loading owner");
  return offline.slice(start, end);
}

test("global loading overlay follows the reference count and actually hides", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://battlecruiser.test/",
    runScripts: "outside-only",
  });
  const w = dom.window;

  w.eval(loadingOwnerSource());
  assert.equal(typeof w.showLoading, "function");
  assert.equal(typeof w.hideLoading, "function");
  assert.equal(typeof w.resetLoadingOverlay, "function");
  assert.equal(w.__bcLoadingCount(), 0);

  w.showLoading();
  const overlay = w.document.getElementById("global-loading-overlay");
  assert.ok(overlay, "showLoading creates the overlay");
  assert.equal(overlay.style.display, "flex");
  assert.ok(overlay.classList.contains("visible"));
  assert.equal(w.__bcLoadingCount(), 1);

  w.showLoading();
  assert.equal(w.__bcLoadingCount(), 2);
  w.hideLoading();
  assert.equal(overlay.style.display, "flex", "one caller cannot hide another active loading task");
  assert.ok(overlay.classList.contains("visible"));

  w.hideLoading();
  assert.equal(w.__bcLoadingCount(), 0);
  assert.equal(overlay.style.display, "none");
  assert.ok(!overlay.classList.contains("visible"));

  w.showLoading();
  w.resetLoadingOverlay();
  assert.equal(w.__bcLoadingCount(), 0);
  assert.equal(overlay.style.display, "none");
  assert.ok(!overlay.classList.contains("visible"));
  dom.window.close();
});

test("loading overlay CSS is hidden by default and visible only while active", () => {
  const baseRule = style.match(/\.loading-overlay\s*\{([^}]*)\}/);
  const activeRule = style.match(/\.loading-overlay\.visible\s*\{([^}]*)\}/);
  assert.ok(baseRule, "the base loading overlay rule must exist");
  assert.ok(activeRule, "an explicit visible-state rule must exist");
  assert.match(baseRule[1], /display\s*:\s*none\s*;/);
  assert.match(activeRule[1], /display\s*:\s*flex\s*;/);
});

test("offline permission restoration releases a residual global loader after applying the saved profile", () => {
  const start = permissions.indexOf("if (sessionInicial && sessionInicial.bcOffline === true)");
  const end = permissions.indexOf("    var perfilRes = null;", start);
  assert.ok(start >= 0 && end > start, "the offline-only context branch must exist");
  const branch = permissions.slice(start, end);
  const applyPermissions = branch.indexOf("aplicarPermisosAInterfaz()");
  const applyIdentity = branch.indexOf("mostrarInfoUsuarioEnHeader()");
  const resetOverlay = branch.indexOf("resetLoadingOverlay()");
  assert.ok(applyPermissions >= 0 && applyIdentity > applyPermissions);
  assert.ok(resetOverlay > applyIdentity,
    "the loader is reset only after cached permissions and identity are restored");
});

test("release pins the patched offline assets in both the document and Service Worker", () => {
  const appVersion = app.match(/const VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  const swVersion = serviceWorker.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  assert.equal(appVersion, "9.5.173");
  assert.equal(swVersion, appVersion);

  for (const [name, version] of [
    ["offline.js", "9.5.104"],
    ["usuarios-permisos.js", "9.5.169"],
  ]) {
    assert.ok(indexHtml.includes('src="js/' + name + '?v=' + version + '"'),
      name + " must use the patched version in index.html");
    assert.ok(serviceWorker.includes('"./js/' + name + '?v=' + version + '"'),
      name + " must be precached with the same exact version");
  }
});
