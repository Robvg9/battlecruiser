"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const owner=fs.readFileSync("public/js/jornada-owner-review.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");
test("approved closed turn review is read-only",()=>{
  assert.ok(owner.includes("const turnClosed=turn.estado_maestro==='CERRADO'||turn.estado==='CERRADO'"));
  assert.ok(owner.includes("const bulkCostsEligible=!turnClosed"));
  assert.ok(!owner.includes("const salary=turnClosed?"),"salary setup is no longer editable inside a Jornada review");
  assert.ok(!owner.includes("bc7_configurar_salario_porcentaje_jornada"));
  assert.ok(!owner.includes("Porcentaje salarial y cálculo"));
  assert.ok(owner.includes("const correctionForm=!turnClosed"));
  assert.ok(owner.includes("const movements=!turnClosed"));
  assert.ok(owner.includes('disabled title="Turno cerrado"'));
  assert.ok(owner.includes("reject.disabled=busy||approved"));
});
test("owner review module cache key is refreshed",()=>{
  assert.ok(app.includes('["jornada-owner-review.js","1.18"]'));
  assert.ok(sw.includes('jornada-owner-review.js?v=1.18'));
});
