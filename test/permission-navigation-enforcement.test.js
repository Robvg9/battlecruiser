"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const scopeSource = fs.readFileSync(
  path.join(__dirname, "../public/js/section-scope-fix.js"),
  "utf8"
);
const pulidoSource = fs.readFileSync(
  path.join(__dirname, "../public/js/hotfix-pulido-20260903.js"),
  "utf8"
);
const pulidoBSource = fs.readFileSync(
  path.join(__dirname, "../public/js/hotfix-pulido-20260903b.js"),
  "utf8"
);
const adminVisibleSource = fs.readFileSync(
  path.join(__dirname, "../public/js/hotfix-17-13-configuracion-admin-visible-20260903.js"),
  "utf8"
);
const finalLoaderSource = fs.readFileSync(
  path.join(__dirname, "../public/js/hotfix-17-final-loader-20260903.js"),
  "utf8"
);

function createDom({ ready = false, buttonPermission = "0", panelPermission = "0" } = {}) {
  const marker = ready ? 'data-bc-permisos-cargados="1"' : "";
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body>' +
      '<div id="app-shell" class="visible" ' + marker + '>' +
        '<nav id="tabs">' +
          '<button type="button" class="tab-btn active" data-tab="config" data-bc-permiso="' +
            buttonPermission + '">Administración</button>' +
        '</nav>' +
        '<main class="main-content">' +
          '<section id="tab-config" class="tab-panel visible" data-bc-permiso="' +
            panelPermission + '"></section>' +
        '</main>' +
      '</div>' +
    '</body></html>',
    { runScripts: "outside-only", url: "https://battlecruiser.test/", pretendToBeVisual: true }
  );
  return dom;
}

test("section-scope never exposes a previously active panel before permission resolution", async () => {
  const dom = createDom({ ready: false, buttonPermission: "0", panelPermission: "0" });
  try {
    dom.window.eval(scopeSource);
    await new Promise(resolve => dom.window.setTimeout(resolve, 25));
    const panel = dom.window.document.getElementById("tab-config");
    assert.equal(panel.classList.contains("visible"), false);
    assert.equal(panel.style.getPropertyValue("display"), "none");
    assert.equal(panel.style.getPropertyPriority("display"), "important");
    assert.equal(panel.getAttribute("aria-hidden"), "true");
  } finally {
    dom.window.close();
  }
});

test("section-scope cannot reopen a denied panel but keeps an authorized active panel usable", () => {
  const dom = createDom({ ready: true, buttonPermission: "0", panelPermission: "0" });
  try {
    dom.window.eval(scopeSource);
    const panel = dom.window.document.getElementById("tab-config");
    dom.window.__BC_SECTION_SCOPE_VERIFY__();
    assert.equal(panel.classList.contains("visible"), false);
    assert.equal(panel.style.getPropertyValue("display"), "none");
    assert.equal(panel.style.getPropertyPriority("display"), "important");

    const button = dom.window.document.querySelector('#tabs [data-tab="config"]');
    button.setAttribute("data-bc-permiso", "1");
    panel.setAttribute("data-bc-permiso", "1");
    dom.window.__BC_SECTION_SCOPE_VERIFY__();
    assert.equal(panel.classList.contains("visible"), true);
    assert.equal(panel.style.getPropertyValue("display"), "block");
    assert.equal(panel.getAttribute("aria-hidden"), "false");
  } finally {
    dom.window.close();
  }
});

test("legacy polish modules no longer create or force-show Administration", () => {
  assert.match(pulidoSource, /function normalizarEtiquetaConfig/);
  assert.doesNotMatch(pulidoSource, /function configVisible/);
  assert.doesNotMatch(pulidoSource, /data-tab=config\]\{display:flex!important/);
  assert.doesNotMatch(pulidoSource, /b\.style\.display='flex'/);
  assert.doesNotMatch(pulidoSource, /tabs\.appendChild\(b\)/);
  assert.doesNotMatch(pulidoBSource, /t\.style\.display='flex'/);
});
