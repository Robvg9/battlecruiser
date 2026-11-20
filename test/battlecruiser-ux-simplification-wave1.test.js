"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");
const index=fs.readFileSync("public/index.html","utf8");
const css=fs.readFileSync("public/style.css","utf8");
const auth=fs.readFileSync("public/js/auth.js","utf8");
const jornada=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const price=fs.readFileSync("public/js/jornada-price-changes.js","utf8");

test("Jornada planner starts with no duration and calendar starts on today",()=>{
  assert.match(jornada,/id="bc7-days-count" type="number" min="2" max="31" placeholder="Ej\. 5"/);
  assert.doesNotMatch(jornada,/id="bc7-days-count"[^>]*value=/);
  assert.match(jornada,/if\(!value\)return 0/);
  assert.match(jornada,/if\(!n\).*Indica cuántos días quieres programar/s);
  assert.match(jornada,/\$\('bc7-list-from'\)\.value=today/);
  assert.doesNotMatch(jornada,/\$\('bc7-list-from'\)\.value=addDays\(today,-7\)/);
});

test("Login removes bootstrap shortcut and visible technical diagnostics",()=>{
  assert.doesNotMatch(index,/bootstrap-first-admin-link|Inicializar primer administrador/);
  assert.doesNotMatch(auth,/bc-auth-diagnostic|Diagnóstico de sesión:/);
  assert.match(auth,/window\.__BC_AUTH_DIAGNOSTIC__ = diagnostic/);
});

test("Password eye is styled inside its password field",()=>{
  assert.match(index,/class="pass-toggle"/);
  assert.match(css,/\.field-pass \{ position: relative; \}/);
  assert.match(css,/\.pass-toggle \{/);
  assert.match(css,/\.pass-toggle svg/);
  assert.doesNotMatch(css,/\.toggle-pass \{/);
});

test("Price change action uses movement toolbar and supports optional cost",()=>{
  assert.match(price,/className = 'bc165-action'/);
  assert.match(price,/actions\.appendChild\(button\)/);
  assert.match(price,/bc-jpc-dialog bc165-modal/);
  assert.match(price,/Venta actual:/);
  assert.match(price,/Costo actual:/);
  assert.match(price,/Nuevo costo \(opcional\)/);
  assert.match(price,/data-bc-jpc-cost/);
  assert.match(price,/costo_nuevo:/);
  assert.match(price,/item\.costo_nuevo!=null/);
  assert.match(app,/\["jornada-price-changes\.js","1\.0\.4"\]/);
  assert.match(sw,/\.\/js\/jornada-price-changes\.js\?v=1\.0\.4/);
});
