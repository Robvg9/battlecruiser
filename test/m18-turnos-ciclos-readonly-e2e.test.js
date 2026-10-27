"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m18-ciclos-ux.js"),
  "utf8"
);

const WRITE_RPCS = new Set([
  "crear_ciclo_operativo",
  "iniciar_ciclo_operativo",
  "iniciar_validacion_ciclo_operativo",
  "declarar_entrega_caja",
  "editar_entrega_caja",
  "registrar_recepcion_entrega_caja",
  "revisar_entrega_caja",
  "declarar_entrega_inventario_turno",
  "aceptar_entrega_inventario_turno",
  "finalizar_ciclo_operativo"
]);

const CYCLE = {
  id: "cycle-fixture-1",
  almacen_id: "warehouse-cueva",
  almacen_nombre: "La Cueva",
  usuario_nombre: "Dueño fixture",
  cantidad_dias: 7,
  inicio_plan: "2026-10-20",
  fin_plan: "2026-10-26",
  estado: "ACTIVO"
};

const SESSIONS = [
  {
    id: "session-fixture-1",
    ciclo_id: CYCLE.id,
    dia_n: 1,
    bloque: "MANANA",
    fecha: "2026-10-20",
    estado: "EN_CURSO",
    usuario_nombre: "Responsable fixture"
  }
];

const CUADRE = {
  compras: 120,
  ventas: 350,
  gastos: 10,
  reinversiones: 15,
  mermas: 1,
  bajas: 0,
  entradas: 4,
  dinero_esperado: 345,
  dinero_entregado: 345,
  diferencia: 0,
  inventario_inicial: [{ producto_nombre: "Producto fixture" }]
};

async function waitFor(predicate, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function createContext(t, options = {}) {
  const dom = new JSDOM(
    "<!doctype html><html lang=\"es\"><head></head><body>" +
      "<button class=\"tab-btn\" data-tab=\"turnos\">Turnos legado</button>" +
      "<button class=\"tab-btn\" data-tab=\"ciclos\">Ciclos Operativos</button>" +
      "<section id=\"tab-turnos\" class=\"tab-panel visible\"></section>" +
      "<section id=\"tab-ciclos\" class=\"tab-panel\">" +
        "<div class=\"pendientes-header\"><h3>Ciclos Operativos</h3></div>" +
        "<div class=\"mando-filtros\">legacy filter</div>" +
        "<div class=\"cc-bloque\">legacy block</div>" +
        "<div id=\"ciclo-detalle\">legacy detail</div>" +
        "<p id=\"msg-ciclos\">legacy message</p>" +
        "<div id=\"ciclos-m18-root\"></div>" +
      "</section></body></html>",
    {
      url: "https://battlecruiser-turnos.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: "complete"
  });

  const rpcCalls = [];
  const prompts = [...(options.prompts || [])];
  const confirms = [...(options.confirms || [])];
  const cycles = [{ ...CYCLE }];
  const sessions = (options.sessions || SESSIONS).map((row) => ({ ...row }));
  const deliveries = (options.deliveries || []).map((row) => ({ ...row }));
  let inventory = options.inventory === undefined
    ? {
        entrega: { id: "inventory-fixture-1", estado: "ACEPTADA" },
        lineas: [{
          producto_nombre: "Producto fixture",
          cantidad_base: 4,
          presentacion_nombre: "unidad"
        }]
      }
    : options.inventory;
  window._cache = {
    almacenes: [
      { id: "warehouse-cueva", nombre: "La Cueva", activo: true },
      { id: "warehouse-mejor", nombre: "TuMejor Opción", activo: true },
      { id: "warehouse-inactive", nombre: "Inactivo", activo: false }
    ]
  };
  window._usuarioActual = { id: "user-fixture", nombre: "Dueño fixture" };
  window.tienePermiso = () => options.permissions === true;
  window.escHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
  window.money = (value) => Number(value || 0).toFixed(2);
  window.fechaCorta = (value) => String(value || "—");
  window.showLoading = () => {};
  window.hideLoading = () => {};
  window.resetLoadingOverlay = () => {};
  window.marcarConectividadReal = () => {};
  window.explicarError = (error) => String(error?.message || error || "error fixture");
  window.prompt = () => prompts.length ? prompts.shift() : null;
  window.confirm = () => confirms.length ? confirms.shift() : false;
  window.client = {
    rpc: async (name, params = {}) => {
      rpcCalls.push({ name, params: { ...params } });
      switch (name) {
        case "listar_ciclos_operativos":
          return { data: cycles.map((row) => ({ ...row })), error: null };
        case "listar_sesiones_operativas":
          return {
            data: sessions.filter((row) => row.ciclo_id === params.p_ciclo_id)
              .map((row) => ({ ...row })),
            error: null
          };
        case "listar_entregas_caja":
          return {
            data: deliveries.filter((row) => row.ciclo_id === params.p_ciclo_id)
              .map((row) => ({ ...row })),
            error: null
          };
        case "crear_ciclo_operativo": {
          const created = {
            id: "cycle-created-fixture",
            almacen_id: params.p_almacen_id,
            almacen_nombre: "TuMejor Opción",
            usuario_nombre: "Dueño fixture",
            cantidad_dias: params.p_cantidad_dias,
            inicio_plan: params.p_inicio_plan,
            fin_plan: params.p_inicio_plan,
            estado: "PLANIFICADO"
          };
          cycles.push(created);
          sessions.push({
            id: "session-created-fixture",
            ciclo_id: created.id,
            dia_n: 1,
            bloque: "MANANA",
            fecha: created.inicio_plan,
            estado: "PENDIENTE",
            usuario_nombre: "Responsable fixture"
          });
          return { data: { id: created.id }, error: null };
        }
        case "iniciar_ciclo_operativo": {
          const cycle = cycles.find((row) => row.id === params.p_ciclo_id);
          if (cycle) cycle.estado = "ACTIVO";
          return { data: cycle ? { ...cycle } : {}, error: null };
        }
        case "declarar_entrega_caja": {
          const created = {
            id: "delivery-created-fixture",
            ciclo_id: params.p_ciclo_id,
            sesion_id: params.p_sesion_id,
            estado: "DECLARADA",
            declarado_por: "user-fixture",
            monto_declarado: params.p_monto_declarado
          };
          deliveries.push(created);
          return { data: { ...created }, error: null };
        }
        case "editar_entrega_caja": {
          const delivery = deliveries.find((row) => row.id === params.p_entrega_id);
          if (delivery) delivery.monto_declarado = params.p_monto_declarado;
          return { data: delivery ? { ...delivery } : {}, error: null };
        }
        case "registrar_recepcion_entrega_caja": {
          const delivery = deliveries.find((row) => row.id === params.p_entrega_id);
          if (delivery) {
            delivery.estado = "CONTADA";
            delivery.monto_contado = params.p_monto_contado;
          }
          return { data: delivery ? { ...delivery } : {}, error: null };
        }
        case "revisar_entrega_caja": {
          const delivery = deliveries.find((row) => row.id === params.p_entrega_id);
          if (delivery) delivery.estado = params.p_decision === "aprobar" ? "APROBADA" : "RECHAZADA";
          return { data: delivery ? { ...delivery } : {}, error: null };
        }
        case "obtener_cuadre_turno_general":
          return { data: { ...CUADRE }, error: null };
        case "obtener_entrega_inventario_turno":
          return {
            data: inventory === null
              ? { entrega: null, lineas: [] }
              : {
                  entrega: inventory.entrega ? { ...inventory.entrega } : null,
                  lineas: (inventory.lineas || []).map((row) => ({ ...row }))
                },
            error: null
          };
        case "inventario_enriquecido":
          return { data: [], error: null };
        case "declarar_entrega_inventario_turno":
          inventory = {
            entrega: { id: "inventory-created-fixture", estado: "PENDIENTE" },
            lineas: [{
              producto_nombre: "Producto fixture",
              cantidad_base: 4,
              presentacion_nombre: "unidad"
            }]
          };
          return { data: { ...inventory.entrega }, error: null };
        case "aceptar_entrega_inventario_turno":
          if (inventory && inventory.entrega) inventory.entrega.estado = "ACEPTADA";
          return { data: inventory ? { ...inventory.entrega } : {}, error: null };
        default:
          return { data: [], error: null };
      }
    }
  };

  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, rpcCalls, dialogs: { prompts, confirms } };
}

function writeCalls(calls) {
  return calls.filter((call) => WRITE_RPCS.has(call.name));
}

test("Paso 4 Turnos: el alias visible usa la interfaz unificada y la vista inicial solo lee", async (t) => {
  const c = createContext(t);
  const { window } = c;
  const root = window.document.getElementById("ciclos-m18-root");

  assert.ok(await waitFor(() => root.textContent.includes("Apertura del turno")),
    "la pantalla unificada debe arrancar en el paso Apertura");
  assert.equal(
    window.document.querySelector('.tab-btn[data-tab="ciclos"]').textContent,
    "Turnos",
    "la etiqueta técnica Ciclos Operativos debe presentarse como Turnos"
  );
  assert.equal(
    window.document.querySelector('.tab-btn[data-tab="turnos"]').style.display,
    "none",
    "la pestaña antigua Turnos debe quedar oculta"
  );
  assert.equal(
    window.document.getElementById("tab-turnos").classList.contains("visible"),
    false,
    "el panel legacy no debe quedar visible"
  );
  assert.match(root.textContent, /La Cueva/);
  assert.match(root.textContent, /Abierto/);
  assert.match(root.textContent, /TuMejor Opción/);
  assert.match(root.textContent, /No hay turno abierto o planificado/);
  assert.equal(root.querySelectorAll("[data-m21-enter]").length, 1);
  assert.equal(root.querySelector("[data-m21-create='warehouse-mejor']") !== null, true);
  assert.deepEqual(writeCalls(c.rpcCalls), [],
    "consultar el inicio no debe crear ni iniciar ciclos/sesiones");

  root.querySelector("[data-m21-create='warehouse-mejor']").click();
  assert.ok(await waitFor(() => root.textContent.includes("Nuevo turno")),
    "Crear turno solo debe abrir el formulario hasta confirmar");
  assert.deepEqual(writeCalls(c.rpcCalls), [],
    "abrir el formulario no debe ejecutar una RPC mutadora");

  root.querySelector("[data-m21-home]").click();
  assert.ok(await waitFor(() => root.textContent.includes("Apertura del turno")));
  assert.deepEqual(writeCalls(c.rpcCalls), [],
    "volver a la pantalla inicial sigue siendo de solo lectura");
});

test("Paso 4 Turnos: el recorrido por sesiones, dinero, validación, inventario y cuadre no muta datos", async (t) => {
  const c = createContext(t);
  const { window } = c;
  const root = window.document.getElementById("ciclos-m18-root");

  assert.ok(await waitFor(() => root.querySelector("[data-m21-enter='cycle-fixture-1']")));
  root.querySelector("[data-m21-enter='cycle-fixture-1']").click();
  assert.ok(await waitFor(() => root.textContent.includes("Turno · La Cueva")));
  assert.match(root.textContent, /7 día\(s\)/);
  assert.deepEqual(writeCalls(c.rpcCalls), []);

  root.querySelector("[data-m21-step2]").click();
  assert.ok(await waitFor(() => root.textContent.includes("Dinero recogido")));
  assert.match(root.textContent, /Mañana · Día 1/);
  assert.match(root.textContent, /Sin declaración/);
  assert.ok(c.rpcCalls.some((call) =>
    call.name === "listar_sesiones_operativas" &&
    call.params.p_ciclo_id === "cycle-fixture-1"));
  assert.ok(c.rpcCalls.some((call) =>
    call.name === "listar_entregas_caja" &&
    call.params.p_ciclo_id === "cycle-fixture-1"));
  assert.deepEqual(writeCalls(c.rpcCalls), [],
    "consultar sesiones y entregas no debe registrar ni recibir dinero");

  root.querySelector("[data-m21-step3]").click();
  assert.ok(await waitFor(() => root.textContent.includes("Validación de movimientos")));
  assert.match(root.textContent, /350\.00 CUP/);
  assert.deepEqual(writeCalls(c.rpcCalls), []);

  root.querySelector("[data-m21-step4]").click();
  assert.ok(await waitFor(() => root.querySelector(".m21-card h4")?.textContent.includes("Inventario entregado")));
  assert.match(root.textContent, /Producto fixture/);
  assert.match(root.textContent, /Estado: ACEPTADA/);
  const finalButton = root.querySelector("[data-m21-step5]");
  assert.ok(finalButton);
  assert.equal(finalButton.disabled, false,
    "el paso de cuadre solo debe habilitarse cuando la entrega está aceptada");
  assert.deepEqual(writeCalls(c.rpcCalls), [],
    "abrir el conteo solo debe consultar el detalle del inventario");

  finalButton.click();
  assert.ok(await waitFor(() => root.querySelector(".m21-card h4")?.textContent.includes("Cuadre final")));
  assert.match(root.textContent, /Diferencia/);
  assert.match(root.textContent, /0\.00 CUP/);
  assert.deepEqual(writeCalls(c.rpcCalls), [],
    "el cuadre final es una lectura y no debe cerrar ciclos ni sesiones");

  const readNames = new Set(c.rpcCalls.map((call) => call.name));
  for (const required of [
    "listar_ciclos_operativos",
    "listar_sesiones_operativas",
    "listar_entregas_caja",
    "obtener_cuadre_turno_general",
    "obtener_entrega_inventario_turno"
  ]) {
    assert.ok(readNames.has(required), "debe invocar el RPC de lectura " + required);
  }
});


test("Paso 4 Turnos: crear e iniciar un ciclo usa el almacén seleccionado y una clave idempotente en RPC mock", async (t) => {
  const c = createContext(t, { permissions: true });
  const { window } = c;
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root.querySelector("[data-m21-create='warehouse-mejor']")));

  root.querySelector("[data-m21-create='warehouse-mejor']").click();
  root.querySelector("#m21-duration button[data-days='3']").click();
  root.querySelector("[data-m21-confirm-create='warehouse-mejor']").click();

  assert.ok(await waitFor(() => root.querySelector(".m21-card h4")?.textContent.includes("Turno · TuMejor Opción")));
  const createCall = c.rpcCalls.find((call) => call.name === "crear_ciclo_operativo");
  assert.ok(createCall, "confirmar debe invocar el RPC de creación mock");
  assert.equal(createCall.params.p_almacen_id, "warehouse-mejor");
  assert.equal(createCall.params.p_cantidad_dias, 3);
  assert.match(createCall.params.p_inicio_plan, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(createCall.params.p_idempotency_key, /^[0-9a-f-]{36}$/i);

  root.querySelector("[data-m21-start]").click();
  assert.ok(await waitFor(() => c.rpcCalls.some((call) => call.name === "iniciar_ciclo_operativo")));
  const startCall = c.rpcCalls.find((call) => call.name === "iniciar_ciclo_operativo");
  assert.equal(startCall.params.p_ciclo_id, "cycle-created-fixture");
  assert.match(startCall.params.p_idempotency_key, /^[0-9a-f-]{36}$/i);
  assert.ok(await waitFor(() => !root.querySelector("[data-m21-start]")),
    "tras iniciar, el turno no debe seguir presentándose como planificado");
  assert.deepEqual(writeCalls(c.rpcCalls).map((call) => call.name), [
    "crear_ciclo_operativo",
    "iniciar_ciclo_operativo"
  ]);
});

test("Paso 4 Turnos: importe inválido se bloquea y declaración/edición del dinero usa RPC mock", async (t) => {
  const c = createContext(t, { permissions: true, prompts: ["-1"] });
  const { window } = c;
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root.querySelector("[data-m21-enter='cycle-fixture-1']")));
  root.querySelector("[data-m21-enter='cycle-fixture-1']").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-step2]")));
  root.querySelector("[data-m21-step2]").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-declare='session-fixture-1']")));

  root.querySelector("[data-m21-declare='session-fixture-1']").click();
  assert.ok(await waitFor(() => root.textContent.includes("Monto inválido")));
  assert.deepEqual(writeCalls(c.rpcCalls), [],
    "un importe negativo no debe enviar ninguna mutación");

  c.dialogs.prompts.push("12.5");
  root.querySelector("[data-m21-declare='session-fixture-1']").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-edit-money='delivery-created-fixture']")));
  const declareCall = c.rpcCalls.find((call) => call.name === "declarar_entrega_caja");
  assert.ok(declareCall);
  assert.equal(declareCall.params.p_ciclo_id, "cycle-fixture-1");
  assert.equal(declareCall.params.p_sesion_id, "session-fixture-1");
  assert.equal(declareCall.params.p_monto_declarado, 12.5);
  assert.equal(declareCall.params.p_turno_id, null);
  assert.match(declareCall.params.p_idempotency_key, /^[0-9a-f-]{36}$/i);

  c.dialogs.prompts.push("13.5");
  root.querySelector("[data-m21-edit-money='delivery-created-fixture']").click();
  assert.ok(await waitFor(() => c.rpcCalls.some((call) => call.name === "editar_entrega_caja")));
  const editCall = c.rpcCalls.find((call) => call.name === "editar_entrega_caja");
  assert.equal(editCall.params.p_entrega_id, "delivery-created-fixture");
  assert.equal(editCall.params.p_monto_declarado, 13.5);
  assert.match(editCall.params.p_idempotency_key, /^[0-9a-f-]{36}$/i);
});

test("Paso 4 Turnos: recepción y aprobación/rechazo del dinero respetan la puerta de confirmación", async (t) => {
  const morning = { ...SESSIONS[0], estado: "EN_CURSO" };
  const afternoon = {
    ...SESSIONS[0],
    id: "session-afternoon-fixture",
    bloque: "TARDE",
    fecha: "2026-10-20",
    estado: "PENDIENTE"
  };
  const c = createContext(t, {
    permissions: true,
    sessions: [morning, afternoon],
    deliveries: [
      {
        id: "delivery-morning-fixture",
        ciclo_id: CYCLE.id,
        sesion_id: morning.id,
        estado: "DECLARADA",
        declarado_por: "user-other",
        monto_declarado: 12.5
      },
      {
        id: "delivery-afternoon-fixture",
        ciclo_id: CYCLE.id,
        sesion_id: afternoon.id,
        estado: "CONTADA",
        declarado_por: "user-other",
        monto_declarado: 18,
        monto_contado: 18
      }
    ],
    prompts: ["11.5", null],
    confirms: [false]
  });
  const { window } = c;
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root.querySelector("[data-m21-enter='cycle-fixture-1']")));
  root.querySelector("[data-m21-enter='cycle-fixture-1']").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-step2]")));
  root.querySelector("[data-m21-step2]").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-receive='delivery-morning-fixture']")));
  assert.ok(root.querySelector("[data-m21-review='delivery-afternoon-fixture']"));

  root.querySelector("[data-m21-receive='delivery-morning-fixture']").click();
  assert.ok(await waitFor(() => c.rpcCalls.some((call) => call.name === "registrar_recepcion_entrega_caja")));
  const receiveCall = c.rpcCalls.find((call) => call.name === "registrar_recepcion_entrega_caja");
  assert.equal(receiveCall.params.p_entrega_id, "delivery-morning-fixture");
  assert.equal(receiveCall.params.p_monto_contado, 11.5);
  assert.equal(receiveCall.params.p_observacion_conteo, null);
  assert.match(receiveCall.params.p_idempotency_key, /^[0-9a-f-]{36}$/i);

  assert.ok(await waitFor(() => root.querySelector("[data-m21-review='delivery-afternoon-fixture']")));
  root.querySelector("[data-m21-review='delivery-afternoon-fixture']").click();
  assert.deepEqual(c.rpcCalls.filter((call) => call.name === "revisar_entrega_caja"), [],
    "Cancelar el rechazo sin motivo no debe enviar revisión");
  c.dialogs.confirms.push(true);
  root.querySelector("[data-m21-review='delivery-afternoon-fixture']").click();
  assert.ok(await waitFor(() => c.rpcCalls.some((call) => call.name === "revisar_entrega_caja")));
  const reviewCall = c.rpcCalls.find((call) => call.name === "revisar_entrega_caja");
  assert.equal(reviewCall.params.p_entrega_id, "delivery-afternoon-fixture");
  assert.equal(reviewCall.params.p_decision, "aprobar");
  assert.equal(reviewCall.params.p_comentario, null);
  assert.match(reviewCall.params.p_idempotency_key, /^[0-9a-f-]{36}$/i);
});

test("Paso 4 Turnos: entregar inventario exige confirmar la recepción antes de habilitar el cuadre final", async (t) => {
  const c = createContext(t, {
    permissions: true,
    inventory: null,
    confirms: [false]
  });
  const { window } = c;
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root.querySelector("[data-m21-enter='cycle-fixture-1']")));
  root.querySelector("[data-m21-enter='cycle-fixture-1']").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-step2]")));
  root.querySelector("[data-m21-step2]").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-step3]")));
  root.querySelector("[data-m21-step3]").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-step4]")));
  root.querySelector("[data-m21-step4]").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-deliver-inventory]")));

  root.querySelector("[data-m21-deliver-inventory]").click();
  assert.ok(await waitFor(() => root.querySelector("[data-m21-accept-inventory='inventory-created-fixture']")));
  const deliverCall = c.rpcCalls.find((call) => call.name === "declarar_entrega_inventario_turno");
  assert.ok(deliverCall);
  assert.equal(deliverCall.params.p_ciclo_id, "cycle-fixture-1");
  assert.equal(deliverCall.params.p_observacion, null);
  assert.match(deliverCall.params.p_idempotency_key, /^[0-9a-f-]{36}$/i);

  const acceptButton = root.querySelector("[data-m21-accept-inventory='inventory-created-fixture']");
  root.querySelector("[data-m21-accept-inventory='inventory-created-fixture']").click();
  assert.deepEqual(c.rpcCalls.filter((call) => call.name === "aceptar_entrega_inventario_turno"), [],
    "cancelar la recepción no debe aceptar el inventario");
  c.dialogs.confirms.push(true);
  acceptButton.click();
  assert.ok(await waitFor(() => c.rpcCalls.some((call) => call.name === "aceptar_entrega_inventario_turno")));
  const acceptCall = c.rpcCalls.find((call) => call.name === "aceptar_entrega_inventario_turno");
  assert.equal(acceptCall.params.p_entrega_id, "inventory-created-fixture");
  assert.equal(acceptCall.params.p_observacion, null);
  assert.match(acceptCall.params.p_idempotency_key, /^[0-9a-f-]{36}$/i);
  assert.ok(await waitFor(() => root.querySelector(".m21-card h4")?.textContent.includes("Cuadre final")));
  assert.ok(c.rpcCalls.some((call) => call.name === "obtener_cuadre_turno_general"),
    "el cuadre final sigue siendo una lectura");
});
