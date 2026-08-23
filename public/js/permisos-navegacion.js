// BattleCruiser v9.2.54 — menú por permisos (CSS gana a ui-visual-salon)
(function () {
  "use strict";
  window.__BC_PERMISOS_CANONICO__ = true;
  window.__BC_PERMISOS_FE3__ = true;

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

  var ORDEN_HOME = [
    "ventas", "comunicacion", "productos", "ciclos", "turnos", "operacion",
    "almacenes", "transferencias", "vales", "reportes", "inventario",
    "movimientos", "resumen", "pendientes", "usuarios", "mando"
  ];

  function setTabVisible(btn, visible) {
    if (!btn) return;
    if (visible) {
      btn.classList.remove("hidden", "tab-sin-permiso");
      btn.style.setProperty("display", "");
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
    } else {
      btn.classList.add("hidden", "tab-sin-permiso");
      btn.style.setProperty("display", "none", "important");
      btn.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
      btn.classList.remove("active");
      var tab = btn.dataset.tab;
      if (tab) {
        var panel = document.getElementById("tab-" + tab);
        if (panel) panel.classList.remove("visible");
      }
    }
  }

  function tieneAlgunaVista() {
    if (typeof _permisosEfectivos === "undefined" || !_permisosEfectivos) return false;
    var k = Object.keys(_permisosEfectivos);
    for (var i = 0; i < k.length; i++) {
      if (_permisosEfectivos[k[i]] && _permisosEfectivos[k[i]].ver === true) return true;
    }
    return false;
  }

  function aplicarPermisosAInterfaz() {
    var loggedIn = !!(typeof _usuarioActual !== "undefined" && _usuarioActual);
    var cargaOk = !!(typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa);

    document.querySelectorAll(".tab-btn[data-tab]").forEach(function (btn) {
      var tab = btn.dataset.tab;
      if (!tab) return;

      if (!loggedIn || !cargaOk) {
        setTabVisible(btn, false);
        return;
      }

      if (tab === "config") {
        setTabVisible(btn, false);
        return;
      }

      if (tab === "resumen") {
        setTabVisible(btn, tieneAlgunaVista());
        return;
      }

      if (tab === "pendientes") {
        setTabVisible(btn, tienePermiso("turnos", "ver") || tienePermiso("ciclos", "ver"));
        return;
      }

      var seccion = TAB_A_SECCION[tab];
      if (!seccion) {
        setTabVisible(btn, false);
        return;
      }
      setTabVisible(btn, tienePermiso(seccion, "ver"));
    });

    function toggleForm(id, sec, act) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle("hidden", !tienePermiso(sec, act));
    }
    toggleForm("form-producto", "productos", "crear");
    toggleForm("form-compra", "stock", "crear");
    if (!tienePermiso("stock", "crear")) toggleForm("form-compra", "productos", "crear");
    toggleForm("form-venta-linea", "ventas", "crear");
    toggleForm("form-almacen", "almacenes", "crear");
    toggleForm("form-transferencia", "transferencias", "crear");
    toggleForm("form-vale", "vales_salida", "crear");
    toggleForm("form-categoria", "categorias", "crear");
    toggleForm("form-unidad", "unidades", "crear");
    toggleForm("form-nuevo-usuario", "usuarios", "crear");

    if (loggedIn && cargaOk) {
      var activo = document.querySelector(".tab-btn.active");
      var okActivo = activo && !activo.classList.contains("tab-sin-permiso") && activo.style.display !== "none";
      if (!okActivo) {
        for (var i = 0; i < ORDEN_HOME.length; i++) {
          var t = ORDEN_HOME[i];
          var b = document.querySelector('.tab-btn[data-tab="' + t + '"]');
          if (b && !b.classList.contains("tab-sin-permiso") && !b.classList.contains("hidden")) {
            if (typeof irATab === "function") {
              try { irATab(t); } catch (e) {}
            }
            break;
          }
        }
      }
    } else if (!loggedIn) {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
    }
  }

  function resetearNavegacionParaNuevaSesion() {
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
  }

  window.tienePermiso = tienePermiso;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.TAB_A_SECCION = TAB_A_SECCION;
  window.resetearNavegacionParaNuevaSesion = resetearNavegacionParaNuevaSesion;
  try { tienePermiso = tienePermiso; } catch (e) {}
  try { aplicarPermisosAInterfaz = aplicarPermisosAInterfaz; } catch (e) {}
  try { TAB_A_SECCION = TAB_A_SECCION; } catch (e) {}

  var css = document.getElementById("bc-tab-sin-permiso-css");
  if (css) css.remove();
  var st = document.createElement("style");
  st.id = "bc-tab-sin-permiso-css";
  st.textContent =
    "#tabs .tab-btn.tab-sin-permiso,#tabs .tab-btn.hidden," +
    ".sidebar-nav .tab-btn.tab-sin-permiso,.sidebar-nav .tab-btn.hidden," +
    ".tab-btn.tab-sin-permiso.hidden{" +
    "display:none!important;visibility:hidden!important;pointer-events:none!important;" +
    "height:0!important;max-height:0!important;overflow:hidden!important;" +
    "padding:0!important;margin:0!important;border:none!important;}";
  document.head.appendChild(st);

  if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
    aplicarPermisosAInterfaz();
  }
})();
