// ============================================================
// B4 — Pruebas automatizadas: Dashboard único + Auditoría + Trazabilidad
// ============================================================
// Usa fake-indexeddb + jsdom + mock de Supabase. Verifica la capa frontend
// del Dashboard operativo y del panel de Auditoría, filtros y trazabilidad
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

async function esperarHasta(condicion, timeoutMs = 2000, intervaloMs = 10) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condicion()) return true;
    await esperar(intervaloMs);
  }
  return Boolean(condicion());
}

function mockCliente({ perfil, permisos, usuarios, roles, auditoria, alertas } = {}) {
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
      if (nombre === "listar_turnos") return { data: (alertas && alertas.turnos) || [], error: null };
      if (nombre === "listar_cuadres") return {
        data: params && params.p_estado === "CON_DIFERENCIA"
          ? ((alertas && alertas.cuadresDiferencia) || [])
          : ((alertas && alertas.cuadresPendientes) || []),
        error: null,
      };
      if (nombre === "listar_responsabilidades") return { data: (alertas && alertas.responsabilidades) || [], error: null };
      if (nombre === "listar_incidencias") return { data: (alertas && alertas.incidencias) || [], error: null };
      if (nombre === "listar_conversaciones_usuario") return { data: (alertas && alertas.conversaciones) || [], error: null };
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

  let appJs = require("./_leer-app-js").leerAppJsConcatenado(__dirname);
  appJs = appJs
    .replace(/const _cache = \{/, "window._cache = {")
    .replace(/let _operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];")
    .replace(/return _operacionesPendientesCache;/, "return window._operacionesPendientesCache;")
    .replace(/_operacionesPendientesCache = combinadas;/, "window._operacionesPendientesCache = combinadas;")
    .replace(/_operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];");
  appJs += `
;window.__bcTestSyncState = {
  get active() { return typeof _sincronizando !== "undefined" && _sincronizando; },
  markOnline() { if (typeof marcarConectividadReal === "function") marcarConectividadReal("online"); }
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

test("B4.0: un único Dashboard integra estado, jornada, comunicación e inventario; Auditoría queda separada", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [
      { seccion: "auditoria", accion: "ver" },
      { seccion: "turnos", accion: "ver" },
      { seccion: "comunicacion", accion: "ver" },
    ],
    alertas: {
      turnos: [{ id: "turno-1" }],
      cuadresPendientes: [{ id: "cuadre-1" }],
      cuadresDiferencia: [{ id: "cuadre-2" }],
      responsabilidades: [{ id: "responsabilidad-1" }],
      incidencias: [{ id: "incidencia-1" }],
      conversaciones: [
        { tipo: "SOPORTE", no_leidos: 1 },
        { tipo: "PRIVADA", no_leidos: 2 },
      ],
    },
  });
  marcarOnline(window);
  if (window.__bcTestSyncState) window.__bcTestSyncState.markOnline();
  await esperar(100);

  const btnDashboard = document.querySelector('.tab-btn[data-tab="resumen"]');
  const btnAuditoria = document.querySelector('.tab-btn[data-tab="mando"]');
  assert.match(btnDashboard.textContent, /Centro de Control/);
  assert.match(btnAuditoria.textContent, /Auditoría/);

  const dashboard = document.getElementById("tab-resumen");
  const auditPanel = document.getElementById("tab-mando");
  assert.ok(dashboard.querySelector("#cc-estado"), "dashboard retains the single operational status");
  assert.ok(dashboard.querySelector("#resumen-grid"), "dashboard retains the real KPI cards");
  assert.ok(dashboard.querySelector("#cc-atencion"), "dashboard retains queue items requiring attention");
  assert.ok(dashboard.querySelector("#cc-pendientes"), "dashboard retains pending operations");
  assert.ok(dashboard.querySelector("#resumen-alertas-lista"), "dashboard retains actionable low-stock items");
  assert.ok(dashboard.querySelector("#resumen-movs-lista"), "dashboard retains recent real business movements");
  assert.equal(auditPanel.querySelector("#mando-estado"), null, "audit panel does not duplicate the operational status");
  assert.equal(auditPanel.querySelector("#mando-alertas"), null, "audit panel does not duplicate alerts");
  assert.equal(auditPanel.querySelector("#mando-actividad"), null, "audit panel does not duplicate recent activity");
  assert.equal(auditPanel.querySelector("#mando-resumen-grid"), null, "audit panel does not duplicate KPI cards");
  assert.ok(auditPanel.querySelector("#mando-auditoria"), "audit panel preserves audit list");
  assert.ok(auditPanel.querySelector("#filtro-aud-tipo"), "audit type filter remains available");
  assert.ok(auditPanel.querySelector("#filtro-aud-estado"), "audit state filter remains available");

  const ahora = Date.now();
  window.obtenerOperacionesVisiblesPanel = async () => [
    { id: "op-old", tipo: "venta", estado: "PENDIENTE", creado_en: new Date(ahora - 48 * 60 * 60 * 1000).toISOString() },
    { id: "trf-pending", tipo: "transferencia", estado: "SINCRONIZANDO", creado_en: new Date(ahora - 5 * 60 * 1000).toISOString() },
  ];
  window.renderResumen();
  await window.refrescarCentroControl();
  const avisos = document.getElementById("cc-avisos-operativos");
  assert.ok(avisos.textContent.includes("Cuadre con diferencia"), "includes the unique cash-difference alert");
  assert.ok(avisos.textContent.includes("Incidencias abiertas"), "includes the unique incident alert");
  assert.ok(avisos.textContent.includes("Cuadres pendientes"), "includes pending cash reconciliations");
  assert.ok(avisos.textContent.includes("Responsabilidades pendientes"), "includes pending responsibility alerts");
  assert.ok(avisos.textContent.includes("Soporte pendiente"), "includes unread support conversations");
  assert.ok(avisos.textContent.includes("Pendientes prolongados"), "keeps the unique >24h warning from the former dashboard");
  assert.ok(avisos.textContent.includes("Transferencias pendientes"), "keeps the unique queued-transfer warning");
  assert.equal(avisos.querySelectorAll(".cc-aviso").length, 7, "shows each unique alert once");
  const destinations = [...avisos.querySelectorAll("button[data-ir-tab]")].map((button) => button.dataset.irTab);
  for (const tab of ["ciclos", "operacion", "turnos", "comunicacion"]) {
    assert.ok(destinations.includes(tab), "alert action leads to " + tab);
  }
});

test("B4.7: usuario sin permiso auditoria.ver no ve la pestaña Auditoría", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Dep", activo: true, role_id: "r2", rol: "Dependiente" }],
    permisos: [{ seccion: "ventas", accion: "ver" }], // sin auditoria.ver
  });
  marcarOnline(window);
  const btnMando = document.querySelector('.tab-btn[data-tab="mando"]');
  assert.ok(await esperarHasta(
    () => typeof window.tienePermiso === "function" &&
      window.tienePermiso("ventas", "ver") === true &&
      window.tienePermiso("auditoria", "ver") === false &&
      !!btnMando && (btnMando.style.display === "none" || btnMando.classList.contains("hidden")),
    5000,
    10
  ), "el contexto de permisos debe quedar listo y ocultar Auditoría sin auditoria.ver");
  assert.ok(btnMando.style.display === "none" || btnMando.classList.contains("hidden"), "Auditoría oculto sin permiso");
});

test("B4.7: usuario con permiso auditoria.ver ve la pestaña Auditoría", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  const btnMando = document.querySelector('.tab-btn[data-tab="mando"]');
  assert.ok(await esperarHasta(
    () => typeof window.tienePermiso === "function" &&
      window.tienePermiso("auditoria", "ver") === true &&
      !!btnMando && btnMando.style.display !== "none" && !btnMando.classList.contains("hidden"),
    5000,
    10
  ), "el contexto de permisos debe quedar listo y mostrar Auditoría con auditoria.ver");
  assert.ok(btnMando.style.display !== "none" && !btnMando.classList.contains("hidden"), "Auditoría visible con permiso");
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
  // El perfil y los permisos se cargan de forma asíncrona. Esperar 80 ms
  // provocaba una carrera: la operación se rechazaba correctamente si el
  // contexto aún no estaba listo, aunque el mock tuviera permiso para crear.
  assert.ok(
    await esperarHasta(
      () => typeof window.tienePermiso === "function" && window.tienePermiso("productos", "crear"),
      5000,
      10
    ),
    "el contexto debe cargar productos.crear antes de ejecutar la operación"
  );
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
  await window.refrescarPanelAuditoria();
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
  const permisoListo = await esperarHasta(
    () => window.tienePermiso("ventas", "crear") === true,
    5000,
    10
  );
  assert.ok(permisoListo, "el contexto y ventas.crear deben cargarse antes de ejecutar la venta");
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
  await window.refrescarPanelAuditoria();
  await esperar(20);
  const aud = document.getElementById("mando-auditoria");
  assert.ok(/Sin conexión|offline|no disponible/i.test(aud.innerHTML), "offline no debe inventar datos de auditoría");
});

test("B4.11: la reconexión actualiza la pestaña Auditoría", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  const conn = document.getElementById("mando-conn-info");
  assert.ok(
    await esperarHasta(() => Boolean(window._usuarioActual()), 2000),
    "el contexto inicial debe terminar de cargarse antes de probar la reconexión"
  );
  assert.ok(
    await esperarHasta(() => !window.__bcTestSyncState.active, 2000),
    "la sincronización de arranque debe finalizar antes de verificar el indicador de conexión"
  );
  window.__bcTestSyncState.markOnline();
  await window.refrescarPanelAuditoria();
  assert.ok(
    await esperarHasta(() => /Conectado/.test(conn.textContent), 2000, 10),
    "debe mostrar conectado tras refrescar; estado observado: " + conn.textContent
  );
});

test("B4.12/13/14/19: no hay refrescos duplicados ni sincronizadores paralelos", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  const contextoListo = await esperarHasta(
    () =>
      typeof window._usuarioActual === "function" &&
      Boolean(window._usuarioActual()) &&
      typeof window.tienePermiso === "function" &&
      window.tienePermiso("auditoria", "ver"),
    5000,
    10
  );
  assert.ok(contextoListo, "el contexto y permiso de auditoría deben estar listos antes de la prueba offline");
  assert.ok(
    await esperarHasta(() => !window.__bcTestSyncState.active, 2000, 10),
    "la sincronización inicial debe terminar antes de probar la cola offline"
  );
  // No existe refrescarPanelAuditoria2 ni _sincronizando2 (no duplicados).
  assert.strictEqual(typeof window.refrescarPanelAuditoria, "function");
  assert.strictEqual(window.refrescarPanelAuditoria2, undefined);
  assert.strictEqual(window._sincronizando2, undefined);
  // idempotency_key permanece intacta tras encolar offline.
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const res = await window.ejecutarOperacion("venta", { p_almacen_id: "a1", p_lineas: [] });
  assert.ok(res.offline, "encola offline");
  assert.ok(res.operacion.idempotency_key, "conserva idempotency_key");
});

test("B4.9: cambio A → B no contamina el contexto de Auditoría", async () => {
  const { window, client } = montarEntorno({
    perfil: [{ id: "u-a", nombre: "A", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
  });
  marcarOnline(window);
  const contextoAListo = await esperarHasta(
    () => typeof window._usuarioActual === "function" && window._usuarioActual() && window._usuarioActual().nombre === "A",
    5000,
    10
  );
  assert.ok(contextoAListo, "el contexto inicial del usuario A debe estar cargado antes de verificar aislamiento");
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
  const contextoBListo = await esperarHasta(
    () => typeof window._usuarioActual === "function" && window._usuarioActual() && window._usuarioActual().nombre === "B",
    5000,
    10
  );
  assert.ok(contextoBListo, "el contexto del usuario B debe cargar antes de comprobar que no hereda permisos");
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
  // El Auditoría reutiliza obtenerOperacionesVisiblesPanel (mismo store
  // operaciones_pendientes). No hay una segunda función de cola propia.
  assert.strictEqual(typeof window.refrescarPanelAuditoria, "function");
  assert.strictEqual(typeof window.obtenerOperacionesVisiblesPanel, "function");
  // No existe un store de auditoría en IndexedDB (la auditoría es en Supabase).
  assert.strictEqual(window._auditoriaStore, undefined, "no hay store IndexedDB de auditoría");
});

test("B4.5: respuesta no-array de listar_auditoria_admin no rompe la UI ni se presenta como lista vacía", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "auditoria", accion: "ver" }],
    auditoria: { message: "invalid rpc payload" },
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarPanelAuditoria();
  await esperar(20);
  const aud = document.getElementById("mando-auditoria");
  assert.match(aud.textContent, /respuesta inválida del servidor/i,
    "una respuesta no-array debe explicarse, no entrar en forEach ni fingir que no hay registros");
  assert.equal(aud.querySelectorAll(".cc-actividad-item").length, 0,
    "un payload inválido no puede renderizar filas inventadas");
  assert.doesNotMatch(aud.textContent, /Sin registros de auditoría/i,
    "payload inválido no equivale a una lista válida vacía");
});
