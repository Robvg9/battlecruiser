// BattleCruiser — Ocultar Configuración del menú (v9.2.42)
// FIX: el MutationObserver observaba style/class y hide() escribía style.display
// → bucle infinito → "La página no responde". Ahora solo CSS + hide idempotente.
(function () {
  'use strict';
  if (window.__bcHideConfigTab) return;
  window.__bcHideConfigTab = true;

  // CSS una sola vez — sin tocar style en bucle
  if (!document.getElementById('bc-hide-config-css')) {
    var st = document.createElement('style');
    st.id = 'bc-hide-config-css';
    st.textContent = '.tab-btn[data-tab="config"],.tab-btn.bc-config-tab-hidden{display:none!important;}';
    document.head.appendChild(st);
  }

  function hide() {
    document.querySelectorAll('.tab-btn[data-tab="config"]').forEach(function (btn) {
      if (btn.classList.contains('bc-config-tab-hidden')) return;
      btn.classList.add('hidden', 'bc-config-tab-hidden');
      btn.setAttribute('aria-hidden', 'true');
      btn.tabIndex = -1;
    });
  }

  window.bcAbrirConfigInterna = function () {
    hide();
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.remove('visible');
    });
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    var panel = document.getElementById('tab-config');
    if (panel) {
      panel.classList.add('visible');
      panel.style.display = '';
    }
    if (typeof irATab === 'function') {
      try { irATab('config'); } catch (e) {}
    }
  };

  function boot() {
    hide();
    // Re-aplicar si permisos re-muestran el botón (sin observer de style)
    setTimeout(hide, 500);
    setTimeout(hide, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
