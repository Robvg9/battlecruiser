// ==== Battlecruiser · js/presentaciones.js ====
// Presentaciones comerciales: catálogo único y formatos por producto dentro de Administración.
// Los factores se guardan mediante bc_guardar_producto_catalogo para conservar el contrato minorista/mayorista.

// ---- Presentaciones comerciales — catálogo maestro y conversiones por canal.
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

async function cargarPresentacionesTodas(force) {
  if (force && navigator.onLine) {
    const { data, error } = await client.from("presentaciones").select("id, nombre, activo").order("nombre");
    if (error) throw error;
    _presentacionesCache = Array.isArray(data) ? data : [];
    window._presentacionesCache = _presentacionesCache.slice();
    return _presentacionesCache;
  }
  const data = await withCache("presentaciones", () => client.from("presentaciones").select("id, nombre, activo").order("nombre"));
  _presentacionesCache = Array.isArray(data) ? data : [];
  window._presentacionesCache = _presentacionesCache.slice();
  return _presentacionesCache;
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
        ${_permisosPresentaciones.borrar ? `<button type="button" class="pres-eliminar-btn" data-id="${p.id}" data-nombre="${escHtml(p.nombre)}">Eliminar</button>` : ""}
      </span>`;
    cont.appendChild(div);
  });
}

async function refrescarPresentacionesCatalogo(force) {
  setLoading("lista-presentaciones-catalogo", "Cargando…");
  _presentacionesCache = await cargarPresentacionesTodas(!!force);
  renderCatalogoPresentaciones();
  actualizarSelectPresentacionesDisponibles();
  actualizarDatalistPresentaciones();
}

function actualizarDatalistPresentaciones() {
  const list = document.getElementById("presentaciones-comunes");
  if (!list) return;
  list.innerHTML = "";
  _presentacionesCache.filter((p) => p.activo).forEach((p) => {
    const option = document.createElement("option");
    option.value = p.nombre;
    list.appendChild(option);
  });
}

function actualizarSelectPresentacionesDisponibles() {
  const select = document.getElementById("pp-presentacion-select");
  if (!select) return;
  // Un formato ya asignado debe seguir seleccionable para poder editarlo.
  // La unicidad minorista/mayorista se valida en el RPC transaccional.
  const disponibles = _presentacionesCache.filter((p) => p.activo);
  fillSelect(select, disponibles, "id", (p) => p.nombre, true);
}

function renderAsociacionesProducto() {
  const cont = document.getElementById("pp-lista-asociaciones");
  const rows = _asociacionesProductoCache.filter((pp) => pp.activo !== false);
  if (rows.length === 0) {
    const clave = "asociaciones:" + (_productoPresentacionesActual || "");
    setEmpty("pp-lista-asociaciones", mensajeListaVacia(clave, "Este producto todavía no tiene formatos asignados."));
    return;
  }
  cont.innerHTML = "";
  const productos = window._cache && Array.isArray(window._cache.productos) ? window._cache.productos : [];
  const producto = productos.find((p) => String(p.id) === String(_productoPresentacionesActual));
  const wholesaleId = producto && producto.presentacion_id ? String(producto.presentacion_id) : null;
  const normalRows = rows.filter((pp) => !wholesaleId || String(pp.presentacion_id) !== wholesaleId);
  const wholesaleRows = wholesaleId ? rows.filter((pp) => String(pp.presentacion_id) === wholesaleId) : [];
  const canales = [
    { key: "normal", label: "Minorista", rows: normalRows },
    { key: "mayorista", label: "Mayorista", rows: wholesaleRows }
  ];
  canales.forEach((canal) => {
    const pp = canal.rows[0];
    const div = document.createElement("div");
    div.className = "lista-item pp-canal-item";
    if (!pp) {
      div.innerHTML = '<span><strong>' + canal.label + '</strong><span class="muted"> · Sin formato asignado</span></span>';
    } else {
      div.innerHTML = `
        <span><strong>${canal.label}</strong> · ${escHtml(pp.presentaciones && pp.presentaciones.nombre || "Presentación")}
          <span class="muted">× ${formatFactor(pp.factor)} unidades base</span></span>
        <span class="pp-acciones">${_permisosPresentaciones.editar ? `<button type="button" class="pp-editar-btn" data-id="${pp.id}" data-canal="${canal.key}">Editar</button>` : ""}</span>`;
    }
    cont.appendChild(div);
  });
  if (normalRows.length > 1 || wholesaleRows.length > 1) {
    setMsg("msg-presentaciones", "Este producto conserva asociaciones repetidas. La pantalla muestra una por canal; revisa los datos antes de volver a guardar.", false);
  }
}

async function obtenerProductoParaFormato(productoId) {
  const cached = window._cache && Array.isArray(window._cache.productos)
    ? window._cache.productos.find((p) => String(p.id) === String(productoId))
    : null;
  if (cached && Object.prototype.hasOwnProperty.call(cached, "presentacion_id")) return cached;
  const { data, error } = await client.from("productos")
    .select("id,nombre,categoria_id,unidad,precio_normal,precio_mayorista,presentacion_id,activo")
    .eq("id", productoId).single();
  if (error) throw error;
  if (!data) throw new Error("No se encontró el producto.");
  return data;
}

async function consultarAsociacionesProducto(productoId) {
  const { data, error } = await client.from("producto_presentaciones")
    .select("id,factor,activo,presentacion_id,presentaciones(id,nombre)")
    .eq("producto_id", productoId).order("created_at");
  if (error) throw error;
  _registrarFactoresConocidos(productoId, data || []);
  return data || [];
}

async function refrescarAsociacionesProducto(producto_id, force) {
  setLoading("pp-lista-asociaciones", "Cargando…");
  _asociacionesProductoCache = force ? await consultarAsociacionesProducto(producto_id) : await cargarAsociacionesProducto(producto_id);
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
    try {
      const { error } = await client.rpc("crear_presentacion", {
        p_nombre: nombre,
        p_idempotency_key: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random())
      });
      if (error) throw error;
      setMsg("msg-presentaciones", "Presentación creada.", true);
      form.reset();
      await refrescarPresentacionesCatalogo(true);
    } catch (error) {
      const msg = error && error.code === "23505" ? "Ya existe una presentación con ese nombre." : explicarError(error, "crear presentación");
      setMsg("msg-presentaciones", "No se pudo crear: " + msg, false);
    } finally {
      submitBtn.disabled = false;
    }
  });

  lista.addEventListener("click", async (e) => {
    const editarBtn = e.target.closest(".pres-editar-btn");
    const toggleBtn = e.target.closest(".pres-toggle-btn");
    const eliminarBtn = e.target.closest(".pres-eliminar-btn");
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
      const { error } = await client.rpc("actualizar_presentacion", {
        p_presentacion_id: id,
        p_nombre: nuevoNombre,
        p_idempotency_key: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random())
      });
      guardarBtn.disabled = false;
      if (error) {
        const msg = error.code === "23505" ? "Ya existe una presentación con ese nombre." : explicarError(error, "editar presentación");
        setMsg("msg-presentaciones", "No se pudo guardar: " + msg, false);
        return;
      }
      setMsg("msg-presentaciones", "Presentación actualizada.", true);
      await refrescarPresentacionesCatalogo(true);
      return;
    }

    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const activoActual = toggleBtn.dataset.activo === "true";
      toggleBtn.disabled = true;
      const { error } = await client.rpc("cambiar_estado_presentacion", {
        p_presentacion_id: id,
        p_activo: !activoActual,
        p_idempotency_key: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random())
      });
      toggleBtn.disabled = false;
      if (error) {
        setMsg("msg-presentaciones", "No se pudo actualizar: " + explicarError(error, "cambiar estado de presentación"), false);
        return;
      }
      await refrescarPresentacionesCatalogo(true);
      // El nombre/estado de una presentación pudo cambiar: si hay un
      // producto elegido, sus asociaciones se vuelven a pintar con datos al día.
      if (_productoPresentacionesActual) await refrescarAsociacionesProducto(_productoPresentacionesActual);
      return;
    }

    if (eliminarBtn) {
      const id = eliminarBtn.dataset.id;
      const nombre = eliminarBtn.dataset.nombre || "esta presentación";
      if (!window.confirm("¿Eliminar \"" + nombre + "\" definitivamente? Solo puede eliminarse si no está vinculada a productos.")) return;
      eliminarBtn.disabled = true;
      try {
        const [asociaciones, productos, baseProducts] = await Promise.all([
          client.from("producto_presentaciones").select("id", { count: "exact", head: true }).eq("presentacion_id", id),
          client.from("productos").select("id", { count: "exact", head: true }).eq("presentacion_id", id),
          client.from("productos").select("id", { count: "exact", head: true }).eq("unidad", nombre)
        ]);
        if (asociaciones.error) throw asociaciones.error;
        if (productos.error) throw productos.error;
        if (baseProducts.error) throw baseProducts.error;
        const referencias = Number(asociaciones.count || 0) + Number(productos.count || 0) + Number(baseProducts.count || 0);
        if (referencias > 0) {
          setMsg("msg-presentaciones", "No se puede eliminar: está vinculada a " + referencias + " referencia(s). Desactívala para conservar el historial.", false);
          eliminarBtn.disabled = false;
          return;
        }
        const { error } = await client.from("presentaciones").delete().eq("id", id);
        if (error) throw error;
        setMsg("msg-presentaciones", "Presentación eliminada.", true);
        await refrescarPresentacionesCatalogo(true);
      } catch (error) {
        eliminarBtn.disabled = false;
        setMsg("msg-presentaciones", "No se pudo eliminar: " + explicarError(error, "eliminar presentación"), false);
      }
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
    formNueva.classList.toggle("hidden", !(_permisosPresentaciones.crear || _permisosPresentaciones.editar));
    await refrescarAsociacionesProducto(producto_id);
  });

  formNueva.addEventListener("submit", async (e) => {
    e.preventDefault();
    const producto_id = productoSelect.value;
    const presentacion_id = document.getElementById("pp-presentacion-select").value;
    const canal = document.getElementById("pp-canal-select")?.value || "normal";
    const factor = Number(document.getElementById("pp-factor").value);
    if (!producto_id || !presentacion_id) { setMsg("msg-presentaciones", "Elegí un producto y una presentación.", false); return; }
    if (!(Number.isFinite(factor) && factor > 0)) { setMsg("msg-presentaciones", "La equivalencia debe ser un número mayor a cero.", false); return; }
    if (!navigator.onLine) { setMsg("msg-presentaciones", "Necesitas conexión para actualizar los formatos de un producto.", false); return; }
    const submitBtn = formNueva.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    try {
      const producto = await obtenerProductoParaFormato(producto_id);
      const asociaciones = await consultarAsociacionesProducto(producto_id);
      const wholesaleId = producto.presentacion_id ? String(producto.presentacion_id) : null;
      const activas = asociaciones.filter((pp) => pp.activo !== false);
      const normalRow = activas.find((pp) => !wholesaleId || String(pp.presentacion_id) !== wholesaleId) || null;
      const wholesaleRow = wholesaleId ? (activas.find((pp) => String(pp.presentacion_id) === wholesaleId) || null) : null;
      const selected = _presentacionesCache.find((p) => String(p.id) === String(presentacion_id) && p.activo);
      if (!selected) throw new Error("La presentación elegida ya no está activa. Actualiza el catálogo.");
      let normalName = normalRow?.presentaciones?.nombre || null;
      let normalFactor = normalRow?.factor == null ? null : Number(normalRow.factor);
      let wholesaleName = wholesaleRow?.presentaciones?.nombre || null;
      let wholesaleFactor = wholesaleRow?.factor == null ? null : Number(wholesaleRow.factor);
      if (canal === "mayorista") {
        wholesaleName = selected.nombre;
        wholesaleFactor = factor;
      } else {
        normalName = selected.nombre;
        normalFactor = factor;
      }
      if (normalName && wholesaleName && normalName.trim().toLowerCase() === wholesaleName.trim().toLowerCase()) {
        throw new Error("La presentación minorista y la mayorista deben ser distintas.");
      }
      const result = await client.rpc("bc_guardar_producto_catalogo", {
        p_producto_id: producto.id,
        p_nombre: producto.nombre,
        p_categoria_id: producto.categoria_id || null,
        p_unidad: producto.unidad || null,
        p_precio_normal: producto.precio_normal == null ? null : Number(producto.precio_normal),
        p_precio_mayorista: producto.precio_mayorista == null ? null : Number(producto.precio_mayorista),
        p_presentacion_normal: normalName,
        p_factor_normal: normalFactor,
        p_presentacion_mayorista: wholesaleName,
        p_factor_mayorista: wholesaleFactor,
        p_idempotency_key: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random())
      });
      if (result.error) throw result.error;
      setMsg("msg-presentaciones", "Formato " + (canal === "mayorista" ? "mayorista" : "minorista") + " actualizado.", true);
      if (typeof window.refrescarProductos === "function") await window.refrescarProductos();
      await refrescarAsociacionesProducto(producto_id, true);
      formNueva.reset();
      const submit = formNueva.querySelector("button[type='submit']");
      if (submit) submit.textContent = "Guardar formato";
    } catch (error) {
      setMsg("msg-presentaciones", "No se pudo guardar el formato: " + explicarError(error, "actualizar presentación del producto"), false);
    } finally {
      submitBtn.disabled = false;
    }
  });

  listaAsoc.addEventListener("click", function (e) {
    const editarBtn = e.target.closest(".pp-editar-btn");
    if (!editarBtn) return;
    const pp = _asociacionesProductoCache.find((x) => x.id === editarBtn.dataset.id);
    if (!pp) return;
    const producto = (window._cache && Array.isArray(window._cache.productos) ? window._cache.productos : [])
      .find((p) => String(p.id) === String(_productoPresentacionesActual));
    const wholesaleId = producto && producto.presentacion_id ? String(producto.presentacion_id) : null;
    const canal = wholesaleId && String(pp.presentacion_id) === wholesaleId ? "mayorista" : "normal";
    const canalSelect = document.getElementById("pp-canal-select");
    const presentacionSelect = document.getElementById("pp-presentacion-select");
    const factorInput = document.getElementById("pp-factor");
    if (canalSelect) canalSelect.value = canal;
    if (presentacionSelect) presentacionSelect.value = String(pp.presentacion_id);
    if (factorInput) factorInput.value = String(pp.factor);
    const submit = formNueva.querySelector("button[type='submit']");
    if (submit) submit.textContent = "Guardar formato";
    if (formNueva) formNueva.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
});

// Carga inicial: el selector de productos lo llena el flujo de Productos.
window.refrescarPresentacionesCatalogo = refrescarPresentacionesCatalogo;
window.actualizarDatalistPresentaciones = actualizarDatalistPresentaciones;

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

