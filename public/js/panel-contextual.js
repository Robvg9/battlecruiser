// ==== Battlecruiser · js/panel-contextual.js ====
// Panel contextual reutilizable. Datos reales de _cache. No toca offline/cola.

function _pcEnsureShell() {
  if (document.getElementById("panel-contextual")) return;
  if (!document.getElementById("panel-contextual-styles")) {
    var st = document.createElement("style");
    st.id = "panel-contextual-styles";
    st.textContent =
      ".panel-contextual-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:80}" +
      ".panel-contextual{position:fixed;top:0;right:0;width:min(100%,380px);height:100%;max-height:100%;" +
      "background:var(--surface,#12241f);border-left:1px solid rgba(201,162,77,.25);z-index:90;" +
      "display:flex;flex-direction:column;box-shadow:-8px 0 24px rgba(0,0,0,.35);overflow:hidden}" +
      ".panel-contextual.hidden{display:none!important}" +
      ".panel-contextual-backdrop.hidden{display:none!important}" +
      ".panel-contextual-header{display:flex;align-items:center;justify-content:space-between;" +
      "padding:12px 16px;border-bottom:1px solid rgba(201,162,77,.2);font-weight:600}" +
      ".panel-contextual-body{flex:1;overflow:auto;padding:12px 16px}" +
      ".panel-ctx-head{display:flex;gap:12px;align-items:center;margin-bottom:12px}" +
      ".panel-ctx-thumb{width:56px;height:56px;object-fit:cover;border-radius:8px}" +
      ".panel-ctx-acciones{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}" +
      "@media (max-width:640px){.panel-contextual{width:100%}}";
    document.head.appendChild(st);
  }
  var backdrop = document.createElement("div");
  backdrop.id = "panel-contextual-backdrop";
  backdrop.className = "panel-contextual-backdrop hidden";
  var panel = document.createElement("aside");
  panel.id = "panel-contextual";
  panel.className = "panel-contextual hidden";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Panel contextual");
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML =
    '<div class="panel-contextual-header">' +
    '<span id="panel-contextual-titulo">Detalle</span>' +
    '<button type="button" id="panel-contextual-cerrar" class="detalle-cerrar-btn" aria-label="Cerrar">&times;</button>' +
    "</div>" +
    '<div id="panel-contextual-body" class="panel-contextual-body"></div>';
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
}

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

function abrirPanelContextual(tipo, id) {
  _pcEnsureShell();
  var panel = document.getElementById("panel-contextual");
  var body = document.getElementById("panel-contextual-body");
  var titulo = document.getElementById("panel-contextual-titulo");
  var backdrop = document.getElementById("panel-contextual-backdrop");
  if (!panel || !body) return;
  body.innerHTML = '<p class="lista-estado">Cargando…</p>';
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  if (backdrop) backdrop.classList.remove("hidden");
  var labels = { producto: "Producto", almacen: "Almacén", transferencia: "Transferencia", venta: "Venta", vale: "Vale" };
  if (titulo) titulo.textContent = labels[tipo] || "Detalle";
  try {
    if (tipo === "producto") renderPanelProducto(id, body);
    else if (tipo === "almacen") renderPanelAlmacen(id, body);
    else if (tipo === "transferencia") renderPanelTransferencia(id, body);
    else if (tipo === "venta") renderPanelVenta(id, body);
    else if (tipo === "vale") renderPanelVale(id, body);
    else body.innerHTML = '<p class="lista-estado">Contexto no soportado.</p>';
  } catch (e) {
    console.warn("[Battlecruiser] panel contextual:", e);
    body.innerHTML = '<p class="lista-estado">No se pudo mostrar el detalle.</p>';
  }
}

function cerrarPanelContextual() {
  var panel = document.getElementById("panel-contextual");
  var body = document.getElementById("panel-contextual-body");
  var backdrop = document.getElementById("panel-contextual-backdrop");
  if (panel) { panel.classList.add("hidden"); panel.setAttribute("aria-hidden", "true"); }
  if (body) body.innerHTML = "";
  if (backdrop) backdrop.classList.add("hidden");
}

function renderPanelProducto(id, body) {
  var p = (_cache.productos || []).find(function (x) { return x.id === id; });
  if (!p) {
    body.innerHTML = '<p class="lista-estado">Producto no encontrado en caché.</p>' + _pcOfflineNota();
    return;
  }
  var stockFilas = (_cache.stock || []).filter(function (s) { return s.producto_id === id; });
  var total = stockFilas.reduce(function (a, s) { return a + (Number(s.cantidad) || 0); }, 0);
  var stockHtml = stockFilas.length === 0
    ? '<p class="muted">Sin stock registrado en caché.</p>'
    : stockFilas.map(function (s) {
        var alm = (s.almacenes && s.almacenes.nombre) ||
          (typeof resolverNombreAlmacen === "function" ? resolverNombreAlmacen(s.almacen_id) : s.almacen_id);
        return _pcFila(alm, _pcMoney(s.cantidad) + " u");
      }).join("");
  var img = p.imagen_url
    ? '<img src="' + _pcEsc(p.imagen_url) + '" alt="" class="panel-ctx-thumb" loading="lazy">'
    : '<span class="producto-thumb producto-thumb-vacia panel-ctx-thumb" aria-hidden="true"></span>';
  var acciones = "";
  if (_pcPermiso("productos", "editar")) {
    acciones += '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="editar-producto" data-id="' +
      _pcEsc(p.id) + '">Editar producto</button>';
  }
  acciones += '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="productos">Ir a Productos</button>';
  body.innerHTML =
    '<div class="panel-ctx-head">' + img + '<div><strong>' + _pcEsc(p.nombre) + '</strong>' +
    (p.activo === false ? ' <span class="muted">· Inactivo</span>' : "") + '</div></div>' +
    '<div class="detalle-cuerpo">' +
    _pcFila("Categoría", _pcEsc(p.categorias && p.categorias.nombre ? p.categorias.nombre : "—")) +
    _pcFila("Unidad", _pcEsc(p.unidad || "—")) +
    _pcFila("Precio normal", "$" + _pcMoney(p.precio_normal)) +
    _pcFila("Precio mayorista", p.precio_mayorista != null ? "$" + _pcMoney(p.precio_mayorista) : "—") +
    _pcFila("Stock total", _pcMoney(total) + " u") +
    '<div class="detalle-fila detalle-seccion"><span class="detalle-etiqueta">Stock por almacén</span></div>' +
    stockHtml + _pcOfflineNota() + '</div>' +
    (acciones ? '<div class="detalle-acciones panel-ctx-acciones">' + acciones + "</div>" : "");
}

function renderPanelAlmacen(id, body) {
  var a = (_cache.almacenes || []).find(function (x) { return x.id === id; });
  if (!a) {
    body.innerHTML = '<p class="lista-estado">Almacén no encontrado en caché.</p>' + _pcOfflineNota();
    return;
  }
  var stock = (_cache.stock || []).filter(function (s) { return s.almacen_id === id; });
  var unidades = 0, bajo = 0, agotados = 0;
  stock.forEach(function (s) {
    var c = Number(s.cantidad) || 0;
    unidades += c;
    if (c <= 0) agotados++;
    else if (s.minimo != null && c <= Number(s.minimo)) bajo++;
  });
  var tipo = a.tipo === "mayorista" ? "Mayorista" : a.tipo === "venta" ? "Venta" : (a.tipo || "—");
  var activo = a.activo !== false;
  var acciones = '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="almacenes">Ir a Almacenes</button>' +
    '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="seleccionar-almacen" data-id="' + _pcEsc(a.id) + '">Ver en Almacenes</button>';
  body.innerHTML =
    '<div class="detalle-cuerpo">' +
    _pcFila("Nombre", _pcEsc(a.nombre)) +
    _pcFila("Tipo", _pcEsc(tipo)) +
    _pcFila("Estado", activo ? "Activo" : "Inactivo") +
    _pcFila("Productos con stock", String(stock.length)) +
    _pcFila("Unidades", _pcMoney(unidades)) +
    _pcFila("Alertas", (agotados + bajo) > 0
      ? ((agotados ? agotados + " agotado(s)" : "") + (agotados && bajo ? " · " : "") + (bajo ? bajo + " bajo mínimo" : ""))
      : "Sin alertas") +
    _pcOfflineNota() + '</div>' +
    '<div class="detalle-acciones panel-ctx-acciones">' + acciones + "</div>";
}

async function renderPanelTransferencia(id, body) {
  var t = (_cache.transferencias || []).find(function (x) { return x.id === id; });
  if (!t) {
    body.innerHTML = '<p class="lista-estado">Transferencia no encontrada en caché.</p>' + _pcOfflineNota();
    return;
  }
  var lineasHtml = "";
  try {
    if (navigator.onLine && t.id) {
      var res = await client.from("transferencias_lineas")
        .select("producto_id, cantidad, productos(nombre)")
        .eq("transferencia_id", t.id);
      if (!res.error && res.data && res.data.length) {
        lineasHtml = '<div class="detalle-fila detalle-seccion"><span class="detalle-etiqueta">Productos</span></div>' +
          res.data.map(function (l, i) {
            var nom = (l.productos && l.productos.nombre) ||
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
  body.innerHTML =
    '<div class="detalle-cuerpo">' +
    _pcFila("Referencia", _pcEsc(t.id || "—")) +
    _pcFila("Fecha", _pcEsc(_pcFecha(t.fecha))) +
    _pcFila("Estado", _pcEsc(t.estado || "Registrada")) +
    _pcFila("Origen", _pcEsc(t.origen && t.origen.nombre ? t.origen.nombre : "—")) +
    _pcFila("Destino", _pcEsc(t.destino && t.destino.nombre ? t.destino.nombre : "—")) +
    lineasHtml +
    '<p class="muted detalle-nota">Modelo atómico: el stock se movió al registrar.</p>' +
    _pcOfflineNota() + '</div>' +
    '<div class="detalle-acciones panel-ctx-acciones">' +
    '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="transferencias">Ir a Transferencias</button></div>';
}

function renderPanelVenta(id, body) {
  var v = (_cache.ventas || []).find(function (x) { return x.id === id; });
  if (!v) {
    body.innerHTML = '<p class="lista-estado">Venta no encontrada en caché.</p>' + _pcOfflineNota();
    return;
  }
  body.innerHTML =
    '<div class="detalle-cuerpo">' +
    _pcFila("Referencia", _pcEsc(v.id || "—")) +
    _pcFila("Fecha", _pcEsc(_pcFecha(v.fecha))) +
    _pcFila("Almacén", _pcEsc(v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "—")) +
    _pcFila("Total", "$" + _pcMoney(v.total)) +
    _pcOfflineNota() + '</div>' +
    '<div class="detalle-acciones panel-ctx-acciones">' +
    '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="ventas">Ir a Ventas</button></div>';
}

function renderPanelVale(id, body) {
  var v = (_cache.vales || []).find(function (x) { return x.id === id; });
  if (!v) {
    body.innerHTML = '<p class="lista-estado">Vale no encontrado en caché.</p>' + _pcOfflineNota();
    return;
  }
  body.innerHTML =
    '<div class="detalle-cuerpo">' +
    _pcFila("Referencia", _pcEsc(v.id || "—")) +
    _pcFila("Fecha", _pcEsc(_pcFecha(v.fecha))) +
    _pcFila("Tipo", _pcEsc(v.tipo || "—")) +
    _pcFila("Producto", _pcEsc(v.productos && v.productos.nombre ? v.productos.nombre : "—")) +
    _pcFila("Almacén", _pcEsc(v.almacenes && v.almacenes.nombre ? v.almacenes.nombre : "—")) +
    _pcFila("Cantidad", _pcMoney(v.cantidad) + " u") +
    _pcOfflineNota() + '</div>' +
    '<div class="detalle-acciones panel-ctx-acciones">' +
    '<button type="button" class="cc-accion panel-ctx-accion" data-pc-action="ir-tab" data-tab="vales">Ir a Vales</button></div>';
}

safeInit("panel-contextual", function () {
  _pcEnsureShell();
  var cerrarBtn = document.getElementById("panel-contextual-cerrar");
  if (cerrarBtn) cerrarBtn.addEventListener("click", cerrarPanelContextual);
  var backdrop = document.getElementById("panel-contextual-backdrop");
  if (backdrop) backdrop.addEventListener("click", cerrarPanelContextual);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var panel = document.getElementById("panel-contextual");
      if (panel && !panel.classList.contains("hidden")) cerrarPanelContextual();
    }
  });

  document.addEventListener("click", function (e) {
    var accion = e.target.closest(".panel-ctx-accion");
    if (accion) {
      e.preventDefault();
      e.stopPropagation();
      var act = accion.dataset.pcAction;
      if (act === "ir-tab" && accion.dataset.tab && typeof irATab === "function") {
        cerrarPanelContextual();
        irATab(accion.dataset.tab);
      } else if (act === "editar-producto" && accion.dataset.id) {
        var p = (_cache.productos || []).find(function (x) { return x.id === accion.dataset.id; });
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
    if (e.target.closest("button, a, input, select, label")) return;
    var ctx = e.target.closest("[data-ctx-tipo][data-ctx-id]");
    if (ctx) {
      abrirPanelContextual(ctx.getAttribute("data-ctx-tipo"), ctx.getAttribute("data-ctx-id"));
      return;
    }
    var trf = e.target.closest(".trf-item[data-trf-id]");
    if (trf && trf.getAttribute("data-trf-id")) {
      abrirPanelContextual("transferencia", trf.getAttribute("data-trf-id"));
      return;
    }
    var vale = e.target.closest(".vale-item[data-vale-id]");
    if (vale && vale.getAttribute("data-vale-id")) {
      abrirPanelContextual("vale", vale.getAttribute("data-vale-id"));
      return;
    }
    var venta = e.target.closest("[data-venta-id]");
    if (venta && venta.getAttribute("data-venta-id")) {
      abrirPanelContextual("venta", venta.getAttribute("data-venta-id"));
    }
  });

  var almSel = document.getElementById("alm-selector");
  if (almSel) {
    almSel.addEventListener("change", function () {
      if (almSel.value) abrirPanelContextual("almacen", almSel.value);
    });
  }
});
