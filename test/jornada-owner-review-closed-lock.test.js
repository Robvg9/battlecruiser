"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const owner=fs.readFileSync("public/js/jornada-owner-review.js","utf8");
const app=fs.readFileSync("public/app.js","utf8");
const sw=fs.readFileSync("public/service-worker.js","utf8");
test("approved closed turn review becomes read-only",()=>{
  assert.match(owner,/const turnClosed=turn\\.estado_maestro==='CERRADO'\\|\\|turn\\.estado==='CERRADO'/);
  assert.match(owner,/const bulkCostsEligible=!turnClosed/);
  assert.match(owner,/const salary=turnClosed\\?/);
  assert.match(owner,/const correctionForm=!turnClosed/);
  assert.match(owner,/const movements=!turnClosed/);
  assert.match(owner,/Turno cerrado/);
  assert.match(owner,/reject\\.disabled=busy\\|\\|approved/);
});
test("owner review module cache key is refreshed",()=>{
  assert.match(app,/jornada-owner-review\\.js","1\\.9/);
  assert.match(sw,/jornada-owner-review\\.js\\?v=1\\.9/);
});
