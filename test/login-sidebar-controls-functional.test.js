"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const JS_DIR = path.join(__dirname, "..", "public", "js");
const AUTH_SOURCE = fs.readFileSync(path.join(JS_DIR, "auth.js"), "utf8");
const NAV_SOURCE = fs.readFileSync(path.join(JS_DIR, "navegacion.js"), "utf8");

function waitFor(predicate, timeout = 800) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve) => {
    function check() {
      if (predicate()) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(check, 10);
    }
    check();
  });
}

test("Paso 4 acceso: mostrar/ocultar contraseña actualiza tipo, nombre accesible y estado visual", (t) => {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
    "<input id='pass-demo' type='password'>" +
    "<button type='button' class='pass-toggle' data-target='pass-demo' aria-label='Mostrar contraseña'>👁</button>" +
    "</body></html>",
    { url: "https://battlecruiser-auth-toggle.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  t.after(() => window.close());

  window.safeInit = (name, fn) => { if (name === "ojito-contraseña") fn(); };
  const start = AUTH_SOURCE.indexOf("const OJO_ABIERTO_SVG");
  const end = AUTH_SOURCE.indexOf('safeInit("menu-ajustes", () => {', start);
  assert.ok(start >= 0 && end > start, "el módulo auth debe conservar el bloque ojito-contraseña");
  window.eval(AUTH_SOURCE.slice(start, end));

  const input = window.document.getElementById("pass-demo");
  const button = window.document.querySelector(".pass-toggle");

  button.click();
  assert.equal(input.type, "text", "primer clic revela la contraseña solo en el campo seleccionado");
  assert.equal(button.getAttribute("aria-label"), "Ocultar contraseña");
  assert.equal(button.classList.contains("activo"), true);

  button.click();
  assert.equal(input.type, "password", "segundo clic oculta de nuevo la contraseña");
  assert.equal(button.getAttribute("aria-label"), "Mostrar contraseña");
  assert.equal(button.classList.contains("activo"), false);
});

test("Paso 4 navegación: abrir menú actualiza sidebar, backdrop y aria-expanded", (t) => {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
    "<button id='sidebar-toggle-btn' aria-expanded='false'>Menú</button>" +
    "<button id='sidebar-close-btn'>Cerrar</button>" +
    "<div id='sidebar-backdrop'></div>" +
    "<aside id='sidebar'><button class='tab-btn' data-tab='productos'>Productos</button></aside>" +
    "</body></html>",
    { url: "https://battlecruiser-sidebar.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  t.after(() => window.close());

  window.safeInit = (name, fn) => { if (name === "menu-lateral") fn(); };
  window.eval(NAV_SOURCE);

  const sidebar = window.document.getElementById("sidebar");
  const backdrop = window.document.getElementById("sidebar-backdrop");
  const toggle = window.document.getElementById("sidebar-toggle-btn");

  toggle.click();
  assert.equal(sidebar.classList.contains("open"), true);
  assert.equal(backdrop.classList.contains("visible"), true);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(typeof window._battlecruiserCerrarMenuLateral, "function",
    "el módulo debe exponer el cierre usado por otros componentes");

  window.document.getElementById("sidebar-close-btn").click();
  assert.equal(sidebar.classList.contains("open"), false);
  assert.equal(backdrop.classList.contains("visible"), false);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  toggle.click();
  window.document.getElementById("sidebar-backdrop").click();
  assert.equal(sidebar.classList.contains("open"), false,
    "el backdrop debe cerrar el menú");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  toggle.click();
  sidebar.querySelector(".tab-btn").click();
  assert.equal(sidebar.classList.contains("open"), false,
    "elegir una pestaña debe cerrar el menú lateral");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});
