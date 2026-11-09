"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {TextEncoder,TextDecoder}=require("node:util");
const {JSDOM}=require("jsdom");
const SRC=fs.readFileSync(path.join(__dirname,"..","public","js","m55-productos-import.js"),"utf8");
const APP=fs.readFileSync(path.join(__dirname,"..","public","app.js"),"utf8");
const INDEX=fs.readFileSync(path.join(__dirname,"..","public","index.html"),"utf8");
const SW=fs.readFileSync(path.join(__dirname,"..","public","service-worker.js"),"utf8");
function setup(t){
 const dom=new JSDOM("<!doctype html><html><head></head><body><p id='msg-productos'></p></body></html>",{url:"https://battlecruiser.test/",runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window,calls=[];w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.tienePermiso=()=>true;w.setMsg=()=>{};
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
function fakeFile(w,name,text){const bytes=new TextEncoder().encode(text);return{name,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>text}}
function attachFile(w,input,file){Object.defineProperty(input,"files",{configurable:true,value:[file]});input.dispatchEvent(new w.Event("change"))}
test("paso 1 descarga un XLSX real con tres encabezados en celdas independientes",async t=>{
 const c=setup(t),d=c.w.document;assert.match(d.getElementById("bc-m55-body").textContent,/PASO 1 DE 2/);
 assert.ok(d.getElementById("bc-m55-template-download"));assert.equal(d.getElementById("bc-m55-file"),null);
 assert.match(d.getElementById("bc-m55-body").textContent,/Productos/);assert.match(d.getElementById("bc-m55-body").textContent,/Precios/);assert.match(d.getElementById("bc-m55-body").textContent,/Categorias/);
 d.getElementById("bc-m55-template-download").click();assert.equal(c.filename(),"plantilla_productos_battlecruiser.xlsx");
 const bytes=await new Promise((resolve,reject)=>{const r=new c.w.FileReader();r.onload=()=>resolve(new Uint8Array(r.result));r.onerror=()=>reject(r.error);r.readAsArrayBuffer(c.blob())});
 assert.deepEqual(Array.from(bytes.slice(0,2)),[0x50,0x4b]);
 const binary=new TextDecoder().decode(bytes);assert.match(binary,/xl\/worksheets\/sheet1.xml/);assert.match(binary,/Productos/);assert.match(binary,/Precios/);assert.match(binary,/Categorias/);
 d.getElementById("bc-m55-continue").click();assert.match(d.getElementById("bc-m55-body").textContent,/PASO 2 DE 2/);
 assert.ok(d.getElementById("bc-m55-file"));assert.equal(c.calls.length,0);
 const c2=setup(t),d2=c2.w.document;d2.getElementById("bc-m55-continue").click();
 const binaryFile={name:"renombrado.csv",arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 attachFile(c2.w,d2.getElementById("bc-m55-file"),binaryFile);
 assert.ok(await waitFor(()=>d2.getElementById("bc-m55-result").textContent.includes("al menos un producto")));
});
test("importa CSV de WPS con tabulaciones, fila de título, columna vacía y encabezados plurales",async t=>{
 const c=setup(t),d=c.w.document;d.getElementById("bc-m55-continue").click();
 const csv="plantilla_productos_battlecruis\n\tProductos\tPrecios\tCategorias\n\tCerveza Mayabe\t1000\tBebidas\n\tCerveza Cristal\t900\tBebidas\n";
 attachFile(c.w,d.getElementById("bc-m55-file"),fakeFile(c.w,"productos.csv",csv));
 assert.ok(await waitFor(()=>d.getElementById("bc-m55-run")));
 assert.match(d.getElementById("bc-m55-preview").textContent,/Plantilla válida/);
 assert.match(d.getElementById("bc-m55-preview").textContent,/2 fila\(s\)/);
 assert.match(d.getElementById("bc-m55-preview").textContent,/columnas reconocidas: nombre, precio_normal, categoria/);
 d.getElementById("bc-m55-run").click();assert.ok(await waitFor(()=>c.calls.length===2));
 assert.equal(c.calls[0].payload.p_nombre,"Cerveza Mayabe");assert.equal(c.calls[0].payload.p_precio_normal,1000);
 assert.equal(c.calls[1].payload.p_nombre,"Cerveza Cristal");assert.equal(c.calls[1].payload.p_precio_normal,900);
});
test("mantiene compatibilidad con CSV clásico separado por punto y coma y decimal con coma",async t=>{
 const c=setup(t),d=c.w.document;d.getElementById("bc-m55-continue").click();
 attachFile(c.w,d.getElementById("bc-m55-file"),fakeFile(c.w,"productos.csv","Nombre;Precio;Categoría\r\nCerveza;650,50;Bebidas"));
 assert.ok(await waitFor(()=>d.getElementById("bc-m55-run")));
 assert.match(d.getElementById("bc-m55-preview").textContent,/Plantilla válida/);
 d.getElementById("bc-m55-run").click();assert.ok(await waitFor(()=>c.calls.length===1));
 assert.equal(c.calls[0].payload.p_nombre,"Cerveza");assert.equal(c.calls[0].payload.p_precio_normal,650.5);
});
test("bloquea categorías inexistentes antes de llamar a Supabase",async t=>{
 const c=setup(t),d=c.w.document;d.getElementById("bc-m55-continue").click();
 attachFile(c.w,d.getElementById("bc-m55-file"),fakeFile(c.w,"productos.csv","Productos;Precios;Categorias\r\nCerveza;650;Inventada"));
 assert.ok(await waitFor(()=>d.getElementById("bc-m55-run")));
 assert.match(d.getElementById("bc-m55-preview").textContent,/no existe o está inactiva/);
 assert.equal(d.getElementById("bc-m55-run").disabled,true);assert.equal(c.calls.length,0);
});
test("reconoce XLSX por firma binaria aunque el nombre termine en CSV",()=>{
 assert.match(SRC,/magic\[0\]===0x50&&magic\[1\]===0x4b/);
 assert.match(SRC,/async function parseXlsx/);
 assert.match(SRC,/Productos/);assert.match(SRC,/Categorias/);
});
test("versiones del shell y cachés de módulos están alineadas",()=>{
 assert.match(APP,/const VERSION="9\.5\.86"/);assert.match(APP,/m55-productos-import\.js","55\.5"/);
 assert.match(INDEX,/app\.js\?v=9\.5\.86/);assert.match(INDEX,/v9\.5\.86 — BattleCruiser/);
 assert.match(SW,/BC_SW_VERSION = "9.5.87"/);assert.match(SW,/m55-productos-import\.js\?v=55\.5/);
 assert.match(SW,/m26-ui-integridad\.js\?v=26\.41/);assert.match(SW,/m75-productos-ui-compacto\.js\?v=75\.12/);
});
