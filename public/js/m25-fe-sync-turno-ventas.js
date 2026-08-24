// BattleCruiser M25-FE — Sincronizar turno ABIERTO con Ventas + estados declaración
// Causa: refrescarTurnoActual() hacía return si no existía #turno-actual (legacy oculto)
// y nunca actualizaba _turnoActual tras iniciar_sesion_operativa.
// Fuente de verdad: RPC turno_actual_usuario(). NO inventa turnos locales.
(function () {
  'use strict';

  async function consultarTurnoActualUsuario() {
    if (typeof client === 'undefined' || !client || typeof client.rpc !== 'function') return null;
    if (!navigator.onLine) return undefined;
    var r = await client.rpc('turno_actual_usuario', {});
    if (r && r.error) {
      try { console.warn('[M25] turno_actual_usuario', r.error); } catch (e) {}
      throw r.error;
    }
    return r ? r.data : null;
  }

  function setTurnoCache(data) {
    try { _turnoActual = data || null; } catch (e) {}
    try { window._turnoActual = data || null; } catch (e) {}
  }

  async function refrescarTurnoSiempre() {
    try {
      var data = await consultarTurnoActualUsuario();
      if (data === undefined) return;
      setTurnoCache(data);
      var el = document.getElementById('turno-actual');
      if (el && typeof renderTurnoActual === 'function') {
        try { renderTurnoActual(data); } catch (e) {}
      }
      var abierto = !!(data && data.estado === 'ABIERTO');
      var btnAbrir = document.getElementById('btn-abrir-turno');
      var btnCerrar = document.getElementById('btn-cerrar-turno');
      var selAbrir = document.getElementById('turno-almacen-abrir');
      if (btnAbrir) btnAbrir.classList.toggle('hidden', abierto);
      if (btnCerrar) btnCerrar.classList.toggle('hidden', !abierto);
      if (selAbrir) selAbrir.classList.toggle('hidden', abierto);
      if (typeof actualizarPanelAlmacenVenta === 'function') {
        try { actualizarPanelAlmacenVenta(); } catch (e) {}
      }
      return data;
    } catch (e) {
      try { console.warn('[M25] refrescarTurnoSiempre', e); } catch (x) {}
      return null;
    }
  }

  function patchRefrescarTurnoActual() {
    if (typeof window.refrescarTurnoActual !== 'function') return false;
    if (window.refrescarTurnoActual.__m25Patched) return true;
    var orig = window.refrescarTurnoActual;
    var wrapped = async function () {
      await refrescarTurnoSiempre();
      try {
        var el = document.getElementById('turno-actual');
        if (el) await orig.apply(this, arguments);
      } catch (e) {}
      if (typeof actualizarPanelAlmacenVenta === 'function') {
        try { actualizarPanelAlmacenVenta(); } catch (e) {}
      }
    };
    wrapped.__m25Patched = true;
    window.refrescarTurnoActual = wrapped;
    try { refrescarTurnoActual = wrapped; } catch (e) {}
    return true;
  }

  function patchIrATabVentas() {
    if (typeof window.irATab !== 'function' || window.irATab.__m25Patched) {
      return typeof window.irATab === 'function';
    }
    var orig = window.irATab;
    var wrapped = function (tab) {
      var ret = orig.apply(this, arguments);
      if (tab === 'ventas') {
        setTimeout(function () {
          refrescarTurnoSiempre().then(function () {
            if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
          });
        }, 50);
      }
      return ret;
    };
    wrapped.__m25Patched = true;
    window.irATab = wrapped;
    try { irATab = wrapped; } catch (e) {}
    return true;
  }

  function clearTurnoOnLogout() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('#logout-btn, #bc-sin-permisos-logout');
      if (!btn) return;
      setTurnoCache(null);
    }, true);
  }

  window.__BC_M25_labelEstadoSesion = function (estado) {
    var k = String(estado || '').toUpperCase();
    if (k === 'PENDIENTE') return 'Sin comenzar';
    if (k === 'EN_CURSO') return 'En proceso';
    if (k === 'COMPLETADA') return 'Completada';
    if (k === 'CANCELADA') return 'Cancelada';
    return estado || '—';
  };

  window.__BC_M25_refrescarTurno = refrescarTurnoSiempre;

  function annotateDeclaracionCards() {
    document.querySelectorAll('[data-sesion-estado]').forEach(function (el) {
      var st = el.getAttribute('data-sesion-estado');
      var lab = window.__BC_M25_labelEstadoSesion(st);
      var badge = el.querySelector('.m25-decl-estado');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'm25-decl-estado muted';
        el.appendChild(badge);
      }
      var icon = st === 'EN_CURSO' ? '🟡' : (st === 'COMPLETADA' ? '🟢' : '⚪');
      badge.textContent = icon + ' ' + lab;
    });
  }

  function boot() {
    patchRefrescarTurnoActual();
    patchIrATabVentas();
    clearTurnoOnLogout();
    setTimeout(function () { refrescarTurnoSiempre(); }, 800);
    setTimeout(function () { patchRefrescarTurnoActual(); patchIrATabVentas(); }, 1500);
    var t = null;
    var root = document.getElementById('ciclos-m18-root') || document.body;
    new MutationObserver(function () {
      if (t) clearTimeout(t);
      t = setTimeout(annotateDeclaracionCards, 100);
    }).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
