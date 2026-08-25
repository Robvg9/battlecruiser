// BattleCruiser v9.2.87 — M26.11: reafirma menú tras cargar/limpiar contexto
// SOLO en cambio real de sesión. NO resetear navegación por recargas de
// contexto durante operación offline / venta / sincronización.
(function () {
  "use strict";
  if (window.__bcSesionNavReset52) return;
  window.__bcSesionNavReset52 = true;

  function doReset() {
    if (typeof resetearNavegacionParaNuevaSesion === "function") {
      resetearNavegacionParaNuevaSesion();
    } else {
      document.querySelectorAll(".tab-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.remove("visible");
      });
    }
  }

  function mismaSesionOperativa() {
    try {
      var shell = document.getElementById("app-shell");
      if (!shell || !shell.classList.contains("visible")) return false;
      if (window.__bcLogoutEnCurso) return false;
      var id =
        (typeof _bcSesionActivaId !== "undefined" && _bcSesionActivaId) ||
        (typeof _usuarioActualId !== "undefined" && _usuarioActualId) ||
        null;
      if (!id) return false;
      // Ya hay permisos cargados: recargar contexto no es login nuevo
      if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
        return true;
      }
      // Usuario en memoria aunque permisos fallen por red
      if (typeof _usuarioActual !== "undefined" && _usuarioActual && _usuarioActual.id) {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function wrap() {
    if (typeof limpiarContextoUsuario === "function" && !limpiarContextoUsuario.__bcNav52) {
      var origL = limpiarContextoUsuario;
      var wrappedL = function () {
        // M26.11: si un guard superior bloqueó el clear, no resetear tabs
        if (window.__bcLogoutEnCurso || !mismaSesionOperativa()) {
          doReset();
        }
        var r = origL.apply(this, arguments);
        if (typeof aplicarPermisosAInterfaz === "function") {
          try {
            aplicarPermisosAInterfaz();
          } catch (e) {}
        }
        return r;
      };
      wrappedL.__bcNav52 = true;
      window.limpiarContextoUsuario = wrappedL;
      try {
        limpiarContextoUsuario = wrappedL;
      } catch (e) {}
    }

    if (typeof cargarContextoUsuario === "function" && !cargarContextoUsuario.__bcNav52) {
      var origC = cargarContextoUsuario;
      var wrappedC = function () {
        var skipReset = mismaSesionOperativa();
        var tabAntes =
          (typeof window.__bcUltimaTabActiva === "string" && window.__bcUltimaTabActiva) ||
          null;
        if (!skipReset) {
          doReset();
        }
        var result = origC.apply(this, arguments);
        Promise.resolve(result)
          .then(function () {
            if (typeof aplicarPermisosAInterfaz === "function") {
              try {
                aplicarPermisosAInterfaz();
              } catch (e1) {}
            }
            // M26.11: si tras cargar quedó sin sección, restaurar
            if (typeof window.__bcGarantizarIntegridadShell === "function") {
              try {
                window.__bcGarantizarIntegridadShell(tabAntes || "ventas");
              } catch (e2) {}
            }
          })
          .catch(function () {
            if (typeof aplicarPermisosAInterfaz === "function") {
              try {
                aplicarPermisosAInterfaz();
              } catch (e3) {}
            }
            if (typeof window.__bcGarantizarIntegridadShell === "function") {
              try {
                window.__bcGarantizarIntegridadShell(tabAntes || "ventas");
              } catch (e4) {}
            }
          });
        return result;
      };
      wrappedC.__bcNav52 = true;
      window.cargarContextoUsuario = wrappedC;
      try {
        cargarContextoUsuario = wrappedC;
      } catch (e) {}
    }
  }

  wrap();
  Promise.resolve().then(wrap);
  window.addEventListener("load", wrap);
})();
