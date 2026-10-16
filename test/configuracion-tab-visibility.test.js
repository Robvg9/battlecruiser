const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const wait = (window, ms = 60) => new Promise((resolve) => window.setTimeout(resolve, ms));

test('configuration tab obeys the shared active-tab visibility contract', () => {
  const css = read('public/style.css');
  const visibilityHotfix = read('public/js/hotfix-secciones-visibles-20260903.js');

  assert.match(css, /\.tab-panel\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.tab-panel\.visible\s*\{\s*display:\s*block;\s*\}/);
  assert.doesNotMatch(visibilityHotfix, /#tab-config\{[^}]*display:block!important/i);
  assert.match(visibilityHotfix, /#tab-config\{visibility:visible!important;\}/);
});

test('active Configuración panel survives a legacy permission visibility reset', async () => {
  const visibilityHotfix = read('public/js/hotfix-secciones-visibles-20260903.js');
  const dom = new JSDOM(`<!doctype html>
    <html><head><style>
      .tab-panel { display:none; }
      .tab-panel.visible { display:block; }
      .hidden { display:none!important; }
    </style></head><body>
      <nav id="tabs">
        <button class="tab-btn active" data-tab="config">Configuración</button>
        <button class="tab-btn" data-tab="home">Centro de Control</button>
      </nav>
      <main>
        <section id="tab-config" class="tab-panel"><h3>Roles y permisos</h3><p id="config-content">Categorías y unidades de medida</p></section>
        <section id="tab-home" class="tab-panel visible">Dashboard</section>
      </main>
    </body></html>`, { runScripts: 'outside-only', url: 'https://app.test/' });
  const { window } = dom;
  try {
    window.eval(visibilityHotfix);
    const button = window.document.querySelector('.tab-btn[data-tab="config"]');
    const homeButton = window.document.querySelector('.tab-btn[data-tab="home"]');
    const panel = window.document.getElementById('tab-config');

    // Record an explicit user selection; navigation's normal click handler owns the first activation.
    button.click();
    await wait(window);
    assert.ok(panel.classList.contains('visible'), 'active panel receives visible class');
    assert.equal(window.getComputedStyle(panel).display, 'block');
    assert.ok(window.document.getElementById('config-content').textContent.includes('Categorías'));

    // Simulate a legacy permission pass removing both the active state and panel visibility.
    button.classList.remove('active');
    panel.classList.remove('visible');
    panel.classList.add('hidden');
    panel.setAttribute('hidden', '');
    panel.setAttribute('aria-hidden', 'true');
    panel.style.setProperty('display', 'none', 'important');
    await wait(window, 80);
    assert.ok(button.classList.contains('active'), 'latest explicit selection remains active');
    assert.ok(panel.classList.contains('visible'), 'observer restores active panel visibility');
    assert.ok(!panel.classList.contains('hidden'));
    assert.ok(!panel.hasAttribute('hidden'));
    assert.ok(!panel.hasAttribute('aria-hidden'));
    assert.equal(window.getComputedStyle(panel).display, 'block');

    // A user selecting another tab must release the Configuración selection lock.
    homeButton.click();
    panel.classList.remove('visible');
    panel.classList.add('hidden');
    panel.style.setProperty('display', 'none', 'important');
    await wait(window, 80);
    assert.ok(!panel.classList.contains('visible'));
    assert.ok(panel.classList.contains('hidden'));
    assert.equal(window.getComputedStyle(panel).display, 'none');
  } finally {
    window.close();
  }
});
