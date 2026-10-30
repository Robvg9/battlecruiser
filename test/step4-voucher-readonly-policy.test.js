"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const VALES_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "vales.js"),
  "utf8"
);
const HIDE_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m12-fe5-hide-vales.js"),
  "utf8"
);

test("Paso 4 RWHT 118: detalle de vale existente es consultable en modo lectura sin mutar stock", (t) => {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<section id='vale-detalle' class='mov-detalle hidden' role='dialog'></section>" +
    "</body></html>",
    { url: "https://battlecruiser-voucher-readonly.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  t.after(() => window.close());

  const vale = {
    id: "vale-fixture-118",
    fecha: "2026-09-02T12:30:00Z",
    tipo: "merma",
    cantidad: 2,
    productos: { nombre: "Producto fixture" },
    almacenes: { nombre: "La Cueva" }
  };
  const writes = [];
  window._cache = { vales: [vale] };
  window.fechaHoraCompleta = (value) => String(value);
  window.idCorto = (value) => String(value).slice(0, 8);
  window.escHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  window.money = (value) => Number(value).toFixed(2);
  window.client = { rpc: async (name, params) => { writes.push({ name, params }); return { data: null, error: null }; } };

  window.eval(VALES_SOURCE);
  window.mostrarDetalleVale(vale.id);

  const detail = window.document.getElementById("vale-detalle");
  assert.equal(detail.classList.contains("hidden"), false);
  assert.match(detail.textContent, /vale-fixture-118/);
  assert.match(detail.textContent, /Merma/);
  assert.match(detail.textContent, /Producto fixture/);
  assert.match(detail.textContent, /La Cueva/);
  assert.match(detail.textContent, /2\.00 u/);
  assert.deepEqual(writes, [], "abrir el detalle nunca registra ni revierte una salida de stock");

  detail.querySelector(".vale-detalle-cerrar-btn").click();
  assert.equal(detail.classList.contains("hidden"), true);
  assert.equal(detail.textContent, "");
  assert.deepEqual(writes, []);
});

test("Paso 4 RWHT 009/065-069/118: la política vigente elimina la ruta y formulario independiente de Vales", (t) => {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<nav id='tabs'><button class='tab-btn' data-tab='vales'>Vales</button></nav>" +
      "<main><section id='tab-vales' class='tab-panel'><form id='form-vale'></form>" +
        "<div id='lista-vales'></div><div id='vale-detalle'></div></section></main>" +
      "<nav id='report-tabs'><button class='rep-tab-btn' data-rep='vales'>Vales</button></nav>" +
      "<select id='mov-filtro-tipo'><option value=''>Todos</option>" +
        "<option value='VALE_SALIDA'>Vale de salida</option><option value='TRANSFERENCIA'>Transferencia</option></select>" +
    "</body></html>",
    { url: "https://battlecruiser-voucher-policy.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  t.after(() => window.close());
  Object.defineProperty(window.document, "readyState", { value: "complete", configurable: true });
  window.eval(HIDE_SOURCE);

  assert.equal(window.document.querySelector('.tab-btn[data-tab="vales"]'), null);
  assert.equal(window.document.getElementById("tab-vales"), null);
  assert.equal(window.document.getElementById("form-vale"), null);
  assert.equal(window.document.querySelector('.rep-tab-btn[data-rep="vales"]'), null);
  assert.equal(Array.from(window.document.getElementById("mov-filtro-tipo").options)
    .some((option) => option.value === "VALE_SALIDA"), false);
  assert.ok(window.document.querySelector('#mov-filtro-tipo option[value="TRANSFERENCIA"]'));
});
