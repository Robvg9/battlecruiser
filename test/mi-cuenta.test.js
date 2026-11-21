"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot(html) {
  const dom = new JSDOM(html || '<!doctype html><html><head></head><body><button id="mi-cuenta-btn" type="button" aria-expanded="false">Mi Cuenta</button><div id="pass-panel" class="hidden"><input id="pass-input"></div></body></html>', { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  Object.defineProperty(dom.window.document, "readyState", { configurable: true, value: "complete" });
  dom.window.eval(read("public/js/bc-modal-manager.js"));
  dom.window.eval(read("public/js/mi-cuenta.js"));
  return dom;
}

test("Mi Cuenta muestra identidad no sensible y utiliza el ciclo compartido de modal", () => {
  const dom = boot();
  try {
    const doc = dom.window.document;
    doc.body.style.overflow = "auto";
    doc.documentElement.style.overflow = "scroll";
    dom.window._usuarioActual = {
      id: "owner-test-id",
      nombre: "Roberto",
      rol: "Dueño",
      activo: true,
      access_token: "TEST_ACCESS_SECRET",
      refresh_token: "TEST_REFRESH_SECRET"
    };

    const button = doc.getElementById("mi-cuenta-btn");
    assert.equal(button.dataset.bcMiCuentaBound, "1");
    button.focus();
    button.click();

    const modal = doc.getElementById("bc-mi-cuenta-modal");
    assert.ok(modal && !modal.classList.contains("hidden"));
    assert.ok(modal.classList.contains("bc-modal-overlay"));
    assert.ok(modal.querySelector(".bc-account-card").classList.contains("bc-modal-dialog"));
    assert.equal(doc.getElementById("bc-account-name").textContent, "Roberto");
    assert.equal(doc.getElementById("bc-account-role").textContent, "Dueño");
    assert.equal(doc.getElementById("bc-account-status").textContent, "Activa");
    assert.doesNotMatch(modal.textContent, /TEST_ACCESS_SECRET|TEST_REFRESH_SECRET|owner-test-id/);
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(doc.body.style.overflow, "hidden");
    assert.equal(doc.documentElement.style.overflow, "hidden");
    assert.equal(doc.activeElement.id, "bc-account-close");

    const wrapForward = new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    doc.getElementById("bc-account-password").focus();
    doc.dispatchEvent(wrapForward);
    assert.equal(wrapForward.defaultPrevented, true);
    assert.equal(doc.activeElement.id, "bc-account-close");

    doc.getElementById("bc-account-password").click();
    assert.ok(!doc.getElementById("pass-panel").classList.contains("hidden"));
    assert.ok(modal.classList.contains("hidden"));
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(doc.body.style.overflow, "auto");
    assert.equal(doc.documentElement.style.overflow, "scroll");
    assert.equal(doc.activeElement.id, "pass-input");

    button.focus();
    button.click();
    const escape = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    doc.getElementById("bc-account-close").dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.ok(modal.classList.contains("hidden"));
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(doc.activeElement, button);
    assert.equal(doc.body.style.overflow, "auto");
    assert.equal(doc.documentElement.style.overflow, "scroll");

    button.click();
    modal.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    assert.ok(modal.classList.contains("hidden"), "backdrop click must close the read-only profile dialog");
  } finally {
    dom.window.close();
  }
});

test("Mi Cuenta no inventa identidad cuando falta el contexto autenticado", () => {
  const dom = boot('<!doctype html><html><head></head><body><button id="mi-cuenta-btn" type="button">Mi Cuenta</button></body></html>');
  try {
    dom.window.document.getElementById("mi-cuenta-btn").click();
    assert.equal(dom.window.document.getElementById("bc-account-name").textContent, "Perfil no disponible");
    assert.equal(dom.window.document.getElementById("bc-account-role").textContent, "No disponible");
  } finally {
    dom.window.close();
  }
});

test("Mi Cuenta loads its shared modal dependency before the profile module and keeps it offline-ready", () => {
  const app = read("public/app.js");
  const index = read("public/index.html");
  const css = read("public/style.css");
  const sw = read("public/service-worker.js");
  assert.ok(app.includes('["bc-modal-manager.js","1.0"]'), "the shared modal manager must be in the authoritative module registry");
  assert.ok(app.includes('["mi-cuenta.js","1.3"]'), "Mi Cuenta must use the updated module version");
  assert.ok(app.indexOf('["bc-modal-manager.js","1.0"]') < app.indexOf('["mi-cuenta.js","1.3"]'),
    "the manager must precede the feature that depends on it");
  assert.ok(index.includes('id="mi-cuenta-btn"'), "header must expose Mi Cuenta");
  assert.match(index, /<script src="js\/bc-modal-manager\.js\?v=1\.0"><\/script>[\s\S]*?<script src="js\/mi-cuenta\.js\?v=1\.3"><\/script>/,
    "the shared manager must execute before the directly loaded profile feature");
  assert.match(index, /<script src="js\/hotfix-configuracion-20260902\.js\?v=20261020\.4"><\/script>/,
    "critical Configuración scroll fix must load directly from the shell");
  assert.ok(css.includes(".bc-modal-overlay"), "shared overlay structure must be defined centrally");
  assert.ok(css.includes(".bc-modal-dialog"), "shared dialog scrolling primitive must be defined centrally");
  const iconLock = css.slice(css.indexOf("/* Final header lock"), css.indexOf("/* Header actions: icon-only"));
  assert.ok(iconLock.includes("#mi-cuenta-btn") && iconLock.includes("#logout-btn"));
  assert.match(iconLock, /font-size: 0 !important/);
  assert.match(iconLock, /> svg/);

  assert.ok(css.includes(".bc-account-overlay.hidden") === false, "feature CSS must no longer own the generic hidden primitive");
  assert.ok(sw.includes("./js/bc-modal-manager.js?v=1.0"), "the shared dependency must be in the offline shell");
  assert.ok(sw.includes("./js/mi-cuenta.js?v=1.3"), "the updated account module must be in the offline shell");
});

test("Los controles de cuenta y salida son solo iconos SVG, con nombre accesible", () => {
  const dom = new JSDOM(read("public/index.html"), { url: "https://battlecruiser.test/" });
  try {
    const doc = dom.window.document;
    const account = doc.getElementById("mi-cuenta-btn");
    const logout = doc.getElementById("logout-btn");
    for (const button of [account, logout]) {
      assert.ok(button, "header control must exist");
      assert.equal(button.children.length, 1, "the visible control must contain only its SVG icon");
      assert.equal(button.querySelectorAll("svg").length, 1);
      assert.equal(button.textContent.trim(), "", "no visible button label should remain");
      assert.ok(button.getAttribute("aria-label"), "screen readers must retain an accessible name");
      assert.ok(button.title, "hover tooltip must remain available");
    }
    assert.equal(account.getAttribute("aria-label"), "Mi cuenta");
    assert.equal(logout.getAttribute("aria-label"), "Cerrar sesión");
  } finally {
    dom.window.close();
  }
});


test("El arranque restaura los SVG del encabezado después de inicializar módulos legacy", () => {
  const app = read("public/app.js");
  const hotfix = read("public/js/hotfix-regresiones-20260902.js");
  const sw = read("public/service-worker.js");
  assert.ok(app.includes("function normalizarAccionesHeader()"));
  const boot = app.slice(app.indexOf("function terminarBootUI"), app.indexOf("const pendientes="));
  assert.ok(boot.includes("normalizarAccionesHeader()"),
    "la normalización final debe ejecutarse después de cargar los módulos dinámicos");
  assert.ok(app.includes('const VERSION="9.5.142"'));
  assert.ok(!hotfix.includes("btn.textContent = 'LogOut'"),
    "el hotfix legacy no debe reemplazar el SVG de Salir por texto");
  assert.ok(hotfix.includes("btn.setAttribute('aria-label','Cerrar sesión')"));
  assert.ok(app.includes('["hotfix-regresiones-20260902.js","20261120.2"]'));
  assert.ok(sw.includes("./js/hotfix-regresiones-20260902.js?v=20261120.2"),
    "el shell offline debe precargar el hotfix corregido");
});
