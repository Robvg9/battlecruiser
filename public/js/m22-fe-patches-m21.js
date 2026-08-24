// BattleCruiser M22-FE — parches mínimos sobre M21 (m18-ciclos-ux.js)
// 1) Mensaje claro si ya hay ciclo activo al crear
// 2) Al aceptar inventario, usar ciclo_destino_id del backend
(function () {
  'use strict';
  function enhance() {
    var M = window.BattleCruiserM21;
    if (!M || M.__m22patched) return false;

    var root = document.getElementById('ciclos-m18-root');
    if (!root) return false;

    if (!root.dataset.m22AcceptPatch) {
      root.dataset.m22AcceptPatch = '1';
      root.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-m21-accept-inventory]');
        if (!b) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (!window.confirm('¿Confirmar que recibiste este inventario? Se creará automáticamente el próximo turno.')) return;
        var id = b.dataset.m21AcceptInventory;
        var uuid = crypto.randomUUID();
        try {
          if (typeof showLoading === 'function') showLoading();
          var r = await client.rpc('aceptar_entrega_inventario_turno', {
            p_entrega_id: id,
            p_idempotency_key: uuid,
            p_observacion: null
          });
          if (r.error) {
            var msg = document.getElementById('m21-msg');
            if (msg) { msg.textContent = String(r.error.message || r.error); msg.className = 'm21-msg error'; }
            return;
          }
          var data = r.data;
          if (Array.isArray(data)) data = data[0];
          var dest = data && (data.ciclo_destino_id || data.ciclo_destino || (data.ciclo && data.ciclo.id));
          if (dest && typeof M.enter === 'function') {
            await M.enter(dest);
          } else if (typeof M.finalStep === 'function') {
            await M.finalStep();
          } else if (typeof M.home === 'function') {
            await M.home();
          }
        } catch (err) {
          var m2 = document.getElementById('m21-msg');
          if (m2) { m2.textContent = String(err && err.message || err); m2.className = 'm21-msg error'; }
        } finally {
          if (typeof resetLoadingOverlay === 'function') resetLoadingOverlay();
          else if (typeof hideLoading === 'function') hideLoading();
        }
      }, true);
    }

    if (!root.dataset.m22CreatePatch) {
      root.dataset.m22CreatePatch = '1';
      root.addEventListener('click', function (e) {
        var b = e.target.closest('[data-m21-confirm-create]');
        if (!b) return;
        setTimeout(function () {
          var msg = document.getElementById('m21-msg');
          if (!msg) return;
          var t = (msg.textContent || '').toLowerCase();
          if (/activo|en_validacion|ya existe|unique|duplicate|un ciclo/i.test(t)) {
            msg.textContent = 'Ya hay un turno activo o en validación en este almacén. Cerralo o finalizalo antes de crear otro.';
            msg.className = 'm21-msg error';
          }
        }, 400);
      }, false);
    }

    M.__m22patched = true;
    return true;
  }

  function boot() {
    if (enhance()) return;
    var n = 0;
    var t = setInterval(function () {
      if (enhance() || ++n > 80) clearInterval(t);
    }, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
