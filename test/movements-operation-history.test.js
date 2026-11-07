"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const M76 = fs.readFileSync(path.join(__dirname, "..", "public", "js", "m76-movimientos-operaciones.js"), "utf8");

function transferRows(reference, count, date, base) {
  const outgoing = [];
  const incoming = [];
  for (let i = 0; i < count; i++) {
    const productId = base + i;
    const common = {
      operacion_id: reference,
      producto_id: productId,
      producto: "Producto " + productId,
      cantidad: 2,
      fecha: date,
      usuario: "Operador",
      costo_unitario: 3.5
    };
    outgoing.push({ ...common, tipo: "transferencia_salida", almacen: "Almacén Casa" });
    incoming.push({ ...common, tipo: "transferencia_entrada", almacen: "Almacén Secundario" });
  }
  return outgoing.concat(incoming);
}

function commercialRows(reference, kind, count, date, base) {
  return Array.from({ length: count }, (_, i) => ({
    operacion_id: reference,
    tipo: kind,
    producto_id: base + i,
    producto: "Producto " + (base + i),
    cantidad: i + 1,
    fecha: date,
    usuario: "Operador",
    almacen: "Almacén Casa",
    costo_unitario: 2.25
  }));
}

function fixture(t) {
  const html = '<!doctype html><html><head></head><body>' +
    '<button id="logout-btn" type="button">Cerrar sesión</button>' +
    '<button id="mi-cuenta-btn" type="button">Mi Cuenta</button>' +
    '<section id="tab-movimientos" class="tab-panel visible">' +
      '<header class="bc-m51-hero"><div><h3>Movimientos de inventario</h3></div></header>' +
      '<div class="bc-m51-view-switch"><div><strong id="mov-view-title">Movimientos de hoy</strong></div>' +
        '<div class="bc-m51-view-actions"><button id="mov-view-today" aria-pressed="true">Movimientos de hoy</button><button id="mov-view-history" aria-pressed="false">Historial</button></div></div>' +
      '<div id="mov-resumen-m51" class="bc-m51-metrics"></div>' +
      '<div id="mov-filtros-m51" class="bc-m51-filters">' +
        '<div class="bc-m51-filter"><label for="mov-buscar">Buscar</label><input id="mov-buscar" type="search" placeholder="Buscar operación o producto…"></div>' +
        '<div class="bc-m51-filter"><label for="mov-filtro-desde">Desde</label><input id="mov-filtro-desde" type="date"></div>' +
        '<div class="bc-m51-filter"><label for="mov-filtro-hasta">Hasta</label><input id="mov-filtro-hasta" type="date"></div>' +
        '<div class="bc-m51-filter"><label for="mov-filtro-almacen">Almacén</label><select id="mov-filtro-almacen"><option value="">Todos</option><option value="a">Casa</option></select></div>' +
        '<div class="bc-m51-filter"><label for="mov-filtro-tipo">Tipo</label><select id="mov-filtro-tipo"><option value="">Todo</option><option value="compra">Compras</option><option value="reinversion">Reinversiones</option><option value="baja">Bajas</option><option value="movimiento_interno">Movimientos internos</option></select></div>' +
        '<button type="button" id="mov-refrescar-btn">Generar</button><button type="button" id="mov-limpiar-btn">Limpiar</button>' +
      '</div>' +
      '<div id="mov-chips-m51"></div><div id="mov-detalle"></div><div id="mov-paginacion"></div>' +
    '</section></body></html>';
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://battlecruiser.test/" });
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { configurable: true, value: "complete" });
  window.renderMovimientos = function () {};
  window.eval(M76);
  t.after(() => window.close());
  return window;
}


test("M76 usa el resumen diario aunque el historial visible esté filtrado", async (t) => {
  const window = fixture(t);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Havana", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const date = {}; parts.forEach(x => { if (x.type !== "literal") date[x.type] = x.value; });
  const at = date.year + "-" + date.month + "-" + date.day + "T12:00:00";
  const visibleRows = commercialRows("BUY-FILTERED", "compra", 1, at, 900);
  const todayRows = [
    ...commercialRows("BUY-TODAY", "compra", 2, at, 910),
    ...transferRows("TR-TODAY-A", 2, at, 920),
    ...transferRows("TR-TODAY-B", 1, at, 930),
    ...commercialRows("REINV-TODAY", "reinversion", 1, at, 940),
    ...commercialRows("BAJA-TODAY", "baja", 1, at, 950)
  ];
  window.renderMovimientos(visibleRows);
  window.dispatchEvent(new window.CustomEvent("bc:m51-rows", { detail: { rows: visibleRows, todayRows, historyTruncated: false } }));
  await new Promise(resolve => window.setTimeout(resolve, 10));
  const cards = Array.from(window.document.querySelectorAll("#mov-resumen-m51 .bc-m51-metric"));
  assert.deepEqual(cards.map(x => x.querySelector(".bc-m51-metric-label").textContent.trim()),
    ["Compras", "Mov. internos", "Bajas", "Reinversiones"]);
  assert.deepEqual(cards.map(x => x.querySelector(".bc-m51-metric-value").textContent.trim()), ["1", "2", "1", "1"]);
  assert.doesNotMatch(window.document.getElementById("mov-resumen-m51").textContent, /Operaciones/);
});

test("M76 agrupa ambas caras de una transferencia y no duplica unidades", (t) => {
  const window = fixture(t);
  const rows = transferRows("TR-4", 4, "2026-11-06T10:00:00", 100);
  const operations = window.__BC_M76_TEST__.groupOperations(rows);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].productCount, 4);
  assert.equal(operations[0].totalUnits, 8, "usa el lado de salida una sola vez");
  assert.equal(operations[0].origen, "Almacén Casa");
  assert.equal(operations[0].destino, "Almacén Secundario");
});

test("M76 muestra una sola tarjeta por operación comercial, no una por producto", async (t) => {
  const window = fixture(t);
  const rows = [
    ...transferRows("TR-4", 4, "2026-11-06T10:00:00", 100),
    ...transferRows("TR-12", 12, "2026-11-06T11:00:00", 200),
    ...commercialRows("BUY-4", "compra", 4, "2026-11-06T12:00:00", 300),
    ...commercialRows("BUY-8", "compra", 3, "2026-11-06T12:30:00", 350),
    ...commercialRows("REINV-2", "reinversion", 2, "2026-11-06T13:00:00", 400),
    ...commercialRows("BAJA-1", "baja", 1, "2026-11-06T14:00:00", 500)
  ];
  window.renderMovimientos(rows);
  await new Promise(resolve => window.setTimeout(resolve, 10));

  const operations = window.__BC_M76_TEST__.getState().operations;
  assert.equal(operations.length, 6);
  assert.equal(operations.filter(op => op.kind === 'compra').length, 2);
  assert.equal(operations.find(op => op.reference === 'BUY-8').productCount, 3);
  assert.equal(operations.find(op => op.reference === "TR-4").productCount, 4);
  assert.equal(operations.find(op => op.reference === "TR-12").productCount, 12);
  assert.equal(window.document.querySelectorAll(".bc-m76-op-card").length, 6);
  assert.equal(window.document.querySelectorAll(".bc-m76-category").length, 5);
  const categories = Array.from(window.document.querySelectorAll(".bc-m76-category")).map(button => button.textContent.trim());
  assert.ok(categories.includes("Compras"));
  assert.ok(categories.includes("Reinversiones"));
  assert.ok(categories.includes("Bajas"));
  assert.ok(categories.includes("Movimientos internos"));
  assert.ok(!categories.includes("Movimientos"), "no queda un filtro genérico de movimientos");
  assert.doesNotMatch(window.document.getElementById("mov-resumen-m51").textContent, /Operaciones/);
  assert.deepEqual(Array.from(window.document.querySelectorAll("#mov-resumen-m51 .bc-m51-metric-label")).map(el => el.textContent.trim()),
    ["Compras", "Mov. internos", "Bajas", "Reinversiones"]);
});

test("M76 abre el detalle flotante con todas las líneas y el recorrido de almacén", async (t) => {
  const window = fixture(t);
  const rows = transferRows("TR-4", 4, "2026-11-06T10:00:00", 100);
  window.renderMovimientos(rows);
  await new Promise(resolve => window.setTimeout(resolve, 10));
  const operation = window.__BC_M76_TEST__.getState().operations.find(op => op.reference === "TR-4");
  const index = window.__BC_M76_TEST__.getState().operations.indexOf(operation);
  const card = window.document.querySelector('[data-bc-m76-op="' + index + '"]');
  assert.ok(card);
  card.click();

  const modal = window.document.getElementById("bc-m76-operation-modal");
  assert.equal(modal.hidden, false);
  const body = modal.querySelector("#bc-m76-modal-body");
  assert.equal(body.querySelectorAll(".bc-m76-product").length, 4);
  assert.match(body.textContent, /Almacén Casa/);
  assert.match(body.textContent, /Almacén Secundario/);
  assert.match(body.textContent, /Total de unidades/);
  assert.match(body.textContent, /8 u/);
  modal.querySelector('[data-bc-m76-close="1"]').click();
  assert.equal(modal.hidden, true);
});

test("M76 recibe el snapshot completo de M51 después de paginar el historial", async (t) => {
  const window = fixture(t);
  const rows = Array.from({ length: 1200 }, (_, index) => ({
    operacion_id: "OP-" + index,
    tipo: index % 4 === 0 ? "compra" : index % 4 === 1 ? "reinversion" : index % 4 === 2 ? "baja" : "transferencia_salida",
    producto_id: "P-" + index,
    producto: "Producto " + index,
    cantidad: 1,
    fecha: "2026-11-06T10:00:00",
    usuario: "Operador",
    almacen: "Almacén Casa"
  }));
  window.__BC_M51_ROWS__ = rows;
  window.dispatchEvent(new window.CustomEvent("bc:m51-rows", {
    detail: { rows, todayRows: rows, historyTruncated: false }
  }));
  await new Promise(resolve => window.setTimeout(resolve, 10));
  const state = window.__BC_M76_TEST__.getState();
  assert.equal(state.rows.length, 1200);
  assert.equal(state.summaryRows.length, 1200);
  assert.equal(state.operations.length, 1200);
  assert.equal(window.document.querySelector(".bc-m76-pagination").textContent.includes("1200 operaciones"), true);
});

test("M76 no fusiona registros sin ID de operación por compartir hora y usuario", (t) => {
  const window = fixture(t);
  const sameMoment = [
    { tipo: "compra", producto_id: "P1", producto: "Producto A", cantidad: 2, fecha: "2026-11-06T10:00:00", usuario: "Operador", almacen: "Almacén Casa" },
    { tipo: "compra", producto_id: "P2", producto: "Producto B", cantidad: 3, fecha: "2026-11-06T10:00:00", usuario: "Operador", almacen: "Almacén Casa" }
  ];
  const operations = window.__BC_M76_TEST__.groupOperations(sameMoment);
  assert.equal(operations.length, 2);
});

test("M76 compacta filtros y conserva etiquetas accesibles en botones con iconos", (t) => {
  const window = fixture(t);
  const tab = window.document.getElementById("tab-movimientos");
  const toolbar = tab.querySelector(".bc-m76-filter-toolbar");
  const advanced = tab.querySelector("#bc-m76-filter-advanced");
  assert.ok(toolbar);
  assert.equal(advanced.hidden, true, "los filtros avanzados empiezan plegados");
  toolbar.querySelector(".bc-m76-filter-toggle").click();
  assert.equal(advanced.hidden, false);
  assert.equal(tab.querySelector("#mov-buscar").closest(".bc-m76-filter-toolbar") !== null, true);

  const logout = window.document.getElementById("logout-btn");
  assert.ok(logout.querySelector("svg"));
  assert.equal(logout.getAttribute("aria-label"), "Cerrar sesión");
  const account = window.document.getElementById("mi-cuenta-btn");
  assert.ok(account.querySelector("svg"));
  assert.equal(account.getAttribute("aria-label"), "Mi cuenta");
});
