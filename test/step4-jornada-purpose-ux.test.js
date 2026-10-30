"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const JOURNADA_UI = fs.readFileSync(path.join(__dirname, "..", "public", "js", "bc7-jornada-ui.js"), "utf8");
const TURNOS_UI = fs.readFileSync(path.join(__dirname, "..", "public", "js", "turnos-maestro.js"), "utf8");
const MIGRATION = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261027184823_bc7_turno_movimientos_sesion_20261027.sql"), "utf8");

test("journey calendar checks the global lexical Supabase client", () => {
  assert.ok(JOURNADA_UI.includes("typeof client===\'undefined\'"), "the UI must check the global lexical binding");
  assert.ok(!JOURNADA_UI.includes("!window.client"), "it must not require client to be a window property");
});

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

test("reintentar el cierre reutiliza la declaración guardada sin intentar registrarla otra vez", () => {
  const start = JOURNADA_UI.indexOf("async function closeSession(form)");
  const end = JOURNADA_UI.indexOf("async function submitAdjustment(form)", start);
  assert.ok(start >= 0 && end > start, "closeSession debe existir en el bundle");
  const close = JOURNADA_UI.slice(start, end);
  assert.match(close, /let amount=\$\('bc7-cash'\)\?\.value\.trim\(\)/);
  assert.match(close, /if\(saved\)\{amount=String\(state\.detail\.declaracion_dinero\.monto\);\}/);
  assert.match(close, /if\(!saved\) await rpc\('bc_declarar_dinero'/);
  assert.match(close, /await rpc\('bc5_cerrar_jornada'/);
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

test("Turnos agrupa el archivo por día y consulta cada sesión mediante el RPC protegido", () => {
  assert.match(TURNOS_UI, /data-tm-mov-dia=/);
  assert.match(TURNOS_UI, /data-tm-sessions=/);
  assert.match(TURNOS_UI, /data-tm-movimientos-day-host/);
  assert.match(TURNOS_UI, /const dayKey = String\(day\) \+ '\|' \+ date/);
  assert.match(TURNOS_UI, /client\.rpc\('bc7_movimientos_sesion', \{ p_turno_sesion_id: sessionId \}\)/);
  assert.match(TURNOS_UI, /no se asignan solo por compartir fecha/i);
});

test("la vista de archivo por turno mantiene separado el histórico general de atribuciones inciertas", () => {
  assert.match(MIGRATION, /tr\.turno_sesion_id = v_s\.id/);
  assert.match(MIGRATION, /tr\.inicio_at/);
  assert.match(MIGRATION, /tr\.fin_at IS NULL OR/);
  assert.match(MIGRATION, /AT TIME ZONE 'America\/Havana'\)::date = v_s\.fecha/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc7_movimientos_sesion\(uuid\) FROM anon/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc7_movimientos_sesion\(uuid\) TO authenticated/);
});


test("Jornada recupera el catálogo de almacenes cuando la caché está vacía", () => {
  assert.match(JOURNADA_UI, /async function ensureWarehouseCatalog\(\)/,
    "Jornada debe tener una carga explícita del catálogo");
  assert.match(JOURNADA_UI, /rpc\('listar_almacenes_para_turnos',\{\}\)/,
    "el selector debe usar el RPC dedicado permitido para Turnos");
  assert.match(JOURNADA_UI, /mergeWarehouseRows\(rows\)/,
    "las filas autorizadas deben incorporarse a la caché existente");
  assert.match(JOURNADA_UI, /ensureWarehouseCatalog\(\);/,
    "la inicialización debe iniciar la carga del catálogo sin bloquear el arranque");
  assert.match(JOURNADA_UI, /bc7-warehouse-retry/,
    "si falla, debe existir una acción visible de reintento");
  assert.match(JOURNADA_UI, /\.tab-btn\[data-tab="jornada"\]/,
    "al volver a abrir Jornada debe reintentarse la carga");
});

test("el cierre solo informa éxito tras releer COMPLETADA y reconcilia respuestas perdidas",()=>{
  const start=JOURNADA_UI.indexOf("async function closeSession(form)");
  const end=JOURNADA_UI.indexOf("async function submitAdjustment(form)",start);
  assert.ok(start>=0&&end>start);
  const close=JOURNADA_UI.slice(start,end);
  assert.match(close,/const reread=await openWorkspace\(sessionId\)/);
  assert.match(close,/finalState!=='COMPLETADA'/);
  assert.match(close,/rereadState==='COMPLETADA'/);
  assert.match(close,/No se repitió la escritura/);
  assert.match(close,/No repitas la escritura todavía/);
  assert.match(close,/no se pudo releer el resumen/i);
});

test("el inicio solo muestra éxito tras releer EN_CURSO y reconcilia respuestas perdidas",()=>{
  const start=JOURNADA_UI.indexOf("async function startSession(btn)");
  const end=JOURNADA_UI.indexOf("async function closeSession(form)",start);
  assert.ok(start>=0&&end>start);
  const open=JOURNADA_UI.slice(start,end);
  assert.match(open,/const reread=await openWorkspace\(sessionId\)/);
  assert.match(open,/currentState!=='EN_CURSO'/);
  assert.match(open,/rereadState==='EN_CURSO'/);
  assert.match(open,/No se repitió la escritura/);
  assert.match(open,/No repitas la escritura todavía/);
});
