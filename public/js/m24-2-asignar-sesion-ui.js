// BattleCruiser M24.2-FE — Modal "Asignar trabajador" en Sesiones de trabajo
// Reutiliza __BC_M24__.candidatosParaSesion + asignarSesion
// Admin: ciclos.editar_any
(function () {
  'use strict';
  var MODAL_ID = 'm24-2-asig-modal';

  function isAdmin() {
    return typeof tienePermiso === 'function' && tienePermiso('ciclos', 'editar_any');
  }
  function esc(v) {
    return typeof escHtml === 'function' ? escHtml(v == null ? '' : v) : String(v == null ? '' : v);
  }
  function labelBloque(b) {
    if (window.__BC_M24__ && window.__BC_M24__.labelBloque) return window.__BC_M24__.labelBloque(b);
    var s = String(b || '').toUpperCase();
    if (s === 'MANANA' || s === 'MAÑANA') return 'Mañana';
    if (s === 'TARDE') return 'Tarde';
    return b || '—';
  }

  function ensureModal() {
    var el = document.getElementById(MODAL_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = MODAL_ID;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText =
      'display:none;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.55);padding:16px;';
    el.innerHTML =
      '<div class="m21-card" style="max-width:380px;width:100%;margin:0;box-shadow:0 12px 40px rgba(0,0,0,.45)">' +
      '<h4 id="m24-2-title" style="margin-top:0">Asignar trabajador</h4>' +
      '<p id="m24-2-meta" class="muted" style="margin:0 0 12px"></p>' +
      '<label style="display:block;margin-bottom:12px">Trabajador' +
      '<select id="m24-2-select" style="display:block;width:100%;margin-top:6px;padding:8px;border-radius:8px"></select>' +
      '</label>' +
      '<p id="m24-2-empty" class="muted" style="display:none">No hay trabajadores autorizados para este almacén y bloque. Creá primero una asignación operativa en el panel de Asignaciones.</p>' +
      '<p id="m24-2-err" class="m21-msg error" style="display:none"></p>' +
      '<div class="m21-actions" style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="cc-accion" id="m24-2-confirm">Confirmar asignación</button>' +
      '<button type="button" class="cc-accion" id="m24-2-cancel" style="opacity:.85">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) closeModal(null);
    });
    document.getElementById('m24-2-cancel').addEventListener('click', function () {
      closeModal(null);
    });
    document.getElementById('m24-2-confirm').addEventListener('click', onConfirm);
    return el;
  }

  var pending = null;

  function closeModal(result) {
    var el = document.getElementById(MODAL_ID);
    if (el) el.style.display = 'none';
    var p = pending;
    pending = null;
    if (p && typeof p.resolve === 'function') p.resolve(result);
  }

  async function onConfirm() {
    if (!pending) return;
    var M = window.__BC_M24__;
    var sel = document.getElementById('m24-2-select');
    var userId = sel && sel.value;
    var err = document.getElementById('m24-2-err');
    var conf = document.getElementById('m24-2-confirm');
    if (!userId || !M) return;
    conf.disabled = true;
    err.style.display = 'none';
    try {
      await M.asignarSesion(pending.sesionId, userId);
      var name = (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || '';
      closeModal({ usuarioId: userId, nombre: name });
    } catch (e) {
      err.style.display = 'block';
      err.textContent = 'No se pudo asignar: ' + String(e && (e.message || e.details) || e);
      conf.disabled = false;
    }
  }

  function openAsignarModal(opts) {
    opts = opts || {};
    return new Promise(async function (resolve) {
      if (!isAdmin()) {
        resolve(null);
        return;
      }
      var M = window.__BC_M24__;
      if (!M) {
        resolve(null);
        return;
      }
      ensureModal();
      pending = {
        resolve: resolve,
        sesionId: opts.sesionId,
        almId: opts.almId,
        bloque: opts.bloque
      };
      document.getElementById('m24-2-title').textContent = opts.isChange
        ? 'Cambiar trabajador'
        : 'Asignar trabajador';
      document.getElementById('m24-2-meta').textContent =
        'Bloque: ' + labelBloque(opts.bloque) +
        (opts.almLabel ? ' · ' + opts.almLabel : '');
      document.getElementById('m24-2-err').style.display = 'none';
      document.getElementById('m24-2-err').textContent = '';

      try {
        await M.listarAsignaciones({});
        if (M.cargarUsuarios) await M.cargarUsuarios();
      } catch (e) {}

      var cands = M.candidatosParaSesion(opts.almId, opts.bloque) || [];
      var sel = document.getElementById('m24-2-select');
      var empty = document.getElementById('m24-2-empty');
      var conf = document.getElementById('m24-2-confirm');
      if (!cands.length) {
        sel.innerHTML = '';
        sel.style.display = 'none';
        empty.style.display = 'block';
        conf.disabled = true;
      } else {
        sel.style.display = 'block';
        empty.style.display = 'none';
        conf.disabled = false;
        sel.innerHTML = cands.map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.nombre || c.id) + '</option>';
        }).join('');
        if (opts.currentUserId) {
          var ok = cands.some(function (c) { return String(c.id) === String(opts.currentUserId); });
          if (ok) sel.value = String(opts.currentUserId);
        }
      }
      document.getElementById(MODAL_ID).style.display = 'flex';
    });
  }

  window.__BC_M24_2_openAsignar = openAsignarModal;
})();
