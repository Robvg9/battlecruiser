const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('configuration tab obeys the shared active-tab visibility contract', () => {
  const css = read('public/style.css');
  const visibilityHotfix = read('public/js/hotfix-secciones-visibles-20260903.js');

  assert.match(css, /\.tab-panel\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.tab-panel\.visible\s*\{\s*display:\s*block;\s*\}/);
  assert.doesNotMatch(visibilityHotfix, /#tab-config\{[^}]*display:block!important/i);
  assert.match(visibilityHotfix, /#tab-config\{visibility:visible!important;\}/);
});
