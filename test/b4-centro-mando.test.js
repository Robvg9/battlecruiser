// ============================================================
// B4 — Pruebas automatizadas: Centro de Mando + Auditoría + Trazabilidad
// ============================================================
// Usa fake-indexeddb + jsdom + mock de Supabase. Verifica la capa frontend
// del Centro de Mando, alertas reales, auditoría con filtros y la integración
// con B2/B3 (sin duplicar mecanismos).
//
// Ejecutar: node --test test/b4-centro-mando.test.js
// ============================================================

const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const fs = require("fs");
const path = require("path");

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

function mockCliente({ perfil, permisos, usuarios, roles, auditoria } = {}) {
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
      if (nombre === "usuario_esta_activo") return { data: perfil ? !!perfil[0].activo : null, error: null };
      if (nombre === "registrar_auditoria") return { data: 1, error: null };
      if (nombre === "listar_auditoria_admin") return { data: auditoria || [], error: null };
      if (nombre === "asignar_rol_usuario" || nombre === "cambiar_estado_usuario") return { data: null, error: null };
      // Fase 1 (fix data.id): crear_producto en producción devuelve UUID
      // escalar, NO un objeto {id: ...}. El mock replica ese contrato real.
      if (nombre === "crear_producto") return { data: "prod-uuid-999", error: null };
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
  html = html.replace(/<script[^>]*src="app\.js(?:\?[^"]*)?"[^>]*><\/script>/g, "");
  // Misión de modularización: también se quitan los <script src="js/...">
  // (los módulos reales se inyectan a mano más abajo, igual que antes se
  // inyectaba app.js completo — así el test no depende de red).
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

  let appJs = require("./_leer-app-js").leerAppJsConcatenado(__dirname);
  appJs = appJs
    .replace(/const _cache = \{/, "window._cache = {")
    .replace(/let _operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];")
    .replace(/return _operacionesPendientesCache;/, "return window._operacionesPendientesCache;")
    .replace(/_operacionesPendientesCache = combinadas;/, "window._operacionesPendientesCache = combinadas;")
    .replace(/_operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];");
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

test("B4.2/A: el Centro de Mando muestra estado general derivado de la cola real", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  // Crear una operación REQUIERE_ATENCION en la cola real.
  const op = window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [] });
  op.estado = "REQUIERE_ATENCION"; op.ultimo_error = "Stock insuficiente.";
  await window.guardarOperacionPendiente(op);
  await window.refrescarCentroMando();
  await esperar(20);
  const estado = document.getElementById("mando-estado");
  assert.ok(estado.className.includes("cc-estado-critico"), "estado crítico con REQUIERE_ATENCION");
});

test("B4.2/C: alertas aparecen con REQUIERE_ATENCION y desaparecen al resolver", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  const op = window.crearOperacionPendiente("venta", { p_almacen_id: "a1", p_lineas: [] });
  op.estado = "REQUIERE_ATENCION"; op.ultimo_error = "Stock insuficiente.";
  await window.guardarOperacionPendiente(op);
  await window.refrescarCentroMando();
  await esperar(20);
  const alertas = document.getElementById("mando-alertas");
  assert.ok(alertas.querySelector(".cc-asunto"), "debe aparecer la alerta crítica");
  assert.ok(alertas.innerHTML.includes("Stock insuficiente"), "debe mostrar el error");
  // Resolver: eliminar la operación.
  await window.eliminarOperacionPendiente(op.id);
  await window.refrescarCentroMando();
  await esperar(20);
  assert.ok(/Sin alertas/.test(alertas.innerHTML), "debe desaparecer la alerta tras resolver");
});

test("B4.2/B: actividad reciente se carga desde _cache (sin consultas nuevas)", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  // Poblar _cache.ventas como haría refrescarVentasHistorial.
  window._cache.ventas = [{ fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } }];
  window._cache.transferencias = [];
  window._cache.vales = [];
  // Esta prueba valida el render a partir de caché, no el refresco de datos.
  // Renderizar directamente evita una carrera con el refresco inicial de ventas,
  // que puede ejecutarse en paralelo en CI y reemplazar _cache.ventas por [].
  window.renderActividadMando();
  const act = document.getElementById("mando-actividad");
  assert.ok(act.innerHTML.includes("Venta"), "debe mostrar la venta de _cache");
  assert.ok(act.innerHTML.includes("$250.00"), "debe mostrar el total almacenado en caché");
});

test("B4.7: usuario sin permiso auditoria.ver no ve la pestaña Centro de Mando", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Dep", activo: true, role_id: "r2", rol: "Dependiente" }],
    permisos: [{ seccion: "ventas", accion: "ver" }], // sin auditoria.ver
  });
  marcarOnline(window);
  await esperar(80);
  const btnMando = document.querySelector('.tab-btn[data-tab="mando"]');
  assert.ok(btnMando.style.display === "none" || btnMando.classList.contains("hidden"), "Centro de Mando oculto sin permiso");
});

test("B4.7: usuario con permiso auditoria.ver ve la pestaña Centro de Mando", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  const btnMando = document.querySelector('.tab-btn[data-tab="mando"]');
  assert.ok(btnMando.style.display !== "none" && !btnMando.classList.contains("hidden"), "Centro de Mando visible con permiso");
});

test("R2 B4/B1: ejecutarOperacion registra el UUID real (no undefined) cuando el RPC devuelve UUID escalar", async () => {
  // Regresión del bug: registrarAuditoria usaba `data && data.id`, pero RPC
  // como crear_producto/registrar_venta/registrar_compra/registrar_transferencia/
  // registrar_vale_salida devuelven un UUID escalar en producción (data ES el
  // uuid), no un objeto con .id. Antes del fix, p_entidad_id llegaba vacío.
  const { window, client } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "productos", accion: "crear" }],
  });
  marcarOnline(window);
  await esperar(80);
  const r = await window.ejecutarOperacion("producto", { p_nombre: "Test", p_categoria_id: "c1" });
  assert.ok(r.ok, "operación debe resolverse ok");
  assert.strictEqual(r.data, "prod-uuid-999", "data debe ser el uuid escalar devuelto por el RPC");
  // Fase C (P5): el trigger auditar_mutacion_operativa() de Supabase audita
  // producto atómicamente, así que el frontend NO debe duplicar la auditoría.
  const llamadaAuditoria = client.__rpcCalls.find((c) => c.nombre === "registrar_auditoria");
  assert.ok(!llamadaAuditoria, "producto NO debe llamar registrar_auditoria (trigger lo cubre)");
});

test("B4.5: auditoría se carga con filtros y respeta permiso", async () => {
  const { window, document, client } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
    auditoria: [
      { id: 1, fecha: "2026-08-15T10:00:00Z", usuario_nombre: "Roberto", tipo: "venta", descripcion: "Venta ejecutada online.", estado: "exito", entidad_id: null, idempotency_key: "abc-123", payload_resumen: null },
    ],
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarCentroMando();
  await esperar(20);
  const aud = document.getElementById("mando-auditoria");
  assert.ok(aud.innerHTML.includes("Venta ejecutada online"), "debe mostrar el registro de auditoría");
  assert.ok(aud.innerHTML.includes("Roberto"), "debe mostrar el usuario");
  // Filtrar por tipo venta.
  const sel = document.getElementById("filtro-aud-tipo");
  sel.value = "venta";
  sel.dispatchEvent(new window.Event("change"));
  await esperar(20);
  const callFiltro = client.__rpcCalls.find((c) => c.nombre === "listar_auditoria_admin" && c.params.p_tipo === "venta");
  assert.ok(callFiltro, "el filtro debe pasar el tipo al RPC");
});

test("B4.4: trazabilidad — operación exitosa registra auditoría con idempotency_key", async () => {
  const { window, client } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "ventas", accion: "crear" }],
  });
  marcarOnline(window);
  await esperar(80);
  client.__rpcCalls.length = 0;
  // El mock debe devolver éxito para registrar_venta (el RPC real de venta).
  const rpcOrig = client.rpc;
  client.rpc = async (nombre, params) => {
    client.__rpcCalls.push({ nombre, params });
    if (nombre === "registrar_venta") return { data: { id: "v-1" }, error: null };
    if (nombre === "registrar_auditoria") return { data: 1, error: null };
    if (nombre === "perfil_usuario_actual") return { data: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }], error: null };
    if (nombre === "permisos_usuario_actual") return { data: [{ seccion: "ventas", accion: "crear" }], error: null };
    if (nombre === "usuario_esta_activo") return { data: true, error: null };
    return { data: null, error: null };
  };
  const res = await window.ejecutarOperacion("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }] });
  assert.strictEqual(res.ok, true, "operación exitosa online");
  await esperar(10);
  // Fase C (P5): venta está cubierta por el trigger auditar_mutacion_operativa(),
  // el frontend NO debe duplicar la auditoría.
  const audCall = client.__rpcCalls.find((c) => c.nombre === "registrar_auditoria");
  assert.ok(!audCall, "venta NO debe registrar auditoría (trigger lo cubre)");
});

test("B4.8: offline no inventa datos de auditoría", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  await window.refrescarCentroMando();
  await esperar(20);
  const aud = document.getElementById("mando-auditoria");
  assert.ok(/Sin conexión|offline|no disponible/i.test(aud.innerHTML), "offline no debe inventar datos de auditoría");
});

test("B4.11: reconexión refresca el Centro de Mando", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  const conn = document.getElementById("mando-conn-info");
  await window.refrescarCentroMando();
  await esperar(20);
  assert.ok(/Conectado/.test(conn.textContent), "debe mostrar conectado tras refrescar");
});

test("B4.12/13/14/19: no hay refrescos duplicados ni sincronizadores paralelos", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  // No existe refrescarCentroMando2 ni _sincronizando2 (no duplicados).
  assert.strictEqual(typeof window.refrescarCentroMando, "function");
  assert.strictEqual(window.refrescarCentroMando2, undefined);
  assert.strictEqual(window._sincronizando2, undefined);
  // idempotency_key permanece intacta tras encolar offline.
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const res = await window.ejecutarOperacion("venta", { p_almacen_id: "a1", p_lineas: [] });
  assert.ok(res.offline, "encola offline");
  assert.ok(res.operacion.idempotency_key, "conserva idempotency_key");
});

test("B4.9: cambio A → B no contamina el Centro de Mando", async () => {
  const { window, client } = montarEntorno({
    perfil: [{ id: "u-a", nombre: "A", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  assert.ok(window._usuarioActual().nombre === "A");
  // Logout: limpiar contexto.
  window.limpiarContextoUsuario();
  assert.strictEqual(window._usuarioActual(), null, "contexto limpiado");
  // Usuario B entra.
  client.rpc = async (nombre) => {
    if (nombre === "perfil_usuario_actual") return { data: [{ id: "u-b", nombre: "B", activo: true, role_id: "r2", rol: "Dependiente" }], error: null };
    if (nombre === "permisos_usuario_actual") return { data: [{ seccion: "ventas", accion: "ver" }], error: null };
    if (nombre === "usuario_esta_activo") return { data: true, error: null };
    if (nombre === "listar_auditoria_admin") return { data: [], error: null };
    return { data: null, error: null };
  };
  await window.cargarContextoUsuario();
  await esperar(20);
  assert.strictEqual(window._usuarioActual().nombre, "B", "B carga su contexto");
  assert.strictEqual(window.tienePermiso("auditoria", "ver"), false, "B NO hereda permisos de A");
});

test("B4.20: no se crean stores IndexedDB adicionales", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  // El Centro de Mando reutiliza obtenerOperacionesVisiblesPanel (mismo store
  // operaciones_pendientes). No hay una segunda función de cola propia.
  assert.strictEqual(typeof window.refrescarCentroMando, "function");
  assert.strictEqual(typeof window.obtenerOperacionesVisiblesPanel, "function");
  // No existe un store de auditoría en IndexedDB (la auditoría es en Supabase).
  assert.strictEqual(window._auditoriaStore, undefined, "no hay store IndexedDB de auditoría");
});
