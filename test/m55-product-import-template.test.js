"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {JSDOM}=require("jsdom");
const SRC=fs.readFileSync(path.join(__dirname,"..","public","js","m55-productos-import.js"),"utf8");
const APP=fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
const INDEX=fs.readFileSync(path.join(__dirname,"..","public","index.html"),"utf8");
const SW=fs.readFileSync(path.join(__dirname,"..","public","service-worker.js"),"utf8");
function setup(t){
 const dom=new JSDOM("<!doctype html><html><head></head><body><p id='msg-productos'></p></body></html>",{url:"https://battlecruiser.test/",runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window,calls=[];w.tienePermiso=()=>true;w.setMsg=()=>{};
 w._cache={categorias:[{id:"cat-bebidas",nombre:"Bebidas",activo:true}]};
 Object.defineProperty(w.navigator,"onLine",{value:true,configurable:true});
 Object.defineProperty(w.crypto,"randomUUID",{value:()=>"idempotency-test",configurable:true});
 w.client={rpc:async(name,payload)=>{calls.push({name,payload});return{data:"product-created",error:null}}};
 let blob=null,filename=null;w.URL.createObjectURL=b=>(blob=b,"blob:template");w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){filename=this.download};
 w.eval(SRC);w.__BCM55_openOffline();t.after(()=>w.close());
 return{w,calls,blob:()=>blob,filename:()=>filename};
}
async function waitFor(fn,ms=1200){const end=Date.now()+ms;while(Date.now()<end){if(fn())return true;await new Promise(r=>setTimeout(r,10))}return!!fn()}
test("paso 1 descarga plantilla de tres columnas y mantiene oculto el selector",async t=>{
 const c=setup(t),d=c.w.document;assert.match(d.getElementById("bc-m55-body").textContent,/PASO 1 DE 2/);
 assert.ok(d.getElementById("bc-m55-template-download"));assert.equal(d.getElementById("bc-m55-file"),null);
 assert.doesNotMatch(d.getElementById("bc-m55-body").textContent,/Opcionales|mayorista|formato de venta/i);
 d.getElementById("bc-m55-template-download").click();assert.equal(c.filename(),"plantilla_productos_battlecruiser.csv");
 const csv=await new Promise((resolve,reject)=>{const r=new c.w.FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(r.error);r.readAsText(c.blob(),"utf-8")});
 assert.equal(csv.replace(/"/g,"").split(/\r?\n/)[0].replace(/^\uFEFF/,""),"Nombre;Precio;Categoría");
 const bytes=await new Promise((resolve,reject)=>{const r=new c.w.FileReader();r.onload=()=>resolve(new Uint8Array(r.result));r.onerror=()=>reject(r.error);r.readAsArrayBuffer(c.blob())});
 assert.deepEqual(Array.from(bytes.slice(0,3)),[0xef,0xbb,0xbf]);
 d.getElementById("bc-m55-continue").click();assert.match(d.getElementById("bc-m55-body").textContent,/PASO 2 DE 2/);
 assert.ok(d.getElementById("bc-m55-file"));assert.equal(c.calls.length,0);
});
test("importa Nombre, Precio y Categoría; acepta decimal y asigna defaults",async t=>{
 const c=setup(t),d=c.w.document;d.getElementById("bc-m55-continue").click();
 const input=d.getElementById("bc-m55-file");Object.defineProperty(input,"files",{configurable:true,value:[{name:"productos.csv",text:async()=>"Nombre;Precio;Categoría\r\nCerveza;650,50;Bebidas"}]});
 input.dispatchEvent(new c.w.Event("change"));assert.ok(await waitFor(()=>d.getElementById("bc-m55-run")));
 assert.match(d.getElementById("bc-m55-preview").textContent,/Plantilla válida/);
 assert.match(d.getElementById("bc-m55-preview").textContent,/Nombre, precio y categoría revisados/);
 d.getElementById("bc-m55-run").click();assert.ok(await waitFor(()=>c.calls.length===1));
 assert.deepEqual(JSON.parse(JSON.stringify(c.calls[0])),{name:"bc_guardar_producto_catalogo",payload:{
  p_producto_id:null,p_nombre:"Cerveza",p_categoria_id:"cat-bebidas",p_unidad:"unidad",p_precio_normal:650.5,p_precio_mayorista:null,
  p_presentacion_normal:"unidad",p_factor_normal:1,p_presentacion_mayorista:null,p_factor_mayorista:null,p_idempotency_key:"idempotency-test"
 }});
 assert.match(d.getElementById("bc-m55-result").textContent,/1 producto\(s\) procesado\(s\)/);
});
test("bloquea categorías inexistentes antes de llamar a Supabase",async t=>{
 const c=setup(t),d=c.w.document;d.getElementById("bc-m55-continue").click();
 const input=d.getElementById("bc-m55-file");Object.defineProperty(input,"files",{configurable:true,value:[{name:"productos.csv",text:async()=>"Nombre;Precio;Categoría\r\nCerveza;650;Inventada"}]});
 input.dispatchEvent(new c.w.Event("change"));assert.ok(await waitFor(()=>d.getElementById("bc-m55-run")));
 assert.match(d.getElementById("bc-m55-preview").textContent,/no existe o está inactiva/);
 assert.equal(d.getElementById("bc-m55-run").disabled,true);assert.equal(c.calls.length,0);
});
test("versiones del shell y cachés de módulos están alineadas",()=>{
 assert.match(APP,/const VERSION="9\.5\.66"/);assert.match(APP,/m55-productos-import\.js","55\.3"/);
 assert.match(APP,/m26-ui-integridad\.js","26\.40"/);assert.match(APP,/m75-productos-ui-compacto\.js","75\.12"/);
 assert.match(INDEX,/app\.js\?v=9\.5\.66/);assert.match(SW,/BC_SW_VERSION = "9\.5\.66"/);
 assert.match(SW,/m55-productos-import\.js\?v=55\.3/);assert.match(SW,/m26-ui-integridad\.js\?v=26\.40/);
 assert.match(SW,/m75-productos-ui-compacto\.js\?v=75\.12/);
});
