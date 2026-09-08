"use strict";

// B2.3-only: block background/auto sincronizarCola while allowing explicit
// calls from the test file. Production code is never modified on disk.
const IS_B23 = process.argv.some((arg) => String(arg).includes("b2.3-centro-control.test.js"));
if (!IS_B23) return;

const Module = require("node:module");
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (!request.endsWith("_leer-app-js")) return loaded;
  if (!loaded || typeof loaded.leerAppJsConcatenado !== "function") return loaded;
  if (loaded.__bcB23FinalHarnessWrapped) return loaded;

  const originalReader = loaded.leerAppJsConcatenado;
  loaded.leerAppJsConcatenado = function (baseDir) {
    // Ensure suppress is set before any app module evaluates.
    if (globalThis.window) {
      globalThis.window.__BC_B23_SUPPRESS_AUTO_SYNC__ = true;
      globalThis.window.__BC_B23_EXPLICIT_SYNC__ = false;
      // Do NOT hold the production localStorage mutex here — that belongs to
      // the real sincronizarCola implementation only.
      try { globalThis.window.localStorage.removeItem("battlecruiser-sincronizando"); } catch (_) {}
    }

    let source = originalReader(baseDir);

    // Keep a single early-return gate. Explicit test calls open the gate via
    // the window.sincronizarCola wrapper below (not via stack inspection).
    if (!source.includes("__BC_B23_SUPPRESS_AUTO_SYNC__")) {
      source = source.replace(
        "async function sincronizarCola() {",
        "async function sincronizarCola() {\n  if (window.__BC_B23_SUPPRESS_AUTO_SYNC__ && !window.__BC_B23_EXPLICIT_SYNC__) return;"
      );
    }

    // Strip any previous isolation IIFE so we install exactly one wrapper.
    source = source.replace(
      /\n;\(function __bcB23SyncIsolation\(\)\{[\s\S]*?\n\}\)\(\);\n/g,
      "\n"
    );

    // Single clean wrapper: open the explicit gate only for the synchronous
    // entry into production sincronizarCola. Background timers never set the
    // flag, so they remain blocked. Production mutex and state machine stay intact.
    source += `
;(function __bcB23SyncIsolation(){
  if (!window.__BC_B23_SUPPRESS_AUTO_SYNC__) return;
  try {
    if (typeof window.sincronizarCola === "function" && !window.__bcB23ExplicitSyncWrapped) {
      const syncOriginal = window.sincronizarCola;
      window.sincronizarCola = function () {
        window.__BC_B23_EXPLICIT_SYNC__ = true;
        try {
          return syncOriginal.apply(this, arguments);
        } finally {
          window.__BC_B23_EXPLICIT_SYNC__ = false;
        }
      };
      window.__bcB23ExplicitSyncWrapped = true;
    }
  } catch (_) {}
})();
`;

    return source;
  };
  loaded.__bcB23FinalHarnessWrapped = true;
  return loaded;
};
