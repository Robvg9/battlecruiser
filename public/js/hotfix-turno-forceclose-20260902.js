// BattleCruiser — Recuperación auditada de turnos vencidos (ADMIN only)
(function () {
  'use strict';
  if (window.__BCForceClose20260902) return;
  window.__BCForceClose20260902 = true;

  const snapshots = Object.create(null);

  function localDateKey() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  async function isAdmin() {
    // M33 already resolves ADMIN before rendering its five-step wizard. Reuse
    // that exact decision first so the recovery control cannot disagree with
    // the authorization state that made Resumen available in the first place.
    try {
      const m29 = window.__BC_M29__;
      if (m29 && typeof m29.isAdmin === 'function' && m29.isAdmin() === true) return true;
    } catch (e) {}

    try {
      if (window.BattleCruiserTurnoAPI && typeof window.BattleCruiserTurnoAPI.actorIsAdmin === 'function') {
        const r = await window.BattleCruiserTurnoAPI.actorIsAdmin();
        if (r === true || r === 'true' || r === 1 || r === '1' || (r && (r.is_admin === true || r.isAdmin === true))) return true;
      }
    } catch (e) {}
    try {
      if (typeof window.tienePermiso === 'function' && window.tienePermiso('turnos', 'editar_any')) return true;
    } catch (e) {}

    // Fallback for older sessions whose role is exposed directly on the user.
    const users = [window.__bcUser, window._usuarioActual].filter(Boolean);
    for (const user of users) {
      if (user.is_admin === true || user.isAdmin === true) return true;
      const role = String(user.rol || user.role || user.nombre_rol || user.rol_nombre || '').trim().toLowerCase();
      if (role.indexOf('due') === 0 || role === 'admin' || role === 'administrador' || role === 'owner') return true;
    }
    return false;
  }

  async function readOverdueTurn(turnoId, refresh) {
    if (!refresh && snapshots[turnoId]) return snapshots[turnoId];
    const request = (async function () {
      const api = window.BattleCruiserTurnoAPI;
      if (!api || typeof api.obtenerExpedienteTurno !== 'function') return null;
      const raw = await api.obtenerExpedienteTurno(turnoId);
      const turn = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : null) : raw;
      if (!turn || String(turn.id || '') !== String(turnoId)) return null;

      const status = String(turn.estado_maestro || turn.estado || '').toUpperCase();
      let endDate = String(turn.fecha_fin || turn.fin_plan || turn.fecha_fin_plan || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        const startDate = String(turn.fecha_inicio || turn.inicio_plan || turn.fecha || '').slice(0, 10);
        const days = Number(turn.dias_turno || turn.cantidad_dias || turn.dias);
        if (/^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number.isInteger(days) && days >= 1) {
          const parts = startDate.split('-').map(Number);
          endDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days - 1)).toISOString().slice(0, 10);
        } else {
          endDate = '';
        }
      }
      const active = ['ABIERTO', 'EN_CURSO', 'PENDIENTE_APROBACION'].includes(status);
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate);
      if (!active || !validDate || endDate >= localDateKey()) return null;

      return { id: turn.id, status, endDate };
    })();
    snapshots[turnoId] = request;
    try {
      const result = await request;
      snapshots[turnoId] = Promise.resolve(result);
      return result;
    } catch (e) {
      delete snapshots[turnoId];
      throw e;
    }
  }

  function setMessage(modal, message, isError) {
    const el = modal && modal.querySelector('.bc-force-close-msg');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'bc-force-close-msg m33-msg' + (isError ? ' error' : ' ok');
  }

  function isSummaryStep(modal) {
    if (!modal) return false;
    const steps = modal.querySelectorAll('.m33-step');
    const active = modal.querySelector('.m33-step.active');
    return !!(steps.length && active && active === steps[steps.length - 1] &&
      /resumen/i.test(active.textContent || ''));
  }

  function watchModal(turnoId, modal) {
    if (!modal || modal.__bcForceCloseObserver) return;
    const observer = new MutationObserver(function () {
      if (!document.body.contains(modal)) {
        observer.disconnect();
        modal.__bcForceCloseObserver = null;
        return;
      }
      addButton(turnoId).catch(function (e) {
        console.warn('[BattleCruiser] No se pudo actualizar la recuperación en el paso actual:', e);
      });
    });
    observer.observe(modal, { childList: true, subtree: true });
    const detachObserver = new MutationObserver(function () {
      if (document.body.contains(modal)) return;
      observer.disconnect();
      detachObserver.disconnect();
      modal.__bcForceCloseObserver = null;
    });
    // Only watch direct body children for modal removal; do not observe the whole app subtree.
    detachObserver.observe(document.body, { childList: true });
    modal.__bcForceCloseObserver = observer;
  }

  async function addButton(turnoId) {
    const modal = document.getElementById('m33-bg');
    if (!modal || !turnoId) return;
    const existingPanel = modal.querySelector('.bc-force-close-panel');

    // The action belongs in Resumen only. M33 replaces the entire footer as
    // the user advances, so a MutationObserver re-evaluates each rendered step.
    if (!isSummaryStep(modal)) {
      if (existingPanel) existingPanel.remove();
      return;
    }
    if (!(await isAdmin())) {
      if (existingPanel) existingPanel.remove();
      return;
    }
    if (modal.getAttribute('data-turno-id') === String(turnoId) && existingPanel) return;

    let turn;
    try {
      turn = await readOverdueTurn(turnoId, false);
    } catch (e) {
      console.warn('[BattleCruiser] No se pudo comprobar si el turno venció; se omite la recuperación:', e);
      return;
    }
    if (!turn) return;

    modal.setAttribute('data-turno-id', String(turnoId));
    const foot = modal.querySelector('.m33-foot');
    if (!foot) return;
    const existing = foot.querySelector('.bc-force-close-panel');
    if (existing) existing.remove();

    // Keep the recovery action in its own full-width footer row. The previous
    // siblings competed for the same nowrap flex line and could place the
    // control outside the visible mobile footer.
    foot.style.flexWrap = 'wrap';
    const panel = document.createElement('div');
    panel.className = 'bc-force-close-panel';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Recuperación administrativa de turno vencido');
    panel.style.cssText = 'box-sizing:border-box;display:flex;flex:0 0 100%;flex-direction:column;align-items:stretch;gap:6px;width:100%;max-width:100%;min-width:0;padding-top:6px;';

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bc-force-close-turno danger';
    b.textContent = 'Cierre forzado (turno vencido)';
    b.title = 'Solo ADMIN. Requiere motivo y confirmación; no inventa dinero ni conteos de inventario.';
    b.style.cssText = 'box-sizing:border-box;width:100%;max-width:100%;min-height:44px;white-space:normal;text-align:center;';

    const message = document.createElement('p');
    message.className = 'bc-force-close-msg m33-msg';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    message.style.cssText = 'box-sizing:border-box;width:100%;margin:0;';

    panel.appendChild(b);
    panel.appendChild(message);
    foot.appendChild(panel);

    b.addEventListener('click', async function () {
      if (b.disabled) return;
      if (!(await isAdmin())) {
        b.remove();
        setMessage(modal, 'La cuenta ya no tiene permiso ADMIN; no se realizó ningún cambio.', true);
        return;
      }

      let current;
      try { current = await readOverdueTurn(turnoId, true); }
      catch (e) {
        setMessage(modal, 'No se pudo verificar el estado actual del turno. No se cerró.', true);
        return;
      }
      if (!current) {
        setMessage(modal, 'Este turno ya no aparece vencido y abierto. Se bloqueó el cierre forzado.', true);
        b.remove();
        return;
      }

      const motivo = window.prompt(
        'Motivo obligatorio del cierre administrativo del turno vencido (mínimo 12 caracteres):',
        ''
      );
      if (motivo === null) return;
      const reason = String(motivo).trim();
      if (reason.length < 12 || reason.length > 1000) {
        setMessage(modal, 'Motivo inválido: escribe entre 12 y 1000 caracteres.', true);
        return;
      }
      const confirmed = window.confirm(
        'CIERRE ADMINISTRATIVO IRREVERSIBLE\n\n' +
        'El turno vencido pasará a CERRADO. Los tramos activos se terminarán; las sesiones pendientes se cancelarán y las que estaban en curso se marcarán con cierre forzado. ' +
        'No se crearán declaraciones de dinero ni conteos de inventario. Quedará una nota de auditoría que requiere revisión manual.\n\n¿Confirmas el cierre?'
      );
      if (!confirmed) return;

      b.disabled = true;
      setMessage(modal, 'Registrando cierre y auditoría…', false);
      try {
        if (!window.client || typeof window.client.rpc !== 'function') throw new Error('Cliente de backend no disponible.');
        const r = await window.client.rpc('bc_forzar_cierre_turno_admin', {
          p_turno_id: turnoId,
          p_motivo: reason
        });
        if (r && r.error) throw r.error;
        const data = r && Array.isArray(r.data) ? (r.data.length === 1 ? r.data[0] : null) : (r && r.data);
        if (!data || (String(data.estado || '').toUpperCase() !== 'CERRADO' && data.ya_cerrado !== true)) {
          throw new Error('El backend no confirmó CERRADO; verifica el expediente antes de reintentar.');
        }

        delete snapshots[turnoId];
        window.dispatchEvent(new window.CustomEvent('bc-turno-force-closed', {
          detail: {
            turnoId,
            estado: 'CERRADO',
            motivo: reason,
            requiereRevisionManual: true,
            declaracionesDineroCreadas: 0,
            conteosInventarioCreados: 0
          }
        }));
        setMessage(modal, 'Turno cerrado y motivo auditado. No se inventaron montos ni conteos; requiere revisión manual.', false);
        if (typeof window.refrescarTurnos === 'function') await window.refrescarTurnos();
        if (window.__BC_M29__ && typeof window.__BC_M29__.renderHome === 'function') {
          await window.__BC_M29__.renderHome();
        }
        const closeBtn = modal.querySelector('#m33-close-final,#m33-x,.m33-cerrar,.m33-close,[data-m33-close]');
        if (closeBtn) closeBtn.click();
      } catch (e) {
        setMessage(modal, 'No se pudo cerrar el turno: ' + String(e && e.message || e), true);
        b.disabled = false;
      }
    });
  }

  function wrapOpen() {
    const hub = window.__BC_M33;
    if (!hub || typeof hub.open !== 'function' || hub.open.__bcForceCloseWrapped) return false;
    const original = hub.open;
    const wrapped = async function (turnoId) {
      const result = await original.apply(this, arguments);
      const modal = document.getElementById('m33-bg');
      watchModal(turnoId, modal);
      await addButton(turnoId);
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
    if (id) {
      watchModal(id, active);
      addButton(id);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  setTimeout(boot, 300);
  setTimeout(boot, 1000);
})();
