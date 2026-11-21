"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {JSDOM}=require("jsdom");
const guard=fs.readFileSync(path.join(__dirname,"../public/js/online-offline-guard.js"),"utf8");
test("connectivity guard does not call Supabase Auth while login is active",async()=>{
 const dom=new JSDOM("<!doctype html><html><body><form id='login-form'></form><main id='app-shell'></main></body></html>",{url:"https://battlecruiser.test/",runScripts:"outside-only",pretendToBeVisual:true}),w=dom.window;
 const scheduled=[];let authCalls=0;Object.defineProperty(w.navigator,"onLine",{configurable:true,value:true});
 w.client={auth:{getUser:async()=>{authCalls++;return{data:{user:{id:"user-1"}},error:null}}}};w.marcarConectividadReal=()=>{};
 w.setTimeout=callback=>{scheduled.push(callback);return scheduled.length};w.setInterval=()=>1;w.clearTimeout=()=>{};
 const flush=()=>{while(scheduled.length)scheduled.shift()()},microtasks=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
 w.eval(guard);flush();await microtasks();assert.equal(authCalls,0,"login boot must not issue /auth/v1/user");
 w.dispatchEvent(new w.Event("online"));flush();await microtasks();assert.equal(authCalls,0,"online recovery before login must not poll Auth");
 w.document.getElementById("app-shell").classList.add("visible");w.dispatchEvent(new w.Event("online"));flush();await microtasks();
 assert.equal(authCalls,1,"connectivity checks resume when authenticated app shell is visible");dom.window.close();
});
