// BattleCruiser — Fix guardar permisos de rol (v9.2.37)
// Refuerza #rol-permisos-guardar-btn con delegación en document (capture).
// RPC: actualizar_permisos_rol (B3/M11). No crea tablas ni RPC nuevas.
(function () {
  'use strict';
  if (window.__bcFixPermisosRol) return;
  window.__bcFixPermisosRol = true;

  function esc(v) {
    return typeof escHtml === 'function' ? escHtml(v) : String(v == null ? '' : v);
  }

  async function guardarPermisosDesdePanel(btn) {
    var panel = document.getElementById('rol-permisos-panel');
    if (!panel) {
      if (typeof setMsg === 'function') setMsg('msg-roles', 'No se encontró el panel de permisos.', false);
      return;
    }
    var roleId = btn.getAttribute('data-id');
    if (!roleId) {
      if (typeof setMsg === 'function') setMsg('msg-roles', 'Rol no identificado.', false);
      return;
    }
    var checks = panel.querySelectorAll('.permiso-check');
    var payload = Array.from(checks).map(function (c) {
      return {
        seccion: c.getAttribute('data-seccion'),
        accion: c.getAttribute('data-accion'),
        permitido: !!c.checked
      };
    });

    var feedback = panel.querySelector('.op-perm-save-msg');
    if (!feedback) {
      feedback = document.createElement('p');
      feedback.className = 'msg op-perm-save-msg';
      feedback.style.marginTop = '10px';
      panel.appendChild(feedback);
    }
    feedback.textContent = 'Guardando…';
    feedback.style.color = 'var(--mist)';

    btn.disabled = true;
    if (typeof showLoading === 'function') showLoading();
    try {
      if (!window.client) throw new Error('Backend no disponible');
      var res = await client.rpc('actualizar_permisos_rol', {
        p_role_id: roleId,
        p_permisos: payload
      });
      if (res.error) throw res.error;
      feedback.textContent = '✓ Permisos guardados.';
      feedback.style.color = '#9dcc9a';
      if (typeof setMsg === 'function') {
        setMsg('msg-roles', 'Permisos guardados. Los usuarios con este rol ya tienen los permisos nuevos.', true);
      }
      if (typeof registrarAuditoria === 'function') {
        registrarAuditoria('rol_permisos', 'Permisos del rol actualizados.', 'exito', roleId, null, null);
      }
    } catch (err) {
      var m = (err && (err.message || err.details || err.hint || err.code)) || String(err);
      feedback.textContent = 'No se pudieron guardar: ' + m;
      feedback.style.color = '#e8a0a0';
      if (typeof setMsg === 'function') setMsg('msg-roles', 'No se pudieron guardar los permisos: ' + esc(m), false);
      console.warn('[Battlecruiser] actualizar_permisos_rol', err);
    } finally {
      btn.disabled = false;
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#rol-permisos-guardar-btn, .rol-permisos-guardar-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    guardarPermisosDesdePanel(btn);
  }, true);
})();
