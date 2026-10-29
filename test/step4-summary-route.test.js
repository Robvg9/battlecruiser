"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const NAVIGATION = fs.readFileSync(
  path.join(__dirname, "..", "public/js/navegacion.js"),
  "utf8"
);

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<script data-bc-m18='1'></script>" +
      "<div id='tabs'>" +
        "<button type='button' class='tab-btn active' data-tab='resumen'>Resumen</button>" +
        "<button type='button' class='tab-btn' data-tab='movimientos'>Movimientos</button>" +
        "<button type='button' class='tab-btn hidden' data-tab='transferencias'>Transferencias</button>" +
        "<button type='button' class='tab-btn hidden' data-tab='vales'>Vales</button>" +
      "</div>" +
      "<section id='tab-resumen' class='tab-panel visible'>" +
        "<div id='resumen-movs-lista'></div>" +
      "</section>" +
      "<section id='tab-movimientos' class='tab-panel'></section>" +
      "<section id='tab-transferencias' class='tab-panel'></section>" +
      "<section id='tab-vales' class='tab-panel'></section>" +
    "</body></html>",
    { url: "https://battlecruiser-summary-route.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  window.safeInit = (_name, init) => init();
  window.console.warn = () => {};
  window.eval(NAVIGATION);
  t.after(() => dom.window.close());
  return { dom, window, document: window.document };
}

function makeRow(document, { tipo, id, tab }) {
  const row = document.createElement("div");
  row.className = "resumen-mov-item";
  row.setAttribute("data-mov-tipo", tipo);
  row.setAttribute("data-mov-id", id);
  row.setAttribute("data-mov-tab", tab);
  row.setAttribute("role", "button");
  row.setAttribute("tabindex", "0");
  row.textContent = tipo + " " + id;
  document.getElementById("resumen-movs-lista").appendChild(row);
  return row;
}

test("Paso 4 R9: clic en transferencia usa Movimientos autorizado y conserva el ID", (t) => {
  const { window, document } = setup(t);
  const id = "transfer-summary-001";
  const row = makeRow(document, { tipo: "transferencia", id, tab: "transferencias" });
  row.click();

  assert.equal(document.querySelector('.tab-btn[data-tab="movimientos"]').classList.contains("active"), true);
  assert.equal(document.getElementById("tab-movimientos").classList.contains("visible"), true);
  assert.equal(document.querySelector('.tab-btn[data-tab="transferencias"]').classList.contains("active"), false);
  assert.deepEqual(window.__BC_M51_PENDING_SUMMARY_MOVE, { tipo: "transferencia", id });
});

test("Paso 4 R9: Enter y Espacio en vale usan Movimientos y conservan ID/tipo", (t) => {
  for (const key of ["Enter", " "]) {
    const { window, document } = setup(t);
    const id = "vale-summary-001";
    const row = makeRow(document, { tipo: "vale", id, tab: "vales" });
    const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    row.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true, key + " debe ser consumida por la fila accionable");
    assert.equal(document.querySelector('.tab-btn[data-tab="movimientos"]').classList.contains("active"), true);
    assert.equal(document.getElementById("tab-movimientos").classList.contains("visible"), true);
    assert.equal(document.querySelector('.tab-btn[data-tab="vales"]').classList.contains("active"), false);
    assert.deepEqual(window.__BC_M51_PENDING_SUMMARY_MOVE, { tipo: "vale", id });
  }
});
