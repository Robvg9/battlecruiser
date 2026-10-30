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

test("section-scope observers ignore nested control churn and watch only navigation/panel boundaries", async () => {
  const dom = createDom({ ready: true, buttonPermission: "1", panelPermission: "1" });
  const { window } = dom;
  const observers = [];
  window.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target, options) {
      observers.push({ target, options, callback: this.callback });
    }
    disconnect() {}
  };

  try {
    window.eval(scopeSource);
    await new Promise(resolve => window.setTimeout(resolve, 5));

    const tabs = observers.find(observer => observer.target.id === "tabs");
    const main = observers.find(observer => observer.target.classList &&
      observer.target.classList.contains("main-content"));
    assert.ok(tabs, "navigation observer must be installed");
    assert.ok(main, "main panel observer must be installed");
    assert.equal(tabs.options.subtree, true,
      "nested authorized nav groups must continue to be observed");
    assert.notEqual(main.options.subtree, true,
      "main observer must not scan every nested control mutation");

    const button = window.document.querySelector("#tabs .tab-btn[data-tab]");
    const panel = window.document.querySelector(".main-content > .tab-panel");
    const nestedControl = window.document.createElement("span");
    panel.appendChild(nestedControl);

    const nativeSetTimeout = window.setTimeout.bind(window);
    let scheduled = 0;
    window.setTimeout = function (...args) {
      scheduled++;
      return nativeSetTimeout(...args);
    };

    tabs.callback([{ type: "attributes", target: nestedControl, attributeName: "class" }]);
    main.callback([{ type: "attributes", target: nestedControl, attributeName: "class" }]);
    assert.equal(scheduled, 0,
      "class changes inside panel controls must not schedule a section-wide enforcement pass");

    tabs.callback([{ type: "attributes", target: button, attributeName: "class" }]);
    assert.equal(scheduled, 1,
      "navigation button changes must still schedule enforcement");

    main.callback([{ type: "attributes", target: panel, attributeName: "class" }]);
    assert.equal(scheduled, 2,
      "direct tab-panel changes must still schedule enforcement");
  } finally {
    dom.window.close();
  }
});

