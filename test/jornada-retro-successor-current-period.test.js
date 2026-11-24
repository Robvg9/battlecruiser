"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261119165500_jornada_successor_current_period_window.sql","utf8");
const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");

test("successor programming keys retroactive eligibility to its start date, not its end date",()=>{
  const start=migration.indexOf("CREATE OR REPLACE FUNCTION public.bc7_admin_programar_sucesora_pendiente");
  const end=migration.indexOf("$function$;",start);
  assert.ok(start>=0&&end>start);
  const fn=migration.slice(start,end);
  assert.ok(fn.includes("IF v_e.fecha_destino>=v_today THEN"));
  assert.ok(!fn.includes("IF p_fecha_fin>=v_today THEN"));
  assert.ok(fn.includes("p_fecha_fin-v_e.fecha_destino>30"));
  assert.ok(fn.includes("Ya existe una programación que se cruza con el período sucesor."));
});

test("an ongoing successor can start retroactively only after its scheduled start date",()=>{
  const start=migration.indexOf("CREATE OR REPLACE FUNCTION public.bc7_admin_iniciar_sucesora_retroactiva");
  const end=migration.indexOf("$function$;",start);
  assert.ok(start>=0&&end>start);
  const fn=migration.slice(start,end);
  assert.ok(fn.includes("IF v_today < v_p.fecha THEN"));
  assert.ok(!fn.includes("v_today<=coalesce(v_p.fecha_fin"));
  assert.ok(fn.includes("v_delivery.estado<>'ACEPTADA'"));
  assert.ok(fn.includes("tipo='INICIAL' AND c.estado='CONFIRMADO'"));
  assert.ok(fn.includes("v_start>now()"));
});

test("the inherited handover never updates global stock and preserves physical receipt gates",()=>{
  assert.ok(migration.includes("PENDIENTE_RECEPCION"));
  assert.ok(migration.includes("'stock_global_modificado',false"));
  assert.doesNotMatch(migration,/UPDATE\s+public\.stock\b/i);
  assert.doesNotMatch(migration,/INSERT\s+INTO\s+public\.stock\b/i);
});

test("the form inherits the previous period length and explains genuine date conflicts accurately",()=>{
  assert.ok(ui.includes("function successorEndDate(delivery)"));
  assert.ok(ui.includes("successorEndDate(first)"));
  assert.ok(ui.includes("successorEndDate(d)"));
  assert.ok(ui.includes("ya existe programacion|programacion para el almacen"));
  assert.ok(ui.includes("opcion se reserva para periodos ya terminados"));
  assert.ok(ui.includes("fecha inicial de la sucesora debe ser anterior a hoy"));
  assert.ok(ui.includes("programacion.*fecha"));
  assert.ok(ui.includes("opcion se reserva para periodos ya terminados"));
});

test("the updated Jornada UI is invalidated in the online loader and offline shell",()=>{
  assert.ok(app.includes('["bc7-jornada-ui.js","7.59"]'));
  assert.ok(sw.includes("./js/bc7-jornada-ui.js?v=7.59"));
});
