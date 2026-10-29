"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "offline.js"),
  "utf8"
);
const BLOCK_START = SOURCE.indexOf('safeInit("panel-pendientes", () => {');
const BLOCK_END = SOURCE.indexOf("\n});", BLOCK_START);
assert.ok(BLOCK_START >= 0 && BLOCK_END > BLOCK_START, "se debe poder aislar el manejador real de reintento");

async function waitUntil(condition, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return Boolean(condition());
}

function setup(isOnline) {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div id='panel-pendientes'>" +
        "<button id='pendientes-refrescar-btn' type='button'>Reintentar sincronización</button>" +
        "<p id='msg-pendientes'></p>" +
        "<div id='lista-pendientes'></div>" +
        "<div id='pendiente-detalle'></div>" +
      "</div></body></html>",
    { url: "https://battlecruiser-sync-step4.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: isOnline });

  const messages = [];
  let syncCalls = 0;
  let refreshCalls = 0;
  let syncImpl = async () => { syncCalls += 1; };
  window.sincronizarCola = (...args) => syncImpl(...args);
  window.refrescarPanelPendientes = async () => { refreshCalls += 1; };
  window.setMsg = (id, message, ok) => {
    const node = window.document.getElementById(id);
    node.textContent = String(message || "");
    node.dataset.ok = String(!!ok);
    messages.push({ id, message, ok: !!ok });
  };
  window.safeInit = (id, init) => {
    if (window.document.getElementById(id)) init();
  };
  window.eval(SOURCE.slice(BLOCK_START, BLOCK_END + 4));
  return {
    dom, window, messages,
    get syncCalls() { return syncCalls; },
    get refreshCalls() { return refreshCalls; },
    set syncImpl(value) { syncImpl = value; }
  };
}

test("Paso 4 RWHT 071: reintento manual online drena la cola, refresca el panel y restaura el botón", async () => {
  const h = setup(true);
  try {
    const btn = h.window.document.getElementById("pendientes-refrescar-btn");
    const original = btn.textContent;
    let resolveSync;
    h.syncImpl = () => {
      // Count the call before holding it open to inspect the in-flight UI state.
      return new Promise((resolve) => { resolveSync = resolve; });
    };
    btn.click();
    assert.equal(await waitUntil(() => h.syncCalls === 1), true,
      "el click debe ejecutar el manejador de reintento online");
    assert.equal(h.syncCalls, 1);
    assert.equal(btn.disabled, true);
    assert.equal(btn.textContent, "Sincronizando…");
    assert.equal(h.refreshCalls, 0);
    resolveSync();
    assert.equal(await waitUntil(() => h.refreshCalls === 1), true,
      "el reintento completado debe refrescar la lista");
    assert.equal(h.refreshCalls, 1);
    assert.equal(btn.disabled, false);
    assert.equal(btn.textContent, original);
    assert.match(h.window.document.getElementById("msg-pendientes").textContent, /Sincronización completada/i);
    assert.equal(h.window.document.getElementById("msg-pendientes").dataset.ok, "true");
  } finally {
    h.dom.window.close();
  }
});

test("Paso 4 RWHT 071: desconectado informa el estado y no intenta sincronizar", async () => {
  const h = setup(false);
  try {
    const btn = h.window.document.getElementById("pendientes-refrescar-btn");
    btn.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(h.syncCalls, 0);
    assert.equal(h.refreshCalls, 0);
    assert.equal(btn.disabled, false);
    assert.match(h.window.document.getElementById("msg-pendientes").textContent, /Sin conexión/i);
    assert.equal(h.window.document.getElementById("msg-pendientes").dataset.ok, "false");
  } finally {
    h.dom.window.close();
  }
});

test("Paso 4 RWHT 071: error de sincronización muestra fallo y restaura el botón", async () => {
  const h = setup(true);
  try {
    const btn = h.window.document.getElementById("pendientes-refrescar-btn");
    h.syncImpl = async () => { throw new Error("fixture network failure"); };
    btn.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(btn.disabled, false);
    assert.equal(btn.textContent, "Reintentar sincronización");
    assert.match(h.window.document.getElementById("msg-pendientes").textContent, /No se pudo completar/i);
    assert.equal(h.window.document.getElementById("msg-pendientes").dataset.ok, "false");
    assert.equal(h.refreshCalls, 0);
  } finally {
    h.dom.window.close();
  }
});
