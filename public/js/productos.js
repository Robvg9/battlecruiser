// ==== Battlecruiser · js/productos.js ====
// Categorías, almacenes (carga básica), productos (CRUD, imagen), y formulario de compra.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

function fillSelect(select, rows, valueKey, labelFn, keepFirst) {
  if (!select) return;
  const first = keepFirst ? select.querySelector("option") : null;
  select.innerHTML = "";
  if (first) select.appendChild(first);
  (rows || []).forEach((row) => {
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
  return withCache("almacenes", () => client.from("almacenes").select("id, nombre, tipo, activo").order("nombre"));
}

async function cargarProductos() {
  return withCache("productos", () => client
    .from("productos")
    .select("id, nombre, unidad, precio_normal, precio_mayorista, activo, imagen_url, categoria_id, categorias(nombre), presentaciones(nombre)")
    .order("nombre"));
}

const PROD_IMAGEN_TIPOS_VALIDOS = ["image/jpeg", "image/png", "image/jpg"];
const PROD_IMAGEN_TAMANO_MAX = 5 * 1024 * 1024;

function validarArchivoImagenProducto(file) {
  if (!file) return null;
  if (!PROD_IMAGEN_TIPOS_VALIDOS.includes(file.type)) return "Formato no permitido. Usa JPG o PNG.";
  if (file.size > PROD_IMAGEN_TAMANO_MAX) return "La imagen es muy grande (máximo 5MB).";
  return null;
}

function extensionImagen(file) {
  if (file.type === "image/png") return "png";
  return "jpg";
}

async function subirImagenProducto(productoId, file) {
  const nombreArchivo = `${productoId}/${Date.now()}.${extensionImagen(file)}`;
  const { error: errorSubida } = await client.storage.from("productos").upload(nombreArchivo, file, { upsert: true, contentType: file.type });
  if (errorSubida) return { ok: false, error: errorSubida };
  const { data: urlData } = client.storage.from("productos").getPublicUrl(nombreArchivo);
  const { error: errorRpc } = await client.rpc("actualizar_imagen_producto", { p_producto_id: productoId, p_imagen_url: urlData.publicUrl });
  if (errorRpc) return { ok: false, error: errorRpc };
  return { ok: true, url: urlData.publicUrl };
}

async function quitarImagenProducto(productoId) {
  const { error } = await client.rpc("actualizar_imagen_producto", { p_producto_id: productoId, p_imagen_url: null });
  return { ok: !error, error };
}

safeInit("prod-imagen-input", () => {
  const input = document.getElementById("prod-imagen-input");
  const wrap = document.getElementById("prod-imagen-preview-wrap");
  const img = document.getElementById("prod-imagen-preview");
  if (!input || !wrap || !img) return;
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    setMsg("msg-prod-imagen", "", true);
    if (!file) { wrap.classList.add("hidden"); return; }
    const error = validarArchivoImagenProducto(file);
    if (error) { setMsg("msg-prod-imagen", error, false); input.value = ""; wrap.classList.add("hidden"); return; }
    img.src = URL.createObjectURL(file);
    wrap.classList.remove("hidden");
  });
  const quitar = document.getElementById("prod-imagen-quitar");
  if (!quitar) return;
  quitar.addEventListener("click", async () => {
    const editando = document.getElementById("prod-editando-id");
    const editandoId = editando ? editando.value || null : null;
    input.value = "";
    wrap.classList.add("hidden");
    if (editandoId && img.dataset.guardada === "true") {
      if (estaRealmenteDesconectado()) { setMsg("msg-prod-imagen", "Necesitas conexión para quitar la imagen guardada.", false); return; }
      const resultado = await quitarImagenProducto(editandoId);
      if (!resultado.ok) { setMsg("msg-prod-imagen", "No se pudo quitar la imagen.", false); return; }
      img.dataset.guardada = "false";
      setMsg("msg-prod-imagen", "Imagen quitada.", true);
      await refrescarProductos();
    }
  });
});

let _productosBusqueda = "";

function stockTotalProducto(productoId) {
  return (_cache.stock || []).filter((s) => s.producto_id === productoId).reduce((acc, s) => acc + (Number(s.cantidad) || 0), 0);
}

function renderProductosLista() {
  const lista = document.getElementById("lista-productos");
  if (!lista) return;
  const todas = _cache.productos || [];
  if (todas.length === 0) {
    setEmpty("lista-productos", mensajeListaVacia("productos", "Todavía no hay productos cargados."));
    actualizarContador("productos-contador", 0, 0);
    return;
  }
  const termino = _productosBusqueda.trim().toLowerCase();
  const filtradas = termino ? todas.filter((p) => {
    const nom = (p.nombre || "").toLowerCase();
    const cat = p.categorias && p.categorias.nombre ? p.categorias.nombre.toLowerCase() : "";
    const uni = (p.unidad || "").toLowerCase();
    return nom.includes(termino) || cat.includes(termino) || uni.includes(termino);
  }) : todas;
  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="lista-estado">🔎 No encontramos productos con esos criterios.</p><button type="button" class="cc-accion mov-ver-todas-btn" data-tipo="productos">Ver todos</button>';
    actualizarContador("productos-contador", 0, todas.length);
    return;
  }
  lista.innerHTML = "";
  const puedeEditar = tienePermiso("productos", "editar");
  filtradas.forEach((p) => {
    const div = document.createElement("div");
    div.className = "lista-item lista-item-accion" + (p.activo === false ? " lista-item-inactivo" : "");
    div.setAttribute("data-ctx-tipo", "producto");
    div.setAttribute("data-ctx-id", p.id || "");
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    const estadoTxt = p.activo === false ? '<span class="muted">· Inactivo</span>' : "";
    let botones = "";
    if (puedeEditar) botones = `<span class="lista-item-acciones"><button type="button" class="btn-editar-producto" data-id="${p.id}">Editar</button><button type="button" class="btn-toggle-producto" data-id="${p.id}" data-activo="${p.activo !== false}">${p.activo === false ? "Activar" : "Desactivar"}</button></span>`;
    const miniatura = p.imagen_url ? `<img src="${escHtml(p.imagen_url)}" alt="" class="producto-thumb" loading="lazy">` : `<span class="producto-thumb producto-thumb-vacia" aria-hidden="true"></span>`;
    const unidadTxt = p.unidad ? escHtml(p.unidad) : "—";
    const stockTot = stockTotalProducto(p.id);
    div.innerHTML = `${miniatura}<span>${escHtml(p.nombre)} <span class="muted">${p.categorias ? "· " + escHtml(p.categorias.nombre) : ""}${p.presentaciones ? " · " + escHtml(p.presentaciones.nombre) : ""} · ${unidadTxt}</span> ${estadoTxt}</span><span class="muted">Normal $${money(p.precio_normal)} · Mayorista $${money(p.precio_mayorista)} · Stock ${money(stockTot)}</span>${botones}`;
    lista.appendChild(div);
  });
  actualizarContador("productos-contador", filtradas.length, todas.length);
}

async function refrescarProductos() {
  setLoading("lista-productos", "Cargando productos…");
  const [productos, categorias, almacenes] = await Promise.all([cargarProductos(), cargarCategorias(), cargarAlmacenes()]);
  _cache.productos = productos;
  renderResumen();
  fillSelect(document.getElementById("prod-categoria"), categorias, "id", (c) => c.nombre, true);
  fillSelect(document.getElementById("compra-producto"), productos, "id", (p) => p.nombre);
  fillSelect(document.getElementById("compra-almacen"), almacenes, "id", (a) => a.nombre);
  const compraProductoSelect = document.getElementById("compra-producto");
  if (compraProductoSelect) actualizarSelectorCompraPresentacion(compraProductoSelect.value);
  const ppProductoSelect = document.getElementById("pp-producto-select");
  if (ppProductoSelect) {
    const seleccionPPActual = ppProductoSelect.value;
    fillSelect(ppProductoSelect, productos, "id", (p) => p.nombre, true);
    if (seleccionPPActual && productos.some((p) => p.id === seleccionPPActual)) ppProductoSelect.value = seleccionPPActual;
  }
  renderProductosLista();
  return { productos, almacenes };
}

safeInit("lista-productos", () => {
  document.getElementById("lista-productos").addEventListener("click", async (e) => {
    const btnVerTodas = e.target.closest(".mov-ver-todas-btn");
    if (btnVerTodas && btnVerTodas.dataset.tipo === "productos") { _productosBusqueda = ""; const inputBuscar = document.getElementById("productos-buscar"); if (inputBuscar) inputBuscar.value = ""; renderProductosLista(); return; }
    const btnEditar = e.target.closest(".btn-editar-producto");
    if (btnEditar) { const producto = (_cache.productos || []).find((p) => p.id === btnEditar.dataset.id); if (producto) iniciarEdicionProducto(producto); return; }
    const btnToggle = e.target.closest(".btn-toggle-producto");
    if (btnToggle) {
      const id = btnToggle.dataset.id; const activoActual = btnToggle.dataset.activo === "true"; btnToggle.disabled = true;
      const resultado = await ejecutarOperacion("producto_estado", { p_producto_id: id, p_activo: !activoActual });
      btnToggle.disabled = false;
      if (!resultado.ok) { setMsg("msg-productos", (resultado.error && resultado.error.message) || "No se pudo cambiar el estado del producto.", false); return; }
      setMsg("msg-productos", resultado.offline ? "Cambio de estado guardado, se sincronizará cuando vuelva la conexión." : (activoActual ? "Producto desactivado." : "Producto activado."), true);
      if (!resultado.offline) await refrescarProductos();
    }
  });
});

safeInit("productos-buscar", () => {
  const input = document.getElementById("productos-buscar");
  if (!input) return;
  input.addEventListener("input", () => { _productosBusqueda = input.value || ""; renderProductosLista(); });
});

function iniciarEdicionProducto(p) {
  document.getElementById("prod-editando-id").value = p.id;
  document.getElementById("prod-nombre").value = p.nombre || "";
  document.getElementById("prod-unidad").value = p.unidad || "";
  document.getElementById("prod-precio-normal").value = p.precio_normal != null ? p.precio_normal : "";
  document.getElementById("prod-precio-mayorista").value = p.precio_mayorista != null ? p.precio_mayorista : "";
  const categoriaSelect = document.getElementById("prod-categoria");
  if (categoriaSelect) {
    if (p.categorias) {
      const opcion = Array.from(categoriaSelect.options).find((o) => o.textContent === p.categorias.nombre);
      categoriaSelect.value = opcion ? opcion.value : "";
    } else categoriaSelect.value = "";
  }
  const submitBtn = document.getElementById("prod-submit-btn");
  if (submitBtn) submitBtn.textContent = "Guardar cambios";
  const cancelarBtn = document.getElementById("prod-cancelar-edicion");
  if (cancelarBtn) cancelarBtn.classList.remove("hidden");
  const preview = document.getElementById("prod-imagen-preview");
  const wrap = document.getElementById("prod-imagen-preview-wrap");
  const inputImg = document.getElementById("prod-imagen-input");
  if (inputImg) inputImg.value = "";
  if (p.imagen_url && preview && wrap) { preview.src = p.imagen_url; preview.dataset.guardada = "true"; wrap.classList.remove("hidden"); }
  else if (preview && wrap) { preview.removeAttribute("src"); preview.dataset.guardada = "false"; wrap.classList.add("hidden"); }
  setMsg("msg-prod-imagen", "", true);
  const form = document.getElementById("form-producto");
  if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelarEdicionProducto() {
  const form = document.getElementById("form-producto");
  if (form) form.reset();
  const editando = document.getElementById("prod-editando-id");
  if (editando) editando.value = "";
  const submitBtn = document.getElementById("prod-submit-btn");
  if (submitBtn) submitBtn.textContent = "Agregar producto";
  const cancelarBtn = document.getElementById("prod-cancelar-edicion");
  if (cancelarBtn) cancelarBtn.classList.add("hidden");
  const wrap = document.getElementById("prod-imagen-preview-wrap");
  const preview = document.getElementById("prod-imagen-preview");
  if (wrap) wrap.classList.add("hidden");
  if (preview) { preview.removeAttribute("src"); preview.dataset.guardada = "false"; }
  setMsg("msg-prod-imagen", "", true);
}

safeInit("prod-cancelar-edicion", () => {
  document.getElementById("prod-cancelar-edicion").addEventListener("click", cancelarEdicionProducto);
});

safeInit("form-producto", () => {
  document.getElementById("form-producto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombreEl = document.getElementById("prod-nombre");
    const categoriaEl = document.getElementById("prod-categoria");
    const unidadEl = document.getElementById("prod-unidad");
    const precioNormalEl = document.getElementById("prod-precio-normal");
    const precioMayoristaEl = document.getElementById("prod-precio-mayorista");
    const nombre = nombreEl ? nombreEl.value.trim() : "";
    const categoria_id = categoriaEl ? (categoriaEl.value || null) : null;
    const unidad = unidadEl ? (unidadEl.value.trim() || null) : null;
    const precio_normal = precioNormalEl ? parseFloat(precioNormalEl.value) : NaN;
    const precioMayoristaRaw = precioMayoristaEl ? precioMayoristaEl.value.trim() : "";
    const precio_mayorista = precioMayoristaRaw === "" ? null : parseFloat(precioMayoristaRaw);
    const submitBtn = e.target.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    if (!(precio_normal > 0)) { if (submitBtn) submitBtn.disabled = false; setMsg("msg-productos", "El precio normal debe ser mayor a 0.", false); return; }
    if (precio_mayorista !== null && !(precio_mayorista > 0)) { if (submitBtn) submitBtn.disabled = false; setMsg("msg-productos", "El precio mayorista debe ser mayor a 0.", false); return; }
    const editandoId = document.getElementById("prod-editando-id");
    const estabaEditando = editandoId && editandoId.value ? editandoId.value : null;
    const resultado = await ejecutarOperacion("producto", { p_producto_id: estabaEditando, p_nombre: nombre, p_categoria_id: categoria_id, p_unidad: unidad, p_precio_normal: precio_normal, p_precio_mayorista: precio_mayorista });
    if (!resultado.ok) { if (submitBtn) submitBtn.disabled = false; setMsg("msg-productos", explicarError(resultado.error, estabaEditando ? "actualizar producto" : "crear producto"), false); return; }
    if (resultado.offline) { if (submitBtn) submitBtn.disabled = false; setMsg("msg-productos", "✓ Guardado localmente — se sincronizará al recuperar conexión.", true); return; }
    if (submitBtn) submitBtn.disabled = false;
    setMsg("msg-productos", estabaEditando ? "Producto actualizado." : "Producto creado.", true);
    await refrescarProductos();
    if (!estabaEditando) cancelarEdicionProducto();
  });
});

async function actualizarSelectorCompraPresentacion(producto_id) {
  const select = document.getElementById("compra-presentacion");
  if (!select) return;
  if (!producto_id) { _compraAsociacionesCache = []; fillSelect(select, [], "presentacion_id", () => "", true); actualizarModoCompra(); return; }
  const asociaciones = await cargarAsociacionesProducto(producto_id);
  _compraAsociacionesCache = asociaciones.filter((pp) => pp.activo);
  fillSelect(select, _compraAsociacionesCache, "presentacion_id", (pp) => `${pp.presentaciones.nombre} × ${formatFactor(pp.factor)}`, true);
  actualizarModoCompra();
}

function presentacionCompraActual() {
  const select = document.getElementById("compra-presentacion");
  if (!select || !select.value) return null;
  return _compraAsociacionesCache.find((pp) => pp.presentacion_id === select.value) || null;
}

function actualizarModoCompra() {
  const cantidadInput = document.getElementById("compra-cantidad");
  const costoInput = document.getElementById("compra-costo");
  if (!cantidadInput || !costoInput) return;
  const presentacion = presentacionCompraActual();
  if (presentacion) { cantidadInput.placeholder = `Cantidad de ${presentacion.presentaciones.nombre}`; cantidadInput.min = "1"; cantidadInput.step = "1"; }
  else { cantidadInput.placeholder = "Cantidad en unidades"; cantidadInput.min = "0.01"; cantidadInput.step = "0.01"; }
}

// El resto del módulo conserva el CRUD y el flujo de compras existente.
