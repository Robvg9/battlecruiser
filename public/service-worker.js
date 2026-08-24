// BattleCruiser Service Worker v122 — app v9.2.79
// Objetivo: evitar ERR_FAILED por un fallback vacío del Service Worker.
// Estrategia: network-first; caché como fallback; si no existe caché, respuesta offline válida.
const BC_VERSION = "9.2.79";
const CACHE_NAME = "battlecruiser-shell-v122";
const SHELL_FILES = [
  "./index.html","./style.css","./app.js",
  "./js/core.js","./js/auth.js","./js/offline.js","./js/online-offline-guard.js","./js/loading-guard.js",
  "./js/historial-detalle.js","./js/historiales-premium.js","./js/compra-multiple.js","./js/compra-vale-style.js",
  "./js/movimiento-multiple.js","./js/inventario-detalle.js","./js/runtime-guards.js","./style-historiales.css",
  "./js/centro-control.js","./js/navegacion.js","./js/ciclos-unificacion.js",
  "./js/productos.js","./js/presentaciones.js","./js/almacenes.js","./js/transferencias.js","./js/vales.js",
  "./js/ventas.js","./js/venta-turno-ui.js","./js/catalogos.js","./js/catalogos-core.js",
  "./js/configuracion.js","./js/ui-revision-2026-08.js","./js/catalogo-avanzado.js",
  "./js/usuarios-permisos.js","./js/usuarios-permisos-rest.js","./js/roles-en-usuarios.js","./js/fix-permisos-rol.js",
  "./js/fix-permisos-carga.js",
  "./js/ui-layout-inteligente.js","./js/ui-usuarios-dashboard.js","./js/ui-operaciones-hub.js",
  "./js/ui-ajustes-panel.js","./js/hide-config-tab.js","./js/alta-usuario-sin-email.js",
  "./js/permisos-navegacion.js","./js/ui-visual-salon.js",
  "./js/mando.js","./js/reportes.js","./js/nucleo-operativo.js","./js/operacion-humana.js",
  "./js/ciclos.js","./js/m18-ciclos-ux.js","./js/m22-sesiones-en-m21.js","./js/m22-fe-patches-m21.js",
  "./js/comunicacion.js","./js/panel-contextual.js",
  "./js/aprobaciones-admin.js","./js/operaciones-financieras.js",
  "./js/m26-ui-integridad.js","./js/m26-ventas-ux.js","./js/sesiones-operativas-ui.js",
  "./favicon.png","./manifest.json",
  "./icons/favicon-48x48.png","./icons/icon-192x192.png","./icons/icon-512x512.png",
  "./icons/icon-maskable-512x512.png","./icons/icon.svg"
];
const CDN_FILES = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];
const TIMEOUT_DOC = 10000;
const TIMEOUT_ASSET = 8000;
const TIMEOUT_API = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled([...SHELL_FILES, ...CDN_FILES].map((url) =>
      withTimeout(cache.add(url), 10000).catch((err) => {
        console.warn("[BattleCruiser SW] precache omitido", url, err);
      })
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if (name !== CACHE_NAME && (name.startsWith("battlecruiser-shell-") || name.startsWith("battlecruiser"))) {
        return caches.delete(name);
      }
      return undefined;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (typeof event.passThroughOnException === "function") event.passThroughOnException();

  const request = event.request;
  const url = request.url;

  if (CDN_FILES.includes(url)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  if (url.includes("supabase.co")) {
    event.respondWith(
      request.method === "GET"
        ? fetchWithTimeout(request, TIMEOUT_API).catch(() => fetch(request))
        : fetch(request)
    );
    return;
  }

  const isDocument = request.destination === "document" || request.mode === "navigate" || url.includes("/index.html");

  if (isDocument) {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  event.respondWith(
    networkFirstAsset(request).catch(() => caches.match(request))
  );
});

async function networkFirstDocument(request) {
  try {
    const response = await fetchWithTimeout(request, TIMEOUT_DOC);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put("./index.html", response.clone()).catch(() => {});
      return response;
    }
  } catch (_) {}

  const cached = await caches.match("./index.html") || await caches.match(request);
  if (cached) return cached;

  return new Response(
    "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>BattleCruiser</title><body style=\"font-family:system-ui;padding:24px\"><h2>BattleCruiser</h2><p>Sin conexión temporal. Vuelve a cargar cuando haya conexión.</p></body>",
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

async function networkFirstAsset(request) {
  const response = await fetchWithTimeout(request, TIMEOUT_ASSET);
  if (response && response.ok && request.method === "GET") {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

function fetchWithTimeout(request, ms) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}
