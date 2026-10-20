// BattleCruiser — Configuración unificada 2026-09-02
(function () {
  'use strict';
  if (window.__BCConfigMove20260902) return;
  window.__BCConfigMove20260902 = true;

  function movePanel() {
    const tab = document.getElementById('tab-config');
    const trigger = document.getElementById('ajustes-btn');
    if (!tab) return;

    let panel = document.getElementById('bc-aj-panel');
    if (!panel && trigger && typeof trigger.click === 'function') {
      // The existing Ajustes module owns all handlers/preferences. Build its real panel,
      // then move that same DOM node instead of cloning it and losing listeners.
      trigger.click();
      panel = document.getElementById('bc-aj-panel');
    }
    if (!panel) return;

    if (!panel.dataset.bcMovedToConfig) {
      panel.dataset.bcMovedToConfig = '1';
      panel.removeAttribute('role');
      panel.setAttribute('aria-label', 'Configuración');
      const h = panel.querySelector('.bc-aj-head h2');
      if (h) h.textContent = '⚙️ Configuración';
      panel.classList.remove('open');
      const x = panel.querySelector('#bc-aj-close');
      if (x) x.style.display = 'none';
      const logout = panel.querySelector('#bc-aj-logout');
      if (logout) logout.style.display = 'none';
      tab.appendChild(panel);
      const body = panel.querySelector('.bc-aj-body');
      if (body) body.classList.add('bc-config-preferences-body');

      const oldNote = tab.querySelector('#cfg-preferences-note');
      if (!oldNote) {
        const note = document.createElement('p');
        note.id = 'cfg-preferences-note';
        note.className = 'muted';
        note.textContent = 'Preferencias personales, sincronización, apariencia, conexión y mantenimiento. Los controles administrativos mantienen sus permisos actuales.';
        const head = tab.querySelector('h3');
        if (head) head.insertAdjacentElement('afterend', note);
        else tab.prepend(note);
      }
    }
    const backdrop = document.getElementById('bc-aj-backdrop');
    if (backdrop) backdrop.remove();
    // This panel is inline in Configuración, never an open drawer after migration.
    releaseScrollLock();
  }

  function releaseScrollLock() {
    if (!document.body) return;
    var panel = document.getElementById('bc-aj-panel');
    var tab = document.getElementById('tab-config');
    var active = !!(tab && tab.classList.contains('visible'));
    if (panel && panel.dataset.bcMovedToConfig === '1') {
      panel.classList.remove('open');
      document.body.classList.remove('bc-aj-open');
    }
    if (active) {
      // Android WebView/PWA may ignore document scrolling even when height/overflow are reset.
      // Give Configuración its own bounded, touch-scrollable region as a reliable fallback.
      document.body.classList.add('bc-config-scroll-unlocked');
      if (document.documentElement) document.documentElement.classList.add('bc-config-scroll-unlocked');
      tab.classList.add('bc-config-scroll-region');
      if (!tab.hasAttribute('tabindex')) tab.setAttribute('tabindex', '0');
    } else {
      document.body.classList.remove('bc-config-scroll-unlocked');
      if (document.documentElement) document.documentElement.classList.remove('bc-config-scroll-unlocked');
      if (tab) tab.classList.remove('bc-config-scroll-region');
    }
  }

  function css() {
    if (document.getElementById('bc-config-unified-css')) return;
    const s = document.createElement('style');
    s.id = 'bc-config-unified-css';
    s.textContent = [
      '#tab-config #bc-aj-panel{position:relative;top:auto;right:auto;width:100%;max-width:none;height:auto;min-height:0;transform:none!important;border:0;box-shadow:none;background:transparent;display:block;overflow:visible}',
      '#tab-config #bc-aj-panel .bc-aj-head{padding:8px 0 12px;background:transparent}',
      '#tab-config #bc-aj-panel .bc-aj-head h2{font-size:1.25rem}',
      '#tab-config #bc-aj-panel .bc-aj-body{padding:0;overflow:visible}',
      '#tab-config #bc-aj-panel .bc-aj-sec{margin-bottom:16px}',
      '#tab-config #bc-aj-panel .bc-aj-logout{display:none!important}',
      '#tab-config #bc-aj-panel .bc-aj-x{display:none!important}',
      '#cfg-preferences-note{margin:4px 0 14px}'
    ].join('');
    document.head.appendChild(s);
  }

  function boot() { css(); movePanel(); releaseScrollLock(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('.tab-btn[data-tab]') : null;
    if (!target) return;
    setTimeout(function () {
      if (target.getAttribute('data-tab') === 'config') {
        movePanel();
        releaseScrollLock();
      } else if (document.body) {
        document.body.classList.remove('bc-config-scroll-unlocked');
        if (document.documentElement) document.documentElement.classList.remove('bc-config-scroll-unlocked');
        var configTab = document.getElementById('tab-config');
        if (configTab) configTab.classList.remove('bc-config-scroll-region');
      }
    }, 0);
  }, true);
  window.addEventListener('pageshow', boot);
  if (document.body && typeof MutationObserver === 'function') {
    var observer = new MutationObserver(function () {
      // JSDOM/browser teardown can invalidate document; disconnect rather than touching a closed page.
      if (!window.document || !window.document.body) {
        observer.disconnect();
        return;
      }
      movePanel();
      releaseScrollLock();
      var panel = window.document.getElementById('bc-aj-panel');
      if (panel && panel.dataset.bcMovedToConfig === '1') observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pagehide', function () { observer.disconnect(); }, { once:true });
    setTimeout(function () { observer.disconnect(); }, 15000);
  }
  setTimeout(boot, 350);
  setTimeout(boot, 1000);
  setTimeout(boot, 2500);
})();