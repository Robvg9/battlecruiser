const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('legacy configuration label helpers never grant route visibility', async () => {
  const labelHotfix = read('public/js/hotfix-secciones-visibles-20260903.js');
  const adminLabel = read('public/js/hotfix-17-13-configuracion-admin-visible-20260903.js');
  const dom = new JSDOM('<!doctype html><html><head></head><body>' +
    '<nav id="tabs"><button class="tab-btn hidden" data-tab="config" data-bc-permiso="0" aria-hidden="true">Config</button></nav>' +
    '<main><section id="tab-config" class="tab-panel hidden" data-bc-permiso="0" hidden aria-hidden="true" style="display:none!important"></section></main>' +
    '</body></html>', { runScripts: 'outside-only', url: 'https://app.test/' });
  const { window } = dom;
  try {
    window.eval(labelHotfix);
    window.eval(adminLabel);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    const button = window.document.querySelector('[data-tab="config"]');
    const panel = window.document.getElementById('tab-config');
    assert.equal(button.getAttribute('data-bc-permiso'), '0');
    assert.equal(button.classList.contains('hidden'), true);
    assert.equal(button.getAttribute('aria-hidden'), 'true');
    assert.equal(panel.getAttribute('data-bc-permiso'), '0');
    assert.equal(panel.hasAttribute('hidden'), true);
    assert.equal(panel.getAttribute('aria-hidden'), 'true');
    assert.equal(panel.style.getPropertyValue('display'), 'none');
    assert.equal(panel.style.getPropertyPriority('display'), 'important');
    assert.match(button.textContent, /Administración/);
  } finally {
    window.close();
  }
});

test('the canonical permission engine owns Administración visibility', () => {
  const permissions = read('public/js/permisos-navegacion.js');
  const navigation = read('public/js/navegacion.js');
  const labelHotfix = read('public/js/hotfix-secciones-visibles-20260903.js');
  const adminLabel = read('public/js/hotfix-17-13-configuracion-admin-visible-20260903.js');
  assert.match(permissions, /if \(tab === "config"\)[\s\S]*?tienePermiso\("usuarios", "ver"\)[\s\S]*?tienePermiso\("categorias", "ver"\)[\s\S]*?tienePermiso\("unidades", "ver"\)/);
  assert.match(permissions, /RUTAS_PERSONALES = \{ conectividad: true, preferencias: true \}/);
  assert.match(navigation, /getAttribute\("data-bc-permiso"\) !== "1"/);
  assert.doesNotMatch(labelHotfix, /MutationObserver|setImportant|style\.display|setAttribute\(["']data-tab/);
  assert.doesNotMatch(adminLabel, /MutationObserver|style\.display|removeAttribute\(["']hidden|setAttribute\(["']data-tab/);
});
