// BattleCruiser — M57.1 · UX de secuencia + entrada directa a Ventas
// Refuerza M33/M56 con una única regla visual: solo la sesión elegible es clickeable.
// Tras abrir correctamente: refresca turno_actual_usuario, cierra el modal y entra a Ventas.
(function () {
  'use strict';
  if (window.__bcM57TurnosSessionUx) return;
  window.__bcM57TurnosSessionUx = true;

  var observer = null;
  var busy = false;
  var booted = false;

  function norm(v) {
    return String(v == null ? '' : v).trim().toUpperCase();
  }
  function strip(v) {
    return norm(v).replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N');
  }
  function terminal(st) {
    st = strip(st);
    return st === 'COMPLETADA' || st === 'CANCELADA' || st === 'CANCELLED' || st === 'ANULADA';
  }
  function order(s) {
    var d = Number(s.numero_dia != null ? s.numero_dia : s.dia_n) || 999999;
    var b = strip(s.bloque) === 'MANANA' ? 1 : 2;
    return [d, b];
  }
  function before(a, b) {
    var ka = order(a), kb = order(b);
    return ka[0] < kb[0] || (ka[0] === kb[0] && ka[1] < kb[1]);
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function api() { return window.BattleCruiserTurnoAPI || null; }
  function turnoId() {
    var card = document.querySelector('.m29-card[data-turno-id]');
    return card ? card.getAttribute('data-turno-id') : null;
  }

  async function loadRows() {
    var id = turnoId();
    var a = api();
    if (!id || !a || typeof a.listarSesionesTurno !== 'function') return [];
    try {
      var rows = await a.listarSesionesTurno(id);
      if (Array.isArray(rows)) return rows;
      if (rows && Array.isArray(rows.sesiones)) return rows.sesiones;
      if (rows && Array.isArray(rows.items)) return rows.items;
    } catch (e) {
      try { console.warn('[M57] No se pudieron cargar sesiones', e); } catch (x) {}
    }
    return [];
  }

  function eligibleId(rows) {
    var all = rows.slice().filter(Boolean);
    all.sort(function (a, b) {
      var ka = order(a), kb = order(b);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });
    var h = today();
    for (var i = 0; i < all.length; i++) {
      var cur = all[i];
      var st = strip(cur.estado);
      if (terminal(st) || st === 'EN_CURSO') continue;
      if (String(cur.fecha || '').slice(0, 10) !== h) continue;
      var blocked = false;
      for (var j = 0; j < all.length; j++) {
        if (!before(all[j], cur)) continue;
        if (!terminal(all[j].estado)) { blocked = true; break; }
      }
      if (!blocked) return String(cur.id);
    }
    return null;
  }

  function css() {
    if (document.getElementById('bc-m57-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-m57-css';
    s.textContent = '.m57-locked{opacity:.45!important;filter:saturate(.35)!important;cursor:not-allowed!important;pointer-events:auto!important}.m57-lock-icon{margin-right:6px}.m57-hint{font-size:.72rem;opacity:.65;margin-top:4px}';
    document.head.appendChild(s);
  }

  function render(rows) {
    var modal = document.querySelector('#m33-bg .m33-modal');
    if (!modal) return;
    var buttons = Array.prototype.slice.call(modal.querySelectorAll('[data-m33-abrir-sesion]'));
    if (!buttons.length) return;
    css();
    var ok = eligibleId(rows);
    buttons.forEach(function (btn) {
      var id = btn.getAttribute('data-m33-abrir-sesion');
      var canOpen = !!ok && String(id) === ok;
      if (canOpen) {
        btn.disabled = false;
        btn.classList.remove('m57-locked');
        btn.removeAttribute('aria-disabled');
        btn.removeAttribute('title');
        btn.textContent = 'Abrir sesión';
      } else {
        btn.disabled = true;
        btn.classList.add('m57-locked');
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('title', '🔒 Esta sesión está bloqueada por la secuencia o por su fecha programada.');
        btn.innerHTML = '<span class="m57-lock-icon">🔒</span> Abrir sesión';
      }
    });
  }

  async function refreshAndGoVentas() {
    if (busy) return;
    busy = true;
    window.__BC_SESSION_OPEN_REDIRECTING__ = true;
    try {
      if (typeof window.bcRefrescarTurnoYPanelVenta === 'function') {
        await window.bcRefrescarTurnoYPanelVenta();
      } else if (typeof window.__BC_M25_refrescarTurno === 'function') {
        await window.__BC_M25_refrescarTurno();
      } else if (typeof refrescarTurnoActual === 'function') {
        await refrescarTurnoActual();
      }
    } catch (e) {}

    try {
      var bg = document.getElementById('m33-bg');
      if (bg) bg.remove();
    } catch (e2) {}

    setTimeout(function () {
      try {
        if (typeof irATab === 'function') irATab('ventas');
        else {
          var b = document.querySelector('.tab-btn[data-tab="ventas"]');
          if (b) b.click();
        }
      } catch (e3) {}
      setTimeout(function () {
        try {
          if (typeof window.bcRefrescarTurnoYPanelVenta === 'function') window.bcRefrescarTurnoYPanelVenta();
          else if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
        } catch (e4) {}
        setTimeout(function () { window.__BC_SESSION_OPEN_REDIRECTING__ = false; busy = false; }, 800);
      }, 160);
    }, 40);
  }

  function successCheck() {
    if (window.__BC_SESSION_OPEN_REDIRECTING__) return;
    var msg = document.getElementById('m33-dep-msg');
    if (!msg) return;
    if (strip(msg.textContent).indexOf('SESION ABIERTA') >= 0) refreshAndGoVentas();
  }

  function bindGuard() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-m33-abrir-sesion]') : null;
      if (!btn) return;
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('m57-locked')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var msg = document.getElementById('m33-dep-msg');
        if (msg) msg.textContent = '🔒 Esta sesión todavía no se puede abrir. Completá primero la sesión anterior y respetá la fecha programada.';
      }
    }, true);
  }

  function watch() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function () {
      if (window.__BC_M57_RENDERING__) return;
      window.__BC_M57_RENDERING__ = true;
      Promise.resolve(loadRows()).then(function (rows) { render(rows); successCheck(); }).catch(function () {}).finally(function () {
        window.__BC_M57_RENDERING__ = false;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function boot() {
    if (booted || !document.body) return;
    booted = true;
    bindGuard();
    watch();
    loadRows().then(function (rows) { render(rows); successCheck(); });
    [80, 250, 700].forEach(function (ms) {
      setTimeout(function () { loadRows().then(function (rows) { render(rows); successCheck(); }); }, ms);
    });
  }

  window.__BC_M57 = { render: function () { return loadRows().then(render); }, refreshVentas: refreshAndGoVentas };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
