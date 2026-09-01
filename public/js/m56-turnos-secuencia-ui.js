// BattleCruiser — M56.5 · secuencia UI robusta con metadata real
// No interpreta fechas desde texto visual. Usa turno_sesiones reales del turno.
// La elegibilidad visual y la apertura real usan la misma regla: fecha + secuencia.
(function () {
  'use strict';
  if (window.__bcM56TurnosSecuenciaUI) return;
  window.__bcM56TurnosSecuenciaUI = true;

  var TODAY_CACHE = null;
  var redirected = false;
  var observer = null;
  var rendering = false;
  var lastTurnoId = null;
  var metaTurnoId = null;
  var metaPromise = null;
  var sessionMeta = Object.create(null);

  function hoy() {
    if (TODAY_CACHE) return TODAY_CACHE;
    var d = new Date();
    TODAY_CACHE = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return TODAY_CACHE;
  }
  function norm(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
  function sinAcentos(s) { return norm(s).replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N'); }
  function terminal(st) {
    st = sinAcentos(st);
    return st === 'COMPLETADA' || st === 'CANCELADA' || st === 'CANCELLED' || st === 'ANULADA';
  }
  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    if (Array.isArray(v.sesiones)) return v.sesiones;
    if (Array.isArray(v.items)) return v.items;
    return [];
  }
  function bloqueOrden(b) {
    b = sinAcentos(b);
    return b === 'MANANA' ? 1 : (b === 'TARDE' ? 2 : 0);
  }
  function metaClave(s) {
    return [Number(s.numero_dia != null ? s.numero_dia : s.dia_n) || 999999, bloqueOrden(s.bloque)];
  }
  function anterior(a, b) {
    var ka = metaClave(a), kb = metaClave(b);
    return ka[0] < kb[0] || (ka[0] === kb[0] && ka[1] < kb[1]);
  }
  function rowButton(row) { return row && row.querySelector('[data-m33-abrir-sesion]'); }
  function currentTurnoId() {
    if (lastTurnoId) return lastTurnoId;
    var card = document.querySelector('.m29-card[data-turno-id]');
    return card ? card.getAttribute('data-turno-id') : null;
  }
  function api() { return window.BattleCruiserTurnoAPI || null; }

  async function loadMetadata() {
    var turnoId = currentTurnoId();
    if (!turnoId) return false;
    if (metaPromise && metaTurnoId === turnoId) return metaPromise;
    metaTurnoId = turnoId;
    metaPromise = (async function () {
      var a = api();
      if (!a || typeof a.listarSesionesTurno !== 'function') return false;
      try {
        var rows = asArray(await a.listarSesionesTurno(turnoId));
        var next = Object.create(null);
        rows.forEach(function (s) {
          if (!s || !s.id) return;
          next[String(s.id)] = {
            id: s.id,
            numero_dia: Number(s.numero_dia != null ? s.numero_dia : s.dia_n) || 999999,
            bloque: sinAcentos(s.bloque),
            fecha: s.fecha ? String(s.fecha).slice(0, 10) : null,
            estado: sinAcentos(s.estado)
          };
        });
        sessionMeta = next;
        return rows.length > 0;
      } catch (e) {
        console.warn('[M56.5] No se pudo cargar metadata de sesiones', e);
        return false;
      } finally {
        metaPromise = null;
      }
    })();
    return metaPromise;
  }

  function css() {
    if (document.getElementById('bc-m56-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-m56-css';
    s.textContent = '.m56-lock{opacity:.7;background:transparent!important;border:1px solid rgba(148,163,184,.28)!important;color:inherit!important;cursor:not-allowed!important}.m56-lock-icon{margin-right:6px}.m56-when{display:block;margin-top:3px;font-size:.72rem;opacity:.62}';
    document.head.appendChild(s);
  }
  function bloquear(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('m56-lock');
    btn.setAttribute('aria-disabled', 'true');
    btn.setAttribute('title', 'Esta sesión todavía no es elegible.');
    btn.innerHTML = '<span class="m56-lock-icon">🔒</span> Abrir sesión';
  }
  function desbloquear(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('m56-lock');
    btn.removeAttribute('aria-disabled');
    btn.removeAttribute('title');
    btn.textContent = 'Abrir sesión';
  }
  function visibleMetaRows(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll('.m33-session')).map(function (row) {
      var btn = rowButton(row);
      if (!btn) return null;
      var id = btn.getAttribute('data-m33-abrir-sesion');
      var m = id ? sessionMeta[String(id)] : null;
      return m ? { row: row, button: btn, meta: m } : null;
    }).filter(Boolean);
  }

  function findEligibleId() {
    var all = Object.keys(sessionMeta).map(function (id) { return sessionMeta[id]; });
    all.sort(function (a, b) {
      var ka = metaClave(a), kb = metaClave(b);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });
    for (var i = 0; i < all.length; i++) {
      var cur = all[i];
      if (terminal(cur.estado) || cur.estado === 'EN_CURSO') continue;
      if (cur.fecha !== hoy()) continue;
      var blocked = false;
      for (var j = 0; j < all.length; j++) {
        if (!anterior(all[j], cur)) continue;
        if (!terminal(all[j].estado)) { blocked = true; break; }
      }
      if (!blocked) return String(cur.id);
    }
    return null;
  }

  function renderSequence() {
    if (rendering) return;
    var modal = document.querySelector('#m33-bg .m33-modal');
    if (!modal || !modal.querySelector('#m33-dep-msg, [data-m33-abrir-sesion]')) return;
    css();
    var items = visibleMetaRows(modal);
    if (!items.length) return;
    var eligibleId = findEligibleId();
    rendering = true;
    try {
      items.forEach(function (it) {
        if (eligibleId && String(it.meta.id) === eligibleId) desbloquear(it.button);
        else bloquear(it.button);
        if (it.meta.fecha && it.meta.fecha !== hoy() && it.meta.estado === 'PENDIENTE') {
          var sub = it.row.querySelector('.m33-muted');
          if (sub && !it.row.querySelector('.m56-when')) {
            var when = document.createElement('span');
            when.className = 'm56-when';
            when.textContent = it.meta.fecha > hoy() ? 'Disponible en su fecha programada' : 'Fecha ya pasada';
            sub.appendChild(when);
          }
        }
      });
    } finally { rendering = false; }
  }

  function onCardClick(e) {
    var card = e.target && e.target.closest ? e.target.closest('.m29-card[data-turno-id]') : null;
    if (!card) return;
    lastTurnoId = card.getAttribute('data-turno-id') || null;
    metaTurnoId = null;
    metaPromise = null;
    sessionMeta = Object.create(null);
  }

  function volverAVentas() {
    if (redirected) return;
    redirected = true;
    var bg = document.getElementById('m33-bg');
    if (bg) bg.remove();
    try {
      if (typeof window.bcRefrescarTurnoYPanelVenta === 'function') window.bcRefrescarTurnoYPanelVenta();
      else if (typeof window.__BC_M25_refrescarTurno === 'function') window.__BC_M25_refrescarTurno();
      else if (typeof refrescarTurnoActual === 'function') refrescarTurnoActual();
    } catch (e) {}
    setTimeout(function () {
      try {
        if (typeof irATab === 'function') irATab('ventas');
        else {
          var b = document.querySelector('.tab-btn[data-tab="ventas"]');
          if (b) b.click();
        }
      } catch (e2) {}
      setTimeout(function () {
        try {
          if (typeof window.bcRefrescarTurnoYPanelVenta === 'function') window.bcRefrescarTurnoYPanelVenta();
          else if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
        } catch (e3) {}
      }, 180);
    }, 120);
  }
  function watchSuccess() {
    var msg = document.getElementById('m33-dep-msg');
    if (msg && sinAcentos(msg.textContent).indexOf('SESION ABIERTA') >= 0) volverAVentas();
  }
  function observeAgain() {
    if (document.body && observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function bind() {
    if (observer) return;
    document.addEventListener('click', onCardClick, true);
    observer = new MutationObserver(function () {
      if (rendering) return;
      observer.disconnect();
      var hasModal = !!document.querySelector('#m33-bg .m33-modal [data-m33-abrir-sesion]');
      if (hasModal) {
        loadMetadata().then(function () { renderSequence(); watchSuccess(); }).finally(observeAgain);
      } else {
        watchSuccess();
        observeAgain();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__bcM56Observer = observer;
    loadMetadata().then(function () { renderSequence(); watchSuccess(); });
  }
  function boot() {
    if (!document.body) return;
    bind();
    setTimeout(function () { loadMetadata().then(renderSequence); }, 80);
    setTimeout(function () { loadMetadata().then(renderSequence); }, 300);
    setTimeout(function () { loadMetadata().then(renderSequence); }, 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.__BC_M56 = {
    renderSequence: renderSequence,
    volverAVentas: volverAVentas,
    reload: function () { metaTurnoId = null; metaPromise = null; return loadMetadata().then(renderSequence); }
  };
})();
