"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "permisos-navegacion.js"),
  "utf8"
);

function createContext(t, { reportes = true, turnos = true } = {}) {
  const tabs = ["resumen", "jornada", "ciclos", "productos", "almacenes", "ventas"];
  const nav = tabs.map((tab) =>
    '<button type="button" class="tab-btn" data-tab="' + tab + '">' + tab + "</button>"
  ).join("");
  const panels = tabs.map((tab) =>
    '<section class="tab-panel" id="tab-' + tab + '"></section>'
  ).join("");
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
    '<div id="app-shell" class="visible"><nav id="tabs">' + nav + "</nav>" +
    '<main class="main-content">' + panels + "</main></div></body></html>",
    { url: "https://battlecruiser-dashboard-default.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  window.eval(
    "var _usuarioActual = { id: 'owner-fixture', rol: 'Dueño' };" +
    "var _permisosCargaExitosa = true;" +
    "var _permisosEfectivos = {" +
      "reportes: { ver: " + (reportes ? "true" : "false") + " }," +
      "turnos: { ver: " + (turnos ? "true" : "false") + " }" +
    "};"
  );
  window.irATab = function (tab) {
    window.document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    window.document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("visible"));
    const btn = window.document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (!btn) return;
    btn.classList.add("active");
    const panel = window.document.getElementById("tab-" + tab);
    if (panel) panel.classList.add("visible");
    window.__selectedTab = tab;
  };
  window.eval(SOURCE);
  t.after(() => window.close());
  return window;
}

test("login nuevo: Centro de Control queda primero cuando el rol puede verlo", (t) => {
  const window = createContext(t, { reportes: true, turnos: true });
  assert.equal(window.__selectedTab, "resumen");
  assert.equal(window.document.querySelector('.tab-btn[data-tab="resumen"]').classList.contains("active"), true);
  assert.equal(window.document.querySelector("#tab-resumen").classList.contains("visible"), true);
  assert.equal(window.document.querySelector('.tab-btn[data-tab="jornada"]').classList.contains("active"), false);
});

test("login nuevo: mantiene Jornada como fallback cuando el rol no ve reportes", (t) => {
  const window = createContext(t, { reportes: false, turnos: true });
  assert.equal(window.__selectedTab, "jornada");
  assert.equal(window.document.querySelector('.tab-btn[data-tab="jornada"]').classList.contains("active"), true);
  assert.equal(window.document.querySelector('.tab-btn[data-tab="resumen"]').getAttribute("data-bc-permiso"), "0");
});
