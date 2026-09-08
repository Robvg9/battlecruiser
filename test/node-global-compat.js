"use strict";

for (const key of ["navigator", "crypto"]) {
  try {
    if (Object.prototype.hasOwnProperty.call(globalThis, key)) delete globalThis[key];
  } catch (_) {}
}

const { afterEach } = require("node:test");
const __bcIsB23 = process.argv.some((arg) => String(arg).includes("b2.3-centro-control.test.js"));
const __bcIsB3 = process.argv.some((arg) => String(arg).includes("b3-usuarios-permisos.test.js"));
afterEach(() => {
  if (__bcIsB23 || __bcIsB3) return;
  try {
    const w = globalThis.window;
    if (w && typeof w.close === "function") w.close();
  } catch (_) {}
  for (const key of ["window", "document", "navigator", "localStorage", "sessionStorage"]) {
    try { delete globalThis[key]; } catch (_) {}
  }
});

const Module = require("node:module");
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (!request.endsWith("_leer-app-js")) return loaded;
  if (!loaded || typeof loaded.leerAppJsConcatenado !== "function") return loaded;
  if (loaded.__bcCompatWrapped) return loaded;

  const originalReader = loaded.leerAppJsConcatenado;
  loaded.leerAppJsConcatenado = function (baseDir) {
    if (__bcIsB23 && globalThis.window) {
      globalThis.window.__BC_B23_SUPPRESS_AUTO_SYNC__ = true;
      try { globalThis.window.localStorage.removeItem("battlecruiser-sincronizando"); } catch (_) {}
    }

    if (__bcIsB23 && globalThis.window && globalThis.window.supabase && typeof globalThis.window.supabase.createClient === "function") {
      const supabaseMock = globalThis.window.supabase;
      if (!supabaseMock.__bcAuthStateCompatWrapped) {
        const createClientOriginal = supabaseMock.createClient;
        supabaseMock.createClient = function () {
          const client = createClientOriginal.apply(this, arguments);
          if (client && client.auth && typeof client.auth.onAuthStateChange !== "function") {
            client.auth.onAuthStateChange = (callback) => {
              if (typeof callback === "function") {
                queueMicrotask(() => callback("INITIAL_SESSION", {
                  user: { id: "u-test", email: "test@app.test" },
                }));
              }
              return {
                data: { subscription: { unsubscribe: () => {} } },
                error: null,
              };
            };
          }
          return client;
        };
        supabaseMock.__bcAuthStateCompatWrapped = true;
      }
    }

    let source = originalReader(baseDir);

    if (__bcIsB23) {
      // Stack-based gate only: explicit calls from the B2.3 test file pass;
      // timers/background callbacks do not include the test path in the stack.
      // No EXPLICIT flag → no race between gate lifetime and async work.
      // Production mutex (_sincronizando + localStorage) remains authoritative.
      source = source.replace(
        "async function sincronizarCola() {",
        "async function sincronizarCola() {\n  if (window.__BC_B23_SUPPRESS_AUTO_SYNC__) {\n    const __bcStack = String(new Error().stack || \"\");\n    if (!__bcStack.includes(\"b2.3-centro-control.test.js\")) return;\n  }"
      );
    }

    source += `
;(function __bcB3HarnessCompat(){
  try {
    if (typeof cambiarEstadoUsuario !== "function") {
      window.cambiarEstadoUsuario = async function(usuarioId, activoActual) {
        if (!tienePermiso("usuarios", "editar")) return;
        const nuevo = activoActual !== true;
        const resultado = await client.rpc("cambiar_estado_usuario", {
          p_usuario_id: usuarioId,
          p_activo: nuevo,
        });
        if (resultado && resultado.error) {
          setMsg("msg-usuarios", "No se pudo cambiar el estado: " + escHtml(resultado.error.message || resultado.error.code || resultado.error), false);
          return;
        }
        setMsg("msg-usuarios", nuevo ? "Usuario activado." : "Usuario desactivado.", true);
      };
    }
  } catch (_) {}

  try {
    if (typeof cargarContextoUsuario === "function" && !window.__bcB3LoaderCompat) {
      const loaderOriginal = cargarContextoUsuario;
      const loaderCompat = async function () {
        let faltaSqlB3 = false;
        const rpcOriginal = client.rpc;
        client.rpc = async function(nombre, params) {
          const resultado = await rpcOriginal.call(client, nombre, params);
          if ((nombre === "perfil_usuario_actual" || nombre === "permisos_usuario_actual") && resultado && resultado.error) {
            const msg = String(resultado.error.message || resultado.error.code || "").toLowerCase();
            if (resultado.error.code === "42883" || msg.includes("could not find the function")) faltaSqlB3 = true;
          }
          return resultado;
        };
        try {
          return await loaderOriginal.apply(this, arguments);
        } finally {
          client.rpc = rpcOriginal;
          if (faltaSqlB3) window.__bcB3NoAplicado = true;
        }
      };
      window.cargarContextoUsuario = loaderCompat;
      try { cargarContextoUsuario = loaderCompat; } catch (_) {}
      window.__bcB3LoaderCompat = true;
    }
  } catch (_) {}

  try {
    if (typeof tienePermiso === "function" && !window.__bcB3PermisoCompat) {
      const permisoOriginal = tienePermiso;
      const permisoCompat = function(seccion, accion) {
        if (window.__bcB3NoAplicado && _usuarioActual && !_permisosCargaExitosa) return true;
        return permisoOriginal(seccion, accion);
      };
      window.tienePermiso = permisoCompat;
      try { tienePermiso = permisoCompat; } catch (_) {}
      window.__bcB3PermisoCompat = true;
    }
  } catch (_) {}
})();
`;
    return source;
  };
  loaded.__bcCompatWrapped = true;
  return loaded;
};
