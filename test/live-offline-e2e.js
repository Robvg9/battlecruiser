"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");

const BASE_URL = (process.env.BC_LIVE_BASE_URL || "https://battlecruiser.robvg9.workers.dev").replace(/\/+$/, "");
const PREVIEW_BASE_URL = "https://bc-pr-224-battlecruiser.robvg9.workers.dev";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const OUTPUT_DIR = path.join(process.cwd(), "test-results");
const REPORT_PATH = path.join(OUTPUT_DIR, "battlecruiser-live-offline-e2e.json");
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, "battlecruiser-live-offline-e2e.png");
const ANDROID_HEADER_SCREENSHOT_PATH = path.join(OUTPUT_DIR, "battlecruiser-android-header-layout.png");
const CORE_PATHS = ["/", "/index.html", "/app.js", "/style.css"];
const SUPABASE_CDN_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js";
const TIMEOUT_MS = 45000;
const CDP_COMMAND_TIMEOUT_MS = 15000;
const CDP_RUNTIME_EVALUATE_TIMEOUT_MS = 45000;

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
async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  if (process.platform === "linux") {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome");
  }
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
  } else if (process.platform === "linux") {
    for (const command of ["google-chrome", "chromium", "chromium-browser"]) {
      try {
        const found = execFileSync("which", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
          .split(/\r?\n/).map((item) => item.trim()).find(Boolean);
        if (found && fs.existsSync(found)) return found;
      } catch (_) {}
    }
  }
  throw new Error("No se encontró Microsoft Edge ni Google Chrome en el runner " + process.platform + ".");
}
async function localJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("DevTools HTTP " + response.status + " al leer " + url);
  return response.json();
}
function cdpCommand(method, params, timeoutOverrideMs) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("DevTools WebSocket no está abierto."));
  const id = ++cdpId;
  const message = { id, method, params: params || {} };
  const timeoutMs = Number.isFinite(timeoutOverrideMs)
    ? Math.max(1, timeoutOverrideMs)
    : (method === "Runtime.evaluate" ? CDP_RUNTIME_EVALUATE_TIMEOUT_MS : CDP_COMMAND_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const sentAt = Date.now();
    const timer = setTimeout(() => {
      const phase = report.evidence.phase || "unknown";
      const outstanding = Array.from(pendingCommands.entries()).map(([commandId, item]) => ({
        id: commandId,
        method: item.method,
        ageMs: Date.now() - item.sentAt,
      }));
      report.evidence.cdpTimeouts = report.evidence.cdpTimeouts || [];
      report.evidence.cdpTimeouts.push({ id, method, phase, timeoutMs, outstanding });
      pendingCommands.delete(id);
      reject(new Error("Timeout CDP en " + method + " después de " + timeoutMs + " ms (fase: " + phase + ")"));
    }, timeoutMs);
    pendingCommands.set(id, { resolve, reject, timer, method, sentAt });
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
async function evaluate(expression, timeoutOverrideMs) {
  const result = await cdpCommand("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, timeoutOverrideMs);
  if (result.exceptionDetails) {
    const exception = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
    throw new Error("Error JS en evaluación CDP: " + (exception || result.exceptionDetails.text || "desconocido"));
  }
  return result.result ? result.result.value : undefined;
}
async function waitUntil(description, predicate, timeoutMs) {
  const totalTimeoutMs = timeoutMs || TIMEOUT_MS;
  const startedAt = Date.now();
  const deadline = startedAt + totalTimeoutMs;
  let lastValue;
  let lastError = null;
  let attempts = 0;
  const evaluationErrors = [];

  while (Date.now() < deadline) {
    attempts++;
    const remainingMs = Math.max(1, deadline - Date.now());
    // A single CDP evaluation must not consume the entire readiness window.
    // Short bounded polls let Chromium recover from a transient main-thread stall
    // while preserving the original total timeout for this readiness condition.
    const pollTimeoutMs = Math.min(2500, remainingMs);
    try {
      lastValue = await evaluate(
        "(async()=>(" + predicate + "))()",
        pollTimeoutMs
      );
      lastError = null;
      if (lastValue) {
        if (evaluationErrors.length) {
          report.evidence.waitUntilRecoveries = report.evidence.waitUntilRecoveries || [];
          report.evidence.waitUntilRecoveries.push({
            description,
            totalTimeoutMs,
            elapsedMs: Date.now() - startedAt,
            attempts,
            evaluationErrors,
            recovered: true,
          });
        }
        return lastValue;
      }
    } catch (error) {
      lastError = error && error.message ? error.message : String(error);
      evaluationErrors.push({
        elapsedMs: Date.now() - startedAt,
        error: lastError,
      });
    }

    const pauseMs = Math.min(250, Math.max(0, deadline - Date.now()));
    if (pauseMs > 0) await delay(pauseMs);
  }

  report.evidence.waitUntilTimeouts = report.evidence.waitUntilTimeouts || [];
  report.evidence.waitUntilTimeouts.push({
    description,
    totalTimeoutMs,
    elapsedMs: Date.now() - startedAt,
    attempts,
    lastValue: lastValue === undefined ? null : lastValue,
    lastError,
    evaluationErrors,
  });
  throw new Error(
    "Timeout esperando " + description +
      ". Último valor: " + JSON.stringify(lastValue) +
      (lastError ? ". Último error CDP: " + lastError : "") +
      ". Evaluaciones: " + attempts
  );
}
async function navigateAndWait(url) {
  let domContentLoadedSeen = false;
  // The document load event waits for optional dynamically-loaded modules and remote assets.
  // The E2E gate is the parsed DOM plus the app's own shell readiness, not every optional request.
  const loaded = waitForEvent("Page.domContentEventFired", TIMEOUT_MS).then((event) => {
    domContentLoadedSeen = true;
    return event;
  });
  // A failed CDP command can outlive the navigation-event waiter; attach a
  // handler now to avoid an unhandled rejection if Page.navigate stalls.
  loaded.catch(() => {});

  try {
    const result = await cdpCommand("Page.navigate", { url });
    if (result.errorText) throw new Error("Page.navigate falló: " + result.errorText);
  } catch (error) {
    // Edge on a busy Windows self-hosted runner can occasionally stop replying
    // to Page.navigate even while the target and Worker preview are healthy.
    // If DOMContentLoaded has not arrived, fall back to a same-origin-safe JS
    // navigation through Runtime.evaluate, then await the same DOM event.
    if (!String(error && error.message || error).includes("Timeout CDP en Page.navigate") || domContentLoadedSeen) {
      throw error;
    }
    report.evidence.navigationFallbacks = report.evidence.navigationFallbacks || [];
    report.evidence.navigationFallbacks.push({
      url,
      reason: String(error && error.message || error),
      fallback: "Runtime.evaluate location.assign"
    });
    const fallback = await cdpCommand("Runtime.evaluate", {
      expression: "window.location.assign(" + JSON.stringify(url) + ")",
      awaitPromise: false,
      returnByValue: true,
      userGesture: true,
    });
    if (fallback.exceptionDetails) {
      const description = fallback.exceptionDetails.exception && fallback.exceptionDetails.exception.description;
      throw new Error("Fallback Runtime.evaluate para navegación falló: " +
        (description || fallback.exceptionDetails.text || "desconocido"));
    }
  }
  await loaded;
  await delay(500);
}
async function reloadAndWait(ignoreCache = true) {
  // Capture the current document identity before requesting a reload. Polling
  // only UI readiness can accidentally accept the old document while Chromium
  // is still replacing it.
  const previousDocumentTimeOrigin = await evaluate("performance.timeOrigin");
  assert(
    Number.isFinite(previousDocumentTimeOrigin) && previousDocumentTimeOrigin > 0,
    "No se pudo capturar la identidad del documento antes de recargar."
  );

  // Hard reloads bypass the Service Worker in Chromium; only use them for the
  // offline cache probe. The online reconnect must be a normal navigation.
  await cdpCommand("Page.reload", ignoreCache ? { ignoreCache: true } : {});

  // Do not accept a stale Runtime.evaluate result from the previous document.
  // A new timeOrigin proves navigation completed; UI_READY then proves the app
  // has completed its own base initialization in that new document.
  const reloadReady = await waitUntil(
    "nuevo documento y módulos base listos después de recargar",
    "(()=>{const origin=performance.timeOrigin;return Number.isFinite(origin)&&origin!==" +
      JSON.stringify(previousDocumentTimeOrigin) +
      "&&document.readyState!=='loading'&&window.__BC_UI_READY_RESOLVED__===true" +
      "?{documentTimeOrigin:origin,readyState:document.readyState,uiReady:true}:null})()",
    TIMEOUT_MS
  );
  report.evidence.reloadReadiness = report.evidence.reloadReadiness || [];
  report.evidence.reloadReadiness.push({
    previousDocumentTimeOrigin,
    ...reloadReady,
    ignoreCache,
  });
  await delay(250);
}
function pageSnapshotExpression() {
  return "(()=>({readyState:document.readyState,title:document.title,bodyText:(document.body&&document.body.innerText||'').slice(0,1400),version:window.__BC_VERSION__||null,loginForm:!!document.querySelector('#login-form'),usernameField:!!document.querySelector('#email'),passwordField:!!document.querySelector('#password'),supabaseAvailable:!!(window.supabase&&typeof window.supabase.createClient==='function'),clientDefined:typeof client!=='undefined',localStylesheet:!!document.querySelector('link[rel=stylesheet][href*=\\\"style.css\\\"]'),online:navigator.onLine,controller:!!(navigator.serviceWorker&&navigator.serviceWorker.controller),controllerScript:navigator.serviceWorker&&navigator.serviceWorker.controller?navigator.serviceWorker.controller.scriptURL:null,href:location.href}))()";
}
function shellSnapshotPredicate() {
  return "(()=>{const s=" + pageSnapshotExpression() + ";return s.readyState!=='loading'&&s.loginForm&&s.usernameField&&s.passwordField&&window.__BC_UI_READY_RESOLVED__===true?s:null})()";
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
  const isProductionBase = BASE_URL === "https://battlecruiser.robvg9.workers.dev";
  const expectedReleaseSha = String(process.env.BC_EXPECTED_RELEASE_SHA || "").trim().toLowerCase();
  if (isProductionBase) {
    assert(/^[0-9a-f]{40}$/.test(expectedReleaseSha), "BC_EXPECTED_RELEASE_SHA no es un SHA Git completo para LIVE.");
  }

  for (const assetPath of assetPaths) {
    const isMainJs = assetPath === "/app.js" || assetPath === "/service-worker.js";
    // Preview workers can cold-start or briefly stall even after the preview smoke passes.
    // Retry each asset instead of failing the whole PR E2E on one fetch timeout.
    const maxAttempts = isProductionBase && isMainJs ? 30 : 4;
    const sourceReference = assetPath === "/app.js" ? appSource
      : assetPath === "/service-worker.js" ? swSource
      : assetPath === "/index.html" ? sourceIndex : sourceCss;
    let live = null;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const candidate = await fetchText(
          BASE_URL + assetPath + "?bc_live_offline_e2e=" + Date.now() + "-" + attempt,
          isProductionBase ? 20000 : 35000
        );
        if (candidate.status < 200 || candidate.status >= 300) {
          lastError = new Error("LIVE " + assetPath + " devolvió HTTP " + candidate.status);
        } else if (sha256(candidate.body) !== sha256(sourceReference)) {
          lastError = new Error("LIVE " + assetPath + " todavía no coincide byte a byte con la fuente (LF normalizado).");
        } else {
          live = candidate;
          break;
        }
      } catch (error) {
        lastError = error;
      }
      if (attempt < maxAttempts) await delay(3000);
    }
    assert(live, "No se pudo obtener la versión exacta de LIVE " + assetPath + " después de " + maxAttempts
      + " intentos. Último error: " + (lastError ? lastError.message : "desconocido"));
    liveAssetEvidence[assetPath] = {
      httpStatus: live.status,
      contentType: live.contentType,
      sha256: sha256(live.body),
    };
  }

  if (isProductionBase) {
    const releaseFilename = "release-" + expectedReleaseSha + ".json";
    const expectedRunId = String(process.env.BC_EXPECTED_DEPLOY_RUN_ID || "").trim();
    assert(/^\d+$/.test(expectedRunId), "BC_EXPECTED_DEPLOY_RUN_ID debe ser el ID numérico del deploy LIVE.");
    const releasePath = path.join(OUTPUT_DIR, "release", releaseFilename);
    assert(fs.existsSync(releasePath), "No se descargó el artefacto validado por Deploy: " + releasePath);
    let release;
    try {
      release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
    } catch (error) {
      throw new Error("El manifiesto persistido por Deploy no es JSON válido: " + releasePath + "; " + String(error));
    }
    const expected = {
      source_sha: expectedReleaseSha,
      app_version: expectedVersion,
      service_worker_version: swVersionMatch[1],
      workflow_run_id: expectedRunId,
    };
    for (const key of Object.keys(expected)) {
      assert(String(release[key] || "").toLowerCase() === String(expected[key]).toLowerCase(),
        "El manifiesto validado por Deploy " + releaseFilename + " no coincide en " + key
          + ": esperado " + expected[key] + ", recibido " + release[key] + ".");
    }
    report.evidence.releaseProvenance = release;
    report.evidence.releaseManifestArtifact = releasePath;
    report.evidence.releaseManifestSource = "Artifact uploaded by the exact Deploy workflow run after its LIVE smoke test fetched and validated this manifest.";
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
    "--no-sandbox",
    "--disable-dev-shm-usage",
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
      } else if (message.method === "Runtime.consoleAPICalled") {
        const args = (message.params && message.params.args) || [];
        const joined = args.map((arg) => {
          if (arg && typeof arg.value === "string") return arg.value;
          if (arg && typeof arg.description === "string") return arg.description;
          return "";
        }).join(" ");
        if (joined.includes("__BC_E2E_BOOT_DIAG__")) {
          report.evidence.runtimeDiagnostics = report.evidence.runtimeDiagnostics || [];
          report.evidence.runtimeDiagnostics.push({
            at: new Date().toISOString(),
            phase: report.evidence.phase || "initial",
            type: message.params.type || null,
            text: joined.slice(0, 4000),
          });
        }
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

  const bootDiagnosticSource = [
    "(()=>{",
    "if(window.__BC_E2E_BOOT_DIAG_INSTALLED__)return;",
    "window.__BC_E2E_BOOT_DIAG_INSTALLED__=true;",
    "const nativeObserver=window.MutationObserver;let nextObserverId=0;",
    "window.MutationObserver=function(callback){",
    "const id=++nextObserverId;let calls=0;let totalRecords=0;let repeatLogged=false;const createdAt=performance.now();",
    "const stack=(new Error('MutationObserver created')).stack||'';",
    "const wrapped=function(records,observer){",
    "calls++;totalRecords+=records?records.length:0;",
    "const samples=Array.from(records||[]).slice(0,4).map(r=>({type:r.type,target:r.target&&r.target.nodeName,id:r.target&&r.target.id,className:r.target&&typeof r.target.className==='string'?r.target.className.slice(0,100):'',attributeName:r.attributeName,added:r.addedNodes?r.addedNodes.length:0,removed:r.removedNodes?r.removedNodes.length:0}));",
    "if(calls===1)console.warn('__BC_E2E_BOOT_DIAG__MO_FIRST__',JSON.stringify({id,createdAgeMs:Math.round(performance.now()-createdAt),stack:stack.split('\\n').slice(0,5),samples}));",
    "if(!repeatLogged&&calls>=8){repeatLogged=true;console.warn('__BC_E2E_BOOT_DIAG__MO_REPEAT__',JSON.stringify({id,calls,totalRecords,ageMs:Math.round(performance.now()-createdAt),stack:stack.split('\\n').slice(0,5),samples}));}",
    "const started=performance.now();try{return callback.call(this,records,observer);}finally{const duration=performance.now()-started;if(duration>=40)console.warn('__BC_E2E_BOOT_DIAG__MO_SLOW__',JSON.stringify({id,calls,totalRecords,durationMs:Math.round(duration*10)/10,ageMs:Math.round(performance.now()-createdAt),stack:stack.split('\\n').slice(0,5),samples}));}",
    "};",
    "return new nativeObserver(wrapped);",
    "};",
    "window.MutationObserver.prototype=nativeObserver.prototype;",
    "try{Object.setPrototypeOf(window.MutationObserver,nativeObserver);}catch(_){}",
    "let longTaskCount=0;",
    "try{const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){longTaskCount++;if(longTaskCount<=20)console.warn('__BC_E2E_BOOT_DIAG__LONGTASK__',JSON.stringify({startTime:Math.round(entry.startTime),durationMs:Math.round(entry.duration*10)/10,name:entry.name,attribution:(entry.attribution||[]).slice(0,3).map(a=>({name:a.name,entryType:a.entryType,containerType:a.containerType,containerName:a.containerName,containerId:a.containerId}))}));}});observer.observe({type:'longtask',buffered:true});window.__BC_E2E_BOOT_DIAG_LONGTASK_OBSERVER__=observer;}catch(error){console.warn('__BC_E2E_BOOT_DIAG__LONGTASK_UNAVAILABLE__',String(error));}",
    "document.addEventListener('DOMContentLoaded',()=>console.warn('__BC_E2E_BOOT_DIAG__DOM_READY__',JSON.stringify({readyState:document.readyState,elapsedMs:Math.round(performance.now())})),{once:true});",
    "window.addEventListener('load',()=>console.warn('__BC_E2E_BOOT_DIAG__LOAD__',JSON.stringify({readyState:document.readyState,elapsedMs:Math.round(performance.now())})),{once:true});",
    "})();"
  ].join('\n');

  const diagnosticInstalled = await cdpCommand("Page.addScriptToEvaluateOnNewDocument", {
    source: bootDiagnosticSource,
  });
  report.evidence.bootDiagnostic = {
    installed: Boolean(diagnosticInstalled && diagnosticInstalled.identifier),
    observerInstrumentation: true,
    longTaskInstrumentation: true,
  };

  await cdpCommand("Network.enable");
  await cdpCommand("Log.enable");
  await cdpCommand("Network.setCacheDisabled", { cacheDisabled: true });
  await cdpCommand("Network.setBypassServiceWorker", { bypass: false });

  report.evidence.phase = "online_initial";
  const initialResponseStart = responses.length;
  await navigateAndWait(BASE_URL + "/");
  const initial = await waitUntil("shell online con versión esperada", shellSnapshotPredicate(), 10000);
  report.evidence.onlineInitial = initial;
  assert(initial.readyState !== "loading", "El DOM LIVE no terminó de parsearse.");
  assert(initial.version === expectedVersion, "Versión de navegador " + initial.version + " distinta de la esperada " + expectedVersion + ".");
  assert(initial.loginForm && initial.usernameField && initial.passwordField, "La raíz LIVE no muestra el formulario de inicio de sesión esperado.");
  assert(initial.localStylesheet, "La página LIVE no enlazó style.css.");

  // The preview login proxy must reach the real Edge Function with its allowlisted
  // production Origin. GET is a no-credential diagnostic: the expected upstream
  // response is 405, before the login rate limiter or auth/database code runs.
  if (BASE_URL === PREVIEW_BASE_URL) {
    const previewLoginProxy = await evaluate("(async()=>{try{const r=await fetch('/__bc_preview/functions/v1/bc-username-login',{method:'GET',cache:'no-store'});const body=await r.json().catch(()=>null);return {status:r.status,body,origin:location.origin};}catch(error){return {status:0,error:String(error),origin:location.origin};}})()");
    report.evidence.previewLoginProxy = previewLoginProxy;
    assert(previewLoginProxy.status === 405 &&
      previewLoginProxy.body && previewLoginProxy.body.error === "Método no permitido." &&
      previewLoginProxy.origin === PREVIEW_BASE_URL,
      "El proxy same-origin del preview no alcanzó bc-username-login con el Origin permitido: " + JSON.stringify(previewLoginProxy));
  }


  // Step 4/15 — real Chromium check of the visible Sales view toggle.
  // This probes presentation and client-side panel switching only; no auth session
  // or business RPC is used, and the original login view is restored afterwards.
  report.evidence.phase = "step4_sales_view_toggle";
  const salesToggleProbe = await evaluate("(()=>{const shell=document.querySelector('#app-shell');const login=document.querySelector('#login-form');const main=document.querySelector('#app-shell > main.main-content');const tab=document.querySelector('#tab-ventas');const wrap=document.querySelector('.venta-vista-toggle');const search=document.querySelector('#venta-vista-btn-buscador');const catalog=document.querySelector('#venta-vista-btn-catalogo');const searchPanel=document.querySelector('#venta-modo-buscador');const catalogPanel=document.querySelector('#venta-modo-catalogo');if(!shell||!login||!main||!tab||!wrap||!search||!catalog||!searchPanel||!catalogPanel)return {ready:false,reason:'toggle markup missing'};const wrapBefore={className:wrap.className,style:wrap.getAttribute('style'),display:getComputedStyle(wrap).display};const originalParent=wrap.parentElement;const originalNext=wrap.nextSibling;const restoreAnchor=document.createComment('step4-sales-toggle-anchor');originalParent.insertBefore(restoreAnchor,wrap);const host=document.createElement('div');host.setAttribute('data-step4-probe','sales-toggle');host.style.setProperty('position','fixed','important');host.style.setProperty('top','0','important');host.style.setProperty('left','0','important');host.style.setProperty('width','760px','important');host.style.setProperty('min-height','60px','important');host.style.setProperty('display','block','important');host.style.setProperty('visibility','visible','important');host.style.setProperty('z-index','2147483647','important');document.body.appendChild(host);host.appendChild(wrap);wrap.classList.remove('hidden');wrap.style.setProperty('display','flex','important');wrap.style.setProperty('visibility','visible','important');wrap.style.setProperty('position','relative','important');wrap.style.setProperty('width','100%','important');wrap.style.setProperty('min-width','240px','important');wrap.style.setProperty('height','auto','important');wrap.style.setProperty('min-height','44px','important');void wrap.offsetHeight;const rect=(e)=>{const r=e.getBoundingClientRect();const p=e.parentElement.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,display:getComputedStyle(e).display,minHeight:getComputedStyle(e).minHeight,minWidth:getComputedStyle(e).minWidth,parentDisplay:getComputedStyle(e.parentElement).display,parentRect:{width:p.width,height:p.height},probeHostRect:(()=>{const h=host.getBoundingClientRect();return {width:h.width,height:h.height}})()}};const searchRect=rect(search),catalogRect=rect(catalog);const before={searchPressed:search.getAttribute('aria-pressed'),catalogPressed:catalog.getAttribute('aria-pressed'),searchActive:search.classList.contains('activo'),catalogActive:catalog.classList.contains('activo'),searchHidden:searchPanel.classList.contains('hidden'),catalogHidden:catalogPanel.classList.contains('hidden')};catalog.click();const afterCatalog={searchPressed:search.getAttribute('aria-pressed'),catalogPressed:catalog.getAttribute('aria-pressed'),searchActive:search.classList.contains('activo'),catalogActive:catalog.classList.contains('activo'),searchHidden:searchPanel.classList.contains('hidden'),catalogHidden:catalogPanel.classList.contains('hidden')};search.click();const afterSearch={searchPressed:search.getAttribute('aria-pressed'),catalogPressed:catalog.getAttribute('aria-pressed'),searchActive:search.classList.contains('activo'),catalogActive:catalog.classList.contains('activo'),searchHidden:searchPanel.classList.contains('hidden'),catalogHidden:catalogPanel.classList.contains('hidden')};if(restoreAnchor.parentNode===originalParent)originalParent.insertBefore(wrap,restoreAnchor.nextSibling);else originalParent.appendChild(wrap);host.remove();wrap.className=wrapBefore.className;if(wrapBefore.style===null)wrap.removeAttribute('style');else wrap.setAttribute('style',wrapBefore.style);const restorationDetails={parentRestored:wrap.parentElement===originalParent,positionRestored:restoreAnchor.parentNode===originalParent&&wrap.previousSibling===restoreAnchor,nextSiblingMatches:wrap.nextSibling===originalNext,classRestored:wrap.className===wrapBefore.className,styleRestored:(wrap.getAttribute('style')||'')===(wrapBefore.style||'')};const restorationVerified=restorationDetails.parentRestored&&restorationDetails.positionRestored&&restorationDetails.nextSiblingMatches&&restorationDetails.classRestored&&restorationDetails.styleRestored;restoreAnchor.remove();return {ready:true,wrapBefore,searchRect,catalogRect,before,afterCatalog,afterSearch,restored:afterSearch.searchPressed==='true'&&afterSearch.catalogPressed==='false'&&afterSearch.searchActive&&!afterSearch.catalogActive&&!afterSearch.searchHidden&&afterSearch.catalogHidden,restorationDetails,restorationVerified};})()");
  assert(salesToggleProbe.ready, "No está disponible el DOM del toggle Ventas en Chromium: " + JSON.stringify(salesToggleProbe));
  assert(salesToggleProbe.searchRect.display !== "none" && salesToggleProbe.catalogRect.display !== "none" &&
    salesToggleProbe.searchRect.width >= 120 && salesToggleProbe.catalogRect.width >= 120 &&
    salesToggleProbe.searchRect.height >= 44 && salesToggleProbe.catalogRect.height >= 44,
    "Los toggles de Ventas no tienen un objetivo táctil visible de al menos 120x44: " + JSON.stringify(salesToggleProbe));
  assert(salesToggleProbe.before.searchPressed === "true" && salesToggleProbe.before.catalogPressed === "false" &&
    salesToggleProbe.before.searchActive && !salesToggleProbe.before.catalogActive,
    "El estado inicial Buscador/Catálogo no es coherente: " + JSON.stringify(salesToggleProbe.before));
  assert(salesToggleProbe.afterCatalog.searchPressed === "false" && salesToggleProbe.afterCatalog.catalogPressed === "true" &&
    !salesToggleProbe.afterCatalog.searchActive && salesToggleProbe.afterCatalog.catalogActive &&
    salesToggleProbe.afterCatalog.searchHidden && !salesToggleProbe.afterCatalog.catalogHidden,
    "El clic en Catálogo no cambia al panel correcto: " + JSON.stringify(salesToggleProbe.afterCatalog));
  assert(salesToggleProbe.restored, "El clic en Buscador no restaura el panel inicial: " + JSON.stringify(salesToggleProbe.afterSearch));
  assert(salesToggleProbe.restorationVerified, "La sonda no restauró el componente de Ventas en su posición DOM, clase y estilos originales: " + JSON.stringify(salesToggleProbe));
  report.evidence.step4SalesViewToggle = salesToggleProbe;

  // Step 4/15 — real Chromium check of the production-served Preferences module.
  // The browser profile is disposable; no user session or business data is touched.
  report.evidence.phase = "step4_preferences_switch_persistence";
  const preferenceModulePath = "/js/configuracion-ajustes-migrados-20260903.js";
  const preferenceSource = fs.readFileSync(path.join(PUBLIC_DIR, preferenceModulePath.slice(1)), "utf8");
  const preferenceLive = await fetchText(BASE_URL + preferenceModulePath + "?bc_step4_probe=" + Date.now());
  assert(preferenceLive.status === 200, "LIVE module de Preferencias devolvió HTTP " + preferenceLive.status);
  assert(sha256(preferenceLive.body) === sha256(preferenceSource),
    "El módulo de Preferencias LIVE no coincide con el source del checkout.");
  report.evidence.step4PreferenceModule = {
    httpStatus: preferenceLive.status,
    sha256: sha256(preferenceLive.body),
    sourceSha256: sha256(preferenceSource),
    execution: "SHA-verified checkout source injected into Chromium; no second browser fetch",
  };

  const preferenceModuleSourceLiteral = JSON.stringify(preferenceSource);
  const preferenceProbeBeforeExpression = [
    "(()=>{const tab=document.querySelector('#tab-preferencias');if(!tab)return {ready:false,reason:'tab-preferencias ausente'};",
    "const login=document.querySelector('#login-form');if(login)login.classList.add('hidden');const shell=document.querySelector('#app-shell');if(shell)shell.classList.add('visible');tab.classList.add('active');tab.style.display='block';",
    "if(!document.querySelector('#cfg-preferencias-personales')){(0,eval)(" + preferenceModuleSourceLiteral + ");}",
    "const controls=[{id:'cfg-aj-auto-refresh',key:'autoRefresh',label:'Actualización automática',defaultValue:true},{id:'cfg-aj-sync-auto',key:'syncAuto',label:'Sincronización automática',defaultValue:true},{id:'cfg-aj-sync-open',key:'syncOnOpen',label:'Sincronizar al abrir app',defaultValue:true},{id:'cfg-aj-sync-wifi',key:'syncWifiOnly',label:'Sincronizar solo en Wi-Fi',defaultValue:false},{id:'cfg-aj-notify',key:'notifications',label:'Notificaciones',defaultValue:true},{id:'cfg-aj-compact',key:'compacto',label:'Modo compacto',defaultValue:false}];",
    "const panel=document.querySelector('#cfg-preferencias-personales');if(!panel)return {ready:false,reason:'panel no montado'};",
    "const initial=controls.map(c=>{const e=document.getElementById(c.id);return {id:c.id,key:c.key,exists:!!e,type:e&&e.type,checked:e?e.checked:null,role:e&&e.getAttribute('role'),ariaChecked:e&&e.getAttribute('aria-checked'),label:e&&e.getAttribute('aria-label'),describedByTargetsPresent:!!(e&&document.getElementById(c.id+'-help')&&document.getElementById(c.id+'-state')),nameStateMatches:!!e&&(e.getAttribute('aria-label')||'').includes(e.checked?'estado activado':'estado desactivado')};});",
    "return {ready:true,version:window.__BC_VERSION__||null,controls,initial,profile:location.origin,hasLoginSession:!!(window.client&&window.client.auth)};})()"
  ].join("");
  const preferenceProbeBefore = await evaluate(preferenceProbeBeforeExpression);
  assert(preferenceProbeBefore.ready && preferenceProbeBefore.initial.length === 6 &&
    preferenceProbeBefore.initial.every(c => c.exists && c.type === "checkbox" && c.role === "switch" && c.label && c.ariaChecked === String(c.checked) && c.describedByTargetsPresent && c.nameStateMatches),
    "Los seis interruptores no están presentes/accesibles en Chromium: " + JSON.stringify(preferenceProbeBefore));

  const preferenceChange = await evaluate("(()=>{const items=[{id:'cfg-aj-auto-refresh',key:'autoRefresh'},{id:'cfg-aj-sync-auto',key:'syncAuto'},{id:'cfg-aj-sync-open',key:'syncOnOpen'},{id:'cfg-aj-sync-wifi',key:'syncWifiOnly'},{id:'cfg-aj-notify',key:'notifications'},{id:'cfg-aj-compact',key:'compacto'}];const before=JSON.parse(localStorage.getItem('bc-ui-preferences-v2')||'{}');for(const item of items){const e=document.getElementById(item.id);if(!e)return {ok:false,reason:'missing '+item.id};e.click();}const stored=JSON.parse(localStorage.getItem('bc-ui-preferences-v2')||'{}');const after=items.map(item=>{const e=document.getElementById(item.id);return {id:item.id,key:item.key,checked:e.checked,stored:stored[item.key],matches:stored[item.key]===e.checked,changed:stored[item.key]!==before[item.key],ariaChecked:e.getAttribute('aria-checked'),ariaMatches:e.getAttribute('aria-checked')===String(e.checked),nameStateMatches:(e.getAttribute('aria-label')||'').includes(e.checked?'estado activado':'estado desactivado')};});return {ok:after.every(x=>x.matches&&x.changed&&x.ariaMatches&&x.nameStateMatches),before,stored,after};})()");
  assert(preferenceChange.ok, "Los interruptores LIVE no guardaron el estado pulsado en localStorage: " + JSON.stringify(preferenceChange));
  report.evidence.step4PreferencesAfterChange = { before: preferenceChange.before, stored: preferenceChange.stored, states: preferenceChange.after };

  await reloadAndWait(false);
  const preferenceReloadExpression = [
    "(()=>{const tab=document.querySelector('#tab-preferencias');if(!tab)return {ready:false,reason:'tab missing after reload'};const originalClass=tab.getAttribute('class');const originalStyle=tab.getAttribute('style');tab.classList.add('active');tab.style.display='block';",
    "if(!document.querySelector('#cfg-preferencias-personales')){(0,eval)(" + preferenceModuleSourceLiteral + ");}",
    "const items=[{id:'cfg-aj-auto-refresh',key:'autoRefresh'},{id:'cfg-aj-sync-auto',key:'syncAuto'},{id:'cfg-aj-sync-open',key:'syncOnOpen'},{id:'cfg-aj-sync-wifi',key:'syncWifiOnly'},{id:'cfg-aj-notify',key:'notifications'},{id:'cfg-aj-compact',key:'compacto'}];const stored=JSON.parse(localStorage.getItem('bc-ui-preferences-v2')||'{}');",
    "const states=items.map(item=>{const e=document.getElementById(item.id);return {id:item.id,key:item.key,exists:!!e,checked:e?e.checked:null,stored:stored[item.key],matches:!!e&&stored[item.key]===e.checked,ariaChecked:e&&e.getAttribute('aria-checked'),ariaMatches:!!e&&e.getAttribute('aria-checked')===String(e.checked),nameStateMatches:!!e&&(e.getAttribute('aria-label')||'').includes(e.checked?'estado activado':'estado desactivado')};});",
    "const allPersisted=states.every(x=>x.exists&&x.matches&&x.ariaMatches&&x.nameStateMatches);if(originalClass===null)tab.removeAttribute('class');else tab.setAttribute('class',originalClass);if(originalStyle===null)tab.removeAttribute('style');else tab.setAttribute('style',originalStyle);",
    "const originalStyleCssText=(()=>{const probe=document.createElement('div');if(originalStyle!==null)probe.setAttribute('style',originalStyle);return probe.style.cssText;})();const restoration={originalClass,restoredClass:tab.getAttribute('class'),originalStyle,restoredStyle:tab.getAttribute('style'),originalStyleCssText,restoredStyleCssText:tab.style.cssText};const restored=restoration.restoredClass===restoration.originalClass&&restoration.restoredStyleCssText===restoration.originalStyleCssText;",
    "return {ready:true,version:window.__BC_VERSION__||null,states,allPersisted,probeStateRestored:restored,probeRestoration:restoration};})()"
  ].join("");
  // The configuration module is loaded asynchronously after DOMContentLoaded.
  // Wait for its real panel instead of reading the old document or a half-loaded
  // replacement document immediately after Page.reload.
  const preferencePanelReady = await waitUntil(
    "seis interruptores de Preferencias montados después de la recarga",
    "(()=>{const panel=document.querySelector('#cfg-preferencias-personales');const ids=['cfg-aj-auto-refresh','cfg-aj-sync-auto','cfg-aj-sync-open','cfg-aj-sync-wifi','cfg-aj-notify','cfg-aj-compact'];return panel&&ids.every(id=>document.getElementById(id))?{ready:true,ids}:null})()",
    10000
  );
  report.evidence.preferencesPanelAfterReload = preferencePanelReady;
  const preferenceReload = await evaluate(preferenceReloadExpression);
  assert(preferenceReload.ready && preferenceReload.allPersisted && preferenceReload.probeStateRestored,
    "Los seis estados no sobrevivieron la recarga de Chromium: " + JSON.stringify(preferenceReload));
  report.evidence.step4PreferencesAfterReload = preferenceReload;

  // Step 4/15 — Chromium verifies the simplified Administration layout.
  // The old presentations catalogue is removed; retail is always base unit × 1.
  const adminCatalogsInitial = await waitUntil(
    "Administración sin catálogo de presentaciones",
    "(()=>{const admin=document.querySelector('#tab-config');const products=document.querySelector('#tab-productos');const base=document.querySelector('#prod-unidad');const category=document.querySelector('#prod-categoria');const categoryForm=admin&&admin.querySelector('#form-categoria');const retired=['.presentaciones-panel','.bc-admin-presentations','#form-presentacion-nueva','#lista-presentaciones-catalogo','#pp-producto-select','#pp-lista-asociaciones','#form-pp-nueva'];const retiredAbsent=retired.every(selector=>!document.querySelector(selector));const retailFieldsAbsent=!document.querySelector('#bc-pres-normal-name,#bc-pres-normal-factor,#prod-pres-min,#prod-pres-may,#prod-pres-may-habilitado');return admin&&products&&base&&category&&category.tagName==='SELECT'&&category.required&&categoryForm&&retiredAbsent&&retailFieldsAbsent?{ready:true,version:window.__BC_VERSION__||null,panelCount:document.querySelectorAll('.presentaciones-panel').length,categoryFormInAdmin:!!categoryForm,categoryRequired:category.required,baseUnitExists:!!base,retiredAbsent,retailFieldsAbsent}:null})()",
    10000
  );
  report.evidence.adminCatalogsInitial = adminCatalogsInitial;
  await delay(1200);
  const adminCatalogsStable = await evaluate("(()=>{const admin=document.querySelector('#tab-config');const category=document.querySelector('#prod-categoria');const base=document.querySelector('#prod-unidad');const retired=['.presentaciones-panel','.bc-admin-presentations','#form-presentacion-nueva','#lista-presentaciones-catalogo','#pp-producto-select','#pp-lista-asociaciones','#form-pp-nueva'];const counts=Object.fromEntries(retired.map(selector=>[selector,document.querySelectorAll(selector).length]));return {panelCount:document.querySelectorAll('.presentaciones-panel').length,retiredControlCounts:counts,retiredControlsAbsent:Object.values(counts).every(n=>n===0),retailFieldsAbsent:!document.querySelector('#bc-pres-normal-name,#bc-pres-normal-factor,#prod-pres-min,#prod-pres-may,#prod-pres-may-habilitado'),baseUnitExists:!!base,baseUnitHasNoPresentationCatalogue:!!(base&&base.getAttribute('list')!=='presentaciones-comunes'),categoryRequired:!!(category&&category.tagName==='SELECT'&&category.required),categoriesStayInAdmin:!!(admin&&admin.querySelector('#form-categoria'))}})()");
  assert(adminCatalogsStable.panelCount===0 && adminCatalogsStable.retiredControlsAbsent,
    "El catálogo de presentaciones de Administración debía estar retirado: "+JSON.stringify(adminCatalogsStable));
  assert(adminCatalogsStable.retailFieldsAbsent && adminCatalogsStable.baseUnitExists && adminCatalogsStable.baseUnitHasNoPresentationCatalogue && adminCatalogsStable.categoryRequired && adminCatalogsStable.categoriesStayInAdmin,
    "La venta minorista debe usar unidad base × 1 y la categoría debe seguir siendo obligatoria: "+JSON.stringify(adminCatalogsStable));
  // Administration retains Categories and Roles & Permissions; only the smart designer stays retired.
  const adminSurface = await waitUntil(
    "Administración con Categorías y Roles y Permisos, sin diseñador legado",
    "(()=>{const admin=document.querySelector('#tab-config');const category=admin&&admin.querySelector('#bc-categories-open');const role=admin&&admin.querySelector('#bc-btn-config-roles');const categoryModal=document.querySelector('#bc-modal-categorias');const roleModal=document.querySelector('#bc-modal-roles-permisos');const newRoleModal=document.querySelector('#bc-modal-nuevo-rol');const roleForm=newRoleModal&&newRoleModal.querySelector('#form-nuevo-rol');const roleList=roleModal&&roleModal.querySelector('#lista-roles');const categoryForm=categoryModal&&categoryModal.querySelector('#form-categoria');const categoryList=categoryModal&&categoryModal.querySelector('#lista-categorias');const forbidden=['.bc-perm-designer','.presentaciones-panel','#form-presentacion-nueva','#lista-presentaciones-catalogo','#pp-producto-select','#pp-lista-asociaciones','#form-pp-nueva'];const counts=Object.fromEntries(forbidden.map(selector=>[selector,document.querySelectorAll(selector).length]));const forbiddenAbsent=Object.values(counts).every(n=>n===0);const staleLabels=!!(admin&&/Permisos inteligentes|Presentaciones comerciales|Solo lectura|Administrador operativo/.test(admin.textContent||''));return {ready:!!(admin&&category&&role&&categoryModal&&roleModal&&newRoleModal&&roleForm&&roleList&&categoryForm&&categoryList&&forbiddenAbsent&&!staleLabels),categoryButton:!!category,rolesButton:!!role,roleFormMoved:!!roleForm,roleListMoved:!!roleList,categoryForm:!!categoryForm,categoryList:!!categoryList,forbiddenCounts:counts,forbiddenAbsent,staleLabels,adminText:admin?(admin.textContent||'').trim():null}})()",
    10000
  );
  report.evidence.adminSurface = adminSurface;
  assert(adminSurface.ready,
    "Administración no muestra ambos accesos o reapareció el diseñador legado: " + JSON.stringify(adminSurface));
  const rolesModalState = await evaluate("(()=>{const b=document.querySelector('#tab-config #bc-btn-config-roles');if(!b)return {ready:false};b.click();const m=document.querySelector('#bc-modal-roles-permisos');return {ready:true,modalOpen:!!(m&&m.classList.contains('open')),roleList:!!(m&&m.querySelector('#lista-roles')),designerAbsent:!document.querySelector('#tab-config .bc-perm-designer')}})()");
  assert(rolesModalState.ready&&rolesModalState.modalOpen&&rolesModalState.roleList&&rolesModalState.designerAbsent,
    "El acceso Roles y Permisos no abrió su modal o reintrodujo el diseñador: "+JSON.stringify(rolesModalState));
  await evaluate("(()=>{const m=document.querySelector('#bc-modal-roles-permisos');const b=m&&m.querySelector('[data-bc-roles-close=\"1\"]');if(b)b.click();else if(m)m.classList.remove('open');return true})()");
  await waitUntil("cierre del modal Roles y Permisos","(()=>{const m=document.querySelector('#bc-modal-roles-permisos');return !!(m&&!m.classList.contains('open'))})()",3000);
  const categoryModalState = await evaluate("(()=>{const b=document.querySelector('#tab-config #bc-categories-open');if(!b)return {ready:false};b.click();const m=document.querySelector('#bc-modal-categorias');return {ready:true,modalOpen:!!(m&&m.classList.contains('open')),categoryForm:!!(m&&m.querySelector('#form-categoria')),categoryList:!!(m&&m.querySelector('#lista-categorias')),designerAbsent:!document.querySelector('#tab-config .bc-perm-designer')}})()");
  assert(categoryModalState.ready&&categoryModalState.modalOpen&&categoryModalState.categoryForm&&categoryModalState.categoryList&&categoryModalState.designerAbsent,
    "Administración no abrió Categorías o reintrodujo el diseñador: "+JSON.stringify(categoryModalState));
  const categoryModalClosed = await evaluate("(()=>{const m=document.querySelector('#bc-modal-categorias');const b=m&&m.querySelector('.bc-categories-close');if(b)b.click();return {closed:!!(!m||!m.classList.contains('open')),designerAbsent:!document.querySelector('#tab-config .bc-perm-designer')}})()");
  assert(categoryModalClosed.closed&&categoryModalClosed.designerAbsent,
    "El modal de Categorías no cerró o reapareció el diseñador: "+JSON.stringify(categoryModalClosed));
  report.evidence.adminCatalogsUi = {
    surface: adminSurface, rolesModal: rolesModalState, categoryModal: categoryModalState,
    close: categoryModalClosed, browser: "Chromium CDP",
  };
  // Login fits portrait and landscape phone viewports without hiding any form item.
  report.evidence.phase = "login_viewport_fit";
  await cdpCommand("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await cdpCommand("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
  const loginFitPortrait = await evaluate("(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const f=document.querySelector('#login-form');const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};const fr=box(f);const children=Array.from(f?f.children:[]).filter(e=>getComputedStyle(e).display!=='none').map(e=>({name:e.id||e.className||e.tagName,box:box(e)}));const within=!!(f&&fr&&fr.top>=0&&fr.bottom<=innerHeight+1&&children.every(x=>x.box&&x.box.top>=fr.top-1&&x.box.bottom<=fr.bottom+1));resolve({viewportWidth:innerWidth,viewportHeight:innerHeight,form:fr,formScrollHeight:f?f.scrollHeight:null,formClientHeight:f?f.clientHeight:null,allChildrenWithinForm:within,offscreenChildren:children.filter(x=>!x.box||x.box.top<0||x.box.bottom>innerHeight+1),htmlScrollHeight:document.documentElement.scrollHeight,bodyOverflowY:getComputedStyle(document.body).overflowY});}))))()");
  report.evidence.loginFitPortrait = loginFitPortrait;
  assert(loginFitPortrait.viewportWidth === 360 && loginFitPortrait.viewportHeight === 640,
    "Chromium no aplicó el viewport de login 360x640: " + JSON.stringify(loginFitPortrait));
  assert(loginFitPortrait.form && loginFitPortrait.form.top >= 0 && loginFitPortrait.form.bottom <= 641 &&
         loginFitPortrait.formScrollHeight <= loginFitPortrait.formClientHeight + 1 &&
         loginFitPortrait.allChildrenWithinForm && loginFitPortrait.offscreenChildren.length === 0,
    "El login necesita scroll o recorta controles/texto a 360x640: " + JSON.stringify(loginFitPortrait));

  await cdpCommand("Emulation.setDeviceMetricsOverride", { width: 720, height: 360, deviceScaleFactor: 2, mobile: true });
  const loginFitLandscape = await evaluate("(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const f=document.querySelector('#login-form');const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};const fr=box(f);const children=Array.from(f?f.children:[]).filter(e=>getComputedStyle(e).display!=='none').map(e=>({name:e.id||e.className||e.tagName,box:box(e)}));const within=!!(f&&fr&&fr.top>=0&&fr.bottom<=innerHeight+1&&children.every(x=>x.box&&x.box.top>=fr.top-1&&x.box.bottom<=fr.bottom+1));resolve({viewportWidth:innerWidth,viewportHeight:innerHeight,form:fr,formScrollHeight:f?f.scrollHeight:null,formClientHeight:f?f.clientHeight:null,allChildrenWithinForm:within,offscreenChildren:children.filter(x=>!x.box||x.box.top<0||x.box.bottom>innerHeight+1),htmlScrollHeight:document.documentElement.scrollHeight,orientation:matchMedia('(orientation: landscape)').matches});}))))()");
  report.evidence.loginFitLandscape = loginFitLandscape;
  assert(loginFitLandscape.viewportWidth === 720 && loginFitLandscape.viewportHeight === 360,
    "Chromium no aplicó el viewport horizontal de login 720x360: " + JSON.stringify(loginFitLandscape));
  assert(loginFitLandscape.form && loginFitLandscape.form.top >= 0 && loginFitLandscape.form.bottom <= 361 &&
         loginFitLandscape.formScrollHeight <= loginFitLandscape.formClientHeight + 1 &&
         loginFitLandscape.allChildrenWithinForm && loginFitLandscape.offscreenChildren.length === 0,
    "El login necesita scroll o recorta controles/texto a 720x360 horizontal: " + JSON.stringify(loginFitLandscape));
  await cdpCommand("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });

  // Real Chromium mobile-emulation probe for the Android-first header.
  // This is a viewport E2E, not a claim of physical-device validation.
  report.evidence.phase = "android_mobile_header_layout";
  await cdpCommand("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 800,
    deviceScaleFactor: 2,
    mobile: true,
  });
  const mobileHeader = await evaluate("(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();const s=getComputedStyle(e);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,display:s.display,gridArea:s.gridArea};};const shell=document.querySelector('#app-shell');const login=document.querySelector('#login-form');const header=document.querySelector('.app-header');if(login)login.classList.add('hidden');if(shell)shell.classList.add('visible');const finish=()=>{const brand=header&&header.querySelector('.header-left');const actions=header&&header.querySelector('.header-right');const account=header&&header.querySelector('#mi-cuenta-btn');const logout=header&&header.querySelector('#logout-btn');resolve({ready:document.readyState!=='loading',readyState:document.readyState,href:location.href,uiReady:window.__BC_UI_READY_RESOLVED__===true,fontStatus:document.fonts?document.fonts.status:null,viewportWidth:innerWidth,viewportHeight:innerHeight,documentWidth:document.documentElement.scrollWidth,header:box(header),headerDisplay:header?getComputedStyle(header).display:null,brand:box(brand),title:box(header&&header.querySelector('h1')),actions:box(actions),account:box(account),logout:box(logout),rightOverflow:!!(header&&logout&&logout.getBoundingClientRect().right>header.getBoundingClientRect().right+1),brandLogoutOverlap:!!(brand&&account&&account.getBoundingClientRect().left<brand.getBoundingClientRect().right-1),accountLogoutOrder:!!(account&&logout&&account.getBoundingClientRect().right<=logout.getBoundingClientRect().left+1),accountLogoutAligned:!!(account&&logout&&Math.abs(account.getBoundingClientRect().top-logout.getBoundingClientRect().top)<=8)});};requestAnimationFrame(finish);}))))()");
  report.evidence.androidMobileHeader = mobileHeader;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const androidHeaderScreenshot = await cdpCommand("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  fs.writeFileSync(ANDROID_HEADER_SCREENSHOT_PATH, Buffer.from(androidHeaderScreenshot.data, "base64"));
  report.evidence.androidMobileHeader.screenshot = ANDROID_HEADER_SCREENSHOT_PATH;
  report.evidence.androidMobileHeader.environment = "Chromium CDP mobile emulation 360x800 @ deviceScaleFactor 2; no es una prueba en Android físico.";
  assert(mobileHeader.ready,
    "DOM_NO_PREPARADO: document.readyState sigue en loading al medir el encabezado móvil: " +
      JSON.stringify({readyState: mobileHeader.readyState, href: mobileHeader.href, uiReady: mobileHeader.uiReady, fontStatus: mobileHeader.fontStatus}));
  const missingHeaderNodes = [
    !mobileHeader.header && ".app-header",
    !mobileHeader.brand && ".app-header .header-left",
    !mobileHeader.logout && ".app-header #logout-btn",
  ].filter(Boolean);
  assert(missingHeaderNodes.length === 0,
    "ELEMENTOS_AUSENTES: faltan nodos del encabezado móvil: " + JSON.stringify({missing: missingHeaderNodes, measurement: mobileHeader}));
  assert(mobileHeader.viewportWidth === 360, "Chromium no aplicó el viewport móvil 360px: " + JSON.stringify(mobileHeader));
  assert(mobileHeader.headerDisplay === "flex" && mobileHeader.actions?.display === "flex",
    "Las acciones móviles deben formar un bloque flex a la derecha de la marca: " + JSON.stringify(mobileHeader));
  assert(mobileHeader.account && mobileHeader.logout && mobileHeader.accountLogoutOrder && mobileHeader.accountLogoutAligned,
    "Mi Cuenta debe quedar inmediatamente antes de Cerrar sesión, en la misma fila: " + JSON.stringify(mobileHeader));
  assert(!mobileHeader.brandLogoutOverlap, "Las acciones se solapan con el logo/título en 360px: " + JSON.stringify(mobileHeader));
  assert(!mobileHeader.rightOverflow && mobileHeader.logout.right <= mobileHeader.header.right + 1,
    "Las acciones se salen del encabezado por la derecha en 360px: " + JSON.stringify(mobileHeader));
  assert(Math.abs(mobileHeader.logout.top - mobileHeader.brand.top) <= 18,
    "Las acciones no están alineadas en la fila superior con el título: " + JSON.stringify(mobileHeader));

  const mobileMenuProbe = await evaluate("(()=>{const header=document.querySelector('.app-header');const toggle=document.querySelector('#sidebar-toggle-btn');const logout=document.querySelector('#logout-btn');const sidebar=document.querySelector('#sidebar');const backdrop=document.querySelector('#sidebar-backdrop');const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};if(!header||!toggle||!logout||!sidebar||!backdrop)return {found:false};const hb=rect(header),tb=rect(toggle),lb=rect(logout);const display=getComputedStyle(toggle).display;toggle.click();const opened=sidebar.classList.contains('open')&&backdrop.classList.contains('visible')&&toggle.getAttribute('aria-expanded')==='true';const close=document.querySelector('#sidebar-close-btn');if(close)close.click();return {found:true,display:display,button:tb,logout:lb,header:hb,withinMargins:!!(tb&&lb&&hb&&tb.left>=hb.left+2&&lb.right<=hb.right-2),opened:opened,closed:!sidebar.classList.contains('open')&&!backdrop.classList.contains('visible')&&toggle.getAttribute('aria-expanded')==='false'};})()");
  report.evidence.androidMenuToggle = mobileMenuProbe;
  assert(mobileMenuProbe.found && mobileMenuProbe.display !== "none" &&
         mobileMenuProbe.button.width >= 36 && mobileMenuProbe.button.height >= 36 &&
         mobileMenuProbe.withinMargins && mobileMenuProbe.opened && mobileMenuProbe.closed,
    "El menú lateral no es visible/usable, no tiene márgenes o no abre/cierra en móvil: " + JSON.stringify(mobileMenuProbe));


  // The browser profile is deliberately unauthenticated. For this UI-only layout probe,
  // install a synthetic in-memory permission context and let the real permission engine
  // expose Administration. This does not create an auth session or write business data.
  const mobileScrollPermissionFixture = await evaluate("(()=>{const shell=document.querySelector('#app-shell');const button=document.querySelector('#tabs .tab-btn[data-tab=config]');const panel=document.querySelector('#tab-config');if(!shell||!button||!panel||window.__BC_PERMISOS_CANONICO__!==true||typeof window.aplicarPermisosAInterfaz!=='function')return {ready:false,reason:'canonical permission engine unavailable'};_usuarioActual={id:'bc-e2e-layout-fixture',nombre:'E2E layout fixture',rol:'E2E'};_permisosEfectivos={categorias:{ver:true,crear:true},unidades:{ver:true,crear:true}};_permisosCargaExitosa=true;window.__BC_E2E_SYNTHETIC_PERMISSION_FIXTURE__=true;window.aplicarPermisosAInterfaz();return {ready:true,userId:_usuarioActual.id,permissionSections:Object.keys(_permisosEfectivos),shellReady:shell.getAttribute('data-bc-permisos-cargados'),buttonPermission:button.getAttribute('data-bc-permiso'),panelPermission:panel.getAttribute('data-bc-permiso'),buttonHidden:button.classList.contains('hidden'),panelHidden:panel.classList.contains('hidden'),panelVisible:panel.classList.contains('visible')};})()");
  report.evidence.mobileScrollPermissionFixture = mobileScrollPermissionFixture;
  assert(mobileScrollPermissionFixture.ready && mobileScrollPermissionFixture.shellReady === "1" &&
         mobileScrollPermissionFixture.buttonPermission === "1" && mobileScrollPermissionFixture.panelPermission === "1" &&
         !mobileScrollPermissionFixture.buttonHidden && !mobileScrollPermissionFixture.panelHidden,
    "El motor real de permisos no habilitó Administración para el fixture UI sintético: " +
      JSON.stringify(mobileScrollPermissionFixture));

  const mobileScrollPanelOpened = await evaluate("(()=>{const b=document.querySelector('#tabs .tab-btn[data-tab=config]');if(!b||b.getAttribute('data-bc-permiso')!=='1')return false;b.click();return true})()");
  assert(mobileScrollPanelOpened, "No se pudo abrir Configuración con el permiso sintético de UI.");
  await waitUntil(
    "Configuración autorizada visible antes de medir el scroll móvil",
    "(()=>{const s=document.querySelector('#app-shell');const b=document.querySelector('#tabs .tab-btn[data-tab=config]');const t=document.querySelector('#tab-config');return !!(s&&s.getAttribute('data-bc-permisos-cargados')==='1'&&b&&b.getAttribute('data-bc-permiso')==='1'&&t&&t.getAttribute('data-bc-permiso')==='1'&&t.classList.contains('visible')&&getComputedStyle(t).display!=='none')})()",
    5000
  );

  // Verify mobile content uses page scrolling and critical settings remain reachable.
  const mobileContentLayout = await evaluate("(()=>{const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();const s=getComputedStyle(e);return {top:r.top,bottom:r.bottom,height:r.height,position:s.position,overflowX:s.overflowX,overflowY:s.overflowY,cssHeight:s.height,maxHeight:s.maxHeight,flex:s.flex,inlineStyle:e.getAttribute('style'),clientHeight:e.clientHeight,scrollHeight:e.scrollHeight};};const main=document.querySelector('.main-content');const footer=document.querySelector('.app-footer');const shell=document.querySelector('#app-shell');return {viewportWidth:innerWidth,viewportHeight:innerHeight,documentHeight:document.documentElement.scrollHeight,bodyHeight:document.body.scrollHeight,bodyComputedHeight:getComputedStyle(document.body).height,bodyDisplay:getComputedStyle(document.body).display,bodyOverflowY:getComputedStyle(document.body).overflowY,bodyClientHeight:document.body.clientHeight,htmlClientHeight:document.documentElement.clientHeight,shellDisplay:shell?getComputedStyle(shell).display:null,shell:box(shell),main:box(main),footer:box(footer),gap:main&&footer?footer.getBoundingClientRect().top-main.getBoundingClientRect().bottom:null};})()");
  report.evidence.androidMobileContentLayout = mobileContentLayout;
  assert(mobileContentLayout.main && mobileContentLayout.footer,
    "No se pudo medir el panel principal y el pie en el viewport móvil: " + JSON.stringify(mobileContentLayout));
  assert(mobileContentLayout.main.overflowY === "visible" &&
         mobileContentLayout.main.scrollHeight <= mobileContentLayout.main.clientHeight + 1,
    "El panel principal sigue recortado en un scroll interno en móvil: " + JSON.stringify(mobileContentLayout));
  assert(mobileContentLayout.documentHeight >= mobileContentLayout.viewportHeight &&
         mobileContentLayout.bodyHeight >= mobileContentLayout.viewportHeight &&
         mobileContentLayout.footer.bottom <= mobileContentLayout.documentHeight + 1,
    "El flujo móvil recorta contenido o desplaza el pie fuera del documento: " + JSON.stringify(mobileContentLayout));
  const documentScrollProbe = await evaluate("(()=>new Promise(resolve=>{const max=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)-innerHeight;window.scrollTo(0,Math.max(0,max));requestAnimationFrame(()=>{const moved=window.scrollY;window.scrollTo(0,0);resolve({maxScroll:max,scrollYAfterDown:moved,scrollable:moved>0,expectedScrollable:max>1});});}))()");
  report.evidence.androidDocumentScroll = documentScrollProbe;
  assert(documentScrollProbe.maxScroll >= 0 &&
         (documentScrollProbe.expectedScrollable ? documentScrollProbe.scrollable : !documentScrollProbe.scrollable),
    "El scroll del documento no coincide con la altura real del contenido móvil: " + JSON.stringify(documentScrollProbe));

  assert(mobileContentLayout.footer.position === "static" &&
         mobileContentLayout.footer.top >= mobileContentLayout.main.bottom - 1,
    "El pie se superpone o abandona el flujo después del contenido móvil: " + JSON.stringify(mobileContentLayout));
  const settingsStructure = await evaluate("(()=>({legacyMenuAbsent:!document.querySelector('#ajustes-btn, #ajustes-menu, #bc-aj-panel'),connectivityTab:!!document.querySelector('#tabs .tab-btn[data-tab=conectividad]'),preferencesTab:!!document.querySelector('#tabs .tab-btn[data-tab=preferencias]'),accountButton:!!document.querySelector('#mi-cuenta-btn'),logoutButton:!!document.querySelector('#logout-btn')}))()");
  report.evidence.settingsStructure = settingsStructure;
  assert(settingsStructure.legacyMenuAbsent && settingsStructure.connectivityTab && settingsStructure.preferencesTab && settingsStructure.accountButton && settingsStructure.logoutButton,
    "La estructura nueva debe quitar el menú Ajustes duplicado y conservar Mi Cuenta/Cerrar sesión: " + JSON.stringify(settingsStructure));

  const connectivityClicked = await evaluate("(()=>{const b=document.querySelector('#tabs .tab-btn[data-tab=conectividad]');if(!b)return false;b.click();return true;})()");
  assert(connectivityClicked, "No se encontró la sección Conectividad.");
  await waitUntil("Conectividad con diagnóstico y actualización", "(()=>{const t=document.querySelector('#tab-conectividad');return !!(t&&t.classList.contains('visible')&&t.querySelector('#cfg-mantenimiento')&&t.querySelector('#cfg-refrescar-diag')&&t.querySelector('#cfg-actualizar-app'))})()", 10000);

  const preferencesClicked = await evaluate("(()=>{const b=document.querySelector('#tabs .tab-btn[data-tab=preferencias]');if(!b)return false;b.click();return true;})()");
  assert(preferencesClicked, "No se encontró la sección Preferencias.");
  await waitUntil("Preferencias personales con control Wi-Fi", "(()=>{const t=document.querySelector('#tab-preferencias');const p=document.querySelector('#cfg-preferencias-personales');return !!(t&&t.classList.contains('visible')&&p&&p.parentElement===t&&t.querySelector('#cfg-aj-sync-wifi')&&!t.querySelector('#bc-aj-panel'))})()", 10000);

  const configClicked = await evaluate("(()=>{const b=document.querySelector('#tabs .tab-btn[data-tab=config]');if(!b)return false;b.click();return true;})()");
  assert(configClicked, "No se encontró la sección Configuración.");
  const configAdminReady = String.raw`(()=>{const t=document.querySelector('#tab-config');const b=document.querySelector('#tabs .tab-btn[data-tab=config]');const retired=['.presentaciones-panel','.bc-admin-presentations','#form-presentacion-nueva','#lista-presentaciones-catalogo','#pp-producto-select','#pp-lista-asociaciones','#form-pp-nueva'];const category=t&&t.querySelector('#form-categoria');const base=document.querySelector('#prod-unidad');const categorySelect=document.querySelector('#prod-categoria');const state={panelExists:!!t,panelVisible:!!(t&&t.classList.contains('visible')),panelClasses:t?t.className:null,panelDisplay:t?getComputedStyle(t).display:null,buttonExists:!!b,buttonClasses:b?b.className:null,buttonDisplay:b?getComputedStyle(b).display:null,buttonInlineDisplay:b?b.style.display:null,buttonPermit:b?b.getAttribute('data-bc-permiso'):null,roleEntryPresent:!!(t&&t.querySelector('#bc-btn-config-roles')),roleFormPresent:!!document.querySelector('#bc-modal-nuevo-rol #form-nuevo-rol'),roleListPresent:!!document.querySelector('#bc-modal-roles-permisos #lista-roles'),smartPermissionDesignerAbsent:!(t&&t.querySelector('.bc-perm-designer')),legacyRoleTextAbsent:!(t&&/Permisos inteligentes|Solo lectura|Administrador operativo/.test(t.textContent||'')),categoryForm:!!category,unitsCrudAbsent:!document.querySelector('#form-unidad,#lista-unidades'),presentationsPanel:!!(t&&t.querySelector('.presentaciones-panel')),presentationsPanelCount:document.querySelectorAll('.presentaciones-panel').length,presentationControlsAbsent:retired.every(selector=>document.querySelectorAll(selector).length===0),retailFormatFieldsAbsent:!document.querySelector('#bc-pres-normal-name,#bc-pres-normal-factor,#prod-pres-min,#prod-pres-may,#prod-pres-may-habilitado'),baseUnitExists:!!base,baseUnitHasNoPresentationCatalogue:!!(base&&base.getAttribute('list')!=='presentaciones-comunes'),categoryRequired:!!(categorySelect&&categorySelect.tagName==='SELECT'&&categorySelect.required),legacyPanel:!!(t&&t.querySelector('#bc-aj-panel')),activeTab:document.querySelector('#tabs .tab-btn.active')?.dataset.tab||null};window.__BC_CONFIG_ADMIN_TEST_STATE__=state;return !!(state.panelExists&&state.panelVisible&&state.roleEntryPresent&&state.roleFormPresent&&state.roleListPresent&&state.smartPermissionDesignerAbsent&&state.legacyRoleTextAbsent&&state.categoryForm&&state.unitsCrudAbsent&&!state.presentationsPanel&&state.presentationsPanelCount===0&&state.presentationControlsAbsent&&state.retailFormatFieldsAbsent&&state.baseUnitExists&&state.baseUnitHasNoPresentationCatalogue&&state.categoryRequired&&!state.legacyPanel);})()`;
  try {
    await waitUntil("Configuración de administración y catálogos", configAdminReady, 10000);
  } catch (error) {
    report.evidence.configAdminFailureState = await evaluate("window.__BC_CONFIG_ADMIN_TEST_STATE__||null");
    throw error;
  }
  const categoriesOpened = await evaluate("(()=>{const b=document.querySelector('#tab-config #bc-categories-open');if(!b)return {entry:false,opened:false};b.click();const m=document.querySelector('#bc-modal-categorias');return {entry:true,opened:!!(m&&m.classList.contains('open')),categoryForm:!!(m&&m.querySelector('#form-categoria')),categoryList:!!(m&&m.querySelector('#lista-categorias')),roleModalsPresent:!!(document.querySelector('#bc-modal-roles-permisos #lista-roles')&&document.querySelector('#bc-modal-nuevo-rol #form-nuevo-rol')),rolesModalsClosed:!document.querySelector('#bc-modal-roles-permisos.open,#bc-modal-nuevo-rol.open,#bc-modal-roles-help.open'),designerAbsent:!document.querySelector('#tab-config .bc-perm-designer')}})()");
  report.evidence.configCategoriesModal = categoriesOpened;
  assert(categoriesOpened.entry && categoriesOpened.opened && categoriesOpened.categoryForm && categoriesOpened.categoryList &&
         categoriesOpened.roleModalsPresent && categoriesOpened.rolesModalsClosed && categoriesOpened.designerAbsent,
    "Configuración no abre Categorías o altera Roles/Permisos: " + JSON.stringify(categoriesOpened));
  await evaluate("(()=>{const b=document.querySelector('#bc-modal-categorias .bc-categories-close');if(b)b.click();return true})()");
  await waitUntil("cierre del modal Categorías", "(()=>{const m=document.querySelector('#bc-modal-categorias');return !!(m&&!m.classList.contains('open'))})()", 3000);

  // Regression test: do not merely call scrollIntoView; emulate a real vertical finger swipe.
  // The installed Android PWA reported that Configuración remained impossible to scroll.
  // The compact Administration panel may fit entirely in the phone viewport.
  // If it overflows, verify a real CDP finger swipe; if not, verify no content is clipped.
  const mobileConfigScrollInitial = await evaluate("(()=>{const tab=document.querySelector('#tab-config');if(!tab)return null;window.scrollTo(0,0);tab.scrollTop=0;const before=tab.getBoundingClientRect();window.scrollTo(0,Math.max(0,Math.round(before.top+window.scrollY-8)));const r=tab.getBoundingClientRect();const s=getComputedStyle(tab);const modal=document.querySelector('#bc-modal-categorias');const modalState=modal?{ariaHidden:modal.getAttribute('aria-hidden'),open:modal.classList.contains('open'),display:getComputedStyle(modal).display,hidden:modal.getAttribute('aria-hidden')==='true'&&!modal.classList.contains('open')&&getComputedStyle(modal).display==='none'}:null;return {found:true,regionClass:tab.classList.contains('bc-config-scroll-region'),overflowY:s.overflowY,top:r.top,bottom:r.bottom,left:r.left,right:r.right,viewportHeight:innerHeight,scrollHeight:tab.scrollHeight,clientHeight:tab.clientHeight,scrollTop:tab.scrollTop,bodyLock:document.body.classList.contains('bc-aj-open'),categoriesModal:modalState}})()");
  report.evidence.androidConfigScrollInitial = mobileConfigScrollInitial;
  assert(mobileConfigScrollInitial && mobileConfigScrollInitial.found &&
         mobileConfigScrollInitial.regionClass &&
         (mobileConfigScrollInitial.overflowY === "auto" || mobileConfigScrollInitial.overflowY === "scroll") &&
         !mobileConfigScrollInitial.bodyLock && mobileConfigScrollInitial.categoriesModal && mobileConfigScrollInitial.categoriesModal.hidden,
    "Configuración no mantiene una región de contenido accesible y sin bloqueo: " + JSON.stringify(mobileConfigScrollInitial));

  let configSwipe = null;
  let mobileConfigScrollAfter = null;
  let mobileConfigScrollMode = "content-fits-viewport";
  const configNeedsScroll = mobileConfigScrollInitial.scrollHeight > mobileConfigScrollInitial.clientHeight + 10;
  if (configNeedsScroll) {
    // Start in the panel's outer gutter, away from nested scrollable catalog lists.
    // Send low-level CDP touch events to exercise Chromium's native finger-scroll path.
    configSwipe = await evaluate("(()=>{const tab=document.querySelector('#tab-config');if(!tab)return null;const r=tab.getBoundingClientRect();const candidates=[{x:Math.round(r.left+3),y:Math.round(r.top+r.height*0.68)},{x:Math.round(r.right-3),y:Math.round(r.top+r.height*0.68)},{x:Math.round(r.left+3),y:Math.round(r.top+r.height*0.38)}];for(const p of candidates){const hit=document.elementFromPoint(p.x,p.y);let node=hit,nested=false;while(node&&node!==tab){const s=getComputedStyle(node);if((s.overflowY==='auto'||s.overflowY==='scroll')&&node.scrollHeight>node.clientHeight+10)nested=true;node=node.parentElement;}if(hit&&node===tab&&!nested){const startY=Math.min(Math.round(r.bottom-12),p.y+90);const endY=Math.max(Math.round(r.top+12),startY-220);return {x:p.x,startY,endY,distance:startY-endY,targetTag:hit.tagName,targetId:hit.id||null,targetClass:typeof hit.className==='string'?hit.className:null,nestedScrollable:false};}}const x=Math.round(r.left+3),startY=Math.round(r.top+r.height*0.68),endY=Math.max(Math.round(r.top+12),startY-220),hit=document.elementFromPoint(x,startY);return {x,startY,endY,distance:startY-endY,targetTag:hit&&hit.tagName,targetId:hit&&hit.id||null,targetClass:hit&&typeof hit.className==='string'?hit.className:null,nestedScrollable:true};})()");
    assert(configSwipe && configSwipe.distance >= 100,
      "No hay una zona segura suficiente para probar el gesto de scroll táctil: " + JSON.stringify(configSwipe));
    await cdpCommand("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await cdpCommand("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: configSwipe.x, y: configSwipe.startY, id: 0, radiusX: 3, radiusY: 3, force: 1 }],
    });
    for (let step = 1; step <= 8; step++) {
      await delay(45);
      const y = Math.round(configSwipe.startY + (configSwipe.endY - configSwipe.startY) * step / 8);
      await cdpCommand("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: configSwipe.x, y, id: 0, radiusX: 3, radiusY: 3, force: 1 }],
      });
    }
    await cdpCommand("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await delay(300);
    mobileConfigScrollAfter = await evaluate("(()=>{const tab=document.querySelector('#tab-config');return tab?{scrollTop:tab.scrollTop,scrollHeight:tab.scrollHeight,clientHeight:tab.clientHeight,windowScrollY:window.scrollY}:null})()");
    assert(mobileConfigScrollAfter && mobileConfigScrollAfter.scrollTop > mobileConfigScrollInitial.scrollTop + 20,
      "El gesto vertical simulado no desplazó Configuración cuando el contenido excede el viewport. Antes=" + JSON.stringify(mobileConfigScrollInitial) +
        "; gesto=" + JSON.stringify(configSwipe) + "; después=" + JSON.stringify(mobileConfigScrollAfter));
    mobileConfigScrollMode = "native-touch-scroll";
  } else {
    mobileConfigScrollAfter = await evaluate("(()=>{const tab=document.querySelector('#tab-config');if(!tab)return null;const tr=tab.getBoundingClientRect();const selectors=['.bc-admin-content','.bc-admin-grid','.bc-admin-card','.bc-admin-subcard'];const nodes=selectors.flatMap(selector=>Array.from(tab.querySelectorAll(selector)));const clipped=nodes.filter(node=>{const r=node.getBoundingClientRect();return r.height>0&&(r.top<tr.top-1||r.bottom>tr.bottom+1)}).map(node=>({selector:node.className||node.tagName,top:node.getBoundingClientRect().top,bottom:node.getBoundingClientRect().bottom}));return {scrollTop:tab.scrollTop,scrollHeight:tab.scrollHeight,clientHeight:tab.clientHeight,windowScrollY:window.scrollY,tabTop:tr.top,tabBottom:tr.bottom,viewportHeight:innerHeight,clipped}})()");
    assert(mobileConfigScrollAfter && mobileConfigScrollAfter.scrollHeight <= mobileConfigScrollAfter.clientHeight + 1 &&
           mobileConfigScrollAfter.tabTop >= -1 && mobileConfigScrollAfter.tabBottom <= mobileConfigScrollAfter.viewportHeight + 1 &&
           mobileConfigScrollAfter.clipped.length === 0,
      "La Administración compacta debería caber completa sin recorte: " + JSON.stringify(mobileConfigScrollAfter));
  }
  await cdpCommand("Emulation.setTouchEmulationEnabled", { enabled: false });
  report.evidence.androidConfigScrollGesture = {
    initial: mobileConfigScrollInitial,
    mode: mobileConfigScrollMode,
    swipe: configSwipe,
    after: mobileConfigScrollAfter,
    method: "Chromium CDP mobile emulation: native finger swipe only when content overflows; otherwise full-content viewport fit. Not a physical Android test.",
  };
  const preferencesReopenedForReachability = await evaluate("(()=>{const b=document.querySelector('#tabs .tab-btn[data-tab=preferencias]');if(!b)return false;b.click();return true})()");
  assert(preferencesReopenedForReachability, "No se pudo volver a Preferencias para verificar el control Wi-Fi.");
  await waitUntil("Preferencias activas después de Configuración", "(()=>{const t=document.querySelector('#tab-preferencias');return !!(t&&t.classList.contains('visible'))})()", 5000);
  const mobileSettingsReachability = await evaluate("(()=>new Promise(resolve=>requestAnimationFrame(()=>{const panel=document.querySelector('#cfg-preferencias-personales');const tab=document.querySelector('#tab-preferencias');const control=document.querySelector('#cfg-aj-sync-wifi');const row=control&&control.closest('.cfg-aj-row');if(row&&typeof row.scrollIntoView==='function')row.scrollIntoView({block:'end',behavior:'instant'});requestAnimationFrame(()=>{const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};const pr=box(panel);const rr=box(row);const bodyLock=document.body.classList.contains('bc-aj-open');const bodyOverflowY=getComputedStyle(document.body).overflowY;resolve({preferencesVisible:!!(tab&&tab.classList.contains('visible')),panelInsidePreferences:!!(tab&&panel&&panel.parentElement===tab),bodyLock:bodyLock,bodyOverflowY:bodyOverflowY,found:!!control,panel:pr,row:rr,documentScrollY:window.scrollY,documentScrollHeight:document.documentElement.scrollHeight,panelScrollTop:panel?panel.scrollTop:null,panelScrollHeight:panel?panel.scrollHeight:null,panelClientHeight:panel?panel.clientHeight:null,viewportHeight:innerHeight,fullyVisible:!!(tab&&tab.classList.contains('visible')&&panel&&panel.parentElement===tab&&!bodyLock&&bodyOverflowY!=='hidden'&&rr&&rr.top>=-1&&rr.bottom<=innerHeight+1)});});})))()");
  report.evidence.androidMobileSettingsReachability = mobileSettingsReachability;
  assert(mobileSettingsReachability.found && mobileSettingsReachability.fullyVisible,
    "El control Wi-Fi de Preferencias no puede llevarse completamente a vista con el scroll móvil: " + JSON.stringify(mobileSettingsReachability));
  await evaluate("(()=>{const s=document.querySelector('#app-shell');const l=document.querySelector('#login-form');if(s)s.classList.remove('visible');if(l)l.classList.remove('hidden');return true})()");
  await cdpCommand("Emulation.clearDeviceMetricsOverride");
  report.evidence.phase = "online_initial";

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

  const cacheExpression = "(async()=>{const names=await caches.keys();const paths=" + JSON.stringify(CORE_PATHS) + ";const external=" + JSON.stringify(SUPABASE_CDN_URL) + ";const result={};let supabase=null;for(const n of names){const c=await caches.open(n);if(!supabase){const ext=await c.match(external,{ignoreSearch:true});if(ext)supabase={cache:n,status:ext.status,type:ext.type};}for(const p of paths){if(result[p])continue;const r=await c.match(new URL(p,location.origin).href,{ignoreSearch:true});if(r)result[p]={cache:n,status:r.status};}}return {names:names,core:result,externalSupabase:supabase};})()";
  const cacheInventory = await evaluate(cacheExpression);
  report.evidence.cacheBeforeOffline = cacheInventory;
  assert(cacheInventory.names.includes("battlecruiser-static-" + expectedVersion), "No existe la caché estática de la versión " + expectedVersion + ".");
  assert(cacheInventory.externalSupabase && cacheInventory.externalSupabase.status === 200, "Supabase UMD no quedó precargado en CacheStorage.");
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
  await reloadAndWait(false);
  const offline = await waitUntil(
    "render de la PWA durante la desconexión de red",
    shellSnapshotPredicate(),
    15000
  );
  report.evidence.offlineReload = offline;
  assert(offline.readyState !== "loading", "El DOM offline no terminó de parsearse.");
  assert(offline.version === expectedVersion, "La versión no se mantuvo durante la recarga offline.");
  assert(offline.loginForm && offline.usernameField && offline.passwordField, "El formulario core no se recuperó al recargar offline.");
  assert(offline.localStylesheet, "El enlace a style.css no está presente offline.");
  assert(offline.supabaseAvailable && offline.clientDefined, "El cliente Supabase o el cliente de aplicación no se inicializó offline.");

  // index.html is precached separately from the root URL, so request it explicitly while
  // the browser's network is disabled. This proves the indexed document is recoverable.
  const indexProbe = await evaluate("(async()=>{const r=await fetch('/index.html?bc_offline_probe='+Date.now(),{cache:'no-store'});const body=await r.text();return {status:r.status,ok:r.ok,bodyLength:body.length,containsTitle:body.includes('<title>BattleCruiser</title>')}})()");
  report.evidence.offlineIndexProbe = indexProbe;
  assert(indexProbe.status === 200 && indexProbe.ok && indexProbe.containsTitle, "index.html no se pudo recuperar desde la caché mientras la red estaba desconectada.");

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
  const offlineSupabaseResponses = offlineResponses.filter((item) => {
    try {
      const parsed = new URL(item.url);
      const expected = new URL(SUPABASE_CDN_URL);
      return parsed.origin === expected.origin && parsed.pathname === expected.pathname;
    } catch (_) { return false; }
  });
  const supabaseResponse = offlineSupabaseResponses.length ? offlineSupabaseResponses[offlineSupabaseResponses.length - 1] : null;
  report.evidence.offlineSupabaseResponse = supabaseResponse;
  assert(supabaseResponse && supabaseResponse.status === 200 && supabaseResponse.fromServiceWorker, "Supabase UMD no se sirvió desde el Service Worker cuando no había red.");
  const criticalOfflineExceptions = pageExceptions.filter((item) =>
    item.phase === "offline_reload" &&
    ((item.description || "").includes("createClient") || (item.description || "").includes("client is not defined"))
  );
  report.evidence.criticalOfflineExceptions = criticalOfflineExceptions;
  assert(criticalOfflineExceptions.length === 0, "El arranque offline generó errores críticos de inicialización: " + JSON.stringify(criticalOfflineExceptions));
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
  await reloadAndWait(false);
  const reconnected = await waitUntil("recuperación tras reconectar internet", shellSnapshotPredicate(), 15000);
  report.evidence.onlineReconnect = reconnected;
  assert(reconnected.readyState !== "loading", "El DOM no terminó de parsearse tras reconectar.");
  assert(reconnected.version === expectedVersion, "La versión cambió después de reconectar.");
  assert(reconnected.online === true, "El navegador no recuperó navigator.onLine después de reconectar.");
  assert(reconnected.loginForm, "La pantalla principal no se recuperó después de reconectar.");
  // An active registration alone is insufficient: the reloaded document must regain control.
  const controlledAfterReconnect = await waitUntil(
    "control de página por el Service Worker después de reconectar",
    "(()=>{const c=navigator.serviceWorker&&navigator.serviceWorker.controller;return c&&c.scriptURL&&c.scriptURL.endsWith('/service-worker.js')?{controlled:true,scriptURL:c.scriptURL}:null})()",
    10000
  ).catch(() => null);
  report.evidence.controllerAfterReconnect = controlledAfterReconnect;
  assert(controlledAfterReconnect && controlledAfterReconnect.controlled,
    "La página volvió a cargar online, pero no recuperó el control del Service Worker: " + JSON.stringify(controlledAfterReconnect));
  report.evidence.onlineReconnect = await evaluate(pageSnapshotExpression());
  const serviceWorkerRegistrationAfterReconnect = await evaluate("(async()=>{if(!(\"serviceWorker\" in navigator))return {supported:false};const reg=await navigator.serviceWorker.getRegistration();return {supported:true,scope:reg?reg.scope:null,active:reg&&reg.active?{scriptURL:reg.active.scriptURL,state:reg.active.state}:null,waiting:reg&&reg.waiting?{scriptURL:reg.waiting.scriptURL,state:reg.waiting.state}:null,installing:reg&&reg.installing?{scriptURL:reg.installing.scriptURL,state:reg.installing.state}:null,controller:navigator.serviceWorker.controller?{scriptURL:navigator.serviceWorker.controller.scriptURL}:null}})()");
  report.evidence.serviceWorkerAfterReconnect = serviceWorkerRegistrationAfterReconnect;
  assert(serviceWorkerRegistrationAfterReconnect.supported, "La plataforma no ofrece Service Worker tras reconectar.");
  assert(serviceWorkerRegistrationAfterReconnect.active && serviceWorkerRegistrationAfterReconnect.active.scriptURL.endsWith("/service-worker.js") && serviceWorkerRegistrationAfterReconnect.active.state === "activated", "No quedó un Service Worker activo después de reconectar.");
  assert(reconnected.bodyText.includes("CONECTADO"), "El indicador de la aplicación no volvió al estado CONECTADO tras recuperar internet.");
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