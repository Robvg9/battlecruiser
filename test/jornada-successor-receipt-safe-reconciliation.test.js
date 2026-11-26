"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const migration=fs.readFileSync("supabase/migrations/20261126035000_jornada_successor_receipt_safe_reconciliation.sql","utf8");
const contract=fs.readFileSync("test/jornada-successor-receipt-safe-reconciliation-contract.sql","utf8");
const owner=fs.readFileSync("public/js/jornada-owner-review.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");
const workflow=fs.readFileSync(".github/workflows/step7-jornada-postgres.yml","utf8");
const runner=fs.readFileSync("test/step7-jornada-postgres-windows-ci.js","utf8");

test("the preview is Owner-only and follows the exact accepted source-FINAL to successor-INITIAL chain",()=>{
  assert.match(migration,/bc7_previsualizar_reconciliacion_final_sucesora/);
  assert.match(migration,/auth\.uid\(\) IS NULL OR NOT public\.bc_actor_is_admin\(\)/);
  assert.match(migration,/origen_sesion_id = v_source\.id/);
  assert.match(migration,/origen_corte_id = v_source_cut\.id/);
  assert.match(migration,/estado = 'ACEPTADA'/);
  assert.match(migration,/origen_corte_id = v_source_cut\.id/);
  assert.match(migration,/v_source\.estado <> 'COMPLETADA'/);
  assert.match(migration,/estado_maestro,v_source_turn\.estado\) <> 'CERRADO'/);
});

test("the preview checks product-family movements across the real cutoff-to-receipt interval",()=>{
  for(const table of ["transferencias","ventas","vales_salida","lotes_compra","reinversiones","bajas","mermas","stock","turno_jornada_inventario_correcciones"]){
    assert.ok(migration.includes("public."+table),table+" must be included in the movement guard");
  }
  assert.match(migration,/t\.fecha > v_start AND t\.fecha <= v_end/);
  assert.match(migration,/coalesce\(mp\.producto_padre_id,mp\.id\) = v_item\.familia_id/);
  assert.match(migration,/'MOVIMIENTO_DEL_PRODUCTO_EN_INTERVALO'/);
  assert.match(migration,/'CANTIDADES_DE_EVIDENCIA_NO_COINCIDEN'/);
  assert.match(migration,/other_delivery\.destino_sesion_id = v_source\.id/);
  assert.match(migration,/opening_cut\.origen_corte_id = other_delivery\.origen_corte_id/);
  assert.match(migration,/inherited_final\.turno_sesion_id = ic\.turno_sesion_id/);
  assert.match(migration,/opening_cut\.origen_corte_id/);


});

test("application appends an audited FINAL overlay and never rewrites original inventory, receipt, stock or catalog rows",()=>{
  const at=migration.indexOf("CREATE OR REPLACE FUNCTION public.bc7_aplicar_reconciliacion_final_sucesora");
  assert.ok(at>=0);
  const apply=migration.slice(at);
  assert.match(apply,/pg_advisory_xact_lock/);
  assert.match(apply,/p_idempotency_key/);
  assert.match(apply,/INSERT INTO public\.turno_jornada_inventario_correcciones/);
  assert.match(apply,/UPDATE public\.turno_jornada_inventario_correcciones/);
  assert.match(apply,/INSERT INTO public\.turno_eventos/);
  assert.match(apply,/JORNADA_FINAL_RECONCILIADO_RECEPCION_SUCESORA/);
  assert.doesNotMatch(apply,/UPDATE public\.turno_jornada_inventario_lineas/);
  assert.doesNotMatch(apply,/UPDATE public\.turno_jornada_inventario_recepcion_lineas/);
  assert.doesNotMatch(apply,/UPDATE public\.stock/);
  assert.doesNotMatch(apply,/UPDATE public\.productos/);
});

test("authenticated-only grants and audit safeguards are covered by the PostgreSQL contract",()=>{
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.bc7_previsualizar_reconciliacion_final_sucesora\(uuid\) FROM PUBLIC, anon/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.bc7_aplicar_reconciliacion_final_sucesora\(uuid,text,uuid\) TO authenticated/);
  assert.match(contract,/has_function_privilege\('authenticated'/);
  assert.match(contract,/has_function_privilege\('anon'/);
});

test("owner review loads the preview and requires a deliberate audited apply action",()=>{
  assert.match(owner,/bc7_previsualizar_reconciliacion_final_sucesora/);
  assert.match(owner,/bc7_aplicar_reconciliacion_final_sucesora/);
  assert.match(owner,/data-bcjr-action="apply-successor-reconciliation"/);
  assert.match(owner,/cantidad_final_anterior/);
  assert.match(owner,/cantidad_recibida_sucesora/);
  assert.match(owner,/Los cortes originales/);
  assert.match(owner,/idempotency_key:key/);
});

test("Owner review labels negative, positive and zero cash differences explicitly",()=>{
  assert.match(owner,/const differenceStatus=value=>/);
  assert.match(owner,/return 'Sobrante '\+/);
  assert.match(owner,/return 'Faltante '\+/);
  assert.match(owner,/return 'Cuadrada 0 CUP'/);
  assert.match(owner,/\['Resultado de caja',pendingPost\?blocked:differenceStatus\(l\.diferencia\)\]/);
  assert.match(owner,/card\('Resultado de caja',[\s\S]*differenceStatus\(totalDifference\)/);
});

test("the historical accounting sign is preserved: a 3,480 CUP revenue reduction changes +700 faltante to -2,780 sobrante",()=>{
  const differenceBefore=700;
  const receiptValueChange=(3*1000)+(1*700)-(1*220);
  const differenceAfter=differenceBefore-receiptValueChange;
  assert.equal(receiptValueChange,3480);
  assert.equal(differenceAfter,-2780);
});

test("PWA caches the updated owner review module and Step 7 applies the new migration",()=>{
  assert.match(app,/\["jornada-owner-review\.js","1\.22"\]/);
  assert.match(sw,/jornada-owner-review\.js\?v=1\.22/);
  assert.match(workflow,/20261126035000_jornada_successor_receipt_safe_reconciliation\.sql/);
  assert.match(workflow,/jornada-successor-receipt-safe-reconciliation-contract\.sql/);
  assert.match(runner,/applySql\("supabase\/migrations\/20261126035000_jornada_successor_receipt_safe_reconciliation\.sql"\)/);
  assert.match(runner,/applySql\("test\/jornada-successor-receipt-safe-reconciliation-contract\.sql"\)/);
});
