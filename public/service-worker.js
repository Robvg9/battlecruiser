// v88 — v9.2.24: Productos: formulario emergente compacto y campo unidad eliminado
const CACHE_NAME="battlecruiser-shell-v88";
const SHELL_FILES=["./index.html","./style.css","./app.js","./js/core.js","./js/auth.js","./js/offline.js","./js/online-offline-guard.js","./js/loading-guard.js","./js/historial-detalle.js","./js/historiales-premium.js","./js/compra-multiple.js","./js/compra-vale-style.js","./js/movimiento-multiple.js","./js/inventario-detalle.js","./js/runtime-guards.js","./style-historiales.css","./js/centro-control.js","./js/navegacion.js","./js/ciclos-unificacion.js","./js/productos.js","./js/presentaciones.js","./js/almacenes.js","./js/transferencias.js","./js/vales.js","./js/ventas.js","./js/venta-turno-ui.js","./js/catalogos.js","./js/catalogos-core.js","./js/configuracion.js","./js/ui-revision-2026-08.js","./js/catalogo-avanzado.js","./js/usuarios-permisos.js","./js/mando.js","./js/reportes.js","./js/nucleo-operativo.js","./js/operacion-humana.js","./js/ciclos.js","./js/m18-ciclos-ux.js","./js/comunicacion.js","./js/panel-contextual.js","./js/aprobaciones-admin.js","./js/operaciones-financieras.js","./js/m26-ui-integridad.js","./js/manifest.json","./favicon.png","./icons/favicon-48x48.png","./icons/icon-192x192.png","./icons/icon-512x512.png","./icons/icon-maskable-512x512.png","./icons/icon.svg"];
const CDN_FILES=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];

self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(async c=>{for(const url of [...SHELL_FILES,...CDN_FILES]){try{await c.add(url)}catch(err){console.warn("[BattleCruiser] No se pudo cachear",url,err)}}}));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ns=>Promise.all(ns.map(n=>n.startsWith("battlecruiser-shell-")&&n!==CACHE_NAME?caches.delete(n):undefined))));self.clients.claim()});

self.addEventListener("fetch",e=>{const{request}=e,url=request.url;
  if(CDN_FILES.includes(url)){e.respondWith(caches.match(request).then(c=>c||fetch(request)));return}
  if(url.includes("supabase.co")){e.respondWith(request.method==="GET"?fetchWithTimeout(request,4000):fetch(request));return}
  if(url.includes("/js/m26-ui-integridad.js")){e.respondWith(obtenerM26Transformado(request));return}
  const doc=request.destination==="document"||url.endsWith("/index.html")||url.endsWith("/public/");
  if(doc){e.respondWith(fetchWithTimeout(request,2500).catch(()=>caches.match(request)));return}
  e.respondWith(fetchWithTimeout(request,2500).then(r=>{if(r&&r.ok)caches.open(CACHE_NAME).then(c=>c.put(request,r.clone()));return r}).catch(()=>caches.open(CACHE_NAME).then(c=>c.match(request))))
});

async function obtenerM26Transformado(request){
  const cache=await caches.open(CACHE_NAME);
  try{
    const network=await fetchWithTimeout(request,2500);
    if(network&&network.ok){
      const text=await network.text();
      const transformed=transformarM26(text);
      const response=new Response(transformed,{status:200,headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-cache"}});
      await cache.put(request,response.clone());
      return response;
    }
  }catch(err){console.warn("[BattleCruiser] M26: red no disponible, usando caché",err)}
  const cached=await cache.match(request);
  if(cached)return cached;
  const base=await caches.match("./js/m26-ui-integridad.js");
  if(base){const text=await base.text();return new Response(transformarM26(text),{status:200,headers:{"Content-Type":"application/javascript; charset=utf-8"}})}
  return fetch(request);
}

function transformarM26(source){
  if(source.includes("BCProductFormLayoutV924"))return source;
  const patch=`\n;(function BCProductFormLayoutV924(){\n  "use strict";\n  function removeUnidad(form){\n    var unidad=document.getElementById("prod-unidad");\n    if(unidad){\n      var wrap=unidad.closest(".field")||unidad.parentElement;\n      if(wrap&&wrap!==form)wrap.remove();else unidad.remove();\n    }\n    var dl=document.getElementById("unidades-comunes");\n    if(dl)dl.remove();\n  }\n  function arrange(){\n    var form=document.getElementById("form-producto");\n    var modal=document.getElementById("bc-product-modal");\n    if(!form||!modal)return;\n    removeUnidad(form);\n    if(form.dataset.bcLayoutV924==="1")return;\n    var image=document.getElementById("prod-imagen-input");\n    var imageWrap=document.querySelector("#form-producto .prod-imagen-campo");\n    var nombre=document.getElementById("prod-nombre");\n    var categoria=document.getElementById("prod-categoria");\n    var normal=document.getElementById("prod-precio-normal");\n    var mayorista=document.getElementById("prod-precio-mayorista");\n    if(!image||!imageWrap||!nombre||!categoria||!normal||!mayorista)return;\n    var top=document.createElement("div");\n    top.className="bc-product-form-top-v924";\n    var left=document.createElement("div");\n    left.className="bc-product-form-fields-v924";\n    var right=document.createElement("div");\n    right.className="bc-product-form-image-v924";\n    [nombre,categoria,normal,mayorista].forEach(function(el){left.appendChild(el)});\n    right.appendChild(imageWrap);\n    top.appendChild(left);\n    top.appendChild(right);\n    var first=Array.from(form.children).find(function(el){return el.id!=="prod-editando-id";});\n    form.insertBefore(top,first||form.firstChild);\n    form.dataset.bcLayoutV924="1";\n    if(!document.getElementById("bc-product-form-layout-v924")){\n      var style=document.createElement("style");style.id="bc-product-form-layout-v924";\n      style.textContent=`#bc-product-modal .bc-product-modal-dialog{max-width:720px;width:min(92vw,720px)}#bc-product-modal #form-producto{display:flex;flex-direction:column;gap:12px}#bc-product-modal .bc-product-form-top-v924{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:16px;align-items:start}#bc-product-modal .bc-product-form-fields-v924{display:grid;grid-template-columns:1fr 1fr;gap:10px}#bc-product-modal .bc-product-form-fields-v924 #prod-nombre{grid-column:1/-1}#bc-product-modal .bc-product-form-fields-v924>*{width:100%;box-sizing:border-box}#bc-product-modal .bc-product-form-image-v924{display:flex;align-items:center;justify-content:center}#bc-product-modal .prod-imagen-campo{width:150px;height:150px;box-sizing:border-box;padding:10px;border:1px dashed var(--gold-dim,#c9a24d66);border-radius:8px;display:flex;flex-direction:column;justify-content:center;gap:8px;text-align:center;overflow:hidden}#bc-product-modal .prod-imagen-campo .prod-imagen-label{font-size:11px;line-height:1.25}#bc-product-modal .prod-imagen-campo input[type=file]{width:100%;font-size:10px}#bc-product-modal .bc-product-form-top-v924~*{max-width:100%}@media(max-width:600px){#bc-product-modal .bc-product-form-top-v924{grid-template-columns:1fr 112px;gap:10px}#bc-product-modal .bc-product-form-fields-v924{grid-template-columns:1fr}#bc-product-modal .bc-product-form-fields-v924 #prod-nombre{grid-column:auto}#bc-product-modal .prod-imagen-campo{width:112px;height:112px;padding:7px}}`;\n      document.head.appendChild(style);\n    }\n  }\n  function watch(){\n    arrange();\n    var modal=document.getElementById("bc-product-modal");\n    if(modal&&!modal.dataset.bcLayoutWatch){\n      modal.dataset.bcLayoutWatch="1";\n      new MutationObserver(function(){removeUnidad(document.getElementById("form-producto")||document.body);arrange()}).observe(modal,{childList:true,subtree:true});\n    }\n  }\n  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",watch,{once:true});else watch();\n  document.addEventListener("click",function(e){if(e.target.closest("#bc-productos-agregar,.btn-editar-producto"))setTimeout(arrange,0)});\n})();\n`;
  return source+patch;
}

function fetchWithTimeout(request,ms){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("timeout")),ms);fetch(request).then(r=>{clearTimeout(t);resolve(r)}).catch(e=>{clearTimeout(t);reject(e)})})}
