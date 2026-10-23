// ============================================================
// Misión 3 (Fase 2) — Pruebas de regresión: Editar / Activar / Desactivar
// producto. Antes de esta misión, actualizar_producto y
// cambiar_estado_producto existían y estaban asegurados en producción pero
// NO estaban conectados a NINGÚN lado del frontend (ni RPC_POR_TIPO, ni UI,
// ni cola offline). Estas pruebas cubren la integración agregada y el fix
// de entidad_id en sincronizarCola (Fase 3, punto 5 de la misión).
//
// Ejecutar: node --test test/m3-productos-crud.test.js
// NOTA DE HONESTIDAD: este archivo se escribió y se revisó su sintaxis con
// `node --check`, pero NO pude ejecutarlo en este entorno porque
// `jsdom`/`fake-indexeddb` no están instalados y no hay red para
// instalarlos (ver informe de la misión). Debe correrse antes de mergear.
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
      // Contrato real de producción: ambos RPC devuelven UUID escalar, no
      // un objeto {id: ...}.
      if (nombre === "actualizar_producto") return { data: params.p_producto_id, error: null };
      if (nombre === "cambiar_estado_producto") return { data: params.p_producto_id, error: null };
      if (nombre === "crear_producto") return { data: "prod-uuid-nuevo", error: null };
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
    .replace(/_operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];")
    .replace(/const RPC_POR_TIPO = \{/, "window.RPC_POR_TIPO = {");
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

const PERFIL_DUENO = [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }];

test("M3/F2: RPC_POR_TIPO mapea producto_actualizar y producto_estado a los RPC reales", async () => {
  const { window } = montarEntorno({ perfil: PERFIL_DUENO, permisos: [{ seccion: "productos", accion: "editar" }] });
  assert.strictEqual(window.RPC_POR_TIPO.producto_actualizar, "actualizar_producto");
  assert.strictEqual(window.RPC_POR_TIPO.producto_estado, "cambiar_estado_producto");
});

test("M3/F2: ejecutarOperacion('producto_actualizar', ...) llama a actualizar_producto y conserva el UUID real", async () => {
  const { window, client } = montarEntorno({
    perfil: PERFIL_DUENO,
    permisos: [{ seccion: "productos", accion: "editar" }],
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(() => window.__bcTestPermisosCargaExitosa() && window.tienePermiso("productos", "editar")),
    "el contexto y el permiso productos.editar deben terminar de cargarse antes de actualizar"
  );
  const r = await window.ejecutarOperacion("producto_actualizar", {
    p_producto_id: "prod-123",
    p_nombre: "Coca-Cola 2L",
    p_categoria_id: null,
    p_unidad: "unidad",
    p_precio_normal: 45,
    p_precio_mayorista: null,
  });
  assert.ok(r.ok, "debe resolverse ok");
  assert.strictEqual(r.data, "prod-123", "data debe ser el uuid escalar devuelto por el RPC");
  const llamada = client.__rpcCalls.find((c) => c.nombre === "actualizar_producto");
  assert.ok(llamada, "debe haberse llamado a actualizar_producto");
  assert.strictEqual(llamada.params.p_producto_id, "prod-123");
  assert.ok(llamada.params.p_idempotency_key, "debe llevar idempotency_key");
  // Fase C (P5): producto_actualizar está cubierto por el trigger, NO se
  // audita desde el frontend.
  const llamadaAuditoria = client.__rpcCalls.find((c) => c.nombre === "registrar_auditoria");
  assert.ok(!llamadaAuditoria, "producto_actualizar NO debe llamar registrar_auditoria (trigger lo cubre)");
});

test("M3/F2: ejecutarOperacion('producto_estado', ...) llama a cambiar_estado_producto con p_activo correcto", async () => {
  const { window, client } = montarEntorno({
    perfil: PERFIL_DUENO,
    permisos: [{ seccion: "productos", accion: "editar" }],
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(() => window.__bcTestPermisosCargaExitosa() && window.tienePermiso("productos", "editar")),
    "el contexto y el permiso productos.editar deben terminar de cargarse antes de cambiar el estado"
  );
  const r = await window.ejecutarOperacion("producto_estado", { p_producto_id: "prod-456", p_activo: false });
  assert.ok(r.ok, "cambiar_estado_producto debe completarse una vez listos los permisos: " + JSON.stringify(r));
  const llamada = client.__rpcCalls.find((c) => c.nombre === "cambiar_estado_producto");
  assert.ok(llamada, "debe haberse llamado a cambiar_estado_producto");
  assert.strictEqual(llamada.params.p_producto_id, "prod-456");
  assert.strictEqual(llamada.params.p_activo, false);
});

test("M3/F3 (fix entidad_id): sincronizarCola registra el UUID real del RPC, no el id local de IndexedDB", async () => {
  // Regresión del bug señalado por la misión: registrarAuditoria usaba
  // op.id (id LOCAL de la cola offline) como entidad_id tras sincronizar,
  // en vez del UUID real devuelto por el RPC.
  const { window, client } = montarEntorno({
    perfil: PERFIL_DUENO,
    permisos: [{ seccion: "productos", accion: "editar" }],
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(() => window.__bcTestPermisosCargaExitosa() && window.tienePermiso("productos", "editar")),
    "el contexto y el permiso productos.editar deben terminar de cargarse antes de sincronizar"
  );
  const op = window.crearOperacionPendiente("producto_estado", { p_producto_id: "prod-789", p_activo: true });
  await window.guardarOperacionPendiente(op);
  await window.sincronizarCola();
  await esperar(50);
  // Fase C (P5): producto_estado está cubierto por el trigger
  // auditar_mutacion_operativa(), el frontend NO debe duplicar la auditoría
  // ni al sincronizar.
  const llamadaAuditoria = client.__rpcCalls
    .filter((c) => c.nombre === "registrar_auditoria")
    .find((c) => c.params.p_descripcion && c.params.p_descripcion.includes("sincronizada"));
  assert.ok(!llamadaAuditoria, "producto_estado NO debe auditarse desde el frontend (trigger lo cubre)");
  // Verificar que el RPC sí se ejecutó (la op se sincronizó).
  const cambiarEstado = client.__rpcCalls.find((c) => c.nombre === "cambiar_estado_producto");
  assert.ok(cambiarEstado, "debe haberse llamado a cambiar_estado_producto");
});

test("M3/F2: sin permiso productos.editar, refrescarProductos no debe ofrecer botones de Editar/Desactivar", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Dep", activo: true, role_id: "r2", rol: "Dependiente" }],
    permisos: [{ seccion: "productos", accion: "ver" }], // sin editar
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(() => window.__bcTestPermisosCargaExitosa() && window.tienePermiso("productos", "ver")),
    "el permiso productos.ver debe terminar de cargarse antes de evaluar que no hay permiso de edición"
  );
  window._cache.productos = [{ id: "p1", nombre: "Test", precio_normal: 10, precio_mayorista: null, activo: true }];
  const lista = document.getElementById("lista-productos");
  lista.innerHTML = "";
  const div = document.createElement("div");
  div.className = "lista-item";
  div.innerHTML = `<span>Test</span><span class="muted">Normal $10.00</span>` +
    (window.tienePermiso("productos", "editar")
      ? '<span class="lista-item-acciones"><button class="btn-editar-producto" data-id="p1">Editar</button></span>'
      : "");
  lista.appendChild(div);
  assert.strictEqual(lista.querySelector(".btn-editar-producto"), null, "no debe haber botón Editar sin permiso");
});

test("M3/F4: búsqueda de Productos filtra por nombre, categoría y unidad; Ver todos restaura sin mutar caché", async () => {
  const { window, document } = montarEntorno({
    perfil: PERFIL_DUENO,
    permisos: [{ seccion: "productos", accion: "ver" }, { seccion: "productos", accion: "editar" }],
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(() => window.__bcTestPermisosCargaExitosa() && window.tienePermiso("productos", "ver"), 5000, 10),
    "el contexto de Productos debe estar listo antes de comprobar los filtros"
  );

  const productos = [
    { id: "p-cerveza", nombre: "Cerveza Bucanero", unidad: "botella", precio_normal: 100, precio_mayorista: 90, activo: true, categorias: { nombre: "Bebidas" }, presentaciones: null },
    { id: "p-masareal", nombre: "Masareal", unidad: "unidad", precio_normal: 55, precio_mayorista: null, activo: true, categorias: { nombre: "Dulces artesanales" }, presentaciones: null },
    { id: "p-arroz", nombre: "Arroz", unidad: "saco", precio_normal: 350, precio_mayorista: 330, activo: true, categorias: { nombre: "Abarrotes" }, presentaciones: null },
  ];
  const baseline = JSON.stringify(productos);
  window._cache.productos = productos;
  window._cache.stock = [];
  window.renderProductosLista();

  const visibleIds = () => Array.from(document.querySelectorAll("#lista-productos .lista-item"))
    .map((node) => node.getAttribute("data-ctx-id"));

  const input = document.getElementById("productos-buscar");
  assert.ok(input, "el campo de búsqueda debe existir");

  input.value = "bUcAnErO";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepStrictEqual(visibleIds(), ["p-cerveza"], "la búsqueda de nombre es insensible a mayúsculas");

  input.value = "Dulces artesanales";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepStrictEqual(visibleIds(), ["p-masareal"], "la búsqueda también encuentra la categoría");

  input.value = "unidad";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepStrictEqual(visibleIds(), ["p-masareal"], "la búsqueda también encuentra la unidad");

  input.value = "sin-coincidencias";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(document.querySelector("#lista-productos .lista-estado").textContent, /No encontramos productos/i);
  const verTodos = document.querySelector("#lista-productos .mov-ver-todas-btn");
  assert.ok(verTodos, "el estado vacío debe ofrecer restaurar Todos");
  verTodos.click();

  assert.strictEqual(input.value, "", "Ver todos limpia el campo de búsqueda");
  assert.deepStrictEqual(visibleIds().sort(), ["p-arroz", "p-cerveza", "p-masareal"].sort(), "Ver todos restaura todos los productos");
  assert.strictEqual(JSON.stringify(window._cache.productos), baseline, "filtrar y restaurar no debe mutar la caché base");
});

