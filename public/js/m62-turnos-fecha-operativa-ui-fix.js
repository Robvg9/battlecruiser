// BattleCruiser — M62 · fecha operativa UI de Turnos
// Corrige el bloqueo prematuro de M56/M57 cuando el navegador usa UTC u otra zona.
// La fecha operativa del negocio es America/Puerto_Rico; la RPC del backend sigue siendo la autoridad final.
(function () {
  'use strict';
  if (window.__BC_M62_TURNOS_FECHA_UI) return;
  window.__BC_M62_TURNOS_FECHA_UI = true;

  var ZONA_NEGOCIO = 'America/Puerto_Rico';
  var intervalo = null;
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
    var card = document.querySelector('.m29-card[data-turno-id]');
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
  function css() {
    if (document.getElementById('bc-m62-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-m62-css';
    s.textContent = '.m62-eligible{font-size:0!important}.m62-eligible::after{content:"Abrir sesión";font-size:.9rem}';
    document.head.appendChild(s);
  }
  function liberar(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('m56-lock', 'm57-locked');
    btn.classList.add('m62-eligible');
    btn.removeAttribute('aria-disabled');
    btn.removeAttribute('title');
  }
  function bloquear(btn) {
    if (!btn) return;
    btn.classList.remove('m62-eligible');
    btn.disabled = true;
    btn.classList.add('m57-locked');
    btn.setAttribute('aria-disabled', 'true');
    btn.setAttribute('title', 'Esta sesión está bloqueada por la secuencia o por su fecha programada.');
  }
  async function cargarElegible() {
    if (busy) return null;
    var modal = document.querySelector('#m33-bg .m33-modal');
    if (!modal || !modal.querySelector('[data-m33-abrir-sesion]')) return null;
    var id = turnoId(), a = api();
    if (!id || !a || typeof a.listarSesionesTurno !== 'function') return null;
    busy = true;
    try {
      var rows = asArray(await a.listarSesionesTurno(id));
      return elegible(rows);
    } catch (e) {
      return null;
    } finally {
      busy = false;
    }
  }
  async function aplicar() {
    css();
    var ok = await cargarElegible();
    var modal = document.querySelector('#m33-bg .m33-modal');
    if (!modal) return;
    Array.prototype.forEach.call(modal.querySelectorAll('[data-m33-abrir-sesion]'), function (btn) {
      if (ok && String(btn.getAttribute('data-m33-abrir-sesion')) === ok) liberar(btn);
      else bloquear(btn);
    });
  }
  function bind() {
    // Window-capture ocurre antes del document-capture de M57.
    window.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-m33-abrir-sesion]') : null;
      if (!btn) return;
      cargarElegible().then(function (ok) {
        if (ok && String(btn.getAttribute('data-m33-abrir-sesion')) === ok) {
          liberar(btn);
        }
      });
    }, true);
    intervalo = setInterval(function () { aplicar(); }, 150);
    aplicar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.__BC_M62 = { aplicar: aplicar, hoyNegocio: hoyNegocio };
})();
