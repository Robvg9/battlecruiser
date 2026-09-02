// BattleCruiser — Integración final de regresiones 2026-09-02
(function () {
  'use strict';
  if (window.__BCFinalIntegration20260902) return;
  window.__BCFinalIntegration20260902 = true;

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
      btn.onclick = function () {
        const official = document.getElementById('bc-m55-open');
        if (official) official.click();
        else window.setTimeout(() => {
          const retry = document.getElementById('bc-m55-open');
          if (retry) retry.click();
        }, 250);
      };
    }
    const xlsx = document.getElementById('bc-exportar-plantilla-xlsx');
    if (xlsx && !xlsx.dataset.bcOfficialTemplate) {
      xlsx.dataset.bcOfficialTemplate = '1';
      xlsx.onclick = function () {
        const official = document.getElementById('bc-m55-template');
        if (official) official.click();
        else document.getElementById('bc-exportar-plantilla-csv')?.click();
      };
    }
  }

  function patch() { patchSessionOpen(); patchImportButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch, {once:true});
  else patch();
  setTimeout(patch, 300);
  setTimeout(patch, 900);
  setTimeout(patch, 1800);
})();