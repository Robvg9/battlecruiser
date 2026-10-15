"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");

const BASE_URL = (process.env.BC_LIVE_BASE_URL || "https://battlecruiser.robvg9.workers.dev").replace(/\/+$/, "");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const OUTPUT_DIR = path.join(process.cwd(), "test-results");
const REPORT_PATH = path.join(OUTPUT_DIR, "battlecruiser-live-offline-e2e.json");
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, "battlecruiser-live-offline-e2e.png");
const CORE_PATHS = ["/", "/index.html", "/app.js", "/style.css"];
const TIMEOUT_MS = 45000;

const report = {
  test: "BattleCruiser LIVE offline recovery — real Chromium CDP",
  startedAt: new Date().toISOString(),
  liveUrl: BASE_URL,
  expectedVersion: null,
  status: "RUNNING",
  evidence: {},
  errors: [],
};

let browserProcess = null;
let socket = null;
let userDataDir = null;
let cdpId = 0;
const pendingCommands = new Map();
const eventListeners = new Map();
const responses = [];
const failures = [];
const pageExceptions = [];
const consoleErrors = [];
const requestsById = new Map();

function sha256(text) {
  const normalized = String(text).replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function writeReport() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  report.finishedAt = new Date().toISOString();
  report.evidence.browserResponses = responses;
  report.evidence.failedRequests = failures;
  report.evidence.pageExceptions = pageExceptions;
  report.evidence.consoleErrors = consoleErrors;
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
}
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      signal: controller.signal,
      redirect: "follow",
    });
    const body = await response.text();
    return { status: response.status, url: response.url, body, contentType: response.headers.get("content-type") };
  } finally {
    clearTimeout(timer);
  }
}
function findBrowser() {
  const env = process.env;
  const candidates = [
    env["PROGRAMFILES(X86)"] && path.join(env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
    env["PROGRAMFILES(X86)"] && path.join(env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  if (process.platform === "win32") {
    for (const command of ["msedge.exe", "chrome.exe"]) {
      try {
        const found = execFileSync("where.exe", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
          .split(/\r?\n/).map((item) => item.trim()).find(Boolean);
        if (found && fs.existsSync(found)) return found;
      } catch (_) {}
    }
  }
  throw new Error("No se encontró Microsoft Edge ni Google Chrome en el runner Windows.");
}
async function localJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("DevTools HTTP " + response.status + " al leer " + url);
  return response.json();
}
function cdpCommand(method, params) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("DevTools WebSocket no está abierto."));
  const id = ++cdpId;
  const message = { id, method, params: params || {} };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error("Timeout CDP en " + method));
    }, 15000);
    pendingCommands.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify(message));
  });
}
function waitForEvent(method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const listener = (params) => {
      clearTimeout(timer);
      const listeners = eventListeners.get(method);
      if (listeners) listeners.delete(listener);
      resolve(params);
    };
    const timer = setTimeout(() => {
      const listeners = eventListeners.get(method);
      if (listeners) listeners.delete(listener);
      reject(new Error("Timeout esperando evento CDP " + method));
    }, timeoutMs || TIMEOUT_MS);
    if (!eventListeners.has(method)) eventListeners.set(method, new Set());
    eventListeners.get(method).add(listener);
  });
}
async function evaluate(expression) {
  const result = await cdpCommand("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const exception = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
    throw new Error("Error JS en evaluación CDP: " + (exception || result.exceptionDetails.text || "desconocido"));
  }
  return result.result ? result.result.value : undefined;
}
async function waitUntil(description, predicate, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || TIMEOUT_MS);
  let lastValue;
  while (Date.now() < deadline) {
    try {
      lastValue = await evaluate("(async()=>(" + predicate + "))()");
      if (lastValue) return lastValue;
    } catch (_) {}
    await delay(250);
  }
  throw new Error("Timeout esperando " + description + ". Último valor: " + JSON.stringify(lastValue));
}
async function navigateAndWait(url) {
  const loaded = waitForEvent("Page.loadEventFired", TIMEOUT_MS);
  const result = await cdpCommand("Page.navigate", { url });
  if (result.errorText) throw new Error("Page.navigate falló: " + result.errorText);
  await loaded;
  await delay(500);
}
async function reloadAndWait() {
  const loaded = waitForEvent("Page.loadEventFired", TIMEOUT_MS);
  await cdpCommand("Page.reload", { ignoreCache: true });
  await loaded;
  await delay(500);
}
function pageSnapshotExpression() {
  return "(()=>({readyState:document.readyState,title:document.title,bodyText:(document.body&&document.body.innerText||'').slice(0,1400),version:window.__BC_VERSION__||null,loginForm:!!document.querySelector('#login-form'),usernameField:!!document.querySelector('#email'),passwordField:!!document.querySelector('#password'),localStylesheet:!!document.querySelector('link[rel=stylesheet][href*=\\\"style.css\\\"]'),online:navigator.onLine,controller:!!(navigator.serviceWorker&&navigator.serviceWorker.controller),controllerScript:navigator.serviceWorker&&navigator.serviceWorker.controller?navigator.serviceWorker.controller.scriptURL:null,href:location.href}))()";
}
function shellSnapshotPredicate() {
  return "(()=>{const s=" + pageSnapshotExpression() + ";return s.readyState==='complete'&&s.version?s:null})()";
}
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const appSource = fs.readFileSync(path.join(PUBLIC_DIR, "app.js"), "utf8");
  const swSource = fs.readFileSync(path.join(PUBLIC_DIR, "service-worker.js"), "utf8");
  const appVersionMatch = appSource.match(/const VERSION=["']([^"']+)["']/);
  const swVersionMatch = swSource.match(/BC_SW_VERSION\s*=\s*["']([^"']+)["']/);
  assert(appVersionMatch, "No se pudo leer la versión canónica de public/app.js.");
  assert(swVersionMatch, "No se pudo leer la versión de public/service-worker.js.");
  const expectedVersion = appVersionMatch[1];
  report.expectedVersion = expectedVersion;
  report.evidence.source = {
    gitSha: process.env.GITHUB_SHA || null,
    appJsSha256: sha256(appSource),
    serviceWorkerSha256: sha256(swSource),
    appVersion: expectedVersion,
    serviceWorkerVersion: swVersionMatch[1],
  };
  assert(expectedVersion === swVersionMatch[1], "La versión fuente app.js no coincide con el Service Worker.");

  const sourceIndex = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
  const sourceCss = fs.readFileSync(path.join(PUBLIC_DIR, "style.css"), "utf8");
  const assetPaths = ["/index.html", "/app.js", "/service-worker.js", "/style.css"];
  const liveAssetEvidence = {};
  for (const assetPath of assetPaths) {
    const live = await fetchText(BASE_URL + assetPath + "?bc_live_offline_e2e=" + Date.now());
    assert(live.status >= 200 && live.status < 300, "LIVE " + assetPath + " devolvió HTTP " + live.status);
    liveAssetEvidence[assetPath] = {
      httpStatus: live.status,
      contentType: live.contentType,
      sha256: sha256(live.body),
    };
  }
  assert(liveAssetEvidence["/app.js"].sha256 === sha256(appSource), "El app.js de LIVE no coincide byte a byte con la fuente (LF normalizado).");
  assert(liveAssetEvidence["/service-worker.js"].sha256 === sha256(swSource), "El Service Worker LIVE no coincide byte a byte con la fuente (LF normalizado).");
  assert(liveAssetEvidence["/index.html"].sha256 === sha256(sourceIndex), "index.html LIVE no coincide con la fuente; no se ejecutará el E2E sobre una build no alineada.");
  assert(liveAssetEvidence["/style.css"].sha256 === sha256(sourceCss), "style.css LIVE no coincide con la fuente; no se ejecutará el E2E sobre una build no alineada.");
  report.evidence.liveAssets = liveAssetEvidence;

  const browserPath = findBrowser();
  report.evidence.browser = { executable: browserPath, platform: process.platform, nodeVersion: process.version };
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "battlecruiser-live-offline-"));
  browserProcess = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-sync",
    "--disable-translate",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    "--user-data-dir=" + userDataDir,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  const activePortPath = path.join(userDataDir, "DevToolsActivePort");
  let debugPort = null;
  const portDeadline = Date.now() + 30000;
  while (Date.now() < portDeadline && !debugPort) {
    if (browserProcess.exitCode !== null) throw new Error("El navegador terminó antes de inicializar DevTools, exitCode=" + browserProcess.exitCode);
    try {
      const lines = fs.readFileSync(activePortPath, "utf8").split(/\r?\n/);
      const parsed = Number(lines[0]);
      if (parsed > 0) debugPort = parsed;
    } catch (_) {}
    if (!debugPort) await delay(200);
  }
  assert(debugPort, "Chromium no publicó DevToolsActivePort.");

  let targets = [];
  const targetDeadline = Date.now() + 15000;
  while (Date.now() < targetDeadline && !targets.some((target) => target.type === "page" && target.webSocketDebuggerUrl)) {
    try { targets = await localJson("http://127.0.0.1:" + debugPort + "/json/list"); } catch (_) {}
    await delay(200);
  }
  const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  assert(pageTarget, "No se encontró el target de página de Chromium en DevTools.");
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout abriendo DevTools WebSocket")), 10000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("No se pudo abrir DevTools WebSocket")); }, { once: true });
  });
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = pendingCommands.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingCommands.delete(message.id);
        if (message.error) pending.reject(new Error(pending.method + ": " + message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      if (message.method === "Network.requestWillBeSent") {
        requestsById.set(message.params.requestId, {
          url: message.params.request.url,
          type: message.params.type || null,
          method: message.params.request.method || "GET",
        });
      } else if (message.method === "Network.responseReceived") {
        const request = requestsById.get(message.params.requestId) || {};
        responses.push({
          at: new Date().toISOString(),
          phase: report.evidence.phase || "initial",
          url: message.params.response.url || request.url || "",
          type: message.params.type || request.type || null,
          status: message.params.response.status,
          fromServiceWorker: Boolean(message.params.response.fromServiceWorker),
          fromDiskCache: Boolean(message.params.response.fromDiskCache),
          fromPrefetchCache: Boolean(message.params.response.fromPrefetchCache),
        });
      } else if (message.method === "Network.loadingFailed") {
        const request = requestsById.get(message.params.requestId) || {};
        failures.push({
          at: new Date().toISOString(),
          phase: report.evidence.phase || "initial",
          url: request.url || "",
          type: request.type || null,
          errorText: message.params.errorText || "",
          canceled: Boolean(message.params.canceled),
        });
      } else if (message.method === "Runtime.exceptionThrown") {
        pageExceptions.push({
          at: new Date().toISOString(),
          phase: report.evidence.phase || "initial",
          text: message.params.exceptionDetails && message.params.exceptionDetails.text,
          url: message.params.exceptionDetails && message.params.exceptionDetails.url,
          description: message.params.exceptionDetails && message.params.exceptionDetails.exception && message.params.exceptionDetails.exception.description,
        });
      } else if (message.method === "Log.entryAdded" && message.params.entry && message.params.entry.level === "error") {
        consoleErrors.push({
          at: new Date().toISOString(),
          phase: report.evidence.phase || "initial",
          text: message.params.entry.text,
          url: message.params.entry.url || null,
        });
      }
      const listeners = eventListeners.get(message.method);
      if (listeners) {
        for (const listener of Array.from(listeners)) listener(message.params);
      }
    } catch (error) {
      report.errors.push("No se pudo procesar un mensaje CDP: " + error.message);
    }
  });

  await cdpCommand("Page.enable");
  await cdpCommand("Runtime.enable");
  await cdpCommand("Network.enable");
  await cdpCommand("Log.enable");
  await cdpCommand("Network.setCacheDisabled", { cacheDisabled: true });
  await cdpCommand("Network.setBypassServiceWorker", { bypass: false });

  report.evidence.phase = "online_initial";
  const initialResponseStart = responses.length;
  await navigateAndWait(BASE_URL + "/");
  const initial = await waitUntil("shell online con versión esperada", shellSnapshotPredicate(), 10000);
  report.evidence.onlineInitial = initial;
  assert(initial.readyState === "complete", "El documento LIVE no terminó de cargar.");
  assert(initial.version === expectedVersion, "Versión de navegador " + initial.version + " distinta de la esperada " + expectedVersion + ".");
  assert(initial.loginForm && initial.usernameField && initial.passwordField, "La raíz LIVE no muestra el formulario de inicio de sesión esperado.");
  assert(initial.localStylesheet, "La página LIVE no enlazó style.css.");

  let registration = await waitUntil(
    "activación del Service Worker",
    "(()=>{const r=navigator.serviceWorker&&navigator.serviceWorker.controller;return r?{controlled:true,scriptURL:r.scriptURL}:null})()",
    45000
  ).catch(() => null);
  if (!registration) {
    report.evidence.phase = "online_controller_reload";
    await reloadAndWait();
    registration = await waitUntil(
      "control de página por el Service Worker después de la segunda carga",
      "(()=>{const r=navigator.serviceWorker&&navigator.serviceWorker.controller;return r?{controlled:true,scriptURL:r.scriptURL}:null})()",
      30000
    );
  }
  assert(registration && registration.scriptURL && registration.scriptURL.endsWith("/service-worker.js"), "La página no quedó controlada por el Service Worker correcto.");
  report.evidence.serviceWorker = registration;

  const cacheExpression = "(async()=>{const names=await caches.keys();const paths=" + JSON.stringify(CORE_PATHS) + ";const result={};for(const p of paths){result[p]=null;for(const n of names){const c=await caches.open(n);const r=await c.match(new URL(p,location.origin).href,{ignoreSearch:true});if(r){result[p]={cache:n,status:r.status};break;}}}return {names:names,core:result};})()";
  const cacheInventory = await evaluate(cacheExpression);
  report.evidence.cacheBeforeOffline = cacheInventory;
  assert(cacheInventory.names.includes("battlecruiser-static-" + expectedVersion), "No existe la caché estática de la versión " + expectedVersion + ".");
  for (const assetPath of CORE_PATHS) {
    const cached = cacheInventory.core[assetPath];
    assert(cached && cached.status === 200, "El recurso core " + assetPath + " no está en CacheStorage con HTTP 200.");
  }

  report.evidence.phase = "offline_reload";
  const offlineResponseStart = responses.length;
  const offlineFailureStart = failures.length;
  await cdpCommand("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: "none",
  });
  await reloadAndWait();
  const offline = await waitUntil(
    "render de la PWA durante la desconexión de red",
    shellSnapshotPredicate(),
    15000
  );
  report.evidence.offlineReload = offline;
  assert(offline.readyState === "complete", "La recarga offline no terminó.");
  assert(offline.version === expectedVersion, "La versión no se mantuvo durante la recarga offline.");
  assert(offline.loginForm && offline.usernameField && offline.passwordField, "El formulario core no se recuperó al recargar offline.");
  assert(offline.localStylesheet, "El enlace a style.css no está presente offline.");

  const offlineResponses = responses.slice(offlineResponseStart);
  const offlineCoreEvidence = {};
  for (const assetPath of CORE_PATHS) {
    const matching = offlineResponses.filter((item) => {
      try {
        const parsed = new URL(item.url);
        return parsed.origin === new URL(BASE_URL).origin && parsed.pathname === assetPath;
      } catch (_) { return false; }
    });
    const last = matching.length ? matching[matching.length - 1] : null;
    offlineCoreEvidence[assetPath] = last;
    assert(last && last.status === 200, "No se observó respuesta HTTP 200 offline para " + assetPath + ".");
    assert(last.fromServiceWorker, "La respuesta offline de " + assetPath + " no acredita al Service Worker/cache.");
  }
  report.evidence.offlineCoreResponses = offlineCoreEvidence;
  report.evidence.offlineNetworkFailures = failures.slice(offlineFailureStart);
  report.evidence.offlineScreenshot = SCREENSHOT_PATH;
  const screenshot = await cdpCommand("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));

  report.evidence.phase = "online_reconnect";
  const reconnectResponseStart = responses.length;
  await cdpCommand("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    connectionType: "wifi",
  });
  await reloadAndWait();
  const reconnected = await waitUntil("recuperación tras reconectar internet", shellSnapshotPredicate(), 15000);
  report.evidence.onlineReconnect = reconnected;
  assert(reconnected.readyState === "complete", "La PWA no terminó de cargar tras reconectar.");
  assert(reconnected.version === expectedVersion, "La versión cambió después de reconectar.");
  assert(reconnected.online === true, "El navegador no recuperó navigator.onLine después de reconectar.");
  assert(reconnected.loginForm, "La pantalla principal no se recuperó después de reconectar.");
  const reconnectDoc = responses.slice(reconnectResponseStart).filter((item) => {
    try { const u = new URL(item.url); return u.origin === new URL(BASE_URL).origin && u.pathname === "/" && item.status === 200; } catch (_) { return false; }
  });
  assert(reconnectDoc.length > 0, "No se observó una respuesta HTTP 200 de la raíz después de reconectar.");

  report.status = "PASS";
  report.summary = "PASS: Chromium real cargó la LIVE alineada con la fuente, verificó CacheStorage, desconectó la red a nivel CDP, recargó la raíz y comprobó raíz/index/app.js/style.css desde el Service Worker con HTTP 200; después reconectó y volvió a cargar.";
}
(async () => {
  try {
    await main();
  } catch (error) {
    report.status = "FAIL";
    report.errors.push(error && error.stack ? error.stack : String(error));
    console.error("[BC LIVE OFFLINE E2E] FAIL:", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    if (socket) {
      try { socket.close(); } catch (_) {}
    }
    if (browserProcess && browserProcess.exitCode === null) {
      try { browserProcess.kill(); } catch (_) {}
    }
    if (userDataDir) {
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    }
    try {
      writeReport();
      console.log("[BC LIVE OFFLINE E2E] Evidence: " + REPORT_PATH);
      console.log("[BC LIVE OFFLINE E2E] Status: " + report.status);
    } catch (error) {
      console.error("No se pudo persistir el reporte E2E:", error && error.stack ? error.stack : error);
      process.exitCode = 1;
    }
  }
})();