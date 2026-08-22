// v77 — M23: Historiales Premium
// v76 — M22: Productos UX limpia + filtros + nomenclatura confinada a Productos
// v75 — Misión 2/7: aprobaciones administrativas + corrección de monto/cantidad real
// v74 — M21: Turnos UX + puente de navegación + entrega de inventario + cuadre unificado
// v73 — M21: Turnos UX 1-5 + entrega de inventario + siguiente turno + cuadre unificado
// v72 — M20: unificación de salida de producto + reinversión UI
// v71 — M20: caja + reinversiones + operaciones financieras
// v70 — aprobación administrativa M19: gastos, mermas y bajas
// v69 — inyección segura de aprobaciones administrativas en el shell
const CACHE_NAME = "battlecruiser-shell-v77";
const SHELL_FILES = [
  "./index.html","./style.css","./app.js","./js/core.js","./js/auth.js","./js/offline.js","./js/online-offline-guard.js","./js/loading-guard.js","./js/historial-detalle.js","./js/historiales-premium.js","./js/compra-multiple.js","./js/compra-vale-style.js","./js/movimiento-multiple.js","./js/inventario-detalle.js","./js/runtime-guards.js","./style-historiales.css",
  "./js/centro-control.js","./js/navegacion.js","./js/ciclos-unificacion.js","./js/productos.js","./js/presentaciones.js","./js/almacenes.js","./js/transferencias.js","./js/vales.js","./js/ventas.js","./js/venta-turno-ui.js","./js/catalogos.js","./js/configuracion.js","./js/ui-revision-2026-08.js","./js/catalogo-avanzado.js","./js/usuarios-permisos.js","./js/mando.js","./js/reportes.js","./js/nucleo-operativo.js","./js/operacion-humana.js","./js/ciclos.js","./js/m18-ciclos-ux.js","./js/comunicacion.js","./js/panel-contextual.js","./js/aprobaciones-admin.js","./js/operaciones-financieras.js","./js/manifest.json","./favicon.png","./icons/favicon-48x48.png","./icons/icon-192x192.png","./icons/icon-512x512.png","./icons/icon-maskable-512x512.png","./icons/icon.svg"
];
const CDN_FILES=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll([...SHELL_FILES,...CDN_FILES])));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.map(name=>name.startsWith("battlecruiser-shell-")&&name!==CACHE_NAME?caches.delete(name):undefined))));self.clients.claim();});
self.addEventListener("fetch",event=>{const{request}=event,url=request.url;
 if(CDN_FILES.includes(url)){event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));return;}
 if(url.includes("supabase.co")){event.respondWith(request.method==="GET"?fetchWithTimeout(request,4000):fetch(request));return;}
 const isDocument=request.destination==="document"||url.endsWith("/index.html")||url.endsWith("/public/");
 if(isDocument){event.respondWith(fetchWithTimeout(request,2500).catch(()=>caches.match(request)));return;}
 event.respondWith(fetchWithTimeout(request,2500).then(response=>{if(response&&response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));return response;}).catch(()=>caches.open(CACHE_NAME).then(cache=>cache.match(request))));
});
function fetchWithTimeout(request,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("timeout")),ms);fetch(request).then(res=>{clearTimeout(timer);resolve(res);}).catch(err=>{clearTimeout(timer);reject(err);});});}
