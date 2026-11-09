"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),source=fs.readFileSync(path.join(root,"public/js/product-select-search.js"),"utf8");
test("product selects use one modal search and keep the native select contract",async()=>{
 const {JSDOM}=require("jsdom");
 const dom=new JSDOM(`<!doctype html><body><label><span>Producto</span><select id="trf-producto"><option value="" disabled selected>Producto</option><option value="juice">Jugo La Estancia</option><option value="water">Agua</option></select></label><label><span>Producto</span><select id="bc-baja-producto-1"><option value="">Producto</option><option value="coffee">Café</option></select></label><label><span>Categoría</span><select id="prod-categoria"><option value="">Categoría</option><option value="bebidas">Bebidas</option></select></label><label><span>Almacén de origen</span><select id="mov-multiple-origen"><option value="">Origen</option><option value="a">Almacén Central</option><option value="b">La Cueva</option></select></label><label><span>Almacén de destino</span><select id="mov-multiple-destino"><option value="">Destino</option><option value="a">Almacén Central</option><option value="b">La Cueva</option></select></label><input id="venta-producto-buscar"><select id="venta-producto"><option value="">Producto</option></select><label><span>Almacén para Baja</span><select id="bc-bajas-warehouse"><option value="">Almacén</option><option value="a">Almacén Central</option><option value="b">La Cueva</option></select></label><label><span>Motivo</span><select class="bc-baja-reason" id="bc-baja-motivo-1"><option value="">Motivo</option><option value="Rotura">Rotura</option><option value="Vencimiento">Vencimiento</option></select></label></body>`,{runScripts:"outside-only"});
 try{
  dom.window.eval(source);const select=dom.window.document.getElementById("trf-producto"),field=select.parentElement;
  assert.ok(field.querySelector(".bc-product-picker-trigger"));assert.equal(field.querySelectorAll("input").length,0);
  assert.ok(select.classList.contains("bc-product-picker-native-select"));
  assert.equal(dom.window.document.querySelectorAll("#bc-product-picker-modal").length,0,"the shared modal is created on demand");
  field.querySelector("button").click();const modal=dom.window.document.getElementById("bc-product-picker-modal");
  assert.equal(dom.window.document.querySelectorAll("#bc-product-picker-modal").length,1);assert.equal(modal.hidden,false);
  const search=modal.querySelector("#bc-product-picker-search");search.value="jugo";search.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  assert.equal(modal.querySelectorAll(".bc-product-picker-result").length,1);
  modal.querySelector(".bc-product-picker-result").click();assert.equal(select.value,"juice");assert.equal(modal.hidden,true);
  assert.equal(field.querySelector("button").textContent,"Jugo La Estancia");
  assert.ok(dom.window.document.getElementById("bc-baja-producto-1").parentElement.querySelector(".bc-product-picker-trigger"));
  const bajaWarehouse=dom.window.document.getElementById("bc-bajas-warehouse"),bajaWarehouseField=bajaWarehouse.parentElement;
  assert.ok(bajaWarehouseField.querySelector(".bc-product-picker-trigger"),"Bajas warehouse uses the overlay chooser");
  bajaWarehouseField.querySelector("button").click();
  assert.equal(modal.querySelector("#bc-product-picker-title").textContent,"Elegir almacén");
  search.value="cueva";search.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  assert.equal(modal.querySelectorAll(".bc-product-picker-result").length,1);
  modal.querySelector(".bc-product-picker-result").click();assert.equal(bajaWarehouse.value,"b");
  const reason=dom.window.document.getElementById("bc-baja-motivo-1"),reasonField=reason.parentElement;
  assert.ok(reasonField.querySelector(".bc-product-picker-trigger"),"Bajas reason uses the overlay chooser");
  reasonField.querySelector("button").click();
  assert.equal(modal.querySelector("#bc-product-picker-title").textContent,"Elegir motivo");
  search.value="rotura";search.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  assert.equal(modal.querySelectorAll(".bc-product-picker-result").length,1);
  modal.querySelector(".bc-product-picker-result").click();assert.equal(reason.value,"Rotura");
  const origin=dom.window.document.getElementById("mov-multiple-origen"),originField=origin.parentElement;
  assert.ok(originField.querySelector(".bc-product-picker-trigger"),"warehouse selects use the same searchable picker");
  originField.querySelector("button").click();
  assert.equal(modal.querySelector("#bc-product-picker-title").textContent,"Elegir almacén");
  search.value="cueva";search.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  assert.equal(modal.querySelectorAll(".bc-product-picker-result").length,1);
  modal.querySelector(".bc-product-picker-result").click();assert.equal(origin.value,"b");
  assert.equal(originField.querySelector("button").textContent,"La Cueva");
  const category=dom.window.document.querySelector("#prod-categoria"),categoryField=category.parentElement;
  assert.ok(categoryField.querySelector(".bc-product-picker-trigger"),"all entity selectors share the chooser");
  categoryField.querySelector("button").click();
  assert.equal(modal.querySelector("#bc-product-picker-title").textContent,"Elegir categoría");
  search.value="bebidas";search.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  assert.equal(modal.querySelectorAll(".bc-product-picker-result").length,1);
  modal.querySelector(".bc-product-picker-result").click();assert.equal(category.value,"bebidas");
  assert.equal(dom.window.document.querySelector("#venta-producto").closest(".bc-product-picker-field"),null);
 }finally{dom.window.close();}
});
test("module and cache manifest are versioned together",()=>{
 const app=fs.readFileSync(path.join(root,"public/app.js"),"utf8"),sw=fs.readFileSync(path.join(root,"public/service-worker.js"),"utf8");
 assert.match(app,/\["product-select-search\.js","2\.2"\]/);assert.match(sw,/product-select-search\.js\?v=2\.2/);assert.match(sw,/bajas-multiple\.js\?v=1\.1/);
});

test("mobile picker is above Bajas and anchored to the visual viewport while filtering",()=>{
 const css=fs.readFileSync(path.join(root,"public/style.css"),"utf8");
 assert.match(source,/function syncPickerViewport\(\)/);
 assert.match(source,/viewport\.addEventListener\('resize', syncPickerViewport/);
 assert.match(source,/viewport\.addEventListener\('scroll', syncPickerViewport/);
 assert.match(css,/\.bc-product-picker-modal\{z-index:100900!important\}/);
 assert.match(css,/@media\(max-width:560px\)[\s\S]*?top:var\(--bc-picker-vv-top,0px\)/);
 assert.match(css,/\.bc-product-picker-dialog\{[\s\S]*?height:100%[\s\S]*?max-height:none[\s\S]*?min-height:0/);
 assert.match(css,/\.bc-product-picker-results\{[\s\S]*?flex:1 1 auto[\s\S]*?min-height:0[\s\S]*?overflow-y:auto/);
});
