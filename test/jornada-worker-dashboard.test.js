"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const jornada = read("public/js/bc7-jornada-ui.js");
const navigation = read("public/js/permisos-navegacion.js");
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
  assert.match(app, /\["bc7-jornada-ui\.js","7\.63"\]/);
  assert.match(app, /\["jornada-owner-review\.js","1\.15"\]/);
  assert.match(serviceWorker, /BC_SW_VERSION = "9\.5\.158"/);
  assert.match(serviceWorker, /bc7-jornada-ui\.js\?v=7\.63/);
  assert.match(serviceWorker, /jornada-owner-review\.js\?v=1\.15/);
  assert.match(index, /style\.css\?v=9\.5\.158/);
  assert.match(index, /app\.js\?v=9\.5\.158/);
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
 
test("owner review never says there are no blockers while calculation is still incomplete", () => {
  assert.match(ownerReview, /Liquidación calculable · sin bloqueos/);
  assert.match(ownerReview, /Liquidación todavía no calculable/);
  assert.match(ownerReview, /pendingPostCount=Number/);
  assert.match(ownerReview, /movimientos posteriores sin clasificar/);
  assert.doesNotMatch(ownerReview, /Sin bloqueos de cálculo/);
});
