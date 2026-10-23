"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m51-movimientos-centro.js"),
  "utf8"
);

const FIXTURES = [
  { id: "mov-1", producto: "Arroz", usuario: "Roberto", tipo: "compra", almacen: "Principal", almacen_id: "alm-a", cantidad: 8, fecha: "2026-10-21T10:00:00.000Z", operacion_id: "op-1" },
  { id: "mov-2", producto: "Café", usuario: "Evelyn", tipo: "venta", almacen: "Principal", almacen_id: "alm-a", cantidad: -2, fecha: "2026-10-22T11:00:00.000Z", operacion_id: "op-2" },
  { id: "mov-3", producto: "Azúcar", usuario: "Roberto", tipo: "vale", almacen: "Reserva", almacen_id: "alm-b", cantidad: -1, fecha: "2026-10-23T12:00:00.000Z", operacion_id: "op-3" },
  { id: "mov-4", producto: "Harina", usuario: "Evelyn", tipo: "transferencia_entrada", almacen: "Reserva", almacen_id: "alm-b", cantidad: 5, fecha: "2026-10-24T13:00:00.000Z", operacion_id: "op-4" }
];

async function waitFor(predicate, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

async function boot(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<section id='tab-movimientos' class='tab-panel visible'>" +
        "<div class='pendientes-header'><h3>Movimientos</h3><span id='mov-conn-info'></span></div>" +
        "<p class='muted'>Trazabilidad fixture</p>" +
        "<div class='mando-filtros'><div id='mov-detalle'></div></div>" +
      "</section></body></html>",
    { url: "https://battlecruiser-movements.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );

  const { window } = dom;
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  window.tienePermiso = () => true;
  window.money = (value) => Number(value || 0).toFixed(2);
  window.fechaHora = (value) => String(value || "");
  window.esRpcFaltante = () => false;
  window.poblarSelectAlmacenes = (select) => {
    if (!select) return;
    select.innerHTML =
      "<option value=''>Todos los almacenes</option>" +
      "<option value='alm-a'>Principal</option>" +
      "<option value='alm-b'>Reserva</option>";
  };

  const rpcCalls = [];
  window.client = {
    rpc: async (name, params = {}) => {
      rpcCalls.push({ name, params: { ...params } });
      if (name !== "movimientos_producto") return { data: [], error: null };
      let rows = FIXTURES.slice();
      if (params.p_almacen_id) rows = rows.filter((row) => row.almacen_id === params.p_almacen_id);
      if (params.p_tipo) rows = rows.filter((row) => row.tipo === params.p_tipo);
      if (params.p_desde) rows = rows.filter((row) => row.fecha.slice(0, 10) >= params.p_desde);
      if (params.p_hasta) rows = rows.filter((row) => row.fecha.slice(0, 10) <= params.p_hasta);
      return { data: rows.map((row) => ({ ...row })), error: null };
    }
  };

  window.eval(SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  assert.ok(await waitFor(() => typeof window.refrescarMovimientos === "function"),
    "M51 debe instalar el hook de refresco");
  assert.ok(await waitFor(() => window.document.querySelectorAll("#mov-detalle .bc-m51-card").length === 4),
    "los cuatro movimientos fixture deben mostrarse inicialmente");
  t.after(() => window.close());
  return { dom, window, rpcCalls };
}

function visibleProducts(window) {
  return Array.from(window.document.querySelectorAll("#mov-detalle .bc-m51-card .bc-m51-card-title"))
    .map((node) => node.textContent.trim());
}

function lastMovimientosCall(rpcCalls) {
  return rpcCalls.filter((call) => call.name === "movimientos_producto").at(-1);
}

async function apply(window) {
  window.document.getElementById("mov-refrescar-btn").click();
  assert.ok(await waitFor(() => {
    const el = window.document.getElementById("mov-detalle");
    return el && !el.textContent.includes("Cargando movimientos…");
  }), "la lista debe terminar de actualizarse");
}

test("Paso 4 movimientos: filtro Tipo envía p_tipo y muestra el resultado correcto", async (t) => {
  const { window, rpcCalls } = await boot(t);
  const select = window.document.getElementById("mov-filtro-tipo");
  select.value = "venta";
  await apply(window);
  assert.equal(lastMovimientosCall(rpcCalls).params.p_tipo, "venta");
  assert.deepEqual(visibleProducts(window), ["Café"]);
});

test("Paso 4 movimientos: filtro Almacén envía p_almacen_id y limita las filas", async (t) => {
  const { window, rpcCalls } = await boot(t);
  const select = window.document.getElementById("mov-filtro-almacen");
  select.value = "alm-b";
  await apply(window);
  assert.equal(lastMovimientosCall(rpcCalls).params.p_almacen_id, "alm-b");
  assert.deepEqual(visibleProducts(window), ["Azúcar", "Harina"]);
});

test("Paso 4 movimientos: Desde/Hasta aplican el rango de fechas al RPC", async (t) => {
  const { window, rpcCalls } = await boot(t);
  window.document.getElementById("mov-filtro-desde").value = "2026-10-22";
  window.document.getElementById("mov-filtro-hasta").value = "2026-10-23";
  await apply(window);
  const params = lastMovimientosCall(rpcCalls).params;
  assert.equal(params.p_desde, "2026-10-22");
  assert.equal(params.p_hasta, "2026-10-23");
  assert.deepEqual(visibleProducts(window), ["Café", "Azúcar"]);
});

test("Paso 4 movimientos: búsqueda filtra por producto/usuario sin una segunda consulta", async (t) => {
  const { window, rpcCalls } = await boot(t);
  const countBefore = rpcCalls.filter((call) => call.name === "movimientos_producto").length;
  const search = window.document.getElementById("mov-buscar");
  search.value = "evelyn";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(visibleProducts(window), ["Café", "Harina"]);
  assert.equal(rpcCalls.filter((call) => call.name === "movimientos_producto").length, countBefore,
    "la búsqueda client-side no debe provocar otra llamada al servidor");
});

test("Paso 4 movimientos: Limpiar restaura filtros y consulta los cuatro movimientos", async (t) => {
  const { window, rpcCalls } = await boot(t);
  window.document.getElementById("mov-filtro-tipo").value = "vale";
  window.document.getElementById("mov-filtro-almacen").value = "alm-b";
  await apply(window);
  assert.deepEqual(visibleProducts(window), ["Azúcar"]);
  window.document.getElementById("mov-limpiar-btn").click();
  assert.ok(await waitFor(() => visibleProducts(window).length === 4),
    "limpiar debe restaurar las cuatro filas después de la nueva consulta");
  assert.equal(window.document.getElementById("mov-filtro-tipo").value, "");
  assert.equal(window.document.getElementById("mov-filtro-almacen").value, "");
  assert.equal(window.document.getElementById("mov-filtro-desde").value, "");
  assert.equal(window.document.getElementById("mov-filtro-hasta").value, "");
  assert.equal(window.document.getElementById("mov-buscar").value, "");
  const params = lastMovimientosCall(rpcCalls).params;
  assert.equal(params.p_tipo, null);
  assert.equal(params.p_almacen_id, null);
  assert.equal(params.p_desde, null);
  assert.equal(params.p_hasta, null);
});
