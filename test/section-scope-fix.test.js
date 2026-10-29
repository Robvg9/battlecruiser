"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const fix = fs.readFileSync('public/js/section-scope-fix.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const TAB_NAMES = [...new Set([...index.matchAll(/<button class="tab-btn(?: active)?" data-tab="([^"]+)"/g)].map(match => match[1]))];

const wait = (window, ms = 35) => new Promise(resolve => window.setTimeout(resolve, ms));

function fixture() {
  const initialTab = TAB_NAMES[0];
  const buttons = TAB_NAMES.map(name =>
    '<button class="tab-btn' + (name === initialTab ? ' active' : '') + '" data-tab="' + name + '">' + name + '</button>'
  ).join('');
  const panels = TAB_NAMES.map(name => {
    const style = ' style="display:block!important;visibility:visible!important;opacity:1!important"';
    if (name === 'productos') {
      return '<section id="tab-productos" class="tab-panel visible"' + style + '>' +
        '<div id="productos-tools-nomenclatura"><button id="productos-nomenclatura-btn">Nomenclatura</button></div>' +
        '<div id="bc-productos-barra"><input id="productos-buscar"></div>' +
        '<div id="lista-productos">Productos reales</div>' +
        '<h3>Registrar compra (entrada de stock)</h3><form id="form-compra"></form>' +
        '<div class="presentaciones-panel"><div id="lista-presentaciones-catalogo"></div></div>' +
        '<div class="productos-buscador-controles">Buscador duplicado</div>' +
        '<span id="bc176-pres-anchor">Presentaciones disponibles</span></section>';
    }
    return '<section id="tab-' + name + '" class="tab-panel"' + style + '>Panel ' + name + '</section>';
  }).join('');
  return new JSDOM('<!doctype html><html><head></head><body><aside><nav id="tabs">' + buttons +
    '</nav></aside><main class="main-content">' + panels + '</main></body></html>',
    { runScripts: 'outside-only', url: 'https://battlecruiser.test/' });
}

test('section guard isolates every real first-level PWA panel despite stale inline !important styles', async () => {
  for (const tabName of TAB_NAMES) {
    assert.match(index, new RegExp('id="tab-' + tabName + '"'), 'navigation target must exist in the real shell: ' + tabName);
  }
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

  for (const name of TAB_NAMES) {
    if (name !== TAB_NAMES[0]) {
      document.querySelector('#tabs [data-tab="' + name + '"]').click();
      await wait(window, 40);
    }
    const diagnostics = window.__BC_SECTION_SCOPE_DIAGNOSTICS__;
    assert.equal(diagnostics.activePanelId, 'tab-' + name, 'active panel must match selected tab: ' + name);
    assert.deepEqual(Array.from(diagnostics.visiblePanelIds), ['tab-' + name], 'exactly one top-level panel may be visible: ' + name);
    for (const other of TAB_NAMES) {
      const panel = document.getElementById('tab-' + other);
      assert.equal(panel.style.getPropertyValue('display'), other === name ? 'block' : 'none',
        'panel visibility leaked while selecting ' + name + ': ' + other);
      assert.equal(window.getComputedStyle(panel).display, other === name ? 'block' : 'none',
        'rendered panel visibility leaked while selecting ' + name + ': ' + other);
    }
    if (name === 'productos') {
      assert.equal(diagnostics.productExtrasHidden, true);
      assert.equal(document.getElementById('form-compra').style.getPropertyValue('display'), 'none');
      assert.equal(document.querySelector('.presentaciones-panel').style.getPropertyValue('display'), 'none');
      assert.equal(document.getElementById('lista-productos').textContent, 'Productos reales');
      assert.ok(document.getElementById('productos-nomenclatura-btn'));
    }
  }
  dom.window.close();
});

test('release loader places the section guard after legacy UI modules and invalidates the PWA shell', () => {
  assert.match(app, /\["section-scope-fix\.js","20261016\.1"\]/);
  const visibilityHotfixIndex = app.indexOf('["hotfix-secciones-visibles-20260903.js","20261026.1"]');
  assert.ok(visibilityHotfixIndex >= 0 && visibilityHotfixIndex <
    app.indexOf('["section-scope-fix.js","20261016.1"]'),
    'the section guard must execute after the current legacy visibility hotfix');
  assert.match(app, /const VERSION=["']9\.5\.35["']/);
  assert.match(index, /<script src="app\.js\?v=9\.5\.35"><\/script>/);
});
