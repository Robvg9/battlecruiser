/* BattleCruiser Service Worker — v9.5.34
 * App shell: network-first with a versioned offline cache fallback.
 * Core shell assets must be cached at install; same-origin JS/CSS/HTML
 * assets are refreshed on successful network reads for later offline use.
 */
var BC_SW_VERSION = "9.5.34";
var BC_SHELL = "battlecruiser-shell-" + BC_SW_VERSION;
var BC_STATIC = "battlecruiser-static-" + BC_SW_VERSION;
var PRECACHE_SHELL = ["./", "./index.html", "./app.js", "./style.css", "./js/offline.js", "./js/mi-cuenta.js?v=1.2", "./js/hotfix-configuracion-20260902.js?v=20261020.4", "./js/network-core.js?v=20261020.4", "./js/configuracion.js?v=20261023.2", "./js/bc7-jornada-ui.js?v=7.5", "./js/operacion-humana.js?v=20261024.1", "./js/hotfix-turno-forceclose-20260902.js?v=20261026.1", "./js/configuracion-ajustes-migrados-20260903.js?v=9.1", "./js/hotfix-secciones-visibles-20260903.js?v=20261026.1", "./js/m74-pos-archive-retail.js?v=74.6", "./js/turno-api.js?v=9.4.7", "./js/turnos-maestro.js?v=9.4.3", "./js/m29-turnos-organizacion.js?v=29.15", "./js/m33-turnos-final.js?v=33.9", "./js/m54-movimientos-client-bridge.js?v=54.1", "./js/m51-movimientos-centro.js?v=51.3", "./js/m52-movimientos-auth-retry.js?v=52.2", "./js/hotfix-16-5-movimientos-operaciones-flotantes-20260902.js?v=16.8"];
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
