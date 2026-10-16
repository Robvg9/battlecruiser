// ============================================================
// Fase C — Tests de regresión de hardening final (pre-merge).
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
  html = html.replace(/<script[^>]*src="js\/[^"]*\.js(?:\?[^"]*)?"[^>]*><\/script>/g, "");
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

function inyectarApp(window) {
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
    .replace(/function idbAbrir\(\) {/, "window.idbAbrir = function idbAbrir() {");
  const s = window.document.createElement("script");
  s.textContent = appJs;
  window.document.body.appendChild(s);
}

function montarEntorno(opciones = {}) {
  const env = prepararDOM(opciones);
  inyectarApp(env.window);
  return env;
}

function marcarOnline(window) {
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  const shell = window.document.getElementById("app-shell");
  if (shell) shell.classList.add("visible");
}

function setUsuario(window, uid) {
  window._usuarioActualId = uid;
  window._usuarioActual = { id: uid, nombre: uid, activo: true, role_id: "r1", rol: "Dueño" };
}

function logout(window) {
  window._usuarioActualId = null;
  if (typeof window.limpiarContextoUsuario === "function") window.limpiarContextoUsuario();
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

test("R1: A crea op offline -> logout -> A re-login -> recupera y sincroniza su operación", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  const UID_A = "usuario-A";

  setUsuario(window, UID_A);
  const op = await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 3 }] }, "key-A-relogin")
  );
  assert.ok(op && op.usuario_id === UID_A, "La operación de A debe guardarse con usuario_id = usuario-A");
  const opId = op.id;

  logout(window);
  assert.strictEqual(window._usuarioActualId, null, "Tras logout, _usuarioActualId es null");
  assert.strictEqual(window._operacionesPendientesCache.length, 0, "Tras logout, la proyección en memoria está vacía");

  const visiblesSinSesion = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(visiblesSinSesion.length, 0, "Sin sesión, la op de A no debe ser visible");

  setUsuario(window, UID_A);

  const opsA = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsA.length, 1, "A recupera exactamente su 1 operación tras re-login");
  assert.strictEqual(opsA[0].id, opId, "Es la misma operación que encoló antes del logout");
  assert.strictEqual(opsA[0].usuario_id, UID_A, "La op recuperada sigue siendo de usuario-A");

  await window.sincronizarCola();
  await esperar(50);

  const ventaRpc = client.__rpcCalls.find((c) => c.nombre === "registrar_venta");
  assert.ok(ventaRpc, "Tras re-login, A sincroniza y el RPC registrar_venta se ejecuta");
  assert.strictEqual(ventaRpc.params.p_idempotency_key, "key-A-relogin", "Conserva la idempotency_key original de la op");

  const opsTrasSync = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsTrasSync.length, 0, "Tras sincronizar, la op de A deja de estar pendiente");
});

test("R2: A crea op offline -> logout -> B entra -> B no ve ni procesa la op de A (y la op de A persiste)", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  const UID_A = "usuario-A";
  const UID_B = "usuario-B";

  setUsuario(window, UID_A);
  const op = await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }] }, "key-A-crossuser")
  );
  assert.ok(op && op.usuario_id === UID_A, "La op de A se guarda con usuario_id = usuario-A");
  const opId = op.id;

  logout(window);

  setUsuario(window, UID_B);

  const opsB = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsB.length, 0, "B NO debe ver ninguna operación (la cola de B está vacía)");

  const todasB = await window.obtenerTodasLasOperaciones();
  assert.strictEqual(todasB.length, 0, "B NO debe ver la op de A vía obtenerTodasLasOperaciones");

  const visiblesB = await window.obtenerOperacionesVisiblesPanel();
  assert.strictEqual(visiblesB.length, 0, "B NO debe ver la op de A en el panel");

  await window.refrescarOperacionesPendientesCache();
  assert.strictEqual(window._operacionesPendientesCache.length, 0, "La proyección de B no contiene la op de A");

  await window.sincronizarCola();
  await esperar(50);
  const ventaRpc = client.__rpcCalls.find((c) => c.nombre === "registrar_venta");
  assert.ok(!ventaRpc, "B NO debe haber ejecutado registrar_venta (la op pertenece a A)");

  const db = await window.idbAbrir();
  const crudas = await new Promise((resolve, reject) => {
    const tx = db.transaction("operaciones_pendientes", "readonly");
    const req = tx.objectStore("operaciones_pendientes").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  assert.strictEqual(crudas.length, 1, "La op de A sigue en el disco (no la borró ni procesó B)");
  assert.strictEqual(crudas[0].id, opId, "Es la misma operación que encoló A");
  assert.strictEqual(crudas[0].usuario_id, UID_A, "Sigue siendo de usuario-A");
  assert.strictEqual(crudas[0].estado, "PENDIENTE", "Sigue PENDIENTE (B no la tocó)");

  await window.actualizarContadorColaPendiente();
  await esperar(30);
  const badge = window.document.getElementById("cola-pendientes-badge");
  assert.ok(badge.classList.contains("hidden") || !badge.textContent.includes("1"),
    "El badge de B no muestra pendientes de A");

  setUsuario(window, UID_A);
  const opsA = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsA.length, 1, "A recupera su op intacta tras el paso de B");
  assert.strictEqual(opsA[0].id, opId);
});

test("M1-a: guardarOperacionPendiente rechaza operación con usuario_id null (no se persiste)", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  const opHuerfana = {
    id: "op-huerfana-1",
    tipo: "venta",
    payload: { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }] },
    usuario_id: null,
    creado_en: "2024-01-01T00:00:00.000Z",
    actualizado_en: "2024-01-01T00:00:00.000Z",
    estado: "PENDIENTE",
    intentos: 0,
    ultimo_intento: null,
    ultimo_error: null,
    idempotency_key: "key-huerfana",
  };

  const resultado = await window.guardarOperacionPendiente(opHuerfana);
  assert.strictEqual(resultado, null, "guardarOperacionPendiente debe devolver null para op huérfana");

  const db = await window.idbAbrir();
  const crudas = await new Promise((resolve, reject) => {
    const tx = db.transaction("operaciones_pendientes", "readonly");
    const req = tx.objectStore("operaciones_pendientes").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  assert.strictEqual(crudas.length, 0, "La op huérfana NO debe quedar persistida en IndexedDB");
});

test("M1-b: guardarOperacionPendiente rechaza operación con usuario_id vacío (string '')", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  const opVacia = {
    id: "op-vacia-1",
    tipo: "venta",
    payload: {},
    usuario_id: "",
    creado_en: "2024-01-01T00:00:00.000Z",
    estado: "PENDIENTE",
    intentos: 0,
    idempotency_key: "key-vacia",
  };

  const resultado = await window.guardarOperacionPendiente(opVacia);
  assert.strictEqual(resultado, null, "guardarOperacionPendiente debe devolver null para usuario_id=''");

  const db = await window.idbAbrir();
  const crudas = await new Promise((resolve, reject) => {
    const tx = db.transaction("operaciones_pendientes", "readonly");
    const req = tx.objectStore("operaciones_pendientes").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  assert.strictEqual(crudas.length, 0, "La op con usuario_id vacío NO debe quedar persistida");
});

test("M1-c: crearOperacionPendiente refleja el usuario actual y guardarOperacionPendiente la acepta cuando hay sesión", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  setUsuario(window, "usuario-valido");
  const op = window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [] }, "key-valida");
  assert.strictEqual(op.usuario_id, "usuario-valido", "crearOperacionPendiente toma el usuario actual");

  const guardada = await window.guardarOperacionPendiente(op);
  assert.ok(guardada && guardada.id === op.id, "La op con usuario_id válido SÍ se guarda");
  assert.strictEqual(guardada.usuario_id, "usuario-valido");
});
