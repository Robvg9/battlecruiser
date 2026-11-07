"use strict";

// Owner issue #194: exercise America/Havana day boundaries, empty history and filter preservation.
// All RPC data below is mocked in memory; this test never writes business records.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m51-movimientos-centro.js"),
  "utf8"
);
const REAL_DATE = Date;
const BUSINESS_ZONE = "America/Havana";

function businessDay(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new REAL_DATE(value));
  const result = {};
  for (const part of parts) {
    if (part.type !== "literal") result[part.type] = part.value;
  }
  return result.year + "-" + result.month + "-" + result.day;
}

async function waitFor(predicate, timeout = 1500) {
  const deadline = REAL_DATE.now() + timeout;
  while (REAL_DATE.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function setup(t, { now = "2026-10-27T17:00:00.000Z", fixtures = [], windows = [] } = {}) {
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
    { url: "https://battlecruiser-daily-history-edge.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;

  window.Date = class FixedDate extends REAL_DATE {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return new REAL_DATE(now).getTime();
    }
  };
  window.tienePermiso = () => true;
  window.poblarSelectAlmacenes = () => {};
  window.money = (value) => Number(value || 0).toFixed(2);
  window.fechaHora = (value) => String(value || "");
  const rpcCalls = [];
  window.client = {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params: { ...params } });
      if (name === "bc_movimientos_resumen_ventanas") return { data: windows.map((item) => ({ ...item })), error: null };
      if (name !== "movimientos_producto") return { data: [], error: null };
      const rows = fixtures.filter((row) =>
        (!params.p_desde || businessDay(row.fecha) >= params.p_desde) &&
        (!params.p_hasta || businessDay(row.fecha) <= params.p_hasta) &&
        (!params.p_almacen_id || row.almacen_id === params.p_almacen_id) &&
        (!params.p_tipo || row.tipo === params.p_tipo)
      );
      const offset = Number(params.p_offset || 0);
      const limit = Number(params.p_limite || 500);
      return { data: rows.slice(offset, offset + limit).map((row) => ({ ...row })), error: null };
    }
  };

  // This module uses timers for idempotent DOM setup. Keep setup deterministic
  // while waitFor() above uses the real process timer and clock.
  window.setTimeout = (callback) => { callback(); return 1; };
  window.clearTimeout = () => {};
  window.eval(SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.after(() => window.close());
  return { window, dom, rpcCalls };
}

function visibleRows(window) {
  return Array.from(window.document.querySelectorAll("#mov-detalle .bc-m51-card"))
    .map((row) => row.textContent.replace(/\s+/g, " ").trim());
}

function record(producto, tipo, almacen, almacen_id, fecha) {
  return {
    producto,
    usuario: "Dueño",
    tipo,
    almacen,
    almacen_id,
    operacion_id: "op-" + producto.replace(/\s+/g, "-").toLowerCase(),
    fecha,
    cantidad: tipo === "compra" ? 1 : -1,
    costo_unitario: 2
  };
}

test("Paso 4: el día de negocio cruza la medianoche UTC según America/Havana", async (t) => {
  const fixtures = [
    record("Cierre del día cubano", "compra", "La Cueva", "alm-1", "2026-10-27T03:30:00.000Z"),
    record("Apertura del siguiente día cubano", "compra", "La Cueva", "alm-1", "2026-10-27T04:30:00.000Z")
  ];
  const { window, rpcCalls } = setup(t, {
    now: "2026-10-27T02:00:00.000Z",
    fixtures
  });

  assert.ok(await waitFor(() => visibleRows(window).length === 1), "solo debe aparecer el registro del día local actual");
  assert.equal(window.document.getElementById("mov-filtro-desde").value, "2026-10-26");
  assert.equal(window.document.getElementById("mov-filtro-hasta").value, "2026-10-26");
  assert.match(visibleRows(window)[0], /Cierre del día cubano/);
  assert.doesNotMatch(window.document.getElementById("mov-detalle").textContent, /Apertura del siguiente día cubano/);

  const todayRequest = rpcCalls.find((call) => call.name === "movimientos_producto");
  assert.equal(todayRequest.params.p_desde, "2026-10-26");
  assert.equal(todayRequest.params.p_hasta, "2026-10-26");

  window.document.getElementById("mov-view-history").click();
  assert.ok(await waitFor(() => visibleRows(window).length === 2), "Historial debe incluir ambos días locales");
  const groups = Array.from(window.document.querySelectorAll("#mov-detalle details.bc-m51-group-collapsible"))
    .map((group) => group.getAttribute("data-day")).sort();
  assert.deepEqual(groups, ["2026-10-26", "2026-10-27"]);
});

test("Paso 4: Historial vacío es un estado legítimo del servidor y permite volver a hoy", async (t) => {
  const { window } = setup(t, { fixtures: [] });
  const detail = window.document.getElementById("mov-detalle");

  assert.ok(await waitFor(() => detail.querySelector(".bc-m51-empty")));
  assert.match(detail.textContent, /Sin movimientos/i);
  assert.equal(window.document.querySelector(".bc-m51-error"), null);
  assert.match(window.document.getElementById("mov-conn-info").textContent, /Datos de Supabase/);

  window.document.getElementById("mov-view-history").click();
  assert.ok(await waitFor(() => detail.querySelector(".bc-m51-empty")));
  assert.equal(window.document.getElementById("mov-view-history").getAttribute("aria-pressed"), "true");
  assert.match(detail.textContent, /No encontramos movimientos para los filtros seleccionados/i);
  assert.equal(visibleRows(window).length, 0);
  assert.equal(window.document.querySelector(".bc-m51-error"), null);

  window.document.getElementById("mov-view-today").click();
  assert.ok(await waitFor(() => detail.querySelector(".bc-m51-empty")));
  assert.equal(window.document.getElementById("mov-view-today").getAttribute("aria-pressed"), "true");
  assert.equal(visibleRows(window).length, 0);
});

test("Paso 4: entrar en Historial conserva almacén y tipo, pero quita los límites de hoy", async (t) => {
  const fixtures = [
    record("Compra hoy La Cueva", "compra", "La Cueva", "alm-1", "2026-10-27T14:00:00.000Z"),
    record("Compra ayer La Cueva", "compra", "La Cueva", "alm-1", "2026-10-26T14:00:00.000Z"),
    record("Venta hoy La Cueva", "venta", "La Cueva", "alm-1", "2026-10-27T15:00:00.000Z"),
    record("Compra hoy Reserva", "compra", "Reserva", "alm-2", "2026-10-27T16:00:00.000Z")
  ];
  const { window, rpcCalls } = setup(t, { fixtures });
  const warehouse = window.document.getElementById("mov-filtro-almacen");
  const type = window.document.getElementById("mov-filtro-tipo");

  warehouse.value = "alm-1";
  type.value = "compra";
  window.document.getElementById("mov-refrescar-btn").click();
  assert.ok(await waitFor(() => visibleRows(window).length === 1));
  assert.match(visibleRows(window)[0], /Compra hoy La Cueva/);

  window.document.getElementById("mov-view-history").click();
  assert.ok(await waitFor(() => visibleRows(window).length === 2), "Historial debe ampliar las fechas conservando los filtros funcionales");
  assert.equal(window.document.getElementById("mov-filtro-desde").value, "");
  assert.equal(window.document.getElementById("mov-filtro-hasta").value, "");
  assert.equal(warehouse.value, "alm-1");
  assert.equal(type.value, "compra");

  const historyRequest = rpcCalls.filter((call) => call.name === "movimientos_producto" && call.params.p_almacen_id === "alm-1" && call.params.p_tipo === "compra" && call.params.p_desde === null && call.params.p_hasta === null).at(-1);
  assert.ok(historyRequest, "el RPC principal del historial debe quitar los límites de hoy y conservar almacén/tipo");
  assert.equal(historyRequest.params.p_desde, null);
  assert.equal(historyRequest.params.p_hasta, null);
  assert.equal(historyRequest.params.p_almacen_id, "alm-1");
  assert.equal(historyRequest.params.p_tipo, "compra");

  const rendered = visibleRows(window).join("\n");
  assert.match(rendered, /Compra hoy La Cueva/);
  assert.match(rendered, /Compra ayer La Cueva/);
  assert.doesNotMatch(rendered, /Venta hoy La Cueva|Compra hoy Reserva/);
});


test("resumen híbrido: La Cueva conserva la última jornada y Almacén Casa reinicia por día", async (t) => {
  const fixtures = [
    record("Compra de la última jornada", "compra", "La Cueva", "alm-1", "2026-11-06T16:00:00.000Z"),
    record("Transferencia de la última jornada", "transferencia_entrada", "La Cueva", "alm-1", "2026-11-06T20:00:00.000Z"),
    record("Compra posterior al cierre", "compra", "La Cueva", "alm-1", "2026-11-07T03:45:00.000Z"),
    record("Compra de hoy en Casa", "compra", "Almacén Casa", "alm-2", "2026-11-07T06:00:00.000Z"),
    record("Compra de ayer en Casa", "compra", "Almacén Casa", "alm-2", "2026-11-06T18:00:00.000Z"),
    record("Reinversión de hoy en Casa", "reinversion", "Almacén Casa", "alm-2", "2026-11-07T08:00:00.000Z")
  ];
  const windows = [
    { almacen_id: "alm-1", almacen: "La Cueva", tipo: "minorista", desde: "2026-11-06T14:00:00.000Z", hasta: "2026-11-07T03:30:00.000Z", modo: "ULTIMA_JORNADA" },
    { almacen_id: "alm-2", almacen: "Almacén Casa", tipo: "almacenamiento", desde: "2026-11-07T05:00:00.000Z", hasta: "2026-11-07T10:00:00.000Z", modo: "DIARIO" }
  ];
  const { window, rpcCalls } = setup(t, { now: "2026-11-07T10:00:00.000Z", fixtures, windows });
  assert.ok(await waitFor(() => Array.isArray(window.__BC_M51_TODAY_ROWS__)), "el resumen independiente debe terminar");
  const summary = window.__BC_M51_TODAY_ROWS__;
  const products = summary.map((row) => row.producto);
  assert.deepEqual(products.sort(), [
    "Compra de hoy en Casa",
    "Compra de la última jornada",
    "Reinversión de hoy en Casa",
    "Transferencia de la última jornada"
  ].sort());
  assert.match(window.__BC_M51_TODAY_SUMMARY_LABEL__, /La Cueva: última jornada/);
  assert.match(window.__BC_M51_TODAY_SUMMARY_LABEL__, /Almacén Casa: día calendario/);
  const warehouseSummaryCalls = rpcCalls.filter((call) => call.name === "movimientos_producto" && call.params.p_almacen_id);
  assert.deepEqual(warehouseSummaryCalls.map((call) => call.params.p_almacen_id).sort(), ["alm-1", "alm-2"]);
  assert.ok(warehouseSummaryCalls.some((call) => call.params.p_almacen_id === "alm-1" && call.params.p_desde === "2026-11-06"));
  assert.ok(warehouseSummaryCalls.some((call) => call.params.p_almacen_id === "alm-2" && call.params.p_desde === "2026-11-07"));
});

test("La ventana de jornada elige jornadas reales y mantiene intactos los datos", () => {
  assert.match(migration, /s\.estado IN \('EN_CURSO','COMPLETADA'\)/);
  assert.match(migration, /ORDER BY CASE WHEN j\.estado='EN_CURSO' THEN 0 ELSE 1 END/);
  assert.match(migration, /j\.inicio_real DESC NULLS LAST/);
  assert.match(migration, /'ULTIMA_JORNADA'/);
  assert.match(migration, /'DIARIO_SIN_JORNADA'/);
  assert.doesNotMatch(migration, /INSERT INTO public\.turno_sesiones|UPDATE public\.turno_sesiones|DELETE FROM public\.turno_sesiones/i);
});
