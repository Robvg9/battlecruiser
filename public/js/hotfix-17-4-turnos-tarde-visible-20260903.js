// BattleCruiser — 17.5: neutralizar la inyección visual de bloques legacy en M33.
(function () {
  'use strict';
  function clean() {
    var modal = document.getElementById('m33-bg');
    if (!modal) return;
    modal.querySelectorAll('.bc14-turnos, .bc-session-recovery, [data-bc174-tarde], [data-bc14-turnos]').forEach(function (node) {
      node.remove();
    });
  }
  function boot() {
    if (!document.body) return;
    clean();
    if (window.__BC174_CLEANUP_OBSERVER) return;
    var observer = new MutationObserver(clean);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__BC174_CLEANUP_OBSERVER = observer;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
