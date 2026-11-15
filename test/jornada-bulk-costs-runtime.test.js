"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "../public/js/jornada-owner-review.js"),
  "utf8"
);

const PRODUCT_ID = "12345678-1234-4234-9234-123456789abc";
const SESSION_ID = "session-bulk-costs";
const TURN_ID = "turn-bulk-costs";

function fixture(cost = null) {
  return {
    turno: {
      id: TURN_ID,
      almacen_nombre: "La Cueva",
      fecha: "2026-11-10",
      estado: "ABIERTO",
      estado_maestro: "ABIERTO",
      dias_turno: 1
    },
    sesiones: [{
      id: SESSION_ID,
      estado: "COMPLETADA",
      fecha: "2026-11-10",
      fecha_fin: "2026-11-10",
      salario_porcentaje: 5,
      efectivo: {},
      entregas_diarias: [],
      liquidacion: {
        faltan_cortes: false,
        calculable: false,
        ventas_estimadas: 100,
        ganancia_bruta_parcial: null,
        ganancia_bruta_es_total: false,
        costos_sin_cobertura: 1,
        costos_con_cobertura: 0,
        familias_total_costo: 1,
        familias_sin_precio: 0,
        familias_con_vendidas_negativas: 0,
        movimientos_posteriores_pendientes: 0,
        pendientes: {},
        movimientos_posteriores_corte: [],
        lineas: [{
          producto_id: PRODUCT_ID,
          nombre: "Producto de prueba",
          unidades_vendidas: 2,
          inventario_inicial: 3,
          inventario_final: 1,
          entradas: 0,
          salidas: 0,
          bajas_aprobadas: 0,
          precio_unitario: 50,
          importe_estimado: 100,
          costo_unitario_estimado: cost,
          costo_vendido_estimado: null,
          ganancia_bruta_estimada: null,
          margen_bruto_estimado: null
        }]
      }
    }]
  };
}

function setup(t, { adjustmentResult, reviewFailsOn = 0 } = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body></body></html>",
    {
      url: "https://battlecruiser-bulk-costs.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true
    }
  );
  const { window } = dom;
  const calls = [];
  let reviewCount = 0;

  window.confirm = () => true;
  window.client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "bc7_obtener_revision_jornada") {
        reviewCount += 1;
        if (reviewFailsOn === reviewCount) {
          return { data: null, error: new Error("temporary refresh failure") };
        }
        return { data: fixture(), error: null };
      }
      if (name === "bc7_ajustar_valores_producto_jornada") {
        return {
          data: adjustmentResult || {
            ok: true,
            productos_ajustados: args.p_ajustes.length,
            catalogo_modificado: false
          },
          error: null
        };
      }
      return { data: null, error: new Error("Unexpected RPC: " + name) };
    }
  };

  window.eval(SOURCE);
  t.after(() => window.close());

  async function openEditor() {
    const loaded = await window.bcAbrirRevisionJornada(TURN_ID);
    assert.equal(loaded, true);
    const open = window.document.querySelector("[data-bcjr-open-bulk-costs]");
    assert.ok(open, "eligible completed Jornada exposes the bulk-cost action");
    open.click();
    const box = window.document.querySelector(".bcjr-values-modal");
    assert.ok(box, "bulk-cost editor opens");
    return box;
  }

  return { dom, window, calls, openEditor };
}

async function waitFor(assertion, timeoutMs = 1500) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (assertion()) return true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return Boolean(assertion());
}

test("bulk-cost save validates rows, sends one audited payload and closes only after refresh", async t => {
  const c = setup(t);
  const box = await c.openEditor();
  const input = box.querySelector("[data-bcjr-bulk-cost]");
  const save = box.querySelector("[data-bcjr-bulk-costs-save]");
  const reason = box.querySelector("[data-bcjr-bulk-reason]");

  input.value = "12.3456";
  reason.value = "Factura y hoja P.C. verificadas";
  save.click();

  assert.ok(await waitFor(() => !c.window.document.querySelector(".bcjr-values-modal")),
    "successful RPC plus successful refresh closes the list");

  const calls = c.calls.filter(call => call.name === "bc7_ajustar_valores_producto_jornada");
  assert.equal(calls.length, 1, "the entire batch is sent once");
  assert.equal(calls[0].args.p_turno_sesion_id, SESSION_ID);
  assert.equal(calls[0].args.p_ajustes.length, 1);
  assert.deepEqual(calls[0].args.p_ajustes[0], {
    producto_id: PRODUCT_ID,
    precio_venta_unitario: null,
    costo_unitario: 12.3456
  });
  assert.equal(calls[0].args.p_comentario, "Factura y hoja P.C. verificadas");
});

test("a confirmed save followed by a failed review refresh never offers a duplicate retry", async t => {
  const c = setup(t, { reviewFailsOn: 2 });
  const box = await c.openEditor();
  const input = box.querySelector("[data-bcjr-bulk-cost]");
  const save = box.querySelector("[data-bcjr-bulk-costs-save]");
  input.value = "15";
  box.querySelector("[data-bcjr-bulk-reason]").value = "Factura verificada del proveedor";
  save.click();

  assert.ok(await waitFor(() => box.querySelector("[data-bcjr-values-status]")?.textContent.includes("Los costos sí se guardaron")));
  assert.equal(save.disabled, true, "a saved batch remains locked even if the visual refresh fails");
  assert.equal(save.textContent, "Guardado");
  assert.equal(c.calls.filter(call => call.name === "bc7_ajustar_valores_producto_jornada").length, 1);
});

test("an unconfirmed RPC receipt blocks retry until the owner reopens the Jornada", async t => {
  const c = setup(t, { adjustmentResult: { ok: true, productos_ajustados: 0, catalogo_modificado: false } });
  const box = await c.openEditor();
  const save = box.querySelector("[data-bcjr-bulk-costs-save]");
  box.querySelector("[data-bcjr-bulk-cost]").value = "20";
  box.querySelector("[data-bcjr-bulk-reason]").value = "Factura verificada del proveedor";
  save.click();

  assert.ok(await waitFor(() => save.textContent === "Resultado incierto"));
  assert.equal(save.disabled, true);
  assert.match(box.querySelector("[data-bcjr-values-status]").textContent, /no repitas el guardado/i);
  assert.equal(c.calls.filter(call => call.name === "bc7_ajustar_valores_producto_jornada").length, 1);
});

test("duplicate product rows are rejected before any RPC", async t => {
  const c = setup(t);
  const box = await c.openEditor();
  const original = box.querySelector("[data-bcjr-bulk-cost]");
  original.value = "10";
  const duplicate = original.cloneNode(true);
  duplicate.value = "11";
  original.parentElement.parentElement.after(
    Object.assign(c.window.document.createElement("tr"), {
      innerHTML: "<td>Duplicado</td><td></td><td></td>"
    })
  );
  box.querySelector("tbody tr:last-child td:nth-child(2)").appendChild(duplicate);
  box.querySelector("[data-bcjr-bulk-reason]").value = "Factura verificada del proveedor";
  box.querySelector("[data-bcjr-bulk-costs-save]").click();

  assert.match(box.querySelector("[data-bcjr-values-status]").textContent, /duplicados/i);
  assert.equal(c.calls.filter(call => call.name === "bc7_ajustar_valores_producto_jornada").length, 0);
});
