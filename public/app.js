// ---- Config del proyecto Supabase de Battlecruiser ----
const SUPABASE_URL = "https://papxnkkjtkxsitcsvcme.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pczHaS1JDPGrEA31vdbOLg_1l2qFhbm";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function safeInit(nombre, fn) {
  try {
    fn();
  } catch (e) {
    console.error("[Battlecruiser] No se pudo iniciar '" + nombre + "':", e);
  }
}

// para dejar que el cambio de pestaña se procese antes de abrir la conversación.
// Antes estas funciones referenciaban esperar() sin definirla (bug latente).
function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function fechaCorta(fecha) {
  return new Date(fecha).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fechaHora(fecha) {
  return new Date(fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fechaHoraCompleta(fecha) {
  return new Date(fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Rellena un <select> con almacenes de _cache, preservando el valor actual.
function poblarSelectAlmacenes(sel, placeholder) {
  if (!sel) return;
  const actual = sel.value;
  const almacenes = (_cache && _cache.almacenes) ? _cache.almacenes : [];
  sel.innerHTML = '<option value="">' + (placeholder || 'Todos los almacenes') + '</option>';
  almacenes.forEach((a) => {
    const o = document.createElement('option');
    o.value = a.id; o.textContent = a.nombre;
    sel.appendChild(o);
  });
  if (actual) sel.value = actual;
}


function setLoading(listId, texto) {
  const el = document.getElementById(listId);
  if (el) el.innerHTML = '<p class="lista-estado">' + (texto || "Cargando…") + "</p>";
}

function setEmpty(listId, texto) {
  const el = document.getElementById(listId);
  if (el) el.innerHTML = '<p class="lista-estado">' + texto + "</p>";
}

const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const appShell = document.getElementById("app-shell");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");
const lanternWrap = document.getElementById("lantern-wrap");

let _usuarioActualId = null;
// al inicio para evitar TDZ: showLogin/showApp la referencian al arrancar.
let _novedadesVistas = new Set();
// para evitar TDZ (showApp/showLogin lo usan durante la carga inicial).
let _usuarioActual = null;
let _permisosEfectivos = {};
let _cargandoUsuario = false;
let _permisosCargaExitosa = false; // el RPC respondio un array (aunque fuera [])
let _permisosCargaFallidaRed = false; // la carga fallo por error de red

function showApp(session) {
  loginForm.classList.add("hidden");
  lanternWrap.classList.add("hidden");
  appShell.classList.add("visible");
  userEmailEl.textContent = session.user.email;
  _usuarioActualId = session.user.id;
  if (typeof cargarContextoUsuario === "function") cargarContextoUsuario();
}

function showLogin() {
  loginForm.classList.remove("hidden");
  lanternWrap.classList.remove("hidden");
  appShell.classList.remove("visible");
  _usuarioActualId = null;
  // un usuario B jamás vea permisos/datos del usuario A anterior.
  if (typeof limpiarContextoUsuario === "function") limpiarContextoUsuario();
  // Foco directo en "Correo" al mostrar el login: con 6+ vendedores entrando y
  // saliendo de la cuenta seguido en la misma caja, ahorra un tap cada vez.
  const emailInput = document.getElementById("email");
  if (emailInput) emailInput.focus();
}

// Por defecto arranca en login hasta confirmar sesión real (evita el parpadeo de ver ambas pantallas)
showLogin();

client.auth.getSession().then(({ data }) => {
  if (data.session) showApp(data.session);
});

client.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session);
  else showLogin();
});

safeInit("login", () => {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    loginBtn.disabled = true;
    showLoading();
    loginBtn.textContent = "Entrando...";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        loginError.textContent = (!navigator.onLine || msg.includes("failed to fetch") || msg.includes("timeout"))
          ? "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento."
          : "Correo o contraseña incorrectos.";
        console.error("[Battlecruiser] (login)", error);
      }
    } catch (e) {
      loginError.textContent = "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento.";
      console.error("[Battlecruiser] (login) excepción inesperada", e);
    } finally {
      hideLoading();
      loginBtn.disabled = false;
      loginBtn.textContent = "Entrar";
    }
  });
});

safeInit("logout", () => {
  logoutBtn.addEventListener("click", async () => {
    if (typeof limpiarContextoUsuario === "function") limpiarContextoUsuario();
    await client.auth.signOut();
  });
});

safeInit("nuevo-usuario", () => {
  const form = document.getElementById("form-nuevo-usuario");
  const msgEl = document.getElementById("msg-nuevo-usuario");
  if (!form || !msgEl) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.textContent = "";
    const nombre = document.getElementById("nuevo-usuario-nombre").value.trim();
    const email = document.getElementById("nuevo-usuario-email").value.trim();
    const password = document.getElementById("nuevo-usuario-password").value;

    if (!nombre) {
      msgEl.textContent = "El nombre es obligatorio.";
      return;
    }
    if (password.length < 6) {
      msgEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
      return;
    }

    showLoading();
    try {
      const clienteTemporal = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await clienteTemporal.auth.signUp({ email, password });
      if (error) {
        msgEl.textContent = "Error al crear usuario: " + (error.message || "Error desconocido");
        console.error("[Battlecruiser] (nuevo-usuario)", error);
        return;
      }

      const nuevoId = data && data.user && data.user.id;
      if (!nuevoId) {
        msgEl.textContent = "El usuario se creó en autenticación, pero no se recibió su id. Contactá soporte técnico antes de reintentar.";
        console.error("[Battlecruiser] (nuevo-usuario) signUp sin data.user.id", data);
        return;
      }

      const { error: errorPerfil } = await client.rpc("crear_usuario_interno", { p_id: nuevoId, p_nombre: nombre });
      if (errorPerfil) {
        msgEl.textContent = "El usuario se creó en autenticación, pero falló al crear su perfil interno (" + (errorPerfil.message || "error desconocido") + "). Contactá soporte técnico antes de reintentar con el mismo correo.";
        console.error("[Battlecruiser] (nuevo-usuario) crear_usuario_interno", errorPerfil);
        return;
      }

      msgEl.textContent = "Usuario creado correctamente. Asignale un rol en la lista de usuarios. Si la confirmación de email está activada en el proyecto, deberá confirmar su correo antes de poder entrar.";
      form.reset();
      if (typeof refrescarUsuarios === "function") refrescarUsuarios();
    } catch (e) {
      msgEl.textContent = "Ocurrió un error inesperado al crear el usuario (" + (e && e.message ? e.message : "error desconocido") + "). No se pudo confirmar si quedó creado — revisá la lista antes de reintentar.";
      console.error("[Battlecruiser] (nuevo-usuario) excepción inesperada", e);
    } finally {
      hideLoading();
    }
  });
});

// ---- Actualizar app: borra caché del shell y fuerza traer la última versión ----
async function actualizarApp(btn) {
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Actualizando...";
  try {
    // V1.3: borrar SOLO las caches de BattleCruiser (mismo prefijo que usa el
    // service worker en su activate: "battlecruiser-shell-"). Nunca tocar caches
    // de otras aplicaciones que compartan este mismo origen.
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("battlecruiser-shell-")).map((k) => caches.delete(k))
      );
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {
    // Si algo falla igual forzamos el reload de abajo; el navegador va a pedir todo de red.
  }
  location.reload();
}

safeInit("actualizar-app-login", () => {
  const btn = document.getElementById("update-app-btn-login");
  btn.addEventListener("click", () => actualizarApp(btn));
});

safeInit("actualizar-app", () => {
  const updateAppBtn = document.getElementById("update-app-btn");
  updateAppBtn.addEventListener("click", () => actualizarApp(updateAppBtn));
});

const OJO_ABIERTO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const OJO_TACHADO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-7-11-7a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20.6 20.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

safeInit("ojito-contraseña", () => {
  document.querySelectorAll(".pass-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const mostrando = input.type === "text";
      const ahoraVisible = !mostrando;
      input.type = ahoraVisible ? "text" : "password";
      btn.setAttribute("aria-label", ahoraVisible ? "Ocultar contraseña" : "Mostrar contraseña");
      btn.classList.toggle("activo", ahoraVisible);
      btn.innerHTML = ahoraVisible ? OJO_TACHADO_SVG : OJO_ABIERTO_SVG;
    });
  });
});

safeInit("menu-ajustes", () => {
  const ajustesBtn = document.getElementById("ajustes-btn");
  const ajustesMenu = document.getElementById("ajustes-menu");

  ajustesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    ajustesMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!ajustesMenu.classList.contains("hidden") && !ajustesMenu.contains(e.target) && e.target !== ajustesBtn) {
      ajustesMenu.classList.add("hidden");
    }
  });
});

// ---- Cambiar contraseña (Supabase Auth, no pide la contraseña actual) ----
safeInit("cambiar-contraseña", () => {
  const changePassBtn = document.getElementById("change-pass-btn");
  const passPanel = document.getElementById("pass-panel");
  const passCancelBtn = document.getElementById("pass-cancel-btn");
  const formPass = document.getElementById("form-pass");
  const ajustesMenu = document.getElementById("ajustes-menu");

  changePassBtn.addEventListener("click", () => {
    passPanel.classList.toggle("hidden");
    if (ajustesMenu) ajustesMenu.classList.add("hidden");
  });

  passCancelBtn.addEventListener("click", () => {
    formPass.reset();
    document.getElementById("msg-pass").textContent = "";
    passPanel.classList.add("hidden");
  });

  formPass.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nueva = document.getElementById("pass-new").value;
    const confirmar = document.getElementById("pass-confirm").value;
    const submitBtn = formPass.querySelector("button[type='submit']");

    if (nueva !== confirmar) {
      setMsg("msg-pass", "Las contraseñas no coinciden.", false);
      return;
    }
    if (nueva.length < 6) {
      setMsg("msg-pass", "La contraseña debe tener al menos 6 caracteres.", false);
      return;
    }

    // Si por lo que sea la sesión se perdió (token vencido, etc.), antes esto
    // fallaba con un error genérico de Supabase; ahora se avisa claro.
    const { data: sesionActual } = await client.auth.getSession();
    if (!sesionActual.session) {
      setMsg("msg-pass", "Se perdió la sesión — cerrá sesión y volvé a entrar antes de cambiar la contraseña.", false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    const { data, error } = await client.auth.updateUser({ password: nueva });

    submitBtn.disabled = false;
    submitBtn.textContent = "Guardar contraseña";

    if (error) {
      console.error("[Battlecruiser] updateUser password error:", error);
      setMsg("msg-pass", "No se pudo cambiar: " + explicarError(error, "cambiar contraseña"), false);
      return;
    }
    console.log("[Battlecruiser] Contraseña actualizada para:", data.user && data.user.email);
    setMsg("msg-pass", "Contraseña actualizada. Ya podés usarla la próxima vez que entres.", true);
    formPass.reset();
  });
});

if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

safeInit("escape-cierra-paneles", () => {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const ajustesMenu = document.getElementById("ajustes-menu");
    const passPanel = document.getElementById("pass-panel");
    if (ajustesMenu && !ajustesMenu.classList.contains("hidden")) {
      ajustesMenu.classList.add("hidden");
    }
    if (passPanel && !passPanel.classList.contains("hidden")) {
      passPanel.classList.add("hidden");
    }
    if (typeof window._battlecruiserCerrarMenuLateral === "function") {
      window._battlecruiserCerrarMenuLateral();
    }
  });
});

// ---- Evitar que el scroll del mouse/trackpad cambie precios y cantidades ----
safeInit("bloqueo-scroll-numeros", () => {
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("wheel", () => input.blur(), { passive: true });
  });
});

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

async function actualizarContadorColaPendiente() {
  const el = document.getElementById("cola-pendientes-badge");
  if (!el) return;
  const uid = usuarioIdParaCola();
  if (!uid) { el.classList.add("hidden"); el.textContent = ""; return; }
  try {
    const db = await idbAbrir();
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
    case "venta": {
      const lineas = Array.isArray(p.p_lineas) ? p.p_lineas : [];
      cuerpo += fila("Almac\u00e9n", resolverNombreAlmacen(p.p_almacen_id));
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
    } else if (op.tipo === "venta" && p.p_almacen_id === almacen_id) {
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
      return { ok: true, offline: false, data };
    }

    if (esErrorDeRed(error)) {
      // una regla de negocio — se guarda en la cola con la misma clave.
      return encolar();
    }

    if (tipoAuditableFrontend(tipo) && typeof registrarAuditoria === "function") {
      registrarAuditoria(tipo, "Operación " + (ETIQUETA_TIPO_OP[tipo] || tipo) + " rechazada: " + (error.message || "error de negocio"), "requiere_atencion", null, idempotency_key, null);
    }
    return { ok: false, error };
  } catch (e) {
    // Algunas fallas de red llegan como excepción (fetch rechazado por el
    // Service Worker, "Failed to fetch" como TypeError) en vez de {error}.
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
      // + almacenes + stock, asi que "stock" incluye "productos".)
      marcarRefrescoPendiente("stock");
      break;
    case "venta":
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

async function sincronizarCola() {
  if (_sincronizando) return;
  // no hay auth.uid() en el backend y no se debe intentar enviar nada.
  if (!usuarioIdParaCola()) return;
  if (localStorage.getItem('battlecruiser-sincronizando')) return;
  _sincronizando = true;
  sincronizandoGlobal(true);
  _refrescosPendientes = new Set();
  actualizarIndicadorConexion("sincronizando");
  try {
    // ordena así), una operación a la vez, nunca todas en simultáneo.
    const operaciones = await obtenerOperacionesPorEstado("PENDIENTE");

    for (const op of operaciones) {
      if (!navigator.onLine) break; // se perdió la conexión a mitad de la cola

      await actualizarOperacionPendiente(op.id, {
        estado: "SINCRONIZANDO",
        intentos: (op.intentos || 0) + 1,
        ultimo_intento: new Date().toISOString(),
      });

      let error = null;
      let data = null;
      try {
        const respuesta = await client.rpc(
          RPC_POR_TIPO[op.tipo],
          Object.assign({}, op.payload, { p_idempotency_key: op.idempotency_key })
        );
        error = respuesta.error;
        data = respuesta.data;
      } catch (e) {
        error = e;
      }

      if (!error) {
        await actualizarOperacionPendiente(op.id, { estado: "SINCRONIZADA" });
        // B4: registrar auditoría de la sincronización exitosa (trazabilidad
        if (tipoAuditableFrontend(op.tipo) && typeof registrarAuditoria === "function") {
          const entidadId = typeof data === "string" ? data : String((data && data.id) || op.id || "");
          registrarAuditoria(op.tipo, "Operación " + (ETIQUETA_TIPO_OP[op.tipo] || op.tipo) + " sincronizada (era offline).", "exito", entidadId, op.idempotency_key, null);
        }
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
  async function alReconectar() {
    // Recuperar operaciones atrapadas en SINCRONIZANDO (p.ej. error de red
    // a mitad de sincronizacion) antes de intentar sincronizar la cola.
    await recuperarOperacionesAtrapadas();
    await sincronizarCola();
    if (appShell.classList.contains("visible")) {
      await refrescarTrasReconexion();
    } else {
      actualizarIndicadorConexion();
    }
  }
  window.addEventListener("online", alReconectar);
  window.addEventListener("offline", () => marcarConectividadReal("offline"));
  actualizarIndicadorConexion();
});

// ---- Lecturas: consultas directas a las tablas (protegidas por RLS/tiene_permiso).
function setMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "msg " + (ok ? "ok" : "error");
}

function explicarError(error, contexto) {
  console.error("[Battlecruiser]" + (contexto ? " (" + contexto + ")" : ""), error);
  const msg = ((error && error.message) || "").toLowerCase();
  if (!navigator.onLine || msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("timeout")) {
    return "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento.";
  }
  return (error && error.message) || "Ocurrió un error inesperado.";
}

const _cache = { productos: [], almacenes: [], stock: [], transferencias: [], vales: [], ventas: [] };

// "resuelto": marcar visto solo quita el realce visual de "nuevo" (punto
function prioridadAsunto(estado) {
  switch (estado) {
    case "REQUIERE_ATENCION": return "critico";
    case "PENDIENTE":
    case "SINCRONIZANDO": return "atencion";
    default: return "normal";
  }
}

// { nivel, texto, detalle }. Reglas: conexión y sincronización son
// estados distintos. Nunca verde si hay pendientes o atención.
function calcularEstadoOperacional(ops, sincronizando) {
  const pendiente = ops.filter((o) => o.estado === "PENDIENTE").length;
  const sincronizandoOps = ops.filter((o) => o.estado === "SINCRONIZANDO").length;
  const atencion = ops.filter((o) => o.estado === "REQUIERE_ATENCION").length;
  const offline = estaRealmenteDesconectado();

  if (atencion > 0) {
    return {
      nivel: "critico",
      texto: "Requiere atención",
      detalle: atencion + (atencion === 1 ? " operación requiere atención." : " operaciones requieren atención."),
    };
  }

  if (sincronizando || sincronizandoOps > 0) {
    return {
      nivel: "atencion",
      texto: "Sincronizando…",
      detalle: "Enviando operaciones pendientes al servidor.",
    };
  }

  if (pendiente > 0) {
    return {
      nivel: "atencion",
      texto: offline ? "Pendientes (sin conexión)" : "Operaciones pendientes",
      detalle: pendiente + (pendiente === 1 ? " operación pendiente de sincronizar." : " operaciones pendientes de sincronizar."),
    };
  }

  if (offline) {
    return {
      nivel: "normal",
      texto: "Sin conexión — al día",
      detalle: "Trabajando localmente. Sin operaciones pendientes.",
    };
  }

  return {
    nivel: "normal",
    texto: "Operativo",
    detalle: "Todo sincronizado.",
  };
}

function construirAsuntosAtencion(ops) {
  return ops
    .map((op) => ({
      op,
      prioridad: prioridadAsunto(op.estado),
      visto: _novedadesVistas.has(op.id),
    }))
    .sort((a, b) => {
      const orden = { critico: 0, atencion: 1, normal: 2 };
      const d = (orden[a.prioridad] != null ? orden[a.prioridad] : 3) - (orden[b.prioridad] != null ? orden[b.prioridad] : 3);
      if (d !== 0) return d;
      // dentro de la misma prioridad, FIFO (más antigua primero)
      return (a.op.creado_en < b.op.creado_en ? -1 : a.op.creado_en > b.op.creado_en ? 1 : 0);
    });
}

// (transferencias + vales + ventas), NO hace consultas nuevas. Cada
// actividad indica tipo, hora y resultado. No crea una segunda auditoría.
function construirActividadReciente() {
  const movs = [];
  (_cache.transferencias || []).forEach((t) => {
    movs.push({
      icono: "↔",
      texto: "Transferencia: " + (t.origen && t.origen.nombre ? t.origen.nombre : "?") + " → " + (t.destino && t.destino.nombre ? t.destino.nombre : "?"),
      fecha: t.fecha,
      resultado: t.estado || "",
    });
  });
  (_cache.vales || []).forEach((v) => {
    movs.push({
      icono: "📋",
      texto: "Vale (" + (v.tipo || "?") + "): " + (v.productos && v.productos.nombre ? v.productos.nombre : "?") + " · " + (v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "?"),
      fecha: v.fecha,
      resultado: money(v.cantidad) + " u",
    });
  });
  (_cache.ventas || []).forEach((v) => {
    movs.push({
      icono: "🛒",
      texto: "Venta: " + (v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "?"),
      fecha: v.fecha,
      resultado: "$" + money(v.total),
    });
  });
  return movs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8);
}

// ajustePendiente() (autoridad existente). El Centro de Control solo
// presenta; NO recalcula stock independientemente.
function construirStockBajo() {
  return (_cache.stock || []).filter((s) => s.minimo != null && s.cantidad <= s.minimo);
}

function proyeccionStock(producto_id, almacen_id, stockReal) {
  const { ajuste, noCalculable } = ajustePendiente(producto_id, almacen_id);
  return {
    stockReal: Number(stockReal) || 0,
    ajuste,
    proyeccion: (Number(stockReal) || 0) + ajuste,
    noCalculable,
  };
}

// ---- Render del Centro de Control ----

function renderEstadoNegocio(estado) {
  const el = document.getElementById("cc-estado");
  if (!el) return;
  el.className = "cc-estado cc-estado-" + estado.nivel;
  el.innerHTML =
    '<div class="cc-estado-cabecera">' +
      '<span class="cc-estado-titulo">' + escHtml(estado.texto) + "</span>" +
      '<span class="cc-estado-detalle">' + escHtml(estado.detalle) + "</span>" +
    "</div>";
}

function renderRequiereAtencion(asuntos) {
  const el = document.getElementById("cc-atencion");
  if (!el) return;
  const criticos = asuntos.filter((a) => a.prioridad === "critico");
  if (criticos.length === 0) {
    el.innerHTML = '<p class="lista-estado">Nada requiere atención ahora mismo.</p>';
    return;
  }
  el.innerHTML = "";
  criticos.forEach((a) => {
    const op = a.op;
    const tipo = ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación";
    const fecha = op.creado_en
      ? fechaHora(op.creado_en)
      : "—";
    const errorTxt = op.ultimo_error ? escHtml(String(op.ultimo_error)) : "Error de negocio.";
    const div = document.createElement("div");
    div.className = "cc-asunto cc-prioridad-critico" + (a.visto ? " visto" : "");
    div.dataset.id = op.id;
    div.innerHTML =
      '<span class="cc-asunto-principal">' +
        '<span class="cc-asunto-tipo">' + escHtml(tipo) + "</span>" +
        '<span class="muted cc-asunto-resumen">' + escHtml(resumenOperacionPendiente(op)) + "</span>" +
        '<span class="cc-asunto-motivo">' + errorTxt + "</span>" +
      "</span>" +
      '<span class="cc-asunto-lateral">' +
        '<span class="muted cc-asunto-meta">' + fecha + "</span>" +
        '<span class="cc-asunto-acciones">' +
          '<button type="button" class="cc-accion cc-ver-btn" data-id="' + escHtml(op.id) + '">Ver detalle</button>' +
          '<button type="button" class="cc-accion cc-reintentar-btn" data-id="' + escHtml(op.id) + '">Reintentar</button>' +
          '<button type="button" class="cc-accion cc-eliminar-btn" data-id="' + escHtml(op.id) + '">Eliminar</button>' +
        "</span>" +
      "</span>";
    el.appendChild(div);
    // desaparece porque el usuario ya está mirando la lista. No se borra
    // el dato ni se resuelve el problema.
    _novedadesVistas.add(op.id);
  });
}

function renderPendientesCompacto(asuntos) {
  const el = document.getElementById("cc-pendientes");
  if (!el) return;
  const pendientes = asuntos.filter((a) => a.prioridad === "atencion");
  const total = pendientes.length;
  if (total === 0) {
    el.innerHTML = '<p class="lista-estado">Sin operaciones pendientes.</p>';
    return;
  }
  el.innerHTML = "";
  const resumen = document.createElement("div");
  resumen.className = "cc-pendientes-resumen";
  resumen.innerHTML =
    '<span class="cc-pendientes-numero">' + total + "</span>" +
    "<span>" + (total === 1 ? "operación pendiente" : "operaciones pendientes") + "</span>" +
    '<button type="button" class="cc-accion cc-ir-pendientes-btn">Ver en Pendientes</button>';
  el.appendChild(resumen);

  const lista = document.createElement("div");
  lista.className = "cc-pendientes-lista";
  pendientes.slice(0, 4).forEach((a) => {
    const op = a.op;
    const tipo = ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación";
    const div = document.createElement("div");
    div.className = "cc-asunto cc-prioridad-atencion" + (a.visto ? " visto" : "");
    div.dataset.id = op.id;
    div.innerHTML =
      '<span class="cc-asunto-principal">' +
        '<span class="cc-asunto-tipo">' + escHtml(tipo) + "</span>" +
        '<span class="muted cc-asunto-resumen">' + escHtml(resumenOperacionPendiente(op)) + "</span>" +
      "</span>" +
      '<span class="cc-asunto-lateral">' +
        '<span class="cc-asunto-estado">' + escHtml(etiquetaEstadoPanel(op.estado)) + "</span>" +
      "</span>";
    lista.appendChild(div);
    _novedadesVistas.add(op.id);
  });
  el.appendChild(lista);
}

function renderActividadReciente() {
  const el = document.getElementById("cc-actividad");
  if (!el) return;
  const movs = construirActividadReciente();
  if (movs.length === 0) {
    el.innerHTML = '<p class="lista-estado">Todavía no hay actividad registrada.</p>';
    return;
  }
  el.innerHTML = "";
  movs.forEach((m) => {
    const div = document.createElement("div");
    div.className = "cc-actividad-item cc-prioridad-normal";
    const fechaTxt = m.fecha ? fechaHora(m.fecha) : "";
    div.innerHTML =
      '<span class="cc-actividad-icono">' + escHtml(m.icono) + "</span>" +
      '<span class="cc-actividad-texto">' + escHtml(m.texto) + "</span>" +
      '<span class="cc-actividad-meta">' +
        '<span class="muted">' + escHtml(fechaTxt) + "</span>" +
        '<span class="cc-actividad-resultado">' + escHtml(m.resultado) + "</span>" +
      "</span>";
    el.appendChild(div);
  });
}

function renderInventarioControl() {
  const el = document.getElementById("cc-inventario");
  if (!el) return;
  const bajo = construirStockBajo();
  if (bajo.length === 0) {
    el.innerHTML = '<p class="lista-estado">Nada bajo el mínimo por ahora.</p>';
    return;
  }
  el.innerHTML = "";
  bajo.slice(0, 5).forEach((s) => {
    const prodId = s.producto_id;
    const almId = s.almacen_id;
    const div = document.createElement("div");
    div.className = "cc-stock-item";
    // existente). No recalcula stock independientemente.
    const proj = proyeccionStock(prodId, almId, s.cantidad);
    const ajusteTxt = proj.noCalculable
      ? '<span class="muted">proyección no calculable</span>'
      : (proj.ajuste === 0
          ? ""
          : '<span class="cc-stock-ajuste">' + (proj.ajuste > 0 ? "+" : "") + money(proj.ajuste) + " pend.</span>");
    div.innerHTML =
      '<span class="cc-stock-principal">' +
        '<span class="cc-stock-nombre">' + escHtml(s.productos && s.productos.nombre ? s.productos.nombre : "?") +
          ' <span class="muted">· ' + escHtml(s.almacenes && s.almacenes.nombre ? s.almacenes.nombre : "?") + "</span></span>" +
        '<span class="cc-stock-proyeccion">' +
          '<span class="cc-stock-real">' + money(s.cantidad) + "</span>" +
          ajusteTxt +
          (proj.noCalculable ? "" : '<span class="cc-stock-proj">Proy: ' + money(proj.proyeccion) + "</span>") +
        "</span>" +
      "</span>";
    el.appendChild(div);
  });
  const ir = document.createElement("button");
  ir.type = "button";
  ir.className = "cc-accion cc-ir-inventario-btn";
  ir.textContent = "Ver inventario";
  el.appendChild(ir);
}

// Orquestador único del Centro de Control. Lee la cola una sola vez
async function refrescarCentroControl() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const ops = await obtenerOperacionesVisiblesPanel();
  const estado = calcularEstadoOperacional(ops, _sincronizando);
  const asuntos = construirAsuntosAtencion(ops);
  renderEstadoNegocio(estado);
  renderRequiereAtencion(asuntos);
  renderPendientesCompacto(asuntos);
  renderInventarioControl();
  renderActividadReciente();
  refrescarBadgeCentroControl(asuntos);
}

// hay asuntos críticos (REQUIERE_ATENCION) no vistos. Reutiliza el mismo
// patrón que el badge de Pendientes (.pendientes-tab-badge).
function refrescarBadgeCentroControl(asuntos) {
  const badge = document.getElementById("resumen-tab-badge");
  if (!badge) return;
  const criticosNoVistos = asuntos.filter((a) => a.prioridad === "critico" && !a.visto).length;
  if (criticosNoVistos === 0) {
    badge.classList.add("hidden");
    badge.classList.remove("atencion");
    badge.textContent = "";
  } else {
    badge.textContent = String(criticosNoVistos);
    badge.classList.add("atencion");
    badge.classList.remove("hidden");
  }
}

// existentes y la navegación por tabs. Un solo listener delegado (no uno
// por botón, los items se recrean en cada refresco). Evita botones muertos.
safeInit("centro-control-acciones", () => {
  const cont = document.getElementById("tab-resumen");
  if (!cont) return;
  cont.addEventListener("click", async (e) => {
    const ver = e.target.closest(".cc-ver-btn");
    if (ver) {
      e.stopPropagation();
      const op = await obtenerOperacionPendiente(ver.dataset.id);
      if (op) mostrarDetalleOperacion(op);
      else await refrescarCentroControl();
      return;
    }
    const reintentar = e.target.closest(".cc-reintentar-btn");
    if (reintentar) {
      e.stopPropagation();
      await reintentarOperacionPendiente(reintentar.dataset.id, reintentar);
      await refrescarCentroControl();
      return;
    }
    const eliminar = e.target.closest(".cc-eliminar-btn");
    if (eliminar) {
      e.stopPropagation();
      await eliminarOperacionPendienteConfirmada(eliminar.dataset.id, eliminar);
      await refrescarCentroControl();
      return;
    }
    const irPendientes = e.target.closest(".cc-ir-pendientes-btn");
    if (irPendientes) {
      e.stopPropagation();
      const btnTab = document.querySelector('.tab-btn[data-tab="pendientes"]');
      if (btnTab) btnTab.click();
      return;
    }
    const irInventario = e.target.closest(".cc-ir-inventario-btn");
    if (irInventario) {
      e.stopPropagation();
      const btnTab = document.querySelector('.tab-btn[data-tab="almacenes"]');
      if (btnTab) btnTab.click();
      return;
    }
    // Click en un item de atención/pendiente (no en un botón): detalle.
    const item = e.target.closest(".cc-asunto");
    if (item && item.dataset.id) {
      const op = await obtenerOperacionPendiente(item.dataset.id);
      if (op) mostrarDetalleOperacion(op);
    }
  });
});

function renderResumen() {
  const grid = document.getElementById("resumen-grid");
  if (!grid) return;

  const bajoMinimo = _cache.stock.filter((s) => s.minimo != null && s.cantidad <= s.minimo);

  // R2: el Centro de Control (pantalla inicial) ahora refleja la actividad
  const ventasRecientes = _cache.ventas || [];
  const totalVendido = ventasRecientes.reduce((s, v) => s + (Number(v.total) || 0), 0);

  grid.innerHTML = `
    <div class="resumen-card"><div class="valor">${_cache.productos.length}</div><div class="etiqueta">Productos</div></div>
    <div class="resumen-card"><div class="valor">${_cache.almacenes.length}</div><div class="etiqueta">Almacenes</div></div>
    <div class="resumen-card ${bajoMinimo.length ? "alerta resumen-card-accion" : ""}" ${bajoMinimo.length ? 'data-ir-tab="inventario" role="button" tabindex="0"' : ""}><div class="valor">${bajoMinimo.length}</div><div class="etiqueta">Bajo mínimo</div>${bajoMinimo.length ? '<div class="muted">Tocá para ver inventario</div>' : ""}</div>
    <div class="resumen-card"><div class="valor">$${money(totalVendido)}</div><div class="etiqueta">Ventas recientes</div><div class="muted">${ventasRecientes.length} venta(s)</div></div>
    <div class="resumen-card"><div class="valor">${_cache.transferencias.length + _cache.vales.length}</div><div class="etiqueta">Otros movimientos</div></div>
  `;

  const alertasEl = document.getElementById("resumen-alertas-lista");
  if (alertasEl) {
    if (bajoMinimo.length === 0) {
      alertasEl.innerHTML = '<p class="lista-estado">Nada bajo el mínimo por ahora.</p>';
    } else {
      // R3: alertas accionables. La cabecera muestra la cantidad afectada y un
      alertasEl.innerHTML = "";
      const cab = document.createElement("div");
      cab.className = "lista-item alerta-cabecera";
      cab.innerHTML = '<span class="cc-asunto-tipo">' + bajoMinimo.length + ' producto(s) bajo mínimo</span>'
        + '<button type="button" class="cc-accion alerta-ir-btn" data-ir-tab="inventario">Ver inventario</button>';
      alertasEl.appendChild(cab);
      bajoMinimo.forEach((s) => {
        const div = document.createElement("div");
        div.className = "lista-item alerta-item";
        div.setAttribute("data-ir-tab", "inventario");
        div.setAttribute("role", "button");
        div.setAttribute("tabindex", "0");
        div.innerHTML = `<span>${escHtml(s.productos.nombre)} <span class="muted">· ${escHtml(s.almacenes.nombre)}</span></span>
          <span class="muted" style="color:var(--wine)">${money(s.cantidad)} ⚠</span>`;
        alertasEl.appendChild(div);
      });
    }
  }

  const movsEl = document.getElementById("resumen-movs-lista");
  if (movsEl) {
    // R9: cada movimiento lleva tipo + id reales para ser accionable
    // (click/Enter navega a la sección correspondiente). Reutiliza _cache
    // (no consulta nueva). Incluye ventas (R2), transferencias y vales.
    const movs = [
      ...(_cache.ventas || []).map((v) => ({
        tipo: "venta", id: v.id, fecha: v.fecha,
        texto: `Venta: ${v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "?"}`, estado: "$" + money(v.total),
      })),
      ..._cache.transferencias.map((t) => ({
        tipo: "transferencia", id: t.id, fecha: t.fecha,
        texto: `Transferencia: ${t.origen.nombre} → ${t.destino.nombre}`, estado: t.estado,
      })),
      ..._cache.vales.map((v) => ({
        tipo: "vale", id: v.id, fecha: v.fecha,
        texto: `Vale (${v.tipo}): ${v.productos.nombre} · ${v.almacenes.nombre}`, estado: money(v.cantidad),
      })),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8);

    if (movs.length === 0) {
      movsEl.innerHTML = '<p class="lista-estado">Todavía no hay movimientos registrados.</p>';
    } else {
      movsEl.innerHTML = "";
      movs.forEach((m) => {
        const div = document.createElement("div");
        // R9: accionable. data-mov-tipo + data-mov-tab permiten navegar a la
        // sección del movimiento. role/tabindex para teclado (Enter).
        const tabDestino = m.tipo === "venta" ? "ventas" : m.tipo === "transferencia" ? "transferencias" : "vales";
        div.className = "lista-item lista-item-accion resumen-mov-item";
        div.setAttribute("data-mov-tipo", m.tipo);
        div.setAttribute("data-mov-id", m.id || "");
        div.setAttribute("data-mov-tab", tabDestino);
        div.setAttribute("role", "button");
        div.setAttribute("tabindex", "0");
        div.innerHTML = `<span>${fechaCorta(m.fecha)} <span class="muted">· ${escHtml(m.tipo)}</span></span>
          <span class="muted">${m.texto} · ${m.estado}</span>`;
        movsEl.appendChild(div);
      });
    }
  }
  // actividad reciente e inventario. Cuando _cache cambia, refrescar el
  // Centro tambien. No hace consultas nuevas: solo pinta desde _cache.
  if (typeof refrescarCentroControl === "function") refrescarCentroControl();
}

// R3: helper de navegación reutilizable. Activa un tab por data-tab usando
function irATab(tab) {
  if (!tab) return;
  const btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  if (btn) btn.click();
}

// ---- Navegación por tabs ----
safeInit("tabs", () => {
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("visible"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("visible");
    // el panel para mostrar el estado actual de la cola (una sola
    // lectura, solo cuando hace falta).
    if (btn.dataset.tab === "pendientes") {
      refrescarPanelPendientes();
    } else if (btn.dataset.tab === "resumen") {
      // refrescar el estado operacional derivado de la cola real.
      if (typeof refrescarCentroControl === "function") refrescarCentroControl();
    } else if (btn.dataset.tab === "reportes") {
      // B5: al entrar a Reportes, cargar resumen y detalle.
      if (typeof refrescarReportes === "function") refrescarReportes();
    } else if (btn.dataset.tab === "inventario") {
      // B6: al entrar a Inventario, cargar el inventario enriquecido.
      if (typeof refrescarInventario === "function") refrescarInventario();
    } else if (btn.dataset.tab === "movimientos") {
      // B6: al entrar a Movimientos, cargar la trazabilidad.
      if (typeof refrescarMovimientos === "function") refrescarMovimientos();
    } else if (btn.dataset.tab === "turnos") {
      // B7: al entrar a Turnos, cargar el turno actual e historial.
      if (typeof refrescarTurnos === "function") refrescarTurnos();
    } else if (btn.dataset.tab === "operacion") {
      // B7: al entrar a Operación, cargar responsabilidades e incidencias.
      if (typeof refrescarOperacion === "function") refrescarOperacion();
    } else if (btn.dataset.tab === "comunicacion") {
      // B8: al entrar a Comunicación, cargar conversaciones.
      if (typeof refrescarComunicacion === "function") refrescarComunicacion();
    } else if (btn.dataset.tab === "mando") {
      // B4: al entrar al Centro de Mando, refrescar estado/alertas/auditoría.
      if (typeof refrescarCentroMando === "function") refrescarCentroMando();
    } else if (btn.dataset.tab === "usuarios") {
      const infoEl = document.getElementById("usuario-actual-info");
      if (infoEl && typeof _usuarioActual !== "undefined" && _usuarioActual) {
        infoEl.textContent = "Sesión: " + (_usuarioActual.nombre || "") + (_usuarioActual.rol ? " · " + _usuarioActual.rol : "");
      }
      if (typeof refrescarUsuarios === "function") refrescarUsuarios();
    } else if (btn.dataset.tab === "config") {
      if (typeof refrescarRolesAdmin === "function") refrescarRolesAdmin();
    }
    if (btn.dataset.tab !== "pendientes" && typeof cerrarDetalleOperacion === "function") {
      // Al salir de la pestana Pendientes, cerrar el detalle si estaba
      // abierto para que no quede visible encima de otra seccion.
      cerrarDetalleOperacion();
    }
  });
});

// R3: navegación accionable del Centro de Control. Items del panel "Stock
// bajo mínimo" y el card "Bajo mínimo" llevan directo a Inventario con un
// click o Enter. Reutiliza irATab() y el listener de tabs existente.
safeInit("resumen-alertas-accion", () => {
  const panel = document.getElementById("tab-resumen");
  if (!panel) return;
  const manejar = (target) => {
    const accion = target.closest("[data-ir-tab]");
    if (!accion) return;
    irATab(accion.getAttribute("data-ir-tab"));
  };
  panel.addEventListener("click", (e) => manejar(e.target));
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      manejar(e.target);
      if (e.target.closest("[data-ir-tab]")) e.preventDefault();
    }
  });
});

// R9: cada movimiento de "Últimos movimientos" (venta/transferencia/vale) es
// accionable: click/Enter navega al tab correspondiente conservando el ID.
// Reutiliza irATab() + _cache. Sin segundo router, offline-first intacto.
safeInit("resumen-movs-accion", () => {
  const movsEl = document.getElementById("resumen-movs-lista");
  if (!movsEl) return;
  const abrir = (target) => {
    const item = target.closest(".resumen-mov-item[data-mov-tab]");
    if (!item) return;
    irATab(item.getAttribute("data-mov-tab"));
  };
  movsEl.addEventListener("click", (e) => abrir(e.target));
  movsEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target.closest(".resumen-mov-item[data-mov-tab]")) { e.preventDefault(); abrir(e.target); }
    }
  });
});

// ---- Menú lateral desplegable — reemplaza los tabs horizontales ----
safeInit("menu-lateral", () => {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const toggleBtn = document.getElementById("sidebar-toggle-btn");
  const closeBtn = document.getElementById("sidebar-close-btn");

  function abrirMenu() {
    sidebar.classList.add("open");
    backdrop.classList.add("visible");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  function cerrarMenu() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("visible");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.contains("open") ? cerrarMenu() : abrirMenu();
  });
  closeBtn.addEventListener("click", cerrarMenu);
  backdrop.addEventListener("click", cerrarMenu);
  sidebar.addEventListener("click", (e) => {
    if (e.target.closest(".tab-btn")) cerrarMenu();
  });

  window._battlecruiserCerrarMenuLateral = cerrarMenu;
});

function fillSelect(select, rows, valueKey, labelFn, keepFirst) {
  const first = keepFirst ? select.querySelector("option") : null;
  select.innerHTML = "";
  if (first) select.appendChild(first);
  rows.forEach((row) => {
    const opt = document.createElement("option");
    opt.value = row[valueKey];
    opt.textContent = labelFn(row);
    select.appendChild(opt);
  });
}

async function cargarCategorias() {
  return withCache("categorias", () => client.from("categorias").select("id, nombre").order("nombre"));
}

async function cargarAlmacenes() {
  // reflejar el estado que activar_desactivar_almacen (RPC "almacen_estado")
  // modifica. No cambia el resto de la forma de la caché.
  return withCache("almacenes", () => client.from("almacenes").select("id, nombre, tipo, activo").order("nombre"));
}

async function cargarProductos() {
  return withCache("productos", () => client
    .from("productos")
    .select("id, nombre, unidad, precio_normal, precio_mayorista, activo, imagen_url, categoria_id, categorias(nombre), presentaciones(nombre)")
    .order("nombre"));
}

const PROD_IMAGEN_TIPOS_VALIDOS = ["image/jpeg", "image/png", "image/jpg"];
const PROD_IMAGEN_TAMANO_MAX = 5 * 1024 * 1024; // 5MB, igual al límite del bucket

function validarArchivoImagenProducto(file) {
  if (!file) return null;
  if (!PROD_IMAGEN_TIPOS_VALIDOS.includes(file.type)) {
    return "Formato no permitido. Usa JPG o PNG.";
  }
  if (file.size > PROD_IMAGEN_TAMANO_MAX) {
    return "La imagen es muy grande (máximo 5MB).";
  }
  return null;
}

function extensionImagen(file) {
  if (file.type === "image/png") return "png";
  return "jpg";
}

// Sube el archivo a Storage y guarda la URL en el producto vía RPC.
// Requiere conexión real y requiere que el producto ya exista (tenga id).
async function subirImagenProducto(productoId, file) {
  const nombreArchivo = `${productoId}/${Date.now()}.${extensionImagen(file)}`;
  const { error: errorSubida } = await client.storage
    .from("productos")
    .upload(nombreArchivo, file, { upsert: true, contentType: file.type });
  if (errorSubida) {
    return { ok: false, error: errorSubida };
  }
  const { data: urlData } = client.storage.from("productos").getPublicUrl(nombreArchivo);
  const { error: errorRpc } = await client.rpc("actualizar_imagen_producto", {
    p_producto_id: productoId,
    p_imagen_url: urlData.publicUrl,
  });
  if (errorRpc) {
    return { ok: false, error: errorRpc };
  }
  return { ok: true, url: urlData.publicUrl };
}

async function quitarImagenProducto(productoId) {
  const { error } = await client.rpc("actualizar_imagen_producto", {
    p_producto_id: productoId,
    p_imagen_url: null,
  });
  return { ok: !error, error };
}

// Vista previa local del archivo elegido en el form (antes de subir nada).
safeInit("prod-imagen-input", () => {
  const input = document.getElementById("prod-imagen-input");
  const wrap = document.getElementById("prod-imagen-preview-wrap");
  const img = document.getElementById("prod-imagen-preview");
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    setMsg("msg-prod-imagen", "", true);
    if (!file) { wrap.classList.add("hidden"); return; }
    const error = validarArchivoImagenProducto(file);
    if (error) {
      setMsg("msg-prod-imagen", error, false);
      input.value = "";
      wrap.classList.add("hidden");
      return;
    }
    const url = URL.createObjectURL(file);
    img.src = url;
    wrap.classList.remove("hidden");
  });

  document.getElementById("prod-imagen-quitar").addEventListener("click", async () => {
    const editandoId = document.getElementById("prod-editando-id").value || null;
    input.value = "";
    document.getElementById("prod-imagen-preview-wrap").classList.add("hidden");
    // Si estamos editando un producto que YA tenía imagen guardada en
    if (editandoId && document.getElementById("prod-imagen-preview").dataset.guardada === "true") {
      if (estaRealmenteDesconectado()) {
        setMsg("msg-prod-imagen", "Necesitas conexión para quitar la imagen guardada.", false);
        return;
      }
      const resultado = await quitarImagenProducto(editandoId);
      if (!resultado.ok) {
        setMsg("msg-prod-imagen", "No se pudo quitar la imagen.", false);
        return;
      }
      document.getElementById("prod-imagen-preview").dataset.guardada = "false";
      setMsg("msg-prod-imagen", "Imagen quitada.", true);
      await refrescarProductos();
    }
  });
});

async function refrescarProductos() {
  setLoading("lista-productos", "Cargando productos…");
  const [productos, categorias, almacenes] = await Promise.all([
    cargarProductos(), cargarCategorias(), cargarAlmacenes(),
  ]);
  _cache.productos = productos;
  renderResumen();

  fillSelect(document.getElementById("prod-categoria"), categorias, "id", (c) => c.nombre, true);
  fillSelect(document.getElementById("compra-producto"), productos, "id", (p) => p.nombre);
  fillSelect(document.getElementById("compra-almacen"), almacenes, "id", (a) => a.nombre);

  // El selector de producto de "Registrar compra" no conserva un valor en
  const compraProductoSelect = document.getElementById("compra-producto");
  if (compraProductoSelect) actualizarSelectorCompraPresentacion(compraProductoSelect.value);

  // Selector de "Presentaciones por producto": se refresca junto con la
  // lista de productos para que siempre esté al día, preservando la
  // selección actual si el producto elegido sigue existiendo.
  const ppProductoSelect = document.getElementById("pp-producto-select");
  if (ppProductoSelect) {
    const seleccionPPActual = ppProductoSelect.value;
    fillSelect(ppProductoSelect, productos, "id", (p) => p.nombre, true);
    if (seleccionPPActual && productos.some((p) => p.id === seleccionPPActual)) {
      ppProductoSelect.value = seleccionPPActual;
    }
  }

  const lista = document.getElementById("lista-productos");
  if (productos.length === 0) {
    setEmpty("lista-productos", mensajeListaVacia("productos", "Todavía no hay productos cargados."));
  } else {
    lista.innerHTML = "";
    const puedeEditar = tienePermiso("productos", "editar");
    productos.forEach((p) => {
      const div = document.createElement("div");
      div.className = "lista-item" + (p.activo === false ? " lista-item-inactivo" : "");
      const estadoTxt = p.activo === false ? '<span class="muted">· Inactivo</span>' : "";
      let botones = "";
      if (puedeEditar) {
        botones = `<span class="lista-item-acciones">
          <button type="button" class="btn-editar-producto" data-id="${p.id}">Editar</button>
          <button type="button" class="btn-toggle-producto" data-id="${p.id}" data-activo="${p.activo !== false}">${p.activo === false ? "Activar" : "Desactivar"}</button>
        </span>`;
      }
      const miniatura = p.imagen_url
        ? `<img src="${escHtml(p.imagen_url)}" alt="" class="producto-thumb" loading="lazy">`
        : `<span class="producto-thumb producto-thumb-vacia" aria-hidden="true"></span>`;
      div.innerHTML = `${miniatura}<span>${escHtml(p.nombre)} <span class="muted">${p.categorias ? "· " + escHtml(p.categorias.nombre) : ""}${p.presentaciones ? " · " + escHtml(p.presentaciones.nombre) : ""}</span> ${estadoTxt}</span>
        <span class="muted">Normal $${money(p.precio_normal)} · Mayorista $${money(p.precio_mayorista)}</span>
        ${botones}`;
      lista.appendChild(div);
    });
  }

  return { productos, almacenes };
}

// eventos sobre #lista-productos (los botones se recrean en cada refresco).
safeInit("lista-productos", () => {
  document.getElementById("lista-productos").addEventListener("click", async (e) => {
    const btnEditar = e.target.closest(".btn-editar-producto");
    if (btnEditar) {
      const producto = (_cache.productos || []).find((p) => p.id === btnEditar.dataset.id);
      if (producto) iniciarEdicionProducto(producto);
      return;
    }
    const btnToggle = e.target.closest(".btn-toggle-producto");
    if (btnToggle) {
      const id = btnToggle.dataset.id;
      const activoActual = btnToggle.dataset.activo === "true";
      btnToggle.disabled = true;
      const resultado = await ejecutarOperacion("producto_estado", {
        p_producto_id: id,
        p_activo: !activoActual,
      });
      btnToggle.disabled = false;
      if (!resultado.ok) {
        setMsg("msg-productos", (resultado.error && resultado.error.message) || "No se pudo cambiar el estado del producto.", false);
        return;
      }
      setMsg("msg-productos", resultado.offline
        ? "Cambio de estado guardado, se sincronizará cuando vuelva la conexión."
        : (activoActual ? "Producto desactivado." : "Producto activado."), true);
      if (!resultado.offline) await refrescarProductos();
    }
  });
});

// Llena el formulario de productos con los datos de un producto existente y
// lo pone en "modo edición" (el submit pasa a llamar a producto_actualizar
// en vez de crear uno nuevo).
function iniciarEdicionProducto(p) {
  document.getElementById("prod-editando-id").value = p.id;
  document.getElementById("prod-nombre").value = p.nombre || "";
  document.getElementById("prod-unidad").value = p.unidad || "";
  document.getElementById("prod-precio-normal").value = p.precio_normal != null ? p.precio_normal : "";
  document.getElementById("prod-precio-mayorista").value = p.precio_mayorista != null ? p.precio_mayorista : "";
  const categoriaSelect = document.getElementById("prod-categoria");
  if (categoriaSelect) {
    // limpiar el select explícitamente. Antes, si p.categorias era null, el
    // if no entraba y el select conservaba la categoría de una edición anterior.
    if (p.categorias) {
      const opcion = Array.from(categoriaSelect.options).find((o) => o.textContent === p.categorias.nombre);
      if (opcion) categoriaSelect.value = opcion.value;
      else categoriaSelect.value = "";
    } else {
      categoriaSelect.value = "";
    }
  }
  const submitBtn = document.getElementById("prod-submit-btn");
  if (submitBtn) submitBtn.textContent = "Guardar cambios";
  const cancelarBtn = document.getElementById("prod-cancelar-edicion");
  if (cancelarBtn) cancelarBtn.classList.remove("hidden");
  const preview = document.getElementById("prod-imagen-preview");
  const wrap = document.getElementById("prod-imagen-preview-wrap");
  document.getElementById("prod-imagen-input").value = "";
  if (p.imagen_url) {
    preview.src = p.imagen_url;
    preview.dataset.guardada = "true";
    wrap.classList.remove("hidden");
  } else {
    preview.removeAttribute("src");
    preview.dataset.guardada = "false";
    wrap.classList.add("hidden");
  }
  setMsg("msg-prod-imagen", "", true);
  document.getElementById("form-producto").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelarEdicionProducto() {
  document.getElementById("form-producto").reset();
  document.getElementById("prod-editando-id").value = "";
  const submitBtn = document.getElementById("prod-submit-btn");
  if (submitBtn) submitBtn.textContent = "Agregar producto";
  const cancelarBtn = document.getElementById("prod-cancelar-edicion");
  if (cancelarBtn) cancelarBtn.classList.add("hidden");
  document.getElementById("prod-imagen-preview-wrap").classList.add("hidden");
  document.getElementById("prod-imagen-preview").removeAttribute("src");
  document.getElementById("prod-imagen-preview").dataset.guardada = "false";
  setMsg("msg-prod-imagen", "", true);
}

safeInit("prod-cancelar-edicion", () => {
  document.getElementById("prod-cancelar-edicion").addEventListener("click", cancelarEdicionProducto);
});

safeInit("form-producto", () => {
  document.getElementById("form-producto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("prod-nombre").value.trim();
    const categoria_id = document.getElementById("prod-categoria").value || null;
    const unidad = document.getElementById("prod-unidad").value.trim() || null;
    const precio_normal = parseFloat(document.getElementById("prod-precio-normal").value);
    const precioMayoristaRaw = document.getElementById("prod-precio-mayorista").value.trim();
    const precio_mayorista = precioMayoristaRaw === "" ? null : parseFloat(precioMayoristaRaw);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (!(precio_normal > 0)) {
      setMsg("msg-productos", "El precio normal debe ser mayor a 0.", false);
      return;
    }
    if (precio_mayorista !== null && !(precio_mayorista > 0)) {
      setMsg("msg-productos", "El precio mayorista debe ser mayor a 0.", false);
      return;
    }

    const editandoId = document.getElementById("prod-editando-id").value || null;
    // Se captura el archivo ANTES de que cancelarEdicionProducto() limpie
    // el input, para poder subirlo después de que el producto quede
    // guardado (nuevo o editado) con un id real en Supabase.
    const archivoImagenInput = document.getElementById("prod-imagen-input");
    const archivoImagen = archivoImagenInput.files && archivoImagenInput.files[0];
    if (archivoImagen) {
      const errorArchivo = validarArchivoImagenProducto(archivoImagen);
      if (errorArchivo) {
        setMsg("msg-prod-imagen", errorArchivo, false);
        return;
      }
    }
    submitBtn.disabled = true;
    const resultado = editandoId
      ? await ejecutarOperacion("producto_actualizar", {
          p_producto_id: editandoId,
          p_nombre: nombre,
          p_categoria_id: categoria_id,
          p_unidad: unidad,
          p_precio_normal: precio_normal,
          p_precio_mayorista: precio_mayorista,
        })
      : await ejecutarOperacion("producto", {
          p_nombre: nombre,
          p_categoria_id: categoria_id,
          p_unidad: unidad,
          p_precio_normal: precio_normal,
          p_precio_mayorista: precio_mayorista,
        });
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-productos", "No se pudo " + (editandoId ? "editar" : "crear") + ": " + explicarError(resultado.error, editandoId ? "editar producto" : "crear producto"), false);
      return;
    }
    const estabaEditando = !!editandoId;
    cancelarEdicionProducto(); // limpia el form y vuelve a modo "crear" en ambos casos
    if (resultado.offline) {
      setMsg("msg-productos", "✓ Guardado localmente — se sincronizará al recuperar conexión."
        + (archivoImagen ? " La imagen no se pudo subir sin conexión: agrégala editando el producto una vez sincronizado." : ""), true);
      return;
    }
    // El producto quedó guardado con un id real (creado o editado online).
    // Si el usuario había elegido una imagen, se sube ahora — acción
    // inmediata, fuera de la cola offline (ver subirImagenProducto).
    const productoIdReal = editandoId || resultado.data;
    if (archivoImagen && productoIdReal) {
      const resultadoImagen = await subirImagenProducto(productoIdReal, archivoImagen);
      if (!resultadoImagen.ok) {
        setMsg("msg-productos", (estabaEditando ? "Producto actualizado, " : "Producto creado, ")
          + "pero no se pudo subir la imagen: " + explicarError(resultadoImagen.error, "subir imagen"), false);
        await refrescarProductos();
        return;
      }
    }
    setMsg("msg-productos", estabaEditando ? "Producto actualizado." : "Producto creado.", true);
    await refrescarProductos();
  });
});

let _compraAsociacionesCache = [];

async function actualizarSelectorCompraPresentacion(producto_id) {
  const select = document.getElementById("compra-presentacion");
  if (!select) return;

  if (!producto_id) {
    _compraAsociacionesCache = [];
    fillSelect(select, [], "presentacion_id", () => "", true);
    actualizarModoCompra();
    return;
  }

  const asociaciones = await cargarAsociacionesProducto(producto_id);
  _compraAsociacionesCache = asociaciones.filter((pp) => pp.activo);
  fillSelect(
    select, _compraAsociacionesCache, "presentacion_id",
    (pp) => `${pp.presentaciones.nombre} × ${formatFactor(pp.factor)}`, true
  );
  actualizarModoCompra();
}

function presentacionCompraActual() {
  const select = document.getElementById("compra-presentacion");
  if (!select || !select.value) return null;
  return _compraAsociacionesCache.find((pp) => pp.presentacion_id === select.value) || null;
}

// Cambia placeholders/validación de "Cantidad" y "Costo" según el modo, y
// refresca el resumen visual. No toca ningún dato de inventario: solo UX.
function actualizarModoCompra() {
  const cantidadInput = document.getElementById("compra-cantidad");
  const costoInput = document.getElementById("compra-costo");
  if (!cantidadInput || !costoInput) return;

  const pp = presentacionCompraActual();
  if (pp) {
    cantidadInput.placeholder = "Cantidad de " + pp.presentaciones.nombre.toLowerCase();
    cantidadInput.step = "1";
    cantidadInput.min = "1";
  } else {
    cantidadInput.placeholder = "Cantidad de unidades base";
    cantidadInput.step = "0.01";
    cantidadInput.min = "0.01";
  }
  costoInput.placeholder = pp ? "Costo por " + pp.presentaciones.nombre.toLowerCase() : "Costo unitario";

  actualizarResumenCompra();
}

function actualizarResumenCompra() {
  const resumen = document.getElementById("compra-resumen");
  if (!resumen) return;

  const pp = presentacionCompraActual();
  if (!pp) {
    resumen.classList.add("hidden");
    return;
  }

  const cantidad = parseFloat(document.getElementById("compra-cantidad").value);
  const costo = parseFloat(document.getElementById("compra-costo").value);
  const cantidadValida = Number.isInteger(cantidad) && cantidad > 0;
  const costoValido = costo > 0;

  document.getElementById("compra-resumen-cantidad").textContent = cantidadValida
    ? cantidad + " × " + pp.presentaciones.nombre + " (1 " + pp.presentaciones.nombre + " = " + formatFactor(pp.factor) + " unidades)"
    : "—";
  document.getElementById("compra-resumen-equivalente").textContent = cantidadValida
    ? money(cantidad * pp.factor) + " unidades base"
    : "—";
  document.getElementById("compra-resumen-costo").textContent = costoValido
    ? "$" + money(costo) + " por " + pp.presentaciones.nombre
    : "—";
  document.getElementById("compra-resumen-total").textContent = cantidadValida && costoValido
    ? "$" + money(cantidad * costo)
    : "—";

  resumen.classList.remove("hidden");
}

safeInit("form-compra", () => {
  const productoSelect = document.getElementById("compra-producto");
  const presentacionSelect = document.getElementById("compra-presentacion");
  const cantidadInput = document.getElementById("compra-cantidad");
  const costoInput = document.getElementById("compra-costo");

  productoSelect.addEventListener("change", () => {
    actualizarSelectorCompraPresentacion(productoSelect.value);
  });
  presentacionSelect.addEventListener("change", actualizarModoCompra);
  cantidadInput.addEventListener("input", actualizarResumenCompra);
  costoInput.addEventListener("input", actualizarResumenCompra);

  document.getElementById("form-compra").addEventListener("submit", async (e) => {
    e.preventDefault();
    const producto_id = productoSelect.value;
    const almacen_id = document.getElementById("compra-almacen").value;
    const cantidad = parseFloat(cantidadInput.value);
    const costo_unitario = parseFloat(costoInput.value);
    const pp = presentacionCompraActual();
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (!(costo_unitario > 0)) {
      setMsg("msg-productos", "El costo debe ser mayor a 0.", false);
      return;
    }
    if (pp) {
      if (!Number.isInteger(cantidad) || cantidad < 1) {
        setMsg("msg-productos", "La cantidad de " + pp.presentaciones.nombre.toLowerCase() + " debe ser un número entero mayor a 0.", false);
        return;
      }
    } else if (!(cantidad > 0)) {
      setMsg("msg-productos", "La cantidad debe ser mayor a 0.", false);
      return;
    }

    submitBtn.disabled = true;
    const resultado = await ejecutarOperacion("compra", {
      p_producto_id: producto_id, p_almacen_id: almacen_id,
      p_cantidad: cantidad, p_costo_unitario: costo_unitario,
      p_presentacion_id: pp ? pp.presentacion_id : null,
      p_cantidad_presentacion: pp ? cantidad : null,
    });
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-productos", "No se pudo registrar la compra: " + explicarError(resultado.error, "registrar compra"), false);
      return;
    }
    e.target.reset();
    document.getElementById("compra-resumen").classList.add("hidden");
    if (resultado.offline) {
      setMsg("msg-productos", "✓ Guardada localmente — se sincronizará al recuperar conexión.", true);
      return;
    }
    setMsg("msg-productos", "Compra registrada, stock actualizado.", true);
    await refrescarStockYSelects();
  });
});

// ---- Presentaciones comerciales — dentro de Productos. Un producto puede
let _permisosPresentaciones = { ver: true, crear: false, editar: false, borrar: false };
let _presentacionesCache = [];
let _asociacionesProductoCache = [];
let _productoPresentacionesActual = null;

function formatFactor(n) {
  const v = Number(n);
  return Number.isFinite(v) ? String(v) : String(n);
}

async function cargarPermisosPresentaciones() {
  if (!navigator.onLine) {
    return { ver: true, crear: false, editar: false, borrar: false };
  }
  const acciones = ["ver", "crear", "editar", "borrar"];
  try {
    const resultados = await Promise.all(
      acciones.map((accion) => client.rpc("tiene_permiso", { p_seccion: "presentaciones", p_accion: accion }))
    );
    const permisos = {};
    acciones.forEach((accion, i) => { permisos[accion] = resultados[i].data === true; });
    return permisos;
  } catch (e) {
    console.warn("[Battlecruiser] No se pudieron cargar permisos de presentaciones:", e);
    return { ver: true, crear: false, editar: false, borrar: false };
  }
}

async function cargarPresentacionesTodas() {
  return withCache("presentaciones", () => client.from("presentaciones").select("id, nombre, activo").order("nombre"));
}

const _factoresConocidos = {}; // "producto_id::presentacion_id" -> factor

function _claveFactor(producto_id, presentacion_id) {
  return producto_id + "::" + presentacion_id;
}

function _registrarFactoresConocidos(producto_id, asociaciones) {
  (asociaciones || []).forEach((pp) => {
    if (pp && pp.presentacion_id && pp.factor != null && Number.isFinite(Number(pp.factor))) {
      _factoresConocidos[_claveFactor(producto_id, pp.presentacion_id)] = Number(pp.factor);
    }
  });
}

// Devuelve el factor si ya se conoce de forma confiable, o null si no hay
// información suficiente en la caché actual (nunca inventa un valor).
function factorPresentacionConocido(producto_id, presentacion_id) {
  const v = _factoresConocidos[_claveFactor(producto_id, presentacion_id)];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function cargarAsociacionesProducto(producto_id) {
  const asociaciones = await withCache("asociaciones:" + producto_id, () => client
    .from("producto_presentaciones")
    .select("id, factor, activo, presentacion_id, presentaciones(nombre)")
    .eq("producto_id", producto_id)
    .order("created_at"));
  _registrarFactoresConocidos(producto_id, asociaciones);
  return asociaciones;
}

function renderCatalogoPresentaciones() {
  if (_presentacionesCache.length === 0) {
    setEmpty("lista-presentaciones-catalogo", mensajeListaVacia("presentaciones", "Todavía no hay presentaciones creadas."));
    return;
  }
  const cont = document.getElementById("lista-presentaciones-catalogo");
  cont.innerHTML = "";
  _presentacionesCache.forEach((p) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `
      <span>${escHtml(p.nombre)}${p.activo ? "" : ' <span class="muted">· Inactiva</span>'}</span>
      <span class="pres-acciones">
        ${_permisosPresentaciones.editar ? `<button type="button" class="pres-editar-btn" data-id="${p.id}">Editar</button>` : ""}
        ${_permisosPresentaciones.borrar ? `<button type="button" class="pres-toggle-btn" data-id="${p.id}" data-activo="${p.activo}">${p.activo ? "Desactivar" : "Activar"}</button>` : ""}
      </span>`;
    cont.appendChild(div);
  });
}

async function refrescarPresentacionesCatalogo() {
  setLoading("lista-presentaciones-catalogo", "Cargando…");
  _presentacionesCache = await cargarPresentacionesTodas();
  renderCatalogoPresentaciones();
  actualizarSelectPresentacionesDisponibles();
}

function actualizarSelectPresentacionesDisponibles() {
  const select = document.getElementById("pp-presentacion-select");
  if (!select) return;
  // Solo presentaciones activas y que el producto elegido todavía no tenga
  // asociadas de forma activa (evita el error de asociación duplicada antes
  // de intentarlo; el backend igual lo impide si algo se escapa acá).
  const enUsoActivo = new Set(_asociacionesProductoCache.filter((pp) => pp.activo).map((pp) => pp.presentacion_id));
  const disponibles = _presentacionesCache.filter((p) => p.activo && !enUsoActivo.has(p.id));
  fillSelect(select, disponibles, "id", (p) => p.nombre, true);
}

function renderAsociacionesProducto() {
  const cont = document.getElementById("pp-lista-asociaciones");
  if (_asociacionesProductoCache.length === 0) {
    const clave = "asociaciones:" + (_productoPresentacionesActual || "");
    setEmpty("pp-lista-asociaciones", mensajeListaVacia(clave, "Este producto todavía no tiene presentaciones asociadas."));
    return;
  }
  cont.innerHTML = "";
  _asociacionesProductoCache.forEach((pp) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `
      <span>${escHtml(pp.presentaciones.nombre)} <span class="muted">× ${formatFactor(pp.factor)}</span>${pp.activo ? "" : ' <span class="muted">· Inactiva</span>'}</span>
      <span class="pp-acciones">
        ${_permisosPresentaciones.editar ? `<button type="button" class="pp-editar-btn" data-id="${pp.id}" data-factor="${pp.factor}">Editar factor</button>` : ""}
        ${_permisosPresentaciones.borrar ? `<button type="button" class="pp-toggle-btn" data-id="${pp.id}" data-activo="${pp.activo}">${pp.activo ? "Desactivar" : "Activar"}</button>` : ""}
      </span>`;
    cont.appendChild(div);
  });
}

async function refrescarAsociacionesProducto(producto_id) {
  setLoading("pp-lista-asociaciones", "Cargando…");
  _asociacionesProductoCache = await cargarAsociacionesProducto(producto_id);
  renderAsociacionesProducto();
  actualizarSelectPresentacionesDisponibles();
}

safeInit("presentaciones-catalogo", () => {
  const form = document.getElementById("form-presentacion-nueva");
  const input = document.getElementById("pres-nombre-nueva");
  const lista = document.getElementById("lista-presentaciones-catalogo");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = input.value.trim();
    if (!nombre) return;
    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    const { error } = await client.from("presentaciones").insert({ nombre });
    submitBtn.disabled = false;
    if (error) {
      const msg = error.code === "23505" ? "Ya existe una presentación con ese nombre." : explicarError(error, "crear presentación");
      setMsg("msg-presentaciones", "No se pudo crear: " + msg, false);
      return;
    }
    setMsg("msg-presentaciones", "Presentación creada.", true);
    form.reset();
    await refrescarPresentacionesCatalogo();
  });

  lista.addEventListener("click", async (e) => {
    const editarBtn = e.target.closest(".pres-editar-btn");
    const toggleBtn = e.target.closest(".pres-toggle-btn");
    const guardarBtn = e.target.closest(".pres-guardar-btn");
    const cancelarBtn = e.target.closest(".pres-cancelar-btn");

    if (editarBtn) {
      const id = editarBtn.dataset.id;
      const p = _presentacionesCache.find((x) => x.id === id);
      if (!p) return;
      const div = editarBtn.closest(".lista-item");
      div.innerHTML = `
        <input type="text" class="pres-editar-input" value="${escHtml(p.nombre)}">
        <span class="pres-acciones">
          <button type="button" class="pres-guardar-btn" data-id="${id}">Guardar</button>
          <button type="button" class="pres-cancelar-btn">Cancelar</button>
        </span>`;
      div.querySelector(".pres-editar-input").focus();
      return;
    }

    if (cancelarBtn) { renderCatalogoPresentaciones(); return; }

    if (guardarBtn) {
      const id = guardarBtn.dataset.id;
      const div = guardarBtn.closest(".lista-item");
      const nuevoNombre = div.querySelector(".pres-editar-input").value.trim();
      if (!nuevoNombre) { setMsg("msg-presentaciones", "El nombre no puede quedar vacío.", false); return; }
      guardarBtn.disabled = true;
      const { error } = await client.from("presentaciones").update({ nombre: nuevoNombre }).eq("id", id);
      guardarBtn.disabled = false;
      if (error) {
        const msg = error.code === "23505" ? "Ya existe una presentación con ese nombre." : explicarError(error, "editar presentación");
        setMsg("msg-presentaciones", "No se pudo guardar: " + msg, false);
        return;
      }
      setMsg("msg-presentaciones", "Presentación actualizada.", true);
      await refrescarPresentacionesCatalogo();
      return;
    }

    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const activoActual = toggleBtn.dataset.activo === "true";
      toggleBtn.disabled = true;
      const { error } = await client.from("presentaciones").update({ activo: !activoActual }).eq("id", id);
      toggleBtn.disabled = false;
      if (error) {
        setMsg("msg-presentaciones", "No se pudo actualizar: " + explicarError(error, "cambiar estado de presentación"), false);
        return;
      }
      await refrescarPresentacionesCatalogo();
      // El nombre/estado de una presentación pudo cambiar: si hay un
      // producto elegido, sus asociaciones se vuelven a pintar con datos al día.
      if (_productoPresentacionesActual) await refrescarAsociacionesProducto(_productoPresentacionesActual);
    }
  });
});

safeInit("presentaciones-por-producto", () => {
  const productoSelect = document.getElementById("pp-producto-select");
  const formNueva = document.getElementById("form-pp-nueva");
  const listaAsoc = document.getElementById("pp-lista-asociaciones");

  productoSelect.addEventListener("change", async () => {
    const producto_id = productoSelect.value;
    _productoPresentacionesActual = producto_id || null;
    if (!producto_id) {
      _asociacionesProductoCache = [];
      setEmpty("pp-lista-asociaciones", "Elegí un producto para ver sus presentaciones.");
      formNueva.classList.add("hidden");
      return;
    }
    formNueva.classList.toggle("hidden", !_permisosPresentaciones.crear);
    await refrescarAsociacionesProducto(producto_id);
  });

  formNueva.addEventListener("submit", async (e) => {
    e.preventDefault();
    const producto_id = productoSelect.value;
    const presentacion_id = document.getElementById("pp-presentacion-select").value;
    const factor = parseFloat(document.getElementById("pp-factor").value);

    if (!producto_id || !presentacion_id) { setMsg("msg-presentaciones", "Elegí un producto y una presentación.", false); return; }
    if (!(factor > 0)) { setMsg("msg-presentaciones", "El factor debe ser mayor a 0.", false); return; }

    const submitBtn = formNueva.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    const { error } = await client.from("producto_presentaciones").insert({ producto_id, presentacion_id, factor });
    submitBtn.disabled = false;

    if (error) {
      const msg = error.code === "23505" ? "Ese producto ya tiene esa presentación activa." : explicarError(error, "asociar presentación");
      setMsg("msg-presentaciones", "No se pudo agregar: " + msg, false);
      return;
    }
    setMsg("msg-presentaciones", "Presentación agregada al producto.", true);
    formNueva.reset();
    await refrescarAsociacionesProducto(producto_id);
  });

  listaAsoc.addEventListener("click", async (e) => {
    const editarBtn = e.target.closest(".pp-editar-btn");
    const toggleBtn = e.target.closest(".pp-toggle-btn");
    const guardarBtn = e.target.closest(".pp-guardar-btn");
    const cancelarBtn = e.target.closest(".pp-cancelar-btn");

    if (editarBtn) {
      const id = editarBtn.dataset.id;
      const pp = _asociacionesProductoCache.find((x) => x.id === id);
      if (!pp) return;
      const div = editarBtn.closest(".lista-item");
      div.innerHTML = `
        <span>${escHtml(pp.presentaciones.nombre)} ×</span>
        <span class="pp-acciones">
          <input type="number" step="0.0001" min="0.0001" class="pp-factor-input" value="${pp.factor}">
          <button type="button" class="pp-guardar-btn" data-id="${id}">Guardar</button>
          <button type="button" class="pp-cancelar-btn">Cancelar</button>
        </span>`;
      div.querySelector(".pp-factor-input").focus();
      return;
    }

    if (cancelarBtn) { renderAsociacionesProducto(); return; }

    if (guardarBtn) {
      const id = guardarBtn.dataset.id;
      const div = guardarBtn.closest(".lista-item");
      const nuevoFactor = parseFloat(div.querySelector(".pp-factor-input").value);
      if (!(nuevoFactor > 0)) { setMsg("msg-presentaciones", "El factor debe ser mayor a 0.", false); return; }
      guardarBtn.disabled = true;
      const { error } = await client.from("producto_presentaciones").update({ factor: nuevoFactor }).eq("id", id);
      guardarBtn.disabled = false;
      if (error) { setMsg("msg-presentaciones", "No se pudo guardar: " + explicarError(error, "editar factor"), false); return; }
      setMsg("msg-presentaciones", "Factor actualizado.", true);
      await refrescarAsociacionesProducto(_productoPresentacionesActual);
      return;
    }

    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const activoActual = toggleBtn.dataset.activo === "true";
      toggleBtn.disabled = true;
      const { error } = await client.from("producto_presentaciones").update({ activo: !activoActual }).eq("id", id);
      toggleBtn.disabled = false;
      if (error) {
        const msg = error.code === "23505" ? "Ese producto ya tiene esa presentación activa." : explicarError(error, "cambiar estado");
        setMsg("msg-presentaciones", "No se pudo actualizar: " + msg, false);
        return;
      }
      await refrescarAsociacionesProducto(_productoPresentacionesActual);
    }
  });
});

// Carga inicial: permisos primero (determinan qué botones/formularios se
// muestran), después el catálogo. La lista de productos para
// "pp-producto-select" la llena refrescarProductos() por su cuenta.
async function inicializarPresentaciones() {
  _permisosPresentaciones = await cargarPermisosPresentaciones();

  const panel = document.querySelector(".presentaciones-panel");
  if (!_permisosPresentaciones.ver) {
    if (panel) panel.classList.add("hidden");
    setMsg("msg-presentaciones", "No tenés permiso para ver presentaciones.", false);
    return;
  }
  if (panel) panel.classList.remove("hidden");

  const formCrear = document.getElementById("form-presentacion-nueva");
  if (formCrear) formCrear.classList.toggle("hidden", !_permisosPresentaciones.crear);

  await refrescarPresentacionesCatalogo();
}

let _almacenSeleccionadoId = null;

function etiquetaTipoAlmacen(tipo) {
  return tipo === "venta" ? "Venta (precio normal)" : "Almacén / mayorista";
}

function llenarSelectorAlmacenes(almacenes) {
  const sel = document.getElementById("alm-selector");
  if (!sel) return;
  const prev = _almacenSeleccionadoId || sel.value;
  sel.innerHTML = '<option value="">Elegí un almacén…</option>';
  (almacenes || []).forEach((a) => {
    const o = document.createElement("option");
    o.value = a.id;
    const estado = a.activo === false ? " · Inactivo" : "";
    o.textContent = a.nombre + " — " + etiquetaTipoAlmacen(a.tipo) + estado;
    if (a.activo === false) o.className = "alm-option-inactivo";
    sel.appendChild(o);
  });
  if (prev && (almacenes || []).some((a) => a.id === prev)) {
    sel.value = prev;
    _almacenSeleccionadoId = prev;
  } else {
    _almacenSeleccionadoId = null;
    sel.value = "";
  }
  actualizarBotonesAccionesAlmacen();
}

function actualizarBotonesAccionesAlmacen() {
  const editar = document.getElementById("alm-editar-btn");
  const toggle = document.getElementById("alm-toggle-btn");
  const tiene = !!_almacenSeleccionadoId;
  if (editar) editar.disabled = !tiene;
  if (toggle) {
    toggle.disabled = !tiene;
    if (tiene) {
      const a = (_cache.almacenes || []).find((x) => x.id === _almacenSeleccionadoId);
      toggle.textContent = a && a.activo === false ? "Activar almacén" : "Desactivar almacén";
    } else {
      toggle.textContent = "Activar / desactivar";
    }
  }
}

function renderPanelAlmacenSeleccionado() {
  const panel = document.getElementById("alm-info-panel");
  if (!panel) return;
  const id = _almacenSeleccionadoId;
  if (!id) {
    panel.innerHTML = '<p class="lista-estado">Elegí un almacén para ver su información y productos.</p>';
    renderProductosDelAlmacen(null);
    actualizarBotonesAccionesAlmacen();
    return;
  }
  const a = (_cache.almacenes || []).find((x) => x.id === id);
  if (!a) {
    panel.innerHTML = '<p class="lista-estado">Almacén no encontrado.</p>';
    renderProductosDelAlmacen(null);
    return;
  }
  const stock = (_cache.stock || []).filter((s) => s.almacen_id === id);
  const productosCount = stock.length;
  let unidades = 0;
  let bajoMin = 0;
  let agotados = 0;
  stock.forEach((s) => {
    const cant = Number(s.cantidad) || 0;
    unidades += cant;
    if (cant <= 0) agotados++;
    else if (s.minimo != null && cant <= Number(s.minimo)) bajoMin++;
  });
  const activo = a.activo !== false;
  panel.innerHTML =
    '<div class="alm-info-grid">' +
      '<div class="alm-info-item"><span class="alm-info-label">Nombre</span><span class="alm-info-valor">' + escHtml(a.nombre) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Tipo</span><span class="alm-info-valor">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Estado</span><span class="alm-info-valor ' + (activo ? "alm-estado-activo" : "alm-estado-inactivo") + '">' + (activo ? "Activo" : "Inactivo") + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Productos</span><span class="alm-info-valor">' + productosCount + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Unidades</span><span class="alm-info-valor">' + money(unidades) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Alertas</span><span class="alm-info-valor">' +
        (bajoMin + agotados > 0
          ? (agotados ? agotados + " agotado(s)" : "") + (agotados && bajoMin ? " · " : "") + (bajoMin ? bajoMin + " bajo mínimo" : "")
          : "Sin alertas") +
      "</span></div>" +
    "</div>";
  renderProductosDelAlmacen(id);
  actualizarBotonesAccionesAlmacen();
}

function renderProductosDelAlmacen(almacen_id) {
  const lista = document.getElementById("lista-stock");
  if (!lista) return;
  if (!almacen_id) {
    lista.innerHTML = '<p class="lista-estado">Elegí un almacén para ver sus productos.</p>';
    return;
  }
  const stock = (_cache.stock || []).filter((s) => s.almacen_id === almacen_id);
  if (stock.length === 0) {
    lista.innerHTML = '<p class="lista-estado">Este almacén no tiene productos con stock registrado.</p>';
    return;
  }
  const productosById = {};
  (_cache.productos || []).forEach((p) => { productosById[p.id] = p; });
  lista.innerHTML = "";
  stock
    .slice()
    .sort((a, b) => {
      const na = (a.productos && a.productos.nombre) || "";
      const nb = (b.productos && b.productos.nombre) || "";
      return na.localeCompare(nb, "es");
    })
    .forEach((s) => {
      const p = productosById[s.producto_id];
      const nombre = (s.productos && s.productos.nombre) || (p && p.nombre) || "—";
      const cat = p && p.categorias && p.categorias.nombre ? p.categorias.nombre : "";
      const imagen = p && p.imagen_url
        ? '<img src="' + escHtml(p.imagen_url) + '" alt="" class="producto-thumb" loading="lazy">'
        : '<span class="producto-thumb producto-thumb-vacia" aria-hidden="true"></span>';
      const cant = Number(s.cantidad) || 0;
      const bajo = s.minimo != null && cant <= Number(s.minimo);
      const div = document.createElement("div");
      div.className = "lista-item alm-producto-item" + (cant <= 0 ? " lista-item-inactivo" : "");
      div.innerHTML =
        imagen +
        '<span class="alm-prod-info"><span class="alm-prod-nombre">' + escHtml(nombre) + "</span>" +
        (cat ? '<span class="muted"> · ' + escHtml(cat) + "</span>" : "") +
        "</span>" +
        '<span class="muted alm-prod-cant"' + (bajo || cant <= 0 ? ' style="color:var(--wine)"' : "") + ">" +
        money(cant) + (cant <= 0 ? " · Agotado" : bajo ? " · Bajo mínimo" : "") +
        "</span>";
      lista.appendChild(div);
    });
}

function seleccionarAlmacen(id) {
  _almacenSeleccionadoId = id || null;
  const sel = document.getElementById("alm-selector");
  if (sel) sel.value = id || "";
  renderPanelAlmacenSeleccionado();
}

function cerrarFormAlmacen() {
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.reset();
  form.classList.add("hidden");
  const editId = document.getElementById("alm-editando-id");
  if (editId) editId.value = "";
  const submit = document.getElementById("alm-submit-btn");
  if (submit) submit.textContent = "Crear almacén";
  setMsg("msg-almacenes", "", true);
}

function abrirFormCrearAlmacen() {
  cerrarFormAlmacen();
  const form = document.getElementById("form-almacen");
  if (form) form.classList.remove("hidden");
  const nombre = document.getElementById("alm-nombre");
  if (nombre) nombre.focus();
}

function abrirFormEditarAlmacen() {
  if (!_almacenSeleccionadoId) return;
  const a = (_cache.almacenes || []).find((x) => x.id === _almacenSeleccionadoId);
  if (!a) return;
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.classList.remove("hidden");
  document.getElementById("alm-editando-id").value = a.id;
  document.getElementById("alm-nombre").value = a.nombre || "";
  document.getElementById("alm-tipo").value = a.tipo || "";
  document.getElementById("alm-submit-btn").textContent = "Guardar cambios";
  document.getElementById("alm-nombre").focus();
}

async function refrescarAlmacenes() {
  setLoading("lista-almacenes", "Cargando almacenes…");
  const almacenes = await cargarAlmacenes();
  _cache.almacenes = almacenes;
  renderResumen();
  // Compatibilidad: lista oculta sigue existiendo (otros flujos no dependen de su contenido visual).
  const lista = document.getElementById("lista-almacenes");
  if (lista) {
    if (almacenes.length === 0) {
      setEmpty("lista-almacenes", mensajeListaVacia("almacenes", "Todavía no hay almacenes cargados."));
    } else {
      lista.innerHTML = "";
      almacenes.forEach((a) => {
        const div = document.createElement("div");
        div.className = "lista-item" + (a.activo === false ? " lista-item-inactivo" : "");
        const estado = a.activo === false ? ' <span class="muted">· Inactivo</span>' : "";
        div.innerHTML = "<span>" + escHtml(a.nombre) + estado + '</span><span class="muted">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span>";
        lista.appendChild(div);
      });
    }
  }

  llenarSelectorAlmacenes(almacenes);
  renderPanelAlmacenSeleccionado();

  fillSelect(document.getElementById("trf-origen"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("trf-destino"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("vale-almacen"), almacenes, "id", (a) => a.nombre);
  return almacenes;
}

async function refrescarStockYSelects() {
  const { productos, almacenes } = await refrescarProductos();
  fillSelect(document.getElementById("trf-producto"), productos, "id", (p) => p.nombre);
  fillSelect(document.getElementById("vale-producto"), productos, "id", (p) => p.nombre);

  setLoading("lista-stock", "Cargando stock…");
  const stock = await withCache("stock", () => client
    .from("stock")
    .select("producto_id, almacen_id, cantidad, minimo, productos(nombre), almacenes(nombre)"));

  _cache.stock = stock;
  renderResumen();
  // seleccionado (no el listado global). Si no hay selección, mensaje guía.
  if (typeof renderProductosDelAlmacen === "function") {
    renderProductosDelAlmacen(_almacenSeleccionadoId);
  } else {
    const lista = document.getElementById("lista-stock");
    if (!lista) return;
    if (!stock || stock.length === 0) {
      setEmpty("lista-stock", mensajeListaVacia("stock", "Todavía no hay stock cargado."));
      return;
    }
    lista.innerHTML = "";
    stock.forEach((s) => {
      const div = document.createElement("div");
      div.className = "lista-item";
      const bajo = s.minimo != null && s.cantidad <= s.minimo;
      div.innerHTML = `<span>${escHtml(s.productos.nombre)} <span class="muted">· ${escHtml(s.almacenes.nombre)}</span></span>
        <span class="muted" style="${bajo ? "color:var(--ember)" : ""}">${money(s.cantidad)}${bajo ? " ⚠ bajo mínimo" : ""}</span>`;
      lista.appendChild(div);
    });
  }
  if (typeof renderPanelAlmacenSeleccionado === "function" && _almacenSeleccionadoId) {
    renderPanelAlmacenSeleccionado();
  }
}

safeInit("form-almacen", () => {
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("alm-nombre").value.trim();
    const tipo = document.getElementById("alm-tipo").value;
    const editandoId = (document.getElementById("alm-editando-id") || {}).value || "";
    const submitBtn = document.getElementById("alm-submit-btn") || e.target.querySelector("button[type='submit']");

    if (!nombre || !tipo) {
      setMsg("msg-almacenes", "Completá nombre y tipo.", false);
      return;
    }

    submitBtn.disabled = true;
    let resultado;
    if (editandoId) {
      resultado = await editarAlmacen(editandoId, { p_nombre: nombre, p_tipo: tipo });
    } else {
      resultado = await ejecutarOperacion("almacen", {
        p_nombre: nombre,
        p_tipo: tipo,
      });
    }
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-almacenes", "No se pudo " + (editandoId ? "editar" : "crear") + ": " + explicarError(resultado.error, editandoId ? "editar almacén" : "crear almacén"), false);
      return;
    }
    if (resultado.offline) {
      setMsg("msg-almacenes", (editandoId ? "Cambios" : "Almacén") + " guardado(s), se sincronizará cuando vuelva la conexión.", true);
      cerrarFormAlmacen();
    } else {
      setMsg("msg-almacenes", editandoId ? "Almacén actualizado." : "Almacén creado.", true);
      cerrarFormAlmacen();
      await refrescarAlmacenes();
      await refrescarStockYSelects();
      if (editandoId) seleccionarAlmacen(editandoId);
      else if (resultado.data && resultado.data.id) seleccionarAlmacen(resultado.data.id);
    }
  });
});

safeInit("almacenes-ui", () => {
  const sel = document.getElementById("alm-selector");
  if (sel) {
    sel.addEventListener("change", () => {
      seleccionarAlmacen(sel.value || null);
    });
  }

  const btnMenu = document.getElementById("alm-acciones-btn");
  const menu = document.getElementById("alm-acciones-menu");
  if (btnMenu && menu) {
    btnMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target !== btnMenu) {
        menu.classList.add("hidden");
      }
    });
  }

  const btnCrear = document.getElementById("alm-crear-btn");
  if (btnCrear) {
    btnCrear.addEventListener("click", () => {
      if (menu) menu.classList.add("hidden");
      abrirFormCrearAlmacen();
    });
  }
  const btnEditar = document.getElementById("alm-editar-btn");
  if (btnEditar) {
    btnEditar.addEventListener("click", () => {
      if (menu) menu.classList.add("hidden");
      abrirFormEditarAlmacen();
    });
  }
  const btnToggle = document.getElementById("alm-toggle-btn");
  if (btnToggle) {
    btnToggle.addEventListener("click", async () => {
      if (menu) menu.classList.add("hidden");
      if (!_almacenSeleccionadoId) return;
      const a = (_cache.almacenes || []).find((x) => x.id === _almacenSeleccionadoId);
      if (!a) return;
      const nuevoActivo = a.activo === false;
      btnToggle.disabled = true;
      const resultado = await activarDesactivarAlmacen(a.id, nuevoActivo);
      btnToggle.disabled = false;
      if (!resultado.ok) {
        setMsg("msg-almacenes", "No se pudo cambiar el estado: " + explicarError(resultado.error, "cambiar estado de almacén"), false);
        return;
      }
      setMsg("msg-almacenes", resultado.offline
        ? "Cambio de estado guardado, se sincronizará cuando vuelva la conexión."
        : (nuevoActivo ? "Almacén activado." : "Almacén desactivado."), true);
      if (!resultado.offline) {
        await refrescarAlmacenes();
        await refrescarStockYSelects();
        seleccionarAlmacen(a.id);
      }
    });
  }
  const btnCancelar = document.getElementById("alm-cancelar-btn");
  if (btnCancelar) btnCancelar.addEventListener("click", () => cerrarFormAlmacen());
});

async function editarAlmacen(almacen_id, cambios) {
  const payload = Object.assign({ p_almacen_id: almacen_id }, cambios || {});
  const resultado = await ejecutarOperacion("almacen_actualizar", payload);
  if (resultado.ok && !resultado.offline) {
    await refrescarAlmacenes();
    await refrescarStockYSelects();
  }
  return resultado;
}

async function activarDesactivarAlmacen(almacen_id, activo) {
  const resultado = await ejecutarOperacion("almacen_estado", {
    p_almacen_id: almacen_id,
    p_activo: !!activo,
  });
  if (resultado.ok && !resultado.offline) {
    await refrescarAlmacenes();
    await refrescarStockYSelects();
  }
  return resultado;
}

async function refrescarTransferencias() {
  setLoading("lista-transferencias", "Cargando transferencias…");
  const { data } = await client
    .from("transferencias")
    .select("id, fecha, estado, origen:almacen_origen_id(nombre), destino:almacen_destino_id(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);

  _cache.transferencias = data || [];
  renderResumen();
  renderTransferenciasLista();
}

// R10+R11: render accionable del historial de transferencias. Filtra
let _trfBusqueda = "";
function renderTransferenciasLista() {
  const lista = document.getElementById("lista-transferencias");
  if (!lista) return;
  const todas = _cache.transferencias || [];
  if (todas.length === 0) {
    setEmpty("lista-transferencias", "Todavía no hay transferencias registradas.");
    actualizarContador("trf-contador", 0, 0);
    return;
  }
  const termino = _trfBusqueda.trim().toLowerCase();
  const filtradas = termino
    ? todas.filter((t) => {
        const orig = t.origen && t.origen.nombre ? t.origen.nombre.toLowerCase() : "";
        const dest = t.destino && t.destino.nombre ? t.destino.nombre.toLowerCase() : "";
        const est = t.estado ? t.estado.toLowerCase() : "";
        const fec = t.fecha ? fechaCorta(t.fecha).toLowerCase() : "";
        const id = t.id ? t.id.toLowerCase() : "";
        return orig.includes(termino) || dest.includes(termino) || est.includes(termino) || fec.includes(termino) || id.includes(termino);
      })
    : todas;
  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="lista-estado">🔎 No encontramos transferencias con esos criterios.</p>'
      + '<button type="button" class="cc-accion mov-ver-todas-btn" data-tipo="transferencias">Ver todas</button>';
    actualizarContador("trf-contador", 0, todas.length);
    return;
  }
  lista.innerHTML = "";
  filtradas.forEach((t) => {
    const div = document.createElement("div");
    // R11: accionable. data-trf-id permite abrir el detalle real.
    div.className = "lista-item lista-item-accion trf-item";
    div.setAttribute("data-trf-id", t.id || "");
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    div.innerHTML = `<span>${t.origen ? escHtml(t.origen.nombre) : "—"} → ${t.destino ? escHtml(t.destino.nombre) : "—"} <span class="muted">· #${t.id ? idCorto(t.id) : "—"}</span></span>
      <span class="muted">${fechaCorta(t.fecha)} · ${escHtml(t.estado || "")}</span>`;
    lista.appendChild(div);
  });
  actualizarContador("trf-contador", filtradas.length, todas.length);
}

safeInit("form-transferencia", () => {
  document.getElementById("form-transferencia").addEventListener("submit", async (e) => {
    e.preventDefault();
    const origen = document.getElementById("trf-origen").value;
    const destino = document.getElementById("trf-destino").value;
    const producto_id = document.getElementById("trf-producto").value;
    const cantidad = parseFloat(document.getElementById("trf-cantidad").value);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (origen === destino) {
      setMsg("msg-transferencias", "El origen y el destino no pueden ser el mismo almacén.", false);
      return;
    }
    if (!(cantidad > 0)) {
      setMsg("msg-transferencias", "La cantidad debe ser mayor a 0.", false);
      return;
    }
    if (!window.confirm("¿Confirmar transferencia de " + cantidad + " unidades? Esto mueve stock real.")) {
      return;
    }

    submitBtn.disabled = true;
    const resultado = await ejecutarOperacion("transferencia", {
      p_origen_id: origen, p_destino_id: destino,
      p_lineas: [{ producto_id, cantidad }],
    });
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-transferencias", "No se pudo transferir: " + explicarError(resultado.error, "transferencia"), false);
      return;
    }
    e.target.reset();
    if (resultado.offline) {
      setMsg("msg-transferencias", "✓ Guardada localmente — se sincronizará al recuperar conexión.", true);
      return;
    }
    setMsg("msg-transferencias", "Transferencia registrada.", true);
    await refrescarTransferencias();
    await refrescarStockYSelects();
  });
});

async function refrescarVales() {
  setLoading("lista-vales", "Cargando vales…");
  const { data } = await client
    .from("vales_salida")
    .select("id, fecha, tipo, cantidad, productos(nombre), almacenes(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);

  _cache.vales = data || [];
  renderResumen();
  renderValesLista();
}

// R10+R12: render accionable del historial de vales. Filtra _cache.vales en
let _valesBusqueda = "";
function renderValesLista() {
  const lista = document.getElementById("lista-vales");
  if (!lista) return;
  const todas = _cache.vales || [];
  if (todas.length === 0) {
    setEmpty("lista-vales", "Todavía no hay vales de salida registrados.");
    actualizarContador("vales-contador", 0, 0);
    return;
  }
  const termino = _valesBusqueda.trim().toLowerCase();
  const filtradas = termino
    ? todas.filter((v) => {
        const prod = v.productos && v.productos.nombre ? v.productos.nombre.toLowerCase() : "";
        const alm = v.almacenes && v.almacenes.nombre ? v.almacenes.nombre.toLowerCase() : "";
        const tipo = v.tipo ? v.tipo.toLowerCase() : "";
        const fec = v.fecha ? fechaCorta(v.fecha).toLowerCase() : "";
        const id = v.id ? v.id.toLowerCase() : "";
        return prod.includes(termino) || alm.includes(termino) || tipo.includes(termino) || fec.includes(termino) || id.includes(termino);
      })
    : todas;
  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="lista-estado">🔎 No encontramos vales con esos criterios.</p>'
      + '<button type="button" class="cc-accion mov-ver-todas-btn" data-tipo="vales">Ver todos</button>';
    actualizarContador("vales-contador", 0, todas.length);
    return;
  }
  lista.innerHTML = "";
  filtradas.forEach((v) => {
    const div = document.createElement("div");
    // R12: indicacion visual segun el tipo (sin cambiar la logica de negocio).
    div.className = "lista-item lista-item-accion vale-item vale-tipo-" + (v.tipo || "desconocido");
    div.setAttribute("data-vale-id", v.id || "");
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    div.innerHTML = `<span>${v.productos ? escHtml(v.productos.nombre) : "—"} <span class="muted">· ${v.almacenes ? escHtml(v.almacenes.nombre) : "—"} · #${v.id ? idCorto(v.id) : "—"}</span></span>
      <span class="muted">${fechaCorta(v.fecha)} · ${escHtml(v.tipo || "")} · ${money(v.cantidad)}</span>`;
    lista.appendChild(div);
  });
  actualizarContador("vales-contador", filtradas.length, todas.length);
}

// ---- R11 / R12 / R6-R7 — Detalle accionable + auditoría de movimientos
function mostrarDetalleTransferencia(trfId) {
  const cont = document.getElementById("transferencia-detalle");
  if (!cont) return;
  const trf = (_cache.transferencias || []).find((t) => t.id === trfId);
  if (!trf) {
    cont.innerHTML = '<p class="lista-estado">No se encontró la transferencia.</p>'
      + '<button type="button" class="cc-accion trf-detalle-cerrar-btn">Volver</button>';
    cont.classList.remove("hidden");
    _enlazarCerrarTrfDetalle();
    return;
  }
  const fechaHora = trf.fecha ? fechaHoraCompleta(trf.fecha) : "—";
  cont.innerHTML = '<div class="detalle-cabecera">'
    + '<span class="detalle-tipo">Transferencia #' + (trf.id ? idCorto(trf.id) : "—") + '</span>'
    + '<button type="button" class="detalle-cerrar-btn trf-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button>'
    + '</div>'
    + '<div class="detalle-cuerpo">'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">' + escHtml(trf.id || "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">' + escHtml(fechaHora) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Estado</span><span class="detalle-valor">' + escHtml(trf.estado || "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén origen</span><span class="detalle-valor">' + escHtml(trf.origen ? trf.origen.nombre : "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén destino</span><span class="detalle-valor">' + escHtml(trf.destino ? trf.destino.nombre : "—") + '</span></div>'
    + '</div>';
  cont.classList.remove("hidden");
  _enlazarCerrarTrfDetalle();
  cont.focus();
}
function _enlazarCerrarTrfDetalle() {
  const cont = document.getElementById("transferencia-detalle");
  if (!cont) return;
  cont.querySelectorAll(".trf-detalle-cerrar-btn").forEach((btn) => {
    btn.addEventListener("click", cerrarDetalleTransferencia);
  });
}
function cerrarDetalleTransferencia() {
  const cont = document.getElementById("transferencia-detalle");
  if (cont) { cont.classList.add("hidden"); cont.innerHTML = ""; }
}

// R12: detalle accionable de un vale. Datos reales: id, fecha, tipo,
// cantidad, producto, almacén. Etiqueta legible del tipo para auditoría
// (sin cambiar el dato real). Indicación visual por tipo en la lista.
function mostrarDetalleVale(valeId) {
  const cont = document.getElementById("vale-detalle");
  if (!cont) return;
  const vale = (_cache.vales || []).find((v) => v.id === valeId);
  if (!vale) {
    cont.innerHTML = '<p class="lista-estado">No se encontró el vale.</p>'
      + '<button type="button" class="cc-accion vale-detalle-cerrar-btn">Volver</button>';
    cont.classList.remove("hidden");
    _enlazarCerrarValeDetalle();
    return;
  }
  const fechaHora = vale.fecha ? fechaHoraCompleta(vale.fecha) : "—";
  const tipoEtiqueta = { merma: "Merma", donacion: "Donación", regalo: "Regalo", vencido: "Vencido" }[vale.tipo] || vale.tipo || "—";
  cont.innerHTML = '<div class="detalle-cabecera">'
    + '<span class="detalle-tipo">Vale #' + (vale.id ? idCorto(vale.id) : "—") + '</span>'
    + '<button type="button" class="detalle-cerrar-btn vale-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button>'
    + '</div>'
    + '<div class="detalle-cuerpo">'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">' + escHtml(vale.id || "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">' + escHtml(fechaHora) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Tipo</span><span class="detalle-valor">' + escHtml(tipoEtiqueta) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Producto</span><span class="detalle-valor">' + escHtml(vale.productos ? vale.productos.nombre : "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén</span><span class="detalle-valor">' + escHtml(vale.almacenes ? vale.almacenes.nombre : "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Cantidad</span><span class="detalle-valor">' + money(vale.cantidad || 0) + ' u</span></div>'
    + '</div>';
  cont.classList.remove("hidden");
  _enlazarCerrarValeDetalle();
  cont.focus();
}
function _enlazarCerrarValeDetalle() {
  const cont = document.getElementById("vale-detalle");
  if (!cont) return;
  cont.querySelectorAll(".vale-detalle-cerrar-btn").forEach((btn) => {
    btn.addEventListener("click", cerrarDetalleVale);
  });
}
function cerrarDetalleVale() {
  const cont = document.getElementById("vale-detalle");
  if (cont) { cont.classList.add("hidden"); cont.innerHTML = ""; }
}

// R7: helper de redondeo a centavos para comparar montos sin error de coma
// flotante (149.999999 vs 150.00). Reutiliza el mismo criterio que money().
function redondearCentavos(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round((v + Number.EPSILON) * 100) / 100 : 0;
}

// R6/R7: detalle accionable + auditoría de una venta. Reutiliza _cache.ventas
let _ventaDetalleCargandoId = null; // evita cargas solapadas del detalle
function mostrarDetalleVenta(ventaId) {
  const cont = document.getElementById("venta-detalle");
  if (!cont) return;
  const venta = (_cache.ventas || []).find((v) => v.id === ventaId);
  if (!venta) {
    cont.innerHTML = '<p class="lista-estado">No se encontró la venta.</p>'
      + '<button type="button" class="cc-accion venta-detalle-cerrar-btn">Volver</button>';
    cont.classList.remove("hidden");
    _enlazarCerrarVentaDetalle();
    return;
  }
  const fechaHora = venta.fecha ? fechaHoraCompleta(venta.fecha) : "—";
  let html = '<div class="detalle-cabecera">'
    + '<span class="detalle-tipo">Venta #' + (venta.id ? idCorto(venta.id) : "—") + '</span>'
    + '<button type="button" class="detalle-cerrar-btn venta-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button>'
    + '</div>'
    + '<div class="detalle-cuerpo">'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">' + escHtml(venta.id || "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">' + escHtml(fechaHora) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén</span><span class="detalle-valor">' + escHtml(venta.almacenes ? venta.almacenes.nombre : "—") + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Total registrado</span><span class="detalle-valor">$' + money(venta.total || 0) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Líneas</span><span class="detalle-valor" id="venta-detalle-lineas"><span class="muted">Cargando…</span></span></div>'
    + '</div>'
    + '<div class="venta-auditoria" id="venta-detalle-auditoria"></div>';
  cont.innerHTML = html;
  cont.classList.remove("hidden");
  _enlazarCerrarVentaDetalle();
  // Cargar las líneas reales solo si hay conexión (no obligatorio para navegar).
  if (navigator.onLine) {
    _cargarLineasVenta(ventaId, venta.fecha, venta.total);
  } else {
    _renderAuditoriaVenta(null, venta.total, false);
  }
  cont.focus();
}
// Carga las líneas reales de una venta vía reporte_ventas (RPC existente que
// ya devuelve lineas como JSON). No inventa datos: si no hay líneas, lo muestra.
async function _cargarLineasVenta(ventaId, fechaVenta, totalRegistrado) {
  if (_ventaDetalleCargandoId === ventaId) return;
  _ventaDetalleCargandoId = ventaId;
  const el = document.getElementById("venta-detalle-lineas");
  if (!el) { _ventaDetalleCargandoId = null; return; }
  try {
    const fecha = fechaVenta ? new Date(fechaVenta).toISOString().slice(0, 10) : null;
    const { data, error } = await client.rpc("reporte_ventas", {
      p_desde: fecha, p_hasta: fecha, p_almacen_id: null, p_producto_id: null,
      p_limite: 200, p_offset: 0,
    });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<span class="muted">Las líneas requieren aplicar supabase/b5-reportes.sql en Supabase.</span>';
      } else {
        el.innerHTML = '<span class="muted">No se pudieron cargar las líneas.</span>';
      }
      _renderAuditoriaVenta(null, totalRegistrado, true);
      return;
    }
    if (_ventaDetalleCargandoId !== ventaId) return; // se cerró/cambió
    const venta = (data || []).find((v) => v.id === ventaId);
    const lineas = venta && Array.isArray(venta.lineas) ? venta.lineas : [];
    if (lineas.length === 0) {
      el.innerHTML = '<span class="muted">Sin líneas registradas para esta venta.</span>';
    } else {
      el.innerHTML = '<div class="venta-lineas-lista">' + lineas.map((l) =>
        '<div class="venta-linea">'
        + '<span class="venta-linea-producto">' + escHtml(l.producto || "—") + '</span>'
        + '<span class="venta-linea-cant">' + (l.cantidad || 0) + ' u</span>'
        + '<span class="venta-linea-precio">$' + money(l.precio_unitario || 0) + '</span>'
        + '<span class="venta-linea-subtotal">' + (l.subtotal || 0) + '</span>'
        + '</div>'
      ).join("") + '</div>';
    }
    _renderAuditoriaVenta(lineas, totalRegistrado, true);
  } catch (e) {
    el.innerHTML = '<span class="muted">No se pudieron cargar las líneas.</span>';
    _renderAuditoriaVenta(null, totalRegistrado, true);
  } finally {
    _ventaDetalleCargandoId = null;
  }
}
// R7: auditoría matemática de la venta. Calcula SUMA_DE_LINEAS (suma de
function _renderAuditoriaVenta(lineas, totalRegistrado, lineasCargadas) {
  const cont = document.getElementById("venta-detalle-auditoria");
  if (!cont) return;
  const totalReg = redondearCentavos(totalRegistrado);
  if (!lineasCargadas) {
    cont.innerHTML = '<h4 class="venta-auditoria-titulo">Auditoría de la venta</h4>'
      + '<div class="detalle-fila"><span class="detalle-etiqueta">Total registrado</span><span class="detalle-valor">$' + money(totalReg) + '</span></div>'
      + '<div class="venta-auditoria-estado estado-info">⚪ Líneas no disponibles sin conexión</div>';
    return;
  }
  if (!lineas || lineas.length === 0) {
    cont.innerHTML = '<h4 class="venta-auditoria-titulo">Auditoría de la venta</h4>'
      + '<div class="detalle-fila"><span class="detalle-etiqueta">Total registrado</span><span class="detalle-valor">$' + money(totalReg) + '</span></div>'
      + '<div class="venta-auditoria-estado estado-neutro">⚪ Sin líneas disponibles</div>';
    return;
  }
  const totalLineas = redondearCentavos(lineas.reduce((s, l) => s + (Number(l.subtotal) || 0), 0));
  const diferencia = redondearCentavos(totalReg - totalLineas);
  const coincide = Math.abs(diferencia) < 0.01;
  const estadoHtml = coincide
    ? '<div class="venta-auditoria-estado estado-ok">✅ TOTAL COINCIDE</div>'
    : '<div class="venta-auditoria-estado estado-alerta">🟠 DIFERENCIA DETECTADA</div>';
  cont.innerHTML = '<h4 class="venta-auditoria-titulo">Auditoría de la venta</h4>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Total registrado</span><span class="detalle-valor">$' + money(totalReg) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Total de productos</span><span class="detalle-valor">$' + money(totalLineas) + '</span></div>'
    + '<div class="detalle-fila"><span class="detalle-etiqueta">Diferencia</span><span class="detalle-valor">$' + money(Math.abs(diferencia)) + '</span></div>'
    + estadoHtml;
}
function _enlazarCerrarVentaDetalle() {
  const cont = document.getElementById("venta-detalle");
  if (!cont) return;
  cont.querySelectorAll(".venta-detalle-cerrar-btn").forEach((btn) => {
    btn.addEventListener("click", cerrarDetalleVenta);
  });
}
function cerrarDetalleVenta() {
  const cont = document.getElementById("venta-detalle");
  if (cont) { cont.classList.add("hidden"); cont.innerHTML = ""; }
  _ventaDetalleCargandoId = null;
}

// R6/R7/R11/R12: listeners delegados para abrir/cerrar los detalles desde
// las listas accionables (ventas/transferencias/vales). Un solo listener
// por lista (click + teclado Enter/Espacio). Reutilizan _cache.
safeInit("ventas-detalle", () => {
  const lista = document.getElementById("lista-ventas");
  if (!lista) return;
  const abrir = (target) => {
    const item = target.closest(".venta-item[data-venta-id]");
    if (!item) return;
    const id = item.getAttribute("data-venta-id");
    if (id) mostrarDetalleVenta(id);
  };
  lista.addEventListener("click", (e) => abrir(e.target));
  lista.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target.closest(".venta-item[data-venta-id]")) { e.preventDefault(); abrir(e.target); }
    }
  });
});
safeInit("transferencias-detalle", () => {
  const lista = document.getElementById("lista-transferencias");
  if (!lista) return;
  const abrir = (target) => {
    const item = target.closest(".trf-item[data-trf-id]");
    if (!item) return;
    const id = item.getAttribute("data-trf-id");
    if (id) mostrarDetalleTransferencia(id);
  };
  lista.addEventListener("click", (e) => abrir(e.target));
  lista.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target.closest(".trf-item[data-trf-id]")) { e.preventDefault(); abrir(e.target); }
    }
  });
});
safeInit("vales-detalle", () => {
  const lista = document.getElementById("lista-vales");
  if (!lista) return;
  const abrir = (target) => {
    const item = target.closest(".vale-item[data-vale-id]");
    if (!item) return;
    const id = item.getAttribute("data-vale-id");
    if (id) mostrarDetalleVale(id);
  };
  lista.addEventListener("click", (e) => abrir(e.target));
  lista.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target.closest(".vale-item[data-vale-id]")) { e.preventDefault(); abrir(e.target); }
    }
  });
});

safeInit("form-vale", () => {
  document.getElementById("form-vale").addEventListener("submit", async (e) => {
    e.preventDefault();
    const producto_id = document.getElementById("vale-producto").value;
    const almacen_id = document.getElementById("vale-almacen").value;
    const tipo = document.getElementById("vale-tipo").value;
    const cantidad = parseFloat(document.getElementById("vale-cantidad").value);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (!(cantidad > 0)) {
      setMsg("msg-vales", "La cantidad debe ser mayor a 0.", false);
      return;
    }
    if (!window.confirm("¿Confirmar vale de salida (" + tipo + ") por " + cantidad + " unidades? Esto descuenta stock real.")) {
      return;
    }

    submitBtn.disabled = true;
    const resultado = await ejecutarOperacion("vale", {
      p_producto_id: producto_id, p_almacen_id: almacen_id,
      p_tipo: tipo, p_cantidad: cantidad,
    });
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-vales", "No se pudo registrar: " + explicarError(resultado.error, "vale de salida"), false);
      return;
    }
    e.target.reset();
    if (resultado.offline) {
      setMsg("msg-vales", "✓ Guardada localmente — se sincronizará al recuperar conexión.", true);
      return;
    }
    setMsg("msg-vales", "Vale de salida registrado, stock actualizado.", true);
    await refrescarVales();
    await refrescarStockYSelects();
  });
});

// ---- El precio se decide SOLO en el servidor (RPC registrar_venta) según el
let ventaLineas = [];
let ventaAlmacenesTipo = {}; // id -> 'venta' | 'mayorista'
let ventaProductosPrecios = {}; // id -> { nombre, precio_normal, precio_mayorista }
let ventaProductosLista = []; // lista completa de productos, para el buscador
let ventaCategoriasLista = []; // Misión 9.3 (Tarea 2): categorías reales, para los filtros del catálogo
let catalogoCategoriaActiva = ""; // "" = Todos. Estado local de la pestaña, no una segunda cache.

function obtenerStockDisponible(producto_id, almacen_id) {
  const fila = _cache.stock.find((s) => s.producto_id === producto_id && s.almacen_id === almacen_id);
  const real = fila ? Number(fila.cantidad) : 0;
  const { ajuste, noCalculable } = ajustePendiente(producto_id, almacen_id);
  return { valor: Math.max(real + ajuste, 0), ajuste, noCalculable };
}

// Cuánto de un producto ya está en el carrito actual (para no dejar pedir
// más de lo que hay entre lo ya agregado + lo que se está por agregar/editar).
function cantidadEnCarrito(producto_id, exceptoIdx) {
  return ventaLineas.reduce((s, l, i) => {
    if (i === exceptoIdx) return s;
    return l.producto_id === producto_id ? s + l.cantidad : s;
  }, 0);
}

// Actualiza el aviso "Stock disponible: X" y el máximo permitido en el campo
// de cantidad, según el almacén y producto elegidos ahora mismo en el form.
function actualizarStockDisponibleUI() {
  const infoEl = document.getElementById("venta-stock-disponible");
  const cantidadInput = document.getElementById("venta-cantidad");
  if (!infoEl || !cantidadInput) return;

  const almacen_id = document.getElementById("venta-almacen").value;
  const producto_id = document.getElementById("venta-producto").value;

  if (!almacen_id || !producto_id) {
    infoEl.textContent = "";
    infoEl.className = "msg";
    cantidadInput.removeAttribute("max");
    return;
  }

  const { valor: stockTotal, ajuste, noCalculable } = obtenerStockDisponible(producto_id, almacen_id); // ya incluye ajuste por pendientes
  const enCarrito = cantidadEnCarrito(producto_id, -1);
  const disponible = Math.max(stockTotal - enCarrito, 0);

  if (noCalculable) {
    infoEl.textContent = "Stock disponible: " + money(disponible) + " (proyección no calculable — hay una compra pendiente con presentación sin confirmar en este dispositivo)";
    infoEl.className = "msg";
    cantidadInput.removeAttribute("max");
    return;
  }

  const tienePendientes = ajuste !== 0;
  infoEl.textContent = "Stock disponible: " + money(disponible) + (tienePendientes ? " (aprox., con operaciones pendientes)" : "");
  infoEl.className = "msg" + (disponible <= 0 ? " error" : "");
  cantidadInput.setAttribute("max", disponible);
}

function agregarLineaVenta(producto_id, cantidad, almacen_id) {
  const tipo = ventaAlmacenesTipo[almacen_id];
  const producto = ventaProductosPrecios[producto_id];
  if (!producto) { setMsg("msg-venta-linea", "Producto no encontrado.", false); return false; }

  const precio = tipo === "mayorista" ? producto.precio_mayorista : producto.precio_normal;
  if (precio === null || precio === undefined) {
    setMsg("msg-venta-linea", "Este producto no tiene precio mayorista configurado.", false);
    return false;
  }

  // Impedir superar el stock disponible: se compara lo que ya está en el
  // carrito para ese producto + lo que se está por agregar, contra el
  // stock real de ese producto en el almacén elegido.
  const existente = ventaLineas.find((l) => l.producto_id === producto_id);
  const { valor: stockTotal } = obtenerStockDisponible(producto_id, almacen_id);
  const yaEnCarrito = existente ? existente.cantidad : 0;
  if (yaEnCarrito + cantidad > stockTotal) {
    const disponible = Math.max(stockTotal - yaEnCarrito, 0);
    setMsg("msg-venta-linea", "No hay suficiente stock de " + producto.nombre + " (disponible: " + money(disponible) + ").", false);
    return false;
  }

  if (existente) {
    existente.cantidad += cantidad;
    existente.subtotal = existente.cantidad * existente.precio_unitario;
  } else {
    ventaLineas.push({
      producto_id, nombre: producto.nombre, cantidad,
      precio_unitario: precio, subtotal: cantidad * precio,
    });
  }

  setMsg("msg-venta-linea", "", true);
  renderVentaLineas();
  return true;
}

function renderCatalogoCategorias() {
  const cont = document.getElementById("catalogo-categorias");
  if (!cont) return;

  const chips = [{ id: "", nombre: "Todos" }, ...ventaCategoriasLista];
  cont.innerHTML = "";
  chips.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "catalogo-chip" + (catalogoCategoriaActiva === c.id ? " activo" : "");
    btn.textContent = c.nombre;
    btn.dataset.categoriaId = c.id;
    cont.appendChild(btn);
  });
}

function renderCatalogoGrid() {
  const grid = document.getElementById("catalogo-grid");
  if (!grid) return;

  const almacen_id = document.getElementById("venta-almacen") ? document.getElementById("venta-almacen").value : "";
  const disponibles = ventaProductosLista.filter((p) => {
    if (p.activo === false) return false;
    if (catalogoCategoriaActiva && p.categoria_id !== catalogoCategoriaActiva) return false;
    return true;
  });

  if (disponibles.length === 0) {
    grid.innerHTML = '<p class="lista-estado">No hay productos activos para mostrar en esta categoría.</p>';
    return;
  }

  const tipo = almacen_id ? ventaAlmacenesTipo[almacen_id] : null;
  grid.innerHTML = "";
  disponibles.forEach((p) => {
    const precio = tipo === "mayorista" ? p.precio_mayorista : p.precio_normal;
    const precioTxt = precio === null || precio === undefined ? "Sin precio" : "$" + money(precio);
    const stockTxt = almacen_id ? money(obtenerStockDisponible(p.id, almacen_id).valor) : null;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "catalogo-card";
    card.dataset.productoId = p.id;
    card.innerHTML = `
      ${p.imagen_url
        ? `<img src="${escHtml(p.imagen_url)}" alt="" class="catalogo-card-img" loading="lazy">`
        : `<span class="catalogo-card-img catalogo-card-img-vacia" aria-hidden="true"></span>`}
      <span class="catalogo-card-nombre">${escHtml(p.nombre)}</span>
      <span class="catalogo-card-precio">${precioTxt}</span>
      ${p.categorias ? `<span class="catalogo-card-categoria">${escHtml(p.categorias.nombre)}</span>` : ""}
      ${stockTxt !== null ? `<span class="catalogo-card-stock">Stock: ${stockTxt}</span>` : ""}
    `;
    grid.appendChild(card);
  });
}

safeInit("venta-vista-toggle", () => {
  const btnBuscador = document.getElementById("venta-vista-btn-buscador");
  const btnCatalogo = document.getElementById("venta-vista-btn-catalogo");
  const modoBuscador = document.getElementById("venta-modo-buscador");
  const modoCatalogo = document.getElementById("venta-modo-catalogo");
  if (!btnBuscador || !btnCatalogo || !modoBuscador || !modoCatalogo) return;

  function mostrar(vista) {
    const esCatalogo = vista === "catalogo";
    modoCatalogo.classList.toggle("hidden", !esCatalogo);
    modoBuscador.classList.toggle("hidden", esCatalogo);
    btnCatalogo.classList.toggle("activo", esCatalogo);
    btnBuscador.classList.toggle("activo", !esCatalogo);
    btnCatalogo.setAttribute("aria-pressed", String(esCatalogo));
    btnBuscador.setAttribute("aria-pressed", String(!esCatalogo));
    if (esCatalogo) renderCatalogoGrid(); // refleja el almacén/stock más reciente al entrar
  }

  btnBuscador.addEventListener("click", () => mostrar("buscador"));
  btnCatalogo.addEventListener("click", () => mostrar("catalogo"));
});

safeInit("catalogo-categorias", () => {
  document.getElementById("catalogo-categorias").addEventListener("click", (e) => {
    const chip = e.target.closest(".catalogo-chip");
    if (!chip) return;
    catalogoCategoriaActiva = chip.dataset.categoriaId || "";
    renderCatalogoCategorias();
    renderCatalogoGrid();
  });
});

safeInit("catalogo-grid", () => {
  document.getElementById("catalogo-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".catalogo-card");
    if (!card) return;
    const almacen_id = document.getElementById("venta-almacen").value;
    if (!almacen_id) { setMsg("msg-venta-linea", "Elegí un almacén.", false); return; }
    agregarLineaVenta(card.dataset.productoId, 1, almacen_id);
    renderCatalogoGrid(); // refleja el stock restante en la tarjeta
  });
});

// El catálogo depende del almacén elegido (precio y stock cambian), igual
// que ya le pasa a actualizarStockDisponibleUI() del buscador tradicional.
safeInit("venta-almacen-catalogo-sync", () => {
  document.getElementById("venta-almacen").addEventListener("change", renderCatalogoGrid);
});

function renderVentaLineas() {
  const lista = document.getElementById("venta-lineas");
  const totalEl = document.getElementById("venta-total");
  const btnConfirmar = document.getElementById("btn-confirmar-venta");
  if (!lista || !totalEl || !btnConfirmar) return;

  if (ventaLineas.length === 0) {
    lista.innerHTML = '<p class="lista-estado">Todavía no agregaste productos a esta venta.</p>';
    totalEl.textContent = "$0.00";
    btnConfirmar.disabled = true;
    return;
  }

  lista.innerHTML = "";
  let total = 0;
  ventaLineas.forEach((linea, idx) => {
    total += linea.subtotal;
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `
      <span class="venta-linea-info">
        <span>${escHtml(linea.nombre)}</span>
        <span class="muted">$${money(linea.precio_unitario)} c/u</span>
      </span>
      <span class="venta-linea-precios">
        <span class="venta-linea-cant-wrap">
          <button type="button" class="venta-linea-btn venta-linea-menos" data-idx="${idx}" aria-label="Restar">−</button>
          <input type="number" class="venta-linea-cant-input" data-idx="${idx}" value="${linea.cantidad}" step="0.01" min="0.01">
          <button type="button" class="venta-linea-btn venta-linea-mas" data-idx="${idx}" aria-label="Sumar">+</button>
        </span>
        <span class="muted">$${money(linea.subtotal)}</span>
        <button type="button" class="venta-linea-borrar" data-idx="${idx}">Quitar</button>
      </span>`;
    lista.appendChild(div);
  });
  totalEl.textContent = "$" + money(total);
  btnConfirmar.disabled = false;
}

// Cambia la cantidad de una línea ya agregada al carrito, validando contra
// el stock disponible (sin contar lo que esa misma línea ya tenía apartado).
// Si la nueva cantidad es 0 o menos, la línea se quita del carrito.
function actualizarCantidadLinea(idx, nuevaCantidad) {
  const linea = ventaLineas[idx];
  if (!linea) return;

  if (!(nuevaCantidad > 0)) {
    ventaLineas.splice(idx, 1);
    setMsg("msg-venta-linea", "", true);
    renderVentaLineas();
    return;
  }

  const almacen_id = document.getElementById("venta-almacen").value;
  const { valor: stockTotal } = obtenerStockDisponible(linea.producto_id, almacen_id);
  const enOtrasLineas = cantidadEnCarrito(linea.producto_id, idx);
  const disponible = stockTotal - enOtrasLineas;

  if (nuevaCantidad > disponible) {
    setMsg("msg-venta-linea", "No hay suficiente stock de " + linea.nombre + " (disponible: " + money(Math.max(disponible, 0)) + ").", false);
    renderVentaLineas(); // vuelve a mostrar el valor anterior, sin aplicar el cambio
    return;
  }

  linea.cantidad = nuevaCantidad;
  linea.subtotal = nuevaCantidad * linea.precio_unitario;
  setMsg("msg-venta-linea", "", true);
  renderVentaLineas();
}

safeInit("venta-producto-buscar", () => {
  const buscarInput = document.getElementById("venta-producto-buscar");
  const productoSelect = document.getElementById("venta-producto");
  const resultadosEl = document.getElementById("venta-producto-resultados");

  function cerrarResultados() {
    if (resultadosEl) { resultadosEl.classList.add("hidden"); resultadosEl.innerHTML = ""; }
  }

  function seleccionarProducto(p) {
    productoSelect.value = p.id;
    buscarInput.value = p.nombre;
    cerrarResultados();
    actualizarStockDisponibleUI();
  }

  buscarInput.addEventListener("input", () => {
    const termino = buscarInput.value.trim().toLowerCase();
    // Mantiene el <select> real filtrado (compatibilidad con quien prefiera
    const filtrados = termino
      ? ventaProductosLista.filter((p) => p.nombre.toLowerCase().includes(termino))
      : ventaProductosLista;
    fillSelect(productoSelect, filtrados, "id", (p) => p.nombre, true);

    if (!resultadosEl) return;
    if (!termino) { cerrarResultados(); return; }
    if (filtrados.length === 0) {
      resultadosEl.innerHTML = '<div class="venta-buscar-resultado-vacio">Sin coincidencias</div>';
      resultadosEl.classList.remove("hidden");
      return;
    }
    resultadosEl.innerHTML = "";
    filtrados.slice(0, 30).forEach((p) => {
      const div = document.createElement("div");
      div.className = "venta-buscar-resultado-item";
      div.textContent = p.nombre;
      div.addEventListener("click", () => seleccionarProducto(p));
      resultadosEl.appendChild(div);
    });
    resultadosEl.classList.remove("hidden");
  });

  buscarInput.addEventListener("focus", () => {
    if (buscarInput.value.trim()) buscarInput.dispatchEvent(new Event("input"));
  });

  document.addEventListener("click", (e) => {
    if (!resultadosEl || resultadosEl.classList.contains("hidden")) return;
    if (e.target === buscarInput || resultadosEl.contains(e.target)) return;
    cerrarResultados();
  });

  productoSelect.addEventListener("change", () => {
    // Si el producto se elige directo del <select> (sin usar el buscador),
    // el input de búsqueda no debe quedar con un texto que ya no aplica.
    const seleccionado = ventaProductosLista.find((p) => p.id === productoSelect.value);
    if (seleccionado) buscarInput.value = seleccionado.nombre;
  });
});

safeInit("form-venta-linea", () => {
  const form = document.getElementById("form-venta-linea");
  const almacenSelect = document.getElementById("venta-almacen");
  const productoSelect = document.getElementById("venta-producto");
  const cantidadInput = document.getElementById("venta-cantidad");

  // La venta entera pertenece a un solo almacén (el RPC recibe un único
  almacenSelect.addEventListener("change", () => {
    if (ventaLineas.length > 0) {
      ventaLineas = [];
      renderVentaLineas();
      setMsg("msg-venta-linea", "Se vació la venta al cambiar de almacén (el precio depende del almacén).", true);
    }
    actualizarStockDisponibleUI();
  });

  productoSelect.addEventListener("change", actualizarStockDisponibleUI);

  // Aviso en vivo mientras se escribe la cantidad, además del bloqueo real
  // que ocurre al enviar el formulario (no depende solo de esto).
  cantidadInput.addEventListener("input", () => {
    const max = cantidadInput.getAttribute("max");
    const val = parseFloat(cantidadInput.value);
    if (max !== null && val > parseFloat(max)) {
      setMsg("msg-venta-linea", "Esa cantidad supera el stock disponible (" + money(parseFloat(max)) + ").", false);
    } else {
      setMsg("msg-venta-linea", "", true);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const almacen_id = almacenSelect.value;
    const producto_id = productoSelect.value;
    const cantidad = parseFloat(cantidadInput.value);

    if (!almacen_id) { setMsg("msg-venta-linea", "Elegí un almacén.", false); return; }
    if (!producto_id) { setMsg("msg-venta-linea", "Elegí un producto.", false); return; }
    if (!(cantidad > 0)) { setMsg("msg-venta-linea", "La cantidad debe ser mayor a 0.", false); return; }

    const ok = agregarLineaVenta(producto_id, cantidad, almacen_id);
    if (!ok) return;

    cantidadInput.value = "";
    productoSelect.value = "";
    buscarInputReset();
    actualizarStockDisponibleUI();
  });

  function buscarInputReset() {
    const buscarInput = document.getElementById("venta-producto-buscar");
    if (buscarInput && buscarInput.value) {
      buscarInput.value = "";
      fillSelect(productoSelect, ventaProductosLista, "id", (p) => p.nombre, true);
    }
  }
});

// R10: buscadores de movimientos (ventas + transferencias + vales). Un solo
safeInit("movimientos-buscadores", () => {
  const configs = [
    { inputId: "ventas-buscar", contadorId: "ventas-contador", listaId: "lista-ventas",
      estadoVar: "_ventasBusqueda", renderFn: "renderVentasHistorial" },
    { inputId: "trf-buscar", contadorId: "trf-contador", listaId: "lista-transferencias",
      estadoVar: "_trfBusqueda", renderFn: "renderTransferenciasLista" },
    { inputId: "vales-buscar", contadorId: "vales-contador", listaId: "lista-vales",
      estadoVar: "_valesBusqueda", renderFn: "renderValesLista" },
  ];
  configs.forEach((cfg) => {
    const input = document.getElementById(cfg.inputId);
    if (!input) return;
    input.addEventListener("input", () => {
      if (cfg.estadoVar === "_ventasBusqueda") _ventasBusqueda = input.value || "";
      else if (cfg.estadoVar === "_trfBusqueda") _trfBusqueda = input.value || "";
      else if (cfg.estadoVar === "_valesBusqueda") _valesBusqueda = input.value || "";
      if (cfg.renderFn === "renderVentasHistorial") renderVentasHistorial();
      else if (cfg.renderFn === "renderTransferenciasLista") renderTransferenciasLista();
      else if (cfg.renderFn === "renderValesLista") renderValesLista();
    });
    // Boton "Ver todos" (delegado dentro de la lista).
    const lista = document.getElementById(cfg.listaId);
    if (lista) {
      lista.addEventListener("click", (e) => {
        if (e.target.closest(".mov-ver-todas-btn")) {
          if (cfg.estadoVar === "_ventasBusqueda") _ventasBusqueda = "";
          else if (cfg.estadoVar === "_trfBusqueda") _trfBusqueda = "";
          else if (cfg.estadoVar === "_valesBusqueda") _valesBusqueda = "";
          input.value = "";
          if (cfg.renderFn === "renderVentasHistorial") renderVentasHistorial();
          else if (cfg.renderFn === "renderTransferenciasLista") renderTransferenciasLista();
          else if (cfg.renderFn === "renderValesLista") renderValesLista();
        }
      });
    }
  });
});

// Un solo listener delegado para +/-, edición directa y "Quitar" dentro del
// carrito — evita registrar un listener por cada línea que se agrega/quita.
safeInit("venta-lineas-interaccion", () => {
  const contenedor = document.getElementById("venta-lineas");

  contenedor.addEventListener("click", (e) => {
    const btnQuitar = e.target.closest(".venta-linea-borrar");
    if (btnQuitar) {
      ventaLineas.splice(Number(btnQuitar.dataset.idx), 1);
      setMsg("msg-venta-linea", "", true);
      renderVentaLineas();
      actualizarStockDisponibleUI();
      return;
    }
    const btnMas = e.target.closest(".venta-linea-mas");
    if (btnMas) {
      const idx = Number(btnMas.dataset.idx);
      const linea = ventaLineas[idx];
      if (linea) actualizarCantidadLinea(idx, linea.cantidad + 1);
      return;
    }
    const btnMenos = e.target.closest(".venta-linea-menos");
    if (btnMenos) {
      const idx = Number(btnMenos.dataset.idx);
      const linea = ventaLineas[idx];
      if (linea) actualizarCantidadLinea(idx, linea.cantidad - 1);
      return;
    }
  });

  contenedor.addEventListener("change", (e) => {
    const input = e.target.closest(".venta-linea-cant-input");
    if (!input) return;
    actualizarCantidadLinea(Number(input.dataset.idx), parseFloat(input.value));
  });
});

// Bandera simple para que, si alguien toca varias veces "Confirmar venta"
// (por ejemplo con la red lenta), no se dispare más de un registrar_venta a
// la vez con el mismo carrito.
let enviandoVenta = false;

safeInit("confirmar-venta", () => {
  document.getElementById("btn-confirmar-venta").addEventListener("click", async () => {
    if (enviandoVenta) return;

    const almacen_id = document.getElementById("venta-almacen").value;
    const btn = document.getElementById("btn-confirmar-venta");

    if (!almacen_id) { setMsg("msg-venta", "Elegí un almacén.", false); return; }
    if (ventaLineas.length === 0) { setMsg("msg-venta", "Agregá al menos un producto a la venta.", false); return; }

    const total = ventaLineas.reduce((s, l) => s + l.subtotal, 0);
    if (!window.confirm("¿Confirmar venta por $" + money(total) + "? Esto descuenta stock real.")) {
      return;
    }

    enviandoVenta = true;
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = "Procesando...";
    setMsg("msg-venta", "Procesando venta…", true);

    const p_lineas = ventaLineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }));
    const resultado = await ejecutarOperacion("venta", {
      p_almacen_id: almacen_id, p_lineas,
    });

    enviandoVenta = false;

    if (!resultado.ok) {
      setMsg("msg-venta", "No se pudo registrar la venta: " + explicarError(resultado.error, "registrar venta"), false);
      btn.disabled = false;
      btn.textContent = textoOriginal;
      return;
    }

    btn.textContent = textoOriginal;
    setMsg("msg-venta-linea", "", true);
    ventaLineas = [];
    renderVentaLineas(); // vuelve a deshabilitar "Confirmar venta" al quedar vacía

    if (resultado.offline) {
      setMsg("msg-venta", "✓ Venta guardada localmente por $" + money(total) + " — se sincronizará al recuperar conexión.", true);
      actualizarStockDisponibleUI(); // refleja la proyección local (Sección 16) ya con esta venta descontada
      return;
    }

    setMsg("msg-venta", "✓ Venta registrada por $" + money(total) + ". Todo listo para la próxima venta.", true);
    await refrescarStockYSelects();
    await refrescarVentas();
  });
});

async function refrescarVentas() {
  const [productos, almacenes, categorias] = await Promise.all([
    cargarProductos(), cargarAlmacenes(), cargarCategorias(),
  ]);

  ventaAlmacenesTipo = {};
  almacenes.forEach((a) => { ventaAlmacenesTipo[a.id] = a.tipo; });

  ventaProductosPrecios = {};
  productos.forEach((p) => {
    ventaProductosPrecios[p.id] = {
      nombre: p.nombre, precio_normal: p.precio_normal, precio_mayorista: p.precio_mayorista,
    };
  });

  ventaProductosLista = productos;
  ventaCategoriasLista = categorias;
  const buscarInput = document.getElementById("venta-producto-buscar");
  if (buscarInput) buscarInput.value = "";

  fillSelect(document.getElementById("venta-almacen"), almacenes, "id", (a) => a.nombre, true);
  fillSelect(document.getElementById("venta-producto"), productos, "id", (p) => p.nombre, true);
  renderVentaLineas();
  actualizarStockDisponibleUI();
  renderCatalogoCategorias();
  renderCatalogoGrid();
  await refrescarVentasHistorial();
}

// R5: estado de busqueda del historial de ventas en memoria. Patron
let _ventasBusqueda = "";

async function refrescarVentasHistorial() {
  setLoading("lista-ventas", "Cargando ventas…");
  const { data } = await client
    .from("ventas")
    .select("id, fecha, total, almacenes(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);

  _cache.ventas = data || [];
  renderResumen();
  // R5: el render aplica el filtro de busqueda sobre _cache.ventas sin
  // modificarlo. Si _cache.ventas esta vacio, muestra el estado vacio.
  renderVentasHistorial();
}

// R5: render del historial de ventas accionable. Filtra _cache.ventas en
function renderVentasHistorial() {
  const lista = document.getElementById("lista-ventas");
  if (!lista) return;
  const todas = _cache.ventas || [];
  if (todas.length === 0) {
    setEmpty("lista-ventas", "Todavía no hay ventas registradas.");
    actualizarContador("ventas-contador", 0, 0);
    return;
  }
  // Filtrar en memoria por el termino de busqueda (ID corto, almacén, fecha, total).
  const termino = _ventasBusqueda.trim().toLowerCase();
  const filtradas = termino
    ? todas.filter((v) => {
        const idC = v.id ? idCorto(v.id).toLowerCase() : "";
        const idFull = v.id ? v.id.toLowerCase() : "";
        const alm = v.almacenes && v.almacenes.nombre ? v.almacenes.nombre.toLowerCase() : "";
        const fec = v.fecha ? fechaCorta(v.fecha).toLowerCase() : "";
        const tot = v.total != null ? money(v.total) : "";
        return idC.includes(termino) || idFull.includes(termino) || alm.includes(termino) || fec.includes(termino) || tot.includes(termino);
      })
    : todas;
  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="lista-estado">🔎 No encontramos ventas con esos criterios.</p>'
      + '<button type="button" class="cc-accion mov-ver-todas-btn" data-tipo="ventas">Ver todas las ventas</button>';
    actualizarContador("ventas-contador", 0, todas.length);
    return;
  }
  lista.innerHTML = "";
  filtradas.forEach((v) => {
    const div = document.createElement("div");
    // R6/R7: cada venta es accionable. data-venta-id abre el detalle con auditoria.
    div.className = "lista-item lista-item-accion venta-item";
    div.setAttribute("data-venta-id", v.id || "");
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    div.innerHTML = `<span>${v.almacenes ? escHtml(v.almacenes.nombre) : "—"} <span class="muted">· #${v.id ? idCorto(v.id) : "—"}</span></span>
      <span class="muted">${fechaCorta(v.fecha)} · $${money(v.total)}</span>`;
    lista.appendChild(div);
  });
  actualizarContador("ventas-contador", filtradas.length, todas.length);
}

// R10: contador visible reutilizable para ventas/transferencias/vales.
// Muestra "Mostrando X de Y" (o "N elementos" cuando coinciden).
// No consulta nada nuevo: solo pinta el estado del filtro en memoria.
function actualizarContador(elId, visibles, total) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (total === 0) { el.textContent = ""; return; }
  el.textContent = visibles === total
    ? total + (total === 1 ? " elemento" : " elementos")
    : "Mostrando " + visibles + " de " + total;
}

// ---- Formas de presentación. Los 3 catálogos comparten la misma regla de
function initCatalogoSimple({ tabla, formId, inputId, listaId, singular }) {
  safeInit("catalogo-" + tabla, () => {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const lista = document.getElementById(listaId);

    async function refrescar() {
      setLoading(listaId, "Cargando…");
      const data = await withCache(tabla, () => client.from(tabla).select("id, nombre, activo").order("nombre"));
      if (!data || data.length === 0) {
        setEmpty(listaId, mensajeListaVacia(tabla, "Todavía no hay " + tabla + " cargadas."));
        return;
      }
      lista.innerHTML = "";
      data.forEach((row) => {
        const div = document.createElement("div");
        div.className = "lista-item";
        div.innerHTML = `<span>${escHtml(row.nombre)} ${row.activo ? "" : '<span class="muted">· inactivo</span>'}</span>
          <button type="button" class="catalogo-toggle-btn" data-id="${row.id}" data-activo="${row.activo}">${row.activo ? "Desactivar" : "Activar"}</button>`;
        lista.appendChild(div);
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = input.value.trim();
      const submitBtn = form.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      const { error } = await client.from(tabla).insert({ nombre });
      submitBtn.disabled = false;
      if (error) {
        const msg = error.code === "23505" ? "Ya existe un valor con ese nombre." : explicarError(error, "crear " + singular);
        setMsg("msg-config", "No se pudo crear: " + msg, false);
        return;
      }
      setMsg("msg-config", singular.charAt(0).toUpperCase() + singular.slice(1) + " creada.", true);
      form.reset();
      await refrescar();
    });

    lista.addEventListener("click", async (e) => {
      const btn = e.target.closest(".catalogo-toggle-btn");
      if (!btn) return;
      const id = btn.dataset.id;
      const activoActual = btn.dataset.activo === "true";
      btn.disabled = true;
      const { error } = await client.from(tabla).update({ activo: !activoActual }).eq("id", id);
      btn.disabled = false;
      if (error) {
        setMsg("msg-config", "No se pudo actualizar: " + explicarError(error, "actualizar " + singular), false);
        return;
      }
      await refrescar();
    });

    window["_refrescarCatalogo_" + tabla] = refrescar;
  });
}

initCatalogoSimple({ tabla: "categorias", formId: "form-categoria", inputId: "cat-nombre", listaId: "lista-categorias", singular: "categoría" });
initCatalogoSimple({ tabla: "unidades", formId: "form-unidad", inputId: "uni-nombre", listaId: "lista-unidades", singular: "unidad" });

// ---- B3 — SISTEMA OPERACIONAL DE USUARIOS, ROLES, PERMISOS Y CONTROL
// Una sola fuente para saber quién usa la app. Evita cargarUsuario() /
async function cargarContextoUsuario() {
  if (_cargandoUsuario) return;
  _cargandoUsuario = true;
  try {
    const { data: sesion } = await client.auth.getSession();
    if (!sesion || !sesion.session) {
      limpiarContextoUsuario();
      _cargandoUsuario = false;
      return;
    }
    const authUser = sesion.session.user;
    // Perfil real (nombre, activo, rol) vía RPC. Si no existe aún, fallback.
    let perfil = null;
    try {
      const { data, error } = await client.rpc("perfil_usuario_actual", {});
      if (!error && data) perfil = Array.isArray(data) ? data[0] : data;
    } catch (e) { /* RPC inexistente: perfil queda null */ }

    if (perfil) {
      _usuarioActual = {
        id: perfil.id || authUser.id,
        nombre: perfil.nombre || authUser.email,
        activo: perfil.activo !== false,
        role_id: perfil.role_id || null,
        rol: perfil.rol || null,
      };
    } else {
      // SQL de B3 aún no aplicado: contexto mínimo desde Auth (no inventa
      // rol/permisos). La app funciona como antes.
      _usuarioActual = {
        id: authUser.id,
        nombre: authUser.email,
        activo: true, // se asume activo si no hay forma de comprobarlo
        role_id: null,
        rol: null,
      };
    }

    // Permisos efectivos vía RPC (matriz seccion->accion). Si no existe,
    _permisosEfectivos = {};
    _permisosCargaExitosa = false;
    _permisosCargaFallidaRed = false;
    try {
      const { data: perms, error } = await client.rpc("permisos_usuario_actual", {});
      if (error) {
        // Error de red: NO abrir todo por un fallo de conectividad.
        if (esErrorDeRed(error)) _permisosCargaFallidaRed = true;
        // Si el error es 42883 (RPC inexistente, SQL B3 no aplicado), se
        // mantiene la degradacion legitima: ningun flag se setea en true.
      } else if (Array.isArray(perms)) {
        _permisosCargaExitosa = true;
        perms.forEach((p) => {
          if (!_permisosEfectivos[p.seccion]) _permisosEfectivos[p.seccion] = {};
          _permisosEfectivos[p.seccion][p.accion] = true;
        });
      }
    } catch (e) {
      // Excepcion de red (Failed to fetch, etc.): fallo de red, no autorizar.
      if (esErrorDeRed(e)) _permisosCargaFallidaRed = true;
    }

    aplicarPermisosAInterfaz();
    mostrarInfoUsuarioEnHeader();
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo cargar el contexto de usuario:", e);
  } finally {
    _cargandoUsuario = false;
  }
}

// No borra cachés globales útiles (productos/stock), solo el contexto de
// identidad/permisos. Evita que el usuario B vea permisos del usuario A.
function limpiarContextoUsuario() {
  _usuarioActual = null;
  _permisosEfectivos = {};
  _permisosCargaExitosa = false;
  _permisosCargaFallidaRed = false;
  _novedadesVistas = new Set();
  try {
    _cache.productos = []; _cache.almacenes = []; _cache.stock = [];
    _cache.transferencias = []; _cache.vales = []; _cache.ventas = [];
  } catch (_) {}
  try {
    Object.keys(_estadoCacheClaves).forEach((k) => delete _estadoCacheClaves[k]);
  } catch (_) {}
  try { _operacionesPendientesCache = []; } catch (_) {}
  // Multiusuario: resetear el estado en memoria de B7/B8 para que el
  try { _turnoActual = null; } catch (_) {}
  try { _b7CacheAlertas = { turnosAbiertos: 0, cuadresPendientes: 0, cuadresDiferencia: 0, respPendientes: 0, incAbiertas: 0 }; } catch (_) {}
  try { _b8CacheAlertas = { soportePendiente: 0, convRecientes: 0 }; } catch (_) {}
  // Multiusuario: resetear la conversacion abierta en memoria. Sin esto,
  try { _comConvActual = null; _comConvActualTipo = null; } catch (_) {}
  // El badge de Centro de Control se resetea para no arrastrar estado.
  const badge = document.getElementById("resumen-tab-badge");
  if (badge) { badge.classList.add("hidden"); badge.textContent = ""; }
  // Reaplicar permisos: sin usuario, todo oculto salvo login.
  aplicarPermisosAInterfaz();
}

function tienePermiso(seccion, accion) {
  if (!_usuarioActual) return false; // sin sesión: nada
  if (Object.keys(_permisosEfectivos).length === 0) {
    // Sin matriz cargada. La degradación a true solo es legítima cuando el
    if (_permisosCargaFallidaRed || _permisosCargaExitosa) return false;
    return true;
  }
  const sec = _permisosEfectivos[seccion];
  return !!(sec && sec[accion]);
}

// ¿El SQL de B3 está aplicado? (hay perfil real con rol o permisos cargados)
function contextoB3Disponible() {
  return !!(_usuarioActual && (_usuarioActual.rol !== null || Object.keys(_permisosEfectivos).length > 0));
}

// Mapa: tab -> seccion que requiere permiso "ver". El sidebar se oculta
// según permisos, pero la autorización real sigue siendo el backend.
var TAB_A_SECCION = {
  productos: "productos",
  ventas: "ventas",
  almacenes: "almacenes",
  transferencias: "transferencias",
  vales: "vales",
  pendientes: "pendientes",
  config: "config",
  usuarios: "usuarios",
  mando: "auditoria", // B4: Centro de Mando requiere permiso auditoria.ver
  reportes: "reportes", // B5: Reportes requiere permiso reportes.ver
  inventario: "reportes", // B6: Inventario requiere permiso reportes.ver
  movimientos: "reportes", // B6: Movimientos requiere permiso reportes.ver
  turnos: "turnos", // B7: Turnos requiere permiso turnos.ver
  operacion: "turnos", // B7: Operación requiere permiso turnos.ver
  comunicacion: "comunicacion", // B8: Comunicación requiere permiso comunicacion.ver
};

function aplicarPermisosAInterfaz() {
  // Sidebar: ocultar tabs sin permiso "ver". UX, no seguridad.
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const tab = btn.dataset.tab;
    if (!tab) return;
    // durante la carga inicial (showApp se dispara via getSession). Tolerante.
    const seccion = (typeof TAB_A_SECCION !== "undefined" && TAB_A_SECCION) ? TAB_A_SECCION[tab] : undefined;
    if (!seccion) return; // resumen (Centro de Control) siempre visible
    const permitido = tienePermiso(seccion, "ver");
    btn.classList.toggle("hidden", !permitido);
    btn.style.display = permitido ? "" : "none";
  });

  // Botones de creación: ocultar según "crear".
  togglePorPermiso("form-producto", "productos", "crear");
  togglePorPermiso("form-compra", "compras", "crear");
  togglePorPermiso("form-venta-linea", "ventas", "crear");
  togglePorPermiso("form-almacen", "almacenes", "crear");
  togglePorPermiso("form-transferencia", "transferencias", "crear");
  togglePorPermiso("form-vale", "vales", "crear");
  togglePorPermiso("form-categoria", "config", "crear");
  togglePorPermiso("form-unidad", "config", "crear");
}

function togglePorPermiso(elId, seccion, accion) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.toggle("hidden", !tienePermiso(seccion, accion));
}

// Muestra nombre/rol del usuario en el header (reemplaza el email crudo).
function mostrarInfoUsuarioEnHeader() {
  const el = document.getElementById("user-email");
  if (!el) return;
  if (!_usuarioActual) { el.textContent = ""; return; }
  const nombre = _usuarioActual.nombre || "";
  const rol = _usuarioActual.rol ? " · " + _usuarioActual.rol : "";
  el.textContent = nombre + rol;
}

async function usuarioPuedeOperar() {
  if (!_usuarioActual) return false;
  if (!contextoB3Disponible()) return true; // degradación: no podemos saber
  // Offline: el contexto en memoria es lo único disponible; el backend
  // validará activo al sincronizar la operación (RLS/tiene_permiso).
  if (!navigator.onLine) return _usuarioActual.activo !== false;
  // Online: validar contra el backend para bloqueo real y fresco.
  try {
    const { data, error } = await client.rpc("usuario_esta_activo", {});
    if (!error) {
      // Actualizar el contexto en memoria con el valor fresco del backend.
      _usuarioActual.activo = data === true;
      return data === true;
    }
    // Si el RPC aún no existe (SQL no aplicado), caer al contexto.
  } catch (e) { /* RPC inexistente: usar contexto */ }
  return _usuarioActual.activo !== false;
}

// crearOperacionPendiente con _usuarioActualId). Aseguramos que
// _usuarioActualId esté sincronizado con el contexto.
function sincronizarUsuarioIdParaOperaciones() {
  if (_usuarioActual && _usuarioActual.id) {
    _usuarioActualId = _usuarioActual.id;
  }
}

let _usuariosCache = [];
let _rolesCache = [];

async function refrescarUsuarios() {
  if (!tienePermiso("usuarios", "ver")) {
    setEmpty("lista-usuarios", "No tenés permiso para ver usuarios.");
    return;
  }
  setLoading("lista-usuarios", "Cargando usuarios…");
  // Refrescar roles ANTES de renderizar usuarios: el <select> de rol de
  await refrescarRoles();
  try {
    const { data, error } = await client.rpc("listar_usuarios_admin", {});
    if (error) {
      // Si el RPC no existe todavía (SQL no aplicado), mensaje claro.
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        setEmpty("lista-usuarios", "Falta aplicar supabase/b3-roles-permisos.sql en Supabase (función listar_usuarios_admin).");
      } else {
        setEmpty("lista-usuarios", "No se pudieron cargar los usuarios: " + escHtml(msg));
      }
      return;
    }
    _usuariosCache = data || [];
    renderizarUsuarios(_usuariosCache);
  } catch (e) {
    setEmpty("lista-usuarios", "Error al cargar usuarios.");
    console.warn("[Battlecruiser] listar_usuarios_admin:", e);
  }
}

function renderizarUsuarios(usuarios) {
  const lista = document.getElementById("lista-usuarios");
  if (!lista) return;
  if (!usuarios || usuarios.length === 0) {
    setEmpty("lista-usuarios", "Todavía no hay usuarios registrados.");
    return;
  }
  lista.innerHTML = "";
  const puedeEditar = tienePermiso("usuarios", "editar");
  usuarios.forEach((u) => {
    const div = document.createElement("div");
    div.className = "lista-item usuario-item" + (u.activo === false ? " usuario-inactivo" : "");
    const estado = u.activo === false ? "🔴 Inactivo" : "🟢 Activo";

    let selectRol = '<span class="usuario-rol-fijo">Rol: ' + escHtml(u.rol || "—") + '</span>';
    if (puedeEditar) {
      const opciones = _rolesCache.map((r) => {
        const sel = r.id === u.role_id ? " selected" : "";
        return '<option value="' + escHtml(r.id) + '"' + sel + '>' + escHtml(r.nombre) + '</option>';
      }).join("");
      selectRol = '<select class="usr-rol-select" data-id="' + escHtml(u.id) + '">' + opciones + '</select>';
    }

    let acciones = "";
    if (puedeEditar) {
      acciones = '<span class="usuario-acciones">'
        + '<button type="button" class="cc-accion usr-estado-btn" data-id="' + escHtml(u.id) + '" data-activo="' + (u.activo !== false ? "true" : "false") + '">' + (u.activo !== false ? "Desactivar" : "Activar") + '</button>'
        + "</span>";
    }
    div.innerHTML = '<span class="usuario-principal">'
      + '<span class="usuario-nombre">' + escHtml(u.nombre || "—") + '</span>'
      + '<span class="muted">' + selectRol + ' · ' + estado + '</span>'
      + '</span>' + acciones;
    lista.appendChild(div);
  });
}

async function refrescarRoles(incluirInactivos) {
  try {
    const { data, error } = await client.rpc("listar_roles_admin", { p_incluir_inactivos: !!incluirInactivos });
    if (error) { _rolesCache = []; return; }
    _rolesCache = data || [];
  } catch (e) { _rolesCache = []; }
}

// de renderizarUsuarios (reutiliza asignar_rol_usuario, ya protegido en
// backend). Reemplaza el flujo anterior de window.prompt() con texto libre.
async function cambiarRolDesdeSelect(usuarioId, roleId, selectEl) {
  if (!tienePermiso("usuarios", "editar")) return;
  const rol = _rolesCache.find((r) => r.id === roleId);
  const { error } = await client.rpc("asignar_rol_usuario", { p_usuario_id: usuarioId, p_role_id: roleId });
  if (error) {
    setMsg("msg-usuarios", "No se pudo cambiar el rol: " + escHtml(error.message || error.code || error), false);
    // Revertir el <select> visualmente si la llamada falló (por ejemplo,
    // protección del último Dueño activo), para no mostrar un valor que
    // en realidad no se guardó.
    await refrescarUsuarios();
    return;
  }
  setMsg("msg-usuarios", "Rol actualizado.", true);
  // B4: auditoría del cambio de rol (trazabilidad administrativa).
  if (typeof registrarAuditoria === "function") {
    registrarAuditoria("usuario_rol", "Rol de usuario cambiado a '" + (rol ? rol.nombre : roleId) + "'.", "exito", usuarioId, null, null);
  }
  await refrescarUsuarios();
}

// Cambiar estado activo/inactivo (reutiliza cambiar_estado_usuario).
async function cambiarEstadoUsuario(usuarioId, activoActual) {
  if (!tienePermiso("usuarios", "editar")) return;
  const nuevo = activoActual !== true;
  const { error } = await client.rpc("cambiar_estado_usuario", { p_usuario_id: usuarioId, p_activo: nuevo });
  if (error) {
    setMsg("msg-usuarios", "No se pudo cambiar el estado: " + escHtml(error.message || error.code || error), false);
    return;
  }
  setMsg("msg-usuarios", nuevo ? "Usuario activado." : "Usuario desactivado.", true);
  // B4: auditoría del cambio de estado (trazabilidad administrativa).
  if (typeof registrarAuditoria === "function") {
    registrarAuditoria("usuario_estado", nuevo ? "Usuario activado." : "Usuario desactivado.", "exito", usuarioId, null, null);
  }
  await refrescarUsuarios();
}

safeInit("admin-usuarios", () => {
  const lista = document.getElementById("lista-usuarios");
  if (!lista) return;
  lista.addEventListener("click", async (e) => {
    const estBtn = e.target.closest(".usr-estado-btn");
    if (estBtn) {
      e.stopPropagation();
      await cambiarEstadoUsuario(estBtn.dataset.id, estBtn.dataset.activo === "true");
      return;
    }
  });
  // por "change" (no "click" como los botones de arriba).
  lista.addEventListener("change", async (e) => {
    const sel = e.target.closest(".usr-rol-select");
    if (!sel) return;
    e.stopPropagation();
    await cambiarRolDesdeSelect(sel.dataset.id, sel.value, sel);
  });
});

// ---- Regla de arquitectura (mission 9.3): los permisos pertenecen al ROL, no
const SECCIONES_PERMISOS = ["productos", "categorias", "almacenes", "stock",
  "transferencias", "vales_salida", "ventas", "reportes", "usuarios",
  "presentaciones", "auditoria", "turnos", "comunicacion", "unidades"];
const ACCIONES_PERMISOS = ["ver", "crear", "editar", "borrar", "editar_any"];

let _rolExpandidoId = null; // rol cuya matriz de permisos está abierta
let _permisosRolActual = []; // matriz cargada del rol expandido

async function refrescarRolesAdmin() {
  if (!tienePermiso("usuarios", "ver")) {
    setEmpty("lista-roles", "No tenés permiso para ver roles.");
    return;
  }
  setLoading("lista-roles", "Cargando roles…");
  try {
    const { data, error } = await client.rpc("listar_roles_admin", { p_incluir_inactivos: true });
    if (error) {
      setEmpty("lista-roles", "No se pudieron cargar los roles: " + escHtml(error.message || error.code || error));
      return;
    }
    renderizarRolesAdmin(data || []);
  } catch (e) {
    setEmpty("lista-roles", "Error al cargar roles.");
    console.warn("[Battlecruiser] listar_roles_admin:", e);
  }
}

function renderizarRolesAdmin(roles) {
  const cont = document.getElementById("lista-roles");
  if (!cont) return;
  if (!roles || roles.length === 0) {
    setEmpty("lista-roles", "Todavía no hay roles.");
    return;
  }
  const puedeEditar = tienePermiso("usuarios", "editar");
  const puedeBorrar = tienePermiso("usuarios", "borrar");
  cont.innerHTML = "";
  roles.forEach((r) => {
    const esDueno = r.nombre === "Dueño";
    const div = document.createElement("div");
    div.className = "lista-item rol-item" + (r.activo === false ? " usuario-inactivo" : "");
    const estado = r.activo === false ? "🔴 Inactivo" : "🟢 Activo";
    let acciones = '<button type="button" class="cc-accion rol-permisos-btn" data-id="' + escHtml(r.id) + '">'
      + (_rolExpandidoId === r.id ? "Ocultar permisos" : "Ver/editar permisos") + '</button>';
    if (puedeEditar && !esDueno) {
      acciones += '<button type="button" class="cc-accion rol-renombrar-btn" data-id="' + escHtml(r.id) + '" data-nombre="' + escHtml(r.nombre) + '">Renombrar</button>'
        + '<button type="button" class="cc-accion rol-estado-btn" data-id="' + escHtml(r.id) + '" data-activo="' + (r.activo !== false ? "true" : "false") + '">' + (r.activo !== false ? "Desactivar" : "Activar") + '</button>';
    }
    if (puedeBorrar && !esDueno) {
      acciones += '<button type="button" class="cc-accion rol-eliminar-btn" data-id="' + escHtml(r.id) + '" data-nombre="' + escHtml(r.nombre) + '" data-usuarios="' + (r.cantidad_usuarios || 0) + '">Eliminar</button>';
    }
    div.innerHTML = '<span class="usuario-principal">'
      + '<span class="usuario-nombre">' + escHtml(r.nombre) + (esDueno ? " 🔒" : "") + '</span>'
      + '<span class="muted">' + (r.cantidad_usuarios || 0) + ' usuario(s) · ' + estado + '</span>'
      + '</span><span class="usuario-acciones">' + acciones + '</span>';
    cont.appendChild(div);

    if (_rolExpandidoId === r.id) {
      const panel = document.createElement("div");
      panel.className = "rol-permisos-panel";
      panel.id = "rol-permisos-panel";
      panel.innerHTML = '<p class="muted">Cargando permisos…</p>';
      cont.appendChild(panel);
      cargarYRenderizarPermisosRol(r.id, esDueno);
    }
  });
}

async function cargarYRenderizarPermisosRol(roleId, esDueno) {
  const panel = document.getElementById("rol-permisos-panel");
  if (!panel) return;
  try {
    const { data, error } = await client.rpc("permisos_por_rol", { p_role_id: roleId });
    if (error) {
      panel.innerHTML = '<p class="msg">No se pudieron cargar los permisos: ' + escHtml(error.message || error.code || error) + '</p>';
      return;
    }
    _permisosRolActual = data || [];
    const permitidos = new Set(_permisosRolActual.filter((p) => p.permitido).map((p) => p.seccion + "|" + p.accion));
    const disponibles = new Set(_permisosRolActual.map((p) => p.seccion + "|" + p.accion));

    let tabla = '<table class="permisos-tabla"><thead><tr><th>Sección</th>';
    ACCIONES_PERMISOS.forEach((a) => { tabla += "<th>" + a + "</th>"; });
    tabla += "</tr></thead><tbody>";
    SECCIONES_PERMISOS.forEach((s) => {
      tabla += "<tr><td>" + s + "</td>";
      ACCIONES_PERMISOS.forEach((a) => {
        const key = s + "|" + a;
        if (!disponibles.has(key)) { tabla += "<td>—</td>"; return; }
        const checked = permitidos.has(key) ? " checked" : "";
        const disabled = esDueno ? " disabled" : "";
        tabla += '<td><input type="checkbox" class="permiso-check" data-seccion="' + s + '" data-accion="' + a + '"' + checked + disabled + '></td>';
      });
      tabla += "</tr>";
    });
    tabla += "</tbody></table>";
    if (esDueno) {
      tabla += '<p class="muted">El rol Dueño siempre tiene todos los permisos; no se puede editar.</p>';
    } else {
      tabla += '<button type="button" class="cc-accion" id="rol-permisos-guardar-btn" data-id="' + escHtml(roleId) + '">Guardar permisos</button>';
    }
    panel.innerHTML = tabla;
  } catch (e) {
    panel.innerHTML = '<p class="msg">Error al cargar permisos.</p>';
    console.warn("[Battlecruiser] permisos_por_rol:", e);
  }
}

safeInit("admin-roles", () => {
  const form = document.getElementById("form-nuevo-rol");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("rol-nombre");
      const nombre = input.value.trim();
      if (!nombre) return;
      showLoading();
      try {
        const { error } = await client.rpc("crear_rol", { p_nombre: nombre });
        if (error) {
          setMsg("msg-roles", "No se pudo crear el rol: " + escHtml(error.message || error.code || error), false);
          return;
        }
        setMsg("msg-roles", "Rol creado. Asignale permisos con \"Ver/editar permisos\".", true);
        form.reset();
        await refrescarRolesAdmin();
      } catch (err) {
        setMsg("msg-roles", "Error inesperado al crear el rol.", false);
        console.error("[Battlecruiser] crear_rol", err);
      } finally {
        hideLoading();
      }
    });
  }

  const lista = document.getElementById("lista-roles");
  if (!lista) return;

  lista.addEventListener("click", async (e) => {
    const permisosBtn = e.target.closest(".rol-permisos-btn");
    if (permisosBtn) {
      e.stopPropagation();
      const id = permisosBtn.dataset.id;
      _rolExpandidoId = (_rolExpandidoId === id) ? null : id;
      await refrescarRolesAdmin();
      return;
    }

    const renombrarBtn = e.target.closest(".rol-renombrar-btn");
    if (renombrarBtn) {
      e.stopPropagation();
      const nuevo = window.prompt("Nuevo nombre para el rol \"" + renombrarBtn.dataset.nombre + "\":", renombrarBtn.dataset.nombre);
      if (!nuevo || !nuevo.trim() || nuevo.trim() === renombrarBtn.dataset.nombre) return;
      showLoading();
      try {
        const { error } = await client.rpc("editar_rol", { p_role_id: renombrarBtn.dataset.id, p_nombre: nuevo.trim() });
        if (error) { setMsg("msg-roles", "No se pudo renombrar: " + escHtml(error.message || error.code || error), false); return; }
        setMsg("msg-roles", "Rol renombrado.", true);
        await refrescarRolesAdmin();
        await refrescarUsuarios();
      } finally { hideLoading(); }
      return;
    }

    const estadoBtn = e.target.closest(".rol-estado-btn");
    if (estadoBtn) {
      e.stopPropagation();
      const activar = estadoBtn.dataset.activo !== "true";
      showLoading();
      try {
        const { error } = await client.rpc("activar_desactivar_rol", { p_role_id: estadoBtn.dataset.id, p_activo: activar });
        if (error) { setMsg("msg-roles", "No se pudo cambiar el estado: " + escHtml(error.message || error.code || error), false); return; }
        setMsg("msg-roles", activar ? "Rol activado." : "Rol desactivado.", true);
        await refrescarRolesAdmin();
      } finally { hideLoading(); }
      return;
    }

    const eliminarBtn = e.target.closest(".rol-eliminar-btn");
    if (eliminarBtn) {
      e.stopPropagation();
      const cantUsuarios = parseInt(eliminarBtn.dataset.usuarios || "0", 10);
      if (cantUsuarios > 0) {
        setMsg("msg-roles", "No se puede eliminar \"" + eliminarBtn.dataset.nombre + "\": " + cantUsuarios + " usuario(s) todavía lo tienen asignado.", false);
        return;
      }
      if (!window.confirm("¿Eliminar el rol \"" + eliminarBtn.dataset.nombre + "\"? Esta acción no se puede deshacer.")) return;
      showLoading();
      try {
        const { error } = await client.rpc("eliminar_rol", { p_role_id: eliminarBtn.dataset.id });
        if (error) { setMsg("msg-roles", "No se pudo eliminar: " + escHtml(error.message || error.code || error), false); return; }
        setMsg("msg-roles", "Rol eliminado.", true);
        if (_rolExpandidoId === eliminarBtn.dataset.id) _rolExpandidoId = null;
        await refrescarRolesAdmin();
      } finally { hideLoading(); }
      return;
    }

    const guardarBtn = e.target.closest("#rol-permisos-guardar-btn");
    if (guardarBtn) {
      e.stopPropagation();
      const panel = document.getElementById("rol-permisos-panel");
      if (!panel) return;
      const checks = panel.querySelectorAll(".permiso-check");
      const payload = Array.from(checks).map((c) => ({
        seccion: c.dataset.seccion,
        accion: c.dataset.accion,
        permitido: c.checked,
      }));
      showLoading();
      try {
        const { error } = await client.rpc("actualizar_permisos_rol", { p_role_id: guardarBtn.dataset.id, p_permisos: payload });
        if (error) { setMsg("msg-roles", "No se pudieron guardar los permisos: " + escHtml(error.message || error.code || error), false); return; }
        setMsg("msg-roles", "Permisos guardados. Los usuarios con este rol ya tienen los permisos nuevos.", true);
        // B4: auditoría del cambio de permisos.
        if (typeof registrarAuditoria === "function") {
          registrarAuditoria("rol_permisos", "Permisos del rol actualizados.", "exito", guardarBtn.dataset.id, null, null);
        }
      } finally { hideLoading(); }
      return;
    }
  });
});

Object.assign(window, {
  _usuarioActual: function () { return _usuarioActual; },
  _permisosEfectivosRef: function () { return _permisosEfectivos; },
  cargarContextoUsuario,
  limpiarContextoUsuario,
  tienePermiso,
  contextoB3Disponible,
  usuarioPuedeOperar,
  refrescarUsuarios,
  cambiarRolDesdeSelect,
  cambiarEstadoUsuario,
  refrescarRolesAdmin,
});

// ---- B4 — CENTRO DE MANDO + AUDITORÍA + TRAZABILIDAD OPERATIVA
async function registrarAuditoria(tipo, descripcion, estado, entidadId, idempotencyKey, payloadResumen) {
  try {
    await client.rpc("registrar_auditoria", {
      p_tipo: tipo,
      p_descripcion: descripcion,
      p_estado: estado || "exito",
      p_entidad_id: entidadId || null,
      p_idempotency_key: idempotencyKey || null,
      p_payload_resumen: payloadResumen || null,
    });
  } catch (e) {
    // La auditoría no debe romper el flujo principal si falla (RPC inexistente).
    console.warn("[Battlecruiser] No se pudo registrar auditoría:", e);
  }
}

// Deriva el estado de datos reales: cola offline + conectividad + sincronizando.
function calcularEstadoMando(ops, sincronizando) {
  if (typeof calcularEstadoOperacional === "function") {
    return calcularEstadoOperacional(ops, sincronizando);
  }
  const atencion = ops.filter((o) => o.estado === "REQUIERE_ATENCION").length;
  if (atencion > 0) return { nivel: "critico", texto: "Requiere atención", detalle: atencion + " operación(es)." };
  return { nivel: "normal", texto: "Operativo", detalle: "Todo sincronizado." };
}

function renderEstadoMando(estado) {
  const el = document.getElementById("mando-estado");
  if (!el) return;
  el.className = "cc-estado cc-estado-" + estado.nivel;
  let extra = "";
  // Antes se comprobaba typeof === "function" (siempre false) → nunca mostraba la sesión.
  if (_usuarioActual) {
    extra = '<span class="cc-estado-detalle">Sesión: ' + escHtml(_usuarioActual.nombre || "") + (_usuarioActual.rol ? " · " + escHtml(_usuarioActual.rol) : "") + "</span>";
  }
  el.innerHTML = '<div class="cc-estado-cabecera"><span class="cc-estado-titulo">' + escHtml(estado.texto) + "</span><span class=\"cc-estado-detalle\">" + escHtml(estado.detalle) + "</span>" + extra + "</div>";
}

function construirAlertasMando(ops) {
  const alertas = [];
  const offline = estaRealmenteDesconectado();
  ops.forEach((op) => {
    if (op.estado === "REQUIERE_ATENCION") {
      alertas.push({
        nivel: "critico",
        tipo: "Operación requiere atención",
        texto: (ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación") + ": " + (op.ultimo_error || "error de negocio"),
        op,
      });
    }
  });
  // Operaciones pendientes por demasiado tiempo (>24h) — alerta real.
  const ahora = Date.now();
  ops.forEach((op) => {
    if (op.estado === "PENDIENTE" && op.creado_en) {
      const horas = (ahora - new Date(op.creado_en).getTime()) / 36e5;
      if (horas > 24) {
        alertas.push({
          nivel: "atencion",
          tipo: "Pendiente prolongado",
          texto: (ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operación") + " pendiente hace más de 24hs.",
          op,
        });
      }
    }
  });
  if (offline) {
    alertas.push({ nivel: "atencion", tipo: "Sin conexión", texto: "Trabajando offline. Los datos pueden no estar actualizados.", op: null });
  }
  // Usuario inactivo intentando operar — solo si el contexto indica inactivo.
  if (_usuarioActual && _usuarioActual.activo === false) {
    alertas.push({ nivel: "critico", tipo: "Usuario inactivo", texto: "Tu usuario está inactivo. No podés operar.", op: null });
  }
  return alertas.sort((a, b) => {
    const orden = { critico: 0, atencion: 1, normal: 2 };
    return (orden[a.nivel] ?? 3) - (orden[b.nivel] ?? 3);
  });
}

function renderAlertasMando(ops) {
  const el = document.getElementById("mando-alertas");
  if (!el) return;
  // B6+B7+B8: integrar alertas de inventario, operación humana y comunicación.
  const alertas = (typeof construirAlertasMandoB8Completo === "function")
    ? construirAlertasMandoB8Completo(ops)
    : (typeof construirAlertasMandoB7Completo === "function")
      ? construirAlertasMandoB7Completo(ops)
      : (typeof construirAlertasMandoCompleto === "function")
        ? construirAlertasMandoCompleto(ops)
        : construirAlertasMando(ops);
  if (alertas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin alertas. Todo en orden.</p>';
    return;
  }
  el.innerHTML = "";
  alertas.forEach((a) => {
    const div = document.createElement("div");
    div.className = "cc-asunto cc-prioridad-" + a.nivel;
    div.innerHTML = '<span class="cc-asunto-principal"><span class="cc-asunto-tipo">' + escHtml(a.tipo) + "</span><span class=\"muted cc-asunto-resumen\">" + escHtml(a.texto) + "</span></span>";
    if (a.op && a.op.id) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-accion mando-ver-op-btn";
      btn.textContent = "Ver operación";
      btn.dataset.id = a.op.id;
      div.querySelector(".cc-asunto-principal").appendChild(btn);
    }
    el.appendChild(div);
  });
}

// lee _cache (ventas/transferencias/vales). Sin consultas nuevas.
function renderActividadMando() {
  const el = document.getElementById("mando-actividad");
  if (!el) return;
  let movs = [];
  if (typeof construirActividadReciente === "function") {
    movs = construirActividadReciente();
  }
  if (movs.length === 0) {
    el.innerHTML = '<p class="lista-estado">Todavía no hay actividad registrada.</p>';
    return;
  }
  el.innerHTML = "";
  movs.forEach((m) => {
    const div = document.createElement("div");
    div.className = "cc-actividad-item cc-prioridad-normal";
    const fechaTxt = m.fecha ? fechaHora(m.fecha) : "";
    div.innerHTML = '<span class="cc-actividad-icono">' + escHtml(m.icono) + "</span><span class=\"cc-actividad-texto\">" + escHtml(m.texto) + "</span><span class=\"cc-actividad-meta\"><span class=\"muted\">" + escHtml(fechaTxt) + "</span><span class=\"cc-actividad-resultado\">" + escHtml(m.resultado) + "</span></span>";
    el.appendChild(div);
  });
}

let _auditoriaPagina = 0;
const _AUDITORIA_POR_PAG = 20;

async function refrescarAuditoria() {
  const el = document.getElementById("mando-auditoria");
  if (!el) return;
  if (!tienePermiso("auditoria", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver auditoría.</p>';
    return;
  }
  setLoading("mando-auditoria", "Cargando auditoría…");
  const tipo = document.getElementById("filtro-aud-tipo");
  const estado = document.getElementById("filtro-aud-estado");
  try {
    const { data, error } = await client.rpc("listar_auditoria_admin", {
      p_usuario_id: null,
      p_tipo: tipo ? tipo.value || null : null,
      p_estado: estado ? estado.value || null : null,
      p_limite: _AUDITORIA_POR_PAG,
      p_offset: _auditoriaPagina * _AUDITORIA_POR_PAG,
    });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b4-auditoria-trazabilidad.sql en Supabase (función listar_auditoria_admin).</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">No se pudo cargar auditoría: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderAuditoria(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar auditoría.</p>';
    console.warn("[Battlecruiser] listar_auditoria_admin:", e);
  }
}

function renderAuditoria(filas) {
  const el = document.getElementById("mando-auditoria");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin registros de auditoría.</p>';
    renderPaginacionAuditoria(0);
    return;
  }
  el.innerHTML = "";
  filas.forEach((f) => {
    const div = document.createElement("div");
    div.className = "cc-actividad-item cc-prioridad-" + (f.estado === "requiere_atencion" || f.estado === "error" ? "critico" : "normal");
    const fechaTxt = f.fecha ? fechaHora(f.fecha) : "";
    const idemp = f.idempotency_key ? " · " + idCorto(f.idempotency_key) : "";
    div.innerHTML = '<span class="cc-actividad-icono">' + escHtml(iconoAuditoria(f.tipo)) + "</span>"
      + '<span class="cc-actividad-texto">' + escHtml(f.descripcion || f.tipo || "—") + "<br><span class=\"muted\">" + escHtml(f.usuario_nombre || "—") + " · " + escHtml(f.tipo || "") + " · " + escHtml(f.estado || "") + idemp + "</span></span>"
      + '<span class="cc-actividad-meta"><span class="muted">' + escHtml(fechaTxt) + "</span></span>";
    el.appendChild(div);
  });
  renderPaginacionAuditoria(filas.length);
}

function iconoAuditoria(tipo) {
  switch (tipo) {
    case "venta": return "🛒";
    case "compra": return "📦";
    case "transferencia": return "↔";
    case "vale": return "📋";
    case "producto": return "🏷️";
    case "usuario_rol": return "👤";
    case "usuario_estado": return "👤";
    case "sincronizacion": return "🔄";
    default: return "•";
  }
}

function renderPaginacionAuditoria(cargadas) {
  const el = document.getElementById("mando-paginacion");
  if (!el) return;
  el.innerHTML = "";
  if (_auditoriaPagina > 0) {
    const ant = document.createElement("button");
    ant.type = "button";
    ant.className = "cc-accion";
    ant.textContent = "← Anterior";
    ant.addEventListener("click", () => { _auditoriaPagina--; refrescarAuditoria(); });
    el.appendChild(ant);
  }
  const span = document.createElement("span");
  span.className = "muted";
  span.textContent = "Página " + (_auditoriaPagina + 1);
  el.appendChild(span);
  if (cargadas >= _AUDITORIA_POR_PAG) {
    const sig = document.createElement("button");
    sig.type = "button";
    sig.className = "cc-accion";
    sig.textContent = "Siguiente →";
    sig.addEventListener("click", () => { _auditoriaPagina++; refrescarAuditoria(); });
    el.appendChild(sig);
  }
}

// Poblar los <select> de filtros con tipos/estados conocidos.
function poblarFiltrosAuditoria() {
  const tipos = ["compra", "venta", "transferencia", "vale", "producto", "usuario_rol", "usuario_estado", "sincronizacion"];
  const estados = ["exito", "pendiente", "requiere_atencion", "error"];
  const selTipo = document.getElementById("filtro-aud-tipo");
  const selEstado = document.getElementById("filtro-aud-estado");
  if (selTipo && selTipo.options.length <= 1) {
    tipos.forEach((t) => { const o = document.createElement("option"); o.value = t; o.textContent = t; selTipo.appendChild(o); });
  }
  if (selEstado && selEstado.options.length <= 1) {
    estados.forEach((e) => { const o = document.createElement("option"); o.value = e; o.textContent = e; selEstado.appendChild(o); });
  }
}

// ---- Orquestador único del Centro de Mando ----
async function refrescarCentroMando() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const ops = await obtenerOperacionesVisiblesPanel();
  const estado = calcularEstadoMando(ops, _sincronizando);
  renderEstadoMando(estado);
  // B7+B8: refrescar alertas de turnos/cuadres/incidencias y comunicación.
  if (typeof refrescarAlertasB7 === "function") await refrescarAlertasB7();
  if (typeof refrescarAlertasB8 === "function") await refrescarAlertasB8();
  renderAlertasMando(ops);
  renderActividadMando();
  // Info de conexión.
  const conn = document.getElementById("mando-conn-info");
  if (conn) {
    conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión — datos locales" : (_sincronizando ? "🔵 Sincronizando…" : "🟢 Conectado");
  }
  // Auditoría: solo si hay permiso y conexión (no inventar datos offline).
  if (tienePermiso("auditoria", "ver") && navigator.onLine && contextoB3Disponible()) {
    await refrescarAuditoria();
  } else if (document.getElementById("mando-auditoria")) {
    document.getElementById("mando-auditoria").innerHTML = '<p class="lista-estado">' + (estaRealmenteDesconectado() ? "⚪ Sin conexión — auditoría no disponible offline." : "Sin permiso o sin datos de auditoría.") + "</p>";
  }
}

safeInit("centro-mando-filtros", () => {
  poblarFiltrosAuditoria();
  const tipo = document.getElementById("filtro-aud-tipo");
  const estado = document.getElementById("filtro-aud-estado");
  if (tipo) tipo.addEventListener("change", () => { _auditoriaPagina = 0; refrescarAuditoria(); });
  if (estado) estado.addEventListener("change", () => { _auditoriaPagina = 0; refrescarAuditoria(); });
  const limpiar = document.getElementById("aud-limpiar-btn");
  if (limpiar) limpiar.addEventListener("click", () => {
    if (tipo) tipo.value = "";
    if (estado) estado.value = "";
    _auditoriaPagina = 0;
    refrescarAuditoria();
  });
  // Ver operación de una alerta.
  const alertas = document.getElementById("mando-alertas");
  if (alertas) {
    alertas.addEventListener("click", async (e) => {
      const btn = e.target.closest(".mando-ver-op-btn");
      if (btn && btn.dataset.id) {
        const op = await obtenerOperacionPendiente(btn.dataset.id);
        if (op && typeof mostrarDetalleOperacion === "function") mostrarDetalleOperacion(op);
      }
    });
  }
});

// ---- B5 — REPORTES Y ANÁLISIS OPERATIVO
let _repSubreporte = "ventas";
let _repPagina = 0;
const _REP_POR_PAG = 25;

// Poblar el select de almacenes con los ya cacheados (sin consulta nueva).
function poblarFiltrosReportes() {
  poblarSelectAlmacenes(document.getElementById("rep-filtro-almacen"));
}

function leerFiltrosReportes() {
  const desde = document.getElementById("rep-filtro-desde");
  const hasta = document.getElementById("rep-filtro-hasta");
  const almacen = document.getElementById("rep-filtro-almacen");
  return {
    desde: desde && desde.value ? desde.value : null,
    hasta: hasta && hasta.value ? hasta.value : null,
    almacen: almacen && almacen.value ? almacen.value : null,
  };
}

function limpiarFiltrosReportes() {
  const desde = document.getElementById("rep-filtro-desde");
  const hasta = document.getElementById("rep-filtro-hasta");
  const almacen = document.getElementById("rep-filtro-almacen");
  if (desde) desde.value = "";
  if (hasta) hasta.value = "";
  if (almacen) almacen.value = "";
  _repPagina = 0;
}

// ---- Resumen ejecutivo ----
async function refrescarResumenEjecutivo() {
  const el = document.getElementById("rep-resumen");
  if (!el) return;
  if (!tienePermiso("reportes", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver reportes.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — los reportes requieren datos de Supabase.</p>';
    return;
  }
  el.innerHTML = '<p class="lista-estado">Cargando resumen…</p>';
  const f = leerFiltrosReportes();
  try {
    const { data, error } = await client.rpc("reporte_resumen_ejecutivo", {
      p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen,
    });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b5-reportes.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderResumenEjecutivo(data);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar el resumen.</p>';
    console.warn("[Battlecruiser] reporte_resumen_ejecutivo:", e);
  }
}

function renderResumenEjecutivo(d) {
  const el = document.getElementById("rep-resumen");
  if (!el || !d) return;
  function card(titulo, valor, sub) {
    return '<div class="resumen-card"><div class="valor">' + escHtml(String(valor)) + '</div><div class="etiqueta">' + escHtml(titulo) + '</div>' + (sub ? '<div class="muted">' + escHtml(sub) + '</div>' : '') + '</div>';
  }
  const v = d.ventas || {}, t = d.transferencias || {}, va = d.vales || {}, inv = d.inventario || {}, comp = d.compras || {}, mar = d.margen || {};
  el.innerHTML =
    card("Ventas", v.cantidad || 0, "$" + money(v.ingresos || 0) + " · ticket $" + money(v.ticket_promedio || 0)) +
    card("Unidades vendidas", v.unidades || 0) +
    card("Transferencias", t.cantidad || 0, (t.unidades || 0) + " unidades") +
    card("Vales", va.cantidad || 0, (va.unidades || 0) + " unidades") +
    card("Productos en stock", inv.productos || 0, (inv.unidades || 0) + " unidades") +
    card("Stock bajo", inv.stock_bajo || 0) +
    card("Stock agotado", inv.stock_agotado || 0) +
    (comp.disponible === false
      ? '<div class="resumen-card"><div class="valor muted">—</div><div class="etiqueta">Compras</div><div class="muted">' + escHtml(comp.nota || "No disponible") + '</div></div>'
      : card("Compras", comp.lotes || 0, (comp.unidades_compradas || 0) + " u · $" + money(comp.valor_compras || 0))) +
    // Ídem para margen: ahora llega disponible=true con margen_conocido /
    // margen_pct_conocido (calculado solo sobre líneas con costo FIFO real;
    // nunca se asume costo 0 para las que no lo tienen).
    (mar.disponible === false
      ? '<div class="resumen-card"><div class="valor muted">—</div><div class="etiqueta">Margen</div><div class="muted">' + escHtml(mar.nota || "No disponible") + '</div></div>'
      : card("Margen", (mar.margen_pct_conocido != null ? money(mar.margen_pct_conocido) + "%" : "—"), "$" + money(mar.margen_conocido || 0) + (mar.lineas_sin_costo ? " · " + mar.lineas_sin_costo + " línea(s) sin costo excluidas" : "")));
}

// ---- Sub-reportes detallados ----
async function refrescarSubReporte() {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!tienePermiso("reportes", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver reportes.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — los reportes requieren datos de Supabase.</p>';
    return;
  }
  setLoading("rep-detalle", "Cargando reporte…");
  const f = leerFiltrosReportes();
  try {
    let data = null;
    let error = null;
    if (_repSubreporte === "ventas") {
      ({ data, error } = await client.rpc("reporte_ventas", {
        p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen, p_producto_id: null,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderVentas(data);
    } else if (_repSubreporte === "transferencias") {
      ({ data, error } = await client.rpc("reporte_transferencias", {
        p_desde: f.desde, p_hasta: f.hasta, p_origen_id: f.almacen, p_destino_id: null, p_estado: null,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderTransferencias(data);
    } else if (_repSubreporte === "vales") {
      ({ data, error } = await client.rpc("reporte_vales", {
        p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen, p_tipo: null,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderVales(data);
    } else if (_repSubreporte === "stock") {
      ({ data, error } = await client.rpc("reporte_stock", {
        p_almacen_id: f.almacen, p_categoria_id: null,
      }));
      if (!error) renderStockReporte(data);
    } else if (_repSubreporte === "movimiento") {
      ({ data, error } = await client.rpc("reporte_movimiento_inventario", {
        p_desde: f.desde, p_hasta: f.hasta, p_producto_id: null, p_almacen_id: f.almacen,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderMovimiento(data);
    } else if (_repSubreporte === "compras") {
      ({ data, error } = await client.rpc("historial_compras", {
        p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderCompras(data);
    } else if (_repSubreporte === "rentabilidad") {
      ({ data, error } = await client.rpc("rentabilidad_ventas", {
        p_desde: f.desde, p_hasta: f.hasta, p_almacen_id: f.almacen,
        p_limite: _REP_POR_PAG, p_offset: _repPagina * _REP_POR_PAG,
      }));
      if (!error) renderRentabilidad(data);
    }
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b5-reportes.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderPaginacionReporte(data ? data.length : 0);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar el reporte.</p>';
    console.warn("[Battlecruiser] reporte " + _repSubreporte + ":", e);
  }
}

function renderVentas(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin ventas en el período.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((v) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = v.fecha ? fechaHora(v.fecha) : "—";
    let lineasHtml = "";
    if (Array.isArray(v.lineas)) {
      lineasHtml = v.lineas.map((l) => '<div class="muted rep-linea">' + escHtml(l.producto || "—") + " · " + (l.cantidad || 0) + " u · $" + money(l.precio_unitario || 0) + " = $" + money(l.subtotal || 0) + "</div>").join("");
    }
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(v.almacen || "—") + '</span><span class="muted">' + fecha + ' · Total $' + money(v.total || 0) + '</span>' + lineasHtml + '</span>';
    el.appendChild(div);
  });
}

function renderTransferencias(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin transferencias en el período.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((t) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = t.fecha ? fechaHora(t.fecha) : "—";
    let lineasHtml = "";
    if (Array.isArray(t.lineas)) {
      lineasHtml = t.lineas.map((l) => '<div class="muted rep-linea">' + escHtml(l.producto || "—") + " · " + (l.cantidad || 0) + " u</div>").join("");
    }
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(t.origen || "—") + ' → ' + escHtml(t.destino || "—") + '</span><span class="muted">' + fecha + ' · ' + escHtml(t.estado || "") + ' · ' + (t.unidades || 0) + ' u</span>' + lineasHtml + '</span>';
    el.appendChild(div);
  });
}

function renderVales(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin vales en el período.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((va) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = va.fecha ? fechaHora(va.fecha) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(va.tipo || "—") + '</span><span class="muted">' + escHtml(va.producto || "—") + ' · ' + escHtml(va.almacen || "—") + ' · ' + (va.cantidad || 0) + ' u · ' + fecha + '</span></span>';
    el.appendChild(div);
  });
}

function renderStockReporte(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin datos de stock.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((s) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (s.estado || "normal");
    const icono = s.estado === "agotado" ? "🔴" : s.estado === "bajo" ? "🟡" : "🟢";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + ' ' + escHtml(s.producto || "—") + '</span><span class="muted">' + escHtml(s.almacen || "—") + ' · ' + escHtml(s.categoria || "") + ' · ' + (s.cantidad || 0) + ' u (mín: ' + (s.minimo != null ? s.minimo : "—") + ')</span></span>';
    el.appendChild(div);
  });
}

function renderMovimiento(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin movimientos en el período.</p>'; return; }
  el.innerHTML = "";
  filas.forEach((m) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-dir-" + (m.direccion || "");
    const fecha = m.fecha ? fechaHora(m.fecha) : "—";
    const icono = m.direccion === "entrada" ? "⬆️" : "⬇️";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + ' ' + escHtml(m.tipo || "—") + '</span><span class="muted">' + escHtml(m.producto || "—") + ' · ' + escHtml(m.almacen || "—") + ' · ' + (m.cantidad || 0) + ' u · ' + fecha + '</span></span>';
    el.appendChild(div);
  });
}

function renderCompras(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin compras en el período.</p>'; return; }
  el.innerHTML = "";
  const ESTADO_TXT = {
    disponible: "Disponible",
    parcial: "Parcial",
    agotado: "Agotado",
    inconsistente: "Inconsistente",
  };
  filas.forEach((c) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = c.fecha_compra ? fechaHora(c.fecha_compra) : "—";
    const estadoTxt = ESTADO_TXT[c.estado] || c.estado || "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(c.producto || "—") + '</span><span class="muted">' + escHtml(c.almacen || "—") + ' · ' + fecha + ' · ' + (c.cantidad_restante ?? 0) + '/' + (c.cantidad_inicial ?? 0) + ' u (' + escHtml(estadoTxt) + ') · Costo unit. $' + money(c.costo_unitario || 0) + ' · Total $' + money(c.costo_total || 0) + '</span></span>';
    el.appendChild(div);
  });
}

function renderRentabilidad(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin datos de rentabilidad.</p>'; return; }
  let totalIng = 0, totalCmv = 0;
  let hayCostoAlguno = false;
  el.innerHTML = "";
  filas.forEach((r) => {
    const ingresos = Number(r.ingreso || 0);
    totalIng += ingresos;
    const costoDisponible = r.costo_disponible === true;
    let gan, margen, cmvTxt, ganTxt, margenTxt;
    if (costoDisponible) {
      const cmvNum = Number(r.costo_total || 0);
      totalCmv += cmvNum;
      hayCostoAlguno = true;
      gan = Number(r.margen);
      if (!Number.isFinite(gan)) gan = ingresos - cmvNum;
      const margenNum = Number(r.margen_porcentaje);
      margen = Number.isFinite(margenNum) && r.margen_porcentaje !== null && r.margen_porcentaje !== undefined
        ? margenNum
        : (ingresos > 0 ? (gan / ingresos * 100) : 0);
      cmvTxt = "$" + money(cmvNum);
      ganTxt = "$" + money(gan);
      margenTxt = money(margen) + "%";
    } else {
      // Sin costo real (costo_disponible=false): no inventar CMV 0, ganancia ni margen.
      cmvTxt = "costo no disponible";
      ganTxt = "—";
      margenTxt = "—";
    }
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = r.fecha ? fechaHora(r.fecha) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(r.almacen || "—") + '</span><span class="muted">' + fecha + ' · Ing $' + money(ingresos) + ' · CMV ' + escHtml(cmvTxt) + ' · <b>Gan ' + escHtml(ganTxt) + '</b> (' + escHtml(margenTxt) + ')</span></span>';
    el.appendChild(div);
  });
  // Totales al pie: solo se calculan sobre las ventas con costo disponible.
  // Si ninguna venta tuvo costo, el total no inventa margen: lo deja sin costo.
  const tot = document.createElement("div");
  tot.className = "rep-fila rep-totales";
  let totCmvTxt, totGanTxt, totMargenTxt;
  if (hayCostoAlguno) {
    const totGan = totalIng - totalCmv;
    const totMargen = totalIng > 0 ? (totGan / totalIng * 100) : 0;
    totCmvTxt = "$" + money(totalCmv);
    totGanTxt = "$" + money(totGan);
    totMargenTxt = money(totMargen) + "%";
  } else {
    totCmvTxt = "costo no disponible";
    totGanTxt = "—";
    totMargenTxt = "—";
  }
  tot.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">TOTALES</span><span class="muted">Ing $' + money(totalIng) + ' · CMV ' + escHtml(totCmvTxt) + ' · <b>Gan ' + escHtml(totGanTxt) + '</b> (' + escHtml(totMargenTxt) + ')</span></span>';
  el.appendChild(tot);
}

function renderPaginacionReporte(cargadas) {
  const el = document.getElementById("rep-paginacion");
  if (!el) return;
  el.innerHTML = "";
  if (_repPagina > 0) {
    const ant = document.createElement("button");
    ant.type = "button"; ant.className = "cc-accion"; ant.textContent = "← Anterior";
    ant.addEventListener("click", () => { _repPagina--; refrescarSubReporte(); });
    el.appendChild(ant);
  }
  const span = document.createElement("span");
  span.className = "muted"; span.textContent = "Página " + (_repPagina + 1);
  el.appendChild(span);
  if (cargadas >= _REP_POR_PAG) {
    const sig = document.createElement("button");
    sig.type = "button"; sig.className = "cc-accion"; sig.textContent = "Siguiente →";
    sig.addEventListener("click", () => { _repPagina++; refrescarSubReporte(); });
    el.appendChild(sig);
  }
}

// Orquestador: carga resumen + sub-reporte. Un solo refresco consolidado.
async function refrescarReportes() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  poblarFiltrosReportes();
  const conn = document.getElementById("reportes-conn-info");
  if (conn) {
    conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión — datos no disponibles" : "🟢 Datos de Supabase";
  }
  await refrescarResumenEjecutivo();
  await refrescarSubReporte();
}

safeInit("reportes-init", () => {
  poblarFiltrosReportes();
  const aplicar = document.getElementById("rep-aplicar-btn");
  if (aplicar) aplicar.addEventListener("click", () => { _repPagina = 0; refrescarReportes(); });
  const limpiar = document.getElementById("rep-limpiar-btn");
  if (limpiar) limpiar.addEventListener("click", () => { limpiarFiltrosReportes(); refrescarReportes(); });
  // Sub-reportes (tabs internos).
  document.querySelectorAll(".rep-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rep-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _repSubreporte = btn.dataset.rep;
      _repPagina = 0;
      refrescarSubReporte();
    });
  });
});

// Cargar todo cuando se confirma sesión real (se engancha a showApp existente)
const _showAppOriginal = showApp;
showApp = function (session) {
  _showAppOriginal(session);
  safeInit("carga-inicial-productos", () => { refrescarProductos(); });
  safeInit("carga-inicial-almacenes", () => { refrescarAlmacenes().then(refrescarStockYSelects); });
  safeInit("carga-inicial-transferencias", () => { refrescarTransferencias(); });
  safeInit("carga-inicial-vales", () => { refrescarVales(); });
  safeInit("carga-inicial-ventas", () => { refrescarVentas(); });
  safeInit("carga-inicial-config", () => {
    ["categorias", "unidades"].forEach((tabla) => {
      const refrescar = window["_refrescarCatalogo_" + tabla];
      if (refrescar) refrescar();
    });
  });
  safeInit("carga-inicial-presentaciones", () => { inicializarPresentaciones(); });
  safeInit("cola-offline-arranque", () => {
    (async () => {
      await recuperarOperacionesAtrapadas();
      await actualizarContadorColaPendiente();
      await refrescarOperacionesPendientesCache();
      // refrescarPanelPendientes() no se llama aca: va despues de
      if (typeof refrescarCentroControl === "function") refrescarCentroControl();
      // B4: refrescar también el Centro de Mando al iniciar.
      if (typeof refrescarCentroMando === "function") refrescarCentroMando();
      // B7: cargar el turno actual del usuario al iniciar (si hay permiso).
      if (typeof refrescarTurnoActual === "function") refrescarTurnoActual();
      // B8: actualizar el badge de mensajes no leídos al iniciar.
      if (typeof actualizarBadgeNoLeidos === "function") actualizarBadgeNoLeidos();
      if (navigator.onLine) await sincronizarCola();
    })();
  });
};

async function refrescarTrasReconexion() {
  actualizarIndicadorConexion("reconectando");
  try {
    await refrescarStockYSelects(); // productos + categorías + almacenes + stock
    await Promise.all([
      refrescarTransferencias(),
      refrescarVales(),
      refrescarVentas(),
    ]);
    ["categorias", "unidades"].forEach((tabla) => {
      const refrescar = window["_refrescarCatalogo_" + tabla];
      if (refrescar) refrescar();
    });
    if (document.querySelector(".presentaciones-panel")) {
      await inicializarPresentaciones();
      const ppSel = document.getElementById("pp-producto-select");
      if (ppSel && ppSel.value) await refrescarAsociacionesProducto(ppSel.value);
    }
  } catch (e) {
    console.warn("[Battlecruiser] Error al refrescar tras reconexión:", e);
  }
  await refrescarPanelPendientes();
  // activo pueden haber cambiado en el backend mientras estuvimos sin
  // conexión). Reutiliza cargarContextoUsuario (una sola fuente).
  if (typeof cargarContextoUsuario === "function") await cargarContextoUsuario();
  // B4: tras reconectar, refrescar el Centro de Mando (estado/auditoría).
  if (typeof refrescarCentroMando === "function") refrescarCentroMando();
  // B7: tras reconectar, refrescar el turno actual del usuario.
  if (typeof refrescarTurnoActual === "function") refrescarTurnoActual();
  // B8: tras reconectar, actualizar el badge de mensajes no leídos.
  if (typeof actualizarBadgeNoLeidos === "function") actualizarBadgeNoLeidos();
  actualizarIndicadorConexion();
}

// ---- B6 — NÚCLEO OPERATIVO + INVENTARIO INTELIGENTE
let _invFiltroEstado = "todos"; // todos | bajo | agotado | normal
let _invFilas = []; // filas del ultimo inventario cargado (en memoria)

// ---- B6: pestaña Inventario (enriquecido) ----
async function refrescarInventario() {
  const el = document.getElementById("inv-detalle");
  const resumen = document.getElementById("inv-resumen");
  const conn = document.getElementById("inv-conn-info");
  if (!el || !appShell || !appShell.classList.contains("visible")) return;
  if (!tienePermiso("reportes", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver inventario.</p>';
    if (resumen) resumen.innerHTML = "";
    return;
  }
  if (!navigator.onLine) {
    if (conn) conn.textContent = "\u26aa Sin conexión — datos no disponibles";
    el.innerHTML = '<p class="lista-estado">\u26aa Sin conexión — el inventario enriquecido requiere datos de Supabase.</p>';
    if (resumen) resumen.innerHTML = '<p class="muted">Sin conexión.</p>';
    return;
  }
  if (conn) conn.textContent = "\ud83d\udfe2 Datos de Supabase";
  setLoading("inv-detalle", "Cargando inventario…");
  if (resumen) resumen.innerHTML = "";
  // Poblar el select de almacenes con _cache (sin consulta nueva).
  const sel = document.getElementById("inv-filtro-almacen");
  poblarSelectAlmacenes(sel);
  const almacen = sel ? (sel.value || null) : null;
  try {
    const { data, error } = await client.rpc("inventario_enriquecido", { p_almacen_id: almacen });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b6-nucleo-operativo.sql en Supabase (función inventario_enriquecido).</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    _invFilas = data || [];
    renderInventario(_invFilas);
  } catch (e) {
    _invFilas = [];
    el.innerHTML = '<p class="lista-estado">Error al cargar el inventario.</p>';
    console.warn("[Battlecruiser] inventario_enriquecido:", e);
  }
}

function renderInventario(filas) {
  const el = document.getElementById("inv-detalle");
  const resumen = document.getElementById("inv-resumen");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin datos de inventario.</p>';
    if (resumen) resumen.innerHTML = "";
    return;
  }
  // Totales/valoracion sobre TODAS las filas (estables, no dependen del filtro).
  let totalValor = 0, totalUnidades = 0, agotados = 0, bajos = 0;
  filas.forEach((s) => {
    totalValor += Number(s.valor_inventario || 0);
    totalUnidades += Number(s.cantidad || 0);
    if (s.estado === "agotado") agotados++;
    else if (s.estado === "bajo") bajos++;
  });
  // Trabaja sobre los datos ya cargados (sin consultas nuevas).
  const filtradas = (_invFiltroEstado === "todos")
    ? filas
    : filas.filter((s) => {
        if (_invFiltroEstado === "agotado") return s.estado === "agotado";
        if (_invFiltroEstado === "bajo") return s.estado === "bajo";
        if (_invFiltroEstado === "normal") return s.estado !== "agotado" && s.estado !== "bajo";
        return true;
      });
  el.innerHTML = "";
  if (filtradas.length === 0) {
    const etiqueta = { bajo: "bajo mínimo", agotado: "agotados", normal: "normales" }[_invFiltroEstado] || "";
    el.innerHTML = '<p class="lista-estado">No hay productos ' + escHtml(etiqueta) + ' con el filtro actual.</p>';
  } else {
    filtradas.forEach((s) => {
      const valor = Number(s.valor_inventario || 0);
      const div = document.createElement("div");
      div.className = "rep-fila rep-estado-" + (s.estado || "normal");
      const icono = s.estado === "agotado" ? "\ud83d\udd34" : s.estado === "bajo" ? "\ud83d\udfe1" : "\ud83d\udfe2";
      // inventario_enriquecido usa COALESCE(..., 0) en el backend:
      const costoTxt = valor > 0 ? "$" + money(s.costo_promedio || 0) : "\u2014";
      const valorTxt = valor > 0 ? "$" + money(valor) : "\u2014";
      div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + " " + escHtml(s.producto || "\u2014") + '</span><span class="muted">' + escHtml(s.almacen || "\u2014") + " \u00b7 " + (s.cantidad || 0) + " u (m\u00edn: " + (s.minimo != null ? s.minimo : "\u2014") + ') \u00b7 costo prom ' + costoTxt + " \u00b7 valor " + valorTxt + "</span></span>";
      el.appendChild(div);
    });
  }
  if (resumen) {
    function card(t, v, sub) {
      return '<div class="resumen-card"><div class="valor">' + escHtml(String(v)) + '</div><div class="etiqueta">' + escHtml(t) + "</div>" + (sub ? '<div class="muted">' + escHtml(sub) + "</div>" : "") + "</div>";
    }
    resumen.innerHTML =
      card("Valor inventario", "$" + money(totalValor)) +
      card("Unidades", totalUnidades) +
      card("Agotados", agotados, "\ud83d\udd34") +
      card("Stock bajo", bajos, "\ud83d\udfe1");
  }
}

// ---- B6: pestaña Movimientos ----
// Usa movimientos_producto (RPC B6). Fuente única de trazabilidad.
let _movPagina = 0;
const _MOV_POR_PAG = 50;

async function refrescarMovimientos() {
  const el = document.getElementById("mov-detalle");
  const conn = document.getElementById("mov-conn-info");
  if (!el || !appShell || !appShell.classList.contains("visible")) return;
  if (!tienePermiso("reportes", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver movimientos.</p>';
    return;
  }
  if (!navigator.onLine) {
    if (conn) conn.textContent = "\u26aa Sin conexión — datos no disponibles";
    el.innerHTML = '<p class="lista-estado">\u26aa Sin conexión — los movimientos requieren datos de Supabase.</p>';
    return;
  }
  if (conn) conn.textContent = "\ud83d\udfe2 Datos de Supabase";
  setLoading("mov-detalle", "Cargando movimientos…");
  const sel = document.getElementById("mov-filtro-almacen");
  poblarSelectAlmacenes(sel);
  const desde = document.getElementById("mov-filtro-desde");
  const hasta = document.getElementById("mov-filtro-hasta");
  const tipo = document.getElementById("mov-filtro-tipo");
  const f = {
    desde: desde && desde.value ? desde.value : null,
    hasta: hasta && hasta.value ? hasta.value : null,
    almacen: sel ? (sel.value || null) : null,
    tipo: tipo ? (tipo.value || null) : null,
  };
  try {
    const { data, error } = await client.rpc("movimientos_producto", {
      p_producto_id: null, p_almacen_id: f.almacen,
      p_desde: f.desde, p_hasta: f.hasta, p_tipo: f.tipo,
      p_limite: _MOV_POR_PAG, p_offset: _movPagina * _MOV_POR_PAG,
    });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b6-nucleo-operativo.sql en Supabase (función movimientos_producto).</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderMovimientos(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar movimientos.</p>';
    console.warn("[Battlecruiser] movimientos_producto:", e);
  }
}

function renderMovimientos(filas) {
  const el = document.getElementById("mov-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin movimientos en el per\u00edodo.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((m) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = m.fecha ? fechaHora(m.fecha) : "\u2014";
    const entrada = Number(m.cantidad) > 0;
    const icono = entrada ? "\u2b06\ufe0f" : "\u2b07\ufe0f";
    const costo = m.costo_unitario != null ? " \u00b7 $" + money(m.costo_unitario) + " c/u" : "";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + " " + escHtml(m.tipo || "\u2014") + '</span><span class="muted">' + escHtml(m.producto || "\u2014") + " \u00b7 " + escHtml(m.almacen || "\u2014") + " \u00b7 " + (m.cantidad || 0) + " u" + costo + " \u00b7 " + escHtml(m.usuario || "\u2014") + " \u00b7 " + fecha + "</span></span>";
    el.appendChild(div);
  });
  // Paginación simple.
  const pag = document.getElementById("mov-paginacion");
  if (pag) {
    pag.innerHTML = "";
    if (_movPagina > 0) {
      const ant = document.createElement("button");
      ant.type = "button"; ant.className = "cc-accion"; ant.textContent = "\u2190 Anterior";
      ant.addEventListener("click", () => { _movPagina--; refrescarMovimientos(); });
      pag.appendChild(ant);
    }
    const span = document.createElement("span");
    span.className = "muted"; span.textContent = "P\u00e1gina " + (_movPagina + 1);
    pag.appendChild(span);
    if (filas.length >= _MOV_POR_PAG) {
      const sig = document.createElement("button");
      sig.type = "button"; sig.className = "cc-accion"; sig.textContent = "Siguiente \u2192";
      sig.addEventListener("click", () => { _movPagina++; refrescarMovimientos(); });
      pag.appendChild(sig);
    }
  }
}

// ---- B6: indicadores de inventario en el Centro de Mando ----
// Añade productos agotados y stock bajo al panel de alertas del Centro de
// Mando, reutilizando _cache.stock (sin consulta nueva). No inventa datos.
function construirAlertasInventarioB6() {
  const alertas = [];
  (_cache.stock || []).forEach((s) => {
    const cant = Number(s.cantidad);
    if (s.minimo != null && cant <= Number(s.minimo) && cant > 0) {
      const prod = (_cache.productos || []).find((p) => p.id === s.producto_id);
      const alm = (_cache.almacenes || []).find((a) => a.id === s.almacen_id);
      alertas.push({
        nivel: "atencion",
        tipo: "Stock bajo",
        texto: escHtml((prod && prod.nombre) || "Producto") + " \u00b7 " + escHtml((alm && alm.nombre) || "\u2014") + " \u00b7 " + cant + " u (m\u00edn " + s.minimo + ")",
        op: null,
      });
    } else if (cant <= 0) {
      const prod = (_cache.productos || []).find((p) => p.id === s.producto_id);
      const alm = (_cache.almacenes || []).find((a) => a.id === s.almacen_id);
      alertas.push({
        nivel: "critico",
        tipo: "Producto agotado",
        texto: escHtml((prod && prod.nombre) || "Producto") + " \u00b7 " + escHtml((alm && alm.nombre) || "\u2014"),
        op: null,
      });
    }
  });
  return alertas;
}

// Hook: integrar las alertas de inventario B6 en el Centro de Mando.
// Se llama desde refrescarCentroMando (B4). Las alertas de inventario
// se mezclan con las de operaciones existentes, priorizadas igual.
function construirAlertasMandoCompleto(ops) {
  const ops_alertas = (typeof construirAlertasMando === "function") ? construirAlertasMando(ops) : [];
  const inv_alertas = construirAlertasInventarioB6();
  return ops_alertas.concat(inv_alertas).sort((a, b) => {
    const orden = { critico: 0, atencion: 1, normal: 2 };
    return (orden[a.nivel] != null ? orden[a.nivel] : 3) - (orden[b.nivel] != null ? orden[b.nivel] : 3);
  });
}

// Inicialización de las pestañas Inventario y Movimientos.
safeInit("b6-inventario", () => {
  const refrescar = document.getElementById("inv-refrescar-btn");
  if (refrescar) refrescar.addEventListener("click", () => refrescarInventario());

  // en memoria (_invFilas) sin consultas nuevas. Reutiliza renderInventario().
  const contFiltros = document.getElementById("inv-filtro-estado");
  if (contFiltros) {
    contFiltros.addEventListener("click", (e) => {
      const btn = e.target.closest(".inv-estado-btn");
      if (!btn) return;
      _invFiltroEstado = btn.dataset.estado || "todos";
      // Marcar el boton activo.
      contFiltros.querySelectorAll(".inv-estado-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Reutilizar las filas en memoria; si no hay, no hace nada (renderInventario
      // ya muestra "Sin datos"). Actualiza inmediatamente la vista.
      renderInventario(_invFilas);
    });
  }
});
safeInit("b6-movimientos", () => {
  const refrescar = document.getElementById("mov-refrescar-btn");
  if (refrescar) refrescar.addEventListener("click", () => { _movPagina = 0; refrescarMovimientos(); });
});

// ---- B7 — OPERACIÓN HUMANA: TURNOS + CUADRES + RESPONSABILIDADES + INCIDENCIAS
let _turnoActual = null; // turno abierto del usuario (cache en memoria)

// ---- B7: turno actual del usuario ----
// Consulta turno_actual_usuario (RPC B7). Si hay turno abierto, muestra
// la tarjeta con estado/hora/apertura y el botón de cerrar. Si no, botón abrir.
async function refrescarTurnoActual() {
  const el = document.getElementById("turno-actual");
  const btnAbrir = document.getElementById("btn-abrir-turno");
  const btnCerrar = document.getElementById("btn-cerrar-turno");
  if (!el) return;
  if (!tienePermiso("turnos", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver turnos.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — el turno se cargará al reconectar.</p>';
    return;
  }
  try {
    const { data, error } = await client.rpc("turno_actual_usuario", {});
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b7-operacion-humana.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    _turnoActual = data;
    renderTurnoActual(data);
    if (btnAbrir) btnAbrir.classList.toggle("hidden", !!(data && data.estado === "ABIERTO"));
    if (btnCerrar) btnCerrar.classList.toggle("hidden", !(data && data.estado === "ABIERTO"));
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar el turno actual.</p>';
    console.warn("[Battlecruiser] turno_actual_usuario:", e);
  }
}

function renderTurnoActual(t) {
  const el = document.getElementById("turno-actual");
  if (!el) return;
  if (!t) {
    el.innerHTML = '<p class="lista-estado">No tenés turno abierto. Abrí uno para empezar a registrar operaciones.</p>';
    return;
  }
  const apertura = t.apertura_real ? fechaHora(t.apertura_real) : "—";
  let cuadreHtml = "";
  if (t.cuadre) {
    const c = t.cuadre;
    cuadreHtml = '<div class="muted">Cuadre: $' + money(c.dinero_esperado || 0) + " esperado · estado " + escHtml(c.estado || "—") + "</div>";
  }
  el.innerHTML = '<div class="turno-card-info"><span class="cc-asunto-tipo">Turno ' + escHtml(t.estado || "—") + '</span><span class="muted">Apertura: ' + apertura + " · " + escHtml(t.usuario_nombre || "—") + "</span>" + cuadreHtml + "</div>";
}

// ---- B7: abrir turno ----
// Pasa por ejecutarOperacion (cola offline + idempotencia). El backend
// valida usuario activo, permiso y doble apertura.
async function abrirTurno() {
  const almacenSel = document.getElementById("turno-filtro-almacen");
  const almacen_id = almacenSel ? (almacenSel.value || null) : null;
  const r = await ejecutarOperacion("turno", {
    p_almacen_id: almacen_id,
  });
  const msg = document.getElementById("msg-turno");
  if (!r.ok) {
    if (msg) setMsg("msg-turno", "No se pudo abrir el turno: " + explicarError(r.error, "abrir turno"), false);
    return;
  }
  if (r.offline) {
    if (msg) setMsg("msg-turno", "✓ Turno guardado localmente — se sincronizará al recuperar conexión.", true);
  } else {
    if (msg) setMsg("msg-turno", "✓ Turno abierto.", true);
  }
  await refrescarTurnoActual();
}

// ---- B7: cerrar turno ----
async function cerrarTurno() {
  if (!_turnoActual || _turnoActual.estado !== "ABIERTO") {
    setMsg("msg-turno", "No hay turno abierto para cerrar.", false);
    return;
  }
  // Detectar operaciones pendientes (cola offline) antes de cerrar.
  const ops = await obtenerOperacionesPorEstado("PENDIENTE");
  const atencion = await obtenerOperacionesPorEstado("REQUIERE_ATENCION");
  let aviso = "";
  if (ops.length > 0) aviso += " Tenés " + ops.length + " operación(es) pendiente(s) de sincronizar.";
  if (atencion.length > 0) aviso += " Tenés " + atencion.length + " operación(es) que requieren atención.";
  const r = await ejecutarOperacion("turno_cerrar", {
    p_turno_id: _turnoActual.id,
  });
  if (!r.ok) {
    setMsg("msg-turno", "No se pudo cerrar el turno: " + explicarError(r.error, "cerrar turno"), false);
    return;
  }
  if (r.offline) {
    setMsg("msg-turno", "✓ Cierre guardado localmente — se sincronizará al recuperar conexión." + aviso, true);
  } else {
    setMsg("msg-turno", "✓ Turno cerrado." + aviso, true);
  }
  await refrescarTurnoActual();
  await refrescarListaTurnos();
}

// ---- B7: lista de turnos (historial) ----
async function refrescarListaTurnos() {
  const el = document.getElementById("lista-turnos");
  const cuadresEl = document.getElementById("lista-cuadres");
  if (!el || !appShell || !appShell.classList.contains("visible")) return;
  if (!tienePermiso("turnos", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver turnos.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — historial de turnos no disponible.</p>';
    return;
  }
  setLoading("lista-turnos", "Cargando turnos…");
  const estadoSel = document.getElementById("turno-filtro-estado");
  const estado = estadoSel ? (estadoSel.value || null) : null;
  try {
    const { data, error } = await client.rpc("listar_turnos", {
      p_estado: estado, p_limite: 50, p_offset: 0,
    });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b7-operacion-humana.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderTurnos(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar turnos.</p>';
  }
  // Cargar cuadres también.
  if (cuadresEl) await refrescarListaCuadres();
}

function renderTurnos(filas) {
  const el = document.getElementById("lista-turnos");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin turnos registrados.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((t) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (t.estado || "").toLowerCase();
    const apertura = t.apertura_real ? fechaHora(t.apertura_real) : "—";
    const cierre = t.cierre_real ? fechaHora(t.cierre_real) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(t.estado || "—") + '</span><span class="muted">' + escHtml(t.usuario_nombre || "—") + " · " + (t.fecha || "—") + " · abre " + apertura + " · cierra " + cierre + "</span></span>";
    el.appendChild(div);
  });
}

// ---- B7: lista de cuadres ----
async function refrescarListaCuadres() {
  const el = document.getElementById("lista-cuadres");
  if (!el) return;
  if (!tienePermiso("turnos", "ver")) { el.innerHTML = ""; return; }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión.</p>';
    return;
  }
  try {
    const { data, error } = await client.rpc("listar_cuadres", { p_limite: 20, p_offset: 0 });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Cuadres no disponibles (falta aplicar SQL B7).</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderCuadres(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar cuadres.</p>';
  }
}

function renderCuadres(filas) {
  const el = document.getElementById("lista-cuadres");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin cuadres registrados.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((c) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (c.estado || "").toLowerCase();
    const dif = Number(c.diferencia || 0);
    const difTxt = dif === 0 ? "exacto" : (dif < 0 ? "faltante $" + money(Math.abs(dif)) : "sobrante $" + money(dif));
    let acciones = "";
    if (c.estado === "PENDIENTE" && tienePermiso("turnos", "crear")) {
      acciones = '<button type="button" class="cc-accion cuadre-declarar-btn" data-id="' + c.id + '" data-esperado="' + c.dinero_esperado + '">Declarar</button>';
    }
    if ((c.estado === "CON_DIFERENCIA" || c.estado === "EN_REVISION") && tienePermiso("turnos", "editar_any")) {
      acciones += '<button type="button" class="cc-accion cuadre-revisar-btn" data-id="' + c.id + '">Revisar</button>';
    }
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(c.estado || "—") + '</span><span class="muted">Esperado $' + money(c.dinero_esperado || 0) + " · Declarado $" + money(c.dinero_declarado || 0) + " · " + difTxt + "</span>" + acciones + "</span>";
    if (c.comentario_revision) {
      div.innerHTML += '<div class="muted">Revisión: ' + escHtml(c.comentario_revision) + "</div>";
    }
    el.appendChild(div);
  });
}

// ---- B7: declarar cuadre (modal simple via prompt) ----
async function declararCuadre(cuadre_id, esperado) {
  const input = prompt("Dinero a declarar (esperado: $" + money(esperado) + "):", String(esperado));
  if (input === null) return;
  const declarado = parseFloat(input);
  if (!Number.isFinite(declarado) || declarado < 0) {
    setMsg("msg-cuadre", "El monto declarado no es válido.", false);
    return;
  }
  const r = await ejecutarOperacion("cuadre", {
    p_cuadre_id: cuadre_id, p_dinero_declarado: declarado,
  });
  if (!r.ok) {
    setMsg("msg-cuadre", "No se pudo declarar el cuadre: " + explicarError(r.error, "declarar cuadre"), false);
    return;
  }
  setMsg("msg-cuadre", "✓ Cuadre declarado.", true);
  await refrescarListaCuadres();
}

// ---- B7: revisar cuadre (aprobar/rechazar) ----
async function revisarCuadre(cuadre_id) {
  const decision = confirm("¿Aprobar el cuadre? (Cancelar = rechazar)");
  const comentario = prompt("Comentario de revisión:", "");
  const r = await ejecutarOperacion("cuadre_revisar", {
    p_cuadre_id: cuadre_id, p_decision: decision ? "aprobar" : "rechazar",
    p_comentario: comentario || null,
  });
  if (!r.ok) {
    setMsg("msg-cuadre", "No se pudo revisar: " + explicarError(r.error, "revisar cuadre"), false);
    return;
  }
  setMsg("msg-cuadre", "✓ Cuadre " + (decision ? "aprobado" : "rechazado") + ".", true);
  await refrescarListaCuadres();
}

// ---- B7: orquestador de la pestaña Turnos ----
async function refrescarTurnos() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const conn = document.getElementById("turnos-conn-info");
  if (conn) conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión" : "🟢 Conectado";
  // Poblar select de almacenes con _cache.
  const sel = document.getElementById("turno-filtro-almacen");
  poblarSelectAlmacenes(sel);
  await refrescarTurnoActual();
  await refrescarListaTurnos();
}

// ---- B7: responsabilidades ----
async function refrescarListaResponsabilidades() {
  const el = document.getElementById("lista-responsabilidades");
  if (!el) return;
  if (!tienePermiso("turnos", "ver")) { el.innerHTML = ""; return; }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión.</p>';
    return;
  }
  setLoading("lista-responsabilidades", "Cargando responsabilidades…");
  const estadoSel = document.getElementById("resp-filtro-estado");
  const estado = estadoSel ? (estadoSel.value || null) : null;
  try {
    const { data, error } = await client.rpc("listar_responsabilidades", {
      p_estado: estado, p_limite: 50, p_offset: 0,
    });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b7-operacion-humana.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderResponsabilidades(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar responsabilidades.</p>';
  }
}

function renderResponsabilidades(filas) {
  const el = document.getElementById("lista-responsabilidades");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin responsabilidades.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((r) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (r.estado || "").toLowerCase();
    let acciones = "";
    if (r.estado !== "COMPLETADA" && r.estado !== "CANCELADA") {
      if (tienePermiso("turnos", "crear")) {
        acciones += '<button type="button" class="cc-accion resp-estado-btn" data-id="' + r.id + '" data-estado="COMPLETADA">Completar</button>';
        acciones += '<button type="button" class="cc-accion resp-estado-btn" data-id="' + r.id + '" data-estado="EN_PROGRESO">En progreso</button>';
      }
      if (tienePermiso("turnos", "editar_any")) {
        acciones += '<button type="button" class="cc-accion resp-estado-btn" data-id="' + r.id + '" data-estado="CANCELADA">Cancelar</button>';
      }
    }
    const limite = r.fecha_limite ? new Date(r.fecha_limite).toLocaleDateString("es", { day: "2-digit", month: "2-digit" }) : "";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(r.titulo) + '</span><span class="muted">' + escHtml(r.estado || "—") + " · " + escHtml(r.prioridad || "normal") + (limite ? " · límite " + limite : "") + "</span>" + acciones + "</span>";
    if (r.descripcion) div.innerHTML += '<div class="muted">' + escHtml(r.descripcion) + "</div>";
    if (r.observacion_final) div.innerHTML += '<div class="muted">Obs: ' + escHtml(r.observacion_final) + "</div>";
    el.appendChild(div);
  });
}

async function crearResponsabilidad(titulo, descripcion, prioridad) {
  const r = await ejecutarOperacion("responsabilidad", {
    p_titulo: titulo, p_descripcion: descripcion || null, p_prioridad: prioridad || "normal",
  });
  if (!r.ok) {
    setMsg("msg-resp-crear", "No se pudo crear: " + explicarError(r.error, "crear responsabilidad"), false);
    return false;
  }
  setMsg("msg-resp-crear", r.offline ? "✓ Guardada localmente — se sincronizará." : "✓ Responsabilidad creada.", true);
  await refrescarListaResponsabilidades();
  return true;
}

async function actualizarResponsabilidad(id, estado) {
  const r = await ejecutarOperacion("responsabilidad_actualizar", {
    p_responsabilidad_id: id, p_estado: estado,
  });
  if (!r.ok) {
    setMsg("msg-resp-crear", "No se pudo actualizar: " + explicarError(r.error, "actualizar responsabilidad"), false);
    return;
  }
  setMsg("msg-resp-crear", "✓ Responsabilidad actualizada.", true);
  await refrescarListaResponsabilidades();
}

// ---- B7: incidencias ----
async function refrescarListaIncidencias() {
  const el = document.getElementById("lista-incidencias");
  if (!el) return;
  if (!tienePermiso("turnos", "ver")) { el.innerHTML = ""; return; }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión.</p>';
    return;
  }
  setLoading("lista-incidencias", "Cargando incidencias…");
  try {
    const { data, error } = await client.rpc("listar_incidencias", { p_limite: 30, p_offset: 0 });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b7-operacion-humana.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderIncidencias(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar incidencias.</p>';
  }
}

function renderIncidencias(filas) {
  const el = document.getElementById("lista-incidencias");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin incidencias.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((i) => {
    const div = document.createElement("div");
    div.className = "rep-fila rep-estado-" + (i.estado || "").toLowerCase();
    let acciones = "";
    if (i.estado === "ABIERTA" && tienePermiso("turnos", "editar_any")) {
      acciones = '<button type="button" class="cc-accion inc-resolver-btn" data-id="' + i.id + '">Resolver</button>';
    }
    const fecha = i.creado_en ? fechaHora(i.creado_en) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(i.tipo || "—") + '</span><span class="muted">' + escHtml(i.descripcion) + " · " + escHtml(i.estado || "—") + " · " + escHtml(i.usuario_nombre || "—") + " · " + fecha + "</span>" + acciones + "</span>";
    if (i.resolucion) div.innerHTML += '<div class="muted">Resolución: ' + escHtml(i.resolucion) + "</div>";
    el.appendChild(div);
  });
}

async function crearIncidencia(tipo, descripcion) {
  const r = await ejecutarOperacion("incidencia", {
    p_tipo: tipo, p_descripcion: descripcion,
  });
  if (!r.ok) {
    setMsg("msg-inc-crear", "No se pudo reportar: " + explicarError(r.error, "reportar incidencia"), false);
    return false;
  }
  setMsg("msg-inc-crear", r.offline ? "✓ Reportada localmente — se sincronizará." : "✓ Incidencia reportada.", true);
  await refrescarListaIncidencias();
  return true;
}

async function resolverIncidencia(id) {
  const resolucion = prompt("¿Cómo se resolvió la incidencia?", "");
  if (!resolucion) return;
  const r = await ejecutarOperacion("incidencia_resolver", {
    p_incidencia_id: id, p_resolucion: resolucion,
  });
  if (!r.ok) {
    setMsg("msg-inc-crear", "No se pudo resolver: " + explicarError(r.error, "resolver incidencia"), false);
    return;
  }
  setMsg("msg-inc-crear", "✓ Incidencia resuelta.", true);
  await refrescarListaIncidencias();
}

// ---- B7: orquestador de la pestaña Operación ----
async function refrescarOperacion() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const conn = document.getElementById("operacion-conn-info");
  if (conn) conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión" : "🟢 Conectado";
  await refrescarListaResponsabilidades();
  await refrescarListaIncidencias();
}

// ---- B7: alertas para el Centro de Mando ----
// Deriva alertas reales de turnos/cuadres/responsabilidades/incidencias.
// No inventa: si los RPC no existen o no hay conexión, no agrega alertas.
let _b7CacheAlertas = { turnosAbiertos: 0, cuadresPendientes: 0, cuadresDiferencia: 0, respPendientes: 0, incAbiertas: 0 };

async function refrescarAlertasB7() {
  if (!navigator.onLine || !tienePermiso("turnos", "ver")) return;
  try {
    // Turnos abiertos.
    const { data: turnos } = await client.rpc("listar_turnos", { p_estado: "ABIERTO", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.turnosAbiertos = (turnos || []).length;
    // Cuadres pendientes / con diferencia.
    const { data: cuadresP } = await client.rpc("listar_cuadres", { p_estado: "PENDIENTE", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.cuadresPendientes = (cuadresP || []).length;
    const { data: cuadresD } = await client.rpc("listar_cuadres", { p_estado: "CON_DIFERENCIA", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.cuadresDiferencia = (cuadresD || []).length;
    // Responsabilidades pendientes.
    const { data: resp } = await client.rpc("listar_responsabilidades", { p_estado: "PENDIENTE", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.respPendientes = (resp || []).length;
    // Incidencias abiertas.
    const { data: inc } = await client.rpc("listar_incidencias", { p_estado: "ABIERTA", p_limite: 100, p_offset: 0 });
    _b7CacheAlertas.incAbiertas = (inc || []).length;
  } catch (e) {
    // Si los RPC no existen o fallan, no agregar alertas (no inventar).
  }
}

function construirAlertasB7() {
  const a = [];
  if (_b7CacheAlertas.cuadresDiferencia > 0) {
    a.push({ nivel: "critico", tipo: "Cuadre con diferencia", texto: _b7CacheAlertas.cuadresDiferencia + " cuadre(s) con diferencia requieren revisión.", op: null });
  }
  if (_b7CacheAlertas.incAbiertas > 0) {
    a.push({ nivel: "critico", tipo: "Incidencias abiertas", texto: _b7CacheAlertas.incAbiertas + " incidencia(s) abierta(s).", op: null });
  }
  if (_b7CacheAlertas.cuadresPendientes > 0) {
    a.push({ nivel: "atencion", tipo: "Cuadres pendientes", texto: _b7CacheAlertas.cuadresPendientes + " cuadre(s) pendiente(s) de declarar.", op: null });
  }
  if (_b7CacheAlertas.respPendientes > 0) {
    a.push({ nivel: "atencion", tipo: "Responsabilidades pendientes", texto: _b7CacheAlertas.respPendientes + " responsabilidad(es) pendiente(s).", op: null });
  }
  if (_b7CacheAlertas.turnosAbiertos > 0) {
    a.push({ nivel: "normal", tipo: "Turnos abiertos", texto: _b7CacheAlertas.turnosAbiertos + " turno(s) abierto(s).", op: null });
  }
  return a;
}

// Hook: integrar las alertas B7 en el Centro de Mando.
function construirAlertasMandoB7Completo(ops) {
  const base = (typeof construirAlertasMandoCompleto === "function") ? construirAlertasMandoCompleto(ops) : [];
  return base.concat(construirAlertasB7()).sort((a, b) => {
    const orden = { critico: 0, atencion: 1, normal: 2 };
    return (orden[a.nivel] != null ? orden[a.nivel] : 3) - (orden[b.nivel] != null ? orden[b.nivel] : 3);
  });
}

// Inicialización de las pestañas Turnos y Operación.
safeInit("b7-turnos", () => {
  const btnAbrir = document.getElementById("btn-abrir-turno");
  const btnCerrar = document.getElementById("btn-cerrar-turno");
  const refrescar = document.getElementById("turnos-refrescar-btn");
  if (btnAbrir) btnAbrir.addEventListener("click", abrirTurno);
  if (btnCerrar) btnCerrar.addEventListener("click", cerrarTurno);
  if (refrescar) refrescar.addEventListener("click", () => refrescarListaTurnos());
  // Filtro de estado.
  const estadoSel = document.getElementById("turno-filtro-estado");
  if (estadoSel) estadoSel.addEventListener("change", () => refrescarListaTurnos());
  // Delegación de clicks en cuadres.
  const cuadresEl = document.getElementById("lista-cuadres");
  if (cuadresEl) {
    cuadresEl.addEventListener("click", (e) => {
      const declBtn = e.target.closest(".cuadre-declarar-btn");
      const revBtn = e.target.closest(".cuadre-revisar-btn");
      if (declBtn) declararCuadre(declBtn.dataset.id, parseFloat(declBtn.dataset.esperado));
      if (revBtn) revisarCuadre(revBtn.dataset.id);
    });
  }
});

safeInit("b7-operacion", () => {
  const formResp = document.getElementById("form-responsabilidad");
  if (formResp) {
    formResp.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = document.getElementById("resp-titulo").value.trim();
      const desc = document.getElementById("resp-desc").value.trim();
      const prioridad = document.getElementById("resp-prioridad").value;
      if (!titulo) return;
      const ok = await crearResponsabilidad(titulo, desc, prioridad);
      if (ok) formResp.reset();
    });
  }
  const formInc = document.getElementById("form-incidencia");
  if (formInc) {
    formInc.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tipo = document.getElementById("inc-tipo").value;
      const desc = document.getElementById("inc-desc").value.trim();
      if (!desc) return;
      const ok = await crearIncidencia(tipo, desc);
      if (ok) formInc.reset();
    });
  }
  // Filtro de responsabilidades.
  const respFiltro = document.getElementById("resp-filtro-estado");
  if (respFiltro) respFiltro.addEventListener("change", () => refrescarListaResponsabilidades());
  // Delegación de clicks en responsabilidades e incidencias.
  const respEl = document.getElementById("lista-responsabilidades");
  if (respEl) {
    respEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".resp-estado-btn");
      if (btn) actualizarResponsabilidad(btn.dataset.id, btn.dataset.estado);
    });
  }
  const incEl = document.getElementById("lista-incidencias");
  if (incEl) {
    incEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".inc-resolver-btn");
      if (btn) resolverIncidencia(btn.dataset.id);
    });
  }
});

// ---- B8 — COMUNICACIÓN Y COORDINACIÓN OPERATIVA
let _comConvActual = null;       // conversación abierta (id)
let _comConvActualTipo = null;    // tipo de la conversación abierta
let _comNoLeidosTotal = 0;        // contador global (badge sidebar)

// ---- B8: orquestador de la pestaña Comunicación ----
async function refrescarComunicacion() {
  if (!appShell || !appShell.classList.contains("visible")) return;
  const conn = document.getElementById("com-conn-info");
  if (conn) conn.textContent = estaRealmenteDesconectado() ? "⚪ Sin conexión" : "🟢 Conectado";
  await refrescarListaConversaciones();
  await actualizarBadgeNoLeidos();
}

// ---- B8: badge de no leídos en el sidebar ----
async function actualizarBadgeNoLeidos() {
  const badge = document.getElementById("com-tab-badge");
  if (!badge) return;
  if (!navigator.onLine || !tienePermiso("comunicacion", "ver")) {
    badge.classList.add("hidden");
    badge.textContent = "";
    return;
  }
  try {
    const { data, error } = await client.rpc("contar_no_leidos_global", {});
    if (error) { badge.classList.add("hidden"); return; }
    _comNoLeidosTotal = Number(data) || 0;
    if (_comNoLeidosTotal > 0) {
      badge.classList.remove("hidden");
      badge.textContent = String(_comNoLeidosTotal);
      badge.classList.add("atencion");
    } else {
      badge.classList.add("hidden");
      badge.textContent = "";
    }
  } catch (e) {
    badge.classList.add("hidden");
  }
}

// ---- B8: lista de conversaciones ----
async function refrescarListaConversaciones() {
  const el = document.getElementById("lista-conversaciones");
  if (!el) return;
  if (!tienePermiso("comunicacion", "ver")) {
    el.innerHTML = '<p class="lista-estado">No tenés permiso para ver comunicación.</p>';
    return;
  }
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — las conversaciones se cargarán al reconectar.</p>';
    return;
  }
  setLoading("lista-conversaciones", "Cargando conversaciones…");
  try {
    const { data, error } = await client.rpc("listar_conversaciones_usuario", { p_solo_activas: true, p_limite: 50 });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b8-comunicacion.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderListaConversaciones(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar conversaciones.</p>';
  }
}

function renderListaConversaciones(filas) {
  const el = document.getElementById("lista-conversaciones");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">💬 No tenés conversaciones todavía.</p>';
    return;
  }
  el.innerHTML = "";
  filas.forEach((c) => {
    const div = document.createElement("div");
    div.className = "com-conv-item" + (c.id === _comConvActual ? " com-conv-activa" : "");
    const noLeidos = Number(c.no_leidos || 0);
    let icono = "💬";
    if (c.tipo === "GENERAL") icono = "📢";
    else if (c.tipo === "SOPORTE") icono = "🛟";
    else if (c.tipo === "INCIDENCIA") icono = "⚠️";
    else if (c.tipo === "TURNO") icono = "🕒";
    else if (c.tipo === "RESPONSABILIDAD") icono = "✅";
    const titulo = escHtml(c.titulo || (c.tipo === "GENERAL" ? "General" : c.tipo === "SOPORTE" ? "Soporte" : (c.ultimo_autor || "Conversación")));
    const ultMsg = c.ultimo_mensaje ? escHtml(c.ultimo_mensaje.slice(0, 60)) : '<span class="muted">Sin mensajes</span>';
    const fecha = c.ultimo_fecha ? fechaHora(c.ultimo_fecha) : "";
    div.innerHTML = '<div class="com-conv-icono">' + icono + '</div><div class="com-conv-contenido"><span class="com-conv-titulo">' + titulo + '</span><span class="com-conv-ultmsg muted">' + ultMsg + '</span></div><div class="com-conv-meta"><span class="com-conv-fecha muted">' + fecha + "</span>" + (noLeidos > 0 ? '<span class="com-conv-badge">' + noLeidos + "</span>" : "") + "</div>";
    div.dataset.id = c.id;
    div.dataset.tipo = c.tipo || "";
    div.addEventListener("click", () => abrirConversacion(c.id, c.tipo));
    el.appendChild(div);
  });
}

// ---- B8: abrir conversación (cargar mensajes) ----
async function abrirConversacion(conv_id, tipo) {
  _comConvActual = conv_id;
  _comConvActualTipo = tipo;
  // En móvil, ocultar la lista y mostrar el chat.
  const colLista = document.getElementById("com-col-lista");
  const colChat = document.getElementById("com-col-chat");
  if (colLista && colChat && window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
    colLista.classList.add("hidden");
    colChat.classList.remove("hidden");
  } else if (colChat) {
    colChat.classList.remove("hidden");
  }
  // Título.
  const tituloEl = document.getElementById("com-chat-titulo");
  if (tituloEl) {
    const labels = { GENERAL: "General", SOPORTE: "Soporte", INCIDENCIA: "Incidencia", TURNO: "Turno", RESPONSABILIDAD: "Responsabilidad", PRIVADA: "Conversación privada" };
    tituloEl.textContent = labels[tipo] || "Conversación";
  }
  // Botón de cerrar: solo creador/admin (simplificado: mostrar siempre, el backend valida).
  const cerrarBtn = document.getElementById("com-cerrar-btn");
  if (cerrarBtn) cerrarBtn.classList.remove("hidden");
  await refrescarMensajes(conv_id);
  // Marcar como leído.
  if (navigator.onLine) {
    try { await client.rpc("marcar_conversacion_leida", { p_conversacion_id: conv_id }); } catch (e) {}
    await actualizarBadgeNoLeidos();
    await refrescarListaConversaciones();
  }
}

async function refrescarMensajes(conv_id) {
  const el = document.getElementById("com-mensajes");
  if (!el) return;
  if (!navigator.onLine) {
    el.innerHTML = '<p class="lista-estado">⚪ Sin conexión — no se pueden cargar los mensajes.</p>';
    return;
  }
  setLoading("com-mensajes", "Cargando mensajes…");
  try {
    const { data, error } = await client.rpc("listar_mensajes_conversacion", {
      p_conversacion_id: conv_id, p_limite: 100, p_offset: 0,
    });
    if (error) {
      const msg = String(error.message || error);
      if (esRpcFaltante(error)) {
        el.innerHTML = '<p class="lista-estado">Falta aplicar supabase/b8-comunicacion.sql en Supabase.</p>';
      } else {
        el.innerHTML = '<p class="lista-estado">Error: ' + escHtml(msg) + "</p>";
      }
      return;
    }
    renderMensajes(data || []);
  } catch (e) {
    el.innerHTML = '<p class="lista-estado">Error al cargar mensajes.</p>';
  }
}

function renderMensajes(filas) {
  const el = document.getElementById("com-mensajes");
  if (!el) return;
  if (!filas || filas.length === 0) {
    el.innerHTML = '<p class="lista-estado">Sin mensajes. Escribí el primero.</p>';
    return;
  }
  el.innerHTML = "";
  const uidActual = _usuarioActual && _usuarioActual.id;
  filas.forEach((m) => {
    const propio = m.usuario_id === uidActual;
    const div = document.createElement("div");
    div.className = "com-msg" + (propio ? " com-msg-propio" : "");
    const hora = m.creado_en ? new Date(m.creado_en).toLocaleString("es", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "";
    const estadoIcono = m.estado === "PENDIENTE" ? " ⏳" : m.estado === "REQUIERE_ATENCION" ? " ⚠️" : "";
    div.innerHTML = '<div class="com-msg-autor">' + escHtml(propio ? "Vos" : (m.usuario_nombre || "—")) + '</div><div class="com-msg-contenido">' + escHtml(m.contenido) + '</div><div class="com-msg-meta muted">' + hora + estadoIcono + "</div>";
    el.appendChild(div);
  });
  // Scroll al final.
  el.scrollTop = el.scrollHeight;
}

// ---- B8: enviar mensaje ----
// Pasa por ejecutarOperacion (cola offline + idempotencia). El backend
// valida acceso, contenido no vacío e idempotencia.
async function enviarMensaje(contenido) {
  if (!_comConvActual) {
    setMsg("msg-mensaje", "Abrí una conversación primero.", false);
    return false;
  }
  const r = await ejecutarOperacion("mensaje", {
    p_conversacion_id: _comConvActual, p_contenido: contenido,
  });
  if (!r.ok) {
    setMsg("msg-mensaje", "No se pudo enviar: " + explicarError(r.error, "enviar mensaje"), false);
    return false;
  }
  setMsg("msg-mensaje", r.offline ? "⏳ Pendiente de enviar — se sincronizará al reconectar." : "", true);
  if (!r.offline) {
    await refrescarMensajes(_comConvActual);
    await refrescarListaConversaciones();
  } else {
    // Mostrar el mensaje pendiente localmente.
    appendMensajePendiente(contenido);
  }
  return true;
}

function appendMensajePendiente(contenido) {
  const el = document.getElementById("com-mensajes");
  if (!el) return;
  const div = document.createElement("div");
  div.className = "com-msg com-msg-propio com-msg-pendiente";
  div.innerHTML = '<div class="com-msg-autor">Vos</div><div class="com-msg-contenido">' + escHtml(contenido) + '</div><div class="com-msg-meta muted">⏳ Pendiente</div>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

// ---- B8: crear conversación nueva ----
async function crearConversacion(tipo, titulo, participante_id) {
  const r = await ejecutarOperacion("conversacion", {
    p_tipo: tipo, p_titulo: titulo || null, p_participante_id: participante_id || null,
  });
  // Reutiliza ejecutarOperacion + RPC_POR_TIPO.conversacion (="crear_conversacion"),
  // igual que abrirSoporte/abrirConversacionContextual. La idempotency_key la
  // genera/conserve la infraestructura offline existente (única cola).
  if (!r.ok) {
    setMsg("msg-nueva-conv", "No se pudo crear: " + explicarError(r.error, "crear conversación"), false);
    return null;
  }
  // Si fue online, r.data.id; si fue offline, no tenemos el id aún.
  const convId = r.data && r.data.id;
  setMsg("msg-nueva-conv", r.offline ? "⏳ Pendiente — se creará al reconectar." : "✓ Conversación creada.", true);
  await refrescarListaConversaciones();
  return convId;
}

// ---- B8: crear conversación contextual (incidencia/turno/responsabilidad) ----
async function abrirConversacionContextual(tipo, entidadId) {
  // La RPC crear_conversacion es idempotente: si ya existe, la devuelve.
  const params = { p_tipo: tipo };
  if (tipo === "INCIDENCIA") params.p_incidencia_id = entidadId;
  else if (tipo === "TURNO") params.p_turno_id = entidadId;
  else if (tipo === "RESPONSABILIDAD") params.p_responsabilidad_id = entidadId;
  const r = await ejecutarOperacion("conversacion", params);
  if (!r.ok) {
    const msg = String((r.error && (r.error.message || r.error.code)) || r.error || "");
    if (esRpcFaltante(r.error)) {
      setMsg("msg-mensaje", "Falta aplicar supabase/b8-comunicacion.sql en Supabase.", false);
    } else {
      setMsg("msg-mensaje", "No se pudo abrir: " + escHtml(msg), false);
    }
    return;
  }
  if (r.offline) {
    setMsg("msg-mensaje", "⏳ Pendiente — la conversación se abrirá al reconectar.", true);
    return;
  }
  const data = r.data;
  if (data && data.id) {
    // Navegar a la pestaña Comunicación y abrir la conversación.
    const btn = document.querySelector('.tab-btn[data-tab="comunicacion"]');
    if (btn) btn.click();
    await esperar(100);
    await abrirConversacion(data.id, tipo);
  }
}

// ---- B8: cerrar conversación ----
async function cerrarConversacion() {
  if (!_comConvActual) return;
  if (!navigator.onLine) { setMsg("msg-mensaje", "⚪ Sin conexión.", false); return; }
  try {
    const { error } = await client.rpc("cerrar_conversacion", { p_conversacion_id: _comConvActual });
    if (error) { setMsg("msg-mensaje", "No se pudo cerrar: " + escHtml(error.message || error), false); return; }
    setMsg("msg-mensaje", "✓ Conversación cerrada.", true);
    _comConvActual = null;
    document.getElementById("com-col-chat").classList.add("hidden");
    document.getElementById("com-col-lista").classList.remove("hidden");
    await refrescarListaConversaciones();
  } catch (e) {
    setMsg("msg-mensaje", "Error al cerrar conversación.", false);
  }
}

// ---- B8: soporte ----
async function abrirSoporte() {
  const r = await ejecutarOperacion("conversacion", { p_tipo: "SOPORTE" });
  if (!r.ok) {
    setMsg("msg-nueva-conv", "No se pudo abrir soporte: " + escHtml((r.error && (r.error.message || r.error.code)) || r.error || ""), false);
    return;
  }
  if (r.offline) {
    setMsg("msg-nueva-conv", "⏳ Pendiente — el soporte se abrirá al reconectar.", true);
    return;
  }
  const data = r.data;
  if (data && data.id) {
    const panel = document.getElementById("com-nueva-panel");
    if (panel) panel.classList.add("hidden");
    const btn = document.querySelector('.tab-btn[data-tab="comunicacion"]');
    if (btn) btn.click();
    await esperar(100);
    await abrirConversacion(data.id, "SOPORTE");
  }
}

// ---- B8: volver (móvil) ----
function volverListaConversaciones() {
  const colLista = document.getElementById("com-col-lista");
  const colChat = document.getElementById("com-col-chat");
  if (colLista) colLista.classList.remove("hidden");
  if (colChat) colChat.classList.add("hidden");
  _comConvActual = null;
}

// ---- B8: alertas para el Centro de Mando ----
let _b8CacheAlertas = { soportePendiente: 0, convRecientes: 0 };

async function refrescarAlertasB8() {
  if (!navigator.onLine || !tienePermiso("comunicacion", "ver")) return;
  try {
    const { data } = await client.rpc("listar_conversaciones_usuario", { p_solo_activas: true, p_limite: 50 });
    const convs = data || [];
    _b8CacheAlertas.soportePendiente = convs.filter((c) => c.tipo === "SOPORTE" && Number(c.no_leidos || 0) > 0).length;
    _b8CacheAlertas.convRecientes = convs.filter((c) => Number(c.no_leidos || 0) > 0).length;
  } catch (e) { /* RPC no existe: no agregar alertas */ }
}

function construirAlertasB8() {
  const a = [];
  if (_b8CacheAlertas.soportePendiente > 0) {
    a.push({ nivel: "atencion", tipo: "Soporte pendiente", texto: _b8CacheAlertas.soportePendiente + " conversación(es) de soporte con mensajes nuevos.", op: null });
  }
  if (_b8CacheAlertas.convRecientes > 0 && _b8CacheAlertas.convRecientes !== _b8CacheAlertas.soportePendiente) {
    a.push({ nivel: "normal", tipo: "Mensajes nuevos", texto: "Tenés " + _comNoLeidosTotal + " mensaje(s) sin leer.", op: null });
  }
  return a;
}

function construirAlertasMandoB8Completo(ops) {
  const base = (typeof construirAlertasMandoB7Completo === "function") ? construirAlertasMandoB7Completo(ops) : [];
  return base.concat(construirAlertasB8()).sort((a, b) => {
    const orden = { critico: 0, atencion: 1, normal: 2 };
    return (orden[a.nivel] != null ? orden[a.nivel] : 3) - (orden[b.nivel] != null ? orden[b.nivel] : 3);
  });
}

// Inicialización de la pestaña Comunicación.
safeInit("b8-comunicacion", () => {
  const form = document.getElementById("form-mensaje");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("mensaje-input");
      const contenido = input.value.trim();
      if (!contenido) return;
      const btn = form.querySelector("button[type='submit']");
      if (btn) btn.disabled = true;
      const ok = await enviarMensaje(contenido);
      if (btn) btn.disabled = false;
      if (ok) input.value = "";
    });
  }
  const volver = document.getElementById("com-volver-btn");
  if (volver) volver.addEventListener("click", volverListaConversaciones);
  const cerrar = document.getElementById("com-cerrar-btn");
  if (cerrar) cerrar.addEventListener("click", cerrarConversacion);
  const nueva = document.getElementById("com-nueva-btn");
  if (nueva) nueva.addEventListener("click", async () => {
    const panel = document.getElementById("com-nueva-panel");
    if (panel) panel.classList.toggle("hidden");
    // Cargar usuarios para el select.
    if (navigator.onLine) {
      try {
        const { data } = await client.rpc("listar_usuarios_para_chat", {});
        const sel = document.getElementById("nueva-conv-usuario");
        if (sel && Array.isArray(data)) {
          sel.innerHTML = '<option value="">Usuario…</option>';
          data.forEach((u) => {
            const o = document.createElement("option");
            o.value = u.id; o.textContent = u.nombre;
            sel.appendChild(o);
          });
        }
      } catch (e) {}
    }
  });
  const soporte = document.getElementById("com-soporte-btn");
  if (soporte) soporte.addEventListener("click", abrirSoporte);
  const formNueva = document.getElementById("form-nueva-conv");
  if (formNueva) {
    formNueva.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tipo = document.getElementById("nueva-conv-tipo").value;
      const titulo = document.getElementById("nueva-conv-titulo").value.trim();
      const usuario = document.getElementById("nueva-conv-usuario").value || null;
      if (tipo === "PRIVADA" && !usuario) {
        setMsg("msg-nueva-conv", "Elegí un usuario para la conversación privada.", false);
        return;
      }
      const id = await crearConversacion(tipo, titulo, usuario);
      if (id) {
        document.getElementById("com-nueva-panel").classList.add("hidden");
        await abrirConversacion(id, tipo);
      }
    });
  }
});
