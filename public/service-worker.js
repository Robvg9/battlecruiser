// Subir este número cada vez que cambie algo del "shell" propio de la app.
// v21 — Misión B2: bump por la primera versión real de escrituras offline en
// app.js (ejecutarOperacion, sincronizarCola, conexión de compra/venta/
// transferencia/vale a la cola offline de la Misión B1). Este service worker
// en sí NO cambió de comportamiento: las escrituras (POST, incluidos los RPC
// de compra/venta/transferencia/vale) ya iban directo a la red sin timeout
// artificial (ver más abajo), que es justo lo que necesita ejecutarOperacion
// para poder distinguir un error de red real de una respuesta del servidor.
// v22 — Misión B2.1: bump porque app.js cambió comportamiento real (fix de la
// proyección local con presentaciones, recuperación de operaciones atrapadas
// en SINCRONIZANDO). Este service worker en sí tampoco cambió de
// comportamiento en esta misión — el bump es solo para que los dispositivos
// ya instalados bajen el app.js nuevo en vez de seguir sirviendo el viejo
// desde caché.
// v23 — Mision B2.3: bump por el Centro de Control Operacional en
// app.js/index.html/style.css (capa de lectura/accion sobre la cola
// Offline-First existente, sin segunda cola/caché/sincronizador). Este
// service worker en sí no cambió de comportamiento — el bump es para que
// los dispositivos ya instalados bajen el app.js/index.html/style.css
// nuevos en vez de seguir sirviendo los viejos desde caché.
// v24 — Mision B3: bump por el sistema operacional de usuarios, roles,
// permisos y control (contexto de usuario, sidebar dinamico por permisos,
// administracion de usuarios). El SW en si no cambio de comportamiento.
// v25 — Mision B4: bump por el Centro de Mando + auditoria + trazabilidad
// (nueva pestana Centro de Mando, registro de auditoria, filtros). El SW
// en si no cambio de comportamiento.
// v26 — Mision B5: bump por Reportes y Analisis Operativo
// (nueva pestana Reportes con resumen, sub-reportes y filtros).
// v27 — Mision B6: bump por Nucleo Operativo + Inventario Inteligente
// (lotes/FIFO/costos/movimientos/compras/rentabilidad, nuevas pestanas
// Inventario y Movimientos, sub-reportes de compras/rentabilidad, columnas
// de costo en ventas_lineas, indicadores de inventario en Centro de Mando).
// v28 — Mision B7: bump por Operacion Humana (turnos, cuadres,
// responsabilidades, incidencias, aprobaciones; nuevas pestanas Turnos y
// Operacion; integracion en Centro de Mando).
// v29 — Mision B8: bump por Comunicacion y Coordinacion Operativa
// (conversaciones, mensajes, chat contextual, no leidos, soporte;
// nueva pestana Comunicacion; integracion en Centro de Mando).
// v33 — Misión 9.1: bump por app.js/index.html (fix estructural real en
// actualizarIndicadorConexion — estado D quedaba mal anidado dentro del
// bloque B con una rama vacía; texto Unicode corrupto visible en pantalla;
// flujo de creación de usuarios reparado: signUp con cliente efímero +
// nueva RPC crear_usuario_interno para no perder la sesión del admin y sí
// crear el perfil interno). El SW en sí no cambió de comportamiento — el
// bump es para que los dispositivos ya instalados bajen los archivos nuevos.
// v34 — Misión 9.2: bump por app.js/index.html/style.css — 3 bugs reales
// reportados por Robert en prueba física: (1) login sin try/finally podía
// dejar el loading infinito si signInWithPassword lanzaba una excepción de
// red real; (2) crear usuario tenía try/finally SIN catch — confirmado con
// logs reales de Supabase que /auth/v1/signup nunca se invocaba, la
// excepción se tragaba en silencio antes de llegar a signUp/RPC; también se
// corrigió cargarUsuarios() (no existía) por refrescarUsuarios(); (3)
// buscar producto en Ventas solo filtraba un <select> escondido sin ninguna
// señal visible — ahora muestra una lista clicable real. El SW en sí no
// cambió de comportamiento — el bump es para que los dispositivos ya
// instalados bajen los archivos nuevos.
// v37 — Misión 9.3, Tarea 2: bump por app.js/index.html/style.css — catálogo
// visual de productos en Ventas (tarjetas con imagen/nombre/precio/categoría,
// filtro por categoría real, toggle Buscador/Catálogo). No se creó un
// segundo sistema de ventas: el catálogo llama a la misma función que ya
// agregaba líneas al carrito (agregarLineaVenta, extraída del handler del
// buscador) y respeta almacén/stock/precio/permisos/offline igual que antes.
// El SW en sí no cambió de comportamiento — el bump es para que los
// dispositivos ya instalados bajen los archivos nuevos.
// v38 — Misión 9.3 Tarea 3B: gestión completa de Almacenes (selector,
// menú de acciones crear/editar/activar-desactivar, panel informativo y
// productos del almacén seleccionado). El SW en sí no cambió de
// comportamiento — el bump es para que los dispositivos ya instalados
// bajen los archivos nuevos.
// v39 — Misión 9.3 Tarea 6 — mejoras listado Productos
// v40 — Misión de modularización de public/app.js: el monolito se dividió
// en 18 módulos bajo public/js/ cargados como <script> clásicos en el
// mismo orden en que las secciones vivían en el archivo original (mismo
// scope global, cero cambios de comportamiento — la concatenación de los
// módulos es byte a byte idéntica al app.js anterior). app.js quedó como
// archivo pequeño / entrada final, sin lógica propia. El SW en sí no cambió
// de comportamiento — el bump es para que los dispositivos ya instalados
// bajen los archivos nuevos (y no queden mezclando el app.js viejo con el
// index.html nuevo, que ya no encontraría las funciones esperando en un solo
// archivo).
const CACHE_NAME = "battlecruiser-shell-v40";

// Archivos propios de la app: cambian con cada versión.
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
  "./js/catalogos.js",
  "./js/usuarios-permisos.js",
  "./js/mando.js",
  "./js/reportes.js",
  "./js/nucleo-operativo.js",
  "./js/operacion-humana.js",
  "./js/comunicacion.js",
  "./manifest.json",
  "./favicon.png",
  "./icons/favicon-48x48.png",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./icons/icon-maskable-512x512.png",
  "./icons/icon.svg",
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

  // Llamadas a la API de Supabase.
  // Sesión 15 — causa real de "Failed to fetch" al cambiar la contraseña:
  // ANTES esta regla aplicaba un timeout de apenas 1200ms a *toda* llamada a
  // supabase.co, incluyendo las de escritura (updateUser, RPC de compras/
  // transferencias/vales). Si la red tardaba un poco más que eso (celular con
  // señal floja, por ejemplo), la promesa se rechazaba y el navegador le
  // devolvía a la página un "Failed to fetch" genérico, aunque la operación
  // en el servidor pudiera haber sido perfectamente normal de estar un poco
  // más lenta. El timeout corto solo tiene sentido para LECTURAS (GET), donde
  // el objetivo es no dejar la pantalla colgada y poder mostrar el aviso de
  // "sin conexión" rápido. Las escrituras (POST/PATCH — login, cambiar
  // contraseña, registrar compra/transferencia/vale) van directo a la red,
  // sin ese timeout artificial.
  if (url.includes("supabase.co")) {
    if (request.method === "GET") {
      event.respondWith(fetchWithTimeout(request, 4000));
    } else {
      event.respondWith(fetch(request));
    }
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
