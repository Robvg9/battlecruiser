"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const navSource = fs.readFileSync(path.join(root, "public/js/hotfix-secciones-visibles-20260903.js"), "utf8");
const pulidoSource = fs.readFileSync(path.join(root, "public/js/hotfix-pulido-20260903.js"), "utf8");

test("navigation observer settles after visibility normalization", async () => {
  const tabs = ["resumen", "productos", "ventas", "almacenes", "transferencias", "vales", "pendientes", "reportes", "inventario", "movimientos", "turnos", "ciclos", "operacion", "comunicacion", "mando", "usuarios", "config"]
    .map((tab) => '<button class="tab-btn" data-tab="' + tab + '">' + tab + '</button>')
    .join("");
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><nav id="tabs">' + tabs + '</nav><section id="tab-config"></section></body></html>',
    { runScripts: "outside-only", url: "https://battlecruiser.test/", pretendToBeVisual: true }
  );
  let mutationRecords = 0;
  const observer = new dom.window.MutationObserver((records) => { mutationRecords += records.length; });
  observer.observe(dom.window.document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "aria-hidden"],
  });
  dom.window.eval(navSource);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 2200));
  observer.disconnect();

  const config = dom.window.document.querySelector('#tabs [data-tab="config"]');
  assert.equal(config.style.getPropertyValue("display"), "flex");
  assert.equal(config.style.getPropertyPriority("display"), "important");
  assert.ok(mutationRecords < 250, 'observer should settle instead of repeatedly changing styles; observed ' + mutationRecords + ' records');
  dom.window.close();
});

test("stock badge renderer avoids same-value DOM writes", () => {
  assert.match(
    pulidoSource,
    /var stockLabel='Stock: '\+n;\s*if\(el\)\{if\(el\.textContent!==stockLabel\)el\.textContent=stockLabel;\}/,
    "stock label updates must be idempotent to avoid waking the body childList observer indefinitely"
  );
});
