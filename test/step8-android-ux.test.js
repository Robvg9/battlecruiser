"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const css = read("public/style.css");
const index = read("public/index.html");
const app = read("public/app.js");
const sw = read("public/service-worker.js");
const account = read("public/js/mi-cuenta.js");

test("Step 8 release version is aligned across the PWA and Service Worker shell", () => {
  assert.match(index, /href="style\.css\?v=9\.5\.16"/);
  assert.match(index, /v9\.5\.16 — BattleCruiser/);
  assert.match(index, /app\.js\?v=9\.5\.16/);
  assert.match(app, /const VERSION=["']9\.5\.16["']/);
  assert.match(sw, /BC_SW_VERSION\s*=\s*["']9\.5\.16["']/);
  assert.match(sw, /\.\/style\.css/);
  assert.match(sw, /\.\/js\/bc7-jornada-ui\.js\?v=7\.1/);
});

test("Mobile footer stays in document flow and respects safe-area/real viewport height", () => {
  const step8 = css.slice(css.lastIndexOf("STEP 8 — Android UX guardrails"));
  assert.ok(step8.length > 0, "Step 8 mobile UX rules must be present");
  assert.match(step8, /min-height:\s*100vh\s*!important;\s*min-height:\s*100dvh\s*!important/);
  assert.match(step8, /\.app-footer\s*\{[^}]*position:\s*static\s*!important/s);
  assert.match(step8, /padding-bottom:\s*calc\(14px\s*\+\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(step8, /\.sidebar\s*\{[^}]*height:\s*100dvh\s*!important/s);
});

test("Mobile controls are reachable, readable and support visible keyboard focus", () => {
  const step8 = css.slice(css.lastIndexOf("STEP 8 — Android UX guardrails"));
  assert.match(step8, /body:has\(#app-shell\.visible\) button/);
  assert.match(step8, /body:has\(#app-shell\.visible\) input:not\(\[type="checkbox"\]\)/);
  assert.match(step8, /min-height:\s*44px/);
  assert.match(step8, /font-size:\s*16px\s*!important/);
  assert.doesNotMatch(step8, /^\s*button,\s*$/m, "touch-target floor must not inflate compact unauthenticated login controls");
  assert.match(css, /@media \(max-height: 480px\) and \(orientation: landscape\)[\s\S]*?#login-form:not\(\.hidden\) input \{[^}]*font-size: 12px/s);
  assert.match(step8, /:focus-visible/);
  assert.match(step8, /scroll-margin-block:\s*12px/);
  assert.match(step8, /prefers-reduced-motion:\s*reduce/);
});

test("Account dialog remains scrollable on a short Android visual viewport", () => {
  const step8 = css.slice(css.lastIndexOf("STEP 8 — Android UX guardrails"));
  assert.match(step8, /\.bc-account-overlay\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(step8, /max-height:\s*calc\(100vh\s*-\s*24px\)/);
  assert.match(step8, /max-height:\s*calc\(100dvh\s*-\s*24px\)/);
  assert.match(index, /aria-controls="bc-mi-cuenta-modal"/);
  assert.ok(/modal\.id\s*=\s*['"]bc-mi-cuenta-modal['"]/.test(account), "Mi Cuenta creates its accessible dialog dynamically");
});
