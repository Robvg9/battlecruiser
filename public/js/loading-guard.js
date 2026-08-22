// ==== BattleCruiser · js/loading-guard.js ====
// Misión: estabilización definitiva del overlay global de carga.
// Se instala DESPUÉS de los módulos existentes y sustituye el contador
// global anterior por un controlador independiente de operaciones activas.
// No toca IndexedDB, Supabase ni la lógica de negocio.
(function instalarLoadingGuard() {
  "use strict";

  var overlay = null;
  var activos = 0;
  var timer = null;
  var MAX_LOADING_MS = 35000;

  function obtenerOverlay() {
    overlay = document.getElementById("global-loading-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "global-loading-overlay";
      overlay.className = "loading-overlay";
      overlay.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function ocultar() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    var el = document.getElementById("global-loading-overlay");
    if (el) el.classList.remove("visible");
  }

  function vigilar() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      if (activos > 0) {
        console.error("[Battlecruiser] Loading global excedió 35s; se fuerza recuperación de UI.", {
          operaciones_activas: activos,
        });
        activos = 0;
        ocultar();
      }
    }, MAX_LOADING_MS);
  }

  // Descarta cualquier estado residual creado por la implementación anterior.
  var viejo = document.getElementById("global-loading-overlay");
  if (viejo) viejo.classList.remove("visible");

  window.showLoading = function () {
    activos += 1;
    obtenerOverlay().classList.add("visible");
    if (activos === 1) vigilar();
  };

  window.hideLoading = function () {
    activos = Math.max(0, activos - 1);
    if (activos === 0) ocultar();
  };

  window.resetLoadingOverlay = function () {
    activos = 0;
    ocultar();
  };

  window.withLoading = async function (fn) {
    window.showLoading();
    try {
      return await fn();
    } finally {
      window.hideLoading();
    }
  };

  console.info("[Battlecruiser] Loading guard activo.");
})();
