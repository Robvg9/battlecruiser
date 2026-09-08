// ============================================================
// B2.3 — Pruebas automatizadas del Centro de Control Operacional
// ============================================================
// Usa fake-indexeddb (misma lib que validó B2.2-A) + jsdom para simular
// el navegador, y un mock mínimo del cliente Supabase (las pruebas de
// B2.3 son de la capa de lectura/acción sobre la cola real, no del
// backend). Cubre:
//   - estados operacionales (online/offline/pendiente/sincronizando/
//     requiere atención/sincronizado);
//   - el Centro de Atención aparece con REQUIERE_ATENCION y desaparece
//     al resolverse;
//   - acciones (ver detalle, reintentar, eliminar, bloqueo de inválidas);
//   - idempotency_key conservada literal antes/después de reintentar;
//   - doble sincronización simultánea → 1 sola ejecución real;
//   - persistencia: el Centro se reconstruye desde la cola tras recarga.
//
// Ejecutar: node --test test/b2.3-centro-control.test.js
// Requiere: fake-indexeddb, jsdom (instaladas como devDependencies).
// ============================================================

const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");

globalThis.__BC_KEEP_JSDOM_ALIVE__ = true;
globalThis.__BC_TEST_DOMS__ = [];

// ---- helpers de entorno ----
function montarEntorno() {
  // HTML sin los <script> del CDN ni de app.js: los inyectamos a mano tras
  // montar el mock de Supabase, para que jsdom no intente cargar el CDN real.
  let html = require("fs").readFileSync(
    require("path").join(__dirname, "..", "public", "index.html"),
    "utf8"
  );
  html = html.replace(/<script[^>]*src="https:\/\/cdn[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="app\.js"[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="js\/[^"]*\.js"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.test/" });
  const { window } = dom;
  globalThis.__BC_TEST_DOMS__.push(dom);

  // Globals que app.js espera.
  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.crypto = window.crypto || global.crypto;
  // sincronizarCola usa localStorage como mutex entre pestañas. En un script
  // Node, localStorage no es global aunque sí exista en window.
  global.localStorage = window.localStorage;
  global.sessionStorage = window.sessionStorage;

  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window, "caches", { value: { keys: async () => [], delete: async () => true }, configurable: true });
  Object.defineProperty(window, "serviceWorker", { value: { getRegistrations: async () => [], register: async () => ({ unregister: async () => true }) }, configurable: true });

  const rpcCalls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u-test", email: "test@app.test" } } } }),
      getUser: async () => ({ data: { user: { id: "u-test", email: "test@app.test" } }, error: null }),
      onAuthStateChange: () => {},
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: {} }, error: null }),
    },
    rpc: async (nombre, params) => {
      rpcCalls.push({ nombre, params });
      return client.__rpcResult;
    },
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    __rpcCalls: rpcCalls,
    __rpcResult: { data: "ok", error: null },
  };
  window.supabase = { createClient: () => client };

  let appJs = require("./_leer-app-js").leerAppJsConcatenado(__dirname);
  appJs = appJs
    .replace(/const _cache = \{/, "window._cache = {")
    .replace(/let _operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];")
    .replace(/let _novedadesVistas = new Set\(\);/, "window._novedadesVistas = new Set();")
    .replace(/let _ventasBusqueda = "";/, "window._ventasBusqueda = \"\";")
    .replace(/let _trfBusqueda = "";/, "window._trfBusqueda = \"\";")
    .replace(/let _valesBusqueda = "";/, "window._valesBusqueda = \"\";")
    .replace(/return _operacionesPendientesCache;/, "return window._operacionesPendientesCache;")
    .replace(/_operacionesPendientesCache = combinadas;/, "window._operacionesPendientesCache = combinadas;")
    .replace(/_operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];");
  const scriptEl = window.document.createElement("script");
  scriptEl.textContent = appJs;
  window.document.body.appendChild(scriptEl);

  return { dom, window, document: window.document, client };
}

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Marca el shell visible (simula login) y simula online.
function marcarOnline(window) {
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  const shell = window.document.getElementById("app-shell");
  if (shell) shell.classList.add("visible");
}

// Crear una operación pendiente real en la cola (igual que haría
// ejecutarOperación cuando offline). Reutiliza las funciones internas
// del propio app.js cargado en el window.
async function crearOp(window, tipo, payload, estado, extra) {
  const w = window;
  const op = w.crearOperacionPendiente(tipo, payload);
  if (estado) op.estado = estado;
  if (extra) Object.assign(op, extra);
  return await w.guardarOperacionPendiente(op);
}

// ---- tests ----
