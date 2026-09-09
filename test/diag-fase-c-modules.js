"use strict";
/**
 * Inyecta el bundle módulo a módulo para identificar dónde se bloquea appendChild.
 * Uso: node -r ./test/node-global-compat.js test/diag-fase-c-modules.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");

const MODULOS = [
  "core.js", "auth.js", "offline.js", "centro-control.js", "navegacion.js",
  "productos.js", "presentaciones.js", "almacenes.js", "transferencias.js",
  "vales.js", "ventas.js", "catalogos.js", "configuracion.js",
  "usuarios-permisos.js", "mando.js", "reportes.js", "nucleo-operativo.js",
  "operacion-humana.js", "comunicacion.js",
];

function log(msg) {
  process.stderr.write("[FaseC MOD] " + msg + "\n");
}

async function main() {
  let html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  html = html.replace(/<script[^>]*src="https:\/\/cdn[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="app\.js"[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="js\/[^"]*\.js"[^>]*><\/script>/g, "");

  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.test/" });
  const window = dom.window;
  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.crypto = window.crypto || global.crypto;
  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window, "caches", { value: { keys: async () => [], delete: async () => true }, configurable: true });
  Object.defineProperty(window, "serviceWorker", { value: { getRegistrations: async () => [], register: async () => ({ unregister: async () => true }) }, configurable: true });

  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u-test", email: "t@t.test" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: {} }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    rpc: async () => ({ data: null, error: { message: "Could not find the function" } }),
    from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
  };
  window.supabase = { createClient: () => client };

  const prelude = `
;(function(){
  window.__BC_VERSION__ = "diag";
  window.__BC_UI_READY_RESOLVED__ = true;
  window.__BC_UI_READY__ = Promise.resolve();
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = function(cb){ return window.setTimeout(function(){ cb(Date.now()); }, 16); };
  }
})();
`;
  const s0 = window.document.createElement("script");
  s0.textContent = prelude;
  window.document.body.appendChild(s0);
  log("prelude OK");

  const jsDir = path.join(__dirname, "..", "public", "js");
  for (const nombre of MODULOS) {
    const full = path.join(jsDir, nombre);
    if (!fs.existsSync(full)) {
      log("SKIP missing " + nombre);
      continue;
    }
    const contenido = fs.readFileSync(full, "utf8");
    log("ENTER " + nombre + " chars=" + contenido.length);
    const t0 = Date.now();
    const s = window.document.createElement("script");
    s.textContent = contenido;
    try {
      window.document.body.appendChild(s);
      log("EXIT  " + nombre + " ms=" + (Date.now() - t0));
    } catch (e) {
      log("THROW " + nombre + " " + (e && e.message));
      process.exitCode = 1;
      return;
    }
  }
  log("ALL MODULES DONE");
  process.exitCode = 0;
}

main().catch((e) => {
  log("FATAL " + e);
  process.exitCode = 1;
});
