// BattleCruiser Service Worker v119 — app v9.2.56
// Objetivo: no servir pantallas/versiones antiguas cuando la red es lenta o intermitente.
// Estrategia: Network-First con timeout más generoso; caché solo como último recurso real.
const BC_VERSION = "9.2.56";
const CACHE_NAME = "battlecruiser-shell-v119";
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
  "./js/ui-layout-inteligente.js","./js/ui-usuarios-dashboard.js","./js/ui-operaciones-hub.js",
  "./js/ui-ajustes-panel.js","./js/hide-config-tab.js","./js/alta-usuario-sin-email.js",
  "./js/permisos-navegacion.js","./js/ui-visual-salon.js",
  "./js/mando.js","./js/reportes.js","./js/nucleo-operativo.js","./js/operacion-humana.js",
  "./js/ciclos.js","./js/m18-ciclos-ux.js","./js/comunicacion.js","./js/panel-contextual.js",
  "./js/aprobaciones-admin.js","./js/operaciones-financieras.js",
  "./js/m26-ui-integridad.js","./js/sesiones-operativas-ui.js",
  "./js/manifest.json","./favicon.png",
  "./icons/favicon-48x48.png","./icons/icon-192x192.png","./icons/icon-512x512.png",
  "./icons/icon-maskable-512x512.png","./icons/icon.svg"
];
const CDN_FILES = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];

// Timeouts más generosos: 3s provocaba fallback a caché en redes intermitentes.
const TIMEOUT_DOC = 8000;
const TIMEOUT_ASSET = 7000;
const TIMEOUT_API = 6000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (c) => {
      for (const u of [...SHELL_FILES, ...CDN_FILES]) {
        try {
          await c.add(u);
        } catch (err) {
          console.warn("[BattleCruiser SW] precache omitido", u, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((n) => {
          // Borrar cualquier caché antigua de BattleCruiser (no solo shell-)
          if (n !== CACHE_NAME && (n.startsWith("battlecruiser-shell-") || n.startsWith("battlecruiser"))) {
            return caches.delete(n);
          }
          return undefined;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = req.url;

  // CDN: cache-first (estable)
  if (CDN_FILES.includes(url)) {
    e.respondWith(caches.match(req).then((c) => c || fetch(req)));
    return;
  }

  // API Supabase: solo red (sin caché de respuestas)
  if (url.includes("supabase.co")) {
    e.respondWith(
      req.method === "GET"
        ? fetchWithTimeout(req, TIMEOUT_API).catch(() => fetch(req))
        : fetch(req)
    );
    return;
  }

  const isDoc =
    req.destination === "document" ||
    req.mode === "navigate" ||
    url.includes("/index.html") ||
    /\/public\/?(\?|$)/.test(url);

  if (isDoc) {
    // Navegación: Network-First con timeout generoso.
    // Solo usar caché si la red falla de verdad (no por un timeout corto).
    e.respondWith(
      networkFirst(req, TIMEOUT_DOC, async () => {
        const cached = await caches.match("./index.html");
        return cached || caches.match(req);
      })
    );
    return;
  }

  // Assets estáticos (JS/CSS/img): Network-First, actualizar caché si llega bien.
  e.respondWith(
    networkFirst(req, TIMEOUT_ASSET, async () => {
      const cache = await caches.open(CACHE_NAME);
      return cache.match(req);
    }).then(async (res) => {
      if (res && res.ok && req.method === "GET") {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
  );
});

/**
 * Intenta red con timeout. Si falla, usa el fallback (caché).
 * Evita que un timeout de 3s en red lenta sirva UI antigua.
 */
function networkFirst(request, ms, fallbackFn) {
  return fetchWithTimeout(request, ms)
    .then((res) => {
      if (res && res.ok) return res;
      // Respuesta no OK → intentar fallback
      return fallbackFn().then((c) => c || res);
    })
    .catch(() => fallbackFn().then((c) => c || Response.error()));
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request)
      .then((x) => {
        clearTimeout(t);
        resolve(x);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}
