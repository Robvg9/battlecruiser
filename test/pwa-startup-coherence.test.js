"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const core = read("public/js/core.js");
const auth = read("public/js/auth.js");
const theme = read("public/js/m27-5-theme-dark-reset.js");
const style = read("public/style.css");
const app = read("public/app.js");
const serviceWorker = read("public/service-worker.js");
const indexHtml = read("public/index.html");
const jornadaUi = read("public/js/bc7-jornada-ui.js");

function appModules() {
  const start = app.indexOf("const modules=[");
  assert.ok(start >= 0, "app.js must expose its authoritative module registry");
  const end = app.indexOf("];", start);
  assert.ok(end > start, "app.js module registry must be closed");
  return [...app.slice(start, end).matchAll(/\["([^"]+\.js)",\s*"([^"]*)"\]/g)]
    .map((match) => ({ name: match[1], version: match[2] }));
}

function precachedVersion(name) {
  const escaped = name.replace(".", "\\.");
  const match = serviceWorker.match(new RegExp('"\\./js/' + escaped + '\\?v=([^"]+)"'));
  return match ? match[1] : null;
}

test("PWA loader: core.js does not append scripts already owned by index/app", () => {
  for (const name of [
    "compra-multiple.js",
    "movimiento-multiple.js",
    "inventario-detalle.js",
    "historial-detalle.js",
    "loading-guard.js",
  ]) {
    const escaped = name.replace(".", "\\.");
    assert.doesNotMatch(core, new RegExp("s\\.src\\s*=\\s*['\"]js/" + escaped));
  }
  assert.match(core, /style-historiales\.css\?v=56/,
    "removing duplicate history JS must preserve its dedicated stylesheet");
});

test("PWA loader: app.js has one authoritative version per module", () => {
  const modules = appModules();
  const names = modules.map((item) => item.name);
  assert.ok(modules.length >= 118, "the audited base module inventory was unexpectedly reduced");
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

test("Service Worker registration starts during Auth boot without waiting for window.load",()=>{
  assert.ok(auth.includes("function bcRegisterServiceWorker()"));
  assert.ok(auth.includes('navigator.serviceWorker.register("./service-worker.js"'));
  assert.ok(auth.includes("bcRegisterServiceWorker();"));
  assert.ok(!auth.includes('window.addEventListener("load", function() {\n    navigator.serviceWorker.register'),
    "Service Worker registration must not wait for window.load or optional dynamic modules");
});

test("PWA shell, app loader and Service Worker use one cache-isolated release version", () => {
  const appVersion = app.match(/const VERSION=["']([^"']+)["']/)?.[1];
  const swVersion = serviceWorker.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  const htmlAppVersion = indexHtml.match(/app\.js\?v=([^"']+)/)?.[1];
  assert.equal(appVersion, "9.5.118");
  assert.equal(swVersion, appVersion);
  assert.equal(htmlAppVersion, appVersion);
  assert.match(indexHtml, new RegExp("v" + appVersion));
  assert.ok(serviceWorker.includes('var BC_STATIC = "battlecruiser-static-" + BC_SW_VERSION;'));
});

test("PWA loader: direct HTML module versions agree with the app registry", () => {
  const modules = new Map(appModules().map((item) => [item.name, item.version]));
  const directScripts = [...indexHtml.matchAll(/<script\s+src=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const src of directScripts) {
    const url = new URL(src, "https://battlecruiser.invalid/");
    const name = url.pathname.split("/").pop();
    if (!modules.has(name)) continue;
    const htmlVersion = new URLSearchParams(url.search).get("v") || "";
    assert.equal(htmlVersion, modules.get(name), name + " index.html and app.js versions must match");
  }
  assert.match(app, /url\.pathname===expectedPath/,
    "existing scripts must be matched by exact pathname, not substring");
});

test("PWA loader: UI_READY waits for actual module load attempts and reports degraded loads", () => {
  assert.doesNotMatch(app, /setTimeout\(terminarBootUI,\s*1500\)/,
    "UI_READY must not be resolved by an optimistic 1.5 second timer");
  assert.match(app, /Promise\.all\(pendientes\)\.then\(terminarBootUI\)/,
    "UI_READY must wait for module load attempts");
  assert.match(app, /__BC_MODULE_LOAD_STATE__/,
    "module readiness diagnostics must be available to the application");
  assert.match(app, /status:failed\|\|timedOut\?"degraded":"ready"/,
    "failed or timed-out modules must produce an explicit degraded state");
  assert.match(app, /__BC_UI_READY_DEGRADED__/,
    "the degraded readiness state must be externally observable");
});

test("Jornada: operation-only RPCs load on demand and keep retry available", () => {
  const start = jornadaUi.indexOf("async function openWorkspace(sessionId)");
  const end = jornadaUi.indexOf("async function saveCount(form)", start);
  assert.ok(start >= 0 && end > start, "openWorkspace must be present");
  const openWorkspace = jornadaUi.slice(start, end);
  assert.match(openWorkspace, /rpc\('bc7_obtener_inventario_jornada'/);
  assert.match(openWorkspace, /rpc\('bc7_estado_entrega_inventario_jornada'/);
  for (const rpcName of [
    "bc7_estado_confirmaciones_jornada",
    "bc7_productos_ajuste_jornada",
    "bc7_liquidacion_inventario_jornada",
  ]) {
    assert.doesNotMatch(openWorkspace, new RegExp(rpcName),
      rpcName + " must not block the initial inventory workspace");
  }
  assert.match(jornadaUi, /ensureWorkspaceOperationData\(state\.detail\)/,
    "opening the operation tab must trigger deferred data");
  assert.match(jornadaUi, /data-bc7-operation-retry/,
    "a failed deferred load must expose a retry control");
  assert.match(jornadaUi, /settlement=detail\.liquidacion\|\|await rpc\('bc7_liquidacion_inventario_jornada'/,
    "the tab must reuse its deferred liquidation instead of issuing a duplicate RPC");
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
  assert.match(fallback, /if\s*\(url\.search\)\s*return\s+Response\.error\(\)/,
    "an explicitly versioned request must fail closed when that exact version is absent");
  assert.match(fallback, /candidates\.length !== 1/,
    "unversioned fallback must reject ambiguous cached pathname variants");
});


test("Service Worker installs each shell asset from a fresh network response", () => {
  assert.match(serviceWorker, /function precacheLocalAssets\(cache, assetUrls\)/);
  assert.match(serviceWorker, /new Request\(absoluteUrl,\s*\{[\s\S]*?cache: "no-store"/);
  assert.match(serviceWorker, /return cache\.put\(request, response\.clone\(\)\)/);
  assert.match(serviceWorker, /precacheLocalAssets\(cache, PRECACHE_SHELL\.concat\(PRECACHE_STATIC\)\)/);
  assert.doesNotMatch(serviceWorker, /(?:^|\n)\s*cache\.addAll\(/,
    "install must not seed this release cache from stale browser HTTP-cache bytes");
});

test("Service Worker bypasses browser HTTP cache for shell navigation HTML", () => {
  const start = serviceWorker.indexOf("if (isAppShellRequest(url))");
  const end = serviceWorker.indexOf("event.respondWith(caches.match(request)", start);
  assert.ok(start >= 0 && end > start, "shell navigation fetch handler must be present");
  const shellFetch = serviceWorker.slice(start, end);
  assert.match(shellFetch, /request.mode === "navigate"/);
  assert.match(shellFetch, /new Request\(request.url/);
  assert.match(shellFetch, /mode: "same-origin"/);
  assert.match(shellFetch, /credentials: "same-origin"/);
  assert.match(shellFetch, /cache: "no-store"/,
    "app-shell HTML must not come from the browser HTTP cache");
  assert.match(shellFetch, /cache-control/);
  assert.match(shellFetch, /return cacheSuccessfulResponse\(request, response\)/,
    "the fresh response is cached only in this release's versioned SW cache");
});

test("Service Worker updates wait for an explicit, stable handoff", () => {
  const installStart = serviceWorker.indexOf('self.addEventListener("install"');
  const messageStart = serviceWorker.indexOf('self.addEventListener("message"');
  assert.ok(installStart >= 0 && messageStart > installStart, "install and message handlers must exist");
  const installBlock = serviceWorker.slice(installStart, messageStart);
  assert.doesNotMatch(installBlock, /skipWaiting\s*\(/,
    "install must not activate an update while an existing document is booting");
  const activateStart = serviceWorker.indexOf('self.addEventListener("activate"');
  const fetchStart = serviceWorker.indexOf('self.addEventListener("fetch"');
  assert.ok(activateStart >= 0 && fetchStart > activateStart, "activate handler must be present");
  const activateBlock = serviceWorker.slice(activateStart, fetchStart);
  assert.match(activateBlock, /previousReleaseCacheExists/);
  assert.match(activateBlock, /if \(!previousReleaseCacheExists\) return self\.clients\.claim\(\)/,
    "only a first installation with no older release cache may claim the initial document");
  assert.doesNotMatch(activateBlock, /caches\.delete\(/,
    "activation must preserve previous release caches used by open tabs");
  assert.match(serviceWorker, /event\.data\.type === "SKIP_WAITING"/,
    "only an explicit update action may activate the waiting worker");
  assert.match(auth, /updateViaCache:\s*"none"/,
    "browser HTTP cache must not hide a changed Service Worker script");
  assert.match(auth, /bc:pwa-update-ready/,
    "the registration must announce a waiting worker to the UI");
  assert.match(app, /waiting\.postMessage\(\{ type: "SKIP_WAITING" \}\)/,
    "the user-facing update button must trigger worker activation");
  assert.doesNotMatch(core, /CLAIM_CLIENT|recuperarControlServiceWorker/,
    "core.js must not auto-claim a controller mid-boot");
  assert.match(app, /PRUNE_OLD_RELEASES/,
    "old release caches are pruned only after the UI is ready");
  assert.match(serviceWorker, /if \(clients\.length > 1\) return/,
    "older caches must remain while another tab may still use them");
});

test("Saved light/dark preference is applied before first paint", () => {
  const bootstrapAt = indexHtml.indexOf('id="bc-theme-first-paint"');
  const stylesheetAt = indexHtml.indexOf('href="style.css?v=9.5.115"');
  const themeScriptAt = indexHtml.indexOf('js/m27-5-theme-dark-reset.js?v=27.5a3');
  const appScriptAt = indexHtml.indexOf('app.js?v=9.5.118');
  assert.ok(bootstrapAt >= 0 && bootstrapAt < stylesheetAt,
    "the saved preference bootstrap must execute before the main stylesheet");
  assert.ok(themeScriptAt >= 0 && themeScriptAt < appScriptAt,
    "the full theme module must load before the dynamic module registry");
  assert.match(indexHtml, /localStorage\.getItem\("bc-ui-preferences-v2"\)/);
  assert.match(indexHtml, /data-bc-theme/);
  assert.match(style, /html\[data-bc-theme="light"\]/,
    "critical CSS must render the persisted light theme without waiting for body classes");
  assert.match(theme, /setAttribute\('data-bc-theme', appearance\)/,
    "runtime theme changes must keep the first-paint state synchronized");
  assert.ok(indexHtml.includes('js/core.js?v=9.5.117'));
  assert.ok(indexHtml.includes('js/auth.js?v=9.5.117'));
  assert.ok(indexHtml.includes('js/m27-5-theme-dark-reset.js?v=27.5a3'));
  assert.ok(serviceWorker.includes('./js/core.js?v=9.5.117'));
  assert.ok(serviceWorker.includes('./js/auth.js?v=9.5.117'));
  assert.ok(serviceWorker.includes('./js/m27-5-theme-dark-reset.js?v=27.5a3'));
});
