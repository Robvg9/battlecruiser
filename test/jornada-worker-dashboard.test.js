"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const jornada = read("public/js/bc7-jornada-ui.js");
const navigation = read("public/js/permisos-navegacion.js");
const tabNavigation = read("public/js/navegacion.js");
const index = read("public/index.html");
const app = read("public/app.js");
const serviceWorker = read("public/service-worker.js");
const ownerReview = read("public/js/jornada-owner-review.js");

test("Mis jornadas has a real navigation icon and label", () => {
  assert.match(index, /data-tab="mi-jornada"[^>]*>[\s\S]*?class="bc-nav-icon"[^>]*>🗓️/);
  assert.match(index, /data-tab="mi-jornada"[^>]*>[\s\S]*?class="bc-nav-label">Mis jornadas/);
});

test("permission controller removes the native hidden attribute only when access is granted", () => {
  const visibilityStart = navigation.indexOf("function setTabVisible(btn, visible)");
  const visibilityEnd = navigation.indexOf("function asegurarPanelSinPermisos", visibilityStart);
  const tabVisibility = navigation.slice(visibilityStart, visibilityEnd);
  const visibleBranch = tabVisibility.match(/if \(visible\) \{([\s\S]*?)\} else \{/);
  assert.ok(visibleBranch, "setTabVisible must contain explicit visible/hidden branches");
  assert.match(visibleBranch[1], /removeAttribute\("hidden"\)/);
  assert.match(visibleBranch[1], /btn\.hidden\s*=\s*false/);
  assert.match(navigation, /typeof role === "object"[\s\S]*?role\.nombre[\s\S]*?normalized\.indexOf\("dependienta"\)/);
  const hiddenBranch = tabVisibility.match(/\} else \{([\s\S]*?)\n    \}/);
  assert.ok(hiddenBranch);
  assert.match(hiddenBranch[1], /setAttribute\("hidden", ""\)/);
  assert.match(hiddenBranch[1], /btn\.hidden\s*=\s*true/);
});


test("worker dashboard resolves the authenticated lexical user context created by auth.js", () => {
  const start = jornada.indexOf("function currentUser(){");
  const end = jornada.indexOf("function catalogCache()", start);
  assert.ok(start >= 0 && end > start, "currentUser must exist before catalogCache");
  const currentUserSource = jornada.slice(start, end);
  const lexicalUser = vm.runInNewContext(
    'let _usuarioActual={id:"worker-lexical",rol:"Dependienta"};\n' +
      currentUserSource + '\ncurrentUser();',
    { window: {} }
  );
  assert.equal(lexicalUser.id, "worker-lexical");
  assert.equal(lexicalUser.rol, "Dependienta");
  const legacyUser = vm.runInNewContext(
    'let _usuarioActual=null;\n' +
      currentUserSource + '\ncurrentUser();',
    { window: { __bcUser: { id: "worker-legacy", rol: "Dependienta" } } }
  );
  assert.equal(legacyUser.id, "worker-legacy");
});

test("worker dashboard shows the signed-in worker's own jornada list and direct open actions", () => {
  const start = jornada.indexOf("function renderWorkerDashboard()");
  const end = jornada.indexOf("function checklistConfirmButtonHtml", start);
  assert.ok(start >= 0 && end > start, "worker dashboard renderer must exist");
  const render = jornada.slice(start, end);
  assert.match(render, /role\.includes\('dependienta'\)/);
  assert.match(render, /renderWorkerDashboardState\('No pudimos identificar tu perfil'/);
  assert.match(render, /row\.responsable_id[\s\S]*?user\.id/);
  assert.doesNotMatch(render, /role\.includes\('dependienta'\)\s*\|\|\s*state\.admin/);
  assert.match(render, /Mis jornadas/);
  assert.match(render, /data-bc7-open=/);
  assert.match(render, /data-bc7-worker-shortcut=/);
  assert.match(render, /No hay jornadas asignadas/);
  assert.match(jornada, /if\(t\.hasAttribute\('data-bc7-open'\)\)\{await openWorkspace\(t\.dataset\.bc7Open\);return;\}/);
});

test("worker dashboard and owner review release versions are aligned with the precache", () => {
  assert.match(app, /\["permisos-navegacion\.js","67\.9"\]/);
  assert.match(serviceWorker, /permisos-navegacion\.js\?v=67\.9/);
  assert.match(app, /\["bc7-jornada-ui\.js","7\.64"\]/);
  assert.match(app, /\["jornada-owner-review\.js","1\.16"\]/);
  assert.match(serviceWorker, /BC_SW_VERSION = "9\.5\.159"/);
  assert.match(serviceWorker, /bc7-jornada-ui\.js\?v=7\.64/);
  assert.match(serviceWorker, /jornada-owner-review\.js\?v=1\.16/);
  assert.match(index, /style\.css\?v=9\.5\.159/);
  assert.match(index, /app\.js\?v=9\.5\.159/);
});

test("Mis jornadas shows an explicit state while session and calendar startup are pending or failing", () => {
  assert.match(jornada, /function renderWorkerDashboardState\(title,detail,retryAction\)/);
  assert.match(jornada, /role="status" aria-live="polite"/);
  assert.match(jornada, /renderWorkerDashboardState\('Cargando tus jornadas…'/);
  assert.match(jornada, /renderWorkerDashboardState\('Validando tu sesión…'/);
  assert.match(jornada, /data-bc7-worker-retry=/);
  assert.match(jornada, /No se pudo validar la sesión/);
  assert.match(jornada, /No se pudo iniciar Mis jornadas/);
});

test("calendar RPC errors are surfaced in the personal dashboard instead of a false empty state", () => {
  const start = jornada.indexOf("async function loadCalendar(options)");
  const end = jornada.indexOf("function renderCurrentSession", start);
  assert.ok(start >= 0 && end > start, "calendar loader must exist");
  const loader = jornada.slice(start, end);
  assert.match(loader, /state\.calendarLoadError=friendlyError\(e,'calendar'\)/);
  assert.match(loader, /state\.calendarLoading=false/);
  assert.match(loader, /renderWorkerDashboard\(\)/);
  assert.match(loader, /renderWorkerDashboardState\('Cargando tus jornadas…'/);
  assert.match(jornada, /data-bc7-worker-retry="calendar"/);
});
 
test("dependienta home route stays visible and shows a startup state before BC7 auth context resolves", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(index, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  const { document } = window;
  window.safeInit = function (_name, init) { init(); };
  window._usuarioActual = { id: "worker-home-test", rol: "Dependienta" };
  window._permisosCargaExitosa = true;
  window._permisosEfectivos = { turnos: { ver: true } };
  document.getElementById("app-shell").classList.add("visible");

  window.eval(tabNavigation);
  window.eval(navigation);

  const button = document.querySelector('#tabs .tab-btn[data-tab="mi-jornada"]');
  const panel = document.getElementById("tab-mi-jornada");
  const host = document.getElementById("bc-worker-dashboard");
  assert.equal(button.getAttribute("data-bc-permiso"), "1");
  assert.equal(button.classList.contains("active"), true, "Mis jornadas must be selected as the dependienta home");
  assert.equal(panel.hidden, false, "the permitted personal panel must lose its native hidden state");
  assert.equal(panel.classList.contains("visible"), true, "the selected personal panel must be visible");
  assert.equal(host.textContent.trim(), "", "the dashboard host starts empty before BC7 is loaded");

  window.eval(jornada);
  if (document.readyState === "loading") {
    document.dispatchEvent(new window.Event("DOMContentLoaded"));
  }

  assert.match(host.textContent, /Validando tu sesión/);
  assert.ok(host.querySelector('[role="status"][aria-live="polite"]'));
  assert.equal(panel.hidden, false);
  assert.equal(panel.classList.contains("visible"), true);
  dom.window.close();
});

test("owner review never says there are no blockers while calculation is still incomplete", () => {
  assert.match(ownerReview, /Liquidación calculable · sin bloqueos/);
  assert.match(ownerReview, /Liquidación todavía no calculable/);
  assert.match(ownerReview, /pendingPostCount=Math\\.max/);
  assert.match(ownerReview, /movimientos posteriores sin clasificar/);
  assert.doesNotMatch(ownerReview, /Sin bloqueos de cálculo/);
});
