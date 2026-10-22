"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(ROOT, "public/js/configuracion-ajustes-migrados-20260903.js"),
  "utf8"
);
const escapedQuote = String.fromCharCode(92) + '"';
const loader = fs.readFileSync(path.join(ROOT, "public/js/configuracion.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(ROOT, "public/service-worker.js"), "utf8");
const appSource = fs.readFileSync(path.join(ROOT, "public/app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

test("preference inputs use native checkbox state with accessible names and descriptions", () => {
  assert.ok(source.includes("input type=" + escapedQuote + "checkbox" + escapedQuote + " id=" + escapedQuote));
  assert.ok(source.includes("aria-label=" + escapedQuote));
  assert.ok(source.includes("aria-describedby=" + escapedQuote));
  assert.ok(!source.includes("role=" + escapedQuote + "switch" + escapedQuote));
  assert.ok(!source.includes("aria-checked=" + escapedQuote + "false" + escapedQuote));
});

test("native checked property stays synchronized with saved local preference values", () => {
  assert.ok(source.includes("input.checked = !!prefs[mapping[id]]"));
  assert.ok(source.includes("prefs[key] = input.checked"));
  assert.ok(!source.includes('setAttribute("aria-checked"'));
});

test("accessible textual option state follows the native checked property on load and change", () => {
  assert.ok(source.includes('"-help " + id + "-state'));
  assert.ok(source.includes("Estado de la opción: desactivada.</span>"));
  assert.ok(source.includes('function updateToggleState(id, input)'));
  assert.ok(source.includes('state.textContent = "Estado de la opción: " + (input.checked ? "activada." : "desactivada.");'));
  assert.equal(source.split("updateToggleState(id, input);").length - 1, 2);
  assert.ok(source.includes(".cfg-aj-sr-only{position:absolute"));
});

test("toggle appearance retains a real accessible hit target and keyboard focus", () => {
  assert.ok(source.includes(".cfg-aj-toggle input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:2}"));
  assert.ok(source.includes(".cfg-aj-toggle span{position:absolute;inset:0;background:rgba(255,255,255,.12);border-radius:999px;cursor:pointer;pointer-events:none}"));
  assert.ok(source.includes(".cfg-aj-toggle input:focus-visible+span{outline:2px solid var(--gold-bright);outline-offset:3px}"));
});

test("all six preference inputs remain connected to their existing preference keys", () => {
  for (const entry of [
    ['cfg-aj-auto-refresh', 'autoRefresh', 'Actualización automática'],
    ['cfg-aj-sync-auto', 'syncAuto', 'Sincronización automática'],
    ['cfg-aj-sync-open', 'syncOnOpen', 'Sincronizar al abrir app'],
    ['cfg-aj-sync-wifi', 'syncWifiOnly', 'Sincronizar solo en Wi‑Fi'],
    ['cfg-aj-notify', 'notifications', 'Notificaciones'],
    ['cfg-aj-compact', 'compacto', 'Modo compacto']
  ]) {
    const [id, key, label] = entry;
    assert.ok(source.includes('rowToggle("' + id + '", "' + label + '"'), 'missing switch: ' + id);
    assert.ok(source.includes('"' + id + '": "' + key + '"'), 'missing preference mapping: ' + id);
  }
});

test("PWA deployment invalidates the cached switch script and keeps shell versions aligned", () => {
  const resource = "configuracion-ajustes-migrados-20260903.js";
  assert.ok(loader.includes(resource + "?v=4"));
  assert.ok(serviceWorker.includes("./js/" + resource + "?v=4"));
  assert.ok(!loader.includes(resource + "?v=3"));
  assert.ok(!serviceWorker.includes(resource + "?v=3"));
  const appVersion = appSource.match(/const VERSION="([^"]+)"/);
  const workerVersion = serviceWorker.match(/var BC_SW_VERSION = "([^"]+)"/);
  assert.ok(appVersion, "app version must be detectable");
  assert.ok(workerVersion, "service-worker version must be detectable");
  assert.equal(appVersion[1], "9.5.10");
  assert.equal(workerVersion[1], appVersion[1]);
  assert.ok(indexHtml.includes("style.css?v=" + appVersion[1]));
  assert.ok(indexHtml.includes("app.js?v=" + appVersion[1]));
  assert.ok(indexHtml.includes("v" + appVersion[1] + " — BattleCruiser"));
});
