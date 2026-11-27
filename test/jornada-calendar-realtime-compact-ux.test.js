"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const app = read("public/app.js");
const sw = read("public/service-worker.js");
const index = read("public/index.html");
const warehouses = read("public/js/almacenes.js");
const jornada = read("public/js/bc7-jornada-ui.js");
const approvals = read("public/js/turnos-maestro.js");
const migrationPath = "supabase/migrations/20261126012430_jornada_calendar_realtime.sql";
const migration = read(migrationPath);

test("PWA 9.5.170 keeps shell, app and service-worker versions aligned", () => {
  assert.match(app, /const VERSION="9\.5\.170"/);
  assert.match(index, /app\.js\?v=9\.5\.170/);
  assert.match(index, /style\.css\?v=9\.5\.170/);
  assert.match(sw, /BC_SW_VERSION = "9\.5\.170"/);
  assert.match(sw, /app\.js\?v=9\.5\.170/);
  assert.match(sw, /style\.css\?v=9\.5\.170/);
});

test("a completed Jornada with a closed master Turno is labeled approved, not pending or archived", () => {
  assert.match(jornada, /\['COMPLETADA','CERRADA','CERRADO','CERRADA_OPERATIVAMENTE'\]\.includes\(status\)&&master==='CERRADO'/);
  assert.match(jornada, /isApprovedMasterClose=masterStatus==='CERRADO'/);
  assert.match(jornada, /isApprovedMasterClose\?'<span class="bc7-pill closed">Aprobada<\/span>'/);
  assert.match(jornada, /st==='CERRADA_OPERATIVAMENTE'&&master==='CERRADO'/);
  assert.ok(jornada.includes("requestRevision!==(state.calendarRevision||0)"));
});;

test("calendar re-reads after same-tab approvals and RLS-visible realtime events", () => {
  assert.match(approvals, /bc:jornada-aprobada/);
  assert.match(jornada, /addEventListener\('bc:jornada-aprobada'/);
  assert.match(jornada, /api\.channel\('bc-jornada-calendar-'/);
  assert.match(jornada, /table:'turno_sesiones'/);
  assert.match(jornada, /table:'turnos'/);
  assert.match(jornada, /state\.calendarCache\.clear\(\)/);
  assert.match(jornada, /state\.calendarPromises\.clear\(\)/);
  assert.match(jornada, /removeChannel\(previous\)/);
});

test("the realtime migration filename matches the version recorded by Supabase LIVE", () => {
  assert.equal(path.basename(migrationPath), "20261126012430_jornada_calendar_realtime.sql");
});

test("realtime publication includes only tables protected by the existing participant SELECT policies", () => {
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.turno_sesiones/);
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.turnos/);
  assert.doesNotMatch(migration, /turno_revisiones|turno_jornada_programacion/);
});

test("warehouse inventory is fetched for the selected warehouse and displayed in a compact category-filtered table", () => {
  assert.match(warehouses, /var warehouseId = _almacenSeleccionadoId \|\| null/);
  assert.match(warehouses, /inventario_enriquecido", \{ p_almacen_id: warehouseId \}/);
  assert.match(warehouses, /inventario_mixto_enriquecido", \{ p_almacen_id: warehouseId \}/);
  assert.doesNotMatch(warehouses, /inventario_enriquecido", \{ p_almacen_id: null \}/);
  assert.match(warehouses, /data-bc-alm-category-filter/);
  assert.match(warehouses, /bc-alm-stock-table/);
  assert.match(warehouses, /data-bc-alm-stock-row/);
  assert.match(warehouses, /aplicarPaginacionStockAlmacen/);
  assert.match(warehouses, /data-bc-alm-stock-page/);
  assert.match(warehouses, /max-width: 520px/);
  assert.match(warehouses, /data-bc-alm-equipo-open-modal/);
  assert.match(warehouses, /data-bc-alm-modal/);
  assert.match(warehouses, /data-bc-alm-equipo-action/);
});
