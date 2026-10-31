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
const fixPermissionLoad = fs.readFileSync("public/js/fix-permisos-carga.js", "utf8");
const operationsHub = fs.readFileSync("public/js/ui-operaciones-hub.js", "utf8");
const pulido = fs.readFileSync("public/js/hotfix-pulido-20260903.js", "utf8");
const pulidoB = fs.readFileSync("public/js/hotfix-pulido-20260903b.js", "utf8");
const sectionScope = fs.readFileSync("public/js/section-scope-fix.js", "utf8");
const finalLoader = fs.readFileSync("public/js/hotfix-17-final-loader-20260903.js", "utf8");


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
  assert.match(permissions, /RUTAS_SIEMPRE_OCULTAS/);
  assert.match(permissions, /function puedeVerRuta\(tab\)/);
  assert.match(permissions, /jornada: "turnos"/);
  assert.doesNotMatch(sectionVisibility, /KEEP_HIDDEN/);
  assert.doesNotMatch(sectionVisibility, /setImportantStyle|normalizarPanelConfigActivo/);
  assert.match(index, /data-bc-permisos-cargados="1"/);
  assert.match(index, /:not\(\[data-bc-permisos-cargados="1"\]\)/);
  assert.match(navigation, /getAttribute\("data-bc-permiso"\) !== "1"/);
  assert.match(navigation, /addEventListener\("click",[\s\S]*?true\);/);
  assert.doesNotMatch(fixPermissionLoad, /permisoDegradado|__bcTienePermisoDegradacion/);
  assert.match(operationsHub, /can\(seccion, 'ver'\) && can\(seccion, 'crear'\)/);
  assert.match(operationsHub, /can\('gastos', 'ver'\) && can\('gastos', 'crear'\)/);
  assert.match(pulido, /function normalizarEtiquetaConfig/);
  assert.doesNotMatch(pulido, /data-tab=config\]\{display:flex!important|b\.style\.display='flex'|function configVisible/);
  assert.doesNotMatch(pulidoB, /t\.style\.display='flex'/);
  assert.match(sectionScope, /data-bc-permisos-cargados/);
  assert.match(sectionScope, /target\.getAttribute\('data-bc-permiso'\) === '1'/);
  assert.match(sectionVisibility, /LABELS = \{ config: "Administración", ciclos: "Turnos" \}/);
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

test("al abrirse el shell, todas las rutas y paneles permanecen cerrados hasta cargar permisos", async () => {
  const html = index.replace('<div class="app-shell" id="app-shell">', '<div class="app-shell visible" id="app-shell">');
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  const { document } = window;
  window.console.warn = () => {};
  window._usuarioActual = null;
  window._permisosCargaExitosa = false;
  window._permisosEfectivos = {};
  window.eval(permissions);
  await new Promise(resolve => window.setTimeout(resolve, 20));
  assert.equal(document.getElementById("app-shell").getAttribute("data-bc-permisos-cargados"), "0");
  for (const button of document.querySelectorAll("#tabs .tab-btn[data-tab]")) {
    assert.equal(button.getAttribute("data-bc-permiso"), "0", "ruta abierta sin permisos: " + button.dataset.tab);
    assert.equal(button.classList.contains("hidden"), true, "ruta no oculta durante carga: " + button.dataset.tab);
  }
  for (const panel of document.querySelectorAll(".main-content > .tab-panel")) {
    assert.equal(panel.getAttribute("data-bc-permiso"), "0", "panel abierto sin permisos: " + panel.id);
    assert.equal(panel.classList.contains("visible"), false, "panel visible durante carga: " + panel.id);
  }
  assert.equal(document.getElementById("form-categoria").classList.contains("hidden"), true);
  assert.equal(document.getElementById("form-unidad").classList.contains("hidden"), true);
  dom.window.close();
});

test("la Dependienta ve solo módulos concedidos y conserva las excepciones personales", async () => {
  const html = index.replace('<div class="app-shell" id="app-shell">', '<div class="app-shell visible" id="app-shell">');
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  const { document } = window;
  window.console.warn = () => {};
  window._usuarioActual = { id: "dependienta-test", rol: "Dependienta" };
  window._permisosCargaExitosa = true;
  window._permisosEfectivos = {
    comunicacion: { ver: true, crear: true },
    gastos: { ver: true, crear: true },
    incidencias: { ver: true, crear: true },
    mermas: { ver: true, crear: true },
    turnos: { ver: true },
    ventas: { ver: true, crear: true }
  };
  window.eval(permissions);
  window.aplicarPermisosAInterfaz();

  const allowed = ["jornada", "ciclos", "operacion", "comunicacion", "conectividad", "preferencias"];
  const denied = ["resumen", "productos", "ventas", "almacenes", "pendientes", "reportes", "inventario", "movimientos", "mando", "usuarios", "config", "transferencias", "turnos"];
  for (const name of allowed) {
    const btn = document.querySelector('#tabs .tab-btn[data-tab="' + name + '"]');
    assert.equal(btn.getAttribute("data-bc-permiso"), "1", "debe permitir " + name);
  }
  for (const name of denied) {
    const btn = document.querySelector('#tabs .tab-btn[data-tab="' + name + '"]');
    assert.equal(btn.getAttribute("data-bc-permiso"), "0", "no debe permitir " + name);
    const panel = document.getElementById("tab-" + name);
    assert.equal(panel.getAttribute("data-bc-permiso"), "0", "panel cerrado: " + name);
  }
  assert.equal(window.tienePermiso("ventas", "ver"), true, "la política POS no altera el permiso backend");
  assert.equal(window.__BC_ROUTE_CAN_VIEW__("ventas"), false, "la Dependienta no entra al POS legado");

  window.safeInit = function (name, init) { if (name === "tabs") init(); };
  window.eval(navigation);
  window.irATab("productos");
  assert.equal(document.querySelector('#tabs .tab-btn[data-tab="productos"]').classList.contains("active"), false,
    "irATab no debe abrir una ruta sin permiso aunque se invoque directamente");
  window.irATab("jornada");
  assert.equal(document.querySelector('#tabs .tab-btn[data-tab="jornada"]').classList.contains("active"), true,
    "irATab permite una ruta autorizada");
  assert.equal(document.getElementById("tab-jornada").classList.contains("visible"), true);
  dom.window.close();
});

test("Administración solo aparece por permisos de usuarios o catálogos", async () => {
  const html = index.replace('<div class="app-shell" id="app-shell">', '<div class="app-shell visible" id="app-shell">');
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  const { document } = window;
  window._usuarioActual = { id: "catalog-role", rol: "Catalogador" };
  window._permisosCargaExitosa = true;
  window._permisosEfectivos = { categorias: { ver: true }, unidades: { ver: false } };
  window.eval(permissions);
  window.aplicarPermisosAInterfaz();
  assert.equal(document.querySelector('#tabs .tab-btn[data-tab="config"]').getAttribute("data-bc-permiso"), "1");
  assert.equal(document.querySelector('#tabs .tab-btn[data-tab="usuarios"]').getAttribute("data-bc-permiso"), "0");
  assert.equal(window.tienePermiso("usuarios", "ver"), false);
  assert.equal(window.tienePermiso("categorias", "ver"), true);
  dom.window.close();
});

test("ver y crear son permisos independientes; crear no abre la navegación", async () => {
  const html = index.replace('<div class="app-shell" id="app-shell">', '<div class="app-shell visible" id="app-shell">');
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  const { document } = window;
  window.console.warn = () => {};
  window._usuarioActual = { id: "role-test", rol: "Operador" };
  window._permisosCargaExitosa = true;
  window._permisosEfectivos = { productos: { crear: true }, reportes: { ver: true } };
  window.eval(permissions);
  window.aplicarPermisosAInterfaz();
  assert.equal(document.querySelector('#tabs .tab-btn[data-tab="productos"]').getAttribute("data-bc-permiso"), "0");
  assert.equal(document.querySelector('#tabs .tab-btn[data-tab="reportes"]').getAttribute("data-bc-permiso"), "1");
  assert.equal(window.tienePermiso("productos", "crear"), true);
  assert.equal(window.tienePermiso("productos", "ver"), false);
  assert.equal(window.tienePermiso("reportes", "crear"), false);
  assert.equal(window.tienePermiso("reportes", "ver"), true);
  dom.window.close();
});

test("app shell, application and Service Worker share 9.5.43 and load refreshed navigation modules", () => {
  assert.match(app, /const VERSION="9\.5\.43"/);
  assert.match(serviceWorker, /BC_SW_VERSION = "9\.5\.43"/);
  assert.match(index, /href="style\.css\?v=9\.5\.43"/);
  assert.match(index, /<script src="app\.js\?v=9\.5\.43"><\/script>/);
  assert.match(app, /\["permisos-navegacion\.js","67\.5"\]/);
  assert.match(app, /\["bc7-jornada-ui\.js","7\.9"\]/);
  assert.match(app, /\["ui-visual-salon\.js","54\.2"\]/);
  assert.match(app, /\["hotfix-regresiones-20260902\.js","20261020\.5"\]/);
  assert.match(app, /\["hotfix-secciones-visibles-20260903\.js","20261030\.1"\]/);
});
