// BattleCruiser — Ocultar sección Configuración del menú (v9.2.39)
// Preferencias viven en Ajustes (header). Categorías/unidades siguen en #tab-config
// vía Ajustes → Administrador de datos (sin ítem en el menú).
(function () {
  'use strict';
  if (window.__bcHideConfigTab) return;
  window.__bcHideConfigTab = true;

  function hide() {
    document.querySelectorAll('.tab-btn[data-tab="config"]').forEach(function (btn) {
      btn.classList.add('hidden', 'bc-config-tab-hidden');
      btn.style.display = 'none';
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
    setTimeout(hide, 400);
    setTimeout(hide, 1200);
    setTimeout(hide, 3000);
  }

  var tabs = document.getElementById('tabs');
  if (tabs) {
    new MutationObserver(function () { hide(); }).observe(tabs, {
      attributes: true,
      subtree: true,
      attributeFilter: ['style', 'class']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
