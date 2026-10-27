"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const JOURNADA_UI = fs.readFileSync(path.join(__dirname, "..", "public", "js", "bc7-jornada-ui.js"), "utf8");
const TURNOS_UI = fs.readFileSync(path.join(__dirname, "..", "public", "js", "turnos-maestro.js"), "utf8");
const MIGRATION = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261027153000_bc7_turno_movimientos_sesion.sql"), "utf8");

test("Jornada e inventario explica el propósito y los pasos en lenguaje operativo", () => {
  assert.match(JOURNADA_UI, /¿Para qué sirve esta sección\?/);
  assert.match(JOURNADA_UI, /inventario físico inicial y final/i);
  assert.match(JOURNADA_UI, /no es el historial general/i);
  assert.match(JOURNADA_UI, /Movimientos → Historial/i);
  assert.match(JOURNADA_UI, /Actualizar calendario/);
});

test("el estado vacío del calendario propone siguientes pasos sin fingir éxito", () => {
  assert.match(JOURNADA_UI, /No hay jornadas visibles en este rango/);
  assert.match(JOURNADA_UI, /amplía “Días a consultar”/);
  assert.match(JOURNADA_UI, /Una lista vacía no demuestra que el servidor esté caído/);
  assert.match(JOURNADA_UI, /Una asignación solo queda confirmada cuando la valida el servidor/);
});

test("Jornada consulta movimientos por el ID exacto de sesión, nunca solo por fecha", () => {
  const start = JOURNADA_UI.indexOf("async function loadMovements(detail)");
  const end = JOURNADA_UI.indexOf("function renderWorkspace(detail)", start);
  assert.ok(start >= 0 && end > start, "loadMovements debe existir en el bundle");
  const loader = JOURNADA_UI.slice(start, end);
  assert.match(loader, /rpc\('bc7_movimientos_sesion',\{p_turno_sesion_id:detail\.sesion\.id\}\)/);
  assert.doesNotMatch(loader, /rpc\('movimientos_producto'/);
  assert.match(loader, /renderMovementRows\(arr\(r\),detail\.sesion\)/);
});

test("Turnos ofrece archivo plegable por cada sesión y llama al RPC read-only por session ID", () => {
  assert.match(TURNOS_UI, /data-tm-movimientos=/);
  assert.match(TURNOS_UI, /data-tm-movimientos-host=/);
  assert.match(TURNOS_UI, /client\.rpc\('bc7_movimientos_sesion', \{ p_turno_sesion_id: sessionId \}\)/);
  assert.match(TURNOS_UI, /No se asignan solo por compartir fecha/);
});

test("la vista de archivo por turno mantiene separado el histórico general de atribuciones inciertas", () => {
  assert.match(MIGRATION, /tr\.turno_sesion_id = v_s\.id/);
  assert.match(MIGRATION, /tr\.inicio_at/);
  assert.match(MIGRATION, /tr\.fin_at IS NULL OR/);
  assert.match(MIGRATION, /AT TIME ZONE 'America\/Havana'\)::date = v_s\.fecha/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_movimientos_sesion\(uuid\) FROM anon/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc7_movimientos_sesion\(uuid\) TO authenticated/);
});
