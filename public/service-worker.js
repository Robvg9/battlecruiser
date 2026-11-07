/* BattleCruiser Service Worker — v9.5.76
 * App shell: network-first with a versioned offline cache fallback.
 * Core shell assets must be cached at install; same-origin JS/CSS/HTML
 * assets are refreshed on successful network reads for later offline use.
 */
var BC_SW_VERSION = "9.5.76";
var BC_SHELL = "battlecruiser-shell-" + BC_SW_VERSION;
var BC_STATIC = "battlecruiser-static-" + BC_SW_VERSION;
var PRECACHE_SHELL = ["./", "./index.html", "./app.js?v=9.5.76", "./style.css?v=9.5.64", "./js/offline.js", "./js/centro-control.js?v=9.5.69", "./js/mando.js?v=9.5.64", "./js/comunicacion.js?v=9.5.64", "./js/navegacion.js?v=9.5.64", "./js/mi-cuenta.js?v=1.2", "./js/permisos-navegacion.js?v=67.7", "./js/m27-7-almacenes-modal.js?v=27.7f", "./js/hotfix-configuracion-20260902.js?v=20261020.4", "./js/core.js?v=9.5.69","./js/inventario-detalle.js?v=66","./js/m53-inventario-centro.js?v=53.5","./js/nucleo-operativo.js?v=9.5.69", "./js/transferencias.js?v=20261106.1", "./js/vales.js?v=20261105.1", "./js/reportes.js?v=20261105.1", "./js/historial-detalle.js?v=h1.2", "./js/mision-d-stock-reposicion.js?v=D.11", "./js/ui-usuarios-dashboard.js?v=46.3", "./js/m42-reportes-dashboard.js?v=42.2", "./js/movimiento-multiple.js?v=20261106.1", "./js/network-core.js?v=20261020.4", "./js/ventas.js?v=20261105.2", "./js/m68-ventas-pos-definitivo.js?v=9.5.75", "./js/m55-productos-import.js?v=55.5", "./js/productos.js?v=20261106.1", "./js/presentaciones.js?v=20261105.2", "./js/catalogos.js?v=20261106.1", "./js/m26-ui-integridad.js?v=26.40", "./js/m27-5-ventas-precio-politica.js?v=27.5b7", "./js/m27-6-ventas-presentaciones.js?v=27.6g", "./js/m75-productos-ui-compacto.js?v=75.12", "./js/venta-turno-ui.js?v=9.4.46", "./js/m25-fe-sync-turno-ventas.js?v=25.1", "./js/m27-6b-venta-payload-pres.js?v=27.6b2", "./js/configuracion.js?v=20261104.1", "./js/bc7-jornada-ui.js?v=7.13", "./js/operacion-humana.js?v=9.5.64", "./js/hotfix-turno-forceclose-20260902.js?v=20261030.1", "./js/configuracion-ajustes-migrados-20260903.js?v=9.2", "./js/hotfix-secciones-visibles-20260903.js?v=20261030.1", "./js/hotfix-pulido-20260903.js?v=20261105.4", "./js/hotfix-17-2-productos-save-20260903.js?v=17.4", "./js/hotfix-pulido-20260903b.js?v=20261105.2", "./js/section-scope-fix.js?v=20261030.1", "./js/m26-11-offline-shell-guard.js?v=20261030.1", "./js/hotfix-17-final-loader-20260903.js?v=20261030.2", "./js/hotfix-17-13-configuracion-admin-visible-20260903.js?v=20261030.3", "./js/m74-pos-archive-retail.js?v=74.6", "./js/turno-api.js?v=9.4.8", "./js/turnos-maestro.js?v=9.4.8", "./js/m29-turnos-organizacion.js?v=29.21", "./js/m33-turnos-final.js?v=33.21", "./js/m22-sesiones-en-m21.js?v=25.5", "./js/m49-turnos-layout-definitivo.js?v=49.6", "./js/hotfix-regresiones-20260902.js?v=20261101.1", "./js/hotfix-17-4-turnos-tarde-visible-20260903.js?v=17.5", "./js/m56-turnos-secuencia-ui.js?v=56.8", "./js/m57-turnos-sesion-ux-fix.js?v=57.6", "./js/turno-cash-handover-ui.js?v=1.0", "./js/m54-movimientos-client-bridge.js?v=54.1", "./js/m51-movimientos-centro.js?v=51.10", "./js/m52-movimientos-auth-retry.js?v=52.2", "./js/compra-multiple.js?v=27.14", "./js/hotfix-16-5-movimientos-operaciones-flotantes-20260902.js?v=16.13", "./js/m76-movimientos-operaciones.js?v=76.3"];
var PRECACHE_STATIC = ["./manifest.json", "./favicon.png", "./icons/icon-192x192.png", "./icons/icon-512x512.png"];
// The UMD Supabase client is a required runtime dependency, so cache this pinned public CDN asset for offline boot.
var BC_OFFLINE_EXTERNAL = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js"];

self.addEventListener("install", function(event) {
  self.skipWaiting();
  event.waitUntil(caches.open(BC_STATIC).then(function(cache) {
    // Do not silently swallow a failed shell precache: an incomplete install
    // must not replace a working Service Worker with an offline-broken one.
    return cache.addAll(PRECACHE_SHELL.concat(PRECACHE_STATIC)).then(function() {
      return Promise.all(BC_OFFLINE_EXTERNAL.map(function(assetUrl) {
        var request = new Request(assetUrl, { mode: "cors", cache: "no-store" });
        return fetch(request).then(function(response) {
          if (!response || !response.ok) {
            throw new Error("Failed to precache required offline dependency: " + assetUrl);
          }
          return cache.put(request, response.clone());
        });
      }));
    });
  }));
});

self.addEventListener("activate", function(event) {
  event.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(key) {
      return key.indexOf("battlecruiser") === 0 && key !== BC_SHELL && key !== BC_STATIC;
    }).map(function(key) {
      return caches.delete(key);
    }));
  }).then(function() {
    return self.clients.claim();
  }));
});

function isAppShellRequest(url) {
  var path = url.pathname || "";
  return path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".html") ||
    path === "/" ||
    path.endsWith("/index.html") ||
    path.endsWith("/");
}

function cacheSuccessfulResponse(request, response) {
  if (!response || !response.ok) return Promise.resolve(response);
  return caches.open(BC_STATIC).then(function(cache) {
    return cache.put(request, response.clone()).then(function() {
      return response;
    });
  }).catch(function() {
    // Caching is best-effort for a live network response; never break online
    // navigation because storage is temporarily unavailable.
    return response;
  });
}

function cachedFallback(request) {
  // Script and stylesheet URLs are versioned with query strings. Match the
  // canonical cached asset when those query parameters are absent offline.
  return caches.match(request, { ignoreSearch: true }).then(function(cached) {
    return cached || Response.error();
  });
}

self.addEventListener("fetch", function(event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }
  if (url.origin !== self.location.origin) {
    var offlineExternal = BC_OFFLINE_EXTERNAL.some(function(assetUrl) {
      var expected = new URL(assetUrl);
      return url.origin === expected.origin && url.pathname === expected.pathname;
    });
    if (!offlineExternal) return;
    event.respondWith(caches.match(request, { ignoreSearch: true }).then(function(cached) {
      if (cached) return cached;
      // The install gate normally prepopulates this pinned asset. Online fallback
      // keeps recovery possible if browser storage was cleared while connected.
      return fetch(request);
    }));
    return;
  }

  if (isAppShellRequest(url)) {
    // Navigation requests use mode "navigate"; reconstructing them with a different cache mode can throw before respondWith is registered.
    // Preserve the original navigation request and bypass HTTP cache only for ordinary shell asset requests.
    var freshRequest = request.mode === "navigate" ? request : new Request(request, { cache: "no-store" });
    event.respondWith(fetch(freshRequest).then(function(response) {
      return cacheSuccessfulResponse(request, response);
    }).catch(function() {
      return cachedFallback(request);
    }));
    return;
  }

  event.respondWith(caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      return cacheSuccessfulResponse(request, response);
    });
  }));
});

self.addEventListener("message", function(event) {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data.type === "CLAIM_CLIENT" && event.waitUntil) {
    event.waitUntil(self.clients.claim());
  }
});
