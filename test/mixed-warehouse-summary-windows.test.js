"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const MIGRATION = fs.readFileSync("supabase/migrations/20261107220000_bc_mixed_warehouse_movement_summary_windows.sql", "utf8");
const M51 = fs.readFileSync("public/js/m51-movimientos-centro.js", "utf8");
const M76 = fs.readFileSync("public/js/m76-movimientos-operaciones.js", "utf8");

test("mixed summary windows are read-only, scoped to authorized movement readers and use safe search_path", () => {
  assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.bc_movimientos_resumen_ventanas\(\)/);
  assert.match(MIGRATION, /auth\.uid\(\) IS NULL OR NOT public\.tiene_permiso\('reportes','ver'\)/);
  assert.match(MIGRATION, /SECURITY DEFINER/);
  assert.match(MIGRATION, /SET search_path TO 'public','pg_temp'/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.bc_movimientos_resumen_ventanas\(\) FROM PUBLIC,anon/);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.bc_movimientos_resumen_ventanas\(\) TO authenticated/);
  assert.doesNotMatch(MIGRATION, /INSERT INTO public\.(turno_sesiones|turnos)|UPDATE public\.(turno_sesiones|turnos)|DELETE FROM public\.(turno_sesiones|turnos)/i);
});

test("retail uses an actual active/latest completed jornada; storage remains on Havana calendar date", () => {
  assert.match(MIGRATION, /lower\(coalesce\(a\.tipo,''\)\)='minorista'/);
  assert.match(MIGRATION, /s\.bloque='JORNADA'/);
  assert.match(MIGRATION, /s\.jornada_programacion_id IS NOT NULL/);
  assert.match(MIGRATION, /s\.estado IN \('EN_CURSO','COMPLETADA'\)/);
  assert.match(MIGRATION, /MIN\(tr\.inicio_at\)/);
  assert.match(MIGRATION, /MAX\(tr\.fin_at\)/);
  assert.match(MIGRATION, /CASE WHEN j\.estado='EN_CURSO' THEN 0 ELSE 1 END/);
  assert.match(MIGRATION, /'JORNADA_ACTIVA'/);
  assert.match(MIGRATION, /'ULTIMA_JORNADA'/);
  assert.match(MIGRATION, /'DIARIO_SIN_JORNADA'/);
  assert.match(MIGRATION, /AT TIME ZONE 'America\/Havana'/);
});

test("M51 loads summary windows independently per warehouse and filters exact timestamps", () => {
  assert.match(M51, /client\.rpc\('bc_movimientos_resumen_ventanas'/);
  assert.match(M51, /p_almacen_id: item\.almacen_id/);
  assert.match(M51, /timestamp >= inicioMs && timestamp <= finMs/);
  assert.match(M51, /_todaySummaryLabel/);
  assert.doesNotMatch(M51, /primaryIsDailyUnfiltered|cargarResumenDiario/);
});

test("M76 counts supplied warehouse windows without dropping prior calendar dates", () => {
  assert.match(M76, /const summaryOps = groupOperations\(summarySource\)/);
  assert.doesNotMatch(M76, /dateKey\(op\.fecha\) === businessTodayKey\(\)/);
  assert.match(M76, /todaySummaryLabel/);
});
