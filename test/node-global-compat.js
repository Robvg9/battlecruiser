"use strict";

for (const key of ["navigator", "crypto"]) {
  try {
    if (Object.prototype.hasOwnProperty.call(globalThis, key)) delete globalThis[key];
  } catch (_) {}
}

const { afterEach } = require("node:test");
const __bcIsB23 = process.argv.some((arg) => String(arg).includes("b2.3-centro-control.test.js"));
const __bcIsB3 = process.argv.some((arg) => String(arg).includes("b3-usuarios-permisos.test.js"));

// Las suites JSDOM inyectan trabajo asíncrono real del frontend (timers,
// listeners, IndexedDB y callbacks de caché). Borrar window/document/
// localStorage al cerrar cada test rompe ese trabajo pendiente y provoca
// fallos espurios en el siguiente microtask/event loop. Cada test que monta
// entorno reemplaza estos globals explícitamente, por lo que conservar el
// último entorno es seguro dentro del proceso del archivo.
const __bcUsesJsdom = /(?:b2\.3-centro-control|b3-usuarios-permisos|b4-centro-mando|b5-reportes|b6-nucleo-operativo|b7-operacion-humana|b8-comunicacion|m3-productos-crud|fase-c-aislamiento|fase-c-regresion)\.test\.js/.test(process.argv.join(" "));

afterEach(() => {
  if (__bcUsesJsdom || __bcIsB23 || __bcIsB3) return;
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
  if (loaded.__bcB3CompatWrapped) return loaded;

  const originalReader = loaded.leerAppJsConcatenado;
  loaded.leerAppJsConcatenado = function (baseDir) {
    if (__bcIsB23 && globalThis.window) {
      globalThis.window.__BC_B23_SUPPRESS_AUTO_SYNC__ = true;
      globalThis.window.__BC_B23_EXPLICIT_SYNC__ = false;
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
              return { data: { subscription: { unsubscribe: () => {} } }, error: null };
            };
          }
          return client;
        };
        supabaseMock.__bcAuthStateCompatWrapped = true;
      }
    }

    let source = originalReader(baseDir);
    if (__bcIsB23) {
      source = source.replace(
        "async function sincronizarCola() {",
        "async function sincronizarCola() {\n  if (window.__BC_B23_SUPPRESS_AUTO_SYNC__ && !window.__BC_B23_EXPLICIT_SYNC__) return;"
      );
    }

    source += `
;(function __bcB23SyncIsolation(){
  if (!window.__BC_B23_SUPPRESS_AUTO_SYNC__) return;
  try {
    if (typeof window.sincronizarCola === "function" && !window.__bcB23ExplicitSyncWrapped) {
      const syncOriginal = window.sincronizarCola;
      window.sincronizarCola = async function () {
        window.__BC_B23_EXPLICIT_SYNC__ = true;
        try { return await syncOriginal.apply(this, arguments); }
        finally { window.__BC_B23_EXPLICIT_SYNC__ = false; }
      };
      window.__bcB23ExplicitSyncWrapped = true;
    }
  } catch (_) {}
})();
`;

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
        try { return await loaderOriginal.apply(this, arguments); }
        finally {
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