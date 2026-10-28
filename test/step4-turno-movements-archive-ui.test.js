"use strict";

// Owner issue #194: exercise the real Turnos day-archive UI with read-only RPC fixtures.
// This test never creates/closes turns and never writes production data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "turnos-maestro.js"),
  "utf8"
);

async function waitFor(predicate, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function session(id, day, date, block) {
  return {
    id,
    turno_id: "turno-closed-fixture",
    dia_n: day,
    numero_dia: day,
    bloque: block,
    fecha: date,
    estado: "CERRADO",
    usuario_id: "owner-fixture",
    usuario_nombre: "Responsable fixture"
  };
}

function operation(producto, tipo, fecha, operacion_id) {
  return {
    producto,
    tipo,
    fecha,
    operacion_id,
    cantidad: tipo === "compra" ? 2 : -1,
    usuario: "Responsable fixture"
  };
}

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<button class='tab-btn' data-tab='turnos'>Turnos legado</button>" +
      "<button class='tab-btn' data-tab='ciclos'>Ciclos Operativos</button>" +
      "<section id='tab-turnos' class='tab-panel visible'></section>" +
      "<section id='tab-ciclos' class='tab-panel'><div id='ciclos-m18-root'></div></section>" +
    "</body></html>",
    {
      url: "https://battlecruiser-turn-archive.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true
    }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", {
    configurable: true,
    value: "complete"
  });
  // The archive is online-only. Make that condition deterministic in JSDOM,
  // otherwise an environment without online state could take the offline branch.
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true
  });

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
  const rpcCalls = [];
  const closedTurn = {
    id: "turno-closed-fixture",
    almacen_nombre: "La Cueva",
    estado: "CERRADO",
    estado_maestro: "CERRADO",
    dias_turno: 2,
    cantidad_dias: 2,
    inicio_plan: "2026-10-20",
    fin_plan: "2026-10-21",
    sesiones: sessions
  };

  window._usuarioActual = { id: "owner-fixture", nombre: "Dueño fixture" };
  window._cache = { almacenes: [], usuarios: [] };
  window.tienePermiso = () => false;
  window.escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  window.money = (value) => Number(value || 0).toFixed(2);
  window.fechaCorta = (value) => String(value || "—");
  window.BattleCruiserTurnoAPI = {
    estado: async (id) => id === closedTurn.id ? { ...closedTurn } : null,
    listarSesionesTurno: async () => sessions.map((row) => ({ ...row })),
    actorIsAdmin: async () => false,
    labelEstado: (state) => state === "CERRADO" ? "Cerrado" : String(state || "—")
  };
  window.client = {
    rpc: async (name, params = {}) => {
      rpcCalls.push({ name, params: { ...params } });
      if (name !== "bc7_movimientos_sesion") {
        return { data: null, error: { code: "UNEXPECTED_RPC", message: name } };
      }
      return {
        data: (rowsBySession[params.p_turno_sesion_id] || []).map((row) => ({ ...row })),
        error: null
      };
    }
  };

  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, rpcCalls, rowsBySession };
}

test("Paso 4: Turnos conserva el archivo de un turno cerrado y separa los movimientos por fecha", async (t) => {
  const { window, rpcCalls, rowsBySession } = setup(t);
  assert.ok(await waitFor(() => window.BattleCruiserTurnosMaestro), "el módulo de Turnos debe inicializarse");

  await window.BattleCruiserTurnosMaestro.open("turno-closed-fixture", false);
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root.querySelectorAll(".tm-day-group").length === 2),
    "el turno de dos días debe renderizar dos grupos de fecha");
  assert.match(root.textContent, /Turno · La Cueva/);
  assert.match(root.textContent, /Cerrado/);
  assert.match(root.textContent, /20\/10\/2026/);
  assert.match(root.textContent, /21\/10\/2026/);

  const day1Button = root.querySelector('.tm-day-group [data-tm-sessions*="session-day1-am"]');
  assert.ok(day1Button, "día 1 debe tener acceso al archivo de sus sesiones");
  day1Button.click();
  assert.ok(await waitFor(() => root.textContent.includes("Compra vinculada día 1") &&
    root.textContent.includes("Venta vinculada día 1")),
    "el archivo del día 1 debe mostrar las operaciones devueltas para sus sesiones");
  assert.doesNotMatch(root.querySelector(".tm-day-group").textContent, /Compra vinculada día 2|Venta vinculada día 2/,
    "el archivo del día 1 no debe presentar operaciones del día 2");

  const day1SessionCalls = rpcCalls.filter((call) =>
    call.name === "bc7_movimientos_sesion" &&
    ["session-day1-am", "session-day1-pm"].includes(call.params.p_turno_sesion_id)
  );
  assert.equal(day1SessionCalls.length, 2, "debe consultar cada sesión exacta del día 1");
  assert.equal(rpcCalls.some((call) => /crear|cerrar|actualizar|eliminar/i.test(call.name)), false,
    "la prueba solo consulta; no abre, cierra ni muta turnos/operaciones");

  const day2Button = root.querySelector('.tm-day-group [data-tm-sessions*="session-day2-am"]');
  assert.ok(day2Button, "día 2 debe tener acceso a su archivo independiente");
  day2Button.click();
  assert.ok(await waitFor(() => root.textContent.includes("Compra vinculada día 2") &&
    root.textContent.includes("Venta vinculada día 2")),
    "el archivo del día 2 debe presentar sus propias operaciones");
  assert.doesNotMatch(root.querySelectorAll(".tm-day-group")[1].textContent, /Compra vinculada día 1|Venta vinculada día 1/,
    "el archivo del día 2 no debe presentar operaciones del día 1");

  for (const [sessionId, rows] of Object.entries(rowsBySession)) {
    assert.equal(Array.isArray(rows), true, "fixture de solo lectura definido para " + sessionId);
  }
});
