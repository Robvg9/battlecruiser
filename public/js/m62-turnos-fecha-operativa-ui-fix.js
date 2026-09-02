// BattleCruiser — M62 · fecha operativa UI de Turnos
// Corrige el bloqueo prematuro de M56/M57 cuando el navegador usa UTC u otra zona.
// La fecha operativa del negocio es America/Puerto_Rico; la RPC del backend sigue siendo la autoridad final.
(function () {
  'use strict';
  if (window.__BC_M62_TURNOS_FECHA_UI) return;
  window.__BC_M62_TURNOS_FECHA_UI = true;

  var ZONA_NEGOCIO = 'America/Puerto_Rico';
  var observer = null;
  var timer = null;
  var busy = false;

  function normalizar(v) {
    return String(v == null ? '' : v).trim().toUpperCase()
      .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E')
      .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O')
      .replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N');
  }

  function hoyNegocio() {
    try {
      var p = new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_NEGOCIO,
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date());
      var y = p.find(function (x) { return x.type === 'year'; }).value;
      var m = p.find(function (x) { return x.type === 'month'; }).value;
      var d = p.find(function (x) { return x.type === 'day'; }).value;
      return y + '-' + m + '-' + d;
    } catch (e) {
      var d2 = new Date();
      return d2.getUTCFullYear() + '-' + String(d2.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d2.getUTCDate()).padStart(2, '0');
    }
  }

  function api() { return window.BattleCruiserTurnoAPI || null; }
  function turnoId() {
    var bg = document.getElementById('m33-bg');
    var card = document.querySelector('.m29-card[data-turno-id]');
    if (window.__BC_M56 && window.__BC_M56.currentTurnoId) {
      try { return window.__BC_M56.currentTurnoId(); } catch (e) {}
    }
    return card ? card.getAttribute('data-turno-id') : null;
  }
  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    if (Array.isArray(v.sesiones)) return v.sesiones;
    if (Array.isArray(v.items)) return v.items;
    return [];
  }
  function terminal(st) {
    st = normalizar(st);
    return st === 'COMPLETADA' || st === 'CANCELADA' || st === 'CANCELLED' || st === 'ANULADA';
  }
  function orden(s) {
    var d = Number(s.numero_dia != null ? s.numero_dia : s.dia_n) || 999999;
    var b = normalizar(s.bloque) === 'MANANA' ? 1 : 2;
    return [d, b];
  }
  function anterior(a, b) {
    var x = orden(a), y = orden(b);
    return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
  }
  function elegible(rows) {
    var h = hoyNegocio();
    var all = rows.slice().filter(Boolean).sort(function (a, b) {
      var x = orden(a), y = orden(b);
      return x[0] - y[0] || x[1] - y[1];
    });
    for (var i = 0; i < all.length; i++) {
      var cur = all[i], st = normalizar(cur.estado);
      if (terminal(st) || st === 'EN_CURSO') continue;
      if (String(cur.fecha || '').slice(0, 10) !== h) continue;
      var bloqueada = false;
      for (var j = 0; j < all.length; j++) {
        if (anterior(all[j], cur) && !terminal(all[j].estado)) { bloqueada = true; break; }
      }
      if (!bloqueada) return String(cur.id);
    }
    return null;
  }
  function liberar(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('m56-lock', 'm57-locked');
    btn.removeAttribute('aria-disabled');
    btn.removeAttribute('title');
    btn.textContent = 'Abrir sesión';
  }
  function bloquear(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('m57-locked');
    btn.setAttribute('aria-disabled', 'true');
    btn.setAttribute('title', 'Esta sesión está bloqueada por la secuencia o por su fecha programada.');
    btn.innerHTML = '<span class="m57-lock-icon">🔒</span> Abrir sesión';
  }
  async function aplicar() {
    if (busy) return;
    var modal = document.querySelector('#m33-bg .m33-modal');
    if (!modal || !modal.querySelector('[data-m33-abrir-sesion]')) return;
    var id = turnoId(), a = api();
    if (!id || !a || typeof a.listarSesionesTurno !== 'function') return;
    busy = true;
    try {
      var rows = asArray(await a.listarSesionesTurno(id));
      var ok = elegible(rows);
      var buttons = modal.querySelectorAll('[data-m33-abrir-sesion]');
      Array.prototype.forEach.call(buttons, function (btn) {
        if (ok && String(btn.getAttribute('data-m33-abrir-sesion')) === ok) liberar(btn);
        else bloquear(btn);
      });
    } catch (e) {
      try { console.warn('[M62] No se pudo reconciliar elegibilidad de Turnos', e); } catch (_) {}
    } finally {
      busy = false;
    }
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; aplicar(); }, 35);
  }
  function bind() {
    if (observer) return;
    observer = new MutationObserver(function () { schedule(); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
    setTimeout(aplicar, 120);
    setTimeout(aplicar, 350);
    setTimeout(aplicar, 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.__BC_M62 = { aplicar: aplicar, hoyNegocio: hoyNegocio };
})();
