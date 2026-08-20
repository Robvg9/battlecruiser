// ==== Battlecruiser · js/presentaciones.js ====
// Presentaciones comerciales de productos (catálogo y asociaciones por producto).
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

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

