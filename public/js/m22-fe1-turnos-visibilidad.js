// BattleCruiser M22-FE.1 — Visibilidad de Turnos según turnos.ver real.
// Causa: m18-ciclos-ux.js hideLegacy() fuerza display:none en data-tab="turnos"
// aunque aplicarPermisosAInterfaz() lo haya habilitado con turnos.ver.
// NO mezcla con ciclos. NO cambia semántica crear/editar.
(function () {
  'use strict';
  var STYLE_ID = 'm22-fe1-turnos-css';

  function tieneVerTurnos() {
    return typeof tienePermiso === 'function' && tienePermiso('turnos', 'ver');
  }

  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '#tab-turnos.tab-panel.visible{display:block!important}' +
      '#tab-turnos.tab-panel:not(.visible){display:none!important}';
    document.head.appendChild(st);
  }

  function restaurarBotonTurnos() {
    var btn = document.querySelector('.tab-btn[data-tab="turnos"]');
    if (!btn) return;

    if (!tieneVerTurnos()) {
      return;
    }

    btn.style.removeProperty('display');
    btn.classList.remove('hidden', 'tab-sin-permiso');
    btn.setAttribute('data-bc-permiso', '1');
    btn.removeAttribute('aria-hidden');
    btn.tabIndex = 0;
    if (!btn.textContent || /turnos/i.test(btn.textContent) === false) {
      btn.textContent = 'Turnos';
    }

    var ciclosBtn = document.querySelector('.tab-btn[data-tab="ciclos"]');
    if (ciclosBtn && ciclosBtn.getAttribute('data-bc-permiso') === '1') {
      var t = (ciclosBtn.textContent || '').trim();
      if (/^turnos$/i.test(t)) {
        ciclosBtn.textContent = 'Ciclos Operativos';
      }
    }
  }

  function aplicar() {
    ensureCss();
    restaurarBotonTurnos();
  }

  function hookPermisos() {
    var orig = window.aplicarPermisosAInterfaz;
    if (typeof orig !== 'function') return false;
    if (orig.__m22fe1Hook) {
      aplicar();
      return true;
    }
    var wrapped = function () {
      var ret = orig.apply(this, arguments);
      try { aplicar(); } catch (e) {}
      return ret;
    };
    wrapped.__m22fe1Hook = true;
    if (orig.__bcOpHubHook) wrapped.__bcOpHubHook = true;
    window.aplicarPermisosAInterfaz = wrapped;
    try { aplicarPermisosAInterfaz = wrapped; } catch (e) {}
    aplicar();
    return true;
  }

  function boot() {
    ensureCss();
    if (!hookPermisos()) {
      var n = 0;
      var t = setInterval(function () {
        if (hookPermisos() || ++n > 60) clearInterval(t);
      }, 100);
    }
    setTimeout(aplicar, 700);
    setTimeout(aplicar, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
