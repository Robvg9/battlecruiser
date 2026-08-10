// ---- Config del proyecto Supabase de Battlecruiser ----
const SUPABASE_URL = "https://papxnkkjtkxsitcsvcme.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pczHaS1JDPGrEA31vdbOLg_1l2qFhbm";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

logoutBtn.addEventListener("click", async () => {
  await client.auth.signOut();
});

if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

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
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("visible"));
  btn.classList.add("active");
  document.getElementById("tab-" + btn.dataset.tab).classList.add("visible");
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
  const [productos, categorias, almacenes] = await Promise.all([
    cargarProductos(), cargarCategorias(), cargarAlmacenes(),
  ]);

  fillSelect(document.getElementById("prod-categoria"), categorias, "id", (c) => c.nombre, true);
  fillSelect(document.getElementById("compra-producto"), productos, "id", (p) => p.nombre);
  fillSelect(document.getElementById("compra-almacen"), almacenes, "id", (a) => a.nombre);

  const lista = document.getElementById("lista-productos");
  lista.innerHTML = "";
  productos.forEach((p) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `<span>${p.nombre} <span class="muted">${p.categorias ? "· " + p.categorias.nombre : ""}</span></span>
      <span class="muted">Normal $${p.precio_normal} · Mayorista $${p.precio_mayorista}</span>`;
    lista.appendChild(div);
  });

  return { productos, almacenes };
}

document.getElementById("form-producto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = document.getElementById("prod-nombre").value.trim();
  const categoria_id = document.getElementById("prod-categoria").value || null;
  const unidad = document.getElementById("prod-unidad").value.trim() || null;
  const precio_normal = parseFloat(document.getElementById("prod-precio-normal").value);
  const precio_mayorista = parseFloat(document.getElementById("prod-precio-mayorista").value);

  const { error } = await client.from("productos").insert({
    nombre, categoria_id, unidad, precio_normal, precio_mayorista,
  });

  if (error) { setMsg("msg-productos", "No se pudo crear: " + error.message, false); return; }
  setMsg("msg-productos", "Producto creado.", true);
  e.target.reset();
  await refrescarProductos();
});

document.getElementById("form-compra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const producto_id = document.getElementById("compra-producto").value;
  const almacen_id = document.getElementById("compra-almacen").value;
  const cantidad = parseFloat(document.getElementById("compra-cantidad").value);
  const costo_unitario = parseFloat(document.getElementById("compra-costo").value);

  const { error } = await client.rpc("registrar_compra", {
    p_producto_id: producto_id, p_almacen_id: almacen_id,
    p_cantidad: cantidad, p_costo_unitario: costo_unitario,
  });

  if (error) { setMsg("msg-productos", "No se pudo registrar la compra: " + error.message, false); return; }
  setMsg("msg-productos", "Compra registrada, stock actualizado.", true);
  e.target.reset();
  await refrescarStockYSelects();
});

async function refrescarAlmacenes() {
  const almacenes = await cargarAlmacenes();
  const lista = document.getElementById("lista-almacenes");
  lista.innerHTML = "";
  almacenes.forEach((a) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `<span>${a.nombre}</span><span class="muted">${a.tipo === "venta" ? "Venta (precio normal)" : "Almacén / mayorista"}</span>`;
    lista.appendChild(div);
  });

  fillSelect(document.getElementById("trf-origen"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("trf-destino"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("vale-almacen"), almacenes, "id", (a) => a.nombre);
  return almacenes;
}

async function refrescarStockYSelects() {
  const { productos, almacenes } = await refrescarProductos();
  fillSelect(document.getElementById("trf-producto"), productos, "id", (p) => p.nombre);
  fillSelect(document.getElementById("vale-producto"), productos, "id", (p) => p.nombre);

  const { data: stock } = await client
    .from("stock")
    .select("cantidad, minimo, productos(nombre), almacenes(nombre)");

  const lista = document.getElementById("lista-stock");
  lista.innerHTML = "";
  (stock || []).forEach((s) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    const bajo = s.minimo != null && s.cantidad <= s.minimo;
    div.innerHTML = `<span>${s.productos.nombre} <span class="muted">· ${s.almacenes.nombre}</span></span>
      <span class="muted" style="${bajo ? "color:var(--ember)" : ""}">${s.cantidad}${bajo ? " ⚠ bajo mínimo" : ""}</span>`;
    lista.appendChild(div);
  });
}

document.getElementById("form-almacen").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = document.getElementById("alm-nombre").value.trim();
  const tipo = document.getElementById("alm-tipo").value;

  const { error } = await client.from("almacenes").insert({ nombre, tipo });
  if (error) { setMsg("msg-almacenes", "No se pudo crear: " + error.message, false); return; }
  setMsg("msg-almacenes", "Almacén creado.", true);
  e.target.reset();
  await refrescarAlmacenes();
  await refrescarStockYSelects();
});

async function refrescarTransferencias() {
  const { data } = await client
    .from("transferencias")
    .select("id, fecha, estado, origen:almacen_origen_id(nombre), destino:almacen_destino_id(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);

  const lista = document.getElementById("lista-transferencias");
  lista.innerHTML = "";
  (data || []).forEach((t) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `<span>${t.origen.nombre} → ${t.destino.nombre}</span>
      <span class="muted">${new Date(t.fecha).toLocaleDateString()} · ${t.estado}</span>`;
    lista.appendChild(div);
  });
}

document.getElementById("form-transferencia").addEventListener("submit", async (e) => {
  e.preventDefault();
  const origen = document.getElementById("trf-origen").value;
  const destino = document.getElementById("trf-destino").value;
  const producto_id = document.getElementById("trf-producto").value;
  const cantidad = parseFloat(document.getElementById("trf-cantidad").value);

  if (origen === destino) {
    setMsg("msg-transferencias", "El origen y el destino no pueden ser el mismo almacén.", false);
    return;
  }

  const { error } = await client.rpc("registrar_transferencia", {
    p_origen_id: origen, p_destino_id: destino,
    p_lineas: [{ producto_id, cantidad }],
  });

  if (error) { setMsg("msg-transferencias", "No se pudo transferir: " + error.message, false); return; }
  setMsg("msg-transferencias", "Transferencia registrada.", true);
  e.target.reset();
  await refrescarTransferencias();
  await refrescarStockYSelects();
});

async function refrescarVales() {
  const { data } = await client
    .from("vales_salida")
    .select("id, fecha, tipo, cantidad, productos(nombre), almacenes(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);

  const lista = document.getElementById("lista-vales");
  lista.innerHTML = "";
  (data || []).forEach((v) => {
    const div = document.createElement("div");
    div.className = "lista-item";
    div.innerHTML = `<span>${v.productos.nombre} <span class="muted">· ${v.almacenes.nombre}</span></span>
      <span class="muted">${v.tipo} · ${v.cantidad}</span>`;
    lista.appendChild(div);
  });
}

document.getElementById("form-vale").addEventListener("submit", async (e) => {
  e.preventDefault();
  const producto_id = document.getElementById("vale-producto").value;
  const almacen_id = document.getElementById("vale-almacen").value;
  const tipo = document.getElementById("vale-tipo").value;
  const cantidad = parseFloat(document.getElementById("vale-cantidad").value);

  const { error } = await client.rpc("registrar_vale_salida", {
    p_producto_id: producto_id, p_almacen_id: almacen_id,
    p_tipo: tipo, p_cantidad: cantidad,
  });

  if (error) { setMsg("msg-vales", "No se pudo registrar: " + error.message, false); return; }
  setMsg("msg-vales", "Vale de salida registrado, stock actualizado.", true);
  e.target.reset();
  await refrescarVales();
  await refrescarStockYSelects();
});

// Cargar todo cuando se confirma sesión real (se engancha a showApp existente)
const _showAppOriginal = showApp;
showApp = function (session) {
  _showAppOriginal(session);
  refrescarProductos();
  refrescarAlmacenes().then(refrescarStockYSelects);
  refrescarTransferencias();
  refrescarVales();
};
