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

function showApp(session) {
  loginForm.classList.add("hidden");
  lanternWrap.classList.add("hidden");
  appShell.classList.add("visible");
  userEmailEl.textContent = session.user.email;
}

function showLogin() {
  loginForm.classList.remove("hidden");
  lanternWrap.classList.remove("hidden");
  appShell.classList.remove("visible");
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
const IDB_VERSION = 1;
const IDB_STORE = "lecturas";

function idbAbrir() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("IndexedDB no disponible en este navegador")); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "clave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
  return !navigator.onLine || msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("timeout");
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
  let texto = "Conectado";
  let mostrarTooltip = false;
  if (estadoForzado === "reconectando") {
    clase = "reconectando";
    texto = "Reconectando…";
  } else if (estaRealmenteDesconectado()) {
    clase = "offline";
    const { conDatos, sinCache } = resumenEstadoCache();
    if (conDatos > 0) {
      // Al menos una pantalla tiene datos guardados reales para mostrar.
      texto = "Sin conexión — usando caché";
      mostrarTooltip = true;
    } else if (sinCache > 0) {
      // Ya se intentó cargar algo y no había nada guardado todavía (primera
      // vez sin conexión en este dispositivo) — distinto de "no hay datos"
      // real, así que el texto lo dice explícito.
      texto = "Sin conexión — sin datos guardados";
    } else {
      // Todavía no se consultó nada en esta sesión (ej. recién se abrió el
      // login sin conexión), o todo lo consultado está confirmado vacío.
      texto = "Sin conexión";
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
  async function alReconectar() {
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
const _cache = { productos: [], almacenes: [], stock: [], transferencias: [], vales: [] };

function renderResumen() {
  const grid = document.getElementById("resumen-grid");
  if (!grid) return;

  const bajoMinimo = _cache.stock.filter((s) => s.minimo != null && s.cantidad <= s.minimo);

  grid.innerHTML = `
    <div class="resumen-card"><div class="valor">${_cache.productos.length}</div><div class="etiqueta">Productos</div></div>
    <div class="resumen-card"><div class="valor">${_cache.almacenes.length}</div><div class="etiqueta">Almacenes</div></div>
    <div class="resumen-card ${bajoMinimo.length ? "alerta" : ""}"><div class="valor">${bajoMinimo.length}</div><div class="etiqueta">Bajo mínimo</div></div>
    <div class="resumen-card"><div class="valor">${_cache.transferencias.length + _cache.vales.length}</div><div class="etiqueta">Movimientos recientes</div></div>
  `;

  const alertasEl = document.getElementById("resumen-alertas-lista");
  if (alertasEl) {
    if (bajoMinimo.length === 0) {
      alertasEl.innerHTML = '<p class="lista-estado">Nada bajo el mínimo por ahora.</p>';
    } else {
      alertasEl.innerHTML = "";
      bajoMinimo.forEach((s) => {
        const div = document.createElement("div");
        div.className = "lista-item";
        div.innerHTML = `<span>${s.productos.nombre} <span class="muted">· ${s.almacenes.nombre}</span></span>
          <span class="muted" style="color:var(--wine)">${money(s.cantidad)} ⚠</span>`;
        alertasEl.appendChild(div);
      });
    }
  }

  const movsEl = document.getElementById("resumen-movs-lista");
  if (movsEl) {
    const movs = [
      ..._cache.transferencias.map((t) => ({
        fecha: t.fecha, texto: `Transferencia: ${t.origen.nombre} → ${t.destino.nombre}`, estado: t.estado,
      })),
      ..._cache.vales.map((v) => ({
        fecha: v.fecha, texto: `Vale (${v.tipo}): ${v.productos.nombre} · ${v.almacenes.nombre}`, estado: money(v.cantidad),
      })),
    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8);

    if (movs.length === 0) {
      movsEl.innerHTML = '<p class="lista-estado">Todavía no hay movimientos registrados.</p>';
    } else {
      movsEl.innerHTML = "";
      movs.forEach((m) => {
        const div = document.createElement("div");
        div.className = "lista-item";
        div.innerHTML = `<span>${fechaCorta(m.fecha)}</span>
          <span class="muted">${m.texto} · ${m.estado}</span>`;
        movsEl.appendChild(div);
      });
    }
  }
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

    submitBtn.disabled = true;
    const { error } = await client.from("productos").insert({
      nombre, categoria_id, unidad, precio_normal, precio_mayorista,
    });
    submitBtn.disabled = false;

    if (error) { setMsg("msg-productos", "No se pudo crear: " + explicarError(error, "crear producto"), false); return; }
    setMsg("msg-productos", "Producto creado.", true);
    e.target.reset();
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
    const { error } = await client.rpc("registrar_compra", {
      p_producto_id: producto_id, p_almacen_id: almacen_id,
      p_cantidad: cantidad, p_costo_unitario: costo_unitario,
      p_presentacion_id: pp ? pp.presentacion_id : null,
      p_cantidad_presentacion: pp ? cantidad : null,
    });
    submitBtn.disabled = false;

    if (error) { setMsg("msg-productos", "No se pudo registrar la compra: " + explicarError(error, "registrar compra"), false); return; }
    setMsg("msg-productos", "Compra registrada, stock actualizado.", true);
    e.target.reset();
    document.getElementById("compra-resumen").classList.add("hidden");
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

async function cargarAsociacionesProducto(producto_id) {
  return withCache("asociaciones:" + producto_id, () => client
    .from("producto_presentaciones")
    .select("id, factor, activo, presentacion_id, presentaciones(nombre)")
    .eq("producto_id", producto_id)
    .order("created_at"));
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
  const lista = document.getElementById("lista-transferencias");
  if (!data || data.length === 0) {
    setEmpty("lista-transferencias", "Todavía no hay transferencias registradas.");
    return;
  }
  lista.innerHTML = "";
  data.forEach((t) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `<span>${t.origen.nombre} → ${t.destino.nombre}</span>
      <span class="muted">${fechaCorta(t.fecha)} · ${t.estado}</span>`;
    lista.appendChild(div);
  });
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
    const { error } = await client.rpc("registrar_transferencia", {
      p_origen_id: origen, p_destino_id: destino,
      p_lineas: [{ producto_id, cantidad }],
    });
    submitBtn.disabled = false;

    if (error) { setMsg("msg-transferencias", "No se pudo transferir: " + explicarError(error, "transferencia"), false); return; }
    setMsg("msg-transferencias", "Transferencia registrada.", true);
    e.target.reset();
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
  const lista = document.getElementById("lista-vales");
  if (!data || data.length === 0) {
    setEmpty("lista-vales", "Todavía no hay vales de salida registrados.");
    return;
  }
  lista.innerHTML = "";
  data.forEach((v) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    // Sesión 17: antes esta lista no mostraba la fecha (Transferencias sí la
    // mostraba) — para un vale de salida (merma/donación/regalo/vencido) la
    // fecha es un dato que hace falta para llevar cuenta real.
    div.innerHTML = `<span>${v.productos.nombre} <span class="muted">· ${v.almacenes.nombre}</span></span>
      <span class="muted">${fechaCorta(v.fecha)} · ${v.tipo} · ${money(v.cantidad)}</span>`;
    lista.appendChild(div);
  });
}

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
    const { error } = await client.rpc("registrar_vale_salida", {
      p_producto_id: producto_id, p_almacen_id: almacen_id,
      p_tipo: tipo, p_cantidad: cantidad,
    });
    submitBtn.disabled = false;

    if (error) { setMsg("msg-vales", "No se pudo registrar: " + explicarError(error, "vale de salida"), false); return; }
    setMsg("msg-vales", "Vale de salida registrado, stock actualizado.", true);
    e.target.reset();
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
function obtenerStockDisponible(producto_id, almacen_id) {
  const fila = _cache.stock.find((s) => s.producto_id === producto_id && s.almacen_id === almacen_id);
  return fila ? Number(fila.cantidad) : 0;
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

  const stockTotal = obtenerStockDisponible(producto_id, almacen_id);
  const enCarrito = cantidadEnCarrito(producto_id, -1);
  const disponible = Math.max(stockTotal - enCarrito, 0);

  infoEl.textContent = "Stock disponible: " + money(disponible);
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
  const stockTotal = obtenerStockDisponible(linea.producto_id, almacen_id);
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
    const stockTotal = obtenerStockDisponible(producto_id, almacen_id);
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
    const { error } = await client.rpc("registrar_venta", {
      p_almacen_id: almacen_id, p_lineas,
    });

    enviandoVenta = false;

    if (error) {
      setMsg("msg-venta", "No se pudo registrar la venta: " + explicarError(error, "registrar venta"), false);
      btn.disabled = false;
      btn.textContent = textoOriginal;
      return;
    }

    btn.textContent = textoOriginal;
    setMsg("msg-venta", "✓ Venta registrada por $" + money(total) + ". Todo listo para la próxima venta.", true);
    setMsg("msg-venta-linea", "", true);
    ventaLineas = [];
    renderVentaLineas(); // vuelve a deshabilitar "Confirmar venta" al quedar vacía
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

  const lista = document.getElementById("lista-ventas");
  if (!lista) return;
  if (!data || data.length === 0) {
    setEmpty("lista-ventas", "Todavía no hay ventas registradas.");
    return;
  }
  lista.innerHTML = "";
  data.forEach((v) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `<span>${v.almacenes.nombre}</span>
      <span class="muted">${fechaCorta(v.fecha)} · $${money(v.total)}</span>`;
    lista.appendChild(div);
  });
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
  actualizarIndicadorConexion();
}
