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
  // Post-submit UI refresh dependency; the test checks result payload/state, not summary rendering.
  window.renderResumen = () => {};
  window._cache = {
    transferencias: [],
    stock: [{ producto_id: "p-fixture", almacen_id: "a-fixture", cantidad: stock }]
  };
  // refrescarTransferencias performs a read after success; keep that path in-memory too.
  window.client = {
    from() {
      const query = {
        select() { return query; },
        order() { return query; },
        limit() { return Promise.resolve({ data: [], error: null }); }
      };
      return query;
    }
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
  // Values originate inside the JSDOM realm; normalize to plain Node objects
  // before structural comparison to avoid cross-realm prototype false negatives.
  assert.deepEqual(JSON.parse(JSON.stringify(c.calls[0])), {
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
  assert.ok(await esperarHasta(() => /Presentación creada/i.test(
    c.window.document.getElementById("msg-presentaciones").textContent
  )), "la UI debe completar el éxito antes de comprobar el reset");
  assert.deepEqual(c.inserts.find((x) => x.table === "presentaciones").payload, { nombre: "Caja fixture" });
  assert.equal(input.value, "", "el formulario se limpia tras el éxito simulado");
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
  product.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  assert.ok(await esperarHasta(() => Array.from(presentation.options).some((o) => o.value === "pres-fixture")),
    "la presentación fixture debe cargarse al elegir producto");
  presentation.value = "pres-fixture";

  factor.value = "0";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(c.inserts.some((x) => x.table === "producto_presentaciones"), false,
    "el factor cero debe bloquearse antes de escribir");

  factor.value = "12";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await esperarHasta(() => c.inserts.some((x) => x.table === "producto_presentaciones")),
    "la asociación válida debe llegar al cliente fixture");
  assert.ok(await esperarHasta(() => /Presentación agregada/i.test(
    c.window.document.getElementById("msg-presentaciones").textContent
  )), "la UI debe completar la asociación antes de comprobar el mensaje");
  assert.deepEqual(c.inserts.find((x) => x.table === "producto_presentaciones").payload,
    { producto_id: "p-fixture", presentacion_id: "pres-fixture", factor: 12 });
});


// RWHT-WAREHOUSE-MODAL-20261028
async function cargarModalAlmacenFixture(context) {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "m27-7-almacenes-modal.js"),
    "utf8"
  );
  Object.defineProperty(context.document, "readyState", { value: "complete", configurable: true });
  context.window.eval(source);
  assert.equal(typeof context.window.__BC_M277_openCreateAlmacen, "function",
    "el módulo real del modal de almacenes debe exponer el abridor en JSDOM");
  assert.equal(typeof context.window.__BC_M277_openEditAlmacen, "function",
    "el módulo real del modal de almacenes debe exponer el editor en JSDOM");
}

test("Paso 4 RWHT: modal de almacén rechaza nombre vacío y Cancelar no crea nada", async (t) => {
  const c = await contextoListo();
  await cargarModalAlmacenFixture(c);
  assert.equal(typeof c.window.__BC_M277_openCreateAlmacen, "function",
    "el runtime debe exponer el abridor del modal de alta");
  c.window.__BC_M277_openCreateAlmacen();
  const root = c.document.getElementById("bc-alm-modal");
  const nombre = c.document.getElementById("bc-alm-modal-nombre");
  const save = c.document.getElementById("bc-alm-modal-guardar");
  assert.ok(root && root.classList.contains("open"), "el diálogo de alta debe abrirse");
  assert.equal(c.document.getElementById("bc-alm-modal-title").textContent, "Nuevo almacén");
  const base = c.client.__writeCalls.length;

  nombre.value = "   ";
  save.click();
  assert.ok(await esperarHasta(() => /completá el nombre del almacén/i.test(
    c.document.getElementById("bc-alm-modal-status").textContent
  )), "el modal debe mostrar validación clara para nombre vacío");
  assert.equal(nuevasEscrituras(c, base).length, 0, "un alta inválida no puede ejecutar RPC");

  root.querySelector(".bc-alm-actions [data-bc-alm-close='1']").click();
  assert.equal(root.classList.contains("open"), false, "Cancelar debe cerrar el modal");
  assert.equal(nuevasEscrituras(c, base).length, 0, "Cancelar no puede crear almacén ni encolar operación");
});

test("Paso 4 RWHT: modal de almacén edita el ID fixture y envía cambios al RPC simulado", async (t) => {
  const c = await contextoListo();
  await cargarModalAlmacenFixture(c);
  c.window._cache.almacenes = [
    { id: "alm-edit-fixture", nombre: "Almacén original fixture", tipo: "almacenamiento", activo: true }
  ];
  assert.equal(typeof c.window.__BC_M277_openEditAlmacen, "function",
    "el runtime debe exponer el abridor del modal de edición");
  c.window.__BC_M277_openEditAlmacen("alm-edit-fixture");
  const root = c.document.getElementById("bc-alm-modal");
  const nombre = c.document.getElementById("bc-alm-modal-nombre");
  const tipo = root.querySelector(".bc-alm-tipo[data-tipo='mayorista']");
  assert.ok(root.classList.contains("open"), "la edición debe abrirse");
  assert.equal(c.document.getElementById("bc-alm-modal-id").value, "alm-edit-fixture",
    "el ID oculto debe conservar el registro que se está editando");
  assert.equal(nombre.value, "Almacén original fixture");
  nombre.value = "Almacén editado fixture";
  tipo.click();

  const base = c.client.__writeCalls.length;
  c.document.getElementById("bc-alm-modal-guardar").click();
  assert.ok(await esperarHasta(() => nuevasEscrituras(c, base).length > 0),
    "el formulario válido debe llegar al ejecutor RPC simulado");
  const call = nuevasEscrituras(c, base).find((item) => item.name === "editar_almacen");
  assert.ok(call, "el flujo de edición debe invocar editar_almacen");
  assert.equal(call.params.p_almacen_id, "alm-edit-fixture");
  assert.equal(call.params.p_nombre, "Almacén editado fixture");
  assert.equal(call.params.p_tipo, "mayorista");
  assert.ok(await esperarHasta(() => /Almacén actualizado/i.test(c.document.getElementById("bc-alm-modal-status").textContent)),
    "el modal debe anunciar el resultado correcto tras respuesta simulada");
});


// RWHT-UI-BATCH-20261028-B
test("Paso 4 RWHT: filtro de Responsabilidades envía estado y restaura la lista", async (t) => {
  const c = await contextoListo();
  const originalRpc = c.client.rpc.bind(c.client);
  const calls = [];
  const rows = [
    { id: "resp-pending-fixture", titulo: "Responsabilidad pendiente fixture", estado: "PENDIENTE", prioridad: "normal", descripcion: "fixture" },
    { id: "resp-done-fixture", titulo: "Responsabilidad completada fixture", estado: "COMPLETADA", prioridad: "normal", descripcion: "fixture" }
  ];
  c.client.rpc = async (name, params) => {
    if (name !== "listar_responsabilidades") return originalRpc(name, params);
    calls.push({ ...params });
    const filtered = params.p_estado ? rows.filter((r) => r.estado === params.p_estado) : rows;
    return { data: filtered, error: null };
  };
  const filter = c.document.getElementById("resp-filtro-estado");
  assert.ok(filter, "la UI debe exponer el filtro de estado");
  filter.value = "COMPLETADA";
  filter.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  assert.ok(await esperarHasta(() => calls.some((p) => p.p_estado === "COMPLETADA")),
    "cambiar el filtro debe enviar el estado al RPC");
  assert.ok(await esperarHasta(() => /Responsabilidad completada fixture/.test(
    c.document.getElementById("lista-responsabilidades").textContent
  )), "la lista debe mostrar el resultado filtrado");
  assert.doesNotMatch(c.document.getElementById("lista-responsabilidades").textContent, /Responsabilidad pendiente fixture/);

  filter.value = "";
  filter.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  assert.ok(await esperarHasta(() => calls.some((p) => p.p_estado === null)),
    "vaciar el filtro debe solicitar todos los estados");
  assert.ok(await esperarHasta(() => {
    const text = c.document.getElementById("lista-responsabilidades").textContent;
    return /Responsabilidad pendiente fixture/.test(text) && /Responsabilidad completada fixture/.test(text);
  }), "restaurar el filtro debe recuperar las dos filas fixture");
});

test("Paso 4 RWHT: filtros de Auditoría por tipo/estado y Limpiar restauran los resultados", async (t) => {
  const c = await contextoListo();
  const originalRpc = c.client.rpc.bind(c.client);
  const calls = [];
  const rows = [
    { id: "audit-sale-fixture", tipo: "venta", estado: "exito", descripcion: "Auditoría venta fixture", usuario_nombre: "Usuario fixture", fecha: "2026-10-28T10:00:00Z" },
    { id: "audit-transfer-fixture", tipo: "transferencia", estado: "error", descripcion: "Auditoría transferencia error fixture", usuario_nombre: "Usuario fixture", fecha: "2026-10-28T10:01:00Z" }
  ];
  c.client.rpc = async (name, params) => {
    if (name !== "listar_auditoria_admin") return originalRpc(name, params);
    calls.push({ ...params });
    const filtered = rows.filter((r) =>
      (!params.p_tipo || r.tipo === params.p_tipo) &&
      (!params.p_estado || r.estado === params.p_estado)
    );
    return { data: filtered, error: null };
  };
  const type = c.document.getElementById("filtro-aud-tipo");
  const state = c.document.getElementById("filtro-aud-estado");
  const clear = c.document.getElementById("aud-limpiar-btn");
  const list = c.document.getElementById("mando-auditoria");
  assert.ok(type && state && clear && list, "la UI debe exponer filtros, Limpiar y resultados");
  type.value = "venta";
  type.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  assert.ok(await esperarHasta(() => calls.some((p) => p.p_tipo === "venta")),
    "el selector de tipo debe volver a consultar con el valor seleccionado");
  assert.ok(await esperarHasta(() => /Auditoría venta fixture/.test(list.textContent)),
    "la lista debe mostrar la fila coincidente");
  assert.doesNotMatch(list.textContent, /Auditoría transferencia error fixture/);

  state.value = "error";
  state.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  assert.ok(await esperarHasta(() => calls.some((p) => p.p_tipo === "venta" && p.p_estado === "error")),
    "el selector de estado debe combinarse con el tipo activo");
  assert.ok(await esperarHasta(() => /Sin registros de auditoría/i.test(list.textContent)),
    "la combinación sin resultados debe mostrar el estado vacío, no datos incorrectos");

  clear.click();
  assert.ok(await esperarHasta(() => calls.some((p) => p.p_tipo === null && p.p_estado === null)),
    "Limpiar debe pedir la lista sin filtros");
  assert.ok(await esperarHasta(() => {
    const text = list.textContent;
    return /Auditoría venta fixture/.test(text) && /Auditoría transferencia error fixture/.test(text);
  }), "Limpiar debe restaurar las dos filas fixture");
});

test("Paso 4 RWHT: Nueva conversación abre el formulario y Volver recupera la lista", async (t) => {
  const c = await contextoListo();
  const originalRpc = c.client.rpc.bind(c.client);
  const calls = [];
  c.client.rpc = async (name, params) => {
    if (name === "listar_usuarios_para_chat") {
      calls.push({ name, params: { ...params } });
      return { data: [{ id: "chat-user-fixture", nombre: "Usuario chat fixture" }], error: null };
    }
    return originalRpc(name, params);
  };
  const panel = c.document.getElementById("com-nueva-panel");
  const newButton = c.document.getElementById("com-nueva-btn");
  const userSelect = c.document.getElementById("nueva-conv-usuario");
  const listColumn = c.document.getElementById("com-col-lista");
  const chatColumn = c.document.getElementById("com-col-chat");
  const back = c.document.getElementById("com-volver-btn");
  assert.ok(panel && newButton && userSelect && listColumn && chatColumn && back,
    "la UI debe exponer los controles de conversación");
  panel.classList.add("hidden");
  newButton.click();
  assert.ok(await esperarHasta(() => !panel.classList.contains("hidden")),
    "Nueva debe mostrar el formulario");
  assert.ok(await esperarHasta(() => calls.length > 0 && Array.from(userSelect.options).some((o) => o.value === "chat-user-fixture")),
    "el formulario debe cargar el catálogo de usuarios desde el RPC simulado");

  listColumn.classList.add("hidden");
  chatColumn.classList.remove("hidden");
  back.click();
  assert.equal(listColumn.classList.contains("hidden"), false, "Volver debe recuperar el listado");
  assert.equal(chatColumn.classList.contains("hidden"), true, "Volver debe ocultar el chat");
});

test("Paso 4 RWHT: alta de usuario valida campos y usa Edge Function fixture, nunca Auth real", async (t) => {
  const c = await contextoListo();
  Object.defineProperty(c.document, "readyState", { value: "complete", configurable: true });
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "js", "alta-usuario-sin-email.js"), "utf8");
  c.window.eval(source);
  assert.ok(await esperarHasta(() => {
    const form = c.document.getElementById("form-nuevo-usuario");
    return form && form.dataset.bcAltaSinEmail === "1" && c.document.getElementById("nuevo-usuario-rol");
  }, 2200, 25), "el handler de alta sin correo debe quedar conectado al formulario");

  const originalGetSession = c.client.auth.getSession.bind(c.client.auth);
  c.client.auth.getSession = async () => ({
    data: { session: { access_token: "fixture-only-token", user: { id: "user-owner-fixture" } } },
    error: null
  });
  const invokes = [];
  c.client.functions = {
    invoke: async (name, args) => {
      invokes.push({ name, body: { ...args.body } });
      return { data: { ok: true, user: { id: "new-user-fixture" } }, error: null };
    }
  };
  const form = c.document.getElementById("form-nuevo-usuario");
  const name = c.document.getElementById("nuevo-usuario-nombre");
  const password = c.document.getElementById("nuevo-usuario-password");
  const role = c.document.getElementById("nuevo-usuario-rol");
  const msg = c.document.getElementById("msg-nuevo-usuario");
  const option = c.document.createElement("option");
  option.value = "role-fixture";
  option.textContent = "Rol fixture";
  role.appendChild(option);

  name.value = "";
  password.value = "valid-pass-fixture";
  role.value = "role-fixture";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await esperarHasta(() => /usuario es obligatorio/i.test(msg.textContent)),
    "nombre vacío debe rechazarse");
  assert.equal(invokes.length, 0, "la validación no debe invocar Edge Function");

  name.value = "Usuario fixture";
  password.value = "123";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await esperarHasta(() => /al menos 6 caracteres/i.test(msg.textContent)),
    "contraseña corta debe rechazarse");
  assert.equal(invokes.length, 0, "la validación de contraseña no debe invocar Edge Function");

  password.value = "valid-pass-fixture";
  role.value = "";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await esperarHasta(() => /seleccionar un rol/i.test(msg.textContent)),
    "la ausencia de rol debe rechazarse");
  assert.equal(invokes.length, 0, "el rol obligatorio debe validarse antes de invocar");

  role.value = "role-fixture";
  form.dispatchEvent(new c.window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await esperarHasta(() => invokes.length === 1), "la alta válida debe invocar el mock una sola vez");
  assert.deepEqual(invokes[0], {
    name: "crear-usuario-sin-email",
    body: { nombre: "Usuario fixture", password: "valid-pass-fixture", role_id: "role-fixture" }
  });
  assert.ok(await esperarHasta(() => /Usuario creado correctamente/i.test(msg.textContent)),
    "la UI debe anunciar el éxito de la Edge Function fixture");
  assert.equal(name.value, "", "la UI debe limpiar el formulario tras el éxito");
});


// RWHT-WAREHOUSE-ACTIONS-20261029
test("Paso 4 RWHT 049-052/054: selector y menú de almacenes abren los modales reales con el ID seleccionado", async (t) => {
  const c = await contextoListo();
  const almacen = {
    id: "alm-actions-fixture",
    nombre: "Almacén acciones fixture",
    tipo: "almacenamiento",
    activo: true
  };
  c.window._cache.almacenes = [almacen];
  assert.equal(typeof c.window.llenarSelectorAlmacenes, "function",
    "el catálogo debe exponer su poblador de almacenes");
  c.window.llenarSelectorAlmacenes([almacen]);

  const selector = c.document.getElementById("alm-selector");
  const menu = c.document.getElementById("alm-acciones-menu");
  const abrirMenu = c.document.getElementById("alm-acciones-btn");
  const crear = c.document.getElementById("alm-crear-btn");
  const editar = c.document.getElementById("alm-editar-btn");
  const toggle = c.document.getElementById("alm-toggle-btn");

  assert.equal(selector.options.length, 2, "el selector debe incluir el fixture y la opción vacía");
  assert.equal(editar.disabled, true, "Editar queda bloqueado antes de seleccionar un almacén");
  assert.equal(toggle.disabled, true, "Activar/desactivar queda bloqueado antes de seleccionar un almacén");

  selector.value = almacen.id;
  selector.dispatchEvent(new c.window.Event("change", { bubbles: true }));
  assert.equal(selector.value, almacen.id, "el cambio conserva el ID seleccionado");
  assert.equal(editar.disabled, false, "Editar se habilita con una selección válida");
  assert.equal(toggle.disabled, false, "Activar/desactivar se habilita con una selección válida");
  assert.match(toggle.textContent, /Desactivar almacén/i, "el texto coincide con el estado activo");

  await cargarModalAlmacenFixture(c);
  abrirMenu.click();
  assert.equal(menu.classList.contains("hidden"), false, "Acciones abre el menú");
  abrirMenu.click();
  assert.equal(menu.classList.contains("hidden"), true, "Acciones vuelve a cerrar el menú");

  abrirMenu.click();
  crear.click();
  assert.equal(menu.classList.contains("hidden"), true, "Crear cierra el menú");
  assert.equal(c.document.getElementById("bc-alm-modal").classList.contains("open"), true,
    "Crear abre el modal real, no el formulario inline oculto");
  assert.equal(c.document.getElementById("bc-alm-modal-title").textContent, "Nuevo almacén");
  c.document.querySelector("#bc-alm-modal [data-bc-alm-close='1']").click();

  abrirMenu.click();
  editar.click();
  assert.equal(menu.classList.contains("hidden"), true, "Editar cierra el menú");
  assert.equal(c.document.getElementById("bc-alm-modal").classList.contains("open"), true,
    "Editar abre el modal real");
  assert.equal(c.document.getElementById("bc-alm-modal-id").value, almacen.id,
    "la edición conserva el ID seleccionado en el control oculto del modal");
  assert.equal(c.document.getElementById("alm-editando-id").value, "",
    "el ID del formulario inline heredado no se usa para la edición nueva");
});

test("Paso 4 RWHT 053: Activar/desactivar envía el almacén y el estado esperados al RPC mock", async (t) => {
  const c = await contextoListo();
  const almacen = {
    id: "alm-toggle-fixture",
    nombre: "Almacén toggle fixture",
    tipo: "almacenamiento",
    activo: true
  };
  c.window._cache.almacenes = [almacen];
  c.window.llenarSelectorAlmacenes([almacen]);
  const selector = c.document.getElementById("alm-selector");
  selector.value = almacen.id;
  selector.dispatchEvent(new c.window.Event("change", { bubbles: true }));

  const base = c.client.__writeCalls.length;
  c.document.getElementById("alm-toggle-btn").click();
  assert.ok(await esperarHasta(() => nuevasEscrituras(c, base).some((call) =>
    call.name === "activar_desactivar_almacen"
  )), "el botón debe llamar a la operación de estado simulada");

  const call = nuevasEscrituras(c, base).find((item) => item.name === "activar_desactivar_almacen");
  assert.equal(call.params.p_almacen_id, almacen.id);
  assert.equal(call.params.p_activo, false, "un almacén activo debe cambiar a inactivo");
});


// RWHT-COMMUNICATION-ACTIONS-20261029
test("Paso 4 RWHT 090: Soporte inicia una conversación del tipo correcto desde el botón visible", async (t) => {
  const c = await contextoListo();
  const soporte = c.document.getElementById("com-soporte-btn");
  assert.ok(soporte, "la acción Soporte debe existir en la interfaz");
  const base = c.client.__writeCalls.length;
  soporte.click();

  assert.ok(await esperarHasta(() => nuevasEscrituras(c, base).some((call) =>
    call.name === "crear_conversacion"
  )), "el botón debe iniciar una operación de creación simulada");
  const call = nuevasEscrituras(c, base).find((item) => item.name === "crear_conversacion");
  assert.equal(call.params.p_tipo, "SOPORTE");
  assert.equal(call.params.p_participante_id || null, null,
    "Soporte no debe inventar un participante privado");
  assert.ok(await esperarHasta(() =>
    c.document.getElementById("com-cerrar-btn").classList.contains("hidden") === false
  ), "al abrir soporte debe mostrarse el chat con su acción Cerrar");
});

test("Paso 4 RWHT 092: Cerrar conversación envía el ID actual y vuelve a la lista", async (t) => {
  const c = await contextoListo();
  const base = c.client.__rpcCalls.length;
  c.window.abrirConversacion("conversation-close-fixture", "SOPORTE");
  assert.ok(await esperarHasta(() =>
    c.document.getElementById("com-cerrar-btn").classList.contains("hidden") === false
  ), "abrir una conversación debe habilitar el botón Cerrar");

  c.document.getElementById("com-cerrar-btn").click();
  assert.ok(await esperarHasta(() => c.client.__rpcCalls.slice(base).some((call) =>
    call.name === "cerrar_conversacion"
  )), "Cerrar debe enviar la solicitud de cierre al cliente simulado");
  const call = c.client.__rpcCalls.slice(base).find((item) => item.name === "cerrar_conversacion");
  assert.equal(call.params.p_conversacion_id, "conversation-close-fixture");
  assert.ok(await esperarHasta(() =>
    c.document.getElementById("com-col-chat").classList.contains("hidden") === true &&
    c.document.getElementById("com-col-lista").classList.contains("hidden") === false
  ), "el cierre confirmado debe regresar del chat a la lista");
});


