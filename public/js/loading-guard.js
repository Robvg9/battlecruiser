// ==== BattleCruiser · js/loading-guard.js ====
// FASE 1 Offline Core: capa de compatibilidad.
// NO es owner del loading. Owner único: offline.js (showLoading/hideLoading/withLoading/resetLoadingOverlay).
// Este módulo solo:
// 1) asegura que window.* apunta al owner de offline.js si ya existe;
// 2) recovery de Auth (SIGNED_IN / sesión) que resetea overlay;
// 3) fail-safe último recurso (watchdog) si el contador queda >0 demasiado tiempo.
(function instalarLoadingGuard() {
  "use strict";

  var MAX_LOADING_MS = 45000;
  var timer = null;

  function delegarSiExiste() {
    if (typeof window.showLoading === "function" && typeof window.hideLoading === "function") {
      return true;
    }
    return false;
  }

  function asegurarOverlayHidden() {
    var el = document.getElementById("global-loading-overlay");
    if (el) {
      el.classList.remove("visible");
      el.style.display = "none";
    }
  }

  function failSafeWatchdog() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      try {
        var count = typeof window.__bcLoadingCount === "function" ? window.__bcLoadingCount() : null;
        if (count === null || count > 0) {
          console.error("[BattleCruiser] Loading fail-safe: overlay residual > " + MAX_LOADING_MS + "ms. Se fuerza reset.", {
            operaciones_activas: count,
          });
          if (typeof window.resetLoadingOverlay === "function") {
            window.resetLoadingOverlay();
          } else {
            asegurarOverlayHidden();
          }
        }
      } catch (e) {
        asegurarOverlayHidden();
      }
    }, MAX_LOADING_MS);
  }

  function envolverFailSafeSobreOwner() {
    if (typeof window.showLoading !== "function") return;
    if (window.showLoading.__bcFailSafeWrapped) return;
    var originalShow = window.showLoading;
    window.showLoading = function () {
      originalShow.apply(this, arguments);
      failSafeWatchdog();
    };
    window.showLoading.__bcFailSafeWrapped = true;
  }

  function instalarRecuperacionAuth() {
    if (typeof client === "undefined" || !client || !client.auth) return;
    try {
      client.auth.onAuthStateChange(function (event, session) {
        if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
          if (typeof window.resetLoadingOverlay === "function") window.resetLoadingOverlay();
        }
      });
      client.auth.getSession().then(function (resultado) {
        if (resultado && resultado.data && resultado.data.session) {
          if (typeof window.resetLoadingOverlay === "function") window.resetLoadingOverlay();
        }
      }).catch(function () {});
    } catch (e) {
      console.warn("[BattleCruiser] No se pudo instalar recuperación de loading por Auth:", e);
    }
  }

  asegurarOverlayHidden();

  if (!delegarSiExiste()) {
    var stubCount = 0;
    window.showLoading = function () {
      stubCount++;
      var el = document.getElementById("global-loading-overlay");
      if (!el) {
        el = document.createElement("div");
        el.id = "global-loading-overlay";
        el.className = "loading-overlay";
        el.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(el);
      }
      el.style.display = "flex";
      el.classList.add("visible");
      failSafeWatchdog();
    };
    window.hideLoading = function () {
      stubCount = Math.max(0, stubCount - 1);
      if (stubCount === 0) asegurarOverlayHidden();
    };
    window.resetLoadingOverlay = function () {
      stubCount = 0;
      asegurarOverlayHidden();
    };
    window.withLoading = async function (fn) {
      window.showLoading();
      try {
        return await fn();
      } finally {
        window.hideLoading();
      }
    };
    console.warn("[BattleCruiser] loading-guard: offline.js no estaba cargado; stubs temporales activos.");
  } else {
    envolverFailSafeSobreOwner();
  }

  instalarRecuperacionAuth();
  console.info("[BattleCruiser] Loading guard (compat) activo — owner: offline.js");
})();
