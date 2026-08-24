// BattleCruiser v9.2.63 — M12-FE.8
// Menú: seccion.ver === true
// Operaciones: gastos|mermas|reinversiones|responsabilidades|incidencias .crear
// Sin vales. Panel sin permisos.
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

  /** Visible si puede ejecutar al menos una card operativa. */
  function puedeVerOperaciones() {
    return (
      tienePermiso("gastos", "crear") ||
      tienePermiso("mermas", "crear") ||
      tienePermiso("reinversiones", "crear") ||
      tienePermiso("responsabilidades", "crear") ||
      tienePermiso("incidencias", "crear")
    );
  }

  var TAB_A_SECCION = {
    productos: "productos",
    ventas: "ventas",
    almacenes: "almacenes",
    transferencias: "transferencias",
    reportes: "reportes",
    inventario: "reportes",
    movimientos: "reportes",
    turnos: "turnos",
    ciclos: "ciclos",
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

  function asegurarPanelSinPermisos() {
    var id = "bc-sin-permisos-panel";
    var el = document.getElementById(id);
    if (el) return el;
    var main = document.querySelector(".main-content") || document.getElementById("app-shell");
    if (!main) return null;
    el = document.createElement("div");
    el.id = id;
    el.setAttribute("role", "status");
    el.style.cssText =
      "display:none;max-width:420px;margin:48px auto;padding:28px 24px;" +
      "text-align:center;border-radius:16px;" +
      "border:1px solid rgba(201,162,77,.22);" +
      "background:rgba(12,28,24,.75);";
    el.innerHTML =
      '<div style="font-size:2rem;margin-bottom:12px" aria-hidden="true">🔒</div>' +
      '<h2 style="margin:0 0 10px;font-family:Cormorant Garamond,serif;font-size:1.45rem;color:var(--text)">' +
      "Sin permisos asignados</h2>" +
      '<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:var(--mist)">' +
      "Tu cuenta está activa, pero todavía no tienes permisos para utilizar ningún módulo." +
      " Solicita al administrador que configure los permisos de tu rol.</p>" +
      '<button type="button" id="bc-sin-permisos-logout" class="cc-accion" ' +
      'style="padding:10px 16px;border-radius:10px;cursor:pointer">Cerrar sesión</button>';
    main.insertBefore(el, main.firstChild);
    var btn = el.querySelector("#bc-sin-permisos-logout");
    if (btn) {
      btn.addEventListener("click", function () {
        var real = document.getElementById("logout-btn");
        if (real) real.click();
        else if (typeof client !== "undefined" && client && client.auth) {
          client.auth.signOut();
        }
      });
    }
    return el;
  }

  function mostrarEstadoSinPermisos(mostrar) {
    var el = asegurarPanelSinPermisos();
    if (!el) return;
    el.style.display = mostrar ? "block" : "none";
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

      if (tab === "config" || tab === "resumen" || tab === "pendientes" || tab === "vales") {
        setTabVisible(btn, false);
        return;
      }

      if (tab === "operacion") {
        setTabVisible(btn, puedeVerOperaciones());
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
    var formVale = document.getElementById("form-vale");
    if (formVale) formVale.classList.add("hidden");
    toggleForm("form-categoria", "categorias", "crear");
    toggleForm("form-unidad", "unidades", "crear");
    toggleForm("form-nuevo-usuario", "usuarios", "crear");

    var algunaVisible = false;
    if (loggedIn && cargaOk) {
      document.querySelectorAll(".tab-btn[data-tab]").forEach(function (b) {
        if (b.getAttribute("data-bc-permiso") === "1") algunaVisible = true;
      });

      var activo = document.querySelector(".tab-btn.active");
      var okActivo = activo && activo.getAttribute("data-bc-permiso") === "1";
      if (!okActivo && algunaVisible) {
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

    mostrarEstadoSinPermisos(!!(loggedIn && cargaOk && !algunaVisible));
  }

  window.tienePermiso = tienePermiso;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.TAB_A_SECCION = TAB_A_SECCION;
  window.puedeVerOperaciones = puedeVerOperaciones;
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
