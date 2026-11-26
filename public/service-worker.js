/* BattleCruiser Service Worker — v9.5.165
 * App shell: network-first with a versioned offline cache fallback.
 * Core shell assets must be cached at install; same-origin JS/CSS/HTML
 * assets are refreshed on successful network reads for later offline use.
 */
var BC_SW_VERSION = "9.5.165";
var BC_SHELL = "battlecruiser-shell-" + BC_SW_VERSION;
var BC_STATIC = "battlecruiser-static-" + BC_SW_VERSION;
var PRECACHE_SHELL = ["./","./index.html","./app.js?v=9.5.165","./style.css?v=9.5.165","./bc7-jornada-inventory-mobile.css?v=20261116.3","./js/offline.js?v=9.5.103","./js/centro-control.js?v=9.5.71","./js/mando.js?v=9.5.139","./js/inventario-auditoria.js?v=1.1","./js/comunicacion.js?v=9.5.65","./js/navegacion.js?v=9.5.65","./js/bc-modal-manager.js?v=1.0","./js/mi-cuenta.js?v=1.3","./js/permisos-navegacion.js?v=67.9","./js/m27-7-almacenes-modal.js?v=27.7f","./js/hotfix-configuracion-20260902.js?v=20261020.4","./js/core.js?v=9.5.117","./js/inventario-detalle.js?v=72","./js/operaciones-financieras.js?v=20261108.5","./js/aprobaciones-admin.js?v=20261124.1","./js/jornada-owner-review.js?v=1.19","./js/ui-operaciones-hub.js?v=43.5","./js/almacenes.js?v=20261126.2","./js/m53-inventario-centro.js?v=53.9","./js/nucleo-operativo.js?v=9.5.69","./js/transferencias.js?v=20261109.1","./js/vales.js?v=20261107.1","./js/reportes.js?v=20261105.1","./js/historial-detalle.js?v=h1.2","./js/mision-d-stock-reposicion.js?v=D.11","./js/ui-usuarios-dashboard.js?v=46.3","./js/m42-reportes-dashboard.js?v=42.2","./js/movimiento-multiple.js?v=20261121.2","./js/auth.js?v=9.5.120","./js/network-core.js?v=20261109.3","./js/ventas.js?v=20261105.2","./js/m68-ventas-pos-definitivo.js?v=9.5.165","./js/m55-productos-import.js?v=55.5","./js/productos.js?v=20261118.1","./js/presentaciones.js?v=20261105.2","./js/catalogos.js?v=20261106.1","./js/m26-ui-integridad.js?v=26.41","./js/m27-5-ventas-precio-politica.js?v=27.5b7","./js/m27-5-theme-dark-reset.js?v=27.5a3","./js/m27-6-ventas-presentaciones.js?v=27.6g","./js/m75-productos-ui-compacto.js?v=75.13","./js/venta-turno-ui.js?v=9.4.46","./js/m25-fe-sync-turno-ventas.js?v=25.1","./js/m27-6b-venta-payload-pres.js?v=27.6b2","./js/configuracion.js?v=20261104.1","./js/bc7-jornada-ui.js?v=7.67","./js/bc7-periodo-apertura-ui.js?v=1.8","./js/operacion-humana.js?v=9.5.65","./js/hotfix-turno-forceclose-20260902.js?v=20261030.1","./js/configuracion-ajustes-migrados-20260903.js?v=9.2","./js/hotfix-secciones-visibles-20260903.js?v=20261030.1","./js/hotfix-pulido-20260903.js?v=20261105.4","./js/hotfix-17-2-productos-save-20260903.js?v=17.4","./js/hotfix-pulido-20260903b.js?v=20261105.2","./js/section-scope-fix.js?v=20261030.1","./js/m26-11-offline-shell-guard.js?v=20261030.1","./js/hotfix-17-final-loader-20260903.js?v=20261030.2","./js/hotfix-17-13-configuracion-admin-visible-20260903.js?v=20261030.3","./js/m74-pos-archive-retail.js?v=74.6","./js/turno-api.js?v=9.4.8","./js/turnos-maestro.js?v=9.4.9","./js/m29-turnos-organizacion.js?v=29.22","./js/m33-turnos-final.js?v=33.21","./js/bc7-legacy-history.js?v=1.0","./js/m22-sesiones-en-m21.js?v=25.5","./js/m49-turnos-layout-definitivo.js?v=49.6","./js/hotfix-regresiones-20260902.js?v=20261120.2","./js/hotfix-17-4-turnos-tarde-visible-20260903.js?v=17.5","./js/m56-turnos-secuencia-ui.js?v=56.8","./js/m57-turnos-sesion-ux-fix.js?v=57.6","./js/turno-cash-handover-ui.js?v=1.4","./js/m54-movimientos-client-bridge.js?v=54.1","./js/m51-movimientos-centro.js?v=51.10","./js/m52-movimientos-auth-retry.js?v=52.2","./js/compra-multiple.js?v=27.17","./js/hotfix-16-5-movimientos-operaciones-flotantes-20260902.js?v=16.13","./js/m76-movimientos-operaciones.js?v=76.3","./js/product-select-search.js?v=2.3","./js/bajas-multiple.js?v=1.8","./js/bc-product-card-edit.js?v=1.1","./js/bc-owner-quick-actions.js?v=1.1","./js/jornada-price-changes.js?v=1.0.4","./js/turno-runtime-contract-fix.js?v=9.4.1","./js/cache-update-fix.js?v=1.1","./js/usuarios-permisos-rest.js?v=60.2","./js/fix-permisos-rol.js?v=60.2","./js/m12-fe5-hide-vales.js?v=60.1","./js/sync-race-fix.js?v=1.0","./js/online-offline-guard.js","./js/sesiones-operativas-ui.js?v=31.1","./js/ui-visual-salon.js?v=54.2","./js/roles-en-usuarios.js?v=33.7","./js/ui-layout-inteligente.js?v=33.1","./js/alta-usuario-sin-email.js?v=46.2","./js/m22-fe-patches-m21.js?v=22.1","./js/m23-fe-almacenes-turnos.js?v=23.1","./js/m23-1-fe-dinero-icono.js?v=23.2","./js/m24-asignaciones-operativas.js?v=24.4","./js/m24-2-asignar-sesion-ui.js?v=24.6","./js/m24-2-asignaciones-selects-repair.js?v=24.5","./js/m26-ventas-ux.js?v=26.5","./js/m26-6-stock-cart-patch.js?v=26.6","./js/m26-7-ventas-repair.js?v=26.7","./js/m26-8-ventas-cart-confirm.js?v=26.8","./js/m26-9-data-truth.js?v=26.9b5","./js/m26-10-categorias-ventas.js?v=26.10","./js/m26-12-comunicacion-whatsapp.js?v=26.12","./js/m26-13-comunicacion-ux.js?v=26.13","./js/m26-15-comunicacion-layout.js?v=26.15b","./js/fix-permisos-carga.js?v=26.18","./js/sesion-navegacion-reset.js?v=26.11","./js/m27-3-fe-cierre-entrega.js?v=m27-3b10","./js/m27-4-restriccion-turnos-asignados.js?v=27.4","./js/mision-c-tipos-almacen.js?v=C.1","./js/mision-c-editar-tipo-almacen-modal.js?v=C.2b","./js/m-f8-trf-selects-preserve.js?v=F8.1","./js/m-f9-turnos-integrity.js?v=F9.1","./js/m-f12-f17-ui-layout.js?v=F12.1","./js/m28-usuarios-archivado.js?v=28.2","./js/m28-ajustes-archivados.js?v=28.2","./js/m31-turno-asignaciones.js?v=31.2","./js/m34-turnos-filter-final.js?v=34.3","./js/m35-turnos-asignaciones-fix.js?v=35.2","./js/m36-turnos-asignaciones-offline.js?v=36.2","./js/m38-productos-cards.js?v=38.2","./js/m43-productos-layout-fix.js?v=43.3","./js/m44-productos-vistas.js?v=44.5","./js/m45-reportes-ux-final.js?v=45.2","./js/m47-productos-vista-final.js?v=47.5","./js/m50-turno-step1-order.js?v=50.4","./js/p0a-local-reads.js?v=p0a.1","./js/hotfix-inventario-inmediato-20260902.js?v=20260902.1","./js/hotfix-integracion-final-20260902.js?v=20260902.1","./js/hotfix-14-regresiones-20260902.js?v=14.2","./js/bc14-ventas-stock.js?v=2.1","./js/hotfix-17-1-productos-import-flow-20260903.js?v=17.1.1","./js/hotfix-17-3-product-edit-modal-20260903.js?v=17.3","./js/hotfix-17-5-compra-modal-controls-20260903.js?v=17.7","./js/hotfix-17-6-presentaciones-visible-20260903.js?v=17.7","./js/hotfix-pulido-20260903c.js?v=20260903.3","./js/hotfix-pulido-20260903d.js?v=20261103.1","./js/m73-reportes-ux-modal.js?v=73.2","./js/password-recovery-admin.js?v=1.0","./js/loading-guard.js","./js/usuarios-permisos.js?v=9.5.165","./js/ciclos.js","./js/m18-ciclos-ux.js","./js/offline-auth.js?v=1.1","./js/preview-guard.js?v=1.0"];
var PRECACHE_STATIC = ["./manifest.json", "./favicon.png", "./icons/icon-192x192.png", "./icons/icon-512x512.png"];
// The UMD Supabase client is a required runtime dependency, so cache this pinned public CDN asset for offline boot.
var BC_OFFLINE_EXTERNAL = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js"];

function precacheLocalAssets(cache, assetUrls) {
  return Promise.all(assetUrls.map(function(assetUrl) {
    var absoluteUrl = new URL(assetUrl, self.location.href).toString();
    // cache.addAll() may reuse a stale browser HTTP-cache response for index.html.
    // Fetch each exact release asset with no-store, then write those bytes to this
    // release's named Cache Storage bucket.
    var request = new Request(absoluteUrl, {
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store"
    });
    return fetch(request).then(function(response) {
      if (!response || !response.ok) {
        throw new Error("Failed to precache required app asset: " + assetUrl);
      }
      return cache.put(request, response.clone());
    });
  }));
}

self.addEventListener("install", function(event) {
  // Keep a new release waiting until the user explicitly finishes the current page.
  event.waitUntil(caches.open(BC_STATIC).then(function(cache) {
    // Do not silently swallow a failed shell precache: an incomplete install
    // must not replace a working Service Worker with an offline-broken one.
    return precacheLocalAssets(cache, PRECACHE_SHELL.concat(PRECACHE_STATIC)).then(function() {
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

// A first installation has no previous application release to protect. Claiming
// that initial document is safe and required for offline navigation. During an
// update, an older release cache exists, so the new worker must NOT take over
// already-open documents; they stay on their current controller until reload.
self.addEventListener("activate", function(event) {
  event.waitUntil(caches.keys().then(function(keys) {
    var previousReleaseCacheExists = keys.some(function(key) {
      return key.indexOf("battlecruiser") === 0 && key !== BC_SHELL && key !== BC_STATIC;
    });
    if (!previousReleaseCacheExists) return self.clients.claim();
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

function isVersionedStaticAsset(url) {
  var path = url.pathname || "";
  return (path.endsWith(".js") || path.endsWith(".css")) &&
    url.searchParams.has("v");
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
  // Match the exact versioned request first. Never use ignoreSearch here:
  // doing so can return a different release's bytes for the same pathname.
  return caches.open(BC_STATIC).then(function(cache) {
    return cache.match(request).then(function(exact) {
      if (exact) return exact;

      var url;
      try {
        url = new URL(request.url);
      } catch (error) {
        return Response.error();
      }

      // Legacy unversioned URLs may use a fallback only when this release cache
      // contains exactly one candidate for that pathname. An explicit query
      // string is an immutable version request and must never fall back.
      if (url.search) return Response.error();

      return cache.keys().then(function(keys) {
        var candidates = keys.filter(function(key) {
          try {
            var candidate = new URL(key.url);
            return candidate.origin === url.origin && candidate.pathname === url.pathname;
          } catch (error) {
            return false;
          }
        });
        if (candidates.length !== 1) return Response.error();
        return cache.match(candidates[0]).then(function(candidate) {
          return candidate || Response.error();
        });
      });
    });
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
    event.respondWith(caches.open(BC_STATIC).then(function(cache) {
      return cache.match(request);
    }).then(function(cached) {
      if (cached) return cached;
      // The install gate normally prepopulates this exact pinned asset. Online
      // fallback keeps recovery possible if browser storage was cleared.
      return fetch(request);
    }));
    return;
  }

  if (isAppShellRequest(url)) {
    if (isVersionedStaticAsset(url)) {
      // A versioned JS/CSS URL is immutable for this release cache. The new
      // release gets a fresh BC_STATIC bucket and precaches these exact URLs,
      // so warm navigations should not revalidate 100+ modules over the network.
      event.respondWith(caches.open(BC_STATIC).then(function(cache) {
        return cache.match(request);
      }).then(function(cached) {
        if (cached) return cached;
        return fetch(new Request(request, { cache: "no-store" })).then(function(response) {
          return cacheSuccessfulResponse(request, response);
        }).catch(function() {
          return cachedFallback(request);
        });
      }).catch(function() {
        // If Cache Storage is unavailable, preserve online loading.
        return fetch(new Request(request, { cache: "no-store" }));
      }));
      return;
    }

    var freshRequest;
    if (request.mode === "navigate") {
      // A navigation Request has mode "navigate" and cannot be cloned with a new
      // cache mode. Rebuild it as same-origin GET while preserving its Accept
      // headers/cookies, so an older browser HTTP-cached index.html cannot win.
      var navigationHeaders = new Headers(request.headers);
      navigationHeaders.set("cache-control", "no-cache, no-store, max-age=0");
      navigationHeaders.set("pragma", "no-cache");
      freshRequest = new Request(request.url, {
        method: "GET",
        headers: navigationHeaders,
        mode: "same-origin",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "follow"
      });
    } else {
      freshRequest = new Request(request, { cache: "no-store" });
    }
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
  if (event.data.type === "BC_GET_VERSION") {
    var port = event.ports && event.ports[0];
    if (port) port.postMessage({ type: "BC_SW_VERSION", version: BC_SW_VERSION });
    return;
  }
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data.type === "PRUNE_OLD_RELEASES" && event.waitUntil) {
    event.waitUntil(Promise.resolve().then(function() {
      // The active old worker must never delete assets prepared for its waiting update.
      if (self.registration && (self.registration.installing || self.registration.waiting)) return;
      return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clients) {
        // Another open tab may still be running an older release.
        if (clients.length > 1) return;
        return caches.keys().then(function(keys) {
          return Promise.all(keys.filter(function(key) {
            return key.indexOf("battlecruiser") === 0 && key !== BC_SHELL && key !== BC_STATIC;
          }).map(function(key) {
            return caches.delete(key);
          }));
        });
      });
    }));
  }
});
