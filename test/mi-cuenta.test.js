"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("Mi Cuenta muestra nombre, rol y estado del contexto sin revelar secretos", () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><button id="mi-cuenta-btn" type="button" aria-expanded="false">Mi Cuenta</button><button id="change-pass-btn" type="button">Cambiar contraseña</button><div id="pass-panel" class="hidden"></div></body></html>', { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  try {
    const doc = dom.window.document;
    Object.defineProperty(doc, "readyState", { configurable: true, value: "complete" });
    dom.window._usuarioActual = {
      id: "owner-test-id",
      nombre: "Roberto",
      rol: "Dueño",
      activo: true,
      access_token: "TEST_ACCESS_SECRET",
      refresh_token: "TEST_REFRESH_SECRET"
    };
    let passwordActionCount = 0;
    doc.getElementById("change-pass-btn").addEventListener("click", () => passwordActionCount++);

    dom.window.eval(read("public/js/mi-cuenta.js"));
    const button = doc.getElementById("mi-cuenta-btn");
    assert.equal(button.dataset.bcMiCuentaBound, "1");

    button.click();
    const modal = doc.getElementById("bc-mi-cuenta-modal");
    assert.ok(modal && !modal.classList.contains("hidden"));
    assert.equal(doc.getElementById("bc-account-name").textContent, "Roberto");
    assert.equal(doc.getElementById("bc-account-role").textContent, "Dueño");
    assert.equal(doc.getElementById("bc-account-status").textContent, "Activa");
    assert.doesNotMatch(modal.textContent, /TEST_ACCESS_SECRET|TEST_REFRESH_SECRET|owner-test-id/);
    assert.equal(button.getAttribute("aria-expanded"), "true");

    doc.getElementById("bc-account-password").click();
    assert.equal(passwordActionCount, 1);
    assert.ok(modal.classList.contains("hidden"));
    assert.equal(button.getAttribute("aria-expanded"), "false");

    button.click();
    assert.ok(!modal.classList.contains("hidden"));
    doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.ok(modal.classList.contains("hidden"));
  } finally {
    dom.window.close();
  }
});

test("Mi Cuenta no inventa identidad cuando falta el contexto autenticado", () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><button id="mi-cuenta-btn" type="button">Mi Cuenta</button></body></html>', { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  try {
    Object.defineProperty(dom.window.document, "readyState", { configurable: true, value: "complete" });
    dom.window.eval(read("public/js/mi-cuenta.js"));
    dom.window.document.getElementById("mi-cuenta-btn").click();
    assert.equal(dom.window.document.getElementById("bc-account-name").textContent, "Perfil no disponible");
    assert.equal(dom.window.document.getElementById("bc-account-role").textContent, "No disponible");
  } finally {
    dom.window.close();
  }
});

test("Mi Cuenta is wired into the PWA header and mobile layout", () => {
  const app = read("public/app.js");
  const index = read("public/index.html");
  const css = read("public/style.css");
  assert.ok(app.includes('["mi-cuenta.js","1.0"]'), "Mi Cuenta module must be loaded by the PWA");
  assert.ok(index.includes('id="mi-cuenta-btn"'), "header must expose Mi Cuenta");
  assert.ok(css.includes('"account settings"'), "mobile header must allocate space to Mi Cuenta");
  assert.ok(css.includes(".bc-account-overlay.hidden { display: none !important; }"), "hidden account modal must stay hidden");
});
