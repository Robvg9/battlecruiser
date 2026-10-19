"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("moving Ajustes into Configuración clears the body scroll lock", () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body class="bc-aj-open">
    <div id="tab-config"><h3>Configuración</h3></div>
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
