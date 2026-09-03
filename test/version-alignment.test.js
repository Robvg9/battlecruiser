const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const sw = fs.readFileSync('public/service-worker.js', 'utf8');

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
