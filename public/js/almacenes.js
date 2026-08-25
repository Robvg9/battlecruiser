// ==== Battlecruiser · js/almacenes.js ====
// Selector y gestión de almacenes + stock del panel.
// M26.6-FE: estados explícitos de carga de stock (nunca "Cargando…" infinito).
// Query stock sin embeds + safety timeout.
// Bloque 6/7: tipos almacenamiento | minorista | mayorista (legacy venta → Minorista).

let _almacenSeleccionadoId = null;
/** idle | loading | ok | error */
let _stockCargaEstado = "idle";
let _stockCargaError = null;
let _stockCargaPromise = null;

var BC_STOCK_TIMEOUT_MS = 12000;

function etiquetaTipoAlmacen(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "almacenamiento") return "Almacenamiento";
  if (t === "minorista" || t === "venta") return "Minorista";
  if (t === "mayorista") return "Mayorista";
  return t ? String(tipo) : "Almacenamiento";
}

function mismoIdAlmacen(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function stockDelAlmacen(almacenId) {
  if (!almacenId) return [];
  return (_cache.stock || []).filter(function (s) {
    return s && mismoIdAlmacen(s.almacen_id, almacenId);
  });
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
  const stock = stockDelAlmacen(id);
  const productosCount = stock.length;
  let unidades = 0;
  let bajoMin = 0;
  let agotados = 0;
  stock.forEach((s) => {
    const cant = Number(s.cantidad) || 0;
    unidades += cant;
    if (cant <= 0) agotados++;
    else if (s.minimo != null && cant <= Number(s.minimo)) bajoMin++;
  });
  const activo = a.activo !== false;
  panel.innerHTML =
    '<div class="alm-info-grid">' +
      '<div class="alm-info-item"><span class="alm-info-label">Nombre</span><span class="alm-info-valor">' + escHtml(a.nombre) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Tipo</span><span class="alm-info-valor">' + escHtml(etiquetaTipoAlmacen(a.tipo)) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Estado</span><span class="alm-info-valor ' + (activo ? "alm-estado-activo" : "alm-estado-inactivo") + '">' + (activo ? "Activo" : "Inactivo") + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Productos</span><span class="alm-info-valor">' + productosCount + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Unidades</span><span class="alm-info-valor">' + money(unidades) + "</span></div>" +
      '<div class="alm-info-item"><span class="alm-info-label">Alertas</span><span class="alm-info-valor">' +
        (bajoMin + agotados > 0
          ? (agotados ? agotados + " agotado(s)" : "") + (agotados && bajoMin ? " · " : "") + (bajoMin ? bajoMin + " bajo mínimo" : "")
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

  if (_stockCargaEstado === "loading") {
    lista.innerHTML = '<p class="lista-estado">Cargando productos del almacén…</p>';
    return;
  }
  if (_stockCargaEstado === "error") {
    lista.innerHTML =
      '<p class="lista-estado">No se pudo cargar el stock' +
      (_stockCargaError ? ": " + escHtml(String(_stockCargaError).slice(0, 120)) : ".") +
      "</p>" +
      '<button type="button" class="cc-accion" id="bc-alm-stock-reintentar">Reintentar</button>';
    var btn = document.getElementById("bc-alm-stock-reintentar");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        cargarStockAlmacenes(true);
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
      // Solo disparar una vez desde idle
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
      const bajo = s.minimo != null && cant <= Number(s.minimo);
      const div = document.createElement("div");
      div.className = "lista-item alm-producto-item" + (cant <= 0 ? " lista-item-inactivo" : "");
      div.innerHTML =
        imagen +
        '<span class="alm-prod-info"><span class="alm-prod-nombre">' + escHtml(nombre) + "</span>" +
        (cat ? '<span class="muted"> · ' + escHtml(cat) + "</span>" : "") +
        "</span>" +
        '<span class="muted alm-prod-cant"' + (bajo || cant <= 0 ? ' style="color:var(--wine)"' : "") + ">" +
        money(cant) + (cant <= 0 ? " · Agotado" : bajo ? " · Bajo mínimo" : "") +
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

/**
 * Carga única de stock (deduplicada). force=true reinicia tras error.
 * M26.6-FE: select plano (sin embeds) + safety timer → nunca "Cargando…" eterno.
 */
function cargarStockAlmacenes(force) {
  if (_stockCargaEstado === "loading" && _stockCargaPromise) {
    return _stockCargaPromise;
  }
  if (_stockCargaEstado === "ok" && !force) {
    renderPanelAlmacenSeleccionado();
    return Promise.resolve(_cache.stock || []);
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

      // Sin embeds: evita hang/RLS en joins; nombres desde _cache.productos
      var stockP = bcConTimeoutLocal(
        withCache("stock", function () {
          return client
            .from("stock")
            .select("producto_id, almacen_id, cantidad, minimo");
        }),
        BC_STOCK_TIMEOUT_MS,
        "stock"
      );

      var pair = await Promise.all([stockP, productosP]);
      var stock = pair[0];
      _cache.stock = Array.isArray(stock) ? stock : [];
      _stockCargaEstado = "ok";
      _stockCargaError = null;
      try { if (typeof renderResumen === "function") renderResumen(); } catch (e) {}
      return _cache.stock;
    } catch (e) {
      console.warn("[BattleCruiser] cargarStockAlmacenes", e);
      _stockCargaEstado = "error";
      _stockCargaError = (e && e.message) ? e.message : "Error de red";
      return [];
    } finally {
      clearTimeout(safetyTimer);
      _stockCargaPromise = null;
      renderPanelAlmacenSeleccionado();
    }
  })();

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
  // Bloque 6: preferir modal si está disponible
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
  // Bloque 7: preferir modal si está disponible
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
  // Cargar stock en paralelo sin bloquear el retorno de almacenes
  cargarStockAlmacenes(false);

  fillSelect(document.getElementById("trf-origen"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("trf-destino"), almacenes, "id", (a) => a.nombre);
  fillSelect(document.getElementById("vale-almacen"), almacenes, "id", (a) => a.nombre);
  return almacenes;
}

async function refrescarStockYSelects() {
  try {
    const { productos } = await refrescarProductos();
    fillSelect(document.getElementById("trf-producto"), productos, "id", (p) => p.nombre);
    fillSelect(document.getElementById("vale-producto"), productos, "id", (p) => p.nombre);
  } catch (e) {
    console.warn("[BattleCruiser] refrescarStockYSelects productos", e);
  }
  // force solo si aún no hay ok (evita carreras con refrescarAlmacenes)
  await cargarStockAlmacenes(_stockCargaEstado !== "ok");
}

safeInit("form-almacen", () => {
  const form = document.getElementById("form-almacen");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("alm-nombre").value.trim();
    let tipo = document.getElementById("alm-tipo").value;
    if (tipo === "venta") tipo = "minorista";
    const editandoId = (document.getElementById("alm-editando-id") || {}).value || "";
    const submitBtn = document.getElementById("alm-submit-btn") || e.target.querySelector("button[type='submit']");

    if (!nombre || !tipo) {
      setMsg("msg-almacenes", "Completá nombre y tipo.", false);
      return;
    }

    submitBtn.disabled = true;
    let resultado;
    if (editandoId) {
      resultado = await editarAlmacen(editandoId, { p_nombre: nombre, p_tipo: tipo });
    } else {
      resultado = await ejecutarOperacion("almacen", {
        p_nombre: nombre,
        p_tipo: tipo,
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
  if (payload.p_tipo === "venta") payload.p_tipo = "minorista";
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
