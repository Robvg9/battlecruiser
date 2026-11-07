"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const m53Source = fs.readFileSync(path.join(root, "public/js/m53-inventario-centro.js"), "utf8");
const detailSource = fs.readFileSync(path.join(root, "public/js/inventario-detalle.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "public/js/core.js"), "utf8");

const rows = [
  { producto_id: "biz", producto: "Bizcocho", almacen: "Almacén Casa", almacen_id: "a1", cantidad: 70, minimo: 5, unidad: "u", estado: "normal", valor_inventario: 123456.78 },
  { producto_id: "biz", producto: "Bizcocho", almacen: "La Cueva", almacen_id: "a2", cantidad: 200, minimo: 10, unidad: "u", estado: "normal", valor_inventario: 345678.90 },
  { producto_id: "cafe", producto: "Café", almacen: "Almacén Casa", almacen_id: "a1", cantidad: 2, minimo: 5, unidad: "kg", estado: "bajo", valor_inventario: 2500 },
  { producto_id: "cafe", producto: "Café", almacen: "La Cueva", almacen_id: "a2", cantidad: 4, minimo: 4, unidad: "kg", estado: "normal", valor_inventario: 5000 },
  { producto_id: "harina", producto: "Harina", almacen: "Almacén Casa", almacen_id: "a1", cantidad: 0, minimo: 2, unidad: "kg", estado: "agotado", valor_inventario: 0 }
];

async function waitFor(predicate, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

async function boot(t, options = {}) {
  const fixtureRows = rows.map((row) => ({ ...row }));
  const rpcCalls = [];
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<section id='tab-inventario' class='tab-panel visible'>" +
        "<div class='pendientes-header'><h3>Inventario</h3><span id='inv-conn-info'></span></div>" +
        "<p class='muted'>Inventario de prueba.</p>" +
        "<div class='mando-filtros'><select id='inv-filtro-estado'>" +
          "<option value='todos'>Todos</option><option value='bajo'>Bajo mínimo</option>" +
          "<option value='agotado'>Agotados</option><option value='normal'>Normales</option>" +
        "</select></div>" +
        "<div id='inv-detalle' class='lista'></div><div id='lista-stock-bajo'></div>" +
      "</section></body></html>",
    { url: "https://battlecruiser-inventory-grouped.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  window.tienePermiso = (section, action) => !(options.canEdit === false && section === 'stock' && action === 'editar');
  window.poblarSelectAlmacenes = () => {};
  window.escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  window.numberFmt = (value, options) => new Intl.NumberFormat("es-ES", {
    useGrouping: true, maximumFractionDigits: 2, ...(options || {})
  }).format(value);
  window.money = (value) => new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value);
  window.client = {
    from(table) {
      const query = {
        select() { return query; },
        order: async () => table === "almacenes"
          ? { data: [{ id: "a1", nombre: "Almacén Casa" }, { id: "a2", nombre: "La Cueva" }], error: null }
          : { data: [], error: null },
        eq() { return query; },
        maybeSingle: async () => ({
          data: {
            id: "biz", nombre: "Bizcocho", unidad: "u",
            categorias: { nombre: "Repostería" },
            presentaciones: { nombre: "Caja" },
            inventario_mixto: false
          }, error: null
        })
      };
      return query;
    },
    rpc: async (name, args = {}) => {
      rpcCalls.push({ name, args });
      if (name === "inventario_enriquecido") {
        // The real RPC returns warehouse names but not almacen_id.
        return { data: fixtureRows.map(({ almacen_id, ...row }) => ({ ...row })), error: null };
      }
      if (name === "inventario_mixto_enriquecido") return { data: [], error: null };
      if (name === "movimientos_producto") return {
        data: [
          { fecha: "2026-11-05T14:30:00Z", tipo: "compra", producto: "Bizcocho", almacen: "Almacén Casa", cantidad: 30, usuario: "Prueba" },
          { fecha: "2026-11-04T10:00:00Z", tipo: "transferencia_entrada", producto: "Bizcocho", almacen: "La Cueva", cantidad: 20, usuario: "Prueba" }
        ], error: null
      };
      if (name === "bc_actualizar_stock_minimo_obligatorio") {
        if (options.canEdit === false) {
          return { data: null, error: { code: "42501", message: "No tenés permiso para editar el stock mínimo." } };
        }
        const target = fixtureRows.find((row) =>
          String(row.producto_id) === String(args.p_producto_id) &&
          String(row.almacen_id) === String(args.p_almacen_id)
        );
        if (!target) return { data: null, error: { message: "Fila no encontrada" } };
        target.minimo = Number(args.p_minimo);
        target.estado = Number(target.cantidad) <= 0 ? "agotado"
          : Number(target.cantidad) <= target.minimo && target.minimo > 0 ? "bajo" : "normal";
        return { data: { ...target }, error: null };
      }
      throw new Error("RPC inesperado en prueba: " + name);
    }
  };
  window.__rpcCalls = rpcCalls;
  window.__fixtureRows = fixtureRows;
  window.eval(m53Source);
  window.eval(detailSource);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  assert.ok(await waitFor(() => typeof window.refrescarInventario === "function"), "M53 debe instalar su API");
  await window.refrescarInventario();
  assert.ok(await waitFor(() => window.document.querySelectorAll("#inv-detalle [data-inv-producto]").length === 3),
    "deben mostrarse tres productos agrupados");
  t.after(() => window.close());
  return { window, dom, fixtureRows, rpcCalls };
}

test("Inventario: un solo producto agrupa almacenes, cantidades, mínimos e IDs reales aunque el RPC no devuelve almacen_id", async (t) => {
  const { window } = await boot(t);
  const cards = Array.from(window.document.querySelectorAll("#inv-detalle [data-inv-producto]"));
  const bizcocho = cards.filter((card) => card.getAttribute("data-inv-producto") === "biz");
  assert.equal(bizcocho.length, 1, "Bizcocho aparece una sola vez aunque tenga existencias en dos almacenes");
  assert.match(bizcocho[0].textContent, /Almacén Casa/);
  assert.match(bizcocho[0].textContent, /La Cueva/);
  assert.match(bizcocho[0].textContent, /70 u/);
  assert.match(bizcocho[0].textContent, /200 u/);
  assert.match(bizcocho[0].textContent, /mín 5/);
  assert.match(bizcocho[0].textContent, /mín 10/);
  assert.match(bizcocho[0].textContent, /Disponible/);
  assert.doesNotMatch(bizcocho[0].textContent, /123456|345678|469135|Inversión|Valor inventario/i);
  assert.equal(window.document.querySelectorAll("#inv-detalle [data-inv-producto]").length, 3);
  const grouped = window._invFilas.find((row) => row.producto_id === "biz");
  assert.deepEqual(Array.from(grouped.almacenes, (x) => x.almacen), ["Almacén Casa", "La Cueva"]);
  assert.deepEqual(Array.from(grouped.almacenes, (x) => x.almacen_id), ["a1", "a2"],
    "M53 debe resolver los UUID de almacén que faltan en la respuesta estándar");
});

test("Inventario: contadores no duplican productos y elimina el indicador Unidades", async (t) => {
  const { window } = await boot(t);
  const metrics = window.document.getElementById("inv-resumen").textContent;
  assert.match(metrics, /Valor inventario/);
  assert.match(metrics, /Productos\s*3/);
  assert.match(metrics, /Bajo mínimo\s*1/);
  assert.match(metrics, /Agotados\s*1/);
  assert.doesNotMatch(metrics, /Unidades/);
});

test("Inventario: cuadros y filas alternan y conservan la preferencia", async (t) => {
  const { window } = await boot(t);
  const list = window.document.getElementById("inv-detalle");
  const rowsButton = window.document.querySelector('[data-m53-view="list"]');
  const gridButton = window.document.querySelector('[data-m53-view="grid"]');
  assert.ok(rowsButton && gridButton, "deben existir ambos controles de vista");
  rowsButton.click();
  assert.equal(list.className, "bc-m53-list");
  assert.equal(window.localStorage.getItem("bc_inventario_vista"), "list");
  gridButton.click();
  assert.equal(list.className, "bc-m53-grid");
  assert.equal(window.localStorage.getItem("bc_inventario_vista"), "grid");
});

test("Formato numérico global y modal de producto no exponen valor de inversión", () => {
  assert.match(coreSource, /function numberFmt\(value,options\)/);
  assert.match(coreSource, /part\.type===\"group\"\?\"\\u202f\"/);
  assert.match(coreSource, /function money\(n\)/);
  assert.match(detailSource, /\.minimo/);
  assert.match(detailSource, /\.cantidad/);
  assert.doesNotMatch(detailSource, /moneySafe|Costo promedio|Valor del inventario|valor_inventario/);
});


test("Inventario: el modal muestra contexto del producto, historial y editor mínimo en cada almacén", async (t) => {
  const { window } = await boot(t);
  const card = window.document.querySelector('#inv-detalle [data-inv-producto="biz"]');
  assert.ok(card, "el producto debe poder seleccionarse");
  card.click();
  const modal = window.document.getElementById("bc-inv-producto-modal");
  assert.ok(modal && !modal.classList.contains("hidden"), "debe abrirse la ventana flotante");
  assert.ok(await waitFor(() => modal.textContent.includes("Repostería")), "debe cargar la categoría");
  assert.match(modal.textContent, /270 u/);
  assert.match(modal.textContent, /2 almacenes/);
  assert.match(modal.textContent, /Datos del producto/);
  assert.match(modal.textContent, /Categoría/);
  assert.match(modal.textContent, /Repostería/);
  assert.match(modal.textContent, /Unidad/);
  assert.match(modal.textContent, /Stock actual/);
  assert.match(modal.textContent, /Almacén Casa/);
  assert.match(modal.textContent, /La Cueva/);
  assert.match(modal.textContent, /Movimientos recientes/);
  assert.match(modal.textContent, /Compra/);
  assert.match(modal.textContent, /Transferencia · entrada/);
  assert.equal(modal.querySelectorAll("[data-bc-save-minimum]").length, 2,
    "cada almacén debe ofrecer su botón Guardar");
  assert.equal(modal.querySelectorAll("[data-bc-minimum-input]").length, 2,
    "cada almacén debe tener un campo de mínimo editable");
  assert.equal(modal.querySelector('.bc-inv-warehouse-detail[data-warehouse-id="a1"] [data-bc-save-minimum]').dataset.productId, "biz");
  assert.equal(modal.querySelector('.bc-inv-warehouse-detail[data-warehouse-id="a2"] [data-bc-save-minimum]').dataset.warehouseId, "a2");
});

test("Inventario: guardar cambia solo el mínimo del almacén elegido y conserva la cantidad", async (t) => {
  const { window, fixtureRows, rpcCalls } = await boot(t);
  window.document.querySelector('#inv-detalle [data-inv-producto="biz"]').click();
  const modal = window.document.getElementById("bc-inv-producto-modal");
  const target = modal.querySelector('.bc-inv-warehouse-detail[data-warehouse-id="a2"]');
  const input = target.querySelector("[data-bc-minimum-input]");
  const button = target.querySelector("[data-bc-save-minimum]");
  assert.ok(input && button);
  input.value = "220";
  button.click();
  assert.ok(await waitFor(() => rpcCalls.some((call) => call.name === "bc_actualizar_stock_minimo_obligatorio")));
  assert.ok(await waitFor(() => modal.textContent.includes("Stock mínimo guardado.")));

  const call = rpcCalls.find((item) => item.name === "bc_actualizar_stock_minimo_obligatorio");
  assert.equal(call.args.p_producto_id, "biz");
  assert.equal(call.args.p_almacen_id, "a2");
  assert.equal(call.args.p_minimo, 220);
  const casa = fixtureRows.find((row) => row.almacen_id === "a1");
  const cueva = fixtureRows.find((row) => row.almacen_id === "a2");
  assert.equal(casa.minimo, 5, "el otro almacén no cambia");
  assert.equal(cueva.minimo, 220, "el mínimo del almacén elegido se actualiza");
  assert.equal(cueva.cantidad, 200, "la cantidad real queda intacta");
  const refreshed = modal.querySelector('.bc-inv-warehouse-detail[data-warehouse-id="a2"]');
  assert.match(refreshed.textContent, /Bajo mínimo/);
  assert.match(refreshed.textContent, /200 u/);
});

test("Inventario: el permiso de stock es aplicado por el RPC y un rechazo no confirma el cambio", async (t) => {
  const { window, fixtureRows, rpcCalls } = await boot(t, { canEdit: false });
  window.document.querySelector('#inv-detalle [data-inv-producto="biz"]').click();
  const modal = window.document.getElementById("bc-inv-producto-modal");
  assert.ok(await waitFor(() => modal.querySelectorAll("[data-bc-save-minimum]").length === 2));
  const section = modal.querySelector('.bc-inv-warehouse-detail[data-warehouse-id="a1"]');
  section.querySelector("[data-bc-minimum-input]").value = "25";
  section.querySelector("[data-bc-save-minimum]").click();
  assert.ok(await waitFor(() => section.textContent.includes("No tenés permiso")),
    "el error del RPC debe mostrarse al usuario");
  assert.equal(rpcCalls.filter(call => call.name === "bc_actualizar_stock_minimo_obligatorio").length, 1);
  assert.equal(fixtureRows.find(row => row.almacen_id === "a1").minimo, 5,
    "un rechazo por permiso no modifica el mínimo");
});

test("Inventario: un mínimo negativo no llega al RPC", async (t) => {
  const { window, rpcCalls } = await boot(t);
  window.document.querySelector('#inv-detalle [data-inv-producto="biz"]').click();
  const modal = window.document.getElementById("bc-inv-producto-modal");
  const target = modal.querySelector('.bc-inv-warehouse-detail[data-warehouse-id="a1"]');
  target.querySelector("[data-bc-minimum-input]").value = "-1";
  target.querySelector("[data-bc-save-minimum]").click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(rpcCalls.filter((call) => call.name === "bc_actualizar_stock_minimo_obligatorio").length, 0);
  assert.match(target.textContent, /mínimo válido|mayor que cero/i);
});

test("Inventario: stock cambiado en otro módulo refresca la vista visible sin recargar la PWA", async (t) => {
  const { window, fixtureRows, rpcCalls } = await boot(t);
  const before = rpcCalls.filter((call) => call.name === "inventario_enriquecido").length;
  const cafe = fixtureRows.find((row) => row.producto_id === "cafe" && row.almacen_id === "a1");
  cafe.cantidad = 8;
  cafe.estado = "normal";
  window.dispatchEvent(new window.CustomEvent("bc:data-changed", {
    detail: { domains: ["stock", "inventory"], offline: false, remote: true }
  }));
  assert.ok(await waitFor(() => rpcCalls.filter((call) => call.name === "inventario_enriquecido").length > before),
    "the event must re-query the authoritative inventory RPC");
  const cafeCard = window.document.querySelector('#inv-detalle [data-inv-producto="cafe"]');
  assert.ok(await waitFor(() => cafeCard && cafeCard.textContent.includes("8 kg")),
    "the visible inventory card must show the changed stock without an app reload");
});
