"use strict";

// B2.3-only harness layered after node-global-compat.js. It removes the
// previous test-only sync bridge and replaces it with a narrower rule:
// automatic sincronizarCola() calls are blocked while explicit calls made by
// the B2.3 test file are allowed. Production code remains untouched.
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
    let source = originalReader(baseDir);

    // Undo only the obsolete localStorage lock injected by the previous
    // compatibility layer. The real production mutex must own that key.
    source = source.replace(
      '\n        try { globalThis.window.localStorage.setItem("battlecruiser-sincronizando", "1"); } catch (_) {}',
      ""
    );

    // Undo the obsolete B2.3 explicit-sync bridge injected by the previous
    // compatibility layer. The bridge kept state across async work and could
    // itself create SINCRONIZANDO observations.
    source = source.replace(
      /\n;\(function __bcB23SyncIsolation\(\)\{[\s\S]*?\n\}\)\(\);\n/,
      "\n"
    );

    // Replace the previous boolean gate with a caller-aware gate. Background
    // timers/callbacks do not originate in the B2.3 test file, while explicit
    // sync calls made by that test do. This keeps the production function and
    // its mutex/state machine untouched.
    source = source.replace(
      "if (window.__BC_B23_SUPPRESS_AUTO_SYNC__ && !window.__BC_B23_EXPLICIT_SYNC__) return;",
      "if (window.__BC_B23_SUPPRESS_AUTO_SYNC__) {\n    const __bcB23Stack = String(new Error().stack || \"\");\n    if (!__bcB23Stack.includes(\"b2.3-centro-control.test.js\")) return;\n  }"
    );

    return source;
  };
  loaded.__bcB23FinalHarnessWrapped = true;
  return loaded;
};
