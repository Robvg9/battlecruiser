"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "hotfix-turno-forceclose-20260902.js"),
  "utf8"
);

function setup(t, options = {}) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://battlecruiser-turno-recovery.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.setTimeout = (callback) => { callback(); return 1; };
  window.tienePermiso = () => false;
  if (options.user) window._usuarioActual = options.user;
  if (options.bcUser) window.__bcUser = options.bcUser;
  if (typeof options.m29Admin === "boolean") {
    window.__BC_M29__ = { isAdmin: () => options.m29Admin };
  }
  window.BattleCruiserTurnoAPI = {
    actorIsAdmin: async () => options.apiAdmin === true,
    obtenerExpedienteTurno: async (id) => ({
      id,
      estado_maestro: options.turn?.estado_maestro || "EN_CURSO",
      estado: options.turn?.estado || "ABIERTO",
      fecha_fin: options.turn?.fecha_fin,
      fecha_inicio: options.turn?.fecha_inicio,
      dias_turno: options.turn?.dias_turno
    })
  };
  window.client = { rpc: async () => ({ data: { id: "turno-antiguo", estado: "CERRADO" }, error: null }) };
  window.__BC_M33 = {
    open: async function (turnoId) {
      const old = window.document.getElementById("m33-bg");
      if (old) old.remove();
      const modal = window.document.createElement("div");
      modal.id = "m33-bg";
      modal.innerHTML = '<div class="m33-modal"><div class="m33-steps">' +
        '<div class="m33-step">1 · Información</div><div class="m33-step">2 · Asignaciones</div>' +
        '<div class="m33-step">3 · Movimientos</div><div class="m33-step">4 · Inventario</div>' +
        '<div class="m33-step active">5 · Resumen</div></div>' +
        '<div class="m33-foot"><div></div><div><button id="m33-close-final">Cerrar</button></div></div></div>';
      window.document.body.appendChild(modal);
      return { id: turnoId };
    }
  };
  window.eval(SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.after(() => window.close());
  return window;
}

test("el dueño con nombre_rol ve el control aunque la RPC no devuelva admin", async (t) => {
  const window = setup(t, {
    apiAdmin: false,
    user: { id: "owner-1", nombre_rol: "Dueño" },
    turn: { fecha_fin: "2026-09-07" }
  });
  await window.__BC_M33.open("turno-antiguo");
  assert.ok(window.document.querySelector(".bc-force-close-turno"),
    "M33 reconoce nombre_rol como propietario; recuperación debe aplicar la misma regla");
});

test("reutiliza el ADMIN ya resuelto por M29 aunque la comprobación secundaria devuelva falso", async (t) => {
  const window = setup(t, {
    apiAdmin: false,
    m29Admin: true,
    user: { id: "owner-1" },
    turn: { fecha_fin: "2026-09-07" }
  });
  await window.__BC_M33.open("turno-antiguo");
  const button = window.document.querySelector(".bc-force-close-turno");
  assert.ok(button, "la recuperación debe coincidir con el permiso que M33 ya resolvió");
  const panel = button.closest(".bc-force-close-panel");
  assert.ok(panel);
  assert.equal(panel.style.flexBasis, "100%");
  assert.equal(panel.querySelectorAll("button").length, 1);
});

test("calcula vencimiento desde fecha_inicio y dias_turno si falta fecha_fin", async (t) => {
  const window = setup(t, {
    apiAdmin: true,
    user: { id: "owner-1" },
    turn: { fecha_inicio: "2026-09-01", dias_turno: 7 }
  });
  await window.__BC_M33.open("turno-antiguo");
  assert.ok(window.document.querySelector(".bc-force-close-turno"));
});

test("no muestra recuperación a un usuario no administrador", async (t) => {
  const window = setup(t, {
    apiAdmin: false,
    user: { id: "worker-1", nombre_rol: "Trabajadora" },
    turn: { fecha_fin: "2026-09-07" }
  });
  await window.__BC_M33.open("turno-antiguo");
  assert.equal(window.document.querySelector(".bc-force-close-turno"), null);
});

test("no muestra recuperación si la fecha final no ha vencido", async (t) => {
  const window = setup(t, {
    apiAdmin: true,
    user: { id: "owner-1" },
    turn: { fecha_fin: "2099-12-31" }
  });
  await window.__BC_M33.open("turno-antiguo");
  assert.equal(window.document.querySelector(".bc-force-close-turno"), null);
});
