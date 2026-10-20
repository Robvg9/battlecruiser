"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("moving Ajustes into Configuración clears and continuously prevents the body scroll lock", async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body class="bc-aj-open">
    <button class="tab-btn" data-tab="config" type="button">Configuración</button>
    <div id="tab-config" class="visible"><h3>Configuración</h3></div>
    <div id="bc-aj-backdrop" class="open"></div>
    <aside id="bc-aj-panel" class="open" role="dialog">
      <div class="bc-aj-head"><h2>Ajustes</h2></div>
      <button id="bc-aj-close" type="button">Cerrar</button>
      <div class="bc-aj-body"></div>
      <button id="bc-aj-logout" type="button">Cerrar sesión</button>
    </aside>
  </body></html>`, { runScripts: "outside-only" });

  try {
    dom.window.eval(read("public/js/hotfix-configuracion-20260902.js"));
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));

    const doc = dom.window.document;
    const panel = doc.getElementById("bc-aj-panel");
    assert.equal(panel.parentElement.id, "tab-config");
    assert.equal(panel.classList.contains("open"), false);
    assert.equal(doc.getElementById("bc-aj-backdrop"), null);
    assert.equal(doc.body.classList.contains("bc-aj-open"), false);

    // Simulate a legacy Ajustes handler reapplying the lock after migration.
    doc.body.classList.add("bc-aj-open");
    doc.getElementById("bc-aj-panel").classList.add("open");
    doc.querySelector('.tab-btn[data-tab="config"]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(doc.body.classList.contains("bc-aj-open"), false, "Config tab click must release a reintroduced legacy lock");
    assert.equal(doc.body.classList.contains("bc-config-scroll-unlocked"), true, "mobile Configuración must opt into document scrolling");
    assert.equal(doc.documentElement.classList.contains("bc-config-scroll-unlocked"), true, "root document must be released from a stale scroll lock");
    assert.equal(doc.getElementById("tab-config").classList.contains("bc-config-scroll-region"), true, "Configuración must become its own touch-scroll region");
    const hotfix = read("public/js/hotfix-configuracion-20260902.js");
    const css = read("public/style.css");
    assert.match(hotfix, /bc-config-scroll-region/);
    assert.match(css, /#tab-config\.visible\.bc-config-scroll-region/);
    assert.match(css, /overflow-y: auto !important/);
    assert.match(css, /-webkit-overflow-scrolling: touch/);
    assert.match(css, /touch-action: pan-y/);
    assert.equal(doc.getElementById("bc-aj-panel").classList.contains("open"), false);
  } finally {
    dom.window.close();
  }
});

test("the header Ajustes action navigates to Configuración after migration", () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <button id="ajustes-btn" type="button">Ajustes</button>
    <button class="tab-btn" data-tab="config" type="button">Configuración</button>
    <div id="bc-aj-panel"></div>
  </body></html>`, { runScripts: "outside-only" });

  try {
    const doc = dom.window.document;
    // Make ready-state deterministic so the module wires the header synchronously.
    Object.defineProperty(doc, "readyState", { configurable: true, value: "complete" });
    doc.getElementById("bc-aj-panel").dataset.bcMovedToConfig = "1";

    let configClicks = 0;
    doc.querySelector('.tab-btn[data-tab="config"]').addEventListener("click", () => configClicks++);

    dom.window.eval(read("public/js/ui-ajustes-panel.js"));
    assert.equal(doc.getElementById("ajustes-btn").dataset.bcAj, "1", "header listener should be installed");
    doc.getElementById("ajustes-btn").click();

    assert.equal(configClicks, 1, "Ajustes should route to the migrated Configuración tab");
    assert.equal(dom.window.document.body.classList.contains("bc-aj-open"), false);
    assert.equal(doc.getElementById("bc-aj-panel").classList.contains("open"), false);
  } finally {
    dom.window.close();
  }
});
