"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const UI=read("public/js/bc7-jornada-ui.js");
const OWNER=read("public/js/jornada-owner-review.js");
const APP=read("public/app.js");
const SW=read("public/service-worker.js");
const INDEX=read("public/index.html");
const MIG=read("supabase/migrations/20261125170000_jornada_owner_review_operational_cut_classification.sql");
const RUNNER=read("test/step7-jornada-postgres-windows-ci.js");

test("Owner movement summary counts only unclassified records and hides resolved cards",()=>{
  assert.ok(OWNER.includes("pendingPostRows=post.filter(m=>!String(m.clasificacion||'').trim())"));
  assert.ok(OWNER.includes("function countPendingPostMovements(liquidacion)"));
  assert.ok(OWNER.includes("if(post&&post.length>0)return post.filter(m=>!String(m.clasificacion||'').trim()).length;"));
  assert.ok(OWNER.includes("const pendingPostCount=countPendingPostMovements(l);"));
  assert.ok(OWNER.includes("const movements=!turnClosed&&pendingPostRows.length"));
  assert.ok(OWNER.includes("pendingPostRows.map(m=>"));
  assert.ok(!OWNER.includes("pendingPostCount=Math.max(0,Number(l.movimientos_posteriores_pendientes)||0,Number(pending.movimientos_posteriores_corte)||0,pendingPostRows.length)"));
  assert.match(OWNER,/const pendingPostCount=countPendingPostMovements\(l\);[\s\S]*?if\(pendingPostCount>0\)blockers\.push/);
  assert.match(OWNER,/Bajas y mermas registradas después del cierre operativo/);
});
test("Owner movement decisions are framed against the operational close, not FINAL confirmation time",()=>{
  assert.match(OWNER,/Corte operativo registrado/);
  assert.match(OWNER,/¿Cuándo ocurrió respecto al cierre operativo\?/);
  assert.match(OWNER,/Antes del cierre operativo \(se incluye en esta jornada\)/);
  assert.match(OWNER,/Después del cierre operativo \(queda fuera de esta jornada\)/);
  assert.match(OWNER,/<option value="">Seleccionar momento real/);
  assert.match(MIG,/coalesce\(v_s\.corte_operativo_at,v_final\.confirmado_en\)/);
  assert.match(MIG,/corte_operativo_at',v_s\.corte_operativo_at/);
  assert.doesNotMatch(MIG,/UPDATE public\.(bajas|mermas)|DELETE FROM public\.(bajas|mermas)/);
});

test("PWA app, Service Worker, module URLs and HTML shell remain release-aligned",()=>{
  assert.match(APP,/const VERSION="9\.5\.173"/);
  assert.match(SW,/BC_SW_VERSION = "9\.5\.173"/);
  assert.match(APP,/\["bc7-jornada-ui\.js","7\.71"\]/);
  assert.match(SW,/bc7-jornada-ui\.js\?v=7\.71/);
  assert.match(APP,/\["jornada-owner-review\.js","1.22"\]/);
  assert.match(SW,/jornada-owner-review\.js\?v=1.22/);
  assert.match(INDEX,/app\.js\?v=9\.5\.173/);
  assert.match(INDEX,/style\.css\?v=9\.5\.173/);
  assert.match(RUNNER,/jornada_owner_review_operational_cut_classification\.sql/);
});
