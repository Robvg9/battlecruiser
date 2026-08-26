// BattleCruiser — Misión D / Stock bajo + reposición interna
// vD.10 — Super Misión F6/F7: botón en Inventario → modal (sin bloque permanente).
// Reutiliza: listar_stock_bajo_reposicion (RPC) o análisis local; irATab(transferencias).
// NO crea RPC nuevas ni duplica transferencias.
(function () {
  'use strict';
  if (window.__BC_MISION_D_STOCK__) return;
  window.__BC_MISION_D_STOCK__ = true;

  var STYLE_ID = 'bc-mision-d-style';
  var MODAL_ID = 'bc-stock-bajo-modal';
  var BTN_ID = 'bc-stock-bajo-btn';
  var filtro = 'todos';
  var cargando = false;
  var rowsCache = [];

  function esc(v) {
    if (typeof escHtml === 'function') return escHtml(v == null ? '' : String(v));
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }
  function n(v) { return Number(v) || 0; }
  function moneyLocal(v) {
    return typeof money === 'function' ? money(v) : n(v).toLocaleString('es-ES');
  }
  function labelTipo(t) {
    var s = String(t || '').toLowerCase();
    if (s === 'mayorista') return 'Mayorista';
    if (s === 'almacenamiento') return 'Almacenamiento';
    if (s === 'venta' || s === 'minorista') return 'Minorista';
    return t || '—';
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + BTN_ID + '{font-weight:600;white-space:nowrap}',
      '#' + MODAL_ID + '{position:fixed;inset:0;z-index:10030;display:none;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box}',
      '#' + MODAL_ID + '.open{display:flex}',
      '@media(min-width:720px){#' + MODAL_ID + '{align-items:center;padding:24px}}',
      '#' + MODAL_ID + ' .bc-sb-backdrop{position:absolute;inset:0;background:rgba(6,14,11,.72);backdrop-filter:blur(3px)}',
      '#' + MODAL_ID + ' .bc-sb-panel{position:relative;z-index:1;width:100%;max-width:920px;max-height:min(92vh,820px);overflow:hidden;display:flex;flex-direction:column;',
      'background:linear-gradient(180deg,var(--stone-2,var(--stone)),var(--stone));border:1px solid rgba(201,162,77,.28);border-radius:16px;',
      'box-shadow:0 24px 64px rgba(0,0,0,.55);color:var(--text)}',
      '#' + MODAL_ID + ' .bc-sb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(201,162,77,.14);flex-shrink:0}',
      '#' + MODAL_ID + ' .bc-sb-head h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.35rem;font-weight:600;color:var(--gold-bright,var(--gold))}',
      '#' + MODAL_ID + ' .bc-sb-head p{margin:4px 0 0;font-size:12.5px;color:var(--mist);line-height:1.4;max-width:520px}',
      '#' + MODAL_ID + ' .bc-sb-close{width:36px;height:36px;border-radius:8px;border:1px solid rgba(201,162,77,.28);background:rgba(201,162,77,.08);color:var(--text);cursor:pointer;font-size:20px;line-height:1;flex-shrink:0}',
      '#' + MODAL_ID + ' .bc-sb-body{padding:14px 18px;overflow-y:auto;flex:1;min-height:0}',
      '#' + MODAL_ID + ' .bc-sb-filtros{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:12px}',
      '#' + MODAL_ID + ' .bc-sb-filtros label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:600;color:var(--mist)}',
      '#' + MODAL_ID + ' .bc-sb-filtros select{min-width:150px;padding:8px 10px;border-radius:8px;border:1px solid rgba(201,162,77,.22);background:var(--void);color:var(--text);font-size:13px}',
      '#' + MODAL_ID + ' .bc-sb-estados{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}',
      '#' + MODAL_ID + ' .bc-sb-estados button{font-weight:600;font-size:12px}',
      '#' + MODAL_ID + ' .bc-sb-estados button.active{outline:2px solid var(--gold,#c9a24d)}',
      '#' + MODAL_ID + ' .bc-sb-row{display:grid;grid-template-columns:minmax(140px,1.3fr) repeat(3,minmax(64px,.65fr)) minmax(130px,1.1fr) auto;gap:10px;align-items:center;',
      'padding:12px;border:1px solid rgba(201,162,77,.18);border-radius:10px;margin-bottom:8px;background:rgba(12,28,24,.5)}',
      '#' + MODAL_ID + ' .bc-sb-name{font-weight:700;font-size:13.5px}',
      '#' + MODAL_ID + ' .bc-sb-meta{font-size:11.5px;color:var(--mist)}',
      '#' + MODAL_ID + ' .bc-sb-ok{font-weight:700;color:#9dcc9a}',
      '#' + MODAL_ID + ' .bc-sb-no{font-weight:700;color:#e8a0a0}',
      '#' + MODAL_ID + ' .bc-sb-zero{font-weight:800;color:var(--wine,#c45)}',
      '#' + MODAL_ID + ' .bc-sb-empty{padding:20px;border:1px dashed rgba(201,162,77,.25);border-radius:10px;color:var(--mist);text-align:center}',
      '#' + MODAL_ID + ' .bc-sb-reponer{white-space:nowrap;font-weight:700;padding:8px 12px;border-radius:8px;cursor:pointer}',
      '#' + MODAL_ID + ' .bc-sb-reponer:disabled{opacity:.45;cursor:not-allowed}',
      '#' + MODAL_ID + ' .bc-sb-msg{min-height:18px;font-size:12.5px;margin:8px 0 0}',
      '#' + MODAL_ID + ' .bc-sb-foot{padding:12px 18px;border-top:1px solid rgba(201,162,77,.12);display:flex;justify-content:flex-end;flex-shrink:0}',
      '@media(max-width:700px){#' + MODAL_ID + ' .bc-sb-row{grid-template-columns:1fr 1fr}#' + MODAL_ID + ' .bc-sb-row .bc-sb-name{grid-column:1/-1}}',
      '#bc-stock-reposicion{display:none!important}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    var inv = document.getElementById('tab-inventario');
    if (!inv) return;
    var filtros = inv.querySelector('.mando-filtros');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = 'cc-accion';
    btn.textContent = 'Stock bajo';
    btn.title = 'Ver productos bajo mínimo y reposición interna';
    if (filtros) {
      filtros.appendChild(btn);
    } else {
      var header = inv.querySelector('.pendientes-header');
      if (header) header.appendChild(btn);
      else inv.insertBefore(btn, inv.firstChild);
    }
    btn.addEventListener('click', function () {
      openModal();
    });
  }

  function ensureModal() {
    var root = document.getElementById(MODAL_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = MODAL_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'bc-sb-title');
    root.innerHTML =
      '<div class="bc-sb-backdrop" data-bc-sb-close="1"></div>' +
      '<div class="bc-sb-panel">' +
      '<div class="bc-sb-head">' +
      '<div><h3 id="bc-sb-title">Stock bajo / Reposición interna</h3>' +
      '<p>Faltantes en puntos de venta y existencia en almacenes de <strong>almacenamiento</strong> para mover internamente (no es compra a proveedor).</p></div>' +
      '<button type="button" class="bc-sb-close" data-bc-sb-close="1" aria-label="Cerrar">×</button>' +
      '</div>' +
      '<div class="bc-sb-body">' +
      '<div class="bc-sb-filtros">' +
      '<label>Destino (punto de venta)<select id="bc-sb-destino">' +
      '<option value="">Todos</option>' +
      '<option value="minorista">Minoristas</option>' +
      '<option value="mayorista">Mayoristas</option>' +
      '</select></label>' +
      '<label>Solo con reposición posible<select id="bc-sb-solo-rep">' +
      '<option value="">No filtrar</option>' +
      '<option value="1">Sí — hay stock en almacenamiento</option>' +
      '</select></label>' +
      '<button type="button" id="bc-sb-refrescar" class="cc-accion">Refrescar</button>' +
      '</div>' +
      '<div class="bc-sb-estados" role="group" aria-label="Filtros de stock bajo">' +
      '<button type="button" class="cc-accion active" data-sb-filter="todos">Todos</button>' +
      '<button type="button" class="cc-accion" data-sb-filter="agotados">Agotados</button>' +
      '<button type="button" class="cc-accion" data-sb-filter="bajo">Bajo mínimo</button>' +
      '<button type="button" class="cc-accion" data-sb-filter="con_reposicion">Con reposición</button>' +
      '<button type="button" class="cc-accion" data-sb-filter="sin_reposicion">Sin reposición</button>' +
      '</div>' +
      '<div id="bc-sb-lista" class="lista"><div class="bc-sb-empty">Cargando alertas…</div></div>' +
      '<p class="bc-sb-msg msg" id="bc-sb-msg"></p>' +
      '</div>' +
      '<div class="bc-sb-foot"><button type="button" class="cc-accion" data-bc-sb-close="1">Cerrar</button></div>' +
      '</div>';
    document.body.appendChild(root);

    root.querySelectorAll('[data-bc-sb-close="1"]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    root.querySelectorAll('[data-sb-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filtro = btn.getAttribute('data-sb-filter') || 'todos';
        root.querySelectorAll('[data-sb-filter]').forEach(function (x) {
          x.classList.toggle('active', x === btn);
        });
        cargar();
      });
    });
    root.querySelector('#bc-sb-destino').addEventListener('change', cargar);
    root.querySelector('#bc-sb-solo-rep').addEventListener('change', cargar);
    root.querySelector('#bc-sb-refrescar').addEventListener('click', cargar);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var m = document.getElementById(MODAL_ID);
        if (m && m.classList.contains('open')) closeModal();
      }
    });

    return root;
  }

  function openModal() {
    injectStyle();
    ensureModal();
    var root = document.getElementById(MODAL_ID);
    if (!root) return;
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    cargar();
  }

  function closeModal() {
    var root = document.getElementById(MODAL_ID);
    if (root) root.classList.remove('open');
    document.body.style.overflow = '';
  }

  function analizarLocal(destinoTipo, filtroLocal) {
    var alms = (typeof _cache !== 'undefined' && Array.isArray(_cache.almacenes)) ? _cache.almacenes : [];
    var stock = (typeof _cache !== 'undefined' && Array.isArray(_cache.stock)) ? _cache.stock : [];
    var prods = (typeof _cache !== 'undefined' && Array.isArray(_cache.productos)) ? _cache.productos : [];
    var byId = {};
    prods.forEach(function (p) { byId[String(p.id)] = p; });
    var tipoNorm = function (t) {
      var s = String(t || '').toLowerCase();
      if (s === 'venta') return 'minorista';
      return s;
    };
    var destinos = alms.filter(function (a) {
      if (a.activo === false) return false;
      var t = tipoNorm(a.tipo);
      if (t === 'almacenamiento') return false;
      if (destinoTipo && t !== destinoTipo) return false;
      return t === 'minorista' || t === 'mayorista';
    });
    var fuentes = alms.filter(function (a) {
      return a.activo !== false && tipoNorm(a.tipo) === 'almacenamiento';
    });
    var rows = [];
    destinos.forEach(function (dest) {
      stock.filter(function (s) { return String(s.almacen_id) === String(dest.id); }).forEach(function (s) {
        var cant = n(s.cantidad);
        var min = s.minimo != null ? n(s.minimo) : 0;
        var bajo = cant <= 0 || (min > 0 && cant <= min);
        if (!bajo) return;
        var faltante = min > 0 ? Math.max(min - cant, 0) : (cant <= 0 ? 1 : 0);
        var fuentesProd = fuentes.map(function (f) {
          var row = stock.find(function (x) {
            return String(x.producto_id) === String(s.producto_id) && String(x.almacen_id) === String(f.id);
          });
          var q = row ? n(row.cantidad) : 0;
          return q > 0 ? { almacen_id: f.id, almacen: f.nombre, cantidad: q } : null;
        }).filter(Boolean);
        var existenciaAlm = fuentesProd.reduce(function (a, f) { return a + f.cantidad; }, 0);
        var prod = byId[String(s.producto_id)];
        rows.push({
          producto_id: s.producto_id,
          producto: (prod && prod.nombre) || 'Producto',
          destino_almacen_id: dest.id,
          destino_almacen: dest.nombre,
          destino_tipo: tipoNorm(dest.tipo),
          existencia_destino: cant,
          minimo_destino: min,
          faltante: faltante || Math.max(min - cant, cant <= 0 ? Math.max(min, 1) : 0),
          existencia_almacenamiento: existenciaAlm,
          cantidad_reponible: Math.min(existenciaAlm, faltante || existenciaAlm),
          almacenes_fuente: fuentesProd
        });
      });
    });
    return aplicarFiltro(rows, filtroLocal);
  }

  function aplicarFiltro(rows, f) {
    if (f === 'agotados') return rows.filter(function (r) { return n(r.existencia_destino) <= 0; });
    if (f === 'bajo') {
      return rows.filter(function (r) {
        return n(r.existencia_destino) > 0 && n(r.minimo_destino) > 0 && n(r.existencia_destino) <= n(r.minimo_destino);
      });
    }
    if (f === 'con_reposicion') return rows.filter(function (r) { return n(r.existencia_almacenamiento) > 0; });
    if (f === 'sin_reposicion') return rows.filter(function (r) { return n(r.existencia_almacenamiento) <= 0; });
    return rows;
  }

  async function cargar() {
    var root = document.getElementById(MODAL_ID);
    if (!root || cargando) return;
    var lista = root.querySelector('#bc-sb-lista');
    var msg = root.querySelector('#bc-sb-msg');
    var destinoEl = root.querySelector('#bc-sb-destino');
    var soloRepEl = root.querySelector('#bc-sb-solo-rep');
    var destino = (destinoEl && destinoEl.value) || null;
    var soloRep = soloRepEl && soloRepEl.value === '1';
    cargando = true;
    lista.innerHTML = '<div class="bc-sb-empty">Cargando alertas…</div>';
    if (msg) msg.textContent = '';

    try {
      var rows = [];
      var usedRpc = false;
      if (navigator.onLine && typeof client !== 'undefined' && client.rpc) {
        try {
          var res = await client.rpc('listar_stock_bajo_reposicion', {
            p_filtro: filtro,
            p_destino_tipo: destino
          });
          if (!res.error && Array.isArray(res.data)) {
            rows = res.data;
            usedRpc = true;
          }
        } catch (e) { /* fallback local */ }
      }
      if (!usedRpc) {
        if (typeof cargarStockAlmacenes === 'function') {
          try { await cargarStockAlmacenes(false); } catch (e) {}
        }
        if (typeof cargarAlmacenes === 'function' && !(_cache.almacenes && _cache.almacenes.length)) {
          try {
            var a = await cargarAlmacenes();
            if (Array.isArray(a)) _cache.almacenes = a;
          } catch (e) {}
        }
        if (typeof cargarProductos === 'function' && !(_cache.productos && _cache.productos.length)) {
          try {
            var p = await cargarProductos();
            if (Array.isArray(p)) _cache.productos = p;
          } catch (e) {}
        }
        rows = analizarLocal(destino, filtro);
        if (msg) msg.textContent = 'Análisis local (stock en este dispositivo).';
      }
      if (soloRep) rows = rows.filter(function (r) { return n(r.existencia_almacenamiento) > 0; });
      rowsCache = rows;
      render(lista, rows);
    } catch (e) {
      console.warn('[BattleCruiser] Stock bajo modal', e);
      lista.innerHTML = '<div class="bc-sb-empty">No se pudo cargar el análisis de stock.</div>';
      if (msg) msg.textContent = (e && e.message) ? e.message : 'Error de consulta';
    } finally {
      cargando = false;
    }
  }

  function irAReponer(row) {
    var fuentes = Array.isArray(row.almacenes_fuente) ? row.almacenes_fuente : [];
    var origen = fuentes[0];
    if (!origen) {
      var msg = document.getElementById('bc-sb-msg');
      if (msg) {
        msg.textContent = 'No hay almacén de almacenamiento con existencia.';
        msg.className = 'bc-sb-msg msg error';
      }
      return;
    }
    closeModal();
    if (typeof irATab === 'function') irATab('transferencias');
    setTimeout(function () {
      var o = document.getElementById('trf-origen');
      var d = document.getElementById('trf-destino');
      var p = document.getElementById('trf-producto');
      var c = document.getElementById('trf-cantidad');
      if (o) o.value = origen.almacen_id || '';
      if (d) d.value = row.destino_almacen_id || '';
      if (p) p.value = row.producto_id || '';
      var qty = Math.min(n(origen.cantidad), n(row.faltante) || n(origen.cantidad));
      if (c && qty > 0) c.value = String(qty);
      if (typeof setMsg === 'function') {
        setMsg('msg-transferencias', 'Reposición sugerida: revisá origen/destino/cantidad y confirmá la transferencia.', true);
      }
    }, 120);
  }

  function render(lista, rows) {
    if (!rows.length) {
      lista.innerHTML = '<div class="bc-sb-empty">No hay productos que coincidan con este filtro.</div>';
      return;
    }
    lista.innerHTML = rows.map(function (r, idx) {
      var agotado = n(r.existencia_destino) <= 0;
      var repos = n(r.existencia_almacenamiento) > 0;
      var fuentes = Array.isArray(r.almacenes_fuente) ? r.almacenes_fuente : [];
      var fuenteTxt = fuentes.length
        ? fuentes.map(function (f) { return esc(f.almacen) + ' (' + moneyLocal(f.cantidad) + ')'; }).join(', ')
        : 'Sin existencia en almacenamiento';
      var btn = repos
        ? '<button type="button" class="cc-accion bc-sb-reponer" data-repo-idx="' + idx + '">Reponer</button>'
        : '<button type="button" class="cc-accion bc-sb-reponer" disabled title="Sin stock en almacenamiento">Sin origen</button>';
      return (
        '<div class="bc-sb-row" data-repo-row="' + idx + '">' +
        '<div class="bc-sb-name">' + esc(r.producto) +
        '<div class="bc-sb-meta">' + esc(r.destino_almacen) + ' · ' + labelTipo(r.destino_tipo) + '</div></div>' +
        '<div><span class="bc-sb-meta">Stock actual</span><br><b class="' + (agotado ? 'bc-sb-zero' : '') + '">' + moneyLocal(r.existencia_destino) + '</b></div>' +
        '<div><span class="bc-sb-meta">Mínimo</span><br><b>' + moneyLocal(r.minimo_destino) + '</b></div>' +
        '<div><span class="bc-sb-meta">Faltante</span><br><b>' + moneyLocal(r.faltante) + '</b></div>' +
        '<div><span class="bc-sb-meta">En almacenamiento</span><br>' +
        '<b class="' + (repos ? 'bc-sb-ok' : 'bc-sb-no') + '">' +
        (repos ? moneyLocal(r.cantidad_reponible || r.existencia_almacenamiento) + ' reponible' : 'No disponible') +
        '</b><div class="bc-sb-meta">' + fuenteTxt + '</div></div>' +
        '<div>' + btn + '</div></div>'
      );
    }).join('');

    lista.querySelectorAll('[data-repo-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(btn.getAttribute('data-repo-idx'));
        var row = (rowsCache || [])[i];
        if (row) irAReponer(row);
      });
    });
  }

  function removeLegacyBlock() {
    var legacy = document.getElementById('bc-stock-reposicion');
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
  }

  function boot() {
    injectStyle();
    removeLegacyBlock();
    ensureButton();
    ensureModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 200);
    });
  } else {
    setTimeout(boot, 200);
  }
  window.addEventListener('pageshow', function () {
    setTimeout(boot, 100);
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('.tab-btn[data-tab="inventario"]')) {
      setTimeout(function () {
        removeLegacyBlock();
        ensureButton();
      }, 80);
    }
  });

  window.__BC_openStockBajo = openModal;
})();
