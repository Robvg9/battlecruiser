/* BattleCruiser Service Worker — v9.2.88 / M26.12
 * Estrategia: network-first para JS/CSS/HTML (evita mezclar módulos viejos).
 * Cache solo de assets estáticos (iconos, manifest).
 * Al actualizar versión: skipWaiting + clientsClaim + borra caches viejos.
 */
var BC_SW_VERSION = "9.2.88";
var BC_SHELL = "battlecruiser-shell-" + BC_SW_VERSION;
var BC_STATIC = "battlecruiser-static-" + BC_SW_VERSION;

var PRECACHE_STATIC = [
  "./manifest.json",
  "./favicon.png",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(BC_STATIC).then(function (cache) {
      return cache.addAll(PRECACHE_STATIC).catch(function () {});
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return (
                (k.indexOf("battlecruiser") === 0 || k.indexOf("battlecruiser-shell-") === 0) &&
                k !== BC_SHELL &&
                k !== BC_STATIC
              );
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isAppShellRequest(url) {
  var path = url.pathname || "";
  if (path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".html")) return true;
  if (path === "/" || path.endsWith("/index.html") || path.endsWith("/")) return true;
  return false;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (isAppShellRequest(url)) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || Response.error();
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(BC_STATIC).then(function (c) {
            c.put(req, clone);
          });
        }
        return res;
      });
    })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
