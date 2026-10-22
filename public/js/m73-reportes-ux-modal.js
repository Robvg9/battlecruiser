/* BattleCruiser M73 — reportes ordenados, filtros temporales y modales */
(function () {
  'use strict';
  if (window.__BCM73_REPORTES) return;
  window.__BCM73_REPORTES = true;

  var MODAL_CLASS = 'bc-m73-modal';
  var rankingKey = '';
  var rankingBusy = '';
  var rankingSequence = 0;
  var reportBodyObserver = null;

  function safeText(v) { return String(v == null ? '' : v); }
  function esc(v) {
    return safeText(v).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function money(v) {
    if (typeof window.money === 'function') return window.money(v);
    var n = Number(v || 0);
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function todayHavana() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date());
      var p = {};
      parts.forEach(function (item) { if (item.type !== 'literal') p[item.type] = item.value; });
      return p.year + '-' + p.month + '-' + p.day;
    } catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function shiftDate(iso, days) {
    var p = String(iso).split('-').map(Number);
    var date = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }
  function rangeFor(preset) {
    var today = todayHavana();
    if (preset === '7') return { desde: shiftDate(today, -6), hasta: today };
    if (preset === '30') return { desde: shiftDate(today, -29), hasta: today };
    if (preset === '90') return { desde: shiftDate(today, -89), hasta: today };
    if (preset === '12m') {
      var d = new Date(Date.UTC(Number(today.slice(0,4)), Number(today.slice(5,7)) - 1, Number(today.slice(8,10))));
      d.setUTCMonth(d.getUTCMonth() - 12);
      return { desde: d.toISOString().slice(0,10), hasta: today };
    }
    if (preset === 'this_month') return { desde: today.slice(0,7) + '-01', hasta: today };
    if (preset === 'previous_month') {
      var p = today.split('-').map(Number);
      var d2 = new Date(Date.UTC(p[0], p[1] - 1, 1));
      d2.setUTCDate(0);
      var last = d2.toISOString().slice(0,10);
      return { desde: last.slice(0,7) + '-01', hasta: last };
    }
    return { desde: '', hasta: '' };
  }
  function reportTab() { return document.getElementById('tab-reportes'); }
  function getFilters() {
    var tab = reportTab();
    if (!tab) return { desde: null, hasta: null, almacen: null };
    var from = tab.querySelector('#rep-filtro-desde');
    var to = tab.querySelector('#rep-filtro-hasta');
    var warehouse = tab.querySelector('#rep-filtro-almacen');
    return {
      desde: from && from.value ? from.value : null,
      hasta: to && to.value ? to.value : null,
      almacen: warehouse && warehouse.value ? warehouse.value : null
    };
  }
  function syncPageLock() {
    var anyOpen = !!document.querySelector('.' + MODAL_CLASS + ':not([hidden])');
    document.documentElement.classList.toggle('bc-m73-modal-open', anyOpen);
    document.body.classList.toggle('bc-m73-modal-open', anyOpen);
  }
  function injectCss() {
    if (document.getElementById('bc-m73-reportes-css')) return;
    var style = document.createElement('style');
    style.id = 'bc-m73-reportes-css';
    style.textContent = [
      'html.bc-m73-modal-open,body.bc-m73-modal-open{overflow:hidden!important;overscroll-behavior:none!important}',
      '.bc-m73-modal{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:14px;overscroll-behavior:contain}',
      '.bc-m73-modal[hidden]{display:none!important}',
      '.bc-m73-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.76);backdrop-filter:blur(3px)}',
      '.bc-m73-modal-card{position:relative;display:flex;flex-direction:column;width:min(1020px,100%);max-height:92vh;max-height:92dvh;min-height:0;overflow:hidden;background:var(--void,#0c1c18);border:1px solid rgba(212,176,92,.28);border-radius:14px;box-shadow:0 22px 80px rgba(0,0,0,.55);color:var(--text,#eee)}',
      '.bc-m73-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(212,176,92,.16);flex:0 0 auto}',
      '.bc-m73-modal-head h3{margin:0;color:var(--gold-bright,#efd48a);font-family:"Cormorant Garamond",serif;font-size:1.3rem}',
      '.bc-m73-modal-close{width:36px;height:36px;flex:0 0 36px;border-radius:9px;border:1px solid rgba(212,176,92,.22);background:rgba(255,255,255,.03);color:var(--text,#eee);font-size:24px;cursor:pointer}',
      '.bc-m73-modal-body{overflow:auto;overscroll-behavior:contain;min-height:0;flex:1 1 auto;padding:12px}',
      '#bc-m73-report-modal .bc-m73-modal-body>.bc-m42-detail-body{padding:0;border:0;background:transparent;overflow:visible}',
      '#bc-m73-report-modal .bc-m42-detail-body>.bc-m42-filters{margin-bottom:14px}',
      '#bc-m73-report-modal .cc-bloque{margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}',
      '#bc-m73-report-modal .cc-bloque>h3{margin:0 0 10px;font-size:1.05rem}',
      '#bc-m73-report-modal .rep-tabs{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;background:var(--void,#0c1c18)}',
      '#bc-m73-report-modal #rep-detalle{overflow:visible;max-height:none}',
      '#bc-m73-report-modal .rep-fila{margin-top:7px;min-width:0}',
      '#bc-m73-report-modal .rep-linea{overflow-wrap:anywhere;white-space:normal}',
      '#bc-m73-report-modal .mando-paginacion{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0}',
      '#bc-m73-report-modal .bc-m42-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:14px;padding:10px;border:1px solid rgba(212,176,92,.12);border-radius:10px}',
      '#bc-m73-report-modal .bc-m42-filters .bc-m42-filter{min-width:0}',
      '#bc-m73-report-modal .bc-m42-filters .bc-m42-filter label{display:block}',
      '#bc-m73-report-modal .bc-m42-period{grid-column:1/-1}',
      '#bc-m73-report-modal .bc-m42-filters input,#bc-m73-report-modal .bc-m42-filters select{box-sizing:border-box;max-width:100%;width:100%;min-width:0}',
      '#bc-m73-report-modal .bc-m73-dates-hidden{display:none!important}',
      '#bc-m73-report-modal .bc-m73-generated-label{font-size:.68rem;color:var(--mist,#aaa);margin:0 0 10px}',
      '.bc-m73-ranking-controls{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-bottom:12px}',
      '.bc-m73-ranking-controls label{display:block;font-size:.73rem;color:var(--mist,#aaa);margin-bottom:5px}',
      '.bc-m73-ranking-controls select{width:100%;box-sizing:border-box}',
      '.bc-m73-ranking-note{margin:4px 0 12px;padding:10px 12px;border-radius:9px;background:rgba(212,176,92,.06);border:1px solid rgba(212,176,92,.14);font-size:.73rem;line-height:1.45;color:var(--mist,#aaa)}',
      '.bc-m73-ranking-list{display:flex;flex-direction:column;gap:7px}',
      '.bc-m73-ranking-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.018)}',
      '.bc-m73-ranking-row .rank-meta{font-size:.71rem;color:var(--mist,#aaa);margin-top:3px;line-height:1.35}',
      '.bc-m73-ranking-row .rank-amount{text-align:right;font-size:.8rem;font-weight:700;white-space:nowrap}',
      '.bc-m73-empty{padding:24px 10px;text-align:center;color:var(--mist,#aaa);font-size:.78rem}',
      '#tab-reportes .bc-m42-detail-launch{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0}',
      '@media(max-width:640px){.bc-m73-modal{padding:4px}.bc-m73-modal-card{width:100%;max-height:96vh;max-height:96dvh;border-radius:10px}.bc-m73-modal-head{padding:10px 12px}.bc-m73-modal-body{padding:8px}#bc-m73-report-modal .bc-m42-filters{grid-template-columns:1fr}.bc-m73-ranking-row{grid-template-columns:24px minmax(0,1fr) auto;padding:9px}.bc-m73-ranking-row .rank-amount{font-size:.72rem}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function createModal(id, title) {
    var modal = document.getElementById(id);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = id;
    modal.className = MODAL_CLASS;
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', id + '-title');
    modal.innerHTML = '<div class="bc-m73-modal-backdrop"></div><section class="bc-m73-modal-card" role="document" tabindex="-1"><header class="bc-m73-modal-head"><h3 id="' + id + '-title"></h3><button type="button" class="bc-m73-modal-close" aria-label="Cerrar ventana">×</button></header><div class="bc-m73-modal-body"></div></section>';
    document.body.appendChild(modal);
    modal.querySelector('h3').textContent = title;
    function close() {
      modal.hidden = true;
      syncPageLock();
      var target = modal._restoreFocus;
      if (target && target.isConnected && typeof target.focus === 'function') target.focus();
    }
    modal.querySelector('.bc-m73-modal-close').addEventListener('click', close);
    modal.querySelector('.bc-m73-modal-backdrop').addEventListener('click', close);
    modal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'Tab') {
        var focusable = Array.prototype.slice.call(modal.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (el) { return !el.hidden; });
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
      }
    });
    modal._close = close;
    return modal;
  }
  function showModal(modal, title) {
    Array.prototype.slice.call(document.querySelectorAll('.' + MODAL_CLASS + ':not([hidden])')).forEach(function (other) {
      if (other !== modal && typeof other._close === 'function') other._close();
    });
    modal._restoreFocus = document.activeElement;
    if (title) modal.querySelector('h3').textContent = title;
    modal.hidden = false;
    syncPageLock();
    var first = modal.querySelector('.bc-m73-modal-close');
    if (first) first.focus();
    else modal.querySelector('.bc-m73-modal-card').focus();
  }
  function getReportModal() {
    return createModal('bc-m73-report-modal', 'Información detallada');
  }
  function getRankingModal() {
    return createModal('bc-m73-ranking-modal', 'Ranking de productos');
  }
  function normalizeRows() {
    var detail = document.querySelector('#tab-reportes #rep-detalle');
    if (!detail) return;
    detail.querySelectorAll('.bc1715-ref').forEach(function (node) { node.remove(); });
    detail.querySelectorAll('.rep-fila:not(.rep-totales)').forEach(function (row) {
      var summary = safeText(row.innerText || row.textContent).replace(/\s+/g, ' ').trim();
      row.setAttribute('aria-label', summary ? 'Abrir detalle del registro: ' + summary.slice(0, 350) : 'Abrir detalle del registro');
    });
  }
  function ensureReportModalLayout() {
    var tab = reportTab();
    if (!tab) return false;
    var detail = tab.querySelector('.bc-m42-detail');
    var modal = getReportModal();
    var modalBody = modal.querySelector('.bc-m73-modal-body');
    if (detail) {
      var detailBody = detail.querySelector('.bc-m42-detail-body');
      if (detailBody && detailBody.querySelector('#rep-detalle')) {
        if (detailBody.parentElement !== modalBody) modalBody.appendChild(detailBody);
        detail.remove();
      }
    }
    var reportList = tab.querySelector('#rep-detalle');
    var block = reportList && reportList.closest('.cc-bloque');
    if (block && !modalBody.contains(block)) modalBody.appendChild(block);

    var launch = tab.querySelector('.bc-m42-detail-launch');
    if (!launch) {
      launch = document.createElement('div');
      launch.className = 'bc-m42-detail-launch';
      launch.innerHTML = '<button type="button" class="cc-accion" id="bc-m73-open-report">Información detallada</button><span class="muted">Filtros y registros se abren en una ventana independiente.</span>';
      var quick = tab.querySelector('.bc-m45-quick');
      var analysis = tab.querySelector('.bc-m42-analysis');
      if (quick) quick.after(launch);
      else if (analysis) analysis.after(launch);
      else tab.appendChild(launch);
    }
    var open = launch.querySelector('#bc-m73-open-report');
    if (open && !open.dataset.bcM73Bound) {
      open.dataset.bcM73Bound = '1';
      open.addEventListener('click', function () { openReportModal(); });
    }
    normalizeRows();
    if (!reportBodyObserver && reportList && typeof MutationObserver !== 'undefined') {
      reportBodyObserver = new MutationObserver(function () { normalizeRows(); });
      reportBodyObserver.observe(reportList, { childList: true, subtree: true });
    }
    ensurePeriodControls();
    return !!(modalBody.querySelector('#rep-detalle'));
  }
  function syncPeriodVisibility() {
    var tab = reportTab();
    if (!tab) return;
    var select = tab.querySelector('#rep-filtro-periodo');
    var custom = !!(select && select.value === 'custom');
    [tab.querySelector('#rep-filtro-desde'), tab.querySelector('#rep-filtro-hasta')].forEach(function (input) {
      var label = input && input.closest('label');
      if (label) label.classList.toggle('bc-m73-dates-hidden', !custom);
    });
  }
  function applyPreset(preset, reload) {
    var tab = reportTab();
    if (!tab) return;
    var select = tab.querySelector('#rep-filtro-periodo');
    var from = tab.querySelector('#rep-filtro-desde');
    var to = tab.querySelector('#rep-filtro-hasta');
    if (select) select.value = preset;
    if (preset !== 'custom') {
      var range = rangeFor(preset);
      if (from) from.value = range.desde;
      if (to) to.value = range.hasta;
    }
    syncPeriodVisibility();
    if (reload) refreshReports();
  }
  function ensurePeriodControls() {
    var tab = reportTab();
    if (!tab) return;
    var filters = tab.querySelector('.bc-m42-filters') || tab.querySelector('#reportes-filtros');
    if (!filters) return;
    var field = filters.querySelector('.bc-m73-period-field');
    if (!field) {
      field = document.createElement('div');
      field.className = 'bc-m42-filter bc-m73-period-field';
      field.innerHTML = '<label for="rep-filtro-periodo">Período</label><select id="rep-filtro-periodo" aria-label="Período del informe"><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="12m">Últimos 12 meses</option><option value="this_month">Este mes</option><option value="previous_month">Mes anterior</option><option value="all">Todo el historial</option><option value="custom">Fechas personalizadas</option></select>';
      filters.insertBefore(field, filters.firstChild);
      var select = field.querySelector('select');
      select.addEventListener('change', function () {
        if (select.value === 'custom') { syncPeriodVisibility(); return; }
        applyPreset(select.value, true);
      });
    }
    var from = tab.querySelector('#rep-filtro-desde');
    var to = tab.querySelector('#rep-filtro-hasta');
    [from, to].forEach(function (input) {
      if (input && !input.dataset.bcM73Bound) {
        input.dataset.bcM73Bound = '1';
        input.addEventListener('change', function () {
          var select = tab.querySelector('#rep-filtro-periodo');
          if (select) select.value = 'custom';
          syncPeriodVisibility();
        });
      }
    });
    var selectNow = tab.querySelector('#rep-filtro-periodo');
    if (selectNow && selectNow.dataset.bcM73Initialized !== '1') {
      selectNow.dataset.bcM73Initialized = '1';
      if ((!from || !from.value) && (!to || !to.value)) applyPreset('7', false);
      else selectNow.value = 'custom';
    }
    syncPeriodVisibility();
  }
  function currentReportFilters() {
    if (typeof window.leerFiltrosReportes === 'function') return window.leerFiltrosReportes();
    return getFilters();
  }
  function refreshReports() {
    if (typeof window.refrescarReportes === 'function') return window.refrescarReportes();
    if (typeof window.refrescarSubReporte === 'function') return window.refrescarSubReporte();
    return Promise.resolve();
  }
  function rankingLabel(order) {
    return ({
      unidades_desc: 'Más unidades vendidas',
      unidades_asc: 'Menos unidades vendidas',
      ingresos_desc: 'Mayor facturación',
      ingresos_asc: 'Menor facturación'
    })[order] || 'Más unidades vendidas';
  }
  async function fetchRanking(order, limit, target, note) {
    var filters = currentReportFilters();
    var thisKey = JSON.stringify([filters.desde, filters.hasta, filters.almacen, order, limit]);
    target.dataset.queryKey = thisKey;
    target.innerHTML = '<div class="bc-m73-empty">Calculando ranking de todo el período…</div>';
    try {
      if (!window.client || typeof window.client.rpc !== 'function') throw new Error('Conexión de datos no disponible');
      var response = await window.client.rpc('reporte_productos_ventas', {
        p_desde: filters.desde || null,
        p_hasta: filters.hasta || null,
        p_almacen_id: filters.almacen || null,
        p_orden: order,
        p_limite: limit
      });
      if (target.dataset.queryKey !== thisKey) return;
      if (response.error) throw response.error;
      var rows = Array.isArray(response.data) ? response.data : [];
      if (!rows.length) {
        target.innerHTML = '<div class="bc-m73-empty">No hay productos vendidos en el período seleccionado.</div>';
      } else {
        target.innerHTML = rows.map(function (row, index) {
          return '<article class="bc-m73-ranking-row"><span class="bc-m42-rank">' + (index + 1) +
            '</span><div><strong>' + esc(row.producto || 'Producto sin nombre') +
            '</strong><div class="rank-meta">' + money(row.unidades || 0) + ' unidades · ' +
            money(row.ventas || 0) + ' ventas</div></div><div class="rank-amount">$' +
            money(row.ingresos || 0) + '<small>Facturación</small></div></article>';
        }).join('');
      }
      if (note) note.textContent = 'Importes = facturación histórica, no ganancias. Se ordena todo el período filtrado.';
    } catch (error) {
      if (target.dataset.queryKey !== thisKey) return;
      target.innerHTML = '<div class="bc-m73-empty">El ranking necesita conexión y el RPC de ranking actualizado. No se sustituyen datos reales por estimaciones.</div>';
      if (note) note.textContent = '';
      console.warn('[BattleCruiser] ranking de productos:', error);
    }
  }
  function openRankingModal() {
    ensureReportModalLayout();
    var modal = getRankingModal();
    var body = modal.querySelector('.bc-m73-modal-body');
    body.innerHTML = '<div class="bc-m73-ranking-controls"><div><label for="bc-m73-ranking-sort">Ordenar productos por</label><select id="bc-m73-ranking-sort"><option value="unidades_desc">Más unidades vendidas</option><option value="unidades_asc">Menos unidades vendidas</option><option value="ingresos_desc">Mayor facturación</option><option value="ingresos_asc">Menor facturación</option><option value="ganancia_desc" disabled>Mayor ganancia (costos históricos no disponibles)</option></select></div></div><p class="bc-m73-ranking-note">La ganancia real requiere costo histórico fiable por producto/lote. Mientras no exista, esta opción permanece desactivada para no mostrar beneficios falsos.</p><div class="bc-m73-ranking-list" id="bc-m73-ranking-list"></div>';
    var select = body.querySelector('#bc-m73-ranking-sort');
    var list = body.querySelector('#bc-m73-ranking-list');
    var note = body.querySelector('.bc-m73-ranking-note');
    select.addEventListener('change', function () { fetchRanking(select.value, 500, list, note); });
    showModal(modal, 'Ranking de productos');
    fetchRanking(select.value, 500, list, note);
  }
  function openReportModal(reporte) {
    ensureReportModalLayout();
    var tab = reportTab();
    if (reporte && tab) {
      var target = Array.prototype.slice.call(tab.querySelectorAll('.rep-tab-btn')).find(function (button) {
        return button.dataset.rep === reporte;
      });
      if (target && !target.classList.contains('active')) target.click();
    }
    var modal = getReportModal();
    showModal(modal, 'Información detallada');
    ensurePeriodControls();
  }
  function refreshTopProducts(force) {
    var tab = reportTab();
    var list = tab && tab.querySelector('#bc-m42-top-products');
    var note = tab && tab.querySelector('#bc-m42-top-note');
    if (!list) return Promise.resolve();
    ensurePeriodControls();
    var filters = currentReportFilters();
    var key = JSON.stringify([filters.desde, filters.hasta, filters.almacen]);
    if (!force && (list.dataset.bcM73Key === key || rankingBusy === key)) return Promise.resolve();
    rankingBusy = key;
    var request = ++rankingSequence;
    list.innerHTML = '<div class="bc-m73-empty">Calculando los 5 productos más vendidos…</div>';
    var promise = fetchRanking('unidades_desc', 5, list, note).then(function () {
      if (request !== rankingSequence) return;
      list.dataset.bcM73Key = key;
      list.dataset.bcM73Loaded = '1';
    }).finally(function () { if (rankingBusy === key) rankingBusy = ''; });
    return promise;
  }
  function wrapRefresh() {
    if (window.refrescarReportes && !window.refrescarReportes.__bcM73Wrapped) {
      var original = window.refrescarReportes;
      var wrapped = async function () {
        var result = await original.apply(this, arguments);
        await refreshTopProducts(true);
        return result;
      };
      wrapped.__bcM73Wrapped = true;
      window.refrescarReportes = wrapped;
    }
  }
  function installCaptureHandlers() {
    if (document.documentElement.dataset.bcM73Capture === '1') return;
    document.documentElement.dataset.bcM73Capture = '1';
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('button') : null;
      if (!target) return;
      if (target.id === 'bc-m42-open-details') {
        event.preventDefault(); event.stopImmediatePropagation(); openRankingModal(); return;
      }
      if (target.id === 'bc-m42-show-details' || target.id === 'bc-m73-open-report') {
        event.preventDefault(); event.stopImmediatePropagation(); openReportModal(); return;
      }
      if (target.classList.contains('bc-m45-quick-btn')) {
        event.preventDefault(); event.stopImmediatePropagation(); openReportModal(target.dataset.rep || 'ventas'); return;
      }
      if (target.id === 'rep-limpiar-btn') {
        event.preventDefault(); event.stopImmediatePropagation();
        var warehouse = reportTab() && reportTab().querySelector('#rep-filtro-almacen');
        if (warehouse) warehouse.value = '';
        applyPreset('7', false);
        refreshReports();
      }
    }, true);
  }
  function addQuickModalBehavior() {
    // The original quick actions remain in place and retain their active styling.
    var quick = reportTab() && reportTab().querySelector('.bc-m45-quick');
    if (quick) quick.querySelectorAll('.bc-m45-quick-btn').forEach(function (button) {
      button.setAttribute('aria-haspopup', 'dialog');
    });
  }
  function install() {
    injectCss();
    var ready = ensureReportModalLayout();
    ensurePeriodControls();
    addQuickModalBehavior();
    wrapRefresh();
    installCaptureHandlers();
    if (ready) {
      var filters = reportTab().querySelector('#reportes-filtros, .bc-m42-filters');
      if (filters && !filters.dataset.bcM73DefaultApply && typeof window.refrescarReportes === 'function') {
        filters.dataset.bcM73DefaultApply = '1';
        // Once the seven-day defaults are set, reload with this finite window.
        if (reportTab().querySelector('#rep-filtro-periodo') && reportTab().querySelector('#rep-filtro-periodo').value === '7') {
          refreshReports();
        }
      }
      refreshTopProducts(false);
    }
    return ready;
  }
  function boot() {
    var attempts = 0;
    function attempt() {
      attempts += 1;
      install();
      if (attempts < 14 && !document.querySelector('#bc-m73-report-modal #rep-detalle')) window.setTimeout(attempt, 350);
    }
    attempt();
  }

  window.BattleCruiserReportesM73 = {
    openReportModal: openReportModal,
    openRankingModal: openRankingModal,
    refreshTopProducts: refreshTopProducts,
    verify: function () {
      return {
        loaded: true,
        periodPreset: !!document.querySelector('#tab-reportes #rep-filtro-periodo'),
        reportModal: !!document.querySelector('#bc-m73-report-modal'),
        rankingModal: !!document.querySelector('#bc-m73-ranking-modal'),
        reportRowsInsideModal: !!document.querySelector('#bc-m73-report-modal #rep-detalle'),
        inlineAccordionRemoved: !document.querySelector('#tab-reportes .bc-m42-detail')
      };
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
