// ============================================================
// Fase C — Tests de aislamiento de cola/caché por usuario,
// reconciliación B7/B8, XSS, auditoría redundante y bug de categoría.
// ============================================================

const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const fs = require("fs");
const path = require("path");

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mockCliente({ perfil, permisos } = {}) {
  const rpcCalls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u-test", email: "roberto@cueva.test" } } } }),
      onAuthStateChange: () => {},
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: {} }, error: null }),
    },
    rpc: async (nombre, params) => {
      rpcCalls.push({ nombre, params });
      if (nombre === "perfil_usuario_actual") return { data: perfil || null, error: null };
      if (nombre === "permisos_usuario_actual") return { data: permisos || [], error: null };
      if (nombre === "usuario_esta_activo") return { data: perfil ? !!perfil[0].activo : null, error: null };
      if (nombre === "registrar_auditoria") return { data: 1, error: null };
      if (nombre === "actualizar_producto") return { data: params.p_producto_id, error: null };
      if (nombre === "cambiar_estado_producto") return { data: params.p_producto_id, error: null };
      if (nombre === "crear_producto") return { data: "prod-uuid-nuevo", error: null };
      if (nombre === "registrar_compra") return { data: "compra-uuid", error: null };
      if (nombre === "registrar_venta") return { data: "venta-uuid", error: null };
      if (nombre === "registrar_transferencia") return { data: "trf-uuid", error: null };
      if (nombre === "registrar_vale_salida") return { data: "vale-uuid", error: null };
      if (nombre === "enviar_mensaje") return { data: { id: "msg-uuid" }, error: null };
      if (nombre === "crear_conversacion") return { data: { id: "conv-uuid" }, error: null };
      if (nombre === "abrir_turno") return { data: { id: "turno-uuid" }, error: null };
      return { data: null, error: { message: "Could not find the function" } };
    },
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    __rpcCalls: rpcCalls,
  };
  return client;
}

function prepararDOM(opciones = {}) {
  let html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  html = html.replace(/<script[^>]*src="https:\/\/cdn[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="app\.js(?:\?[^"]*)?"[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="js\/[^"]*\.js"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.test/" });
  const window = dom.window;
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  global.crypto = window.crypto || global.crypto;
  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window, "caches", { value: { keys: async () => [], delete: async () => true }, configurable: true });
  Object.defineProperty(window, "serviceWorker", { value: { getRegistrations: async () => [], register: async () => ({ unregister: async () => true }) }, configurable: true });
  const client = mockCliente(opciones);
  window.supabase = { createClient: () => client };
  return { dom, window, document: window.document, client };
}

function inyectarApp(window, opciones = {}) {
  let appJs = require("./_leer-app-js").leerAppJsConcatenado(__dirname);
  // CRITICAL: do NOT rewrite bare assignments to window.* globally.
  // That destroys lexical reads of let-bound identifiers and breaks bootstrap.
  // Use `var` so the binding is a true window global (classic script semantics).
  appJs = appJs
    .replace(/const _cache = \{/, "window._cache = {")
    .replace(/let _operacionesPendientesCache = \[\];/, "var _operacionesPendientesCache = []; window._operacionesPendientesCache = _operacionesPendientesCache;")
    .replace(/return _operacionesPendientesCache;/, "return (window._operacionesPendientesCache = _operacionesPendientesCache);")
    .replace(/_operacionesPendientesCache = combinadas;/, "_operacionesPendientesCache = combinadas; window._operacionesPendientesCache = combinadas;")
    .replace(/_operacionesPendientesCache = \[\];/g, "_operacionesPendientesCache = []; window._operacionesPendientesCache = [];")
    .replace(/let _usuarioActualId = null;/, "var _usuarioActualId = null;")
    .replace(/let _usuarioActual = null;/, "var _usuarioActual = null;")
    .replace(/let _refrescosPendientes = null;/, "var _refrescosPendientes = null;")
    .replace(/function idbAbrir\(\) {/, "window.idbAbrir = function idbAbrir() {")
    .replace(/let _idbConexion = null;/, "let _idbConexion = null; window._idbConexion = () => _idbConexion; window._idbConexionReset = () => { _idbConexion = null; };");
  const s = window.document.createElement("script");
  s.textContent = appJs;
  window.document.body.appendChild(s);
}

function montarEntorno(opciones = {}) {
  const env = prepararDOM(opciones);
  inyectarApp(env.window, opciones);
  return env;
}

async function montarEntornoConIdb(opciones, prepararIdb) {
  const env = prepararDOM(opciones);
  if (prepararIdb) await prepararIdb(env.window.indexedDB);
  inyectarApp(env.window, opciones);
  return env;
}

function marcarOnline(window) {
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  const shell = window.document.getElementById("app-shell");
  if (shell) shell.classList.add("visible");
}

function setUsuario(window, uid) {
  window._usuarioActualId = uid;
  if (typeof window.__bcSetUsuarioActualId === "function") {
    window.__bcSetUsuarioActualId(uid);
  }
  const perfil = { id: uid, nombre: uid, activo: true, role_id: "r1", rol: "Dueño" };
  window._usuarioActual = perfil;
  if (typeof window.__bcSetUsuarioActual === "function") {
    window.__bcSetUsuarioActual(perfil);
  }
}

const PERFIL = [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }];
const PERMISOS_TODOS = [
  { seccion: "productos", accion: "crear" }, { seccion: "productos", accion: "editar" },
  { seccion: "compras", accion: "crear" }, { seccion: "ventas", accion: "crear" },
  { seccion: "transferencias", accion: "crear" }, { seccion: "vales", accion: "crear" },
  { seccion: "reportes", accion: "ver" }, { seccion: "auditoria", accion: "ver" },
  { seccion: "productos", accion: "ver" }, { seccion: "compras", accion: "ver" },
  { seccion: "ventas", accion: "ver" }, { seccion: "transferencias", accion: "ver" },
  { seccion: "vales", accion: "ver" },
];

// Load cases in the same scope so helpers are visible.
const _fs = require("fs");
const _path = require("path");
for (const part of [
  "fase-c-aislamiento-cases-0.js",
  "fase-c-aislamiento-cases-1.js",
  "fase-c-aislamiento-cases-2.js",
  "fase-c-aislamiento-cases-3.js",
  "fase-c-aislamiento-cases-4.js",
]) {
  const p = _path.join(__dirname, part);
  if (_fs.existsSync(p)) eval(_fs.readFileSync(p, "utf8"));
}
