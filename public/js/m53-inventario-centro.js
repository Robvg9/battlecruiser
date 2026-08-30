// BattleCruiser — M53.1: Centro profesional de control de inventario
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
    return Number.isInteger(n) ? String(n) : n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#tab-inventario.bc-m53{max-width:1100px}',
      '#tab-inventario.bc-m53 .bc-m53-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(212,176,92,.14)}',
      "#tab-inventario.bc-m53 .bc-m53-hero h3{margin:0;font-family:'Cormorant Garamond',serif;font-size:1.85rem;line-height:1.1;color:var(--text)}",
      '#tab-inventario.bc-m53 .bc-m53-hero p{margin:4px 0 0;color:var(--mist);font-size:.8rem}',
      '#tab-inventario.bc-m53 .bc-m53-status{font-size:.72rem;color:var(--mist);white-space:nowrap}',
      '#tab-inventario.bc-m53 .bc-m53-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:12px}',
      '#tab-inventario.bc-m53 .bc-m53-metric{min-width:0;padding:11px 12px;background:linear-gradient(180deg,rgba(26,56,48,.55),rgba(18,42,36,.88));border:1px solid rgba(212,176,92,.12);border-radius:10px}',
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
      '#tab-inventario.bc-m53 .bc-m53-filters{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr) minmax(0,1.4fr) auto auto;gap:8px;align-items:end;margin-bottom:10px;padding:12px;background:rgba(8,20,17,.65);border:1px solid rgba(212,176,92,.12);border-radius:12px}',
      '#tab-inventario.bc-m53 .bc-m53-filter label{display:block;font-size:.65rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mist);margin-bottom:4px}',
      '#tab-inventario.bc-m53 .bc-m53-filter input,#tab-inventario.bc-m53 .bc-m53-filter select{width:100%;min-width:0;box-sizing:border-box;height:38px;padding:0 10px;background:var(--void);border:1px solid rgba(212,176,92,.2);border-radius:6px;color:var(--text);font-size:13px}',
      '#tab-inventario.bc-m53 .bc-m53-filter input:focus,#tab-inventario.bc-m53 .bc-m53-filter select:focus{outline:none;border-color:var(--gold-dim);box-shadow:0 0 0 3px rgba(212,176,92,.14)}',
      '#tab-inventario.bc-m53 .bc-m53-btn{height:38px;padding:0 14px;white-space:nowrap;background:var(--stone-2);color:var(--text);border:1px solid var(--gold-dim);border-radius:6px;font-size:12.5px;cursor:pointer}',
      '#tab-inventario.bc-m53 .bc-m53-btn:hover{border-color:var(--gold)}',
      '#tab-inventario.bc-m53 .bc-m53-btn-primary{background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#211605;border:none;font-weight:600}',
      '#tab-inventario.bc-m53 .bc-m53-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}',
      '#tab-inventario.bc-m53 .bc-m53-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(212,176,92,.1);border:1px solid rgba(212,176,92,.22);font-size:.72rem;color:var(--text)}',
      '#tab-inventario.bc-m53 .bc-m53-chip button{background:none;border:none;color:var(--mist);cursor:pointer;padding:0 2px;font-size:14px;line-height:1}',
      '#tab-inventario.bc-m53 .bc-m53-chip button:hover{color:var(--wine)}',
      '#tab-inventario.bc-m53 .bc-m53-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}',
      '#tab-inventario.bc-m53 .bc-m53-card{display:flex;flex-direction:column;min-height:0;padding:10px;background:rgba(255,255,255,.018);border:1px solid rgba(255,255,255,.05);border-radius:12px;cursor:pointer;transition:border-color .12s,background .12s}',
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
      '#tab-inventario.bc-m53 .bc-m53-empty,#tab-inventario.bc-m53 .bc-m53-error,#tab-inventario.bc-m53 .bc-m53-loading{padding:28px 12px;text-align:center;color:var(--mist);font-size:.8rem}',
      '#tab-inventario.bc-m53 .bc-m53-error{color:var(--wine)}',
      '#tab-inventario.bc-m53 .bc-m53-pag{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding:14px 0 4px}',
      '#tab-inventario.bc-m53 .bc-m53-pag .muted{font-size:.72rem}',
      '#tab-inventario.bc-m53 .bc-m53-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}',
      '#tab-inventario.bc-m53 #bc-stock-bajo-btn{font-weight:600}',
      '@media(max-width:980px){#tab-inventario.bc-m53 .bc-m53-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}#tab-inventario.bc-m53 .bc-m53-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:640px){#tab-inventario.bc-m53 .bc-m53-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#tab-inventario.bc-m53 .bc-m53-filters{grid-template-columns:1fr}#tab-inventario.bc-m53 .bc-m53-btn{width:100%}#tab-inventario.bc-m53 .bc-m53-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}'
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
      estado.innerHTML = '<option value="todos">Todos los estados</option><option value="bajo">Bajo mínimo</option><option value="agotado">Agotados</option><option value="normal">Normales</option>';

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

    if (!tab.querySelector('.bc-m53-chips')) {
      const chips = document.createElement('div');
      chips.className = 'bc-m53-chips';
      chips.id = 'inv-chips-m53';
      toolbar.after(chips);
    }

    let list = tab.querySelector('#inv-detalle');
    if (list && !list.classList.contains('bc-m53-grid')) {
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
      toolbar.appendChild(btn);
      btn.classList.add('bc-m53-btn');
    }
  }

  function imagenProducto(productoId) {
    const prods = (typeof _cache !== 'undefined' && Array.isArray(_cache.productos)) ? _cache.productos : [];
    const p = prods.find(function (x) { return String(x.id) === String(productoId); });
    return p && p.imagen_url ? p.imagen_url : null;
  }

  function estadoMeta(estado) {
    if (estado === 'agotado') return { label: 'Agotado', cls: 'agotado' };
    if (estado === 'bajo') return { label: 'Bajo mínimo', cls: 'bajo' };
    return { label: 'Disponible', cls: 'normal' };
  }

  function totalsFrom(rows) {
    let totalValor = 0, totalUnidades = 0, agotados = 0, bajos = 0;
    const productos = new Set();
    (rows || []).forEach(function (s) {
      totalValor += num(s.valor_inventario);
      totalUnidades += num(s.cantidad);
      if (s.estado === 'agotado') agotados++;
      else if (s.estado === 'bajo') bajos++;
      if (s.producto_id) productos.add(String(s.producto_id));
    });
    return { totalValor: totalValor, totalUnidades: totalUnidades, agotados: agotados, bajos: bajos, productos: productos.size };
  }

  function applyFilters() {
    let rows = _allRows.slice();
    if (_estado === 'agotado') rows = rows.filter(function (s) { return s.estado === 'agotado'; });
    else if (_estado === 'bajo') rows = rows.filter(function (s) { return s.estado === 'bajo'; });
    else if (_estado === 'normal') rows = rows.filter(function (s) { return s.estado !== 'agotado' && s.estado !== 'bajo'; });

    const q = (_search || '').toLowerCase().trim();
    if (q) {
      rows = rows.filter(function (s) {
        const hay = [s.producto, s.almacen, s.producto_id, s.estado]
          .map(function (x) { return String(x == null ? '' : x).toLowerCase(); }).join(' ');
        return hay.indexOf(q) !== -1;
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
      card('Unidades', qtyFmt(t.totalUnidades)) +
      card('Productos', t.productos) +
      card('Agotados', t.agotados, t.agotados > 0 ? 'is-crit' : '') +
      card('Bajo mínimo', t.bajos, t.bajos > 0 ? 'is-warn' : '');
  }

  function renderAlerts() {
    const el = document.getElementById('inv-alertas-m53');
    if (!el) return;
    const t = totalsFrom(_allRows);
    let html = '';
    if (t.agotados > 0) {
      html += '<div class="bc-m53-alert bc-m53-alert-crit" data-m53-filter="agotado" role="button" tabindex="0">' +
        '<strong>🔴 Agotados</strong><span>' + t.agotados + ' producto' + (t.agotados === 1 ? '' : 's') +
        '</span><button type="button" class="bc-m53-alert-action" data-m53-filter="agotado">Ver</button></div>';
    }
    if (t.bajos > 0) {
      html += '<div class="bc-m53-alert bc-m53-alert-warn" data-m53-filter="bajo" role="button" tabindex="0">' +
        '<strong>🟠 Bajo mínimo</strong><span>' + t.bajos + ' producto' + (t.bajos === 1 ? '' : 's') +
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
      const labels = { bajo: 'Bajo mínimo', agotado: 'Agotados', normal: 'Normales' };
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

  function renderGrid() {
    const el = document.getElementById('inv-detalle');
    const pag = document.getElementById('inv-paginacion-m53');
    if (!el) return;

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
      const msg = _allRows.length === 0
        ? 'No hay productos con stock registrado.'
        : 'No hay productos que coincidan con los filtros.';
      el.innerHTML = '<div class="bc-m53-empty"><strong>' + esc(msg) + '</strong>' +
        (hasF ? '<br><button type="button" class="bc-m53-btn" id="inv-empty-clear" style="margin-top:10px">Limpiar filtros</button>' : '') +
        '</div>';
      if (pag) pag.innerHTML = '';
      // Mantener _invFilas alineado para inventario-detalle
      if (typeof window._invFilas !== 'undefined') window._invFilas = [];
      return;
    }

    el.className = 'bc-m53-grid';
    const start = _page * PAGE_SIZE;
    const slice = _filtered.slice(start, start + PAGE_SIZE);

    // inventario-detalle.js espera .rep-fila y _invFilas alineado por índice de filas visibles
    window._invFilas = slice;

    el.innerHTML = slice.map(function (s, i) {
      const meta = estadoMeta(s.estado);
      const img = imagenProducto(s.producto_id);
      const thumb = img
        ? '<img class="bc-m53-thumb" src="' + esc(img) + '" alt="" loading="lazy">'
        : '<div class="bc-m53-thumb bc-m53-thumb-empty" aria-hidden="true">Sin imagen</div>';
      const valorTxt = num(s.valor_inventario) > 0 ? ' · $' + moneyFmt(s.valor_inventario) : '';
      return '<article class="bc-m53-card rep-fila" data-idx="' + i + '" data-inv-producto="' +
        esc(s.producto_id || '') + '" role="button" tabindex="0">' +
        thumb +
        '<h4 class="bc-m53-card-name">' + esc(s.producto || '—') + '</h4>' +
        '<div class="bc-m53-card-stock">' + qtyFmt(s.cantidad) + ' u</div>' +
        '<div class="bc-m53-card-meta">' + esc(s.almacen || '—') +
        (s.minimo != null ? ' · mín ' + qtyFmt(s.minimo) : '') + valorTxt + '</div>' +
        '<span class="bc-m53-badge bc-m53-badge-' + meta.cls + '">' + esc(meta.label) + '</span>' +
        '</article>';
    }).join('');

    if (pag) {
      pag.innerHTML = '';
      const totalPages = Math.max(1, Math.ceil(_filtered.length / PAGE_SIZE));
      if (_page > 0) {
        const ant = document.createElement('button');
        ant.type = 'button';
        ant.className = 'bc-m53-btn';
        ant.textContent = '← Anterior';
        ant.addEventListener('click', function () { _page--; paintListOnly(); });
        pag.appendChild(ant);
      }
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'Página ' + (_page + 1) + ' de ' + totalPages + ' · ' + _filtered.length + ' registros';
      pag.appendChild(span);
      if (_page < totalPages - 1) {
        const sig = document.createElement('button');
        sig.type = 'button';
        sig.className = 'bc-m53-btn';
        sig.textContent = 'Siguiente →';
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
      const res = await client.rpc('inventario_enriquecido', { p_almacen_id: almacen });
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
      _allRows = Array.isArray(res.data) ? res.data : [];
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
