// BattleCruiser — Integración final de regresiones 2026-09-02
(function () {
  'use strict';
  if (window.__BCFinalIntegration20260902) return;
  window.__BCFinalIntegration20260902 = true;

  function ensureRealTestFix() {
    if (document.querySelector('script[data-bc-real-tests-fix="1"]')) return;
    const s = document.createElement('script');
    s.src = 'js/hotfix-pruebas-reales-20260902.js?v=20260902.2';
    s.async = false;
    s.dataset.bcRealTestsFix = '1';
    document.body.appendChild(s);
  }

  function patchSessionOpen() {
    const hub = window.__BC_M33;
    const api = window.BattleCruiserTurnoAPI;
    if (!hub || typeof hub.open !== 'function' || !api || typeof api.iniciarSesion !== 'function') return;
    if (hub.open.__bcFinalSessionOpen) return;
    const original = hub.open;
    const wrapped = async function (turnoId) {
      const result = await original.apply(this, arguments);
      const modal = document.getElementById('m33-bg');
      if (!modal) return result;
      modal.querySelectorAll('[data-bc-reg-open-session]').forEach(btn => {
        const replacement = btn.cloneNode(true);
        btn.replaceWith(replacement);
        replacement.addEventListener('click', async function () {
          if (replacement.disabled) return;
          replacement.disabled = true;
          try {
            await api.iniciarSesion(replacement.getAttribute('data-bc-reg-open-session'));
            await wrapped(turnoId);
          } catch (e) {
            window.alert(e && e.message ? e.message : String(e));
            replacement.disabled = false;
          }
        });
      });
      return result;
    };
    wrapped.__bcFinalSessionOpen = true;
    hub.open = wrapped;
  }

  function patchImportButtons() {
    const btn = document.getElementById('bc-importar-excel-hotfix');
    if (btn && !btn.dataset.bcOfficialImport) {
      btn.dataset.bcOfficialImport = '1';
      btn.onclick = function () { document.getElementById('bc-m55-open')?.click(); };
    }
  }

  function patch() { ensureRealTestFix(); patchSessionOpen(); patchImportButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch, {once:true}); else patch();
  [200,500,1000,2000,4000,7000].forEach(ms => setTimeout(patch, ms));
})();
