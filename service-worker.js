// Subir este número cada vez que cambie algo del "shell" propio de la app.
const CACHE_NAME = "battlecruiser-shell-v3";

// Archivos propios de la app: cambian con cada versión.
const SHELL_FILES = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
];

// Librerías externas de CDN con versión fija en la URL: nunca cambian para esa
// URL exacta -> cache-first. Si se actualiza la versión, agregar la URL nueva acá
// (no editar la de arriba "a mano" sin cambiar el número de versión en el HTML).
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
          // Solo borrar cachés viejos DE ESTA APP (mismo prefijo), nunca tocar
          // otros cachés que puedan existir por otra razón.
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

  // Librerías de CDN versionadas: cache-first, nunca cambian para esa URL exacta.
  if (CDN_FILES.includes(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Llamadas a la API de Supabase: siempre red, con timeout corto para no
  // dejar la pantalla colgada si hay wifi conectado pero sin internet real.
  if (url.includes("supabase.co")) {
    event.respondWith(fetchWithTimeout(request, 1200));
    return;
  }

  // Shell propio (index.html/style.css/app.js/manifest.json): Sesión 14 —
  // cambiado de "stale-while-revalidate" a "network-first". Antes, si ya había
  // algo en caché, se devolvía ESO PRIMERO siempre y recién se actualizaba el
  // caché en segundo plano para la PRÓXIMA carga — es decir, cada vez que se
  // subía una versión nueva a GitHub/Cloudflare, la primera vez que se abría
  // la app después de eso todavía se veía la versión vieja (a veces con un
  // desfase entre archivos: un index.html nuevo con un app.js viejo, o al
  // revés), lo que rompía botones nuevos como "Cambiar contraseña" de forma
  // silenciosa. Ahora se intenta la red primero (con timeout corto) y solo se
  // usa el caché si no hay conexión real — así el shell nunca queda
  // desincronizado entre sí, y ya no hace falta tocar "Actualizar app" a mano
  // después de cada despliegue para ver lo último.
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
