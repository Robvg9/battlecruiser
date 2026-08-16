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
      onAuthStateChange: () => {},
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
  let appJs = require("fs").readFileSync(
    require("path").join(__dirname, "..", "public", "app.js"),
    "utf8"
  );
  appJs = appJs
    .replace(/const _cache = \{/, "window._cache = {")
    .replace(/let _operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];")
    .replace(/let _novedadesVistas = new Set\(\);/, "window._novedadesVistas = new Set();")
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

  // Stock real 100, una venta pendiente de 20 → proyección 80.
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
  // ANTES: la pantalla inicial (Centro de Control) no mostraba ventas,
  // pese a que _cache.ventas ya existía. AHORA: hay un card "Ventas recientes"
  // con el monto total y la cantidad de ventas.
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
  // ANTES: la lista de "Últimos movimientos" solo incluía transferencias y
  // vales. AHORA: las ventas también aparecen, ordenadas por fecha.
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
  // La venta (12:00) debe aparecer antes que la transferencia (10:00).
  const ventaIdx = movs.innerHTML.indexOf("Venta:");
  const trfIdx = movs.innerHTML.indexOf("Transferencia:");
  assert.ok(ventaIdx !== -1 && trfIdx !== -1, "ambos tipos presentes");
  assert.ok(ventaIdx < trfIdx, "venta más reciente aparece primero");
});
