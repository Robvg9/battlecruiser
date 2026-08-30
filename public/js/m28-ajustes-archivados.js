// BattleCruiser — M28-CORRECCIÓN: acceso "Usuarios archivados" desde Ajustes
(function () {
  'use strict';
  if (window.__bcM28AjustesArch) return;
  window.__bcM28AjustesArch = true;

  function injectLink() {
    var body = document.querySelector('#bc-aj-panel .bc-aj-body');
    if (!body || document.getElementById('bc-aj-archivados')) return;

    var pass = document.getElementById('bc-aj-pass');
    var anchor = pass || body.querySelector('.bc-aj-sec:last-of-type');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'bc-aj-archivados';
    btn.className = 'bc-aj-link';
    btn.innerHTML =
      '<div class="bc-aj-row-text"><strong>Usuarios archivados</strong>' +
      '<small>Ver y restaurar usuarios fuera de la lista operativa.</small></div><span>›</span>';
    btn.addEventListener('click', function () {
      try {
        var closeBtn = document.getElementById('bc-aj-close');
        if (closeBtn) closeBtn.click();
        else {
          var p = document.getElementById('bc-aj-panel');
          var b = document.getElementById('bc-aj-backdrop');
          if (p) p.classList.remove('open');
          if (b) b.classList.remove('open');
          document.body.classList.remove('bc-aj-open');
        }
      } catch (e) {}
      if (typeof window.__bcM28AbrirArchivados === 'function') {
        window.__bcM28AbrirArchivados();
      } else {
        var tabBtn = document.querySelector('.tab-btn[data-tab="usuarios"]');
        if (tabBtn) tabBtn.click();
      }
    });

    if (pass && pass.parentNode) {
      pass.parentNode.insertBefore(btn, pass);
    } else if (anchor && anchor.parentNode) {
      anchor.parentNode.appendChild(btn);
    } else {
      body.appendChild(btn);
    }
  }

  function boot() {
    injectLink();
    setTimeout(injectLink, 600);
    setTimeout(injectLink, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }
})();
