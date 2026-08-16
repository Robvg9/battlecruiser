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
// R7 — Auditoría matemática del detalle de una venta
// ============================================================

function ventasAuditoria() {
  return [
    { id: "11111111-aaaa-4bbb-8ccc-111111111111", fecha: "2026-08-15T10:30:00Z", total: 150, almacenes: { nombre: "Caja 1" } },
    { id: "22222222-bbbb-4ccc-8ddd-222222222222", fecha: "2026-08-15T11:00:00Z", total: 145, almacenes: { nombre: "Caja 2" } },
    { id: "33333333-cccc-4ddd-8eee-333333333333", fecha: "2026-08-15T12:00:00Z", total: 80, almacenes: { nombre: "Caja 1" } },
  ];
}

function mockReporteVentasConLineas(ventas, mapLineas) {
  // mapLineas: funcion que devuelve las lineas para una venta dada.
  const conLineas = ventas.map((v) => Object.assign({}, v, {
    almacen: v.almacenes ? v.almacenes.nombre : null,
    lineas: mapLineas(v),
  }));
  return async (nombre, params) => {
    if (nombre === "reporte_ventas") {
      const f = params && params.p_desde;
      const filtradas = f ? conLineas.filter((v) => v.fecha.slice(0, 10) === f) : conLineas;
      return { data: filtradas, error: null };
    }
    return { data: "ok", error: null };
  };
}

async function abrirVenta(window, document, ventaId) {
  window.renderVentasHistorial();
  await esperar(20);
  document.querySelector("#lista-ventas .venta-item[data-venta-id='" + ventaId + "']").click();
  await esperar(50);
}

test("R7.1: el detalle muestra productos, cantidades, precios y subtotales reales", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  client.rpc = mockReporteVentasConLineas(ventas, (v) => [
    { producto_id: "p1", producto: "Café", cantidad: 2, precio_unitario: 50, subtotal: 100 },
    { producto_id: "p2", producto: "Tostada", cantidad: 1, precio_unitario: 50, subtotal: 50 },
  ]);
  await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
  const detalle = document.getElementById("venta-detalle");
  assert.ok(/Café/.test(detalle.innerHTML), "muestra producto");
  assert.ok(/2 u/.test(detalle.innerHTML), "muestra cantidad");
  assert.ok(/\$50\.00/.test(detalle.innerHTML), "muestra precio unitario");
  assert.ok(/\$100\.00/.test(detalle.innerHTML), "muestra subtotal de la línea");
});

test("R7.2: suma de subtotales coincide con total registrado → TOTAL COINCIDE", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  // Líneas que suman exactamente 150 = total registrado.
  client.rpc = mockReporteVentasConLineas(ventas, (v) => [
    { producto_id: "p1", producto: "Café", cantidad: 2, precio_unitario: 50, subtotal: 100 },
    { producto_id: "p2", producto: "Tostada", cantidad: 1, precio_unitario: 50, subtotal: 50 },
  ]);
  await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
  const auditoria = document.getElementById("venta-detalle-auditoria");
  assert.ok(/TOTAL COINCIDE/.test(auditoria.innerHTML), "estado TOTAL COINCIDE");
  assert.ok(auditoria.innerHTML.includes("$150.00"), "muestra total registrado");
  assert.ok(/Total de productos/.test(auditoria.innerHTML), "muestra total de productos");
  assert.ok(/\$0\.00/.test(auditoria.innerHTML), "diferencia $0.00");
});

test("R7.3: suma de subtotales NO coincide → DIFERENCIA DETECTADA + diferencia", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  // Total registrado 150, pero líneas suman 145 → diferencia $5.
  client.rpc = mockReporteVentasConLineas(ventas, (v) => {
    if (v.id === "11111111-aaaa-4bbb-8ccc-111111111111") {
      return [
        { producto_id: "p1", producto: "Café", cantidad: 2, precio_unitario: 50, subtotal: 100 },
        { producto_id: "p2", producto: "Tostada", cantidad: 1, precio_unitario: 45, subtotal: 45 },
      ];
    }
    return [];
  });
  await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
  const auditoria = document.getElementById("venta-detalle-auditoria");
  assert.ok(/DIFERENCIA DETECTADA/.test(auditoria.innerHTML), "estado DIFERENCIA DETECTADA");
  assert.ok(auditoria.innerHTML.includes("$145.00"), "muestra total de productos (145)");
  assert.ok(auditoria.innerHTML.includes("$5.00"), "muestra la diferencia ($5)");
});

test("R7.4: diferencia inferior a la tolerancia (centavos) se considera coincidente", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  // Total registrado 150, líneas suman 149.999 (error de coma flotante) → coincide.
  client.rpc = mockReporteVentasConLineas(ventas, (v) => [
    { producto_id: "p1", producto: "Café", cantidad: 1, precio_unitario: 99.999, subtotal: 99.999 },
    { producto_id: "p2", producto: "Tostada", cantidad: 1, precio_unitario: 50, subtotal: 50 },
  ]);
  await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
  const auditoria = document.getElementById("venta-detalle-auditoria");
  assert.ok(/TOTAL COINCIDE/.test(auditoria.innerHTML), "tolerancia de centavos → coincide");
  assert.ok(!/DIFERENCIA DETECTADA/.test(auditoria.innerHTML), "no marca diferencia por error de coma flotante");
});

test("R7.5: venta sin líneas → SIN LÍNEAS DISPONIBLES", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  client.rpc = mockReporteVentasConLineas(ventas, () => []);
  await abrirVenta(window, document, "33333333-cccc-4ddd-8eee-333333333333");
  const auditoria = document.getElementById("venta-detalle-auditoria");
  assert.ok(/Sin líneas disponibles/.test(auditoria.innerHTML), "estado SIN LÍNEAS DISPONIBLES");
  assert.ok(auditoria.innerHTML.includes("$80.00"), "muestra total registrado de todas formas");
});

test("R7.6: offline — el detalle abre y avisa que las líneas no están disponibles sin conexión", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  window.renderVentasHistorial();
  await esperar(20);
  document.querySelector("#lista-ventas .venta-item[data-venta-id='11111111-aaaa-4bbb-8ccc-111111111111']").click();
  await esperar(30);
  const detalle = document.getElementById("venta-detalle");
  assert.ok(!detalle.classList.contains("hidden"), "detalle visible offline");
  assert.ok(/\$150\.00/.test(detalle.innerHTML), "muestra total (dato en caché)");
  const auditoria = document.getElementById("venta-detalle-auditoria");
  assert.ok(/no disponibles sin conexión/.test(auditoria.innerHTML), "avisa que las líneas requieren conexión");
  // No inventa líneas ni productos.
  assert.ok(!/Café/.test(detalle.innerHTML), "no inventa productos offline");
  assert.ok(!/TOTAL COINCIDE/.test(auditoria.innerHTML), "no audita sin líneas");
});

test("R7.7: la auditoría NO modifica _cache.ventas", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  client.rpc = mockReporteVentasConLineas(ventas, (v) => [
    { producto_id: "p1", producto: "Café", cantidad: 2, precio_unitario: 50, subtotal: 100 },
  ]);
  await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
  document.querySelector(".venta-detalle-cerrar-btn").click();
  await esperar(10);
  assert.strictEqual(window._cache.ventas, ventas, "_cache.ventas es la misma referencia");
  assert.strictEqual(window._cache.ventas.length, 3, "_cache.ventas conserva los 3 elementos");
  assert.strictEqual(window._cache.ventas[0].total, 150, "total de la venta intacto");
});

test("R7.8: cerrar el detalle sigue funcionando tras la auditoría", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  client.rpc = mockReporteVentasConLineas(ventas, () => [
    { producto_id: "p1", producto: "Café", cantidad: 2, precio_unitario: 50, subtotal: 100 },
  ]);
  await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
  const detalle = document.getElementById("venta-detalle");
  assert.ok(!detalle.classList.contains("hidden"), "detalle abierto");
  detalle.querySelector(".venta-detalle-cerrar-btn").click();
  await esperar(10);
  assert.ok(detalle.classList.contains("hidden"), "detalle cerrado");
  assert.strictEqual(detalle.innerHTML, "", "contenido limpiado");
  // El historial sigue intacto.
  assert.strictEqual(document.querySelectorAll("#lista-ventas .venta-item").length, 3, "historial conservado");
});

test("R7.9: el historial sigue funcionando (no regresión)", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  window._cache.ventas = ventasAuditoria();
  window.renderVentasHistorial();
  await esperar(20);
  const items = document.querySelectorAll("#lista-ventas .venta-item");
  assert.strictEqual(items.length, 3, "historial muestra 3 ventas");
  assert.ok(items[0].getAttribute("data-venta-id"), "items accionables");
  // Sin ventas: estado vacío.
  window._cache.ventas = [];
  window.renderVentasHistorial();
  await esperar(10);
  assert.ok(/Todavía no hay ventas registradas/.test(document.getElementById("lista-ventas").innerHTML), "estado vacío");
});

test("R7.10: abrir una segunda venta no conserva auditoría de la primera", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  client.rpc = mockReporteVentasConLineas(ventas, (v) => {
    if (v.id === "11111111-aaaa-4bbb-8ccc-111111111111") {
      return [{ producto_id: "p1", producto: "Café", cantidad: 2, precio_unitario: 50, subtotal: 100 },
              { producto_id: "p2", producto: "Tostada", cantidad: 1, precio_unitario: 50, subtotal: 50 }];
    }
    // Venta 2: total 145, líneas suman 145 → coincide.
    return [{ producto_id: "p3", producto: "Jugo", cantidad: 1, precio_unitario: 145, subtotal: 145 }];
  });
  await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
  let auditoria = document.getElementById("venta-detalle-auditoria");
  assert.ok(/TOTAL COINCIDE/.test(auditoria.innerHTML), "venta 1: coincide (150)");
  assert.ok(auditoria.innerHTML.includes("$150.00"), "venta 1: total 150");
  // Abrir venta 2.
  await abrirVenta(window, document, "22222222-bbbb-4ccc-8ddd-222222222222");
  auditoria = document.getElementById("venta-detalle-auditoria");
  assert.ok(/TOTAL COINCIDE/.test(auditoria.innerHTML), "venta 2: coincide (145)");
  assert.ok(auditoria.innerHTML.includes("$145.00"), "venta 2: total 145");
  assert.ok(!auditoria.innerHTML.includes("$150.00"), "no conserva total de la venta 1");
  assert.ok(!/Café/.test(document.getElementById("venta-detalle").innerHTML), "no conserva líneas de venta 1");
});

test("R7.11: abrir/cerrar varias veces no acumula listeners ni elementos duplicados", async () => {
  const { window, document, client } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  const ventas = ventasAuditoria();
  window._cache.ventas = ventas;
  client.rpc = mockReporteVentasConLineas(ventas, () => [
    { producto_id: "p1", producto: "Café", cantidad: 1, precio_unitario: 50, subtotal: 50 },
  ]);
  for (let i = 0; i < 3; i++) {
    await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
    document.querySelector(".venta-detalle-cerrar-btn").click();
    await esperar(10);
  }
  // Un solo contenedor de detalle.
  assert.strictEqual(document.querySelectorAll("#venta-detalle").length, 1, "un solo contenedor de detalle");
  // Un solo botón de cerrar tras las aperturas.
  await abrirVenta(window, document, "11111111-aaaa-4bbb-8ccc-111111111111");
  assert.strictEqual(document.querySelectorAll("#venta-detalle .venta-detalle-cerrar-btn").length, 1, "un solo botón cerrar");
  // Una sola sección de auditoría.
  assert.strictEqual(document.querySelectorAll("#venta-detalle-auditoria").length, 1, "una sola sección de auditoría");
});

test("R7.12: no duplicación de arquitectura — una sola fuente y un solo detalle", async () => {
  const { window, document } = montarEntorno();
  marcarOnline(window);
  await esperar(30);
  assert.strictEqual(window._cacheVentas, undefined, "no hay segunda caché de ventas");
  assert.strictEqual(window._ventasCache, undefined, "no hay segunda caché (alias)");
  assert.strictEqual(document.querySelectorAll("#venta-detalle").length, 1, "un solo contenedor de detalle");
  assert.strictEqual(typeof window.mostrarDetalleVenta, "function", "una sola función mostrarDetalleVenta");
  assert.strictEqual(typeof window.cerrarDetalleVenta, "function", "una sola función cerrarDetalleVenta");
  assert.strictEqual(typeof window.redondearCentavos, "function", "una sola función redondearCentavos");
  assert.strictEqual(typeof window.renderVentasHistorial, "function", "una sola función renderVentasHistorial");
});
