// BattleCruiser — M58 · fuente única de sesión para Ventas
// Ventas consulta directamente turno_actual_usuario() al entrar.
(function () {
  'use strict';
  if (window.__bcM58VentasSessionSync) return;
  window.__bcM58VentasSessionSync = true;

  var busy = false;

  async function sync() {
    if (busy || !navigator.onLine || typeof client === 'undefined' || !client || typeof client.rpc !== 'function') return null;
    busy = true;
    try {
      var r = await client.rpc('turno_actual_usuario', {});
      if (r && r.error) throw r.error;
      var data = r ? r.data : null;
      try { _turnoActual = data || null; } catch (e) {}
      try { window._turnoActual = data || null; } catch (e2) {}
      if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
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

  function bind() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.tab-btn[data-tab="ventas"]') : null;
      if (!btn) return;
      setTimeout(sync, 20);
      setTimeout(sync, 300);
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && isVentas()) sync();
    });
    setTimeout(sync, 900);
    setTimeout(sync, 1800);
  }

  window.__BC_M58 = { sync: sync };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
