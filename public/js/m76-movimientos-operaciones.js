// BattleCruiser — M76.2: listas guardadas, resumen diario y filtros compactos
(function () {
  'use strict';
  if (window.__BC_M76_MOVEMENTS__) return;
  window.__BC_M76_MOVEMENTS__ = true;

  const PAGE_SIZE = 40;
  const TZ = 'America/Havana';
  const state = { rows: [], summaryRows: null, summaryUnavailable: false, summaryTruncated: false, operations: [], page: 0, selected: null, trigger: null, installed: false, historyTruncated: false };

  function text(value) { return String(value == null ? '' : value); }
  function esc(value) {
    return text(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
  function qty(value) { return Math.abs(number(value)); }
  function normalize(value) { return text(value).trim().toLowerCase(); }
  function typeOf(row) {
    const type = normalize(row && row.tipo);
    if (type === 'transferencia' || type === 'transferencia_salida' || type === 'transferencia_entrada') return 'transferencia';
    if (type === 'baja' || type === 'merma') return 'baja';
    return type || 'otro';
  }
  function typeLabel(kind) {
    return ({
      compra: 'Compra',
      reinversion: 'Reinversión',
      baja: 'Baja',
      transferencia: 'Movimiento interno',
      venta: 'Venta',
      vale: 'Vale de salida',
      ajuste: 'Ajuste'
    })[kind] || 'Operación';
  }
  function referenceOf(row) {
    const fields = ['operacion_id', 'transaccion_id', 'transferencia_id', 'compra_id', 'reinversion_id', 'baja_id', 'referencia_id'];
    for (const field of fields) {
      if (row && row[field] != null && text(row[field]).trim()) return text(row[field]).trim();
    }
    return '';
  }
  function warehouseOf(row) {
    if (!row) return '';
    const value = row.almacen || row.almacen_nombre || row.nombre_almacen || '';
    return value && typeof value === 'object' ? text(value.nombre || value.name) : text(value);
  }
  function dateKey(value) {
    if (!value) return 'sin-fecha';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'sin-fecha';
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const o = {}; p.forEach(x => { if (x.type !== 'literal') o[x.type] = x.value; });
      return o.year + '-' + o.month + '-' + o.day;
    } catch (_) { return date.toISOString().slice(0, 10); }
  }
  function dateLabel(key) {
    if (key === 'sin-fecha') return 'Sin fecha';
    const p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  }
  function businessTodayKey() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const o = {}; parts.forEach(x => { if (x.type !== 'literal') o[x.type] = x.value; });
    return o.year + '-' + o.month + '-' + o.day;
  }
  function timeLabel(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('es-ES', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return text(value); }
  }

  function groupOperations(rows) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach(function (row, index) {
      const kind = typeOf(row);
      const ref = referenceOf(row);
      const timestamp = text(row && row.fecha).trim();
      const actor = text(row && (row.usuario_id || row.usuario || row.usuario_nombre)).trim();
      const place = kind === 'transferencia' ? 'transferencia' : text(row && (row.almacen_id || warehouseOf(row))).trim();
      // Prefer the real transaction identifier. Fallback groups only equal timestamp/actor/location.
      // Only merge rows when the backend supplies the same transaction ID.
      // Never infer a transaction from matching timestamps/users: distinct operations
      // can happen at the same time and must remain separate in the history.
      const key = ref ? kind + '|ref|' + ref : kind + '|row|' + index;
      if (!grouped.has(key)) {
        grouped.set(key, { key, reference: ref, kind, rows: [], fecha: row && row.fecha || '', usuario: text(row && (row.usuario || row.usuario_nombre)) || '—' });
      }
      const op = grouped.get(key);
      op.rows.push(row);
      if (!op.fecha || (row && row.fecha && new Date(row.fecha).getTime() < new Date(op.fecha).getTime())) op.fecha = row.fecha;
      if (op.usuario === '—' && row && (row.usuario || row.usuario_nombre)) op.usuario = text(row.usuario || row.usuario_nombre);
      if (!op.reference && ref) op.reference = ref;
    });

    const result = [];
    grouped.forEach(function (op) {
      const outgoing = op.rows.filter(row => normalize(row.tipo) === 'transferencia_salida');
      const incoming = op.rows.filter(row => normalize(row.tipo) === 'transferencia_entrada');
      const basis = op.kind === 'transferencia' && outgoing.length ? outgoing : op.rows;
      const lineMap = new Map();
      basis.forEach(function (row, index) {
        const name = text(row.producto || row.producto_nombre || row.nombre_producto) || 'Producto sin identificar';
        const productId = text(row.producto_id || row.id_producto || row.product_id || name);
        const presentationId = text(row.presentacion_id || row.formato_id || '');
        const variantId = text(row.variante_id || row.lote_id || '');
        const lineKey = productId + '|' + presentationId + '|' + variantId;
        if (!lineMap.has(lineKey)) {
          const unitCost = row.costo_unitario != null ? number(row.costo_unitario)
            : row.precio_unitario != null ? number(row.precio_unitario) : null;
          lineMap.set(lineKey, { key: lineKey, nombre: name, cantidad: 0, costo_unitario: unitCost, ubicaciones: [] });
        }
        const line = lineMap.get(lineKey);
        line.cantidad += qty(row.cantidad);
        const placeName = warehouseOf(row);
        if (placeName && !line.ubicaciones.includes(placeName)) line.ubicaciones.push(placeName);
      });
      op.lineItems = Array.from(lineMap.values());
      op.productCount = op.lineItems.length;
      op.totalUnits = op.lineItems.reduce((total, line) => total + line.cantidad, 0);
      const outRow = outgoing[0] || op.rows[0] || {};
      const inRow = incoming[0] || {};
      op.origen = text(outRow.origen || outRow.almacen_origen || warehouseOf(outRow));
      op.destino = text(inRow.destino || inRow.almacen_destino || warehouseOf(inRow));
      const locations = Array.from(new Set(op.rows.map(warehouseOf).filter(Boolean)));
      op.almacen = op.kind === 'transferencia'
        ? (op.origen && op.destino ? op.origen + ' → ' + op.destino : locations.join(' ↔ '))
        : locations.join(', ') || 'Almacén sin identificar';
      op.label = typeLabel(op.kind);
      op.badge = op.kind === 'transferencia' ? 'transf' : (op.kind === 'baja' ? 'salida' : (op.kind === 'compra' || op.kind === 'reinversion' ? 'entrada' : 'otro'));
      op.searchText = (op.rows.map(row => [
        row.producto, row.producto_nombre, row.usuario, row.usuario_nombre, row.tipo,
        warehouseOf(row), row.operacion_id, row.transaccion_id, row.referencia_id, row.id
      ].join(' ')).join(' ') + ' ' + [op.label, op.almacen, op.reference].join(' ')).toLowerCase();
      result.push(op);
    });
    result.sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
    return result;
  }

  function iconSvg(path) {
    return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
  }
  function setupGlobalIcons(root) {
    const actions = [
      { selector: '#logout-btn', label: 'Cerrar sesión', path: 'M10 17l5-5-5-5 M15 12H3 M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6' },
      { selector: '#mi-cuenta-btn', label: 'Mi cuenta', path: 'M20 21a8 8 0 0 0-16 0 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
      { selector: '#turnos-refrescar-btn, #mov-refrescar-btn, #mov-retry-btn', label: 'Actualizar', path: 'M20 7v5h-5 M4 17v-5h5 M5.6 9a7 7 0 0 1 11.8-2L20 12 M4 12l2.6 5a7 7 0 0 0 11.8-2' },
      { selector: '#mov-limpiar-btn, #mov-empty-clear, #aud-limpiar-btn', label: 'Limpiar filtros', path: 'M5 5l14 14 M19 5L5 19' },
      { selector: '#com-volver-btn', label: 'Volver', path: 'M19 12H5 M12 19l-7-7 7-7' }
    ];
    if (!root || !root.querySelectorAll) return;
    actions.forEach(function (item) {
      root.querySelectorAll(item.selector).forEach(function (button) {
        if (button.dataset.bcIconified === '1' || button.tagName !== 'BUTTON') return;
        button.dataset.bcIconified = '1';
        button.setAttribute('aria-label', item.label);
        button.setAttribute('title', item.label);
        button.classList.add('bc-m76-icon-only');
        button.innerHTML = iconSvg(item.path) + '<span class="bc-m76-sr-only">' + item.label + '</span>';
      });
    });
    // Iconify only exact, universally recognizable one-word actions. Contextual
    // or destructive multi-word actions keep their visible text.
    const exact = {
      'guardar': ['Guardar', 'M5 3h12l4 4v14H3V3h2 M7 3v6h10V3 M7 21v-8h10v8'],
      'editar': ['Editar', 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z'],
      'eliminar': ['Eliminar', 'M3 6h18 M8 6V4h8v2 M19 6l-1 15H6L5 6 M10 11v6 M14 11v6'],
      'buscar': ['Buscar', 'M20 20l-4.5-4.5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
      'refrescar': ['Actualizar', 'M20 7v5h-5 M4 17v-5h5 M5.6 9a7 7 0 0 1 11.8-2L20 12 M4 12l2.6 5a7 7 0 0 0 11.8-2'],
      'actualizar': ['Actualizar', 'M20 7v5h-5 M4 17v-5h5 M5.6 9a7 7 0 0 1 11.8-2L20 12 M4 12l2.6 5a7 7 0 0 0 11.8-2'],
      'limpiar': ['Limpiar', 'M5 5l14 14 M19 5L5 19'],
      'cancelar': ['Cancelar', 'M5 5l14 14 M19 5L5 19'],
      'cerrar': ['Cerrar', 'M5 5l14 14 M19 5L5 19'],
      'volver': ['Volver', 'M19 12H5 M12 19l-7-7 7-7'],
      'anterior': ['Anterior', 'M19 12H5 M12 19l-7-7 7-7'],
      'siguiente': ['Siguiente', 'M5 12h14 M12 5l7 7-7 7'],
      'agregar': ['Agregar', 'M12 5v14 M5 12h14'],
      'añadir': ['Añadir', 'M12 5v14 M5 12h14'],
      'descargar': ['Descargar', 'M12 3v12 M7 10l5 5 5-5 M4 20h16'],
      'subir': ['Subir', 'M12 21V9 M7 14l5-5 5 5 M4 4h16']
    };
    root.querySelectorAll('button').forEach(function (button) {
      if (button.dataset.bcIconified === '1') return;
      const visible = text(button.innerText || button.textContent).replace(/[↻⌕×✓✔✕←→‹›]/g, '').trim().toLowerCase();
      const item = exact[visible];
      if (!item) return;
      button.dataset.bcIconified = '1';
      button.setAttribute('aria-label', item[0]);
      button.setAttribute('title', item[0]);
      button.classList.add('bc-m76-icon-only');
      button.innerHTML = iconSvg(item[1]) + '<span class="bc-m76-sr-only">' + esc(item[0]) + '</span>';
    });
  }

  function injectStyles() {
    if (document.getElementById('bc-m76-style')) return;
    const style = document.createElement('style');
    style.id = 'bc-m76-style';
    style.textContent = [
      '#tab-movimientos .bc-m51-view-switch{display:none!important}',
      '#tab-movimientos .bc-m51-chips{display:none!important}',
      '#tab-movimientos .bc-m51-status{display:none!important}',
      '#tab-movimientos .bc-m76-history-heading{margin:10px 0 8px;font-size:.9rem;font-weight:700;color:var(--text)}',
      '#tab-movimientos .bc-m51-view-copy span{display:none!important}',
      '#tab-movimientos .bc-m51-view-copy strong{font-size:.82rem!important}',
      '#tab-movimientos .bc-m51-view-btn{min-height:32px!important;padding:5px 11px!important}',
      '#tab-movimientos .bc-m51-filters{display:flex!important;flex-direction:column!important;gap:6px!important;padding:7px!important;margin-bottom:6px!important}',
      '#tab-movimientos .bc-m76-filter-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 38px 38px;gap:6px;align-items:center}',
      '#tab-movimientos .bc-m76-filter-toolbar .bc-m51-filter{min-width:0}',
      '#tab-movimientos .bc-m76-filter-toolbar .bc-m51-filter label{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important}',
      '#tab-movimientos .bc-m76-filter-toolbar input{height:37px!important;padding:0 11px!important}',
      '#tab-movimientos .bc-m76-filter-toggle{height:37px;width:38px;border-radius:8px;background:var(--stone-2);border:1px solid var(--gold-dim);color:var(--gold-bright);font-size:17px}',
      '#tab-movimientos .bc-m76-filter-apply{height:37px!important;width:38px!important;padding:0!important;border-radius:8px!important;background:linear-gradient(180deg,var(--gold-bright),var(--gold))!important;border:0!important;color:#211605!important;font-size:18px!important}',
      '#tab-movimientos .bc-m76-filter-advanced{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:7px;align-items:end;padding-top:7px;border-top:1px solid rgba(212,176,92,.1)}',
      '#tab-movimientos .bc-m76-filter-advanced[hidden]{display:none!important}',
      '#tab-movimientos .bc-m76-filter-advanced .bc-m51-filter input,#tab-movimientos .bc-m76-filter-advanced .bc-m51-filter select{height:34px!important}',
      '#tab-movimientos .bc-m76-category-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;overflow:visible;width:100%;min-width:0;padding:2px 0 7px}',
      '#tab-movimientos .bc-m76-category{display:flex;align-items:center;justify-content:center;width:100%;min-width:0;min-height:38px;padding:5px 3px;border:1px solid rgba(212,176,92,.18);border-radius:999px;background:rgba(18,42,36,.55);color:var(--mist);font-size:.68rem;font-weight:600;line-height:1.12;text-align:center;white-space:normal;overflow-wrap:anywhere}',
      '#tab-movimientos .bc-m76-category[aria-pressed="true"]{background:rgba(212,176,92,.14);border-color:var(--gold);color:var(--gold-bright)}',
      '#tab-movimientos .bc-m51-metrics{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px!important;margin-bottom:7px!important}',
      '#tab-movimientos .bc-m51-metric{min-width:0;text-align:center}',
      '#tab-movimientos .bc-m51-metric-label{min-height:2.2em;line-height:1.1!important;white-space:normal!important;overflow-wrap:anywhere}',
      '#tab-movimientos .bc-m76-summary-note{grid-column:1/-1;font-size:.68rem;color:var(--mist);padding:3px 5px}',
      '#tab-movimientos .bc-m51-metric{padding:8px 9px!important}',
      '#tab-movimientos .bc-m51-metric-label{font-size:.61rem!important}',
      '#tab-movimientos .bc-m51-metric-value{font-size:1.02rem!important;margin-top:2px!important}',
      '#tab-movimientos #mov-paginacion{display:none!important}',
      '#tab-movimientos .bc-m76-pagination{display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 0}',
      '#tab-movimientos .bc-m76-pagination button{width:36px;height:34px;border-radius:7px;border:1px solid var(--gold-dim);background:var(--stone-2);color:var(--text)}',
      '#tab-movimientos .bc-m76-op-card{display:grid;width:100%;font:inherit;text-align:left;color:inherit;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;padding:9px 11px;margin:0 0 6px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(255,255,255,.018);cursor:pointer}',
      '#tab-movimientos .bc-m76-op-card:hover,#tab-movimientos .bc-m76-op-card:focus{outline:none;border-color:rgba(212,176,92,.5);background:rgba(212,176,92,.055)}',
      '#tab-movimientos .bc-m76-op-name{font-size:.84rem;font-weight:700;color:var(--text)}',
      '#tab-movimientos .bc-m76-op-meta{margin-top:4px;font-size:.72rem;color:var(--mist);line-height:1.35}',
      '#tab-movimientos .bc-m76-op-products{margin-top:4px;font-size:.7rem;color:var(--gold-bright)}',
      '#tab-movimientos .bc-m76-op-total{text-align:right;font-size:.88rem;font-weight:700;color:var(--text);white-space:nowrap}',
      '#tab-movimientos .bc-m76-op-user{margin-top:5px;font-size:.68rem;color:var(--mist-dim);text-align:right}',
      '.bc-m76-modal[hidden]{display:none!important}.bc-m76-modal{position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}',
      '.bc-m76-modal-backdrop{position:absolute;inset:0;background:rgba(3,10,8,.8);backdrop-filter:blur(3px)}',
      '.bc-m76-modal-card{position:relative;z-index:1;width:min(760px,100%);max-height:min(90vh,820px);overflow:auto;overscroll-behavior:contain;background:var(--stone,#122a24);border:1px solid rgba(212,176,92,.34);border-radius:13px;padding:14px;box-shadow:0 24px 75px rgba(0,0,0,.64)}',
      '.bc-m76-modal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid rgba(212,176,92,.15)}',
      '.bc-m76-modal-head h3{margin:0;color:var(--gold-bright);font-family:"Cormorant Garamond",serif;font-size:1.2rem}',
      '.bc-m76-modal-close{width:34px;height:34px;border:1px solid rgba(212,176,92,.24);border-radius:50%;background:transparent;color:var(--mist);font-size:19px}',
      '.bc-m76-detail-section{margin-bottom:13px}.bc-m76-detail-section h4{margin:0 0 6px;font-size:.67rem;letter-spacing:.06em;text-transform:uppercase;color:var(--mist)}',
      '.bc-m76-detail-field{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.045);font-size:.78rem}',
      '.bc-m76-detail-field span:first-child{color:var(--mist)}.bc-m76-detail-field strong{text-align:right;color:var(--text);font-weight:600;overflow-wrap:anywhere}',
      '.bc-m76-product{display:flex;justify-content:space-between;gap:12px;padding:9px 10px;margin:5px 0;background:rgba(255,255,255,.025);border:1px solid rgba(212,176,92,.12);border-radius:7px}',
      '.bc-m76-product small{display:block;margin-top:3px;color:var(--mist);font-size:.69rem}.bc-m76-product strong{white-space:nowrap}',
      '.bc-m76-product-total{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid rgba(212,176,92,.2);color:var(--gold-bright);font-weight:700}',
      '.bc-m76-icon-only{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 38px;width:38px;min-width:38px;height:38px;min-height:38px;padding:0!important;border-radius:50%!important;line-height:1;white-space:nowrap}',
      '.bc-m76-icon-only svg{display:block;width:18px;height:18px}.bc-m76-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}',
      '@media(max-width:980px){#tab-movimientos .bc-m76-filter-advanced{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:640px){#tab-movimientos .bc-m76-filter-advanced{grid-template-columns:repeat(2,minmax(0,1fr))}#tab-movimientos .bc-m76-category-tabs{grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}#tab-movimientos .bc-m76-category{min-height:40px;padding:5px 1px;font-size:.58rem;letter-spacing:-.015em}#tab-movimientos .bc-m51-metric{padding:7px 3px!important}#tab-movimientos .bc-m51-metric-label{font-size:.56rem!important}#tab-movimientos .bc-m51-metric-value{font-size:.95rem!important}#tab-movimientos .bc-m76-op-card{grid-template-columns:minmax(0,1fr) auto;padding:9px}#tab-movimientos .bc-m76-modal-card{max-height:93vh;padding:11px}.bc-m76-modal{padding:8px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureModal() {
    let modal = document.getElementById('bc-m76-operation-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'bc-m76-operation-modal';
    modal.className = 'bc-m76-modal';
    modal.hidden = true;
    modal.innerHTML = '<div class="bc-m76-modal-backdrop" data-bc-m76-close="1"></div><section class="bc-m76-modal-card" role="dialog" aria-modal="true" aria-labelledby="bc-m76-modal-title" tabindex="-1"><header class="bc-m76-modal-head"><h3 id="bc-m76-modal-title">Detalle de operación</h3><button class="bc-m76-modal-close" type="button" data-bc-m76-close="1" aria-label="Cerrar detalle" title="Cerrar">×</button></header><div id="bc-m76-modal-body"></div></section>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-bc-m76-close]')) closeModal();
    });
    return modal;
  }

  function closeModal() {
    const modal = document.getElementById('bc-m76-operation-modal');
    if (modal) modal.hidden = true;
    state.selected = null;
    if (state.trigger && state.trigger.isConnected) state.trigger.focus();
  }

  function field(label, value) {
    if (value == null || value === '') return '';
    return '<div class="bc-m76-detail-field"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
  }

  function openModal(op, trigger) {
    const modal = ensureModal();
    state.selected = op;
    state.trigger = trigger || null;
    const title = modal.querySelector('#bc-m76-modal-title');
    const body = modal.querySelector('#bc-m76-modal-body');
    if (title) title.textContent = op.kind === 'transferencia'
      ? 'Movimiento interno · ' + (op.almacen || 'Almacenes')
      : (op.kind === 'compra' ? 'Compra · ' + (op.almacen || 'Almacén') : 'Detalle · ' + op.label);
    const general = field('Operación', op.label) + field('Fecha y hora', timeLabel(op.fecha)) +
      field('Responsable', op.usuario || '—') + field('Referencia', op.reference || '—');
    const location = op.kind === 'transferencia'
      ? field('Almacén de origen', op.origen || '—') + field('Almacén de destino', op.destino || '—') +
        (!op.origen && !op.destino ? field('Almacenes', op.almacen || '—') : '')
      : field('Almacén', op.almacen || '—');
    const lines = op.lineItems.map(function (line) {
      const locationInfo = line.ubicaciones.length ? '<small>' + esc(line.ubicaciones.join(' · ')) + '</small>' : '';
      const costInfo = line.costo_unitario != null ? '<small>Costo unitario: $' + esc(number(line.costo_unitario).toFixed(2)) + '</small>' : '';
      return '<div class="bc-m76-product"><div><strong>' + esc(line.nombre) + '</strong>' + locationInfo + costInfo +
        '</div><strong>' + esc(number(line.cantidad).toLocaleString('es-ES')) + ' u</strong></div>';
    }).join('');
    body.innerHTML = '<section class="bc-m76-detail-section"><h4>Información general</h4>' + general + '</section>' +
      '<section class="bc-m76-detail-section"><h4>Ubicación</h4>' + location + '</section>' +
      '<section class="bc-m76-detail-section"><h4>Productos · ' + esc(op.productCount) + '</h4>' +
      (lines || '<p class="muted">No hay líneas de productos disponibles.</p>') +
      '<div class="bc-m76-product-total"><span>Total de unidades</span><span>' + esc(number(op.totalUnits).toLocaleString('es-ES')) + ' u</span></div></section>';
    modal.hidden = false;
    const card = modal.querySelector('.bc-m76-modal-card');
    if (card) card.focus();
  }

  function renderOperations() {
    const tab = document.getElementById('tab-movimientos');
    const list = document.getElementById('mov-detalle');
    const metrics = document.getElementById('mov-resumen-m51');
    const pagination = document.getElementById('bc-m76-pagination');
    if (!tab || !list || !metrics || !pagination) return;
    const search = normalize((document.getElementById('mov-buscar') || {}).value);
    state.operations = groupOperations(state.rows).filter(op => !search || op.searchText.indexOf(search) >= 0);
    const maxPage = Math.max(0, Math.ceil(state.operations.length / PAGE_SIZE) - 1);
    state.page = Math.min(state.page, maxPage);
    const summarySource = state.summaryRows === null ? state.rows : state.summaryRows;
    const todayOps = groupOperations(summarySource).filter(op => dateKey(op.fecha) === businessTodayKey());
    const counts = { compra: 0, transferencia: 0, baja: 0, reinversion: 0 };
    todayOps.forEach(op => { if (Object.prototype.hasOwnProperty.call(counts, op.kind)) counts[op.kind]++; });
    function metric(label, value) {
      return '<div class="bc-m51-metric"><div class="bc-m51-metric-label">' + esc(label) + '</div><div class="bc-m51-metric-value">' + esc(value) + '</div></div>';
    }
    metrics.innerHTML = metric('Compras', state.summaryUnavailable ? '—' : counts.compra) +
      metric('Mov. internos', state.summaryUnavailable ? '—' : counts.transferencia) +
      metric('Bajas', state.summaryUnavailable ? '—' : counts.baja) +
      metric('Reinversiones', state.summaryUnavailable ? '—' : counts.reinversion);
    let summaryNote = metrics.querySelector('.bc-m76-summary-note');
    if (state.summaryUnavailable || state.summaryTruncated) {
      if (!summaryNote) {
        summaryNote = document.createElement('div'); summaryNote.className = 'bc-m76-summary-note';
        summaryNote.setAttribute('role', 'status'); metrics.appendChild(summaryNote);
      }
      summaryNote.textContent = state.summaryUnavailable
        ? 'No se pudo actualizar el resumen diario. Revisa la conexión y actualiza.'
        : 'El resumen diario alcanzó el límite de seguridad de registros.';
    } else if (summaryNote) summaryNote.remove();

    const start = state.page * PAGE_SIZE;
    const pageItems = state.operations.slice(start, start + PAGE_SIZE);
    const isHistory = !!(document.getElementById('mov-view-history') &&
      document.getElementById('mov-view-history').getAttribute('aria-pressed') === 'true');
    const heading = tab.querySelector('.bc-m76-history-heading');
    if (heading) heading.textContent = isHistory ? 'Historial de movimientos' : 'Historial de hoy';
    const cardHtml = function (op, index) {
      const label = op.kind === 'transferencia' ? 'Movimiento interno' : op.label;
      return '<button type="button" class="bc-m76-op-card" data-bc-m76-op="' + index + '">' +
        '<span><span class="bc-m76-op-name">' + esc(label) + '</span>' +
        '<span class="bc-m76-op-products">Lista guardada · ' + esc(op.productCount) + ' producto' + (op.productCount === 1 ? '' : 's') + '</span>' +
        '<span class="bc-m76-op-meta">' + esc(op.almacen || 'Ubicación no identificada') + ' · ' + esc(timeLabel(op.fecha)) + '</span></span>' +
        '<span><span class="bc-m76-op-total">' + esc(number(op.totalUnits).toLocaleString('es-ES')) + ' u</span>' +
        '<span class="bc-m76-op-user">' + esc(op.usuario || '—') + '　›</span></span></button>';
    };
    if (!pageItems.length) {
      list.innerHTML = '<div class="bc-m51-empty"><strong>Sin operaciones</strong><br>No hay registros que coincidan con la búsqueda y los filtros elegidos.</div>';
    } else if (!isHistory) {
      list.innerHTML = pageItems.map((op, index) => cardHtml(op, start + index)).join('');
    } else {
      const days = new Map();
      pageItems.forEach(function (op, index) {
        const key = dateKey(op.fecha);
        if (!days.has(key)) days.set(key, []);
        days.get(key).push({ op, index: start + index });
      });
      let html = '';
      days.forEach(function (items, day) {
        html += '<details class="bc-m51-group bc-m51-group-collapsible" open><summary class="bc-m51-group-head"><span class="bc-m51-group-title">' + esc(dateLabel(day)) + '</span></summary>';
        items.forEach(entry => { html += cardHtml(entry.op, entry.index); });
        html += '</details>';
      });
      list.innerHTML = html;
    }
    if (state.historyTruncated) {
      list.insertAdjacentHTML('beforeend', '<div class="bc-m51-empty" role="status">Se alcanzó el límite de seguridad de 5.000 registros. Reduce el rango de fechas para consultar todo el historial.</div>');
    }
    const totalPages = Math.max(1, Math.ceil(state.operations.length / PAGE_SIZE));
    pagination.innerHTML = '<button type="button" data-bc-m76-page="-1" aria-label="Página anterior" title="Anterior"' +
      (state.page <= 0 ? ' disabled' : '') + '>‹</button><span class="muted">Página ' + (state.page + 1) + ' / ' + totalPages +
      ' · ' + state.operations.length + ' operaciones</span><button type="button" data-bc-m76-page="1" aria-label="Página siguiente" title="Siguiente"' +
      (state.page >= totalPages - 1 ? ' disabled' : '') + '>›</button>';
    updateCategoryTabs();
  }

  function updateCategoryTabs() {
    const select = document.getElementById('mov-filtro-tipo');
    const value = select ? select.value : '';
    document.querySelectorAll('.bc-m76-category').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.type === value ? 'true' : 'false');
    });
  }

  function ensureFilterLayout(tab) {
    const filterRoot = tab.querySelector('.bc-m51-filters');
    if (!filterRoot || filterRoot.dataset.bcM76Ready === '1') return;
    filterRoot.dataset.bcM76Ready = '1';
    const search = filterRoot.querySelector('#mov-buscar');
    const searchField = search && search.closest('.bc-m51-filter');
    const apply = filterRoot.querySelector('#mov-refrescar-btn');
    const clear = filterRoot.querySelector('#mov-limpiar-btn');
    const oldFields = Array.from(filterRoot.querySelectorAll('.bc-m51-filter')).filter(node => node !== searchField);
    const toolbar = document.createElement('div');
    toolbar.className = 'bc-m76-filter-toolbar';
    if (searchField) toolbar.appendChild(searchField);
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'bc-m76-filter-toggle';
    toggle.textContent = '☷'; toggle.title = 'Mostrar filtros avanzados';
    toggle.setAttribute('aria-label', 'Mostrar filtros avanzados');
    toggle.setAttribute('aria-expanded', 'false');
    toolbar.appendChild(toggle);
    if (apply) {
      apply.textContent = '⌕'; apply.classList.add('bc-m76-filter-apply');
      apply.title = 'Aplicar filtros'; apply.setAttribute('aria-label', 'Aplicar filtros');
      toolbar.appendChild(apply);
    } else {
      const refresh = document.createElement('button');
      refresh.type = 'button'; refresh.id = 'mov-refrescar-btn'; refresh.className = 'bc-m76-filter-apply';
      refresh.textContent = '⌕'; refresh.title = 'Aplicar filtros'; refresh.setAttribute('aria-label', 'Aplicar filtros');
      toolbar.appendChild(refresh);
    }

    const advanced = document.createElement('div');
    advanced.id = 'bc-m76-filter-advanced'; advanced.className = 'bc-m76-filter-advanced'; advanced.hidden = true;
    oldFields.forEach(node => advanced.appendChild(node));
    if (clear) {
      clear.textContent = '×'; clear.title = 'Limpiar filtros'; clear.setAttribute('aria-label', 'Limpiar filtros');
      advanced.appendChild(clear);
    }
    filterRoot.replaceChildren(toolbar, advanced);

    const typeSelect = filterRoot.querySelector('#mov-filtro-tipo');
    if (typeSelect && typeSelect.options.length) typeSelect.options[0].textContent = 'Todo';
  }

  function ensureCategoryTabs(tab) {
    if (tab.querySelector('.bc-m76-category-tabs')) return;
    const host = document.createElement('div');
    host.className = 'bc-m76-category-tabs';
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', 'Filtrar por tipo de operación');
    const categories = [
      { type: '', label: 'Todo' },
      { type: 'compra', label: 'Compras' },
      { type: 'reinversion', label: 'Reinversiones' },
      { type: 'baja', label: 'Bajas' },
      { type: 'movimiento_interno', label: 'Movimientos internos' }
    ];
    categories.forEach(function (category) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'bc-m76-category';
      button.dataset.type = category.type; button.textContent = category.label;
      button.setAttribute('aria-pressed', category.type === '' ? 'true' : 'false');
      host.appendChild(button);
    });
    const metrics = tab.querySelector('.bc-m51-metrics');
    const switcher = tab.querySelector('.bc-m51-view-switch');
    if (metrics) metrics.after(host);
    else if (switcher) switcher.after(host);
    else {
      const filters = tab.querySelector('.bc-m51-filters');
      if (filters) filters.before(host);
    }
  }

  function ensurePagination(tab) {
    const legacy = tab.querySelector('#mov-paginacion');
    if (legacy) legacy.style.display = 'none';
    let pagination = tab.querySelector('#bc-m76-pagination');
    if (!pagination) {
      pagination = document.createElement('div');
      pagination.id = 'bc-m76-pagination'; pagination.className = 'bc-m76-pagination';
      const list = tab.querySelector('#mov-detalle');
      if (list) list.after(pagination);
    }
    return pagination;
  }

  function installUi() {
    const tab = document.getElementById('tab-movimientos');
    if (!tab || !tab.querySelector('#mov-detalle') || !tab.querySelector('.bc-m51-filters')) return false;
    injectStyles();
    ensureFilterLayout(tab);
    ensureCategoryTabs(tab);
    ensurePagination(tab);
    let heading = tab.querySelector('.bc-m76-history-heading');
    if (!heading) {
      heading = document.createElement('h4'); heading.className = 'bc-m76-history-heading'; heading.textContent = 'Historial de hoy';
      const list = tab.querySelector('#mov-detalle'); if (list) list.before(heading);
    }
    const legacyDrawer = tab.querySelector('#mov-drawer-m51');
    if (legacyDrawer) { legacyDrawer.setAttribute('aria-hidden', 'true'); legacyDrawer.style.setProperty('display', 'none', 'important'); }
    const sectionTitle = tab.querySelector('.bc-m51-hero h3');
    if (sectionTitle) sectionTitle.textContent = 'Actividad de inventario';
    const viewTitle = tab.querySelector('#mov-view-title');
    if (viewTitle) viewTitle.textContent = tab.querySelector('#mov-view-history[aria-pressed="true"]') ? 'Historial de operaciones' : 'Operaciones de hoy';
    const todayButton = tab.querySelector('#mov-view-today');
    const historyButton = tab.querySelector('#mov-view-history');
    if (todayButton) todayButton.textContent = 'Hoy';
    if (historyButton) historyButton.textContent = 'Historial';
    if (!tab.dataset.bcM76Events) {
      tab.dataset.bcM76Events = '1';
      tab.addEventListener('click', function (event) {
        const toggle = event.target.closest('.bc-m76-filter-toggle');
        if (toggle) {
          const advanced = tab.querySelector('#bc-m76-filter-advanced');
          if (advanced) {
            advanced.hidden = !advanced.hidden;
            toggle.setAttribute('aria-expanded', advanced.hidden ? 'false' : 'true');
            toggle.setAttribute('aria-label', advanced.hidden ? 'Mostrar filtros avanzados' : 'Ocultar filtros avanzados');
            toggle.title = advanced.hidden ? 'Mostrar filtros avanzados' : 'Ocultar filtros avanzados';
          }
          return;
        }
        const category = event.target.closest('.bc-m76-category');
        if (category) {
          const select = tab.querySelector('#mov-filtro-tipo');
          if (select) select.value = category.dataset.type;
          state.page = 0;
          const apply = tab.querySelector('#mov-refrescar-btn');
          if (typeof window.refrescarMovimientos === 'function') Promise.resolve(window.refrescarMovimientos()).catch(() => {});
          else if (apply) apply.click();
          updateCategoryTabs();
          return;
        }
        const page = event.target.closest('[data-bc-m76-page]');
        if (page && !page.disabled) {
          state.page = Math.max(0, Math.min(Math.ceil(state.operations.length / PAGE_SIZE) - 1, state.page + Number(page.dataset.bcM76Page)));
          renderOperations();
          return;
        }
        const card = event.target.closest('[data-bc-m76-op]');
        if (card) {
          const op = state.operations[Number(card.dataset.bcM76Op)];
          if (op) openModal(op, card);
          return;
        }
        if (event.target.closest('#mov-limpiar-btn')) {
          state.page = 0;
          setTimeout(renderOperations, 0);
        }
      });
      tab.addEventListener('input', function (event) {
        if (event.target && event.target.id === 'mov-buscar') { state.page = 0; renderOperations(); }
      });
      tab.addEventListener('change', function (event) {
        if (event.target && event.target.id === 'mov-filtro-tipo') updateCategoryTabs();
      });
    }
    ensureModal();
    return true;
  }

  function scheduleRender(rows) {
    if (Array.isArray(rows)) state.rows = rows.slice();
    window.setTimeout(function () {
      if (installUi()) renderOperations();
    }, 0);
  }

  function hookData() {
    if (typeof window.renderMovimientos === 'function' && !window.renderMovimientos.__bcM76Wrapped) {
      const original = window.renderMovimientos;
      const wrapped = function (rows) {
        const result = original.apply(this, arguments);
        scheduleRender(rows);
        hookData();
        return result;
      };
      wrapped.__bcM76Wrapped = true;
      window.renderMovimientos = wrapped;
    }
    if (!window.__BC_M76_M51_ROWS_BOUND__) {
      window.__BC_M76_M51_ROWS_BOUND__ = true;
      window.addEventListener('bc:m51-rows', function (event) {
        const detail = event && event.detail || {};
        if (Array.isArray(detail.rows)) {
          state.rows = detail.rows.slice();
          state.summaryRows = Array.isArray(detail.todayRows) ? detail.todayRows.slice() : null;
          state.summaryUnavailable = !!detail.todaySummaryError;
          state.summaryTruncated = !!detail.todaySummaryTruncated;
          state.historyTruncated = !!detail.historyTruncated;
          state.page = 0;
          if (installUi()) renderOperations();
        }
      });
    }
  }

  function boot() {
    injectStyles();
    setupGlobalIcons(document);
    if (Array.isArray(window.__BC_M51_ROWS__)) state.rows = window.__BC_M51_ROWS__.slice();
    if (Array.isArray(window.__BC_M51_TODAY_ROWS__)) state.summaryRows = window.__BC_M51_TODAY_ROWS__.slice();
    state.summaryUnavailable = !!window.__BC_M51_TODAY_SUMMARY_ERROR__;
    state.summaryTruncated = !!window.__BC_M51_TODAY_SUMMARY_TRUNCATED__;
    state.historyTruncated = !!window.__BC_M51_HISTORY_TRUNCATED__;
    hookData();
    installUi();
    // M51/M52 initialize during the same dynamic module sequence; retry a few times
    // so this visual owner attaches after their shell and public hooks exist.
    [80, 280, 700, 1500, 2600].forEach(delay => window.setTimeout(function () {
      setupGlobalIcons(document); hookData(); installUi();
      if (state.rows.length) renderOperations();
    }, delay));
    if (typeof MutationObserver === 'function' && document.body) {
      const observer = new MutationObserver(function (records) {
        records.forEach(record => record.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            setupGlobalIcons(node.parentNode || document);
            if (node.id === 'tab-movimientos' || (node.querySelector && node.querySelector('#mov-detalle'))) {
              hookData(); installUi();
              if (state.rows.length) renderOperations();
            }
          }
        }));
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.__BC_M76_TEST__ = { groupOperations, renderOperations, getState: () => ({ rows: state.rows, summaryRows: state.summaryRows, operations: state.operations }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();