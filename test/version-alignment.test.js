const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const sw = fs.readFileSync('public/service-worker.js', 'utf8');
const m68 = fs.readFileSync('public/js/m68-ventas-pos-definitivo.js', 'utf8');
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


test('fixed LIVE scripts use refreshed cache keys and release version', () => {
  assert.match(app, /const VERSION=["']9\.5\.10["']/);
  assert.match(sw, /BC_SW_VERSION\s*=\s*["']9\.5\.10["']/);
  assert.match(app, /\["hotfix-secciones-visibles-20260903\.js","20261020\.5"\]/);
  assert.match(app, /\["section-scope-fix\.js","20261016\.1"\]/);
  assert.doesNotMatch(app, /\["ui-ajustes-panel\.js","96\.2"\]/, "legacy settings drawer must not load with the Preferences tab");
  assert.match(app, /\["hotfix-configuracion-20260902\.js","20261020\.4"\]/);
  assert.match(app, /\["configuracion\.js","20261020\.4"\]/, "connectivity module must bypass stale cached settings");
  assert.match(index, /<script src="js\/navegacion\.js\?v=20261020\.4"><\/script>/, "new navigation sections need a cache-busted script");
  assert.match(app, /\["mi-cuenta\.js","1\.2"\]/);
  assert.match(app, /\["m26-ui-integridad\.js","26\.31"\]/);
  assert.match(m26, /panel\.contains\(candidate\)/, "M26 must move only containers inside their owning tab panel");
  assert.match(index, /<script src="js\/productos\.js\?v=20261015\.1"><\/script>/);
  assert.match(index, /<script src="js\/ventas\.js\?v=20261016\.1"><\/script>/);
  assert.match(index, /<script src="js\/auth\.js\?v=9\.5\.10"><\/script>/);
  assert.match(index, /<script src="js\/catalogos\.js\?v=20261016\.5"><\/script>/);
  assert.match(index, /<script src="js\/hotfix-configuracion-20260902\.js\?v=20261020\.4"><\/script>/);
  assert.match(index, /<script src="js\/mi-cuenta\.js\?v=1\.2"><\/script>/);
  assert.match(index, /<script src="js\/network-core\.js\?v=20261020\.4"><\/script>/);
  assert.match(sw, /\.\/js\/network-core\.js\?v=20261020\.4/);
  assert.match(sw, /\.\/js\/offline\.js/, "offline queue coordinator must be precached for fast resume recovery");
  assert.match(app, /v9\.5\.10 — accessible state descriptions for native preferences/);
  assert.match(index, /<script src="app\.js\?v=9\.5\.10"><\/script>/);
  assert.match(index, /<script src="js\/reportes\.js\?v=20261022\.1"><\/script>/, "Reportes renderer must use a fresh cache key");
  assert.match(sw, /\.\/js\/mi-cuenta\.js\?v=1\.2/);
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
  assert.match(m68, /const VER = String\(window\.__BC_VERSION__ \|\| ['"]9\.5\.10['"]\);/);
});
