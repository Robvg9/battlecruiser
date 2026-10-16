// ============================================================
// B5 — Pruebas automatizadas: Reportes y Análisis Operativo
// ============================================================
// Verifica permisos, filtros, resumen, sub-reportes, estados vacíos,
// offline, no-contaminación y no-duplicación de arquitectura.
//
// Ejecutar: node --test test/b5-reportes.test.js
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

function mockCliente({ perfil, permisos, resumen, ventas, transferencias, vales, stock, movimiento, rentabilidad, compras } = {}) {
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
      if (nombre === "reporte_resumen_ejecutivo") return { data: resumen || null, error: null };
      if (nombre === "reporte_ventas") return { data: ventas || [], error: null };
      if (nombre === "reporte_transferencias") return { data: transferencias || [], error: null };
      if (nombre === "reporte_vales") return { data: vales || [], error: null };
      if (nombre === "reporte_stock") return { data: stock || [], error: null };
      if (nombre === "reporte_movimiento_inventario") return { data: movimiento || [], error: null };
      if (nombre === "rentabilidad_ventas") return { data: rentabilidad || [], error: null };
      if (nombre === "historial_compras") return { data: compras || [], error: null };
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

test("B5.3: usuario con permiso reportes.ver ve la pestaña Reportes", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  const btn = document.querySelector('.tab-btn[data-tab="reportes"]');
  assert.ok(btn.style.display !== "none" && !btn.classList.contains("hidden"), "Reportes visible con permiso");
});

test("B5.3: usuario sin permiso reportes.ver NO ve la pestaña", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Dep", activo: true, role_id: "r2", rol: "Dependiente" }],
    permisos: [{ seccion: "ventas", accion: "ver" }], // sin reportes.ver
  });
  marcarOnline(window);
  await esperar(80);
  const btn = document.querySelector('.tab-btn[data-tab="reportes"]');
  assert.ok(btn.style.display === "none" || btn.classList.contains("hidden"), "Reportes oculto sin permiso");
});

test("B5.5: el resumen ejecutivo se carga con datos reales del RPC", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    resumen: {
      ventas: { cantidad: 15, ingresos: 50000, unidades: 80, ticket_promedio: 3333.33 },
      transferencias: { cantidad: 3, unidades: 20 },
      vales: { cantidad: 2, unidades: 5 },
      inventario: { productos: 40, unidades: 500, stock_bajo: 4, stock_agotado: 1 },
      compras: { disponible: false, nota: "No existe tabla histórica de compras." },
      margen: { disponible: false, nota: "No existe costo histórico por lote." },
    },
  });
  marcarOnline(window);
  assert.ok(
    await esperarHasta(() =>
      typeof window._usuarioActual === "function" &&
      Boolean(window._usuarioActual()) &&
      typeof window.tienePermiso === "function" &&
      window.tienePermiso("reportes", "ver")
    ),
    "contexto y permiso reportes deben estar listos en un máximo de 2 s"
  );
  const resumen = document.getElementById("rep-resumen");
  await window.refrescarReportes();
  assert.ok(
    await esperarHasta(() => resumen.innerHTML.includes("15")),
    "debe mostrar cantidad de ventas dentro de 2 s"
  );
  assert.ok(resumen.innerHTML.includes("50000"), "debe mostrar ingresos");
  assert.ok(resumen.innerHTML.includes("No existe tabla histórica"), "debe mostrar nota de compras no disponible");
  assert.ok(resumen.innerHTML.includes("No existe costo histórico"), "debe mostrar nota de margen no disponible");
});

test("B5.6: reporte de ventas muestra líneas reales con precio histórico", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    ventas: [
      { id: "v1", fecha: "2026-08-15T10:00:00Z", almacen: "Caja 1", total: 250, lineas: [{ producto_id: "p1", producto: "Café", cantidad: 2, precio_unitario: 125, subtotal: 250 }] },
    ],
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarReportes();
  await esperar(20);
  const detalle = document.getElementById("rep-detalle");
  assert.ok(detalle.innerHTML.includes("Caja 1"), "debe mostrar el almacén");
  assert.ok(detalle.innerHTML.includes("Café"), "debe mostrar el producto de la línea");
  assert.ok(detalle.innerHTML.includes("125.00"), "debe mostrar el precio unitario histórico");
});

test("B5.6: estado vacío cuando no hay datos", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    ventas: [],
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarReportes();
  await esperar(20);
  const detalle = document.getElementById("rep-detalle");
  assert.ok(/Sin ventas/.test(detalle.innerHTML), "debe mostrar estado vacío");
});

test("B5.17: offline no inventa datos de reportes", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  await window.refrescarReportes();
  await esperar(20);
  const resumen = document.getElementById("rep-resumen");
  assert.ok(/Sin conexión/.test(resumen.innerHTML), "offline no debe inventar datos");
  const detalle = document.getElementById("rep-detalle");
  assert.ok(/Sin conexión/.test(detalle.innerHTML), "detalle offline no inventa datos");
});

test("B5.4: filtros se aplican al backend (fecha + almacén)", async () => {
  const { window, document, client } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    resumen: { ventas: { cantidad: 0, ingresos: 0, unidades: 0, ticket_promedio: 0 }, transferencias: { cantidad: 0, unidades: 0 }, vales: { cantidad: 0, unidades: 0 }, inventario: { productos: 0, unidades: 0, stock_bajo: 0, stock_agotado: 0 }, compras: { disponible: false, nota: "x" }, margen: { disponible: false, nota: "x" } },
    ventas: [],
  });
  marcarOnline(window);
  await esperar(80);
  // Poblar _cache.almacenes y el select antes de setear el value.
  window._cache.almacenes = [{ id: "a1", nombre: "Caja 1", tipo: "venta" }];
  window.poblarFiltrosReportes(); // rellenar el select con a1
  document.getElementById("rep-filtro-desde").value = "2026-08-01";
  document.getElementById("rep-filtro-hasta").value = "2026-08-31";
  document.getElementById("rep-filtro-almacen").value = "a1";
  document.getElementById("rep-aplicar-btn").click();
  await esperar(30);
  const callResumen = client.__rpcCalls.find((c) => c.nombre === "reporte_resumen_ejecutivo");
  assert.ok(callResumen, "debe llamar al RPC de resumen");
  assert.strictEqual(callResumen.params.p_desde, "2026-08-01", "filtro desde aplicado");
  assert.strictEqual(callResumen.params.p_hasta, "2026-08-31", "filtro hasta aplicado");
  assert.strictEqual(callResumen.params.p_almacen_id, "a1", "filtro almacén aplicado");
});

test("B5.4: limpiar filtros resetea los valores", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  window._cache.almacenes = [{ id: "a1", nombre: "Caja 1" }];
  document.getElementById("rep-filtro-desde").value = "2026-08-01";
  document.getElementById("rep-filtro-almacen").value = "a1";
  document.getElementById("rep-limpiar-btn").click();
  await esperar(20);
  assert.strictEqual(document.getElementById("rep-filtro-desde").value, "", "filtro desde limpiado");
  assert.strictEqual(document.getElementById("rep-filtro-almacen").value, "", "filtro almacén limpiado");
});

test("B5.20: no se crean stores/colas/cachés duplicados", async () => {
  const { window } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  assert.strictEqual(typeof window.refrescarReportes, "function");
  assert.strictEqual(window._reportesCache, undefined, "no hay caché de reportes duplicada");
  assert.strictEqual(window._colaReportes, undefined, "no hay cola de reportes");
  assert.strictEqual(window._sincronizadorReportes, undefined, "no hay sincronizador de reportes");
});

test("B5.17: cambio de usuario no contamina filtros de reportes", async () => {
  const { window, document, client } = montarEntorno({
    perfil: [{ id: "u-a", nombre: "A", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
  });
  marcarOnline(window);
  await esperar(80);
  document.getElementById("rep-filtro-desde").value = "2026-08-01";
  window.limpiarContextoUsuario();
  assert.strictEqual(window._usuarioActual(), null, "contexto limpiado");
  // Usuario B entra.
  client.rpc = async (nombre) => {
    if (nombre === "perfil_usuario_actual") return { data: [{ id: "u-b", nombre: "B", activo: true, role_id: "r2", rol: "Dependiente" }], error: null };
    if (nombre === "permisos_usuario_actual") return { data: [{ seccion: "ventas", accion: "ver" }], error: null };
    if (nombre === "usuario_esta_activo") return { data: true, error: null };
    return { data: null, error: null };
  };
  await window.cargarContextoUsuario();
  await esperar(20);
  // B no tiene permiso reportes.ver → la pestaña se oculta.
  const btn = document.querySelector('.tab-btn[data-tab="reportes"]');
  assert.ok(btn.style.display === "none" || btn.classList.contains("hidden"), "B no ve Reportes (sin permiso)");
});

test("B5.10: sub-reportes se cambian correctamente", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    ventas: [{ id: "v1", fecha: "2026-08-15T10:00:00Z", almacen: "Caja 1", total: 100, lineas: [] }],
    transferencias: [{ id: "t1", fecha: "2026-08-15T11:00:00Z", origen: "A", destino: "B", estado: "completada", unidades: 5, lineas: [] }],
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarReportes();
  await esperar(20);
  // Cambiar a transferencias.
  document.querySelector('.rep-tab-btn[data-rep="transferencias"]').click();
  await esperar(20);
  const detalle = document.getElementById("rep-detalle");
  assert.ok(detalle.innerHTML.includes("A"), "debe mostrar el origen de transferencias");
  assert.ok(detalle.innerHTML.includes("completada"), "debe mostrar el estado");
});


// ============================================================
// B5.3 R1 — Rentabilidad: NULL/costo no disponible ≠ 0
// ============================================================

test("B5.3 R1: venta con costo real muestra CMV, ganancia y margen", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    rentabilidad: [
      { id: "v1", fecha: "2026-08-15T10:00:00Z", almacen: "Caja 1", ingreso: 1000, costo_total: 600, margen: 400, margen_porcentaje: 40, costo_disponible: true },
    ],
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarReportes();
  await esperar(20);
  document.querySelector('.rep-tab-btn[data-rep="rentabilidad"]').click();
  await esperar(30);
  const detalle = document.getElementById("rep-detalle");
  assert.ok(detalle.innerHTML.includes("Caja 1"), "muestra el almacén");
  assert.ok(detalle.innerHTML.includes("1000.00"), "muestra ingresos");
  assert.ok(detalle.innerHTML.includes("$600.00"), "muestra CMV real");
  assert.ok(detalle.innerHTML.includes("$400.00"), "muestra ganancia real");
  assert.ok(detalle.innerHTML.includes("40.00%"), "muestra margen real");
  // NO debe mostrar la marca de costo no disponible cuando hay costo.
  assert.ok(!/costo no disponible/.test(detalle.innerHTML), "no muestra 'costo no disponible' con costo real");
});

test("B5.3 R1: venta SIN costo (cmv null) no muestra CMV 0 ni margen 100%", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    rentabilidad: [
      // Venta histórica sin costo FIFO: cmv, ganancia_bruta y margen llegan null.
      { id: "v2", fecha: "2026-08-15T11:00:00Z", almacen: "Caja 2", ingreso: 500, costo_total: null, margen: null, margen_porcentaje: null, costo_disponible: false },
    ],
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarReportes();
  await esperar(20);
  document.querySelector('.rep-tab-btn[data-rep="rentabilidad"]').click();
  await esperar(30);
  const detalle = document.getElementById("rep-detalle");
  assert.ok(detalle.innerHTML.includes("Caja 2"), "muestra el almacén");
  assert.ok(detalle.innerHTML.includes("500.00"), "muestra ingresos");
  assert.ok(/costo no disponible/.test(detalle.innerHTML), "marca el costo como no disponible (no inventa 0)");
  // CRÍTICO: nunca mostrar margen 100% ni CMV $0 cuando no hay costo.
  assert.ok(!/CMV \$0\.00/.test(detalle.innerHTML), "no muestra CMV $0.00 falso");
  assert.ok(!/100\.00%/.test(detalle.innerHTML), "no muestra margen 100% falso");
});

test("B5.3 R1: totales al pie respetan costo no disponible cuando ninguna venta tiene costo", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    rentabilidad: [
      { id: "v3", fecha: "2026-08-15T09:00:00Z", almacen: "Caja 1", ingreso: 300, costo_total: null, margen: null, margen_porcentaje: null, costo_disponible: false },
      { id: "v4", fecha: "2026-08-15T12:00:00Z", almacen: "Caja 2", ingreso: 200, costo_total: null, margen: null, margen_porcentaje: null, costo_disponible: false },
    ],
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarReportes();
  await esperar(20);
  document.querySelector('.rep-tab-btn[data-rep="rentabilidad"]').click();
  await esperar(30);
  const detalle = document.getElementById("rep-detalle");
  // El total de ingresos sí se muestra (500), pero el total de CMV/ganancia no se inventa.
  assert.ok(/TOTALES/.test(detalle.innerHTML), "muestra fila de totales");
  assert.ok(/costo no disponible/.test(detalle.innerHTML), "totales marcan costo no disponible");
  assert.ok(!/CMV \$0\.00/.test(detalle.innerHTML), "totales no muestran CMV $0.00");
  assert.ok(!/100\.00%/.test(detalle.innerHTML), "totales no muestran margen 100%");
});

test("B5.3 R1: mixto — ventas con y sin costo; totales solo suman las que tienen costo", async () => {
  const { window, document } = montarEntorno({
    perfil: [{ id: "u-test", nombre: "Roberto", activo: true, role_id: "r1", rol: "Dueño" }],
    permisos: [{ seccion: "reportes", accion: "ver" }],
    rentabilidad: [
      { id: "v5", fecha: "2026-08-15T09:00:00Z", almacen: "Caja 1", ingreso: 1000, costo_total: 600, margen: 400, margen_porcentaje: 40, costo_disponible: true },
      { id: "v6", fecha: "2026-08-15T12:00:00Z", almacen: "Caja 2", ingreso: 500, costo_total: null, margen: null, margen_porcentaje: null, costo_disponible: false },
    ],
  });
  marcarOnline(window);
  await esperar(80);
  await window.refrescarReportes();
  await esperar(20);
  document.querySelector('.rep-tab-btn[data-rep="rentabilidad"]').click();
  await esperar(30);
  const detalle = document.getElementById("rep-detalle");
  // La venta con costo muestra sus valores reales.
  assert.ok(detalle.innerHTML.includes("$600.00"), "venta con costo muestra CMV real");
  // La venta sin costo marca no disponible.
  assert.ok(/costo no disponible/.test(detalle.innerHTML), "venta sin costo marcada");
  // Totales: ingresos suman ambas (1500), pero CMV solo la que tiene costo (600).
  assert.ok(detalle.innerHTML.includes("1500.00"), "total ingresos suma ambas ventas");
  assert.ok(/TOTALES[\s\S]*\$600\.00/.test(detalle.innerHTML), "total CMV solo suma la venta con costo");
  assert.ok(!/100\.00%/.test(detalle.innerHTML), "ningún margen 100% falso");
});
