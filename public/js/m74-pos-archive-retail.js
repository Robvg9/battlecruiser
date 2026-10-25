(function bc74ArchiveRetailPos() {
  'use strict';
  if (window.__BC_M74_ARCHIVE_INSTALLED__) return;
  window.__BC_M74_ARCHIVE_INSTALLED__ = true;

  var BUTTON_CLASS = 'bc-pos-archived';
  var PANEL_CLASS = 'bc-pos-archived-panel';
  var fallbackScheduled = false;

  function norm(value) { return String(value == null ? '' : value).trim().toLowerCase(); }
  function warehouses() {
    var cache = window._cache;
    return cache && Array.isArray(cache.almacenes) ? cache.almacenes : [];
  }
  function currentTurn() {
    try { if (typeof _turnoActual !== 'undefined' && _turnoActual) return _turnoActual; } catch (e) {}
    return window._turnoActual || null;
  }

  // Preserve the POS and its records, but expose it only inside an open
  // operational session whose warehouse is explicitly typed as mayorista.
  function hasActiveWholesaleSession() {
    var turno = currentTurn();
    if (!turno || norm(turno.estado) !== 'abierto') return false;
    var warehouseId = turno.almacen_id || turno.almacenId || turno.id_almacen;
    if (warehouseId == null || String(warehouseId) === '') return false;
    var warehouse = warehouses().find(function (item) {
      return item && String(item.id) === String(warehouseId);
    });
    if (!warehouse || warehouse.activo === false || warehouse.archivado === true || norm(warehouse.estado) === 'archivado') return false;
    return norm(warehouse.tipo || warehouse.tipo_almacen || warehouse.tipoAlmacen) === 'mayorista';
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
      '#tabs .tab-btn[data-tab="ventas"].' + BUTTON_CLASS + '{display:none!important;visibility:hidden!important;pointer-events:none!important;height:0!important;max-height:0!important;overflow:hidden!important;padding:0!important;margin:0!important;border:0!important}' +
      '#tab-ventas.' + PANEL_CLASS + ',#tab-ventas.' + PANEL_CLASS + '.visible{display:none!important;visibility:hidden!important;pointer-events:none!important}';
    document.head.appendChild(style);
  }
  function goToOperationalWorkspace() {
    var jornada = getButton('jornada');
    var destination = jornada && !jornada.classList.contains('hidden') &&
      !jornada.classList.contains('tab-sin-permiso') ? 'jornada' : 'resumen';
    if (typeof window.irATab === 'function') { window.irATab(destination); return; }
    var button = getButton(destination);
    if (button) button.click();
  }
  function scheduleOperationalWorkspace() {
    if (fallbackScheduled) return;
    fallbackScheduled = true;
    window.setTimeout(function () {
      fallbackScheduled = false;
      goToOperationalWorkspace();
    }, 0);
  }
  function sync(reason) {
    var available = hasActiveWholesaleSession();
    window.__BC_POS_ARCHIVED__ = !available;
    var button = getButton('ventas');
    var panel = document.getElementById('tab-ventas');
    if (button) {
      button.classList.toggle(BUTTON_CLASS, !available);
      button.setAttribute('data-bc-pos-availability', available ? 'wholesale' : 'archived');
    }
    if (panel) {
      panel.classList.toggle(PANEL_CLASS, !available);
      if (!available && panel.classList.contains('visible')) {
        panel.classList.remove('visible');
        if (button) button.classList.remove('active');
        scheduleOperationalWorkspace();
      }
    }
    return available;
  }
  function wrapNavigation() {
    var original = window.irATab;
    if (typeof original !== 'function' || original.__bcM74ArchiveWrapped) return;
    var wrapped = function (tab) {
      if (norm(tab) === 'ventas' && window.__BC_POS_ARCHIVED__ === true) {
        scheduleOperationalWorkspace();
        return;
      }
      return original.apply(this, arguments);
    };
    wrapped.__bcM74ArchiveWrapped = true;
    window.irATab = wrapped;
    try { irATab = wrapped; } catch (e) {}
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
      var result = await original.apply(this, arguments);
      sync('refresh:' + name);
      return result;
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
    wrapNavigation();
    wrapRefresh('actualizarPanelAlmacenVenta');
    wrapAsyncRefresh('refrescarTurnoActual');
    wrapAsyncRefresh('__BC_M25_refrescarTurno');
    document.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest('#tabs .tab-btn[data-tab="ventas"]') : null;
      if (!button) return;
      sync('sales-tab-click');
      if (!window.__BC_POS_ARCHIVED__) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      scheduleOperationalWorkspace();
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