"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const M33_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m33-turnos-final.js"),
  "utf8"
);
const RECOVERY_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "hotfix-turno-forceclose-20260902.js"),
  "utf8"
);

test("la recuperación aparece en Resumen del M33 real usando el permiso ADMIN resuelto por M29", async (t) => {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body></body></html>",
    {
      url: "https://battlecruiser-step4-m33-integration.test/",
      runScripts: "outside-only",
      pretendToBeVisual: true
    }
  );
  const { window } = dom;
  const turnoId = "turno-la-cueva-vencido-fixture";
  const rpcCalls = [];

  window._cache = { usuarios: [] };
  window._usuarioActual = { id: "owner-fixture", nombre_rol: "Dependienta" };
  window.tienePermiso = () => false;
  // M29 is the resolver M33 consults before rendering its administrative wizard.
  window.__BC_M29__ = {
    isAdmin: () => true,
    renderHome: async () => {}
  };
  window.BattleCruiserTurnoAPI = {
    // Simulate a secondary client-side admin RPC that is unavailable/false.
    // M33 and the recovery control must still agree with M29's resolved state.
    actorIsAdmin: async () => false,
    obtenerExpedienteTurno: async (id) => ({
      id,
      almacen_nombre: "La Cueva",
      estado: "ABIERTO",
      estado_maestro: "EN_CURSO",
      fecha_inicio: "2026-09-01",
      fecha_fin: "2026-09-07",
      dias_turno: 7,
      sesiones: []
    })
  };
  window.client = {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      return { data: null, error: new Error("La prueba no debe ejecutar RPC de cierre") };
    }
  };

  // Load the real M33 module before the recovery hotfix, matching app.js order.
  window.eval(M33_SOURCE);
  window.eval(RECOVERY_SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  t.after(() => window.close());

  assert.equal(window.__BC_M33.open.__bcForceCloseWrapped, true,
    "el hotfix debe envolver el open real de M33");

  await window.__BC_M33.open(turnoId);
  assert.equal(window.document.querySelectorAll(".m33-step").length, 5,
    "M33 debe renderizar el expediente administrativo real");

  for (let step = 1; step < 5; step++) {
    const next = window.document.querySelector("#m33-next");
    assert.ok(next, "cada sección anterior a Resumen debe permitir avanzar");
    next.click();
    await new Promise(resolve => window.setTimeout(resolve, 5));
  }

  // Let the M33 mutation observer finish the async role + overdue checks.
  await new Promise(resolve => window.setTimeout(resolve, 25));
  await Promise.resolve();

  const button = window.document.querySelector(".bc-force-close-turno");
  assert.ok(button, "el botón de recuperación debe aparecer en el Resumen real");
  assert.match(button.textContent, /cierre forzado/i);

  const panel = button.closest(".bc-force-close-panel");
  assert.ok(panel, "la acción debe vivir en su propia fila del pie");
  assert.equal(panel.style.flexBasis, "100%");
  assert.equal(panel.style.width, "100%");
  assert.equal(panel.querySelector(".bc-force-close-msg").getAttribute("aria-live"), "polite");
  assert.equal(window.document.querySelector(".m33-foot").style.flexWrap, "wrap");

  assert.equal(rpcCalls.length, 0,
    "abrir el expediente y mostrar el botón nunca debe modificar el turno");
});
