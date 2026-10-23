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

test("preference switch buttons expose accessible names and descriptions", () => {
  assert.ok(source.includes("input type=" + escapedQuote + "checkbox" + escapedQuote + " class=" + escapedQuote + "cfg-aj-toggle" + escapedQuote + " role=" + escapedQuote + "switch" + escapedQuote + " id=" + escapedQuote));
  assert.ok(source.includes("aria-label=" + escapedQuote));
  assert.ok(source.includes("aria-describedby=" + escapedQuote));
  assert.ok(source.includes("role=" + escapedQuote + "switch" + escapedQuote));
  assert.ok(source.includes("aria-checked=" + escapedQuote + "false" + escapedQuote));
});

test("aria-checked switch state stays synchronized with saved local preference values", () => {
  assert.ok(source.includes("control.checked = enabled;"));
  assert.ok(source.includes('control.setAttribute("aria-checked", enabled ? "true" : "false");'));
  assert.ok(source.includes('var checked = input.getAttribute("aria-checked") !== "true";'));
  assert.ok(source.includes("prefs[key] = checked;"));
});

test("accessible textual option state follows the saved switch state on load and change", () => {
  assert.ok(source.includes('"-help " + id + "-state'));
  assert.ok(source.includes("Estado de la opción: desactivada.</span>"));
  assert.ok(source.includes('function updateToggleState(id, control, checked)'));
  assert.ok(source.includes('state.textContent = "Estado de la opción: " + (enabled ? "activada." : "desactivada.");'));
  assert.equal(source.split("updateToggleState(id, input,").length - 1, 2);
  assert.ok(source.includes(".cfg-aj-sr-only{position:absolute"));
});

test("toggle appearance retains a real accessible hit target and keyboard focus", () => {
  assert.ok(source.includes(".cfg-aj-toggle:focus-visible{outline:2px solid var(--gold-bright);outline-offset:3px}"));
  assert.ok(source.includes('.cfg-aj-toggle:checked:before{transform:translateX(20px)}'));
  assert.ok(source.includes('.cfg-aj-toggle:checked{background:rgba(201,162,77,.55)}'));
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


test("switch semantics and aria-checked follow the saved state and user changes", async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><section id="tab-preferencias"></section></body></html>',
    { url: "https://battlecruiser.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  try {
    window.eval(source);
    await new Promise(resolve => window.setTimeout(resolve, 600));

    const enabledByDefault = window.document.getElementById("cfg-aj-sync-auto");
    const disabledByDefault = window.document.getElementById("cfg-aj-sync-wifi");
    assert.ok(enabledByDefault && disabledByDefault);
    assert.equal(enabledByDefault.getAttribute("role"), "switch");
    assert.equal(enabledByDefault.checked, true);
    assert.equal(disabledByDefault.checked, false);
    assert.equal(enabledByDefault.getAttribute("aria-checked"), "true");
    assert.equal(disabledByDefault.getAttribute("aria-checked"), "false");

    disabledByDefault.click();

    assert.equal(disabledByDefault.checked, true);
    assert.equal(disabledByDefault.getAttribute("aria-checked"), "true");
    assert.match(
      window.document.getElementById("cfg-aj-sync-wifi-state").textContent,
      /activada/
    );
    assert.equal(
      JSON.parse(window.localStorage.getItem("bc-ui-preferences-v2")).syncWifiOnly,
      true
    );
  } finally {
    window.close();
  }
});

test("theme buttons and Restore Preferences persist then reset isolated preference state", async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><section id="tab-preferencias"></section></body></html>',
    { url: "https://battlecruiser.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  try {
    window.eval(source);
    await new Promise(resolve => window.setTimeout(resolve, 600));

    const light = window.document.querySelector('.cfg-aj-app[data-app="light"]');
    const dark = window.document.querySelector('.cfg-aj-app[data-app="dark"]');
    assert.ok(light && dark, "both appearance controls must exist");

    light.click();
    assert.ok(window.document.body.classList.contains("bc-theme-light"), "Modo claro applies the light theme");
    assert.equal(JSON.parse(window.localStorage.getItem("bc-ui-preferences-v2")).appearance, "light");
    assert.ok(light.classList.contains("active"), "Modo claro is visibly selected");

    dark.click();
    assert.ok(window.document.body.classList.contains("bc-theme-dark"), "Modo oscuro applies the dark theme");
    assert.equal(JSON.parse(window.localStorage.getItem("bc-ui-preferences-v2")).appearance, "dark");
    assert.ok(dark.classList.contains("active"), "Modo oscuro is visibly selected");

    const wifi = window.document.getElementById("cfg-aj-sync-wifi");
    const compact = window.document.getElementById("cfg-aj-compact");
    wifi.click();
    compact.click();
    const changed = JSON.parse(window.localStorage.getItem("bc-ui-preferences-v2"));
    assert.equal(changed.syncWifiOnly, true, "isolated test preference can be changed");
    assert.equal(changed.compacto, true, "isolated compact preference can be changed");

    window.confirm = () => true;
    window.document.getElementById("cfg-aj-reset").click();
    const restored = JSON.parse(window.localStorage.getItem("bc-ui-preferences-v2"));
    assert.deepEqual(restored, {
      compacto: false,
      autoRefresh: true,
      syncAuto: true,
      syncOnOpen: true,
      syncWifiOnly: false,
      notifications: true,
      appearance: "dark",
    }, "Restore Preferences resets the complete isolated preference set to defaults");
    assert.ok(window.document.body.classList.contains("bc-theme-dark"), "restoring defaults applies dark appearance");
    assert.equal(wifi.getAttribute("aria-checked"), "false", "reset synchronizes switch state");
    assert.equal(compact.getAttribute("aria-checked"), "false", "reset synchronizes compact state");
    assert.match(window.document.getElementById("cfg-pref-status").textContent, /Preferencias restauradas/);
  } finally {
    window.close();
  }
});

test("PWA deployment invalidates the cached switch script and keeps shell versions aligned", () => {
  const resource = "configuracion-ajustes-migrados-20260903.js";
  assert.ok(loader.includes(resource + "?v=7"));
  assert.ok(serviceWorker.includes("./js/" + resource + "?v=7"));
  assert.ok(!loader.includes(resource + "?v=6"));
  assert.ok(!serviceWorker.includes(resource + "?v=6"));
  const appVersion = appSource.match(/const VERSION="([^"]+)"/);
  const workerVersion = serviceWorker.match(/var BC_SW_VERSION = "([^"]+)"/);
  assert.ok(appVersion, "app version must be detectable");
  assert.ok(workerVersion, "service-worker version must be detectable");
  assert.equal(appVersion[1], "9.5.14");
  assert.equal(workerVersion[1], appVersion[1]);
  assert.ok(indexHtml.includes("style.css?v=" + appVersion[1]));
  assert.ok(indexHtml.includes("app.js?v=" + appVersion[1]));
  assert.ok(indexHtml.includes("v" + appVersion[1] + " — BattleCruiser"));
});
