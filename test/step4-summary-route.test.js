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
      "<div id='app-shell' class='visible' data-bc-permisos-cargados='1'></div>" +
      "<script data-bc-m18='1'></script>" +
      "<div id='tabs'>" +
        "<button type='button' class='tab-btn active' data-tab='resumen' data-bc-permiso='1'>Resumen</button>" +
        "<button type='button' class='tab-btn' data-tab='movimientos' data-bc-permiso='1'>Movimientos</button>" +
        "<button type='button' class='tab-btn hidden' data-tab='transferencias' data-bc-permiso='0'>Transferencias</button>" +
        "<button type='button' class='tab-btn hidden' data-tab='vales' data-bc-permiso='0'>Vales</button>" +
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
  assert.equal(window.__BC_M51_PENDING_SUMMARY_MOVE?.tipo, "transferencia");
  assert.equal(window.__BC_M51_PENDING_SUMMARY_MOVE?.id, id);
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
    assert.equal(window.__BC_M51_PENDING_SUMMARY_MOVE?.tipo, "vale");
    assert.equal(window.__BC_M51_PENDING_SUMMARY_MOVE?.id, id);
  }
});
