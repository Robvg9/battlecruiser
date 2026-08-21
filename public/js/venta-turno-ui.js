// ==== Battlecruiser · js/venta-turno-ui.js ====
// Sesión 6/30 — Almacén de venta = turno abierto (_turnoActual).
// No hay selector libre. Backend (m14) es la autoridad final.

function obtenerAlmacenIdOperativoVenta() {
  if (typeof _turnoActual === "undefined" || !_turnoActual) return null;
  if (_turnoActual.estado !== "ABIERTO") return null;
  return _turnoActual.almacen_id || null;
}

function nombreAlmacenOperativoVenta(id) {
  if (!id) return "—";
  try {
    if (typeof _cache !== "undefined" && Array.isArray(_cache.almacenes)) {
      const a = _cache.almacenes.find(function (x) { return x.id === id; });
      if (a && a.nombre) return a.nombre;
    }
  } catch (e) {}
  return "Almacén del turno";
}

function actualizarPanelAlmacenVenta() {
  const almId = obtenerAlmacenIdOperativoVenta();
  const sinTurno = document.getElementById("venta-sin-turno");
  const bloque = document.getElementById("venta-operativa-bloque");
  const nombreEl = document.getElementById("venta-almacen-nombre");
  if (nombreEl) nombreEl.textContent = almId ? nombreAlmacenOperativoVenta(almId) : "—";
  if (sinTurno) sinTurno.classList.toggle("hidden", !!almId);
  if (bloque) bloque.classList.toggle("hidden", !almId);

  // Compatibilidad: si aún existiera un select residual, dejarlo no usable.
  const sel = document.getElementById("venta-almacen");
  if (sel) {
    sel.disabled = true;
    sel.classList.add("hidden");
    sel.setAttribute("aria-hidden", "true");
    if (almId) {
      if (![].some.call(sel.options, function (o) { return o.value === almId; })) {
        const opt = document.createElement("option");
        opt.value = almId;
        opt.textContent = nombreAlmacenOperativoVenta(almId);
        sel.appendChild(opt);
      }
      sel.value = almId;
    } else {
      sel.value = "";
    }
  }

  if (!almId && typeof ventaLineas !== "undefined" && ventaLineas.length > 0) {
    ventaLineas = [];
    if (typeof renderVentaLineas === "function") renderVentaLineas();
  }

  if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
  if (typeof actualizarStockDisponibleUI === "function") actualizarStockDisponibleUI();
}

// Envuelve refrescarVentas para pintar el panel tras cargar almacenes/productos.
(function parchearRefrescarVentas() {
  if (typeof refrescarVentas !== "function") return;
  const _orig = refrescarVentas;
  window.refrescarVentas = async function () {
    await _orig.apply(this, arguments);
    actualizarPanelAlmacenVenta();
  };
})();

// Envuelve refrescarTurnoActual para sincronizar Ventas al abrir/cerrar turno.
(function parchearRefrescarTurnoActual() {
  if (typeof refrescarTurnoActual !== "function") return;
  const _orig = refrescarTurnoActual;
  window.refrescarTurnoActual = async function () {
    await _orig.apply(this, arguments);
    actualizarPanelAlmacenVenta();
  };
})();

// Lectura de almacén: cualquier código que aún lea #venta-almacen debe
// recibir el id del turno. Parchea getters usados en listeners ya registrados
// reescribiendo las funciones públicas que dependen del select.
(function parchearLectoresAlmacen() {
  if (typeof actualizarStockDisponibleUI === "function") {
    const _orig = actualizarStockDisponibleUI;
    window.actualizarStockDisponibleUI = function () {
      const sel = document.getElementById("venta-almacen");
      const almId = obtenerAlmacenIdOperativoVenta();
      if (sel && almId) sel.value = almId;
      return _orig.apply(this, arguments);
    };
  }
  if (typeof renderCatalogoGrid === "function") {
    const _orig = renderCatalogoGrid;
    window.renderCatalogoGrid = function () {
      const sel = document.getElementById("venta-almacen");
      const almId = obtenerAlmacenIdOperativoVenta();
      if (sel && almId) sel.value = almId;
      return _orig.apply(this, arguments);
    };
  }
})();

safeInit("venta-turno-ui", function () {
  // Transformar markup: quitar selector libre y montar panel de solo lectura.
  const wrap = document.querySelector(".venta-almacen-wrap");
  const tab = document.getElementById("tab-ventas");
  if (tab && !document.getElementById("venta-sin-turno")) {
    const sin = document.createElement("div");
    sin.id = "venta-sin-turno";
    sin.className = "venta-sin-turno";
    sin.innerHTML =
      '<p class="lista-estado">⚠️ No puedes realizar ventas porque no tienes un turno abierto.</p>' +
      '<p class="muted">Abrí un turno en la sección Turnos. El almacén del turno será el único punto desde el que podés vender.</p>' +
      '<button type="button" id="venta-ir-turnos-btn" class="cc-accion">Ir a Turnos</button>';

    const panel = document.createElement("div");
    panel.className = "venta-almacen-operativo";
    panel.id = "venta-almacen-operativo";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML =
      '<span class="venta-almacen-label">🏪 Vendiendo desde</span>' +
      '<strong class="venta-almacen-nombre" id="venta-almacen-nombre">—</strong>' +
      '<span class="muted venta-almacen-hint">Definido por tu turno abierto (no se puede cambiar aquí)</span>';

    // Envolver el contenido operativo (todo menos historial) en un bloque.
    if (wrap) {
      wrap.replaceWith(panel);
    } else {
      tab.insertBefore(panel, tab.firstChild);
    }
    tab.insertBefore(sin, panel);

    // Agrupar controles de venta (hasta msg-venta) en venta-operativa-bloque.
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
    // Fallback: solo ocultar el select si el panel ya existiera.
    const sel = document.getElementById("venta-almacen");
    if (sel) {
      sel.disabled = true;
      sel.classList.add("hidden");
    }
  }

  const btnIr = document.getElementById("venta-ir-turnos-btn");
  if (btnIr) {
    btnIr.addEventListener("click", function () {
      if (typeof irATab === "function") irATab("turnos");
      else {
        const b = document.querySelector('.tab-btn[data-tab="turnos"]');
        if (b) b.click();
      }
    });
  }

  // Interceptar confirmación: forzar almacén del turno en el payload.
  const btnConf = document.getElementById("btn-confirmar-venta");
  if (btnConf) {
    btnConf.addEventListener(
      "click",
      function (e) {
        const almId = obtenerAlmacenIdOperativoVenta();
        if (!almId) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (typeof setMsg === "function") {
            setMsg("msg-venta", "No puedes vender sin un turno abierto con almacén.", false);
          }
          actualizarPanelAlmacenVenta();
          return;
        }
        const sel = document.getElementById("venta-almacen");
        if (sel) sel.value = almId;
      },
      true
    );
  }

  // Interceptar alta de línea / catálogo: sin turno no agregar.
  const formLinea = document.getElementById("form-venta-linea");
  if (formLinea) {
    formLinea.addEventListener(
      "submit",
      function (e) {
        const almId = obtenerAlmacenIdOperativoVenta();
        if (!almId) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (typeof setMsg === "function") {
            setMsg("msg-venta-linea", "No puedes vender sin un turno abierto.", false);
          }
          actualizarPanelAlmacenVenta();
          return;
        }
        const sel = document.getElementById("venta-almacen");
        if (sel) sel.value = almId;
      },
      true
    );
  }

  const grid = document.getElementById("catalogo-grid");
  if (grid) {
    grid.addEventListener(
      "click",
      function (e) {
        if (!e.target.closest(".catalogo-card")) return;
        const almId = obtenerAlmacenIdOperativoVenta();
        if (!almId) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (typeof setMsg === "function") {
            setMsg("msg-venta-linea", "No puedes vender sin un turno abierto.", false);
          }
          actualizarPanelAlmacenVenta();
          return;
        }
        const sel = document.getElementById("venta-almacen");
        if (sel) sel.value = almId;
      },
      true
    );
  }

  actualizarPanelAlmacenVenta();
});
