// BattleCruiser — accesos directos compactos del Centro de Control.
(function () {
  'use strict';
  if (window.__BC_OWNER_QUICK_ACTIONS__) return;
  window.__BC_OWNER_QUICK_ACTIONS__ = true;

  const ROOT_ID = 'bc-owner-quick-actions';
  const actions = [
    { key: 'purchase', label: 'Nueva compra', icon: '🛒', allowed: () => can('stock', 'crear') || can('productos', 'crear') },
    { key: 'transfer', label: 'Nueva transferencia', icon: '⇄', allowed: () => can('transferencias', 'crear') },
    { key: 'low-stock', label: 'Stock bajo', icon: '⚠️', allowed: () => can('reportes', 'ver') },
    { key: 'jornada', label: 'Jornada actual', icon: '🗓️', allowed: () => can('turnos', 'ver') },
    { key: 'pending', label: 'Pendientes', icon: '📥', allowed: () => can('auditoria', 'ver') }
  ];

  function can(section, action) {
    return typeof window.tienePermiso === 'function' && window.tienePermiso(section, action);
  }

  function injectStyles() {
    if (document.getElementById('bc-owner-quick-actions-style')) return;
    const style = document.createElement('style');
    style.id = 'bc-owner-quick-actions-style';
    style.textContent =
      '.bc-owner-quick-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:-4px 0 10px}' +
      '.bc-owner-quick-action{display:flex;align-items:center;justify-content:flex-start;gap:8px;min-width:0;min-height:42px;padding:7px 10px;border:1px solid var(--gold-dim);border-radius:9px;background:rgba(255,255,255,.025);color:var(--text);font-size:11.5px;font-weight:700;text-align:left;cursor:pointer}' +
      '.bc-owner-quick-action:hover,.bc-owner-quick-action:focus-visible{border-color:var(--gold);background:rgba(201,162,77,.08);outline:none}' +
      '.bc-owner-quick-icon{display:inline-flex;align-items:center;justify-content:center;flex:0 0 25px;width:25px;height:25px;border-radius:7px;background:rgba(201,162,77,.12);font-size:15px}' +
      '@media(min-width:760px){.bc-owner-quick-actions{grid-template-columns:repeat(5,minmax(0,1fr))}}' +
      '#tab-resumen .cc-estado{margin-bottom:9px!important;padding:10px 12px!important}' +
      '#tab-resumen .cc-dashboard-kpis{margin-bottom:10px!important;gap:7px!important}' +
      '#tab-resumen .cc-bloque{padding:10px 11px!important;margin-bottom:0!important}' +
      '#tab-resumen .cc-bloque h3{margin-bottom:6px!important;font-size:.9rem!important}' +
      '#tab-resumen .cc-col-ppal{gap:8px!important}' +
      '#tab-resumen .cc-grid{gap:9px!important;align-items:start}' +
      '#tab-resumen .cc-aviso{padding:7px 8px!important;margin-bottom:5px!important}' +
      '@media(max-width:520px){#tab-resumen .cc-dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.bc-owner-quick-action{min-height:40px;padding:6px 8px;font-size:10.5px}}';
    document.head.appendChild(style);
  }

  function ensure() {
    const header = document.querySelector('#tab-resumen .cc-dashboard-header');
    if (!header) return false;
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('nav');
      root.id = ROOT_ID;
      root.className = 'bc-owner-quick-actions';
      root.setAttribute('aria-label', 'Accesos directos');
      header.insertAdjacentElement('afterend', root);
    }
    const visible = actions.filter(action => {
      try { return action.allowed(); } catch (_) { return false; }
    });
    root.innerHTML = visible.map(action =>
      '<button type="button" class="bc-owner-quick-action" data-bc-owner-action="' + action.key + '">' +
        '<span class="bc-owner-quick-icon" aria-hidden="true">' + action.icon + '</span>' +
        '<span>' + action.label + '</span></button>'
    ).join('');
    root.hidden = visible.length === 0;
    return true;
  }

  function openAction(key) {
    if (key === 'purchase') {
      if (!(can('stock', 'crear') || can('productos', 'crear'))) return;
      if (typeof window.__BC165_open === 'function') window.__BC165_open('compras');
      else if (typeof window.irATab === 'function') window.irATab('movimientos');
      return;
    }
    if (key === 'transfer') {
      if (!can('transferencias', 'crear')) return;
      if (typeof window.__BC165_open === 'function') window.__BC165_open('transferencias');
      else if (typeof window.irATab === 'function') window.irATab('transferencias');
      return;
    }
    if (key === 'low-stock') {
      if (!can('reportes', 'ver')) return;
      if (typeof window.__BC_openStockBajo === 'function') window.__BC_openStockBajo();
      else if (typeof window.irATab === 'function') window.irATab('inventario');
      return;
    }
    if (key === 'jornada' && can('turnos', 'ver') && typeof window.irATab === 'function') {
      window.irATab('jornada');
      return;
    }
    if (key === 'pending' && can('auditoria', 'ver') && typeof window.irATab === 'function') {
      window.irATab('pendientes');
    }
  }

  document.addEventListener('click', function (event) {
    const button = event.target && event.target.closest
      ? event.target.closest('[data-bc-owner-action]')
      : null;
    if (button) openAction(button.getAttribute('data-bc-owner-action'));
  });

  function boot() {
    injectStyles();
    ensure();
    const shell = document.getElementById('app-shell');
    if (shell && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(ensure);
      observer.observe(shell, { attributes: true, attributeFilter: ['data-bc-permisos-cargados'] });
    }
    window.addEventListener('bc:permissions-changed', ensure);
    window.__BC_OWNER_QUICK_ACTIONS_VERIFY__ = function () {
      const root = document.getElementById(ROOT_ID);
      return {
        mounted: !!root,
        actions: root ? Array.from(root.querySelectorAll('[data-bc-owner-action]')).map(button => button.getAttribute('data-bc-owner-action')) : []
      };
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
