"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const AUTH = fs.readFileSync(path.join(__dirname, "..", "public", "js", "auth.js"), "utf8");
const START = AUTH.indexOf("async function actualizarApp(btn) {");
const END = AUTH.indexOf('\nsafeInit("actualizar-app-login"', START);

assert.ok(START >= 0 && END > START, "auth.js debe contener el único helper de actualización de app");
const UPDATE_SOURCE = AUTH.slice(START, END).trim();

function createHarness() {
  const removed = [];
  const unregistered = [];
  let navigatedTo = null;
  const registrations = [
    { unregister: async () => { unregistered.push("shell"); return true; } },
    { unregister: async () => { unregistered.push("other"); return true; } }
  ];
  const caches = {
    keys: async () => [
      "battlecruiser-shell-9.5.33",
      "battlecruiser-static-9.5.33",
      "battlecruiser",
      "unrelated-cache"
    ],
    delete: async (name) => { removed.push(name); return true; }
  };
  const win = { __BC_VERSION__: "9.5.35", caches };
  const nav = {
    serviceWorker: {
      getRegistrations: async () => registrations
    }
  };
  const location = {
    href: "https://battlecruiser.robvg9.workers.dev/login?campaign=step4",
    replace: (url) => { navigatedTo = url; }
  };
  const createFunction = new Function(
    "window",
    "navigator",
    "caches",
    "location",
    "URL",
    "return (" + UPDATE_SOURCE + ");"
  );
  const update = createFunction(win, nav, caches, location, URL);
  const button = { disabled: false, textContent: "Actualizar app / borrar caché" };
  return { update, button, removed, unregistered, get navigatedTo() { return navigatedTo; } };
}

test("Paso 4 RWHT 006: Actualizar app desregistra Service Workers y borra solo las cachés BattleCruiser", async () => {
  const h = createHarness();
  await h.update(h.button);
  assert.deepEqual(h.unregistered, ["shell", "other"]);
  assert.deepEqual(
    h.removed.sort(),
    ["battlecruiser-shell-9.5.33", "battlecruiser-static-9.5.33", "battlecruiser"].sort()
  );
  assert.equal(h.removed.includes("unrelated-cache"), false, "no debe borrar cachés ajenas");
  assert.equal(h.button.disabled, true);
  assert.equal(h.button.textContent, "Actualizando...");
  assert.ok(h.navigatedTo, "debe forzar navegación para descargar el shell nuevo");
  const target = new URL(h.navigatedTo);
  assert.equal(target.origin, "https://battlecruiser.robvg9.workers.dev");
  assert.equal(target.pathname, "/login");
  assert.equal(target.searchParams.get("campaign"), "step4", "conserva parámetros no relacionados");
  assert.match(target.searchParams.get("bc_update") || "", /^9\.5\.34-\d+$/,
    "la navegación debe invalidar la caché con la versión canónica");
});

test("Paso 4 RWHT 006: el botón de login está vinculado al helper único de actualización", () => {
  assert.match(
    AUTH,
    /safeInit\("actualizar-app-login",\s*\(\)\s*=>\s*\{\s*const btn = document\.getElementById\("update-app-btn-login"\);\s*if \(btn\) btn\.addEventListener\("click", \(\) => actualizarApp\(btn\)\);/
  );
});
