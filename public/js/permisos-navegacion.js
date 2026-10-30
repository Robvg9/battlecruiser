// BattleCruiser — navegación con permisos efectivos (fail-closed)
// La visibilidad exige ver; crear/editar/borrar siguen siendo permisos independientes.
(function () {
  "use strict";
  window.__BC_PERMISOS_CANONICO__ = true;

  function usuarioActual() {
    return (typeof _usuarioActual !== "undefined" && _usuarioActual) ||
      window.__bcUser || null;
  }

  function permisosListos() {
    return typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa === true;
  }

  function mapaPermisos() {
    return typeof _permisosEfectivos !== "undefined" && _permisosEfectivos &&
      typeof _permisosEfectivos === "object" ? _permisosEfectivos : null;
  }

  function tienePermiso(seccion, accion) {
    if (!usuarioActual() || !permisosListos()) return false;
    var efectivos = mapaPermisos();
    if (!efectivos) return false;
    var sec = efectivos[seccion];
    return !!(sec && sec[accion] === true);
  }

  var TAB_A_SECCION = {
    resumen: "reportes",
    productos: "productos",
    ventas: "ventas",
    almacenes: "almacenes",
    transferencias: "transferencias",
    compras: "stock",
    reportes: "reportes",
    inventario: "stock",
    movimientos: "stock",
    pendientes: "auditoria",
    turnos: "turnos",
    jornada: "turnos",
    ciclos: "turnos",
    comunicacion: "comunicacion",
    mando: "auditoria",
    usuarios: "usuarios",
    config: "usuarios"
  };

  var RUTAS_SIEMPRE_OCULTAS = {
    transferencias: true, // El historial se consulta en Movimientos.
    vales: true,          // Ruta heredada retirada del menú.
    turnos: true          // Alias heredado de Ciclos Operativos.
  };
  var RUTAS_PERSONALES = { conectividad: true, preferencias: true };
  var PERMISOS_OPERACION = ["gastos", "mermas", "reinversiones", "responsabilidades", "incidencias"];
  var ORDEN_HOME = [
    "jornada", "ciclos", "resumen", "comunicacion", "productos", "almacenes",
    "movimientos", "inventario", "reportes", "ventas", "operacion", "pendientes",
    "mando", "usuarios", "config", "conectividad", "preferencias"
  ];

  function esDependienta() {
    var u = usuarioActual() || {};
    var rol = String(u.rol || u.role_name || u.nombre_rol || u.role || "").toLowerCase();
    return rol.indexOf("dependienta") >= 0;
  }

  function puedeVerOperaciones() {
    return PERMISOS_OPERACION.some(function (seccion) {
      return tienePermiso(seccion, "ver");
    });
  }

  function puedeVerRuta(tab) {
    if (!usuarioActual() || !permisosListos()) return false;
    if (RUTAS_SIEMPRE_OCULTAS[tab]) return false;
    if (RUTAS_PERSONALES[tab]) return true;
    if (tab === "operacion") return puedeVerOperaciones();
    if (tab === "ventas" && esDependienta()) return false;
    var seccion = TAB_A_SECCION[tab];
    return !!seccion && tienePermiso(seccion, "ver");
  }

  function setTabLabel(btn, text) {
    if (!btn) return;
    var lab = btn.querySelector(".bc-nav-label");
    if (lab) {
      lab.textContent = text;
      return;
    }
    if (btn.querySelector(".bc-nav-icon")) {
      var span = document.createElement("span");
      span.className = "bc-nav-label";
      span.textContent = text;
      btn.appendChild(span);
    } else {
      btn.textContent = text;
    }
  }

  function setPanelVisible(tab, visible) {
    var panel = document.getElementById("tab-" + tab);
    if (!panel) return;
    panel.setAttribute("data-bc-permiso", visible ? "1" : "0");
    if (visible) {
      panel.classList.remove("hidden", "tab-sin-permiso");
      panel.removeAttribute("hidden");
      panel.removeAttribute("aria-hidden");
      panel.style.removeProperty("display");
    } else {
      panel.classList.add("hidden", "tab-sin-permiso");
      panel.setAttribute("hidden", "");
      panel.setAttribute("aria-hidden", "true");
      panel.classList.remove("visible");
      panel.style.setProperty("display", "none", "important");
    }
  }

  function setTabVisible(btn, visible) {
    if (!btn) return;
    var tab = btn.dataset.tab;
    btn.setAttribute("data-bc-permiso", visible ? "1" : "0");
    if (visible) {
      btn.classList.remove("hidden", "tab-sin-permiso");
      btn.style.removeProperty("display");
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
    } else {
      btn.classList.add("hidden", "tab-sin-permiso");
      btn.style.setProperty("display", "none", "important");
      btn.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
      btn.classList.remove("active");
    }
    if (tab) setPanelVisible(tab, visible);
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
      "text-align:center;border-radius:16px;border:1px solid rgba(201,162,77,.22);" +
      "background:rgba(12,28,24,.75)";
    el.innerHTML =
      '<div style="font-size:2rem;margin-bottom:12px" aria-hidden="true">🔒</div>' +
      '<h2 style="margin:0 0 10px;font-family:Cormorant Garamond,serif;font-size:1.45rem;color:var(--text)">' +
      "Sin permisos asignados</h2>" +
      '<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:var(--mist)">' +
      "Tu cuenta está activa, pero no tiene acceso a módulos operativos. Solicita al administrador que revise los permisos de tu rol.</p>" +
      '<button type="button" id="bc-sin-permisos-logout" class="cc-accion" style="padding:10px 16px;border-radius:10px;cursor:pointer">Cerrar sesión</button>';
    main.insertBefore(el, main.firstChild);
    var btn = el.querySelector("#bc-sin-permisos-logout");
    if (btn) btn.addEventListener("click", function () {
      var real = document.getElementById("logout-btn");
      if (real) real.click();
      else if (window.client && window.client.auth) window.client.auth.signOut();
    });
    return el;
  }

  function mostrarEstadoSinPermisos(mostrar) {
    var el = asegurarPanelSinPermisos();
    if (el) el.style.display = mostrar ? "block" : "none";
  }

  function aplicarPermisosAInterfaz() {
    var loggedIn = !!usuarioActual();
    var cargaOk = permisosListos() && !!mapaPermisos();
    var ready = loggedIn && cargaOk;
    var shell = document.getElementById("app-shell");
    var shellVisible = !!(shell && shell.classList.contains("visible"));

    if (shell) shell.setAttribute("data-bc-permisos-cargados", ready ? "1" : "0");

    document.querySelectorAll(".tab-btn[data-tab]").forEach(function (btn) {
      var tab = btn.dataset.tab;
      var visible = ready && puedeVerRuta(tab);
      setTabVisible(btn, visible);
      if (tab === "ciclos" && visible) setTabLabel(btn, "Turnos");
      if (tab === "resumen" && visible) setTabLabel(btn, "Centro de Control");
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

    var visibles = Array.prototype.filter.call(
      document.querySelectorAll("#tabs .tab-btn[data-tab]"),
      function (btn) { return btn.getAttribute("data-bc-permiso") === "1"; }
    );

    if (ready && shellVisible && visibles.length) {
      var activo = document.querySelector("#tabs .tab-btn.active[data-tab]");
      if (!activo || activo.getAttribute("data-bc-permiso") !== "1") {
        var elegido = null;
        for (var i = 0; i < ORDEN_HOME.length; i++) {
          elegido = document.querySelector('#tabs .tab-btn[data-tab="' + ORDEN_HOME[i] + '"][data-bc-permiso="1"]');
          if (elegido) break;
        }
        if (elegido) {
          if (typeof irATab === "function") irATab(elegido.dataset.tab);
          else {
            document.querySelectorAll("#tabs .tab-btn.active").forEach(function (b) { b.classList.remove("active"); });
            document.querySelectorAll(".tab-panel.visible").forEach(function (p) { p.classList.remove("visible"); });
            elegido.classList.add("active");
            var panel = document.getElementById("tab-" + elegido.dataset.tab);
            if (panel) panel.classList.add("visible");
          }
        }
      }
    } else if (!ready) {
      document.querySelectorAll(".tab-panel").forEach(function (panel) {
        panel.classList.remove("visible");
      });
    }
    mostrarEstadoSinPermisos(ready && visibles.length === 0);
  }

  window.tienePermiso = tienePermiso;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.TAB_A_SECCION = TAB_A_SECCION;
  window.puedeVerOperaciones = puedeVerOperaciones;
  window.__BC_ROUTE_CAN_VIEW__ = puedeVerRuta;

  (function observarShellAutenticado() {
    var shell = document.getElementById("app-shell");
    if (!shell || shell.dataset.bcEarlyNavigationObserver === "1") return;
    shell.dataset.bcEarlyNavigationObserver = "1";
    var applyWhenVisible = function () {
      if (!shell.classList.contains("visible")) return;
      window.setTimeout(function () {
        try { aplicarPermisosAInterfaz(); } catch (e) {}
      }, 0);
    };
    new MutationObserver(applyWhenVisible).observe(shell, {
      attributes: true,
      attributeFilter: ["class"]
    });
    applyWhenVisible();
  })();

  var css = document.getElementById("bc-tab-sin-permiso-css");
  if (css) css.remove();
  var st = document.createElement("style");
  st.id = "bc-tab-sin-permiso-css";
  st.textContent =
    "#tabs .tab-btn[data-bc-permiso=\"0\"],#tabs .tab-btn.tab-sin-permiso," +
    ".sidebar-nav .tab-btn[data-bc-permiso=\"0\"],.sidebar-nav .tab-btn.tab-sin-permiso," +
    ".tab-panel[data-bc-permiso=\"0\"],.tab-panel.tab-sin-permiso{" +
    "display:none!important;visibility:hidden!important;pointer-events:none!important;" +
    "height:0!important;max-height:0!important;overflow:hidden!important;" +
    "padding:0!important;margin:0!important;border:none!important;}";
  document.head.appendChild(st);

  aplicarPermisosAInterfaz();
})();
