/* BattleCruiser Service Worker — v9.5.4
 * App shell: network-first with a versioned offline cache fallback.
 * Core shell assets must be cached at install; same-origin JS/CSS/HTML
 * assets are refreshed on successful network reads for later offline use.
 */
var BC_SW_VERSION = "9.5.4";
var BC_SHELL = "battlecruiser-shell-" + BC_SW_VERSION;
var BC_STATIC = "battlecruiser-static-" + BC_SW_VERSION;
var PRECACHE_SHELL = ["./", "./index.html", "./app.js", "./style.css", "./js/offline.js", "./js/mi-cuenta.js?v=1.1", "./js/hotfix-configuracion-20260902.js?v=20261020.3", "./js/network-core.js?v=20261020.3"];
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
    var freshRequest = new Request(request, { cache: "no-store" });
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
