"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const JS_DIR = path.join(__dirname, "..", "public", "js");
const SOURCE = [
  fs.readFileSync(path.join(JS_DIR, "transferencias.js"), "utf8"),
  fs.readFileSync(path.join(JS_DIR, "ventas.js"), "utf8")
].join("\n");

const FIXTURES = {
  ventas: [
    { id: "sale-001", fecha: "2026-10-20T10:00:00Z", total: 100, almacenes: { nombre: "Principal" } },
    { id: "sale-002", fecha: "2026-10-21T11:00:00Z", total: 250, almacenes: { nombre: "Reserva" } }
  ],
  transferencias: [
    { id: "trf-001", fecha: "2026-10-20T12:00:00Z", estado: "COMPLETADA", origen: { nombre: "Principal" }, destino: { nombre: "Reserva" } },
    { id: "trf-002", fecha: "2026-10-21T13:00:00Z", estado: "PENDIENTE", origen: { nombre: "Reserva" }, destino: { nombre: "Principal" } }
  ],
  vales: [
    { id: "vale-001", fecha: "2026-10-20T14:00:00Z", tipo: "merma", cantidad: 2, productos: { nombre: "Harina" }, almacenes: { nombre: "Principal" } },
    { id: "vale-002", fecha: "2026-10-21T15:00:00Z", tipo: "donacion", cantidad: 1, productos: { nombre: "Azúcar" }, almacenes: { nombre: "Reserva" } }
  ]
};

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<input id='ventas-buscar' type='search'><span id='ventas-contador'></span><div id='lista-ventas'></div>" +
      "<input id='trf-buscar' type='search'><span id='trf-contador'></span><div id='lista-transferencias'></div>" +
      "<input id='vales-buscar' type='search'><span id='vales-contador'></span><div id='lista-vales'></div>" +
    "</body></html>",
    { url: "https://battlecruiser-history-search.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  window._cache = {
    ventas: FIXTURES.ventas.map((x) => ({ ...x })),
    transferencias: FIXTURES.transferencias.map((x) => ({ ...x })),
    vales: FIXTURES.vales.map((x) => ({ ...x }))
  };
  window.setEmpty = (id, message) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = message;
  };
  window.setLoading = (id, message) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = message;
  };
  window.actualizarContador = (id, visibles, total) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = String(visibles) + " de " + String(total);
  };
  window.escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  window.idCorto = (value) => String(value ?? "").slice(-6);
  window.fechaCorta = (value) => String(value ?? "").slice(0, 10);
  window.money = (value) => Number(value || 0).toFixed(2);
  // Run only the shared history-search binding; other module initialization is outside this test's scope.
  window.safeInit = (name, fn) => { if (name === "movimientos-buscadores") fn(); };
  window.eval(SOURCE);
  window.renderVentasHistorial();
  window.renderTransferenciasLista();
  window.renderValesLista();
  t.after(() => window.close());
  return { window, dom };
}

function inputAndRender(window, inputId, value) {
  const input = window.document.getElementById(inputId);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function cards(window, listId, selector) {
  return Array.from(window.document.querySelectorAll("#" + listId + " " + selector));
}

test("Paso 4 historial de Ventas: buscar por almacén filtra las ventas y actualiza el contador", (t) => {
  const { window } = setup(t);
  inputAndRender(window, "ventas-buscar", "reserva");
  const visible = cards(window, "lista-ventas", ".venta-item");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].getAttribute("data-venta-id"), "sale-002");
  assert.match(visible[0].textContent, /Reserva/);
  assert.equal(window.document.getElementById("ventas-contador").textContent, "Mostrando 1 de 2");
});

test("Paso 4 historial de Ventas: estado vacío y Ver todas recuperan la lista original", (t) => {
  const { window } = setup(t);
  inputAndRender(window, "ventas-buscar", "no-existe-fixture");
  assert.match(window.document.getElementById("lista-ventas").textContent, /No encontramos ventas con esos criterios/i);
  const reset = window.document.querySelector("#lista-ventas .mov-ver-todas-btn");
  assert.ok(reset, "la búsqueda vacía debe ofrecer Ver todas las ventas");
  reset.click();
  assert.equal(window.document.getElementById("ventas-buscar").value, "");
  assert.equal(cards(window, "lista-ventas", ".venta-item").length, 2);
  assert.equal(window.document.getElementById("ventas-contador").textContent, "2 elementos");
});

test("Paso 4 historial de Transferencias: la búsqueda por estado muestra solo la transferencia coincidente", (t) => {
  const { window } = setup(t);
  inputAndRender(window, "trf-buscar", "pendiente");
  const visible = cards(window, "lista-transferencias", ".trf-item");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].getAttribute("data-trf-id"), "trf-002");
  assert.match(visible[0].textContent, /PENDIENTE/);
  assert.equal(window.document.getElementById("trf-contador").textContent, "Mostrando 1 de 2");
});

test("Paso 4 historial de Vales: la búsqueda por producto limita resultados y Ver todos limpia el filtro", (t) => {
  const { window } = setup(t);
  inputAndRender(window, "vales-buscar", "harina");
  const visible = cards(window, "lista-vales", ".vale-item");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].getAttribute("data-vale-id"), "vale-001");
  assert.match(visible[0].textContent, /Harina/);
  inputAndRender(window, "vales-buscar", "no-existe-fixture");
  assert.match(window.document.getElementById("lista-vales").textContent, /No encontramos vales con esos criterios/i);
  const reset = window.document.querySelector("#lista-vales .mov-ver-todas-btn");
  assert.ok(reset, "el estado vacío debe ofrecer Ver todos");
  reset.click();
  assert.equal(window.document.getElementById("vales-buscar").value, "");
  assert.equal(cards(window, "lista-vales", ".vale-item").length, 2);
  assert.equal(window.document.getElementById("vales-contador").textContent, "2 elementos");
});
