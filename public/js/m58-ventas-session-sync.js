// BattleCruiser — M58 · fuente autoritativa de sesión para Ventas
// v58.2 — Ventas no depende de la carrera de _turnoActual: revalida sesión al entrar,
// después de autenticación/contexto y vuelve a pintar el POS con el resultado del RPC.
(function () {
  'use strict';
  if (window.__bcM58VentasSessionSync) return;
  window.__bcM58VentasSessionSync = true;

  var busy = false;
  var seq = 0;

  function tieneSesionPositiva(data) {
    return !!(data && data.estado === 'ABIERTO' && data.almacen_id);
  }

  function aplicarEstado(data) {
    try { _turnoActual = data || null; } catch (e) {}
    try { window._turnoActual = data || null; } catch (e2) {}
    try {
      if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
    } catch (e3) {}
    return data;
  }

  async function sync(opts) {
    opts = opts || {};
    if (busy || !navigator.onLine || typeof client === 'undefined' || !client || typeof client.rpc !== 'function') return null;
    busy = true;
    var mySeq = ++seq;
    try {
      var r = await client.rpc('turno_actual_usuario', {});
      if (r && r.error) throw r.error;
      var data = r ? r.data : null;
      // Solo la consulta más reciente puede escribir la cache.
      if (mySeq === seq) aplicarEstado(data);

      // Cuando Ventas ya está visible, el catálogo/historial también debe recibir el
      // estado nuevo; de lo contrario puede quedar la UI de "sin sesión" de un render previo.
      if (opts.refreshVentas !== false && isVentas()) {
        try {
          if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
        } catch (e4) {}
        try {
          if (typeof refrescarVentas === 'function') await refrescarVentas();
        } catch (e5) {}
        try {
          if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
        } catch (e6) {}
      }
      return data;
    } catch (e) {
      try { console.warn('[M58] No se pudo sincronizar sesión de Ventas', e); } catch (x) {}
      return null;
    } finally {
      busy = false;
    }
  }

  function isVentas() {
    var p = document.getElementById('tab-ventas');
    return !!(p && (p.classList.contains('visible') || !p.classList.contains('hidden')));
  }

  function bindIrATab() {
    if (typeof window.irATab !== 'function' || window.irATab.__bcM58Patched) return;
    var orig = window.irATab;
    var wrapped = function (tab) {
      var ret = orig.apply(this, arguments);
      if (tab === 'ventas') {
        setTimeout(function () { sync({ refreshVentas: true }); }, 0);
        setTimeout(function () { sync({ refreshVentas: true }); }, 250);
      }
      return ret;
    };
    wrapped.__bcM58Patched = true;
    window.irATab = wrapped;
    try { irATab = wrapped; } catch (e) {}
  }

  function bindAuth() {
    try {
      if (!client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') return;
      client.auth.onAuthStateChange(function (event, session) {
        if (!session) return;
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          setTimeout(function () { sync({ refreshVentas: isVentas() }); }, 150);
          setTimeout(function () { sync({ refreshVentas: isVentas() }); }, 900);
        }
      });
    } catch (e) {
      try { console.warn('[M58] no pudo enlazar auth', e); } catch (x) {}
    }
  }

  function bindContextReady() {
    try {
      var previous = window.__bcOnContextoLoaderReady;
      window.__bcOnContextoLoaderReady = function () {
        try {
          if (typeof previous === 'function') previous();
        } catch (e) {}
        setTimeout(function () { sync({ refreshVentas: isVentas() }); }, 50);
        setTimeout(function () { sync({ refreshVentas: isVentas() }); }, 500);
      };
    } catch (e) {}
  }

  function bind() {
    bindIrATab();
    bindAuth();
    bindContextReady();

    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.tab-btn[data-tab="ventas"]') : null;
      if (!btn) return;
      setTimeout(function () { sync({ refreshVentas: true }); }, 20);
      setTimeout(function () { sync({ refreshVentas: true }); }, 350);
    }, true);

    window.addEventListener('pageshow', function () {
      if (isVentas()) sync({ refreshVentas: true });
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && isVentas()) sync({ refreshVentas: true });
    });

    // Boot de seguridad: cubre sesión ya autenticada y cargas lentas del contexto.
    [250, 800, 1500, 3000].forEach(function (ms) {
      setTimeout(function () { sync({ refreshVentas: isVentas() }); }, ms);
    });
  }

  window.__BC_M58 = {
    sync: sync,
    hasActiveTurn: tieneSesionPositiva
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
