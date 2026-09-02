// BattleCruiser — Forzar cierre de Turno (ADMIN only)
(function () {
  'use strict';
  if (window.__BCForceClose20260902) return;
  window.__BCForceClose20260902 = true;

  async function isAdmin() {
    try {
      if (window.BattleCruiserTurnoAPI && typeof window.BattleCruiserTurnoAPI.actorIsAdmin === 'function') {
        const r = await window.BattleCruiserTurnoAPI.actorIsAdmin();
        if (r === true || r === 'true' || r === 1 || r === '1' || (r && (r.is_admin === true || r.isAdmin === true))) return true;
      }
    } catch (e) {}
    try {
      if (typeof window.tienePermiso === 'function' && window.tienePermiso('turnos', 'editar_any')) return true;
      const u = window._usuarioActual;
      const r = String(u && (u.rol || u.role || u.rol_nombre) || '').toLowerCase();
      return ['dueño','dueno','admin','administrador'].includes(r);
    } catch (e) { return false; }
  }

  async function addButton(turnoId) {
    const modal = document.getElementById('m33-bg');
    if (!modal || !turnoId || !(await isAdmin())) return;
    modal.setAttribute('data-turno-id', String(turnoId));
    const foot = modal.querySelector('.m33-foot');
    if (!foot || foot.querySelector('.bc-force-close-turno')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bc-force-close-turno';
    b.textContent = 'Forzar cierre';
    b.title = 'Cerrar este turno de forma administrativa. Solo ADMIN.';
    b.onclick = async function () {
      if (!(await isAdmin())) { b.remove(); return; }
      const motivo = window.prompt('Motivo del cierre forzado:', 'Cierre forzado por ADMIN');
      if (motivo === null) return;
      b.disabled = true;
      try {
        const r = await window.client.rpc('bc_forzar_cierre_turno_admin', {
          p_turno_id: turnoId,
          p_motivo: motivo
        });
        if (r && r.error) throw r.error;
        window.dispatchEvent(new CustomEvent('bc-turno-force-closed', { detail: { turnoId } }));
        if (typeof window.refrescarTurnos === 'function') await window.refrescarTurnos();
        const closeBtn = modal.querySelector('.m33-cerrar,.m33-close,[data-m33-close]');
        if (closeBtn) closeBtn.click();
      } catch (e) {
        window.alert('No se pudo forzar el cierre: ' + (e && e.message ? e.message : e));
        b.disabled = false;
      }
    };
    foot.appendChild(b);
  }

  function wrapOpen() {
    const hub = window.__BC_M33;
    if (!hub || typeof hub.open !== 'function' || hub.open.__bcForceCloseWrapped) return false;
    const original = hub.open;
    const wrapped = async function (turnoId) {
      const result = await original.apply(this, arguments);
      await addButton(turnoId);
      setTimeout(() => { addButton(turnoId); }, 0);
      setTimeout(() => { addButton(turnoId); }, 200);
      return result;
    };
    wrapped.__bcForceCloseWrapped = true;
    hub.open = wrapped;
    return true;
  }

  function boot() {
    wrapOpen();
    const active = document.getElementById('m33-bg');
    const id = active && active.getAttribute('data-turno-id');
    if (id) addButton(id);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
  setTimeout(boot, 300);
  setTimeout(boot, 1000);
})();