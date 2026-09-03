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

test('Service Worker usa su versión en los nombres de caché', () => {
  const swVersion = extract(sw, /BC_SW_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/, 'BC_SW_VERSION');
  assert.match(sw, new RegExp(`battlecruiser-shell-\\" \\+ BC_SW_VERSION`));
  assert.match(sw, new RegExp(`battlecruiser-static-\\" \\+ BC_SW_VERSION`));
  assert.match(sw, new RegExp(`\\"${swVersion}\\"`));
});
