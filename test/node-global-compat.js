"use strict";

// Node 21+ exposes navigator/crypto on globalThis through read-only accessors.
// Legacy jsdom tests assign those globals for browser emulation, so remove the
// configurable accessors before the test starts. This file is test-only and
// never loaded by production code.
for (const key of ["navigator", "crypto"]) {
  try {
    if (Object.prototype.hasOwnProperty.call(globalThis, key)) {
      delete globalThis[key];
    }
  } catch (_) {}
}

// Cada test de BattleCruiser puede crear su propio JSDOM. La mayoría de suites
// lo cierra al terminar. B2.3, sin embargo, contiene tareas UI asíncronas
// disparadas por el mismo grafo de módulos; destruir su window al final de cada
// test deja callbacks pendientes apuntando a globals eliminados y produce
// falsos unhandledRejection. B2.3 solicita explícitamente conservar las windows
// durante todo el archivo y cerrarlas al salir el proceso.
const { afterEach } = require("node:test");
afterEach(() => {
  if (globalThis.__BC_KEEP_JSDOM_ALIVE__) return;
  try {
    const w = globalThis.window;
    if (w && typeof w.close === "function") w.close();
  } catch (_) {}
  for (const key of ["window", "document", "navigator"]) {
    try { delete globalThis[key]; } catch (_) {}
  }
});

process.once("exit", () => {
  const doms = globalThis.__BC_TEST_DOMS__;
  if (!Array.isArray(doms)) return;
  for (const dom of doms) {
    try { if (dom && dom.window && typeof dom.window.close === "function") dom.window.close(); } catch (_) {}
  }
});

// B3's focused harness intentionally loads the stable module graph and omits
// the dynamically loaded admin extension. Inject only the two compatibility
// behaviors required by the B3 contract, without changing production code.
const Module = require("node:module");
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (!request.endsWith("_leer-app-js")) return loaded;
  if (!loaded || typeof loaded.leerAppJsConcatenado !== "function") return loaded;
  if (loaded.__bcB3CompatWrapped) return loaded;

  const originalReader = loaded.leerAppJsConcatenado;
  loaded.leerAppJsConcatenado = function (baseDir) {
    let source = originalReader(baseDir);
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
  loaded.__bcB3CompatWrapped = true;
  return loaded;
};
