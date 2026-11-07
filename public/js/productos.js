// ==== Battlecruiser · js/productos.js ====
// Categorías, almacenes (carga básica), productos (CRUD, imagen), y formulario de compra.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

function fmtQtyProducto(v) { return typeof window.numberFmt === 'function' ? window.numberFmt(v) : String(v == null ? 0 : v); }

function fillSelect(select, rows, valueKey, labelFn, keepFirst) {
  // Several legacy/offscreen modules share this helper; their optional controls may not exist in the active DOM.
  if (!select) return;
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
  return withCache("categorias", () => client.from("categorias").select("id, nombre").eq("activo", true).order("nombre"));
}
async function refrescarSelectorCategoriasProducto() {
  const select=document.getElementById("prod-categoria"); if(!select)return [];
  const {data,error}=await client.from("categorias").select("id, nombre").eq("activo",true).order("nombre");
  if(error)throw error; const rows=Array.isArray(data)?data:[]; fillSelect(select,rows,"id",row=>row.nombre,true); return rows;
}
window.refrescarSelectorCategoriasProducto=refrescarSelectorCategoriasProducto;

async function cargarAlmacenes() {
  return withCache("almacenes", () => client.from("almacenes").select("id, nombre, tipo, activo").order("nombre"));
}

async function cargarProductos() {
  return withCache("productos", async () => {
    const extended = await client.from("productos")
      .select("id, nombre, unidad, precio_normal, precio_mayorista, activo, imagen_url, categoria_id, presentacion_id, inventario_mixto, producto_padre_id, variante_nombre, categorias(nombre), presentaciones(nombre)")
      .order("nombre");
    if (!extended.error) return extended;
    const errorText = String(extended.error.message || extended.error.code || extended.error).toLowerCase();
    // PR preview and pre-migration deployments keep the original catalog usable.
    if (!/inventario_mixto|producto_padre_id|variante_nombre|column .* does not exist|schema cache/i.test(errorText)) return extended;
    return client.from("productos")
      .select("id, nombre, unidad, precio_normal, precio_mayorista, activo, imagen_url, categoria_id, presentacion_id, categorias(nombre), presentaciones(nombre)")
      .order("nombre");
  });
}

// A mixed parent is catalog-only; operational pickers select one of its child variants.
function productosPrincipales(rows) {
  return (Array.isArray(rows) ? rows : (_cache.productos || [])).filter((p) => !p.producto_padre_id);
}

function productosOperativos(rows) {
  const all = Array.isArray(rows) ? rows : (_cache.productos || []);
  const byId = new Map(all.map((p) => [String(p.id), p]));
  return all.filter((p) => {
    if (!p || p.activo === false) return false;
    if (!p.producto_padre_id) return !p.inventario_mixto;
    const parent = byId.get(String(p.producto_padre_id));
    return !!(parent && parent.activo !== false && parent.inventario_mixto);
  });
}

function productoEsVariante(p) {
  return !!(p && p.producto_padre_id);
}

function productosEnCacheActual() {
  return typeof _cache !== "undefined" && Array.isArray(_cache.productos) ? _cache.productos : [];
}

async function ejecutarProductoMixtoSinCola(editandoId, payload) {
  if (typeof usuarioPuedeOperar === "function" && !(await usuarioPuedeOperar())) {
    return { ok: false, error: { message: "Tu usuario está inactivo. Contacta al administrador." } };
  }
  if (typeof sincronizarUsuarioIdParaOperaciones === "function") sincronizarUsuarioIdParaOperaciones();
  const rpc = editandoId ? "actualizar_producto" : "crear_producto";
  const args = Object.assign({}, payload, { p_idempotency_key: crypto.randomUUID() });
  try {
    const run = () => client.rpc(rpc, args);
    const result = typeof withNetworkTimeout === "function"
      ? await withNetworkTimeout(run, 15000, "guardar producto con inventario mixto")
      : await run();
    if (result.error) {
      if (typeof esErrorDeRed === "function" && esErrorDeRed(result.error)) {
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
        return { ok: false, error: { message: "No se pudo confirmar la conexión con Supabase. El producto mixto no se guardó ni se encoló." } };
      }
      if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
      return { ok: false, error: result.error };
    }
    if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
    if (typeof window.bcNotificarCambioDatos === "function") {
      window.bcNotificarCambioDatos(editandoId ? "producto_actualizar" : "producto", false);
    }
    return { ok: true, offline: false, data: result.data };
  } catch (error) {
    if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
    return { ok: false, error: { message: "No se pudo confirmar el guardado con el servidor. El producto mixto no se guardó ni se encoló." } };
  }
}


const PROD_IMAGEN_TIPOS_VALIDOS = ["image/jpeg", "image/png", "image/jpg"];
const PROD_IMAGEN_TAMANO_ORIGINAL_MAX = 15 * 1024 * 1024;
const PROD_IMAGEN_LADO_MAX = 512;
let _productoImagenProcesada = null;
let _productoImagenPreviewObjectUrl = null;

function validarArchivoImagenProducto(file) {
  if (!file) return null;
  if (!PROD_IMAGEN_TIPOS_VALIDOS.includes(file.type)) return "Formato no permitido. Usa JPG o PNG.";
  if (file.size > PROD_IMAGEN_TAMANO_ORIGINAL_MAX) return "La imagen original supera el máximo de 15MB.";
  return null;
}

function extensionImagen(file) {
  return file && file.type === "image/png" ? "png" : "jpg";
}

function revocarPreviewImagenProducto() {
  if (_productoImagenPreviewObjectUrl && typeof URL.revokeObjectURL === "function") {
    try { URL.revokeObjectURL(_productoImagenPreviewObjectUrl); } catch (e) {}
  }
  _productoImagenPreviewObjectUrl = null;
}

function prepararImagenProductoCuadrada(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (typeof URL.revokeObjectURL === "function") {
        try { URL.revokeObjectURL(sourceUrl); } catch (e) {}
      }
    };
    image.onerror = () => { cleanup(); reject(new Error("No se pudo leer la imagen seleccionada.")); };
    image.onload = () => {
      try {
        const width = Number(image.naturalWidth || image.width);
        const height = Number(image.naturalHeight || image.height);
        if (!(width > 0 && height > 0)) throw new Error("La imagen no tiene dimensiones válidas.");
        const cropSide = Math.min(width, height);
        const outputSide = Math.min(cropSide, PROD_IMAGEN_LADO_MAX);
        const left = Math.floor((width - cropSide) / 2);
        const top = Math.floor((height - cropSide) / 2);
        const canvas = document.createElement("canvas");
        canvas.width = outputSide;
        canvas.height = outputSide;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Este navegador no puede preparar la imagen.");
        context.drawImage(image, left, top, cropSide, cropSide, 0, 0, outputSide, outputSide);
        window.__BC_PRODUCT_IMAGE_DIMENSIONS__ = { width: outputSide, height: outputSide, cropLeft: left, cropTop: top, cropSide: cropSide };
        canvas.toBlob((blob) => {
          cleanup();
          if (!blob) { reject(new Error("No se pudo comprimir la imagen.")); return; }
          const baseName = String(file.name || "producto").replace(/\.[^.]+$/, "") || "producto";
          try {
            resolve(new File([blob], baseName + ".jpg", {
              type: "image/jpeg",
              lastModified: Date.now()
            }));
          } catch (e) {
            reject(new Error("Este navegador no pudo preparar el archivo de imagen."));
          }
        }, "image/jpeg", 0.84);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    image.src = sourceUrl;
  });
}

async function subirImagenProducto(productoId, file) {
  const nombreArchivo = `${productoId}/${Date.now()}.${extensionImagen(file)}`;
  const { error: errorSubida } = await client.storage
    .from("productos")
    .upload(nombreArchivo, file, { upsert: true, contentType: file.type });
  if (errorSubida) return { ok: false, error: errorSubida };
  const { data: urlData } = client.storage.from("productos").getPublicUrl(nombreArchivo);
  const { error: errorRpc } = await client.rpc("actualizar_imagen_producto", {
    p_producto_id: productoId,
    p_imagen_url: urlData.publicUrl,
  });
  if (errorRpc) return { ok: false, error: errorRpc };
  return { ok: true, url: urlData.publicUrl };
}

async function quitarImagenProducto(productoId) {
  const { error } = await client.rpc("actualizar_imagen_producto", {
    p_producto_id: productoId,
    p_imagen_url: null,
  });
  return { ok: !error, error };
}

safeInit("prod-imagen-input", () => {
  const input = document.getElementById("prod-imagen-input");
  const wrap = document.getElementById("prod-imagen-preview-wrap");
  const img = document.getElementById("prod-imagen-preview");
  const pickButton = document.getElementById("prod-imagen-elegir");
  const fileName = document.getElementById("prod-imagen-nombre");
  if (!input || !wrap || !img) return;

  if (pickButton) pickButton.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    _productoImagenProcesada = null;
    window.__BC_PRODUCT_IMAGE_FILE__ = null;
    input.dataset.processing = "false";
    revocarPreviewImagenProducto();
    setMsg("msg-prod-imagen", "", true);
    if (!file) { wrap.classList.add("hidden"); return; }
    const error = validarArchivoImagenProducto(file);
    if (error) {
      setMsg("msg-prod-imagen", error, false);
      input.value = "";
      wrap.classList.add("hidden");
      if (fileName) fileName.textContent = "Sin imagen";
      return;
    }

    input.dataset.processing = "true";
    if (pickButton) pickButton.disabled = true;
    if (fileName) fileName.textContent = "Preparando imagen…";
    try {
      const processed = await prepararImagenProductoCuadrada(file);
      _productoImagenProcesada = processed;
      window.__BC_PRODUCT_IMAGE_FILE__ = processed;
      _productoImagenPreviewObjectUrl = URL.createObjectURL(processed);
      img.src = _productoImagenPreviewObjectUrl;
      img.dataset.guardada = "false";
      wrap.classList.remove("hidden");
      if (fileName) fileName.textContent = processed.name + " · " + Math.max(1, Math.round(processed.size / 1024)) + " KB";
      setMsg("msg-prod-imagen", "Imagen recortada a formato cuadrado y optimizada (máximo 512 × 512).", true);
    } catch (errorProcesamiento) {
      setMsg("msg-prod-imagen", errorProcesamiento && errorProcesamiento.message
        ? errorProcesamiento.message : "No se pudo preparar la imagen.", false);
      input.value = "";
      wrap.classList.add("hidden");
      if (fileName) fileName.textContent = "Sin imagen";
    } finally {
      input.dataset.processing = "false";
      if (pickButton) pickButton.disabled = false;
    }
  });

  const removeButton = document.getElementById("prod-imagen-quitar");
  if (removeButton) removeButton.addEventListener("click", async () => {
    const editandoId = document.getElementById("prod-editando-id").value || null;
    input.value = "";
    input.dataset.processing = "false";
    _productoImagenProcesada = null;
    revocarPreviewImagenProducto();
    wrap.classList.add("hidden");
    if (fileName) fileName.textContent = "Sin imagen";
    if (editandoId && img.dataset.guardada === "true") {
      if (estaRealmenteDesconectado()) {
        setMsg("msg-prod-imagen", "Necesitas conexión para quitar la imagen guardada.", false);
        return;
      }
      const resultado = await quitarImagenProducto(editandoId);
      if (!resultado.ok) {
        setMsg("msg-prod-imagen", "No se pudo quitar la imagen.", false);
        return;
      }
      img.dataset.guardada = "false";
      setMsg("msg-prod-imagen", "Imagen quitada.", true);
      await refrescarProductos();
    }
  });
});

let _productosBusqueda = "";

function stockTotalProducto(productoId) {
  const product = (_cache.productos || []).find((p) => String(p.id) === String(productoId));
  const ids = product && product.inventario_mixto
    ? (_cache.productos || []).filter((p) => String(p.producto_padre_id) === String(productoId)).map((p) => String(p.id))
    : [String(productoId)];
  return (_cache.stock || [])
    .filter((s) => ids.includes(String(s.producto_id)))
    .reduce((acc, s) => acc + (Number(s.cantidad) || 0), 0);
}

function renderProductosLista() {
  const lista = document.getElementById("lista-productos");
  if (!lista) return;
  const todas = productosPrincipales(_cache.productos || []);
  if (todas.length === 0) {
    setEmpty("lista-productos", mensajeListaVacia("productos", "Todavía no hay productos cargados."));
    actualizarContador("productos-contador", 0, 0);
    return;
  }
  const termino = _productosBusqueda.trim().toLowerCase();
  const filtradas = termino
    ? todas.filter((p) => {
        const nom = (p.nombre || "").toLowerCase();
        const cat = p.categorias && p.categorias.nombre ? p.categorias.nombre.toLowerCase() : "";
        const uni = (p.unidad || "").toLowerCase();
        return nom.includes(termino) || cat.includes(termino) || uni.includes(termino);
      })
    : todas;
  if (filtradas.length === 0) {
    lista.innerHTML = '<p class="lista-estado">🔎 No encontramos productos con esos criterios.</p>'
      + '<button type="button" class="cc-accion mov-ver-todas-btn" data-tipo="productos">Ver todos</button>';
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
    if (puedeEditar) {
      botones = `<span class="lista-item-acciones">
          <button type="button" class="btn-editar-producto" data-id="${p.id}">Editar</button>
          <button type="button" class="btn-editar-producto btn-configurar-sabores" data-id="${p.id}">${p.inventario_mixto ? "Editar sabores" : "Configurar sabores"}</button>
          <button type="button" class="btn-toggle-producto" data-id="${p.id}" data-activo="${p.activo !== false}">${p.activo === false ? "Activar" : "Desactivar"}</button>
        </span>`;
    }
    const miniatura = p.imagen_url
      ? `<img src="${escHtml(p.imagen_url)}" alt="" class="producto-thumb" loading="lazy">`
      : `<span class="producto-thumb producto-thumb-vacia" aria-hidden="true"></span>`;
    const unidadTxt = p.unidad ? escHtml(p.unidad) : "—";

    const stockTot = stockTotalProducto(p.id);
    div.innerHTML = `${miniatura}<span>${escHtml(p.nombre)} <span class="muted">${p.categorias ? "· " + escHtml(p.categorias.nombre) : ""} · Base: ${unidadTxt}${p.presentacion_id && p.presentaciones ? " · Mayorista: " + escHtml(p.presentaciones.nombre) : ""}</span> ${estadoTxt}</span>
        <span class="muted">Normal $${money(p.precio_normal)} · Mayorista $${money(p.precio_mayorista)} · Stock ${fmtQtyProducto(stockTot)}</span>
        ${botones}`;
    if (p.inventario_mixto) div.innerHTML += '<small class="producto-mixto-tag">Inventario por sabores</small>';
    lista.appendChild(div);
  });
  actualizarContador("productos-contador", filtradas.length, todas.length);
}

async function refrescarProductos() {
  setLoading("lista-productos", "Cargando productos…");
  const [productos, categorias, almacenes] = await Promise.all([
    cargarProductos(), cargarCategorias(), cargarAlmacenes(),
  ]);
  _cache.productos = productos;
  renderResumen();

  fillSelect(document.getElementById("prod-categoria"), categorias, "id", (c) => c.nombre, true);
  fillSelect(document.getElementById("compra-producto"), productosOperativos(productos), "id", (p) => p.nombre);
  fillSelect(document.getElementById("compra-almacen"), almacenes, "id", (a) => a.nombre);

  const compraProductoSelect = document.getElementById("compra-producto");
  if (compraProductoSelect) actualizarSelectorCompraPresentacion(compraProductoSelect.value);

  const ppProductoSelect = document.getElementById("pp-producto-select");
  if (ppProductoSelect) {
    const seleccionPPActual = ppProductoSelect.value;
    const productosConfigurables = productosPrincipales(productos);
    fillSelect(ppProductoSelect, productosConfigurables, "id", (p) => p.nombre, true);
    if (seleccionPPActual && productosConfigurables.some((p) => p.id === seleccionPPActual)) {
      ppProductoSelect.value = seleccionPPActual;
    }
  }

  renderProductosLista();

  return { productos, almacenes };
}

safeInit("lista-productos", () => {
  document.getElementById("lista-productos").addEventListener("click", async (e) => {
    const btnVerTodas = e.target.closest(".mov-ver-todas-btn");
    if (btnVerTodas && btnVerTodas.dataset.tipo === "productos") {
      _productosBusqueda = "";
      const inputBuscar = document.getElementById("productos-buscar");
      if (inputBuscar) inputBuscar.value = "";
      renderProductosLista();
      return;
    }
    const btnConfigurarSabores = e.target.closest(".btn-configurar-sabores");
    if (btnConfigurarSabores) {
      const producto = (_cache.productos || []).find((p) => String(p.id) === String(btnConfigurarSabores.dataset.id));
      if (producto) {
        await iniciarEdicionProducto(producto);
        const toggle = document.getElementById("prod-inventario-mixto");
        const list = document.getElementById("prod-variantes-lista");
        if (toggle && !toggle.checked) toggle.checked = true;
        if (list && !list.querySelector(".prod-variante-row")) agregarFilaVarianteProducto("", "");
        sincronizarEditorVariantesProducto();
        setMsg("msg-productos", "Añade los sabores. Para evitar pérdidas, el stock genérico y los lotes abiertos deben quedar en cero antes de activar la conversión.", true);
        const section = document.getElementById("prod-inventario-mixto-settings");
        if (section) section.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
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

// Mantener el selector y las etiquetas de categoría sincronizados entre módulos.
if (!window.__BC_PRODUCT_CATEGORY_EVENTS__) {
  window.__BC_PRODUCT_CATEGORY_EVENTS__ = true;
  let categoryRefreshTimer = null;
  window.addEventListener("bc:data-changed", (event) => {
    const domains = event.detail && event.detail.domains || [];
    if (event.detail && event.detail.offline) return;
    const categoryChanged = domains.includes("categories");
    const productOrStockChanged = domains.includes("products") || domains.includes("stock");
    const productTab = document.getElementById("tab-productos");
    const productViewVisible = !!(productTab && productTab.classList.contains("visible"));
    if (!categoryChanged && !(event.detail && event.detail.remote && productViewVisible && productOrStockChanged)) return;
    clearTimeout(categoryRefreshTimer);
    categoryRefreshTimer = setTimeout(async () => {
      try {
        if (domains.includes("stock") && productViewVisible && typeof window.refrescarStockYSelects === "function") {
          await window.refrescarStockYSelects();
        } else if (typeof refrescarProductos === "function") await refrescarProductos();
        else if (typeof refrescarSelectorCategoriasProducto === "function") await refrescarSelectorCategoriasProducto();
      } catch (error) { console.warn("[BattleCruiser] No se pudo actualizar el catálogo de productos/categorías:", error); }
    }, 100);
  });
}
safeInit("productos-buscar", () => {
  const input = document.getElementById("productos-buscar");
  if (!input) return;
  input.addEventListener("input", () => {
    _productosBusqueda = input.value || "";
    renderProductosLista();
  });
});

function renderEditorVariantesProducto(variantes) {
  const list = document.getElementById("prod-variantes-lista");
  if (!list) return;
  list.innerHTML = "";
  (Array.isArray(variantes) ? variantes : []).forEach((variant) => agregarFilaVarianteProducto(variant.id || "", variant.variante_nombre || variant.nombre || ""));
}

function agregarFilaVarianteProducto(id, nombre) {
  const list = document.getElementById("prod-variantes-lista");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "prod-variante-row";
  if (id) row.dataset.varianteId = id;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "prod-variante-nombre";
  input.maxLength = 80;
  input.required = true;
  input.placeholder = "Nombre del sabor (ej. Manzana)";
  input.value = nombre || "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "cc-accion prod-variante-quitar";
  remove.textContent = "Quitar";
  remove.setAttribute("aria-label", "Quitar esta variante");
  row.append(input, remove);
  list.appendChild(row);
}

function sincronizarEditorVariantesProducto() {
  const toggle = document.getElementById("prod-inventario-mixto");
  const editor = document.getElementById("prod-variantes-editor");
  if (!toggle || !editor) return;
  editor.hidden = !toggle.checked;
  editor.classList.toggle("hidden", !toggle.checked);
}

safeInit("prod-inventario-mixto", () => {
  const toggle = document.getElementById("prod-inventario-mixto");
  const add = document.getElementById("prod-variante-agregar");
  const list = document.getElementById("prod-variantes-lista");
  if (!toggle || !add || !list) return;
  toggle.addEventListener("change", sincronizarEditorVariantesProducto);
  add.addEventListener("click", () => {
    agregarFilaVarianteProducto("", "");
    const inputs = list.querySelectorAll(".prod-variante-nombre");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  list.addEventListener("click", (e) => {
    const remove = e.target.closest(".prod-variante-quitar");
    if (remove) remove.closest(".prod-variante-row").remove();
  });
  sincronizarEditorVariantesProducto();
});

function obtenerVariantesFormularioProducto() {
  const list = document.getElementById("prod-variantes-lista");
  if (!list) return [];
  return Array.from(list.querySelectorAll(".prod-variante-row")).map((row) => ({
    id: row.dataset.varianteId || null,
    nombre: (row.querySelector(".prod-variante-nombre")?.value || "").trim()
  }));
}

async function iniciarEdicionProducto(p) {
  document.getElementById("prod-editando-id").value = p.id;
  document.getElementById("prod-nombre").value = p.nombre || "";
  const mixedToggle = document.getElementById("prod-inventario-mixto");
  if (mixedToggle) mixedToggle.checked = !!p.inventario_mixto;
  const cachedProducts = typeof _cache !== "undefined" && Array.isArray(_cache.productos) ? _cache.productos : [];
  const currentVariants = cachedProducts.filter((v) =>
    String(v.producto_padre_id) === String(p.id) && v.activo !== false
  );
  renderEditorVariantesProducto(currentVariants);
  sincronizarEditorVariantesProducto();
  document.getElementById("prod-unidad").value = p.unidad || "unidad";
  document.getElementById("prod-precio-normal").value = p.precio_normal != null ? p.precio_normal : "";
  document.getElementById("prod-precio-mayorista").value = p.precio_mayorista != null ? p.precio_mayorista : "";
  const formatoNameInput = document.getElementById("prod-formato-venta");
  const formatoFactorInput = document.getElementById("prod-formato-factor");
  const joinedPresentation = Array.isArray(p.presentaciones) ? p.presentaciones[0] : p.presentaciones;
  if (formatoNameInput) formatoNameInput.value = joinedPresentation && joinedPresentation.nombre ? joinedPresentation.nombre : "";
  if (formatoFactorInput) formatoFactorInput.value = "";
  if (p.presentacion_id && typeof cargarAsociacionesProducto === "function") {
    try {
      const associations = await cargarAsociacionesProducto(p.id);
      const wholesale = (Array.isArray(associations) ? associations : []).find((row) =>
        String(row.presentacion_id) === String(p.presentacion_id) && row.activo !== false
      );
      if (wholesale) {
        if (formatoNameInput && wholesale.presentaciones && wholesale.presentaciones.nombre) formatoNameInput.value = wholesale.presentaciones.nombre;
        if (formatoFactorInput && Number(wholesale.factor) > 0) formatoFactorInput.value = String(wholesale.factor);
      }
    } catch (error) {
      console.warn("[BattleCruiser] No se pudo cargar el formato mayorista del producto:", error);
    }
  }
  const categoriaSelect = document.getElementById("prod-categoria");
  if (categoriaSelect) {
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
  const unidadInput = document.getElementById("prod-unidad");
  const formatoNameInput = document.getElementById("prod-formato-venta");
  const formatoFactorInput = document.getElementById("prod-formato-factor");
  if (unidadInput) unidadInput.value = "unidad";
  if (formatoNameInput) formatoNameInput.value = "";
  if (formatoFactorInput) formatoFactorInput.value = "";
  const mixedToggle = document.getElementById("prod-inventario-mixto");
  if (mixedToggle) mixedToggle.checked = false;
  renderEditorVariantesProducto([]);
  sincronizarEditorVariantesProducto();
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
    const editandoId = document.getElementById("prod-editando-id").value || null;
    const unidad = editandoId
      ? (document.getElementById("prod-unidad").value.trim() || "unidad")
      : "unidad";
    const precio_normal = parseFloat(document.getElementById("prod-precio-normal").value);
    const precioMayoristaRaw = editandoId ? document.getElementById("prod-precio-mayorista").value.trim() : "";
    const precio_mayorista = precioMayoristaRaw === "" ? null : parseFloat(precioMayoristaRaw);
    const formatoMayorista = editandoId ? document.getElementById("prod-formato-venta").value.trim() : "";
    const formatoFactorRaw = editandoId ? document.getElementById("prod-formato-factor").value.trim() : "";
    const formatoFactor = formatoFactorRaw === "" ? null : Number(formatoFactorRaw);
    const submitBtn = e.target.querySelector("button[type='submit']");

    if (!categoria_id) { setMsg("msg-productos","Selecciona una categoría para guardar el producto.",false); document.getElementById("prod-categoria").focus(); return; }
    if (!(precio_normal > 0)) {
      setMsg("msg-productos", "El precio normal debe ser mayor a 0.", false);
      return;
    }
    if (precio_mayorista !== null && !(precio_mayorista > 0)) {
      setMsg("msg-productos", "El precio mayorista debe ser mayor a 0.", false);
      return;
    }
    if ((formatoMayorista && formatoFactorRaw === "") || (!formatoMayorista && formatoFactorRaw !== "")) {
      setMsg("msg-productos", "El formato de venta necesita nombre y unidades equivalentes.", false);
      return;
    }
    if (formatoMayorista && (!Number.isInteger(formatoFactor) || formatoFactor <= 0)) {
      setMsg("msg-productos", "Las unidades por formato deben ser un entero mayor a cero (ej. 24).", false);
      return;
    }
    if (formatoMayorista && precio_mayorista === null) {
      setMsg("msg-productos", "Para vender por ese formato, indica también el precio mayorista.", false);
      return;
    }
    if (formatoMayorista && unidad && formatoMayorista.toLocaleLowerCase() === unidad.toLocaleLowerCase()) {
      setMsg("msg-productos", "El formato debe tener un nombre distinto de la unidad base.", false);
      return;
    }

    const mixedToggle = document.getElementById("prod-inventario-mixto");
    const mixedEnabled = !!(editandoId && mixedToggle && mixedToggle.checked);
    const variants = obtenerVariantesFormularioProducto();
    const cachedProducts = typeof _cache !== "undefined" && Array.isArray(_cache.productos) ? _cache.productos : [];
    const previousProduct = editandoId
      ? cachedProducts.find((p) => String(p.id) === String(editandoId))
      : null;
    const needsMixedConfig = mixedEnabled || !!(previousProduct && previousProduct.inventario_mixto);
    if (mixedEnabled) {
      const names = variants.map((v) => v.nombre.toLocaleLowerCase());
      if (!variants.length || variants.some((v) => !v.nombre || v.nombre.length > 80)
          || new Set(names).size !== names.length) {
        setMsg("msg-productos", "Añade al menos un sabor y utiliza nombres únicos (máximo 80 caracteres).", false);
        return;
      }
    }
    if ((needsMixedConfig || formatoMayorista || (previousProduct && previousProduct.presentacion_id)) && !navigator.onLine) {
      setMsg("msg-productos", needsMixedConfig
        ? "Necesitas conexión para configurar el inventario por sabores. El producto no se ha guardado."
        : "Necesitas conexión para configurar el formato mayorista. El producto no se ha guardado.", false);
      return;
    }
    const archivoImagenInput = document.getElementById("prod-imagen-input");
    const archivoImagen = editandoId
      ? (_productoImagenProcesada || (archivoImagenInput.files && archivoImagenInput.files[0]))
      : null;
    if (archivoImagen) {
      const errorArchivo = validarArchivoImagenProducto(archivoImagen);
      if (errorArchivo) {
        setMsg("msg-prod-imagen", errorArchivo, false);
        return;
      }
    }
    submitBtn.disabled = true;
    const payload = editandoId ? {
      p_producto_id: editandoId,
      p_nombre: nombre,
      p_categoria_id: categoria_id,
      p_unidad: unidad,
      p_precio_normal: precio_normal,
      p_precio_mayorista: precio_mayorista,
    } : {
      p_nombre: nombre,
      p_categoria_id: categoria_id,
      p_unidad: unidad,
      p_precio_normal: precio_normal,
      p_precio_mayorista: precio_mayorista,
    };
    let resultado;
    if (needsMixedConfig) {
      resultado = await ejecutarProductoMixtoSinCola(editandoId, payload);
    } else if (navigator.onLine) {
      const catalog = await client.rpc("bc_guardar_producto_catalogo", {
        p_producto_id: editandoId,
        p_nombre: nombre,
        p_categoria_id: categoria_id,
        p_unidad: unidad || "unidad",
        p_precio_normal: precio_normal,
        p_precio_mayorista: precio_mayorista,
        p_presentacion_normal: unidad || "unidad",
        p_factor_normal: 1,
        p_presentacion_mayorista: formatoMayorista || null,
        p_factor_mayorista: formatoMayorista ? formatoFactor : null,
        p_idempotency_key: crypto.randomUUID()
      }).catch(error => ({ error }));
      resultado = catalog.error ? { ok: false, error: catalog.error } : { ok: true, offline: false, data: catalog.data };
    } else {
      resultado = await ejecutarOperacion(editandoId ? "producto_actualizar" : "producto", payload);
    }
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-productos", "No se pudo " + (editandoId ? "editar" : "crear") + ": " + explicarError(resultado.error, editandoId ? "editar producto" : "crear producto"), false);
      return;
    }
    const estabaEditando = !!editandoId;
    if (resultado.offline) {
      setMsg("msg-productos", "✓ Guardado localmente — se sincronizará al recuperar conexión."
        + (archivoImagen ? " La imagen no se pudo subir sin conexión: agrégala editando el producto una vez sincronizado." : ""), true);
      return;
    }
    const productoIdReal = editandoId || resultado.data;
    if (needsMixedConfig && productoIdReal) {
      const config = await client.rpc("configurar_producto_inventario_mixto", {
        p_producto_id: productoIdReal,
        p_habilitar: mixedEnabled,
        p_variantes: mixedEnabled ? variants : []
      });
      if (config.error) {
        setMsg("msg-productos", "Los datos básicos del producto se guardaron, pero no se pudo aplicar la configuración de sabores: " + explicarError(config.error, "configurar inventario mixto"), false);
        await refrescarProductos();
        return;
      }
    }
    if (needsMixedConfig && productoIdReal) {
      const formatConfig = await client.rpc("bc_guardar_producto_catalogo", {
        p_producto_id: productoIdReal,
        p_nombre: nombre,
        p_categoria_id: categoria_id,
        p_unidad: unidad || "unidad",
        p_precio_normal: precio_normal,
        p_precio_mayorista: precio_mayorista,
        p_presentacion_normal: unidad || "unidad",
        p_factor_normal: 1,
        p_presentacion_mayorista: formatoMayorista || null,
        p_factor_mayorista: formatoMayorista ? formatoFactor : null,
        p_idempotency_key: crypto.randomUUID()
      }).catch(error => ({ error }));
      if (formatConfig.error) {
        setMsg("msg-productos", "El producto se guardó, pero no se pudo aplicar el formato de venta: " + explicarError(formatConfig.error, "guardar formato mayorista"), false);
        await refrescarProductos();
        return;
      }
    }
    cancelarEdicionProducto();
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
    if (typeof window.bcNotificarCambioDatos === "function") {
      window.bcNotificarCambioDatos(estabaEditando ? "producto_actualizar" : "producto", false);
    }
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
    ? fmtQtyProducto(cantidad) + " × " + pp.presentaciones.nombre + " (1 " + pp.presentaciones.nombre + " = " + formatFactor(pp.factor) + " unidades)"
    : "—";
  document.getElementById("compra-resumen-equivalente").textContent = cantidadValida
    ? fmtQtyProducto(cantidad * pp.factor) + " unidades base"
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
