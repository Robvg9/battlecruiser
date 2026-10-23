"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const PREFS_KEY = "bc-ui-preferences-v2";
const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "configuracion-ajustes-migrados-20260903.js"),
  "utf8"
);
const CONTROLS = [
  { id: "cfg-aj-auto-refresh", key: "autoRefresh", label: "Actualización automática", defaultValue: true },
  { id: "cfg-aj-sync-auto", key: "syncAuto", label: "Sincronización automática", defaultValue: true },
  { id: "cfg-aj-sync-open", key: "syncOnOpen", label: "Sincronizar al abrir app", defaultValue: true },
  { id: "cfg-aj-sync-wifi", key: "syncWifiOnly", label: "Sincronizar solo en Wi‑Fi", defaultValue: false },
  { id: "cfg-aj-notify", key: "notifications", label: "Notificaciones", defaultValue: true },
  { id: "cfg-aj-compact", key: "compacto", label: "Modo compacto", defaultValue: false },
];

function boot(savedPreferences) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body><div id=\"tab-preferencias\"></div></body></html>",
    { url: "https://battlecruiser.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  if (savedPreferences) {
    dom.window.localStorage.setItem(PREFS_KEY, JSON.stringify(savedPreferences));
  }
  dom.window.eval(SOURCE);
  // Trigger the same DOM-ready hook deterministically in jsdom.
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  assert.ok(dom.window.document.getElementById("cfg-preferencias-personales"), "el panel de preferencias debe montarse");
  return dom;
}

test("Paso 4: los seis interruptores son accesibles y persisten su estado", () => {
  const dom = boot();
  const document = dom.window.document;
  const persisted = {};

  for (const item of CONTROLS) {
    const input = document.getElementById(item.id);
    assert.ok(input, item.id + " debe existir");
    assert.equal(input.type, "checkbox", item.id + " debe ser un control checkbox");
    assert.equal(input.getAttribute("role"), "switch", item.id + " debe exponer rol switch");
    assert.equal(input.getAttribute("aria-label"), item.label, item.id + " debe tener nombre accesible");
    assert.ok(input.getAttribute("aria-describedby").includes(item.id + "-state"), item.id + " debe describir su estado");
    assert.equal(input.checked, item.defaultValue, item.id + " debe respetar el valor inicial");

    input.checked = !item.defaultValue;
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const afterChange = JSON.parse(dom.window.localStorage.getItem(PREFS_KEY));
    assert.equal(afterChange[item.key], !item.defaultValue, item.id + " debe guardar el nuevo valor");
    assert.match(document.getElementById(item.id + "-state").textContent, new RegExp(!item.defaultValue ? "desactivada" : "activada"));
    persisted[item.key] = afterChange[item.key];
  }

  const reloadPrefs = JSON.parse(dom.window.localStorage.getItem(PREFS_KEY));
  dom.window.close();

  const reloaded = boot(reloadPrefs);
  for (const item of CONTROLS) {
    assert.equal(
      reloaded.window.document.getElementById(item.id).checked,
      persisted[item.key],
      item.id + " debe conservar el estado después de reconstruir la página"
    );
  }
  reloaded.window.close();
});

test("Paso 4: restaurar preferencias devuelve los seis interruptores a sus valores predeterminados", () => {
  const changed = Object.fromEntries(CONTROLS.map((item) => [item.key, !item.defaultValue]));
  const dom = boot(changed);
  dom.window.confirm = () => true;
  dom.window.document.getElementById("cfg-aj-reset").click();

  const stored = JSON.parse(dom.window.localStorage.getItem(PREFS_KEY));
  for (const item of CONTROLS) {
    assert.equal(stored[item.key], item.defaultValue, item.key + " debe restaurarse en localStorage");
    assert.equal(
      dom.window.document.getElementById(item.id).checked,
      item.defaultValue,
      item.id + " debe reflejar el valor predeterminado restaurado"
    );
  }
  assert.match(dom.window.document.getElementById("cfg-pref-status").textContent, /restauradas/i);
  dom.window.close();
});
