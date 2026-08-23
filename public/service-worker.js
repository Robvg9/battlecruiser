// BattleCruiser Service Worker v104 — alineado con app v9.2.40
const BC_VERSION = "9.2.40";
const CACHE_NAME = "battlecruiser-shell-v104";
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
  "./js/ui-ajustes-panel.js","./js/hide-config-tab.js",
  "./js/mando.js","./js/reportes.js","./js/nucleo-operativo.js","./js/operacion-humana.js",
  "./js/ciclos.js","./js/m18-ciclos-ux.js","./js/comunicacion.js","./js/panel-contextual.js",
  "./js/aprobaciones-admin.js","./js/operaciones-financieras.js",
  "./js/m26-ui-integridad.js","./js/sesiones-operativas-ui.js","./js/ui-visual-salon.js",
  "./js/manifest.json","./favicon.png",
  "./icons/favicon-48x48.png","./icons/icon-192x192.png","./icons/icon-512x512.png",
  "./icons/icon-maskable-512x512.png","./icons/icon.svg"
];
const CDN_FILES = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async function (c) {
      for (const url of SHELL_FILES.concat(CDN_FILES)) {
        try { await c.add(url); } catch (err) { console.warn("[Battlecruiser SW] No se pudo precachear", url, err); }
      }
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n.startsWith("battlecruiser-shell-") && n !== CACHE_NAME) return caches.delete(n);
        return undefined;
      }));
    }).then(function () { return self.clients.claim(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clients) {
        clients.forEach(function (client) {
          try { client.postMessage({ type: "BC_SW_ACTIVATED", version: BC_VERSION, cache: CACHE_NAME }); } catch (err) {}
        });
      })
  );
});

self.addEventListener("fetch", function (e) {
  var request = e.request;
  var url = request.url;
  if (CDN_FILES.indexOf(url) !== -1) {
    e.respondWith(caches.match(request).then(function (c) { return c || fetch(request); }));
    return;
  }
  if (url.indexOf("supabase.co") !== -1) {
    e.respondWith(request.method === "GET" ? fetchWithTimeout(request, 4000) : fetch(request));
    return;
  }
  var isDoc = request.destination === "document" || url.indexOf("/index.html") !== -1 || /\/public\/?$/.test(url) || request.mode === "navigate";
  if (isDoc) {
    e.respondWith(fetchWithTimeout(request, 2500).catch(function () {
      return caches.match(request).then(function (c) { return c || caches.match("./index.html"); });
    }));
    return;
  }
  e.respondWith(
    fetchWithTimeout(request, 2500).then(function (r) {
      if (r && r.ok) {
        var clone = r.clone();
        caches.open(CACHE_NAME).then(function (c) { try { c.put(request, clone); } catch (err) {} });
      }
      return r;
    }).catch(function () {
      return caches.open(CACHE_NAME).then(function (c) { return c.match(request); });
    })
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
    fetch(request).then(function (r) { clearTimeout(t); resolve(r); }).catch(function (e) { clearTimeout(t); reject(e); });
  });
}
