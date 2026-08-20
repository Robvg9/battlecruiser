// ==== Battlecruiser · js/panel-contextual.js ====
// Panel contextual reutilizable: información y acciones según el elemento seleccionado.
// Solo datos reales de _cache (y líneas online opcionales). No toca offline/cola/RPC.

function _pcEsc(s) {
  return typeof escHtml === "function" ? escHtml(s) : String(s == null ? "" : s);
}

function _pcMoney(n) {
  return typeof money === "function" ? money(n) : String(n);
}

function _pcFecha(f) {
  if (!f) return "—";
  return typeof fechaHoraCompleta === "function" ? fechaHoraCompleta(f) : String(f);
}

function _pcPermiso(recurso, accion) {
  return typeof tienePermiso === "function" ? !!tienePermiso(recurso, accion) : false;
}

function abrirPanelContextual(tipo, id, opts) {
  const panel = document.getElementById("panel-contextual");
  const body = document.getElementById("panel-contextual-body");
  const titulo = document.getElementById("panel-contextual-titulo");
  const backdrop = document.getElementById("panel-contextual-backdrop");
  if (!panel || !body) return;

  body.innerHTML = '<p class="lista-estado">Cargando…</p>';
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  if (backdrop) backdrop.classList.remove("hidden");
  document.body.classList.add("panel-contextual-open");

  const labels = {
    producto: "Producto",
    almacen: "Almacén",
    transferencia: "Transferencia",
    venta: "Venta",
    vale: "Vale",
  };
  if (titulo) titulo.textContent = labels[tipo] || "Detalle";

  try {
    if (tipo === "producto") renderPanelProducto(id, body);
    else if (tipo === "almacen") renderPanelAlmacen(id, body);
    else if (tipo === "transferencia") renderPanelTransferencia(id, body, opts);
    else if (tipo === "venta") renderPanelVenta(id, body);
    else if (tipo === "vale") renderPanelVale(id, body);
    else body.innerHTML = '<p class="lista-estado">Contexto no soportado.</p>';
  } catch (e) {
    console.warn("[Battlecruiser] panel contextual:", e);
    body.innerHTML = '<p class="lista-estado">No se pudo mostrar el detalle.</p>';
  }
}

function cerrarPanelContextual() {
  const panel = document.getElementById("panel-contextual");
  const body = document.getElementById("panel-contextual-body");
  const backdrop = document.getElementById("panel-contextual-backdrop");
  if (panel) {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  }
  if (body) body.innerHTML = "";
  if (backdrop) backdrop.classList.add("hidden");
  document.body.classList.remove("panel-contextual-open");
}

function _pcFila(etiqueta, valor) {
  return '<div class="detalle-fila"><span class="detalle-etiqueta">' + _pcEsc(etiqueta) +
    '</span><span class="detalle-valor">' + valor + "</span></div>";
}

function _pcOfflineNota() {
  if (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado()) {
    return '<p class="muted detalle-nota">⚪ Sin conexión — mostrando datos locales disponibles.</p>';
  }
  return "";
}

function renderPanelProducto(id, body) {
  const p = (_cache.productos || []).find((x) => x.id === id);
  if (!p) {
    body.innerHTML = '<p class="lista-estado">Producto no encontrado en caché.</p>' + _pcOfflineNota();
    return;
  }
  const stockFilas = (_cache.stock || []).filter((s) => s.producto_id === id);
  const total = stockFilas.reduce((a, s) => a + (Number(s.cantidad) || 0), 0);
  let stockHtml = "";
  if (stockFilas.length === 0) {
    stockHtml = '<p class="muted">Sin stock registrado en caché.</p>';
  } else {
    stockHtml = stockFilas.map((s) => {
      const alm = s.almacenes && s.almacenes.nombre
        ? s.almacenes.nombre
        : (typeof resolverNombreAlmacen === "function" ? resolverNombreAlmacen(s.almacen_id) : _pcEsc(s.almacen_id));
      return _pcFila(alm, _pcMoney(s.cantidad) + " u");
    }).join("");
  }
  const img = p.imagen_url
    ? '<img src="' + _pcEsc(p.imagen_url) + '" alt="" class="panel-ctx-thumb" loading="lazy">'
    : '<span class="producto-thumb producto-thumb-vacia panel-ctx-thumb" aria-hidden="true"></span>';

  let acciones = "";
  if (_pcPermiso("productos", "editar")) {
    acciones += '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="editar-producto" data-id="' +
      _pcEsc(p.id) + '">Editar producto</button>';
  }
  acciones += '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="productos">Ir a Productos</button>';

  body.innerHTML =
    '<div class="panel-ctx-head">' + img +
    '<div><strong>' + _pcEsc(p.nombre) + '</strong>' +
    (p.activo === false ? ' <span class="muted">· Inactivo</span>' : "") +
    '</div></div>' +
    '<div class="detalle-cuerpo">' +
    _pcFila("Categoría", _pcEsc(p.categorias && p.categorias.nombre ? p.categorias.nombre : "—")) +
    _pcFila("Unidad", _pcEsc(p.unidad || "—")) +
    _pcFila("Precio normal", "$" + _pcMoney(p.precio_normal)) +
    _pcFila("Precio mayorista", p.precio_mayorista != null ? "$" + _pcMoney(p.precio_mayorista) : "—") +
    _pcFila("Stock total", _pcMoney(total) + " u") +
    '<div class="detalle-fila detalle-seccion"><span class="detalle-etiqueta">Stock por almacén</span></div>' +
    stockHtml +
    _pcOfflineNota() +
    '</div>' +
    (acciones ? '<div class="detalle-acciones panel-ctx-acciones">' + acciones + "</div>" : "");
}

function renderPanelAlmacen(id, body) {
  const a = (_cache.almacenes || []).find((x) => x.id === id);
  if (!a) {
    body.innerHTML = '<p class="lista-estado">Almacén no encontrado en caché.</p>' + _pcOfflineNota();
    return;
  }
  const stock = (_cache.stock || []).filter((s) => s.almacen_id === id);
  let unidades = 0, bajo = 0, agotados = 0;
  stock.forEach((s) => {
    const c = Number(s.cantidad) || 0;
    unidades += c;
    if (c <= 0) agotados++;
    else if (s.minimo != null && c <= Number(s.minimo)) bajo++;
  });
  const tipo = a.tipo === "mayorista" ? "Mayorista" : a.tipo === "venta" ? "Venta" : (a.tipo || "—");
  const activo = a.activo !== false;

  let acciones = "";
  acciones += '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="almacenes">Ir a Almacenes</button>';
  if (_pcPermiso("almacenes", "editar") || _pcPermiso("almacenes", "crear")) {
    acciones += '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="seleccionar-almacen" data-id="' +
      _pcEsc(a.id) + '">Ver en Almacenes</button>';
  }

  body.innerHTML =
    '<div class="detalle-cuerpo">' +
    _pcFila("Nombre", _pcEsc(a.nombre)) +
    _pcFila("Tipo", _pcEsc(tipo)) +
    _pcFila("Estado", activo ? "Activo" : "Inactivo") +
    _pcFila("Productos con stock", String(stock.length)) +
    _pcFila("Unidades", _pcMoney(unidades)) +
    _pcFila("Alertas", (agotados + bajo) > 0
      ? (agotados ? agotados + " agotado(s)" : "") + (agotados && bajo ? " · " : "") + (bajo ? bajo + " bajo mínimo" : "")
      : "Sin alertas") +
    _pcOfflineNota() +
    '</div>' +
    (acciones ? '<div class="detalle-acciones panel-ctx-acciones">' + acciones + "</div>" : "");
}

async function renderPanelTransferencia(id, body) {
  const t = (_cache.transferencias || []).find((x) => x.id === id);
  if (!t) {
    body.innerHTML = '<p class="lista-estado">Transferencia no encontrada en caché.</p>' + _pcOfflineNota();
    return;
  }
  let lineasHtml = "";
  try {
    if (navigator.onLine && t.id) {
      const { data: lineas, error } = await client
        .from("transferencias_lineas")
        .select("producto_id, cantidad, productos(nombre)")
        .eq("transferencia_id", t.id);
      if (!error && lineas && lineas.length) {
        lineasHtml = '<div class="detalle-fila detalle-seccion"><span class="detalle-etiqueta">Productos</span></div>' +
          lineas.map((l, i) => {
            const nom = (l.productos && l.productos.nombre) ||
              (typeof resolverNombreProducto === "function" ? resolverNombreProducto(l.producto_id) : l.producto_id);
            return _pcFila((i + 1) + ". " + nom, _pcMoney(l.cantidad) + " u");
          }).join("");
      }
    }
  } catch (e) {
    console.warn("[Battlecruiser] líneas transferencia panel:", e);
  }
  if (!lineasHtml) {
    lineasHtml = '<p class="muted">Líneas no disponibles' +
      (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado() ? " offline." : ".") + "</p>";
  }

  const acciones = '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="transferencias">Ir a Transferencias</button>';

  body.innerHTML =
    '<div class="detalle-cuerpo">' +
    _pcFila("Referencia", _pcEsc(t.id || "—")) +
    _pcFila("Fecha", _pcEsc(_pcFecha(t.fecha))) +
    _pcFila("Estado", _pcEsc(t.estado || "Registrada")) +
    _pcFila("Origen", _pcEsc(t.origen && t.origen.nombre ? t.origen.nombre : "—")) +
    _pcFila("Destino", _pcEsc(t.destino && t.destino.nombre ? t.destino.nombre : "—")) +
    lineasHtml +
    '<p class="muted detalle-nota">Modelo atómico: el stock se movió al registrar.</p>' +
    _pcOfflineNota() +
    '</div>' +
    '<div class="detalle-acciones panel-ctx-acciones">' + acciones + "</div>";
}

function renderPanelVenta(id, body) {
  const v = (_cache.ventas || []).find((x) => x.id === id);
  if (!v) {
    body.innerHTML = '<p class="lista-estado">Venta no encontrada en caché.</p>' + _pcOfflineNota();
    return;
  }
  const acciones = '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="ventas">Ir a Ventas</button>';
  body.innerHTML =
    '<div class="detalle-cuerpo">' +
    _pcFila("Referencia", _pcEsc(v.id || "—")) +
    _pcFila("Fecha", _pcEsc(_pcFecha(v.fecha))) +
    _pcFila("Almacén", _pcEsc(v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "—")) +
    _pcFila("Total", "$" + _pcMoney(v.total)) +
    _pcOfflineNota() +
    '</div>' +
    '<div class="detalle-acciones panel-ctx-acciones">' + acciones + "</div>";
}

function renderPanelVale(id, body) {
  const v = (_cache.vales || []).find((x) => x.id === id);
  if (!v) {
    body.innerHTML = '<p class="lista-estado">Vale no encontrado en caché.</p>' + _pcOfflineNota();
    return;
  }
  const acciones = '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="vales">Ir a Vales</button>';
  body.innerHTML =
    '<div class="detalle-cuerpo">' +
    _pcFila("Referencia", _pcEsc(v.id || "—")) +
    _pcFila("Fecha", _pcEsc(_pcFecha(v.fecha))) +
    _pcFila("Tipo", _pcEsc(v.tipo || "—")) +
    _pcFila("Producto", _pcEsc(v.productos && v.productos.nombre ? v.productos.nombre : "—")) +
    _pcFila("Almacén", _pcEsc(v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "—")) +
    _pcFila("Cantidad", _pcMoney(v.cantidad) + " u") +
    _pcOfflineNota() +
    '</div>' +
    '<div class="detalle-acciones panel-ctx-acciones">' + acciones + "</div>";
}

safeInit("panel-contextual", () => {
  const cerrarBtn = document.getElementById("panel-contextual-cerrar");
  if (cerrarBtn) cerrarBtn.addEventListener("click", cerrarPanelContextual);
  const backdrop = document.getElementById("panel-contextual-backdrop");
  if (backdrop) backdrop.addEventListener("click", cerrarPanelContextual);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const panel = document.getElementById("panel-contextual");
      if (panel && !panel.classList.contains("hidden")) cerrarPanelContextual();
    }
  });

  // Delegación global: abrir panel desde listas con data-ctx o ids conocidos.
  document.addEventListener("click", (e) => {
    const accion = e.target.closest(".panel-ctx-accion");
    if (accion) {
      e.preventDefault();
      e.stopPropagation();
      const act = accion.dataset.pcAction;
      if (act === "ir-tab" && accion.dataset.tab && typeof irATab === "function") {
        cerrarPanelContextual();
        irATab(accion.dataset.tab);
      } else if (act === "editar-producto" && accion.dataset.id) {
        const p = (_cache.productos || []).find((x) => x.id === accion.dataset.id);
        if (p && typeof iniciarEdicionProducto === "function") {
          cerrarPanelContextual();
          if (typeof irATab === "function") irATab("productos");
          iniciarEdicionProducto(p);
        }
      } else if (act === "seleccionar-almacen" && accion.dataset.id) {
        cerrarPanelContextual();
        if (typeof irATab === "function") irATab("almacenes");
        if (typeof seleccionarAlmacen === "function") seleccionarAlmacen(accion.dataset.id);
      }
      return;
    }

    // No interceptar botones de acción internos (editar, toggle, etc.).
    if (e.target.closest("button, a, input, select, label")) return;

    const ctx = e.target.closest("[data-ctx-tipo][data-ctx-id]");
    if (ctx) {
      e.preventDefault();
      abrirPanelContextual(ctx.getAttribute("data-ctx-tipo"), ctx.getAttribute("data-ctx-id"));
      return;
    }
    const trf = e.target.closest(".trf-item[data-trf-id]");
    if (trf && trf.getAttribute("data-trf-id")) {
      // Complementa el detalle existente: abre panel contextual unificado.
      abrirPanelContextual("transferencia", trf.getAttribute("data-trf-id"));
      return;
    }
    const vale = e.target.closest(".vale-item[data-vale-id]");
    if (vale && vale.getAttribute("data-vale-id")) {
      abrirPanelContextual("vale", vale.getAttribute("data-vale-id"));
      return;
    }
    const venta = e.target.closest("[data-venta-id]");
    if (venta && venta.getAttribute("data-venta-id")) {
      abrirPanelContextual("venta", venta.getAttribute("data-venta-id"));
    }
  });

  // Almacén seleccionado → panel contextual.
  const almSel = document.getElementById("alm-selector");
  if (almSel) {
    almSel.addEventListener("change", () => {
      if (almSel.value) abrirPanelContextual("almacen", almSel.value);
    });
  }
});
