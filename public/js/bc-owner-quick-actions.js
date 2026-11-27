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
    { key: 'pending', label: 'Pendientes', icon: '📥', allowed: () => can('auditoria', 'ver') },
    { key: 'price-changes', label: 'Cambios de precio', icon: '💲', allowed: () => {
      const api = window.__BC_JORNADA_PRICE_CHANGES_API__;
      return !!(api && typeof api.canOpenOwnerModal === 'function' && api.canOpenOwnerModal());
    } }
  ];

  function can(section, action) {
    return typeof window.tienePermiso === 'function' && window.tienePermiso(section, action);
  }
  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }
  function setStatus(root, message) {
    const status = root && root.querySelector('[data-bc-owner-status]');
    if (status) status.textContent = message || '';
  }
  function navigate(tab) {
    if (typeof window.irATab === 'function') {
      window.irATab(tab);
      return true;
    }
    const button = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (!button) return false;
    button.click();
    return true;
  }
  async function openMovementModal(kind, label, root) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (typeof window.__BC165_open === 'function') {
        window.__BC165_open(kind);
      }
      if (attempt === 0) navigate('movimientos');
      await wait(65 + attempt * 60);
      const modal = document.getElementById('bc165-overlay');
      if (modal && modal.dataset.type === kind) {
        setStatus(root, '');
        return true;
      }
    }
    throw new Error('El formulario de ' + label + ' todavía no está preparado. Abre Movimientos y vuelve a intentarlo.');
  }
  async function openLowStock(root) {
    if (typeof window.__BC_openStockBajo === 'function') window.__BC_openStockBajo();
    await wait(60);
    let modal = document.getElementById('bc-stock-bajo-modal');
    if (!modal || !modal.classList.contains('open')) {
      navigate('inventario');
      await wait(90);
      const button = document.getElementById('bc-stock-bajo-btn');
      if (button) button.click();
      await wait(70);
      modal = document.getElementById('bc-stock-bajo-modal');
    }
    if (!modal || !modal.classList.contains('open')) {
      throw new Error('No se pudo abrir Stock bajo. Entra en Inventario y vuelve a intentarlo.');
    }
    setStatus(root, '');
  }

  async function ensure() {
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
    if (root.dataset.bcOwnerQuickBound !== '1') {
      root.dataset.bcOwnerQuickBound = '1';
      root.addEventListener('click', async function (event) {
        const button = event.target && event.target.closest
          ? event.target.closest('[data-bc-owner-action]')
          : null;
        if (!button || !root.contains(button)) return;
        event.preventDefault();
        event.stopPropagation();
        const key = button.getAttribute('data-bc-owner-action');
        button.disabled = true;
        setStatus(root, 'Abriendo…');
        try {
          await openAction(key, root);
        } catch (error) {
          setStatus(root, 'No se pudo abrir: ' + String(error && error.message || error));
        } finally {
          button.disabled = false;
        }
      });
    }
    const visible = actions.filter(action => {
      try { return action.allowed(); } catch (_) { return false; }
    });
    root.innerHTML = visible.map(action =>
      '<button type="button" class="bc-owner-quick-action" data-bc-owner-action="' + action.key + '">' +
        '<span class="bc-owner-quick-icon" aria-hidden="true">' + action.icon + '</span>' +
        '<span>' + action.label + '</span></button>'
    ).join('') +
      '<p class="bc-owner-quick-status" data-bc-owner-status role="status" aria-live="polite"></p>';
    root.hidden = visible.length === 0;
    return true;
  }

  async function openAction(key, root) {
    setStatus(root, '');
    if (key === 'purchase') {
      if (!(can('stock', 'crear') || can('productos', 'crear'))) throw new Error('No tienes permiso para registrar compras.');
      await openMovementModal('compras', 'Nueva compra', root);
      return true;
    }
    if (key === 'transfer') {
      if (!can('transferencias', 'crear')) throw new Error('No tienes permiso para registrar transferencias.');
      await openMovementModal('transferencias', 'Nueva transferencia', root);
      return true;
    }
    if (key === 'low-stock') {
      if (!can('reportes', 'ver')) throw new Error('No tienes permiso para consultar el inventario.');
      await openLowStock(root);
      return true;
    }
    if (key === 'jornada') {
      if (!can('turnos', 'ver')) throw new Error('No tienes permiso para consultar jornadas.');
      if (!navigate('jornada')) throw new Error('No se encontró la sección Jornada.');
      await wait(30);
      if (!document.getElementById('tab-jornada')) throw new Error('La sección Jornada no está disponible.');
      return true;
    }
    if (key === 'pending') {
      if (!can('auditoria', 'ver')) throw new Error('No tienes permiso para consultar operaciones pendientes.');
      if (!navigate('pendientes')) throw new Error('No se encontró la sección Pendientes.');
      await wait(30);
      if (!document.getElementById('tab-pendientes')) throw new Error('La sección Pendientes no está disponible.');
      return true;
    }
    if (key === 'price-changes') {
      const api = window.__BC_JORNADA_PRICE_CHANGES_API__;
      if (!api || typeof api.canOpenOwnerModal !== 'function' || !api.canOpenOwnerModal() ||
          typeof api.openOwnerModal !== 'function') {
        throw new Error('Los cambios de precio no están disponibles para esta cuenta o jornada.');
      }
      const result = await api.openOwnerModal();
      if (result === false) throw new Error('No se pudo abrir Cambios de precio.');
      return true;
    }
    throw new Error('Acceso rápido desconocido.');
  }

  function injectStyles() {
    if (document.getElementById('bc-owner-quick-actions-style')) return;
    const style = document.createElement('style');
    style.id = 'bc-owner-quick-actions-style';
    style.textContent =
      '.bc-owner-quick-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:-4px 0 10px}' +
      '.bc-owner-quick-action{display:flex;align-items:center;justify-content:flex-start;gap:8px;min-width:0;min-height:42px;padding:7px 10px;border:1px solid var(--gold-dim);border-radius:9px;background:rgba(255,255,255,.025);color:var(--text);font-size:11.5px;font-weight:700;text-align:left;cursor:pointer}' +
      '.bc-owner-quick-action:hover,.bc-owner-quick-action:focus-visible{border-color:var(--gold);background:rgba(201,162,77,.08);outline:none}' +
      '.bc-owner-quick-action:disabled{opacity:.6;cursor:wait}' +
      '.bc-owner-quick-icon{display:inline-flex;align-items:center;justify-content:center;flex:0 0 25px;width:25px;height:25px;border-radius:7px;background:rgba(201,162,77,.12);font-size:15px}' +
      '.bc-owner-quick-status{grid-column:1/-1;margin:0;padding:5px 7px;color:var(--mist);font-size:11px;line-height:1.35}' +
      '.bc-owner-quick-status:empty{display:none}' +
      '@media(min-width:760px){.bc-owner-quick-actions{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
      '@media(min-width:1120px){.bc-owner-quick-actions{grid-template-columns:repeat(6,minmax(0,1fr))}}' +
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

  function boot() {
    injectStyles();
    ensure();
    const shell = document.getElementById('app-shell');
    if (shell && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(ensure);
      observer.observe(shell, { attributes: true, attributeFilter: ['data-bc-permisos-cargados'] });
    }
    window.addEventListener('bc:permissions-changed', ensure);
    window.addEventListener('bc:price-changes-availability', ensure);
    window.__BC_OWNER_QUICK_ACTIONS_VERIFY__ = function () {
      const root = document.getElementById(ROOT_ID);
      return {
        mounted: !!root,
        bound: !!(root && root.dataset.bcOwnerQuickBound === '1'),
        actions: root ? Array.from(root.querySelectorAll('[data-bc-owner-action]')).map(button => button.getAttribute('data-bc-owner-action')) : []
      };
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
