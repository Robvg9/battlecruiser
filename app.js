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

safeInit("estado-conexion", () => {
  const connStatus = document.getElementById("conn-status");
  const connText = document.getElementById("conn-text");
  function updateConnectionStatus() {
    if (navigator.onLine) {
      connStatus.classList.remove("offline");
      connText.textContent = "Conectado";
    } else {
      connStatus.classList.add("offline");
      connText.textContent = "Sin conexión — usando caché";
    }
  }
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
  updateConnectionStatus();
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

async function cargarCategorias() {
  const { data } = await client.from("categorias").select("id, nombre").order("nombre");
  return data || [];
}

async function cargarAlmacenes() {
  const { data } = await client.from("almacenes").select("id, nombre, tipo").order("nombre");
  return data || [];
}

async function cargarProductos() {
  const { data } = await client
    .from("productos")
    .select("id, nombre, unidad, precio_normal, precio_mayorista, categorias(nombre)")
    .order("nombre");
  return data || [];
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

  const lista = document.getElementById("lista-productos");
  if (productos.length === 0) {
    setEmpty("lista-productos", "Todavía no hay productos cargados.");
  } else {
    lista.innerHTML = "";
    productos.forEach((p) => {
      const div = document.createElement("div");
      div.className = "lista-item";
      div.innerHTML = `<span>${p.nombre} <span class="muted">${p.categorias ? "· " + p.categorias.nombre : ""}</span></span>
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
    const precio_mayorista = parseFloat(document.getElementById("prod-precio-mayorista").value);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (!(precio_normal > 0) || !(precio_mayorista > 0)) {
      setMsg("msg-productos", "Los precios deben ser mayores a 0.", false);
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

safeInit("form-compra", () => {
  document.getElementById("form-compra").addEventListener("submit", async (e) => {
    e.preventDefault();
    const producto_id = document.getElementById("compra-producto").value;
    const almacen_id = document.getElementById("compra-almacen").value;
    const cantidad = parseFloat(document.getElementById("compra-cantidad").value);
    const costo_unitario = parseFloat(document.getElementById("compra-costo").value);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (!(cantidad > 0) || !(costo_unitario > 0)) {
      setMsg("msg-productos", "La cantidad y el costo deben ser mayores a 0.", false);
      return;
    }

    submitBtn.disabled = true;
    const { error } = await client.rpc("registrar_compra", {
      p_producto_id: producto_id, p_almacen_id: almacen_id,
      p_cantidad: cantidad, p_costo_unitario: costo_unitario,
    });
    submitBtn.disabled = false;

    if (error) { setMsg("msg-productos", "No se pudo registrar la compra: " + explicarError(error, "registrar compra"), false); return; }
    setMsg("msg-productos", "Compra registrada, stock actualizado.", true);
    e.target.reset();
    await refrescarStockYSelects();
  });
});

async function refrescarAlmacenes() {
  setLoading("lista-almacenes", "Cargando almacenes…");
  const almacenes = await cargarAlmacenes();
  _cache.almacenes = almacenes;
  renderResumen();
  const lista = document.getElementById("lista-almacenes");
  if (almacenes.length === 0) {
    setEmpty("lista-almacenes", "Todavía no hay almacenes cargados.");
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
  const { data: stock } = await client
    .from("stock")
    .select("cantidad, minimo, productos(nombre), almacenes(nombre)");

  _cache.stock = stock || [];
  renderResumen();
  const lista = document.getElementById("lista-stock");
  if (!stock || stock.length === 0) {
    setEmpty("lista-stock", "Todavía no hay stock cargado.");
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

// Cargar todo cuando se confirma sesión real (se engancha a showApp existente)
const _showAppOriginal = showApp;
showApp = function (session) {
  _showAppOriginal(session);
  safeInit("carga-inicial-productos", () => { refrescarProductos(); });
  safeInit("carga-inicial-almacenes", () => { refrescarAlmacenes().then(refrescarStockYSelects); });
  safeInit("carga-inicial-transferencias", () => { refrescarTransferencias(); });
  safeInit("carga-inicial-vales", () => { refrescarVales(); });
};
