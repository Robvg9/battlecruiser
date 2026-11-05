"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {JSDOM}=require("jsdom");
const M26=fs.readFileSync(path.join(__dirname,"..","public","js","m26-ui-integridad.js"),"utf8");
const M172=fs.readFileSync(path.join(__dirname,"..","public","js","hotfix-17-2-productos-save-20260903.js"),"utf8");
const PRODUCTS=fs.readFileSync(path.join(__dirname,"..","public","js","productos.js"),"utf8");
function fixture(){
 const html=["<!doctype html><html><head></head><body>","<section id='tab-productos' class='tab-panel'><form id='form-producto'>",
 "<input type='hidden' id='prod-editando-id' value=''><input id='prod-nombre' value=''>",
 "<select id='prod-categoria'><option value=''>Sin categoría</option><option value='cat-1'>Bebidas</option></select>",
 "<input id='prod-unidad' type='hidden' value='unidad'><datalist id='unidades-comunes'></datalist>",
 "<input id='prod-precio-normal' type='number' value='10'>",
 "<input id='prod-precio-mayorista' type='number'><input id='prod-formato-venta'><input id='prod-formato-factor' type='number'>",
 "<div class='prod-imagen-campo'><input id='prod-imagen-input' type='file'></div>",
 "<fieldset id='prod-presentaciones-config'><select id='prod-pres-min'><option value=''>Selecciona</option></select><select id='prod-pres-may-habilitado'><option value='no'>No</option></select></fieldset>",
 "<button id='prod-cancelar-edicion' type='button'>Cancelar</button><button id='prod-submit-btn' type='submit'>Guardar</button>",
 "</form><input id='productos-buscar'><div id='lista-productos'></div></section>"].join("");
 const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://battlecruiser.test/",pretendToBeVisual:true});
 dom.window.eval(M26);assert.equal(dom.window.__BCM26_ensureCommercialOptions(),true);
 return{dom,w:dom.window,d:dom.window.document};
}
test("alta nueva muestra solo Nombre, Precio y Categoría",t=>{
 const c=fixture();t.after(()=>c.w.close());const fields=c.d.querySelectorAll(".bc-product-form-fields .bc-product-field");
 assert.equal(fields.length,3);assert.deepEqual(Array.from(fields).map(x=>x.querySelector("label").textContent),["Nombre","Precio","Categoría"]);
 assert.equal(c.d.getElementById("prod-categoria").required,true);assert.equal(c.d.getElementById("prod-precio-normal").required,true);
 const toggle=c.d.getElementById("bc-product-commercial-toggle");assert.ok(toggle,"M17.2/Pulido require a stable compatibility anchor");
 assert.equal(toggle.hidden,true,"the anchor is hidden during new-product creation");assert.equal(toggle.style.display,"none");
 assert.doesNotMatch(c.d.getElementById("form-producto").textContent,/Opcional/);
 const panel=c.d.getElementById("bc-product-commercial-panel");assert.ok(panel);assert.equal(panel.hidden,true);
 for(const id of ["prod-precio-mayorista","prod-formato-venta","prod-formato-factor","prod-imagen-input"])assert.ok(panel.contains(c.d.getElementById(id)));
 assert.equal(c.d.getElementById("prod-unidad").type,"hidden");
 assert.equal(c.d.querySelector("#bc-product-form-host"),null);
 assert.equal(c.w.__BCM26_setCommercialOptionsExpanded(true),true);assert.equal(panel.hidden,false);
 assert.equal(c.w.__BCM26_setCommercialOptionsExpanded(false),true);assert.equal(panel.hidden,true);
});
test("editar producto existente conserva datos comerciales",t=>{
 const c=fixture();t.after(()=>c.w.close());c.d.getElementById("prod-editando-id").value="existing-product";
 c.d.getElementById("prod-precio-mayorista").value="8.50";c.d.getElementById("prod-formato-venta").value="Caja";
 c.d.getElementById("prod-formato-factor").value="24";c.w.__BCM26_openProductModal();
 assert.equal(c.d.getElementById("bc-product-modal").classList.contains("hidden"),false);
 assert.equal(c.d.getElementById("bc-product-commercial-panel").hidden,false);
 assert.equal(c.d.getElementById("prod-precio-mayorista").value,"8.50");
 assert.equal(c.d.getElementById("prod-formato-venta").value,"Caja");assert.equal(c.d.getElementById("prod-formato-factor").value,"24");
});
test("altas nuevas asignan defaults y no persisten valores comerciales",()=>{
 assert.match(PRODUCTS,/const unidad = editandoId[\s\S]*?:\s*"unidad"/);
 assert.match(PRODUCTS,/const precioMayoristaRaw = editandoId \?[^;]*: ""/);
 assert.match(PRODUCTS,/const formatoMayorista = editandoId \?[^;]*: ""/);
 assert.match(PRODUCTS,/const mixedEnabled = !!\(editandoId && mixedToggle && mixedToggle\.checked\)/);
 assert.match(PRODUCTS,/const archivoImagen = editandoId[\s\S]*?: null/);
 assert.ok(PRODUCTS.includes("bc_guardar_producto_catalogo"));assert.ok(PRODUCTS.includes("p_factor_normal: 1"));
});
test("M17.2 conserva submit único y mayorista opcional",async t=>{
 const dom=new JSDOM("<!doctype html><html><body><form id='form-producto'><input id='prod-precio-normal' type='number'><input id='prod-precio-mayorista' type='number'><button id='prod-submit-btn' type='button'>Save</button></form></body></html>",{runScripts:"outside-only",url:"https://battlecruiser.test/",pretendToBeVisual:true});
 t.after(()=>dom.window.close());const w=dom.window,d=w.document;let submits=0;const add=w.EventTarget.prototype.addEventListener;
 w.EventTarget.prototype.addEventListener=function(type,listener,opts){if(type==="submit"&&this.id==="form-producto")submits++;return add.call(this,type,listener,opts)};
 w.eval(M172);await new Promise(resolve=>w.setTimeout(resolve,20));const v=w.__BC172_verify();
 assert.equal(submits,0);assert.equal(v.legacySubmitHandler,false);assert.equal(v.normalPriceRequired,true);assert.equal(v.wholesalePriceOptional,true);
 assert.equal(d.getElementById("prod-precio-normal").hasAttribute("required"),true);assert.equal(d.getElementById("prod-precio-mayorista").hasAttribute("required"),false);
 assert.equal(d.getElementById("prod-precio-normal").min,"0.01");assert.equal(d.getElementById("prod-precio-mayorista").hasAttribute("min"),false);
 assert.equal(d.getElementById("prod-submit-btn").type,"submit");
});
