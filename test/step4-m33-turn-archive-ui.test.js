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
  window._cache = { almacenes: [{ id: "alm-1", nombre: "La Cueva", activo: true }], usuarios: [] };
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
  assert.deepEqual(rpcCalls.map((call) => call.params.p_turno_sesion_id).sort(),
    ["session-day1-am", "session-day1-pm"], "la consulta debe enviar las sesiones exactas del día");
  groups[1].querySelector("[data-m33-archive-sessions]").click();
  const host2 = groups[1].querySelector("[data-m33-archive-host]");
  assert.ok(await waitFor(() => host2.textContent.includes("Compra vinculada día 2") && host2.textContent.includes("Venta vinculada día 2")),
    "el día 2 debe mostrar sus propias operaciones");
  assert.doesNotMatch(host2.textContent, /Compra vinculada día 1|Venta vinculada día 1/);
  assert.ok(rpcCalls.every((call) => call.name === "bc7_movimientos_sesion"),
    "la prueba solo permite RPCs de lectura del archivo");
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
  assert.deepEqual(rpcCalls.map((call) => call.params.p_turno_sesion_id).sort(),
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
  assert.ok(rpcCalls.every((call) => call.name === "bc7_movimientos_sesion"),
    "el archivo del historial solo puede consultar el RPC de lectura");
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
