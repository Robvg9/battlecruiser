// BattleCruiser — M56.2 · UI secuencia estricta para Dependienta
// Regla visual: solo la primera sesión elegible muestra ABRIR SESIÓN.
// Las demás sesiones pendientes/programadas muestran 🔒 hasta que corresponda.
// Regla de seguridad real: el backend iniciar_sesion_operativa también valida fecha + secuencia.
(function () {
  'use strict';
  if (window.__bcM56TurnosSecuenciaUI) return;
  window.__bcM56TurnosSecuenciaUI = true;

  var TODAY_CACHE = null;
  var redirected = false;

  function hoy() {
    if (TODAY_CACHE) return TODAY_CACHE;
    var d = new Date();
    TODAY_CACHE = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return TODAY_CACHE;
  }

  function norm(s) {
    return String(s || '').trim().toUpperCase();
  }

  function terminal(st) {
    st = norm(st);
    return st === 'COMPLETADA' || st === 'CANCELADA' || st === 'CANCELLED' || st === 'ANULADA';
  }

  function estadoDeFila(row) {
    var text = norm(row.textContent);
    if (text.indexOf('COMPLETADA') >= 0) return 'COMPLETADA';
    if (text.indexOf('CANCELADA') >= 0 || text.indexOf('CANCELLED') >= 0 || text.indexOf('ANULADA') >= 0) return 'CANCELADA';
    if (text.indexOf('EN CURSO') >= 0) return 'EN_CURSO';
    if (text.indexOf('SIN COMENZAR') >= 0 || text.indexOf('PENDIENTE') >= 0 || text.indexOf('PROGRAMADA') >= 0) return 'PENDIENTE';
    return '';
  }

  function diaDeFila(row) {
    var m = String(row.textContent || '').match(/D[IÍ]A\s+(\d+)/i);
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
  }

  function bloqueDeFila(row) {
    var text = norm(row.textContent);
    if (text.indexOf('TARDE') >= 0) return 2;
    if (text.indexOf('MAÑANA') >= 0 || text.indexOf('MANANA') >= 0) return 1;
    return 0;
  }

  function fechaIsoDeFila(row) {
    // M33 muestra fechas como DD/MM/YYYY en la línea secundaria.
    var m = String(row.textContent || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }

  function claveFila(row) {
    return [diaDeFila(row), bloqueDeFila(row)];
  }

  function anterior(a, b) {
    var ka = claveFila(a), kb = claveFila(b);
    return ka[0] < kb[0] || (ka[0] === kb[0] && ka[1] < kb[1]);
  }

  function esMiaVistaDependienta() {
    var modal = document.querySelector('#m33-bg .m33-modal');
    if (!modal) return false;
    return !!modal.querySelector('#m33-dep-msg, [data-m33-abrir-sesion]');
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

  function renderSequence() {
    if (!esMiaVistaDependienta()) return;
    css();

    var modal = document.querySelector('#m33-bg .m33-modal');
    if (!modal) return;

    // Tomamos TODAS las filas, incluidas COMPLETADA y EN_CURSO, porque
    // también son necesarias para decidir si una sesión posterior está bloqueada.
    var rows = Array.prototype.slice.call(modal.querySelectorAll('.m33-session'));
    if (!rows.length) return;

    rows.sort(function (a, b) {
      var ka = claveFila(a), kb = claveFila(b);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });

    var eligibleId = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var st = estadoDeFila(row);
      if (terminal(st) || st === 'EN_CURSO') continue;
      var fecha = fechaIsoDeFila(row);
      if (fecha !== hoy()) continue;

      var prevIncomplete = false;
      for (var j = 0; j < rows.length; j++) {
        if (!anterior(rows[j], row)) continue;
        var prevSt = estadoDeFila(rows[j]);
        if (!terminal(prevSt)) {
          prevIncomplete = true;
          break;
        }
      }
      if (!prevIncomplete) {
        var candidate = row.querySelector('[data-m33-abrir-sesion]');
        eligibleId = candidate && candidate.getAttribute('data-m33-abrir-sesion');
        if (eligibleId) break;
      }
    }

    rows.forEach(function (row) {
      var btn = row.querySelector('[data-m33-abrir-sesion]');
      if (!btn) return;
      var id = btn.getAttribute('data-m33-abrir-sesion');
      var st = estadoDeFila(row);
      if (!eligibleId || id !== eligibleId) bloquear(btn);
      else desbloquear(btn);

      var fecha = fechaIsoDeFila(row);
      if (fecha && fecha !== hoy() && st === 'PENDIENTE') {
        var sub = row.querySelector('.m33-muted');
        if (sub && !row.querySelector('.m56-when')) {
          var when = document.createElement('span');
          when.className = 'm56-when';
          when.textContent = fecha > hoy() ? 'Disponible en su fecha programada' : 'Fecha ya pasada';
          sub.appendChild(when);
        }
      }
    });
  }

  function volverAVentas() {
    if (redirected) return;
    redirected = true;
    try {
      var bg = document.getElementById('m33-bg');
      if (bg) bg.remove();
    } catch (e) {}
    try {
      if (typeof window.bcRefrescarTurnoYPanelVenta === 'function') {
        window.bcRefrescarTurnoYPanelVenta();
      } else if (typeof window.__BC_M25_refrescarTurno === 'function') {
        window.__BC_M25_refrescarTurno();
      } else if (typeof refrescarTurnoActual === 'function') {
        refrescarTurnoActual();
      }
    } catch (e2) {}
    setTimeout(function () {
      try {
        if (typeof irATab === 'function') {
          irATab('ventas');
        } else {
          var b = document.querySelector('.tab-btn[data-tab="ventas"]');
          if (b) b.click();
        }
      } catch (e3) {}
      setTimeout(function () {
        try {
          if (typeof window.bcRefrescarTurnoYPanelVenta === 'function') window.bcRefrescarTurnoYPanelVenta();
          else if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
        } catch (e4) {}
      }, 180);
    }, 120);
  }

  function watchSuccess() {
    var msg = document.getElementById('m33-dep-msg');
    if (!msg) return;
    var text = norm(msg.textContent);
    if (text.indexOf('SESION ABIERTA') >= 0) volverAVentas();
  }

  function bind() {
    if (window.__bcM56Observer) return;
    var observer = new MutationObserver(function () {
      renderSequence();
      watchSuccess();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__bcM56Observer = observer;
    renderSequence();
    watchSuccess();
  }

  function boot() {
    if (!document.body) return;
    bind();
    setTimeout(renderSequence, 50);
    setTimeout(renderSequence, 250);
    setTimeout(renderSequence, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.__BC_M56 = { renderSequence: renderSequence, volverAVentas: volverAVentas };
})();
