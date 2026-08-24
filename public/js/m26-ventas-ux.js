// BattleCruiser — M26 Ventas UX
// Rediseño de experiencia: BUSCAR → ELEGIR → CANTIDAD → AGREGAR → CONFIRMAR
// Reutiliza 100%: ventaLineas, agregarLineaVenta, renderVentaLineas,
// actualizarCantidadLinea, ejecutarOperacion("venta"), venta-turno-ui (M14).
// No crea cola, IndexedDB, RPC ni cambia contratos.
(function () {
  'use strict';

  var STYLE_ID = 'bc-m26-ventas-style';
  var CONFIRM_ID = 'bc-venta-confirm-modal';
  var _confirmBypass = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#tab-ventas.bc-pos{display:flex;flex-direction:column;gap:0;min-height:0}',
      '#tab-ventas.bc-pos .venta-vista-toggle{display:none!important}',
      '#tab-ventas.bc-pos #venta-modo-buscador{margin-bottom:8px}',
      '#tab-ventas.bc-pos #venta-modo-catalogo{display:block!important}',
      '#tab-ventas.bc-pos #venta-modo-catalogo.hidden{display:block!important}',
      '#tab-ventas.bc-pos #form-venta-linea{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;padding:10px 12px}',
      '#tab-ventas.bc-pos #form-venta-linea .venta-buscar-wrap{flex:1 1 100%;min-width:0}',
      '#tab-ventas.bc-pos #venta-producto{display:none!important}',
      '#tab-ventas.bc-pos #venta-cantidad{flex:1 1 90px;min-width:80px;max-width:120px;font-size:16px;height:44px}',
      '#tab-ventas.bc-pos #form-venta-linea button[type=submit]{flex:1 1 120px;min-height:44px;font-size:14px}',
      '#tab-ventas.bc-pos #venta-producto-buscar{width:100%;height:46px;font-size:16px;padding:10px 14px;border-radius:10px}',
      '#tab-ventas.bc-pos .catalogo-categorias{margin-bottom:10px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;padding-bottom:4px}',
      '#tab-ventas.bc-pos .catalogo-chip{flex:0 0 auto;min-height:36px;padding:8px 14px;font-size:13px}',
      '#tab-ventas.bc-pos .catalogo-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:12px;padding-bottom:8px}',
      '#tab-ventas.bc-pos .catalogo-card{min-height:0;padding:10px;border-radius:12px;touch-action:manipulation}',
      '#tab-ventas.bc-pos .catalogo-card-nombre{font-size:13px;font-weight:600;line-height:1.3}',
      '#tab-ventas.bc-pos .catalogo-card-precio{font-size:15px;font-weight:700;color:var(--gold-bright)}',
      '#tab-ventas.bc-pos .catalogo-card-stock{font-size:11px}',
      '#tab-ventas.bc-pos .bc-venta-carrito-bar{position:sticky;bottom:0;z-index:30;margin:0 -4px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,transparent 0%,var(--void) 18%,var(--void) 100%);border-top:1px solid var(--gold-dim)}',
      '#tab-ventas.bc-pos #venta-lineas{max-height:min(38vh,280px);overflow-y:auto;margin-bottom:8px;gap:6px}',
      '#tab-ventas.bc-pos #venta-lineas .lista-item{padding:10px 12px;border-radius:10px;align-items:center}',
      '#tab-ventas.bc-pos .venta-linea-btn{width:36px;height:36px;font-size:18px;border-radius:8px}',
      '#tab-ventas.bc-pos .venta-linea-cant-input{width:52px;height:36px;font-size:15px}',
      '#tab-ventas.bc-pos .venta-linea-borrar{min-height:36px;padding:6px 12px;border-radius:8px}',
      '#tab-ventas.bc-pos .venta-total{margin-bottom:8px;padding:12px 14px;border-radius:12px}',
      '#tab-ventas.bc-pos .venta-total-valor{font-size:26px}',
      '#tab-ventas.bc-pos .btn-confirmar-venta{min-height:52px;font-size:16px;border-radius:12px;letter-spacing:.04em}',
      '#tab-ventas.bc-pos #msg-venta,#tab-ventas.bc-pos #msg-venta-linea{min-height:18px}',
      '#' + CONFIRM_ID + '{position:fixed;inset:0;z-index:12000;display:flex;align-items:flex-end;justify-content:center;padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom));background:rgba(0,0,0,.72);box-sizing:border-box}',
      '#' + CONFIRM_ID + '.hidden{display:none!important}',
      '#' + CONFIRM_ID + ' .bc-confirm-dialog{width:min(420px,100%);background:#0f1f1a;border:1px solid rgba(201,162,77,.35);border-radius:16px 16px 12px 12px;padding:0;box-shadow:0 -8px 40px rgba(0,0,0,.5);max-height:85vh;overflow:auto}',
      '#' + CONFIRM_ID + ' .bc-confirm-head{padding:16px 18px 8px;display:flex;align-items:center;justify-content:space-between}',
      '#' + CONFIRM_ID + ' .bc-confirm-head h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.25rem;color:var(--gold)}',
      '#' + CONFIRM_ID + ' .bc-confirm-close{border:0;background:transparent;color:rgba(255,255,255,.7);font-size:26px;line-height:1;cursor:pointer;padding:4px 8px}',
      '#' + CONFIRM_ID + ' .bc-confirm-body{padding:4px 18px 12px}',
      '#' + CONFIRM_ID + ' .bc-confirm-linea{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(201,162,77,.12);font-size:13.5px}',
      '#' + CONFIRM_ID + ' .bc-confirm-linea:last-child{border-bottom:0}',
      '#' + CONFIRM_ID + ' .bc-confirm-total{margin-top:12px;padding-top:10px;border-top:1px solid rgba(201,162,77,.25);display:flex;justify-content:space-between;align-items:center;font-family:Cormorant Garamond,serif;font-size:18px}',
      '#' + CONFIRM_ID + ' .bc-confirm-total strong{color:var(--gold);font-size:24px}',
      '#' + CONFIRM_ID + ' .bc-confirm-actions{display:flex;flex-direction:column;gap:8px;padding:8px 18px 18px}',
      '#' + CONFIRM_ID + ' .bc-confirm-ok{width:100%;min-height:50px;border:0;border-radius:12px;background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#211605;font-weight:700;font-size:15px;cursor:pointer}',
      '#' + CONFIRM_ID + ' .bc-confirm-cancel{width:100%;min-height:44px;border:1px solid var(--gold-dim);border-radius:12px;background:transparent;color:var(--mist);font-size:14px;cursor:pointer}',
      '#' + CONFIRM_ID + ' .bc-confirm-hint{font-size:12px;color:var(--mist);margin:0 0 4px;text-align:center}',
      '@media(min-width:640px){#' + CONFIRM_ID + '{align-items:center}#' + CONFIRM_ID + ' .bc-confirm-dialog{border-radius:16px}}',
      '#tab-ventas.bc-pos h3{margin-top:28px}',
      '#tab-ventas.bc-pos .ventas-historial-controles{margin-top:4px}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureConfirmModal() {
    var m = document.getElementById(CONFIRM_ID);
    if (m) return m;
    m = document.createElement('div');
    m.id = CONFIRM_ID;
    m.className = 'hidden';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', 'Confirmar venta');
    m.innerHTML =
      '<div class="bc-confirm-dialog">' +
      '<div class="bc-confirm-head"><h3>Confirmar venta</h3>' +
      '<button type="button" class="bc-confirm-close" aria-label="Cerrar">×</button></div>' +
      '<div class="bc-confirm-body" id="bc-confirm-body"></div>' +
      '<div class="bc-confirm-actions">' +
      '<p class="bc-confirm-hint">Se descontará stock del almacén del turno.</p>' +
      '<button type="button" class="bc-confirm-ok" id="bc-confirm-ok">Confirmar y registrar</button>' +
      '<button type="button" class="bc-confirm-cancel" id="bc-confirm-cancel">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(m);
    m.querySelector('.bc-confirm-close').addEventListener('click', closeConfirm);
    m.querySelector('#bc-confirm-cancel').addEventListener('click', closeConfirm);
    m.addEventListener('click', function (e) { if (e.target === m) closeConfirm(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var el = document.getElementById(CONFIRM_ID);
        if (el && !el.classList.contains('hidden')) closeConfirm();
      }
    });
    return m;
  }

  function closeConfirm() {
    var m = document.getElementById(CONFIRM_ID);
    if (m) {
      m.classList.add('hidden');
      m._pendingResolve = null;
    }
  }

  function openConfirm(lineas, total) {
    return new Promise(function (resolve) {
      var m = ensureConfirmModal();
      var body = document.getElementById('bc-confirm-body');
      if (!body) { resolve(false); return; }
      var html = '';
      (lineas || []).forEach(function (l) {
        html += '<div class="bc-confirm-linea">' +
          '<span>' + escSafe(l.nombre) + ' × ' + l.cantidad + '</span>' +
          '<span>$' + moneySafe(l.subtotal) + '</span></div>';
      });
      html += '<div class="bc-confirm-total"><span>Total</span><strong>$' + moneySafe(total) + '</strong></div>';
      body.innerHTML = html;
      m.classList.remove('hidden');
      m._pendingResolve = resolve;
      var ok = document.getElementById('bc-confirm-ok');
      if (ok) {
        ok.onclick = function () {
          var r = m._pendingResolve;
          closeConfirm();
          if (r) r(true);
        };
      }
    });
  }

  function escSafe(t) {
    if (typeof escHtml === 'function') return escHtml(String(t || ''));
    return String(t || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }
  function moneySafe(n) {
    if (typeof money === 'function') return money(n);
    var v = Number(n) || 0;
    return v.toFixed(2);
  }

  function layoutPos() {
    var tab = document.getElementById('tab-ventas');
    if (!tab) return;
    if (tab.dataset.bcPos !== '1') {
      tab.dataset.bcPos = '1';
      tab.classList.add('bc-pos');
    }

    var modoCat = document.getElementById('venta-modo-catalogo');
    if (modoCat) modoCat.classList.remove('hidden');

    var lineas = document.getElementById('venta-lineas');
    var totalWrap = document.getElementById('venta-total-wrap');
    var btn = document.getElementById('btn-confirmar-venta');
    var msgVenta = document.getElementById('msg-venta');
    if (lineas && totalWrap && btn && !document.getElementById('bc-venta-carrito-bar')) {
      var bar = document.createElement('div');
      bar.id = 'bc-venta-carrito-bar';
      bar.className = 'bc-venta-carrito-bar';
      var hist = null;
      var nodes = tab.children;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].tagName === 'H3' && /Historial/i.test(nodes[i].textContent || '')) {
          hist = nodes[i];
          break;
        }
      }
      if (hist) tab.insertBefore(bar, hist);
      else tab.appendChild(bar);
      bar.appendChild(lineas);
      bar.appendChild(totalWrap);
      bar.appendChild(btn);
      if (msgVenta) bar.appendChild(msgVenta);
    }

    var buscar = document.getElementById('venta-producto-buscar');
    if (buscar) buscar.placeholder = 'Buscar producto por nombre…';
  }

  function wireSearchToCatalog() {
    var input = document.getElementById('venta-producto-buscar');
    if (!input || input.dataset.bcM26Search === '1') return;
    input.dataset.bcM26Search = '1';
    input.addEventListener('input', function () {
      var term = (input.value || '').trim().toLowerCase();
      window._ventaCatalogoFiltroTexto = term;
      if (typeof renderCatalogoGrid === 'function') renderCatalogoGrid();
    });
  }

  function patchCatalogFilter() {
    if (typeof renderCatalogoGrid !== 'function' || renderCatalogoGrid.__bcM26) return;
    var orig = renderCatalogoGrid;
    window.renderCatalogoGrid = function () {
      orig.apply(this, arguments);
      var term = (window._ventaCatalogoFiltroTexto || '').trim().toLowerCase();
      if (!term) return;
      var grid = document.getElementById('catalogo-grid');
      if (!grid) return;
      grid.querySelectorAll('.catalogo-card').forEach(function (card) {
        var nombre = (card.querySelector('.catalogo-card-nombre') || {}).textContent || '';
        var match = nombre.toLowerCase().indexOf(term) !== -1;
        card.style.display = match ? '' : 'none';
      });
    };
    window.renderCatalogoGrid.__bcM26 = true;
  }

  function wireCustomConfirm() {
    var btn = document.getElementById('btn-confirmar-venta');
    if (!btn || btn.dataset.bcM26Confirm === '1') return;
    btn.dataset.bcM26Confirm = '1';

    var origConfirm = window.confirm;
    btn.addEventListener('click', function (e) {
      if (_confirmBypass) return;
      if (typeof ventaLineas === 'undefined' || !ventaLineas || ventaLineas.length === 0) return;
      var almId = null;
      if (typeof obtenerAlmacenIdOperativoVenta === 'function') almId = obtenerAlmacenIdOperativoVenta();
      if (!almId) {
        var sel = document.getElementById('venta-almacen');
        if (sel) almId = sel.value;
      }
      if (!almId) return;

      e.stopImmediatePropagation();
      e.preventDefault();

      var total = ventaLineas.reduce(function (s, l) { return s + (l.subtotal || 0); }, 0);
      openConfirm(ventaLineas.slice(), total).then(function (ok) {
        if (!ok) return;
        window.confirm = function () { return true; };
        _confirmBypass = true;
        try {
          btn.click();
        } finally {
          _confirmBypass = false;
          window.confirm = origConfirm;
        }
      });
    }, true);
  }

  // Refuerza mensaje offline cuando ventas.js usa setMsg con resultado.offline
  function patchOfflineMessage() {
    if (typeof setMsg !== 'function' || setMsg.__bcM26Offline) return;
    var orig = setMsg;
    window.setMsg = function (id, text, ok) {
      if (id === 'msg-venta' && text && /guardada localmente|sincronizar/i.test(String(text))) {
        text = 'Venta guardada. Se sincronizará cuando vuelva la conexión.';
      }
      return orig.apply(this, [id, text, ok]);
    };
    window.setMsg.__bcM26Offline = true;
  }

  function boot() {
    injectStyles();
    layoutPos();
    wireSearchToCatalog();
    patchCatalogFilter();
    wireCustomConfirm();
    patchOfflineMessage();
    ensureConfirmModal();
    if (typeof renderCatalogoGrid === 'function') {
      try { renderCatalogoGrid(); } catch (e) {}
    }
  }

  function start() {
    boot();
    var n = 0;
    var t = setInterval(function () {
      n++;
      layoutPos();
      wireSearchToCatalog();
      patchCatalogFilter();
      wireCustomConfirm();
      patchOfflineMessage();
      if (n >= 15) clearInterval(t);
    }, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 500); });
  } else {
    setTimeout(start, 500);
  }
})();
