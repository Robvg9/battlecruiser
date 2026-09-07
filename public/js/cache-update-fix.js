// BattleCruiser — cache cleanup hardening
// Replaces the legacy updater with an explicit cache scope. Only caches whose
// name starts with battlecruiser-shell- are eligible for deletion.
(function bcPatchCacheUpdater(){
  "use strict";
  if (window.__BC_CACHE_UPDATE_FIX__) return;
  window.__BC_CACHE_UPDATE_FIX__ = true;

  function patch(){
    if (typeof window.actualizarApp !== "function" || window.actualizarApp.__bcCacheScopeFix) return false;

    var original = window.actualizarApp;
    async function actualizarAppScopada(btn){
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Actualizando...";
      }
      try {
        if ("serviceWorker" in navigator) {
          var regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(function(r){ return r.unregister(); }));
        }
        if ("caches" in window && window.caches && typeof window.caches.keys === "function") {
          var keys = await window.caches.keys();
          var propias = keys.filter(function(k){ return String(k).startsWith("battlecruiser-shell-"); });
          await Promise.all(propias.map(function(k){ return window.caches.delete(k); }));
        }
      } catch (e) {
        console.warn("[BattleCruiser] actualización: limpieza parcial", e);
      }

      var ver = (typeof window.__BC_VERSION__ === "string" && window.__BC_VERSION__) || "9.2.80";
      var u = new URL(location.href);
      u.searchParams.set("bc_update", ver + "-" + Date.now());
      location.replace(u.toString());
    }

    actualizarAppScopada.__bcCacheScopeFix = true;
    actualizarAppScopada.__bcCacheScopeOriginal = original;
    window.actualizarApp = actualizarAppScopada;
    return true;
  }

  patch();
  setTimeout(patch, 0);
  setTimeout(patch, 250);
  setTimeout(patch, 1000);
})();
