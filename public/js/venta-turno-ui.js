// ==== Battlecruiser · js/venta-turno-ui.js ====
// Almacén de venta = turno abierto del usuario (_turnoActual).
// M26.6-FE: agregar al carrito usando almacén del turno (no el select oculto vacío).
// M-SESION-VENTA: sin ABIERTO → "No puedes vender todavía" + [ABRIR SESIÓN]
//   → Turnos / Información (flujo existente). Apertura vía iniciar_sesion_operativa
//   (M22 / sesiones-operativas-ui). NO bc_iniciar_turno_sesion. NO abrir_turno.

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

function bcHtmlBloqueoSinSesionVenta() {
  return (
    '<p class="lista-estado" style="font-size:1.05rem;margin-bottom:8px"><strong>No puedes vender todavía</strong></p>' +
    '<p class="lista-estado">Necesitas tener una sesión abierta para realizar ventas.</p>' +
    '<p class="muted">El almacén lo define tu sesión operativa. Abrí la siguiente sesión elegible en Turnos (Información).</p>' +
    '<p id="venta-abrir-sesion-msg" class="msg" style="min-height:1.2em;margin:8px 0"></p>' +
    '<button type="button" id="venta-abrir-sesion-btn" class="cc-accion">ABRIR SESIÓN</button>'
  );
}

function bcSetMsgAbrirSesion(text, ok) {
  var el = document.getElementById("venta-abrir-sesion-msg");
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (ok ? "ok" : (text ? "error" : ""));
}

/**
 * Refresca turno_actual_usuario (M25 o refrescarTurnoActual) y actualiza panel Ventas.
 * No inventa turno local: solo lo que devuelve el backend.
 */
async function bcRefrescarTurnoYPanelVenta() {
  try {
    if (typeof window.__BC_M25_refrescarTurno === "function") {
      await window.__BC_M25_refrescarTurno();
    } else if (typeof refrescarTurnoActual === "function") {
      await refrescarTurnoActual();
    }
  } catch (e) {
    try { console.warn("[venta-turno-ui] refrescar turno", e); } catch (x) {}
  }
  try {
    if (typeof actualizarPanelAlmacenVenta === "function") actualizarPanelAlmacenVenta();
  } catch (e2) {}
  return typeof _turnoActual !== "undefined" ? _turnoActual : null;
}

/**
 * Navega a Turnos (tab ciclos) — Página 1 / Información del flujo existente.
 * La apertura de sesión la hace M22 / sesiones-operativas-ui con iniciar_sesion_operativa.
 */
function bcIrATurnosInformacion() {
  window.__BC_VENTA_ABRIR_SESION__ = true;
  if (typeof irATab === "function") {
    irATab("ciclos");
  } else {
    var b =
      document.querySelector('.tab-btn[data-tab="ciclos"]') ||
      document.querySelector('.tab-btn[data-tab="turnos"]');
    if (b) b.click();
  }
}

/**
 * Handler único del botón ABRIR SESIÓN.
 * 1) Reconsulta turno_actual_usuario.
 * 2) Si ya ABIERTO → habilita Ventas.
 * 3) Si no → abre flujo Turnos Información (sin crear turno, sin bc_iniciar).
 */
async function bcVentaAbrirSesionClick() {
  var btn = document.getElementById("venta-abrir-sesion-btn");
  if (btn && btn.dataset.bcBusy === "1") return;
  if (btn) {
    btn.dataset.bcBusy = "1";
    btn.disabled = true;
  }
  bcSetMsgAbrirSesion("Consultando estado de sesión…", true);
  try {
    if (!navigator.onLine) {
      bcSetMsgAbrirSesion("Necesitás conexión para abrir una sesión.", false);
      return;
    }
    var data = await bcRefrescarTurnoYPanelVenta();
    if (data && data.estado === "ABIERTO") {
      bcSetMsgAbrirSesion("✓ Sesión activa. Ya podés vender.", true);
      return;
    }
    bcSetMsgAbrirSesion("Abrí tu próxima sesión en Turnos (Información).", true);
    bcIrATurnosInformacion();
  } catch (e) {
    var msg = String((e && (e.message || e.details || e.code)) || e);
    bcSetMsgAbrirSesion("No se pudo consultar el estado: " + msg, false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.dataset.bcBusy = "0";
    }
  }
}

function actualizarPanelAlmacenVenta() {
  const almId = obtenerAlmacenIdOperativoVenta();
  const puedeVender = !!almId;
  const turnoActual = window._turnoActual || (typeof _turnoActual !== "undefined" ? _turnoActual : null);
  const pagoJornada = document.getElementById("venta-jornada-payment-wrap");
  const esJornadaActual = !!(turnoActual && String(turnoActual.bloque || "").toUpperCase() === "JORNADA"
    && turnoActual.turno_sesion_id && turnoActual.tramo_id);
  if (pagoJornada) {
    pagoJornada.hidden = !esJornadaActual;
    pagoJornada.classList.toggle("hidden", !esJornadaActual);
  }
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

/**
 * Tras iniciar_sesion_operativa en Turnos, al volver a Ventas se refresca el turno.
 * Un solo listener de visibilidad / tab (sin duplicar handlers de ABRIR SESIÓN).
 */
(function bcVentaEscucharRetornoDeTurnos() {
  if (window.__BC_VENTA_RETORNO_TURNOS__) return;
  window.__BC_VENTA_RETORNO_TURNOS__ = true;
  document.addEventListener(
    "click",
    function (e) {
      var tabBtn = e.target && e.target.closest && e.target.closest('.tab-btn[data-tab="ventas"]');
      if (!tabBtn) return;
      setTimeout(function () {
        bcRefrescarTurnoYPanelVenta();
      }, 80);
    },
    true
  );
})();

safeInit("venta-turno-ui", function () {
  const wrap = document.querySelector(".venta-almacen-wrap");
  const tab = document.getElementById("tab-ventas");
  if (tab && !document.getElementById("venta-sin-turno")) {
    const sin = document.createElement("div");
    sin.id = "venta-sin-turno";
    sin.className = "venta-sin-turno";
    sin.innerHTML = bcHtmlBloqueoSinSesionVenta();

    const panel = document.createElement("div");
    panel.className = "venta-almacen-operativo";
    panel.id = "venta-almacen-operativo";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML =
      '<span class="venta-almacen-label">🏪 Vendiendo desde</span>' +
      '<strong class="venta-almacen-nombre" id="venta-almacen-nombre">—</strong>' +
      '<span class="muted venta-almacen-hint">Definido por tu sesión abierta (no se puede cambiar aquí)</span>';

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
  if (sinExist) {
    if (!sinExist.dataset.bcSesionVenta) {
      sinExist.dataset.bcSesionVenta = "1";
      sinExist.innerHTML = bcHtmlBloqueoSinSesionVenta();
    }
  }

  // Un solo listener para ABRIR SESIÓN (no duplicar)
  var btnAbrir = document.getElementById("venta-abrir-sesion-btn");
  if (btnAbrir && !btnAbrir.dataset.bcAbrirSesionBound) {
    btnAbrir.dataset.bcAbrirSesionBound = "1";
    btnAbrir.addEventListener("click", function (e) {
      e.preventDefault();
      bcVentaAbrirSesionClick();
    });
  }

  // Compat: botón legacy Ver Turnos → mismo handler
  var btnIr = document.getElementById("venta-ir-turnos-btn");
  if (btnIr && !btnIr.dataset.bcIrTurnos) {
    btnIr.dataset.bcIrTurnos = "1";
    btnIr.addEventListener("click", function (e) {
      e.preventDefault();
      bcVentaAbrirSesionClick();
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
            setMsg("msg-venta", "No puedes vender sin una sesión abierta.", false);
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
            setMsg("msg-venta-linea", "No puedes vender sin una sesión abierta.", false);
          }
          actualizarPanelAlmacenVenta();
          return;
        }
        var prodSel = document.getElementById("venta-producto");
        if (prodSel && prodSel.value) bcAsegurarPrecioProductoVenta(prodSel.value);
      },
      true
    );
  }

  // M26.6-FE: click en tarjeta → agregarLineaVenta con almacén del turno
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
            setMsg("msg-venta-linea", "No puedes vender sin una sesión abierta.", false);
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
