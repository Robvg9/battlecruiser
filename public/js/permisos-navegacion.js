// BattleCruiser v9.2.52 — M12-FE.3
// ÚNICA autoridad de menú. Fail-closed. Sin pestañas "siempre visibles".
// Fuente: permisos_usuario_actual → _permisosEfectivos → tienePermiso → menú.
(function () {
  "use strict";
  // Esta versión siempre gana sobre definiciones previas de usuarios-permisos.js
  window.__BC_PERMISOS_CANONICO__ = true;
  window.__BC_PERMISOS_FE3__ = true;

  function tienePermiso(seccion, accion) {
    if (typeof _usuarioActual === "undefined" || !_usuarioActual) return false;
    if (typeof _permisosCargaExitosa === "undefined" || !_permisosCargaExitosa) return false;
    if (typeof _permisosEfectivos === "undefined" || !_permisosEfectivos) return false;
    var sec = _permisosEfectivos[seccion];
    return !!(sec && sec[accion] === true);
  }

  // Claves = data-tab del menú. Valores = seccion del backend / matriz.
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
      btn.style.display = "";
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
    } else {
      btn.classList.add("hidden", "tab-sin-permiso");
      btn.style.display = "none";
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

      // Sin sesión o sin carga exitosa: ocultar TODO (sin flash de menú completo)
      if (!loggedIn || !cargaOk) {
        setTabVisible(btn, false);
        return;
      }

      // config: no es sección de menú operativa
      if (tab === "config") {
        setTabVisible(btn, false);
        return;
      }

      // Centro de control: solo si el usuario tiene al menos un ver (no permanente)
      if (tab === "resumen") {
        setTabVisible(btn, tieneAlgunaVista());
        return;
      }

      // Pendientes: ligado a turnos/ciclos, no permanente
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
          if (b && !b.classList.contains("tab-sin-permiso") && b.style.display !== "none") {
            if (typeof irATab === "function") {
              try { irATab(t); } catch (e) {}
            } else {
              document.querySelectorAll(".tab-btn").forEach(function (x) { x.classList.remove("active"); });
              document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
              b.classList.add("active");
              var p = document.getElementById("tab-" + t);
              if (p) p.classList.add("visible");
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

  function seleccionarPrimeraSeccionAutorizada() {
    for (var i = 0; i < ORDEN_HOME.length; i++) {
      var t = ORDEN_HOME[i];
      var b = document.querySelector('.tab-btn[data-tab="' + t + '"]');
      if (b && !b.classList.contains("tab-sin-permiso") && b.style.display !== "none") {
        if (typeof irATab === "function") {
          try { irATab(t); } catch (e) {}
        }
        return t;
      }
    }
    return null;
  }

  // Sobrescribe definiciones de usuarios-permisos.js (fail-open)
  window.tienePermiso = tienePermiso;
  window.aplicarPermisosAInterfaz = aplicarPermisosAInterfaz;
  window.TAB_A_SECCION = TAB_A_SECCION;
  window.resetearNavegacionParaNuevaSesion = resetearNavegacionParaNuevaSesion;
  window.seleccionarPrimeraSeccionAutorizada = seleccionarPrimeraSeccionAutorizada;
  window.togglePorPermiso = function (elId, seccion, accion) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.classList.toggle("hidden", !tienePermiso(seccion, accion));
  };

  try { tienePermiso = tienePermiso; } catch (e) {}
  try { aplicarPermisosAInterfaz = aplicarPermisosAInterfaz; } catch (e) {}
  try { TAB_A_SECCION = TAB_A_SECCION; } catch (e) {}
  try { resetearNavegacionParaNuevaSesion = resetearNavegacionParaNuevaSesion; } catch (e) {}
  try { seleccionarPrimeraSeccionAutorizada = seleccionarPrimeraSeccionAutorizada; } catch (e) {}
  try { togglePorPermiso = window.togglePorPermiso; } catch (e) {}

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
