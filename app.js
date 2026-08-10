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
      loginError.textContent = "Correo o contraseña incorrectos.";
    }
  });
});

safeInit("logout", () => {
  logoutBtn.addEventListener("click", async () => {
    await client.auth.signOut();
  });
});

// ---- Actualizar app: borra caché del shell y fuerza traer la última versión ----
safeInit("actualizar-app", () => {
  const updateAppBtn = document.getElementById("update-app-btn");
  updateAppBtn.addEventListener("click", async () => {
    updateAppBtn.disabled = true;
    updateAppBtn.textContent = "Actualizando...";
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
  });
});

// ---- Cambiar contraseña (Supabase Auth, no pide la contraseña actual) ----
safeInit("cambiar-contraseña", () => {
  const changePassBtn = document.getElementById("change-pass-btn");
  const passPanel = document.getElementById("pass-panel");
  const passCancelBtn = document.getElementById("pass-cancel-btn");
  const formPass = document.getElementById("form-pass");

  changePassBtn.addEventListener("click", () => {
    passPanel.classList.toggle("hidden");
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
      setMsg("msg-pass", "No se pudo cambiar: " + error.message, false);
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

    if (error) { setMsg("msg-productos", "No se pudo crear: " + error.message, false); return; }
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

    if (error) { setMsg("msg-productos", "No se pudo registrar la compra: " + error.message, false); return; }
    setMsg("msg-productos", "Compra registrada, stock actualizado.", true);
    e.target.reset();
    await refrescarStockYSelects();
  });
});

async function refrescarAlmacenes() {
  setLoading("lista-almacenes", "Cargando almacenes…");
  const almacenes = await cargarAlmacenes();
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

    if (error) { setMsg("msg-almacenes", "No se pudo crear: " + error.message, false); return; }
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
      <span class="muted">${new Date(t.fecha).toLocaleDateString()} · ${t.estado}</span>`;
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

    if (error) { setMsg("msg-transferencias", "No se pudo transferir: " + error.message, false); return; }
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

  const lista = document.getElementById("lista-vales");
  if (!data || data.length === 0) {
    setEmpty("lista-vales", "Todavía no hay vales de salida registrados.");
    return;
  }
  lista.innerHTML = "";
  data.forEach((v) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `<span>${v.productos.nombre} <span class="muted">· ${v.almacenes.nombre}</span></span>
      <span class="muted">${v.tipo} · ${money(v.cantidad)}</span>`;
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

    if (error) { setMsg("msg-vales", "No se pudo registrar: " + error.message, false); return; }
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
