"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "hotfix-turno-forceclose-20260902.js"),
  "utf8"
);
const migration = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20261026170000_bc_force_close_admin_expiry_guard.sql"),
  "utf8"
);
const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const sw = fs.readFileSync(path.join(__dirname, "..", "public", "service-worker.js"), "utf8");

function overdueTurn(overrides = {}) {
  return {
    id: "turno-vencido-fixture",
    estado: "ABIERTO",
    estado_maestro: "EN_CURSO",
    fecha_inicio: "2026-09-01",
    fecha_fin: "2026-09-07",
    dias_turno: 7,
    almacen_nombre: "La Cueva",
    sesiones: [{ estado: "EN_CURSO", dinero_declarado: false }],
    ...overrides
  };
}

function setup(t, options = {}) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<div id='m33-bg' class='m33-bg'><div class='m33-modal'></div></div>" +
      "</body></html>",
    { url: "https://battlecruiser-force-close.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const window = dom.window;
  const turn = options.turn || overdueTurn();
  const calls = [];
  const events = [];
  let closeClicks = 0;
  let refreshCalls = 0;
  let currentStep = 1;
  const stepNames = ["Información", "Asignaciones", "Movimientos", "Inventario", "Resumen"];
  const modal = window.document.getElementById("m33-bg");
  function renderFakeStep(id) {
    modal.setAttribute("data-turno-id", id);
    modal.querySelector(".m33-modal").innerHTML =
      "<div class='m33-steps'>" + stepNames.map((name, index) =>
        "<div class='m33-step" + (index + 1 === currentStep ? " active" : "") + "'>" +
        (index + 1) + " · " + name + "</div>").join("") +
      "</div><div class='m33-foot'><div></div><div>" +
      (currentStep < 5
        ? "<button type='button' id='m33-next'>Avanzar</button>"
        : "<button type='button' id='m33-close-final'>Cerrar</button>") +
      "</div></div>";
  }
  modal.addEventListener("click", event => {
    if (event.target && event.target.id === "m33-next") {
      currentStep = Math.min(5, currentStep + 1);
      renderFakeStep(modal.getAttribute("data-turno-id"));
    } else if (event.target && event.target.id === "m33-close-final") {
      closeClicks++;
    }
  });

  window.tienePermiso = () => false;
  window._usuarioActual = { id: "owner-fixture", rol: options.admin === false ? "Dependienta" : "Dueño" };
  window.BattleCruiserTurnoAPI = {
    actorIsAdmin: async () => options.admin !== false,
    obtenerExpedienteTurno: async (id) => {
      calls.push({ type: "read", id });
      return { ...turn, id };
    }
  };
  window.client = {
    rpc: async (name, params) => {
      calls.push({ type: "rpc", name, params: { ...params } });
      return { data: {
        id: params.p_turno_id,
        estado: "CERRADO",
        forzado: true,
        sesiones_completadas: 1,
        sesiones_canceladas: 13,
        sesiones_afectadas: 14,
        tramos_cerrados: 1,
        requiere_revision_manual: true,
        declaraciones_dinero_creadas: 0,
        conteos_inventario_creados: 0
      }, error: null };
    }
  };
  window.prompt = () => options.reason === undefined ? "El turno venció y requiere recuperación administrativa." : options.reason;
  window.confirm = () => options.confirm !== false;
  window.refrescarTurnos = async () => { refreshCalls++; };
  window.__BC_M29__ = { renderHome: async () => {} };
  window.__BC_M33 = {
    open: async (id) => {
      currentStep = 1;
      renderFakeStep(id);
      return { id };
    }
  };
  window.addEventListener("bc-turno-force-closed", e => events.push(e.detail));

  window.eval(source);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  t.after(() => window.close());

  return {
    window, dom, calls, events, turn,
    get closeClicks() { return closeClicks; },
    get refreshCalls() { return refreshCalls; }
  };
}

async function openExpiredTurn(context, id = "turno-vencido-fixture") {
  await context.window.__BC_M33.open(id);
  await new Promise(resolve => setTimeout(resolve, 0));
  return context.window.document.querySelector(".bc-force-close-turno");
}

async function goToSummary(context) {
  for (let i = 1; i < 5; i++) {
    const next = context.window.document.querySelector("#m33-next");
    assert.ok(next, "each non-summary stage must render Avanzar");
    next.click();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  return context.window.document.querySelector(".bc-force-close-turno");
}

test("la PWA carga el hotfix de recuperación y lo deja disponible en la caché offline", () => {
  assert.ok(app.includes('["hotfix-turno-forceclose-20260902.js","20261030.1"]'));
  assert.ok(sw.includes("./js/hotfix-turno-forceclose-20260902.js?v=20261030.1"));
});

test("el botón de recuperación aparece solo en Resumen, sobrevive a los cinco renders y solo para ADMIN", async (t) => {
  const c = setup(t);
  assert.equal(await openExpiredTurn(c), null, "no se debe ofrecer cierre forzado en Información");
  const button = await goToSummary(c);
  assert.ok(button);
  assert.match(button.textContent, /turno vencido/i);
  assert.ok(button.closest(".m33-foot"));
  assert.match(button.title, /Solo ADMIN/i);
  assert.equal(c.window.document.querySelectorAll(".bc-force-close-turno").length, 1);
  assert.equal(c.calls.filter(x => x.type === "rpc").length, 0, "abrir el expediente no modifica el turno");
});

test("un turno vigente o una cuenta sin ADMIN no ve el botón de recuperación", async (t) => {
  const notExpired = setup(t, { turn: overdueTurn({ fecha_fin: "2099-12-31" }) });
  await openExpiredTurn(notExpired);
  assert.equal(await goToSummary(notExpired), null);

  const noAdmin = setup(t, { admin: false });
  await openExpiredTurn(noAdmin);
  assert.equal(await goToSummary(noAdmin), null);
});

test("el cierre exige motivo, confirmación y respuesta CERRADO; deja evidencia sin crear conteos", async (t) => {
  const c = setup(t);
  await openExpiredTurn(c);
  const button = await goToSummary(c);
  assert.ok(button);

  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  const rpcCalls = c.calls.filter(x => x.type === "rpc");
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "bc_forzar_cierre_turno_admin");
  assert.equal(rpcCalls[0].params.p_turno_id, "turno-vencido-fixture");
  assert.match(rpcCalls[0].params.p_motivo, /turno venció/i);
  assert.equal(c.events.length, 1);
  assert.equal(c.events[0].estado, "CERRADO");
  assert.equal(c.events[0].declaracionesDineroCreadas, 0);
  assert.equal(c.events[0].conteosInventarioCreados, 0);
  assert.equal(c.refreshCalls, 1);
  assert.equal(c.closeClicks, 1, "la UI cierra el detalle después de confirmar el cierre");
});

test("cancelar la confirmación o introducir un motivo corto no escribe al backend", async (t) => {
  const cancelled = setup(t, { confirm: false });
  await openExpiredTurn(cancelled);
  const button1 = await goToSummary(cancelled);
  assert.ok(button1);
  button1.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(cancelled.calls.filter(x => x.type === "rpc").length, 0);

  const short = setup(t, { reason: "mal" });
  await openExpiredTurn(short);
  const button2 = await goToSummary(short);
  assert.ok(button2);
  button2.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(short.calls.filter(x => x.type === "rpc").length, 0);
  assert.match(short.window.document.querySelector(".bc-force-close-msg").textContent, /12 y 1000 caracteres/i);
});

test("la migración reconcilia ambos estados, cierra tramos y audita sin fabricar cifras", () => {
  assert.match(migration, /IF NOT public\.bc_actor_is_admin\(\) THEN/);
  assert.match(migration, /length\(v_motivo\) < 12/);
  assert.match(migration, /v_turno\.fecha IS NULL OR v_turno\.dias_turno IS NULL/);
  assert.match(migration, /v_turno\.fecha[\s\S]*>= current_date/);
  assert.match(migration, /El turno todavía no está vencido/);
  assert.match(migration, /coalesce\(v_turno\.estado_maestro, ''\)[\s\S]*OR coalesce\(v_turno\.estado, ''\)/);
  assert.match(migration, /UPDATE public\.turno_tramos[\s\S]*estado = 'COMPLETADO'[\s\S]*fin_at = coalesce\(fin_at, v_now\)/);
  assert.match(migration, /WHEN estado IN \('PENDIENTE', 'PROGRAMADA'\) THEN 'CANCELADA'/);
  assert.match(migration, /WHEN estado = 'EN_CURSO' THEN 'COMPLETADA'/);
  assert.match(migration, /cierre_forzado = true/);
  assert.match(migration, /SET estado = 'CERRADO',[\s\S]*estado_maestro = 'CERRADO'/);
  assert.match(migration, /'motivo', v_motivo/);
  assert.match(migration, /'declaraciones_dinero_creadas', 0/);
  assert.match(migration, /'conteos_inventario_creados', 0/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.bc_forzar_cierre_turno_admin\(uuid, text\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.bc_forzar_cierre_turno_admin\(uuid, text\) TO authenticated/);
});
