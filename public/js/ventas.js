// ==== Battlecruiser · js/ventas.js ====
// Ventas: detalle/auditoría de venta, catálogo de productos para vender, carrito, confirmación de venta e historial.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

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
  const fechaHora = venta.fecha ? fechaHoraCompleta(venta.fecha) : "—";
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
      if (esRpcFaltante(error)) {
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

// ---- El precio se decide SOLO en el servidor (RPC registrar_venta) según el
let ventaLineas = [];
let ventaAlmacenesTipo = {}; // id -> 'venta' | 'mayorista'
let ventaProductosPrecios = {}; // id -> { nombre, precio_normal, precio_mayorista }
let ventaProductosLista = []; // lista completa de productos, para el buscador
let ventaCategoriasLista = []; // Misión 9.3 (Tarea 2): categorías reales, para los filtros del catálogo
let catalogoCategoriaActiva = ""; // "" = Todos. Estado local de la pestaña, no una segunda cache.

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

  const almacenSelect = document.getElementById("venta-almacen");
  const productoSelect = document.getElementById("venta-producto");
  // Some layouts omit these optional selects (for example while a form is hidden
  // or the offline shell is still mounting). Never dereference an absent control.
  if (!almacenSelect || !productoSelect) {
    infoEl.textContent = "";
    infoEl.className = "msg";
    cantidadInput.removeAttribute("max");
    return;
  }

  const almacen_id = almacenSelect.value;
  const producto_id = productoSelect.value;

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

function agregarLineaVenta(producto_id, cantidad, almacen_id) {
  const tipo = ventaAlmacenesTipo[almacen_id];
  const producto = ventaProductosPrecios[producto_id];
  if (!producto) { setMsg("msg-venta-linea", "Producto no encontrado.", false); return false; }

  const precio = tipo === "mayorista" ? producto.precio_mayorista : producto.precio_normal;
  if (precio === null || precio === undefined) {
    setMsg("msg-venta-linea", "Este producto no tiene precio mayorista configurado.", false);
    return false;
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
    return false;
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
  renderVentaLineas();
  return true;
}

function renderCatalogoCategorias() {
  const cont = document.getElementById("catalogo-categorias");
  if (!cont) return;

  const chips = [{ id: "", nombre: "Todos" }, ...ventaCategoriasLista];
  cont.innerHTML = "";
  chips.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "catalogo-chip" + (catalogoCategoriaActiva === c.id ? " activo" : "");
    btn.textContent = c.nombre;
    btn.dataset.categoriaId = c.id;
    cont.appendChild(btn);
  });
}

function renderCatalogoGrid() {
  const grid = document.getElementById("catalogo-grid");
  if (!grid) return;

  const almacen_id = document.getElementById("venta-almacen") ? document.getElementById("venta-almacen").value : "";
  const disponibles = ventaProductosLista.filter((p) => {
    if (p.activo === false) return false;
    if (catalogoCategoriaActiva && p.categoria_id !== catalogoCategoriaActiva) return false;
    return true;
  });

  if (disponibles.length === 0) {
    grid.innerHTML = '<p class="lista-estado">No hay productos activos para mostrar en esta categoría.</p>';
    return;
  }

  const tipo = almacen_id ? ventaAlmacenesTipo[almacen_id] : null;
  grid.innerHTML = "";
  disponibles.forEach((p) => {
    const precio = tipo === "mayorista" ? p.precio_mayorista : p.precio_normal;
    const precioTxt = precio === null || precio === undefined ? "Sin precio" : "$" + money(precio);
    const stockTxt = almacen_id ? money(obtenerStockDisponible(p.id, almacen_id).valor) : null;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "catalogo-card";
    card.dataset.productoId = p.id;
    card.innerHTML = `
      ${p.imagen_url
        ? `<img src="${escHtml(p.imagen_url)}" alt="" class="catalogo-card-img" loading="lazy">`
        : `<span class="catalogo-card-img catalogo-card-img-vacia" aria-hidden="true"></span>`}
      <span class="catalogo-card-nombre">${escHtml(p.nombre)}</span>
      <span class="catalogo-card-precio">${precioTxt}</span>
      ${p.categorias ? `<span class="catalogo-card-categoria">${escHtml(p.categorias.nombre)}</span>` : ""}
      ${stockTxt !== null ? `<span class="catalogo-card-stock">Stock: ${stockTxt}</span>` : ""}
    `;
    grid.appendChild(card);
  });
}

safeInit("venta-vista-toggle", () => {
  const btnBuscador = document.getElementById("venta-vista-btn-buscador");
  const btnCatalogo = document.getElementById("venta-vista-btn-catalogo");
  const modoBuscador = document.getElementById("venta-modo-buscador");
  const modoCatalogo = document.getElementById("venta-modo-catalogo");
  if (!btnBuscador || !btnCatalogo || !modoBuscador || !modoCatalogo) return;

  function mostrar(vista) {
    const esCatalogo = vista === "catalogo";
    modoCatalogo.classList.toggle("hidden", !esCatalogo);
    modoBuscador.classList.toggle("hidden", esCatalogo);
    btnCatalogo.classList.toggle("activo", esCatalogo);
    btnBuscador.classList.toggle("activo", !esCatalogo);
    btnCatalogo.setAttribute("aria-pressed", String(esCatalogo));
    btnBuscador.setAttribute("aria-pressed", String(!esCatalogo));
    if (esCatalogo) renderCatalogoGrid(); // refleja el almacén/stock más reciente al entrar
  }

  btnBuscador.addEventListener("click", () => mostrar("buscador"));
  btnCatalogo.addEventListener("click", () => mostrar("catalogo"));
});

safeInit("catalogo-categorias", () => {
  document.getElementById("catalogo-categorias").addEventListener("click", (e) => {
    const chip = e.target.closest(".catalogo-chip");
    if (!chip) return;
    catalogoCategoriaActiva = chip.dataset.categoriaId || "";
    renderCatalogoCategorias();
    renderCatalogoGrid();
  });
});

safeInit("catalogo-grid", () => {
  document.getElementById("catalogo-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".catalogo-card");
    if (!card) return;
    const almacen_id = document.getElementById("venta-almacen").value;
    if (!almacen_id) { setMsg("msg-venta-linea", "Elegí un almacén.", false); return; }
    agregarLineaVenta(card.dataset.productoId, 1, almacen_id);
    renderCatalogoGrid(); // refleja el stock restante en la tarjeta
  });
});

// El catálogo depende del almacén elegido (precio y stock cambian), igual
// que ya le pasa a actualizarStockDisponibleUI() del buscador tradicional.
safeInit("venta-almacen-catalogo-sync", () => {
  document.getElementById("venta-almacen").addEventListener("change", renderCatalogoGrid);
});

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
        <span>${escHtml(linea.nombre)}</span>
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

safeInit("venta-producto-buscar", () => {
  const buscarInput = document.getElementById("venta-producto-buscar");
  const productoSelect = document.getElementById("venta-producto");
  const resultadosEl = document.getElementById("venta-producto-resultados");

  function cerrarResultados() {
    if (resultadosEl) { resultadosEl.classList.add("hidden"); resultadosEl.innerHTML = ""; }
  }

  function seleccionarProducto(p) {
    productoSelect.value = p.id;
    buscarInput.value = p.nombre;
    cerrarResultados();
    actualizarStockDisponibleUI();
  }

  buscarInput.addEventListener("input", () => {
    const termino = buscarInput.value.trim().toLowerCase();
    // Mantiene el <select> real filtrado (compatibilidad con quien prefiera
    const filtrados = termino
      ? ventaProductosLista.filter((p) => p.nombre.toLowerCase().includes(termino))
      : ventaProductosLista;
    fillSelect(productoSelect, filtrados, "id", (p) => p.nombre, true);

    if (!resultadosEl) return;
    if (!termino) { cerrarResultados(); return; }
    if (filtrados.length === 0) {
      resultadosEl.innerHTML = '<div class="venta-buscar-resultado-vacio">Sin coincidencias</div>';
      resultadosEl.classList.remove("hidden");
      return;
    }
    resultadosEl.innerHTML = "";
    filtrados.slice(0, 30).forEach((p) => {
      const div = document.createElement("div");
      div.className = "venta-buscar-resultado-item";
      div.textContent = p.nombre;
      div.addEventListener("click", () => seleccionarProducto(p));
      resultadosEl.appendChild(div);
    });
    resultadosEl.classList.remove("hidden");
  });

  buscarInput.addEventListener("focus", () => {
    if (buscarInput.value.trim()) buscarInput.dispatchEvent(new Event("input"));
  });

  document.addEventListener("click", (e) => {
    if (!resultadosEl || resultadosEl.classList.contains("hidden")) return;
    if (e.target === buscarInput || resultadosEl.contains(e.target)) return;
    cerrarResultados();
  });

  productoSelect.addEventListener("change", () => {
    // Si el producto se elige directo del <select> (sin usar el buscador),
    // el input de búsqueda no debe quedar con un texto que ya no aplica.
    const seleccionado = ventaProductosLista.find((p) => p.id === productoSelect.value);
    if (seleccionado) buscarInput.value = seleccionado.nombre;
  });
});

safeInit("form-venta-linea", () => {
  const form = document.getElementById("form-venta-linea");
  const almacenSelect = document.getElementById("venta-almacen");
  const productoSelect = document.getElementById("venta-producto");
  const cantidadInput = document.getElementById("venta-cantidad");

  // La venta entera pertenece a un solo almacén (el RPC recibe un único
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

    const ok = agregarLineaVenta(producto_id, cantidad, almacen_id);
    if (!ok) return;

    cantidadInput.value = "";
    productoSelect.value = "";
    buscarInputReset();
    actualizarStockDisponibleUI();
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

    const turnoActual = window._turnoActual || (typeof _turnoActual !== "undefined" ? _turnoActual : null);
    const esJornada = !!(turnoActual && String(turnoActual.bloque || "").toUpperCase() === "JORNADA");
    const paymentSelect = document.getElementById("venta-metodo-pago");
    const metodoPago = esJornada && paymentSelect ? String(paymentSelect.value || "").trim().toUpperCase() : "";
    if (esJornada && (!turnoActual.turno_sesion_id || !turnoActual.tramo_id)) {
      setMsg("msg-venta", "No se puede verificar la jornada y el tramo activo. Actualiza el contexto de Turnos antes de registrar la venta.", false);
      if (typeof window.__BC_M25_refrescarTurno === "function") {
        try { await window.__BC_M25_refrescarTurno(); } catch (e) {}
      }
      return;
    }
    if (esJornada && !["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"].includes(metodoPago)) {
      setMsg("msg-venta", "Selecciona la forma de pago antes de confirmar esta venta de Jornada.", false);
      if (paymentSelect) paymentSelect.focus();
      return;
    }

    const total = ventaLineas.reduce((s, l) => s + l.subtotal, 0);
    const confirmText = "¿Confirmar venta por $" + money(total) + "?" +
      (esJornada ? " Forma de pago: " + metodoPago.toLowerCase() + ". Quedará vinculada a esta jornada." : "") +
      " Esto descuenta stock real.";
    if (!window.confirm(confirmText)) {
      return;
    }

    enviandoVenta = true;
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = "Procesando...";
    setMsg("msg-venta", "Procesando venta…", true);

    const p_lineas = ventaLineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }));
    const ventaPayload = { p_almacen_id: almacen_id, p_lineas };
    const tipoOperacionVenta = esJornada ? "venta_jornada" : "venta";
    if (esJornada) {
      ventaPayload.p_turno_sesion_id = turnoActual.turno_sesion_id;
      ventaPayload.p_turno_tramo_id = turnoActual.tramo_id;
      ventaPayload.p_metodo_pago = metodoPago;
    }
    const resultado = await ejecutarOperacion(tipoOperacionVenta, ventaPayload);

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
    if (paymentSelect) paymentSelect.value = "";
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
  const [productos, almacenes, categorias] = await Promise.all([
    cargarProductos(), cargarAlmacenes(), cargarCategorias(),
  ]);

  ventaAlmacenesTipo = {};
  almacenes.forEach((a) => { ventaAlmacenesTipo[a.id] = a.tipo; });

  ventaProductosPrecios = {};
  productos.forEach((p) => {
    ventaProductosPrecios[p.id] = {
      nombre: p.nombre, precio_normal: p.precio_normal, precio_mayorista: p.precio_mayorista,
    };
  });

  ventaProductosLista = productos;
  ventaCategoriasLista = categorias;
  const buscarInput = document.getElementById("venta-producto-buscar");
  if (buscarInput) buscarInput.value = "";

  fillSelect(document.getElementById("venta-almacen"), almacenes, "id", (a) => a.nombre, true);
  fillSelect(document.getElementById("venta-producto"), productos, "id", (p) => p.nombre, true);
  renderVentaLineas();
  actualizarStockDisponibleUI();
  renderCatalogoCategorias();
  renderCatalogoGrid();
  await refrescarVentasHistorial();
}

// R5: estado de busqueda del historial de ventas en memoria. Patron
let _ventasBusqueda = "";

async function refrescarVentasHistorial() {
  setLoading("lista-ventas", "Cargando ventas…");
  const { data } = await client
    .from("ventas")
    .select("id, fecha, total, almacenes(nombre)")
    .order("fecha", { ascending: false })
    .limit(20);

  _cache.ventas = data || [];
  renderResumen();
  // R5: el render aplica el filtro de busqueda sobre _cache.ventas sin
  // modificarlo. Si _cache.ventas esta vacio, muestra el estado vacio.
  renderVentasHistorial();
}

// R5: render del historial de ventas accionable. Filtra _cache.ventas en
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
    div.innerHTML = `<span>${v.almacenes ? escHtml(v.almacenes.nombre) : "—"} <span class="muted">· #${v.id ? idCorto(v.id) : "—"}</span></span>
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

