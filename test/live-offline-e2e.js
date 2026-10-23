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
const ANDROID_HEADER_SCREENSHOT_PATH = path.join(OUTPUT_DIR, "battlecruiser-android-header-layout.png");
const CORE_PATHS = ["/", "/index.html", "/app.js", "/style.css"];
const SUPABASE_CDN_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js";
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
async function reloadAndWait(ignoreCache = true) {
  const loaded = waitForEvent("Page.loadEventFired", TIMEOUT_MS);
  // Hard reloads bypass the Service Worker in Chromium; only use them for the
  // offline cache probe. The online reconnect must be a normal navigation.
  await cdpCommand("Page.reload", ignoreCache ? { ignoreCache: true } : {});
  await loaded;
  await delay(500);
}
function pageSnapshotExpression() {
  return "(()=>({readyState:document.readyState,title:document.title,bodyText:(document.body&&document.body.innerText||'').slice(0,1400),version:window.__BC_VERSION__||null,loginForm:!!document.querySelector('#login-form'),usernameField:!!document.querySelector('#email'),passwordField:!!document.querySelector('#password'),supabaseAvailable:!!(window.supabase&&typeof window.supabase.createClient==='function'),clientDefined:typeof client!=='undefined',localStylesheet:!!document.querySelector('link[rel=stylesheet][href*=\\\"style.css\\\"]'),online:navigator.onLine,controller:!!(navigator.serviceWorker&&navigator.serviceWorker.controller),controllerScript:navigator.serviceWorker&&navigator.serviceWorker.controller?navigator.serviceWorker.controller.scriptURL:null,href:location.href}))()";
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
  const isProductionBase = BASE_URL === "https://battlecruiser.robvg9.workers.dev";
  const expectedReleaseSha = String(process.env.BC_EXPECTED_RELEASE_SHA || "").trim().toLowerCase();
  if (isProductionBase) {
    assert(/^[0-9a-f]{40}$/.test(expectedReleaseSha), "BC_EXPECTED_RELEASE_SHA no es un SHA Git completo para LIVE.");
  }

  for (const assetPath of assetPaths) {
    const isMainJs = assetPath === "/app.js" || assetPath === "/service-worker.js";
    const maxAttempts = isProductionBase && isMainJs ? 30 : 1;
    const sourceReference = assetPath === "/app.js" ? appSource
      : assetPath === "/service-worker.js" ? swSource
      : assetPath === "/index.html" ? sourceIndex : sourceCss;
    let live = null;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const candidate = await fetchText(BASE_URL + assetPath + "?bc_live_offline_e2e=" + Date.now() + "-" + attempt);
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
    let release = null;
    let lastReleaseError = null;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        const response = await fetchText(BASE_URL + "/" + releaseFilename + "?bc_live_release_e2e=" + Date.now() + "-" + attempt);
        assert(response.status >= 200 && response.status < 300,
          "LIVE " + releaseFilename + " devolvió HTTP " + response.status + ".");
        const parsed = JSON.parse(response.body);
        const expected = {
          source_sha: expectedReleaseSha,
          app_version: expectedVersion,
          service_worker_version: swVersionMatch[1],
        };
        for (const key of Object.keys(expected)) {
          assert(String(parsed[key] || "").toLowerCase() === String(expected[key]).toLowerCase(),
            "LIVE " + releaseFilename + " no coincide en " + key + ": esperado " + expected[key] + ", recibido " + parsed[key] + ".");
        }
        assert(/^\d+$/.test(String(parsed.workflow_run_id || "")),
          "LIVE " + releaseFilename + " no trae workflow_run_id válido.");
        release = parsed;
        report.evidence.releaseManifestUrl = BASE_URL + "/" + releaseFilename;
        break;
      } catch (error) {
        lastReleaseError = error;
      }
      if (attempt < 30) await delay(3000);
    }
    assert(release, "No se obtuvo el manifiesto de release esperado " + releaseFilename + ". Último error: "
      + (lastReleaseError ? lastReleaseError.message : "desconocido"));
    report.evidence.releaseProvenance = release;
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

  // Reproduce en Chromium real la integración que antes quitaba M26:
  // el toolbar debe pertenecer al panel Productos y sobrevivir a abrir/cerrar.
  const nomenclatureInitial = await waitUntil(
    "toolbar de nomenclatura dentro del panel Productos",
    "(()=>{const p=document.querySelector('#tab-productos');const t=document.querySelector('#productos-tools-nomenclatura');const b=document.querySelector('#productos-nomenclatura-btn');return p&&t&&b&&p.contains(t)&&p.contains(b)?{present:true,version:window.__BC_VERSION__||null,toolbarParent:p.id}:null})()",
    10000
  );
  await delay(2500);
  const nomenclatureStable = await evaluate("(()=>{const p=document.querySelector('#tab-productos');const t=document.querySelector('#productos-tools-nomenclatura');const b=document.querySelector('#productos-nomenclatura-btn');return {present:!!b,toolbarInsideProducts:!!(p&&t&&b&&p.contains(t)&&p.contains(b)),uiReady:window.__BC_UI_READY_RESOLVED__===true,version:window.__BC_VERSION__||null}})()");
  assert(nomenclatureStable.present && nomenclatureStable.toolbarInsideProducts,
    "El toolbar de nomenclatura no sobrevivió a la limpieza M26 en Chromium real: "+JSON.stringify(nomenclatureStable));
  const nomenclatureCycle = await evaluate("(async()=>{const product=document.querySelector('#tab-productos');const button=document.querySelector('#productos-nomenclatura-btn');const modal=document.querySelector('#productos-nomenclatura-modal');const config=document.querySelector('#tab-config');if(!product||!button||!modal||!config)return {ready:false};const parentBefore=config.parentElement;button.click();await new Promise(r=>setTimeout(r,250));const opened=!modal.classList.contains('hidden');const openState={opened,toolbarKept:product.contains(button),configParentKept:config.parentElement===parentBefore,configOutsideModal:!modal.contains(config),categoriesMoved:!!(document.querySelector('#prod-nom-categorias-slot')&&document.querySelector('#lista-categorias')&&document.querySelector('#prod-nom-categorias-slot').contains(document.querySelector('#lista-categorias'))),unitsMoved:!!(document.querySelector('#prod-nom-unidades-slot')&&document.querySelector('#lista-unidades')&&document.querySelector('#prod-nom-unidades-slot').contains(document.querySelector('#lista-unidades')))};const close=document.querySelector('#productos-nomenclatura-cerrar');if(close)close.click();await new Promise(r=>setTimeout(r,200));return {ready:true,open:openState,closed:modal.classList.contains('hidden'),configParentRestored:config.parentElement===parentBefore,configOutsideModal:!modal.contains(config),toolbarKept:product.contains(button)}})()");
  assert(nomenclatureCycle.ready && nomenclatureCycle.open.opened,
    "No se pudo abrir el modal Nomenclatura en Chromium real: "+JSON.stringify(nomenclatureCycle));
  assert(nomenclatureCycle.open.toolbarKept && nomenclatureCycle.open.configParentKept && nomenclatureCycle.open.configOutsideModal,
    "Abrir Nomenclatura movió o perdió el panel Configuración: "+JSON.stringify(nomenclatureCycle));
  assert(nomenclatureCycle.open.categoriesMoved && nomenclatureCycle.open.unitsMoved,
    "Los catálogos no llegaron a sus slots de modal: "+JSON.stringify(nomenclatureCycle));
  assert(nomenclatureCycle.closed && nomenclatureCycle.configParentRestored && nomenclatureCycle.configOutsideModal && nomenclatureCycle.toolbarKept,
    "Cerrar Nomenclatura no restauró Configuración o el toolbar: "+JSON.stringify(nomenclatureCycle));
  report.evidence.productNomenclatureUi = {
    initial: nomenclatureInitial,
    settled: nomenclatureStable,
    openClose: nomenclatureCycle,
    browser: "Chromium CDP",
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
  const mobileHeader = await evaluate("(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();const s=getComputedStyle(e);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,display:s.display,gridArea:s.gridArea};};const shell=document.querySelector('#app-shell');const login=document.querySelector('#login-form');const header=document.querySelector('.app-header');if(login)login.classList.add('hidden');if(shell)shell.classList.add('visible');const finish=()=>{const brand=header&&header.querySelector('.header-left');const logout=header&&header.querySelector('#logout-btn');resolve({ready:document.readyState==='complete',viewportWidth:innerWidth,viewportHeight:innerHeight,documentWidth:document.documentElement.scrollWidth,header:box(header),headerDisplay:header?getComputedStyle(header).display:null,brand:box(brand),title:box(header&&header.querySelector('h1')),logout:box(logout),rightOverflow:!!(header&&logout&&logout.getBoundingClientRect().right>header.getBoundingClientRect().right+1),brandLogoutOverlap:!!(brand&&logout&&logout.getBoundingClientRect().left<brand.getBoundingClientRect().right-1)});};requestAnimationFrame(finish);}))))()");
  report.evidence.androidMobileHeader = mobileHeader;
  assert(mobileHeader.ready && mobileHeader.header && mobileHeader.brand && mobileHeader.logout,
    "No se pudo medir el encabezado móvil en Chromium: " + JSON.stringify(mobileHeader));
  assert(mobileHeader.viewportWidth === 360, "Chromium no aplicó el viewport móvil 360px: " + JSON.stringify(mobileHeader));
  assert(mobileHeader.headerDisplay === "grid" && mobileHeader.logout.gridArea === "logout",
    "Logout no ocupa la celda superior derecha del grid móvil: " + JSON.stringify(mobileHeader));
  assert(!mobileHeader.brandLogoutOverlap, "Logout se solapa con el logo/título en 360px: " + JSON.stringify(mobileHeader));
  assert(!mobileHeader.rightOverflow && mobileHeader.logout.right <= mobileHeader.header.right + 1,
    "Logout se sale del encabezado por la derecha en 360px: " + JSON.stringify(mobileHeader));
  assert(Math.abs(mobileHeader.logout.top - mobileHeader.brand.top) <= 18,
    "Logout no está alineado en la fila superior con el título: " + JSON.stringify(mobileHeader));

  const mobileMenuProbe = await evaluate("(()=>{const header=document.querySelector('.app-header');const toggle=document.querySelector('#sidebar-toggle-btn');const logout=document.querySelector('#logout-btn');const sidebar=document.querySelector('#sidebar');const backdrop=document.querySelector('#sidebar-backdrop');const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};if(!header||!toggle||!logout||!sidebar||!backdrop)return {found:false};const hb=rect(header),tb=rect(toggle),lb=rect(logout);const display=getComputedStyle(toggle).display;toggle.click();const opened=sidebar.classList.contains('open')&&backdrop.classList.contains('visible')&&toggle.getAttribute('aria-expanded')==='true';const close=document.querySelector('#sidebar-close-btn');if(close)close.click();return {found:true,display:display,button:tb,logout:lb,header:hb,withinMargins:!!(tb&&lb&&hb&&tb.left>=hb.left+2&&lb.right<=hb.right-2),opened:opened,closed:!sidebar.classList.contains('open')&&!backdrop.classList.contains('visible')&&toggle.getAttribute('aria-expanded')==='false'};})()");
  report.evidence.androidMenuToggle = mobileMenuProbe;
  assert(mobileMenuProbe.found && mobileMenuProbe.display !== "none" &&
         mobileMenuProbe.button.width >= 36 && mobileMenuProbe.button.height >= 36 &&
         mobileMenuProbe.withinMargins && mobileMenuProbe.opened && mobileMenuProbe.closed,
    "El menú lateral no es visible/usable, no tiene márgenes o no abre/cierra en móvil: " + JSON.stringify(mobileMenuProbe));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const androidHeaderScreenshot = await cdpCommand("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  fs.writeFileSync(ANDROID_HEADER_SCREENSHOT_PATH, Buffer.from(androidHeaderScreenshot.data, "base64"));
  report.evidence.androidMobileHeader.screenshot = ANDROID_HEADER_SCREENSHOT_PATH;
  report.evidence.androidMobileHeader.environment = "Chromium CDP mobile emulation 360x800 @ deviceScaleFactor 2; no es una prueba en Android físico.";

  // Verify mobile content uses page scrolling and critical settings remain reachable.
  const mobileContentLayout = await evaluate("(()=>{const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();const s=getComputedStyle(e);return {top:r.top,bottom:r.bottom,height:r.height,position:s.position,overflowX:s.overflowX,overflowY:s.overflowY,cssHeight:s.height,maxHeight:s.maxHeight,flex:s.flex,inlineStyle:e.getAttribute('style'),clientHeight:e.clientHeight,scrollHeight:e.scrollHeight};};const main=document.querySelector('.main-content');const footer=document.querySelector('.app-footer');const shell=document.querySelector('#app-shell');return {viewportWidth:innerWidth,viewportHeight:innerHeight,documentHeight:document.documentElement.scrollHeight,bodyHeight:document.body.scrollHeight,bodyComputedHeight:getComputedStyle(document.body).height,bodyDisplay:getComputedStyle(document.body).display,bodyOverflowY:getComputedStyle(document.body).overflowY,bodyClientHeight:document.body.clientHeight,htmlClientHeight:document.documentElement.clientHeight,shellDisplay:shell?getComputedStyle(shell).display:null,shell:box(shell),main:box(main),footer:box(footer),gap:main&&footer?footer.getBoundingClientRect().top-main.getBoundingClientRect().bottom:null};})()");
  report.evidence.androidMobileContentLayout = mobileContentLayout;
  assert(mobileContentLayout.main && mobileContentLayout.footer,
    "No se pudo medir el panel principal y el pie en el viewport móvil: " + JSON.stringify(mobileContentLayout));
  assert(mobileContentLayout.main.overflowY === "visible" &&
         mobileContentLayout.main.scrollHeight <= mobileContentLayout.main.clientHeight + 1,
    "El panel principal sigue recortado en un scroll interno en móvil: " + JSON.stringify(mobileContentLayout));
  assert(mobileContentLayout.documentHeight > mobileContentLayout.viewportHeight,
    "El documento móvil no crece para alojar el contenido completo: " + JSON.stringify(mobileContentLayout));
  const documentScrollProbe = await evaluate("(()=>new Promise(resolve=>{const max=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)-innerHeight;window.scrollTo(0,Math.max(0,max));requestAnimationFrame(()=>{const moved=window.scrollY;window.scrollTo(0,0);resolve({maxScroll:max,scrollYAfterDown:moved,scrollable:moved>0});});}))()");
  report.evidence.androidDocumentScroll = documentScrollProbe;
  assert(documentScrollProbe.maxScroll > 0 && documentScrollProbe.scrollable,
    "El dashboard móvil no responde al desplazamiento del documento: " + JSON.stringify(documentScrollProbe));

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
  const configAdminReady = "(()=>{const t=document.querySelector('#tab-config');const b=document.querySelector('#tabs .tab-btn[data-tab=config]');const state={panelExists:!!t,panelVisible:!!(t&&t.classList.contains('visible')),panelClasses:t?t.className:null,panelDisplay:t?getComputedStyle(t).display:null,buttonExists:!!b,buttonClasses:b?b.className:null,buttonDisplay:b?getComputedStyle(b).display:null,buttonInlineDisplay:b?b.style.display:null,buttonPermit:b?b.getAttribute('data-bc-permiso'):null,roleEntry:!!(t&&t.querySelector('#bc-btn-config-roles')),roleFormMoved:!!document.querySelector('#bc-modal-nuevo-rol #form-nuevo-rol'),roleListMoved:!!document.querySelector('#bc-modal-roles-permisos #lista-roles'),categoryForm:!!(t&&t.querySelector('#form-categoria')),unitForm:!!(t&&t.querySelector('#form-unidad')),legacyPanel:!!(t&&t.querySelector('#bc-aj-panel')),activeTab:document.querySelector('#tabs .tab-btn.active')?.dataset.tab||null};window.__BC_CONFIG_ADMIN_TEST_STATE__=state;return !!(state.panelExists&&state.panelVisible&&state.roleEntry&&state.roleFormMoved&&state.roleListMoved&&state.categoryForm&&state.unitForm&&!state.legacyPanel);})()";
  try {
    await waitUntil("Configuración de administración y catálogos", configAdminReady, 10000);
  } catch (error) {
    report.evidence.configAdminFailureState = await evaluate("window.__BC_CONFIG_ADMIN_TEST_STATE__||null");
    throw error;
  }
  const rolesOpened = await evaluate("(()=>{const b=document.querySelector('#tab-config #bc-btn-config-roles');if(!b)return {entry:false,opened:false};b.click();const m=document.querySelector('#bc-modal-roles-permisos');return {entry:true,opened:!!(m&&m.classList.contains('open')),listInsideModal:!!(m&&m.querySelector('#lista-roles'))}})()");
  report.evidence.configRolesModal = rolesOpened;
  assert(rolesOpened.entry && rolesOpened.opened && rolesOpened.listInsideModal,
    "Configuración no abre el modal existente de Roles y Permisos: " + JSON.stringify(rolesOpened));
  await evaluate("(()=>{const b=document.querySelector('#bc-modal-roles-permisos [data-bc-roles-close=\"1\"]');if(b)b.click();return true})()");
  await waitUntil("cierre del modal Roles y Permisos", "(()=>{const m=document.querySelector('#bc-modal-roles-permisos');return !!(m&&!m.classList.contains('open'))})()", 3000);

  // Regression test: do not merely call scrollIntoView; emulate a real vertical finger swipe.
  // The installed Android PWA reported that Configuración remained impossible to scroll.
  const mobileConfigScrollInitial = await evaluate("(()=>{const tab=document.querySelector('#tab-config');if(!tab)return null;window.scrollTo(0,0);tab.scrollTop=0;const r=tab.getBoundingClientRect();const s=getComputedStyle(tab);return {found:true,regionClass:tab.classList.contains('bc-config-scroll-region'),overflowY:s.overflowY,top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollHeight:tab.scrollHeight,clientHeight:tab.clientHeight,scrollTop:tab.scrollTop,bodyLock:document.body.classList.contains('bc-aj-open')}})()");
  report.evidence.androidConfigScrollInitial = mobileConfigScrollInitial;
  assert(mobileConfigScrollInitial && mobileConfigScrollInitial.found &&
         mobileConfigScrollInitial.regionClass &&
         (mobileConfigScrollInitial.overflowY === "auto" || mobileConfigScrollInitial.overflowY === "scroll") &&
         mobileConfigScrollInitial.scrollHeight > mobileConfigScrollInitial.clientHeight + 80 &&
         !mobileConfigScrollInitial.bodyLock,
    "Configuración no tiene una región táctil desplazable real: " + JSON.stringify(mobileConfigScrollInitial));

  const configSwipe = await evaluate("(()=>{const tab=document.querySelector('#tab-config');if(!tab)return null;const r=tab.getBoundingClientRect();const top=Math.max(2,r.top+8);const bottom=Math.min(innerHeight-2,r.bottom-8);const distance=Math.min(220,bottom-top-30);return {x:Math.round(r.left+r.width*0.45),startY:Math.round(bottom-10),endY:Math.round(bottom-10-distance),distance:Math.round(distance)}})()");
  assert(configSwipe && configSwipe.distance >= 100,
    "No hay una zona visible suficiente para probar el gesto de scroll táctil: " + JSON.stringify(configSwipe));
  await cdpCommand("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await cdpCommand("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: configSwipe.x, y: configSwipe.startY, id: 0, radiusX: 3, radiusY: 3, force: 1 }],
  });
  for (let step = 1; step <= 6; step++) {
    await delay(35);
    const y = Math.round(configSwipe.startY + (configSwipe.endY - configSwipe.startY) * step / 6);
    await cdpCommand("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: configSwipe.x, y, id: 0, radiusX: 3, radiusY: 3, force: 1 }],
    });
  }
  await cdpCommand("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await delay(250);
  const mobileConfigScrollAfter = await evaluate("(()=>{const tab=document.querySelector('#tab-config');return tab?{scrollTop:tab.scrollTop,scrollHeight:tab.scrollHeight,clientHeight:tab.clientHeight,windowScrollY:window.scrollY}:null})()");
  report.evidence.androidConfigScrollGesture = {
    initial: mobileConfigScrollInitial,
    swipe: configSwipe,
    after: mobileConfigScrollAfter,
    method: "Chromium CDP touchStart/touchMove/touchEnd in 360x800 mobile emulation; not a physical Android test.",
  };
  await cdpCommand("Emulation.setTouchEmulationEnabled", { enabled: false });
  assert(mobileConfigScrollAfter && mobileConfigScrollAfter.scrollTop > mobileConfigScrollInitial.scrollTop + 20,
    "El gesto vertical simulado no desplazó Configuración. Antes=" + JSON.stringify(mobileConfigScrollInitial) +
      "; gesto=" + JSON.stringify(configSwipe) + "; después=" + JSON.stringify(mobileConfigScrollAfter));

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
  assert(reconnected.readyState === "complete", "La PWA no terminó de cargar tras reconectar.");
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