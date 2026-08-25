// BattleCruiser M27.4-FE — Restricción visual de Turnos por asignación/día
// Dependientes: solo muestran el ciclo si tienen una sesión asignada para hoy.
(function () {
  'use strict';
  if (window.__BC_M274__) return;
  window.__BC_M274__ = true;

  function isAdmin() {
    return typeof tienePermiso === 'function' && tienePermiso('ciclos', 'editar_any');
  }

  function uid() {
    try {
      return (typeof _usuarioActual !== 'undefined' && _usuarioActual && _usuarioActual.id) || null;
    } catch (e) {
      return null;
    }
  }

  function norm(v) {
    return String(v == null ? '' : v);
  }

  function todayIso() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function cicloButtons() {
    return Array.from(document.querySelectorAll('[data-m21-enter]'));
  }

  function cardForButton(btn) {
    return btn && (btn.closest('.m21-card') || btn.closest('[data-m21-enter]')?.parentElement || null);
  }

  async function sesionesDelCiclo(cicloId) {
    if (!cicloId || typeof client === 'undefined' || !client.rpc) return [];
    var r = await client.rpc('listar_sesiones_operativas', {
      p_ciclo_id: cicloId,
      p_almacen_id: null,
      p_fecha: null,
      p_estado: null
    });
    if (r && r.error) throw r.error;
    var d = r ? r.data : [];
    return Array.isArray(d) ? d : (d ? [d] : []);
  }

  function esSesionAsignadaHoy(s) {
    var me = uid();
    if (!me || !s) return false;
    var assigned = s.usuario_id || s.trabajador_id || s.responsable_id || null;
    if (!assigned || norm(assigned) !== norm(me)) return false;
    return norm(s.fecha).slice(0, 10) === todayIso();
  }

  function ocultarFilasNoHoy(card) {
    var panel = card && card.querySelector('#m22-sesiones-lista');
    if (!panel) return;
    var today = todayIso();
    panel.querySelectorAll('.m21-row').forEach(function (row) {
      var txt = row.textContent || '';
      // M22 ya filtra por usuario en backend; aquí solo eliminamos filas de fechas distintas.
      var m = txt.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
      if (!m) return;
      var raw = m[1];
      var iso = raw.indexOf('-') === 4 ? raw : raw.split('/').reverse().join('-');
      row.style.display = iso === today ? '' : 'none';
    });
  }

  async function aplicarRestriccion() {
    if (isAdmin()) return;
    var me = uid();
    if (!me) return;
    var buttons = cicloButtons();
    if (!buttons.length) return;

    await Promise.all(buttons.map(async function (btn) {
      var cicloId = btn.dataset.m21Enter;
      var card = cardForButton(btn);
      if (!card || !cicloId) return;
      try {
        var sesiones = await sesionesDelCiclo(cicloId);
        var tieneHoy = sesiones.some(esSesionAsignadaHoy);
        card.style.display = tieneHoy ? '' : 'none';
        card.dataset.m274Visible = tieneHoy ? '1' : '0';
        if (tieneHoy) ocultarFilasNoHoy(card);
      } catch (e) {
        // Ante error de carga no inventamos acceso: ocultamos la tarjeta para dependientes.
        card.style.display = 'none';
        card.dataset.m274Visible = '0';
      }
    }));
  }

  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      aplicarRestriccion().catch(function (e) {
        try { console.warn('[M27.4] restricción de turnos', e); } catch (x) {}
      });
    }, 180);
  }

  function init() {
    schedule();
    var root = document.getElementById('ciclos-m18-root');
    if (!root || root.dataset.m274Obs === '1') return;
    root.dataset.m274Obs = '1';
    new MutationObserver(function () { schedule(); }).observe(root, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
