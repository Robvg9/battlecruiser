"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const fix = fs.readFileSync('public/js/section-scope-fix.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');

const wait = (window, ms = 40) => new Promise(resolve => window.setTimeout(resolve, ms));

function fixture() {
  return new JSDOM(`<!doctype html><html><head></head><body>
    <aside><nav id="tabs">
      <button class="tab-btn active" data-tab="productos">Productos</button>
      <button class="tab-btn" data-tab="compras">Compras</button>
      <button class="tab-btn" data-tab="config">Configuración</button>
    </nav></aside>
    <main class="main-content">
      <section id="tab-productos" class="tab-panel visible">
        <div id="productos-tools-nomenclatura"><button id="productos-nomenclatura-btn">Nomenclatura</button></div>
        <div id="bc-productos-barra"><input id="productos-buscar"></div>
        <div id="lista-productos">Productos reales</div>
        <h3>Registrar compra (entrada de stock)</h3><form id="form-compra"></form>
        <div class="presentaciones-panel"><div id="lista-presentaciones-catalogo"></div></div>
        <div class="productos-buscador-controles">Buscador duplicado</div>
        <span id="bc176-pres-anchor">Presentaciones disponibles</span>
      </section>
      <section id="tab-compras" class="tab-panel">Compra a proveedor</section>
      <section id="tab-config" class="tab-panel" style="display:block!important;visibility:visible!important;opacity:1!important">
        <div id="config-content">Categorías · Unidades · Ajustes · Mantenimiento</div>
      </section>
    </main>
  </body></html>`, { runScripts: 'outside-only', url: 'https://battlecruiser.test/' });
}

test('section guard displays only the selected panel and revokes leaked Configuración overrides', async () => {
  const dom = fixture();
  const { window } = dom;
  const document = window.document;
  document.getElementById('tabs').addEventListener('click', event => {
    const btn = event.target.closest('.tab-btn[data-tab]');
    if (!btn) return;
    document.querySelectorAll('#tabs .tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.main-content > .tab-panel').forEach(el => el.classList.remove('visible'));
    document.getElementById('tab-' + btn.dataset.tab).classList.add('visible');
  });
  window.eval(fix);
  await wait(window, 70);

  assert.equal(window.__BC_SECTION_SCOPE_DIAGNOSTICS__.activePanelId, 'tab-productos');
  assert.deepEqual(window.__BC_SECTION_SCOPE_DIAGNOSTICS__.visiblePanelIds, ['tab-productos']);
  assert.equal(document.getElementById('tab-config').style.getPropertyValue('display'), 'none');
  assert.equal(document.getElementById('tab-config').style.getPropertyPriority('display'), 'important');
  assert.equal(window.getComputedStyle(document.getElementById('tab-config')).display, 'none');
  assert.equal(document.getElementById('form-compra').style.getPropertyValue('display'), 'none');
  assert.equal(document.querySelector('.presentaciones-panel').style.getPropertyValue('display'), 'none');
  assert.equal(document.getElementById('lista-productos').textContent, 'Productos reales');
  assert.ok(document.getElementById('productos-nomenclatura-btn'));

  document.querySelector('[data-tab="config"]').click();
  await wait(window, 70);
  assert.deepEqual(window.__BC_SECTION_SCOPE_DIAGNOSTICS__.visiblePanelIds, ['tab-config']);
  assert.equal(window.getComputedStyle(document.getElementById('tab-productos')).display, 'none');
  assert.equal(window.getComputedStyle(document.getElementById('tab-config')).display, 'block');

  document.querySelector('[data-tab="compras"]').click();
  await wait(window, 70);
  assert.deepEqual(window.__BC_SECTION_SCOPE_DIAGNOSTICS__.visiblePanelIds, ['tab-compras']);
  assert.equal(window.getComputedStyle(document.getElementById('tab-config')).display, 'none');
  assert.equal(window.getComputedStyle(document.getElementById('tab-compras')).display, 'block');

  document.querySelector('[data-tab="productos"]').click();
  await wait(window, 70);
  assert.deepEqual(window.__BC_SECTION_SCOPE_DIAGNOSTICS__.visiblePanelIds, ['tab-productos']);
  assert.equal(window.__BC_SECTION_SCOPE_DIAGNOSTICS__.productExtrasHidden, true);
  dom.window.close();
});

test('release loader includes the section guard after legacy UI modules and invalidates the PWA shell', () => {
  assert.match(app, /\["section-scope-fix\.js","20261016\.1"\]/);
  assert.ok(app.indexOf('["hotfix-secciones-visibles-20260903.js","20261016.7"]') <
    app.indexOf('["section-scope-fix.js","20261016.1"]'),
    'the section guard must execute after the legacy visibility hotfix');
  assert.match(app, /const VERSION=["']9\.4\.97["']/);
  assert.match(index, /<script src="app\.js\?v=9\.4\.97"><\/script>/);
});
