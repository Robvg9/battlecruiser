const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('pulido: loader carga todos los hotfix finales en orden', () => {
  const app = read('public/app.js');
  for (const name of ['hotfix-pulido-20260903.js','hotfix-pulido-20260903b.js','hotfix-pulido-20260903c.js']) assert.match(app, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok(app.indexOf('hotfix-pulido-20260903.js') < app.indexOf('hotfix-pulido-20260903b.js'));
  assert.ok(app.indexOf('hotfix-pulido-20260903b.js') < app.indexOf('hotfix-pulido-20260903c.js'));
});

test('pulido: importación es de una sola plantilla CSV y contiene unidad + factores', () => {
  const src = read('public/js/hotfix-pulido-20260903.js');
  const srcB = read('public/js/hotfix-pulido-20260903b.js');
  assert.match(src, /Plantilla CSV/);
  assert.match(src, /factor_normal/);
  assert.match(src, /factor_mayorista/);
  assert.match(srcB, /accept=\"\.csv,text\/csv\"/);
});

test('pulido: importación y alta usan el RPC atómico de catálogo', () => {
  const src = read('public/js/hotfix-pulido-20260903b.js');
  assert.match(src, /bc_guardar_producto_catalogo/);
  assert.match(src, /p_categoria_id/);
  assert.match(src, /p_presentacion_normal/);
  assert.match(src, /p_presentacion_mayorista/);
});

test('pulido: ventas y transferencias usan stock operativo', () => {
  const src = read('public/js/hotfix-pulido-20260903.js');
  const srcC = read('public/js/hotfix-pulido-20260903c.js');
  assert.match(src, /bc_stock_operativo/);
  assert.match(src, /obtenerStockDisponible/);
  assert.match(src, /trf-destino/);
  assert.match(srcC, /bc_stock_operativo/);
});

test('pulido: transferencias ya no tienen entrada visible en sidebar', () => {
  const src = read('public/js/hotfix-pulido-20260903.js');
  assert.match(src, /data-tab=transferencias/);
  assert.match(src, /#tabs \[data-tab=transferencias\]\{display:none!important\}/);
  assert.match(src, /#tab-transferencias\{display:none!important\}/);
});

test('pulido: configuración queda visible y comunicación elimina el estado vacío', () => {
  const src = read('public/js/hotfix-pulido-20260903.js');
  const srcB = read('public/js/hotfix-pulido-20260903b.js');
  assert.match(src, /data-tab=config/);
  assert.match(srcB, /no tenes conversaciones/);
  assert.match(srcB, /iniciá una nueva conversación/);
});

test('pulido: la UI de presentaciones incluye Otro y factores comerciales', () => {
  const src = read('public/js/hotfix-pulido-20260903.js');
  const srcB = read('public/js/hotfix-pulido-20260903b.js');
  assert.match(src, /Otro…/);
  assert.match(src, /bc-pres-normal-factor/);
  assert.match(src, /bc-pres-wholesale-factor/);
  assert.match(srcB, /actualizar_presentacion/);
  assert.match(srcB, /cambiar_estado_presentacion/);
});

test('pulido: el submit del producto se captura antes del listener heredado', () => {
  const src = read('public/js/hotfix-pulido-20260903b.js');
  assert.match(src, /document\.addEventListener\('submit',formCapture,true\)/);
  assert.match(src, /stopImmediatePropagation/);
});
