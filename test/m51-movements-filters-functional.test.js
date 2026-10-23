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
  { producto: "Agua", usuario: "Dueño", tipo: "compra", almacen: "Principal", almacen_id: "alm-1", operacion_id: "op-compra-1", fecha: "2026-10-20T10:00:00Z", cantidad: 10, costo_unitario: 2 },
  { producto: "Agua", usuario: "Dueño", tipo: "venta", almacen: "Principal", almacen_id: "alm-1", operacion_id: "op-venta-1", fecha: "2026-10-20T11:00:00Z", cantidad: 2, costo_unitario: 2 },
  { producto: "Azúcar", usuario: "Dueño", tipo: "venta", almacen: "Reserva", almacen_id: "alm-2", operacion_id: "op-venta-2", fecha: "2026-10-21T12:00:00Z", cantidad: 1, costo_unitario: 3 },
  { producto: "Harina", usuario: "Dueño", tipo: "vale", almacen: "Principal", almacen_id: "alm-1", operacion_id: "op-vale-1", fecha: "2026-10-22T13:00:00Z", cantidad: 1 }
];

async function waitFor(predicate, timeout = 1200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
    "<section id='tab-movimientos' class='tab-panel visible'>" +
      "<div class='pendientes-header'><h3>Movimientos</h3><span id='mov-conn-info'></span></div>" +
      "<div class='mando-filtros'>" +
        "<input id='mov-filtro-desde' type='date'>" +
        "<input id='mov-filtro-hasta' type='date'>" +
        "<select id='mov-filtro-almacen'>" +
          "<option value=''>Todos los almacenes</option>" +
          "<option value='alm-1'>Principal</option><option value='alm-2'>Reserva</option>" +
        "</select>" +
        "<select id='mov-filtro-tipo'>" +
          "<option value=''>Todos los tipos</option><option value='compra'>Compra</option>" +
          "<option value='venta'>Venta</option><option value='vale'>Vale</option>" +
        "</select>" +
        "<button type='button' id='mov-refrescar-btn'>Aplicar</button>" +
      "</div>" +
      "<div id='mov-detalle'></div>" +
    "</section></body></html>",
    { url: "https://battlecruiser-movements.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  const rpcCalls = [];
  window.tienePermiso = () => true;
  window.poblarSelectAlmacenes = () => {};
  window.money = (value) => Number(value || 0).toFixed(2);
  window.fechaHora = (value) => String(value || "");
  window.client = {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params: { ...params } });
      if (name !== "movimientos_producto") return { data: [], error: null };
      const rows = FIXTURES.filter((row) =>
        (!params.p_tipo || row.tipo === params.p_tipo) &&
        (!params.p_almacen_id || row.almacen_id === params.p_almacen_id) &&
        (!params.p_desde || row.fecha.slice(0, 10) >= params.p_desde) &&
        (!params.p_hasta || row.fecha.slice(0, 10) <= params.p_hasta)
      );
      return { data: rows.map((row) => ({ ...row })), error: null };
    }
  };
  window.setTimeout = (callback) => { callback(); return 1; };
  window.eval(SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.after(() => window.close());
  return { window, dom, rpcCalls };
}

function visibleRows(window) {
  return Array.from(window.document.querySelectorAll("#mov-detalle .bc-m51-card"))
    .map((row) => row.textContent.replace(/\s+/g, " ").trim());
}

test("Paso 4 movimientos: filtrar por tipo y almacén envía los parámetros correctos y muestra solo el resultado", async (t) => {
  const c = setup(t);
  const { window } = c;
  assert.ok(await waitFor(() => visibleRows(window).length === 4),
    "la carga inicial debe pintar los cuatro movimientos fixture");
  window.document.getElementById("mov-filtro-almacen").value = "alm-1";
  window.document.getElementById("mov-filtro-tipo").value = "venta";
  window.document.getElementById("mov-refrescar-btn").click();
  assert.ok(await waitFor(() => visibleRows(window).length === 1),
    "tipo=venta y almacén Principal deben mostrar una sola fila");
  const latest = c.rpcCalls.filter((call) => call.name === "movimientos_producto").at(-1);
  assert.equal(latest.params.p_tipo, "venta");
  assert.equal(latest.params.p_almacen_id, "alm-1");
  assert.match(visibleRows(window)[0], /Agua/);
  assert.match(visibleRows(window)[0], /Salida/);
  assert.doesNotMatch(window.document.getElementById("mov-detalle").textContent, /Azúcar|Harina/);
});

test("Paso 4 movimientos: Limpiar restablece filtros y recupera la lista completa", async (t) => {
  const { window } = setup(t);
  assert.ok(await waitFor(() => visibleRows(window).length === 4));
  window.document.getElementById("mov-filtro-almacen").value = "alm-2";
  window.document.getElementById("mov-filtro-tipo").value = "venta";
  window.document.getElementById("mov-refrescar-btn").click();
  assert.ok(await waitFor(() => visibleRows(window).length === 1));
  window.document.getElementById("mov-limpiar-btn").click();
  assert.ok(await waitFor(() => visibleRows(window).length === 4),
    "Limpiar debe recargar los cuatro movimientos fixture");
  assert.equal(window.document.getElementById("mov-filtro-almacen").value, "");
  assert.equal(window.document.getElementById("mov-filtro-tipo").value, "");
  assert.equal(window.document.getElementById("mov-buscar").value, "");
});

test("Paso 4 movimientos: búsqueda se aplica a los datos cargados y muestra estado vacío recuperable", async (t) => {
  const { window } = setup(t);
  assert.ok(await waitFor(() => visibleRows(window).length === 4));
  const search = window.document.getElementById("mov-buscar");
  search.value = "azúcar";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(visibleRows(window).length, 1);
  assert.match(visibleRows(window)[0], /Azúcar/);
  search.value = "no-existe-fixture";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(window.document.getElementById("mov-detalle").textContent, /No encontramos movimientos para los filtros seleccionados/i);
  assert.ok(window.document.getElementById("mov-empty-clear"),
    "el estado vacío ofrece una ruta para limpiar filtros");
});
