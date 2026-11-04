const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const source = read('public/js/catalogos.js');
const index = read('public/index.html');
const m26 = read('public/js/m26-ui-integridad.js');

test('category and unit catalog management has one canonical owner in Administration', () => {
  for (const id of ['form-categoria','lista-categorias','form-presentacion-nueva','lista-presentaciones-catalogo','pp-producto-select','pp-lista-asociaciones','form-pp-nueva']) {
    assert.equal((index.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' must exist once');
  }
  assert.match(index, /bc-admin-catalog-grid[\s\S]*?form-categoria[\s\S]*?lista-categorias/);
  assert.doesNotMatch(index, /id="form-unidad"|id="lista-unidades"/);
  assert.match(index, /presentaciones-panel[\s\S]*?lista-presentaciones-catalogo[\s\S]*?pp-lista-asociaciones/);
  assert.doesNotMatch(source, /prod-nom-categorias-slot|prod-nom-unidades-slot|nomenclaturaOrigenes|prepararNomenclatura/);
  assert.doesNotMatch(m26, /'lista-categorias'\s*:\s*'prod-nom-|\s*'lista-unidades'\s*:\s*'prod-nom-/);
});

test('the compact product dialog is dedicated to commercial presentations only', () => {
  assert.match(source, /Presentaciones comerciales/);
  assert.match(source, /Presentaciones comerciales/);
  assert.doesNotMatch(source, /prod-nom-categorias-slot|prod-nom-unidades-slot/);
  assert.doesNotMatch(m26, /lista-presentaciones-catalogo.*prod-nom-/);
  assert.doesNotMatch(m26, /pp-lista-asociaciones.*prod-nom-/);
  assert.doesNotMatch(m26, /'lista-categorias':\s*'prod-nom-presentaciones-slot'|'lista-unidades':\s*'prod-nom-presentaciones-slot'/);
});
