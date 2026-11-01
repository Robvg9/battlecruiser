// Compatibilidad legacy: nunca insertar paneles por bloque en el expediente M33.
(function () {
  'use strict';
  function removeObsoletePanel(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('#m33-bg .bc14-turnos, #m33-bg [data-bc14-turnos]').forEach(function (node) {
      node.remove();
    });
  }
  function boot() {
    if (!document.body) return;
    removeObsoletePanel(document);
    if (window.__BC145_CLEANUP_OBSERVER) return;
    var observer = new MutationObserver(function () { removeObsoletePanel(document); });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__BC145_CLEANUP_OBSERVER = observer;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
