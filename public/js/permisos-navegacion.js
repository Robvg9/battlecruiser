// BattleCruiser v9.3.06 — Navegación: visibilidad completa de secciones
// La seguridad de acciones/formularios continúa dependiendo de permisos efectivos.
// Las secciones operativas se dejan visibles para permitir revisión completa de la aplicación.
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
    resumen: "reportes",
    productos: "productos",
    ventas: "ventas",
    almacenes: "almacenes",
    transferencias: "transferencias",
    compras: "stock",
    reportes: "reportes",
    inventario: "reportes",
    movimientos: "reportes",
    turnos: "turnos",\n    jornada: "turnos",
    ciclos: "turnos",
    comunicacion: "comunicacion",
    mando: "auditoria",
    usuarios: "usuarios"
  };

  var ORDEN_HOME = [
    "resumen", "jornada", "ventas", "comunicacion", "productos", "ciclos", "operacion",
    "almacenes", "transferencias", "compras", "reportes", "inventario",
    "movimientos", "usuarios", "mando", "config"
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
      return;
    }
    btn.textContent = text;
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
    var shell = document.getElementById("app-shell");
    var shellVisible = !!(shell && shell.classList.contains("visible"));

    document.querySelectorAll(".tab-btn[data-tab]").forEach(function (btn) {
      var tab = btn.dataset.tab;
      if (!tab) return;

      if (!loggedIn || !cargaOk) {
        // No bloquear la navegación mientras llegan los RPC del perfil.
        // Los formularios sensibles permanecen fail-closed mediante tienePermiso().
        if (!shellVisible || tab === "transferencias" || tab === "vales" || tab === "turnos") {
          setTabVisible(btn, false);
        } else {
          setTabVisible(btn, true);
        }
        return;
      }

      // Revisión completa: las secciones de la aplicación deben poder visualizarse.
      // Transferencias y Vales permanecen fuera del menú lateral según el diseño vigente.
      if (tab === "transferencias" || tab === "vales" || tab === "turnos") {
        setTabVisible(btn, false);
        return;
      }

      // Jornada es la ruta ordinaria; los permisos de escritura se vuelven a validar en los RPC.
      if (tab === "jornada") {
        setTabVisible(btn, true);
        return;
      }

      // El flujo POS legado se conserva para el dueño/historial, pero no es la ruta ordinaria de la dependienta.
      if (tab === "ventas") {
        var u = (typeof _usuarioActual !== "undefined" && _usuarioActual) || window.__bcUser || {};
        var rol = String(u.rol || u.role_name || u.nombre_rol || u.role || "").toLowerCase();
        if (rol.indexOf("dependienta") >= 0) {
          setTabVisible(btn, false);
          return;
        }
      }

      if (tab === "config" || tab === "pendientes") {
        setTabVisible(btn, true);
        return;
      }

      if (tab === "operacion") {
        setTabVisible(btn, true);
        return;
      }

      if (tab === "ciclos") {
        setTabVisible(btn, true);
        setTabLabel(btn, "Turnos");
        return;
      }

      if (tab === "resumen") {
        setTabVisible(btn, true);
        setTabLabel(btn, "Centro de Control");
        return;
      }

      // Las pestañas quedan visibles para inspección. Las acciones sensibles siguen
      // protegidas por tienePermiso() y por las validaciones del backend.
      setTabVisible(btn, true);
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

    // Selección inicial determinista: Centro de Control, no Administración.
    if (shellVisible && !window.__BC_INITIAL_SECTION_SELECTED__) {
      window.__BC_INITIAL_SECTION_SELECTED__ = true;
      var selectedAtBoot = document.querySelector("#tabs .tab-btn.active[data-tab]");
      if (!selectedAtBoot || selectedAtBoot.dataset.tab !== "resumen") {
        if (typeof irATab === "function") {
          try { irATab("resumen"); } catch (e) {}
        } else {
          document.querySelectorAll("#tabs .tab-btn.active").forEach(function (b) { b.classList.remove("active"); });
          document.querySelectorAll(".tab-panel.visible").forEach(function (p) { p.classList.remove("visible"); });
          var homeButton = document.querySelector('#tabs .tab-btn[data-tab="resumen"]');
          var homePanel = document.getElementById("tab-resumen");
          if (homeButton) homeButton.classList.add("active");
          if (homePanel) homePanel.classList.add("visible");
        }
      }
    }

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

    mostrarEstadoSinPermisos(false);
  }

  window.tienePermiso = tienePermiso;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.TAB_A_SECCION = TAB_A_SECCION;
  window.puedeVerOperaciones = puedeVerOperaciones;
  // Reevaluar justo cuando auth.js abre el shell, sin esperar los RPC de perfil.
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
