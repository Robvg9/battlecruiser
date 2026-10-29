"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const CORE = fs.readFileSync(path.join(ROOT, "public/js/core.js"), "utf8");
const VALES = fs.readFileSync(path.join(ROOT, "public/js/vales.js"), "utf8");

function setup() {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      "<div id='lista-transferencias'>" +
        "<div id='transfer-row' class='lista-item lista-item-accion trf-item' data-trf-id='transfer-001' role='button' tabindex='0'>" +
          "<span id='transfer-child'>Principal → Reserva</span>" +
        "</div>" +
      "</div>" +
      "<div id='transferencia-detalle' class='mov-detalle hidden' role='dialog' aria-label='Detalle de transferencia'></div>" +
      "<div id='lista-vales'>" +
        "<div id='vale-row' class='lista-item lista-item-accion vale-item vale-tipo-merma' data-vale-id='voucher-001' role='button' tabindex='0'>" +
          "<span id='vale-child'>Harina · La Cueva</span>" +
        "</div>" +
      "</div>" +
      "<div id='vale-detalle' class='mov-detalle hidden' role='dialog' aria-label='Detalle de vale'></div>" +
    "</body></html>",
    { url: "https://battlecruiser-step4.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  const transferCalls = [];
  window.supabase = { createClient: () => ({}) };
  window._cache = {
    transferencias: [{
      id: "transfer-001",
      fecha: "2026-09-02T14:15:00Z",
      estado: "COMPLETADA",
      origen: { nombre: "Principal" },
      destino: { nombre: "Reserva" }
    }],
    vales: [{
      id: "voucher-001",
      fecha: "2026-09-02T15:20:00Z",
      tipo: "merma",
      cantidad: 2.5,
      productos: { nombre: "Harina" },
      almacenes: { nombre: "La Cueva" }
    }]
  };
  window.escHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  window.idCorto = (value) => String(value || "").slice(0, 8);
  window.mostrarDetalleTransferencia = (id) => { transferCalls.push(String(id)); };
  window.cerrarDetalleTransferencia = () => {
    const panel = window.document.getElementById("transferencia-detalle");
    panel.classList.add("hidden");
    panel.innerHTML = "";
  };

  window.eval(CORE);
  window.eval(VALES);
  return { dom, window, transferCalls };
}

test("Paso 4 R11: un clic en una transferencia abre el detalle real y conserva su contexto", () => {
  const { dom, window, transferCalls } = setup();
  try {
    window.document.getElementById("transfer-child").dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true })
    );
    const panel = window.document.getElementById("transferencia-detalle");
    assert.equal(panel.classList.contains("hidden"), false);
    assert.match(panel.textContent, /Transferencia #/);
    assert.match(panel.textContent, /Almacén origen\s*Principal/);
    assert.match(panel.textContent, /Almacén destino\s*Reserva/);
    assert.deepEqual(transferCalls, ["transfer-001"]);
  } finally {
    dom.window.close();
  }
});

test("Paso 4 R11: Enter y Espacio abren una fila de transferencia y consumen la tecla", () => {
  for (const key of ["Enter", " "]) {
    const { dom, window } = setup();
    try {
      const row = window.document.getElementById("transfer-row");
      const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      row.dispatchEvent(event);
      const panel = window.document.getElementById("transferencia-detalle");
      assert.equal(event.defaultPrevented, true, key + " no debe desplazar la página al abrir detalle");
      assert.equal(panel.classList.contains("hidden"), false, key + " no abrió el detalle");
      assert.match(panel.textContent, /Principal/);
      assert.match(panel.textContent, /Reserva/);
    } finally {
      dom.window.close();
    }
  }
});

test("Paso 4 R12: un clic en un vale abre el detalle con tipo, producto, almacén y cantidad reales del fixture", () => {
  const { dom, window } = setup();
  try {
    window.document.getElementById("vale-child").dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true })
    );
    const panel = window.document.getElementById("vale-detalle");
    assert.equal(panel.classList.contains("hidden"), false);
    assert.match(panel.textContent, /Merma/i);
    assert.match(panel.textContent, /Harina/);
    assert.match(panel.textContent, /La Cueva/);
    assert.match(panel.textContent, /2\.50 u/);
    panel.querySelector(".vale-detalle-cerrar-btn").click();
    assert.equal(panel.classList.contains("hidden"), true, "el botón Cerrar debe cerrar el detalle");
  } finally {
    dom.window.close();
  }
});

test("Paso 4 R12: Enter y Espacio abren el detalle del vale y no activan operaciones de escritura", () => {
  for (const key of ["Enter", " "]) {
    const { dom, window } = setup();
    try {
      const row = window.document.getElementById("vale-row");
      const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      row.dispatchEvent(event);
      const panel = window.document.getElementById("vale-detalle");
      assert.equal(event.defaultPrevented, true, key + " no debe desplazar la página al abrir detalle");
      assert.equal(panel.classList.contains("hidden"), false, key + " no abrió el detalle");
      assert.match(panel.textContent, /Harina/);
      assert.match(panel.textContent, /La Cueva/);
    } finally {
      dom.window.close();
    }
  }
});

test("Paso 4 R12: clics ajenos a filas de vales no abren detalles", () => {
  const { dom, window } = setup();
  try {
    const outside = window.document.createElement("button");
    outside.textContent = "Otro control";
    window.document.getElementById("lista-vales").appendChild(outside);
    outside.click();
    assert.equal(window.document.getElementById("vale-detalle").classList.contains("hidden"), true);
  } finally {
    dom.window.close();
  }
});
