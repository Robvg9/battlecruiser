"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const navSource = fs.readFileSync(path.join(root, "public/js/hotfix-secciones-visibles-20260903.js"), "utf8");
const pulidoSource = fs.readFileSync(path.join(root, "public/js/hotfix-pulido-20260903.js"), "utf8");

test("legacy visibility compatibility never overrides effective permissions", () => {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><nav id="tabs">' +
      '<button class="tab-btn hidden" data-tab="productos" data-bc-permiso="0" style="display:none!important">Productos</button>' +
      '<button class="tab-btn" data-tab="config">config</button>' +
      '<button class="tab-btn" data-tab="ciclos">ciclos</button>' +
      '</nav></body></html>',
    { runScripts: "outside-only", url: "https://battlecruiser.test/", pretendToBeVisual: true }
  );
  let applied = 0;
  try {
    Object.defineProperty(dom.window.document, "readyState", { value: "complete", configurable: true });
    dom.window.aplicarPermisosAInterfaz = function () {
      applied += 1;
      const products = dom.window.document.querySelector('[data-tab="productos"]');
      products.classList.add("hidden");
      products.setAttribute("data-bc-permiso", "0");
      products.style.setProperty("display", "none", "important");
    };
    dom.window.eval(navSource);
    const products = dom.window.document.querySelector('[data-tab="productos"]');
    const config = dom.window.document.querySelector('[data-tab="config"]');
    assert.ok(applied >= 1, "the compatibility module must re-apply the permission policy");
    assert.equal(products.getAttribute("data-bc-permiso"), "0");
    assert.ok(products.classList.contains("hidden"));
    assert.equal(products.style.getPropertyValue("display"), "none");
    assert.equal(config.textContent, "Administración", "only presentation labels remain in this module");
    assert.doesNotMatch(navSource, /KEEP_HIDDEN|setProperty/);
  } finally {
    dom.window.close();
  }
});

test("stock badge renderer avoids same-value DOM writes", () => {
  assert.match(
    pulidoSource,
    /var stockLabel='Stock: '\\+n;\\s*if\\(el\\)\\{if\\(el\\.textContent!==stockLabel\\)el\\.textContent=stockLabel;\\}/,
    "stock label updates must be idempotent to avoid waking the body childList observer indefinitely"
  );
});
