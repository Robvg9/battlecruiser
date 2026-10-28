"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");

// Retain booted application JSDOMs until this isolated test process exits.
// Startup catalog/center refreshes are independent async work; closing them in
// per-test or file-level teardown can race those tasks. The test runner invokes
// this file in a dedicated --test-force-exit process, so process teardown is the
// deterministic cleanup boundary for these test-only browser contexts.
const contextosJSDOM = new Set();

const WRITE_RPCS = new Set([
  "crear_producto", "actualizar_producto", "registrar_compra", "registrar_venta",
  "crear_almacen", "editar_almacen", "activar_desactivar_almacen",
  "registrar_transferencia", "registrar_vale_salida", "abrir_turno", "cerrar_turno",
  "registrar_cuadre", "revisar_cuadre", "crear_responsabilidad",
  "actualizar_responsabilidad", "crear_incidencia", "resolver_incidencia",
  "crear_conversacion", "enviar_mensaje", "crear_usuario", "crear_rol",
  "crear_categoria", "crear_unidad"
]);

const PERMISSIONS = [
  "productos", "stock", "ventas", "almacenes", "transferencias", "vales",
  "turnos", "operacion", "comunicacion", "usuarios", "categorias",
  "unidades", "reportes", "auditoria", "inventario", "movimientos", "ciclos"
].flatMap((seccion) => ["ver", "crear", "editar", "borrar", "resolver", "aprobar"]
  .map((accion) => ({ seccion, accion })));

const TABLE_ROWS = {
  productos: [{
    id: "p-step4-fixture",
    nombre: "Producto de prueba aislado",
    unidad: "unidad",
    precio_normal: 10,
    precio_mayorista: null,
    activo: true,
    stock: 8
  }],
  almacenes: [
    { id: "a-step4-fixture", nombre: "Almacén fixture A", tipo: "almacenamiento", activo: true },
    { id: "b-step4-fixture", nombre: "Almacén fixture B", tipo: "minorista", activo: true }
  ],
  categorias: [{ id: "c-step4-fixture", nombre: "General" }],
  unidades: [{ id: "u-step4-fixture", nombre: "unidad" }]
};

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esperarHasta(condicion, timeoutMs = 4000, intervaloMs = 20) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condicion()) return true;
    await esperar(intervaloMs);
  }
  return Boolean(condicion());
}

function queryBuilder(rows) {
  const result = { data: rows, error: null };
  let proxy;
  proxy = new Proxy({}, {
    get(_target, property) {
      if (property === "then") {
        return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      }
      if (property === "single" || property === "maybeSingle") {
        return async () => ({ data: rows.length ? rows[0] : null, error: null });
      }
      if (property === "throwOnError") return () => proxy;
      return () => proxy;
    }
  });
  return proxy;
}

function crearClienteSupabaseMock() {
  const rpcCalls = [];
  let idSequence = 0;
  const validaciones = [];
  const writes = {
    crear_producto: { id: "p-created-fixture" },
    actualizar_producto: { id: "p-updated-fixture" },
    registrar_compra: { id: "purchase-fixture" },
    registrar_venta: { id: "sale-fixture" },
    crear_almacen: { id: "warehouse-created-fixture" },
    editar_almacen: { id: "warehouse-edited-fixture" },
    activar_desactivar_almacen: { id: "warehouse-status-fixture" },
    registrar_transferencia: { id: "transfer-fixture" },
    registrar_vale_salida: { id: "vale-fixture" },
    abrir_turno: { id: "turno-fixture", estado: "ABIERTO" },
    cerrar_turno: { id: "turno-fixture", estado: "CERRADO" },
    registrar_cuadre: { id: "cuadre-fixture" },
    revisar_cuadre: { id: "cuadre-fixture" },
    crear_responsabilidad: { id: "responsabilidad-fixture", estado: "PENDIENTE" },
    actualizar_responsabilidad: { id: "responsabilidad-fixture", estado: "COMPLETADA" },
    crear_incidencia: { id: "incidencia-fixture", estado: "ABIERTA" },
    resolver_incidencia: { id: "incidencia-fixture", estado: "RESUELTA" },
    crear_conversacion: { id: "conversacion-fixture" },
    enviar_mensaje: { id: "mensaje-fixture" },
    crear_usuario: { id: "usuario-fixture" },
    crear_rol: { id: "rol-fixture" },
    crear_categoria: { id: "categoria-fixture" },
    crear_unidad: { id: "unidad-fixture" }
  };

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "user-step4-fixture", email: "owner@example.invalid" } } },
        error: null
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { user: { id: "user-step4-fixture" } }, error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: { id: "user-step4-fixture" } }, error: null })
    },
    rpc: async (name, params = {}) => {
      rpcCalls.push({ name, params });
      if (name === "perfil_usuario_actual") {
        return {
          data: [{
            id: "user-step4-fixture",
            user_id: "user-step4-fixture",
            nombre: "Propietario fixture",
            email: "owner@example.invalid",
            activo: true,
            role_id: "role-fixture",
            rol: "Dueño"
          }],
          error: null
        };
      }
      if (name === "permisos_usuario_actual") return { data: PERMISSIONS, error: null };
      if (name === "usuario_esta_activo") return { data: true, error: null };
      if (name === "turno_actual_usuario") return { data: null, error: null };
      if (name === "listar_usuarios_para_chat") {
        return { data: [{ id: "chat-user-fixture", nombre: "Usuario fixture" }], error: null };
      }
      if (name === "registrar_auditoria") return { data: 1, error: null };
      if (name === "tiene_permiso") return { data: true, error: null };
      if (WRITE_RPCS.has(name)) {
        validaciones.push({ name, params });
        idSequence += 1;
        if (name === "crear_producto") return { data: "p-created-fixture", error: null };
        return { data: Object.assign({}, writes[name], { fixture_sequence: idSequence }), error: null };
      }
      if (name.startsWith("listar_") || name.startsWith("reporte_")) return { data: [], error: null };
      return { data: [], error: null };
    },
    from(table) {
      return queryBuilder(TABLE_ROWS[table] || []);
    },
    storage: {
      from() {
        return {
          upload: async () => ({ data: null, error: null }),
          remove: async () => ({ data: null, error: null }),
          getPublicUrl: () => ({ data: { publicUrl: "https://example.invalid/fixture.png" } })
        };
      }
    },
    __rpcCalls: rpcCalls,
    __writeCalls: validaciones
  };
  return client;
}

function crearContexto() {
  let html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  html = html.replace(/<script[^>]*src="https:\/\/cdn[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="app\.js(?:\?[^"]*)?"[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="js\/[^"]*\.js(?:\?[^"]*)?"[^>]*><\/script>/g, "");

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://battlecruiser-step4.test/",
    pretendToBeVisual: true
  });
  contextosJSDOM.add(dom);
  const window = dom.window;
  const document = window.document;
  // Keep each JSDOM realm isolated. Assigning these to Node global makes late
  // startup callbacks from an earlier context use another test's document.

  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window, "caches", {
    value: { keys: async () => [], delete: async () => true, open: async () => ({}) },
    configurable: true
  });
  Object.defineProperty(window, "serviceWorker", {
    value: { getRegistrations: async () => [], register: async () => ({ unregister: async () => true }) },
    configurable: true
  });
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  window.confirm = () => false;
  window.alert = () => {};
  window.prompt = () => "";
  if (typeof window.crypto.randomUUID !== "function") {
    let sequence = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: () => "step4-mock-uuid-" + (++sequence)
    });
  }

  const client = crearClienteSupabaseMock();
  window.supabase = { createClient: () => client };

  let appJs = require("./_leer-app-js").leerAppJsConcatenado(__dirname);
  appJs = appJs
    .replace(/const _cache = \{/, "window._cache = {")
    .replace(/let _operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];")
    .replace(/return _operacionesPendientesCache;/, "return window._operacionesPendientesCache;")
    .replace(/_operacionesPendientesCache = combinadas;/, "window._operacionesPendientesCache = combinadas;")
    .replace(/_operacionesPendientesCache = \[\];/, "window._operacionesPendientesCache = [];");
  appJs += [
    "",
    ";window.__bcTestPermisosCargaExitosa = function () {",
    " return typeof _permisosCargaExitosa !== 'undefined' && _permisosCargaExitosa;",
    "};"
  ].join("\n");

  const script = document.createElement("script");
  script.textContent = appJs;
  document.body.appendChild(script);

  // These tests verify form validation/payloads, not background stock/connectivity updates.
  // Override global callbacks before pending promise jobs execute and touch a closed JSDOM document.
  window.marcarConectividadReal = () => {};
  window.actualizarIndicadorConexion = () => {};
  window.cargarStockAlmacenes = async () => [];
  window.refrescarStockYSelects = async () => ({});

  const shell = document.getElementById("app-shell");
  if (shell) shell.classList.add("visible");

  return { dom, window, document, client };
}

async function contextoListo() {
  const context = crearContexto();
  const listo = await esperarHasta(() => {
    const window = context.window;
    const user = typeof window._usuarioActual === "function"
      ? window._usuarioActual()
      : window._usuarioActual;
    return Boolean(user) &&
      typeof window.tienePermiso === "function" &&
      window.tienePermiso("productos", "crear") &&
      typeof window.__bcTestPermisosCargaExitosa === "function" &&
      window.__bcTestPermisosCargaExitosa();
  }, 6500, 25);
  assert.ok(listo, "el entorno JSDOM debe cargar el usuario fixture y sus permisos");
  await esperar(80);
  return context;
}

function addOption(select, value, label) {
  if (!Array.from(select.options).some((option) => option.value === value)) {
    const option = select.ownerDocument.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
}

function enviarSubmit(context, formId) {
  const form = context.document.getElementById(formId);
  assert.ok(form, "el formulario " + formId + " debe existir en la UI");
  form.dispatchEvent(new context.window.Event("submit", { bubbles: true, cancelable: true }));
  return form;
}

function nuevasEscrituras(context, baseIndex) {
  return context.client.__writeCalls.slice(baseIndex);
}

test("Paso 4 UI: producto rechaza precio normal no positivo sin llamar al backend mock", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  const base = c.client.__writeCalls.length;
  c.document.getElementById("prod-nombre").value = "Producto inválido fixture";
  c.document.getElementById("prod-precio-normal").value = "0";
  c.document.getElementById("prod-precio-mayorista").value = "";
  enviarSubmit(c, "form-producto");
  assert.ok(await esperarHasta(() => /precio normal debe ser mayor a 0/i.test(c.document.getElementById("msg-productos").textContent)),
    "la UI debe mostrar el motivo del rechazo");
  assert.equal(nuevasEscrituras(c, base).some((call) => call.name === "crear_producto"), false,
    "una entrada inválida nunca debe llegar al RPC de escritura");
});

test("Paso 4 UI: producto válido envía el payload por el RPC mock y limpia el formulario", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  const base = c.client.__writeCalls.length;
  c.document.getElementById("prod-nombre").value = "Producto UI fixture";
  c.document.getElementById("prod-unidad").value = "unidad";
  c.document.getElementById("prod-precio-normal").value = "12.50";
  c.document.getElementById("prod-precio-mayorista").value = "";
  const presentacionMinorista = c.document.getElementById("prod-pres-min");
  assert.ok(presentacionMinorista, "la UI debe exponer la presentación minorista obligatoria");
  addOption(presentacionMinorista, "pres-min-fixture", "Unidad fixture");
  presentacionMinorista.value = "pres-min-fixture";
  enviarSubmit(c, "form-producto");

  const reachedCreate = await esperarHasta(() => nuevasEscrituras(c, base).some((call) => call.name === "crear_producto"));
  assert.ok(reachedCreate,
    "el submit real del DOM debe llegar a crear_producto en el cliente mock; mensaje=" +
    c.document.getElementById("msg-productos").textContent +
    "; RPC recientes=" + JSON.stringify(c.client.__rpcCalls.slice(-12)) +
    "; escrituras nuevas=" + JSON.stringify(nuevasEscrituras(c, base)));
  const call = nuevasEscrituras(c, base).find((item) => item.name === "crear_producto");
  assert.equal(call.params.p_nombre, "Producto UI fixture");
  assert.equal(call.params.p_unidad, "unidad");
  assert.equal(call.params.p_precio_normal, 12.5);
  assert.ok(call.params.p_idempotency_key, "el RPC debe recibir la clave de idempotencia");
  assert.ok(await esperarHasta(() => /Producto creado con presentación minorista/i.test(c.document.getElementById("msg-productos").textContent)),
    "la UI debe anunciar éxito tras la respuesta mock");
  assert.equal(c.document.getElementById("prod-nombre").value, "", "el formulario debe resetearse tras éxito");
});

test("Paso 4 UI: compra rechaza costo cero sin registrar una compra", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  addOption(c.document.getElementById("compra-producto"), "p-step4-fixture", "Producto fixture");
  addOption(c.document.getElementById("compra-almacen"), "a-step4-fixture", "Almacén fixture");
  c.document.getElementById("compra-presentacion").value = "";
  c.document.getElementById("compra-cantidad").value = "2";
  c.document.getElementById("compra-costo").value = "0";
  const base = c.client.__writeCalls.length;
  enviarSubmit(c, "form-compra");
  assert.ok(await esperarHasta(() => /costo debe ser mayor a 0/i.test(c.document.getElementById("msg-productos").textContent)),
    "la UI debe rechazar costo cero con un mensaje");
  assert.equal(nuevasEscrituras(c, base).some((call) => call.name === "registrar_compra"), false,
    "la validación debe cortar antes del RPC de compra");
});

test("Paso 4 UI: compra válida envía cantidades/costo al RPC simulado, nunca a producción", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  addOption(c.document.getElementById("compra-producto"), "p-step4-fixture", "Producto fixture");
  addOption(c.document.getElementById("compra-almacen"), "a-step4-fixture", "Almacén fixture");
  c.document.getElementById("compra-presentacion").value = "";
  c.document.getElementById("compra-cantidad").value = "2";
  c.document.getElementById("compra-costo").value = "4.75";
  const base = c.client.__writeCalls.length;
  enviarSubmit(c, "form-compra");

  assert.ok(await esperarHasta(() => nuevasEscrituras(c, base).some((call) => call.name === "registrar_compra")),
    "el submit del formulario debe invocar registrar_compra en el cliente mock");
  const call = nuevasEscrituras(c, base).find((item) => item.name === "registrar_compra");
  assert.equal(call.params.p_producto_id, "p-step4-fixture");
  assert.equal(call.params.p_almacen_id, "a-step4-fixture");
  assert.equal(call.params.p_cantidad, 2);
  assert.equal(call.params.p_costo_unitario, 4.75);
  assert.ok(call.params.p_idempotency_key, "la compra debe usar idempotency_key");
});

test("Paso 4 UI: almacén rechaza nombre/tipo vacíos sin enviar RPC", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  // Form visibility is unrelated to required-field validation; avoid modal boot side effects.
  c.document.getElementById("alm-nombre").value = " ";
  c.document.getElementById("alm-tipo").value = "";
  const base = c.client.__writeCalls.length;
  enviarSubmit(c, "form-almacen");
  assert.ok(await esperarHasta(() => /completá nombre y tipo/i.test(c.document.getElementById("msg-almacenes").textContent)),
    "la UI debe indicar que nombre y tipo son obligatorios");
  assert.equal(nuevasEscrituras(c, base).some((call) => call.name === "crear_almacen"), false,
    "un almacén inválido no puede producir escritura");
});

test("Paso 4 UI: almacén válido envía nombre/tipo por el RPC mock y confirma resultado", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  c.document.getElementById("form-almacen").classList.remove("hidden");
  c.document.getElementById("alm-nombre").value = "Almacén UI fixture";
  c.document.getElementById("alm-tipo").value = "almacenamiento";
  const base = c.client.__writeCalls.length;
  enviarSubmit(c, "form-almacen");

  assert.ok(await esperarHasta(() => nuevasEscrituras(c, base).some((call) => call.name === "crear_almacen")),
    "el submit debe invocar crear_almacen en el cliente mock");
  const call = nuevasEscrituras(c, base).find((item) => item.name === "crear_almacen");
  assert.equal(call.params.p_nombre, "Almacén UI fixture");
  assert.ok(call.params.p_tipo, "el tipo de almacén debe enviarse");
  assert.ok(call.params.p_idempotency_key, "el alta debe llevar clave de idempotencia");
});

test("Paso 4 UI: transferencia con el mismo origen/destino se rechaza antes de confirmar/escribir", async (t) => {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<form id='form-transferencia'>" +
        "<select id='trf-origen'><option value='a-step4-fixture'>Almacén A</option></select>" +
        "<select id='trf-destino'><option value='a-step4-fixture'>Almacén A</option></select>" +
        "<select id='trf-producto'><option value='p-step4-fixture'>Producto fixture</option></select>" +
        "<input id='trf-cantidad' value='1'>" +
        "<button type='submit'>Registrar transferencia</button>" +
      "</form>" +
      "<p id='msg-transferencias'></p>" +
    "</body></html>",
    { url: "https://battlecruiser-transfer-validation.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  const rpcCalls = [];
  window.safeInit = (_name, callback) => callback();
  window.tienePermiso = (seccion, accion) => seccion === "transferencias" && accion === "crear";
  window.setMsg = (id, message) => { window.document.getElementById(id).textContent = message; };
  window.setLoading = () => {};
  window.setEmpty = () => {};
  window.actualizarContador = () => {};
  window.refrescarTransferencias = async () => {};
  window.refrescarStockYSelects = async () => {};
  window.ejecutarOperacion = async (...args) => { rpcCalls.push(args); return { ok: true, data: "fixture" }; };
  window._cache = { transferencias: [], stock: [] };
  window.confirm = () => { throw new Error("No debe pedir confirmación para una transferencia inválida"); };

  const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "transferencias.js"), "utf8");
  window.eval(source);
  t.after(() => window.close());

  const form = window.document.getElementById("form-transferencia");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(window.document.getElementById("msg-transferencias").textContent,
    "El origen y el destino no pueden ser el mismo almacén.");
  assert.equal(rpcCalls.length, 0, "la validación no debe llamar a ejecutarOperacion");
});
test("Paso 4 UI: responsabilidad válida utiliza el RPC mock y conserva la prioridad", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  c.document.getElementById("resp-titulo").value = "Responsabilidad fixture";
  c.document.getElementById("resp-desc").value = "Descripción de prueba";
  c.document.getElementById("resp-prioridad").value = "alta";
  const base = c.client.__writeCalls.length;
  enviarSubmit(c, "form-responsabilidad");

  assert.ok(await esperarHasta(() => nuevasEscrituras(c, base).some((call) => call.name === "crear_responsabilidad")),
    "la UI debe enviar una responsabilidad válida al mock");
  const call = nuevasEscrituras(c, base).find((item) => item.name === "crear_responsabilidad");
  assert.equal(call.params.p_titulo, "Responsabilidad fixture");
  assert.equal(call.params.p_descripcion, "Descripción de prueba");
  assert.equal(call.params.p_prioridad, "alta");
  assert.ok(call.params.p_idempotency_key);
});

test("Paso 4 UI: incidencia válida utiliza el RPC mock y envía tipo/descrición", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  c.document.getElementById("inc-tipo").value = "faltante";
  c.document.getElementById("inc-desc").value = "Incidencia fixture";
  const base = c.client.__writeCalls.length;
  enviarSubmit(c, "form-incidencia");

  assert.ok(await esperarHasta(() => nuevasEscrituras(c, base).some((call) => call.name === "crear_incidencia")),
    "la UI debe enviar una incidencia válida al mock");
  const call = nuevasEscrituras(c, base).find((item) => item.name === "crear_incidencia");
  assert.equal(call.params.p_tipo, "faltante");
  assert.equal(call.params.p_descripcion, "Incidencia fixture");
  assert.ok(call.params.p_idempotency_key);
});

test("Paso 4 UI: conversación privada sin participante se bloquea sin crear registro", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  c.document.getElementById("nueva-conv-tipo").value = "PRIVADA";
  c.document.getElementById("nueva-conv-usuario").value = "";
  c.document.getElementById("nueva-conv-titulo").value = "Privada incompleta fixture";
  const base = c.client.__writeCalls.length;
  enviarSubmit(c, "form-nueva-conv");

  assert.ok(await esperarHasta(() => /elegí un usuario para la conversación privada/i.test(c.document.getElementById("msg-nueva-conv").textContent)),
    "la UI debe exigir participante en conversación privada");
  assert.equal(nuevasEscrituras(c, base).some((call) => call.name === "crear_conversacion"), false,
    "conversación privada incompleta no puede alcanzar escritura");
});

test("Paso 4 UI: mensaje sin conversación seleccionada se bloquea sin enviar RPC", async (t) => {
  const c = await contextoListo();
  // Keep the booted JSDOM alive: unrelated startup refreshes may still resolve after this assertion.
  c.document.getElementById("mensaje-input").value = "Mensaje fixture sin conversación";
  const base = c.client.__writeCalls.length;
  enviarSubmit(c, "form-mensaje");

  assert.ok(await esperarHasta(() => /abrí una conversación primero/i.test(c.document.getElementById("msg-mensaje").textContent)),
    "la UI debe indicar que no hay conversación seleccionada");
  assert.equal(nuevasEscrituras(c, base).some((call) => call.name === "enviar_mensaje"), false,
    "no se envía mensaje si no hay conversación activa");
});


// RWHT-FIXTURE-BATCH-20261028
// Additional isolated UI tests. All writes below terminate in in-memory mocks;
// no test calls a production Supabase endpoint or changes live business data.

function crearContextoTransferenciaFixture({ stock = 8, confirm = true, result = { ok: true, data: "transfer-fixture" } } = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<form id='form-transferencia'>" +
        "<select id='trf-origen'><option value='a-fixture'>Almacén A fixture</option></select>" +
        "<select id='trf-destino'><option value='b-fixture'>Almacén B fixture</option></select>" +
        "<select id='trf-producto'><option value='p-fixture'>Producto fixture</option></select>" +
        "<input id='trf-cantidad' value='2'>" +
        "<button type='submit'>Transferir</button>" +
      "</form>" +
      "<p id='trf-stock-disponible'></p><p id='msg-transferencias'></p>" +
      "<div id='lista-transferencias'></div><span id='trf-contador'></span>" +
    "</body></html>",
    { url: "https://battlecruiser-transfer-fixture.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  const calls = [];
  let confirmations = 0;
  window.safeInit = (_selector, callback) => callback();
  window.tienePermiso = (section, action) => section === "transferencias" && action === "crear";
  window.setMsg = (id, message) => { const node = window.document.getElementById(id); if (node) node.textContent = message; };
  window.setLoading = () => {};
  window.setEmpty = (id, message) => { const node = window.document.getElementById(id); if (node) node.textContent = message; };
  window.actualizarContador = () => {};
  window.escHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  window.fechaCorta = (value) => String(value ?? "");
  window.idCorto = (value) => String(value ?? "").slice(0, 8);
  window.money = (value) => String(value ?? 0);
  window.refrescarTransferencias = async () => {};
  window.refrescarStockYSelects = async () => {};
  window.refrescarOperacionesPendientesCache = async () => [];
  window._cache = {
    transferencias: [],
    stock: [{ producto_id: "p-fixture", almacen_id: "a-fixture", cantidad: stock }]
  };
  window.confirm = () => { confirmations += 1; return confirm; };
  window.ejecutarOperacion = async (type, payload) => {
    calls.push({ type, payload });
    return result;
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "transferencias.js"), "utf8");
  window.eval(source);
  return { dom, window, calls, get confirmations() { return confirmations; } };
}

test("Paso 4 RWHT: transferencia válida envía origen/destino/producto/cantidad y solo un submit", async (t) => {
  const c = crearContextoTransferenciaFixture();
  t.after(() => c.dom.window.close());
  const form = c.window.document.getElementById("form-transferencia");
  const submit = form.querySelector("button[type='submit']");
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));

  assert.ok(await esperarHasta(() => c.calls.length === 1), "un único submit debe llegar al ejecutor simulado");
  assert.ok(await esperarHasta(() => /Transferencia registrada/i.test(c.window.document.getElementById("msg-transferencias").textContent)),
    "la respuesta correcta debe quedar reflejada en la interfaz");
  assert.deepEqual(c.calls[0], {
    type: "transferencia",
    payload: {
      p_origen_id: "a-fixture",
      p_destino_id: "b-fixture",
      p_lineas: [{ producto_id: "p-fixture", cantidad: 2 }]
    }
  });
  assert.equal(c.confirmations, 1, "la segunda pulsación no debe abrir otra confirmación");
  assert.equal(submit.disabled, false, "el botón debe habilitarse al finalizar");
  assert.equal(submit.textContent, "Transferir", "el texto original se debe restaurar");
});

test("Paso 4 RWHT: cantidad cero/negativa o superior al stock se bloquea sin confirmar ni ejecutar", async (t) => {
  for (const caso of [
    { cantidad: "0", stock: 8, esperado: /cantidad debe ser mayor a 0/i },
    { cantidad: "-1", stock: 8, esperado: /cantidad debe ser mayor a 0/i },
    { cantidad: "9", stock: 8, esperado: /stock insuficiente/i }
  ]) {
    const c = crearContextoTransferenciaFixture({ stock: caso.stock });
    t.after(() => c.dom.window.close());
    c.window.document.getElementById("trf-cantidad").value = caso.cantidad;
    c.window.document.getElementById("form-transferencia").dispatchEvent(
      new c.window.Event("submit", { bubbles: true, cancelable: true })
    );
    assert.ok(caso.esperado.test(c.window.document.getElementById("msg-transferencias").textContent),
      "debe mostrar el rechazo correcto para cantidad=" + caso.cantidad);
    assert.equal(c.calls.length, 0, "el dato inválido no debe llegar al ejecutor");
    assert.equal(c.confirmations, 0, "el dato inválido no debe pedir confirmación");
  }
});

function crearContextoPresentacionesFixture({ presentaciones = [] } = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<section class='presentaciones-panel'>" +
        "<form id='form-presentacion-nueva'><input id='pres-nombre-nueva'><button type='submit'>Crear presentación</button></form>" +
        "<p id='msg-presentaciones'></p><div id='lista-presentaciones-catalogo'></div>" +
        "<select id='pp-producto-select'><option value=''>Elegí producto</option><option value='p-fixture'>Producto fixture</option></select>" +
        "<form id='form-pp-nueva' class='hidden'><select id='pp-presentacion-select'><option value=''>Elegí presentación</option></select>" +
        "<input id='pp-factor' type='number'><button type='submit'>Agregar presentación al producto</button></form>" +
        "<div id='pp-lista-asociaciones'></div>" +
      "</section></body></html>",
    { url: "https://battlecruiser-presentaciones-fixture.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  const database = {
    presentaciones: presentaciones.map((p) => ({ ...p })),
    producto_presentaciones: []
  };
  const inserts = [];
  let sequence = 0;
  window.safeInit = (_selector, callback) => callback();
  window.tienePermiso = () => true;
  window.setMsg = (id, message) => { const node = window.document.getElementById(id); if (node) node.textContent = message; };
  window.setLoading = (id, message) => { const node = window.document.getElementById(id); if (node) node.textContent = message; };
  window.setEmpty = (id, message) => { const node = window.document.getElementById(id); if (node) node.textContent = message; };
  window.mensajeListaVacia = (_key, message) => message;
  window.escHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  window.fillSelect = (select, rows, valueKey, labelFn) => {
    select.innerHTML = "";
    const placeholder = window.document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Elegí…";
    select.appendChild(placeholder);
    (rows || []).forEach((row) => {
      const option = window.document.createElement("option");
      option.value = row[valueKey];
      option.textContent = labelFn(row);
      select.appendChild(option);
    });
  };
  window.withCache = async (_key, callback) => {
    const result = await callback();
    return result?.data ?? [];
  };
  window.client = {
    rpc: async () => ({ data: true, error: null }),
    from(table) {
      const query = {
        select() { return query; },
        order() { return query; },
        eq() { return query; },
        insert(payload) {
          inserts.push({ table, payload: { ...payload } });
          sequence += 1;
          const row = { id: "presentation-write-fixture-" + sequence, ...payload, activo: true };
          if (table === "presentaciones") database.presentaciones.push(row);
          if (table === "producto_presentaciones") {
            row.presentaciones = database.presentaciones.find((p) => p.id === payload.presentacion_id) || { nombre: "Presentación fixture" };
            database.producto_presentaciones.push(row);
          }
          return Promise.resolve({ data: row, error: null });
        },
        then(resolve, reject) {
          let rows = database[table] || [];
          if (table === "producto_presentaciones") rows = rows.map((row) => ({
            ...row,
            presentaciones: row.presentaciones || database.presentaciones.find((p) => p.id === row.presentacion_id) || { nombre: "Presentación fixture" }
          }));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "presentaciones.js"), "utf8");
  window.eval(source);
  return { dom, window, database, inserts };
}

test("Paso 4 RWHT: crear presentación valida nombre y envía el payload al mock", async (t) => {
  const c = crearContextoPresentacionesFixture();
  t.after(() => c.dom.window.close());
  await c.window.inicializarPresentaciones();
  const form = c.window.document.getElementById("form-presentacion-nueva");
  const input = c.window.document.getElementById("pres-nombre-nueva");

  input.value = "   ";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(c.inserts.length, 0, "un nombre vacío no debe escribir");

  input.value = "Caja fixture";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await esperarHasta(() => c.inserts.some((x) => x.table === "presentaciones")),
    "el formulario válido debe insertar en el cliente fixture");
  assert.deepEqual(c.inserts.find((x) => x.table === "presentaciones").payload, { nombre: "Caja fixture" });
  assert.equal(input.value, "", "el formulario se limpia tras el éxito simulado");
  assert.match(c.window.document.getElementById("msg-presentaciones").textContent, /Presentación creada/i);
});

test("Paso 4 RWHT: asociar presentación exige producto/presentación/factor válido y envía payload al mock", async (t) => {
  const c = crearContextoPresentacionesFixture({
    presentaciones: [{ id: "pres-fixture", nombre: "Caja fixture", activo: true }]
  });
  t.after(() => c.dom.window.close());
  await c.window.inicializarPresentaciones();
  const form = c.window.document.getElementById("form-pp-nueva");
  const product = c.window.document.getElementById("pp-producto-select");
  const presentation = c.window.document.getElementById("pp-presentacion-select");
  const factor = c.window.document.getElementById("pp-factor");
  product.value = "p-fixture";
  presentation.value = "pres-fixture";

  factor.value = "0";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(c.inserts.some((x) => x.table === "producto_presentaciones"), false,
    "el factor cero debe bloquearse antes de escribir");

  factor.value = "12";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await esperarHasta(() => c.inserts.some((x) => x.table === "producto_presentaciones")),
    "la asociación válida debe llegar al cliente fixture");
  assert.deepEqual(c.inserts.find((x) => x.table === "producto_presentaciones").payload,
    { producto_id: "p-fixture", presentacion_id: "pres-fixture", factor: 12 });
  assert.match(c.window.document.getElementById("msg-presentaciones").textContent, /Presentación agregada/i);
});
