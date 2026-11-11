// BattleCruiser — M53.9: Centro profesional de control de inventario
// Única autoridad visual de #tab-inventario. Reutiliza RPC inventario_enriquecido.
// Mantiene inventario-detalle.js (modal) y mision-d-stock-reposicion.js (stock bajo).
(function () {
  'use strict';
  if (window.__bcM53Inventario) return;
  window.__bcM53Inventario = true;

  const STYLE_ID = 'bc-m53-inventario-css';
  const PAGE_SIZE = 48;

  let _allRows = [];
  let _filtered = [];
  let _page = 0;
  let _search = '';
  let _estado = 'todos';
  let _loading = false;
  let _lastError = null;
  let _view = 'grid';

  function esc(v) {
    if (typeof window.escHtml === 'function') return window.escHtml(String(v == null ? '' : v));
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function moneyFmt(v) {
    if (typeof window.money === 'function') return window.money(v);
    return num(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function qtyFmt(v) {
    const n = num(v);
    if (typeof window.numberFmt === 'function') return window.numberFmt(n);
    return new Intl.NumberFormat('es-ES', { useGrouping: true, maximumFractionDigits: 2 }).formatToParts(n).map(function (part) { return part.type === 'group' ? '\u202f' : part.value; }).join('');
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#tab-inventario .bc-m53-variant-details{margin-top:8px;padding-top:7px;border-top:1px solid rgba(212,176,92,.14);font-size:10px}',
      '#tab-inventario .bc-m53-variant-details summary{cursor:pointer;color:var(--gold-bright);font-weight:600;list-style-position:inside}',
      '#tab-inventario .bc-m53-variant-list{display:flex;flex-direction:column;gap:4px;margin-top:6px}',
      '#tab-inventario .bc-m53-variant-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:var(--mist)}',
      '#tab-inventario .bc-m53-variant-row strong{color:var(--text);font-weight:600}',

      '#tab-inventario.bc-m53{max-width:1100px}',
      '#tab-inventario.bc-m53 .bc-m53-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(212,176,92,.14)}',
      "#tab-inventario.bc-m53 .bc-m53-hero h3{margin:0;font-family:'Cormorant Garamond',serif;font-size:1.85rem;line-height:1.1;color:var(--text)}",
      '#tab-inventario.bc-m53 .bc-m53-hero p{margin:4px 0 0;color:var(--mist);font-size:.8rem}',
      '#tab-inventario.bc-m53 .bc-m53-status{font-size:.72rem;color:var(--mist);white-space:nowrap}',
      '#tab-inventario.bc-m53 .bc-m53-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-bottom:9px}',
      '#tab-inventario.bc-m53 .bc-m53-metric{min-width:0;padding:8px 9px;background:linear-gradient(180deg,rgba(26,56,48,.55),rgba(18,42,36,.88));border:1px solid rgba(212,176,92,.12);border-radius:10px}',
      '#tab-inventario.bc-m53 .bc-m53-metric-label{font-size:.65rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mist)}',
      '#tab-inventario.bc-m53 .bc-m53-metric-value{margin-top:4px;font-size:1.15rem;font-weight:700;color:var(--text);line-height:1.15;word-break:break-word}',
      '#tab-inventario.bc-m53 .bc-m53-metric.is-warn .bc-m53-metric-value{color:#e8c56a}',
      '#tab-inventario.bc-m53 .bc-m53-metric.is-crit .bc-m53-metric-value{color:#e88a96}',
      '#tab-inventario.bc-m53 .bc-m53-alerts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}',
      '#tab-inventario.bc-m53 .bc-m53-alert{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;border:1px solid rgba(212,176,92,.16);background:rgba(8,20,17,.55);font-size:.78rem;color:var(--text);cursor:pointer}',
      '#tab-inventario.bc-m53 .bc-m53-alert:hover{border-color:rgba(212,176,92,.35)}',
      '#tab-inventario.bc-m53 .bc-m53-alert strong{font-weight:700}',
      '#tab-inventario.bc-m53 .bc-m53-alert-crit{border-color:rgba(196,74,90,.35);background:rgba(196,74,90,.08)}',
      '#tab-inventario.bc-m53 .bc-m53-alert-warn{border-color:rgba(232,197,106,.3);background:rgba(232,197,106,.07)}',
      '#tab-inventario.bc-m53 .bc-m53-alert-action{margin-left:4px;font-size:.72rem;color:var(--gold-bright);text-decoration:underline;background:none;border:none;cursor:pointer;padding:0;font:inherit}',
      '#tab-inventario.bc-m53 .bc-m53-filters{display:grid;grid-template-columns:minmax(120px,.85fr) minmax(120px,.85fr) minmax(180px,1.5fr) auto auto;gap:6px;align-items:end;margin-bottom:7px;padding:8px;background:rgba(8,20,17,.65);border:1px solid rgba(212,176,92,.12);border-radius:10px}',
      '#tab-inventario.bc-m53 .bc-m53-filter label{display:block;font-size:.61rem;text-transform:uppercase;letter-spacing:.045em;color:var(--mist);margin-bottom:2px}',
      '#tab-inventario.bc-m53 .bc-m53-filter input,#tab-inventario.bc-m53 .bc-m53-filter select{width:100%;min-width:0;box-sizing:border-box;height:34px;padding:0 8px;background:var(--void);border:1px solid rgba(212,176,92,.2);border-radius:6px;color:var(--text);font-size:12px}',
      '#tab-inventario.bc-m53 .bc-m53-filter input:focus,#tab-inventario.bc-m53 .bc-m53-filter select:focus{outline:none;border-color:var(--gold-dim);box-shadow:0 0 0 3px rgba(212,176,92,.14)}',
      '#tab-inventario.bc-m53 .bc-m53-btn{height:34px;padding:0 10px;white-space:nowrap;background:var(--stone-2);color:var(--text);border:1px solid var(--gold-dim);border-radius:6px;font-size:12px;cursor:pointer}',
      '#tab-inventario.bc-m53 .bc-m53-btn:hover{border-color:var(--gold)}',
      '#tab-inventario.bc-m53 .bc-m53-btn-primary{background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#211605;border:none;font-weight:600}',
      '#tab-inventario.bc-m53 .bc-m53-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}',
      '#tab-inventario.bc-m53 .bc-m53-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(212,176,92,.1);border:1px solid rgba(212,176,92,.22);font-size:.72rem;color:var(--text)}',
      '#tab-inventario.bc-m53 .bc-m53-chip button{background:none;border:none;color:var(--mist);cursor:pointer;padding:0 2px;font-size:14px;line-height:1}',
      '#tab-inventario.bc-m53 .bc-m53-chip button:hover{color:var(--wine)}',
      '#tab-inventario.bc-m53 .bc-m53-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:8px}',
      '#tab-inventario.bc-m53 .bc-m53-list{display:flex;flex-direction:column;gap:5px}',
      '#tab-inventario.bc-m53 .bc-m53-card{display:flex;flex-direction:column;min-width:0;min-height:0;padding:8px;background:rgba(255,255,255,.018);border:1px solid rgba(255,255,255,.05);border-radius:10px;cursor:pointer;transition:border-color .12s,background .12s}',
      '#tab-inventario.bc-m53 .bc-m53-card:hover,#tab-inventario.bc-m53 .bc-m53-card:focus{border-color:rgba(212,176,92,.32);background:rgba(212,176,92,.05);outline:none}',
      '#tab-inventario.bc-m53 .bc-m53-thumb{width:100%;aspect-ratio:1.15;object-fit:cover;border-radius:8px;background:rgba(0,0,0,.25);margin-bottom:8px}',
      '#tab-inventario.bc-m53 .bc-m53-thumb-empty{display:flex;align-items:center;justify-content:center;color:var(--mist);font-size:.7rem;border:1px dashed rgba(212,176,92,.15)}',
      '#tab-inventario.bc-m53 .bc-m53-card-name{font-size:.86rem;font-weight:600;color:var(--text);line-height:1.25;margin:0 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '#tab-inventario.bc-m53 .bc-m53-card-stock{font-size:.95rem;font-weight:700;color:var(--text);margin-bottom:2px}',
      '#tab-inventario.bc-m53 .bc-m53-card-meta{font-size:.72rem;color:var(--mist);line-height:1.35}',
      '#tab-inventario.bc-m53 .bc-m53-badge{display:inline-block;margin-top:6px;padding:2px 7px;border-radius:999px;font-size:.62rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase}',
      '#tab-inventario.bc-m53 .bc-m53-badge-normal{background:rgba(159,196,173,.15);color:var(--sage)}',
      '#tab-inventario.bc-m53 .bc-m53-badge-bajo{background:rgba(232,197,106,.15);color:#e8c56a}',
      '#tab-inventario.bc-m53 .bc-m53-badge-agotado{background:rgba(196,74,90,.15);color:#e88a96}',
      '#tab-inventario.bc-m53 .bc-m53-toolbar{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:7px}',
      '#tab-inventario.bc-m53 .bc-m53-view-tools{display:flex;align-items:center;gap:4px;margin-left:auto}',
      '#tab-inventario.bc-m53 .bc-m53-view-btn{height:30px;padding:0 9px;border:1px solid rgba(212,176,92,.2);border-radius:7px;background:rgba(8,20,17,.65);color:var(--mist);font-size:.67rem;cursor:pointer;white-space:nowrap}',
      '#tab-inventario.bc-m53 .bc-m53-view-btn[aria-pressed=true]{border-color:rgba(212,176,92,.48);background:rgba(212,176,92,.1);color:var(--gold-bright)}',
      '#tab-inventario.bc-m53 .bc-m53-card-content{min-width:0}',
      '#tab-inventario.bc-m53 .bc-m53-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:5px;margin-bottom:4px}',
      '#tab-inventario.bc-m53 .bc-m53-card-name{font-size:.82rem;line-height:1.2;margin:0;min-width:0;overflow-wrap:anywhere}',
      '#tab-inventario.bc-m53 .bc-m53-stores{display:flex;flex-direction:column;gap:2px;margin-top:4px}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-row{padding:4px 0;border-top:1px solid rgba(212,176,92,.1)}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-main{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;font-size:.69rem}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-name{color:var(--mist);min-width:0;overflow-wrap:anywhere}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-qty{font-size:.73rem;color:var(--text);white-space:nowrap}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-meta{display:flex;justify-content:flex-end;align-items:center;gap:6px;margin-top:2px;font-size:.61rem;color:var(--mist)}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-status{padding:1px 5px;border-radius:999px;font-size:.55rem;font-weight:600;white-space:nowrap}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-status-normal{background:rgba(159,196,173,.12);color:var(--sage)}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-status-bajo{background:rgba(232,197,106,.12);color:#e8c56a}',
      '#tab-inventario.bc-m53 .bc-m53-warehouse-status-agotado{background:rgba(196,74,90,.12);color:#e88a96}',
      '#tab-inventario.bc-m53 .bc-m53-list .bc-m53-card{display:grid;grid-template-columns:52px minmax(0,1fr);align-items:start;gap:8px;padding:7px}',
      '#tab-inventario.bc-m53 .bc-m53-list .bc-m53-thumb{width:52px;height:52px;aspect-ratio:1;margin:0;border-radius:6px}',
      '#tab-inventario.bc-m53 .bc-m53-list .bc-m53-card-name{font-size:.77rem}',
      '#tab-inventario.bc-m53 .bc-m53-list .bc-m53-warehouse-row{padding:3px 0}',
      '#tab-inventario.bc-m53 .bc-m53-variant-details{margin-top:4px;padding-top:4px;border-top:1px solid rgba(212,176,92,.1);font-size:.62rem}',
      '#tab-inventario.bc-m53 .bc-m53-variant-details summary{cursor:pointer;color:var(--gold-bright);font-size:.62rem}',
      '@media(max-width:640px){#tab-inventario.bc-m53 .bc-m53-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}#tab-inventario.bc-m53 .bc-m53-metric{padding:8px 9px}#tab-inventario.bc-m53 .bc-m53-metric-value{font-size:1rem}#tab-inventario.bc-m53 .bc-m53-filters{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:7px}#tab-inventario.bc-m53 .bc-m53-filter:nth-child(3){grid-column:1/-1}#tab-inventario.bc-m53 .bc-m53-filters>.bc-m53-btn{width:auto;height:34px;padding:0 8px}#tab-inventario.bc-m53 .bc-m53-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}#tab-inventario.bc-m53 .bc-m53-card{padding:7px}#tab-inventario.bc-m53 .bc-m53-thumb{aspect-ratio:1.4}#tab-inventario.bc-m53 .bc-m53-view-btn{padding:0 7px;font-size:.63rem}}',
      '#tab-inventario.bc-m53 .bc-m53-empty,#tab-inventario.bc-m53 .bc-m53-error,#tab-inventario.bc-m53 .bc-m53-loading{padding:28px 12px;text-align:center;color:var(--mist);font-size:.8rem}',
      '#tab-inventario.bc-m53 .bc-m53-error{color:var(--wine)}',
      '#tab-inventario.bc-m53 .bc-m53-pag{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding:14px 0 4px}',
      '#tab-inventario.bc-m53 .bc-m53-pag .muted{font-size:.72rem}',
      '#tab-inventario.bc-m53 .bc-m53-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}',
      '#tab-inventario.bc-m53 #bc-stock-bajo-btn{font-weight:600}',
      '@media(max-width:980px){#tab-inventario.bc-m53 .bc-m53-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}#tab-inventario.bc-m53 .bc-m53-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:640px){#tab-inventario.bc-m53 .bc-m53-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}#tab-inventario.bc-m53 .bc-m53-metric{padding:8px 9px}#tab-inventario.bc-m53 .bc-m53-filters{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:7px}#tab-inventario.bc-m53 .bc-m53-filter:nth-child(3){grid-column:1/-1}#tab-inventario.bc-m53 .bc-m53-filters>.bc-m53-btn{width:auto;height:34px;padding:0 8px}#tab-inventario.bc-m53 .bc-m53-btn{width:auto}#tab-inventario.bc-m53 .bc-m53-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}#tab-inventario.bc-m53 .bc-m53-view-btn{padding:0 7px;font-size:.63rem}}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureShell() {
    const tab = document.getElementById('tab-inventario');
    if (!tab) return null;
    injectCss();
    tab.classList.add('bc-m53');

    let hero = tab.querySelector('.bc-m53-hero');
    if (!hero) {
      const oldHead = tab.querySelector('.pendientes-header');
      const oldIntro = tab.querySelector(':scope > p.muted');
      hero = document.createElement('div');
      hero.className = 'bc-m53-hero';
      hero.innerHTML = '<div><h3>Inventario</h3><p>Controla existencias, valoración y necesidades de reposición.</p></div><span class="bc-m53-status" id="inv-conn-info"></span>';
      if (oldHead) {
        const conn = oldHead.querySelector('#inv-conn-info');
        if (conn && hero.querySelector('#inv-conn-info')) {
          hero.querySelector('#inv-conn-info').textContent = conn.textContent || '';
        }
        oldHead.replaceWith(hero);
      } else {
        tab.prepend(hero);
      }
      if (oldIntro) oldIntro.remove();
    }

    if (!tab.querySelector('.bc-m53-metrics')) {
      const metrics = document.createElement('div');
      metrics.className = 'bc-m53-metrics';
      metrics.id = 'inv-resumen';
      metrics.innerHTML = '<div class="bc-m53-loading">Cargando resumen…</div>';
      hero.after(metrics);
    }

    if (!tab.querySelector('.bc-m53-alerts')) {
      const alerts = document.createElement('div');
      alerts.className = 'bc-m53-alerts';
      alerts.id = 'inv-alertas-m53';
      const metrics = tab.querySelector('.bc-m53-metrics');
      if (metrics) metrics.after(alerts);
      else hero.after(alerts);
    }

    let filters = tab.querySelector('.bc-m53-filters');
    if (!filters) {
      const old = tab.querySelector('.mando-filtros');
      const oldEstado = tab.querySelector('#inv-filtro-estado');
      filters = document.createElement('div');
      filters.className = 'bc-m53-filters';
      filters.id = 'inv-filtros-m53';

      const almacen = document.getElementById('inv-filtro-almacen') || document.createElement('select');
      almacen.id = 'inv-filtro-almacen';
      if (!almacen.querySelector('option')) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'Todos los almacenes';
        almacen.appendChild(o);
      }

      const estado = document.createElement('select');
      estado.id = 'inv-filtro-estado-select';
      estado.innerHTML = '<option value="todos">Todos los estados</option><option value="sin_minimo">Mínimo pendiente</option><option value="bajo">Bajo mínimo</option><option value="agotado">Agotados</option><option value="normal">Normales</option>';

      const buscar = document.createElement('input');
      buscar.type = 'search';
      buscar.id = 'inv-buscar';
      buscar.placeholder = 'Buscar producto…';
      buscar.autocomplete = 'off';

      function wrap(label, el) {
        const d = document.createElement('div');
        d.className = 'bc-m53-filter';
        const lab = document.createElement('label');
        lab.textContent = label;
        if (el.id) lab.setAttribute('for', el.id);
        d.appendChild(lab);
        d.appendChild(el);
        return d;
      }

      filters.appendChild(wrap('Almacén', almacen));
      filters.appendChild(wrap('Estado', estado));
      filters.appendChild(wrap('Buscar', buscar));

      const btnAplicar = document.createElement('button');
      btnAplicar.type = 'button';
      btnAplicar.id = 'inv-refrescar-btn';
      btnAplicar.className = 'bc-m53-btn bc-m53-btn-primary';
      btnAplicar.textContent = 'Aplicar';
      filters.appendChild(btnAplicar);

      const btnLimpiar = document.createElement('button');
      btnLimpiar.type = 'button';
      btnLimpiar.id = 'inv-limpiar-btn';
      btnLimpiar.className = 'bc-m53-btn';
      btnLimpiar.textContent = 'Limpiar';
      filters.appendChild(btnLimpiar);

      const alerts = tab.querySelector('.bc-m53-alerts');
      if (old) old.replaceWith(filters);
      else if (alerts) alerts.after(filters);
      else tab.querySelector('.bc-m53-metrics').after(filters);

      if (oldEstado) oldEstado.remove();
    }

    // Toolbar para botón Stock bajo (mision-d lo inyecta en .mando-filtros; lo reubicamos)
    let toolbar = tab.querySelector('.bc-m53-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'bc-m53-toolbar';
      toolbar.id = 'inv-toolbar-m53';
      filters.after(toolbar);
    }
    if (!toolbar.querySelector('.bc-m53-view-tools')) {
      const tools = document.createElement('div');
      tools.className = 'bc-m53-view-tools';
      tools.innerHTML = '<button type="button" class="bc-m53-view-btn" data-m53-view="grid" aria-pressed="true">▦ Cuadros</button>' +
        '<button type="button" class="bc-m53-view-btn" data-m53-view="list" aria-pressed="false">☷ Filas</button>';
      toolbar.appendChild(tools);
    }

    if (!tab.querySelector('.bc-m53-chips')) {
      const chips = document.createElement('div');
      chips.className = 'bc-m53-chips';
      chips.id = 'inv-chips-m53';
      toolbar.after(chips);
    }

    let list = tab.querySelector('#inv-detalle');
    if (list && !list.classList.contains('bc-m53-grid') && !list.classList.contains('bc-m53-list')) {
      // Convertir contenedor lista a grid host
      list.className = 'bc-m53-grid';
      list.id = 'inv-detalle';
    } else if (!list) {
      list = document.createElement('div');
      list.className = 'bc-m53-grid';
      list.id = 'inv-detalle';
      const chips = tab.querySelector('.bc-m53-chips');
      if (chips) chips.after(list);
      else toolbar.after(list);
    }

    // Remover bloques legacy de valoración/detalle si quedan como cc-bloque
    tab.querySelectorAll('.cc-bloque').forEach(function (b) {
      const h = b.querySelector('h3');
      if (!h) return;
      const t = (h.textContent || '').toLowerCase();
      if (t.indexOf('valoración') !== -1 || t.indexOf('detalle por producto') !== -1) {
        // Mover hijos útiles si hace falta, luego quitar el bloque vacío de título
        if (b.contains(document.getElementById('inv-resumen')) || b.contains(document.getElementById('inv-detalle'))) {
          // already relocated ids — remove only the heading wrapper noise
          h.remove();
          if (!b.children.length) b.remove();
          else {
            while (b.firstChild) b.parentNode.insertBefore(b.firstChild, b);
            b.remove();
          }
        } else {
          b.remove();
        }
      }
    });

    if (!tab.querySelector('#inv-paginacion-m53')) {
      const pag = document.createElement('div');
      pag.id = 'inv-paginacion-m53';
      pag.className = 'bc-m53-pag';
      list.after(pag);
    }

    return tab;
  }

  function relocateStockBajoBtn() {
    const btn = document.getElementById('bc-stock-bajo-btn');
    const toolbar = document.getElementById('inv-toolbar-m53');
    if (btn && toolbar && btn.parentNode !== toolbar) {
      const viewTools = toolbar.querySelector('.bc-m53-view-tools');
      toolbar.insertBefore(btn, viewTools || null);
      btn.classList.add('bc-m53-btn');
    }
  }

  function imagenProducto(productoId) {
    const prods = (typeof _cache !== 'undefined' && Array.isArray(_cache.productos)) ? _cache.productos : [];
    const p = prods.find(function (x) { return String(x.id) === String(productoId); });
    return p && p.imagen_url ? p.imagen_url : null;
  }

  function estadoMeta(estado) {
    if (estado === 'sin_minimo') return { label: 'Mínimo pendiente', cls: 'bajo' };
    if (estado === 'agotado') return { label: 'Agotado', cls: 'agotado' };
    if (estado === 'bajo') return { label: 'Bajo mínimo', cls: 'bajo' };
    return { label: 'Disponible', cls: 'normal' };
  }

  function estadoAlmacen(row) {
    const variants = row && Array.isArray(row.variantes) ? row.variantes : [];
    if (variants.length) {
      if (variants.some(function (variant) {
        return variant && (variant.estado === 'sin_minimo' || num(variant.minimo) <= 0);
      })) return 'sin_minimo';
      if (row && (row.estado === 'agotado' || num(row.cantidad) <= 0)) return 'agotado';
      if (variants.some(function (variant) {
        return variant && (variant.estado === 'bajo' || variant.estado === 'agotado' ||
          num(variant.cantidad) <= num(variant.minimo));
      })) return 'bajo';
      return 'normal';
    }
    if (!row || row.minimo == null || num(row.minimo) <= 0) return 'sin_minimo';
    if (row.estado === 'agotado' || num(row.cantidad) <= 0) return 'agotado';
    if (row.estado === 'bajo' || num(row.cantidad) <= num(row.minimo)) return 'bajo';
    return 'normal';
  }

  function agruparProductos(rows) {
    const groups = new Map();
    (rows || []).forEach(function (row) {
      const name = String(row.producto || '').trim();
      const key = row.producto_id != null && String(row.producto_id) !== ''
        ? 'id:' + String(row.producto_id)
        : 'name:' + name.toLowerCase() + '|' + String(row.unidad || '');
      let group = groups.get(key);
      if (!group) {
        group = { producto_id: row.producto_id || '', producto: row.producto || '—', unidad: row.unidad || 'u', cantidad: 0, almacenes: [] };
        groups.set(key, group);
      }
      group.cantidad += num(row.cantidad);
      group.almacenes.push({
        almacen_id: row.almacen_id || null, almacen: row.almacen || '—', cantidad: num(row.cantidad),
        minimo: row.minimo == null ? null : num(row.minimo), estado: estadoAlmacen(row),
        unidad: row.unidad || group.unidad, variantes: Array.isArray(row.variantes) ? row.variantes : [],
        sin_asignacion: !!row.__bc_sin_asignacion
      });
    });
    return Array.from(groups.values()).map(function (group) {
      group.almacenes.sort(function (x, y) { return String(x.almacen).localeCompare(String(y.almacen), 'es'); });
      group.estado = group.almacenes.some(function (x) { return x.estado === 'sin_minimo'; }) ? 'sin_minimo' :
        group.cantidad <= 0 ? 'agotado' :
        (group.almacenes.some(function (x) { return x.estado === 'bajo'; }) ? 'bajo' : 'normal');
      group.almacen = group.almacenes.map(function (x) { return x.almacen; }).join(' ');
      return group;
    });
  }

  function totalsFrom(rows) {
    const products = agruparProductos(rows);
    return {
      totalValor: (rows || []).reduce(function (sum, row) { return sum + num(row.valor_inventario); }, 0),
      agotados: products.filter(function (p) { return p.cantidad <= 0 && p.almacenes.some(function (a) { return !a.sin_asignacion; }); }).length,
      bajos: products.filter(function (p) { return p.almacenes.some(function (a) { return a.estado === 'bajo'; }); }).length,
      minimosPendientes: products.filter(function (p) { return p.estado === 'sin_minimo'; }).length,
      productos: products.length
    };
  }

  function applyFilters() {
    let rows = agruparProductos(_allRows);
    if (_estado === 'sin_minimo') rows = rows.filter(function (p) { return p.estado === 'sin_minimo'; });
    else if (_estado === 'agotado') rows = rows.filter(function (p) { return p.cantidad <= 0; });
    else if (_estado === 'bajo') rows = rows.filter(function (p) { return p.estado === 'bajo'; });
    else if (_estado === 'normal') rows = rows.filter(function (p) { return p.estado === 'normal'; });
    const q = (_search || '').toLowerCase().trim();
    if (q) {
      rows = rows.filter(function (p) {
        const stores = p.almacenes.map(function (x) {
          return [x.almacen].concat(x.variantes.map(function (v) { return v.nombre || ''; })).join(' ');
        }).join(' ');
        return [p.producto, p.producto_id, stores].join(' ').toLowerCase().indexOf(q) !== -1;
      });
    }
    _filtered = rows;
    const maxPage = Math.max(0, Math.ceil(_filtered.length / PAGE_SIZE) - 1);
    if (_page > maxPage) _page = maxPage;
  }

  function renderMetrics() {
    const el = document.getElementById('inv-resumen');
    if (!el) return;
    if (_loading) {
      el.innerHTML = '<div class="bc-m53-loading">Cargando resumen…</div>';
      return;
    }
    // Métricas globales sobre TODAS las filas del almacén (no del filtro de estado/búsqueda)
    const t = totalsFrom(_allRows);
    function card(label, value, extraClass) {
      return '<div class="bc-m53-metric' + (extraClass ? ' ' + extraClass : '') + '"><div class="bc-m53-metric-label">' +
        esc(label) + '</div><div class="bc-m53-metric-value">' + esc(String(value)) + '</div></div>';
    }
    el.innerHTML =
      card('Valor inventario', '$' + moneyFmt(t.totalValor)) +
      card('Productos', qtyFmt(t.productos)) +
      card('Bajo mínimo', qtyFmt(t.bajos), t.bajos > 0 ? 'is-warn' : '') +
      card('Agotados', qtyFmt(t.agotados), t.agotados > 0 ? 'is-crit' : '');
  }

  function renderAlerts() {
    const el = document.getElementById('inv-alertas-m53');
    if (!el) return;
    const t = totalsFrom(_allRows);
    let html = '';
    if (t.minimosPendientes > 0) {
      html += '<div class="bc-m53-alert bc-m53-alert-warn" data-m53-filter="sin_minimo" role="button" tabindex="0">' +
        '<strong>🟠 Mínimo pendiente</strong><span>' + qtyFmt(t.minimosPendientes) + ' producto' + (t.minimosPendientes === 1 ? '' : 's') +
        '</span><button type="button" class="bc-m53-alert-action" data-m53-filter="sin_minimo">Configurar</button></div>';
    }
    if (t.agotados > 0) {
      html += '<div class="bc-m53-alert bc-m53-alert-crit" data-m53-filter="agotado" role="button" tabindex="0">' +
        '<strong>🔴 Agotados</strong><span>' + qtyFmt(t.agotados) + ' producto' + (t.agotados === 1 ? '' : 's') +
        '</span><button type="button" class="bc-m53-alert-action" data-m53-filter="agotado">Ver</button></div>';
    }
    if (t.bajos > 0) {
      html += '<div class="bc-m53-alert bc-m53-alert-warn" data-m53-filter="bajo" role="button" tabindex="0">' +
        '<strong>🟠 Bajo mínimo</strong><span>' + qtyFmt(t.bajos) + ' producto' + (t.bajos === 1 ? '' : 's') +
        '</span><button type="button" class="bc-m53-alert-action" data-m53-filter="bajo">Ver</button>' +
        '<button type="button" class="bc-m53-alert-action" data-m53-open-stock-bajo="1">Reposición</button></div>';
    }
    if (!html && !_loading && _allRows.length) {
      html = '<div class="bc-m53-alert" style="cursor:default"><strong>🟢 Inventario en rango</strong><span>Sin alertas de stock bajo ni agotados.</span></div>';
    }
    el.innerHTML = html;
  }

  function renderChips() {
    const el = document.getElementById('inv-chips-m53');
    if (!el) return;
    const chips = [];
    const sel = document.getElementById('inv-filtro-almacen');
    if (sel && sel.value) {
      const opt = sel.selectedOptions[0];
      chips.push({ key: 'almacen', label: opt ? opt.textContent : sel.value });
    }
    if (_estado && _estado !== 'todos') {
      const labels = { sin_minimo: 'Mínimo pendiente', bajo: 'Bajo mínimo', agotado: 'Agotados', normal: 'Normales' };
      chips.push({ key: 'estado', label: labels[_estado] || _estado });
    }
    if (_search) chips.push({ key: 'search', label: '“' + _search + '”' });
    if (!chips.length) { el.innerHTML = ''; return; }
    el.innerHTML = chips.map(function (c) {
      return '<span class="bc-m53-chip" data-chip="' + esc(c.key) + '">' + esc(c.label) +
        ' <button type="button" aria-label="Quitar filtro">×</button></span>';
    }).join('') +
      '<button type="button" class="bc-m53-btn" id="inv-chips-clear" style="height:28px;padding:0 10px;font-size:11px">Limpiar filtros</button>';
  }

  function syncViewControls() {
    const tools = document.querySelector('#tab-inventario .bc-m53-view-tools');
    if (!tools) return;
    tools.querySelectorAll('[data-m53-view]').forEach(function (button) {
      const active = button.getAttribute('data-m53-view') === _view;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('active', active);
    });
  }

  function renderGrid() {
    const el = document.getElementById('inv-detalle');
    const pag = document.getElementById('inv-paginacion-m53');
    if (!el) return;
    syncViewControls();
    if (_loading) {
      el.className = '';
      el.innerHTML = '<div class="bc-m53-loading">Cargando inventario…</div>';
      if (pag) pag.innerHTML = '';
      return;
    }
    if (_lastError) {
      el.className = '';
      el.innerHTML = '<div class="bc-m53-error">No pudimos cargar el inventario.<br><button type="button" class="bc-m53-btn" id="inv-retry-btn" style="margin-top:10px">Reintentar</button></div>';
      if (pag) pag.innerHTML = '';
      return;
    }
    if (!_filtered.length) {
      el.className = '';
      const hasF = !!(document.getElementById('inv-filtro-almacen') && document.getElementById('inv-filtro-almacen').value) || (_estado !== 'todos') || !!_search;
      const msg = _allRows.length === 0 ? 'No hay productos con stock registrado.' : 'No hay productos que coincidan con los filtros.';
      el.innerHTML = '<div class="bc-m53-empty"><strong>' + esc(msg) + '</strong>' +
        (hasF ? '<br><button type="button" class="bc-m53-btn" id="inv-empty-clear" style="margin-top:10px">Limpiar filtros</button>' : '') + '</div>';
      if (pag) pag.innerHTML = '';
      window._invFilas = [];
      return;
    }
    el.className = _view === 'list' ? 'bc-m53-list' : 'bc-m53-grid';
    const start = _page * PAGE_SIZE;
    const visibleRows = _filtered.slice(start, start + PAGE_SIZE);
    window._invFilas = visibleRows;
    el.innerHTML = visibleRows.map(function (product, i) {
      const meta = estadoMeta(product.estado);
      const img = imagenProducto(product.producto_id);
      const thumb = img
        ? '<img class="bc-m53-thumb" src="' + esc(img) + '" alt="" loading="lazy">'
        : '<div class="bc-m53-thumb bc-m53-thumb-empty" aria-hidden="true">Sin imagen</div>';
      const unit = product.unidad || 'u';
      const storesHtml = product.almacenes.map(function (warehouse) {
        const status = estadoMeta(warehouse.estado);
        return '<div class="bc-m53-warehouse-row">' +
          '<div class="bc-m53-warehouse-main"><span class="bc-m53-warehouse-name">' + esc(warehouse.almacen) + '</span>' +
          '<strong class="bc-m53-warehouse-qty">' + qtyFmt(warehouse.cantidad) + ' ' + esc(warehouse.unidad || unit) + '</strong></div>' +
          '<div class="bc-m53-warehouse-meta">' +
          (warehouse.variantes.length ? (warehouse.minimo != null ? '<span>mín. compuesto ' + qtyFmt(warehouse.minimo) + '</span>' : '<span>mín. compuesto pendiente</span>') : (warehouse.minimo != null ? '<span>mín ' + qtyFmt(warehouse.minimo) + '</span>' : '')) +
          '<span class="bc-m53-warehouse-status bc-m53-warehouse-status-' + status.cls + '">' + esc(status.label) + '</span>' +
          '</div></div>';
      }).join('');
      const variantWarehouses = product.almacenes.filter(function (warehouse) { return warehouse.variantes.length > 0; });
      const variantDetails = variantWarehouses.length
        ? '<details class="bc-m53-variant-details"><summary>Ver stock detallado por almacén</summary><div class="bc-m53-variant-list">' +
          variantWarehouses.map(function (warehouse) {
            return '<div class="bc-m53-variant-row"><strong>' + esc(warehouse.almacen) + '</strong><span></span></div>' +
              warehouse.variantes.map(function (variant) {
                const minimum = num(variant.minimo);
                const state = variant.estado || (num(variant.cantidad) <= 0 ? 'agotado' : (minimum > 0 && num(variant.cantidad) <= minimum ? 'bajo' : 'normal'));
                const meta = estadoMeta(state);
                return '<div class="bc-m53-variant-row"><span>' + esc(variant.nombre || 'Variante') + '</span><strong>' +
                  qtyFmt(variant.cantidad) + ' ' + esc(variant.unidad || unit) + '</strong><span>mín. ' + qtyFmt(minimum) +
                  ' · ' + esc(meta.label) + '</span></div>';
              }).join('');
          }).join('') + '</div></details>'
        : '';
      return '<article class="bc-m53-card rep-fila" data-idx="' + i + '" data-inv-producto="' +
        esc(product.producto_id || '') + '" role="button" tabindex="0">' + thumb +
        '<div class="bc-m53-card-content"><div class="bc-m53-card-head">' +
        '<h4 class="bc-m53-card-name">' + esc(product.producto || '—') + '</h4>' +
        '<span class="bc-m53-badge bc-m53-badge-' + meta.cls + '">' + esc(meta.label) + '</span></div>' +
        '<div class="bc-m53-stores">' + storesHtml + '</div>' + variantDetails + '</div></article>';
    }).join('');
    if (pag) {
      pag.innerHTML = '';
      const totalPages = Math.max(1, Math.ceil(_filtered.length / PAGE_SIZE));
      if (_page > 0) {
        const ant = document.createElement('button');
        ant.type = 'button'; ant.className = 'bc-m53-btn'; ant.textContent = '← Anterior';
        ant.addEventListener('click', function () { _page--; paintListOnly(); });
        pag.appendChild(ant);
      }
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'Página ' + qtyFmt(_page + 1) + ' de ' + qtyFmt(totalPages) + ' · ' + qtyFmt(_filtered.length) + ' productos';
      pag.appendChild(span);
      if (_page < totalPages - 1) {
        const sig = document.createElement('button');
        sig.type = 'button'; sig.className = 'bc-m53-btn'; sig.textContent = 'Siguiente →';
        sig.addEventListener('click', function () { _page++; paintListOnly(); });
        pag.appendChild(sig);
      }
    }
  }

  function paintListOnly() {
    applyFilters();
    renderChips();
    renderGrid();
  }

  function paint() {
    ensureShell();
    relocateStockBajoBtn();
    applyFilters();
    renderMetrics();
    renderAlerts();
    renderChips();
    renderGrid();
  }

  function syncEstadoSelect() {
    const sel = document.getElementById('inv-filtro-estado-select');
    if (sel && sel.value !== _estado) sel.value = _estado;
    // Compat con variable global usada por nucleo-operativo
    if (typeof window._invFiltroEstado !== 'undefined') window._invFiltroEstado = _estado;
  }

  function limpiarFiltrosUI() {
    const alm = document.getElementById('inv-filtro-almacen');
    if (alm) alm.value = '';
    const bus = document.getElementById('inv-buscar');
    if (bus) bus.value = '';
    _search = '';
    _estado = 'todos';
    _page = 0;
    syncEstadoSelect();
  }

  async function cargarInventario() {
    ensureShell();
    relocateStockBajoBtn();
    const conn = document.getElementById('inv-conn-info');

    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('reportes', 'ver')) {
      _allRows = [];
      _filtered = [];
      _lastError = null;
      _loading = false;
      window._invFilas = [];
      const el = document.getElementById('inv-detalle');
      if (el) {
        el.className = '';
        el.innerHTML = '<div class="bc-m53-empty">No tenés permiso para ver inventario.</div>';
      }
      const metrics = document.getElementById('inv-resumen');
      if (metrics) metrics.innerHTML = '';
      const alerts = document.getElementById('inv-alertas-m53');
      if (alerts) alerts.innerHTML = '';
      return;
    }

    if (!navigator.onLine) {
      if (conn) conn.textContent = '⚪ Sin conexión — datos no disponibles';
      _allRows = [];
      _filtered = [];
      _lastError = null;
      _loading = false;
      window._invFilas = [];
      const el = document.getElementById('inv-detalle');
      if (el) {
        el.className = '';
        el.innerHTML = '<div class="bc-m53-empty">⚪ Sin conexión — el inventario enriquecido requiere datos de Supabase.</div>';
      }
      const metrics = document.getElementById('inv-resumen');
      if (metrics) metrics.innerHTML = '<div class="bc-m53-empty" style="padding:12px">Sin conexión.</div>';
      return;
    }

    if (conn) conn.textContent = '🟢 Datos de Supabase';
    if (typeof window.poblarSelectAlmacenes === 'function') {
      window.poblarSelectAlmacenes(document.getElementById('inv-filtro-almacen'));
    }

    _loading = true;
    _lastError = null;
    paint();

    const sel = document.getElementById('inv-filtro-almacen');
    const almacen = sel ? (sel.value || null) : null;

    try {
      const client = window.client;
      if (!client) throw new Error('Cliente Supabase no disponible');
      // The warehouse catalogue is only an optional enrichment for the
      // minimum editor. Legacy/offline fixtures may expose RPC only; never let
      // the missing .from() method block the inventory RPC and its filters.
      const warehouseCatalogRequest = typeof client.from === 'function'
        ? Promise.resolve().then(function () {
            return client.from('almacenes').select('id, nombre, activo').eq('activo', true).order('nombre');
          }).catch(function (error) {
            return { data: [], error: error };
          })
        : Promise.resolve({ data: [], error: null });
      const [res, mixedRes, warehousesRes] = await Promise.all([
        client.rpc('inventario_enriquecido', { p_almacen_id: almacen }),
        client.rpc('inventario_mixto_enriquecido', { p_almacen_id: almacen }),
        warehouseCatalogRequest
      ]);
      if (res.error) {
        if (typeof window.esRpcFaltante === 'function' && window.esRpcFaltante(res.error)) {
          _lastError = 'rpc_missing';
        } else {
          _lastError = String(res.error.message || res.error.code || res.error);
        }
        _allRows = [];
        _filtered = [];
        window._invFilas = [];
        _loading = false;
        paint();
        return;
      }
      const ordinaryRows = Array.isArray(res.data) ? res.data : [];
      let mixedRows = [];
      if (!mixedRes.error) {
        mixedRows = Array.isArray(mixedRes.data) ? mixedRes.data : [];
      } else if (!(typeof window.esRpcFaltante === 'function' && window.esRpcFaltante(mixedRes.error))) {
        throw new Error(String(mixedRes.error.message || mixedRes.error.code || mixedRes.error));
      }

      // The standard inventory RPC intentionally exposes only the warehouse
      // label. Build a name→UUID index from the warehouse catalog so the
      // product detail editor can address the exact stock row.
      const warehouseIdByName = new Map();
      let warehouseCatalog = !warehousesRes.error && Array.isArray(warehousesRes.data)
        ? warehousesRes.data : [];
      if (!warehouseCatalog.length) {
        try {
          const cached = typeof _cache !== 'undefined' && _cache && Array.isArray(_cache.almacenes)
            ? _cache.almacenes : (Array.isArray(window._almacenes) ? window._almacenes : []);
          if (cached.length) warehouseCatalog = cached;
        } catch (_) {}
      }
      warehouseCatalog = warehouseCatalog.filter(function (warehouse) {
        return warehouse && warehouse.id && warehouse.activo !== false;
      });
      if (warehouseCatalog.length) {
        try {
          if (!window._cache) window._cache = {};
          const merged = new Map();
          (Array.isArray(window._cache.almacenes) ? window._cache.almacenes : []).forEach(function (warehouse) {
            if (warehouse && warehouse.id && warehouse.activo !== false) merged.set(String(warehouse.id), warehouse);
          });
          warehouseCatalog.forEach(function (warehouse) { merged.set(String(warehouse.id), warehouse); });
          window._cache.almacenes = Array.from(merged.values());
        } catch (_) {}
      }
      if (!warehouseCatalog.length && warehousesRes.error) {
        console.warn('[BattleCruiser] M53 no pudo resolver IDs de almacén desde catálogo:', warehousesRes.error);
      }
      warehouseCatalog.forEach(function (warehouse) {
        const key = String(warehouse && warehouse.nombre || '').trim().toLocaleLowerCase('es');
        if (!key || !warehouse.id) return;
        if (warehouseIdByName.has(key)) warehouseIdByName.set(key, null);
        else warehouseIdByName.set(key, warehouse.id);
      });
      const ordinaryRowsWithWarehouseIds = ordinaryRows.map(function (row) {
        if (row.almacen_id) return row;
        const key = String(row.almacen || '').trim().toLocaleLowerCase('es');
        const resolvedId = warehouseIdByName.get(key) || (almacen || null);
        return Object.assign({}, row, { almacen_id: resolvedId });
      });
      // La RPC mixta entrega el nombre del almacén, no el UUID necesario para guardar mínimos.
      // Resolverlo con el mismo catálogo que se usa para las filas normales.
      const mixedRowsWithWarehouseIds = mixedRows.map(function (row) {
        if (row && row.almacen_id) return row;
        const key = String(row && row.almacen || '').trim().toLocaleLowerCase('es');
        const resolvedId = warehouseIdByName.get(key) || (almacen || null);
        return Object.assign({}, row, { almacen_id: resolvedId });
      });
      const mixedVariantIds = new Set();
      const mixedParentIds = new Set();
      mixedRows.forEach(function (row) {
        if (row && row.producto_id) mixedParentIds.add(String(row.producto_id));
        (Array.isArray(row.variantes) ? row.variantes : []).forEach(function (variant) {
          if (variant && variant.producto_id) mixedVariantIds.add(String(variant.producto_id));
        });
      });
      // Mixed families are already rendered as a parent summary, including
      // any generic opening balance that has not been assigned to a flavour.
      const ordinaryVisibleRows = ordinaryRowsWithWarehouseIds.filter(function (row) {
        const productId = String(row.producto_id);
        return !mixedVariantIds.has(productId) && !mixedParentIds.has(productId);
      });
      const visibleProductIds = new Set(
        ordinaryVisibleRows.map(function (row) { return String(row.producto_id); })
          .concat(mixedRows.map(function (row) { return String(row.producto_id); }))
      );
      let productCatalog = [];
      try {
        productCatalog = Array.isArray(window._cache && window._cache.productos)
          ? window._cache.productos
          : (typeof _cache !== 'undefined' && Array.isArray(_cache.productos) ? _cache.productos : []);
      } catch (_) {}
      if (!productCatalog.length && typeof window.refrescarProductos === 'function') {
        try {
          await window.refrescarProductos();
          productCatalog = Array.isArray(window._cache && window._cache.productos)
            ? window._cache.productos
            : (typeof _cache !== 'undefined' && Array.isArray(_cache.productos) ? _cache.productos : []);
        } catch (error) {
          console.warn('[BattleCruiser] M53 no pudo cargar el catálogo de productos sin stock:', error);
        }
      }
      // Catalog-only normal products must remain configurable before their first
      // purchase or transfer. Do not synthesize rows when a warehouse filter is
      // active, because the product may already be assigned to another warehouse.
      const unassignedProductRows = !almacen ? productCatalog.filter(function (product) {
        return product && product.activo !== false && !product.producto_padre_id &&
          !product.inventario_mixto && !visibleProductIds.has(String(product.id));
      }).map(function (product) {
        return {
          producto_id: product.id,
          producto: product.nombre,
          almacen: 'Sin almacén asignado',
          almacen_id: null,
          cantidad: 0,
          minimo: null,
          estado: 'sin_minimo',
          unidad: product.unidad || 'u',
          valor_inventario: 0,
          __bc_sin_asignacion: true
        };
      }) : [];
      _allRows = ordinaryVisibleRows.concat(mixedRowsWithWarehouseIds, unassignedProductRows);
      window._invFilas = _allRows;
      _page = 0;
      _loading = false;
      _lastError = null;
      paint();
    } catch (e) {
      console.warn('[BattleCruiser] M53 inventario_enriquecido:', e);
      _lastError = String(e && e.message ? e.message : e);
      _allRows = [];
      _filtered = [];
      window._invFilas = [];
      _loading = false;
      paint();
    }
  }

  function installHooks() {
    window.refrescarInventario = function () { return cargarInventario(); };
    if (!window.__BC_M53_DATA_CHANGE_BOUND__) {
      window.__BC_M53_DATA_CHANGE_BOUND__ = true;
      let refreshTimer = null;
      window.addEventListener('bc:data-changed', function (event) {
        const detail = event.detail || {};
        const domains = detail.domains || [];
        if (!['stock', 'inventory', 'products', 'categories', 'warehouses'].some(function (domain) {
          return domains.indexOf(domain) >= 0;
        })) return;
        const inventoryTab = document.getElementById('tab-inventario');
        if (!inventoryTab || !inventoryTab.classList.contains('visible')) return;
        if (detail.offline || !navigator.onLine) { paint(); return; }
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(function () {
          cargarInventario().catch(function (error) {
            console.warn('[BattleCruiser] No se pudo sincronizar la vista de inventario tras un cambio:', error);
          });
        }, 140);
      });
    }
    window.refrescarInventario.__m53 = true;
    window.renderInventario = function (filas) {
      _allRows = Array.isArray(filas) ? filas : [];
      window._invFilas = _allRows;
      _page = 0;
      _loading = false;
      _lastError = null;
      paint();
    };
  }

  function bindEvents() {
    const tab = document.getElementById('tab-inventario');
    if (!tab || tab.dataset.m53Bound) return;
    tab.dataset.m53Bound = '1';

    tab.addEventListener('click', function (e) {
      const viewButton = e.target.closest('[data-m53-view]');
      if (viewButton) {
        _view = viewButton.getAttribute('data-m53-view') === 'list' ? 'list' : 'grid';
        try { window.localStorage.setItem('bc_inventario_vista', _view); } catch (_) {}
        renderGrid();
        return;
      }
      if (e.target.closest('#inv-retry-btn, #inv-empty-clear')) {
        if (e.target.closest('#inv-empty-clear')) {
          limpiarFiltrosUI();
          cargarInventario();
        } else {
          cargarInventario();
        }
        return;
      }
      if (e.target.closest('#inv-chips-clear')) {
        limpiarFiltrosUI();
        cargarInventario();
        return;
      }
      const chipBtn = e.target.closest('.bc-m53-chip button');
      if (chipBtn) {
        const chip = chipBtn.closest('.bc-m53-chip');
        const key = chip && chip.getAttribute('data-chip');
        if (key === 'almacen') {
          const a = document.getElementById('inv-filtro-almacen');
          if (a) a.value = '';
          cargarInventario();
        } else if (key === 'estado') {
          _estado = 'todos';
          _page = 0;
          syncEstadoSelect();
          paintListOnly();
        } else if (key === 'search') {
          const b = document.getElementById('inv-buscar');
          if (b) b.value = '';
          _search = '';
          _page = 0;
          paintListOnly();
        }
        return;
      }

      const openSb = e.target.closest('[data-m53-open-stock-bajo]');
      if (openSb) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.__BC_openStockBajo === 'function') window.__BC_openStockBajo();
        else {
          const btn = document.getElementById('bc-stock-bajo-btn');
          if (btn) btn.click();
        }
        return;
      }

      const filterBtn = e.target.closest('[data-m53-filter]');
      if (filterBtn) {
        const f = filterBtn.getAttribute('data-m53-filter');
        if (f) {
          _estado = f;
          _page = 0;
          syncEstadoSelect();
          paintListOnly();
        }
        return;
      }

      if (e.target.closest('#inv-refrescar-btn')) {
        const b = document.getElementById('inv-buscar');
        _search = b ? b.value.trim() : '';
        const est = document.getElementById('inv-filtro-estado-select');
        if (est) _estado = est.value || 'todos';
        _page = 0;
        syncEstadoSelect();
        cargarInventario();
        return;
      }
      if (e.target.closest('#inv-limpiar-btn')) {
        limpiarFiltrosUI();
        cargarInventario();
        return;
      }

      // Click en card: inventario-detalle.js también escucha .rep-fila[data-inv-producto]
      // No interceptamos para no romper el modal existente.
    });

    tab.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'inv-filtro-estado-select') {
        _estado = e.target.value || 'todos';
        _page = 0;
        if (typeof window._invFiltroEstado !== 'undefined') window._invFiltroEstado = _estado;
        paintListOnly();
      }
      if (e.target && e.target.id === 'inv-filtro-almacen') {
        _page = 0;
        cargarInventario();
      }
    });

    tab.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'inv-buscar') {
        _search = e.target.value.trim();
        _page = 0;
        paintListOnly();
      }
    });
  }

  function boot() {
    try { _view = window.localStorage.getItem('bc_inventario_vista') === 'list' ? 'list' : 'grid'; } catch (_) { _view = 'grid'; }
    ensureShell();
    installHooks();
    bindEvents();
    relocateStockBajoBtn();
    const tab = document.getElementById('tab-inventario');
    if (tab && tab.classList.contains('visible')) cargarInventario();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Reubicar botón stock bajo cuando mision-d lo inyecte (una sola pasada diferida mínima)
  requestAnimationFrame(function () {
    ensureShell();
    installHooks();
    bindEvents();
    relocateStockBajoBtn();
  });
})();
