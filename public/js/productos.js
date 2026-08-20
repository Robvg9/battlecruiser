// ==== Battlecruiser · js/productos.js ====
// Categorías, almacenes (carga básica), productos (CRUD, imagen), y formulario de compra.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

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

