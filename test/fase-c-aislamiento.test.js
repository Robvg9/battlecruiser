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
  html = html.replace(/<script[^>]*src="app\.js"[^>]*><\/script>/g, "");
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
  let appJs = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  // Exponer internals necesarios para los tests (mismo patrón que b2.3/b6).
  appJs = appJs
    .replace(/const _cache = \{/, "window._cache = {")
    .replace(/let _operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];")
    .replace(/return _operacionesPendientesCache;/, "return window._operacionesPendientesCache;")
    .replace(/_operacionesPendientesCache = combinadas;/, "window._operacionesPendientesCache = combinadas;")
    .replace(/_operacionesPendientesCache = \[\];/g, "window._operacionesPendientesCache = [];")
    .replace(/const RPC_POR_TIPO = \{/, "window.RPC_POR_TIPO = {")
    .replace(/let _usuarioActualId = null;/, "window._usuarioActualId = null;")
    .replace(/_usuarioActualId = /g, "window._usuarioActualId = ")
    .replace(/let _usuarioActual = null;/, "window._usuarioActual = null;")
    .replace(/_usuarioActual = /g, "window._usuarioActual = ")
    .replace(/let _refrescosPendientes = null;/, "window._refrescosPendientes = null;")
    // Exponer idbAbrir/_idbConexion para el test de migración v2 -> v3:
    // permite forzar onupgradeneeded de la app sobre una base precreada en v2.
    .replace(/function idbAbrir\(\) {/, "window.idbAbrir = function idbAbrir() {")
    .replace(/let _idbConexion = null;/, "let _idbConexion = null; window._idbConexion = () => _idbConexion; window._idbConexionReset = () => { _idbConexion = null; };");
  const s = window.document.createElement("script");
  s.textContent = appJs;
  window.document.body.appendChild(s);
}

// montarEntorno (síncrono): instala nueva + carga app.js de una vez.
// Mantiene la firma existente para los 23 tests C2/C3/P6/A1.
function montarEntorno(opciones = {}) {
  const env = prepararDOM(opciones);
  inyectarApp(env.window, opciones);
  return env;
}

// montarEntornoConIdb (async): permite preparar la base IndexedDB ANTES de
// cargar app.js. Esto es lo que reproduce una instalación que ya estaba en
// v2: prepararIdb(idb) crea la estructura v2 (sin el índice usuario_id) e
// inserta operaciones, y recién después se inyecta app.js (que abre la base
// en v3 y dispara onupgradeneeded de la migración).
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
  window._usuarioActual = { id: uid, nombre: uid, activo: true, role_id: "r1", rol: "Dueño" };
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

// ============================================================
// C3: AISLAMIENTO DE COLA OFFLINE POR USUARIO
// ============================================================

test("C3-1: obtenerOperacionesPorEstado NO devuelve operaciones de otro usuario", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  // Usuario A guarda una operación
  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [] }, "key-A")
  );

  // Usuario B guarda una operación
  setUsuario(window, "usuario-B");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1, p_costo_unitario: 1 }, "key-B")
  );

  // Usuario A solo debe ver SU operación
  setUsuario(window, "usuario-A");
  const opsA = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsA.length, 1, "Usuario A debe ver solo 1 operación (la suya)");
  assert.strictEqual(opsA[0].tipo, "venta", "La operación de A debe ser venta");

  // Usuario B solo debe ver SU operación
  setUsuario(window, "usuario-B");
  const opsB = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsB.length, 1, "Usuario B debe ver solo 1 operación (la suya)");
  assert.strictEqual(opsB[0].tipo, "compra", "La operación de B debe ser compra");
});

test("C3-2: obtenerTodasLasOperaciones NO devuelve operaciones de otro usuario", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", {}, "key-A1")
  );

  setUsuario(window, "usuario-B");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("compra", {}, "key-B1")
  );

  setUsuario(window, "usuario-A");
  const todasA = await window.obtenerTodasLasOperaciones();
  assert.strictEqual(todasA.length, 1, "Usuario A debe ver solo 1 operación total");
  assert.strictEqual(todasA[0].usuario_id, "usuario-A", "La operación debe ser de usuario-A");
});

test("C3-3: refrescarOperacionesPendientesCache NO mezcla operaciones entre usuarios", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 5 }] }, "key-A")
  );

  setUsuario(window, "usuario-B");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 10 }] }, "key-B")
  );

  setUsuario(window, "usuario-A");
  await window.refrescarOperacionesPendientesCache();
  assert.strictEqual(window._operacionesPendientesCache.length, 1, "Cache de A debe tener 1 operación");
  assert.strictEqual(window._operacionesPendientesCache[0].usuario_id, "usuario-A");
});

test("C3-4: sincronizarCola NO procesa operaciones de otro usuario", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  // Usuario A encola una venta
  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }] }, "key-A")
  );

  // Usuario B inicia sesión y sincroniza
  setUsuario(window, "usuario-B");
  await window.sincronizarCola();
  await esperar(50);

  // El RPC de registrar_venta NO debe haberse llamado (la op de A no es de B)
  const ventaRpc = client.__rpcCalls.find((c) => c.nombre === "registrar_venta");
  assert.ok(!ventaRpc, "Usuario B NO debe haber procesado la venta de usuario A");

  // La operación de A debe seguir PENDIENTE (no se procesó)
  setUsuario(window, "usuario-A");
  const opsA = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsA.length, 1, "La operación de A debe seguir pendiente");
});

test("C3-5: logout/login no mezcla cola (limpiarContextoUsuario limpia proyección)", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", {}, "key-A")
  );
  await window.refrescarOperacionesPendientesCache();
  assert.strictEqual(window._operacionesPendientesCache.length, 1, "A tiene 1 op en proyección");

  // Logout (limpiarContextoUsuario limpia _usuarioActual y _operacionesPendientesCache;
  // _usuarioActualId lo limpia showLogin, no limpiarContextoUsuario).
  window.limpiarContextoUsuario();
  assert.strictEqual(window._operacionesPendientesCache.length, 0, "Tras logout, proyección debe estar vacía");
  assert.strictEqual(window._usuarioActual, null, "Tras logout, _usuarioActual debe ser null");
});

test("C3-6: obtenerOperacionesVisiblesPanel NO devuelve operaciones de otro usuario", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", {}, "key-A")
  );

  setUsuario(window, "usuario-B");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("compra", {}, "key-B")
  );

  setUsuario(window, "usuario-A");
  const visiblesA = await window.obtenerOperacionesVisiblesPanel();
  assert.strictEqual(visiblesA.length, 1, "Panel de A debe mostrar solo 1 op");
  assert.strictEqual(visiblesA[0].usuario_id, "usuario-A");
});

test("C3-7: actualizarContadorColaPendiente NO cuenta operaciones de otro usuario", async () => {
  const { window, document } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  setUsuario(window, "usuario-A");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", {}, "key-A")
  );
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("compra", {}, "key-A2")
  );

  setUsuario(window, "usuario-B");
  await window.guardarOperacionPendiente(
    window.crearOperacionPendiente("venta", {}, "key-B")
  );

  // Usuario A debe contar SOLO sus 2 operaciones (no las 3 totales).
  setUsuario(window, "usuario-A");
  await window.actualizarContadorColaPendiente();
  await esperar(30);
  const badge = document.getElementById("cola-pendientes-badge");
  // El badge debe mostrar 2 pendientes (no 3).
  assert.ok(badge.textContent.includes("2"), "Badge de A debe mostrar 2 pendientes (no 3)");
});

// ============================================================
// C2: AISLAMIENTO DE CACHÉ ENTRE USUARIOS
// ============================================================

test("C2-1: idbSet/idbGet aislan por usuario (B no lee caché de A)", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  // Usuario A guarda en caché
  setUsuario(window, "usuario-A");
  await window.idbSet("productos", [{ id: "p1", nombre: "Producto de A" }]);

  // Usuario B intenta leer
  setUsuario(window, "usuario-B");
  const cacheB = await window.idbGet("productos");
  assert.ok(!cacheB || !cacheB.datos || cacheB.datos.length === 0, "Usuario B NO debe ver caché de A");

  // Usuario A sí puede leer su caché
  setUsuario(window, "usuario-A");
  const cacheA = await window.idbGet("productos");
  assert.ok(cacheA && cacheA.datos && cacheA.datos.length === 1, "Usuario A debe ver SU caché");
  assert.strictEqual(cacheA.datos[0].nombre, "Producto de A");
});

test("C2-2: limpiarContextoUsuario limpia _cache en memoria", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  setUsuario(window, "usuario-A");
  window._cache.productos = [{ id: "p1", nombre: "Producto de A" }];
  window._cache.stock = [{ producto_id: "p1", cantidad: 100 }];

  window.limpiarContextoUsuario();
  assert.strictEqual(window._cache.productos.length, 0, "_cache.productos debe estar vacío tras logout");
  assert.strictEqual(window._cache.stock.length, 0, "_cache.stock debe estar vacío tras logout");
});

// ============================================================
// A1: RECONCILIACIÓN B7/B8
// ============================================================

test("A1-1: reconciliarTrasOperacion('mensaje') marca 'comunicacion', no 'stock'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("mensaje", "exito");
  assert.ok(window._refrescosPendientes.has("comunicacion"), "Debe marcar 'comunicacion'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-2: reconciliarTrasOperacion('conversacion') marca 'conversaciones', no 'stock'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("conversacion", "exito");
  assert.ok(window._refrescosPendientes.has("conversaciones"), "Debe marcar 'conversaciones'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-3: reconciliarTrasOperacion('responsabilidad') marca 'responsabilidades'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("responsabilidad", "exito");
  assert.ok(window._refrescosPendientes.has("responsabilidades"), "Debe marcar 'responsabilidades'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-4: reconciliarTrasOperacion('incidencia') marca 'incidencias'", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("incidencia", "exito");
  assert.ok(window._refrescosPendientes.has("incidencias"), "Debe marcar 'incidencias'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock'");
});

test("A1-5: reconciliarTrasOperacion('turno') marca 'turnos' (no default stock)", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  window._refrescosPendientes = new Set();
  window.reconciliarTrasOperacion("turno", "exito");
  assert.ok(window._refrescosPendientes.has("turnos"), "Debe marcar 'turnos'");
  assert.ok(!window._refrescosPendientes.has("stock"), "NO debe marcar 'stock' para turno");
});

// ============================================================
// A2: XSS — innerHTML con .nombre debe estar escapado
// ============================================================

test("A2-1: escHtml escapa <, >, \", ', &", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  const escapado = window.escHtml('<img src=x onerror="alert(1)">');
  assert.ok(!escapado.includes("<img"), "escHtml debe escapar <");
  assert.ok(escapado.includes("&lt;"), "escHtml debe convertir < a &lt;");
  assert.ok(escapado.includes("&quot;"), "escHtml debe escapar comillas");
});

test("A2-2: no quedan interpolaciones .nombre sin escHtml en innerHTML (verificación de código)", async () => {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  // Buscar innerHTML con template literal que interpola .nombre sin escHtml
  const lineas = appJs.split("\n");
  let encontradas = [];
  lineas.forEach((linea, i) => {
    if (linea.includes("innerHTML") && linea.includes("${") && linea.includes(".nombre") && !linea.includes("escHtml")) {
      // Verificar si la línea tiene .nombre sin escHtml en la misma interpolación
      const matches = linea.match(/\$\{[^}]*\.nombre[^}]*\}/g) || [];
      matches.forEach((m) => {
        if (!m.includes("escHtml")) {
          encontradas.push({ linea: i + 1, snippet: m });
        }
      });
    }
  });
  assert.strictEqual(encontradas.length, 0, `Quedan ${encontradas.length} interpolaciones .nombre sin escHtml: ${JSON.stringify(encontradas)}`);
});

// ============================================================
// P5: AUDITORÍA REDUNDANTE
// ============================================================

test("P5-1: tipoAuditableFrontend devuelve false para tipos con trigger", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  assert.strictEqual(window.tipoAuditableFrontend("producto"), false);
  assert.strictEqual(window.tipoAuditableFrontend("producto_actualizar"), false);
  assert.strictEqual(window.tipoAuditableFrontend("producto_estado"), false);
  assert.strictEqual(window.tipoAuditableFrontend("compra"), false);
  assert.strictEqual(window.tipoAuditableFrontend("venta"), false);
  assert.strictEqual(window.tipoAuditableFrontend("transferencia"), false);
  assert.strictEqual(window.tipoAuditableFrontend("vale"), false);
});

test("P5-2: tipoAuditableFrontend devuelve true para tipos sin trigger", async () => {
  const { window } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  assert.strictEqual(window.tipoAuditableFrontend("turno"), true);
  assert.strictEqual(window.tipoAuditableFrontend("cuadre"), true);
  assert.strictEqual(window.tipoAuditableFrontend("responsabilidad"), true);
  assert.strictEqual(window.tipoAuditableFrontend("incidencia"), true);
  assert.strictEqual(window.tipoAuditableFrontend("mensaje"), true);
  assert.strictEqual(window.tipoAuditableFrontend("conversacion"), true);
});

test("P5-3: ejecutarOperacion('compra') NO llama registrar_auditoria (trigger lo cubre)", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);
  setUsuario(window, "u-test");

  await window.ejecutarOperacion("compra", {
    p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1, p_costo_unitario: 1,
  });
  await esperar(30);

  const audCalls = client.__rpcCalls.filter((c) => c.nombre === "registrar_auditoria");
  assert.strictEqual(audCalls.length, 0, "compra NO debe llamar registrar_auditoria (trigger lo cubre)");
});

test("P5-4: ejecutarOperacion('venta') NO llama registrar_auditoria (trigger lo cubre)", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);
  setUsuario(window, "u-test");

  await window.ejecutarOperacion("venta", {
    p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }],
  });
  await esperar(30);

  const audCalls = client.__rpcCalls.filter((c) => c.nombre === "registrar_auditoria");
  assert.strictEqual(audCalls.length, 0, "venta NO debe llamar registrar_auditoria (trigger lo cubre)");
});

test("P5-5: ejecutarOperacion('mensaje') SÍ llama registrar_auditoria (no hay trigger)", async () => {
  const { window, client } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);
  setUsuario(window, "u-test");

  await window.ejecutarOperacion("mensaje", {
    p_conversacion_id: "conv-1", p_contenido: "Hola",
  });
  await esperar(30);

  const audCalls = client.__rpcCalls.filter((c) => c.nombre === "registrar_auditoria");
  assert.ok(audCalls.length > 0, "mensaje SÍ debe llamar registrar_auditoria (no cubierto por trigger)");
});

// ============================================================
// P6: BUG DE CATEGORÍA EN iniciarEdicionProducto
// ============================================================

test("P6-1: iniciarEdicionProducto limpia categoría cuando p.categorias es null", async () => {
  const { window, document } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  // jsdom no implementa scrollIntoView; mockearlo.
  const form = document.getElementById("form-producto");
  if (form) form.scrollIntoView = () => {};
  const select = document.getElementById("prod-categoria");
  // Simular que hay opciones
  select.innerHTML = '<option value="">Categoría</option><option value="cat1">Bebidas</option><option value="cat2">Comidas</option>';

  // Primera edición: producto CON categoría
  window.iniciarEdicionProducto({ id: "p1", nombre: "Coca", categorias: { nombre: "Bebidas" } });
  assert.strictEqual(select.value, "cat1", "Debe seleccionar Bebidas");

  // Segunda edición: producto SIN categoría
  window.iniciarEdicionProducto({ id: "p2", nombre: "Producto sin cat", categorias: null });
  assert.strictEqual(select.value, "", "Debe limpiar la categoría (vacía) cuando el producto no tiene categoría");
});

test("P6-2: iniciarEdicionProducto mantiene categoría cuando p.categorias existe", async () => {
  const { window, document } = montarEntorno({ perfil: PERFIL, permisos: PERMISOS_TODOS });
  marcarOnline(window);
  await esperar(80);

  const form = document.getElementById("form-producto");
  if (form) form.scrollIntoView = () => {};
  const select = document.getElementById("prod-categoria");
  select.innerHTML = '<option value="">Categoría</option><option value="cat1">Bebidas</option>';

  window.iniciarEdicionProducto({ id: "p1", nombre: "Coca", categorias: { nombre: "Bebidas" } });
  assert.strictEqual(select.value, "cat1", "Debe seleccionar Bebidas correctamente");
});


// ============================================================
// C3-MIG: MIGRACIÓN INDEXEDDB v2 -> v3 (test real de migración)
// ============================================================
// Helpers de IndexedDB para los tests de migración. Simulan a mano la
// estructura EXACTA de v2 (object store operaciones_pendientes con índices
// "estado" y "creado_en" pero SIN el índice "usuario_id") sobre la MISMA
// factory que luego usará la app. Es crucial que esta preparación se haga
// ANTES de inyectar app.js: si la app abre primero, lo haría en v3 y no
// habría nada que migrar (montarEntornoConIdb garantiza ese orden).

function idbAbrirVersion(idb, nombre, version, onUpgrade) {
  return new Promise((resolve, reject) => {
    const req = idb.open(nombre, version);
    if (onUpgrade) req.onupgradeneeded = () => onUpgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPutOps(idb, nombre, store, registros) {
  return new Promise((resolve, reject) => {
    const req = idb.open(nombre, 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(store, "readwrite");
      for (const r of registros) tx.objectStore(store).put(r);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

// Crea la base en v2 con el object store operaciones_pendientes y los
// índices de v2 (estado, creado_en), SIN el índice usuario_id. Devuelve
// una función async lista para pasar a montarEntornoConIdb.
function prepararV2ConOps(ops) {
  const DB_NAME = "battlecruiser-cache";
  const OPS = "operaciones_pendientes";
  return async (idb) => {
    // (a)+(b) Estructura v2: store con índices estado y creado_en, sin usuario_id.
    const db = await idbAbrirVersion(idb, DB_NAME, 2, (d) => {
      if (!d.objectStoreNames.contains("lecturas")) d.createObjectStore("lecturas", { keyPath: "clave" });
      if (!d.objectStoreNames.contains(OPS)) {
        const store = d.createObjectStore(OPS, { keyPath: "id" });
        store.createIndex("estado", "estado", { unique: false });
        store.createIndex("creado_en", "creado_en", { unique: false });
        // Estructura v2: NO se crea el índice "usuario_id".
      }
    });
    db.close();
    // (c) Insertar operaciones directamente en la base v2.
    if (ops && ops.length) await idbPutOps(idb, DB_NAME, OPS, ops);
    // Verificación de la condición inicial (v2 sin usuario_id).
    const dbCheck = await idbAbrirVersion(idb, DB_NAME, 2);
    const storeCheck = dbCheck.transaction(OPS, "readonly").objectStore(OPS);
    assert.ok(!storeCheck.indexNames.contains("usuario_id"), "Pre-migración (v2): el índice usuario_id NO debe existir. Índices: " + Array.from(storeCheck.indexNames).join(", "));
    dbCheck.close();
  };
}

// Este test NO nace la base en v3. Prepara la estructura de IndexedDB v2
// (object store operaciones_pendientes con índices "estado" y "creado_en"
// pero SIN el índice "usuario_id"), inserta operaciones de dos usuarios, y
// luego monta la app sobre ESA MISMA base. Al abrir en v3, onupgradeneeded
// de la app migra v2 -> v3. Verifica que la migración crea el índice
// usuario_id sin borrar el store ni las operaciones, y que el aislamiento
// por usuario funciona tras migrar.
test("C3-MIG: migración IndexedDB v2 -> v3 crea índice usuario_id sin perder operaciones ni romper aislamiento", async () => {
  const opA = { id: "op-A-1", tipo: "venta", payload: {}, usuario_id: "usuario-A", creado_en: "2024-01-01T00:00:00.000Z", actualizado_en: "2024-01-01T00:00:00.000Z", estado: "PENDIENTE", intentos: 0, ultimo_intento: null, ultimo_error: null, idempotency_key: "k-A-1" };
  const opB = { id: "op-B-1", tipo: "compra", payload: {}, usuario_id: "usuario-B", creado_en: "2024-01-01T00:00:01.000Z", actualizado_en: "2024-01-01T00:00:01.000Z", estado: "PENDIENTE", intentos: 0, ultimo_intento: null, ultimo_error: null, idempotency_key: "k-B-1" };

  // montarEntornoConIdb prepara la base v2 (sin usuario_id) + inserta A y B
  // ANTES de inyectar app.js. Luego la app abre la misma base en v3 y
  // dispara onupgradeneeded (migración v2 -> v3).
  const { window } = await montarEntornoConIdb({ perfil: PERFIL, permisos: PERMISOS_TODOS }, prepararV2ConOps([opA, opB]));
  marcarOnline(window);
  await esperar(80);

  const OPS = "operaciones_pendientes";

  // (d)+(e) La migración ya ocurrió al abrir la app en v3. Inspeccionar.
  const dbMigrated = await window.idbAbrir();
  const storeInfo = await new Promise((resolve, reject) => {
    const tx = dbMigrated.transaction(OPS, "readonly");
    const store = tx.objectStore(OPS);
    const info = { storeExists: true, indexNames: Array.from(store.indexNames) };
    tx.oncomplete = () => resolve(info);
    tx.onerror = () => reject(tx.error);
  });

  // e1) el object store sigue existiendo (no se recreó ni borró).
  assert.ok(storeInfo.storeExists, "Tras migración: operaciones_pendientes sigue existiendo");

  // e2) el índice usuario_id fue creado durante la migración.
  assert.ok(storeInfo.indexNames.includes("usuario_id"), "Tras migración: el índice usuario_id debe existir. Índices presentes: " + storeInfo.indexNames.join(", "));
  // Los índices v2 originales también deben seguir existiendo.
  assert.ok(storeInfo.indexNames.includes("estado"), "Tras migración: el índice estado (v2) se conserva");
  assert.ok(storeInfo.indexNames.includes("creado_en"), "Tras migración: el índice creado_en (v2) se conserva");

  // e3) las operaciones originales siguen existiendo (no se borraron).
  const todasCrudas = await new Promise((resolve, reject) => {
    const tx = dbMigrated.transaction(OPS, "readonly");
    const req2 = tx.objectStore(OPS).getAll();
    req2.onsuccess = () => resolve(req2.result || []);
    req2.onerror = () => reject(req2.error);
  });
  assert.strictEqual(todasCrudas.length, 2, "Tras migración: las 2 operaciones originales (A y B) deben seguir existiendo");
  const idsCrudos = todasCrudas.map((o) => o.id).sort();
  assert.deepStrictEqual(idsCrudos, ["op-A-1", "op-B-1"], "Las operaciones originales conservan sus ids");

  // e4) Usuario A solamente puede obtener SUS operaciones (vía el índice
  // usuario_id creado en la migración).
  setUsuario(window, "usuario-A");
  const opsA = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsA.length, 1, "Usuario A solo debe ver 1 operación tras migración");
  assert.strictEqual(opsA[0].usuario_id, "usuario-A", "La operación visible para A es de usuario-A");
  assert.strictEqual(opsA[0].tipo, "venta", "La operación visible para A es la venta original");

  // e5) Usuario B solamente puede obtener SUS operaciones.
  setUsuario(window, "usuario-B");
  const opsB = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(opsB.length, 1, "Usuario B solo debe ver 1 operación tras migración");
  assert.strictEqual(opsB[0].usuario_id, "usuario-B", "La operación visible para B es de usuario-B");
  assert.strictEqual(opsB[0].tipo, "compra", "La operación visible para B es la compra original");
});

// C3-MIG2: idempotencia de la migración — re-abrir la misma base en v3
// (índice ya creado) no debe fallar ni duplicar/borrar nada.
test("C3-MIG2: re-abrir en v3 (índice usuario_id ya existe) es idempotente", async () => {
  const opA = { id: "op-A-2", tipo: "venta", payload: {}, usuario_id: "usuario-A", creado_en: "2024-01-02T00:00:00.000Z", estado: "PENDIENTE", intentos: 0, idempotency_key: "k-A-2" };

  const { window } = await montarEntornoConIdb({ perfil: PERFIL, permisos: PERMISOS_TODOS }, prepararV2ConOps([opA]));
  marcarOnline(window);
  await esperar(80);

  const OPS = "operaciones_pendientes";

  // Primera apertura en v3 (migración) ya ocurrió durante el init de la app.
  const db1 = await window.idbAbrir();
  const store1 = db1.transaction(OPS, "readonly").objectStore(OPS);
  assert.ok(store1.indexNames.contains("usuario_id"), "Tras migración: el índice usuario_id existe");

  // Forzar re-apertura en v3: el índice ya existe; no debe lanzar
  // ConstraintError ni duplicar/borrar nada.
  window._idbConexionReset();
  const db2 = await window.idbAbrir();
  assert.ok(db2, "Re-abrir en v3 con índice ya existente no debe fallar");
  const store2 = db2.transaction(OPS, "readonly").objectStore(OPS);
  assert.ok(store2.indexNames.contains("usuario_id"), "El índice usuario_id sigue presente tras re-abrir");

  setUsuario(window, "usuario-A");
  const ops = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(ops.length, 1, "La operación de A persiste tras re-abrir en v3");
  assert.strictEqual(ops[0].id, "op-A-2");
});
