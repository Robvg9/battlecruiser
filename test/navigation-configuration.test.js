"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const index = fs.readFileSync("public/index.html", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const serviceWorker = fs.readFileSync("public/service-worker.js", "utf8");
const visual = fs.readFileSync("public/js/ui-visual-salon.js", "utf8");
const permissions = fs.readFileSync("public/js/permisos-navegacion.js", "utf8");
const regression = fs.readFileSync("public/js/hotfix-regresiones-20260902.js", "utf8");

const navigation = fs.readFileSync("public/js/navegacion.js", "utf8");
const sectionVisibility = fs.readFileSync("public/js/hotfix-secciones-visibles-20260903.js", "utf8");
const hideVales = fs.readFileSync("public/js/m12-fe5-hide-vales.js", "utf8");


test("RWHT navigation contract: 20 logical routes, 17 visible destinations, hidden-route aliases preserved", () => {
  const routeIds = [...index.matchAll(/<button\b[^>]*\bdata-tab="([^"]+)"/g)].map(match => match[1]);
  const panelIds = [...index.matchAll(/<section\b[^>]*\bid="tab-([^"]+)"/g)].map(match => match[1]);
  const expectedVisible = [
    "resumen", "jornada", "productos", "ventas", "almacenes", "pendientes", "reportes",
    "inventario", "movimientos", "ciclos", "operacion", "comunicacion",
    "mando", "usuarios", "config", "conectividad", "preferencias",
  ];
  const expectedHidden = ["transferencias", "vales", "turnos"];

  assert.equal(routeIds.length, 20, "the source declares 20 logical navigation buttons");
  assert.equal(new Set(routeIds).size, 20, "logical navigation IDs must be unique");
  assert.equal(panelIds.length, 20, "the source declares 20 logical tab panels");
  assert.deepEqual(
    [...new Set(panelIds)].sort(),
    [...new Set(routeIds)].sort(),
    "each declared route must have exactly one matching tab panel"
  );
  assert.deepEqual(
    routeIds.filter(id => !expectedHidden.includes(id)).sort(),
    expectedVisible.slice().sort(),
    "the visible route contract must be the documented 17 destinations"
  );

  for (const id of expectedHidden) {
    assert.ok(routeIds.includes(id), "hidden/aliased logical route must remain explicit: " + id);
  }
  assert.match(permissions, /var RUTAS_SIEMPRE_OCULTAS/);
  assert.match(permissions, /var EXCEPCIONES_PERSONALES/);
  assert.match(permissions, /return !!seccion && tienePermiso\(seccion, "ver"\)/);
  assert.match(sectionVisibility, /aplicarPermisosAInterfaz/);
  assert.doesNotMatch(sectionVisibility, /KEEP_HIDDEN|setProperty/);
  assert.match(navigation, /if \(tab === "turnos"\) \{\s*var ciclosBtn = document\.querySelector\('\.tab-btn\[data-tab="ciclos"\]'\);\s*if \(ciclosBtn\) tab = "ciclos";\s*\}/);
  assert.match(app, /m12-fe5-hide-vales\.js/);
  assert.match(hideVales, /removeChild\(panel\)/, "Vales panel is deliberately removed by the loaded module");
});


test("Configuración agrupa Conectividad y Preferencias; Administración conserva su panel", () => {
  const normalizedIndex = index.replace(/\r\n/g, "\n");
  const groupStart = normalizedIndex.indexOf('<div class="bc-nav-group expanded" id="nav-config-group">');
  const groupStop = normalizedIndex.indexOf("</div>\n        </div>", groupStart);
  assert.ok(groupStart >= 0, "debe existir el grupo padre Configuración");
  assert.ok(groupStop > groupStart, "el grupo y las subsecciones deben estar anidados");
  const groupMarkup = normalizedIndex.slice(groupStart, groupStop);
  assert.match(groupMarkup, /id="nav-config-toggle"[^>]*aria-expanded="true"/);
  assert.match(groupMarkup, /id="nav-config-subtabs"/);
  assert.match(groupMarkup, /data-tab="conectividad">Conectividad/);
  assert.match(groupMarkup, /data-tab="preferencias">Preferencias/);
  assert.match(index, /<button class="tab-btn" data-tab="config">Administración<\/button>/);
  const start = index.indexOf('<section id="tab-config"');
  const admin = index.slice(start, index.indexOf("</section>", start));
  assert.match(admin, /<h2>Administración<\/h2>/);
  assert.doesNotMatch(groupMarkup, /data-tab="config"/);
});

test("Conectividad y Preferencias tienen iconos SVG, y el grupo tiene desplegable funcional", async () => {
  assert.match(visual, /conectividad:\s*SVG\.pulse/);
  assert.match(visual, /preferencias:\s*SVG\.sliders/);
  assert.match(visual, /function wireConfigGroup\(\)/);
  assert.match(visual, /bc-nav-group\.expanded \.bc-nav-group-items\{display:flex\}/);
  const dom = new JSDOM(index, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  window.eval(visual);
  await new Promise(resolve => window.setTimeout(resolve, 25));
  const toggle = window.document.getElementById("nav-config-toggle");
  const group = window.document.getElementById("nav-config-group");
  assert.ok(toggle && group);
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(group.classList.contains("expanded"), false);
  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(group.classList.contains("expanded"), true);
  dom.window.close();
});

test("el panel de Administración se oculta cuando no es la pestaña seleccionada", () => {
  assert.match(regression, /#tab-config\.bc-reg-config-ready\.visible\{display:block!important\}/);
  assert.doesNotMatch(regression, /#tab-config\.bc-reg-config-ready\{display:block!important\}/);
  assert.match(index, /<section id="tab-config" class="tab-panel">/);
});

test("al abrirse el shell, toda la navegación permanece cerrada hasta validar el perfil y los permisos", async () => {
  const html = index.replace('<div class="app-shell" id="app-shell">', '<div class="app-shell visible" id="app-shell">');
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  const { document } = window;
  window.console.warn = () => {};
  window._usuarioActual = { id: "u-pendiente", rol: null };
  window._permisosCargaExitosa = false;
  window._permisosEfectivos = {};
  window.irATab = function () {};
  window.eval(permissions);
  await new Promise(resolve => window.setTimeout(resolve, 25));
  assert.equal(document.getElementById("tabs").getAttribute("data-bc-permissions-ready"), "0");
  for (const button of document.querySelectorAll('#tabs .tab-btn[data-tab]')) {
    assert.equal(button.getAttribute("data-bc-permiso"), "0", "no se habilita sin permiso confirmado: " + button.dataset.tab);
    assert.equal(button.classList.contains("hidden"), true, "menú cerrado durante carga: " + button.dataset.tab);
  }
  assert.equal(document.querySelector("#tabs .tab-btn.active"), null, "no debe quedar navegación activa sin permisos");
  assert.equal(document.getElementById("form-categoria").classList.contains("hidden"), true);
  assert.equal(document.getElementById("form-unidad").classList.contains("hidden"), true);
  assert.equal(document.getElementById("form-responsabilidad").classList.contains("hidden"), true);
  dom.window.close();
});

test("app shell, application and Service Worker share 9.5.38 and load refreshed navigation modules", () => {
  assert.match(app, /const VERSION="9.5.39"/);
  assert.match(serviceWorker, /BC_SW_VERSION = "9.5.39"/);
  assert.match(index, /href="style\.css\?v=9.5.39"/);
  assert.match(index, /<script src="app\.js\?v=9.5.39"><\/script>/);
  assert.match(app, /\["permisos-navegacion\.js","67\.4"\]/);
  assert.match(app, /\["bc7-jornada-ui\.js","7\.5"\]/);
  assert.match(app, /\["ui-visual-salon\.js","54\.2"\]/);
  assert.match(app, /\["hotfix-regresiones-20260902\.js","20261020\.5"\]/);
  assert.match(app, /\["hotfix-secciones-visibles-20260903\.js","20261026\.1"\]/);
});
