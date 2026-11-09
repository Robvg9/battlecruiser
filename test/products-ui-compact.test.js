"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {JSDOM}=require("jsdom");
const read=(file)=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const SOURCE=fs.readFileSync(path.join(__dirname,"..","public","js","m75-productos-ui-compacto.js"),"utf8");
function fixture(){
 const html=[
  "<!doctype html><html><head></head><body><div id='app-shell' class='visible'>",
  "<header class='app-header'><div class='header-left'><button id='sidebar-toggle-btn'>☰</button><h1>Battlecruiser</h1></div>",
  "<div class='header-right'><div id='conn-status-app'><span id='conn-text-app'>Conectado</span></div><span id='cola-pendientes-badge'></span><span id='user-email'>Roberto · Dueño</span><button id='mi-cuenta-btn'>Mi Cuenta</button><button id='logout-btn'>Cerrar sesión</button></div></header>",
  "<section id='tab-productos' class='tab-panel'><div id='bc-productos-barra'><div class='bc-productos-search'><input id='productos-buscar'></div>",
  "<div id='bc-productos-controles'><div id='bc-productos-orden'><button>A–Z</button><button>Z–A</button></div><div id='bc-productos-vista'><button>Filas</button><button>Cuadros</button></div>",
  "<button type='button' id='bc-productos-agregar'>Registrar nuevo producto</button><button type='button'>Agregar producto</button></div></div>",
  "<div id='lista-productos'><div class='lista-item' data-ctx-tipo='producto' data-ctx-id='p-1'>Cerveza</div><div class='lista-item' data-ctx-tipo='producto' data-ctx-id='p-2'>Arroz</div></div></section>",
  "<section id='tab-config' class='tab-panel'></section>",
  "<div id='bc-product-modal' class='hidden'><div class='bc-product-modal-head'><h3 id='bc-product-modal-title'>Agregar producto</h3><button id='bc-product-modal-close'>×</button></div><div id='bc-product-form-host'><form id='form-producto'></form></div></div>",
  "</div></body></html>"
 ].join("");
 const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://battlecruiser.test/",pretendToBeVisual:true});
 const w=dom.window;
 w._cache={categorias:[{id:"cat-bebidas",nombre:"Bebidas"},{id:"cat-secos",nombre:"Secos"}],productos:[{id:"p-1",categoria_id:"cat-bebidas"},{id:"p-2",categoria_id:"cat-secos"}]};
 let importCalls=0;
 w.__BCM55_openOffline=()=>{importCalls+=1;};
 w.eval(SOURCE);
 w.__BCM75_apply();
 return {dom,window:w,document:w.document,getImportCalls:()=>importCalls};
}
test("header is compact and retains account, logout, connection and user context",(t)=>{
 const c=fixture();t.after(()=>c.dom.window.close());
 const css=c.document.getElementById("bc-m75-products-compact-style").textContent;
 assert.match(css,/grid-template-areas:"brand account logout" "status queue user"/);
 assert.equal(c.document.getElementById("logout-btn").textContent,"Salir");
 assert.equal(c.document.getElementById("logout-btn").getAttribute("aria-label"),"Cerrar sesión");
 assert.equal(c.document.getElementById("mi-cuenta-btn").textContent,"Mi cuenta");
 assert.ok(c.document.getElementById("conn-status-app"));
 assert.equal(c.document.getElementById("user-email").textContent,"Roberto · Dueño");
});
test("Products has one add action, a live category filter and keeps search",(t)=>{
 const c=fixture();t.after(()=>c.dom.window.close());
 const state=c.window.__BCM75_verify();
 assert.equal(state.addButtonCount,1);
 assert.equal(state.addLabel,"Agregar producto");
 assert.ok(state.categoryFilter);
 assert.ok(c.document.getElementById("productos-buscar"));
 assert.equal(c.document.querySelector("#bc-productos-controles #bc-productos-orden"),null);
 const filter=c.document.getElementById("bc-productos-categoria-filter");
 filter.value="cat-secos";filter.dispatchEvent(new c.window.Event("change",{bubbles:true}));
 assert.ok(c.document.querySelector("[data-ctx-id='p-1']").classList.contains("bc-category-hidden"));
 assert.ok(!c.document.querySelector("[data-ctx-id='p-2']").classList.contains("bc-category-hidden"));
});
// Retail presentation is implicit (base unit × 1); M75 must not recreate the retired Administration catalogue.
test("Administration remains free of the retired presentations catalogue",(t)=>{
 const c=fixture();t.after(()=>c.dom.window.close());
 const state=c.window.__BCM75_verify();
 assert.equal(state.duplicateCatalogModal,false);
 assert.equal(state.presentationsPanelInAdministration,false);
 assert.equal(state.presentationsPanelOutsideProducts,true);
 assert.equal(c.document.querySelectorAll("#productos-nomenclatura-modal,#bc-product-presentations-entry,#productos-tools-nomenclatura").length,0);
 assert.equal(state.duplicateCatalogModal,false);
});


const PRODUCTOS_SOURCE=fs.readFileSync(path.join(__dirname,"..","public","js","productos.js"),"utf8");
const M26_SOURCE=fs.readFileSync(path.join(__dirname,"..","public","js","m26-ui-integridad.js"),"utf8");
const M44_SOURCE=fs.readFileSync(path.join(__dirname,"..","public","js","m44-productos-vistas.js"),"utf8");
const M47_SOURCE=fs.readFileSync(path.join(__dirname,"..","public","js","m47-productos-vista-final.js"),"utf8");
const M55_SOURCE=fs.readFileSync(path.join(__dirname,"..","public","js","m55-productos-import.js"),"utf8");
const M171_SOURCE=fs.readFileSync(path.join(__dirname,"..","public","js","hotfix-17-1-productos-import-flow-20260903.js"),"utf8");

function nativeModalFixture(){
 const html=[
  "<!doctype html><html><head></head><body><div id='app-shell' class='visible'>",
  "<header class='app-header'><div class='header-left'><button id='sidebar-toggle-btn'>☰</button><h1>Battlecruiser</h1></div>",
  "<div class='header-right'><div id='conn-status-app'><span id='conn-text-app'>Conectado</span></div><span id='cola-pendientes-badge'></span><span id='user-email'>Roberto · Dueño</span><button id='mi-cuenta-btn'>Mi Cuenta</button><button id='logout-btn'>Cerrar sesión</button></div></header>",
  "<section id='tab-productos' class='tab-panel'>",
  "<div id='msg-productos'></div><div id='msg-prod-imagen'></div><input id='productos-buscar'>",
  "<div id='lista-productos'></div>",
  "<div id='productos-tools-nomenclatura'><button type='button' id='productos-nomenclatura-btn'>Nomenclatura y catálogos</button></div>",
  "<form id='form-producto' data-bc-layout-v925='1'>",
  "<input id='prod-editando-id' type='hidden' value=''>",
  "<input id='prod-nombre' value=''><select id='prod-categoria'><option value=''>Sin categoría</option><option value='cat-secos'>Secos</option></select>",
  "<input id='prod-unidad' type='hidden' value='unidad'><input id='prod-precio-normal' placeholder='Precio' value=''><input id='prod-precio-mayorista' value=''><input id='prod-formato-venta' value=''><input id='prod-formato-factor' value=''>",
  "<div class='prod-imagen-campo'><input id='prod-imagen-input' type='file'></div>",
  "<div id='prod-imagen-preview-wrap' class='hidden'><img id='prod-imagen-preview' data-guardada='false'><button type='button' id='prod-imagen-quitar'>Quitar imagen</button></div>",
  "<div id='prod-presentaciones-config'></div>",
  "<button id='prod-cancelar-edicion' type='button' class='hidden'>Cancelar</button>",
  "<button id='prod-submit-btn' type='submit'>Guardar producto</button>",
  "</form></section>",
  "<section id='tab-config' class='tab-panel'></section>",
  "<div id='productos-nomenclatura-modal' class='hidden'><button id='productos-nomenclatura-cerrar' type='button'>Cerrar</button></div>",
  "</div></body></html>"
 ].join("");
 const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://battlecruiser.test/",pretendToBeVisual:true});
 const w=dom.window;
 const d=w.document;
 Object.defineProperty(w.navigator,"onLine",{configurable:true,value:true});
 let addClickRegistrations=0;
 let formSubmitRegistrations=0;
 const nativeAddEventListener=w.EventTarget.prototype.addEventListener;
 w.EventTarget.prototype.addEventListener=function(type,listener,options){
  if(type==="click" && this.id==="bc-productos-agregar") addClickRegistrations++;
  if(type==="submit" && this.id==="form-producto") formSubmitRegistrations++;
  return nativeAddEventListener.call(this,type,listener,options);
 };
 w._cache={categorias:[{id:"cat-secos",nombre:"Secos"}],productos:[],stock:[]};
 w.safeInit=function(id,init){if(d.getElementById(id)) init();};
 const operationCalls=[];
 const catalogCalls=[];
 const messages=[];
 let refreshCalls=0;
 let importCalls=0;
 w.setMsg=function(id,message,ok){
  messages.push({id:id,message:message,ok:ok});
  const node=d.getElementById(id);
  if(node) node.textContent=String(message||"");
 };
 w.ejecutarOperacion=async function(name,payload){
  operationCalls.push({name:name,payload:payload});
  return {ok:true,data:"producto-test-001",offline:false};
 };
 w.client={
  rpc:async function(name,payload){
   catalogCalls.push({name:name,payload:payload});
   return {data:"producto-test-002",error:null};
  }
 };
 Object.defineProperty(w.crypto,"randomUUID",{configurable:true,value:()=> "test-idempotency-key"});
 w.explicarError=function(){return "error simulado";};
 w.tienePermiso=function(){return true;};
 w.eval(PRODUCTOS_SOURCE);
 w.refrescarProductos=async function(){refreshCalls++;return {};};
 w.eval(M26_SOURCE);
  w.eval(M44_SOURCE);
  w.eval(M47_SOURCE);
  w.eval(M55_SOURCE);
  const nativeM55Open=w.__BCM55_openOffline;
  w.__BCM55_openOffline=function(){importCalls++;return nativeM55Open.apply(this,arguments);};
 w.eval(M171_SOURCE);
 w.eval(SOURCE);
 return {
  dom:dom,window:w,document:d,
  operationCalls:operationCalls,catalogCalls:catalogCalls,messages:messages,
  getAddClickRegistrations:function(){return addClickRegistrations;},
  getFormSubmitRegistrations:function(){return formSubmitRegistrations;},
  getRefreshCalls:function(){return refreshCalls;},
  getImportCalls:function(){return importCalls;}
 };
}

async function waitFor(predicate,message,timeoutMs){
 const timeout=timeoutMs||5000;
 const started=Date.now();
 while(Date.now()-started<timeout){
  if(predicate()) return;
  await new Promise(function(resolve){setTimeout(resolve,25);});
 }
 assert.ok(predicate(),message);
}

test("M26 never recreates the retired Administration presentations catalogue",(t)=>{
 const html=["<!doctype html><html><head></head><body>",
 "<section id='tab-productos' class='tab-panel'><form id='form-producto'><select id='prod-categoria' required></select><input id='prod-unidad'></form></section>",
 "<section id='tab-config' class='tab-panel'></section>",
 "</body></html>"].join("");
 const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://battlecruiser.test/",pretendToBeVisual:true});
 t.after(()=>dom.window.close());
 const d=dom.window.document;
 dom.window.eval(M26_SOURCE);
 assert.equal(d.querySelectorAll(".presentaciones-panel").length,0);
 for(const id of ["form-presentacion-nueva","lista-presentaciones-catalogo","pp-producto-select","pp-lista-asociaciones","form-pp-nueva"]) assert.equal(d.querySelectorAll("#"+id).length,0);
 assert.equal(d.getElementById("prod-categoria").tagName,"SELECT");
 assert.equal(d.getElementById("prod-categoria").required,true);
 assert.equal(d.getElementById("prod-unidad").getAttribute("list"),null);
 assert.equal(d.querySelectorAll("#productos-nomenclatura-modal,#prod-nom-presentaciones-slot").length,0);
});
test("native Add opens the single M26 modal and preserves the existing product creation submit",async(t)=>{
 const c=nativeModalFixture();
 t.after(()=>c.dom.window.close());
 const w=c.window,d=c.document;
 await waitFor(
  ()=>!!d.getElementById("bc-productos-agregar") &&
      !!d.getElementById("bc-product-modal") &&
      typeof w.__BCM26_openProductModal==="function" &&
      typeof w.__BC171_open==="function" &&
      !!d.getElementById("bc-product-import-open"),
  "M26, M17.1 and M75 must finish initializing around the native product modal"
 );
 w.__BCM75_apply();
 await waitFor(
  ()=>{const controls=d.getElementById("bc-productos-controles");const tools=d.querySelector(".bc-m44-view-tools");return !!(controls&&tools&&controls.contains(tools)&&tools.querySelectorAll(".bc-m44-view-btn").length===2);},
  "M75 must preserve M44's single functional rows/cards selector"
 );
 assert.equal(d.querySelectorAll("#productos-nomenclatura-modal,#bc-product-presentations-entry,#productos-tools-nomenclatura").length,0,"the old presentations shortcut and dialog must be removed");
 const viewState=w.__BCM75_verify();
 assert.equal(viewState.viewButtonCount,2,"the two existing M44 view actions must remain available");
 assert.equal(viewState.viewControlsInToolbar,true,"the view selector must remain inside the compact Products toolbar");
 const rowsButton=d.querySelector('.bc-m44-view-btn[data-view="rows"]');
 const cardsButton=d.querySelector('.bc-m44-view-btn[data-view="cards"]');
 rowsButton.click();
 assert.ok(d.getElementById("lista-productos").classList.contains("bc-productos-filas"),"Filas must still change the product list");
 cardsButton.click();
 assert.ok(d.getElementById("lista-productos").classList.contains("bc-productos-cards"),"Cuadros must still change the product list");
 const add=d.getElementById("bc-productos-agregar");
 const modal=d.getElementById("bc-product-modal");
 const form=d.getElementById("form-producto");
 const host=d.getElementById("bc-product-form-host");
 assert.equal(add.textContent,"Agregar producto");
 assert.equal(c.getAddClickRegistrations(),1,"M26 must register one native Add click handler");
 assert.equal(c.getFormSubmitRegistrations(),2,"the original CRUD submit and M26 close hook must each be registered once");
 assert.equal(d.querySelectorAll("#bc-product-modal").length,1,"there must be one native product modal");
 assert.equal(d.querySelectorAll("#form-producto").length,1,"there must be one product form");
 assert.ok(host.contains(form),"M26 must own the original form inside its native modal host");
 assert.equal(w.__BCM75_verify().addButtonCount,1,"M75 must preserve only one visible Add action");
 assert.equal(w.__BC171_verify().singleOwner,true,"M17.1 must reuse M26's form owner");

 let m26ApiCalls=0;
 const nativeM26Open=w.__BCM26_openProductModal;
 w.__BCM26_openProductModal=function(){m26ApiCalls++;return nativeM26Open.apply(this,arguments);};
 add.click();
 assert.equal(m26ApiCalls,1,"the visible Add action must invoke the exported M26 open API exactly once");
 assert.equal(modal.classList.contains("hidden"),false,"clicking Add must open the M26 modal");
 assert.equal(modal.getAttribute("aria-hidden"),"false");
 assert.equal(form.dataset.bcProductFormOpen,"1");
 assert.equal(d.querySelectorAll("#bc-product-modal").length,1,"opening Add must not create a second modal");

 w.__BCM26_closeProductModal(false);
 assert.equal(modal.classList.contains("hidden"),true);
 const callsBeforeM171=m26ApiCalls;
 assert.equal(w.__BC171_open(),true,"M17.1 must open through the exported M26 API");
 assert.equal(m26ApiCalls-callsBeforeM171,1,"M17.1 must call window.__BCM26_openProductModal exactly once");
 assert.equal(modal.classList.contains("hidden"),false);
 assert.equal(d.querySelectorAll("#bc-product-modal").length,1);

 const importButton=d.getElementById("bc-product-import-open");
 assert.ok(importButton.closest("#bc-product-modal"),"the single import action must stay inside the native M26 modal");
 importButton.click();
 const importOverlay=d.getElementById("bc-m55-overlay");
 let importFile=d.getElementById("bc-m55-file");
 assert.ok(importOverlay,"the real M55 import dialog must open");
 assert.match(d.getElementById("bc-m55-body").textContent,/PASO 1 DE 2/);
 assert.equal(importFile,null,"the file selector must stay hidden until the template has been filled");
 assert.ok(d.getElementById("bc-m55-template-download"),"the first step must offer the fillable template");
 d.getElementById("bc-m55-continue").click();
 importFile=d.getElementById("bc-m55-file");
 assert.ok(importFile,"the file selector must appear only in step 2");
 assert.ok(importFile.accept.includes(".csv") && importFile.accept.includes(".xlsx"),"the importer must retain CSV and optional Excel support");
 Object.defineProperty(importFile,"files",{configurable:true,value:[{
  name:"productos.csv",
  text:async function(){return "Nombre;Precio;Categoría\nAvena;10,00;Secos";}
 }]});
 importFile.dispatchEvent(new w.Event("change",{bubbles:true}));
 await waitFor(
  ()=>!!d.getElementById("bc-m55-run") && /Plantilla válida/.test(d.getElementById("bc-m55-body").textContent),
  "M55 must parse the selected CSV and render a validated preview"
 );
 d.getElementById("bc-m55-run").click();
 await waitFor(
  ()=>c.catalogCalls.length===1,
  "M55 must process the CSV row through the canonical product catalog RPC"
 );
  assert.ok(d.getElementById("bc-m55-body").textContent.includes("1 producto(s) procesado(s)"),"the importer must show a successful completion message");
 assert.deepEqual(JSON.parse(JSON.stringify(c.catalogCalls[0])),{
  name:"bc_guardar_producto_catalogo",
  payload:{
   p_producto_id:null,p_nombre:"Avena",p_categoria_id:"cat-secos",p_unidad:"unidad",
   p_precio_normal:10,p_precio_mayorista:null,p_presentacion_normal:"unidad",p_factor_normal:1,
   p_presentacion_mayorista:null,p_factor_mayorista:null,p_idempotency_key:"test-idempotency-key"
  }
 });
 d.getElementById("bc-m55-cancel").click();
 assert.equal(d.getElementById("bc-m55-overlay"),null,"closing import must remove its own overlay");
 assert.equal(d.querySelectorAll("#bc-product-modal").length,1,"M26 must remain the only product-form modal");
 assert.equal(modal.classList.contains("hidden"),false,"closing import must return to the native product form");
 assert.equal(c.getImportCalls(),1,"the single import entry must delegate to the existing M55 importer");

 d.getElementById("prod-nombre").value="Arroz";
 d.getElementById("prod-categoria").value="cat-secos";
 d.getElementById("prod-precio-normal").value="12.5";
 d.getElementById("prod-precio-mayorista").value="";
 form.dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
 await waitFor(
   ()=>c.catalogCalls.length===2 &&
      c.messages.some(function(item){return item.id==="msg-productos" && item.message==="Producto creado.";}) &&
       c.getRefreshCalls()===2,
  "the existing Productos submit handler must call the create operation and refresh the list"
 );
  assert.deepEqual(JSON.parse(JSON.stringify(c.catalogCalls[1])),{
  name:"bc_guardar_producto_catalogo",
  payload:{
   p_producto_id:null,
   p_nombre:"Arroz",
   p_categoria_id:"cat-secos",
   p_unidad:"unidad",
   p_precio_normal:12.5,
   p_precio_mayorista:null,
   p_presentacion_normal:"unidad",
   p_factor_normal:1,
   p_presentacion_mayorista:null,
   p_factor_mayorista:null,
   p_idempotency_key:"test-idempotency-key"
  }
 });
 assert.equal(d.querySelectorAll("#bc-product-modal").length,1);
 assert.ok(host.contains(form),"saving must not detach or replace the original form");
 assert.equal(modal.classList.contains("hidden"),true,"successful creation must close the native modal");
 assert.equal(c.getAddClickRegistrations(),1,"initialization retries must not duplicate the Add handler");
 assert.equal(c.getFormSubmitRegistrations(),2,"initialization retries must not duplicate submit handlers");
});

test("Inventory flavor setup opens the M26 modal and exposes the nested controls", () => {
  const products = read("public/js/productos.js");
  const modal = read("public/js/m26-ui-integridad.js");
  const css = read("public/style.css");
  assert.match(products, /__BCM26_openProductModal\(\)/);
  assert.match(products, /__BCM26_setCommercialOptionsExpanded\(true\)/);
  assert.match(products, /data-mixed-cancel-configuration/);
  assert.match(modal, /form\.appendChild\(commercial\)/);
  assert.match(modal, /commercialFields\.appendChild\(mixedSettings\)/);
  assert.match(css, /#form-producto\.bc-mixed-config-mode \.bc-product-commercial-settings/);
  assert.match(css, /#form-producto\.bc-mixed-config-mode #prod-inventario-mixto-settings/);
});
