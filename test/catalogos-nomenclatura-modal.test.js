const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'public/js/catalogos.js'), 'utf8');

const wait = (window, ms = 40) => new Promise((resolve) => window.setTimeout(resolve, ms));

function createFixture() {
  return new JSDOM(`<!doctype html>
    <html><head></head><body>
      <div class="main-content">
        <section id="tab-productos" class="tab-panel">
          <form id="form-producto"><input id="prod-nombre"><button type="submit">Guardar</button></form>
        </section>
        <section id="tab-config" class="tab-panel visible">
          <div class="cc-bloque"><h3>Presentaciones</h3><div id="presentaciones-catalogo"></div></div>
          <div class="cc-bloque"><h3>Roles y permisos</h3><div id="lista-roles"></div></div>
          <h3>Categorías</h3>
          <form id="form-categoria"><input id="cat-nombre"><button type="submit">Agregar categoría</button></form>
          <div id="lista-categorias"></div>
          <h3>Unidades de medida</h3>
          <form id="form-unidad"><input id="uni-nombre"><button type="submit">Agregar unidad</button></form>
          <div id="lista-unidades"></div>
          <p id="msg-config"></p>
        </section>
      </div>
    </body></html>`, { runScripts: 'outside-only', url: 'https://battlecruiser.test/' });
}

test('opening product nomenclature never moves the whole Configuration tab into its hidden modal', async () => {
  const dom = createFixture();
  const { window } = dom;
  const document = window.document;
  window.safeInit = (_name, callback) => callback();
  window.cargarPresentacionesTodas = async () => [];

  try {
    window.eval(source);
    await wait(window, 80);

    const main = document.querySelector('.main-content');
    const panel = document.getElementById('tab-config');
    const modal = document.getElementById('productos-nomenclatura-modal');
    const open = document.getElementById('productos-nomenclatura-btn');
    assert.ok(modal, 'nomenclature modal should be installed');
    assert.ok(open, 'nomenclature action should be installed');
    assert.equal(panel.parentElement, main, 'Configuration starts in the main content');

    open.click();
    assert.ok(!modal.classList.contains('hidden'), 'modal opens');
    assert.equal(panel.parentElement, main, 'Configuration must stay in main content');
    assert.equal(panel.closest('#productos-nomenclatura-modal'), null, 'hidden modal must never own Configuration');

    const categoriesSlot = document.getElementById('prod-nom-categorias-slot');
    const unitsSlot = document.getElementById('prod-nom-unidades-slot');
    assert.ok(categoriesSlot.contains(document.getElementById('form-categoria')), 'category form moves with its list');
    assert.ok(categoriesSlot.contains(document.getElementById('lista-categorias')), 'category list moves to its slot');
    assert.ok(unitsSlot.contains(document.getElementById('form-unidad')), 'unit form moves with its list');
    assert.ok(unitsSlot.contains(document.getElementById('lista-unidades')), 'unit list moves to its slot');
    assert.ok(!modal.contains(panel), 'the tab panel itself remains outside the modal');

    document.getElementById('productos-nomenclatura-cerrar').click();
    assert.ok(modal.classList.contains('hidden'), 'modal closes');
    assert.equal(panel.parentElement, main, 'Configuration parent is stable after close');
    assert.equal(document.getElementById('form-categoria').closest('.cc-bloque').parentElement, panel);
    assert.equal(document.getElementById('form-unidad').closest('.cc-bloque').parentElement, panel);
    const categoryBlock = document.getElementById('lista-categorias').closest('[data-bc-nomenclature-block]');
    const unitsBlock = document.getElementById('lista-unidades').closest('[data-bc-nomenclature-block]');
    const message = document.getElementById('msg-config');
    assert.ok((categoryBlock.compareDocumentPosition(unitsBlock) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0, 'category block order is preserved');
    assert.ok((unitsBlock.compareDocumentPosition(message) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0, 'unit block stays before the configuration message');
    assert.equal(panel.querySelectorAll('comment').length, 0);

    // A second open/close cycle must not lose the original parents or duplicate wrappers.
    open.click();
    assert.equal(panel.parentElement, main, 'Configuration remains in main content after reopening');
    assert.ok(categoriesSlot.contains(document.getElementById('form-categoria')));
    assert.ok(unitsSlot.contains(document.getElementById('form-unidad')));
    document.getElementById('productos-nomenclatura-cerrar').click();
    assert.equal(panel.parentElement, main);
    assert.equal(panel.querySelectorAll('[data-bc-nomenclature-block]').length, 2);
  } finally {
    window.close();
  }
});
