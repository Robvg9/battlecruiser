"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const ROOT=path.join(__dirname,".."),read=file=>fs.readFileSync(path.join(ROOT,file),"utf8");
const PREVIEW="https://bc-pr-224-battlecruiser.robvg9.workers.dev",PRODUCTION="https://battlecruiser.robvg9.workers.dev";
const LOGIN_PATH="/__bc_preview/functions/v1/bc-username-login",RECOVERY_PATH="/__bc_preview/functions/v1/bc-password-recovery-admin";
const LOGIN_URL="https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-username-login",RECOVERY_URL="https://papxnkkjtkxsitcsvcme.supabase.co/functions/v1/bc-password-recovery-admin";
const originalFetch=global.fetch,assets={fetch:async()=>new Response("asset",{status:200})};
async function getWorker(){return (await import("../preview-worker.mjs")).default}
for(const endpoint of [{name:"username login",path:LOGIN_PATH,upstream:LOGIN_URL,authorization:null},{name:"admin password recovery",path:RECOVERY_PATH,upstream:RECOVERY_URL,authorization:"Bearer mock-access-token"}]){
 test("preview proxy forwards "+endpoint.name+" through the same-origin Worker",async t=>{
  const calls=[];global.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify({session:{access_token:"mock-access",refresh_token:"mock-refresh"},completed:true}),{status:200,headers:{"content-type":"application/json","cache-control":"private"}})};
  t.after(()=>{global.fetch=originalFetch});
  const payload=JSON.stringify({username:"preview-test-user",password:"not-a-real-password"}),headers={Origin:PREVIEW,apikey:"public-anon-test-key","Content-Type":"application/json","x-client-info":"battlecruiser-preview-test",cookie:"must-not-be-forwarded=1"};
  if(endpoint.authorization)headers.Authorization=endpoint.authorization;
  const request=new Request(PREVIEW+endpoint.path,{method:"POST",headers,body:payload});
  const response=await(await getWorker()).fetch(request,{ASSETS:assets}),body=await response.json();
  assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,endpoint.upstream);assert.equal(calls[0].init.method,"POST");
  assert.equal(calls[0].init.headers.get("Origin"),PRODUCTION);assert.equal(calls[0].init.headers.get("apikey"),"public-anon-test-key");
  assert.equal(calls[0].init.headers.get("cookie"),null);assert.equal(calls[0].init.headers.get("authorization"),endpoint.authorization);
  assert.equal(calls[0].init.body,payload);assert.equal(response.headers.get("cache-control"),"no-store");assert.equal(body.completed,true);
 });
}
test("preview proxy rejects a different browser origin before contacting Supabase",async t=>{
 let calls=0;global.fetch=async()=>{calls++;return new Response("unexpected")};t.after(()=>{global.fetch=originalFetch});
 const request=new Request(PREVIEW+LOGIN_PATH,{method:"POST",headers:{Origin:"https://attacker.example",apikey:"public-anon-test-key","Content-Type":"application/json"},body:JSON.stringify({username:"x",password:"x"})});
 const response=await(await getWorker()).fetch(request,{ASSETS:assets});assert.equal(response.status,403);assert.equal(calls,0);
});
test("preview proxy answers a valid preflight without forwarding it",async t=>{
 let calls=0;global.fetch=async()=>{calls++;return new Response("unexpected")};t.after(()=>{global.fetch=originalFetch});
 const request=new Request(PREVIEW+LOGIN_PATH,{method:"OPTIONS",headers:{Origin:PREVIEW}});
 const response=await(await getWorker()).fetch(request,{ASSETS:assets});assert.equal(response.status,204);assert.equal(response.headers.get("access-control-allow-origin"),PREVIEW);assert.equal(calls,0);
});
test("preview auth routing targets the isolated PR Worker while LIVE remains direct",()=>{
 const auth=read("public/js/auth.js"),worker=read("preview-worker.mjs"),config=read("wrangler.preview.toml"),edge=read("supabase/functions/bc-username-login/index.ts");
 assert.ok(auth.includes("https://bc-pr-224-battlecruiser.robvg9.workers.dev"));assert.ok(auth.includes("https://ux-jornada-status-colors-transfer-modern-picker-battlecruiser.robvg9.workers.dev"));
 assert.match(auth,/\/__bc_preview\/functions\/v1\/bc-password-recovery-admin/);
 assert.match(worker,/const PREVIEW_ORIGINS = new Set/);assert.match(worker,/ux-jornada-status-colors-transfer-modern-picker-battlecruiser/);
 assert.match(config,/run_worker_first = \["\/__bc_preview\/\*"\]/);
 assert.match(edge,/const APP_ORIGIN = "https:\/\/battlecruiser\.robvg9\.workers\.dev"/);assert.doesNotMatch(edge,/bc-pr-224-battlecruiser/);
});
test("non-proxy assets pass through the configured Worker Assets binding",async()=>{
 const worker=await getWorker(),response=await worker.fetch(new Request("https://other-preview.example/"),{ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname,{status:200})}});
 assert.equal(response.status,200);assert.equal(await response.text(),"/");
});
