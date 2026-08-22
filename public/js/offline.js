// ==== Battlecruiser · js/offline.js ====
// Capa offline: IndexedDB (cache de lecturas + cola de operaciones pendientes), ejecutarOperacion, sincronizarCola, panel de pendientes, detección de conectividad real e indicador de conexión.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)
// Misión 4.4: resetLoadingOverlay + withLoading + sondearBackend + marcas de conectividad en ejecutarOperacion/sincronizarCola.

// pero sin salida real (portal cautivo, router sin Internet, etc.).
const IDB_NAME = "battlecruiser-cache";
const IDB_VERSION = 3;
const IDB_STORE = "lecturas";
const IDB_OPS_STORE = "operaciones_pendientes";

const IDB_OPS_IDX_USUARIO = "usuario_id";

let _idbConexion = null;

function idbAbrir() {
  if (_idbConexion) return _idbConexion;
  _idbConexion = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("IndexedDB no disponible en este navegador")); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "clave" });
      }
      // El object store de la cola offline puede ya existir (migración
      let opsStore;
      if (!db.objectStoreNames.contains(IDB_OPS_STORE)) {
        // Instalación nueva (o base que todavía no tenía la cola): se crea
        opsStore = db.createObjectStore(IDB_OPS_STORE, { keyPath: "id" });
        opsStore.createIndex("estado", "estado", { unique: false });
        opsStore.createIndex("creado_en", "creado_en", { unique: false });
      } else {
        // Migración v2 -> v3: el store ya existe. Se recupera su handle
        opsStore = req.transaction.objectStore(IDB_OPS_STORE);
      }
      if (!opsStore.indexNames.contains(IDB_OPS_IDX_USUARIO)) {
        opsStore.createIndex(IDB_OPS_IDX_USUARIO, IDB_OPS_IDX_USUARIO, { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Si otra pestaña/ventana necesita subir la versión de la base, esta
      db.onversionchange = () => {
        db.close();
        _idbConexion = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      _idbConexion = null; // no cachear un intento fallido: reintentar la próxima vez
      reject(req.error);
    };
  });
  return _idbConexion;
}

function claveCacheUsuario(clave) {
  const uid = usuarioIdParaCola();
  return uid ? uid + "::" + clave : clave;
}

async function idbGet(clave) {
  const claveUsuario = claveCacheUsuario(clave);
  try {
    const db = await idbAbrir();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(claveUsuario);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo leer de IndexedDB ('" + clave + "'):", e);
    return null;
  }
}

async function idbSet(clave, datos) {
  const claveUsuario = claveCacheUsuario(clave);
  try {
    const db = await idbAbrir();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put({ clave: claveUsuario, datos, actualizado: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo guardar en IndexedDB ('" + clave + "'):", e);
  }
}

const _estadoCacheClaves = {};

// Claves que este dispositivo cachea para lectura offline (Etapa A). Se usa
// para el tooltip de "última actualización" del indicador — "asociaciones:*"
// queda afuera porque son dinámicas por producto, no una lista fija.
const CLAVES_CACHE_PRINCIPALES = ["productos", "categorias", "unidades", "almacenes", "stock", "presentaciones"];

function esRpcFaltante(error) {
  const msg = String((error && (error.message || error.code)) || error || "");
  return msg.includes("Could not find") || msg.includes("42883");
}

function esErrorDeRed(error) {
  const msg = ((error && error.message) || "").toLowerCase();
  return !navigator.onLine
    || msg.includes("failed to fetch")
    || msg.includes("fetch failed")
    || msg.includes("networkerror")
    || msg.includes("network request failed")
    || msg.includes("load failed")
    || msg.includes("timeout")
    || msg.includes("err_internet_disconnected")
    || msg.includes("err_network");
}

let _conectividadReal = null; // null = todavía no se resolvió ninguna consulta real esta sesión

function marcarConectividadReal(estado) {
  if (_conectividadReal === estado) return;
  _conectividadReal = estado;
  actualizarIndicadorConexion();
}

// Diferencia entre:
function estaRealmenteDesconectado() {
  // Si el dispositivo no tiene conexión, estamos offline
  if (!navigator.onLine) return true;
  // Si el dispositivo tiene conexión pero el backend es inaccesible, estamos "offline" desde el punto de vista de la app
  if (_conectividadReal === "offline") return true;
  // Si el dispositivo tiene conexión y el backend respondió al menos una vez, estamos online
  if (_conectividadReal === "online") return false;
  // Estado incierto: no se ha resuelto ninguna consulta real aún, pero el dispositivo tiene conexión
  // En este caso, no consideramos que estamos desconectados (para no mostrar "Sin conexión" prematuramente)
  return false;
}

// Devuelve true si el dispositivo tiene conexión pero el backend es inaccesible
function estaBackendInaccesible() {
  return navigator.onLine && _conectividadReal === "offline";
}

// Devuelve true si el dispositivo no tiene conexión
function estaDispositivoOffline() {
  return !navigator.onLine;
}

let loadingCount = 0;

function showLoading() {
  loadingCount++;
  if (loadingCount === 1) {
    let overlay = document.getElementById("global-loading-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "global-loading-overlay";
      overlay.className = "loading-overlay";
      overlay.innerHTML = "<div class=\"spinner\"></div>";
      document.body.appendChild(overlay);
    }
    overlay.classList.add("visible");
  }
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    const overlay = document.getElementById("global-loading-overlay");
    if (overlay) {
      overlay.classList.remove("visible");
    }
  }
}

// Misión 4.4: fuerza cierre del overlay global (loadingCount desbalanceado).
function resetLoadingOverlay() {
  loadingCount = 0;
  const overlay = document.getElementById("global-loading-overlay");
  if (overlay) overlay.classList.remove("visible");
}

// Ejecuta fn async con overlay; garantiza hide aunque falle.
async function withLoading(fn) {
  showLoading();
  try {
    return await fn();
  } finally {
    hideLoading();
  }
}

// Sondeo real al backend (no basta navigator.onLine).
async function sondearBackend() {
  if (!navigator.onLine) {
    marcarConectividadReal("offline");
    return false;
  }
  try {
    const { error } = await client.auth.getUser();
    if (error && esErrorDeRed(error)) {
      marcarConectividadReal("offline");
      return false;
    }
    marcarConectividadReal("online");
    return true;
  } catch (e) {
    if (esErrorDeRed(e)) {
      marcarConectividadReal("offline");
      return false;
    }
    marcarConectividadReal("online");
    return true;
  }
}


// ---- Caché local de lectura (IndexedDB) — estado offline/online
async function leerDeCache(clave) {
  const cache = await idbGet(clave);
  if (!cache) {
    _estadoCacheClaves[clave] = "sin-cache";
    actualizarIndicadorConexion();
    return [];
  }
  const datos = cache.datos || [];
  _estadoCacheClaves[clave] = datos.length > 0 ? "cache-con-datos" : "cache-vacia";
  actualizarIndicadorConexion();
  return datos;
}

// Mensaje de "lista vacía" que distingue el caso (a) de arriba del caso de
function mensajeListaVacia(clave, mensajeBase) {
  if (_estadoCacheClaves[clave] === "sin-cache") {
    return "Sin conexión y todavía no se guardó nada de esto en este dispositivo. Abrí esta pantalla una vez con Internet y va a quedar disponible sin conexión la próxima vez.";
  }
  return mensajeBase;
}

// Envuelve una consulta a Supabase con caché local de solo lectura:
async function withCache(clave, consultaFn) {
  if (!navigator.onLine) {
    marcarConectividadReal("offline");
    return leerDeCache(clave);
  }

  try {
    const { data, error } = await consultaFn();
    if (error) {
      if (esErrorDeRed(error)) {
        marcarConectividadReal("offline");
        return leerDeCache(clave);
      }
      console.error("[Battlecruiser] Error cargando '" + clave + "':", error);
      // Llegó una respuesta real del servidor (aunque sea un error de
      // negocio, ej. un permiso denegado): eso confirma que la conexión
      // funciona de verdad, más allá de lo que diga navigator.onLine.
      marcarConectividadReal("online");
      // No es un problema de conexión: se trata como respuesta real del
      // servidor, no como estado de caché offline.
      _estadoCacheClaves[clave] = "servidor";
      actualizarIndicadorConexion();
      return [];
    }
    marcarConectividadReal("online");
    _estadoCacheClaves[clave] = "servidor";
    await idbSet(clave, data || []);
    actualizarIndicadorConexion();
    return data || [];
  } catch (e) {
    // Algunos errores de red (ej. el fetch subyacente rechazado por el
    // Service Worker) pueden llegar como excepción en vez de {error}.
    marcarConectividadReal("offline");
    return leerDeCache(clave);
  }
}

