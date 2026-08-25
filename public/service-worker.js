/* BattleCruiser Service Worker — v9.2.99 / stable shell
 * M27.2 disabled after regression; M24.3 multi-day session assignment + immediate refresh.
 * Network-first for app shell assets; JS/CSS/HTML fetched with no-store to avoid stale modules.
 */
var BC_SW_VERSION = "9.2.99";
var BC_SHELL = "battlecruiser-shell-" + BC_SW_VERSION;
var BC_STATIC = "battlecruiser-static-" + BC_SW_VERSION;

var PRECACHE_STATIC = [
  "./manifest.json",
  "./favicon.png",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png"
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
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf("battlecruiser") === 0 && k !== BC_SHELL && k !== BC_STATIC;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isAppShellRequest(url) {
  var path = url.pathname || "";
  return path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".html") || path === "/" || path.endsWith("/index.html") || path.endsWith("/");
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (isAppShellRequest(url)) {
    // Force a fresh network read for app shell code so an updated module is not
    // hidden behind the browser's HTTP cache when its query string is unchanged.
    var freshReq = new Request(req, { cache: "no-store" });
    event.respondWith(fetch(freshReq).catch(function () {
      return caches.match(req).then(function (cached) { return cached || Response.error(); });
    }));
    return;
  }

  event.respondWith(caches.match(req).then(function (cached) {
    if (cached) return cached;
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var clone = res.clone();
        caches.open(BC_STATIC).then(function (c) { c.put(req, clone); });
      }
      return res;
    });
  }));
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
