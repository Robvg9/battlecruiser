// BattleCruiser — M49.6: compatibilidad visual del expediente de jornadas diarias.
// La presentación M33 es la fuente única; este módulo solo restaura markup de cachés antiguas.
(function () {
  'use strict';
  if (window.__BC_M49_DAILY_LAYOUT_V496) return;
  window.__BC_M49_DAILY_LAYOUT_V496 = true;

  function removeObsoletePanels(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('#m33-bg .bc14-turnos, #m33-bg [data-bc14-turnos]').forEach(function (node) {
      node.remove();
    });
  }

  function restoreBody(body) {
    if (!body) return;
    var baseGrid = Array.prototype.slice.call(body.querySelectorAll('.m33-session-grid'))
      .find(function (grid) { return !grid.classList.contains('m49-session-grid'); }) || null;

    Array.prototype.slice.call(body.querySelectorAll('.m49-session-grid')).forEach(function (grid) {
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.m49-session-card, .m49-step2-card'));
      cards.forEach(function (card) {
        card.classList.remove('m49-session-card', 'm49-step2-card');
        if (baseGrid) baseGrid.appendChild(card);
        else body.appendChild(card);
      });
      grid.remove();
    });

    body.querySelectorAll('.m49-step2-control, .m49-session-heading').forEach(function (node) {
      node.remove();
    });
    body.querySelectorAll('.m49-session-card, .m49-step2-card').forEach(function (node) {
      node.classList.remove('m49-session-card', 'm49-step2-card');
    });
    if (body.querySelector('select[data-m33-sids]')) body.removeAttribute('data-m33-step');
  }

  function clean() {
    var overlay = document.getElementById('m33-bg');
    if (!overlay) return;
    overlay.querySelectorAll('.m33-body').forEach(restoreBody);
    removeObsoletePanels(overlay);
  }

  function boot() {
    if (!document.body || window.__BC_M49_DAILY_OBSERVER) return;
    clean();
    var observer = new MutationObserver(clean);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__BC_M49_DAILY_OBSERVER = observer;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
