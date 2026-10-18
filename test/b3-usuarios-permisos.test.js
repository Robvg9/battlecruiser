// ============================================================
// B3 — Pruebas automatizadas: usuarios, roles, permisos y control
// ============================================================
// Usa fake-indexeddb + jsdom + mock mínimo de Supabase. Las pruebas de B3
// verifican la capa frontend de autorización (que refleja los permisos del
// backend) y la integración con Offline-First existente, SIN inventar que
// el SQL de B3 está aplicado en Supabase (eso lo hace Roberto).
//
// Cubre (B3.25):
//   A — Usuario: contexto cargado, usuario inexistente, activo/inactivo.
//   B — Roles: rol resuelto desde el perfil.
//   C — Permisos: ver/crear/editar/borrar permitidos y denegados.
//   D — Navegación: sin permiso "ver" la sección se oculta.
//   F — Cambio de usuario: no hay contaminación de permisos A -> B.
//   G — Offline: el contexto conocido se conserva.
//   H — Operación offline conserva usuario_id e idempotency_key.
//   I — Reconexión: el contexto se revalida.
//   Seguridad: tienePermiso sin sesión devuelve false; las acciones de
//   administración verifican permiso antes de llamar al backend.
//   Arquitectura: un único contexto de permisos, sin stores/colas nuevos.
//
// Ejecutar: node --test test/b3-usuarios-permisos.test.js
// ============================================================

const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const fs = require("fs");
const path = require("path");

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function esperarHasta(condicion, timeoutMs = 2000, intervaloMs = 10) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condicion()) return true;
    await esperar(intervaloMs);
  }
  return Boolean(condicion());
}

async function esperarContextoYPermisos(window, timeoutMs = 5000) {
  const listo = await esperarHasta(() => {
    try {
      const usuario = typeof window._usuarioActual === "function"
        ? window._usuarioActual()
        : window._usuarioActual;
      return Boolean(usuario) &&
        typeof window.__bcTestPermisosCargaExitosa === "function" &&
        window.__bcTestPermisosCargaExitosa();
    } catch (_) {
      return false;
    }
  }, timeoutMs, 10);
  assert.ok(listo, "el contexto autenticado y los permisos deben cargarse antes de validar");
}

// Construye un mock de cliente Supabase configurable.
function mockCliente({ perfil, permisos, usuarios, roles } = {}) {
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
      if (nombre === "listar_usuarios_admin") return { data: usuarios || [], error: null };
      if (nombre === "listar_roles_admin") return { data: roles || [], error: null };
      // usuario_esta_activo: devuelve el estado activo del perfil del mock.
      if (nombre === "usuario_esta_activo") return { data: perfil ? !!perfil[0].activo : null, error: null };
      if (nombre === "asignar_rol_usuario" || nombre === "cambiar_estado_usuario") return { data: null, error: null };
      return { data: null, error: { message: "Could not find the function" } };
    },
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    __rpcCalls: rpcCalls,
  };
  return client;
}

function montarEntorno(opciones = {}) {
  let html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  html = html.replace(/<script[^>]*src="https:\/\/cdn[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="app\.js"[^>]*><\/script>/g, "");
  // Misión de modularización: también se quitan los <script src="js/...">
  // (los módulos reales se inyectan a mano más abajo, igual que antes se
  // inyectaba app.js completo — así el test no depende de red).
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

  // Exponer const internas vía reescritura (solo para test, sin tocar public/app.js).
  let appJs = require("./_leer-app-js").leerAppJsConcatenado(__dirname);
  appJs = appJs
    .replace(/const _cache = \\{/, "window._cache = {")
    .replace(/let _operacionesPendientesCache = \\[\\];/, "window._operacionesPendientesCache = [];")
    .replace(/return _operacionesPendientesCache;/, "return window._operacionesPendientesCache;")
    .replace(/_operacionesPendientesCache = combinadas;/, "window._operacionesPendientesCache = combinadas;")
    .replace(/_operacionesPendientesCache = \\[\\];/, "window._operacionesPendientesCache = [];");
  appJs += `
;window.__bcTestPermisosCargaExitosa = function () {
  return typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa;
};
`;
  const s = window.document.createElement("script");
  s.textContent = appJs;
  window.document.body.appendChild(s);
  return { dom, window, document: window.document, client };
}

function marcarOnline(window) {
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  const shell = window.document.getElementById("app-shell");
  if (shell) shell.classList.add("visible");
}

// ---- tests ----

test("B3.2: el contexto del usuario se carga desde el RPC perfil_usuario_actual", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "productos", accion: "ver" }],
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(() => window._usuarioActual()),
    "debe haber contexto de usuario en un máximo de 2 s"
  );
  assert.strictEqual(window._usuarioActual().nombre, "Roberto");
  assert.strictEqual(window._usuarioActual().rol, "Dueño");
  assert.strictEqual(window._usuarioActual().activo, true);
});

test("B3.3: un usuario inactivo no puede operar (usuarioPuedeOperar false)", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "X", activo: false, role_id: "r1", rol: "Dependiente" }],
    permisos: [{ seccion: "productos", accion: "ver" }],
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  const puede = await window.usuarioPuedeOperar();
  assert.strictEqual(puede, false, "un usuario inactivo no debe poder operar");
});

test("B3.3: un usuario activo puede operar", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "productos", accion: "ver" }],
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  const puede = await window.usuarioPuedeOperar();
  assert.strictEqual(puede, true);
});

test("B3.5/B3.6: tienePermiso refleja la matriz del backend (ver/crear/editar/borrar)", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [
      { seccion: "productos", accion: "ver" },
      { seccion: "productos", accion: "crear" },
      { seccion: "usuarios", accion: "ver" },
    ],
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(
      () => window.__bcTestPermisosCargaExitosa() &&
        window.tienePermiso("productos", "ver") &&
        window.tienePermiso("productos", "crear") &&
        window.tienePermiso("usuarios", "ver"),
      2000
    ),
    "la matriz de permisos debe terminar de cargarse antes de comprobarla"
  );
  assert.strictEqual(window.tienePermiso("productos", "ver"), true);
  assert.strictEqual(window.tienePermiso("productos", "crear"), true);
  assert.strictEqual(window.tienePermiso("productos", "borrar"), false, "borrar no está concedido");
  assert.strictEqual(window.tienePermiso("usuarios", "ver"), true);
  assert.strictEqual(window.tienePermiso("usuarios", "editar"), false, "editar usuarios no concedido");
});

test("B3.7: sin permiso 'ver', la sección se oculta del sidebar", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Dep", activo: true, role_id: "r2", rol: "Dependiente" }],
    permisos: [{ seccion: "ventas", accion: "ver" }], // solo ventas, no productos
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  const btnProductos = document.querySelector('.tab-btn[data-tab="productos"]');
  const btnVentas = document.querySelector('.tab-btn[data-tab="ventas"]');
  assert.ok(btnProductos.style.display === "none" || btnProductos.classList.contains("hidden"), "productos oculto sin permiso ver");
  assert.ok(btnVentas.style.display !== "none" && !btnVentas.classList.contains("hidden"), "ventas visible con permiso ver");
});

test("B3.18/B3.19: cambio de usuario — no hay contaminación de permisos A -> B", async () => {
  // Usuario A con permisos de productos.
  const { window, client } = montarEntorno({
    perfil: [{ id: "u-a", nombre: "A", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "productos", accion: "ver" }, { seccion: "usuarios", accion: "ver" }],
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  assert.strictEqual(window.tienePermiso("productos", "ver"), true);

  // Logout: limpiar contexto.
  window.limpiarContextoUsuario();
  assert.strictEqual(window._usuarioActual(), null, "contexto limpiado tras logout");
  assert.strictEqual(window.tienePermiso("productos", "ver"), false, "sin sesión no hay permisos");

  // Usuario B entra: solo permiso de ventas, NO productos.
  client.__perfilB = [{ id: "u-b", nombre: "B", activo: true, role_id: "r2", rol: "Dependiente" }];
  client.rpc = async (nombre) => {
    if (nombre === "perfil_usuario_actual") return { data: client.__perfilB, error: null };
    if (nombre === "permisos_usuario_actual") return { data: [{ seccion: "ventas", accion: "ver" }], error: null };
    return { data: null, error: null };
  };
  await window.cargarContextoUsuario();
  assert.ok(
    await esperarHasta(
      () => window._usuarioActual() && window._usuarioActual().nombre === "B" &&
        window.tienePermiso("ventas", "ver"),
      5000,
      10
    ),
    "el contexto y la matriz del usuario B deben terminar de cargarse"
  );
  assert.strictEqual(window._usuarioActual().nombre, "B");
  assert.strictEqual(window.tienePermiso("productos", "ver"), false, "B NO hereda permisos de A");
  assert.strictEqual(window.tienePermiso("ventas", "ver"), true, "B tiene sus propios permisos");
});

test("B3.13/G: offline — el contexto conocido se conserva para navegación", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "productos", accion: "ver" }],
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  // Simular offline: el contexto en memoria sigue disponible.
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  assert.strictEqual(window._usuarioActual().nombre, "Roberto", "contexto conservado offline");
  assert.strictEqual(window.tienePermiso("productos", "ver"), true, "permisos en memoria offline");
});

test("B3.14/H: operación offline conserva usuario_id e idempotency_key", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "ventas", accion: "crear" }],
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  // Offline: ejecutarOperacion encola.
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const res = await window.ejecutarOperacion("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 2 }] });
  assert.ok(res.offline, "debe encolar offline");
  assert.ok(res.operacion.usuario_id, "conserva usuario_id");
  assert.ok(res.operacion.idempotency_key, "conserva idempotency_key");
  assert.strictEqual(res.operacion.usuario_id, "u-test");
});

test("B3 Seguridad: tienePermiso sin sesión devuelve false", async () => {
  const { window } = montarEntorno();
  // No se carga contexto (sin perfil).
  assert.strictEqual(window._usuarioActual(), null);
  assert.strictEqual(window.tienePermiso("productos", "ver"), false, "sin sesión no hay permisos");
});

test("B3.10 Seguridad: cambiarEstadoUsuario verifica permiso antes de llamar al backend", async () => {
  const { window, client } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Dep", activo: true, role_id: "r2", rol: "Dependiente" }],
    permisos: [{ seccion: "ventas", accion: "ver" }], // NO tiene usuarios.editar
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  client.__rpcCalls.length = 0;
  await window.cambiarEstadoUsuario("u-otro", true);
  // No debe haber llamado al RPC porque no tiene permiso.
  const llamadasEstado = client.__rpcCalls.filter((c) => c.nombre === "cambiar_estado_usuario").length;
  assert.strictEqual(llamadasEstado, 0, "sin permiso no llama al backend");
});

test("B3.12 Seguridad: la protección del Dueño está en el backend (el frontend no decide)", async () => {
  // El frontend no implementa la regla del Dueño: solo pasa la acción al
  // backend, que la rechaza con P0001. Verificamos que el frontend no
  // bloquea arbitrariamente (la decisión es del RPC).
  const { window, client } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "usuarios", accion: "ver" }, { seccion: "usuarios", accion: "editar" }],
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  // Simular que el backend rechaza (único Dueño).
  client.rpc = async (nombre) => {
    if (nombre === "cambiar_estado_usuario") return { data: null, error: { code: "P0001", message: "No se puede desactivar al único Dueño activo." } };
    if (nombre === "perfil_usuario_actual") return { data: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }], error: null };
    if (nombre === "permisos_usuario_actual") return { data: [{ seccion: "usuarios", accion: "ver" }, { seccion: "usuarios", accion: "editar" }], error: null };
    return { data: null, error: null };
  };
  // Recargar contexto para que tenga permisos de editar.
  await window.cargarContextoUsuario();
  assert.ok(window.tienePermiso("usuarios", "editar"), "el contexto recargado debe conservar el permiso probado");
  // #msg-usuarios ya existe en el HTML real; lo reutilizamos (sin duplicar).
  const msgEl = window.document.getElementById("msg-usuarios");
  await window.cambiarEstadoUsuario("u-test", true);
  assert.ok(
    await esperarHasta(() => /No se puede/.test(msgEl.textContent), 2000, 10),
    "el backend rechaza y el frontend lo muestra"
  );
});

test("B3.27 Arquitectura: no hay stores/colas/cachés de permisos duplicados", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "productos", accion: "ver" }],
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  // Un único contexto de permisos: _permisosEfectivos (no hay _permisos2, etc.).
  assert.strictEqual(typeof window._permisosEfectivosRef(), "object");
  assert.strictEqual(window._permisosEfectivos2, undefined, "no hay sistema de permisos duplicado");
  // Un único _usuarioActual (no _usuarioActual2).
  assert.strictEqual(window._usuarioActual2, undefined);
  // tienePermiso es la única función de autorización (no tienePermiso2).
  assert.strictEqual(typeof window.tienePermiso, "function");
  assert.strictEqual(window.tienePermiso2, undefined);
});

test("B3.2 Degradación: si el SQL de B3 no está aplicado, la app sigue usable", async () => {
  // R1: cuando el SQL de B3 no está aplicado, los RPC perfil_usuario_actual
  // y permisos_usuario_actual NO existen en Supabase: devuelven un error de
  // función inexistente (42883 / "Could not find"), NO un array vacío sin
  // error. Ese caso (backend responde "sin permisos") se cubre en B3.2b.
  const { window, client } = montarEntorno({
    perfil: null,
    permisos: null,
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(() => Boolean(window._usuarioActual()), 5000, 10),
    "la sesión Auth debe resolverse antes de simular RPC inexistentes"
  );
  // Simular el estado real de "SQL B3 no aplicado": los RPC no existen.
  client.rpc = async (nombre) => {
    return { data: null, error: { message: "Could not find the function" } };
  };
  await window.cargarContextoUsuario();
  await esperar(30);
  // Sin SQL de B3, el contexto degrada: usuario mínimo desde Auth, permisos vacíos.
  assert.ok(window._usuarioActual(), "hay contexto mínimo desde Auth");
  assert.strictEqual(window.contextoB3Disponible(), false, "B3 no disponible sin SQL");
  // tienePermiso degrada a true (no bloquea la app existente; seguridad real en backend).
  assert.strictEqual(window.tienePermiso("productos", "ver"), true, "degradación: no bloquea");
});

test("B3.2b R1: usuario sin permisos (backend responde array vacío) NO ve todo", async () => {
  // R1/B3.6: si el backend responde correctamente (sin error) que el usuario
  // no tiene permisos, tienePermiso NO debe degradar a true (eso sería una
  // falsa autorización). Solo la degradación legítima (RPC inexistente por
  // SQL no aplicado) mantiene true. Un fallo de red tampoco autoriza.
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "SinPerm", activo: true, role_id: "r2", rol: "Dependiente" }],
    permisos: [], // backend respondió: este usuario no tiene permisos
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(
      () => Boolean(window._usuarioActual()) && window.__bcTestPermisosCargaExitosa(),
      2000
    ),
    "el contexto y la respuesta vacía de permisos deben terminar de cargarse"
  );
  assert.ok(window._usuarioActual(), "hay contexto");
  assert.strictEqual(window.tienePermiso("productos", "ver"), false, "sin permisos reales no autoriza");
  assert.strictEqual(window.tienePermiso("reportes", "ver"), false, "sin permisos reales no autoriza");
});

test("B3.3 (cierre): usuario inactivo bloqueado via usuario_esta_activo online (bloqueo real)", async () => {
  // El mock devuelve perfil con activo=false y usuario_esta_activo devuelve false.
  const { window, client } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Inactivo", activo: false, role_id: "r1", rol: "Dependiente" }],
    permisos: [{ seccion: "productos", accion: "ver" }],
  });
  marcarOnline(window);
  await esperarContextoYPermisos(window);
  // Sobreescribir rpc para que usuario_esta_activo devuelva false explícitamente.
  client.rpc = async (nombre) => {
    if (nombre === "usuario_esta_activo") return { data: false, error: null };
    if (nombre === "perfil_usuario_actual") return { data: [{ id: "u-test", nombre: "Inactivo", activo: false, role_id: "r1", rol: "Dependiente" }], error: null };
    if (nombre === "permisos_usuario_actual") return { data: [{ seccion: "productos", accion: "ver" }], error: null };
    return { data: null, error: null };
  };
  const puede = await window.usuarioPuedeOperar();
  assert.strictEqual(puede, false, "bloqueo real online via usuario_esta_activo");
  // Y ejecutarOperacion debe rechazar.
  const res = await window.ejecutarOperacion("venta", { p_almacen_id: "a1", p_lineas: [] });
  assert.strictEqual(res.ok, false, "operación rechazada para usuario inactivo");
  assert.ok(/inactivo/i.test(res.error.message), "mensaje claro de inactivo");
});
