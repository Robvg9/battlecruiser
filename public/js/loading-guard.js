// ==== BattleCruiser · js/loading-guard.js ====
// Control global del overlay de carga + recuperación ante estados residuales.
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
    if (el) {
      el.classList.remove("visible");
      el.style.display = "none";
    }
  }

  function mostrar() {
    var el = obtenerOverlay();
    el.style.display = "flex";
    el.classList.add("visible");
  }

  function vigilar() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      if (activos > 0) {
        console.error("[BattleCruiser] Loading global excedió 35s; se fuerza recuperación de UI.", {
          operaciones_activas: activos,
        });
        activos = 0;
        ocultar();
      }
    }, MAX_LOADING_MS);
  }

  window.showLoading = function () {
    activos += 1;
    mostrar();
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

  // La autenticación puede emitir SIGNED_IN antes de que la promesa de
  // signInWithPassword termine. Si eso ocurre, el loading iniciado por el
  // formulario no debe bloquear la aplicación aunque esa promesa se demore.
  function instalarRecuperacionAuth() {
    if (typeof client === "undefined" || !client.auth) return;
    try {
      client.auth.onAuthStateChange(function (event, session) {
        if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
          window.resetLoadingOverlay();
        }
      });
      client.auth.getSession().then(function (resultado) {
        if (resultado && resultado.data && resultado.data.session) {
          window.resetLoadingOverlay();
        }
      }).catch(function () {});
    } catch (e) {
      console.warn("[BattleCruiser] No se pudo instalar recuperación de loading por Auth:", e);
    }
  }

  // Limpia cualquier overlay residual que pudiera existir antes de instalar el guard.
  var viejo = document.getElementById("global-loading-overlay");
  if (viejo) {
    viejo.classList.remove("visible");
    viejo.style.display = "none";
  }

  instalarRecuperacionAuth();
  console.info("[BattleCruiser] Loading guard activo.");
})();
