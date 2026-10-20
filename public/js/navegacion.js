// ==== Battlecruiser · js/navegacion.js ====
// Navegación por tabs y menú lateral. Visibilidad = autoridad de aplicarPermisosAInterfaz.
// v9.2.80 — M26.5-FE: almacenes carga stock; ventas sincroniza turno del usuario.

function irATab(tab) {
  if (!tab) return;
  if (tab === "turnos") {
    var ciclosBtn = document.querySelector('.tab-btn[data-tab="ciclos"]');
    if (ciclosBtn) tab = "ciclos";
  }
  var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  if (!btn) return;
  if (btn.classList.contains("hidden") || btn.classList.contains("tab-sin-permiso") || btn.style.display === "none") {
    console.warn("[BattleCruiser] irATab: pestaña no disponible:", tab);
    return;
  }
  btn.click();
}

safeInit("tabs", function () {
  var tabsEl = document.getElementById("tabs");
  if (!tabsEl) return;
  var ultimaTab = null;
  tabsEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab-btn");
    if (!btn) return;
    if (btn.classList.contains("hidden") || btn.classList.contains("tab-sin-permiso") || btn.style.display === "none") {
      e.preventDefault();
      return;
    }
    var t = btn.dataset.tab;
    var mismoTab = (t === ultimaTab && btn.classList.contains("active"));

    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
    btn.classList.add("active");
    var panel = document.getElementById("tab-" + t);
    if (panel) panel.classList.add("visible");
    ultimaTab = t;

    if (mismoTab) {
      if (t !== "pendientes" && typeof cerrarDetalleOperacion === "function") cerrarDetalleOperacion();
      return;
    }

    if (t === "pendientes") {
      if (typeof refrescarPanelPendientes === "function") refrescarPanelPendientes();
    } else if (t === "resumen") {
      if (typeof refrescarCentroControl === "function") refrescarCentroControl();
    } else if (t === "productos") {
      if (typeof renderProductosLista === "function" && typeof _cache !== "undefined" && (_cache.productos || []).length) renderProductosLista();
      else if (typeof refrescarProductos === "function") refrescarProductos();
    } else if (t === "almacenes") {
      // M26.5-FE: almacenes + stock juntos (evita falso "sin productos")
      if (typeof refrescarAlmacenes === "function") {
        Promise.resolve(refrescarAlmacenes()).then(function () {
          if (typeof refrescarStockYSelects === "function") return refrescarStockYSelects();
        }).catch(function (err) {
          console.warn("[BattleCruiser] refresco almacenes/stock", err);
        });
      } else if (typeof refrescarStockYSelects === "function") {
        refrescarStockYSelects();
      }
    } else if (t === "ventas") {
      // M26.5-FE: turno del usuario actual → UI de venta coherente
      var afterTurno = function () {
        if (typeof actualizarPanelAlmacenVenta === "function") actualizarPanelAlmacenVenta();
        if (typeof refrescarVentas === "function") refrescarVentas();
      };
      if (typeof window.__BC_M25_refrescarTurno === "function") {
        Promise.resolve(window.__BC_M25_refrescarTurno()).then(afterTurno).catch(afterTurno);
      } else if (typeof refrescarTurnoActual === "function") {
        Promise.resolve(refrescarTurnoActual()).then(afterTurno).catch(afterTurno);
      } else {
        afterTurno();
      }
    } else if (t === "transferencias") {
      if (typeof refrescarTransferencias === "function") refrescarTransferencias();
    } else if (t === "reportes") {
      if (typeof refrescarReportes === "function") refrescarReportes();
    } else if (t === "inventario") {
      if (typeof refrescarInventario === "function") refrescarInventario();
    } else if (t === "movimientos") {
      if (typeof refrescarMovimientos === "function") refrescarMovimientos();
    } else if (t === "turnos") {
      if (typeof refrescarTurnos === "function") refrescarTurnos();
    } else if (t === "ciclos") {
      if (typeof refrescarCiclos === "function") refrescarCiclos();
    } else if (t === "operacion") {
      if (typeof refrescarOperacion === "function") refrescarOperacion();
    } else if (t === "comunicacion") {
      if (typeof refrescarComunicacion === "function") refrescarComunicacion();
    } else if (t === "mando") {
      if (typeof refrescarCentroMando === "function") refrescarCentroMando();
    } else if (t === "usuarios") {
      var infoEl = document.getElementById("usuario-actual-info");
      if (infoEl && typeof _usuarioActual !== "undefined" && _usuarioActual) {
        infoEl.textContent = "Sesión: " + (_usuarioActual.nombre || "") + (_usuarioActual.rol ? " · " + _usuarioActual.rol : "");
      }
      if (typeof refrescarUsuarios === "function") refrescarUsuarios();
    } else if (t === "conectividad") {
      if (typeof renderDiagnosticoConfig === "function") renderDiagnosticoConfig();
    } else if (t === "config") {
      if (typeof refrescarRolesAdmin === "function") refrescarRolesAdmin();
      if (typeof refrescarConfiguracion === "function") refrescarConfiguracion();
      ["categorias", "unidades"].forEach(function (tabla) {
        var refrescar = window["_refrescarCatalogo_" + tabla];
        if (typeof refrescar === "function") refrescar();
      });
    }
    if (t !== "pendientes" && typeof cerrarDetalleOperacion === "function") cerrarDetalleOperacion();
  });
});

safeInit("resumen-alertas-accion", function () {
  var panel = document.getElementById("tab-resumen");
  if (!panel) return;
  var manejar = function (target) {
    var accion = target.closest("[data-ir-tab]");
    if (!accion) return;
    irATab(accion.getAttribute("data-ir-tab"));
  };
  panel.addEventListener("click", function (e) { manejar(e.target); });
  panel.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      manejar(e.target);
      if (e.target.closest("[data-ir-tab]")) e.preventDefault();
    }
  });
});

safeInit("resumen-movs-accion", function () {
  var movsEl = document.getElementById("resumen-movs-lista");
  if (!movsEl) return;
  var abrir = function (target) {
    var item = target.closest(".resumen-mov-item[data-mov-tab]");
    if (!item) return;
    irATab(item.getAttribute("data-mov-tab"));
  };
  movsEl.addEventListener("click", function (e) { abrir(e.target); });
  movsEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target.closest(".resumen-mov-item[data-mov-tab]")) {
        e.preventDefault();
        abrir(e.target);
      }
    }
  });
});

safeInit("menu-lateral", function () {
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("sidebar-backdrop");
  var toggleBtn = document.getElementById("sidebar-toggle-btn");
  var closeBtn = document.getElementById("sidebar-close-btn");
  if (!sidebar || !backdrop || !toggleBtn || !closeBtn) return;
  function abrirMenu() {
    sidebar.classList.add("open");
    backdrop.classList.add("visible");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  function cerrarMenu() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("visible");
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  toggleBtn.addEventListener("click", function () {
    sidebar.classList.contains("open") ? cerrarMenu() : abrirMenu();
  });
  closeBtn.addEventListener("click", cerrarMenu);
  backdrop.addEventListener("click", cerrarMenu);
  sidebar.addEventListener("click", function (e) {
    if (e.target.closest(".tab-btn")) cerrarMenu();
  });
  window._battlecruiserCerrarMenuLateral = cerrarMenu;
});

window.addEventListener("DOMContentLoaded", function () {
  if (document.querySelector("script[data-bc-m18]")) return;
  var s = document.createElement("script");
  s.src = "js/ciclos-unificacion.js?v=18";
  s.dataset.bcM18 = "true";
  s.async = false;
  document.body.appendChild(s);
});
