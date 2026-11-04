"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function createHarness(canAudit = true) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' +
    '<section id="tab-conectividad" class="tab-panel"></section>' +
    '<footer><span class="app-footer-version">v9.5.61 — BattleCruiser</span></footer>' +
    '</body></html>', { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const win = dom.window;
  const actions = [];
  const messages = [];
  Object.defineProperty(win.document, "readyState", { configurable: true, value: "complete" });
  win.safeInit = (name, callback) => { if (name === "config-mantenimiento") callback(); };
  win.estaRealmenteDesconectado = () => false;
  win._operacionesPendientesCache = [1, 2];
  win._usuarioActual = { nombre: "Roberto Carlos Verdecia Gonzalez", rol: "Dueño" };
  win.contextoB3Disponible = () => true;
  win.escHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  win.tienePermiso = () => canAudit;
  win.irATab = (tab) => actions.push(tab);
  win.actualizarApp = () => actions.push("actualizar-app");
  win.sondearBackend = async () => { actions.push("sondear"); return true; };
  win.setMsg = (id, message, ok) => messages.push({ id, message, ok });
  win.__BC_BACKEND_PROBE__ = {
    status: "online",
    reason: "response_ok",
    service: "auth",
    httpStatus: 200,
    durationMs: 113,
    checkedAt: "2026-11-04T08:03:41-04:00"
  };
  win.eval(read("public/js/configuracion.js"));
  return { dom, win, actions, messages };
}

test("Conectividad renderiza seis métricas compactas y conserva las cuatro acciones", async () => {
  const h = createHarness(true);
  try {
    const { document } = h.win;
    assert.equal(document.querySelectorAll("#cfg-diag-grid .cfg-metric").length, 6);
    assert.equal(document.querySelectorAll("#cfg-mantenimiento .cfg-actions button").length, 4);
    for (const id of ["cfg-ir-pendientes", "cfg-ir-mando", "cfg-actualizar-app", "cfg-refrescar-diag"]) {
      assert.equal(document.querySelectorAll("#" + id).length, 1, "acción única: " + id);
    }
    assert.equal(document.getElementById("cfg-detalles-tecnicos").open, false, "el detalle secundario no ocupa espacio hasta solicitarlo");
    assert.match(document.getElementById("cfg-probe-summary").textContent, /HTTP 200/);
    assert.match(document.getElementById("cfg-probe-summary").textContent, /113 ms/);
    assert.match(document.getElementById("cfg-backend-probe-note").textContent, /no incluye credenciales ni tokens/);
    assert.match(document.getElementById("cfg-backup-nota").textContent, /no implementado en el cliente/);

    document.getElementById("cfg-ir-pendientes").click();
    document.getElementById("cfg-ir-mando").click();
    document.getElementById("cfg-actualizar-app").click();
    assert.deepEqual(h.actions.slice(0, 3), ["pendientes", "mando", "actualizar-app"]);

    document.getElementById("cfg-refrescar-diag").click();
    await new Promise((resolve) => h.win.setTimeout(resolve, 0));
    assert.equal(h.actions.filter((action) => action === "sondear").length, 1);
    assert.ok(h.messages.some((message) => message.id === "msg-config-diag" && message.ok === true));

    h.win.renderDiagnosticoConfig();
    assert.equal(document.querySelectorAll("#cfg-diag-grid .cfg-metric").length, 6, "el refresco no duplica tarjetas");
    assert.equal(document.querySelectorAll("#cfg-mantenimiento .cfg-actions button").length, 4, "el refresco no duplica acciones");
  } finally {
    h.dom.window.close();
  }
});

test("Auditoría sigue respetando el permiso; no aparece como acción disponible sin acceso", () => {
  const h = createHarness(false);
  try {
    const button = h.win.document.getElementById("cfg-ir-mando");
    assert.equal(button.classList.contains("hidden"), true);
    button.click();
    assert.equal(h.actions.includes("mando"), false);
    assert.ok(h.messages.some((message) => /No tenés permiso de auditoría/.test(message.message)));
  } finally {
    h.dom.window.close();
  }
});

test("el CSS organiza el panel en dos columnas móviles y agrupa acciones sin scroll interno", () => {
  const css = read("public/style.css");
  const config = read("public/js/configuracion.js");
  assert.match(css, /#tab-conectividad #cfg-diag-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /#tab-conectividad #cfg-mantenimiento \.cfg-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(min-width:\s*700px\)[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(config, /<details id="cfg-detalles-tecnicos" class="cfg-details">/);
  assert.match(config, /cfg-probe-summary/);
  assert.match(config, /Vigilancia: consulta Auth y Data API/);
});
