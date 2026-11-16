"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261116193000_jornada_post_close_sales_rectification.sql","utf8");
const ui=fs.readFileSync("public/js/jornada-owner-review.js","utf8");

test("post-close correction is append-only, private, and separately audited",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.turno_jornada_rectificaciones_post_cierre/);
  assert.match(migration,/ALTER TABLE public\.turno_jornada_rectificaciones_post_cierre ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/REVOKE ALL ON TABLE public\.turno_jornada_rectificaciones_post_cierre FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/BEFORE UPDATE OR DELETE ON public\.turno_jornada_rectificaciones_post_cierre/);
  assert.match(migration,/UNIQUE \(turno_sesion_id, producto_id, version\)/);
  assert.match(migration,/estado_anterior jsonb NOT NULL/);
  assert.match(migration,/estado_corregido jsonb NOT NULL/);
  assert.match(migration,/fuente_documental text NOT NULL/);
  assert.match(migration,/fuente_content_hash text NOT NULL/);
  assert.match(migration,/RECTIFICACION_POST_CIERRE_VENTAS_JORNADA/);
  assert.match(migration,/registros_originales_modificados',false/);
});

test("writer requires an authenticated admin, completed session, and closed master turn",()=>{
  assert.match(migration,/auth\.uid\(\) IS NULL OR NOT public\.bc_actor_is_admin\(\)/);
  assert.match(migration,/v_s\.estado <> 'COMPLETADA' OR v_s\.estado_maestro <> 'CERRADO'/);
  assert.match(migration,/No se puede rectificar un cierre sin inventario final confirmado/);
  assert.match(migration,/Las cantidades de precios por tramos \(%\) deben sumar exactamente las unidades vendidas/);
  assert.match(migration,/Repeated requests with the same idempotency key/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.bc7_registrar_rectificacion_post_cierre_jornada/);
});

test("read model overlays the append-only correction without mutating the original close",()=>{
  assert.match(migration,/public\.bc7_obtener_revision_jornada\(p_turno_id\)/);
  assert.match(migration,/FROM public\.turno_jornada_rectificaciones_post_cierre r/);
  assert.match(migration,/'RECTIFICACION_POST_CIERRE'/);
  assert.match(migration,/'rectificaciones_post_cierre'/);
  assert.match(migration,/public\.bc7_obtener_revision_jornada_rectificada/);
  assert.match(ui,/bc7_obtener_revision_jornada_rectificada/);
  assert.match(ui,/Rectificaciones posteriores al cierre/);
  assert.match(ui,/Dropbox content hash/);
  assert.match(ui,/El Turno y sus registros originales permanecen cerrados e intactos/);
});

test("Sheyla source amounts reconcile exactly to the 210 CUP difference",()=>{
  const caramelos=12*50+6*60;
  const lamore=3*630;
  assert.equal(caramelos,960);
  assert.equal(lamore,1890);
  assert.equal(184970+(caramelos-840)+(lamore-1800),185180);
  assert.equal(185180-8540-7200,169440);
  assert.equal(166510-169440,-2930);
  assert.equal(Math.round(185180*0.05*100)/100,9259);
});
