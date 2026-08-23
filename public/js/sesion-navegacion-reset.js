// BattleCruiser v9.2.52 — reafirma menú tras cargar/limpiar contexto
(function () {
  "use strict";
  if (window.__bcSesionNavReset52) return;
  window.__bcSesionNavReset52 = true;

  function doReset() {
    if (typeof resetearNavegacionParaNuevaSesion === "function") {
      resetearNavegacionParaNuevaSesion();
    } else {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("visible"); });
    }
  }

  function wrap() {
    if (typeof limpiarContextoUsuario === "function" && !limpiarContextoUsuario.__bcNav52) {
      var origL = limpiarContextoUsuario;
      var wrappedL = function () {
        doReset();
        var r = origL.apply(this, arguments);
        if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
        return r;
      };
      wrappedL.__bcNav52 = true;
      window.limpiarContextoUsuario = wrappedL;
      try { limpiarContextoUsuario = wrappedL; } catch (e) {}
    }

    if (typeof cargarContextoUsuario === "function" && !cargarContextoUsuario.__bcNav52) {
      var origC = cargarContextoUsuario;
      var wrappedC = function () {
        doReset();
        var result = origC.apply(this, arguments);
        Promise.resolve(result).then(function () {
          if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
        }).catch(function () {
          if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
        });
        return result;
      };
      wrappedC.__bcNav52 = true;
      window.cargarContextoUsuario = wrappedC;
      try { cargarContextoUsuario = wrappedC; } catch (e) {}
    }
  }

  wrap();
  Promise.resolve().then(wrap);
  window.addEventListener("load", wrap);
})();
