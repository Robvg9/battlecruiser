"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m51-movimientos-centro.js"),
  "utf8"
);

const FIXTURES = [
  { producto: "Bebida de hoy", usuario: "Dueño", tipo: "compra", almacen: "La Cueva", almacen_id: "alm-1", operacion_id: "op-today", fecha: "2026-10-27T14:00:00Z", cantidad: 10, costo_unitario: 2 },
  { producto: "Venta de ayer", usuario: "Dueño", tipo: "venta", almacen: "La Cueva", almacen_id: "alm-1", operacion_id: "op-yesterday", fecha: "2026-10-26T14:00:00Z", cantidad: -2, costo_unitario: 2 },
  { producto: "Vale antiguo", usuario: "Dueño", tipo: "vale", almacen: "Reserva", almacen_id: "alm-2", operacion_id: "op-older", fecha: "2026-10-25T14:00:00Z", cantidad: -1 }
];

const REAL_DATE = Date;

class FixedDate extends REAL_DATE {
  constructor(...args) {
    super(...(args.length ? args : ["2026-10-27T17:00:00.000Z"]));
  }
  static now() { return new REAL_DATE("2026-10-27T17:00:00.000Z").getTime(); }
}

async function waitFor(predicate, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function setup(t, fixtures = FIXTURES) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<section id='tab-movimientos' class='tab-panel visible'>" +
        "<div class='pendientes-header'><h3>Movimientos</h3><span id='mov-conn-info'></span></div>" +
        "<div class='mando-filtros'>" +
          "<label>Desde<input id='mov-filtro-desde' type='date'></label>" +
          "<label>Hasta<input id='mov-filtro-hasta' type='date'></label>" +
          "<select id='mov-filtro-almacen'><option value=''>Todos</option><option value='alm-1'>La Cueva</option><option value='alm-2'>Reserva</option></select>" +
          "<select id='mov-filtro-tipo'><option value=''>Todos los tipos</option><option value='compra'>Compra</option><option value='venta'>Venta</option><option value='vale'>Vale</option></select>" +
          "<button id='mov-refrescar-btn' type='button'>Aplicar</button>" +
        "</div><div id='mov-detalle'></div>" +
      "</section></body></html>",
    { url: "https://battlecruiser-daily-history.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  window.Date = FixedDate;
  window.tienePermiso = () => true;
  window.poblarSelectAlmacenes = () => {};
  window.money = (value) => Number(value || 0).toFixed(2);
  window.fechaHora = (value) => String(value || "");
  const rpcCalls = [];
  window.client = {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params: { ...params } });
      if (name !== "movimientos_producto") return { data: [], error: null };
      const rows = fixtures.filter((row) =>
        (!params.p_desde || row.fecha.slice(0, 10) >= params.p_desde) &&
        (!params.p_hasta || row.fecha.slice(0, 10) <= params.p_hasta) &&
        (!params.p_almacen_id || row.almacen_id === params.p_almacen_id) &&
        (!params.p_tipo || row.tipo === params.p_tipo)
      );
      const offset = Number(params.p_offset || 0);
      const limit = Number(params.p_limite || 500);
      return { data: rows.slice(offset, offset + limit).map((row) => ({ ...row })), error: null };
    }
  };
  // The M51 module uses timers only for idempotent UI setup in this isolated test.
  window.setTimeout = (callback) => { callback(); return 1; };
  window.clearTimeout = () => {};
  window.eval(SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.after(() => window.close());
  return { window, dom, rpcCalls };
}

function rows(window) {
  return Array.from(window.document.querySelectorAll("#mov-detalle .bc-m51-card"))
    .map((row) => row.textContent.replace(/\s+/g, " ").trim());
}

test("Paso 4: la vista inicial fija las fechas del día de negocio y oculta movimientos anteriores", async (t) => {
  const { window, rpcCalls } = setup(t);
  assert.ok(await waitFor(() => rows(window).length === 1), "la vista de hoy debe pintar solo su movimiento");
  assert.equal(window.document.getElementById("mov-filtro-desde").value, "2026-10-27");
  assert.equal(window.document.getElementById("mov-filtro-hasta").value, "2026-10-27");
  assert.equal(window.document.getElementById("mov-view-today").getAttribute("aria-pressed"), "true");
  assert.equal(window.document.getElementById("mov-view-history").getAttribute("aria-pressed"), "false");
  assert.match(rows(window)[0], /Bebida de hoy/);
  assert.doesNotMatch(window.document.getElementById("mov-detalle").textContent, /Venta de ayer|Vale antiguo/);
  assert.ok(rpcCalls.some((call) => call.name === "movimientos_producto" && call.params.p_desde === "2026-10-27" && call.params.p_hasta === "2026-10-27"));
});

test("Paso 4: Historial muestra días anteriores agrupados y plegables sin alterar registros", async (t) => {
  const { window } = setup(t);
  assert.ok(await waitFor(() => rows(window).length === 1));
  window.document.getElementById("mov-view-history").click();
  assert.ok(await waitFor(() => rows(window).length === 3), "Historial debe volver a consultar sin límites de fecha");
  assert.equal(window.document.getElementById("mov-filtro-desde").value, "");
  assert.equal(window.document.getElementById("mov-filtro-hasta").value, "");
  assert.equal(window.document.getElementById("mov-view-history").getAttribute("aria-pressed"), "true");
  assert.equal(window.document.querySelectorAll("#mov-detalle details.bc-m51-group-collapsible").length, 3);
  assert.match(window.document.getElementById("mov-detalle").textContent, /Bebida de hoy/);
  assert.match(window.document.getElementById("mov-detalle").textContent, /Venta de ayer/);
  assert.match(window.document.getElementById("mov-detalle").textContent, /Vale antiguo/);
  const details = window.document.querySelector("#mov-detalle details.bc-m51-group-collapsible");
  assert.ok(details && !details.open, "las agrupaciones del historial comienzan plegadas");
});

test("Paso 4: regresar de Historial a hoy restaura el rango diario", async (t) => {
  const { window } = setup(t);
  assert.ok(await waitFor(() => rows(window).length === 1));
  window.document.getElementById("mov-view-history").click();
  assert.ok(await waitFor(() => rows(window).length === 3));
  window.document.getElementById("mov-view-today").click();
  assert.ok(await waitFor(() => rows(window).length === 1));
  assert.equal(window.document.getElementById("mov-filtro-desde").value, "2026-10-27");
  assert.equal(window.document.getElementById("mov-filtro-hasta").value, "2026-10-27");
  assert.match(rows(window)[0], /Bebida de hoy/);
  assert.doesNotMatch(window.document.getElementById("mov-detalle").textContent, /Venta de ayer|Vale antiguo/);
});
test("Paso 4: Historial pagina por offset y no se limita silenciosamente a 500 filas", async (t) => {
  const many = Array.from({ length: 501 }, (_, i) => ({
    producto: "Producto " + i, usuario: "Dueño", tipo: "compra",
    almacen: "La Cueva", almacen_id: "alm-1", operacion_id: "op-" + i,
    fecha: "2026-10-27T14:00:00Z", cantidad: 1, costo_unitario: 1
  }));
  const { window, rpcCalls } = setup(t, many);
  assert.ok(await waitFor(() => rows(window).length === 40));
  assert.ok(rpcCalls.some((call) => call.params.p_offset === 0));
  assert.ok(rpcCalls.some((call) => call.params.p_offset === 500));
  assert.equal(window.document.getElementById("mov-view-today").getAttribute("aria-pressed"), "true");
  assert.equal(window.document.querySelector("#mov-paginacion").textContent.includes("501 registros"), true);
});

test("Paso 4: el límite de seguridad de 5.000 registros es visible y no afirma que el historial esté completo", async (t) => {
  const many = Array.from({ length: 5001 }, (_, i) => ({
    producto: "Producto " + i, usuario: "Dueño", tipo: "compra",
    almacen: "La Cueva", almacen_id: "alm-1", operacion_id: "op-cap-" + i,
    fecha: new Date(Date.UTC(2026, 9, 27, 14, 0, i % 60)).toISOString(),
    cantidad: 1, costo_unitario: 1
  }));
  const { window, rpcCalls } = setup(t, many);
  assert.ok(await waitFor(() => rows(window).length === 40));
  assert.equal(window.document.querySelectorAll("#mov-detalle .bc-m51-card").length, 40);
  assert.ok(rpcCalls.some((call) => call.params.p_offset === 4500));
  assert.equal(rpcCalls.some((call) => call.params.p_offset === 5000), false);
  assert.match(window.document.getElementById("mov-detalle").textContent, /límite de seguridad de 5\.000 registros/i);
  assert.match(window.document.getElementById("mov-detalle").textContent, /Reduce el rango de fechas/i);
});

