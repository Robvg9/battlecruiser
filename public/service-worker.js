// BattleCruiser Service Worker v112 — app v9.2.49
const BC_VERSION = "9.2.49";
const CACHE_NAME = "battlecruiser-shell-v112";
const SHELL_FILES = [
  "./index.html","./style.css","./app.js",
  "./js/core.js","./js/auth.js","./js/offline.js","./js/online-offline-guard.js","./js/loading-guard.js",
  "./js/historial-detalle.js","./js/historiales-premium.js","./js/compra-multiple.js","./js/compra-vale-style.js",
  "./js/movimiento-multiple.js","./js/inventario-detalle.js","./js/runtime-guards.js","./style-historiales.css",
  "./js/centro-control.js","./js/navegacion.js","./js/ciclos-unificacion.js",
  "./js/productos.js","./js/presentaciones.js","./js/almacenes.js","./js/transferencias.js","./js/vales.js",
  "./js/ventas.js","./js/venta-turno-ui.js","./js/catalogos.js","./js/catalogos-core.js",
  "./js/configuracion.js","./js/ui-revision-2026-08.js","./js/catalogo-avanzado.js",
  "./js/usuarios-permisos.js","./js/roles-en-usuarios.js","./js/fix-permisos-rol.js",
  "./js/ui-layout-inteligente.js","./js/ui-usuarios-dashboard.js","./js/ui-operaciones-hub.js",
  "./js/ui-ajustes-panel.js","./js/hide-config-tab.js","./js/alta-usuario-sin-email.js",
  "./js/permisos-navegacion.js",
  "./js/mando.js","./js/reportes.js","./js/nucleo-operativo.js","./js/operacion-humana.js",
  "./js/ciclos.js","./js/m18-ciclos-ux.js","./js/comunicacion.js","./js/panel-contextual.js",
  "./js/aprobaciones-admin.js","./js/operaciones-financieras.js",
  "./js/m26-ui-integridad.js","./js/sesiones-operativas-ui.js","./js/ui-visual-salon.js",
  "./js/manifest.json","./favicon.png",
  "./icons/favicon-48x48.png","./icons/icon-192x192.png","./icons/icon-512x512.png",
  "./icons/icon-maskable-512x512.png","./icons/icon.svg"
];
const CDN_FILES = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(async c=>{for(const u of [...SHELL_FILES,...CDN_FILES]){try{await c.add(u)}catch(err){console.warn("[Battlecruiser SW] precache omitido",u,err)}}}).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ns=>Promise.all(ns.map(n=>n.startsWith("battlecruiser-shell-")&&n!==CACHE_NAME?caches.delete(n):undefined))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const r=e.request,u=r.url;if(CDN_FILES.includes(u)){e.respondWith(caches.match(r).then(c=>c||fetch(r)));return}if(u.includes("supabase.co")){e.respondWith(r.method==="GET"?fetchWithTimeout(r,4000):fetch(r));return}const doc=r.destination==="document"||r.mode==="navigate"||u.includes("/index.html")||/\/public\/?(\?|$)/.test(u);if(doc){e.respondWith(fetchWithTimeout(r,3000).catch(()=>caches.match("./index.html").then(c=>c||caches.match(r))));return}e.respondWith(fetchWithTimeout(r,3000).then(x=>{if(x&&x.ok&&r.method==="GET")caches.open(CACHE_NAME).then(c=>c.put(r,x.clone()));return x}).catch(()=>caches.open(CACHE_NAME).then(c=>c.match(r))))});
function fetchWithTimeout(r,ms){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("timeout")),ms);fetch(r).then(x=>{clearTimeout(t);resolve(x)}).catch(e=>{clearTimeout(t);reject(e)})})}
