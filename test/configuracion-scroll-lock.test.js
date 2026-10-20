"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("long mobile sections clear stale Ajustes locks and become their own touch-scroll regions", async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body class="bc-aj-open">
    <button class="tab-btn" data-tab="config" type="button">Configuración</button>
    <button class="tab-btn" data-tab="conectividad" type="button">Conectividad</button>
    <button class="tab-btn" data-tab="preferencias" type="button">Preferencias</button>
    <div id="tab-config" class="tab-panel visible"><h3>Configuración</h3></div>
    <div id="tab-conectividad" class="tab-panel"><h3>Conectividad</h3></div>
    <div id="tab-preferencias" class="tab-panel"><h3>Preferencias</h3></div>
    <div id="bc-aj-backdrop" class="open"></div>
    <aside id="bc-aj-panel" class="open" role="dialog"><div class="bc-aj-body"></div></aside>
  </body></html>`, { runScripts: "outside-only" });

  try {
    const win = dom.window;
    const doc = win.document;
    Object.defineProperty(doc, "readyState", { configurable: true, value: "complete" });
    win.matchMedia = () => ({ matches: true, media: "(max-width: 759px)" });
    win.eval(read("public/js/hotfix-configuracion-20260902.js"));

    assert.equal(doc.body.classList.contains("bc-aj-open"), false);
    assert.equal(doc.getElementById("bc-aj-panel"), null, "legacy drawer must be removed");
    assert.equal(doc.getElementById("bc-aj-backdrop"), null, "legacy backdrop must be removed");
    assert.equal(doc.body.classList.contains("bc-config-scroll-unlocked"), true);
    assert.equal(doc.documentElement.classList.contains("bc-config-scroll-unlocked"), true);
    assert.equal(doc.getElementById("tab-config").classList.contains("bc-config-scroll-region"), true);

    for (const name of ["conectividad", "preferencias", "config"]) {
      doc.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("visible"));
      doc.getElementById("tab-" + name).classList.add("visible");
      doc.body.classList.add("bc-aj-open");
      doc.querySelector('.tab-btn[data-tab="' + name + '"]').click();
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(doc.body.classList.contains("bc-aj-open"), false, name + " click clears stale legacy lock");
      for (const section of ["config", "conectividad", "preferencias"]) {
        assert.equal(
          doc.getElementById("tab-" + section).classList.contains("bc-config-scroll-region"),
          section === name,
          "only the active section gets the touch-scroll region"
        );
      }
    }

    const hotfix = read("public/js/hotfix-configuracion-20260902.js");
    assert.match(hotfix, /legacyPanel\.parentNode\.removeChild\(legacyPanel\)/);
    assert.match(hotfix, /bc-config-scroll-region/);
    assert.match(hotfix, /overflow-y:auto!important/);
    assert.match(hotfix, /-webkit-overflow-scrolling:touch/);
    assert.match(hotfix, /touch-action:pan-y/);
  } finally {
    dom.window.close();
  }
});

test("the header does not render the retired Ajustes drawer; navigation exposes two clear sections", () => {
  const index = read("public/index.html");
  const app = read("public/app.js");
  assert.doesNotMatch(index, /id="ajustes-btn"|id="ajustes-menu"|id="bc-aj-panel"/);
  assert.doesNotMatch(app, /ui-ajustes-panel\.js/);
  assert.match(index, /data-tab="conectividad">Conectividad/);
  assert.match(index, /data-tab="preferencias">Preferencias/);
});
