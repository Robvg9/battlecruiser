"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m33-turnos-final.js"),
  "utf8"
);
const M29_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m29-turnos-organizacion.js"),
  "utf8"
);
const JORNADA_UI = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "bc7-jornada-ui.js"),
  "utf8"
);

async function waitFor(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function session(id, day, date, block) {
  return { id, turno_id: "turno-closed-fixture", dia_n: day, numero_dia: day, bloque: block,
    fecha: date, estado: "CERRADO", usuario_id: "owner-fixture", usuario_nombre: "Responsable fixture" };
}
function operation(producto, tipo, fecha, operacion_id) {
  return { producto, tipo, fecha, almacen: "La Cueva", cantidad: tipo === "compra" ? 2 : -1,
    usuario: "Responsable fixture", operacion_id };
}
function setup(t, { admin = true } = {}) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body><section id='tab-ciclos'><div id='ciclos-m18-root'></div></section></body></html>",
    { url: "https://battlecruiser-m33-archive.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { configurable: true, value: "complete" });
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  const sessions = [
    session("session-day1-am", 1, "2026-10-20", "MANANA"),
    session("session-day1-pm", 1, "2026-10-20", "TARDE"),
    session("session-day2-am", 2, "2026-10-21", "MANANA"),
    session("session-day2-pm", 2, "2026-10-21", "TARDE")
  ];
  const rowsBySession = {
    "session-day1-am": [operation("Compra vinculada día 1", "compra", "2026-10-20T10:00:00Z", "op-day1-am")],
    "session-day1-pm": [operation("Venta vinculada día 1", "venta", "2026-10-20T19:00:00Z", "op-day1-pm")],
    "session-day2-am": [operation("Compra vinculada día 2", "compra", "2026-10-21T10:00:00Z", "op-day2-am")],
    "session-day2-pm": [operation("Venta vinculada día 2", "venta", "2026-10-21T19:00:00Z", "op-day2-pm")]
  };
  const turn = {
    id: "turno-closed-fixture", almacen_nombre: "La Cueva", almacen_id: "alm-1",
    estado: "CERRADO", estado_maestro: "CERRADO", dias_turno: 2, cantidad_dias: 2,
    inicio_plan: "2026-10-20", fin_plan: "2026-10-21", sesiones: sessions
  };
  const rpcCalls = [];
  window._usuarioActual = { id: "owner-fixture", nombre: "Dueño fixture", rol: admin ? "dueño" : "dependienta" };
  window.__bcUser = { rol: admin ? "dueño" : "dependienta" };
  window._cache = { almacenes: [{ id: "alm-1", nombre: "La Cueva", activo: true }], usuarios: [
    { id: "owner-fixture", nombre: "Dueño fixture", rol: "Dueño", activo: true, archivado: false }
  ] };
  window.tienePermiso = () => admin;
  window.escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const writeCalls = [];
  window.BattleCruiserTurnoAPI = {
    actorIsAdmin: async () => admin,
    obtenerExpedienteTurno: async (id) => ({ ...turn, id, sesiones: sessions.map((row) => ({ ...row })) }),
    labelEstado: (value) => value === "CERRADO" ? "Cerrado" : String(value || "—"),
    asignarSesion: async (...args) => { writeCalls.push({ method: "asignarSesion", args }); },
    anularTurno: async (...args) => { writeCalls.push({ method: "anularTurno", args }); }
  };
  window.client = {
    rpc: async (name, params = {}) => {
      rpcCalls.push({ name, params: { ...params } });
      if (name === "listar_usuarios_admin") return { data: [
        { id: "owner-fixture", nombre: "Dueño fixture", rol: "Dueño", activo: true, archivado: false }
      ], error: null };
      if (name !== "bc7_movimientos_sesion") return { data: null, error: { code: "UNEXPECTED_RPC", message: name } };
      return { data: (rowsBySession[params.p_turno_sesion_id] || []).map((row) => ({ ...row })), error: null };
    }
  };
  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, rpcCalls, writeCalls, sessions };
}
test("Paso 4: M33 consulta el archivo de un turno cerrado por fecha sin mutar registros", async (t) => {
  const { window, rpcCalls } = setup(t);
  await window.__BC_M33.open("turno-closed-fixture");
  const modal = window.document.getElementById("m33-bg");
  assert.ok(modal, "el expediente debe abrir aunque el turno esté cerrado");
  assert.match(modal.textContent, /CERRADO|Cerrado/);
  modal.querySelector("#m33-next").click();
  modal.querySelector("#m33-next").click();
  assert.ok(await waitFor(() => modal.querySelectorAll(".m33-archive-day").length === 2),
    "Movimientos debe mostrar un grupo independiente por día del turno");
  const groups = modal.querySelectorAll(".m33-archive-day");
  assert.match(groups[0].textContent, /20\/10\/2026/);
  assert.match(groups[1].textContent, /21\/10\/2026/);
  groups[0].querySelector("[data-m33-archive-sessions]").click();
  const host1 = groups[0].querySelector("[data-m33-archive-host]");
  assert.ok(await waitFor(() => host1.textContent.includes("Compra vinculada día 1") && host1.textContent.includes("Venta vinculada día 1")),
    "el día 1 debe mostrar operaciones de sus sesiones");
  assert.doesNotMatch(host1.textContent, /Compra vinculada día 2|Venta vinculada día 2/);
  assert.deepEqual(rpcCalls.filter((call) => call.name === "bc7_movimientos_sesion").map((call) => call.params.p_turno_sesion_id).sort(),
    ["session-day1-am", "session-day1-pm"], "la consulta debe enviar las sesiones exactas del día");
  groups[1].querySelector("[data-m33-archive-sessions]").click();
  const host2 = groups[1].querySelector("[data-m33-archive-host]");
  assert.ok(await waitFor(() => host2.textContent.includes("Compra vinculada día 2") && host2.textContent.includes("Venta vinculada día 2")),
    "el día 2 debe mostrar sus propias operaciones");
  assert.doesNotMatch(host2.textContent, /Compra vinculada día 1|Venta vinculada día 1/);
  assert.ok(rpcCalls.filter((call) => call.name !== "listar_usuarios_admin").every((call) => call.name === "bc7_movimientos_sesion"),
    "el expediente solo puede consultar responsables y RPCs de lectura del archivo");
});


test("Paso 4: personal asignado también accede solo al archivo de sus sesiones", async (t) => {
  const { window, rpcCalls } = setup(t, { admin: false });
  await window.__BC_M33.open("turno-closed-fixture");
  const modal = window.document.getElementById("m33-bg");
  assert.ok(await waitFor(() => modal.querySelectorAll(".m33-archive-day").length === 2),
    "la vista de dependienta incluye el archivo por fecha de sus sesiones asignadas");
  const groups = modal.querySelectorAll(".m33-archive-day");
  groups[0].querySelector("[data-m33-archive-sessions]").click();
  const host = groups[0].querySelector("[data-m33-archive-host]");
  assert.ok(await waitFor(() => host.textContent.includes("Compra vinculada día 1")),
    "se consulta el archivo de solo lectura para las sesiones asignadas");
  assert.deepEqual(rpcCalls.filter((call) => call.name === "bc7_movimientos_sesion").map((call) => call.params.p_turno_sesion_id).sort(),
    ["session-day1-am", "session-day1-pm"]);
});

test("Paso 4: el historial cerrado abre M33 en modo de solo lectura, sin controles de escritura", async (t) => {
  const { window, rpcCalls, writeCalls } = setup(t);
  assert.match(M29_SOURCE, /openDetalle\(button\.dataset\.m29ClosedOpen, false, true\)/,
    "el botón del historial debe pedir explícitamente el modo de solo lectura");
  assert.match(M29_SOURCE, /window\.__BC_M33\.open\(id, \{ readOnly: true \}\)/,
    "M29 debe pasar el modo de solo lectura a M33");
  await window.__BC_M33.open("turno-closed-fixture", { readOnly: true });
  const modal = window.document.getElementById("m33-bg");
  assert.ok(modal);
  assert.match(modal.textContent, /Expediente histórico.*Solo lectura/i);
  modal.querySelector("#m33-next").click();
  assert.match(modal.textContent, /asignaciones se muestran tal como quedaron registradas/i);
  assert.equal(modal.querySelectorAll("select[data-m33-sid]").length, 0,
    "las asignaciones históricas deben ser texto, nunca controles editables");
  assert.equal(modal.querySelector("#m33-save"), null, "el expediente histórico no debe ofrecer Guardar");
  assert.equal(modal.querySelector("#m33-delete"), null, "el expediente histórico no debe ofrecer Eliminar");
  modal.querySelector("#m33-next").click();
  assert.ok(await waitFor(() => modal.querySelectorAll(".m33-archive-day").length === 2),
    "el historial debe conservar el archivo de movimientos por fecha");
  modal.querySelector(".m33-archive-day [data-m33-archive-sessions]").click();
  assert.ok(await waitFor(() => modal.querySelector(".m33-archive-host[data-loaded='1']")),
    "el archivo debe poder consultarse sin salir del modo histórico");
  assert.ok(rpcCalls.length > 0, "la vista de movimientos debe haber usado su RPC de lectura");
  assert.equal(writeCalls.length, 0, "abrir y navegar por el expediente no debe llamar RPCs de escritura");
  assert.ok(rpcCalls.filter((call) => call.name !== "listar_usuarios_admin").every((call) => call.name === "bc7_movimientos_sesion"),
    "el historial solo puede consultar el catálogo de responsables y el RPC de lectura");
});

test("Paso 4: un expediente histórico de dependienta no permite abrir sesiones aunque estén pendientes", async (t) => {
  const { window, sessions, writeCalls } = setup(t, { admin: false });
  sessions[0].estado = "PENDIENTE";
  await window.__BC_M33.open("turno-closed-fixture", { readOnly: true });
  const modal = window.document.getElementById("m33-bg");
  assert.ok(modal);
  assert.match(modal.textContent, /modo de solo lectura/i);
  assert.equal(modal.querySelector("[data-m33-abrir-sesion]"), null,
    "el modo histórico debe ocultar Abrir sesión incluso si el estado de una sesión está pendiente");
  assert.equal(writeCalls.length, 0);
});

test("M33 sends JORNADA sessions to the Step 7 workspace instead of legacy session opening", () => {
  assert.match(SOURCE, /data-m33-abrir-jornada/);
  assert.match(SOURCE, /window\.__BC7_JORNADA__/);
  assert.match(SOURCE, /openForSession\(sesionId\)/);
  assert.match(SOURCE, /data-m33-abrir-sesion/);
  assert.match(JORNADA_UI, /window\.__BC7_JORNADA__/);
  assert.match(JORNADA_UI, /openForSession:\s*async function\(sessionId\)/);
});


test("M33 Inventario renders opening counts, real movements, finance and pending adjustments as a read-only ledger", async (t) => {
  const { window, rpcCalls, writeCalls, sessions } = setup(t);
  sessions.splice(0, sessions.length, {
    ...session("jornada-day1", 1, "2026-10-20", "JORNADA"),
    estado: "COMPLETADA",
    responsable_id: "owner-fixture",
    dinero_declarado: true,
    dinero_id: "cash-declaration-1",
    dinero_monto: 100,
    dinero_moneda: "CUP",
    dinero_estado_aprobacion: "APROBADA",
    dinero_monto_contado: 100,
    dinero_diferencia: 0,
    dinero_contado_por: "owner-fixture",
    dinero_contado_nombre: "Dueño fixture",
    dinero_contado_at: "2026-10-20T22:15:00-04:00"
  });
  window.client = {
    rpc: async (name, params = {}) => {
      rpcCalls.push({ name, params: { ...params } });
      if (name === "listar_usuarios_admin") return { data: [
        { id: "owner-fixture", nombre: "Dueño fixture", rol: "Dueño", activo: true, archivado: false }
      ], error: null };
      if (name === "bc7_obtener_inventario_jornada") {
        return { error: null, data: {
          productos: [{ producto_id: "product-1", nombre: "Café", unidad: "kg" }],
          cortes: {
            INICIAL: {
              id: "opening-1", estado: "CONFIRMADO", confirmado_en: "2026-10-20T07:00:00-04:00",
              confirmado_por: "owner-fixture",
              lineas: [{ producto_id: "product-1", cantidad_contada: 10 }]
            },
            FINAL: {
              id: "final-1", estado: "CONFIRMADO", confirmado_en: "2026-10-20T22:00:00-04:00",
              confirmado_por: "owner-fixture",
              lineas: [{ producto_id: "product-1", cantidad_contada: 13 }]
            }
          }
        } };
      }
      if (name === "bc7_movimientos_sesion") {
        return { error: null, data: [
          { fecha: "2026-10-20T09:00:00-04:00", tipo: "compra", producto: "Café", cantidad: 5, usuario: "Responsable fixture", operacion_id: "op-buy-1" },
          { fecha: "2026-10-20T10:00:00-04:00", tipo: "venta", producto: "Café", cantidad: -2, usuario: "Responsable fixture", operacion_id: "op-sale-1" },
          { fecha: "2026-10-20T11:00:00-04:00", tipo: "baja", producto: "Café", cantidad: -1, costo_unitario: 3, usuario: "Dueño fixture", operacion_id: "op-loss-1" }
        ] };
      }
      if (name === "bc7_finanzas_jornada") {
        return { error: null, data: {
          gastos: [{ id: "expense-1", concepto: "Electricidad", monto: 20, estado: "PENDIENTE", creado_en: "2026-10-20T09:30:00-04:00", creado_nombre: "Responsable fixture" }],
          reinversiones: [{ id: "reinvest-1", proveedor: "Proveedor", fecha: "2026-10-20T08:00:00-04:00", usuario_nombre: "Responsable fixture", lineas: [
            { producto_id: "product-1", producto: "Café", cantidad_base: 3, costo_total: 10 }
          ] }],
          mermas: [{ id: "waste-1", producto: "Café", cantidad: 1, motivo: "Derrame", estado: "PENDIENTE", creado_en: "2026-10-20T10:30:00-04:00", creado_nombre: "Responsable fixture" }],
          bajas: []
        } };
      }
      return { error: { code: "UNEXPECTED_RPC", message: name }, data: null };
    },
    from: (table) => ({
      select: () => ({
        in: async (column, values) => {
          if (table === "ventas_lineas") return { error: null, data: [{
            venta_id: "op-sale-1", producto_id: "product-1", cantidad: 2,
            precio_unitario: 20, subtotal: 40, costo_unitario_fifo: 5
          }] };
          if (table === "productos") return { error: null, data: [{
            id: "product-1", nombre: "Café", precio_normal: 20
          }] };
          return { error: null, data: [] };
        }
      })
    })
  };
  await window.__BC_M33.open("turno-closed-fixture");
  const modal = window.document.getElementById("m33-bg");
  modal.querySelector("#m33-next").click();
  modal.querySelector("#m33-next").click();
  modal.querySelector("#m33-next").click();
  const openBook = modal.querySelector("[data-m33-inventory-book]");
  assert.ok(openBook, "Inventario must render one consolidated workbook, not one card per day");
  const host = modal.querySelector("[data-m33-inventory-host]");
  assert.ok(await waitFor(() => host.querySelector(".m33-book-table")), "the consolidated product sheet should load automatically from read-only RPCs");
  assert.equal(host.hidden, false, "the inventory sheet is visible immediately without an extra click");
  assert.match(host.textContent, /Inventario consolidado por producto/);
  assert.match(host.textContent, /Inv\. inicial/);
  assert.match(host.textContent, /Entradas/);
  assert.match(host.textContent, /Reinversión/);
  assert.match(host.textContent, /Inv\. teórico/);
  assert.match(host.textContent, /Inv\. físico/);
  assert.match(host.textContent, /Diferencia física/);
  assert.match(host.textContent, /Venta POS/);
  assert.match(host.textContent, /Reinversiones detalladas/);
  assert.match(host.textContent, /Electricidad/);
  assert.match(host.textContent, /Solicitudes de baja/);
  assert.doesNotMatch(host.textContent, /Merma/);
  assert.match(host.textContent, /no descuenta existencias/);
  assert.match(host.textContent, /Contado por dueño/);
  assert.match(host.textContent, /Gastos aprobados/);
  assert.match(host.textContent, /Gastos pendientes/);
  assert.match(host.textContent, /Dinero declarado · CUP/);
  assert.match(host.textContent, /100,00 CUP/);
  assert.match(host.textContent, /0,00 CUP/);
  const productRow = host.querySelector(".m33-book-table tbody tr");
  assert.ok(productRow, "the product matrix must contain its Café fixture row");
  assert.deepEqual(Array.from(productRow.cells).map((cell) => cell.textContent.trim()), [
    "300%", "15,00", "5,00", "20,00", "Café", "10", "5", "3", "1", "0",
    "15", "13", "-2", "2", "30,00", "40,00", "3,00"
  ], "the spreadsheet must show theoretical stock after POS sales, physical closing count and their unexplained difference separately");
  assert.ok(rpcCalls.some((call) => call.name === "bc7_obtener_inventario_jornada"));
  assert.ok(rpcCalls.some((call) => call.name === "bc7_movimientos_sesion"));
  assert.ok(rpcCalls.some((call) => call.name === "bc7_finanzas_jornada"));
  assert.equal(writeCalls.length, 0, "opening and reading the day ledger must never mutate the turn");
  assert.doesNotMatch(SOURCE, /stock_actual/, "the ledger must not mislabel current stock as historical opening stock");
});


test("M33 hydrates the assignment selectors from the authorized responsible-user catalog", async (t) => {
  const { window, sessions } = setup(t);
  window._cache.usuarios = [
    { id: "staff-cache", nombre: "Responsable en caché", activo: true },
    { id: "staff-stale", nombre: "Responsable obsoleto", rol: "Dependienta", activo: true, archivado: false }
  ];
  const staffRows = [
    { id: "dep-live", nombre: "Dependienta LIVE", rol: "Dependienta", activo: true, archivado: false },
    { id: "owner-live", nombre: "Dueño LIVE", rol: "Dueño", activo: true, archivado: false }
  ];
  const calls = [];
  window.client.rpc = async (name, params = {}) => {
    calls.push({ name, params });
    if (name === "listar_usuarios_admin") return { data: staffRows, error: null };
    throw new Error("RPC inesperada: " + name);
  };
  await window.__BC_M33.open("turno-closed-fixture");
  const modal = window.document.getElementById("m33-bg");
  modal.querySelector("#m33-next").click();
  const hydrated = await waitFor(() => {
    const selects = Array.from(modal.querySelectorAll("select[data-m33-sid]"));
    return selects.length === sessions.length && selects.every((select) => select.options.length === 3);
  }, 4000);
  assert.ok(hydrated, "each assignment select must contain the authoritative active responsible users");
  const first = modal.querySelector("select[data-m33-sid]");
  assert.deepEqual(Array.from(first.options).map((option) => option.value), ["", "dep-live", "owner-live"]);
  assert.ok(!Array.from(first.options).some((option) => option.value === "staff-stale"),
    "the assignment form must not resurrect a stale staff member missing from the canonical catalog");
  assert.equal(calls[0].name, "listar_usuarios_admin");
  assert.equal(calls[0].params.p_incluir_archivados, false);
  assert.deepEqual(Object.keys(calls[0].params), ["p_incluir_archivados"]);
  assert.equal(window.document.querySelector("#bc-m33-compact-sheet-css") !== null, true);
});
