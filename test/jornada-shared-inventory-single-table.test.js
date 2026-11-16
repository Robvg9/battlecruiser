"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");
test("shared initial inventory displays one authoritative product table, not a duplicate receipt table",()=>{
  const start=ui.indexOf("function cutHtml(cut,products,delivery){");
  const end=ui.indexOf("function receiveAttemptKey(deliveryId){",start);
  assert.ok(start>=0&&end>start,"cutHtml must exist");
  const fn=ui.slice(start,end);
  assert.equal((fn.match(/<table class="bc7-table"/g)||[]).length,1);
  assert.match(fn,/Cantidad efectiva compartida/);
  assert.match(fn,/Declarado originalmente:/);
  assert.match(fn,/recibido físicamente:/);
  assert.match(fn,/No se repite una segunda tabla/);
});
