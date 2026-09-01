// BattleCruiser — M61: limpieza de UI al cerrar sesión
// Garantiza que overlays/drawers creados dinámicamente por una sesión no sobrevivan al SIGNED_OUT.
(function () {
  'use strict';
  if (window.__BC_M61_AUTH_UI) return;
  window.__BC_M61_AUTH_UI = true;

  function cleanupAuthUi() {
    try {
      document.documentElement.classList.remove('bc-auth-booting');
      document.body.classList.remove('bc-aj-open');
    } catch (e) {}

    ['bc-aj-panel', 'bc-aj-backdrop', 'm33-bg', 'tm-modal-bg', 'm29-modal-bg'].forEach(function (id) {
      try {
        var el = document.getElementById(id);
        if (el) el.remove();
      } catch (e) {}
    });

    try {
      document.querySelectorAll('.modal-bg,.modal-overlay,[data-auth-session-overlay="1"]').forEach(function (el) {
        el.remove();
      });
    } catch (e2) {}

    try {
      var legacy = document.getElementById('ajustes-menu');
      if (legacy) {
        legacy.classList.add('bc-legacy-hidden');
        legacy.classList.remove('open', 'visible', 'show');
      }
    } catch (e3) {}
  }

  window.__BC_M61_cleanupAuthUi = cleanupAuthUi;

  function bindAuth() {
    try {
      if (typeof client === 'undefined' || !client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') return;
      client.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT' || !session) cleanupAuthUi();
      });
    } catch (e) {
      console.warn('[BattleCruiser] M61 auth UI cleanup no pudo enlazar Auth', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAuth);
  else bindAuth();
})();
