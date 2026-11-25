"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const BRANCH="https://ux-jornada-status-colors-transfer-modern-picker-battlecruiser.robvg9.workers.dev";
const SUPABASE="https://papxnkkjtkxsitcsvcme.supabase.co";

function bootGuard(origin){
  const calls=[];
  const document={readyState:"loading",getElementById:()=>null,addEventListener:()=>{}};
  const window={
    location:{origin},
    fetch:async(input,init)=>{calls.push({url:String(input),init:init||{}});return new Response("allowed",{status:200});},
    addEventListener:()=>{}
  };
  vm.runInNewContext(read("public/js/preview-guard.js"),{window,document,URL,Set,Response,Promise,console},{filename:"preview-guard.js"});
  return {window,calls};
}

test("the branch preview installs its read-only boundary before Supabase starts",()=>{
  const html=read("public/index.html"),sw=read("public/service-worker.js"),guard=read("public/js/preview-guard.js");
  assert.ok(html.indexOf("js/preview-guard.js?v=1.0")<html.indexOf("@supabase/supabase-js"));
  assert.match(sw,/\.\/js\/preview-guard\.js\?v=1\.0/);
  assert.match(guard,/__BC_PREVIEW_READ_ONLY__ = true/);
  assert.match(guard,/PREVIEW · conectado para revisar tus datos y permisos/);
});

test("preview permits Auth and explicitly read-only RPCs but blocks mutations",async()=>{
  const h=bootGuard(BRANCH);
  assert.equal(h.window.__BC_PREVIEW_READ_ONLY__,true);
  const auth=await h.window.fetch(SUPABASE+"/auth/v1/token?grant_type=password",{method:"POST"});
  assert.equal(auth.status,200);
  const read=await h.window.fetch(SUPABASE+"/rest/v1/rpc/perfil_usuario_actual",{method:"POST"});
  assert.equal(read.status,200);
  const mutation=await h.window.fetch(SUPABASE+"/rest/v1/rpc/registrar_compra_multiple",{method:"POST"});
  assert.equal(mutation.status,403);
  assert.equal((await mutation.json()).code,"BC_PREVIEW_READ_ONLY");
  const tableWrite=await h.window.fetch(SUPABASE+"/rest/v1/stock",{method:"PATCH"});
  assert.equal(tableWrite.status,403);
  assert.equal(h.calls.length,2);
});

test("the branch preview proxy is allowlisted and LIVE stays on its direct endpoint",()=>{
  const auth=read("public/js/auth.js"),worker=read("preview-worker.mjs"),config=read("wrangler.jsonc");
  assert.match(auth,/ux-jornada-status-colors-transfer-modern-picker-battlecruiser/);
  assert.match(worker,/ux-jornada-status-colors-transfer-modern-picker-battlecruiser/);
  const workerFirst = JSON.parse(config).assets.run_worker_first;
  for (const route of ["/", "/index.html", "/app.js", "/service-worker.js", "/style.css", "/__bc_preview/*"]) {
    assert.ok(workerFirst.includes(route), "missing Worker-first route " + route);
  }
  assert.match(config,/"run_worker_first": \["\/__bc_preview\/\*"\]/);
  assert.match(worker,/Origin": PRODUCTION_ORIGIN/);
});

test("LIVE origin does not activate the preview write guard",async()=>{
  const h=bootGuard("https://battlecruiser.robvg9.workers.dev");
  assert.equal(h.window.__BC_PREVIEW_READ_ONLY__,undefined);
  const result=await h.window.fetch(SUPABASE+"/rest/v1/rpc/registrar_compra_multiple",{method:"POST"});
  assert.equal(result.status,200);
  assert.equal(h.calls.length,1);
});
