// ---- Config del proyecto Supabase de Battlecruiser ----
const SUPABASE_URL = "https://papxnkkjtkxsitcsvcme.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pczHaS1JDPGrEA31vdbOLg_1l2qFhbm";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Sesión 14: arranque defensivo ----
// Antes, cada bloque de abajo hacía document.getElementById(...).addEventListener(...)
// directo. Si por un desfase de caché el HTML servido no coincidía exactamente con
// este app.js (un elemento nuevo/viejo que uno de los dos no tiene todavía), esa
// línea lanzaba "Cannot read properties of null" y ESO CORTABA la ejecución de TODO
// el resto del script — incluidas pantallas que no tenían nada que ver con el error
// (por eso a veces "algo se guardó" pero otra cosa de más abajo simplemente nunca se
// activó). safeInit() aísla cada función: si una falla, se avisa por consola y las
// demás se inicializan igual.
function safeInit(nombre, fn) {
  try {
    fn();
  } catch (e) {
    console.error("[Battlecruiser] No se pudo iniciar '" + nombre + "':", e);
  }
}

// R1/B8: helper de espera usado por abrirSoporte/abrirConversacionContextual
// para dejar que el cambio de pestaña se procese antes de abrir la conversación.
// Antes estas funciones referenciaban esperar() sin definirla (bug latente).
function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

// ---- Formato de fecha fijo (día/mes/año en español) — Sesión 17 ----
// `toLocaleDateString()` sin argumentos usa el idioma/región configurados en
// el celular de quien esté mirando la pantalla — dos vendedoras con el
// teléfono configurado distinto podían ver la misma fecha escrita distinto
// (m/d/a vs d/m/a). Se fija el locale para que se vea siempre igual.
function fechaCorta(fecha) {
  return new Date(fecha).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" });
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

// ---- Usuario autenticado actual — Misión B1 ----
// La cola offline necesita guardar QUIÉN creó cada operación pendiente
// (usuario_id), sin inventar nada si por algún motivo no hay sesión real
// todavía resuelta. Se guarda acá, en un solo lugar, en vez de leerlo cada
// vez de client.auth.getSession() (asíncrono) desde cada función que cree
// una operación.
let _usuarioActualId = null;
// B2.3-G / B3: novedades vistas (memoria, no persistente). Declarada
// al inicio para evitar TDZ: showLogin/showApp la referencian al arrancar.
let _novedadesVistas = new Set();
// B3.2: contexto centralizado del usuario actual. Declarado al inicio
// para evitar TDZ (showApp/showLogin lo usan durante la carga inicial).
let _usuarioActual = null;
let _permisosEfectivos = {};
let _cargandoUsuario = false;
// R1/B3.6: distingue la degradacion legitima (SQL B3 no aplicado: el RPC
// no existe) de un fallo de red o de un usuario que realmente no tiene
// permisos. Sin esto, un fallo de red al cargar permisos dejaria
// _permisosEfectivos vacio y tienePermiso() devolveria true para todo
// (UX incorrectamente permisiva / falsa autorizacion).
let _permisosCargaExitosa = false; // el RPC respondio un array (aunque fuera [])
let _permisosCargaFallidaRed = false; // la carga fallo por error de red

function showApp(session) {
  loginForm.classList.add("hidden");
  lanternWrap.classList.add("hidden");
  appShell.classList.add("visible");
  userEmailEl.textContent = session.user.email;
  _usuarioActualId = session.user.id;
  // B3: cargar el contexto completo del usuario (perfil, rol, permisos).
  // Una sola fuente para toda la app; reutiliza los RPC de B3.
  if (typeof cargarContextoUsuario === "function") cargarContextoUsuario();
}

function showLogin() {
  loginForm.classList.remove("hidden");
  lanternWrap.classList.remove("hidden");
  appShell.classList.remove("visible");
  _usuarioActualId = null;
  // B3.18/B3.19: limpiar TODO el contexto de usuario al salir, para que
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
    loginBtn.textContent = "Entrando...";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const { error } = await client.auth.signInWithPassword({ email, password });

    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";

    if (error) {
      const msg = (error.message || "").toLowerCase();
      loginError.textContent = (!navigator.onLine || msg.includes("failed to fetch") || msg.includes("timeout"))
        ? "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento."
        : "Correo o contraseña incorrectos.";
      console.error("[Battlecruiser] (login)", error);
    }
  });
});

safeInit("logout", () => {
  logoutBtn.addEventListener("click", async () => {
    // B3.19: limpiar el contexto de usuario antes de cerrar sesión.
    if (typeof limpiarContextoUsuario === "function") limpiarContextoUsuario();
    await client.auth.signOut();
  });
});

// ---- Actualizar app: borra caché del shell y fuerza traer la última versión ----
// Sesión 15: pedido explícito de Roberto — que este botón esté también en la
// pantalla de login, para no tener que entrar a la cuenta solo para forzar una
// actualización (por ejemplo si el login mismo quedó con una versión vieja
// pegada). Un solo botón compartido, cableado a los dos lugares.
async function actualizarApp(btn) {
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Actualizando...";
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
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

// ---- Ojito para mostrar/ocultar contraseña — Sesión 15, ícono real Sesión 17 ----
// Se aplica a cualquier campo que tenga un botón .pass-toggle al lado (login
// y las dos contraseñas del panel de "Cambiar contraseña").
// Sesión 17: antes el botón solo agregaba la clase "activo" (sin ningún estilo
// asociado en style.css), así que el ícono se veía exactamente igual estuviera
// mostrando la contraseña o no — la única pista era leer los caracteres reales.
// Ahora el ícono cambia de verdad entre "ojo abierto" y "ojo tachado".
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

// ---- Menú "Ajustes" (Cambiar contraseña / Actualizar app) — Sesión 15 ----
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

    // Sesión 14: chequeo explícito de que hay sesión activa antes de intentar.
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

// ---- Tecla Escape cierra el menú "Ajustes" y el panel "Cambiar contraseña" — Sesión 17 ----
// Antes solo se podían cerrar tocando afuera (el menú) o el botón "Cancelar"
// (el panel). Escape es el atajo esperable para cualquiera de los dos, sobre
// todo usando la app desde una PC con teclado.
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
// Bug clásico de los inputs type="number": si el cursor queda arriba de uno
// de estos campos (precio, cantidad, costo) mientras alguien desplaza la
// pantalla con la rueda del mouse, el navegador interpreta ese scroll como
// "sumar/restar" al valor del campo, sin que nadie lo note. En una pantalla
// de compras/transferencias/vales eso puede cambiar un precio o una cantidad
// de verdad. Se desenfoca el campo apenas empieza el scroll, así el gesto
// mueve la página como siempre y no toca el número.
safeInit("bloqueo-scroll-numeros", () => {
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("wheel", () => input.blur(), { passive: true });
  });
});

// ============================================================
// Caché local de lectura (IndexedDB) — Sesión 22, refinada en Sesión 23
// Infraestructura OFFLINE-FIRST DE LECTURA (ETAPA A completa desde esta
// sesión). Todo lo que hace falta para poder ABRIR la app y ver datos
// reales sin Internet: productos, categorías, unidades, almacenes, stock
// y presentaciones (catálogo + asociaciones por producto). Se guarda cada
// conjunto de datos completo bajo una "clave" simple en un único object
// store — no hace falta modelar cada tabla por separado porque estos datos
// siempre se reemplazan enteros (nunca se actualiza una fila suelta desde
// acá, siempre el listado completo tal cual lo devuelve Supabase).
//
// Sesión 23: se agregó "unidades" a la lista de arriba — existía la
// consulta cacheada de "categorias" para llenar selectores, pero el listado
// de Categorías/Unidades del panel de Configuración usaba una consulta
// aparte SIN caché (bug real: offline se quedaba trabado en "Cargando…"
// para siempre). Ahora las dos pasan por el mismo withCache.
//
// Sesión 24: el indicador de conexión ya no depende solo de
// navigator.onLine (ver _conectividadReal / marcarConectividadReal más
// abajo) — cada consulta real que pasa por withCache confirma o desmiente
// si Internet funciona de verdad, para el caso de wifi/datos "conectados"
// pero sin salida real (portal cautivo, router sin Internet, etc.).
//
// A propósito, esta sesión NO incluye ninguna escritura offline (compras,
// ventas, transferencias, vales, ni crear/editar productos, almacenes o
// presentaciones): esa cola de sincronización de escrituras es la etapa
// siguiente. Todas las operaciones de escritura existentes siguen
// funcionando exactamente igual que antes, solo online.
// ============================================================
const IDB_NAME = "battlecruiser-cache";
// Misión B1: se sube de 1 a 2 para agregar el object store nuevo de la cola
// offline (IDB_OPS_STORE, ver más abajo). Se reutiliza la MISMA base
// (battlecruiser-cache) — no se crea una base aparte. onupgradeneeded ya
// revisa "si no existe" antes de crear cada store, así que abrir la base
// con la versión nueva no toca ni borra el store existente de caché de
// lectura (IDB_STORE / "lecturas").
const IDB_VERSION = 2;
const IDB_STORE = "lecturas";
// ---- Misión B1: store de la cola offline de escrituras pendientes ----
const IDB_OPS_STORE = "operaciones_pendientes";

// ---- Misión B2.2-A: conexión IndexedDB memoizada ----
// ANTES: cada llamada a idbAbrir() hacía un indexedDB.open() nuevo — abrir
// una conexión no es gratis (ida y vuelta al proceso de storage del
// navegador), y guardar UNA sola operación offline terminaba abriendo la
// base 3 veces (guardarOperacionPendiente, actualizarContadorColaPendiente,
// refrescarOperacionesPendientesCache). En ventas consecutivas eso se
// notaba como demora al guardar.
// AHORA: se abre una sola vez por sesión y se reutiliza el mismo handle.
// Nada del resto del contrato de idbAbrir() cambia (misma base, mismo
// onupgradeneeded, mismo comportamiento si IndexedDB no está disponible) —
// solo se cachea la promesa para no repetir el open().
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
      if (!db.objectStoreNames.contains(IDB_OPS_STORE)) {
        // keyPath "id" (UUID generado con crypto.randomUUID(), ver
        // crearOperacionPendiente). Los índices "estado" y "creado_en" son
        // para poder consultar sin tener que traer y filtrar en JS todas
        // las operaciones guardadas cada vez (obtenerOperacionesPorEstado
        // y el orden FIFO de obtenerTodasLasOperaciones).
        const opsStore = db.createObjectStore(IDB_OPS_STORE, { keyPath: "id" });
        opsStore.createIndex("estado", "estado", { unique: false });
        opsStore.createIndex("creado_en", "creado_en", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Si otra pestaña/ventana necesita subir la versión de la base, esta
      // conexión se cierra sola — hay que soltar la caché para que la
      // próxima llamada abra una conexión nueva en vez de quedarse con un
      // handle cerrado e inservible.
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

async function idbGet(clave) {
  try {
    const db = await idbAbrir();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(clave);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo leer de IndexedDB ('" + clave + "'):", e);
    return null;
  }
}

async function idbSet(clave, datos) {
  try {
    const db = await idbAbrir();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put({ clave, datos, actualizado: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo guardar en IndexedDB ('" + clave + "'):", e);
  }
}

// ---- Estado de caché por clave — Sesión 23 ----
// Antes había un solo Set booleano (_clavesDesdeCache) que solo distinguía
// "se está mostrando desde caché" de "se está mostrando desde el servidor".
// Eso mezclaba dos situaciones muy distintas para quien mira la pantalla
// offline:
//   a) esta clave NUNCA se guardó en este dispositivo (nunca se abrió esa
//      pantalla con Internet) → no hay nada real que mostrar, y el listado
//      vacío no significa "no hay productos", significa "no sé".
//   b) esta clave SÍ se guardó, y lo guardado está realmente vacío (en
//      algún momento con conexión se confirmó que no había filas) → el
//      listado vacío es un dato real, no un problema de conexión.
// Ahora cada clave guarda uno de 4 estados, y el resto del archivo (mensajes
// de listas vacías, indicador de conexión, tooltip de última actualización)
// lee de acá en vez de un simple sí/no.
//   "servidor"        → el último dato mostrado vino del servidor recién.
//   "sin-cache"        → sin conexión (o error de red) y nunca se guardó
//                        nada en este dispositivo para esta clave.
//   "cache-vacia"      → sin conexión (o error de red), hay un registro
//                        guardado para esta clave, pero su contenido es un
//                        array vacío (confirmado en su momento con el servidor).
//   "cache-con-datos"  → sin conexión (o error de red), y lo guardado tiene
//                        al menos una fila.
const _estadoCacheClaves = {};

// Claves que este dispositivo cachea para lectura offline (Etapa A). Se usa
// para el tooltip de "última actualización" del indicador — "asociaciones:*"
// queda afuera porque son dinámicas por producto, no una lista fija.
const CLAVES_CACHE_PRINCIPALES = ["productos", "categorias", "unidades", "almacenes", "stock", "presentaciones"];

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

// ---- Conectividad real — Sesión 24 ----
// navigator.onLine solo dice si el sistema operativo/navegador CREE tener
// una interfaz de red activa — puede seguir en "true" con wifi conectado a
// un router sin Internet real, datos móviles con portal cautivo, etc. El
// indicador no puede confiar solo en eso: cada consulta real a Supabase que
// pasa por withCache confirma o desmiente la conectividad real, y esa
// confirmación se combina con navigator.onLine para decidir qué se muestra.
// No se agrega ningún ping/polling nuevo — se aprovechan las consultas que
// la app ya hace.
let _conectividadReal = null; // null = todavía no se resolvió ninguna consulta real esta sesión

function marcarConectividadReal(estado) {
  if (_conectividadReal === estado) return;
  _conectividadReal = estado;
  actualizarIndicadorConexion();
}

function estaRealmenteDesconectado() {
  return !navigator.onLine || _conectividadReal === "offline";
}

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
// "no hay datos" normal (offline con caché confirmada vacía, u online).
// Se usa en todas las listas que pasan por withCache — nunca en
// transferencias/vales/ventas, que no tienen caché offline (fuera del
// alcance de la Etapa A, ver más abajo).
function mensajeListaVacia(clave, mensajeBase) {
  if (_estadoCacheClaves[clave] === "sin-cache") {
    return "Sin conexión y todavía no se guardó nada de esto en este dispositivo. Abrí esta pantalla una vez con Internet y va a quedar disponible sin conexión la próxima vez.";
  }
  return mensajeBase;
}

// Envuelve una consulta a Supabase con caché local de solo lectura:
// - Con Internet: consulta al servidor, guarda el resultado en IndexedDB
//   (para la próxima vez que falte conexión) y lo devuelve tal cual.
// - Si la consulta falla por red, o directamente no hay Internet: cae a lo
//   último guardado en IndexedDB para esa clave (o [] si nunca se guardó
//   nada todavía para esa clave en este dispositivo).
// consultaFn debe devolver la promesa cruda de Supabase (con {data, error}),
// nunca ya resuelta — así acá se decide una sola vez si hubo que caer a caché.
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

// ============================================================
// Cola offline de escrituras (Misión B1) — SOLO infraestructura
// ============================================================
// Esto guarda operaciones de escritura (compras, ventas, transferencias,
// vales, etc.) que se hicieron sin Internet, para que una misión futura
// las pueda sincronizar contra Supabase en orden cuando vuelva la conexión.
//
// Esta misión NO conecta esta cola a ningún formulario todavía — compras,
// ventas, transferencias y vales de salida siguen funcionando exactamente
// igual que antes (solo online). Acá solo queda preparado el lugar donde
// guardar esas operaciones y las funciones para manejarlas.
//
// Estados posibles de una operación (no inventar otros):
//   PENDIENTE         → creada, todavía no se intentó sincronizar.
//   SINCRONIZANDO     → una futura misión la está enviando a Supabase ahora.
//   SINCRONIZADA      → se confirmó en el servidor, ya se puede limpiar.
//   REQUIERE_ATENCION → se reintentó y falló de forma que no conviene
//                       reintentar sola (ej. error de negocio, no de red).
// ============================================================

// Crea el objeto de una operación pendiente nueva (todavía no la guarda en
// IndexedDB — eso lo hace guardarOperacionPendiente). "tipo" identifica qué
// clase de operación es (ej. "venta", "compra"; lo define la misión que
// conecte cada formulario). "payload" es lo que esa futura misión necesite
// para reintentar la llamada real contra Supabase.
//
// id e idempotency_key son dos UUID independientes generadas una sola vez
// acá: idempotency_key NUNCA se regenera al reintentar (para eso existe:
// para que el servidor pueda reconocer un reintento de la misma operación
// y no duplicarla), a diferencia de "id" que es solo la llave local en
// IndexedDB.
//
// Si no hay usuario autenticado todavía (_usuarioActualId sigue en null),
// se guarda tal cual: no se inventa un usuario.
//
// Misión B2: acepta un tercer parámetro opcional "idempotencyKeyExistente".
// ejecutarOperacion() (más abajo) genera la idempotency_key UNA sola vez, ANTES
// de saber si la operación va a poder ejecutarse online o si va a terminar en
// la cola — así, si un intento online falla por red, la operación que se
// guarda en la cola usa esa MISMA clave en vez de generar una nueva (Sección 3
// de la misión: crítico para que un reintento después de una respuesta
// perdida no duplique la operación en el servidor). Si no se pasa nada
// (compatibilidad con quien llame a esta función sin pasar por
// ejecutarOperacion), se genera una acá como antes.
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
// la app si IndexedDB falla: avisa por consola y devuelve null en vez de
// lanzar una excepción que corte el resto del flujo que la llamó.
async function guardarOperacionPendiente(operacion) {
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
// más nueva (orden FIFO por creado_en) — así una futura misión de
// sincronización las puede recorrer en ese mismo orden sin tener que
// ordenar de nuevo. Devuelve [] si no hay ninguna o si algo falló.
async function obtenerTodasLasOperaciones() {
  try {
    const db = await idbAbrir();
    const datos = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const req = tx.objectStore(IDB_OPS_STORE).getAll();
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
  try {
    const db = await idbAbrir();
    const datos = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const req = tx.objectStore(IDB_OPS_STORE).index("estado").getAll(estado);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return datos.sort((a, b) => (a.creado_en < b.creado_en ? -1 : a.creado_en > b.creado_en ? 1 : 0));
  } catch (e) {
    console.error("[Battlecruiser] No se pudieron leer las operaciones en estado '" + estado + "':", e);
    return [];
  }
}

// Actualiza una operación existente (ej. cambiar estado, sumar un intento,
// guardar el último error). "cambios" es un objeto con solo los campos que
// cambian — se mezcla con la operación guardada, nunca la reemplaza entera,
// así quien llama no tiene que repetir todos los campos que no cambiaron.
// actualizado_en se pisa siempre acá mismo, no hace falta pasarlo.
// idempotency_key NUNCA se debe pasar en "cambios" desde quien reintenta
// una sincronización — si igual llegara, se ignora a propósito para que no
// se pueda regenerar por error.
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

// ---- UI mínima (punto 17/18 de la Misión B2): solo el contador que ya
// existía (Misión B1), ahora conectado a datos reales. Distingue
// "pendientes/sincronizando" (🔄, normal) de "requiere atención" (⚠, se
// pinta distinto vía la clase .atencion en style.css) — nunca se agrega un
// dashboard nuevo, solo se llena el chip que ya estaba en el HTML.
// Misión B2.2-A: antes traía TODAS las operaciones guardadas (getAll sin
// filtro), las deserializaba enteras y las contaba con .filter() en JS —
// para un badge que solo necesita 3 números, eso era leer y ordenar de más.
// Ahora usa .count() sobre el índice "estado" (ya existía, ver idbAbrir):
// IndexedDB puede contar coincidencias de un índice sin traer los datos
// completos de cada operación. Mismo resultado visible, mucho menos trabajo.
async function actualizarContadorColaPendiente() {
  const el = document.getElementById("cola-pendientes-badge");
  if (!el) return;
  try {
    const db = await idbAbrir();
    const { pendientes, atencion } = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const idx = tx.objectStore(IDB_OPS_STORE).index("estado");
      const reqPendiente = idx.count("PENDIENTE");
      const reqSincronizando = idx.count("SINCRONIZANDO");
      const reqAtencion = idx.count("REQUIERE_ATENCION");
      tx.oncomplete = () => {
        resolve({
          pendientes: reqPendiente.result + reqSincronizando.result,
          atencion: reqAtencion.result,
        });
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
    // Mision B2.2-B.3.1: si el panel de pendientes esta visible,
    // refrescarlo a la vez que el contador. El panel hace su propia
    // lectura getAll (necesita los registros completos para pintarlos,
    // no solo los count() de aca); sin await para no bloquear al
    // contador ni disparar una segunda sincronizacion.
    var tabPendientes = document.getElementById("tab-pendientes");
    if (tabPendientes && tabPendientes.classList.contains("visible")) {
      refrescarPanelPendientes();
    }
  } catch (e) {
    console.warn("[Battlecruiser] No se pudo actualizar el contador de la cola pendiente:", e);
  }
}

// ============================================================
// Panel "Operaciones pendientes" (Misión B2.2-B.3.1) — SOLO UI
// ============================================================
// Muestra el detalle de las operaciones todavía no eliminadas de la cola
// (PENDIENTE, SINCRONIZANDO, REQUIERE_ATENCION) reutilizando EXACTAMENTE la
// misma infraestructura offline existente:
//   - mismo store IndexedDB (IDB_OPS_STORE / "operaciones_pendientes");
//   - mismos índices "estado" y "creado_en";
//   - obtenerOperacionesPorEstado() / guardarOperacionPendiente() /
//     actualizarOperacionPendiente() / eliminarOperacionPendiente() /
//     sincronizarCola() / actualizarContadorColaPendiente().
// NO crea una segunda cola, ni un store nuevo, ni una caché nueva, ni un
// mecanismo de sincronización propio. Toca la lógica de sincronización
// únicamente para pedirle que refresque el panel al terminar (junto al
// contador que ya refrescaba).
//
// Eficiencia de lectura: una sola transacción IndexedDB con tres getAll
// indexados (mismo patrón que actualizarContadorColaPendiente ya usaba con
// count()). No se usa obtenerTodasLasOperaciones() acá (trae también
// SINCRONIZADA, que ya se elimina y no debe aparecer como pendiente) ni
// refrescarOperacionesPendientesCache() (trae solo PENDIENTE+SINCRONIZANDO
// para la proyección de stock y excluye REQUIERE_ATENCION a propósito).
// ============================================================

// Etiquetas legibles de tipo de operación. Los tipos son los mismos que ya
// define RPC_POR_TIPO (compra/venta/transferencia/vale/producto).
const ETIQUETA_TIPO_OP = {
  compra: "Compra",
  venta: "Venta",
  transferencia: "Transferencia",
  vale: "Vale de salida",
  producto: "Creación de producto",
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
};

// Resumen legible de una operación, armado a partir de su payload (los
// mismos p_* que los RPC existentes). Nunca inventa datos: si un campo no
// está en el payload, no se muestra. Es solo texto para que una persona
// reconozca qué operación es; la autoridad real sigue siendo el backend.
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
// que deben aparecer como pendientes: SINCRONIZADA se elimina al sincronizar
// y no debe mostrarse). Orden FIFO por creado_en, igual que el resto de la cola.
// Devuelve [] si IndexedDB no está disponible o algo falla (mismo criterio
// que obtenerOperacionesPorEstado: no lanzar, avisar y devolver vacío).
async function obtenerOperacionesVisiblesPanel() {
  try {
    const db = await idbAbrir();
    const combinadas = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const idx = tx.objectStore(IDB_OPS_STORE).index("estado");
      const reqPendiente = idx.getAll("PENDIENTE");
      const reqSincronizando = idx.getAll("SINCRONIZANDO");
      const reqAtencion = idx.getAll("REQUIERE_ATENCION");
      tx.oncomplete = () => {
        resolve(
          (reqPendiente.result || [])
            .concat(reqSincronizando.result || [])
            .concat(reqAtencion.result || [])
        );
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
// badge de la pestaña. No hace lecturas extra: el #cola-pendientes-badge del
// header sigue siendo la única fuente del contador (lo actualiza
// actualizarContadorColaPendiente por su cuenta); acá solo se refleja ese
// conteo en el badge chico de la pestaña para que se sepa si entrar.
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
  // B2.3: el Centro de Control refleja el mismo estado de la cola.
  // No crea una segunda fuente: lee la misma cola (ya leida arriba) y
  // deriva el estado operacional. Sin await para no acoplar al panel.
  if (typeof refrescarCentroControl === "function") refrescarCentroControl();
}

// ============================================================
// B2.2-B.3.2 - Gestion y recuperacion de operaciones pendientes.
// Convierte el panel de B2.2-B.3.1 en una herramienta real de control:
// ver detalle de una operacion, reintentar REQUIERE_ATENCION->PENDIENTE
// reutilizando el MISMO registro (misma idempotency_key) y eliminar una
// operacion que ya no debe ejecutarse. Sigue sin crear nada paralelo:
// reutiliza _cache, actualizarOperacionPendiente(),
// eliminarOperacionPendiente(), sincronizarCola(),
// actualizarContadorColaPendiente() y refrescarPanelPendientes().
// ============================================================

// Resuelve un id de producto a su nombre legible usando _cache.productos
// (la misma cache de lectura que ya alimenta Productos/Resumen/Ventas).
// Si no esta en cache, no inventa: devuelve el id tal cual (acortado para
// que quepa en pantalla) para que la operacion igual sea identificable.
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
// payload REAL (los mismos p_* que los RPC existentes). No inventa campos:
// si un dato no esta en el payload, no se muestra. Los IDs de producto/
// almacen se resuelven a nombre via _cache; si no hay match, se muestra el
// id acortado para que la operacion igual sea identificable (regla 11).
function detalleOperacionPendiente(op) {
  const p = (op && op.payload) || {};
  const tipo = ETIQUETA_TIPO_OP[op.tipo] || op.tipo || "Operaci\u00f3n";
  const estado = etiquetaEstadoPanel(op.estado);
  const fechaHora = op.creado_en
    ? new Date(op.creado_en).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "\u2014";
  const intentos = Number(op.intentos) || 0;
  const ultimoIntento = op.ultimo_intento
    ? new Date(op.ultimo_intento).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
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
// actualizarOperacionPendiente() (que CONSERVA idempotency_key por contrato
// existente) y luego dispara el flujo normal de sincronizacion. NO crea un
// nuevo registro, NO regenera la clave, NO llama al RPC directamente: vuelve
// al flujo existente (REQUIERE_ATENCION -> PENDIENTE -> SINCRONIZANDO -> RPC).
// Mismo patron que recuperarOperacionesAtrapadas (SINCRONIZANDO->PENDIENTE).
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
      // B2.2-B.3.2 (revision): NO se pasa ultimo_error. El contrato de
      // actualizarOperacionPendiente (Object.assign + conservar idempotency_key)
      // deja intacto el ultimo_error existente, que es el error real que
      // provoco REQUIERE_ATENCION (ej. "stock insuficiente"). Pisarlo con un
      // texto generico perdia la informacion del motivo original. El
      // ultimo_error solo lo setea el sistema ante un fallo real (red/negocio),
      // nunca el reintento manual. No se toca idempotency_key.
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
// eliminarOperacionPendiente(). NO llama RPC, NO crea otra operacion, NO
// toca Supabase. Actualiza panel y contador (eliminarOperacionPendiente ya
// llama a actualizarContadorColaPendiente, y refrescarPanelPendientes al
// final deja todo sincronizado).
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

  // B2.2-B.3.2: listeners delegados en la lista del panel. Un solo
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

  // B2.2-B.3.2: listener delegado para el detalle (Reintentar/Eliminar del
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

// ============================================================
// Proyección local de stock (Misión B2, Sección 16) — SIMPLE
// ============================================================
// Suma el efecto de las operaciones todavía no confirmadas (PENDIENTE o
// SINCRONIZANDO) sobre el stock real ya cacheado, solo para que se pueda
// seguir vendiendo/trabajando con una cifra aproximada mientras no hay
// Internet. NUNCA modifica el stock real ni la caché real de solo lectura
// (_cache.stock / IndexedDB "stock", ver withCache más arriba) — es un
// ajuste que se calcula al vuelo cada vez que hace falta mostrar un número.
// Las operaciones SINCRONIZADA (se borran de la cola) y REQUIERE_ATENCION
// (quedan pero fuera de este filtro) no afectan la proyección: en ambos
// casos la Sección 16 pide refrescar el stock real y sacarlas de acá.
let _operacionesPendientesCache = [];

// Misión B2.2-A: antes traía TODAS las operaciones de la cola (incluidas
// SINCRONIZADA/REQUIERE_ATENCION, que esta proyección ni usa) y las
// ordenaba enteras en JS, solo para quedarse con dos estados. Ahora pide
// directamente esos dos estados al índice "estado" (una sola transacción,
// dos getAll indexados) y solo ordena ese subconjunto — normalmente mucho
// más chico que la cola completa.
async function refrescarOperacionesPendientesCache() {
  try {
    const db = await idbAbrir();
    const combinadas = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_OPS_STORE, "readonly");
      const idx = tx.objectStore(IDB_OPS_STORE).index("estado");
      const reqPendiente = idx.getAll("PENDIENTE");
      const reqSincronizando = idx.getAll("SINCRONIZANDO");
      tx.oncomplete = () => {
        resolve((reqPendiente.result || []).concat(reqSincronizando.result || []));
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
// operaciones todavía no confirmadas: compra suma en su almacén, venta/vale
// restan en el suyo, transferencia resta en el origen y suma en el destino.
//
// Misión B2.1, Partes 1/2/14 — CORRECCIÓN: una compra pendiente puede estar
// en unidades de PRESENTACIÓN (p_presentacion_id + p_cantidad_presentacion,
// ver form-compra) en vez de unidades base — antes esta función sumaba
// siempre p_cantidad tal cual, que en modo presentación es la cantidad de
// CAJAS/PAQUETES, no de unidades base (ej. 3 cajas sumaba "3" en vez de "72").
// Ahora, si la operación usa presentación, se multiplica por el factor SOLO
// si ese factor ya se conoce de forma confiable (factorPresentacionConocido,
// ver arriba); el factor nunca se inventa. Venta/vale/transferencia siguen
// siendo siempre en unidades base (no tienen modo presentación en el código
// actual — Parte 3 de la misión), así que no cambian.
//
// Devuelve { ajuste, noCalculable }: si CUALQUIER operación pendiente
// relevante para este producto/almacén no se puede reflejar (factor
// desconocido), noCalculable queda en true y "ajuste" NO debe mostrarse como
// si fuera la cifra completa (ver obtenerStockDisponible /
// actualizarStockDisponibleUI más abajo).
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

// ============================================================
// Punto central de ejecución de operaciones de escritura — Misión B2
// ============================================================
// Usado por los 4 formularios (compra/venta/transferencia/vale) en vez de
// que cada uno duplique su propia lógica de "intentar online, caer a la
// cola si falla" (Sección 2 de la misión). "payload" son EXACTAMENTE los
// parámetros del RPC correspondiente (Sección 1 — firmas reales, sin
// p_idempotency_key todavía: esa se agrega acá).
//
// La idempotency_key se genera UNA sola vez, al principio, antes de saber
// si va a poder intentarse online — así, si el intento online falla por
// red, la operación que se guarda en la cola usa esa MISMA clave
// (Secciones 3 y 13: crítico para que un reintento tras una respuesta
// perdida no duplique la operación ya procesada en el servidor). Nunca se
// regenera al reintentar.
//
// Devuelve siempre uno de estos 3 resultados:
//   { ok: true,  offline: false, data }      → el RPC se ejecutó ahora mismo.
//   { ok: true,  offline: true,  operacion }  → quedó guardada en la cola.
//   { ok: false, error }                      → error de negocio real del
//                                                backend (nunca se guarda en
//                                                la cola ni se reintenta sola).
const RPC_POR_TIPO = {
  compra: "registrar_compra",
  venta: "registrar_venta",
  transferencia: "registrar_transferencia",
  vale: "registrar_vale_salida",
  // Misión B2.2-B.2: creación de productos entra a la misma cola/RPC central
  // que compra/venta/transferencia/vale, en vez de un INSERT directo aparte.
  producto: "crear_producto",
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
};

async function ejecutarOperacion(tipo, payload) {
  // B3.3: un usuario inactivo no debe operar. El backend lo impide; el
  // frontend lo refleja devolviendo un error claro. Reutiliza
  // usuarioPuedeOperar() (que consulta el contexto, no hace RPC nuevo).
  if (typeof usuarioPuedeOperar === "function") {
    const puede = await usuarioPuedeOperar();
    if (!puede) {
      return { ok: false, error: { message: "Tu usuario está inactivo. Contactá al administrador." } };
    }
  }
  // B3.14: asegurar que la operación conserve el usuario_id correcto.
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

  // Sección 5: sin Internet, directo a la cola — nunca se intenta el RPC.
  if (!navigator.onLine) {
    return encolar();
  }

  // Sección 4/6: con Internet (aparente) se intenta el RPC real.
  try {
    const { data, error } = await client.rpc(
      rpcNombre,
      Object.assign({}, payload, { p_idempotency_key: idempotency_key })
    );

    if (!error) {
      // B4: registrar auditoría de la operación exitosa (trazabilidad).
      // No bloquea el flujo si falla (registrarAuditoria captura errores).
      if (typeof registrarAuditoria === "function") {
        registrarAuditoria(tipo, "Operación " + (ETIQUETA_TIPO_OP[tipo] || tipo) + " ejecutada online.", "exito", String(data && data.id || ""), idempotency_key, null);
      }
      return { ok: true, offline: false, data };
    }

    if (esErrorDeRed(error)) {
      // Sección 6: falló por red (timeout, "Failed to fetch", etc.), no por
      // una regla de negocio — se guarda en la cola con la misma clave.
      return encolar();
    }

    // Sección 7: error de negocio real (stock insuficiente, sin permiso,
    // producto/almacén/presentación inexistente o inactiva, cantidad o
    // configuración inválida, etc.) — se muestra normal, NUNCA a la cola.
    if (typeof registrarAuditoria === "function") {
      registrarAuditoria(tipo, "Operación " + (ETIQUETA_TIPO_OP[tipo] || tipo) + " rechazada: " + (error.message || "error de negocio"), "requiere_atencion", null, idempotency_key, null);
    }
    return { ok: false, error };
  } catch (e) {
    // Algunas fallas de red llegan como excepción (fetch rechazado por el
    // Service Worker, "Failed to fetch" como TypeError) en vez de {error}.
    return encolar();
  }
}

// ============================================================
// Recuperación de operaciones atrapadas en SINCRONIZANDO — Misión B2.1,
// Parte 10.
// ============================================================
// Riesgo real: si la app se cierra/recarga/pierde conexión justo mientras una
// operación está marcada SINCRONIZANDO (ver sincronizarCola más abajo, que la
// marca así ANTES de llamar al RPC), esa operación queda atrapada para
// siempre — sincronizarCola() solo vuelve a leer las que están en
// "PENDIENTE" (FIFO, Sección 8), así que "SINCRONIZANDO" nunca se reintenta
// sola en la siguiente sesión.
//
// Es seguro bajarla a PENDIENTE al iniciar la app porque su idempotency_key
// NUNCA se regenera (actualizarOperacionPendiente la conserva siempre, ver
// Parte 5/6 de la misión): si el intento anterior en realidad sí había
// llegado a procesarse en el servidor y solo se perdió la respuesta, el
// reintento usa la MISMA clave y el backend puede reconocerlo como la misma
// operación lógica en vez de duplicarla (contrato ya existente vía
// p_idempotency_key en cada RPC). Se debe ejecutar ANTES de la primera
// llamada a sincronizarCola() de esta sesión.
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

// ============================================================
// Sincronización de la cola offline — Misión B2, Secciones 8 a 13
// ============================================================
// ============================================================
// B2.2-D — Cierre Offline-First: reconciliacion por tipo.
// Reutiliza EXCLUSIVAMENTE las funciones de refresco ya existentes
// (refrescarProductos, refrescarStockYSelects, refrescarTransferencias,
// refrescarVales, refrescarVentas) y _cache / withCache / refrescarPanel
// Pendientes. NO crea otra caché ni otro sistema de sincronizacion.
//
// REVISION DE COSTE: antes se llamaba a refrescarStockYSelects() (que internamente
// hace refrescarProductos = 3 consultas + 1 de stock = 4 consultas) y a los
// refrescos de historial UNA VEZ POR OPERACION dentro del bucle de
// sincronizarCola. Con N operaciones eso eran N*4..5 consultas a Supabase,
// mas el refresco global del finally (otras 4). La proyeccion local ya se
// actualiza por operacion via refrescarOperacionesPendientesCache (saca la op
// al marcarla REQUIERE_ATENCION o eliminarla), asi que no hace falta refrescar
// los datos reales del backend despues de CADA operacion: basta con hacerlo
// una sola vez al final, consolidando segun los tipos que se resolvieron.
//
// Modelo marcar-y-consolidar (sin nueva caché, sin nueva arquitectura):
//   - marcarRefrescoPendiente(categoria): anota en un Set qué categorias de
//     refresco hacen falta segun el tipo/resultado de cada operacion resuelta.
//   - consolidarRefrescosPendientes(): ejecuta una sola vez cada refresco
//     necesario al final de la sincronizacion, respetando dependencias.
// Comportamiento funcional identico al anterior (los mismos datos se
// refrescan); solo cambia cuantas veces: de N+1 a 1.
// ============================================================

// Set de categorias de refresco pendientes de consolidar al final de la
// sincronizacion. Se resetea al empezar sincronizarCola. No es una caché de
// datos: es solo una marca de "que hay que refrescar". Se vacia al consolidar.
// Categorias posibles: "stock" (productos+almacenes+stock via
// refrescarStockYSelects), "productos" (solo refrescarProductos, cuando la
// unica operacion exitosa fue crear producto y no mueve stock), y los
// historiales "transferencias", "vales", "ventas".
let _refrescosPendientes = null;

function marcarRefrescoPendiente(categoria) {
  if (!_refrescosPendientes) return; // sin sincronizacion en curso: ignorar
  _refrescosPendientes.add(categoria);
}

// Anota que refrescos hacen falta segun el tipo/resultado de la operacion
// resuelta. NO ejecuta ningun refresco (eso lo hace consolidar al final).
// resultado: "exito" | "negocio". No se llama para error de red (la op vuelve
// a PENDIENTE y mantiene su proyeccion).
function reconciliarTrasOperacion(tipo, resultado) {
  switch (tipo) {
    case "producto":
      // Producto nuevo: tras exito hay que traer los productos reales. No
      // mueve stock por si mismo. Tras error de negocio no hay producto real.
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
    case "cuadre":
    case "cuadre_revisar":
      // B7: las operaciones de turnos/cuadres no mueven stock pero
      // afectan la vista de Turnos/Operación. No hay un refresco
      // automático de datos cacheados (se cargan al abrir la pestaña).
      break;
    default:
      marcarRefrescoPendiente("stock");
  }
}

// Ejecuta una sola vez cada refresco marcado, al final de la sincronizacion.
// "stock" (refrescarStockYSelects) ya cubre productos+almacenes+stock; si esta
// marcado, "productos" queda cubierto y no se llama aparte (evita duplicar
// las 3 consultas de refrescarProductos). Los historiales van despues.
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
  } catch (e) {
    // Una reconciliacion fallida no debe romper el estado: ya se logueo el
    // warning; la UI mostrara lo ultimo que tenga en _cache.
    console.warn("[Battlecruiser] Consolidacion de refrescos fallo:", e);
  }
}

let _sincronizando = false;

async function sincronizarCola() {
  // Sección 8/12: protección contra dos sincronizaciones simultáneas.
  if (_sincronizando) return;
  _sincronizando = true;
  // B2.2-D: resetear el set de refrescos pendientes para esta
  // sincronizacion. reconciliarTrasOperacion (llamada por op) solo
  // marca categorias; consolidarRefrescosPendientes (en el finally)
  // las ejecuta una sola vez al final.
  _refrescosPendientes = new Set();
  actualizarIndicadorConexion("sincronizando");
  try {
    // Sección 8: FIFO por creado_en ASC (obtenerOperacionesPorEstado ya
    // ordena así), una operación a la vez, nunca todas en simultáneo.
    const operaciones = await obtenerOperacionesPorEstado("PENDIENTE");

    for (const op of operaciones) {
      if (!navigator.onLine) break; // se perdió la conexión a mitad de la cola

      // Sección 9: al empezar cada intento.
      await actualizarOperacionPendiente(op.id, {
        estado: "SINCRONIZANDO",
        intentos: (op.intentos || 0) + 1,
        ultimo_intento: new Date().toISOString(),
      });

      let error = null;
      try {
        const respuesta = await client.rpc(
          RPC_POR_TIPO[op.tipo],
          Object.assign({}, op.payload, { p_idempotency_key: op.idempotency_key })
        );
        error = respuesta.error;
      } catch (e) {
        error = e;
      }

      if (!error) {
        // Sección 9: éxito → SINCRONIZADA, ya se puede limpiar de la cola.
        await actualizarOperacionPendiente(op.id, { estado: "SINCRONIZADA" });
        // B4: registrar auditoría de la sincronización exitosa (trazabilidad
        // de operaciones que fueron offline y ahora se confirmaron).
        if (typeof registrarAuditoria === "function") {
          registrarAuditoria(op.tipo, "Operación " + (ETIQUETA_TIPO_OP[op.tipo] || op.tipo) + " sincronizada (era offline).", "exito", op.id, op.idempotency_key, null);
        }
        await eliminarOperacionPendiente(op.id);
        await refrescarOperacionesPendientesCache();
        // B2.2-D: reconciliacion por tipo tras exito. Trae los datos
        // reales afectados desde Supabase, actualiza _cache y refresca
        // la UI correspondiente (stock, historial, productos segun tipo).
        // La op ya salio de la proyeccion (refrescarOperacionesPendientesCache);
        // aca se trae la verdad del backend para que la UI no quede con la
        // proyeccion temporal como definitiva.
        await reconciliarTrasOperacion(op.tipo, "exito");
        continue;
      }

      if (esErrorDeRed(error)) {
        // Sección 10: vuelve a PENDIENTE, se detiene y espera a que vuelva
        // Internet — no sigue reintentando ahora mismo.
        await actualizarOperacionPendiente(op.id, {
          estado: "PENDIENTE",
          ultimo_error: error.message || String(error),
        });
        await refrescarOperacionesPendientesCache();
        break;
      }

      // Sección 11: error de negocio real durante la sincronización → queda
      // para revisar a mano, pero la cola sigue con las siguientes.
      if (typeof registrarAuditoria === "function") {
        registrarAuditoria(op.tipo, "Operación " + (ETIQUETA_TIPO_OP[op.tipo] || op.tipo) + " requiere atención: " + (error.message || "error de negocio"), "requiere_atencion", op.id, op.idempotency_key, null);
      }
      await actualizarOperacionPendiente(op.id, {
        estado: "REQUIERE_ATENCION",
        ultimo_error: error.message || String(error),
      });
      await refrescarOperacionesPendientesCache();
      // B2.2-D: la op salio de la proyeccion (queda REQUIERE_ATENCION,
      // fuera del filtro PENDIENTE+SINCRONIZANDO). Se refresca el stock
      // real y los historiales afectados para mostrar la verdad del backend
      // y el conflicto en el panel Pendientes.
      await reconciliarTrasOperacion(op.tipo, "negocio");
    }
  } finally {
    _sincronizando = false;
    await actualizarContadorColaPendiente();
    // B2.2-D (revision de coste): consolidar los refrescos marcados
    // durante el bucle en una sola pasada al final, en vez del
    // refresco global por operacion + el global del finally. La
    // proyeccion local ya se actualizo por operacion arriba
    // (refrescarOperacionesPendientesCache); aca se trae la verdad
    // del backend una sola vez segun los tipos resueltos.
    await consolidarRefrescosPendientes();
    actualizarIndicadorConexion();
  }
}

// ============================================================
// Indicador de conexión — Sesión 15 (básico), ampliado en la Sesión 22
// para reflejar cuándo se están mostrando datos guardados (ver withCache
// arriba) y para disparar un refresco automático de todo al reconectar.
// Actualiza a la vez el indicador de la pantalla de login y el del panel
// principal (agregado esta sesión en el header, ver index.html).
// ============================================================
// Cuenta, sobre TODAS las claves ya consultadas en esta sesión de la app,
// cuántas están en cada uno de los 3 estados offline. Se usa para decidir
// el texto del indicador global (no hay un solo "offline": puede ser
// "tengo datos guardados para mostrar" o "todavía no tengo nada").
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
    // Misión B2: sincronizando la cola de escrituras pendientes con el RPC.
    clase = "reconectando";
    texto = "🔄 Sincronizando…";
  } else if (estadoForzado === "reconectando") {
    clase = "reconectando";
    texto = "🔄 Reconectando…";
  } else if (estaRealmenteDesconectado()) {
    clase = "offline";
    const { conDatos, sinCache } = resumenEstadoCache();
    if (conDatos > 0) {
      // Al menos una pantalla tiene datos guardados reales para mostrar.
      texto = "🔴 Sin conexión — usando caché";
      mostrarTooltip = true;
    } else if (sinCache > 0) {
      // Ya se intentó cargar algo y no había nada guardado todavía (primera
      // vez sin conexión en este dispositivo) — distinto de "no hay datos"
      // real, así que el texto lo dice explícito.
      texto = "🔴 Sin conexión — sin datos guardados";
    } else {
      // Todavía no se consultó nada en esta sesión (ej. recién se abrió el
      // login sin conexión), o todo lo consultado está confirmado vacío.
      texto = "🔴 Sin conexión";
    }
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
// hora de la última vez que se guardó algo en caché. Sesión 22 solo miraba
// "productos"; Sesión 23 lo cambia para mirar TODAS las claves cacheadas
// principales y mostrar la más reciente, porque no siempre "productos" es
// la que se actualizó último (ej. se entró directo a la pestaña Almacenes).
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
  // Misión B2, Sección 12: al reconectar, primero sincronizar la cola de
  // escrituras pendientes (sincronizarCola ya se protege sola contra una
  // segunda sincronización simultánea) y DESPUÉS el refresco general que ya
  // existía (Sección 22 original) — se mantiene igual que antes, sin
  // condicionarlo a que haya habido algo para sincronizar.
  async function alReconectar() {
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

// ============================================================
// Sesión 9-11 — Productos, Almacenes, Transferencias, Vales de salida
// Lecturas: consultas directas a las tablas (protegidas por RLS/tiene_permiso).
// Escrituras que mueven stock: siempre vía RPC atómica en el servidor
// (registrar_compra, registrar_transferencia, registrar_vale_salida) —
// nunca .update() directo del cliente sobre "stock" (regla dura, Sección 5).
// ============================================================

function setMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "msg " + (ok ? "ok" : "error");
}

// ---- Traducir errores técnicos de red a un mensaje claro — Sesión 16 ----
// Las Sesiones 14/15 corrigieron la CAUSA del "Failed to fetch" al cambiar la
// contraseña, pero ese texto crudo en inglés podía seguir apareciendo tal
// cual en CUALQUIER otra escritura (crear producto, registrar compra, crear
// almacén, transferir, registrar vale) si la conexión fallaba justo en ese
// momento — el mensaje técnico nunca se traducía ahí. Ahora todas las
// pantallas pasan el error por esta función antes de mostrarlo: si es un
// problema de red/tiempo de espera se explica en español simple, y para
// cualquier otro error (por ejemplo uno propio de una regla del negocio) se
// deja pasar el mensaje original, que sí suele ser útil. El error técnico
// completo siempre queda en la consola para poder depurarlo después.
function explicarError(error, contexto) {
  console.error("[Battlecruiser]" + (contexto ? " (" + contexto + ")" : ""), error);
  const msg = ((error && error.message) || "").toLowerCase();
  if (!navigator.onLine || msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("timeout")) {
    return "Sin conexión o la red está lenta ahora mismo. Intenta de nuevo en un momento.";
  }
  return (error && error.message) || "Ocurrió un error inesperado.";
}

// ---- Pestaña Resumen — Sesión 15 (nueva) ----
// No es una tabla más: junta lo que ya se trae en las otras 4 pantallas
// (productos, almacenes, stock, transferencias, vales) en una vista de un
// vistazo — cantidad de productos/almacenes, qué está bajo el mínimo, y los
// últimos movimientos de stock (transferencias + vales mezclados por fecha).
// No agrega tablas nuevas en Supabase: todo sale de las mismas consultas que
// ya se hacían, cacheadas acá para no duplicar llamadas a la base.
const _cache = { productos: [], almacenes: [], stock: [], transferencias: [], vales: [], ventas: [] };

// ============================================================
// B2.3 — CENTRO DE CONTROL OPERACIONAL
// ============================================================
// Capa de lectura/acción sobre la infraestructura Offline-First ya
// existente. NO crea una segunda cola, ni un store IndexedDB nuevo, ni una
// caché nueva, ni un sistema de sincronización paralelo, ni permisos
// paralelos, ni RPC duplicados. Todo el estado se deriva de:
//   - operaciones_pendientes (IndexedDB, vía obtenerOperacionesVisiblesPanel);
//   - _cache (productos/almacenes/stock/transferencias/vales/ventas);
//   - _conectividadReal / navigator.onLine / _estadoCacheClaves;
//   - _sincronizando (mutex de sincronización único).
// Las acciones reutilizan reintentarOperacionPendiente(),
// eliminarOperacionPendienteConfirmada(), mostrarDetalleOperacion(),
// sincronizarCola() y la navegación por tabs ya existente.
//
// Regla fundamental (B2.3-A): el estado mostrado deriva de datos reales.
// Nunca "Operativo" si hay REQUIERE_ATENCION. Nunca "Sincronizado" si hay
// pendientes. Conectividad y sincronización son estados distintos.
// ============================================================

// B2.3-G: novedades vistas (Set en memoria, NO persistente). "Visto" ≠
// "resuelto": marcar visto solo quita el realce visual de "nuevo" (punto
// rojo), nunca borra el dato ni cambia el estado real de la operación.
// Al recargar la app el Set arranca vacío: las novedades vuelven a
// resaltarse hasta que el usuario las mire otra vez — exactamente lo que
// pide B2.3-G ("desaparecer visualmente sin borrar el dato original").
// _novedadesVistas se declara al inicio del archivo (B2.3-G).

// B2.3-H: jerarquía visual única. Cada asunto del Centro de Atención
// recibe una prioridad derivada de su estado real, no inventada.
//   critico  → REQUIERE_ATENCION (problema que requiere acción).
//   atencion → PENDIENTE o SINCRONIZANDO (seguimiento, no error).
//   normal   → actividad correcta / sincronización completada.
function prioridadAsunto(estado) {
  switch (estado) {
    case "REQUIERE_ATENCION": return "critico";
    case "PENDIENTE":
    case "SINCRONIZANDO": return "atencion";
    default: return "normal";
  }
}

// B2.3-A: estado operacional global derivado de datos reales. Devuelve
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

// B2.3-B: construye la lista de asuntos que requieren atención/acción,
// ordenada por prioridad (critico primero). Cada asunto envuelve una
// operación de la cola real y lleva su prioridad y si fue vista o no.
// Reutiliza obtenerOperacionesVisiblesPanel() (única fuente de la cola).
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

// B2.3-L: actividad reciente compacta. Reutiliza _cache
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

// B2.3-K: stock bajo reutilizando _cache.stock. La proyección usa
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
// B2.3-E/B2.3-F: vive en la pestaña "Resumen" (pantalla inicial
// post-login), reutilizando el panel que ya existía, ampliado. No hay
// roles reales en el proyecto todavía (no existe user_metadata.role ni un
// RPC de roles): la vista es la misma para todo usuario autenticado y NO
// se inventa una distinción admin/trabajador que el backend no respalda.
// Ver documentación de limitaciones al final del archivo.

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
      ? new Date(op.creado_en).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
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
    // B2.3-G: marcar visto al renderizarlo visible. El realce "nuevo"
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
    const fechaTxt = m.fecha ? new Date(m.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
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
    // B2.3-K: proyección local reutilizando ajustePendiente (autoridad
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
  // B2.3-P: botón para ir a Inventario (almacenes). Evita botón muerto.
  const ir = document.createElement("button");
  ir.type = "button";
  ir.className = "cc-accion cc-ir-inventario-btn";
  ir.textContent = "Ver inventario";
  el.appendChild(ir);
}

// Orquestador único del Centro de Control. Lee la cola una sola vez
// (obtenerOperacionesVisiblesPanel, transacción IndexedDB única), deriva
// todo el estado y pinta. NO hace consultas Supabase extra: reutiliza lo
// que _cache ya tiene cargado. Se llama desde refrescarPanelPendientes y
// desde los hooks existentes cuando cambia el estado de la cola.
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

// B2.3-G: badge de novedades en la pestaña "Resumen". Punto rojo cuando
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

// B2.3-C/P: acciones contextuales y navegación. Reutilizan las funciones
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
  // comercial real del negocio: ventas recientes. Reutiliza _cache.ventas
  // (ya cargado por refrescarVentasHistorial) — no hace consultas nuevas ni
  // agrega caché/cola nueva. Antes la pantalla principal del POS no mostraba
  // ni el monto ni la cantidad de ventas, pese a que _cache.ventas ya existía
  // y el Centro de Mando sí las usaba.
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
      // botón que lleva directo al Inventario (donde se ve el stock enriquecido
      // y se puede actuar). Reutiliza irATab() + navegación existente. No hace
      // consultas nuevas: pinta desde _cache.stock.
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
        div.innerHTML = `<span>${s.productos.nombre} <span class="muted">· ${s.almacenes.nombre}</span></span>
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
  // B2.3: el Centro de Control reutiliza _cache (mismo objeto) para su
  // actividad reciente e inventario. Cuando _cache cambia, refrescar el
  // Centro tambien. No hace consultas nuevas: solo pinta desde _cache.
  if (typeof refrescarCentroControl === "function") refrescarCentroControl();
}

// R3: helper de navegación reutilizable. Activa un tab por data-tab usando
// el listener existente (click en .tab-btn). Reutiliza el patrón que ya usaban
// cc-ir-pendientes-btn / cc-ir-inventario-btn / abrirSoporte, sin duplicar
// lógica de navegación ni crear un segundo sistema de routing.
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
    // Mision B2.2-B.3.1: al entrar a la pestaña Pendientes, refrescar
    // el panel para mostrar el estado actual de la cola (una sola
    // lectura, solo cuando hace falta).
    if (btn.dataset.tab === "pendientes") {
      refrescarPanelPendientes();
    } else if (btn.dataset.tab === "resumen") {
      // B2.3: al entrar al Centro de Control (pestaña Resumen),
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
      // B3.10: al entrar a Usuarios, mostrar el contexto actual y la lista.
      const infoEl = document.getElementById("usuario-actual-info");
      if (infoEl && typeof _usuarioActual !== "undefined" && _usuarioActual) {
        infoEl.textContent = "Sesión: " + (_usuarioActual.nombre || "") + (_usuarioActual.rol ? " · " + _usuarioActual.rol : "");
      }
      if (typeof refrescarUsuarios === "function") refrescarUsuarios();
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
// Pedido de Roberto: cerrado por defecto, un botón para abrirlo (hamburguesa
// en el header) y otro para cerrarlo (✕ dentro del panel), sin tapar
// contenido de forma permanente. Se cierra tocando el backdrop, con Escape,
// o automáticamente al elegir una sección (así nunca hay que cerrarlo a mano
// después de navegar).
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

// Sesión 22: las 3 lecturas de abajo pasan por withCache — con Internet
// consultan Supabase como siempre y guardan el resultado en IndexedDB; sin
// Internet, devuelven lo último guardado (o [] si nunca se guardó nada
// para esa clave todavía en este dispositivo).
async function cargarCategorias() {
  return withCache("categorias", () => client.from("categorias").select("id, nombre").order("nombre"));
}

async function cargarAlmacenes() {
  return withCache("almacenes", () => client.from("almacenes").select("id, nombre, tipo").order("nombre"));
}

async function cargarProductos() {
  return withCache("productos", () => client
    .from("productos")
    .select("id, nombre, unidad, precio_normal, precio_mayorista, categorias(nombre), presentaciones(nombre)")
    .order("nombre"));
}

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
  // blanco (fillSelect sin keepFirst), así que tras cada refresco queda
  // apuntando a algún producto real — el selector de presentación se
  // vuelve a sincronizar con ese producto para no dejar seleccionada una
  // presentación que ya no le corresponde (Sesión 28).
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
    productos.forEach((p) => {
      const div = document.createElement("div");
      div.className = "lista-item";
      div.innerHTML = `<span>${p.nombre} <span class="muted">${p.categorias ? "· " + p.categorias.nombre : ""}${p.presentaciones ? " · " + p.presentaciones.nombre : ""}</span></span>
        <span class="muted">Normal $${money(p.precio_normal)} · Mayorista $${money(p.precio_mayorista)}</span>`;
      lista.appendChild(div);
    });
  }

  return { productos, almacenes };
}

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

    // Misión B2.2-B.2: ya no hay INSERT directo a public.productos — pasa
    // por la misma cola offline central que compra/venta/transferencia/vale
    // (ejecutarOperacion), usando el RPC crear_producto (ver RPC_POR_TIPO).
    // El payload son EXACTAMENTE los parámetros de crear_producto, sin
    // p_idempotency_key (eso lo agrega ejecutarOperacion/sincronizarCola).
    submitBtn.disabled = true;
    const resultado = await ejecutarOperacion("producto", {
      p_nombre: nombre,
      p_categoria_id: categoria_id,
      p_unidad: unidad,
      p_precio_normal: precio_normal,
      p_precio_mayorista: precio_mayorista,
    });
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-productos", "No se pudo crear: " + explicarError(resultado.error, "crear producto"), false);
      return;
    }
    e.target.reset();
    if (resultado.offline) {
      // Sección "IMPORTANTE SOBRE UX" de la misión: respuesta inmediata de
      // que quedó pendiente, sin inventar un producto definitivo en
      // Supabase ni un UUID definitivo. No se agrega ninguna proyección
      // local de "productos" (a diferencia de la proyección de stock ya
      // existente en ajustePendiente/_operacionesPendientesCache): eso
      // pertenece a B2.2-B.3, fuera de alcance acá.
      setMsg("msg-productos", "✓ Guardado localmente — se sincronizará al recuperar conexión.", true);
      return;
    }
    setMsg("msg-productos", "Producto creado.", true);
    await refrescarProductos();
  });
});

// ---- Presentación en "Registrar compra" — Sesión 28 ----
// Reutiliza cargarAsociacionesProducto() (ya existente, sección de
// Presentaciones comerciales) para el selector de "Registrar compra" en
// vez de duplicar la consulta. Cache propio (_compraAsociacionesCache)
// separado de _asociacionesProductoCache porque son dos <select> de
// producto independientes (el de compra y el del panel de Presentaciones
// por producto) que no deben pisarse entre sí.
//
// Modo legacy (opción "Sin presentación / Unidad base", value=""):
// p_presentacion_id = null, p_cantidad_presentacion = null, "Cantidad"
// sigue significando unidades base — comportamiento idéntico al de antes.
//
// Modo presentación: "Cantidad" pasa a significar cantidad de
// presentaciones (entero ≥ 1); el factor de conversión (1 Caja = 24
// unidades, etc.) nunca lo escribe el usuario, sale de
// producto_presentaciones.factor ya cargado. El cálculo de equivalencia
// en unidades base que se muestra en el resumen es solo visual — la
// autoridad real de inventario sigue siendo el backend
// (obtener_conversion_presentacion dentro de registrar_compra).
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

// ============================================================
// Presentaciones comerciales — dentro de Productos. Un producto puede
// tener varias presentaciones (unidad, paquete, caja…), cada una con su
// propio factor de conversión a unidades base
// (producto_presentaciones.factor). La columna legacy
// productos.presentacion_id NO se toca acá: es solo para productos viejos
// que ya la tenían cargada antes de este modelo; el formulario de crear
// producto ya no la usa.
//
// El backend (RLS + tiene_permiso + obtener_conversion_presentacion) es
// quien realmente protege estas operaciones — acá solo se refleja el
// resultado de tiene_permiso('presentaciones', <accion>) para mostrar u
// ocultar botones, nunca como sustituto de esa protección real.
// ============================================================

let _permisosPresentaciones = { ver: true, crear: false, editar: false, borrar: false };
let _presentacionesCache = [];
let _asociacionesProductoCache = [];
let _productoPresentacionesActual = null;

function formatFactor(n) {
  const v = Number(n);
  return Number.isFinite(v) ? String(v) : String(n);
}

// Sesión 22: sin conexión no tiene sentido preguntarle al servidor qué
// puede escribir el usuario — se responde de una sin intentar la red,
// mostrando todo en modo solo-lectura (ver, sí; crear/editar/borrar, no)
// hasta reconectar. La cola de sincronización de escrituras (que sí
// necesitaría saber esto de antemano, cacheado) es la etapa siguiente.
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

// ---- Factor de presentación conocido, para la proyección local — Misión
// B2.1, Partes 1/2/14 ----
// Espejo síncrono en memoria de los factores ya vistos en
// producto_presentaciones, alimentado únicamente por cargarAsociacionesProducto
// de acá abajo (que ya pasa por withCache — la misma caché offline existente
// de asociaciones por producto; esto NO es una caché nueva, solo un acceso
// rápido y síncrono a datos que esa consulta ya trajo). La proyección local de
// stock (ajustePendiente, más abajo) necesita el factor de forma síncrona para
// no volver asíncrona toda la cadena de obtenerStockDisponible /
// actualizarStockDisponibleUI.
//
// Si una compra pendiente usa una presentación cuyo factor NUNCA se cargó en
// este dispositivo (ej. otra pestaña/dispositivo la creó, o se recargó la app
// sin volver a abrir el selector de esa presentación), acá simplemente no va a
// estar — y ajustePendiente debe marcar la proyección como NO CALCULABLE en
// vez de inventar un factor (Parte 2 de la misión).
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
      <span>${p.nombre}${p.activo ? "" : ' <span class="muted">· Inactiva</span>'}</span>
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
      <span>${pp.presentaciones.nombre} <span class="muted">× ${formatFactor(pp.factor)}</span>${pp.activo ? "" : ' <span class="muted">· Inactiva</span>'}</span>
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
        <input type="text" class="pres-editar-input" value="${p.nombre.replace(/"/g, "&quot;")}">
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
        <span>${pp.presentaciones.nombre} ×</span>
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

async function refrescarAlmacenes() {
  setLoading("lista-almacenes", "Cargando almacenes…");
  const almacenes = await cargarAlmacenes();
  _cache.almacenes = almacenes;
  renderResumen();
  const lista = document.getElementById("lista-almacenes");
  if (almacenes.length === 0) {
    setEmpty("lista-almacenes", mensajeListaVacia("almacenes", "Todavía no hay almacenes cargados."));
  } else {
    lista.innerHTML = "";
    almacenes.forEach((a) => {
      const div = document.createElement("div");
      div.className = "lista-item";
      div.innerHTML = `<span>${a.nombre}</span><span class="muted">${a.tipo === "venta" ? "Venta (precio normal)" : "Almacén / mayorista"}</span>`;
      lista.appendChild(div);
    });
  }

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
  const lista = document.getElementById("lista-stock");
  if (!stock || stock.length === 0) {
    setEmpty("lista-stock", mensajeListaVacia("stock", "Todavía no hay stock cargado."));
    return;
  }
  lista.innerHTML = "";
  stock.forEach((s) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    const bajo = s.minimo != null && s.cantidad <= s.minimo;
    div.innerHTML = `<span>${s.productos.nombre} <span class="muted">· ${s.almacenes.nombre}</span></span>
      <span class="muted" style="${bajo ? "color:var(--ember)" : ""}">${money(s.cantidad)}${bajo ? " ⚠ bajo mínimo" : ""}</span>`;
    lista.appendChild(div);
  });
}

safeInit("form-almacen", () => {
  document.getElementById("form-almacen").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("alm-nombre").value.trim();
    const tipo = document.getElementById("alm-tipo").value;
    const submitBtn = e.target.querySelector("button[type='submit']");

    submitBtn.disabled = true;
    const { error } = await client.from("almacenes").insert({ nombre, tipo });
    submitBtn.disabled = false;

    if (error) { setMsg("msg-almacenes", "No se pudo crear: " + explicarError(error, "crear almacén"), false); return; }
    setMsg("msg-almacenes", "Almacén creado.", true);
    e.target.reset();
    await refrescarAlmacenes();
    await refrescarStockYSelects();
  });
});

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
// _cache.transferencias en memoria segun _trfBusqueda (sin consultas nuevas,
// sin tocar _cache). Cada fila es accionable (click/Enter abre el detalle
// real con auditoria). Muestra ID corto + contador + estado sin resultados.
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
    div.innerHTML = `<span>${t.origen ? t.origen.nombre : "—"} → ${t.destino ? t.destino.nombre : "—"} <span class="muted">· #${t.id ? idCorto(t.id) : "—"}</span></span>
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
// memoria segun _valesBusqueda (sin consultas nuevas, sin tocar _cache).
// Cada fila es accionable (click/Enter abre el detalle real) e incluye
// indicacion visual por tipo (borde color). ID corto + contador.
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
    div.innerHTML = `<span>${v.productos ? v.productos.nombre : "—"} <span class="muted">· ${v.almacenes ? v.almacenes.nombre : "—"} · #${v.id ? idCorto(v.id) : "—"}</span></span>
      <span class="muted">${fechaCorta(v.fecha)} · ${escHtml(v.tipo || "")} · ${money(v.cantidad)}</span>`;
    lista.appendChild(div);
  });
  actualizarContador("vales-contador", filtradas.length, todas.length);
}

// ============================================================
// R11 / R12 / R6-R7 — Detalle accionable + auditoría de movimientos
// ============================================================
// Reutilizan _cache (única fuente, no se modifica) y el patrón visual de
// #pendiente-detalle (.detalle-cabecera/.detalle-cuerpo/.detalle-fila).
// Solo muestran datos reales que existen en la consulta actual.

// R11: detalle accionable de una transferencia. Datos reales: id, fecha,
// estado, origen, destino. No consulta nada nuevo (offline-first intacto).
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
  const fechaHora = trf.fecha ? new Date(trf.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
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
  const fechaHora = vale.fecha ? new Date(vale.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
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
// (única fuente, no se modifica) para los datos base y, si hay conexión,
// consulta las líneas reales vía reporte_ventas (RPC ya existente). La
// auditoría calcula SUMA_DE_LINEAS (suma de subtotales reales) y la compara
// contra TOTAL_REGISTRADO con tolerancia de centavos. No modifica la venta.
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
  const fechaHora = venta.fecha ? new Date(venta.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
// subtotales reales) y la compara contra TOTAL_REGISTRADO con tolerancia
// de un centavo. Estados visuales derivados de datos reales (no almacena):
//   - TOTAL COINCIDE (verde)
//   - DIFERENCIA DETECTADA (naranja) + monto de la diferencia
//   - SIN LÍNEAS DISPONIBLES (gris)
//   - LÍNEAS NO DISPONIBLES SIN CONEXIÓN (azul)
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

// ============================================================
// Sesión 18 — Ventas
// El precio se decide SOLO en el servidor (RPC registrar_venta) según el
// tipo del almacén elegido — el cliente calcula el mismo precio nada más
// para mostrarlo antes de confirmar, pero nunca lo envía: la función
// vuelve a resolverlo del lado del servidor. El descuento de stock (FIFO
// sobre lotes_compra) ocurre de forma atómica dentro del RPC, con el mismo
// patrón que registrar_compra/registrar_transferencia/registrar_vale_salida
// — nunca con un update directo del cliente sobre "stock".
// ============================================================

let ventaLineas = [];
let ventaAlmacenesTipo = {}; // id -> 'venta' | 'mayorista'
let ventaProductosPrecios = {}; // id -> { nombre, precio_normal, precio_mayorista }
let ventaProductosLista = []; // lista completa de productos, para el buscador

// ---- Stock disponible para el carrito — Sesión 20 ----
// Reutiliza _cache.stock, que ya carga y mantiene refrescarStockYSelects()
// (la misma fuente que usan Resumen y la pestaña Almacenes). No se agrega
// ninguna consulta nueva a Supabase: solo se lee lo que ya está en memoria.
// Misión B2, Sección 16: el número real cacheado ajustado por el efecto de
// las operaciones todavía no confirmadas (ver ajustePendiente más arriba) —
// nunca negativo. El backend sigue siendo la autoridad real; esto es solo
// para que la venta pueda seguir funcionando de forma aproximada sin
// Internet, igual que antes cuando no hay ninguna operación pendiente
// (ajustePendiente devuelve 0 y el resultado es idéntico al de antes).
// Misión B2.1: devuelve { valor, ajuste, noCalculable } en vez de un número
// suelto — ver ajustePendiente. "valor" sigue siendo la mejor aproximación
// posible (stock real + lo que SÍ se pudo calcular); "noCalculable" avisa que
// falta información para que la cifra sea exacta, sin bloquear la venta (el
// backend sigue siendo la autoridad real al sincronizar).
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
    // Misión B2.1, Partes 2/14: hay una compra pendiente con presentación
    // cuyo factor no está disponible en la caché local — no se inventa un
    // número. Se muestra lo que sí se sabe (stock real + lo demás que sí se
    // pudo calcular) y se avisa que puede quedar corto, sin bloquear la
    // venta (max sin fijar) porque el backend es la autoridad real.
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
        <span>${linea.nombre}</span>
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

// ---- Buscador de productos — Sesión 20 ----
// Filtra en el cliente sobre la misma lista que ya trae refrescarVentas()
// (ventaProductosLista); no agrega ninguna consulta nueva. Reutiliza
// fillSelect(), la misma función que arma el resto de los <select> de la app.
safeInit("venta-producto-buscar", () => {
  const buscarInput = document.getElementById("venta-producto-buscar");
  const productoSelect = document.getElementById("venta-producto");

  buscarInput.addEventListener("input", () => {
    const termino = buscarInput.value.trim().toLowerCase();
    const filtrados = termino
      ? ventaProductosLista.filter((p) => p.nombre.toLowerCase().includes(termino))
      : ventaProductosLista;
    fillSelect(productoSelect, filtrados, "id", (p) => p.nombre, true);
    actualizarStockDisponibleUI();
  });
});

safeInit("form-venta-linea", () => {
  const form = document.getElementById("form-venta-linea");
  const almacenSelect = document.getElementById("venta-almacen");
  const productoSelect = document.getElementById("venta-producto");
  const cantidadInput = document.getElementById("venta-cantidad");

  // La venta entera pertenece a un solo almacén (el RPC recibe un único
  // almacén de cabecera): si ya hay líneas cargadas y se cambia el
  // almacén, se vacía el carrito para no dejar precios de un almacén
  // distinto al que finalmente se va a confirmar.
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

    const tipo = ventaAlmacenesTipo[almacen_id];
    const producto = ventaProductosPrecios[producto_id];
    if (!producto) { setMsg("msg-venta-linea", "Producto no encontrado.", false); return; }

    const precio = tipo === "mayorista" ? producto.precio_mayorista : producto.precio_normal;
    if (precio === null || precio === undefined) {
      setMsg("msg-venta-linea", "Este producto no tiene precio mayorista configurado.", false);
      return;
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
      return;
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
    cantidadInput.value = "";
    productoSelect.value = "";
    buscarInputReset();
    actualizarStockDisponibleUI();
    renderVentaLineas();
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
// listener delegado por lista. El estado vive en variables locales de pestana
// (_ventasBusqueda/_trfBusqueda/_valesBusqueda): NO es una segunda cache global.
// _cache sigue siendo la unica fuente; la busqueda solo filtra lo que se pinta.
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
  const [productos, almacenes] = await Promise.all([cargarProductos(), cargarAlmacenes()]);

  ventaAlmacenesTipo = {};
  almacenes.forEach((a) => { ventaAlmacenesTipo[a.id] = a.tipo; });

  ventaProductosPrecios = {};
  productos.forEach((p) => {
    ventaProductosPrecios[p.id] = {
      nombre: p.nombre, precio_normal: p.precio_normal, precio_mayorista: p.precio_mayorista,
    };
  });

  ventaProductosLista = productos;
  const buscarInput = document.getElementById("venta-producto-buscar");
  if (buscarInput) buscarInput.value = "";

  fillSelect(document.getElementById("venta-almacen"), almacenes, "id", (a) => a.nombre, true);
  fillSelect(document.getElementById("venta-producto"), productos, "id", (p) => p.nombre, true);
  renderVentaLineas();
  actualizarStockDisponibleUI();
  await refrescarVentasHistorial();
}

// R5: estado de busqueda del historial de ventas en memoria. Patron
// identico a _invFiltroEstado/_movPagina: estado local de pestana, NO una
// segunda cache global. _cache.ventas sigue siendo la unica fuente de
// datos completos; este termino solo filtra lo que se pinta en la lista.
let _ventasBusqueda = "";

// ---- Historial de ventas — Sesión 19 ----
// Solo lectura: la tabla "ventas" ya se llena de forma atómica dentro del RPC
// registrar_venta (Sección 5 — nunca desde el cliente). Mismo patrón de
// listado que refrescarTransferencias/refrescarVales: últimas 20, más nuevas
// primero.
async function refrescarVentasHistorial() {
  setLoading("lista-ventas", "Cargando ventas…");
  const { data } = await client
    .from("ventas")
    .select("id, fecha, total, almacenes(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);

  // B2.3: guardar en _cache.ventas (unica cache del proyecto) para que el
  // Centro de Control muestre ventas en la actividad reciente. No es una
  // segunda cache: _cache ya existia con transferencias/vales; ventas solo
  // no se guardaba aca porque el Resumen viejo no las usaba.
  _cache.ventas = data || [];
  renderResumen();
  // R5: el render aplica el filtro de busqueda sobre _cache.ventas sin
  // modificarlo. Si _cache.ventas esta vacio, muestra el estado vacio.
  renderVentasHistorial();
}

// R5: render del historial de ventas accionable. Filtra _cache.ventas en
// memoria segun _ventasBusqueda (sin consultas nuevas, sin tocar _cache.ventas).
// Cada fila muestra el ID corto (referencia buscable), almacén, fecha y total.
// Incluye contador "Mostrando X de Y" y estado sin resultados claro.
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
    div.innerHTML = `<span>${v.almacenes ? v.almacenes.nombre : "—"} <span class="muted">· #${v.id ? idCorto(v.id) : "—"}</span></span>
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

// ============================================================
// Sesión 21 — Pestaña "Configuración": Categorías, Unidades de medida y
// Formas de presentación. Los 3 catálogos comparten la misma regla de
// negocio: se pueden crear valores nuevos y activar/desactivar los
// existentes, pero NUNCA se borran físicamente (podrían estar en uso en
// productos ya cargados). Productos y Almacenes ya tienen su propio flujo
// con más campos y no se tocan; este es un helper genérico para no repetir
// el mismo CRUD simple 3 veces.
// ============================================================
function initCatalogoSimple({ tabla, formId, inputId, listaId, singular }) {
  safeInit("catalogo-" + tabla, () => {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const lista = document.getElementById(listaId);

    // Sesión 23 — bug real encontrado: esta lista consultaba la tabla
    // directo con client.from(), sin pasar por withCache como el resto de
    // las pantallas. Con Internet andaba bien, pero sin conexión el error
    // de red no tenía ningún fallback: setLoading dejaba "Cargando…" puesto
    // y la función cortaba en el "return" del error, así que el panel de
    // Configuración quedaba mostrando "Cargando…" para siempre en vez de
    // caer a los datos guardados (o al mensaje de "sin datos todavía").
    // Ahora usa la misma clave de caché que cargarCategorias() (que ya
    // alimentaba los selectores de Productos), así que "categorias" tiene
    // una única caché compartida en vez de dos consultas separadas a la
    // misma tabla con distinto comportamiento offline.
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
        div.innerHTML = `<span>${row.nombre} ${row.activo ? "" : '<span class="muted">· inactivo</span>'}</span>
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

// ============================================================
// B3 — SISTEMA OPERACIONAL DE USUARIOS, ROLES, PERMISOS Y CONTROL
// ============================================================
// Reutiliza la arquitectura real de Supabase: tablas `usuarios`, `roles`,
// `permisos` y `public.tiene_permiso(p_seccion, p_accion)`. NO crea un
// segundo sistema de roles/permisos. NO crea una segunda cola/caché.
//
// Las RPC administrativas (perfil_usuario_actual, permisos_usuario_actual,
// listar_usuarios_admin, listar_roles_admin, permisos_por_rol,
// asignar_rol_usuario, cambiar_estado_usuario, usuario_esta_activo) están
// definidas en supabase/b3-roles-permisos.sql (SECURITY DEFINER, search_path
// fijo, protegidas con tiene_permiso). El frontend las llama; si aún no se
// aplicaron, el contexto degrada con mensajes claros (no inventa datos).
//
// Seguridad: la autorización REAL está en el backend (RLS + tiene_permiso
// dentro de cada RPC). El frontend solo refleja permisos para UX; ocultar
// un botón NO es seguridad. Un usuario que manipule el frontend no puede
// ejecutar operaciones protegidas sin el permiso real.
// ============================================================

// ---- B3.2: contexto centralizado del usuario actual ----
// Una sola fuente para saber quién usa la app. Evita cargarUsuario() /
// cargarRol() / cargarPermisos() dispersos. Se carga una vez por sesión
// y se revalida al reconectar. Offline: usa el último contexto conocido
// para permitir navegación, pero las operaciones protegidas validan online.
// _usuarioActual, _permisosEfectivos, _cargandoUsuario se
// declaran al inicio del archivo (B3.2) para evitar TDZ.

// B3.18: tras logout, el contexto se limpia SIEMPRE (ver limpiarContextoUsuario).
// Los permisos NO se cachean en IndexedDB de forma persistente: viven en
// memoria y se recargan al iniciar sesión, para que un usuario B jamás vea
// permisos de un usuario A anterior (regla anti-contaminación).

// Carga el perfil + permisos del usuario autenticado en UN solo flujo.
// Reutiliza los RPC perfil_usuario_actual() y permisos_usuario_actual().
// Si los RPC no existen todavía (SQL no aplicado), deja _usuarioActual con
// lo mínimo (id/email de Auth) y _permisosEfectivos vacío: la app sigue
// usable con el comportamiento anterior, pero la administración de usuarios
// avisa que falta aplicar el SQL.
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
    // _permisosEfectivos queda vacío y tienePermiso() degrada a true solo
    // para no romper la app existente (la seguridad real sigue en backend).
    // R1: registramos si la carga fue exitosa o fallo por red, para que
    // tienePermiso() no convierta un fallo de red en una falsa autorizacion.
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

// B3.18/B3.19: limpia TODO el contexto específico del usuario al logout.
// No borra cachés globales útiles (productos/stock), solo el contexto de
// identidad/permisos. Evita que el usuario B vea permisos del usuario A.
function limpiarContextoUsuario() {
  _usuarioActual = null;
  _permisosEfectivos = {};
  _permisosCargaExitosa = false;
  _permisosCargaFallidaRed = false;
  _novedadesVistas = new Set();
  // El badge de Centro de Control se resetea para no arrastrar estado.
  const badge = document.getElementById("resumen-tab-badge");
  if (badge) { badge.classList.add("hidden"); badge.textContent = ""; }
  // Reaplicar permisos: sin usuario, todo oculto salvo login.
  aplicarPermisosAInterfaz();
}

// ---- B3.6: capa de autorización frontend ----
// tienePermiso(seccion, accion) reutiliza la matriz de tiene_permiso del
// backend (cargada una vez por sesión vía permisos_usuario_actual).
// Si el SQL de B3 no está aplicado, _permisosEfectivos está vacío: en ese
// caso devuelve true (degradación: la app funciona como antes; la seguridad
// real sigue siendo el backend/RLS). Cuando el SQL está aplicado, refleja
// los permisos reales del rol del usuario.
function tienePermiso(seccion, accion) {
  if (!_usuarioActual) return false; // sin sesión: nada
  if (Object.keys(_permisosEfectivos).length === 0) {
    // Sin matriz cargada. La degradación a true solo es legítima cuando el
    // SQL de B3 no está aplicado todavía (el RPC no existe). En cambio:
    // - Si la carga falló por red (_permisosCargaFallidaRed): un fallo de
    //   conectividad NO debe convertirse en autorización. Devolver false.
    // - Si la carga fue exitosa pero el usuario no tiene permisos
    //   (_permisosCargaExitosa): el backend respondió, no inventar acceso.
    // Solo si ninguna de las dos ocurrió (SQL no aplicado) se conserva la
    // degradación histórica a true para no bloquear la app existente.
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

// ---- B3.7/B3.8: aplicación de permisos a la interfaz ----
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
    // B3: TAB_A_SECCION puede no estar asignado aún si esto se ejecuta
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

// ---- B3.3: validación de usuario activo ----
// Un usuario inactivo no debe operar. El backend lo impide (RLS/tiene_permiso
// validan activo); el frontend lo refleja bloqueando la creación de operaciones.
// REVISIÓN (cierre B3): además del contexto en memoria, cuando hay conexión
// consultamos usuario_esta_activo() para bloqueo REAL (no solo ocultar botones).
// Así, si el estado activo cambió en el backend mientras la sesión estaba
// abierta, la próxima operación online lo detecta. Offline: usamos el último
// contexto conocido (la operación se encola y el backend la validará al sync).
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

// B3.14: al crear una operación offline, conservar usuario_id (ya hace
// crearOperacionPendiente con _usuarioActualId). Aseguramos que
// _usuarioActualId esté sincronizado con el contexto.
function sincronizarUsuarioIdParaOperaciones() {
  if (_usuarioActual && _usuarioActual.id) {
    _usuarioActualId = _usuarioActual.id;
  }
}

// ============================================================
// B3.10 — Administración de usuarios
// ============================================================
// Reutiliza los RPC listar_usuarios_admin, listar_roles_admin,
// permisos_por_rol, asignar_rol_usuario, cambiar_estado_usuario.
// Toda la autorización está en el backend (tiene_permiso('usuarios',*)).

let _usuariosCache = [];
let _rolesCache = [];

async function refrescarUsuarios() {
  if (!tienePermiso("usuarios", "ver")) {
    setEmpty("lista-usuarios", "No tenés permiso para ver usuarios.");
    return;
  }
  setLoading("lista-usuarios", "Cargando usuarios…");
  try {
    const { data, error } = await client.rpc("listar_usuarios_admin", {});
    if (error) {
      // Si el RPC no existe todavía (SQL no aplicado), mensaje claro.
      const msg = String(error.message || error.code || error);
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
  usuarios.forEach((u) => {
    const div = document.createElement("div");
    div.className = "lista-item usuario-item" + (u.activo === false ? " usuario-inactivo" : "");
    const estado = u.activo === false ? "🔴 Inactivo" : "🟢 Activo";
    let acciones = "";
    if (tienePermiso("usuarios", "editar")) {
      acciones = '<span class="usuario-acciones">'
        + '<button type="button" class="cc-accion usr-rol-btn" data-id="' + escHtml(u.id) + '" data-nombre="' + escHtml(u.nombre || "") + '">Cambiar rol</button>'
        + '<button type="button" class="cc-accion usr-estado-btn" data-id="' + escHtml(u.id) + '" data-activo="' + (u.activo !== false ? "true" : "false") + '">' + (u.activo !== false ? "Desactivar" : "Activar") + '</button>'
        + "</span>";
    }
    div.innerHTML = '<span class="usuario-principal">'
      + '<span class="usuario-nombre">' + escHtml(u.nombre || "—") + '</span>'
      + '<span class="muted">Rol: ' + escHtml(u.rol || "—") + ' · ' + estado + '</span>'
      + '</span>' + acciones;
    lista.appendChild(div);
  });
}

async function refrescarRoles() {
  try {
    const { data, error } = await client.rpc("listar_roles_admin", {});
    if (error) { _rolesCache = []; return; }
    _rolesCache = data || [];
  } catch (e) { _rolesCache = []; }
}

// Cambiar rol de un usuario (reutiliza asignar_rol_usuario, protegido en backend).
async function abrirCambiarRol(usuarioId, nombreActual) {
  if (!tienePermiso("usuarios", "editar")) return;
  if (_rolesCache.length === 0) await refrescarRoles();
  if (_rolesCache.length === 0) {
    setMsg("msg-usuarios", "No se pudieron cargar los roles. ¿Está aplicado supabase/b3-roles-permisos.sql?", false);
    return;
  }
  const opciones = _rolesCache.map((r) => r.nombre).join(", ");
  const elegido = window.prompt("Cambiar rol de " + nombreActual + ".\nRoles disponibles: " + opciones + "\n\nEscribí el nombre exacto del rol:");
  if (!elegido) return;
  const rol = _rolesCache.find((r) => r.nombre.toLowerCase() === elegido.trim().toLowerCase());
  if (!rol) {
    setMsg("msg-usuarios", "Ese rol no existe.", false);
    return;
  }
  const { error } = await client.rpc("asignar_rol_usuario", { p_usuario_id: usuarioId, p_role_id: rol.id });
  if (error) {
    setMsg("msg-usuarios", "No se pudo cambiar el rol: " + escHtml(error.message || error.code || error), false);
    return;
  }
  setMsg("msg-usuarios", "Rol actualizado.", true);
  // B4: auditoría del cambio de rol (trazabilidad administrativa).
  if (typeof registrarAuditoria === "function") {
    registrarAuditoria("usuario_rol", "Rol de usuario cambiado a '" + rol.nombre + "'.", "exito", usuarioId, null, null);
  }
  await refrescarUsuarios();
}

// Cambiar estado activo/inactivo (reutiliza cambiar_estado_usuario).
async function cambiarEstadoUsuario(usuarioId, activoActual) {
  if (!tienePermiso("usuarios", "editar")) return;
  const nuevo = activoActual !== true;
  const { error } = await client.rpc("cambiar_estado_usuario", { p_usuario_id: usuarioId, p_activo: nuevo });
  if (error) {
    // B3.12: el backend rechaza desactivar al único Dueño (P0001).
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
    const rolBtn = e.target.closest(".usr-rol-btn");
    if (rolBtn) {
      e.stopPropagation();
      await abrirCambiarRol(rolBtn.dataset.id, rolBtn.dataset.nombre);
      return;
    }
    const estBtn = e.target.closest(".usr-estado-btn");
    if (estBtn) {
      e.stopPropagation();
      await cambiarEstadoUsuario(estBtn.dataset.id, estBtn.dataset.activo === "true");
      return;
    }
  });
});

// B3: exports al window para inspección/tests. NO duplican lógica: solo
// exponen referencias a las variables/funciones ya definidas, para que el
// contexto de usuario sea consultable de forma coherente desde cualquier
// punto (incluida la consola del navegador para depuración).
Object.assign(window, {
  _usuarioActual: function () { return _usuarioActual; },
  _permisosEfectivosRef: function () { return _permisosEfectivos; },
  cargarContextoUsuario,
  limpiarContextoUsuario,
  tienePermiso,
  contextoB3Disponible,
  usuarioPuedeOperar,
  refrescarUsuarios,
  abrirCambiarRol,
  cambiarEstadoUsuario,
});


// ============================================================
// B4 — CENTRO DE MANDO + AUDITORÍA + TRAZABILIDAD OPERATIVA
// ============================================================
// Reutiliza TODO: _usuarioActual/_permisosEfectivos (B3),
// operaciones_pendientes + obtenerOperacionesVisiblesPanel (B2),
// _cache (productos/ventas/transferencias/vales), _sincronizando,
// tienePermiso. NO crea otra cola, store, caché ni sincronizador.
//
// Auditoría: los RPC registrar_auditoria y listar_auditoria_admin están
// en supabase/b4-auditoria-trazabilidad.sql (SECURITY DEFINER, protegidos
// con tiene_permiso). Si no están aplicados todavía, el Centro de Mando
// degrada con mensajes claros (no inventa datos).
// ============================================================

// ---- B4: registro de auditoría desde el frontend ----
// Llama al RPC registrar_auditoria. Toma usuario_id de auth.uid() en el
// backend (no del cliente), así no se puede falsificar el autor. El
// payload_resumen solo lleva lo necesario (sin datos sensibles).
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

// ---- B4.2/A: estado general del Centro de Mando ----
// Deriva el estado de datos reales: cola offline + conectividad + sincronizando.
function calcularEstadoMando(ops, sincronizando) {
  // Reutiliza la lógica de B2.3 (calcularEstadoOperacional) si existe.
  if (typeof calcularEstadoOperacional === "function") {
    return calcularEstadoOperacional(ops, sincronizando);
  }
  // Fallback mínimo (no debería usarse: B2.3 ya define calcularEstadoOperacional).
  const atencion = ops.filter((o) => o.estado === "REQUIERE_ATENCION").length;
  if (atencion > 0) return { nivel: "critico", texto: "Requiere atención", detalle: atencion + " operación(es)." };
  return { nivel: "normal", texto: "Operativo", detalle: "Todo sincronizado." };
}

function renderEstadoMando(estado) {
  const el = document.getElementById("mando-estado");
  if (!el) return;
  el.className = "cc-estado cc-estado-" + estado.nivel;
  let extra = "";
  // B8.5: _usuarioActual es una variable (let _usuarioActual), no una función.
  // Antes se comprobaba typeof === "function" (siempre false) → nunca mostraba la sesión.
  if (_usuarioActual) {
    extra = '<span class="cc-estado-detalle">Sesión: ' + escHtml(_usuarioActual.nombre || "") + (_usuarioActual.rol ? " · " + escHtml(_usuarioActual.rol) : "") + "</span>";
  }
  el.innerHTML = '<div class="cc-estado-cabecera"><span class="cc-estado-titulo">' + escHtml(estado.texto) + "</span><span class=\"cc-estado-detalle\">" + escHtml(estado.detalle) + "</span>" + extra + "</div>";
}

// ---- B4.2/C: alertas reales (no inventadas) ----
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
  // B8.5: _usuarioActual es variable, no función.
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

// ---- B4.2/B: actividad reciente ----
// Reutiliza construirActividadReciente (B2.3) si existe, que a su vez
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
    const fechaTxt = m.fecha ? new Date(m.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    div.innerHTML = '<span class="cc-actividad-icono">' + escHtml(m.icono) + "</span><span class=\"cc-actividad-texto\">" + escHtml(m.texto) + "</span><span class=\"cc-actividad-meta\"><span class=\"muted\">" + escHtml(fechaTxt) + "</span><span class=\"cc-actividad-resultado\">" + escHtml(m.resultado) + "</span></span>";
    el.appendChild(div);
  });
}

// ---- B4.5/D: auditoría administrativa con filtros ----
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
    const fechaTxt = f.fecha ? new Date(f.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
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
// Lee la cola una sola vez (reutiliza obtenerOperacionesVisiblesPanel),
// deriva estado/alertas y pinta. La auditoría se carga solo si hay permiso
// y conexión. No hace consultas duplicadas.
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


// ============================================================
// B5 — REPORTES Y ANÁLISIS OPERATIVO
// ============================================================
// Reutiliza: _usuarioActual/_permisosEfectivos/tienePermiso (B3),
// _cache (productos/almacenes), tiene_permiso en backend. NO crea
// otra cola/store/caché/sincronizador. Los reportes consultan datos
// reales vía RPCs (supabase/b5-reportes.sql) protegidos con
// tiene_permiso('reportes','ver'). Si el SQL no está aplicado, el
// frontend degrada con mensajes claros (no inventa datos).
// ============================================================

let _repSubreporte = "ventas";
let _repPagina = 0;
const _REP_POR_PAG = 25;

// Poblar el select de almacenes con los ya cacheados (sin consulta nueva).
function poblarFiltrosReportes() {
  const sel = document.getElementById("rep-filtro-almacen");
  if (!sel) return;
  const actual = sel.value;
  // Reutiliza _cache.almacenes (ya cargado por refrescarAlmacenes).
  const almacenes = (typeof _cache !== "undefined" && _cache.almacenes) ? _cache.almacenes : [];
  sel.innerHTML = '<option value="">Todos los almacenes</option>';
  almacenes.forEach((a) => {
    const o = document.createElement("option");
    o.value = a.id; o.textContent = a.nombre;
    sel.appendChild(o);
  });
  if (actual) sel.value = actual;
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
    (comp.disponible === false ? '<div class="resumen-card"><div class="valor muted">—</div><div class="etiqueta">Compras</div><div class="muted">' + escHtml(comp.nota || "No disponible") + '</div></div>' : "") +
    (mar.disponible === false ? '<div class="resumen-card"><div class="valor muted">—</div><div class="etiqueta">Margen</div><div class="muted">' + escHtml(mar.nota || "No disponible") + '</div></div>' : "");
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
    const fecha = v.fecha ? new Date(v.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
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
    const fecha = t.fecha ? new Date(t.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
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
    const fecha = va.fecha ? new Date(va.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
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
    const fecha = m.fecha ? new Date(m.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
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
  filas.forEach((c) => {
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = c.fecha ? new Date(c.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
    div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + escHtml(c.almacen || "—") + '</span><span class="muted">' + fecha + ' · ' + escHtml(c.proveedor || "Sin proveedor") + ' · ' + escHtml(c.usuario || "—") + ' · Total $' + money(c.total || 0) + '</span></span>';
    el.appendChild(div);
  });
}

function renderRentabilidad(filas) {
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  if (!filas || filas.length === 0) { el.innerHTML = '<p class="lista-estado">Sin datos de rentabilidad.</p>'; return; }
  // B5.3: el costo FIFO de una venta puede NO estar disponible (ventas
  // históricas sin costo_unitario/costo_total). NULL/ausencia de costo NO es
  // 0: nunca mostrar CMV 0, ganancia = ingresos ni margen 100% como si el
  // costo fuera real. Reutilizamos el contrato real del backend: cuando el
  // costo no existe, cmv llega null/undefined (no un 0 falso). Si el backend
  // evoluciona a devolver un flag "disponible", se respetará igual porque
  // acá solo se considera costo disponible cuando cmv es un número finito.
  let totalIng = 0, totalCmv = 0;
  let hayCostoAlguno = false;
  el.innerHTML = "";
  filas.forEach((r) => {
    const ingresos = Number(r.ingresos || 0);
    totalIng += ingresos;
    const cmvNum = Number(r.cmv);
    const costoDisponible = Number.isFinite(cmvNum) && r.cmv !== null && r.cmv !== undefined;
    let gan, margen, cmvTxt, ganTxt, margenTxt;
    if (costoDisponible) {
      totalCmv += cmvNum;
      hayCostoAlguno = true;
      gan = Number(r.ganancia_bruta);
      if (!Number.isFinite(gan)) gan = ingresos - cmvNum;
      const margenNum = Number(r.margen_porcentaje);
      margen = Number.isFinite(margenNum) && r.margen_porcentaje !== null && r.margen_porcentaje !== undefined
        ? margenNum
        : (ingresos > 0 ? (gan / ingresos * 100) : 0);
      cmvTxt = "$" + money(cmvNum);
      ganTxt = "$" + money(gan);
      margenTxt = money(margen) + "%";
    } else {
      // Sin costo real: no inventar CMV 0, ganancia ni margen.
      cmvTxt = "costo no disponible";
      ganTxt = "—";
      margenTxt = "—";
    }
    const div = document.createElement("div");
    div.className = "rep-fila";
    const fecha = r.fecha ? new Date(r.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
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

// Exportar CSV del sub-reporte actual (respeta filtros y permisos).
function exportarCSVReporte() {
  if (!tienePermiso("reportes", "ver")) return;
  const el = document.getElementById("rep-detalle");
  if (!el) return;
  const filas = el.querySelectorAll(".rep-fila");
  if (filas.length === 0) return;
  // Reconstruir CSV desde el texto visible (sin datos sensibles).
  const lineas = [];
  filas.forEach((f) => {
    const texto = f.textContent.replace(/\s+/g, " ").trim();
    lineas.push('"' + texto.replace(/"/g, '""') + '"');
  });
  const csv = lineas.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "reporte_" + _repSubreporte + ".csv";
  a.click();
  URL.revokeObjectURL(url);
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
  // Misión B1/B2: contador de la cola offline + caché de operaciones
  // pendientes para la proyección local de stock (Sección 16) — así queda
  // mostrando el estado real desde el primer momento, no solo después de la
  // primera escritura de esta sesión. Si ya hay operaciones PENDIENTE de una
  // sesión anterior (se cerró la app sin haber recuperado Internet) y ahora
  // sí hay conexión, se dispara la sincronización directamente al entrar en
  // vez de esperar a un evento "online" que quizás no vuelva a ocurrir.
  // Misión B2.1, Parte 10: la recuperación de SINCRONIZANDO→PENDIENTE debe
  // terminar ANTES de que sincronizarCola() lea la cola, o una operación
  // atrapada de una sesión anterior seguiría sin encontrarse (sincronizarCola
  // solo busca "PENDIENTE"). Por eso va todo en una sola cadena async
  // ordenada en vez de varios safeInit sueltos que no se esperan entre sí.
  safeInit("cola-offline-arranque", () => {
    (async () => {
      await recuperarOperacionesAtrapadas();
      await actualizarContadorColaPendiente();
      await refrescarOperacionesPendientesCache();
      // refrescarPanelPendientes() no se llama aca: va despues de
      // actualizarContadorColaPendiente (que ya refresca el panel si
      // esta visible) y antes de sincronizarCola (cuyo finally tambien
      // refresca). El hook del tab lo refresca al abrir Pendientes.
      // B2.3: pintar el Centro de Control con el estado real de la
      // cola al iniciar (la pestaña Resumen es la pantalla inicial).
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

// ============================================================
// Refresco automático al reconectar — Sesión 22, corregido en Sesión 23
// Dispara un refresco completo de todo lo que ya estaba cargado cuando el
// navegador recupera la conexión, para no depender de que alguien cambie
// de pestaña o repita una acción a mano después de haber estado offline.
// Los datos con caché local (productos/categorías/unidades/almacenes/stock/
// presentaciones, vía withCache más arriba — categorías y unidades desde
// Sesión 23, antes solo productos/almacenes/stock/presentaciones) se
// actualizan de verdad contra el servidor y reemplazan lo que había
// guardado. El resto (transferencias, vales, ventas) ya se recargaba solo
// al entrar a esa pestaña — acá también se refresca por prolijidad, sin
// agregarles caché propia (fuera del alcance de la Etapa A: solo lectura
// offline de productos/categorías/unidades/almacenes/stock/presentaciones).
// Se llama únicamente con el panel principal ya visible (ver
// safeInit("estado-conexion") más arriba); en la pantalla de login
// reconectar solo actualiza el indicador.
// ============================================================
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
  // B2.2-D: garantizar que el panel Pendientes quede consistente con
  // IndexedDB tras reconectar (sincronizarCola ya lo refresca en su
  // finally, pero alReconectar llama a esta funcion despues; refresco
  // explicito por si la sincronizacion dejo estado intermedio).
  await refrescarPanelPendientes();
  // B3.13: tras reconectar, revalidar el contexto de usuario (rol/estado
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


// ============================================================
// B6 — NÚCLEO OPERATIVO + INVENTARIO INTELIGENTE
// ============================================================
// Reutiliza TODO: _cache/_usuarioActual/_permisosEfectivos/tienePermiso
// (B3), operaciones_pendientes + ejecutarOperacion + sincronizarCola
// (B2), _sincronizando (mutex único), registrarAuditoria (B4).
// NO crea otra cola, caché, sincronizador ni sistema de permisos.
// Los RPC de B6 (registrar_compra/venta/transferencia/vale, inventario,
// movimientos, rentabilidad, historial_compras) están en
// supabase/b6-nucleo-operativo.sql. Si no están aplicados, el frontend
// degrada con mensajes claros (no inventa datos).
// ============================================================

// R4: filtro por estado operativo del inventario. Las filas cargadas
// viven en memoria (no es una segunda cache global: es estado local de
// la pestana, mismo patron que _movPagina/_repPagina). El filtro trabaja
// sobre los datos ya cargados: no hace consultas nuevas.
let _invFiltroEstado = "todos"; // todos | bajo | agotado | normal
let _invFilas = []; // filas del ultimo inventario cargado (en memoria)

// ---- B6: pestaña Inventario (enriquecido) ----
// Usa inventario_enriquecido (RPC B6) que devuelve existencia, mínimo,
// estado, costo promedio ponderado y valoración. Si el RPC no existe,
// avisa que falta aplicar el SQL. No inventa costos.
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
  if (sel) {
    const actual = sel.value;
    sel.innerHTML = '<option value="">Todos los almacenes</option>';
    (_cache.almacenes || []).forEach((a) => {
      const o = document.createElement("option");
      o.value = a.id; o.textContent = a.nombre;
      sel.appendChild(o);
    });
    if (actual) sel.value = actual;
  }
  const almacen = sel ? (sel.value || null) : null;
  try {
    const { data, error } = await client.rpc("inventario_enriquecido", { p_almacen_id: almacen });
    if (error) {
      const msg = String(error.message || error.code || error);
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
  // R4: filtrar por estado operativo antes de pintar la lista visible.
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
      div.innerHTML = '<span class="rep-fila-principal"><span class="cc-asunto-tipo">' + icono + " " + escHtml(s.producto || "\u2014") + '</span><span class="muted">' + escHtml(s.almacen || "\u2014") + " \u00b7 " + (s.cantidad || 0) + " u (m\u00edn: " + (s.minimo != null ? s.minimo : "\u2014") + ') \u00b7 costo prom $' + money(s.costo_promedio || 0) + " \u00b7 valor $" + money(valor) + "</span></span>";
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
  if (sel) {
    const actual = sel.value;
    sel.innerHTML = '<option value="">Todos los almacenes</option>';
    (_cache.almacenes || []).forEach((a) => {
      const o = document.createElement("option");
      o.value = a.id; o.textContent = a.nombre;
      sel.appendChild(o);
    });
    if (actual) sel.value = actual;
  }
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
    const fecha = m.fecha ? new Date(m.fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "\u2014";
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

  // R4: filtro por estado operativo. Botones que filtran la lista ya cargada
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


// ============================================================
// B7 — OPERACIÓN HUMANA: TURNOS + CUADRES + RESPONSABILIDADES + INCIDENCIAS
// ============================================================
// Reutiliza TODO: _usuarioActual/_permisosEfectivos/tienePermiso (B3),
// operaciones_pendientes + ejecutarOperacion + sincronizarCola (B2),
// _sincronizando, registrarAuditoria (B4), _cache (B2/B6).
// NO crea otra cola, caché, sincronizador ni sistema de permisos.
// Los RPC de B7 (abrir_turno, cerrar_turno, registrar_cuadre,
// revisar_cuadre, crear_responsabilidad, actualizar_responsabilidad,
// crear_incidencia, resolver_incidencia, listar_*) están en
// supabase/b7-operacion-humana.sql. Si no están aplicados, el frontend
// degrada con mensajes claros (no inventa datos).
// ============================================================

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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
  const apertura = t.apertura_real ? new Date(t.apertura_real).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
    const apertura = t.apertura_real ? new Date(t.apertura_real).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
    const cierre = t.cierre_real ? new Date(t.cierre_real).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
  if (sel) {
    const actual = sel.value;
    sel.innerHTML = '<option value="">Todos los almacenes</option>';
    (_cache.almacenes || []).forEach((a) => {
      const o = document.createElement("option");
      o.value = a.id; o.textContent = a.nombre;
      sel.appendChild(o);
    });
    if (actual) sel.value = actual;
  }
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
    const fecha = i.creado_en ? new Date(i.creado_en).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
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


// ============================================================
// B8 — COMUNICACIÓN Y COORDINACIÓN OPERATIVA
// ============================================================
// Reutiliza TODO: _usuarioActual/_permisosEfectivos/tienePermiso (B3),
// operaciones_pendientes + ejecutarOperacion + sincronizarCola (B2),
// _sincronizando, registrarAuditoria (B4), _cache (B2/B6).
// NO crea otra cola, caché, sincronizador ni sistema de permisos.
// Los RPC de B8 (crear_conversacion, listar_conversaciones_usuario,
// listar_mensajes_conversacion, enviar_mensaje, marcar_conversacion_leida,
// agregar_participante, cerrar_conversacion, contar_no_leidos_global,
// listar_usuarios_para_chat) están en supabase/b8-comunicacion.sql.
// Si no están aplicados, el frontend degrada con mensajes claros.
// ============================================================

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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
    const fecha = c.ultimo_fecha ? new Date(c.ultimo_fecha).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
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
      if (msg.includes("Could not find") || msg.includes("42883")) {
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
// R1: reutiliza ejecutarOperacion("conversacion") igual que crearConversacion(),
// para que la idempotency_key la genere/conserve la infraestructura offline
// existente (no llama directo a client.rpc ni crea una segunda cola). Offline
// la operación queda pendiente; al no tener data.id todavía, no se navega a la
// conversación hasta que se sincronice.
async function abrirConversacionContextual(tipo, entidadId) {
  // La RPC crear_conversacion es idempotente: si ya existe, la devuelve.
  const params = { p_tipo: tipo };
  if (tipo === "INCIDENCIA") params.p_incidencia_id = entidadId;
  else if (tipo === "TURNO") params.p_turno_id = entidadId;
  else if (tipo === "RESPONSABILIDAD") params.p_responsabilidad_id = entidadId;
  const r = await ejecutarOperacion("conversacion", params);
  if (!r.ok) {
    const msg = String((r.error && (r.error.message || r.error.code)) || r.error || "");
    if (msg.includes("Could not find") || msg.includes("42883")) {
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
// R1: reutiliza ejecutarOperacion("conversacion") igual que crearConversacion(),
// para que la idempotency_key la genere/conserve la infraestructura offline
// existente (no llama directo a client.rpc ni crea una segunda cola). Offline
// la operación queda pendiente; al no tener data.id todavía, no se navega a la
// conversación hasta que se sincronice.
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
