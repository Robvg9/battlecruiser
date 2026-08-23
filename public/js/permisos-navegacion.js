// BattleCruiser v9.2.56 — menú solo con seccion.ver === true
// Fase 3 FE: vales_salida oculto del menú (histórico se conserva en reportes/RPC)
(function () {
  "use strict";
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
    // vales: retirado del menú (Fase 3) — no mapear a vales_salida
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
    "almacenes", "transferencias", "reportes", "inventario",
    "movimientos", "usuarios", "mando"
  ];

  function setTabVisible(btn, visible) {
    if (!btn) return;
    if (visible) {
      btn.classList.remove("hidden", "tab-sin-permiso");
      btn.setAttribute("data-bc-permiso", "1");
      btn.style.removeProperty("display");
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
    } else {
      btn.classList.add("hidden", "tab-sin-permiso");
      btn.setAttribute("data-bc-permiso", "0");
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

      // Fase 3: vales de salida no aparece en el menú (ni como tab, ni como sección operativa)
      if (tab === "config" || tab === "resumen" || tab === "pendientes" || tab === "vales") {
        setTabVisible(btn, false);
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
    // Fase 3: formulario operativo de vales oculto siempre (histórico no se borra)
    var formVale = document.getElementById("form-vale");
    if (formVale) formVale.classList.add("hidden");
    toggleForm("form-categoria", "categorias", "crear");
    toggleForm("form-unidad", "unidades", "crear");
    toggleForm("form-nuevo-usuario", "usuarios", "crear");

    if (loggedIn && cargaOk) {
      var activo = document.querySelector(".tab-btn.active");
      var okActivo = activo && activo.getAttribute("data-bc-permiso") === "1";
      if (!okActivo) {
        for (var i = 0; i < ORDEN_HOME.length; i++) {
          var t = ORDEN_HOME[i];
          var b = document.querySelector('.tab-btn[data-tab="' + t + '"]');
          if (b && b.getAttribute("data-bc-permiso") === "1") {
            if (typeof irATab === "function") {
              try { irATab(t); } catch (e) {}
            }
            break;
          }
        }
      }
    }
  }

  window.tienePermiso = tienePermiso;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.TAB_A_SECCION = TAB_A_SECCION;
  try { tienePermiso = tienePermiso; } catch (e) {}
  try { aplicarPermisosAInterfaz = aplicarPermisosAInterfaz; } catch (e) {}
  try { TAB_A_SECCION = TAB_A_SECCION; } catch (e) {}

  var css = document.getElementById("bc-tab-sin-permiso-css");
  if (css) css.remove();
  var st = document.createElement("style");
  st.id = "bc-tab-sin-permiso-css";
  st.textContent =
    "#tabs .tab-btn[data-bc-permiso=\"0\"]," +
    "#tabs .tab-btn.tab-sin-permiso," +
    "#tabs .tab-btn.hidden," +
    ".sidebar-nav .tab-btn[data-bc-permiso=\"0\"]," +
    ".sidebar-nav .tab-btn.tab-sin-permiso," +
    ".sidebar-nav .tab-btn.hidden{" +
    "display:none!important;visibility:hidden!important;pointer-events:none!important;" +
    "height:0!important;max-height:0!important;overflow:hidden!important;" +
    "padding:0!important;margin:0!important;border:none!important;}";
  document.head.appendChild(st);

  if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
    aplicarPermisosAInterfaz();
  }
})();
