// ==== Battlecruiser · js/offline.js ====
// Capa offline: IndexedDB (cache de lecturas + cola de operaciones pendientes), ejecutarOperacion, sincronizarCola, panel de pendientes, detección de conectividad real e indicador de conexión.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

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
  // Any observed failure schedules queue recovery after the next confirmed backend response.
  if (estado !== "online") window.__BC_BACKEND_RECOVERY_PENDING__ = true;
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

// IndexedDB — eso lo hace guardarOperacionPendiente). "tipo" identifica qué
function crearOperacionPendiente(tipo, payload, idempotencyKeyExistente) {
  const ahora = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tipo,
    payload,
    usuario_id: _usuarioActualId,
    creado_en: ahora,
    actualizado_en: ahora,
    estado: "PENDIENTE",
    intentos: 0,
    ultimo_intento: null,
    ultimo_error: null,
    idempotency_key: idempotencyKeyExistente || crypto.randomUUID(),
  };
}

// Guarda (crea o reemplaza) una operación completa en la cola. No bloquea
async function guardarOperacionPendiente(operacion) {
  if (!operacion || !operacion.usuario_id) {
    console.warn(
      "[Battlecruiser] No se guarda operación pendiente sin usuario_id (huérfana). tipo=",
      operacion && operacion.tipo
    );
    return null;
  }
  try {
    const db = await idbAbrir();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readwrite");
      tx.objectStore(IDB_OPS_STORE).put(operacion);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    actualizarContadorColaPendiente();
    return operacion;
  } catch (e) {
    console.error("[Battlecruiser] No se pudo guardar la operación pendiente en la cola offline:", e);
    return null;
  }
}

function usuarioIdParaCola() {
  return _usuarioActualId;
}

// Trae una operación puntual por su id, o null si no existe / si falló la
// lectura (mismo criterio que idbGet: no lanzar, avisar y devolver vacío).
async function obtenerOperacionPendiente(id) {
  try {
    const db = await idbAbrir();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const req = tx.objectStore(IDB_OPS_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error("[Battlecruiser] No se pudo leer la operación pendiente '" + id + "':", e);
    return null;
  }
}

// Trae TODAS las operaciones guardadas, ordenadas de la más antigua a la
async function obtenerTodasLasOperaciones() {
  const uid = usuarioIdParaCola();
  if (!uid) return [];
  try {
    const db = await idbAbrir();
    const datos = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const req = tx.objectStore(IDB_OPS_STORE).index(IDB_OPS_IDX_USUARIO).getAll(uid);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return datos.sort((a, b) => (a.creado_en < b.creado_en ? -1 : a.creado_en > b.creado_en ? 1 : 0));
  } catch (e) {
    console.error("[Battlecruiser] No se pudieron leer las operaciones pendientes:", e);
    return [];
  }
}

// Trae solo las operaciones en un estado dado (ej. "PENDIENTE"), también en
// orden FIFO. Usa el índice "estado" del store en vez de traer todo y
// filtrar en JS.
async function obtenerOperacionesPorEstado(estado) {
  const uid = usuarioIdParaCola();
  if (!uid) return [];
  try {
    const db = await idbAbrir();
    const datos = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      // El índice compuesto no existe; se filtra por estado y luego por
      // usuario en memoria (el subconjunto por estado suele ser chico).
      const req = tx.objectStore(IDB_OPS_STORE).index("estado").getAll(estado);
      req.onsuccess = () => resolve((req.result || []).filter((op) => op.usuario_id === uid));
      req.onerror = () => reject(req.error);
    });
    return datos.sort((a, b) => (a.creado_en < b.creado_en ? -1 : a.creado_en > b.creado_en ? 1 : 0));
  } catch (e) {
    console.error("[Battlecruiser] No se pudieron leer las operaciones en estado '" + estado + "':", e);
    return [];
  }
}

// Actualiza una operación existente (ej. cambiar estado, sumar un intento,
async function actualizarOperacionPendiente(id, cambios) {
  try {
    const existente = await obtenerOperacionPendiente(id);
    if (!existente) {
      console.warn("[Battlecruiser] No se encontró la operación pendiente '" + id + "' para actualizar.");
      return null;
    }
    const actualizada = Object.assign({}, existente, cambios, {
      id: existente.id,
      idempotency_key: existente.idempotency_key,
      actualizado_en: new Date().toISOString(),
    });
    return await guardarOperacionPendiente(actualizada);
  } catch (e) {
    console.error("[Battlecruiser] No se pudo actualizar la operación pendiente '" + id + "':", e);
    return null;
  }
}

// Elimina una operación de la cola (ej. una vez confirmada SINCRONIZADA y
// ya no hace falta conservarla). No lanza si falla, solo avisa.
async function eliminarOperacionPendiente(id) {
  try {
    const db = await idbAbrir();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readwrite");
      tx.objectStore(IDB_OPS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    actualizarContadorColaPendiente();
    return true;
  } catch (e) {
    console.error("[Battlecruiser] No se pudo eliminar la operación pendiente '" + id + "':", e);
    return false;
  }
}

let _contadorColaRequestSeq = 0;

// El contador es una proyección UI, no una fuente de verdad. Varias escrituras
// fire-and-forget pueden disparar lecturas en paralelo; una respuesta antigua
// no puede sobrescribir el badge de otra sesión ni un recuento más reciente.
async function actualizarContadorColaPendiente() {
  const el = document.getElementById("cola-pendientes-badge");
  if (!el) return;
  const uid = usuarioIdParaCola();
  const requestSeq = ++_contadorColaRequestSeq;
  if (!uid) {
    el.classList.add("hidden");
    el.textContent = "";
    el.classList.remove("atencion");
    return;
  }
  try {
    const db = await idbAbrir();
    // Otro login/logout o una actualización más reciente puede haber ocurrido
    // mientras IndexedDB abría la conexión.
    if (usuarioIdParaCola() !== uid || requestSeq !== _contadorColaRequestSeq) return;

    const { pendientes, atencion } = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      // No hay índice compuesto [usuario_id, estado]: se trae por usuario_id
      // y se cuenta por estado en memoria (subconjunto pequeño por usuario).
      const req = tx.objectStore(IDB_OPS_STORE).index(IDB_OPS_IDX_USUARIO).getAll(uid);
      req.onsuccess = () => {
        const ops = req.result || [];
        const pendientes = ops.filter((o) => o.estado === "PENDIENTE" || o.estado === "SINCRONIZANDO").length;
        const atencion = ops.filter((o) => o.estado === "REQUIERE_ATENCION").length;
        resolve({ pendientes, atencion });
      };
      tx.onerror = () => reject(tx.error);
    });

    // Do not let an old read finish late and repaint another user's badge or
    // overwrite a newer count for the same user.
    if (usuarioIdParaCola() !== uid || requestSeq !== _contadorColaRequestSeq) return;

    if (pendientes === 0 && atencion === 0) {
      el.classList.add("hidden");
      el.classList.remove("atencion");
      el.textContent = "";
      return;
    }
    const partes = [];
    if (pendientes > 0) {
      partes.push("🔄 " + pendientes + (pendientes === 1 ? " pendiente" : " pendientes"));
    }
    if (atencion > 0) {
      partes.push("⚠ " + atencion + (atencion === 1 ? " requiere atención" : " requieren atención"));
    }
    el.textContent = partes.join(" · ");
    el.classList.toggle("atencion", atencion > 0);
    el.classList.remove("hidden");
    var tabPendientes = document.getElementById("tab-pendientes");
    if (tabPendientes && tabPendientes.classList.contains("visible")) {
      refrescarPanelPendientes();
    }
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo actualizar el contador de la cola pendiente:", e);
  }
}

// para la proyección de stock y excluye REQUIERE_ATENCION a propósito).
const ETIQUETA_TIPO_OP = {
  compra: "Compra",
  venta: "Venta",
  venta_jornada: "Venta de Jornada",
  transferencia: "Transferencia",
  vale: "Vale de salida",
  producto: "Creación de producto",
  producto_actualizar: "Edición de producto",
  producto_estado: "Cambio de estado de producto",
  turno: "Apertura de turno",
  turno_cerrar: "Cierre de turno",
  cuadre: "Cuadre",
  cuadre_revisar: "Revisión de cuadre",
  responsabilidad: "Responsabilidad",
  responsabilidad_actualizar: "Actualización de responsabilidad",
  incidencia: "Incidencia",
  incidencia_resolver: "Resolución de incidencia",
  mensaje: "Mensaje",
  conversacion: "Conversación",
  almacen: "Creación de almacén",
  almacen_actualizar: "Edición de almacén",
  almacen_estado: "Cambio de estado de almacén",
};

// Resumen legible de una operación, armado a partir de su payload (los
function resumenOperacionPendiente(op) {
  const p = (op && op.payload) || {};
  switch (op && op.tipo) {
    case "compra": {
      const cant = p.p_presentacion_id
        ? (Number(p.p_cantidad_presentacion) || 0) + " presentación(es)"
        : (Number(p.p_cantidad) || 0) + " unidades";
      const costo = Number(p.p_costo_unitario);
      return "Entrada de stock · " + cant + (Number.isFinite(costo) ? " · $" + money(costo) + " c/u" : "");
    }
    case "venta_jornada":
    case "venta": {
      const lineas = Array.isArray(p.p_lineas) ? p.p_lineas : [];
      const totalUnidades = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
      return lineas.length + " línea(s) · " + totalUnidades + " unidades";
    }
    case "transferencia": {
      const lineas = Array.isArray(p.p_lineas) ? p.p_lineas : [];
      const totalUnidades = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
      return lineas.length + " línea(s) · " + totalUnidades + " unidades";
    }
    case "vale": {
      return (p.p_tipo || "vale") + " · " + (Number(p.p_cantidad) || 0) + " unidades";
    }
    case "producto": {
      return "Nuevo producto" + (p.p_nombre ? ": " + p.p_nombre : "");
    }
    default:
      return op && op.tipo ? op.tipo : "Operación";
  }
}

// Una sola transacción IndexedDB, tres getAll indexados (los únicos estados
async function obtenerOperacionesVisiblesPanel() {
  const uid = usuarioIdParaCola();
  if (!uid) return [];
  try {
    const db = await idbAbrir();
    const combinadas = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const idx = tx.objectStore(IDB_OPS_STORE).index("estado");
      const reqPendiente = idx.getAll("PENDIENTE");
      const reqSincronizando = idx.getAll("SINCRONIZANDO");
      const reqAtencion = idx.getAll("REQUIERE_ATENCION");
      tx.oncomplete = () => {
        // Filtrar por usuario en memoria (subconjunto por estado es chico).
        const todas = (reqPendiente.result || [])
          .concat(reqSincronizando.result || [])
          .concat(reqAtencion.result || []);
        resolve(todas.filter((op) => op.usuario_id === uid));
      };
      tx.onerror = () => reject(tx.error);
    });
    return combinadas.sort((a, b) => (a.creado_en < b.creado_en ? -1 : a.creado_en > b.creado_en ? 1 : 0));
  } catch (e) {
    console.error("[Battlecruiser] No se pudieron leer las operaciones visibles del panel:", e);
    return [];
  }
}

// Texto corto para el estado (coincide con los estados reales de la cola).
function etiquetaEstadoPanel(estado) {
  switch (estado) {
    case "PENDIENTE": return "🟡 Pendiente de sincronización";
    case "SINCRONIZANDO": return "🔄 Sincronizando…";
    case "REQUIERE_ATENCION": return "🔴 Requiere atención";
    default: return estado || "?";
  }
}

function renderizarPanelPendientes(operaciones) {
  const lista = document.getElementById("lista-pendientes");
  if (!lista) return;
  if (!operaciones || operaciones.length === 0) {
    lista.innerHTML = '<p class="lista-estado">No hay operaciones pendientes. Todo sincronizado.</p>';
    return;
  }
  lista.innerHTML = "";
  operaciones.forEach((op) => {
    const div = document.createElement("div");
    div.className = "lista-item pendiente-item estado-" + (op.estado || "").toLowerCase();
    // data-id para delegar el click y abrir el detalle.
    div.dataset.id = op.id;
    const tipo = ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación";
    const estado = etiquetaEstadoPanel(op.estado);
    const fecha = op.creado_en ? fechaCorta(op.creado_en) : "";
    const intentos = Number(op.intentos) || 0;
    const intentosTxt = intentos > 0 ? " · " + intentos + (intentos === 1 ? " intento" : " intentos") : "";
    const errorTxt = op.ultimo_error
      ? '<span class="pendiente-error muted">' + String(op.ultimo_error).replace(/</g, "&lt;") + "</span>"
      : "";
    // Acciones rapidas SOLO para REQUIERE_ATENCION (regla 3/4).
    // Para PENDIENTE/SINCRONIZANDO no se exponen (regla 6/7).
    let accionesHtml = "";
    if (op.estado === "REQUIERE_ATENCION") {
      accionesHtml =
        '<span class="pendiente-acciones">' +
          '<button type="button" class="pendiente-accion-rapida pendiente-reintentar-btn" data-id="' + escHtml(op.id) + '" title="Reintentar">Reintentar</button>' +
          '<button type="button" class="pendiente-accion-rapida pendiente-eliminar-btn" data-id="' + escHtml(op.id) + '" title="Eliminar operación">Eliminar</button>' +
        "</span>";
    }
    div.innerHTML =
      '<span class="pendiente-principal">' +
        '<span class="pendiente-tipo">' + tipo + "</span>" +
        '<span class="muted pendiente-resumen">' + resumenOperacionPendiente(op) + "</span>" +
        (errorTxt) +
      "</span>" +
      '<span class="pendiente-lateral">' +
        '<span class="pendiente-estado">' + estado + "</span>" +
        '<span class="muted pendiente-meta">' + fecha + intentosTxt + "</span>" +
        (accionesHtml) +
      "</span>";
    lista.appendChild(div);
  });
}

// Orquesta: lee la cola (una sola transacción), pinta el panel y actualiza el
async function refrescarPanelPendientes() {
  const operaciones = await obtenerOperacionesVisiblesPanel();
  renderizarPanelPendientes(operaciones);

  const badgeTab = document.getElementById("pendientes-tab-badge");
  if (badgeTab) {
    const pendientes = operaciones.filter((o) => o.estado === "PENDIENTE" || o.estado === "SINCRONIZANDO").length;
    const atencion = operaciones.filter((o) => o.estado === "REQUIERE_ATENCION").length;
    const total = pendientes + atencion;
    if (total === 0) {
      badgeTab.classList.add("hidden");
      badgeTab.classList.remove("atencion");
      badgeTab.textContent = "";
    } else {
      badgeTab.textContent = String(total);
      badgeTab.classList.toggle("atencion", atencion > 0);
      badgeTab.classList.remove("hidden");
    }
  }
  // No crea una segunda fuente: lee la misma cola (ya leida arriba) y
  // deriva el estado operacional. Sin await para no acoplar al panel.
  if (typeof refrescarCentroControl === "function") refrescarCentroControl();
}

function resolverNombreProducto(id) {
  if (!id) return "\u2014";
  const p = _cache.productos.find((x) => x.id === id);
  if (p && p.nombre) return p.nombre;
  return id.length > 12 ? id.slice(0, 12) + "\u2026" : id;
}

// Resuelve un id de almacen a su nombre legible usando _cache.almacenes.
function resolverNombreAlmacen(id) {
  if (!id) return "\u2014";
  const a = _cache.almacenes.find((x) => x.id === id);
  if (a && a.nombre) return a.nombre;
  return id.length > 12 ? id.slice(0, 12) + "\u2026" : id;
}

// Acorta cualquier id (categoria, presentacion, idempotency_key) para que
// quepa en pantalla. Para IDs que no se resuelven a nombre (categoria,
// presentacion) se muestra el id acortado, nunca un nombre inventado.
function idCorto(id) {
  if (!id) return "\u2014";
  const s = String(id);
  return s.length > 12 ? s.slice(0, 12) + "\u2026" : s;
}

// Escapa texto para insertarlo seguro en innerHTML.
function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Construye el HTML del detalle de una operacion, segun su tipo y su
function detalleOperacionPendiente(op) {
  const p = (op && op.payload) || {};
  const tipo = ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operaci\u00f3n";
  const estado = etiquetaEstadoPanel(op.estado);
  const fechaHora = op.creado_en
    ? fechaHoraCompleta(op.creado_en)
    : "\u2014";
  const intentos = Number(op.intentos) || 0;
  const ultimoIntento = op.ultimo_intento
    ? fechaHora(op.ultimo_intento)
    : "\u2014";

  function fila(etiqueta, valor) {
    return '<div class="detalle-fila"><span class="detalle-etiqueta">' + escHtml(etiqueta) + '</span><span class="detalle-valor">' + escHtml(valor) + '</span></div>';
  }

  let cuerpo = "";
  switch (op && op.tipo) {
    case "producto":
      cuerpo += fila("Nombre", p.p_nombre || "\u2014");
      cuerpo += fila("Categor\u00eda", p.p_categoria_id ? idCorto(p.p_categoria_id) : "\u2014");
      cuerpo += fila("Unidad", p.p_unidad || "\u2014");
      cuerpo += fila("Precio normal", Number.isFinite(Number(p.p_precio_normal)) ? "$" + money(p.p_precio_normal) : "\u2014");
      cuerpo += fila("Precio mayorista", (p.p_precio_mayorista == null || p.p_precio_mayorista === "") ? "\u2014" : "$" + money(p.p_precio_mayorista));
      break;
    case "compra":
      cuerpo += fila("Producto", resolverNombreProducto(p.p_producto_id));
      cuerpo += fila("Almac\u00e9n", resolverNombreAlmacen(p.p_almacen_id));
      if (p.p_presentacion_id) {
        cuerpo += fila("Presentaci\u00f3n (id)", idCorto(p.p_presentacion_id));
        cuerpo += fila("Cantidad de presentaciones", Number(p.p_cantidad_presentacion) || 0);
      } else {
        cuerpo += fila("Cantidad (unidades base)", Number(p.p_cantidad) || 0);
      }
      cuerpo += fila("Costo unitario", Number.isFinite(Number(p.p_costo_unitario)) ? "$" + money(p.p_costo_unitario) : "\u2014");
      break;
    case "venta_jornada":
    case "venta": {
      const lineas = Array.isArray(p.p_lineas) ? p.p_lineas : [];
      cuerpo += fila("Almac\u00e9n", resolverNombreAlmacen(p.p_almacen_id));
      if (op.tipo === "venta_jornada") {
        cuerpo += fila("Jornada", idCorto(p.p_turno_sesion_id));
        cuerpo += fila("Tramo", idCorto(p.p_turno_tramo_id));
        cuerpo += fila("Forma de pago", p.p_metodo_pago || "—");
      }
      cuerpo += fila("L\u00edneas", lineas.length);
      lineas.forEach((l, i) => {
        cuerpo += fila("  " + (i + 1) + ". " + resolverNombreProducto(l.producto_id), (Number(l.cantidad) || 0) + " unidades");
      });
      break;
    }
    case "transferencia": {
      const lineas = Array.isArray(p.p_lineas) ? p.p_lineas : [];
      cuerpo += fila("Origen", resolverNombreAlmacen(p.p_origen_id));
      cuerpo += fila("Destino", resolverNombreAlmacen(p.p_destino_id));
      cuerpo += fila("L\u00edneas", lineas.length);
      lineas.forEach((l, i) => {
        cuerpo += fila("  " + (i + 1) + ". " + resolverNombreProducto(l.producto_id), (Number(l.cantidad) || 0) + " unidades");
      });
      break;
    }
    case "vale":
      cuerpo += fila("Tipo", p.p_tipo || "\u2014");
      cuerpo += fila("Producto", resolverNombreProducto(p.p_producto_id));
      cuerpo += fila("Almac\u00e9n", resolverNombreAlmacen(p.p_almacen_id));
      cuerpo += fila("Cantidad", Number(p.p_cantidad) || 0);
      break;
    default:
      cuerpo += fila("Tipo", op.tipo || "\u2014");
  }

  // Motivo de atencion: el ultimo_error cuando la operacion esta en
  // REQUIERE_ATENCION. Se muestra siempre que exista.
  let motivoHtml = "";
  if (op.ultimo_error) {
    motivoHtml = '<div class="detalle-motivo"><span class="detalle-etiqueta">Motivo de atenci\u00f3n</span><span class="detalle-valor detalle-error-texto">' + escHtml(op.ultimo_error) + '</span></div>';
  }

  // Acciones: Reintentar y Eliminar SOLO para REQUIERE_ATENCION (regla 3/4).
  // SINCRONIZANDO no permite generar un intento paralelo (respeta
  // _sincronizando). El data-id permite delegar el click en un listener.
  let accionesHtml = "";
  if (op.estado === "REQUIERE_ATENCION") {
    accionesHtml =
      '<div class="detalle-acciones">' +
        '<button type="button" class="pendiente-accion-btn pendiente-reintentar-btn" data-id="' + escHtml(op.id) + '">Reintentar</button>' +
        '<button type="button" class="pendiente-accion-btn pendiente-eliminar-btn" data-id="' + escHtml(op.id) + '">Eliminar operaci\u00f3n</button>' +
      '</div>';
  }

  // idempotency_key: identificador breve (no es secreto; es la clave que el
  // backend usa para reconocer reintentos). Se acorta para que quepa. No se
  // crea nada nuevo: es el campo ya existente del registro.
  const idempCorta = op.idempotency_key ? idCorto(op.idempotency_key) : "\u2014";

  return (
    '<div class="detalle-cabecera">' +
      '<span class="detalle-tipo">' + escHtml(tipo) + '</span>' +
      '<span class="detalle-estado estado-' + (op.estado || "").toLowerCase() + '">' + estado + '</span>' +
      '<button type="button" class="detalle-cerrar-btn" id="pendiente-detalle-cerrar" aria-label="Cerrar detalle">&times;</button>' +
    '</div>' +
    '<div class="detalle-cuerpo">' +
      fila("Estado", estado) +
      fila("Fecha/hora", fechaHora) +
      fila("Intentos", intentos) +
      fila("\u00daltimo intento", ultimoIntento) +
      cuerpo +
      fila("idempotency_key", idempCorta) +
    '</div>' +
    (motivoHtml) +
    (accionesHtml)
  );
}

// Muestra el detalle de una operacion en #pendiente-detalle.
function mostrarDetalleOperacion(op) {
  const cont = document.getElementById("pendiente-detalle");
  if (!cont) return;
  cont.innerHTML = detalleOperacionPendiente(op);
  cont.classList.remove("hidden");
  const cerrar = document.getElementById("pendiente-detalle-cerrar");
  if (cerrar) cerrar.addEventListener("click", cerrarDetalleOperacion);
}

function cerrarDetalleOperacion() {
  const cont = document.getElementById("pendiente-detalle");
  if (cont) {
    cont.classList.add("hidden");
    cont.innerHTML = "";
  }
}

// Reintentar una operacion en REQUIERE_ATENCION: la baja a PENDIENTE usando
let _reintentandoPanel = false; // anti doble accion rapida sobre el mismo boton
async function reintentarOperacionPendiente(id, btn) {
  if (_reintentandoPanel || _sincronizando) {
    setMsg("msg-pendientes", "Ya hay una sincronizaci\u00f3n en curso. Esper\u00e1 un momento.", false);
    return;
  }
  const op = await obtenerOperacionPendiente(id);
  if (!op) {
    setMsg("msg-pendientes", "La operaci\u00f3n ya no existe.", false);
    await refrescarPanelPendientes();
    return;
  }
  if (op.estado !== "REQUIERE_ATENCION") {
    setMsg("msg-pendientes", "Esta operaci\u00f3n no requiere reintento manual ahora mismo.", false);
    return;
  }
  if (!navigator.onLine) {
    setMsg("msg-pendientes", "Sin conexi\u00f3n ahora mismo. Se sincronizar\u00e1 solo al recuperar Internet.", false);
    return;
  }
  _reintentandoPanel = true;
  if (btn) { btn.disabled = true; }
  try {
    const actualizada = await actualizarOperacionPendiente(id, {
      estado: "PENDIENTE",
    });
    if (!actualizada) {
      setMsg("msg-pendientes", "No se pudo reintentar la operaci\u00f3n.", false);
      return;
    }
    cerrarDetalleOperacion();
    await refrescarPanelPendientes();
    // Delegar al flujo de sincronizacion existente (respeta _sincronizando).
    // El finally de sincronizarCola ya refresca el panel; no hace falta
    // una llamada explicita extra aca (seria duplicada).
    await sincronizarCola();
    setMsg("msg-pendientes", "Operaci\u00f3n reintentada.", true);
  } catch (e) {
    setMsg("msg-pendientes", "No se pudo completar el reintento.", false);
  } finally {
    _reintentandoPanel = false;
    if (btn) { btn.disabled = false; }
  }
}

// Eliminar una operacion en REQUIERE_ATENCION: confirmacion real y luego
async function eliminarOperacionPendienteConfirmada(id, btn) {
  const op = await obtenerOperacionPendiente(id);
  if (!op) {
    setMsg("msg-pendientes", "La operaci\u00f3n ya no existe.", false);
    await refrescarPanelPendientes();
    return;
  }
  if (op.estado === "SINCRONIZANDO") {
    // Proteccion: no eliminar mientras se esta sincronizando (regla 10).
    setMsg("msg-pendientes", "La operaci\u00f3n se est\u00e1 sincronizando ahora mismo. Esper\u00e1 a que termine.", false);
    return;
  }
  if (!window.confirm("\u00bfEliminar esta operaci\u00f3n pendiente?\nEsta acci\u00f3n impedir\u00e1 que vuelva a intentarse autom\u00e1ticamente.")) {
    return;
  }
  if (btn) btn.disabled = true;
  const ok = await eliminarOperacionPendiente(id);
  if (!ok) {
    setMsg("msg-pendientes", "No se pudo eliminar la operaci\u00f3n.", false);
    if (btn) btn.disabled = false;
    return;
  }
  cerrarDetalleOperacion();
  await actualizarContadorColaPendiente();
  // refrescarPanelPendientes() no se llama explicito aca:
  // actualizarContadorColaPendiente ya refresca el panel si esta
  // visible; si no lo esta, el hook del tab lo refresca al abrirse.
  setMsg("msg-pendientes", "Operaci\u00f3n eliminada.", true);
}

// Botón "Reintentar sincronización": reutiliza directamente sincronizarCola()
// (que ya se protege sola contra llamadas simultáneas con _sincronizando y
// recorre la cola en FIFO). No crea ningún reintento paralelo propio.
safeInit("panel-pendientes", () => {
  const btn = document.getElementById("pendientes-refrescar-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (!navigator.onLine) {
      setMsg("msg-pendientes", "Sin conexión ahora mismo. Se sincronizará solo al recuperar Internet.", false);
      return;
    }
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = "Sincronizando…";
    try {
      await sincronizarCola();
      await refrescarPanelPendientes();
      setMsg("msg-pendientes", "Sincronización completada.", true);
    } catch (e) {
      setMsg("msg-pendientes", "No se pudo completar la sincronización.", false);
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });

  // listener por contenedor, no uno por item (los items se recrean en
  // cada refrescarPanelPendientes). data-id identifica la operacion.
  const listaPendientes = document.getElementById("lista-pendientes");
  if (listaPendientes) {
    listaPendientes.addEventListener("click", async (e) => {
      // Click en un boton de accion: Reintentar / Eliminar.
      const btnReintentar = e.target.closest(".pendiente-reintentar-btn");
      if (btnReintentar) {
        e.stopPropagation();
        await reintentarOperacionPendiente(btnReintentar.dataset.id, btnReintentar);
        return;
      }
      const btnEliminar = e.target.closest(".pendiente-eliminar-btn");
      if (btnEliminar) {
        e.stopPropagation();
        await eliminarOperacionPendienteConfirmada(btnEliminar.dataset.id, btnEliminar);
        return;
      }
      // Click en el item (no en un boton): abrir el detalle.
      const item = e.target.closest(".pendiente-item");
      if (item && item.dataset.id) {
        const op = await obtenerOperacionPendiente(item.dataset.id);
        if (op) mostrarDetalleOperacion(op);
        else { setMsg("msg-pendientes", "La operaci\u00f3n ya no existe.", false); await refrescarPanelPendientes(); }
      }
    });
  }

  // detalle y el boton de cerrar). El detalle se reescribe en cada apertura,
  // asi que delegar evita rebindear.
  const detalle = document.getElementById("pendiente-detalle");
  if (detalle) {
    detalle.addEventListener("click", async (e) => {
      const btnReintentar = e.target.closest(".pendiente-reintentar-btn");
      if (btnReintentar) {
        await reintentarOperacionPendiente(btnReintentar.dataset.id, btnReintentar);
        return;
      }
      const btnEliminar = e.target.closest(".pendiente-eliminar-btn");
      if (btnEliminar) {
        await eliminarOperacionPendienteConfirmada(btnEliminar.dataset.id, btnEliminar);
        return;
      }
    });
  }
});

let _operacionesPendientesCache = [];

async function refrescarOperacionesPendientesCache() {
  const uid = usuarioIdParaCola();
  if (!uid) { _operacionesPendientesCache = []; return; }
  try {
    const db = await idbAbrir();
    const combinadas = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const idx = tx.objectStore(IDB_OPS_STORE).index("estado");
      const reqPendiente = idx.getAll("PENDIENTE");
      const reqSincronizando = idx.getAll("SINCRONIZANDO");
      tx.oncomplete = () => {
        // Filtrar por usuario en memoria: el subconjunto por estado es chico.
        const todas = (reqPendiente.result || []).concat(reqSincronizando.result || []);
        resolve(todas.filter((op) => op.usuario_id === uid));
      };
      tx.onerror = () => reject(tx.error);
    });
    combinadas.sort((a, b) => (a.creado_en < b.creado_en ? -1 : a.creado_en > b.creado_en ? 1 : 0));
    _operacionesPendientesCache = combinadas;
  } catch (e) {
    console.error("[Battlecruiser] No se pudieron leer las operaciones pendientes:", e);
    _operacionesPendientesCache = [];
  }
}

// Cuánto sumar/restar al stock real de un producto en un almacén según las
function ajustePendiente(producto_id, almacen_id) {
  let ajuste = 0;
  let noCalculable = false;
  _operacionesPendientesCache.forEach((op) => {
    const p = op.payload || {};
    if (op.tipo === "compra" && p.p_producto_id === producto_id && p.p_almacen_id === almacen_id) {
      if (p.p_presentacion_id) {
        const factor = factorPresentacionConocido(producto_id, p.p_presentacion_id);
        if (factor === null) {
          noCalculable = true;
        } else {
          ajuste += (Number(p.p_cantidad_presentacion) || 0) * factor;
        }
      } else {
        ajuste += Number(p.p_cantidad) || 0;
      }
    } else if (op.tipo === "vale" && p.p_producto_id === producto_id && p.p_almacen_id === almacen_id) {
      ajuste -= Number(p.p_cantidad) || 0;
    } else if ((op.tipo === "venta" || op.tipo === "venta_jornada") && p.p_almacen_id === almacen_id) {
      (p.p_lineas || []).forEach((l) => {
        if (l.producto_id === producto_id) ajuste -= Number(l.cantidad) || 0;
      });
    } else if (op.tipo === "transferencia") {
      (p.p_lineas || []).forEach((l) => {
        if (l.producto_id !== producto_id) return;
        if (p.p_origen_id === almacen_id) ajuste -= Number(l.cantidad) || 0;
        if (p.p_destino_id === almacen_id) ajuste += Number(l.cantidad) || 0;
      });
    }
  });
  return { ajuste, noCalculable };
}

//                                                la cola ni se reintenta sola).
const RPC_POR_TIPO = {
  compra: "registrar_compra",
  venta: "registrar_venta",
  venta_jornada: "bc7_registrar_venta_jornada",
  transferencia: "registrar_transferencia",
  vale: "registrar_vale_salida",
  // que compra/venta/transferencia/vale, en vez de un INSERT directo aparte.
  producto: "crear_producto",
  producto_actualizar: "actualizar_producto",
  producto_estado: "cambiar_estado_producto",
  // B7: operaciones de turnos/cuadres/responsabilidades/incidencias
  // pasan por la misma cola offline (idempotencia, FIFO, reintento).
  turno: "abrir_turno",
  turno_cerrar: "cerrar_turno",
  cuadre: "registrar_cuadre",
  cuadre_revisar: "revisar_cuadre",
  responsabilidad: "crear_responsabilidad",
  responsabilidad_actualizar: "actualizar_responsabilidad",
  incidencia: "crear_incidencia",
  incidencia_resolver: "resolver_incidencia",
  // B8: envío de mensajes y creación de conversaciones pasan por la misma cola offline.
  mensaje: "enviar_mensaje",
  conversacion: "crear_conversacion",
  // almacenes pasan por la misma cola offline genérica que producto
  // (idempotencia, FIFO, reintento). Los RPC ya existen en producción.
  almacen: "crear_almacen",
  almacen_actualizar: "editar_almacen",
  almacen_estado: "activar_desactivar_almacen",
};

function tipoAuditableFrontend(tipo) {
  switch (tipo) {
    case "producto":
    case "producto_actualizar":
    case "producto_estado":
    case "compra":
    case "venta":
    case "venta_jornada":
    case "transferencia":
    case "vale":
      // Ya auditados por el trigger auditar_mutacion_operativa().
      return false;
    default:
      // turno, cuadre, responsabilidad, incidencia, mensaje, conversacion, etc.
      return true;
  }
}

async function ejecutarOperacion(tipo, payload) {
  // frontend lo refleja devolviendo un error claro. Reutiliza
  // usuarioPuedeOperar() (que consulta el contexto, no hace RPC nuevo).
  if (typeof usuarioPuedeOperar === "function") {
    const puede = await usuarioPuedeOperar();
    if (!puede) {
      return { ok: false, error: { message: "Tu usuario está inactivo. Contactá al administrador." } };
    }
  }
  if (typeof sincronizarUsuarioIdParaOperaciones === "function") sincronizarUsuarioIdParaOperaciones();
  const idempotency_key = crypto.randomUUID();
  const rpcNombre = RPC_POR_TIPO[tipo];

  async function encolar() {
    const operacion = await guardarOperacionPendiente(
      crearOperacionPendiente(tipo, payload, idempotency_key)
    );
    await refrescarOperacionesPendientesCache();
    return { ok: true, offline: true, operacion };
  }

  if (!navigator.onLine) {
    marcarConectividadReal("offline");
    return encolar();
  }

  try {
    const { data, error } = await client.rpc(
      rpcNombre,
      Object.assign({}, payload, { p_idempotency_key: idempotency_key })
    );

    if (!error) {
      // B4: registrar auditoría de la operación exitosa (trazabilidad).
      if (tipoAuditableFrontend(tipo) && typeof registrarAuditoria === "function") {
        const entidadId = typeof data === "string" ? data : String((data && data.id) || "");
        registrarAuditoria(tipo, "Operación " + (ETIQUETA_TIPO_OP[tipo] || tipo) + " ejecutada online.", "exito", entidadId, idempotency_key, null);
      }
      marcarConectividadReal("online");
      return { ok: true, offline: false, data };
    }

    if (esErrorDeRed(error)) {
      // Error real de red — se guarda en la cola con la misma clave.
      marcarConectividadReal("offline");
      return encolar();
    }

    // Error de negocio: el backend respondió → estamos online.
    marcarConectividadReal("online");
    if (tipoAuditableFrontend(tipo) && typeof registrarAuditoria === "function") {
      registrarAuditoria(tipo, "Operación " + (ETIQUETA_TIPO_OP[tipo] || tipo) + " rechazada: " + (error.message || "error de negocio"), "requiere_atencion", null, idempotency_key, null);
    }
    return { ok: false, error };
  } catch (e) {
    // Algunas fallas de red llegan como excepción (fetch rechazado por el
    // Service Worker, "Failed to fetch" como TypeError) en vez de {error}.
    marcarConectividadReal("offline");
    return encolar();
  }
}

async function recuperarOperacionesAtrapadas() {
  try {
    const atrapadas = await obtenerOperacionesPorEstado("SINCRONIZANDO");
    for (const op of atrapadas) {
      await actualizarOperacionPendiente(op.id, {
        estado: "PENDIENTE",
        ultimo_error: "Reintentada al iniciar la app: quedó a medias en una sincronización de una sesión anterior.",
      });
    }
    if (atrapadas.length > 0) {
      console.warn("[Battlecruiser] " + atrapadas.length + " operación(es) recuperada(s) de SINCRONIZANDO a PENDIENTE al iniciar.");
    }
  } catch (e) {
    console.error("[Battlecruiser] No se pudo revisar operaciones atrapadas en SINCRONIZANDO:", e);
  }
}

//   - marcarRefrescoPendiente(categoria): anota en un Set qué categorias de
let _refrescosPendientes = null;

function marcarRefrescoPendiente(categoria) {
  if (!_refrescosPendientes) return; // sin sincronizacion en curso: ignorar
  _refrescosPendientes.add(categoria);
}

// Anota que refrescos hacen falta segun el tipo/resultado de la operacion
function reconciliarTrasOperacion(tipo, resultado) {
  switch (tipo) {
    case "producto":
      // Producto nuevo: tras exito hay que traer los productos reales. No
      // mueve stock por si mismo. Tras error de negocio no hay producto real.
      if (resultado === "exito") marcarRefrescoPendiente("productos");
      break;
    case "producto_actualizar":
    case "producto_estado":
      // que refrescar la lista/selects de productos tras éxito.
      if (resultado === "exito") marcarRefrescoPendiente("productos");
      break;
    case "compra":
      // Compra = entrada de stock. (refrescarStockYSelects cubre productos
      // + almacenes + stock, asi que "stock" incluye "productos").
      marcarRefrescoPendiente("stock");
      break;
    case "venta":
    case "venta_jornada":
      marcarRefrescoPendiente("stock");
      marcarRefrescoPendiente("ventas");
      break;
    case "transferencia":
      marcarRefrescoPendiente("stock");
      marcarRefrescoPendiente("transferencias");
      break;
    case "vale":
      marcarRefrescoPendiente("stock");
      marcarRefrescoPendiente("vales");
      break;
    case "turno":
    case "turno_cerrar":
      // B7: refrescar turno actual y listas de turnos/operación.
      marcarRefrescoPendiente("turnos");
      break;
    case "cuadre":
    case "cuadre_revisar":
      // B7: refrescar cuadres y operación.
      marcarRefrescoPendiente("cuadres");
      break;
    case "responsabilidad":
    case "responsabilidad_actualizar":
      // B7: refrescar responsabilidades.
      marcarRefrescoPendiente("responsabilidades");
      break;
    case "incidencia":
    case "incidencia_resolver":
      // B7: refrescar incidencias.
      marcarRefrescoPendiente("incidencias");
      break;
    case "mensaje":
      // B8: refrescar mensajes de la conversación actual y la lista.
      marcarRefrescoPendiente("comunicacion");
      break;
    case "conversacion":
      // B8: refrescar la lista de conversaciones.
      marcarRefrescoPendiente("conversaciones");
      break;
    case "almacen":
    case "almacen_actualizar":
    case "almacen_estado":
      // sí mismas, pero "stock" ya cubre almacenes (refrescarStockYSelects
      // trae productos+almacenes+stock), así que reusamos esa categoría.
      if (resultado === "exito") marcarRefrescoPendiente("stock");
      break;
    default:
      marcarRefrescoPendiente("stock");
  }
}

// Ejecuta una sola vez cada refresco marcado, al final de la sincronizacion.
async function consolidarRefrescosPendientes() {
  if (!_refrescosPendientes) return;
  const cats = _refrescosPendientes;
  _refrescosPendientes = null; // liberar antes de ejecutar por si una llamada
  // anidada vuelve a sincronizar (no deberia, pero por seguridad).
  if (!appShell || !appShell.classList.contains("visible")) return;
  try {
    if (cats.has("stock")) {
      // refrescarStockYSelects trae productos + almacenes + stock (cubriendo
      // tambien la categoria "productos" si estuviera marcada).
      await refrescarStockYSelects();
    } else if (cats.has("productos")) {
      // Solo productos (ej. operacion de crear producto exitosa, sin stock).
      await refrescarProductos();
    }
    // Historiales: uno por categoria marcada (cada uno es 1 consulta).
    if (cats.has("transferencias")) await refrescarTransferencias();
    if (cats.has("vales")) await refrescarVales();
    if (cats.has("ventas")) await refrescarVentas();
    // B7: turnos/cuadres/responsabilidades/incidencias.
    if (cats.has("turnos")) {
      if (typeof refrescarTurnoActual === "function") refrescarTurnoActual();
      if (typeof refrescarListaTurnos === "function") refrescarListaTurnos();
    }
    if (cats.has("cuadres")) {
      if (typeof refrescarListaCuadres === "function") refrescarListaCuadres();
      if (typeof refrescarOperacion === "function") refrescarOperacion();
    }
    if (cats.has("responsabilidades")) {
      if (typeof refrescarListaResponsabilidades === "function") refrescarListaResponsabilidades();
    }
    if (cats.has("incidencias")) {
      if (typeof refrescarListaIncidencias === "function") refrescarListaIncidencias();
    }
    // B8: comunicacion y conversaciones.
    if (cats.has("comunicacion")) {
      if (typeof refrescarListaConversaciones === "function") refrescarListaConversaciones();
      if (typeof actualizarBadgeNoLeidos === "function") actualizarBadgeNoLeidos();
      // T7.1: refrescar chat abierto tras sync offline (quita ⏳ Pendiente).
      if (typeof _comConvActual !== "undefined" && _comConvActual && typeof refrescarMensajes === "function") {
        refrescarMensajes(_comConvActual);
      }
    }
    if (cats.has("conversaciones")) {
      if (typeof refrescarListaConversaciones === "function") refrescarListaConversaciones();
      if (typeof actualizarBadgeNoLeidos === "function") actualizarBadgeNoLeidos();
    }
  } catch (e) {
    // Una reconciliacion fallida no debe romper el estado: ya se logueo el
    // warning; la UI mostrara lo ultimo que tenga en _cache.
    console.warn("[Battlecruiser] Consolidacion de refrescos fallo:", e);
  }
}

// Mutex global entre pestañas: localStorage para evitar sincronizaciones
let _sincronizando = false;
function sincronizandoGlobal(activo) {
  if (activo) { localStorage.setItem('battlecruiser-sincronizando', '1'); }
  else { localStorage.removeItem('battlecruiser-sincronizando'); }
}

async function procesarColaSincronizacion() {
  if (_sincronizando) return;
  // Bind one drain pass to the user who started it. An IndexedDB await can
  // outlive logout/login, so filtering only the initial queue snapshot is not
  // enough to prevent a different user from submitting the previous user's op.
  const usuarioIdSincronizacion = usuarioIdParaCola();
  if (!usuarioIdSincronizacion) return;
  const errorCambioUsuario = "La sesión cambió durante la sincronización; la operación se conserva pendiente para reintento idempotente.";
  if (localStorage.getItem('battlecruiser-sincronizando')) return;
  _sincronizando = true;
  sincronizandoGlobal(true);
  _refrescosPendientes = new Set();
  actualizarIndicadorConexion("sincronizando");
  try {
    // FIFO and one at a time. Abort a stale snapshot if identity changed while
    // IndexedDB was being read.
    const operaciones = await obtenerOperacionesPorEstado("PENDIENTE");
    if (usuarioIdParaCola() !== usuarioIdSincronizacion) return;

    for (const op of operaciones) {
      if (!navigator.onLine) break; // se perdió la conexión a mitad de la cola
      if (usuarioIdParaCola() !== usuarioIdSincronizacion) break;
      // Fail closed if the stored owner does not match the identity bound to
      // this pass, even if a future query/index regression returns a foreign op.
      if (!op || op.usuario_id !== usuarioIdSincronizacion) continue;

      await actualizarOperacionPendiente(op.id, {
        estado: "SINCRONIZANDO",
        intentos: (op.intentos || 0) + 1,
        ultimo_intento: new Date().toISOString(),
      });

      // The IndexedDB write above is asynchronous: re-check identity immediately
      // before the RPC, and restore PENDIENTE instead of sending under a new
      // login if the account changed while that write was in flight.
      if (usuarioIdParaCola() !== usuarioIdSincronizacion) {
        await actualizarOperacionPendiente(op.id, {
          estado: "PENDIENTE",
          ultimo_error: errorCambioUsuario,
        });
        break;
      }

      let error = null;
      let data = null;
      try {
        // Keep this guard adjacent to the backend call; do not dispatch a
        // previous user's payload after logout/login has changed the context.
        if (usuarioIdParaCola() !== usuarioIdSincronizacion || op.usuario_id !== usuarioIdSincronizacion) {
          await actualizarOperacionPendiente(op.id, {
            estado: "PENDIENTE",
            ultimo_error: errorCambioUsuario,
          });
          break;
        }
        const respuesta = await client.rpc(
          RPC_POR_TIPO[op.tipo],
          Object.assign({}, op.payload, { p_idempotency_key: op.idempotency_key })
        );
        error = respuesta.error;
        data = respuesta.data;
      } catch (e) {
        error = e;
      }

      // If an identity transition happened while the RPC was in flight, keep
      // the item for a later idempotent retry. Do not run audit/cache follow-ups
      // or remove it from the queue under the new user's context.
      if (usuarioIdParaCola() !== usuarioIdSincronizacion) {
        await actualizarOperacionPendiente(op.id, {
          estado: "PENDIENTE",
          ultimo_error: errorCambioUsuario,
        });
        break;
      }

      if (!error) {
        await actualizarOperacionPendiente(op.id, { estado: "SINCRONIZADA" });
        if (usuarioIdParaCola() !== usuarioIdSincronizacion) {
          await actualizarOperacionPendiente(op.id, {
            estado: "PENDIENTE",
            ultimo_error: errorCambioUsuario,
          });
          break;
        }
        // B4: registrar auditoría de la sincronización exitosa (trazabilidad
        if (tipoAuditableFrontend(op.tipo) && typeof registrarAuditoria === "function") {
          const entidadId = typeof data === "string" ? data : String((data && data.id) || op.id || "");
          registrarAuditoria(op.tipo, "Operación " + (ETIQUETA_TIPO_OP[op.tipo] || op.tipo) + " sincronizada (era offline).", "exito", entidadId, op.idempotency_key, null);
        }
        marcarConectividadReal("online");
        await eliminarOperacionPendiente(op.id);
        await refrescarOperacionesPendientesCache();
        await reconciliarTrasOperacion(op.tipo, "exito");
        continue;
      }

      if (esErrorDeRed(error)) {
        // Internet — no sigue reintentando ahora mismo.
        await actualizarOperacionPendiente(op.id, {
          estado: "PENDIENTE",
          ultimo_error: error.message || String(error),
        });
        await refrescarOperacionesPendientesCache();
        break;
      }

      // para revisar a mano, pero la cola sigue con las siguientes.
      if (tipoAuditableFrontend(op.tipo) && typeof registrarAuditoria === "function") {
        registrarAuditoria(op.tipo, "Operación " + (ETIQUETA_TIPO_OP[op.tipo] || op.tipo) + " requiere atención: " + (error.message || "error de negocio"), "requiere_atencion", op.id, op.idempotency_key, null);
      }
      await actualizarOperacionPendiente(op.id, {
        estado: "REQUIERE_ATENCION",
        ultimo_error: error.message || String(error),
      });
      if (usuarioIdParaCola() !== usuarioIdSincronizacion) break;
      await refrescarOperacionesPendientesCache();
      await reconciliarTrasOperacion(op.tipo, "negocio");
    }
  } finally {
    _sincronizando = false;
    sincronizandoGlobal(false);
    await actualizarContadorColaPendiente();
    await consolidarRefrescosPendientes();
    actualizarIndicadorConexion();
  }
}


let _sincronizacionEnCurso = null;
let _sincronizacionSolicitada = false;

// No perder una solicitud de sincronización concurrente. Si el login o el
// listener de conectividad ya estaba drenando la cola cuando se guardó una
// operación nueva, el llamador espera el pase actual y fuerza un pase adicional
// para incluir la operación que pudo quedar fuera de la instantánea FIFO.
function sincronizarCola() {
  if (_sincronizacionEnCurso) {
    _sincronizacionSolicitada = true;
    return _sincronizacionEnCurso;
  }

  const ejecucion = procesarColaSincronizacion();
  let promesa = null;
  promesa = ejecucion.finally(async () => {
    if (_sincronizacionEnCurso === promesa) _sincronizacionEnCurso = null;
    if (_sincronizacionSolicitada) {
      _sincronizacionSolicitada = false;
      await sincronizarCola();
    }
  });
  _sincronizacionEnCurso = promesa;
  return promesa;
}

function resumenEstadoCache() {
  const valores = Object.values(_estadoCacheClaves);
  return {
    conDatos: valores.filter((v) => v === "cache-con-datos").length,
    sinCache: valores.filter((v) => v === "sin-cache").length,
    vacia: valores.filter((v) => v === "cache-vacia").length,
  };
}

function actualizarIndicadorConexion(estadoForzado) {
  const nodos = [
    { linea: document.getElementById("conn-status"), texto: document.getElementById("conn-text") },
    { linea: document.getElementById("conn-status-app"), texto: document.getElementById("conn-text-app") },
  ];

  let clase = "";
  let texto = "🟢 Conectado";
  let mostrarTooltip = false;
  if (estadoForzado === "sincronizando") {
    clase = "reconectando";
    texto = "🔄 Sincronizando…";
  } else if (estadoForzado === "reconectando") {
    clase = "reconectando";
    texto = "🔄 Reconectando…";
  } else if (estaDispositivoOffline()) {
    // A. Dispositivo sin conexión
    clase = "offline";
    const { conDatos, sinCache } = resumenEstadoCache();
    if (conDatos > 0) {
      texto = "🔴 Sin conexión — usando caché";
      mostrarTooltip = true;
    } else if (sinCache > 0) {
      texto = "🔴 Sin conexión — sin datos guardados";
    } else {
      texto = "🔴 Sin conexión";
    }
  } else if (estaBackendInaccesible()) {
    // B. Dispositivo conectado pero backend inaccesible
    clase = "offline";
    const { conDatos: conDatosB, sinCache: sinCacheB } = resumenEstadoCache();
    if (conDatosB > 0) {
      texto = "⚡ Backend inaccesible — usando caché";
      mostrarTooltip = true;
    } else if (sinCacheB > 0) {
      texto = "⚡ Backend inaccesible — sin datos guardados";
    } else {
      texto = "⚡ Backend inaccesible";
    }
  } else if (_conectividadReal === null && navigator.onLine) {
    // D. Todavía comprobando
    clase = "reconectando";
    texto = "⏳ Comprobando conexión...";
  }

  nodos.forEach(({ linea, texto: textoEl }) => {
    if (!linea) return;
    linea.classList.remove("offline", "reconectando");
    if (clase) linea.classList.add(clase);
    if (textoEl) textoEl.textContent = texto;
  });

  if (mostrarTooltip) {
    marcarTituloUltimaActualizacion(nodos);
  } else {
    nodos.forEach(({ linea }) => { if (linea) linea.removeAttribute("title"); });
  }
}

// Detalle fino opcional: al pasar el mouse/tocar el indicador offline, la
async function marcarTituloUltimaActualizacion(nodos) {
  const registros = await Promise.all(CLAVES_CACHE_PRINCIPALES.map((c) => idbGet(c)));
  const conFecha = registros.filter((r) => r && r.actualizado);
  if (conFecha.length === 0) return;
  const masReciente = conFecha.reduce((a, b) => (new Date(b.actualizado) > new Date(a.actualizado) ? b : a));
  const hora = new Date(masReciente.actualizado).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  const texto = "Datos guardados el " + fechaCorta(masReciente.actualizado) + " a las " + hora;
  nodos.forEach(({ linea }) => { if (linea) linea.title = texto; });
}

safeInit("estado-conexion", () => {
  var recuperacionBackendEnCurso = null;
  function recuperarColaTrasRespuestaConfirmada() {
    if (recuperacionBackendEnCurso) return recuperacionBackendEnCurso;
    var tarea = (async function () {
      await recuperarOperacionesAtrapadas();
      await sincronizarCola();
      if (appShell.classList.contains("visible")) await refrescarTrasReconexion();
      else actualizarIndicadorConexion();
      return true;
    })();
    var compartida = tarea.finally(function () {
      if (recuperacionBackendEnCurso === compartida) recuperacionBackendEnCurso = null;
    });
    recuperacionBackendEnCurso = compartida;
    return compartida;
  }
  async function alReconectar() {
    // navigator.onLine is only a hint: require a real Auth HTTP response before queue sync.
    var backendDisponible = await sondearBackend();
    if (!backendDisponible) { actualizarIndicadorConexion(); return false; }
    return recuperarColaTrasRespuestaConfirmada();
  }
  // Recovery also works when Android resumes without emitting the browser "online" event.
  window.addEventListener("bc:backend-reconnected", function () {
    if (window.__BC_BACKEND_PROBE__ && window.__BC_BACKEND_PROBE__.status === "online") {
      recuperarColaTrasRespuestaConfirmada().catch(function () { actualizarIndicadorConexion(); });
    }
  });
  window.addEventListener("online", function () {
    alReconectar().catch(function () { actualizarIndicadorConexion(); });
  });
  window.addEventListener("offline", () => marcarConectividadReal("offline"));
  // At boot, verify reachability before reconciling queued work and refreshing live data.
  if (navigator.onLine) sondearBackend().catch(function () { actualizarIndicadorConexion(); });
  actualizarIndicadorConexion();
});;
