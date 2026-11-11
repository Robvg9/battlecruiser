// ==== Battlecruiser · js/almacenes.js ====
// Selector y gestión de almacenes + stock del panel.
// M26.6-FE: estados explícitos de carga de stock (nunca "Cargando…" infinito).
// Query stock sin embeds + safety timeout.
// Bloque 6/7 + DAP-1: tipos UI almacenamiento|minorista|mayorista → RPC venta|mayorista|almacenamiento.

let _almacenSeleccionadoId = null;
/** idle | loading | ok | error */
let _stockCargaEstado = "idle";
let _stockCargaError = null;
let _stockCargaPromise = null;
let _stockVistaCargaEstado = "idle";
let _stockVistaCargaError = null;
let _stockVistaCargaPromise = null;
let _stockVistaRequestId = 0;

var BC_STOCK_TIMEOUT_MS = 12000;

function etiquetaTipoAlmacen(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "almacenamiento") return "Almacenamiento";
  if (t === "minorista" || t === "venta") return "Minorista";
  if (t === "mayorista") return "Mayorista";
  return t ? String(tipo) : "Almacenamiento";
}

/** UI / form value → contrato RPC crear_almacen / editar_almacen */
function tipoAlmacenUiARpc(tipo) {
  if (typeof window.__BC_M277_tipoUiARpc === "function") {
    return window.__BC_M277_tipoUiARpc(tipo);
  }
  const t = String(tipo || "").toLowerCase();
  if (t === "minorista" || t === "venta") return "venta";
  if (t === "mayorista") return "mayorista";
  if (t === "almacenamiento") return "almacenamiento";
  return t;
}

function mismoIdAlmacen(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function stockDelAlmacen(almacenId) {
  if (!almacenId) return [];
  return (_cache.stock_visual || []).filter(function (s) {
    return s && mismoIdAlmacen(s.almacen_id, almacenId);
  });
}

function cargarStockVisualAlmacenes(force) {
  if (_stockVistaCargaPromise && !force) return _stockVistaCargaPromise;
  if (_stockVistaCargaEstado === "ok" && !force) {
    return Promise.resolve(_cache.stock_visual || []);
  }

  var requestId = ++_stockVistaRequestId;
  _stockVistaCargaEstado = "loading";
  _stockVistaCargaError = null;
  renderPanelAlmacenSeleccionado();

  var pending = (async function () {
    try {
      if (!client || typeof client.rpc !== "function") {
        throw new Error("Cliente de inventario no disponible.");
      }
      var pair = await Promise.all([
        client.rpc("inventario_enriquecido", { p_almacen_id: null }),
        client.rpc("inventario_mixto_enriquecido", { p_almacen_id: null })
      ]);
      var ordinaryResult = pair[0];
      var mixedResult = pair[1];
      if (!ordinaryResult || ordinaryResult.error) {
        throw new Error(ordinaryResult && ordinaryResult.error && (ordinaryResult.error.message || ordinaryResult.error.details) || "No se pudo leer el inventario por almacén.");
      }
      if (!mixedResult || mixedResult.error) {
        throw new Error(mixedResult && mixedResult.error && (mixedResult.error.message || mixedResult.error.details) || "No se pudo leer el inventario mixto por almacén.");
      }

      var warehouseIdByName = new Map();
      (_cache.almacenes || []).forEach(function (warehouse) {
        if (!warehouse || !warehouse.id) return;
        var key = String(warehouse.nombre || "").trim().toLocaleLowerCase("es");
        if (!key) return;
        if (warehouseIdByName.has(key)) warehouseIdByName.set(key, null);
        else warehouseIdByName.set(key, warehouse.id);
      });
      function resolveWarehouseId(row) {
        if (row && row.almacen_id) return row.almacen_id;
        var key = String(row && row.almacen || "").trim().toLocaleLowerCase("es");
        return warehouseIdByName.get(key) || null;
      }

      var mixedRows = Array.isArray(mixedResult.data) ? mixedResult.data : [];
      var mixedParentIds = new Set();
      var mixedVariantIds = new Set();
      mixedRows.forEach(function (row) {
        if (row && row.producto_id) mixedParentIds.add(String(row.producto_id));
        (Array.isArray(row && row.variantes) ? row.variantes : []).forEach(function (variant) {
          if (variant && variant.producto_id) mixedVariantIds.add(String(variant.producto_id));
        });
      });

      var productById = new Map();
      (_cache.productos || []).forEach(function (product) {
        if (product && product.id) productById.set(String(product.id), product);
      });
      var ordinaryRows = (Array.isArray(ordinaryResult.data) ? ordinaryResult.data : [])
        .filter(function (row) {
          var id = String(row && row.producto_id || "");
          return id && !mixedParentIds.has(id) && !mixedVariantIds.has(id);
        })
        .map(function (row) {
          var product = productById.get(String(row.producto_id));
          return Object.assign({}, row, {
            almacen_id: resolveWarehouseId(row),
            unidad: (product && product.unidad) || row.unidad || "unidad"
          });
        });

      var mixedViewRows = [];
      mixedRows.forEach(function (row) {
        var warehouseId = resolveWarehouseId(row);
        (Array.isArray(row && row.variantes) ? row.variantes : []).forEach(function (variant) {
          var variantId = variant && variant.producto_id || null;
          mixedViewRows.push({
            producto_id: variantId,
            producto: variant && variant.nombre || row.producto || "Inventario inicial sin distribuir",
            almacen: row.almacen,
            almacen_id: warehouseId,
            cantidad: Number(variant && variant.cantidad) || 0,
            minimo: variant && variant.minimo != null ? variant.minimo : null,
            estado: variant && variant.estado || (variantId ? "sin_minimo" : "sin_minimo"),
            unidad: variant && variant.unidad || row.unidad || "unidad",
            __bc_sin_producto: !variantId
          });
        });
      });

      var projectedRows = ordinaryRows.concat(mixedViewRows);
      if (requestId !== _stockVistaRequestId) return _cache.stock_visual || [];
      _cache.stock_visual = projectedRows;
      _stockVistaCargaEstado = "ok";
      _stockVistaCargaError = null;
      return projectedRows;
    } catch (error) {
      if (requestId === _stockVistaRequestId) {
        _cache.stock_visual = [];
        _stockVistaCargaEstado = "error";
        _stockVistaCargaError = error && error.message ? error.message : "Error de lectura";
      }
      return [];
    } finally {
      if (requestId === _stockVistaRequestId) {
        _stockVistaCargaPromise = null;
        renderPanelAlmacenSeleccionado();
      }
    }
  })();

  _stockVistaCargaPromise = pending;
  return pending;
}

function bcConTimeoutLocal(promesa, ms, etiqueta) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      var err = new Error("timeout:" + (etiqueta || "op"));
      err.bcTimeout = true;
      reject(err);
    }, ms || BC_STOCK_TIMEOUT_MS);
    Promise.resolve(promesa).then(
      function (v) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      },
      function (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function llenarSelectorAlmacenes(almacenes) {
  const sel = document.getElementById("alm-selector");
  if (!sel) return;
  const prev = _almacenSeleccionadoId || sel.value;
  sel.innerHTML = '<option value="">Elegí un almacén…</option>';
  (almacenes || []).forEach((a) => {
    const o = document.createElement("option");
    o.value = a.id;
    const estado = a.activo === false ? " · Inactivo" : "";
    o.textContent = a.nombre + " — " + etiquetaTipoAlmacen(a.tipo) + estado;
    if (a.activo === false) o.className = "alm-option-inactivo";
    sel.appendChild(o);
  });
  if (prev && (almacenes || []).some((a) => mismoIdAlmacen(a.id, prev))) {
    sel.value = prev;
    _almacenSeleccionadoId = prev;
  } else {
    _almacenSeleccionadoId = null;
    sel.value = "";
  }
  actualizarBotonesAccionesAlmacen();
}

function actualizarBotonesAccionesAlmacen() {
  const editar = document.getElementById("alm-editar-btn");
  const toggle = document.getElementById("alm-toggle-btn");
  const tiene = !!_almacenSeleccionadoId;
  if (editar) editar.disabled = !tiene;
  if (toggle) {
    toggle.disabled = !tiene;
    if (tiene) {
      const a = (_cache.almacenes || []).find((x) => mismoIdAlmacen(x.id, _almacenSeleccionadoId));
      toggle.textContent = a && a.activo === false ? "Activar almacén" : "Desactivar almacén";
    } else {
      toggle.textContent = "Activar / desactivar";
    }
  }
}

function renderPanelAlmacenSeleccionado() {
  const panel = document.getElementById("alm-info-panel");
  if (!panel) return;
  const id = _almacenSeleccionadoId;
  if (!id) {
    panel.innerHTML = '<p class="lista-estado">Elegí un almacén para ver su información y productos.</p>';
    renderProductosDelAlmacen(null);
    actualizarBotonesAccionesAlmacen();
    return;
  }
  const a = (_cache.almacenes || []).find((x) => mismoIdAlmacen(x.id, id));
  if (!a) {
    panel.innerHTML = '<p class="lista-estado">Almacén no encontrado.</p>';
    renderProductosDelAlmacen(null);
    return;
  }
  if (_stockVistaCargaEstado !== "ok") {
    const active = a.activo !== false;
    const message = _stockVistaCargaEstado === "error"
      ? "No se pudo confirmar el saldo actual del almacén."
      : "Calculando saldo actual de la jornada…";
    panel.innerHTML =
      '<div class="alm-info-grid">' +
        '<div class="alm-info-item"><span class="alm-info-label">Nombre</span><span class="alm-info-valor">' + escHtml(a.nombre) + "</span></div>" +
        '<div class="alm-info-item"><span class="alm-info-label">Tipo</span><span class="alm-info-valor">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span></div>" +
        '<div class="alm-info-item"><span class="alm-info-label">Estado</span><span class="alm-info-valor ' + (active ? "alm-estado-activo" : "alm-estado-inactivo") + '">' + (active ? "Activo" : "Inactivo") + "</span></div>" +
        '<div class="alm-info-item"><span class="alm-info-label">Inventario</span><span class="alm-info-valor">' + escHtml(message) + "</span></div>" +
      "</div>";
    renderProductosDelAlmacen(id);
    actualizarBotonesAccionesAlmacen();
    return;
  }

  const stock = stockDelAlmacen(id);
  const productosCount = stock.filter((row) => !row.__bc_sin_producto).length;
  let unidades = 0;
  let bajoMin = 0;
  let agotados = 0;
  let sinMinimo = 0;
  stock.forEach((row) => {
    const cant = Number(row.cantidad) || 0;
    unidades += cant;
    if (!row.__bc_sin_producto && (row.estado === "sin_minimo" || row.minimo == null || Number(row.minimo) <= 0)) sinMinimo++;
    if (cant <= 0) agotados++;
    else if (row.minimo != null && Number(row.minimo) > 0 && cant <= Number(row.minimo)) bajoMin++;
  });
  const activo = a.activo !== false;
  const fmtQty = (v) => typeof window.numberFmt === 'function' ? window.numberFmt(v) : String(v == null ? 0 : v);
  panel.innerHTML =
    '<div class="alm-info-grid">' +
      '<div class="alm-info-item"><span class="alm-info-label">Nombre</span><span class="alm-info-valor">' + escHtml(a.nombre) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Tipo</span><span class="alm-info-valor">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Estado</span><span class="alm-info-valor ' + (activo ? "alm-estado-activo" : "alm-estado-inactivo") + '">' + (activo ? "Activo" : "Inactivo") + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Productos</span><span class="alm-info-valor">' + productosCount + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Unidades</span><span class="alm-info-valor">' + fmtQty(unidades) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Alertas</span><span class="alm-info-valor">' +
        (bajoMin + agotados + sinMinimo > 0
          ? (agotados ? fmtQty(agotados) + " agotado(s)" : "") +
            (agotados && (bajoMin || sinMinimo) ? " · " : "") +
            (bajoMin ? fmtQty(bajoMin) + " bajo mínimo" : "") +
            (bajoMin && sinMinimo ? " · " : "") +
            (sinMinimo ? fmtQty(sinMinimo) + " sin mínimo" : "")
          : "Sin alertas") +
      "</span></div>" +
    "</div>";
  renderProductosDelAlmacen(id);
  actualizarBotonesAccionesAlmacen();
}

function renderProductosDelAlmacen(almacen_id) {
  const lista = document.getElementById("lista-stock");
  if (!lista) return;
  if (!almacen_id) {
    lista.innerHTML = '<p class="lista-estado">Elegí un almacén para ver sus productos.</p>';
    return;
  }

  if (_stockVistaCargaEstado === "idle" || _stockVistaCargaEstado === "loading") {
    lista.innerHTML = '<p class="lista-estado">Calculando saldo actual de la jornada…</p>';
    if (_stockVistaCargaEstado === "idle") cargarStockVisualAlmacenes(false);
    return;
  }
  if (_stockVistaCargaEstado === "error") {
    lista.innerHTML =
      '<p class="lista-estado">No se pudo confirmar el inventario actual' +
      (_stockVistaCargaError ? ": " + escHtml(String(_stockVistaCargaError).slice(0, 120)) : ".") +
      "</p>" +
      '<button type="button" class="cc-accion" id="bc-alm-stock-reintentar">Reintentar</button>';
    var btn = document.getElementById("bc-alm-stock-reintentar");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        cargarStockVisualAlmacenes(true);
      });
    }
    return;
  }

  const stock = stockDelAlmacen(almacen_id);
  if (stock.length === 0) {
    if (_stockCargaEstado === "ok") {
      lista.innerHTML = '<p class="lista-estado">Este almacén no tiene productos con stock registrado.</p>';
    } else if (_stockCargaEstado === "idle") {
      lista.innerHTML = '<p class="lista-estado">Cargando productos del almacén…</p>';
      cargarStockAlmacenes(false);
    } else {
      lista.innerHTML = '<p class="lista-estado">Cargando productos del almacén…</p>';
    }
    return;
  }

  const productosById = {};
  (_cache.productos || []).forEach((p) => { productosById[String(p.id)] = p; });
  lista.innerHTML = "";
  stock
    .slice()
    .sort((a, b) => {
      const pa = productosById[String(a.producto_id)];
      const pb = productosById[String(b.producto_id)];
      const na = (a.productos && a.productos.nombre) || (pa && pa.nombre) || "";
      const nb = (b.productos && b.productos.nombre) || (pb && pb.nombre) || "";
      return na.localeCompare(nb, "es");
    })
    .forEach((s) => {
      const p = productosById[String(s.producto_id)];
      const nombre = (s.productos && s.productos.nombre) || (p && p.nombre) || "—";
      const cat = p && p.categorias && p.categorias.nombre ? p.categorias.nombre : "";
      const imagen = p && p.imagen_url
        ? '<img src="' + escHtml(p.imagen_url) + '" alt="" class="producto-thumb" loading="lazy">'
        : '<span class="producto-thumb producto-thumb-vacia" aria-hidden="true"></span>';
      const cant = Number(s.cantidad) || 0;
      const bajo = s.minimo != null && Number(s.minimo) > 0 && cant <= Number(s.minimo);
      const sinMinimo = s.estado === "sin_minimo" || (!s.__bc_sin_producto && (s.minimo == null || Number(s.minimo) <= 0));
      const estadoStock = cant <= 0 ? "Agotado" : bajo ? "Bajo mínimo" : sinMinimo ? "Sin mínimo" : "";
      const div = document.createElement("div");
      div.className = "lista-item alm-producto-item" + (cant <= 0 ? " lista-item-inactivo" : "");
      div.innerHTML =
        imagen +
        '<span class="alm-prod-info"><span class="alm-prod-nombre">' + escHtml(nombre) + "</span>" +
        (cat ? '<span class="muted"> · ' + escHtml(cat) + "</span>" : "") +
        "</span>" +
        '<span class="muted alm-prod-cant"' + (bajo || cant <= 0 ? ' style="color:var(--wine)"' : "") + ">" +
        money(cant) + (estadoStock ? " · " + estadoStock : "") +
        "</span>";
      lista.appendChild(div);
    });
}

function seleccionarAlmacen(id) {
  _almacenSeleccionadoId = id || null;
  const sel = document.getElementById("alm-selector");
  if (sel) sel.value = id || "";
  renderPanelAlmacenSeleccionado();
  if (id && _stockCargaEstado !== "ok" && _stockCargaEstado !== "loading") {
    cargarStockAlmacenes(false);
  }
}

let _stockCargaForcedPromise = null;
function cargarStockAlmacenes(force, internalForcedRetry) {
  if (_stockCargaForcedPromise && !internalForcedRetry) return _stockCargaForcedPromise;
  if (_stockCargaEstado === "loading" && _stockCargaPromise) {
    if (!force) return _stockCargaPromise;
    // If an older read was already in flight at the moment a purchase committed,
    // wait for it and then issue a new, forced read. Never treat that older read
    // as confirmation of the post-commit balance.
    var pendingRead = _stockCargaPromise;
    _cache.stock = [];
    window.__BC_STOCK_CONFIRMED__ = false;
    if (_stockCargaForcedPromise) return _stockCargaForcedPromise;
    _stockCargaForcedPromise = pendingRead.catch(function () { return []; }).then(function () {
      return cargarStockAlmacenes(true, true);
    }).finally(function () { _stockCargaForcedPromise = null; });
    return _stockCargaForcedPromise;
  }
  if (_stockCargaEstado === "ok" && !force) {
    renderPanelAlmacenSeleccionado();
    if (_stockVistaCargaEstado !== "ok") cargarStockVisualAlmacenes(false);
    return Promise.resolve(_cache.stock || []);
  }
  if (force) {
    _cache.stock = [];
    window.__BC_STOCK_CONFIRMED__ = false;
    cargarStockVisualAlmacenes(true);
  }
  _stockCargaEstado = "loading";
  _stockCargaError = null;
  renderPanelAlmacenSeleccionado();

  _stockCargaPromise = (async function () {
    var safetyTimer = setTimeout(function () {
      if (_stockCargaEstado === "loading") {
        console.warn("[BattleCruiser] stock safety timeout");
        _stockCargaEstado = "error";
        _stockCargaError = "timeout de seguridad";
        _stockCargaPromise = null;
        try { renderPanelAlmacenSeleccionado(); } catch (e) {}
      }
    }, (BC_STOCK_TIMEOUT_MS || 12000) + 2500);

    try {
      var productosP = Promise.resolve();
      if (typeof cargarProductos === "function") {
        productosP = bcConTimeoutLocal(cargarProductos(), BC_STOCK_TIMEOUT_MS, "productos").then(function (p) {
          if (Array.isArray(p)) _cache.productos = p;
        }).catch(function () {});
      }

      // A forced refresh must bypass withCache entirely. Purchases and
      // transfers commit to Supabase first; reusing a fulfilled cache entry
      // leaves the stock validator reading the previous balance until reload.
      var stockRequest = force
        ? Promise.resolve().then(function () {
            return client.from("stock").select("producto_id, almacen_id, cantidad, minimo");
          }).then(function (result) {
            if (result && result.error) throw result.error;
            return result && Array.isArray(result.data) ? result.data : [];
          })
        : withCache("stock", function () {
            return client.from("stock").select("producto_id, almacen_id, cantidad, minimo");
          });
      var stockP = bcConTimeoutLocal(stockRequest, BC_STOCK_TIMEOUT_MS, "stock");

      var pair = await Promise.all([stockP, productosP]);
      var stock = pair[0];
      _cache.stock = Array.isArray(stock) ? stock : [];
      window.__BC_STOCK_CONFIRMED__ = true;
      window.__BC_STOCK_ERROR__ = null;
      _stockCargaEstado = "ok";
      _stockCargaError = null;
      try { if (typeof renderResumen === "function") renderResumen(); } catch (e) {}
      return _cache.stock;
    } catch (e) {
      console.warn("[BattleCruiser] cargarStockAlmacenes", e);
      window.__BC_STOCK_CONFIRMED__ = false;
      _stockCargaEstado = "error";
      _stockCargaError = (e && e.message) ? e.message : "Error de red";
      window.__BC_STOCK_ERROR__ = _stockCargaError;
      return [];
    } finally {
      clearTimeout(safetyTimer);
      _stockCargaPromise = null;
      if (!force) cargarStockVisualAlmacenes(false);
      renderPanelAlmacenSeleccionado();
    }
  })();

  if (force && !internalForcedRetry) {
    _stockCargaForcedPromise = _stockCargaPromise.finally(function () { _stockCargaForcedPromise = null; });
    return _stockCargaForcedPromise;
  }
  return _stockCargaPromise;
}

function cerrarFormAlmacen() {
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.reset();
  form.classList.add("hidden");
  const editId = document.getElementById("alm-editando-id");
  if (editId) editId.value = "";
  const submit = document.getElementById("alm-submit-btn");
  if (submit) submit.textContent = "Crear almacén";
  setMsg("msg-almacenes", "", true);
}

function abrirFormCrearAlmacen() {
  if (typeof window.__BC_M277_openCreateAlmacen === "function") {
    window.__BC_M277_openCreateAlmacen();
    return;
  }
  cerrarFormAlmacen();
  const form = document.getElementById("form-almacen");
  if (form) form.classList.remove("hidden");
  const nombre = document.getElementById("alm-nombre");
  if (nombre) nombre.focus();
}

function abrirFormEditarAlmacen() {
  if (typeof window.__BC_M277_openEditAlmacen === "function") {
    window.__BC_M277_openEditAlmacen();
    return;
  }
  if (!_almacenSeleccionadoId) return;
  const a = (_cache.almacenes || []).find((x) => mismoIdAlmacen(x.id, _almacenSeleccionadoId));
  if (!a) return;
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.classList.remove("hidden");
  document.getElementById("alm-editando-id").value = a.id;
  document.getElementById("alm-nombre").value = a.nombre || "";
  var tipo = a.tipo === "venta" ? "minorista" : (a.tipo || "");
  document.getElementById("alm-tipo").value = tipo;
  document.getElementById("alm-submit-btn").textContent = "Guardar cambios";
  document.getElementById("alm-nombre").focus();
}

async function refrescarAlmacenes() {
  setLoading("lista-almacenes", "Cargando almacenes…");
  const almacenes = await cargarAlmacenes();
  _cache.almacenes = almacenes;
  renderResumen();
  const lista = document.getElementById("lista-almacenes");
  if (lista) {
    if (almacenes.length === 0) {
      setEmpty("lista-almacenes", mensajeListaVacia("almacenes", "Todavía no hay almacenes cargados."));
    } else {
      lista.innerHTML = "";
      almacenes.forEach((a) => {
        const div = document.createElement("div");
        div.className = "lista-item" + (a.activo === false ? " lista-item-inactivo" : "");
        const estado = a.activo === false ? ' <span class="muted">· Inactivo</span>' : "";
        div.innerHTML = "<span>" + escHtml(a.nombre) + estado + '</span><span class="muted">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span>";
        lista.appendChild(div);
      });
    }
  }

  llenarSelectorAlmacenes(almacenes);
  renderPanelAlmacenSeleccionado();
  cargarStockAlmacenes(false);

  fillSelect(document.getElementById("trf-origen"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("trf-destino"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("vale-almacen"), almacenes, "id", (a) => a.nombre);
  return almacenes;
}

async function bcRefrescarStockYSelectsInterno() {
  try {
    const { productos } = await refrescarProductos();
    const productosMovimiento = typeof productosOperativos === "function"
      ? productosOperativos(productos)
      : productos.filter((p) => !p.inventario_mixto || !!p.producto_padre_id);
    fillSelect(document.getElementById("trf-producto"), productosMovimiento, "id", (p) => p.nombre);
    fillSelect(document.getElementById("vale-producto"), productosMovimiento, "id", (p) => p.nombre);
  } catch (e) {
    console.warn("[BattleCruiser] refrescarStockYSelects productos", e);
  }
  // Read the post-commit balance from Supabase, not from the last completed
  // cache load. This keeps Transfers immediately consistent after a purchase.
  const refreshedStock = await cargarStockAlmacenes(true);
  if (_stockCargaEstado !== "ok") {
    // Never leave stale quantities available to the transfer validator after a
    // committed operation if the fresh database read itself failed. Return a
    // safe empty result instead of throwing into offline reconciliation callers.
    _cache.stock = [];
    window.__BC_STOCK_CONFIRMED__ = false;
    console.warn("[BattleCruiser] No se pudo confirmar stock nuevo desde Supabase; las transferencias quedan bloqueadas hasta actualizar.");
    return [];
  }
  return refreshedStock;
}

let _bcStockSelectsRefreshPromise = null;
function refrescarStockYSelects() {
  if (_bcStockSelectsRefreshPromise) return _bcStockSelectsRefreshPromise;
  const current = bcRefrescarStockYSelectsInterno();
  _bcStockSelectsRefreshPromise = current.finally(function () { _bcStockSelectsRefreshPromise = null; });
  return _bcStockSelectsRefreshPromise;
}

safeInit("form-almacen", () => {
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("alm-nombre").value.trim();
    let tipoUi = document.getElementById("alm-tipo").value;
    const tipoRpc = tipoAlmacenUiARpc(tipoUi);
    const editandoId = (document.getElementById("alm-editando-id") || {}).value || "";
    const submitBtn = document.getElementById("alm-submit-btn") || e.target.querySelector("button[type='submit']");

    if (!nombre || !tipoRpc) {
      setMsg("msg-almacenes", "Completá nombre y tipo.", false);
      return;
    }

    submitBtn.disabled = true;
    let resultado;
    if (editandoId) {
      resultado = await editarAlmacen(editandoId, { p_nombre: nombre, p_tipo: tipoRpc });
    } else {
      resultado = await ejecutarOperacion("almacen", {
        p_nombre: nombre,
        p_tipo: tipoRpc,
      });
    }
    submitBtn.disabled = false;

    if (!resultado.ok) {
      setMsg("msg-almacenes", "No se pudo " + (editandoId ? "editar" : "crear") + ": " + explicarError(resultado.error, editandoId ? "editar almacén" : "crear almacén"), false);
      return;
    }
    if (resultado.offline) {
      setMsg("msg-almacenes", (editandoId ? "Cambios" : "Almacén") + " guardado(s), se sincronizará cuando vuelva la conexión.", true);
      cerrarFormAlmacen();
    } else {
      setMsg("msg-almacenes", editandoId ? "Almacén actualizado." : "Almacén creado.", true);
      cerrarFormAlmacen();
      await refrescarAlmacenes();
      await cargarStockAlmacenes(true);
      if (editandoId) seleccionarAlmacen(editandoId);
      else if (resultado.data && resultado.data.id) seleccionarAlmacen(resultado.data.id);
      else if (typeof resultado.data === "string") seleccionarAlmacen(resultado.data);
    }
  });
});

safeInit("almacenes-ui", () => {
  const sel = document.getElementById("alm-selector");
  if (sel) {
    sel.addEventListener("change", () => {
      seleccionarAlmacen(sel.value || null);
    });
  }

  const btnMenu = document.getElementById("alm-acciones-btn");
  const menu = document.getElementById("alm-acciones-menu");
  if (btnMenu && menu) {
    btnMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target !== btnMenu) {
        menu.classList.add("hidden");
      }
    });
  }

  const btnCrear = document.getElementById("alm-crear-btn");
  if (btnCrear) {
    btnCrear.addEventListener("click", () => {
      if (menu) menu.classList.add("hidden");
      abrirFormCrearAlmacen();
    });
  }
  const btnEditar = document.getElementById("alm-editar-btn");
  if (btnEditar) {
    btnEditar.addEventListener("click", () => {
      if (menu) menu.classList.add("hidden");
      abrirFormEditarAlmacen();
    });
  }
  const btnToggle = document.getElementById("alm-toggle-btn");
  if (btnToggle) {
    btnToggle.addEventListener("click", async () => {
      if (menu) menu.classList.add("hidden");
      if (!_almacenSeleccionadoId) return;
      const a = (_cache.almacenes || []).find((x) => mismoIdAlmacen(x.id, _almacenSeleccionadoId));
      if (!a) return;
      const nuevoActivo = a.activo === false;
      btnToggle.disabled = true;
      const resultado = await activarDesactivarAlmacen(a.id, nuevoActivo);
      btnToggle.disabled = false;
      if (!resultado.ok) {
        setMsg("msg-almacenes", "No se pudo cambiar el estado: " + explicarError(resultado.error, "cambiar estado de almacén"), false);
        return;
      }
      setMsg("msg-almacenes", resultado.offline
        ? "Cambio de estado guardado, se sincronizará cuando vuelva la conexión."
        : (nuevoActivo ? "Almacén activado." : "Almacén desactivado."), true);
      if (!resultado.offline) {
        await refrescarAlmacenes();
        await cargarStockAlmacenes(true);
        seleccionarAlmacen(a.id);
      }
    });
  }
  const btnCancelar = document.getElementById("alm-cancelar-btn");
  if (btnCancelar) btnCancelar.addEventListener("click", () => cerrarFormAlmacen());
});

async function editarAlmacen(almacen_id, cambios) {
  const payload = Object.assign({ p_almacen_id: almacen_id }, cambios || {});
  if (payload.p_tipo != null && payload.p_tipo !== "") {
    payload.p_tipo = tipoAlmacenUiARpc(payload.p_tipo);
  }
  const resultado = await ejecutarOperacion("almacen_actualizar", payload);
  if (resultado.ok && !resultado.offline) {
    await refrescarAlmacenes();
    await cargarStockAlmacenes(true);
  }
  return resultado;
}

async function activarDesactivarAlmacen(almacen_id, activo) {
  const resultado = await ejecutarOperacion("almacen_estado", {
    p_almacen_id: almacen_id,
    p_activo: !!activo,
  });
  if (resultado.ok && !resultado.offline) {
    await refrescarAlmacenes();
    await cargarStockAlmacenes(true);
  }
  return resultado;
}


// Actualiza el panel de almacenes cuando otra pestaña de la misma PWA confirma
// una operación de inventario. La navegación conserva su refresco habitual.
if (!window.__BC_ALMACENES_DATA_EVENTS__) {
  window.__BC_ALMACENES_DATA_EVENTS__ = true;
  let warehouseRefreshTimer = null;
  window.addEventListener("bc:data-changed", function (event) {
    const detail = event.detail || {};
    if (detail.offline) return;
    if (!detail.remote && ['almacen', 'almacen_actualizar', 'almacen_estado'].includes(detail.operation)) return;
    const domains = detail.domains || [];
    if (!domains.includes("warehouses") && !domains.includes("stock")) return;
    const tab = document.getElementById("tab-almacenes");
    if (!tab || !tab.classList.contains("visible")) return;
    clearTimeout(warehouseRefreshTimer);
    warehouseRefreshTimer = setTimeout(async function () {
      try {
        if (domains.includes("warehouses") && typeof refrescarAlmacenes === "function") await refrescarAlmacenes();
        if (typeof cargarStockAlmacenes === "function") await cargarStockAlmacenes(true);
      } catch (error) {
        console.warn("[BattleCruiser] No se pudo actualizar el panel de almacenes tras un cambio:", error);
      }
    }, 160);
  });
}
