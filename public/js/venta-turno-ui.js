// ==== Battlecruiser · js/venta-turno-ui.js ====
// Almacén de venta = turno abierto del usuario (_turnoActual).
// M26.6-FE: agregar al carrito usando almacén del turno (no el select oculto vacío).

function obtenerAlmacenIdOperativoVenta() {
  if (typeof _turnoActual === "undefined" || !_turnoActual) return null;
  if (_turnoActual.estado !== "ABIERTO") return null;
  return _turnoActual.almacen_id || null;
}

function nombreAlmacenOperativoVenta(id) {
  if (!id) return "—";
  try {
    if (typeof _cache !== "undefined" && Array.isArray(_cache.almacenes)) {
      const a = _cache.almacenes.find(function (x) { return String(x.id) === String(id); });
      if (a && a.nombre) return a.nombre;
    }
  } catch (e) {}
  return "Almacén del turno";
}

/** Asegura precios/nombre en ventaProductosPrecios desde _cache si faltan. */
function bcAsegurarPrecioProductoVenta(productoId) {
  if (!productoId) return false;
  try {
    if (typeof ventaProductosPrecios !== "undefined" && ventaProductosPrecios[productoId]) return true;
  } catch (e) {}
  var p = null;
  try {
    p = (_cache.productos || []).find(function (x) { return String(x.id) === String(productoId); });
  } catch (e2) {}
  if (!p) return false;
  try {
    if (typeof ventaProductosPrecios === "undefined") window.ventaProductosPrecios = {};
    ventaProductosPrecios[productoId] = {
      nombre: p.nombre,
      precio_normal: p.precio_normal,
      precio_mayorista: p.precio_mayorista,
    };
  } catch (e3) {}
  try {
    if (typeof ventaAlmacenesTipo !== "undefined") {
      var almId = obtenerAlmacenIdOperativoVenta();
      if (almId && !ventaAlmacenesTipo[almId]) {
        var alm = (_cache.almacenes || []).find(function (a) { return String(a.id) === String(almId); });
        if (alm) ventaAlmacenesTipo[almId] = alm.tipo || "venta";
        else ventaAlmacenesTipo[almId] = "venta";
      }
    }
  } catch (e4) {}
  return true;
}

function bcSincronizarSelectAlmacenTurno() {
  var almId = obtenerAlmacenIdOperativoVenta();
  var sel = document.getElementById("venta-almacen");
  if (!sel || !almId) return almId;
  if (![].some.call(sel.options, function (o) { return o.value === almId; })) {
    var opt = document.createElement("option");
    opt.value = almId;
    opt.textContent = nombreAlmacenOperativoVenta(almId);
    sel.appendChild(opt);
  }
  sel.value = almId;
  try {
    if (typeof ventaAlmacenesTipo !== "undefined" && !ventaAlmacenesTipo[almId]) {
      var alm = (_cache.almacenes || []).find(function (a) { return String(a.id) === String(almId); });
      ventaAlmacenesTipo[almId] = (alm && alm.tipo) || "venta";
    }
  } catch (e) {}
  return almId;
}

function actualizarPanelAlmacenVenta() {
  const almId = obtenerAlmacenIdOperativoVenta();
  const puedeVender = !!almId;
  const sinTurno = document.getElementById("venta-sin-turno");
  const bloque = document.getElementById("venta-operativa-bloque");
  const nombreEl = document.getElementById("venta-almacen-nombre");
  if (nombreEl) nombreEl.textContent = almId ? nombreAlmacenOperativoVenta(almId) : "—";
  if (sinTurno) sinTurno.classList.toggle("hidden", puedeVender);
  if (bloque) bloque.classList.toggle("hidden", !puedeVender);

  var extraIds = [
    "bc-venta-carrito-bar",
    "bc-venta-pos-layout",
    "venta-modo-buscador",
    "venta-modo-catalogo",
    "form-venta-linea",
    "venta-lineas",
    "venta-total-wrap",
    "btn-confirmar-venta",
    "msg-venta",
    "msg-venta-linea",
    "venta-stock-disponible",
    "venta-vista-toggle",
    "catalogo-categorias",
    "catalogo-grid"
  ];
  extraIds.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (bloque && bloque.contains(el)) return;
    el.classList.toggle("hidden", !puedeVender);
    if (!puedeVender) {
      el.setAttribute("aria-hidden", "true");
      el.style.setProperty("display", "none", "important");
    } else {
      el.removeAttribute("aria-hidden");
      el.style.removeProperty("display");
    }
  });

  var tab = document.getElementById("tab-ventas");
  if (tab) tab.classList.toggle("bc-venta-sin-turno", !puedeVender);

  const sel = document.getElementById("venta-almacen");
  if (sel) {
    sel.disabled = true;
    sel.classList.add("hidden");
    sel.setAttribute("aria-hidden", "true");
    if (almId) bcSincronizarSelectAlmacenTurno();
    else sel.value = "";
  }

  if (!almId && typeof ventaLineas !== "undefined" && ventaLineas.length > 0) {
    ventaLineas = [];
    if (typeof renderVentaLineas === "function") renderVentaLineas();
  }

  if (puedeVender) {
    if (typeof cargarStockAlmacenes === "function" && !(_cache.stock && _cache.stock.length)) {
      try { cargarStockAlmacenes(false); } catch (e) {}
    }
    if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
    if (typeof actualizarStockDisponibleUI === "function") actualizarStockDisponibleUI();
  }
}

(function parchearRefrescarVentas() {
  if (typeof refrescarVentas !== "function") return;
  const _orig = refrescarVentas;
  window.refrescarVentas = async function () {
    await _orig.apply(this, arguments);
    actualizarPanelAlmacenVenta();
  };
})();

(function parchearRefrescarTurnoActual() {
  if (typeof refrescarTurnoActual !== "function") return;
  const _orig = refrescarTurnoActual;
  window.refrescarTurnoActual = async function () {
    await _orig.apply(this, arguments);
    actualizarPanelAlmacenVenta();
  };
})();

(function parchearLectoresAlmacen() {
  if (typeof actualizarStockDisponibleUI === "function") {
    const _orig = actualizarStockDisponibleUI;
    window.actualizarStockDisponibleUI = function () {
      bcSincronizarSelectAlmacenTurno();
      return _orig.apply(this, arguments);
    };
  }
  if (typeof renderCatalogoGrid === "function") {
    const _orig = renderCatalogoGrid;
    window.renderCatalogoGrid = function () {
      bcSincronizarSelectAlmacenTurno();
      return _orig.apply(this, arguments);
    };
  }
})();

safeInit("venta-turno-ui", function () {
  const wrap = document.querySelector(".venta-almacen-wrap");
  const tab = document.getElementById("tab-ventas");
  if (tab && !document.getElementById("venta-sin-turno")) {
    const sin = document.createElement("div");
    sin.id = "venta-sin-turno";
    sin.className = "venta-sin-turno";
    sin.innerHTML =
      '<p class="lista-estado" style="font-size:1.05rem;margin-bottom:8px"><strong>Ventas no disponibles</strong></p>' +
      '<p class="lista-estado">Necesitas tener un turno abierto para realizar ventas.</p>' +
      '<p class="muted">El almacén del turno será el único punto desde el que podés vender. Un turno de otro usuario no habilita ventas.</p>' +
      '<button type="button" id="venta-ir-turnos-btn" class="cc-accion">Ver Turnos</button>';

    const panel = document.createElement("div");
    panel.className = "venta-almacen-operativo";
    panel.id = "venta-almacen-operativo";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML =
      '<span class="venta-almacen-label">🏪 Vendiendo desde</span>' +
      '<strong class="venta-almacen-nombre" id="venta-almacen-nombre">—</strong>' +
      '<span class="muted venta-almacen-hint">Definido por tu turno abierto (no se puede cambiar aquí)</span>';

    if (wrap) {
      wrap.replaceWith(panel);
    } else {
      tab.insertBefore(panel, tab.firstChild);
    }
    tab.insertBefore(sin, panel);

    const bloque = document.createElement("div");
    bloque.id = "venta-operativa-bloque";
    bloque.className = "hidden";
    panel.parentNode.insertBefore(bloque, panel);
    bloque.appendChild(panel);

    const stopIds = { "ventas-buscar": true, "ventas-contador": true, "lista-ventas": true, "venta-detalle": true };
    let node = bloque.nextSibling;
    while (node) {
      const next = node.nextSibling;
      if (node.nodeType === 1) {
        if (node.tagName === "H3" && /Historial/i.test(node.textContent || "")) break;
        if (node.id && stopIds[node.id]) break;
      }
      bloque.appendChild(node);
      node = next;
    }
  } else if (wrap) {
    const sel = document.getElementById("venta-almacen");
    if (sel) {
      sel.disabled = true;
      sel.classList.add("hidden");
    }
  }

  var sinExist = document.getElementById("venta-sin-turno");
  if (sinExist && !sinExist.dataset.bcM265) {
    sinExist.dataset.bcM265 = "1";
    sinExist.innerHTML =
      '<p class="lista-estado" style="font-size:1.05rem;margin-bottom:8px"><strong>Ventas no disponibles</strong></p>' +
      '<p class="lista-estado">Necesitas tener un turno abierto para realizar ventas.</p>' +
      '<p class="muted">El almacén del turno será el único punto desde el que podés vender. Un turno de otro usuario no habilita ventas.</p>' +
      '<button type="button" id="venta-ir-turnos-btn" class="cc-accion">Ver Turnos</button>';
  }

  const btnIr = document.getElementById("venta-ir-turnos-btn");
  if (btnIr && !btnIr.dataset.bcIrTurnos) {
    btnIr.dataset.bcIrTurnos = "1";
    btnIr.addEventListener("click", function () {
      if (typeof irATab === "function") irATab("ciclos");
      else {
        var b = document.querySelector('.tab-btn[data-tab="ciclos"]') ||
                document.querySelector('.tab-btn[data-tab="turnos"]');
        if (b) b.click();
      }
    });
  }

  const btnConf = document.getElementById("btn-confirmar-venta");
  if (btnConf) {
    btnConf.addEventListener(
      "click",
      function (e) {
        const almId = bcSincronizarSelectAlmacenTurno();
        if (!almId) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (typeof setMsg === "function") {
            setMsg("msg-venta", "No puedes vender sin un turno abierto con almacén.", false);
          }
          actualizarPanelAlmacenVenta();
        }
      },
      true
    );
  }

  const formLinea = document.getElementById("form-venta-linea");
  if (formLinea) {
    formLinea.addEventListener(
      "submit",
      function (e) {
        const almId = bcSincronizarSelectAlmacenTurno();
        if (!almId) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (typeof setMsg === "function") {
            setMsg("msg-venta-linea", "No puedes vender sin un turno abierto.", false);
          }
          actualizarPanelAlmacenVenta();
          return;
        }
        // Asegurar producto en mapa de precios antes del handler original
        var prodSel = document.getElementById("venta-producto");
        if (prodSel && prodSel.value) bcAsegurarPrecioProductoVenta(prodSel.value);
      },
      true
    );
  }

  // M26.6-FE: click en tarjeta → agregarLineaVenta con almacén del turno
  // (el handler original lee #venta-almacen que puede estar vacío).
  const grid = document.getElementById("catalogo-grid");
  if (grid && !grid.dataset.bcM266Cart) {
    grid.dataset.bcM266Cart = "1";
    grid.addEventListener(
      "click",
      function (e) {
        var card = e.target.closest(".catalogo-card");
        if (!card) return;
        var almId = bcSincronizarSelectAlmacenTurno();
        if (!almId) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (typeof setMsg === "function") {
            setMsg("msg-venta-linea", "No puedes vender sin un turno abierto.", false);
          }
          actualizarPanelAlmacenVenta();
          return;
        }
        var productoId = card.dataset.productoId;
        if (!productoId) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        bcAsegurarPrecioProductoVenta(productoId);
        function doAdd() {
          if (typeof agregarLineaVenta === "function") {
            agregarLineaVenta(productoId, 1, almId);
          }
          if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
        }
        if (typeof cargarStockAlmacenes === "function" && !(_cache.stock && _cache.stock.length)) {
          Promise.resolve(cargarStockAlmacenes(false)).then(doAdd).catch(doAdd);
        } else {
          doAdd();
        }
      },
      true
    );
  }

  actualizarPanelAlmacenVenta();
});
