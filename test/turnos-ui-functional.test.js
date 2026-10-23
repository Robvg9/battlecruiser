"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "operacion-humana.js"),
  "utf8"
);

async function waitFor(predicate, timeout = 1000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function setup(t, initialTurns = []) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<div id='app-shell' class='visible'>" +
        "<select id='turno-almacen-abrir'><option value=''>Selecciona un almacén</option></select>" +
        "<button type='button' id='btn-abrir-turno'>Abrir turno</button>" +
        "<button type='button' id='btn-cerrar-turno' class='hidden'>Cerrar turno</button>" +
        "<div id='turno-actual'></div><p id='msg-turno'></p>" +
        "<select id='turno-filtro-estado'><option value=''>Todos</option><option value='ABIERTO'>Abierto</option><option value='CERRADO'>Cerrado</option></select>" +
        "<select id='turno-filtro-almacen'><option value=''>Todos los almacenes</option><option value='alm-1'>Principal</option></select>" +
        "<button type='button' id='turnos-refrescar-btn'>Refrescar</button>" +
        "<div id='lista-turnos'></div><div id='lista-cuadres'></div>" +
      "</div></body></html>",
    { url: "https://battlecruiser-turnos.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  let currentTurn = null;
  let turns = initialTurns.map((row) => ({ ...row }));
  const operations = [];
  const rpcCalls = [];

  window.tienePermiso = () => true;
  window.navigator.onLine;
  window._usuarioActual = { id: "user-fixture", nombre: "Dueño" };
  window._cache = {
    almacenes: [
      { id: "alm-1", nombre: "Principal", activo: true },
      { id: "alm-inactive", nombre: "Inactivo", activo: false }
    ]
  };
  window.appShell = window.document.getElementById("app-shell");
  window.money = (value) => Number(value || 0).toFixed(2);
  window.fechaHora = (value) => String(value || "—");
  window.escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  window.setMsg = (id, message, ok) => {
    const el = window.document.getElementById(id);
    if (el) {
      el.textContent = message;
      el.dataset.ok = String(Boolean(ok));
    }
  };
  window.setLoading = (id, message) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = message;
  };
  window.setEmpty = (id, message) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = message;
  };
  window.esRpcFaltante = () => false;
  window.explicarError = (error) => String(error?.message || error || "error fixture");
  window.obtenerOperacionesPorEstado = async () => [];
  window.actualizarPanelAlmacenVenta = () => {};
  window.poblarSelectAlmacenes = () => {};

  window.client = {
    rpc: async (name, params = {}) => {
      rpcCalls.push({ name, params: { ...params } });
      if (name === "turno_actual_usuario") return { data: currentTurn ? { ...currentTurn } : null, error: null };
      if (name === "listar_turnos") {
        const rows = params.p_estado ? turns.filter((row) => row.estado === params.p_estado) : turns;
        return { data: rows.map((row) => ({ ...row })), error: null };
      }
      if (name === "listar_cuadres") return { data: [], error: null };
      if (name === "listar_responsabilidades") return { data: [], error: null };
      if (name === "listar_incidencias") return { data: [], error: null };
      return { data: [], error: null };
    }
  };
  window.ejecutarOperacion = async (type, params) => {
    operations.push({ type, params: { ...params } });
    if (type === "turno") {
      currentTurn = {
        id: "turno-fixture-1",
        estado: "ABIERTO",
        almacen_id: params.p_almacen_id,
        almacen_nombre: "Principal",
        usuario_nombre: "Dueño",
        apertura_real: "2026-10-23T12:00:00Z",
        fecha: "2026-10-23"
      };
      turns = [currentTurn, ...turns.filter((row) => row.id !== currentTurn.id)];
    } else if (type === "turno_cerrar" && currentTurn) {
      currentTurn = { ...currentTurn, estado: "CERRADO", cierre_real: "2026-10-23T13:00:00Z" };
      turns = turns.map((row) => row.id === currentTurn.id ? { ...currentTurn } : row);
    }
    return { ok: true, offline: false, data: currentTurn?.id || "fixture" };
  };

  window.safeInit = (name, fn) => {
    if (name === "b7-turnos" || name === "b7-operacion") fn();
  };
  window.eval(SOURCE);
  window.poblarSelectAlmacenAbrirTurno();
  t.after(() => window.close());
  return {
    window, dom, operations, rpcCalls,
    getCurrentTurn: () => currentTurn,
    getTurns: () => turns
  };
}

test("Paso 4 turnos: abrir requiere almacén y un alta válida actualiza los controles visibles", async (t) => {
  const c = setup(t);
  const { window } = c;
  await window.refrescarTurnoActual();

  window.document.getElementById("btn-abrir-turno").click();
  assert.match(window.document.getElementById("msg-turno").textContent, /Seleccioná un almacén antes de abrir el turno/i);
  assert.equal(c.operations.length, 0, "sin almacén no se solicita ninguna operación");

  window.document.getElementById("turno-almacen-abrir").value = "alm-1";
  window.document.getElementById("btn-abrir-turno").click();
  assert.ok(await waitFor(() => c.getCurrentTurn()?.estado === "ABIERTO"),
    "el cliente mock debe dejar un turno abierto tras el alta válida");
  assert.equal(c.operations[0].type, "turno");
  assert.equal(c.operations[0].params.p_almacen_id, "alm-1");
  assert.ok(await waitFor(() =>
    window.document.getElementById("btn-abrir-turno").classList.contains("hidden") &&
    !window.document.getElementById("btn-cerrar-turno").classList.contains("hidden") &&
    window.document.getElementById("turno-almacen-abrir").classList.contains("hidden")),
    "la UI debe mostrar el turno abierto después de terminar la consulta de estado");

  window.document.getElementById("btn-cerrar-turno").click();
  assert.ok(await waitFor(() => c.getCurrentTurn()?.estado === "CERRADO"),
    "cerrar turno debe llamar la operación mock usando el turno abierto");
  assert.equal(c.operations[1].type, "turno_cerrar");
  assert.equal(c.operations[1].params.p_turno_id, "turno-fixture-1");
  assert.ok(await waitFor(() =>
    !window.document.getElementById("btn-abrir-turno").classList.contains("hidden") &&
    window.document.getElementById("btn-cerrar-turno").classList.contains("hidden") &&
    !window.document.getElementById("turno-almacen-abrir").classList.contains("hidden")),
    "la UI debe regresar al estado sin turno después de completar el cierre");
});

test("Paso 4 turnos: el filtro de estado se envía al historial y Refrescar restablece el listado", async (t) => {
  const seeded = [
    { id: "turno-open", estado: "ABIERTO", almacen_id: "alm-1", almacen_nombre: "Principal", usuario_nombre: "Dueño", fecha: "2026-10-23" },
    { id: "turno-closed", estado: "CERRADO", almacen_id: "alm-1", almacen_nombre: "Principal", usuario_nombre: "Dueño", fecha: "2026-10-22" }
  ];
  const c = setup(t, seeded);
  const { window } = c;
  await window.refrescarListaTurnos();
  assert.match(window.document.getElementById("lista-turnos").textContent, /ABIERTO/);
  assert.match(window.document.getElementById("lista-turnos").textContent, /CERRADO/);

  const estado = window.document.getElementById("turno-filtro-estado");
  estado.value = "CERRADO";
  estado.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.ok(await waitFor(() => /turno-closed/.test(window.document.getElementById("lista-turnos").textContent) ||
    window.document.getElementById("lista-turnos").textContent.includes("CERRADO")));
  const filtered = c.rpcCalls.filter((call) => call.name === "listar_turnos").at(-1);
  assert.equal(filtered.params.p_estado, "CERRADO");
  assert.doesNotMatch(window.document.getElementById("lista-turnos").textContent, /ABIERTO/);

  estado.value = "";
  window.document.getElementById("turnos-refrescar-btn").click();
  assert.ok(await waitFor(() => window.document.getElementById("lista-turnos").textContent.includes("ABIERTO")));
  const reset = c.rpcCalls.filter((call) => call.name === "listar_turnos").at(-1);
  assert.equal(reset.params.p_estado, null);
  assert.match(window.document.getElementById("lista-turnos").textContent, /CERRADO/);
});
