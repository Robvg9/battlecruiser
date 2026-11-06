const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const sw = fs.readFileSync('public/service-worker.js', 'utf8');
const m68 = fs.readFileSync('public/js/m68-ventas-pos-definitivo.js', 'utf8');
const almacenes = fs.readFileSync('public/js/almacenes.js', 'utf8');
const transferencias = fs.readFileSync('public/js/transferencias.js', 'utf8');
const compra = fs.readFileSync('public/js/compra-multiple.js', 'utf8');
const m74 = fs.readFileSync('public/js/m74-pos-archive-retail.js', 'utf8');
const visibilityNormalizer = fs.readFileSync('public/js/hotfix-secciones-visibles-20260903.js', 'utf8');
const adminVisibilityNormalizer = fs.readFileSync('public/js/hotfix-17-13-configuracion-admin-visible-20260903.js', 'utf8');
const m26 = fs.readFileSync('public/js/m26-ui-integridad.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const auth = fs.readFileSync('public/js/auth.js', 'utf8');
const e2e = fs.readFileSync('test/live-offline-e2e.js', 'utf8');

function extract(text, pattern, label) {
  const m = text.match(pattern);
  assert.ok(m, `No se encontró ${label}`);
  return m[1];
}

test('app.js y service-worker.js comparten la misma versión BattleCruiser', () => {
  const appVersion = extract(app, /const VERSION=["'](\d+\.\d+\.\d+)["']/, 'VERSION de app.js');
  const swVersion = extract(sw, /BC_SW_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/, 'BC_SW_VERSION del Service Worker');
  assert.equal(swVersion, appVersion);
});

test('Service Worker construye los nombres de caché desde BC_SW_VERSION', () => {
  assert.match(sw, /BC_SHELL\s*=\s*["']battlecruiser-shell-["']\s*\+\s*BC_SW_VERSION/);
  assert.match(sw, /BC_STATIC\s*=\s*["']battlecruiser-static-["']\s*\+\s*BC_SW_VERSION/);
});

test('M68 usa la versión canónica para su pie y para invalidar caché', () => {
  const appVersion = extract(app, /const VERSION=["'](\d+\.\d+\.\d+)["']/, 'VERSION de app.js');
  const cacheVersion = extract(
    app,
    /\["m68-ventas-pos-definitivo\.js","(\d+\.\d+\.\d+)"\]/,
    'versión de caché del módulo M68'
  );
  const moduleFallback = extract(
    m68,
    /const VER = String\(window\.__BC_VERSION__ \|\| ["'](\d+\.\d+\.\d+)["']\);/,
    'fallback de versión del módulo M68'
  );
  assert.equal(cacheVersion, appVersion, 'el cache-buster de M68 debe coincidir con app.js');
  assert.equal(moduleFallback, appVersion, 'el fallback de M68 debe coincidir con app.js');
  assert.match(
    m68,
    /el\.textContent = 'v' \+ VER \+ ' — BattleCruiser';/,
    'M68 debe construir el pie a partir de VER sincronizada'
  );
});


test('auth diagnostic stays visible and version updater changes only version labels', () => {
  const appVersion = extract(app, /const VERSION=["'](\d+\.\d+\.\d+)["']/, 'VERSION de app.js');
  const htmlVersion = extract(index, /<p class="footnote app-version-label">v(\d+\.\d+\.\d+) — BattleCruiser<\/p>/, 'versión visible del login');
  assert.equal(htmlVersion, appVersion, 'la versión visible del login debe coincidir con app.js');
  assert.ok(index.includes('<span class="app-footer-version">v' + appVersion + ' — BattleCruiser</span>'),
    "la versión inicial del pie debe coincidir con app.js");
  assert.match(app, /querySelectorAll\(["']\.app-version-label,\.app-footer-version["']\)/,
    'el actualizador debe seleccionar solo etiquetas explícitas de versión');
  assert.doesNotMatch(app, /querySelectorAll\(["']\.footnote,\.app-footer-version["']\)/,
    'el actualizador no debe sobrescribir mensajes de diagnóstico que usen estilo footnote');
  assert.match(auth, /el\.className = ["']footnote bc-auth-diagnostic["']/,
    'el diagnóstico debe tener clase propia además del estilo footnote');
});


test('index, Service Worker and offline E2E share the current Supabase UMD pin', () => {
  const sdkUrl = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';
  assert.ok(index.includes('<script src="' + sdkUrl + '"></script>'), 'index.html must load the pinned Supabase SDK');
  assert.ok(sw.includes(sdkUrl), 'Service Worker must precache the same Supabase SDK');
  assert.ok(e2e.includes('const SUPABASE_CDN_URL = "' + sdkUrl + '";'), 'offline E2E must verify the same pinned SDK');
});



test('M74 keeps Ventas navigable and applies the session guard inside the panel', () => {
  assert.ok(app.includes('["hotfix-turno-forceclose-20260902.js","20261030.1"]'), 'the overdue-turn recovery control must load after M33');
  assert.ok(sw.includes("./js/hotfix-turno-forceclose-20260902.js?v=20261030.1"), 'the recovery control must be available in the offline shell');
  assert.ok(app.includes('["m74-pos-archive-retail.js","74.6"]'), 'M74 must load after the existing modules');
  assert.ok(app.includes('["turno-api.js","9.4.8"]'), 'the turn API cache key must invalidate the new recovery RPC wrapper');
  assert.ok(app.includes('["m33-turnos-final.js","33.21"]'), 'the turn detail modal cache key must load the audited recovery action');
  assert.ok(app.includes('["m29-turnos-organizacion.js","29.21"]'), 'M29 full-day default flow must be loaded dynamically');
  assert.ok(sw.includes("./js/m29-turnos-organizacion.js?v=29.21"), 'M29 full-day default flow must be available offline');
  assert.equal((app.match(/\["hotfix-turno-forceclose-20260902\.js","20261030\.1"\]/g) || []).length, 1, 'the audited recovery module must load exactly once');
  assert.ok(sw.includes("./js/m74-pos-archive-retail.js?v=74.6"), 'M74 must be precached for offline startup');
  assert.ok(m74.includes("function hasActiveSalesSession()"), 'the session hint supports retail and wholesale');
  assert.ok(m74.includes("window.__BC_POS_NEEDS_SESSION__"), 'the policy exposes a session-required hint');
  assert.ok(m74.includes("button.disabled = false;"), 'the Sales navigation route is never natively disabled');
  assert.ok(m74.includes("button.setAttribute('aria-disabled', 'false')"), 'Sales remains accessible as a navigable section');
  assert.ok(!m74.includes("stopImmediatePropagation"), 'M74 must not cancel a tap when no session is open');
  assert.ok(!m74.includes("display:none!important"), 'M74 must not hide the Sales panel');
  assert.ok(visibilityNormalizer.includes('var LABELS = { config: "Administración", ciclos: "Turnos" }'), 'the normalizer is limited to labels');
  assert.ok(!visibilityNormalizer.includes("ventas"), 'the global normalizer must not rewrite Sales visibility or styles');
  assert.ok(index.includes('<section id="tab-ventas" class="tab-panel">'), 'the sales panel must remain in the application');
  assert.ok(index.includes('<div id="lista-ventas" class="lista"></div>'), 'the sales history container must be preserved');
});


test('movement operations load multi-product transfer before the compact modal', () => {
  const multiAt = app.indexOf('["movimiento-multiple.js","20261106.1"]');
  const modalAt = app.indexOf('["hotfix-16-5-movimientos-operaciones-flotantes-20260902.js","16.11"]');
  assert.notEqual(multiAt, -1, 'the multi-transfer module must load dynamically');
  assert.ok(multiAt < modalAt, 'the multi-transfer module must load before the modal');
  assert.ok(sw.includes('./js/movimiento-multiple.js?v=20261106.1'));
  assert.ok(sw.includes('./js/hotfix-16-5-movimientos-operaciones-flotantes-20260902.js?v=16.11'));
  assert.ok(app.includes('["m51-movimientos-centro.js","51.7"]'), 'M51 must load the refreshed data-change listener');
  assert.ok(sw.includes("./js/m51-movimientos-centro.js?v=51.7"), 'the offline shell must precache the refreshed movement listener');
  assert.ok(app.includes('["inventario-detalle.js","65"]'), 'the minimum editor must refresh');
  assert.ok(sw.includes("./js/inventario-detalle.js?v=65"), 'the offline shell must precache the updated minimum editor');
  assert.ok(index.includes('js/productos.js?v=20261106.1'), 'the product view must refresh its category subscriber');
  assert.ok(index.includes('js/almacenes.js?v=20261106.1'), 'the warehouse view must refresh its tab subscriber');
  assert.ok(sw.includes("./js/productos.js?v=20261106.1"), 'the product view must refresh offline');
  assert.ok(sw.includes("./js/catalogos.js?v=20261106.1"), 'the category editor must refresh offline');
  assert.ok(m68.includes("bc:data-changed"), "the sales POS must subscribe to stock, product and category changes");
  assert.ok(m68.includes("__BC_M68_DATA_CHANGE_BOUND__"), "the sales POS listener must initialize only once");
  assert.ok(almacenes.includes("bc:data-changed"), "the warehouse screen must subscribe to data changes");
  assert.ok(app.includes('["compra-multiple.js","27.13"]'), "the purchase module must load its reactive catalog listener");
  assert.ok(compra.includes("__BC_COMPRA_DATA_EVENTS__"), "the active purchase modal must refresh its dependent catalog after changes");
  assert.ok(sw.includes("./js/compra-multiple.js?v=27.13"), "the purchase module's reactive listener must be available offline");
  assert.ok(transferencias.includes("bc:data-changed"), "transfer and voucher history must refresh after relevant operations");
  assert.ok(index.includes('js/transferencias.js?v=20261106.1'), "transfer history must load its reactive subscriber");
  assert.ok(sw.includes('./js/transferencias.js?v=20261106.1'), "transfer history must be cached with its reactive subscriber");
});

// PWA 9.5.72 rotates the shell cache and keeps the M68 fallback aligned.
test('fixed LIVE scripts use refreshed cache keys and release version', () => {
  assert.match(app, /const VERSION=["']9\.5\.72["']/);
  assert.match(sw, /BC_SW_VERSION\s*=\s*["']9\.5\.72["']/);
  assert.ok(app.includes('["m27-7-almacenes-modal.js","27.7f"]'),
    "warehouse modal loader must use the corrected RPC-contract build");
  assert.ok(sw.includes("./js/m27-7-almacenes-modal.js?v=27.7f"),
    "the offline shell must precache the exact corrected warehouse modal build");
  assert.match(app, /\["hotfix-secciones-visibles-20260903\.js","20261030\.1"\]/);
  assert.match(sw, /\.\/js\/hotfix-secciones-visibles-20260903\.js\?v=20261030\.1/, "the sidebar visibility policy must be available in the offline shell");
  assert.match(app, /\["section-scope-fix\.js","20261030\.1"\]/);
  assert.match(app, /\["hotfix-pulido-20260903\.js","20261105\.4"\]/);
  assert.match(app, /\["hotfix-pulido-20260903b\.js","20261105\.2"\]/);
  assert.match(app, /\["hotfix-17-final-loader-20260903\.js","20261030\.2"\]/);
  assert.doesNotMatch(app, /\["hotfix-17-13-configuracion-admin-visible-20260903\.js"/, "the legacy config label helper must not participate in route visibility");
  assert.match(sw, /\.\/js\/hotfix-17-13-configuracion-admin-visible-20260903\.js\?v=20261030\.3/, "the label-only helper remains available to the offline shell");
  assert.match(adminVisibilityNormalizer, /function normalizeLabel\(\)/);
  assert.match(adminVisibilityNormalizer, /data-bc-permiso/);
  assert.doesNotMatch(adminVisibilityNormalizer, /MutationObserver|\.style\.display\s*=|removeAttribute\(/, "the legacy helper must not override permission visibility");
  assert.match(sw, /BC_SW_VERSION\s*=\s*["']9\.5\.72["']/);
  assert.match(sw, /\.\/js\/hotfix-pulido-20260903\.js\?v=20261105\.4/);
  assert.match(sw, /\.\/js\/hotfix-pulido-20260903b\.js\?v=20261105\.2/);
  assert.match(sw, /\.\/js\/section-scope-fix\.js\?v=20261030\.1/);
  assert.doesNotMatch(app, /\["ui-ajustes-panel\.js","96\.2"\]/, "legacy settings drawer must not load with the Preferences tab");
  assert.match(app, /\["hotfix-configuracion-20260902\.js","20261020\.4"\]/);
  assert.match(app, /\["configuracion\.js","20261104\.1"\]/, "connectivity panel must bypass stale cached layout");
  assert.ok(index.includes('<script src="js/navegacion.js?v=9.5.64"></script>'), "new navigation sections need a cache-busted script");
  assert.match(index, /<script src="js\/operacion-humana\.js\?v=9\.5\.64"><\/script>/, "Turnos history must load the fixed warehouse-filter script");
  assert.match(sw, /\.\/js\/operacion-humana\.js\?v=9\.5\.64/, "the fixed Turnos module must be available in the offline shell");
  assert.match(app, /\["mi-cuenta\.js","1\.2"\]/);
  assert.match(app, /\["bc7-jornada-ui\.js","7\.13"\]/, "the Step 7 jornada UI must be loaded dynamically");
  assert.match(app, /\["m26-ui-integridad\.js","26\.40"\]/);
  assert.match(app, /\["hotfix-17-2-productos-save-20260903\.js","17\.4"\]/, "the legacy compatibility module must refresh without duplicating product save");
  assert.match(sw, /\.\/js\/hotfix-17-2-productos-save-20260903\.js\?v=17\.4/, "the single-owner compatibility module must be cached for offline use");
  assert.match(sw, /\.\/js\/m26-ui-integridad\.js\?v=26\.40/, "the unified commercial-options panel must be available offline");
  assert.match(sw, /\.\/js\/catalogos\.js\?v=20261106\.1/, "the updated master catalog loader must be available offline");
  assert.ok(app.includes('["m27-5-ventas-precio-politica.js","27.5b7"]'));
  assert.ok(app.includes('["m27-6-ventas-presentaciones.js","27.6g"]'));
  assert.ok(sw.includes("./js/m27-5-ventas-precio-politica.js?v=27.5b7"));
  assert.ok(sw.includes("./js/m27-6-ventas-presentaciones.js?v=27.6g"));
  assert.match(app, /\["m75-productos-ui-compacto\.js","75\.12"\]/, "M75 must load with its refreshed module cache key");
  assert.match(sw, /\.\/js\/m75-productos-ui-compacto\.js\?v=75\.12/, "the offline shell must precache the same M75 module version");
  assert.match(m26, /function fijarNomenclaturaSoloProductos\(\) \{ return false; \}/, "M26 must leave the single presentations panel in Administration");
  assert.match(index, /<script src="js\/productos\.js\?v=20261106\.1"><\/script>/);
  assert.match(sw, /\.\/js\/productos\.js\?v=20261106\.1/, "the offline shell must precache the updated product module version");
  assert.match(index, /<script src="js\/ventas\.js\?v=20261105\.2"><\/script>/);
  assert.match(index, /<script src="js\/auth\.js\?v=9\.5\.24"><\/script>/);
  assert.match(index, /<script src="js\/catalogos\.js\?v=20261106\.1"><\/script>/);
  assert.match(index, /<script src="js\/hotfix-configuracion-20260902\.js\?v=20261020\.4"><\/script>/);
  assert.match(index, /<script src="js\/mi-cuenta\.js\?v=1\.2"><\/script>/);
  assert.match(index, /<script src="js\/network-core\.js\?v=20261020\.4"><\/script>/);
  assert.match(sw, /\.\/js\/network-core\.js\?v=20261020\.4/);
  assert.match(sw, /\.\/js\/offline\.js/, "offline queue coordinator must be precached for fast resume recovery");
  assert.match(app, /v9\.5\.72 — Transferencias múltiples compactas y vistas reactivas/);
  assert.match(index, /<script src="app\.js\?v=9\.5\.72"><\/script>/);
  for (const asset of [
    'style.css?v=9.5.64',
    'js/centro-control.js?v=9.5.69',
    'js/navegacion.js?v=9.5.64',
    'js/mando.js?v=9.5.64',
    'js/operacion-humana.js?v=9.5.64',
    'js/comunicacion.js?v=9.5.64',
  ]) assert.ok(index.includes(asset), 'index must load versioned preview asset ' + asset);
  for (const asset of [
    './js/centro-control.js?v=9.5.69',
    './js/navegacion.js?v=9.5.64',
    './js/mando.js?v=9.5.64',
    './js/operacion-humana.js?v=9.5.64',
    './js/comunicacion.js?v=9.5.64',
  ]) assert.ok(sw.includes(asset), 'Service Worker must precache versioned preview asset ' + asset);
  assert.match(index, /<script src="js\/reportes\.js\?v=20261105\.1"><\/script>/, "Reportes renderer must use a fresh cache key");
  assert.match(sw, /\.\/js\/mi-cuenta\.js\?v=1\.2/);
  assert.match(sw, /\.\/js\/bc7-jornada-ui\.js\?v=7\.13/, "the Step 7 workflow is available in the offline static cache");
  assert.match(sw, /\.\/js\/hotfix-configuracion-20260902\.js\?v=20261020\.4/);

  const networkCore = fs.readFileSync('public/js/network-core.js', 'utf8');
  const config = fs.readFileSync('public/js/configuracion.js', 'utf8');
  assert.match(networkCore, /window\.__BC_BACKEND_PROBE__/);
  assert.match(networkCore, /registrarDiagnosticoSondeo\("degraded", reason/);
  assert.ok(networkCore.includes('baseUrl + "/rest/v1/"'), "Data API is the second real probe route");
  assert.match(networkCore, /PROBE_TIMEOUT_MS = 12000/);
  assert.match(networkCore, /fallosSondeoSeguidos >= 2/, "one isolated probe failure must not flip the app offline");
  assert.match(config, /cfg-backend-probe-note/);
  assert.match(config, /await sondearBackend\(\)/);
  assert.match(config, /no incluye credenciales ni tokens/);
  assert.match(m68, /const VER = String\(window\.__BC_VERSION__ \|\| ['"]9\.5\.72['"]\);/);
});


test("Jornada POS payments, exact session provenance and offline queue are version aligned", () => {
  assert.ok(app.includes('["venta-turno-ui.js","9.4.46"]'));
  assert.ok(app.includes('["m27-6b-venta-payload-pres.js","27.6b2"]'));
  assert.ok(sw.includes("./js/venta-turno-ui.js?v=9.4.46"));
  assert.ok(sw.includes("./js/m27-6b-venta-payload-pres.js?v=27.6b2"));
  assert.ok(sw.includes("./js/ventas.js?v=20261105.2"));
  assert.ok(sw.includes("./js/m68-ventas-pos-definitivo.js?v=9.5.72"));
  assert.ok(index.includes('id="venta-metodo-pago"'));
  assert.ok(index.includes('id="venta-jornada-payment-wrap"'));
});

test("Paso 4 Turnos: el archivo y sus dependencias críticas están en el precache offline", () => {
  const assets = [
    "./js/turno-api.js?v=9.4.8",
    "./js/turnos-maestro.js?v=9.4.8",
    "./js/m29-turnos-organizacion.js?v=29.21",
    "./js/m33-turnos-final.js?v=33.21",
    "./js/m22-sesiones-en-m21.js?v=25.5",
    "./js/m49-turnos-layout-definitivo.js?v=49.6",
    "./js/hotfix-regresiones-20260902.js?v=20261101.1",
    "./js/hotfix-17-4-turnos-tarde-visible-20260903.js?v=17.5",
    "./js/m54-movimientos-client-bridge.js?v=54.1",
    "./js/m51-movimientos-centro.js?v=51.7",
    "./js/m52-movimientos-auth-retry.js?v=52.2"
  ];
  for (const asset of assets) assert.ok(sw.includes(asset), "faltó el precache offline de " + asset);
  for (const key of [
    '["turno-api.js","9.4.8"]',
    '["turnos-maestro.js","9.4.8"]',
    '["m29-turnos-organizacion.js","29.21"]',
    '["m33-turnos-final.js","33.21"]',
    '["m22-sesiones-en-m21.js","25.5"]',
    '["m49-turnos-layout-definitivo.js","49.6"]',
    '["hotfix-regresiones-20260902.js","20261101.1"]',
    '["hotfix-17-4-turnos-tarde-visible-20260903.js","17.5"]',
    '["m54-movimientos-client-bridge.js","54.1"]',
    '["m51-movimientos-centro.js","51.7"]',
    '["m52-movimientos-auth-retry.js","52.2"]'
  ]) assert.ok(app.includes(key), "el cargador debe conservar la versión " + key);
});


test('Step 4 modal and Turnos layout invalidate their production cache keys', () => {
  assert.match(app, /\["hotfix-16-5-movimientos-operaciones-flotantes-20260902\.js","16\.11"\]/);
  assert.match(sw, /hotfix-16-5-movimientos-operaciones-flotantes-20260902\.js\?v=16\.11/);
  assert.match(app, /\["m49-turnos-layout-definitivo\.js","49\.6"\]/);
  assert.match(app, /const VERSION=["']9\.5\.72["']/);
  assert.match(sw, /BC_SW_VERSION\s*=\s*["']9\.5\.72["']/);
});


test('Conectividad compacta: estilos y recursos críticos comparten caché renovada', () => {
  assert.ok(index.includes('style.css?v=9.5.64'));
  assert.ok(index.includes('app.js?v=9.5.72'));
  assert.ok(sw.includes('./style.css?v=9.5.64'));
  assert.ok(sw.includes('./app.js?v=9.5.72'));
  assert.ok(sw.includes('./js/configuracion.js?v=20261104.1'));
  assert.ok(app.includes('["configuracion.js","20261104.1"]'));
});


test('Administration UI modules refresh their cache keys', () => {
  assert.match(app, /\["m26-ui-integridad\.js","26\.40"\]/);
  assert.match(app, /\["roles-en-usuarios\.js","33\.7"\]/);
  assert.match(app, /\["m75-productos-ui-compacto\.js","75\.12"\]/);
  assert.match(sw, /m26-ui-integridad\.js\?v=26\.40/);
  assert.match(sw, /m75-productos-ui-compacto\.js\?v=75\.12/);
  assert.match(sw, /catalogos\.js\?v=20261106\.1/);
});
