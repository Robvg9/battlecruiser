// BattleCruiser v9.2.51 — M12-FE.2
// Engancha reset de navegación en limpiarContextoUsuario / cargarContextoUsuario
// sin duplicar el sistema de permisos.
(function () {
  "use strict";
  if (window.__bcSesionNavReset) return;
  window.__bcSesionNavReset = true;

  function doReset() {
    if (typeof resetearNavegacionParaNuevaSesion === "function") {
      resetearNavegacionParaNuevaSesion();
    } else {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
    }
  }

  function wrap() {
    if (typeof limpiarContextoUsuario === "function" && !limpiarContextoUsuario.__bcNav) {
      var origL = limpiarContextoUsuario;
      var wrappedL = function () {
        doReset();
        return origL.apply(this, arguments);
      };
      wrappedL.__bcNav = true;
      window.limpiarContextoUsuario = wrappedL;
      try { limpiarContextoUsuario = wrappedL; } catch (e) {}
    }

    if (typeof cargarContextoUsuario === "function" && !cargarContextoUsuario.__bcNav) {
      var origC = cargarContextoUsuario;
      var wrappedC = function () {
        // Al iniciar carga de NUEVO usuario: sin panel heredado
        doReset();
        return origC.apply(this, arguments);
      };
      wrappedC.__bcNav = true;
      window.cargarContextoUsuario = wrappedC;
      try { cargarContextoUsuario = wrappedC; } catch (e) {}
    }
  }

  wrap();
  // usuarios-permisos puede asignar después vía Object.assign
  setTimeout(wrap, 0);
  setTimeout(wrap, 300);
  setTimeout(wrap, 1000);
})();
