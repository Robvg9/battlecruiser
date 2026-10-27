// BattleCruiser — M51.1: Centro profesional de trazabilidad (Movimientos)
// Única autoridad visual de #tab-movimientos. Reutiliza RPC movimientos_producto.
(function () {
  'use strict';
  if (window.__bcM51Movimientos) return;
  window.__bcM51Movimientos = true;

  const STYLE_ID = 'bc-m51-movimientos-css';
  const PAGE_SIZE = 40;
  const FETCH_LIMIT = 500;
  const BUSINESS_TIME_ZONE = 'America/Havana';

  let _viewMode = 'today';
  let _expandedHistoryDays = new Set();
  let _allRows = [];
  let _filtered = [];
  let _page = 0;
  let _search = '';
  let _selected = null;
  let _loading = false;
  let _lastError = null;

  const TIPO_META = {
    compra: { label: 'Compra', badge: 'entrada', short: 'Entrada' },
    venta: { label: 'Venta', badge: 'salida', short: 'Salida' },
    transferencia_salida: { label: 'Transferencia de salida', badge: 'transf', short: 'Transf. salida' },
    transferencia_entrada: { label: 'Transferencia de entrada', badge: 'transf', short: 'Transf. entrada' },
    vale: { label: 'Vale de salida', badge: 'vale', short: 'Vale' },
    ajuste: { label: 'Ajuste', badge: 'ajuste', short: 'Ajuste' }
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c];
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
  function fechaHoraFmt(f) {
    if (typeof window.fechaHora === 'function') return window.fechaHora(f);
    if (!f) return '—';
    try {
      const d = new Date(f);
      return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return String(f);
    }
  }
  function fechaHoyNegocio() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const p = {};
    parts.forEach(function (x) { if (x.type !== 'literal') p[x.type] = x.value; });
    return String(p.year) + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
  }

  function fechaGrupoKey(f) {
    if (!f) return 'sin-fecha';
    try {
      const d = new Date(f);
      if (Number.isNaN(d.getTime())) return 'sin-fecha';
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(d);
      const p = {};
      parts.forEach(function (x) { if (x.type !== 'literal') p[x.type] = x.value; });
      return String(p.year) + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
    } catch (_) {
      return 'sin-fecha';
    }
  }
  function fechaGrupoLabel(key) {
    if (key === 'sin-fecha') return 'Sin fecha';
    try {
      const parts = key.split('-').map(Number);
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      return dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    } catch (_) {
      return key;
    }
  }
  function normalizarTipo(t) {
    return String(t || '').toLowerCase().trim();
  }
  function metaTipo(t) {
    const k = normalizarTipo(t);
    return TIPO_META[k] || { label: t || '—', badge: 'otro', short: t || '—' };
  }
  function absCant(c) {
    return Math.abs(num(c));
  }
  function esEntrada(m) {
    const t = normalizarTipo(m.tipo);
    if (t === 'compra' || t === 'transferencia_entrada') return true;
    if (t === 'venta' || t === 'transferencia_salida' || t === 'vale') return false;
    return num(m.cantidad) > 0;
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#tab-movimientos.bc-m51{max-width:1100px}',
      '#tab-movimientos.bc-m51 .bc-m51-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(212,176,92,.14)}',
      "#tab-movimientos.bc-m51 .bc-m51-hero h3{margin:0;font-family:'Cormorant Garamond',serif;font-size:1.85rem;line-height:1.1;color:var(--text)}",
      '#tab-movimientos.bc-m51 .bc-m51-hero p{margin:4px 0 0;color:var(--mist);font-size:.8rem}',
      '#tab-movimientos.bc-m51 .bc-m51-status{font-size:.72rem;color:var(--mist);white-space:nowrap}',
      '#tab-movimientos.bc-m51 .bc-m51-view-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 12px;padding:12px;border:1px solid rgba(212,176,92,.14);border-radius:10px;background:rgba(18,42,36,.5);min-width:0;box-sizing:border-box}',
      '#tab-movimientos.bc-m51 .bc-m51-view-copy{min-width:0;display:flex;flex-direction:column;gap:3px}',
      '#tab-movimientos.bc-m51 .bc-m51-view-copy strong{font-size:.84rem;color:var(--text)}',
      '#tab-movimientos.bc-m51 .bc-m51-view-copy span{font-size:.72rem;color:var(--mist);line-height:1.4}',
      '#tab-movimientos.bc-m51 .bc-m51-view-actions{display:flex;flex-wrap:wrap;gap:7px;min-width:0}',
      '#tab-movimientos.bc-m51 .bc-m51-view-btn{min-height:38px;max-width:100%;min-width:0;padding:8px 12px;border-radius:7px;border:1px solid var(--gold-dim);background:var(--stone-2);color:var(--mist);font-size:.75rem;font-weight:700;overflow-wrap:anywhere}',
      '#tab-movimientos.bc-m51 .bc-m51-view-btn[aria-pressed="true"]{background:rgba(212,176,92,.12);border-color:var(--gold);color:var(--gold-bright)}',
      '#tab-movimientos.bc-m51 .bc-m51-group-collapsible{border:1px solid rgba(212,176,92,.13);border-radius:9px;overflow:hidden;margin:0 0 12px}',
      '#tab-movimientos.bc-m51 .bc-m51-group-collapsible>.bc-m51-group-head{cursor:pointer;list-style:none;padding:10px 12px;margin:0;background:rgba(212,176,92,.045)}',
      '#tab-movimientos.bc-m51 .bc-m51-group-collapsible>.bc-m51-group-head::-webkit-details-marker{display:none}',
      '#tab-movimientos.bc-m51 .bc-m51-group-collapsible>.bc-m51-group-head:after{content:"＋";float:right;color:var(--gold)}',
      '#tab-movimientos.bc-m51 .bc-m51-group-collapsible[open]>.bc-m51-group-head:after{content:"−"}',
      '#tab-movimientos.bc-m51 .bc-m51-group-collapsible>.bc-m51-card{margin:8px;border-radius:8px}',
      '@media(max-width:640px){#tab-movimientos.bc-m51 .bc-m51-view-switch{align-items:stretch;flex-direction:column}#tab-movimientos.bc-m51 .bc-m51-view-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}#tab-movimientos.bc-m51 .bc-m51-view-btn{width:100%;box-sizing:border-box}}',
      '#tab-movimientos.bc-m51 .bc-m51-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:14px}',
      '#tab-movimientos.bc-m51 .bc-m51-metric{min-width:0;padding:11px 12px;background:linear-gradient(180deg,rgba(26,56,48,.55),rgba(18,42,36,.88));border:1px solid rgba(212,176,92,.12);border-radius:10px}',
      '#tab-movimientos.bc-m51 .bc-m51-metric-label{font-size:.65rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mist)}',
      '#tab-movimientos.bc-m51 .bc-m51-metric-value{margin-top:4px;font-size:1.2rem;font-weight:700;color:var(--text);line-height:1.1}',
      '#tab-movimientos.bc-m51 .bc-m51-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.2fr) auto auto;gap:8px;align-items:end;margin-bottom:10px;padding:12px;background:rgba(8,20,17,.65);border:1px solid rgba(212,176,92,.12);border-radius:12px}',
      '#tab-movimientos.bc-m51 .bc-m51-filter label{display:block;font-size:.65rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mist);margin-bottom:4px}',
      '#tab-movimientos.bc-m51 .bc-m51-filter input,#tab-movimientos.bc-m51 .bc-m51-filter select{width:100%;min-width:0;box-sizing:border-box;height:38px;padding:0 10px;background:var(--void);border:1px solid rgba(212,176,92,.2);border-radius:6px;color:var(--text);font-size:13px}',
      '#tab-movimientos.bc-m51 .bc-m51-filter input:focus,#tab-movimientos.bc-m51 .bc-m51-filter select:focus{outline:none;border-color:var(--gold-dim);box-shadow:0 0 0 3px rgba(212,176,92,.14)}',
      '#tab-movimientos.bc-m51 .bc-m51-btn{height:38px;padding:0 14px;white-space:nowrap;background:var(--stone-2);color:var(--text);border:1px solid var(--gold-dim);border-radius:6px;font-size:12.5px;cursor:pointer}',
      '#tab-movimientos.bc-m51 .bc-m51-btn:hover{border-color:var(--gold)}',
      '#tab-movimientos.bc-m51 .bc-m51-btn-primary{background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#211605;border:none;font-weight:600}',
      '#tab-movimientos.bc-m51 .bc-m51-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}',
      '#tab-movimientos.bc-m51 .bc-m51-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(212,176,92,.1);border:1px solid rgba(212,176,92,.22);font-size:.72rem;color:var(--text)}',
      '#tab-movimientos.bc-m51 .bc-m51-chip button{background:none;border:none;color:var(--mist);cursor:pointer;padding:0 2px;font-size:14px;line-height:1}',
      '#tab-movimientos.bc-m51 .bc-m51-chip button:hover{color:var(--wine)}',
      '#tab-movimientos.bc-m51 .bc-m51-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:0;position:relative}',
      '#tab-movimientos.bc-m51.bc-m51-detail-open .bc-m51-layout{grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:12px}',
      '#tab-movimientos.bc-m51 .bc-m51-list{min-width:0}',
      '#tab-movimientos.bc-m51 .bc-m51-group{margin-bottom:16px}',
      '#tab-movimientos.bc-m51 .bc-m51-group-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(212,176,92,.1)}',
      "#tab-movimientos.bc-m51 .bc-m51-group-title{font-family:'Cormorant Garamond',serif;font-size:1rem;color:var(--gold-bright);letter-spacing:.04em}",
      "#tab-movimientos.bc-m51 .bc-m51-group-count{font-size:.7rem;color:var(--mist);font-family:'IBM Plex Mono',monospace}",
      '#tab-movimientos.bc-m51 .bc-m51-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;padding:12px 14px;margin-bottom:7px;background:rgba(255,255,255,.018);border:1px solid rgba(255,255,255,.05);border-radius:10px;cursor:pointer;transition:border-color .12s,background .12s}',
      '#tab-movimientos.bc-m51 .bc-m51-card:hover,#tab-movimientos.bc-m51 .bc-m51-card.is-selected{border-color:rgba(212,176,92,.28);background:rgba(212,176,92,.05)}',
      '#tab-movimientos.bc-m51 .bc-m51-card-title{font-size:.88rem;font-weight:600;color:var(--text);line-height:1.25;margin:0}',
      '#tab-movimientos.bc-m51 .bc-m51-card-tipo{display:inline-flex;align-items:center;gap:5px;margin-top:4px;font-size:.72rem;color:var(--mist)}',
      '#tab-movimientos.bc-m51 .bc-m51-badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:.65rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase}',
      '#tab-movimientos.bc-m51 .bc-m51-badge-entrada{background:rgba(159,196,173,.15);color:var(--sage)}',
      '#tab-movimientos.bc-m51 .bc-m51-badge-salida{background:rgba(196,74,90,.15);color:#e88a96}',
      '#tab-movimientos.bc-m51 .bc-m51-badge-transf{background:rgba(212,176,92,.12);color:var(--gold-bright)}',
      '#tab-movimientos.bc-m51 .bc-m51-badge-vale{background:rgba(143,134,112,.18);color:var(--mist)}',
      '#tab-movimientos.bc-m51 .bc-m51-badge-ajuste,#tab-movimientos.bc-m51 .bc-m51-badge-otro{background:rgba(255,255,255,.06);color:var(--mist)}',
      '#tab-movimientos.bc-m51 .bc-m51-card-meta{margin-top:6px;font-size:.75rem;color:var(--mist);line-height:1.4}',
      '#tab-movimientos.bc-m51 .bc-m51-card-qty{text-align:right;font-weight:700;font-size:.95rem;color:var(--text);white-space:nowrap}',
      '#tab-movimientos.bc-m51 .bc-m51-card-side{text-align:right;display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:6px}',
      '#tab-movimientos.bc-m51 .bc-m51-card-user{font-size:.7rem;color:var(--mist-dim)}',
      '#tab-movimientos.bc-m51 .bc-m51-card-chev{color:var(--gold-dim);font-size:14px}',
      '#tab-movimientos.bc-m51 .bc-m51-drawer{display:none;min-width:0;background:rgba(8,20,17,.75);border:1px solid rgba(212,176,92,.14);border-radius:12px;padding:14px;max-height:calc(100vh - 160px);overflow-y:auto;position:sticky;top:12px}',
      '#tab-movimientos.bc-m51.bc-m51-detail-open .bc-m51-drawer{display:block}',
      '#tab-movimientos.bc-m51 .bc-m51-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(212,176,92,.12)}',
      "#tab-movimientos.bc-m51 .bc-m51-drawer-head h4{margin:0;font-family:'Cormorant Garamond',serif;font-size:1.15rem;color:var(--gold-bright)}",
      '#tab-movimientos.bc-m51 .bc-m51-drawer-close{background:none;border:1px solid rgba(212,176,92,.2);border-radius:6px;color:var(--mist);width:32px;height:32px;cursor:pointer;font-size:16px}',
      '#tab-movimientos.bc-m51 .bc-m51-drawer-close:hover{border-color:var(--gold);color:var(--text)}',
      '#tab-movimientos.bc-m51 .bc-m51-section{margin-bottom:14px}',
      "#tab-movimientos.bc-m51 .bc-m51-section h5{margin:0 0 8px;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mist);font-family:'IBM Plex Mono',monospace}",
      '#tab-movimientos.bc-m51 .bc-m51-field{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.8rem}',
      '#tab-movimientos.bc-m51 .bc-m51-field-label{color:var(--mist)}',
      '#tab-movimientos.bc-m51 .bc-m51-field-value{color:var(--text);text-align:right;font-weight:500;word-break:break-word}',
      '#tab-movimientos.bc-m51 .bc-m51-empty,#tab-movimientos.bc-m51 .bc-m51-error,#tab-movimientos.bc-m51 .bc-m51-loading{padding:28px 12px;text-align:center;color:var(--mist);font-size:.8rem}',
      '#tab-movimientos.bc-m51 .bc-m51-error{color:var(--wine)}',
      '#tab-movimientos.bc-m51 .bc-m51-pag{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding:12px 0 4px}',
      '#tab-movimientos.bc-m51 .bc-m51-pag .muted{font-size:.72rem}',
      '@media(max-width:980px){#tab-movimientos.bc-m51 .bc-m51-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}#tab-movimientos.bc-m51 .bc-m51-filters{grid-template-columns:repeat(2,minmax(0,1fr))}#tab-movimientos.bc-m51.bc-m51-detail-open .bc-m51-layout{grid-template-columns:1fr}#tab-movimientos.bc-m51 .bc-m51-drawer{position:static;max-height:none}}',
      '@media(max-width:640px){#tab-movimientos.bc-m51 .bc-m51-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#tab-movimientos.bc-m51 .bc-m51-filters{grid-template-columns:1fr}#tab-movimientos.bc-m51 .bc-m51-btn{width:100%}#tab-movimientos.bc-m51 .bc-m51-card{grid-template-columns:1fr}#tab-movimientos.bc-m51 .bc-m51-card-side{flex-direction:row;align-items:center;justify-content:space-between;text-align:left}}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureShell() {
    const tab = document.getElementById('tab-movimientos');
    if (!tab) return null;
    injectCss();
    tab.classList.add('bc-m51');

    let hero = tab.querySelector('.bc-m51-hero');
    if (!hero) {
      const oldHead = tab.querySelector('.pendientes-header');
      const oldIntro = tab.querySelector(':scope > p.muted');
      hero = document.createElement('div');
      hero.className = 'bc-m51-hero';
      hero.innerHTML = '<div><h3>Movimientos de inventario</h3><p>Trazabilidad: qué entró, qué salió, quién, cuándo y a qué costo.</p></div><span class="bc-m51-status" id="mov-conn-info"></span>';
      if (oldHead) {
        const conn = oldHead.querySelector('#mov-conn-info');
        if (conn) hero.querySelector('#mov-conn-info').textContent = conn.textContent || '';
        oldHead.replaceWith(hero);
      } else tab.prepend(hero);
      if (oldIntro) oldIntro.remove();
    }

    if (!tab.querySelector('.bc-m51-metrics')) {
      const metrics = document.createElement('div');
      metrics.className = 'bc-m51-metrics';
      metrics.id = 'mov-resumen-m51';
      metrics.innerHTML = '<div class="bc-m51-loading">Cargando resumen…</div>';
      hero.after(metrics);
    }

    let viewSwitch = tab.querySelector('.bc-m51-view-switch');
    if (!viewSwitch) {
      viewSwitch = document.createElement('div');
      viewSwitch.className = 'bc-m51-view-switch';
      viewSwitch.innerHTML = '<div class="bc-m51-view-copy"><strong id="mov-view-title">Movimientos de hoy</strong><span id="mov-view-description">La pantalla principal solo muestra la actividad de hoy.</span></div><div class="bc-m51-view-actions" role="group" aria-label="Tipo de vista"><button type="button" id="mov-view-today" class="bc-m51-view-btn" aria-pressed="true">Movimientos de hoy</button><button type="button" id="mov-view-history" class="bc-m51-view-btn" aria-pressed="false">Historial</button></div>';
      hero.after(viewSwitch);
    }

    let filters = tab.querySelector('.bc-m51-filters');
    if (!filters) {
      const old = tab.querySelector('.mando-filtros');
      filters = document.createElement('div');
      filters.className = 'bc-m51-filters';
      filters.id = 'mov-filtros-m51';

      const desde = document.getElementById('mov-filtro-desde') || document.createElement('input');
      desde.type = 'date'; desde.id = 'mov-filtro-desde';
      const hasta = document.getElementById('mov-filtro-hasta') || document.createElement('input');
      hasta.type = 'date'; hasta.id = 'mov-filtro-hasta';
      const almacen = document.getElementById('mov-filtro-almacen') || document.createElement('select');
      almacen.id = 'mov-filtro-almacen';
      if (!almacen.querySelector('option')) {
        const o = document.createElement('option'); o.value = ''; o.textContent = 'Todos los almacenes'; almacen.appendChild(o);
      }
      const tipo = document.getElementById('mov-filtro-tipo') || document.createElement('select');
      tipo.id = 'mov-filtro-tipo';
      tipo.innerHTML = '<option value="">Todos los tipos</option><option value="compra">Compra</option><option value="venta">Venta</option><option value="transferencia_salida">Transf. salida</option><option value="transferencia_entrada">Transf. entrada</option><option value="vale">Vale</option>';

      const buscar = document.createElement('input');
      buscar.type = 'search'; buscar.id = 'mov-buscar';
      buscar.placeholder = 'Buscar producto, usuario, referencia o movimiento…'; buscar.autocomplete = 'off';

      function wrap(label, el) {
        const d = document.createElement('div'); d.className = 'bc-m51-filter';
        const lab = document.createElement('label'); lab.textContent = label;
        if (el.id) lab.setAttribute('for', el.id);
        d.appendChild(lab); d.appendChild(el); return d;
      }
      filters.appendChild(wrap('Desde', desde));
      filters.appendChild(wrap('Hasta', hasta));
      filters.appendChild(wrap('Almacén', almacen));
      filters.appendChild(wrap('Tipo', tipo));
      filters.appendChild(wrap('Buscar', buscar));

      const btnAplicar = document.createElement('button');
      btnAplicar.type = 'button'; btnAplicar.id = 'mov-refrescar-btn';
      btnAplicar.className = 'bc-m51-btn bc-m51-btn-primary'; btnAplicar.textContent = 'Generar';
      filters.appendChild(btnAplicar);

      const btnLimpiar = document.createElement('button');
      btnLimpiar.type = 'button'; btnLimpiar.id = 'mov-limpiar-btn';
      btnLimpiar.className = 'bc-m51-btn'; btnLimpiar.textContent = 'Limpiar';
      filters.appendChild(btnLimpiar);

      if (old) old.replaceWith(filters);
      else tab.querySelector('.bc-m51-metrics').after(filters);
    }

    if (!tab.dataset.m51DateModeReady) {
      const from = document.getElementById('mov-filtro-desde');
      const to = document.getElementById('mov-filtro-hasta');
      const today = fechaHoyNegocio();
      if (from && to && !from.value && !to.value) {
        from.value = today;
        to.value = today;
        _viewMode = 'today';
      } else {
        _viewMode = from && to && from.value === today && to.value === today ? 'today' : 'history';
      }
      tab.dataset.m51DateModeReady = '1';
    }
    syncViewSwitch();

    if (!tab.querySelector('.bc-m51-chips')) {
      const chips = document.createElement('div');
      chips.className = 'bc-m51-chips'; chips.id = 'mov-chips-m51';
      filters.after(chips);
    }

    let layout = tab.querySelector('.bc-m51-layout');
    if (!layout) {
      layout = document.createElement('div');
      layout.className = 'bc-m51-layout';
      const list = document.createElement('div');
      list.className = 'bc-m51-list'; list.id = 'mov-detalle';
      const oldList = tab.querySelector('#mov-detalle');
      if (oldList && oldList !== list) oldList.replaceWith(list);
      if (list.parentNode !== layout) layout.appendChild(list);

      const drawer = document.createElement('aside');
      drawer.className = 'bc-m51-drawer'; drawer.id = 'mov-drawer-m51';
      drawer.setAttribute('aria-label', 'Detalle del movimiento');
      drawer.innerHTML = '<div class="bc-m51-drawer-head"><h4>Detalle del movimiento</h4><button type="button" class="bc-m51-drawer-close" id="mov-drawer-close" aria-label="Cerrar">×</button></div><div id="mov-drawer-body"></div>';
      layout.appendChild(drawer);

      const chips = tab.querySelector('.bc-m51-chips');
      if (chips) chips.after(layout); else filters.after(layout);

      let pag = tab.querySelector('#mov-paginacion');
      if (pag) { pag.classList.add('bc-m51-pag'); list.after(pag); }
      else {
        pag = document.createElement('div');
        pag.id = 'mov-paginacion'; pag.className = 'bc-m51-pag mando-paginacion';
        list.after(pag);
      }
    }
    return tab;
  }

  function syncViewSwitch() {
    const todayButton = document.getElementById('mov-view-today');
    const historyButton = document.getElementById('mov-view-history');
    const title = document.getElementById('mov-view-title');
    const description = document.getElementById('mov-view-description');
    const today = _viewMode === 'today';
    if (todayButton) todayButton.setAttribute('aria-pressed', today ? 'true' : 'false');
    if (historyButton) historyButton.setAttribute('aria-pressed', today ? 'false' : 'true');
    if (title) title.textContent = today ? 'Movimientos de hoy' : 'Historial de movimientos';
    if (description) description.textContent = today
      ? 'Solo la actividad del día actual en Cuba. Los días anteriores quedan en Historial.'
      : 'Consulta días anteriores con los filtros de fecha, almacén y tipo. Cada fecha se muestra en un grupo plegable.';
  }

  function cambiarVista(mode) {
    const tab = document.getElementById('tab-movimientos');
    const from = document.getElementById('mov-filtro-desde');
    const to = document.getElementById('mov-filtro-hasta');
    _viewMode = mode === 'history' ? 'history' : 'today';
    if (_viewMode === 'today') {
      const today = fechaHoyNegocio();
      if (from) from.value = today;
      if (to) to.value = today;
    } else {
      if (from) from.value = '';
      if (to) to.value = '';
    }
    if (tab) tab.dataset.m51DateModeReady = '1';
    _page = 0;
    syncViewSwitch();
    cargarMovimientos();
  }

  function leerFiltros() {
    const desde = document.getElementById('mov-filtro-desde');
    const hasta = document.getElementById('mov-filtro-hasta');
    const almacen = document.getElementById('mov-filtro-almacen');
    const tipo = document.getElementById('mov-filtro-tipo');
    return {
      desde: desde && desde.value ? desde.value : null,
      hasta: hasta && hasta.value ? hasta.value : null,
      almacen: almacen && almacen.value ? almacen.value : null,
      tipo: tipo && tipo.value ? tipo.value : null
    };
  }

  function limpiarFiltrosUI() {
    ['mov-filtro-desde','mov-filtro-hasta','mov-filtro-almacen','mov-filtro-tipo','mov-buscar'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (_viewMode === 'today') {
      const today = fechaHoyNegocio();
      const from = document.getElementById('mov-filtro-desde');
      const to = document.getElementById('mov-filtro-hasta');
      if (from) from.value = today;
      if (to) to.value = today;
    }
    _search = ''; _page = 0; syncViewSwitch();
  }

  function renderChips() {
    const el = document.getElementById('mov-chips-m51');
    if (!el) return;
    const f = leerFiltros();
    const chips = [];
    if (f.desde || f.hasta) chips.push({ key: 'fecha', label: (f.desde || '…') + '–' + (f.hasta || '…') });
    if (f.almacen) {
      const sel = document.getElementById('mov-filtro-almacen');
      const opt = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : f.almacen;
      chips.push({ key: 'almacen', label: opt });
    }
    if (f.tipo) chips.push({ key: 'tipo', label: metaTipo(f.tipo).short });
    if (_search) chips.push({ key: 'search', label: '“' + _search + '”' });
    if (!chips.length) { el.innerHTML = ''; return; }
    el.innerHTML = chips.map(function (c) {
      return '<span class="bc-m51-chip" data-chip="' + esc(c.key) + '">' + esc(c.label) + ' <button type="button" aria-label="Quitar filtro">×</button></span>';
    }).join('') + '<button type="button" class="bc-m51-btn" id="mov-chips-clear" style="height:28px;padding:0 10px;font-size:11px">Limpiar filtros</button>';
  }

  function applySearchAndPage() {
    const q = (_search || '').toLowerCase().trim();
    if (!q) _filtered = _allRows.slice();
    else {
      _filtered = _allRows.filter(function (m) {
        const hay = [m.producto, m.usuario, m.tipo, m.almacen, m.operacion_id, metaTipo(m.tipo).label]
          .map(function (x) { return String(x == null ? '' : x).toLowerCase(); }).join(' ');
        return hay.indexOf(q) !== -1;
      });
    }
    const maxPage = Math.max(0, Math.ceil(_filtered.length / PAGE_SIZE) - 1);
    if (_page > maxPage) _page = maxPage;
  }

  function renderResumen() {
    const el = document.getElementById('mov-resumen-m51');
    if (!el) return;
    const rows = _filtered;
    const counts = { total: rows.length, entradas: 0, salidas: 0, transferencias: 0, compras: 0, ventas: 0 };
    rows.forEach(function (m) {
      const t = normalizarTipo(m.tipo);
      if (t === 'compra') { counts.compras++; counts.entradas++; }
      else if (t === 'venta') { counts.ventas++; counts.salidas++; }
      else if (t === 'transferencia_salida' || t === 'transferencia_entrada') {
        counts.transferencias++;
        if (t === 'transferencia_entrada') counts.entradas++; else counts.salidas++;
      } else if (t === 'vale') counts.salidas++;
      else if (esEntrada(m)) counts.entradas++;
      else counts.salidas++;
    });
    function card(label, value) {
      return '<div class="bc-m51-metric"><div class="bc-m51-metric-label">' + esc(label) + '</div><div class="bc-m51-metric-value">' + esc(String(value)) + '</div></div>';
    }
    el.innerHTML = card('Movimientos', counts.total) + card('Entradas', counts.entradas) + card('Salidas', counts.salidas) +
      card('Transferencias', counts.transferencias) + card('Compras', counts.compras) + card('Ventas', counts.ventas);
  }

  function renderLista() {
    const el = document.getElementById('mov-detalle');
    const pag = document.getElementById('mov-paginacion');
    if (!el) return;
    if (_loading) { el.innerHTML = '<div class="bc-m51-loading">Cargando movimientos…</div>'; if (pag) pag.innerHTML = ''; return; }
    if (_lastError) {
      el.innerHTML = '<div class="bc-m51-error">No pudimos cargar los movimientos.<br><button type="button" class="bc-m51-btn" id="mov-retry-btn" style="margin-top:10px">Reintentar</button></div>';
      if (pag) pag.innerHTML = ''; return;
    }
    if (!_filtered.length) {
      const hasF = !!(leerFiltros().desde || leerFiltros().hasta || leerFiltros().almacen || leerFiltros().tipo || _search);
      el.innerHTML = '<div class="bc-m51-empty"><strong>Sin movimientos</strong><br>No encontramos movimientos para los filtros seleccionados.' +
        (hasF ? '<br><button type="button" class="bc-m51-btn" id="mov-empty-clear" style="margin-top:10px">Limpiar filtros</button>' : '') + '</div>';
      if (pag) pag.innerHTML = ''; return;
    }

    const start = _page * PAGE_SIZE;
    const slice = _filtered.slice(start, start + PAGE_SIZE);
    const groups = []; const map = {};
    slice.forEach(function (m, idx) {
      const key = fechaGrupoKey(m.fecha);
      if (!map[key]) { map[key] = { key: key, items: [] }; groups.push(map[key]); }
      map[key].items.push({ m: m, globalIdx: start + idx });
    });

    let html = '';
    groups.forEach(function (g) {
      if (_viewMode === 'history') {
        const openAttr = _expandedHistoryDays.has(g.key) ? ' open' : '';
        html += '<details class="bc-m51-group bc-m51-group-collapsible" data-day="' + esc(g.key) + '"' + openAttr + '><summary class="bc-m51-group-head"><span class="bc-m51-group-title">' + esc(fechaGrupoLabel(g.key)) +
          '</span><span class="bc-m51-group-count">' + g.items.length + ' movimiento' + (g.items.length === 1 ? '' : 's') + '</span></summary>';
      } else {
        html += '<div class="bc-m51-group"><div class="bc-m51-group-head"><span class="bc-m51-group-title">' + esc(fechaGrupoLabel(g.key)) +
          '</span><span class="bc-m51-group-count">' + g.items.length + ' movimiento' + (g.items.length === 1 ? '' : 's') + '</span></div>';
      }
      g.items.forEach(function (entry) {
        const m = entry.m; const meta = metaTipo(m.tipo); const cant = absCant(m.cantidad);
        const sel = _selected && _selected.operacion_id === m.operacion_id && _selected.tipo === m.tipo &&
          String(_selected.fecha) === String(m.fecha) && _selected.producto === m.producto;
        html += '<article class="bc-m51-card' + (sel ? ' is-selected' : '') + '" data-idx="' + entry.globalIdx +
          '" role="button" tabindex="0"><div><h4 class="bc-m51-card-title">' + esc(m.producto || '—') +
          '</h4><div class="bc-m51-card-tipo"><span class="bc-m51-badge bc-m51-badge-' + esc(meta.badge) + '">' + esc(meta.short) +
          '</span></div><div class="bc-m51-card-meta">' + esc(m.almacen || '—') + ' · ' + fechaHoraFmt(m.fecha) +
          '</div></div><div class="bc-m51-card-side"><div class="bc-m51-card-qty">' + cant +
          ' u</div><div class="bc-m51-card-user">' + esc(m.usuario || '—') +
          ' <span class="bc-m51-card-chev">›</span></div></div></article>';
      });
      html += _viewMode === 'history' ? '</details>' : '</div>';
    });
    el.innerHTML = html;

    if (pag) {
      pag.innerHTML = '';
      const totalPages = Math.max(1, Math.ceil(_filtered.length / PAGE_SIZE));
      if (_page > 0) {
        const ant = document.createElement('button');
        ant.type = 'button'; ant.className = 'bc-m51-btn'; ant.textContent = '← Anterior';
        ant.addEventListener('click', function () { _page--; renderLista(); renderDrawer(); });
        pag.appendChild(ant);
      }
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'Página ' + (_page + 1) + ' de ' + totalPages + ' · ' + _filtered.length + ' registros';
      pag.appendChild(span);
      if (_page < totalPages - 1) {
        const sig = document.createElement('button');
        sig.type = 'button'; sig.className = 'bc-m51-btn'; sig.textContent = 'Siguiente →';
        sig.addEventListener('click', function () { _page++; renderLista(); renderDrawer(); });
        pag.appendChild(sig);
      }
    }
  }

  function renderDrawer() {
    const tab = document.getElementById('tab-movimientos');
    const body = document.getElementById('mov-drawer-body');
    if (!tab || !body) return;
    if (!_selected) { tab.classList.remove('bc-m51-detail-open'); body.innerHTML = ''; return; }
    tab.classList.add('bc-m51-detail-open');
    const m = _selected; const meta = metaTipo(m.tipo); const cant = absCant(m.cantidad);
    const dir = esEntrada(m) ? 'Entrada' : 'Salida';
    function field(label, value) {
      if (value == null || value === '') return '';
      return '<div class="bc-m51-field"><span class="bc-m51-field-label">' + esc(label) +
        '</span><span class="bc-m51-field-value">' + esc(String(value)) + '</span></div>';
    }
    let costos = '';
    if (m.costo_unitario != null && m.costo_unitario !== '') {
      costos = '<div class="bc-m51-section"><h5>Costos</h5>' +
        field('Costo unitario', '$' + moneyFmt(m.costo_unitario)) +
        field('Costo total', '$' + moneyFmt(num(m.costo_unitario) * cant)) + '</div>';
    }
    body.innerHTML = '<div class="bc-m51-section"><h5>Información general</h5>' +
      field('Producto', m.producto || '—') + field('Tipo', meta.label) + field('Dirección', dir) +
      field('Cantidad', cant + ' unidades') + field('Fecha/hora', fechaHoraFmt(m.fecha)) +
      field('Usuario', m.usuario || '—') + '</div>' +
      '<div class="bc-m51-section"><h5>Ubicación</h5>' + field('Almacén', m.almacen || '—') + '</div>' +
      costos +
      '<div class="bc-m51-section"><h5>Referencia</h5>' +
      field('ID operación', m.operacion_id || '—') + field('Tipo (código)', normalizarTipo(m.tipo)) + '</div>';
  }

  function paint() {
    ensureShell(); renderChips(); renderResumen(); renderLista(); renderDrawer();
  }

  async function cargarMovimientos() {
    ensureShell();
    const conn = document.getElementById('mov-conn-info');
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('reportes', 'ver')) {
      _allRows = []; _filtered = []; _lastError = null; _loading = false;
      const el = document.getElementById('mov-detalle');
      if (el) el.innerHTML = '<div class="bc-m51-empty">No tenés permiso para ver movimientos.</div>';
      const metrics = document.getElementById('mov-resumen-m51');
      if (metrics) metrics.innerHTML = '';
      return;
    }
    if (!navigator.onLine) {
      if (conn) conn.textContent = '⚪ Sin conexión — datos no disponibles';
      _allRows = []; _filtered = []; _lastError = null; _loading = false;
      const el = document.getElementById('mov-detalle');
      if (el) el.innerHTML = '<div class="bc-m51-empty">⚪ Sin conexión — los movimientos requieren datos de Supabase.</div>';
      return;
    }
    if (conn) conn.textContent = '🟢 Datos de Supabase';
    if (typeof window.poblarSelectAlmacenes === 'function') {
      window.poblarSelectAlmacenes(document.getElementById('mov-filtro-almacen'));
    }
    _loading = true; _lastError = null; _selected = null; paint();
    const f = leerFiltros();
    try {
      const client = window.client;
      if (!client) throw new Error('Cliente Supabase no disponible');
      const res = await client.rpc('movimientos_producto', {
        p_producto_id: null, p_almacen_id: f.almacen, p_desde: f.desde, p_hasta: f.hasta,
        p_tipo: f.tipo, p_limite: FETCH_LIMIT, p_offset: 0
      });
      if (res.error) {
        if (typeof window.esRpcFaltante === 'function' && window.esRpcFaltante(res.error)) {
          _lastError = 'rpc_missing';
          const el = document.getElementById('mov-detalle');
          if (el) el.innerHTML = '<div class="bc-m51-error">Falta aplicar función movimientos_producto en Supabase.</div>';
        } else {
          _lastError = String(res.error.message || res.error.code || res.error);
        }
        _allRows = []; _filtered = []; _loading = false; paint(); return;
      }
      _allRows = Array.isArray(res.data) ? res.data : [];
      _page = 0; applySearchAndPage(); _loading = false; _lastError = null; paint();
    } catch (e) {
      console.warn('[BattleCruiser] M51 movimientos_producto:', e);
      _lastError = String(e && e.message ? e.message : e);
      _allRows = []; _filtered = []; _loading = false; paint();
    }
  }

  function installHooks() {
    window.refrescarMovimientos = function () { return cargarMovimientos(); };
    window.refrescarMovimientos.__m51 = true;
    window.renderMovimientos = function (filas) {
      _allRows = Array.isArray(filas) ? filas : [];
      _page = 0; applySearchAndPage(); _loading = false; _lastError = null; paint();
    };
  }

  function bindEvents() {
    const tab = document.getElementById('tab-movimientos');
    if (!tab || tab.dataset.m51Bound) return;
    tab.dataset.m51Bound = '1';
    tab.addEventListener('toggle', function (e) {
      const group = e.target;
      if (!group || !group.matches || !group.matches('.bc-m51-group-collapsible')) return;
      const day = group.getAttribute('data-day');
      if (!day) return;
      if (group.open) _expandedHistoryDays.add(day);
      else _expandedHistoryDays.delete(day);
    }, true);
    tab.addEventListener('click', function (e) {
      if (e.target.closest('#mov-view-today')) { cambiarVista('today'); return; }
      if (e.target.closest('#mov-view-history')) { cambiarVista('history'); return; }
      if (e.target.closest('#mov-retry-btn, #mov-empty-clear')) {
        if (e.target.closest('#mov-empty-clear')) limpiarFiltrosUI();
        cargarMovimientos(); return;
      }
      if (e.target.closest('#mov-chips-clear')) { limpiarFiltrosUI(); cargarMovimientos(); return; }
      const chipBtn = e.target.closest('.bc-m51-chip button');
      if (chipBtn) {
        const chip = chipBtn.closest('.bc-m51-chip');
        const key = chip && chip.getAttribute('data-chip');
        if (key === 'fecha') {
          const d = document.getElementById('mov-filtro-desde'); const h = document.getElementById('mov-filtro-hasta');
          if (d) d.value = ''; if (h) h.value = '';
        } else if (key === 'almacen') { const a = document.getElementById('mov-filtro-almacen'); if (a) a.value = ''; }
        else if (key === 'tipo') { const t = document.getElementById('mov-filtro-tipo'); if (t) t.value = ''; }
        else if (key === 'search') { const b = document.getElementById('mov-buscar'); if (b) b.value = ''; _search = ''; }
        _page = 0;
        if (key === 'search') { applySearchAndPage(); paint(); } else cargarMovimientos();
        return;
      }
      if (e.target.closest('#mov-drawer-close')) { _selected = null; renderDrawer(); renderLista(); return; }
      if (e.target.closest('#mov-refrescar-btn')) {
        _page = 0;
        const b = document.getElementById('mov-buscar');
        _search = b ? b.value.trim() : '';
        cargarMovimientos(); return;
      }
      if (e.target.closest('#mov-limpiar-btn')) { limpiarFiltrosUI(); cargarMovimientos(); return; }
      const card = e.target.closest('.bc-m51-card[data-idx]');
      if (card) {
        const idx = Number(card.getAttribute('data-idx'));
        _selected = _filtered[idx] || null;
        renderLista(); renderDrawer();
      }
    });
    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.bc-m51-card[data-idx]');
      if (!card) return;
      e.preventDefault();
      const idx = Number(card.getAttribute('data-idx'));
      _selected = _filtered[idx] || null;
      renderLista(); renderDrawer();
    });
    tab.addEventListener('change', function (e) {
      if (e.target && (e.target.id === 'mov-filtro-desde' || e.target.id === 'mov-filtro-hasta')) {
        const from = document.getElementById('mov-filtro-desde');
        const to = document.getElementById('mov-filtro-hasta');
        const today = fechaHoyNegocio();
        _viewMode = from && to && from.value === today && to.value === today ? 'today' : 'history';
        syncViewSwitch();
      }
    });
    tab.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'mov-buscar') {
        _search = e.target.value.trim(); _page = 0; applySearchAndPage(); paint();
      }
    });
  }

  function boot() {
    ensureShell(); installHooks(); bindEvents();
    const tab = document.getElementById('tab-movimientos');
    if (tab && tab.classList.contains('visible')) cargarMovimientos();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(function () { ensureShell(); installHooks(); bindEvents(); }, 400);
  setTimeout(function () { installHooks(); }, 1200);
})();
