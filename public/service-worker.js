// v51 — Login por nombre de usuario + contraseña
// v50 — Ciclos Operativos V1.1: estructura módulo ciclos.js
// v49 — Sesión 8: selector almacén al abrir turno (M14)
// v48 — Sesión 8: almacenes sin doble panel (selector → solo inline)
// v47 — Sesión 6: venta-turno-ui.js + restore index
// v46 — Sesión 6: ventas gobernadas por almacén del turno
// v45 — post-9.3: fix Ver todos + filtros T9
const CACHE_NAME = "battlecruiser-shell-v51";

const SHELL_FILES = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./js/core.js",
  "./js/auth.js",
  "./js/offline.js",
  "./js/centro-control.js",
  "./js/navegacion.js",
  "./js/productos.js",
  "./js/presentaciones.js",
  "./js/almacenes.js",
  "./js/transferencias.js",
  "./js/vales.js",
  "./js/ventas.js",
  "./js/venta-turno-ui.js",
  "./js/catalogos.js",
  "./js/configuracion.js",
  "./js/catalogo-avanzado.js",
  "./js/usuarios-permisos.js",
  "./js/mando.js",
  "./js/reportes.js",
  "./js/nucleo-operativo.js",
  "./js/operacion-humana.js",
  "./js/ciclos.js",
  "./js/comunicacion.js",
  "./js/panel-contextual.js",
  "./manifest.json",
  "./favicon.png",
  "./icons/favicon-48x48.png",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./icons/icon-maskable-512x512.png",
  "./icons/icon.svg",
];

const CDN_FILES = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...SHELL_FILES, ...CDN_FILES]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (name.startsWith("battlecruiser-shell-") && name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  if (CDN_FILES.includes(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  if (url.includes("supabase.co")) {
    if (request.method === "GET") {
      event.respondWith(fetchWithTimeout(request, 4000));
    } else {
      event.respondWith(fetch(request));
    }
    return;
  }

  event.respondWith(
    fetchWithTimeout(request, 2500)
      .then((response) => {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request)))
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
