// BattleCruiser M23-FE — Almacenes para TURNOS sin requerir almacenes.ver
// RPC real: listar_almacenes_para_turnos()
// NO toca sección Almacenes del menú. NO cambia permisos de almacenes.
(function () {
  'use strict';
  var RPC = 'listar_almacenes_para_turnos';
  var loading = false;

  function activosDesdeCache() {
    var list = (typeof _cache !== 'undefined' && _cache && Array.isArray(_cache.almacenes))
      ? _cache.almacenes
      : [];
    return list.filter(function (a) { return a && a.activo !== false; });
  }

  function mergeCache(rows) {
    if (!rows || !rows.length) return;
    try {
      if (typeof _cache === 'undefined' || !_cache) return;
      if (!Array.isArray(_cache.almacenes)) _cache.almacenes = [];
      var byId = {};
      _cache.almacenes.forEach(function (a) {
        if (a && a.id) byId[a.id] = a;
      });
      rows.forEach(function (r) {
        if (!r || !r.id) return;
        if (byId[r.id]) {
          byId[r.id].nombre = r.nombre != null ? r.nombre : byId[r.id].nombre;
          byId[r.id].tipo = r.tipo != null ? r.tipo : byId[r.id].tipo;
          byId[r.id].activo = r.activo !== false;
        } else {
          _cache.almacenes.push({
            id: r.id,
            nombre: r.nombre || r.id,
            tipo: r.tipo || null,
            activo: true
          });
        }
      });
    } catch (e) {}
  }

  async function asegurarAlmacenesParaTurnos() {
    var cached = activosDesdeCache();
    if (cached.length > 0) return cached;

    if (!navigator.onLine) return [];
    if (loading) return activosDesdeCache();
    loading = true;
    try {
      var r = await client.rpc(RPC, {});
      if (r && r.error) {
        console.warn('[BattleCruiser] listar_almacenes_para_turnos:', r.error);
        return activosDesdeCache();
      }
      var data = r ? r.data : [];
      var rows = Array.isArray(data) ? data : (data ? [data] : []);
      mergeCache(rows);
      return activosDesdeCache();
    } catch (e) {
      console.warn('[BattleCruiser] listar_almacenes_para_turnos:', e);
      return activosDesdeCache();
    } finally {
      loading = false;
    }
  }

  function mensajeSinAlmacenes() {
    return 'No hay almacenes activos disponibles para operar Turnos.';
  }

  function patchM21Home() {
    var M = window.BattleCruiserM21;
    if (!M || typeof M.home !== 'function' || M.__m23AlmPatched) return false;
    var orig = M.home;
    M.home = async function () {
      try {
        await asegurarAlmacenesParaTurnos();
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    M.__m23AlmPatched = true;
    return true;
  }

  async function refreshIfEmpty() {
    var root = document.getElementById('ciclos-m18-root');
    if (!root) return;
    var txt = (root.textContent || '');
    if (!/No hay almacenes disponibles/i.test(txt)) return;
    var list = await asegurarAlmacenesParaTurnos();
    if (list.length && window.BattleCruiserM21 && typeof window.BattleCruiserM21.home === 'function') {
      try { await window.BattleCruiserM21.home(); } catch (e) {}
    } else if (!list.length) {
      var empty = root.querySelector('.m21-empty');
      if (empty) empty.textContent = mensajeSinAlmacenes();
    }
  }

  function boot() {
    if (!patchM21Home()) {
      var n = 0;
      var t = setInterval(function () {
        if (patchM21Home() || ++n > 80) clearInterval(t);
      }, 100);
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.tab-btn[data-tab="ciclos"]');
      if (b) {
        setTimeout(function () {
          asegurarAlmacenesParaTurnos().then(function () {
            refreshIfEmpty();
            var root = document.getElementById('ciclos-m18-root');
            if (root && /No hay almacenes/i.test(root.textContent || '')) {
              if (window.BattleCruiserM21 && typeof window.BattleCruiserM21.home === 'function') {
                window.BattleCruiserM21.home();
              }
            }
          });
        }, 200);
      }
    });
  }

  window.asegurarAlmacenesParaTurnos = asegurarAlmacenesParaTurnos;
  window.__BC_M23_MSG_SIN_ALMACENES = mensajeSinAlmacenes;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
