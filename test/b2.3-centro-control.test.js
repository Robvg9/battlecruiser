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
  // Misión de modularización: también se quitan los <script src="js/...">
  // (los módulos reales se inyectan a mano más abajo, igual que antes se
  // inyectaba app.js completo — así el test no depende de red).
  html = html.replace(/<script[^>]*src="js\/[^"]*\.js"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.test/" });
  const { window } = dom;

  // Globals que app.js espera.
  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.crypto = window.crypto || global.crypto;
  // jsdom no trae indexedDB; inyectamos fake-indexeddb en window.
  // fake-indexeddb: una instancia fresca por entorno (simula IndexedDB real).
  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window, "caches", { value: { keys: async () => [], delete: async () => true }, configurable: true });
  Object.defineProperty(window, "serviceWorker", { value: { getRegistrations: async () => [], register: async () => ({ unregister: async () => true }) }, configurable: true });

  // Mock mínimo del cliente Supabase. Las pruebas de B2.3 no tocan el
  // backend real: la cola y el Centro de Control son offline-first.
  const rpcCalls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u-test", email: "test@app.test" } } } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: {} }, error: null }),
    },
    rpc: async (nombre, params) => {
      rpcCalls.push({ nombre, params });
      // Por defecto éxito. Las pruebas pueden overridear client.__setRpcResult.
      return client.__rpcResult;
    },
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    __rpcCalls: rpcCalls,
    __rpcResult: { data: "ok", error: null },
  };
  window.supabase = { createClient: () => client };

  // Cargar app.js en el contexto del window. Exponemos algunas constantes
  // internas top-level (const/let) reescribiendo esas declaraciones a
  // asignaciones window.X, SOLO para el test (no se toca public/app.js).
  // Esto permite verificar proyección/actividad/novedades sin duplicar
  // la lógica ni crear una segunda fuente.
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

test("B2.3-A: estado 'Operativo' cuando la cola está vacía y hay conexión", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const estado = window.calcularEstadoOperacional([], false);
  assert.strictEqual(estado.nivel, "normal");
  assert.strictEqual(estado.texto, "Operativo");
});

test("B2.3-A: estado 'Requiere atención' cuando hay REQUIERE_ATENCION (nunca verde)", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  const ops = [{ id: "1", estado: "REQUIERE_ATENCION", creado_en: new Date().toISOString(), tipo: "venta", payload: {} }];
  const estado = window.calcularEstadoOperacional(ops, false);
  assert.strictEqual(estado.nivel, "critico");
  assert.strictEqual(estado.texto, "Requiere atención");
});

test("B2.3-A: estado 'atencion' (no normal) cuando hay pendientes", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  const ops = [{ id: "1", estado: "PENDIENTE", creado_en: new Date().toISOString(), tipo: "venta", payload: {} }];
  const estado = window.calcularEstadoOperacional(ops, false);
  assert.strictEqual(estado.nivel, "atencion");
  assert.notStrictEqual(estado.nivel, "normal");
});

test("B2.3-A: conectividad y sincronización son estados distintos (offline + pendientes)", async () => {
  const { window } = montarEntorno();
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const ops = [{ id: "1", estado: "PENDIENTE", creado_en: new Date().toISOString(), tipo: "venta", payload: {} }];
  const estado = window.calcularEstadoOperacional(ops, false);
  // offline PERO con pendientes: no es normal, es atencion.
  assert.strictEqual(estado.nivel, "atencion");
  assert.ok(/Pendientes/.test(estado.texto));
});

test("B2.3-A: sincronizando refleja estado atencion, no normal", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  const estado = window.calcularEstadoOperacional([], true);
  assert.strictEqual(estado.nivel, "atencion");
  assert.strictEqual(estado.texto, "Sincronizando…");
});

test("B2.3-B: el Centro de Atención aparece con REQUIERE_ATENCION y desaparece al resolver", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);

  // Crear una operación en REQUIERE_ATENCION en la cola real.
  await crearOp(window, "venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 2 }] }, "REQUIERE_ATENCION", { ultimo_error: "Stock insuficiente." });
  await window.refrescarCentroControl();
  await esperar(10);

  const atencion = document.getElementById("cc-atencion");
  assert.ok(atencion.innerHTML.includes("Requiere atención") || atencion.querySelector(".cc-asunto"), "debe aparecer el asunto crítico");
  assert.ok(atencion.innerHTML.includes("Stock insuficiente."), "debe mostrar el motivo");

  // Resolver: eliminar la operación (reutiliza eliminarOperacionPendiente).
  const item = atencion.querySelector(".cc-asunto");
  const id = item.dataset.id;
  await window.eliminarOperacionPendiente(id);
  await window.refrescarCentroControl();
  await esperar(10);
  assert.ok(/Nada requiere atención/.test(atencion.innerHTML), "debe desaparecer tras resolver");
});

test("B2.3-C: acción Reintentar reutiliza el flujo existente y conserva idempotency_key", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);

  const op = await crearOp(window, "venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 2 }] }, "REQUIERE_ATENCION", { ultimo_error: "Stock insuficiente." });
  const claveAntes = op.idempotency_key;
  await window.refrescarCentroControl();
  await esperar(10);

  // El RPC devuelve éxito ahora.
  client.__rpcResult = { data: "ok", error: null };

  await window.reintentarOperacionPendiente(op.id, null);
  await esperar(20);

  // Verificar que el RPC recibió la MISMA idempotency_key (literal).
  const call = client.__rpcCalls.find((c) => c.params && c.params.p_idempotency_key);
  assert.ok(call, "debe haber llamado al RPC");
  assert.strictEqual(call.params.p_idempotency_key, claveAntes, "idempotency_key conservada literal");
});

test("B2.3-C: acción Eliminar quita la operación de la cola", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);

  const op = await crearOp(window, "venta", { p_almacen_id: "a1", p_lineas: [] }, "REQUIERE_ATENCION", { ultimo_error: "x" });
  await window.refrescarCentroControl();
  await esperar(10);

  // Simular confirm.
  const confirmOrig = window.confirm;
  window.confirm = () => true;
  try {
    await window.eliminarOperacionPendienteConfirmada(op.id, null);
    await esperar(10);
    const existe = await window.obtenerOperacionPendiente(op.id);
    assert.strictEqual(existe, null, "la operación debe eliminarse");
  } finally {
    window.confirm = confirmOrig;
  }
});

test("B2.3-D: el detalle muestra idempotency_key, tipo, estado, fecha e intentos", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);

  const op = await crearOp(window, "compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 5, p_costo_unitario: 10 }, "REQUIERE_ATENCION", { ultimo_error: "sin permiso", intentos: 3 });
  const cont = document.getElementById("pendiente-detalle");
  cont.classList.remove("hidden");
  window.mostrarDetalleOperacion(op);
  await esperar(5);

  const html = cont.innerHTML;
  assert.ok(/Compra/.test(html), "debe mostrar el tipo");
  assert.ok(/Requiere atención/.test(html), "debe mostrar el estado");
  assert.ok(/idempotency_key/.test(html), "debe mostrar idempotency_key");
  assert.ok(/Intentos/.test(html) && html.includes("3"), "debe mostrar intentos");
  assert.ok(/Motivo de atención/.test(html), "debe mostrar el motivo");
});

test("B2.3-C: acciones bloqueadas para SINCRONIZANDO (no reintento paralelo)", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);

  const op = await crearOp(window, "venta", { p_almacen_id: "a1", p_lineas: [] }, "SINCRONIZANDO");
  // reintentarOperacionPendiente debe rechazar si no está en REQUIERE_ATENCION.
  // El #msg-pendientes ya existe en el HTML real (index.html), lo reutilizamos.
  const msgEl = window.document.getElementById("msg-pendientes");
  await window.reintentarOperacionPendiente(op.id, null);
  await esperar(10);
  assert.ok(/no requiere reintento/.test(msgEl.textContent), "debe bloquear reintento en SINCRONIZANDO");
});

test("B2.3: doble sincronización simultánea → 1 sola ejecución real (mutex _sincronizando)", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);

  const op = await crearOp(window, "venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }] }, "PENDIENTE");
  client.__rpcResult = { data: "ok", error: null };
  client.__rpcCalls.length = 0;

  // Lanzar 3 sincronizaciones en paralelo: el mutex debe dejar 1 sola.
  await Promise.all([
    window.sincronizarCola(),
    window.sincronizarCola(),
    window.sincronizarCola(),
  ]);
  await esperar(20);

  const ejecuciones = client.__rpcCalls.filter((c) => c.nombre === "registrar_venta").length;
  assert.strictEqual(ejecuciones, 1, "solo 1 ejecución real pese a 3 llamadas simultáneas");
});

test("B2.3: persistencia — el Centro se reconstruye desde la cola tras recarga", async () => {
  const { window: w1, document: d1 } = montarEntorno();
  marcarOnline(w1);
  await esperar(30);
  await crearOp(w1, "venta", { p_almacen_id: "a1", p_lineas: [] }, "REQUIERE_ATENCION", { ultimo_error: "fallo" });
  await w1.refrescarCentroControl();
  await esperar(10);
  assert.ok(d1.getElementById("cc-atencion").innerHTML.includes("Requiere atención") || d1.getElementById("cc-atencion").querySelector(".cc-asunto"));

  // Simular recarga: leer la MISMA cola (IndexedDB persiste en un navegador
  // real; acá re-consultamos con el mismo entorno para reconstruir).
  await w1.refrescarOperacionesPendientesCache();
  await w1.refrescarCentroControl();
  await esperar(10);
  assert.ok(d1.getElementById("cc-atencion").querySelector(".cc-asunto"), "el Centro reconstruye la cola tras recarga");
  // Verificar que la operación sigue en la cola (persistencia real de IDB).
  const visibles = await w1.obtenerOperacionesVisiblesPanel();
  assert.ok(visibles.some((o) => o.estado === "REQUIERE_ATENCION"), "la operación persiste en IndexedDB tras recarga");
});

test("B2.3-K: proyección de stock reutiliza ajustePendiente (no recalcula)", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.stock = [{ producto_id: "p1", almacen_id: "a1", cantidad: 100, minimo: 10, productos: { nombre: "Prod" }, almacenes: { nombre: "Alm" } }];
  // _operacionesPendientesCache la llena refrescarOperacionesPendientesCache;
  // inyectamos una venta pendiente directamente en la cache de proyección.
  window._operacionesPendientesCache = [{ tipo: "venta", creado_en: new Date().toISOString(), payload: { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 20 }] } }];
  const proj = window.proyeccionStock("p1", "a1", 100);
  assert.strictEqual(proj.stockReal, 100);
  assert.strictEqual(proj.ajuste, -20);
  assert.strictEqual(proj.proyeccion, 80);
});

test("B2.3-L: actividad reciente reutiliza _cache (sin consultas nuevas)", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [{ fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } }];
  window._cache.transferencias = [];
  window._cache.vales = [];
  const movs = window.construirActividadReciente();
  assert.strictEqual(movs.length, 1);
  assert.ok(/Venta/.test(movs[0].texto));
  assert.strictEqual(movs[0].resultado, "$250.00");
});

test("B2.3-M: no hay roles reales — la vista no inventa distinción admin/trabajador", async () => {
  const { window } = montarEntorno();
  // El proyecto no expone user_metadata.role ni RPC de roles: el Centro de
  // Control no debe referenciar un rol inexistente. Verificamos que las
  // funciones del Centro no dependen de ningún campo de rol.
  assert.strictEqual(typeof window.calcularEstadoOperacional, "function");
  assert.strictEqual(typeof window.refrescarCentroControl, "function");
  // No existe _esAdmin ni _rolActual (no se inventaron permisos paralelos).
  assert.strictEqual(window._esAdmin, undefined);
  assert.strictEqual(window._rolActual, undefined);
});

test("B2.3-G: 'visto' quita el realce pero no borra el dato (visto ≠ resuelto)", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const op = await crearOp(window, "venta", { p_almacen_id: "a1", p_lineas: [] }, "REQUIERE_ATENCION", { ultimo_error: "x" });
  await window.refrescarCentroControl();
  await esperar(10);
  // Tras render, el asunto está marcado visto pero la operación sigue en la cola.
  assert.ok(window._novedadesVistas.has(op.id), "marcado visto");
  const existe = await window.obtenerOperacionPendiente(op.id);
  assert.ok(existe, "la operación no se borró (visto ≠ resuelto)");
});


// ============================================================
// R2 — Centro de Control refleja la actividad comercial (ventas)
// ============================================================

test("R2: el Centro de Control muestra el monto de ventas recientes en el grid", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [
    { fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } },
    { fecha: "2026-08-15T11:00:00Z", total: 150, almacenes: { nombre: "Caja 1" } },
  ];
  window.renderResumen();
  const grid = document.getElementById("resumen-grid");
  assert.ok(/Ventas recientes/.test(grid.innerHTML), "card de Ventas recientes presente");
  assert.ok(grid.innerHTML.includes("$400.00"), "monto total de ventas (250+150)");
  assert.ok(/2 venta\(s\)/.test(grid.innerHTML), "cantidad de ventas");
});

test("R2: sin ventas, el card muestra $0.00 y 0 venta(s)", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [];
  window.renderResumen();
  const grid = document.getElementById("resumen-grid");
  assert.ok(/Ventas recientes/.test(grid.innerHTML), "card presente");
  assert.ok(grid.innerHTML.includes("$0.00"), "monto 0 cuando no hay ventas");
  assert.ok(/0 venta\(s\)/.test(grid.innerHTML), "0 ventas");
});

test("R2: las ventas aparecen en Últimos movimientos del Centro de Control", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [{ fecha: "2026-08-15T10:00:00Z", total: 300, almacenes: { nombre: "Caja 1" } }];
  window._cache.transferencias = [];
  window._cache.vales = [];
  window.renderResumen();
  const movs = document.getElementById("resumen-movs-lista");
  assert.ok(/Venta/.test(movs.innerHTML), "la lista de movimientos incluye la venta");
  assert.ok(movs.innerHTML.includes("Caja 1"), "muestra el almacén de la venta");
  assert.ok(movs.innerHTML.includes("$300.00"), "muestra el monto de la venta");
});

test("R2: ventas, transferencias y vales coexisten ordenados por fecha", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [{ fecha: "2026-08-15T12:00:00Z", total: 100, almacenes: { nombre: "Caja 1" } }];
  window._cache.transferencias = [{ fecha: "2026-08-15T10:00:00Z", origen: { nombre: "A" }, destino: { nombre: "B" }, estado: "completada" }];
  window._cache.vales = [];
  window.renderResumen();
  const movs = document.getElementById("resumen-movs-lista");
  const ventaIdx = movs.innerHTML.indexOf("Venta:");
  const trfIdx = movs.innerHTML.indexOf("Transferencia:");
  assert.ok(ventaIdx !== -1 && trfIdx !== -1, "ambos tipos presentes");
  assert.ok(ventaIdx < trfIdx, "venta más reciente aparece primero");
});


// ============================================================
// R3 — Alertas accionables del Centro de Control (stock bajo mínimo)
// ============================================================

test("R3: la cabecera de alertas muestra la cantidad de productos bajo mínimo", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.stock = [
    { productos: { nombre: "Tornillos" }, almacenes: { nombre: "Depósito" }, cantidad: 2, minimo: 10 },
    { productos: { nombre: "Clavos" }, almacenes: { nombre: "Local" }, cantidad: 0, minimo: 5 },
  ];
  window.renderResumen();
  const alertas = document.getElementById("resumen-alertas-lista");
  assert.ok(/2 producto\(s\) bajo mínimo/.test(alertas.innerHTML), "cabecera con cantidad afectada");
  assert.ok(/Ver inventario/.test(alertas.innerHTML), "botón Ver inventario presente");
});

test("R3: el botón 'Ver inventario' navega al tab inventario", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.stock = [{ productos: { nombre: "Tornillos" }, almacenes: { nombre: "Depósito" }, cantidad: 2, minimo: 10 }];
  window.renderResumen();
  const btn = document.querySelector('#resumen-alertas-lista .alerta-ir-btn');
  assert.ok(btn, "botón Ver inventario existe");
  btn.click();
  const inventarioTab = document.querySelector('.tab-btn[data-tab="inventario"]');
  assert.ok(inventarioTab.classList.contains("active"), "el tab inventario quedó activo");
});

test("R3: cada ítem de stock bajo es accionable (data-ir-tab + role button)", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.stock = [{ productos: { nombre: "Tornillos" }, almacenes: { nombre: "Depósito" }, cantidad: 2, minimo: 10 }];
  window.renderResumen();
  const item = document.querySelector('#resumen-alertas-lista .alerta-item');
  assert.ok(item, "ítem de alerta accionable existe");
  assert.strictEqual(item.getAttribute("data-ir-tab"), "inventario");
  assert.strictEqual(item.getAttribute("role"), "button");
  assert.strictEqual(item.getAttribute("tabindex"), "0");
});

test("R3: el card 'Bajo mínimo' del grid es accionable solo cuando hay alertas", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.stock = [{ productos: { nombre: "Tornillos" }, almacenes: { nombre: "Depósito" }, cantidad: 2, minimo: 10 }];
  window.renderResumen();
  const grid = document.getElementById("resumen-grid");
  const cardAccion = grid.querySelector(".resumen-card-accion[data-ir-tab='inventario']");
  assert.ok(cardAccion, "card accionable cuando hay alertas");
  window._cache.stock = [];
  window.renderResumen();
  const grid2 = document.getElementById("resumen-grid");
  assert.ok(!grid2.querySelector(".resumen-card-accion"), "sin card accionable cuando no hay alertas");
});

test("R3: el helper irATab es idempotente (tab inexistente no lanza)", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  assert.doesNotThrow(() => window.irATab("no-existe"));
  assert.doesNotThrow(() => window.irATab(undefined));
});

test("R3: estado vacío sin falsas alertas", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.stock = [];
  window.renderResumen();
  const alertas = document.getElementById("resumen-alertas-lista");
  assert.ok(/Nada bajo el mínimo por ahora/.test(alertas.innerHTML), "estado vacío sin botón de acción");
  assert.ok(!/Ver inventario/.test(alertas.innerHTML), "sin botón cuando no hay alertas");
});


// ============================================================
// R5 — Historial de ventas accionable (buscador + ID + contador)
// ============================================================

test("R5: muestra todas las ventas con ID corto visible", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [
    { id: "a1b2c3d4-0001-0000-0000-000000000001", fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } },
    { id: "a1b2c3d4-0002-0000-0000-000000000002", fecha: "2026-08-15T11:00:00Z", total: 150, almacenes: { nombre: "Caja 1" } },
  ];
  window.renderVentasHistorial();
  const lista = document.getElementById("lista-ventas");
  assert.ok(/a1b2/.test(lista.innerHTML), "ID corto visible");
  assert.ok(lista.querySelectorAll(".lista-item").length === 2, "ambas ventas listadas");
  assert.ok(/2 elementos/.test(document.getElementById("ventas-contador").textContent), "contador total");
});

test("R5: buscar por ID corto encuentra la venta", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [
    { id: "a1b2c3d4-0001-0000-0000-000000000001", fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } },
    { id: "a1b2c3d4-0002-0000-0000-000000000002", fecha: "2026-08-15T11:00:00Z", total: 150, almacenes: { nombre: "Caja 2" } },
  ];
  window._ventasBusqueda = "0001";
  window.renderVentasHistorial();
  const lista = document.getElementById("lista-ventas");
  assert.ok(lista.querySelectorAll(".lista-item").length === 1, "una venta coincide");
  assert.ok(/Mostrando 1 de 2/.test(document.getElementById("ventas-contador").textContent), "contador diferenciado");
});

test("R5: estado sin resultados + botón Ver todas", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [
    { id: "a1b2c3d4-0001-0000-0000-000000000001", fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } },
  ];
  window._ventasBusqueda = "zzz";
  window.renderVentasHistorial();
  const lista = document.getElementById("lista-ventas");
  assert.ok(/No encontramos/.test(lista.innerHTML), "estado sin resultados");
  assert.ok(lista.querySelector(".mov-ver-todas-btn"), "botón Ver todas presente");
});

test("R5: _cache.ventas no se modifica al buscar/filtrar", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [
    { id: "a1b2c3d4-0001-0000-0000-000000000001", fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } },
    { id: "a1b2c3d4-0002-0000-0000-000000000002", fecha: "2026-08-15T11:00:00Z", total: 150, almacenes: { nombre: "Caja 2" } },
  ];
  const refOriginal = window._cache.ventas;
  window._ventasBusqueda = "0001";
  window.renderVentasHistorial();
  assert.strictEqual(window._cache.ventas, refOriginal, "misma referencia");
  assert.strictEqual(window._cache.ventas.length, 2, "no se pierden ventas");
});


// ============================================================
// R6 + R7 — Detalle accionable de venta + auditoría matemática
// ============================================================

test("R6: cada venta del historial es accionable (data-venta-id + role)", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [
    { id: "a1b2c3d4-0001-0000-0000-000000000001", fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } },
  ];
  window.renderVentasHistorial();
  const item = document.querySelector('#lista-ventas .venta-item');
  assert.ok(item, "ítem accionable");
  assert.strictEqual(item.getAttribute("data-venta-id"), "a1b2c3d4-0001-0000-0000-000000000001");
  assert.strictEqual(item.getAttribute("role"), "button");
});

test("R6: click en una venta abre el detalle con su ID", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const venta = { id: "a1b2c3d4-0001-0000-0000-000000000001", fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } };
  window._cache.ventas = [venta];
  window.renderVentasHistorial();
  document.querySelector('#lista-ventas .venta-item').click();
  await esperar(5);
  const detalle = document.getElementById("venta-detalle");
  assert.ok(!detalle.classList.contains("hidden"), "detalle visible");
  assert.ok(/Venta #/.test(detalle.innerHTML), "cabecera con referencia");
  assert.ok(detalle.innerHTML.includes("Caja 1"), "detalle muestra el almacén");
  assert.ok(detalle.innerHTML.includes("$250.00"), "detalle muestra el total registrado");
});

test("R7: redondearCentavos corrige error de coma flotante", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  assert.strictEqual(window.redondearCentavos(149.999999999), 150);
  assert.strictEqual(window.redondearCentavos(0.1 + 0.2), 0.3);
});

test("R7: auditoría TOTAL COINCIDE cuando suma de líneas = total", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventaId = "a1b2c3d4-0001-0000-0000-000000000001";
  window._cache.ventas = [{ id: ventaId, fecha: "2026-08-15T10:00:00Z", total: 300, almacenes: { nombre: "Caja 1" } }];
  client.__rpcResult = { data: [{ id: ventaId, lineas: [{ producto: "P1", cantidad: 2, precio_unitario: 100, subtotal: 200 }, { producto: "P2", cantidad: 1, precio_unitario: 100, subtotal: 100 }] }], error: null };
  window.mostrarDetalleVenta(ventaId);
  await esperar(20);
  const detalle = document.getElementById("venta-detalle");
  assert.ok(/Auditoría de la venta/.test(detalle.innerHTML), "bloque de auditoría presente");
  assert.ok(/TOTAL COINCIDE/.test(detalle.innerHTML), "auditoría detecta coincidencia (200+100=300)");
  assert.ok(detalle.innerHTML.includes("$300.00"), "muestra total registrado");
});

test("R7: auditoría DIFERENCIA DETECTADA cuando suma ≠ total", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventaId = "a1b2c3d4-0002-0000-0000-000000000002";
  window._cache.ventas = [{ id: ventaId, fecha: "2026-08-15T11:00:00Z", total: 300, almacenes: { nombre: "Caja 1" } }];
  client.__rpcResult = { data: [{ id: ventaId, lineas: [{ producto: "P1", cantidad: 2, precio_unitario: 100, subtotal: 200 }, { producto: "P2", cantidad: 1, precio_unitario: 50, subtotal: 50 }] }], error: null };
  window.mostrarDetalleVenta(ventaId);
  await esperar(20);
  const detalle = document.getElementById("venta-detalle");
  assert.ok(/DIFERENCIA DETECTADA/.test(detalle.innerHTML), "auditoría detecta discrepancia");
  assert.ok(detalle.innerHTML.includes("$50.00"), "muestra monto de la diferencia");
});

test("R7: offline, el detalle abre y avisa que las líneas requieren conexión", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const ventaId = "a1b2c3d4-0003-0000-0000-000000000003";
  window._cache.ventas = [{ id: ventaId, fecha: "2026-08-15T12:00:00Z", total: 100, almacenes: { nombre: "Caja 1" } }];
  window.mostrarDetalleVenta(ventaId);
  await esperar(10);
  const detalle = document.getElementById("venta-detalle");
  assert.ok(/no disponibles sin conexión/.test(detalle.innerHTML), "avisa offline sin inventar líneas");
});

test("R6: cerrar el detalle vuelve al historial conservando la lista", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventaId = "a1b2c3d4-0004-0000-0000-000000000004";
  window._cache.ventas = [{ id: ventaId, fecha: "2026-08-15T13:00:00Z", total: 80, almacenes: { nombre: "Caja 1" } }];
  window.renderVentasHistorial();
  document.querySelector('#lista-ventas .venta-item').click();
  await esperar(5);
  window.cerrarDetalleVenta();
  const detalle = document.getElementById("venta-detalle");
  assert.ok(detalle.classList.contains("hidden"), "detalle oculto tras cerrar");
  assert.ok(document.getElementById("lista-ventas").querySelector(".venta-item"), "historial conservado");
});


// ============================================================
// R9 — Centro de Control: movimientos accionables (navegación)
// ============================================================
test("R9: cada movimiento de Últimos movimientos es accionable", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [{ id: "v1", fecha: "2026-08-15T10:00:00Z", total: 100, almacenes: { nombre: "Caja 1" } }];
  window._cache.transferencias = [{ id: "t1", fecha: "2026-08-15T11:00:00Z", origen: { nombre: "A" }, destino: { nombre: "B" }, estado: "completada" }];
  window._cache.vales = [{ id: "va1", fecha: "2026-08-15T12:00:00Z", tipo: "merma", cantidad: 3, productos: { nombre: "P" }, almacenes: { nombre: "A" } }];
  window.renderResumen();
  const movs = document.getElementById("resumen-movs-lista");
  const items = movs.querySelectorAll(".resumen-mov-item");
  assert.ok(items.length === 3, "tres movimientos accionables");
  items.forEach((it) => {
    assert.ok(it.getAttribute("data-mov-tab"), "tiene tab destino");
    assert.strictEqual(it.getAttribute("role"), "button");
  });
});

test("R9: click en un movimiento navega al tab correspondiente", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [{ id: "v1", fecha: "2026-08-15T10:00:00Z", total: 100, almacenes: { nombre: "Caja 1" } }];
  window._cache.transferencias = [];
  window._cache.vales = [];
  window.renderResumen();
  document.querySelector('#resumen-movs-lista .resumen-mov-item').click();
  assert.ok(document.querySelector('.tab-btn[data-tab="ventas"]').classList.contains("active"), "navega al tab ventas");
});


// ============================================================
// R10 — Filtros operativos en movimientos (transferencias + vales)
// ============================================================
test("R10: buscador de transferencias filtra por origen", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.transferencias = [
    { id: "t1", fecha: "2026-08-15T10:00:00Z", origen: { nombre: "Depósito" }, destino: { nombre: "Local" }, estado: "completada" },
    { id: "t2", fecha: "2026-08-15T11:00:00Z", origen: { nombre: "Bodega" }, destino: { nombre: "Sucursal" }, estado: "pendiente" },
  ];
  window._trfBusqueda = "depósito";
  window.renderTransferenciasLista();
  const lista = document.getElementById("lista-transferencias");
  assert.ok(lista.querySelectorAll(".trf-item").length === 1, "una transferencia coincide");
  assert.ok(/Mostrando 1 de 2/.test(document.getElementById("trf-contador").textContent), "contador trf");
});

test("R10: buscador de vales filtra por tipo y marca visual por tipo", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.vales = [
    { id: "va1", fecha: "2026-08-15T10:00:00Z", tipo: "merma", cantidad: 3, productos: { nombre: "P1" }, almacenes: { nombre: "A" } },
    { id: "va2", fecha: "2026-08-15T11:00:00Z", tipo: "donacion", cantidad: 1, productos: { nombre: "P2" }, almacenes: { nombre: "B" } },
  ];
  window._valesBusqueda = "merma";
  window.renderValesLista();
  const lista = document.getElementById("lista-vales");
  assert.ok(lista.querySelectorAll(".vale-item").length === 1, "un vale coincide");
  assert.ok(lista.querySelector(".vale-tipo-merma"), "indicación visual por tipo (merma)");
});

test("R10: cada transferencia y vale muestra ID corto y es accionable", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.transferencias = [{ id: "t1-abc", fecha: "2026-08-15T10:00:00Z", origen: { nombre: "A" }, destino: { nombre: "B" }, estado: "completada" }];
  window._cache.vales = [{ id: "va1-xyz", fecha: "2026-08-15T11:00:00Z", tipo: "merma", cantidad: 1, productos: { nombre: "P" }, almacenes: { nombre: "A" } }];
  window.renderTransferenciasLista();
  window.renderValesLista();
  const trf = document.querySelector('#lista-transferencias .trf-item');
  const vale = document.querySelector('#lista-vales .vale-item');
  assert.ok(trf && trf.getAttribute("data-trf-id") === "t1-abc" && trf.getAttribute("role") === "button", "trf accionable con ID");
  assert.ok(vale && vale.getAttribute("data-vale-id") === "va1-xyz" && vale.getAttribute("role") === "button", "vale accionable con ID");
});


// ============================================================
// R11 — Auditoría de transferencias (detalle accionable)
// ============================================================
test("R11: click en una transferencia abre el detalle con datos reales", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.transferencias = [{ id: "t1-abc", fecha: "2026-08-15T10:00:00Z", origen: { nombre: "Depósito" }, destino: { nombre: "Local" }, estado: "completada" }];
  window.renderTransferenciasLista();
  document.querySelector('#lista-transferencias .trf-item').click();
  const detalle = document.getElementById("transferencia-detalle");
  assert.ok(!detalle.classList.contains("hidden"), "detalle trf visible");
  assert.ok(/Transferencia #/.test(detalle.innerHTML), "cabecera trf");
  assert.ok(detalle.innerHTML.includes("Depósito"), "origen real");
  assert.ok(detalle.innerHTML.includes("Local"), "destino real");
  assert.ok(/completada/.test(detalle.innerHTML), "estado real");
});

test("R11: cerrar el detalle de transferencia oculta el panel", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.transferencias = [{ id: "t1-abc", fecha: "2026-08-15T10:00:00Z", origen: { nombre: "A" }, destino: { nombre: "B" }, estado: "completada" }];
  window.renderTransferenciasLista();
  document.querySelector('#lista-transferencias .trf-item').click();
  window.cerrarDetalleTransferencia();
  assert.ok(document.getElementById("transferencia-detalle").classList.contains("hidden"), "detalle trf oculto");
});


// ============================================================
// R12 — Auditoría de vales (detalle accionable + tipo legible)
// ============================================================
test("R12: click en un vale abre el detalle con tipo legible y cantidad", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.vales = [{ id: "va1-xyz", fecha: "2026-08-15T10:00:00Z", tipo: "donacion", cantidad: 5, productos: { nombre: "Harina" }, almacenes: { nombre: "Depósito" } }];
  window.renderValesLista();
  document.querySelector('#lista-vales .vale-item').click();
  const detalle = document.getElementById("vale-detalle");
  assert.ok(!detalle.classList.contains("hidden"), "detalle vale visible");
  assert.ok(/Vale #/.test(detalle.innerHTML), "cabecera vale");
  assert.ok(/Donación/.test(detalle.innerHTML), "tipo legible (Donación)");
  assert.ok(detalle.innerHTML.includes("Harina"), "producto real");
  assert.ok(/5\.00 u/.test(detalle.innerHTML), "cantidad real");
});

test("R12: indicación visual por tipo en la lista", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.vales = [
    { id: "va1", fecha: "2026-08-15T10:00:00Z", tipo: "merma", cantidad: 1, productos: { nombre: "P1" }, almacenes: { nombre: "A" } },
    { id: "va2", fecha: "2026-08-15T11:00:00Z", tipo: "regalo", cantidad: 1, productos: { nombre: "P2" }, almacenes: { nombre: "B" } },
  ];
  window.renderValesLista();
  const lista = document.getElementById("lista-vales");
  assert.ok(lista.querySelector(".vale-tipo-merma"), "borde merma");
  assert.ok(lista.querySelector(".vale-tipo-regalo"), "borde regalo");
});


// ============================================================
// R10 (integración): el buscador responde a eventos input reales
// ============================================================
test("R10: escribir en el buscador de ventas filtra la lista vía evento input", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [
    { id: "a1b2c3d4-0001-0000-0000-000000000001", fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } },
    { id: "a1b2c3d4-0002-0000-0000-000000000002", fecha: "2026-08-15T11:00:00Z", total: 150, almacenes: { nombre: "Caja 2" } },
  ];
  window.renderVentasHistorial();
  const input = document.getElementById("ventas-buscar");
  input.value = "caja 1";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const lista = document.getElementById("lista-ventas");
  assert.strictEqual(lista.querySelectorAll(".venta-item").length, 1, "input filtra a 1 venta");
  assert.ok(/Mostrando 1 de 2/.test(document.getElementById("ventas-contador").textContent), "contador refleja el filtro");
});

test("R10: botón 'Ver todas' restaura la lista completa", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = [
    { id: "a1b2c3d4-0001-0000-0000-000000000001", fecha: "2026-08-15T10:00:00Z", total: 250, almacenes: { nombre: "Caja 1" } },
    { id: "a1b2c3d4-0002-0000-0000-000000000002", fecha: "2026-08-15T11:00:00Z", total: 150, almacenes: { nombre: "Caja 2" } },
  ];
  window._ventasBusqueda = "zzz-no-existe";
  window.renderVentasHistorial();
  document.querySelector("#lista-ventas .mov-ver-todas-btn").click();
  assert.strictEqual(document.getElementById("lista-ventas").querySelectorAll(".venta-item").length, 2, "restauradas todas las ventas");
  assert.strictEqual(document.getElementById("ventas-buscar").value, "", "input limpiado");
});


// ============================================================
// OFFLINE-FIRST — Verificación de los escenarios obligatorios
// FIFO, duplicados, internet intermitente, recuperación tras reload/cierre.
// Reutilizan el propio app.js cargado en el window (no duplican lógica).
// ============================================================
test("OFFLINE: venta offline se encola y NO llama al RPC", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  client.__rpcCalls.length = 0;
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const r = await window.ejecutarOperacion("venta", {
    p_almacen_id: "alm-1", p_lineas: [{ producto_id: "p1", cantidad: 2 }],
  });
  assert.ok(r.ok && r.offline, "la venta offline se encola (ok+offline)");
  assert.ok(r.operacion && r.operacion.idempotency_key, "conserva idempotency_key generada una sola vez");
  assert.strictEqual(client.__rpcCalls.length, 0, "no se intenta el RPC estando offline");
});

test("OFFLINE: compra/transferencia/vale offline también entran a la cola", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const tipos = [
    ["compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 5 }],
    ["transferencia", { p_origen_id: "a1", p_destino_id: "a2", p_lineas: [{ producto_id: "p1", cantidad: 1 }] }],
    ["vale", { p_producto_id: "p1", p_almacen_id: "a1", p_tipo: "merma", p_cantidad: 1 }],
  ];
  for (const [tipo, payload] of tipos) {
    const r = await window.ejecutarOperacion(tipo, payload);
    assert.ok(r.ok && r.offline, tipo + " offline se encola");
  }
  const ops = await window.obtenerOperacionesPorEstado("PENDIENTE");
  assert.strictEqual(ops.length, 3, "las 3 operaciones quedaron pendientes");
});

test("OFFLINE: FIFO — la cola ordena por creado_en ASC (la más antigua primero)", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const w = window;
  const opA = w.crearOperacionPendiente("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1 });
  opA.creado_en = "2026-08-15T10:00:00Z";
  const opB = w.crearOperacionPendiente("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1 });
  opB.creado_en = "2026-08-15T09:00:00Z";
  const opC = w.crearOperacionPendiente("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1 });
  opC.creado_en = "2026-08-15T11:00:00Z";
  await w.guardarOperacionPendiente(opA);
  await w.guardarOperacionPendiente(opB);
  await w.guardarOperacionPendiente(opC);
  const orden = (await w.obtenerOperacionesPorEstado("PENDIENTE")).map((o) => o.id);
  assert.deepStrictEqual(orden, [opB.id, opA.id, opC.id], "FIFO: la más antigua (09:00) va primero");
});

test("OFFLINE: idempotency_key se conserva literal al reintentar (no se regenera)", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const r = await window.ejecutarOperacion("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 3 });
  const claveOriginal = r.operacion.idempotency_key;
  await window.actualizarOperacionPendiente(r.operacion.id, { estado: "SINCRONIZANDO", intentos: 1 });
  const actualizada = await window.obtenerOperacionPendiente(r.operacion.id);
  assert.strictEqual(actualizada.idempotency_key, claveOriginal, "idempotency_key intacta tras reintento");
  assert.strictEqual(actualizada.estado, "SINCRONIZANDO");
  assert.strictEqual(actualizada.intentos, 1);
});

test("OFFLINE: sincronización exitosa elimina la op y envía la MISMA idempotency_key", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const op = await crearOp(window, "venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }] }, "PENDIENTE");
  client.__rpcCalls.length = 0;
  client.__rpcResult = { data: { id: "v-123" }, error: null };
  await window.sincronizarCola();
  await esperar(15);
  const llamada = client.__rpcCalls.find((c) => c.nombre === "registrar_venta");
  assert.ok(llamada, "se llamó al RPC de venta");
  assert.strictEqual(llamada.params.p_idempotency_key, op.idempotency_key, "el reintento envía la MISMA idempotency_key");
  assert.strictEqual(await window.obtenerOperacionPendiente(op.id), null, "la op se eliminó de la cola tras éxito");
});

test("OFFLINE: error de negocio deja la op en REQUIERE_ATENCION con el error real", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const op = await crearOp(window, "vale", { p_producto_id: "p1", p_almacen_id: "a1", p_tipo: "merma", p_cantidad: 1 }, "PENDIENTE");
  client.__rpcCalls.length = 0;
  client.__rpcResult = { data: null, error: { message: "Stock insuficiente para esta operación" } };
  await window.sincronizarCola();
  await esperar(15);
  const restante = await window.obtenerOperacionPendiente(op.id);
  assert.ok(restante, "la op NO se eliminó");
  assert.strictEqual(restante.estado, "REQUIERE_ATENCION", "queda en REQUIERE_ATENCION para revisión manual");
  assert.ok(/Stock insuficiente/.test(restante.ultimo_error), "guarda el error real del backend");
});

test("OFFLINE: internet intermitente — error de red deja la op en PENDIENTE (no REQUIERE_ATENCION)", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const op = await crearOp(window, "transferencia", { p_origen_id: "a1", p_destino_id: "a2", p_lineas: [{ producto_id: "p1", cantidad: 1 }] }, "PENDIENTE");
  client.__rpcCalls.length = 0;
  client.__rpcResult = { data: null, error: { message: "Failed to fetch" } };
  await window.sincronizarCola();
  await esperar(15);
  const restante = await window.obtenerOperacionPendiente(op.id);
  assert.ok(restante, "la op sigue en la cola");
  assert.strictEqual(restante.estado, "PENDIENTE", "vuelve a PENDIENTE: es de red, no de negocio");
});

test("OFFLINE: internet intermitente — al recuperar la conexión, sincroniza lo pendiente", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const op = await crearOp(window, "compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 2 }, "PENDIENTE");
  client.__rpcCalls.length = 0;
  client.__rpcResult = { data: null, error: { message: "Failed to fetch" } };
  await window.sincronizarCola();
  await esperar(15);
  assert.strictEqual((await window.obtenerOperacionPendiente(op.id)).estado, "PENDIENTE", "quedó pendiente tras el fallo de red");
  client.__rpcResult = { data: { id: "c-1" }, error: null };
  await window.sincronizarCola();
  await esperar(15);
  assert.strictEqual(await window.obtenerOperacionPendiente(op.id), null, "se sincronizó y eliminó al recuperar la conexión");
});

test("OFFLINE: recuperación tras recarga — la cola persiste en IndexedDB y se reconstruye", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const r = await window.ejecutarOperacion("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 4 });
  const clave = r.operacion.idempotency_key;
  await window.actualizarOperacionPendiente(r.operacion.id, { estado: "SINCRONIZANDO" });
  await window.recuperarOperacionesAtrapadas();
  const recuperada = await window.obtenerOperacionPendiente(r.operacion.id);
  assert.ok(recuperada, "la op sobrevivió (persistencia IndexedDB)");
  assert.strictEqual(recuperada.estado, "PENDIENTE", "recuperada de SINCRONIZANDO a PENDIENTE tras recarga");
  assert.strictEqual(recuperada.idempotency_key, clave, "idempotency_key conservada tras la recuperación");
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  client.__rpcResult = { data: { id: "c-2" }, error: null };
  await window.sincronizarCola();
  await esperar(15);
  assert.strictEqual(await window.obtenerOperacionPendiente(r.operacion.id), null, "se sincronizó tras la recuperación");
});

test("OFFLINE: proyección de stock descuenta venta/vale/transferencia y suma compra", async () => {
  const { window: w } = montarEntorno();
  marcarOnline(w);
  await esperar(30);
  Object.defineProperty(w.navigator, "onLine", { value: false, configurable: true });
  await w.ejecutarOperacion("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 10 });
  await w.ejecutarOperacion("venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 3 }] });
  await w.ejecutarOperacion("vale", { p_producto_id: "p1", p_almacen_id: "a1", p_tipo: "merma", p_cantidad: 2 });
  await w.ejecutarOperacion("transferencia", { p_origen_id: "a1", p_destino_id: "a2", p_lineas: [{ producto_id: "p1", cantidad: 1 }] });
  const { ajuste } = w.ajustePendiente("p1", "a1");
  assert.strictEqual(ajuste, 4, "proyección local: +10 -3 -2 -1 = +4");
  const { ajuste: ajusteDest } = w.ajustePendiente("p1", "a2");
  assert.strictEqual(ajusteDest, 1, "proyección destino de la transferencia: +1");
});

test("OFFLINE: no se generan operaciones duplicadas — una op = una sola llamada al RPC", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const op = await crearOp(window, "venta", { p_almacen_id: "a1", p_lineas: [{ producto_id: "p1", cantidad: 1 }] }, "PENDIENTE");
  client.__rpcCalls.length = 0;
  client.__rpcResult = { data: { id: "v-x" }, error: null };
  await window.sincronizarCola();
  await esperar(15);
  await window.sincronizarCola();
  await esperar(15);
  const llamadasVenta = client.__rpcCalls.filter((c) => c.nombre === "registrar_venta");
  assert.strictEqual(llamadasVenta.length, 1, "el RPC se llamó una sola vez (no se duplicó)");
  assert.strictEqual(llamadasVenta[0].params.p_idempotency_key, op.idempotency_key, "misma idempotency_key en la única llamada");
});

test("OFFLINE: el contador de pendientes refleja la cola real (badge #cola-pendientes-badge)", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  await window.ejecutarOperacion("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1 });
  await window.ejecutarOperacion("vale", { p_producto_id: "p1", p_almacen_id: "a1", p_tipo: "merma", p_cantidad: 1 });
  await window.actualizarContadorColaPendiente();
  await esperar(15);
  const badge = document.getElementById("cola-pendientes-badge");
  assert.ok(badge, "existe el badge del contador");
  assert.ok(!badge.classList.contains("hidden"), "el badge es visible con pendientes");
  assert.ok(/2 pendientes/.test(badge.textContent), "el contador muestra 2 pendientes: " + badge.textContent);
});

test("OFFLINE: doble sincronización simultánea → 1 sola ejecución real (mutex _sincronizando)", async () => {
  const { window, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  await crearOp(window, "compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 1 }, "PENDIENTE");
  client.__rpcCalls.length = 0;
  client.__rpcResult = { data: { id: "c-9" }, error: null };
  await Promise.all([window.sincronizarCola(), window.sincronizarCola()]);
  await esperar(20);
  const llamadas = client.__rpcCalls.filter((c) => c.nombre === "registrar_compra");
  assert.strictEqual(llamadas.length, 1, "una sola ejecución real gracias al mutex _sincronizando");
});


// ============================================================
// V1.3 — actualizarApp() solo borra caches de BattleCruiser
// No debe tocar caches de otras aplicaciones del mismo origen.
// ============================================================

test("V1.3: actualizarApp solo borra caches con prefijo battlecruiser-shell-", async () => {
  const { window } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const borradas = [];
  Object.defineProperty(window, "caches", {
    value: {
      keys: async () => ["battlecruiser-shell-v29", "battlecruiser-shell-v28", "otra-app-cache", "mi-cache-personal"],
      delete: async (k) => { borradas.push(k); return true; },
    },
    configurable: true,
  });
  window.location.reload = () => {};
  const btn = window.document.getElementById("update-app-btn");
  try {
    await window.actualizarApp(btn);
  } catch (e) {
  }
  assert.ok(borradas.includes("battlecruiser-shell-v29"), "borró la cache actual de BattleCruiser");
  assert.ok(borradas.includes("battlecruiser-shell-v28"), "borró la cache vieja de BattleCruiser");
  assert.ok(!borradas.includes("otra-app-cache"), "NO borró la cache de otra aplicación");
  assert.ok(!borradas.includes("mi-cache-personal"), "NO borró una cache personal ajena");
});
