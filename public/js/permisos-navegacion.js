// BattleCruiser v9.2.49 — ÚNICA fuente de verdad de navegación por permisos.
// Carga: app.js (después de usuarios-permisos.js).
// Sustituye tienePermiso / TAB_A_SECCION / aplicarPermisosAInterfaz UNA sola vez.
// No captura clicks. No setTimeouts. No wrappers encadenados.
(function () {
  "use strict";
  if (window.__BC_PERMISOS_CANONICO__) return;
  window.__BC_PERMISOS_CANONICO__ = true;

  function tienePermiso(seccion, accion) {
    if (typeof _usuarioActual === "undefined" || !_usuarioActual) return false;
    if (typeof _permisosCargaExitosa === "undefined" || !_permisosCargaExitosa) return false;
    if (typeof _permisosEfectivos === "undefined" || !_permisosEfectivos) return false;
    var sec = _permisosEfectivos[seccion];
    return !!(sec && sec[accion] === true);
  }

  var TAB_A_SECCION = {
    productos: "productos",
    ventas: "ventas",
    almacenes: "almacenes",
    transferencias: "transferencias",
    vales: "vales_salida",
    reportes: "reportes",
    inventario: "reportes",
    movimientos: "reportes",
    turnos: "turnos",
    ciclos: "ciclos",
    operacion: "turnos",
    comunicacion: "comunicacion",
    mando: "auditoria",
    usuarios: "usuarios"
  };

  function togglePorPermiso(elId, seccion, accion) {
    var el = document.getElementById(elId);
    if (!el) return;
    var ok = tienePermiso(seccion, accion);
    el.classList.toggle("hidden", !ok);
  }

  function aplicarPermisosAInterfaz() {
    var loggedIn = !!(typeof _usuarioActual !== "undefined" && _usuarioActual);

    document.querySelectorAll(".tab-btn[data-tab]").forEach(function (btn) {
      var tab = btn.dataset.tab;
      if (!tab) return;

      if (tab === "config") {
        btn.classList.add("hidden", "tab-sin-permiso");
        btn.style.display = "none";
        btn.setAttribute("aria-hidden", "true");
        btn.tabIndex = -1;
        return;
      }

      if (tab === "resumen" || tab === "pendientes") {
        if (loggedIn) {
          btn.classList.remove("hidden", "tab-sin-permiso");
          btn.style.display = "";
          btn.removeAttribute("aria-hidden");
          btn.tabIndex = 0;
        } else {
          btn.classList.add("hidden", "tab-sin-permiso");
          btn.style.display = "none";
          btn.setAttribute("aria-hidden", "true");
          btn.tabIndex = -1;
          btn.classList.remove("active");
        }
        return;
      }

      var seccion = TAB_A_SECCION[tab];
      var permitido = !!(loggedIn && seccion && tienePermiso(seccion, "ver"));

      if (permitido) {
        btn.classList.remove("hidden", "tab-sin-permiso");
        btn.style.display = "";
        btn.removeAttribute("aria-hidden");
        btn.tabIndex = 0;
      } else {
        btn.classList.add("hidden", "tab-sin-permiso");
        btn.style.display = "none";
        btn.setAttribute("aria-hidden", "true");
        btn.tabIndex = -1;
        btn.classList.remove("active");
      }
    });

    togglePorPermiso("form-producto", "productos", "crear");
    togglePorPermiso("form-compra", "stock", "crear");
    if (!tienePermiso("stock", "crear")) togglePorPermiso("form-compra", "productos", "crear");
    togglePorPermiso("form-venta-linea", "ventas", "crear");
    togglePorPermiso("form-almacen", "almacenes", "crear");
    togglePorPermiso("form-transferencia", "transferencias", "crear");
    togglePorPermiso("form-vale", "vales_salida", "crear");
    togglePorPermiso("form-categoria", "categorias", "crear");
    togglePorPermiso("form-unidad", "unidades", "crear");
    togglePorPermiso("form-nuevo-usuario", "usuarios", "crear");

    var activo = document.querySelector(".tab-btn.active");
    if (activo && activo.classList.contains("tab-sin-permiso")) {
      var home = document.querySelector('.tab-btn[data-tab="resumen"]:not(.tab-sin-permiso)');
      if (home && typeof irATab === "function") {
        try { irATab("resumen"); } catch (e) {}
      }
    }
  }

  window.tienePermiso = tienePermiso;
  window.TAB_A_SECCION = TAB_A_SECCION;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.togglePorPermiso = togglePorPermiso;
  try { tienePermiso = tienePermiso; } catch (e) {}
  try { TAB_A_SECCION = TAB_A_SECCION; } catch (e) {}
  try { aplicarPermisosAInterfaz = aplicarPermisosAInterfaz; } catch (e) {}
  try { togglePorPermiso = togglePorPermiso; } catch (e) {}

  if (!document.getElementById("bc-tab-sin-permiso-css")) {
    var st = document.createElement("style");
    st.id = "bc-tab-sin-permiso-css";
    st.textContent = ".tab-btn.tab-sin-permiso,.tab-btn.hidden.tab-sin-permiso{display:none!important;visibility:hidden!important;pointer-events:none!important;}";
    document.head.appendChild(st);
  }

  if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
    aplicarPermisosAInterfaz();
  }
})();
