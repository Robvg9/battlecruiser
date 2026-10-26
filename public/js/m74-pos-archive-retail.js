(function bc74ArchiveRetailPos() {
  'use strict';
  if (window.__BC_M74_ARCHIVE_INSTALLED__) return;
  window.__BC_M74_ARCHIVE_INSTALLED__ = true;

  var BUTTON_CLASS = 'bc-pos-archived';
  var appliedAvailability = null;
  var refreshDepth = 0;
  var pendingAvailability = null;
  var pendingVisibilityTimer = null;
  var VISIBILITY_SETTLE_MS = 220;

  function norm(value) { return String(value == null ? '' : value).trim().toLowerCase(); }
  function warehouses() {
    var cache = window._cache;
    return cache && Array.isArray(cache.almacenes) ? cache.almacenes : [];
  }
  function currentTurn() {
    try { if (typeof _turnoActual !== 'undefined' && _turnoActual) return _turnoActual; } catch (e) {}
    return window._turnoActual || null;
  }

  // The sidebar route is always navigable. The POS's own controls and backend
  // RPCs enforce the active-session requirement before any sale is written.
  // Retail and wholesale sessions are both valid sales contexts.
  function hasActiveSalesSession() {
    var turno = currentTurn();
    if (!turno || norm(turno.estado) !== 'abierto') return false;
    var warehouseId = turno.almacen_id || turno.almacenId || turno.id_almacen;
    if (warehouseId == null || String(warehouseId) === '') return false;
    var warehouse = warehouses().find(function (item) {
      return item && String(item.id) === String(warehouseId);
    });
    if (!warehouse || warehouse.activo === false || warehouse.archivado === true || norm(warehouse.estado) === 'archivado') return false;
    var type = norm(warehouse.tipo || warehouse.tipo_almacen || warehouse.tipoAlmacen);
    return type === 'minorista' || type === 'mayorista';
  }

  function getButton(tab) {
    return document.querySelector('#tabs .tab-btn[data-tab="' + tab + '"]') ||
      document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  }
  function ensureStyles() {
    if (document.getElementById('bc-m74-pos-archive-css')) return;
    var style = document.createElement('style');
    style.id = 'bc-m74-pos-archive-css';
    style.textContent =
      '#tabs .tab-btn[data-tab="ventas"].' + BUTTON_CLASS + '{opacity:1!important;cursor:pointer!important;}';
    document.head.appendChild(style);
  }
  function applyAvailability(available) {
    // "Requires session" is not the same as "section unavailable":
    // keep Ventas navigable and let venta-turno-ui.js display its safe empty state.
    window.__BC_POS_ARCHIVED__ = !available; // legacy diagnostic alias
    window.__BC_POS_NEEDS_SESSION__ = !available;
    var button = getButton('ventas');
    if (button) {
      button.classList.toggle(BUTTON_CLASS, !available);
      button.setAttribute('data-bc-pos-availability', available ? 'active-session' : 'session-required');
      button.disabled = false;
      button.setAttribute('aria-disabled', 'false');
      if (available) button.removeAttribute('title');
      else button.setAttribute('title', 'Puedes abrir Ventas; para registrar operaciones necesitas una sesión operativa abierta.');
    }
    appliedAvailability = available;
  }
  function sync(reason) {
    var available = hasActiveSalesSession();
    if (refreshDepth > 0) {
      if (pendingVisibilityTimer !== null) window.clearTimeout(pendingVisibilityTimer);
      pendingVisibilityTimer = null;
      pendingAvailability = null;
      if (appliedAvailability === null) applyAvailability(false);
      return available;
    }
    if (appliedAvailability === null) {
      if (pendingVisibilityTimer !== null) window.clearTimeout(pendingVisibilityTimer);
      pendingVisibilityTimer = null;
      pendingAvailability = null;
      applyAvailability(available);
      return available;
    }
    if (available === appliedAvailability) {
      if (pendingVisibilityTimer !== null) window.clearTimeout(pendingVisibilityTimer);
      pendingVisibilityTimer = null;
      pendingAvailability = null;
      return available;
    }
    if (pendingVisibilityTimer !== null) window.clearTimeout(pendingVisibilityTimer);
    pendingAvailability = available;
    pendingVisibilityTimer = window.setTimeout(function () {
      pendingVisibilityTimer = null;
      var desired = pendingAvailability;
      pendingAvailability = null;
      var confirmed = hasActiveSalesSession();
      if (confirmed === desired && confirmed !== appliedAvailability) applyAvailability(confirmed);
    }, VISIBILITY_SETTLE_MS);
    return available;
  }
  function wrapRefresh(name) {
    var original = window[name];
    if (typeof original !== 'function' || original.__bcM74ArchiveWrapped) return;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      sync('refresh:' + name);
      return result;
    };
    wrapped.__bcM74ArchiveWrapped = true;
    window[name] = wrapped;
  }
  function wrapAsyncRefresh(name) {
    var original = window[name];
    if (typeof original !== 'function' || original.__bcM74ArchiveWrapped) return;
    var wrapped = async function () {
      refreshDepth += 1;
      if (pendingVisibilityTimer !== null) window.clearTimeout(pendingVisibilityTimer);
      pendingVisibilityTimer = null;
      pendingAvailability = null;
      try {
        return await original.apply(this, arguments);
      } finally {
        refreshDepth = Math.max(0, refreshDepth - 1);
        if (!refreshDepth) sync('refresh:' + name);
      }
    };
    wrapped.__bcM74ArchiveWrapped = true;
    window[name] = wrapped;
  }
  function observeWarehouseMarkup() {
    var target = document.getElementById('tab-almacenes');
    if (target && !target.__bcM74Observer) {
      var observer = new MutationObserver(function () { sync('warehouse-markup'); });
      observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'data-tipo', 'data-estado'] });
      target.__bcM74Observer = observer;
    }
    ['alm-selector', 'bc7-warehouse', 'turno-almacen-abrir'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.__bcM74Observer) {
        var observer = new MutationObserver(function () { sync('warehouse-selector:' + id); });
        observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['value', 'selected'] });
        el.__bcM74Observer = observer;
      }
    });
  }
  function boot() {
    ensureStyles();
    wrapRefresh('actualizarPanelAlmacenVenta');
    wrapAsyncRefresh('refrescarTurnoActual');
    wrapAsyncRefresh('__BC_M25_refrescarTurno');
    document.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest('#tabs .tab-btn[data-tab="ventas"]') : null;
      if (!button) return;
      // Re-evaluate the hint, but never cancel navigation to the section.
      sync('sales-tab-click');
    }, true);
    document.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest('.tab-btn[data-tab]') : null;
      if (!button || ['almacenes', 'jornada', 'ciclos'].indexOf(button.dataset.tab) === -1) return;
      window.setTimeout(function () { sync('operational-tab'); observeWarehouseMarkup(); }, 0);
      window.setTimeout(function () { sync('operational-tab-delayed'); observeWarehouseMarkup(); }, 250);
      window.setTimeout(function () { sync('operational-tab-settled'); observeWarehouseMarkup(); }, 800);
    }, true);
    window.addEventListener('pageshow', function () { sync('pageshow'); observeWarehouseMarkup(); });
    window.addEventListener('online', function () { sync('online'); });
    observeWarehouseMarkup();
    sync('boot');
  }
  window.__BC_M74_SYNC_POS_ARCHIVE__ = sync;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();