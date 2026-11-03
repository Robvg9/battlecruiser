"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {JSDOM}=require("jsdom");
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
  "<section id='tab-config' class='tab-panel'><div id='productos-tools-nomenclatura'><button id='productos-nomenclatura-btn' data-bc-m26='1'>Nomenclatura y catálogos</button></div></section>",
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
test("nomenclature moves to Administration and import is a single action inside native product modal",(t)=>{
 const c=fixture();t.after(()=>c.dom.window.close());
 const state=c.window.__BCM75_verify();
 assert.ok(state.nomenclatureInAdmin);
 assert.ok(c.document.getElementById("tab-config").contains(c.document.getElementById("productos-tools-nomenclatura")));
 assert.equal(state.importButtonCount,1);
 assert.equal(state.importButtonLabel,"Importar Excel / CSV");
 c.document.getElementById("bc-product-import-open").click();
 assert.equal(c.getImportCalls(),1);
 assert.ok(state.formStillInNativeModal);
});