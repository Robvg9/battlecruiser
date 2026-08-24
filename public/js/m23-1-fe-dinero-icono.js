// BattleCruiser M23.1-FE — Icono Turnos + Dinero recogido (listar_entregas_caja)
// NO toca backend. NO reescribe m18. NO reintroduce legacy turnos.
(function () {
  'use strict';

  function setTabLabel(btn, text) {
    if (!btn) return;
    var lab = btn.querySelector('.bc-nav-label');
    if (lab) {
      lab.textContent = text;
      return;
    }
    if (btn.querySelector('.bc-nav-icon')) {
      var span = document.createElement('span');
      span.className = 'bc-nav-label';
      span.textContent = text;
      btn.appendChild(span);
      return;
    }
    btn.textContent = text;
  }

  function ensureTurnosLabelAndIcon() {
    var btn = document.querySelector('.tab-btn[data-tab="ciclos"]');
    if (!btn || btn.getAttribute('data-bc-permiso') !== '1') return;
    setTabLabel(btn, 'Turnos');
  }

  function patchClientRpc() {
    if (typeof client === 'undefined' || !client || typeof client.rpc !== 'function') return false;
    if (client.rpc.__m231Patched) return true;
    var orig = client.rpc.bind(client);
    client.rpc = function (name, params) {
      var p = params;
      if (name === 'listar_entregas_caja' && params && typeof params === 'object') {
        p = { p_ciclo_id: params.p_ciclo_id };
        if (params.p_ciclo_id == null && params.ciclo_id != null) p.p_ciclo_id = params.ciclo_id;
      }
      return orig(name, p).then(function (r) {
        if (name === 'listar_entregas_caja' && r && r.error) {
          try {
            console.warn('[BattleCruiser M23.1] listar_entregas_caja error', {
              message: r.error.message || r.error,
              code: r.error.code,
              details: r.error.details,
              hint: r.error.hint,
              params: p
            });
          } catch (e) {}
        }
        return r;
      });
    };
    client.rpc.__m231Patched = true;
    return true;
  }

  function hookPermisosLabel() {
    var orig = window.aplicarPermisosAInterfaz;
    if (typeof orig !== 'function' || orig.__m231LabelHook) {
      ensureTurnosLabelAndIcon();
      return typeof orig === 'function';
    }
    var wrapped = function () {
      var ret = orig.apply(this, arguments);
      try { ensureTurnosLabelAndIcon(); } catch (e) {}
      return ret;
    };
    wrapped.__m231LabelHook = true;
    if (orig.__bcOpHubHook) wrapped.__bcOpHubHook = true;
    window.aplicarPermisosAInterfaz = wrapped;
    try { aplicarPermisosAInterfaz = wrapped; } catch (e) {}
    ensureTurnosLabelAndIcon();
    return true;
  }

  function boot() {
    patchClientRpc();
    hookPermisosLabel();
    var n = 0;
    var t = setInterval(function () {
      patchClientRpc();
      hookPermisosLabel();
      ensureTurnosLabelAndIcon();
      if (++n > 40) clearInterval(t);
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
