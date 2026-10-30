"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const navSource = fs.readFileSync(path.join(root, "public/js/hotfix-secciones-visibles-20260903.js"), "utf8");
const pulidoSource = fs.readFileSync(path.join(root, "public/js/hotfix-pulido-20260903.js"), "utf8");

test("visibility hotfix never reopens a route denied by the permission engine", async () => {
  const tabs = [
    '<button class="tab-btn" data-tab="config" aria-hidden="true" tabindex="-1" style="display:none!important">Config</button>',
    '<button class="tab-btn" data-tab="ciclos">Ciclos antiguos</button>'
  ].join("");
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><nav id="tabs">' + tabs +
    '</nav><section id="tab-config" hidden aria-hidden="true" style="display:none!important"></section></body></html>',
    { runScripts: "outside-only", url: "https://battlecruiser.test/", pretendToBeVisual: true }
  );
  let mutationRecords = 0;
  const observer = new dom.window.MutationObserver((records) => { mutationRecords += records.length; });
  observer.observe(dom.window.document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ["class", "style", "aria-hidden", "tabindex"]
  });
  try {
    dom.window.eval(navSource);
    await new Promise(resolve => dom.window.setTimeout(resolve, 30));
    const config = dom.window.document.querySelector('#tabs [data-tab="config"]');
    const ciclos = dom.window.document.querySelector('#tabs [data-tab="ciclos"]');
    assert.equal(config.classList.contains("hidden"), false,
      "fixture starts without a hidden class; visibility is represented by permission-owned inline styles");
    assert.equal(config.style.getPropertyValue("display"), "none",
      "label normalizer must not reopen a denied config route");
    assert.equal(config.style.getPropertyPriority("display"), "important");
    assert.equal(config.getAttribute("aria-hidden"), "true");
    assert.equal(config.tabIndex, -1);
    assert.equal(config.textContent, "Administración", "labels may be normalized without changing access");
    assert.equal(ciclos.textContent, "Turnos");
    assert.ok(mutationRecords < 30,
      "a label-only script should not run visibility observers or repeatedly rewrite the DOM; observed " + mutationRecords + " records");
  } finally {
    observer.disconnect();
    dom.window.close();
  }
});

test("the body observer does not rewrite an already-normalized Administration label", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><nav id="tabs">' +
      '<button class="tab-btn" data-tab="config"><span class="bc-nav-icon">⚙</span>' +
      '<span class="bc-nav-label">Administración</span></button>' +
    '</nav></body></html>',
    { runScripts: "outside-only", url: "https://battlecruiser.test/", pretendToBeVisual: true }
  );
  const { window } = dom;
  const nativeMutationObserver = window.MutationObserver;
  const nativeObserver = new nativeMutationObserver(() => {});
  const bodyObserverInstances = [];
  const domReady = window.document.readyState === "loading"
    ? new Promise(resolve => window.document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();

  nativeObserver.observe(window.document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.MutationObserver = class CapturedMutationObserver {
    constructor(callback) {
      this.callback = callback;
      bodyObserverInstances.push(this);
    }
    observe() {}
    disconnect() {}
  };

  try {
    window.eval(pulidoSource);
    await domReady;
    await new Promise(resolve => window.setTimeout(resolve, 0));

    const bodyObserver = bodyObserverInstances[0];
    assert.ok(bodyObserver, "the product polish body observer should be installed");
    nativeObserver.takeRecords();

    // Simulate unrelated body mutations waking the global observer.
    bodyObserver.callback([]);
    await new Promise(resolve => window.setTimeout(resolve, 0));
    const firstPass = nativeObserver.takeRecords();

    bodyObserver.callback([]);
    await new Promise(resolve => window.setTimeout(resolve, 0));
    const secondPass = nativeObserver.takeRecords();

    assert.equal(
      firstPass.length,
      0,
      "an already-correct Administration label must not create a new childList mutation"
    );
    assert.equal(
      secondPass.length,
      0,
      "repeated observer callbacks must remain idempotent"
    );
    assert.equal(
      window.document.querySelector(".bc-nav-label").textContent,
      "Administración"
    );
  } finally {
    nativeObserver.disconnect();
    dom.window.close();
  }
});

test("stock badge renderer avoids same-value DOM writes", () => {
  assert.match(
    pulidoSource,
    /var stockLabel='Stock: '\+n;\s*if\(el\)\{if\(el\.textContent!==stockLabel\)el\.textContent=stockLabel;\}/,
    "stock label updates must be idempotent to avoid waking the body childList observer indefinitely"
  );
});
