// v71 — M20: caja + reinversiones + operaciones financieras
// v70 — aprobación administrativa M19: gastos, mermas y bajas
// v69 — inyección segura de aprobaciones administrativas en el shell
// v68 — Aprobaciones administrativas en Centro de Control
// v67 — auditoría profunda online/offline: recuperación real + guardia de conectividad
// v66 — Productos: nomenclatura + presentaciones obligatorias al crear producto
// v65 — UX Centro de Control + Configuración + Productos
// v64 — M18.2: una declaración de caja por sesión + edición pendiente
// v63 — M18.1: Ciclos paso a paso + 1 ciclo activo por almacén
// v62 — M18 Turnos + Ciclos unificados: sesiones operativas
// v61 — conectividad real, detalle de inventario y aislamiento táctil del menú
// v60 — Compra + Movimiento interno múltiple: UI tipo vale
// v59 — reparación de carga del módulo Compras y cache-busting
// v58 — compras múltiples: presentaciones y costo por presentación
// v57 — compra múltiple sobre formulario existente
// v56 — historial detalle completo basado en datos reales de RPC
// v55 — historiales: filas interactivas + detalle común
// v54 — loading guard bootstrap after all modules
// v53 — loading recovery on authenticated session
// v52 — estabilización loading global
// v51 — Login por nombre de usuario + contraseña
// v50 — Ciclos Operativos V1.1: estructura módulo ciclos.js
const CACHE_NAME = "battlecruiser-shell-v71";
const SHELL_FILES = [
  "./index.html","./style.css","./app.js","./js/core.js","./js/auth.js","./js/offline.js","./js/online-offline-guard.js","./js/loading-guard.js","./js/historial-detalle.js","./js/compra-multiple.js","./js/compra-vale-style.js","./js/movimiento-multiple.js","./js/inventario-detalle.js","./js/runtime-guards.js","./style-historiales.css",
  "./js/centro-control.js","./js/navegacion.js","./js/ciclos-unificacion.js","./js/productos.js","./js/presentaciones.js","./js/almacenes.js","./js/transferencias.js","./js/vales.js","./js/ventas.js","./js/venta-turno-ui.js","./js/catalogos.js","./js/configuracion.js","./js/ui-revision-2026-08.js","./js/catalogo-avanzado.js","./js/usuarios-permisos.js","./js/mando.js","./js/reportes.js","./js/nucleo-operativo.js","./js/operacion-humana.js","./js/ciclos.js","./js/m18-ciclos-ux.js","./js/comunicacion.js","./js/panel-contextual.js","./js/aprobaciones-admin.js","./js/operaciones-financieras.js","./js/manifest.json","./favicon.png","./icons/favicon-48x48.png","./icons/icon-192x192.png","./icons/icon-512x512.png","./icons/icon-maskable-512x512.png","./icons/icon.svg"
];
const CDN_FILES=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll([...SHELL_FILES,...CDN_FILES])));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.map(name=>name.startsWith("battlecruiser-shell-")&&name!==CACHE_NAME?caches.delete(name):undefined))));self.clients.claim();});
self.addEventListener("fetch",event=>{const{request}=event,url=request.url;
  if(CDN_FILES.includes(url)){event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));return;}
  if(url.includes("supabase.co")){event.respondWith(request.method==="GET"?fetchWithTimeout(request,4000):fetch(request));return;}
  const isDocument=request.destination==="document"||url.endsWith("/index.html")||url.endsWith("/public/");
  if(isDocument){event.respondWith(fetchWithTimeout(request,2500).then(res=>inyectarAprobaciones(res)).catch(()=>caches.match(request).then(cached=>inyectarAprobaciones(cached))));return;}
  event.respondWith(fetchWithTimeout(request,2500).then(response=>{if(response&&response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));return response;}).catch(()=>caches.open(CACHE_NAME).then(cache=>cache.match(request))));
});
async function inyectarAprobaciones(response){
  if(!response)return response;
  try{
    const type=response.headers.get("content-type")||"";
    if(!type.includes("text/html"))return response;
    const text=await response.text();
    if(text.includes('src="js/aprobaciones-admin.js"'))return new Response(text,{status:response.status,headers:response.headers});
    const injected=text.replace(/<\\/body>/i,'<script src="js/aprobaciones-admin.js"></script></body>');
    return new Response(injected,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(e){return response;}
}
function fetchWithTimeout(request,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("timeout")),ms);fetch(request).then(res=>{clearTimeout(timer);resolve(res);}).catch(err=>{clearTimeout(timer);reject(err);});});}