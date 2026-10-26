"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m33-turnos-final.js"),
  "utf8"
);
const apiSource = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "turno-api.js"),
  "utf8"
);
const migration = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "migrations", "20261026154500_bc_harden_forced_turno_close_admin.sql"),
  "utf8"
);

async function waitFor(predicate, timeout) {
  const deadline = Date.now() + (timeout || 1500);
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body><div id='ciclos-m18-root'></div></body></html>",
    { url: "https://battlecruiser-turno-recovery.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const window = dom.window;
  const calls = [];
  let closed = false;
  const turn = {
    id: "turno-vencido-fixture",
    almacen_id: "almacen-cueva",
    almacen_nombre: "La Cueva",
    fecha_inicio: "2000-01-01",
    fecha_fin: "2000-01-07",
    dias_turno: 7,
    estado: "ABIERTO",
    estado_maestro: "EN_CURSO",
    sesiones: [{
      id: "sesion-fixture",
      numero_dia: 1,
      bloque: "MANANA",
      fecha: "2000-01-01",
      estado: "EN_CURSO",
      usuario_id: "dependienta-fixture",
      usuario_nombre: "Dependienta",
      dinero_declarado: false
    }]
  };

  window._usuarioActual = { id: "owner-fixture", nombre: "Dueño", rol: "Dueño" };
  window.__bcUser = window._usuarioActual;
  window._cache = { usuarios: [] };
  window.tienePermiso = (resource, action) => resource === "turnos" && action === "editar_any";
  window.confirm = () => true;
  window.alert = () => {};
  window.__BC_M29__ = { isAdmin: () => true, renderHome: () => {} };
  window.BattleCruiserTurnoAPI = {
    actorIsAdmin: async () => true,
    obtenerExpedienteTurno: async (id) => {
      assert.equal(id, turn.id);
      return structuredClone(turn);
    },
    forzarCierreAdmin: async (id, reason) => {
      calls.push({ id, reason });
      closed = true;
      turn.estado = "CERRADO";
      turn.estado_maestro = "CERRADO";
      return {
        id,
        estado: "CERRADO",
        forzado: true,
        sesiones_completadas: 1,
        sesiones_canceladas: 13,
        sesiones_afectadas: 14,
        tramos_cerrados: 1,
        requiere_revision_manual: true
      };
    }
  };

  window.eval(source);
  if (window.document.readyState === "loading") {
    window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  }
  t.after(() => window.close());
  return { dom, window, calls, turn, isClosed: () => closed };
}

test("el paso Resumen ofrece recuperación solo al ADMIN cuando el turno ya venció", async (t) => {
  const c = setup(t);
  await c.window.__BC_M33.open("turno-vencido-fixture");
  for (let i = 0; i < 4; i++) {
    const next = c.window.document.getElementById("m33-next");
    assert.ok(next, "each of the first four steps must permit advancing");
    next.click();
  }
  assert.ok(c.window.document.getElementById("m33-force-close"));
  assert.ok(c.window.document.getElementById("m33-force-close-reason"));
  assert.match(c.window.document.getElementById("m33-bg").textContent, /No crea declaraciones de dinero, conteos de inventario ni un cuadre ficticio/i);
  assert.equal(c.calls.length, 0, "opening the detail must not mutate the turn");
});

test("el cierre forzado exige motivo, registra la RPC y actualiza el expediente", async (t) => {
  const c = setup(t);
  await c.window.__BC_M33.open("turno-vencido-fixture");
  for (let i = 0; i < 4; i++) c.window.document.getElementById("m33-next").click();

  c.window.document.getElementById("m33-force-close").click();
  await waitFor(() => !!c.window.document.getElementById("m33-force-close-msg")?.textContent);
  assert.equal(c.calls.length, 0, "a missing reason must not call the backend");
  assert.match(c.window.document.getElementById("m33-force-close-msg").textContent, /al menos 12 caracteres/i);

  const reason = "El turno venció y no se pudo completar el cierre normal.";
  c.window.document.getElementById("m33-force-close-reason").value = reason;
  c.window.document.getElementById("m33-force-close").click();

  assert.ok(await waitFor(() => c.calls.length === 1 && !!c.window.document.getElementById("m33-force-close-result"), 2500));
  assert.deepEqual(c.calls, [{ id: "turno-vencido-fixture", reason }]);
  assert.equal(c.isClosed(), true);
  assert.match(c.window.document.getElementById("m33-force-close-result").textContent, /Cierre forzado registrado en auditoría/i);
  assert.match(c.window.document.getElementById("m33-force-close-result").textContent, /No se inventaron declaraciones ni conteos/i);
  assert.equal(c.window.document.querySelector("[data-m33-force-close]"), null, "the recovery action disappears after the backend reports CERRADO");
});

test("la migración requiere motivo y termina tramos activos y sesiones pendientes de forma auditable", () => {
  assert.match(migration, /IF NOT public\.bc_actor_is_admin\(\) THEN/);
  assert.match(migration, /length\(v_motivo\) < 12/);
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

test("la capa API usa solo el RPC administrativo existente y pasa el motivo íntegro", () => {
  assert.match(apiSource, /forzarCierreAdmin:'bc_forzar_cierre_turno_admin'/);
  assert.match(apiSource, /forzarCierreAdmin:\(t,m\)=>callRpc\(RPC\.forzarCierreAdmin,\{p_turno_id:t,p_motivo:m\}\)/);
});
