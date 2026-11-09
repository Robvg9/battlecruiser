"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const UI = read("public/js/aprobaciones-admin.js");

function setupApprovalWindow(t) {
  const dom = new JSDOM(
    "<!doctype html><html><body><main><div id='cc-atencion'></div></main></body></html>",
    { url: "https://battlecruiser.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const w = dom.window;
  const calls = [];
  const list = [{
    tipo: "baja_lista",
    id: "request-1",
    fecha: "2026-11-09T18:00:00.000Z",
    usuario_nombre: "Dependienta",
    almacen_nombre: "Cafetería La Cueva",
    producto_nombre: "Lista de bajas · 2 productos",
    resumen: "Solicitud agrupada de inventario",
    cantidad: 5,
    estado: "PENDIENTE",
    motivo: "Consumo interno"
  }];
  const detail = {
    solicitud_id: "request-1",
    fecha: "2026-11-09T18:00:00.000Z",
    usuario_nombre: "Dependienta",
    almacen_nombre: "Cafetería La Cueva",
    motivo_general: "Consumo interno",
    estado: "PENDIENTE",
    lineas: [
      { id: "baja-1", producto_nombre: "Cerveza Cristal", cantidad: 3, motivo: "Consumo interno", estado: "PENDIENTE" },
      { id: "baja-2", producto_nombre: "Botellas de Agua", cantidad: 2, motivo: "El Jefe lo cogió", estado: "PENDIENTE" }
    ]
  };

  Object.defineProperty(w.navigator, "onLine", { configurable: true, value: true });
  w.tienePermiso = () => true;
  w.escHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  w.refrescarCentroControl = async () => {};
  w.client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "admin-1" } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    rpc: async (name, params) => {
      calls.push({ name, params: params || {} });
      if (name === "listar_aprobaciones_admin") return { data: list, error: null };
      if (name === "obtener_detalle_solicitud_baja_admin") return { data: detail, error: null };
      if (name === "resolver_solicitud_bajas_admin") return { data: { ok: true }, error: null };
      return { data: [], error: null };
    }
  };

  w.eval(UI);
  t.after(() => w.close());
  return { w, calls };
}

const wait = w => new Promise(resolve => w.setTimeout(resolve, 10));

async function openBatchReview(t) {
  const ctx = setupApprovalWindow(t);
  const { w, calls } = ctx;
  await w.refrescarAprobacionesAdmin();
  const rows = w.document.querySelectorAll("#admin-aprobaciones-lista .rep-fila");
  assert.equal(rows.length, 1, "one multi-line Baja submission must appear as one admin request");
  const open = Array.from(rows[0].querySelectorAll("button")).find(button => button.textContent.includes("Ver detalles y revisar"));
  assert.ok(open, "the grouped request must expose a single review action");
  open.click();
  await wait(w);
  const modal = w.document.getElementById("admin-aprobacion-modal");
  assert.ok(modal, "review must create a floating modal");
  assert.equal(modal.hidden, false);
  assert.equal(modal.querySelector('[role="dialog"][aria-modal="true"]') !== null, true);
  assert.equal(modal.querySelectorAll("[data-bc-approval-line-qty]").length, 2);
  assert.match(modal.textContent, /Cerveza Cristal/);
  assert.match(modal.textContent, /Botellas de Agua/);
  assert.match(modal.textContent, /Motivo: Consumo interno/);
  assert.match(modal.textContent, /Motivo: El Jefe lo cogió/);
  assert.equal(w.document.getElementById("admin-aprobacion-detalle"), null, "detail must not be inserted below the queue");
  return ctx;
}

test("one Baja list opens one floating detail modal and approves all lines through one grouped RPC", async t => {
  const { w, calls } = await openBatchReview(t);
  const quantities = Array.from(w.document.querySelectorAll("[data-bc-approval-line-qty]"));
  quantities[0].value = "2";
  quantities[1].value = "1";
  w.document.getElementById("admin-approval-accept").click();
  await wait(w);

  const resolved = calls.filter(call => call.name === "resolver_solicitud_bajas_admin");
  assert.equal(resolved.length, 1, "the list must be resolved once, not once per product");
  assert.deepEqual(resolved[0].params, {
    p_solicitud_id: "request-1",
    p_decision: "APROBAR",
    p_comentario: null,
    p_lineas_reales: [
      { id: "baja-1", cantidad_real: 2 },
      { id: "baja-2", cantidad_real: 1 }
    ]
  });
  assert.equal(w.document.getElementById("admin-aprobacion-modal").hidden, true);
  assert.equal(calls.filter(call => call.name === "resolver_aprobacion_operativa").length, 0);
});

test("rejecting a Baja list requires a reason and then rejects the parent request once", async t => {
  const { w, calls } = await openBatchReview(t);
  const reject = w.document.getElementById("admin-approval-reject");
  reject.click();
  await wait(w);
  assert.equal(calls.filter(call => call.name === "resolver_solicitud_bajas_admin").length, 0);
  assert.match(w.document.getElementById("admin-approval-message").textContent, /motivo obligatorio/i);

  w.document.getElementById("admin-approval-comment").value = "Motivo no corresponde.";
  reject.click();
  await wait(w);
  const resolved = calls.filter(call => call.name === "resolver_solicitud_bajas_admin");
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].params.p_solicitud_id, "request-1");
  assert.equal(resolved[0].params.p_decision, "RECHAZAR");
  assert.equal(resolved[0].params.p_comentario, "Motivo no corresponde.");
  assert.deepEqual(resolved[0].params.p_lineas_reales, []);
});

test("approval modal is fixed to the viewport and only its body scrolls on Android", () => {
  const css = read("public/style.css");
  assert.match(css, /\.bc-admin-approval-modal\[hidden\]\{display:none!important\}/);
  assert.match(css, /\.bc-admin-approval-modal\{[\s\S]*position:fixed;inset:0;z-index:100850/);
  assert.match(css, /\.bc-admin-approval-body\{[\s\S]*overflow-x:hidden;overflow-y:auto/);
  assert.match(css, /body\.bc-admin-approval-open\{overflow:hidden/);
});
