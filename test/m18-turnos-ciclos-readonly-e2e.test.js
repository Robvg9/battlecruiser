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

function createContext(t) {
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
  window._cache = {
    almacenes: [
      { id: "warehouse-cueva", nombre: "La Cueva", activo: true },
      { id: "warehouse-mejor", nombre: "TuMejor Opción", activo: true },
      { id: "warehouse-inactive", nombre: "Inactivo", activo: false }
    ]
  };
  window._usuarioActual = { id: "user-fixture", nombre: "Dueño fixture" };
  window.tienePermiso = () => false;
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
  window.client = {
    rpc: async (name, params = {}) => {
      rpcCalls.push({ name, params: { ...params } });
      switch (name) {
        case "listar_ciclos_operativos":
          return { data: [{ ...CYCLE }], error: null };
        case "listar_sesiones_operativas":
          return { data: SESSIONS.map((row) => ({ ...row })), error: null };
        case "listar_entregas_caja":
          return { data: [], error: null };
        case "obtener_cuadre_turno_general":
          return { data: { ...CUADRE }, error: null };
        case "obtener_entrega_inventario_turno":
          return {
            data: {
              entrega: { id: "inventory-fixture-1", estado: "ACEPTADA" },
              lineas: [{
                producto_nombre: "Producto fixture",
                cantidad_base: 4,
                presentacion_nombre: "unidad"
              }]
            },
            error: null
          };
        case "inventario_enriquecido":
          return { data: [], error: null };
        default:
          return { data: [], error: null };
      }
    }
  };

  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, rpcCalls };
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
  assert.ok(await waitFor(() => root.textContent.includes("Conteo y entrega")));
  assert.match(root.textContent, /Producto fixture/);
  assert.match(root.textContent, /Estado: ACEPTADA/);
  const finalButton = root.querySelector("[data-m21-step5]");
  assert.ok(finalButton);
  assert.equal(finalButton.disabled, false,
    "el paso de cuadre solo debe habilitarse cuando la entrega está aceptada");
  assert.deepEqual(writeCalls(c.rpcCalls), [],
    "abrir el conteo solo debe consultar el detalle del inventario");

  finalButton.click();
  assert.ok(await waitFor(() => root.textContent.includes("Cuadre final")));
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
