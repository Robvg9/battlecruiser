"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),source=fs.readFileSync(path.join(root,"public/js/product-select-search.js"),"utf8");
test("product selects use one modal search and keep the native select contract",async()=>{
 const {JSDOM}=require("jsdom");
 const dom=new JSDOM(`<!doctype html><body><label><span>Producto</span><select id="trf-producto"><option value="" disabled selected>Producto</option><option value="juice">Jugo La Estancia</option><option value="water">Agua</option></select></label><label><span>Producto</span><select id="bc-baja-producto-1"><option value="">Producto</option><option value="coffee">Café</option></select></label><label><span>Categoría</span><select id="prod-categoria"><option value="">Categoría</option></select></label><input id="venta-producto-buscar"><select id="venta-producto"><option value="">Producto</option></select></body>`,{runScripts:"outside-only"});
 try{
  dom.window.eval(source);const select=dom.window.document.getElementById("trf-producto"),field=select.parentElement;
  assert.ok(field.querySelector(".bc-product-picker-trigger"));assert.equal(field.querySelectorAll("input").length,0);
  assert.ok(select.classList.contains("bc-product-picker-native-select"));
  assert.equal(dom.window.document.querySelectorAll("#bc-product-picker-modal").length,1);
  field.querySelector("button").click();const modal=dom.window.document.getElementById("bc-product-picker-modal");assert.equal(modal.hidden,false);
  const search=modal.querySelector("#bc-product-picker-search");search.value="jugo";search.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  assert.equal(modal.querySelectorAll(".bc-product-picker-result").length,1);
  modal.querySelector(".bc-product-picker-result").click();assert.equal(select.value,"juice");assert.equal(modal.hidden,true);
  assert.equal(field.querySelector("button").textContent,"Jugo La Estancia");
  assert.ok(dom.window.document.getElementById("bc-baja-producto-1").parentElement.querySelector(".bc-product-picker-trigger"));
  assert.equal(dom.window.document.querySelector("#prod-categoria").closest(".bc-product-picker-field"),null);
  assert.equal(dom.window.document.querySelector("#venta-producto").closest(".bc-product-picker-field"),null);
 }finally{dom.window.close();}
});
test("module and cache manifest are versioned together",()=>{
 const app=fs.readFileSync(path.join(root,"public/app.js"),"utf8"),sw=fs.readFileSync(path.join(root,"public/service-worker.js"),"utf8");
 assert.match(app,/\["product-select-search\.js","2\.0"\]/);assert.match(sw,/product-select-search\.js\?v=2\.0/);assert.match(sw,/bajas-multiple\.js\?v=1\.0/);
});