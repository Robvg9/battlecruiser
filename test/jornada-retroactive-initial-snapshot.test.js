"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const MIGRATION=fs.readFileSync(
  path.join(__dirname,"..","supabase/migrations/20261118140000_jornada_retroactive_initial_snapshot_completion.sql"),
  "utf8"
);

test("retroactive initial product set preserves the exact rows already recorded in its confirmed cut",()=>{
  const helper=MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_jornada_productos_corte"),
    MIGRATION.indexOf("REVOKE ALL ON FUNCTION public.bc7_jornada_productos_corte")
  );
  const initial=helper.slice(
    helper.indexOf("IF upper(p_tipo)='INICIAL' THEN"),
    helper.indexOf("END IF;",helper.indexOf("IF upper(p_tipo)='INICIAL' THEN"))
  );
  assert.ok(initial.includes("p.created_at<v_cutoff"));
  assert.ok(initial.includes("UNION"));
  assert.ok(initial.includes("c.tipo='INICIAL'"));
  assert.ok(initial.includes("captured.producto_padre_id IS NULL"));
  assert.ok(initial.includes("ORDER BY e.producto_id"));
});

test("initial-cut repair is Owner-only, append-only, audited and cannot mutate global stock",()=>{
  const repair=MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_completar_lineas_inicial_jornada"),
    MIGRATION.indexOf("REVOKE ALL ON FUNCTION public.bc7_completar_lineas_inicial_jornada")
  );
  assert.ok(repair.includes("SECURITY DEFINER"));
  assert.ok(repair.includes("public.bc_actor_is_admin()"));
  assert.ok(repair.includes("v_s.estado<>'EN_CURSO'"));
  assert.ok(repair.includes("c.tipo='FINAL'"));
  assert.ok(repair.includes("expected.producto_id=v_product_id"));
  assert.ok(repair.includes("l.producto_id=v_product_id"));
  assert.ok(repair.includes("INVENTARIO_INICIAL_LINEAS_COMPLETADAS"));
  assert.ok(repair.includes("'stock_global_modificado',false"));
  assert.ok(repair.includes("INSERT INTO public.turno_jornada_inventario_lineas"));
  assert.equal(/UPDATE\s+public\.turno_jornada_inventario_lineas/i.test(repair),false);
  assert.equal(/UPDATE\s+public\.stock/i.test(repair),false);
  assert.equal(/DELETE\s+FROM\s+public\.turno_jornada_inventario_lineas/i.test(repair),false);
});

test("owner repair cannot overwrite present lines or append after the final cut",()=>{
  const repair=MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.bc7_completar_lineas_inicial_jornada"),
    MIGRATION.indexOf("REVOKE ALL ON FUNCTION public.bc7_completar_lineas_inicial_jornada")
  );
  assert.ok(repair.includes("FOR UPDATE"));
  assert.ok(repair.includes("ya tiene una línea en el corte inicial"));
  assert.ok(repair.includes("No se pueden agregar líneas iniciales después de guardar el corte final"));
  assert.ok(repair.includes("linea_original_modificada',false"));
});
