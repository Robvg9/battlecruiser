// BattleCruiser — Menú basado exclusivamente en permisos efectivos v67.5
// La navegación no sustituye la autorización de RPC/RLS: sólo evita exponer módulos no habilitados.
(function () {
  "use strict";
  window.__BC_PERMISOS_CANONICO__ = true;

  var TAB_A_SECCION = {
    resumen: "reportes",
    productos: "productos",
    ventas: "ventas",
    almacenes: "almacenes",
    transferencias: "transferencias",
    compras: "stock",
    reportes: "reportes",
    inventario: "reportes",
    movimientos: "reportes",
    turnos: "turnos",
    jornada: "turnos",
    ciclos: "turnos",
    comunicacion: "comunicacion",
    mando: "auditoria",
    usuarios: "usuarios"
  };

  var RUTAS_SIEMPRE_OCULTAS = {
    transferencias: true, // Historial integrado en Movimientos.
    vales: true,           // Flujo independiente retirado del menú.
    turnos: true           // Ruta antigua; irATab("turnos") redirige a Ciclos.
  };

  var EXCEPCIONES_PERSONALES = {
    pendientes: true,      // Cola IndexedDB filtrada por el usuario autenticado.
    conectividad: true,
    preferencias: true
  };

  var ORDEN_HOME = [
    "resumen", "jornada", "ciclos", "ventas", "comunicacion", "productos",
    "almacenes", "operacion", "movimientos", "inventario", "reportes",
    "pendientes", "conectividad", "preferencias", "usuarios", "mando", "config"
  ];

  function tienePermiso(seccion, accion) {
    if (typeof _usuarioActual === "undefined" || !_usuarioActual) return false;
    if (typeof _permisosCargaExitosa === "undefined" || !_permisosCargaExitosa) return false;
    if (typeof _permisosEfectivos === "undefined" || !_permisosEfectivos) return false;
    var permisos = _permisosEfectivos[seccion];
    return !!(permisos && permisos[accion] === true);
  }

  function puedeVerOperaciones() {
    return tienePermiso("responsabilidades", "ver") ||
      tienePermiso("incidencias", "ver");
  }

  function setElementoVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setTabVisible(btn, visible) {
    if (!btn) return;
    var tab = btn.dataset.tab;
    var panel = tab ? document.getElementById("tab-" + tab) : null;
    btn.setAttribute("data-bc-permiso", visible ? "1" : "0");
    btn.classList.toggle("hidden", !visible);
    btn.classList.toggle("tab-sin-permiso", !visible);
    if (visible) {
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
      btn.style.removeProperty("display");
      if (panel) {
        panel.classList.remove("hidden");
        panel.setAttribute("aria-hidden", "false");
        if (panel.dataset.bcPermissionDisplayHidden === "1") {
          panel.style.removeProperty("display");
          delete panel.dataset.bcPermissionDisplayHidden;
        }
      }
      return;
    }
    btn.setAttribute("aria-hidden", "true");
    btn.tabIndex = -1;
    btn.style.setProperty("display", "none", "important");
    btn.classList.remove("active");
    if (panel) {
      panel.classList.remove("visible");
      panel.classList.add("hidden");
      panel.setAttribute("aria-hidden", "true");
      panel.style.setProperty("display", "none", "important");
      panel.dataset.bcPermissionDisplayHidden = "1";
    }
  }

  function setTabLabel(btn, label) {
    if (!btn) return;
    var span = btn.querySelector(".bc-nav-label");
    if (span) {
      span.textContent = label;
    } else if (btn.querySelector(".bc-nav-icon")) {
      span = document.createElement("span");
      span.className = "bc-nav-label";
      span.textContent = label;
      btn.appendChild(span);
    } else {
      btn.textContent = label;
    }
  }

  function rolEsDependienta() {
    var u = (typeof _usuarioActual !== "undefined" && _usuarioActual) || window.__bcUser || {};
    var rol = String(u.rol || u.role_name || u.nombre_rol || u.role || "").toLowerCase();
    return rol.indexOf("dependienta") >= 0;
  }

  function configTieneAcceso() {
    return tienePermiso("usuarios", "ver") ||
      tienePermiso("categorias", "ver") ||
      tienePermiso("unidades", "ver");
  }

  function permisoTab(tab) {
    if (RUTAS_SIEMPRE_OCULTAS[tab]) return false;
    if (EXCEPCIONES_PERSONALES[tab]) return true;
    if (tab === "operacion") return puedeVerOperaciones();
    if (tab === "config") return configTieneAcceso();
    if (tab === "ventas" && rolEsDependienta()) return false;
    var seccion = TAB_A_SECCION[tab];
    // Denegar por defecto cualquier destino que no tenga política explícita.
    return !!seccion && tienePermiso(seccion, "ver");
  }

  function aplicarSeccionesCompuestas() {
    var puedeResponsabilidades = tienePermiso("responsabilidades", "ver");
    var puedeIncidencias = tienePermiso("incidencias", "ver");
    setElementoVisible(document.getElementById("operacion-responsabilidades-section"), puedeResponsabilidades);
    setElementoVisible(document.getElementById("operacion-incidencias-section"), puedeIncidencias);

    var puedeUsuarios = tienePermiso("usuarios", "ver");
    var puedeCategorias = tienePermiso("categorias", "ver");
    var puedeUnidades = tienePermiso("unidades", "ver");
    setElementoVisible(document.getElementById("config-roles-section"), puedeUsuarios);
    setElementoVisible(document.getElementById("config-categorias-section"), puedeCategorias);
    setElementoVisible(document.getElementById("config-unidades-section"), puedeUnidades);
  }

  function toggleForm(id, seccion, accion) {
    var el = document.getElementById(id);
    if (el) setElementoVisible(el, tienePermiso(seccion, accion));
  }

  function aplicarPermisosAInterfaz() {
    var loggedIn = !!(typeof _usuarioActual !== "undefined" && _usuarioActual);
    var cargaOk = !!(typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa);
    var ready = loggedIn && cargaOk;
    var shell = document.getElementById("app-shell");
    var shellVisible = !!(shell && shell.classList.contains("visible"));
    var tabs = document.getElementById("tabs");

    if (!loggedIn) window.__BC_INITIAL_SECTION_SELECTED__ = false;
    if (tabs) tabs.setAttribute("data-bc-permissions-ready", ready ? "1" : "0");

    document.querySelectorAll(".tab-btn[data-tab]").forEach(function (btn) {
      var tab = btn.dataset.tab;
      if (!tab) return;
      var visible = ready && permisoTab(tab);
      setTabVisible(btn, visible);
      if (visible && tab === "ciclos") setTabLabel(btn, "Turnos");
      if (visible && tab === "resumen") setTabLabel(btn, "Centro de Control");
    });

    // Los grupos compuestos no heredan permisos de otro módulo.
    if (ready) aplicarSeccionesCompuestas();
    else {
      setElementoVisible(document.getElementById("operacion-responsabilidades-section"), false);
      setElementoVisible(document.getElementById("operacion-incidencias-section"), false);
      setElementoVisible(document.getElementById("config-roles-section"), false);
      setElementoVisible(document.getElementById("config-categorias-section"), false);
      setElementoVisible(document.getElementById("config-unidades-section"), false);
    }

    toggleForm("form-producto", "productos", "crear");
    toggleForm("form-compra", "stock", "crear");
    toggleForm("form-venta-linea", "ventas", "crear");
    toggleForm("form-almacen", "almacenes", "crear");
    toggleForm("form-transferencia", "transferencias", "crear");
    toggleForm("form-categoria", "categorias", "crear");
    toggleForm("form-unidad", "unidades", "crear");
    toggleForm("form-nuevo-usuario", "usuarios", "crear");
    toggleForm("form-nuevo-rol", "usuarios", "crear");
    toggleForm("form-responsabilidad", "responsabilidades", "crear");
    toggleForm("form-incidencia", "incidencias", "crear");

    var configGroup = document.getElementById("nav-config-group");
    var configToggle = document.getElementById("nav-config-toggle");
    var personalSettingsVisible = ready &&
      permisoTab("conectividad") && permisoTab("preferencias");
    if (configGroup) configGroup.classList.toggle("hidden", !personalSettingsVisible);
    if (configToggle) {
      configToggle.setAttribute("aria-hidden", personalSettingsVisible ? "false" : "true");
      configToggle.tabIndex = personalSettingsVisible ? 0 : -1;
    }

    if (!ready || !shellVisible) return;

    var active = document.querySelector("#tabs .tab-btn.active[data-tab]");
    var activeAllowed = active && active.getAttribute("data-bc-permiso") === "1";
    if (!window.__BC_INITIAL_SECTION_SELECTED__ || !activeAllowed) {
      var selected = false;
      for (var i = 0; i < ORDEN_HOME.length; i++) {
        var candidate = document.querySelector('#tabs .tab-btn[data-tab="' + ORDEN_HOME[i] + '"]');
        if (!candidate || candidate.getAttribute("data-bc-permiso") !== "1") continue;
        if (typeof irATab === "function") {
          irATab(ORDEN_HOME[i]);
        } else {
          candidate.click();
        }
        selected = true;
        break;
      }
      window.__BC_INITIAL_SECTION_SELECTED__ = selected;
    }
  }

  window.tienePermiso = tienePermiso;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.TAB_A_SECCION = TAB_A_SECCION;
  window.puedeVerOperaciones = puedeVerOperaciones;

  (function observarShellAutenticado() {
    var shell = document.getElementById("app-shell");
    if (!shell || shell.dataset.bcEarlyNavigationObserver === "1") return;
    shell.dataset.bcEarlyNavigationObserver = "1";
    new MutationObserver(function () {
      if (shell.classList.contains("visible")) {
        window.setTimeout(aplicarPermisosAInterfaz, 0);
      } else {
        if (tabs) tabs.setAttribute("data-bc-permissions-ready", "0");
      }
    }).observe(shell, { attributes: true, attributeFilter: ["class"] });
  })();

  var css = document.getElementById("bc-tab-sin-permiso-css");
  if (css) css.remove();
  var st = document.createElement("style");
  st.id = "bc-tab-sin-permiso-css";
  st.textContent =
    "#tabs .tab-btn[data-bc-permiso=\"0\"]," +
    "#tabs .tab-btn.tab-sin-permiso,#tabs .tab-btn.hidden," +
    ".sidebar-nav .tab-btn[data-bc-permiso=\"0\"]," +
    ".sidebar-nav .tab-btn.tab-sin-permiso,.sidebar-nav .tab-btn.hidden{" +
    "display:none!important;visibility:hidden!important;pointer-events:none!important;" +
    "height:0!important;max-height:0!important;overflow:hidden!important;" +
    "padding:0!important;margin:0!important;border:none!important;}";
  document.head.appendChild(st);

  aplicarPermisosAInterfaz();
})();
