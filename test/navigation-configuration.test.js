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

test("Configuración agrupa Conectividad y Preferencias; Administración conserva su panel", () => {
  const groupStart = index.indexOf('<div class="bc-nav-group expanded" id="nav-config-group">');
  const groupStop = index.indexOf("</div>\n        </div>", groupStart);
  assert.ok(groupStart >= 0, "debe existir el grupo padre Configuración");
  assert.ok(groupStop > groupStart, "el grupo y las subsecciones deben estar anidados");
  const groupMarkup = index.slice(groupStart, groupStop);
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

test("Conectividad y Preferencias tienen iconos SVG, y el grupo tiene desplegable funcional", () => {
  assert.match(visual, /conectividad:\s*SVG\.pulse/);
  assert.match(visual, /preferencias:\s*SVG\.sliders/);
  assert.match(visual, /function wireConfigGroup\(\)/);
  assert.match(visual, /bc-nav-group\.expanded \.bc-nav-group-items\{display:flex\}/);
  const dom = new JSDOM(index, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  window.eval(visual);
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

test("al abrirse el shell, las pestañas están disponibles durante la carga del usuario sin habilitar formularios sensibles", async () => {
  const html = index.replace('<div class="app-shell" id="app-shell">', '<div class="app-shell visible" id="app-shell">');
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  const { document } = window;
  window.console.warn = () => {};
  window._usuarioActual = null;
  window._permisosCargaExitosa = false;
  window._permisosEfectivos = {};
  window.irATab = function (tab) {
    const btn = document.querySelector('#tabs .tab-btn[data-tab="' + tab + '"]');
    if (!btn || btn.classList.contains("hidden")) return;
    document.querySelectorAll("#tabs .tab-btn.active").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".tab-panel.visible").forEach(x => x.classList.remove("visible"));
    btn.classList.add("active");
    const panel = document.getElementById("tab-" + tab);
    if (panel) panel.classList.add("visible");
  };
  window.eval(permissions);
  await new Promise(resolve => window.setTimeout(resolve, 25));
  for (const name of ["resumen","productos","ventas","almacenes","pendientes","reportes","inventario","movimientos","ciclos","operacion","comunicacion","mando","usuarios","config","conectividad","preferencias"]) {
    const button = document.querySelector('#tabs .tab-btn[data-tab="' + name + '"]');
    assert.ok(button, "falta navegación: " + name);
    assert.notEqual(button.getAttribute("data-bc-permiso"), "0", "pestaña bloqueada durante carga: " + name);
    assert.equal(button.classList.contains("hidden"), false, "pestaña oculta durante carga: " + name);
  }
  for (const name of ["transferencias","vales","turnos"]) {
    const button = document.querySelector('#tabs .tab-btn[data-tab="' + name + '"]');
    if (button) assert.equal(button.getAttribute("data-bc-permiso"), "0", "se mantienen fuera del menú: " + name);
  }
  assert.equal(document.querySelector('#tabs .tab-btn[data-tab="resumen"]').classList.contains("active"), true);
  assert.equal(document.getElementById("tab-resumen").classList.contains("visible"), true);
  assert.equal(document.getElementById("form-nuevo-rol").classList.contains("hidden"), true);
  assert.equal(document.getElementById("form-categoria").classList.contains("hidden"), true);
  assert.equal(document.getElementById("form-unidad").classList.contains("hidden"), true);
  dom.window.close();
});

test("app shell, application and Service Worker share 9.5.7 and load refreshed navigation modules", () => {
  assert.match(app, /const VERSION="9\.5\.7"/);
  assert.match(serviceWorker, /BC_SW_VERSION = "9\.5\.7"/);
  assert.match(index, /href="style\.css\?v=9\.5\.7"/);
  assert.match(index, /<script src="app\.js\?v=9\.5\.7"><\/script>/);
  assert.match(app, /\["permisos-navegacion\.js","67\.3"\]/);
  assert.match(app, /\["ui-visual-salon\.js","54\.2"\]/);
  assert.match(app, /\["hotfix-regresiones-20260902\.js","20261020\.5"\]/);
  assert.match(app, /\["hotfix-secciones-visibles-20260903\.js","20261020\.5"\]/);
});
