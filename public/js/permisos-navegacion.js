// BattleCruiser v9.2.51 — M12-FE.2
// Menú ↔ permisos (única fuente) + reset de navegación entre usuarios.
// Consume _permisosEfectivos desde permisos_usuario_actual.
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

  // Preferencia de home al abrir sesión (primera con ver / disponible)
  var ORDEN_HOME = [
    "resumen", "pendientes", "ventas", "comunicacion", "productos",
    "ciclos", "turnos", "operacion", "almacenes", "transferencias",
    "vales", "reportes", "inventario", "movimientos", "usuarios", "mando"
  ];

  function togglePorPermiso(elId, seccion, accion) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.classList.toggle("hidden", !tienePermiso(seccion, accion));
  }

  /** Quita active/visible. No abre ninguna sección. */
  function resetearNavegacionParaNuevaSesion() {
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.remove("active");
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.remove("visible");
    });
  }

  function tabBtnDisponible(btn) {
    if (!btn) return false;
    if (btn.classList.contains("tab-sin-permiso") || btn.classList.contains("hidden")) return false;
    if (btn.style.display === "none") return false;
    if (btn.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  /** Primera pestaña realmente autorizada (resumen si existe). */
  function seleccionarPrimeraSeccionAutorizada() {
    var i, tab, btn;
    for (i = 0; i < ORDEN_HOME.length; i++) {
      tab = ORDEN_HOME[i];
      btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
      if (tabBtnDisponible(btn)) {
        if (typeof irATab === "function") {
          try { irATab(tab); } catch (e) {}
        } else {
          document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
          document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
          btn.classList.add("active");
          var panel = document.getElementById("tab-" + tab);
          if (panel) panel.classList.add("visible");
        }
        return tab;
      }
    }
    return null;
  }

  function panelProhibidoVisible() {
    var activo = document.querySelector(".tab-btn.active");
    if (!activo) return true;
    return !tabBtnDisponible(activo);
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
        btn.classList.remove("active");
        return;
      }

      // Home universal mientras haya sesión (no requiere fila en matriz)
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
        // Panel de sección prohibida no puede quedar visible
        var panel = document.getElementById("tab-" + tab);
        if (panel) panel.classList.remove("visible");
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

    // Tras permisos: si no hay pestaña activa válida → home autorizado
    if (loggedIn && (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa)) {
      if (panelProhibidoVisible()) {
        seleccionarPrimeraSeccionAutorizada();
      }
    } else if (!loggedIn) {
      resetearNavegacionParaNuevaSesion();
    }
  }

  window.tienePermiso = tienePermiso;
  window.TAB_A_SECCION = TAB_A_SECCION;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.togglePorPermiso = togglePorPermiso;
  window.resetearNavegacionParaNuevaSesion = resetearNavegacionParaNuevaSesion;
  window.seleccionarPrimeraSeccionAutorizada = seleccionarPrimeraSeccionAutorizada;

  try { tienePermiso = tienePermiso; } catch (e) {}
  try { TAB_A_SECCION = TAB_A_SECCION; } catch (e) {}
  try { aplicarPermisosAInterfaz = aplicarPermisosAInterfaz; } catch (e) {}
  try { togglePorPermiso = togglePorPermiso; } catch (e) {}
  try { resetearNavegacionParaNuevaSesion = resetearNavegacionParaNuevaSesion; } catch (e) {}
  try { seleccionarPrimeraSeccionAutorizada = seleccionarPrimeraSeccionAutorizada; } catch (e) {}

  if (!document.getElementById("bc-tab-sin-permiso-css")) {
    var st = document.createElement("style");
    st.id = "bc-tab-sin-permiso-css";
    st.textContent =
      ".tab-btn.tab-sin-permiso,.tab-btn.hidden.tab-sin-permiso{display:none!important;visibility:hidden!important;pointer-events:none!important;}";
    document.head.appendChild(st);
  }

  if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
    aplicarPermisosAInterfaz();
  }
})();
