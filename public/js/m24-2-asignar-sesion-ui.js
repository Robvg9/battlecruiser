// BattleCruiser M24.2-FE — Asignación de trabajadores por días dentro de una sesión/ciclo
// M24.3: permite asignar un mismo trabajador a varios días del mismo ciclo + almacén + bloque.
// M24.3.1: refresco inmediato de sesiones tras asignar/cambiar trabajador.
(function () {
  'use strict';
  if (window.__BC_M24_3_1__) return;
  window.__BC_M24_3_1__ = true;

  var MODAL_ID = 'm24-2-asig-modal';
  var pending = null;

  function isAdmin() {
    return typeof tienePermiso === 'function' && tienePermiso('ciclos', 'editar_any');
  }
  function esc(v) {
    return typeof escHtml === 'function' ? escHtml(v == null ? '' : v) : String(v == null ? '' : v);
  }
  function formatNombre(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    return s.split(/\s+/).map(function (w) {
      if (!w) return w;
      return w.charAt(0).toLocaleUpperCase('es') + w.slice(1);
    }).join(' ');
  }
  function labelBloque(b) {
    if (window.__BC_M24__ && window.__BC_M24__.labelBloque) return window.__BC_M24__.labelBloque(b);
    var s = String(b || '').toUpperCase();
    if (s === 'MANANA' || s === 'MAÑANA') return 'Mañana';
    if (s === 'TARDE') return 'Tarde';
    return b || '—';
  }
  function normId(v) { return String(v == null ? '' : v); }

  async function rpc(name, params) {
    var r = await client.rpc(name, params || {});
    if (r && r.error) throw r.error;
    return r ? r.data : null;
  }

  function ensureModal() {
    var el = document.getElementById(MODAL_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = MODAL_ID;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px;box-sizing:border-box;';
    el.innerHTML = '<div class="m21-card" style="max-width:520px;width:100%;max-height:90vh;overflow:auto;margin:0;box-shadow:0 12px 40px rgba(0,0,0,.45)">' +
      '<h4 id="m24-2-title" style="margin-top:0">Asignar trabajador</h4>' +
      '<p id="m24-2-meta" class="muted" style="margin:0 0 12px"></p>' +
      '<label style="display:block;margin-bottom:12px"><b>Trabajador</b>' +
      '<select id="m24-2-select" style="display:block;width:100%;margin-top:6px;padding:10px;border-radius:8px"></select>' +
      '</label>' +
      '<div id="m24-2-days-wrap" style="display:grid;gap:8px;margin:12px 0"></div>' +
      '<p id="m24-2-empty" class="muted" style="display:none"></p>' +
      '<p id="m24-2-err" class="m21-msg error" style="display:none"></p>' +
      '<div class="m21-actions" style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="cc-accion" id="m24-2-confirm">Confirmar asignación</button>' +
      '<button type="button" class="cc-accion" id="m24-2-cancel" style="opacity:.85">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el) closeModal(null); });
    document.getElementById('m24-2-cancel').addEventListener('click', function () { closeModal(null); });
    document.getElementById('m24-2-confirm').addEventListener('click', onConfirm);
    return el;
  }

  function closeModal(result) {
    var el = document.getElementById(MODAL_ID);
    if (el) el.style.display = 'none';
    var p = pending;
    pending = null;
    if (p && typeof p.resolve === 'function') p.resolve(result);
  }

  async function cargarSesionesContexto(sesionId, almId, bloque) {
    var rows = await rpc('listar_sesiones_operativas', { p_ciclo_id: null, p_almacen_id: almId || null, p_fecha: null, p_estado: null });
    rows = Array.isArray(rows) ? rows : [];
    var current = rows.find(function (s) { return normId(s.id) === normId(sesionId); });
    if (!current) throw new Error('No se pudo identificar el ciclo de la sesión.');
    var cicloId = current.ciclo_id;
    var filtered = rows.filter(function (s) {
      return normId(s.ciclo_id) === normId(cicloId) && normId(s.almacen_id) === normId(almId) &&
        String(s.bloque || '').toUpperCase() === String(bloque || '').toUpperCase();
    }).sort(function (a, b) { return Number(a.dia_n || 0) - Number(b.dia_n || 0); });
    return { current: current, cicloId: cicloId, sessions: filtered };
  }

  function renderDays(sessions) {
    var wrap = document.getElementById('m24-2-days-wrap');
    var empty = document.getElementById('m24-2-empty');
    if (!wrap || !empty) return;
    wrap.innerHTML = '';
    var pendingSessions = sessions.filter(function (s) { return String(s.estado || '').toUpperCase() === 'PENDIENTE'; });
    if (!pendingSessions.length) {
      empty.style.display = 'block';
      empty.textContent = 'No hay sesiones pendientes para este bloque.';
      return;
    }
    empty.style.display = 'none';
    var title = document.createElement('div');
    title.style.fontWeight = '700';
    title.textContent = 'Días a asignar';
    wrap.appendChild(title);
    pendingSessions.forEach(function (s) {
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(127,127,127,.25);border-radius:10px;cursor:pointer;';
      var checked = normId(s.id) === normId(pending && pending.sesionId);
      row.innerHTML = '<input type="checkbox" class="m24-2-day" value="' + esc(s.id) + '" ' + (checked ? 'checked' : '') + '>' +
        '<span><b>Día ' + esc(s.dia_n || '—') + '</b> · ' + esc(s.fecha || '') + ' · ' + esc(labelBloque(s.bloque)) + '</span>';
      wrap.appendChild(row);
    });
  }

  async function onConfirm() {
    if (!pending) return;
    var M = window.__BC_M24__;
    var sel = document.getElementById('m24-2-select');
    var err = document.getElementById('m24-2-err');
    var conf = document.getElementById('m24-2-confirm');
    var userId = sel && sel.value;
    var selected = Array.from(document.querySelectorAll('#m24-2-days-wrap .m24-2-day:checked')).map(function (x) { return x.value; });
    if (!userId || !M) return;
    if (!selected.length) { err.style.display = 'block'; err.textContent = 'Selecciona al menos un día.'; return; }
    conf.disabled = true;
    err.style.display = 'none';
    try {
      for (var i = 0; i < selected.length; i++) await M.asignarSesion(selected[i], userId);
      var name = formatNombre((sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || '');
      closeModal({ usuarioId: userId, nombre: name, count: selected.length });
    } catch (e) {
      err.style.display = 'block';
      err.textContent = 'No se pudo asignar: ' + String(e && (e.message || e.details) || e);
      conf.disabled = false;
    }
  }

  function openAsignarModal(opts) {
    opts = opts || {};
    return new Promise(async function (resolve) {
      if (!isAdmin()) { resolve(null); return; }
      var M = window.__BC_M24__;
      if (!M) { resolve(null); return; }
      ensureModal();
      pending = { resolve: resolve, sesionId: opts.sesionId, almId: opts.almId, bloque: opts.bloque };
      document.getElementById('m24-2-title').textContent = opts.isChange ? 'Cambiar trabajador' : 'Asignar trabajador';
      document.getElementById('m24-2-meta').textContent = 'Almacén: ' + formatNombre(opts.almNombre || opts.almId || '—') + ' · Bloque: ' + labelBloque(opts.bloque);
      document.getElementById('m24-2-err').style.display = 'none';
      document.getElementById('m24-2-err').textContent = '';
      try {
        await M.listarAsignaciones({});
        if (M.cargarUsuarios) await M.cargarUsuarios(true);
        var cands = M.candidatosParaSesion(opts.almId, opts.bloque) || [];
        var sel = document.getElementById('m24-2-select');
        var empty = document.getElementById('m24-2-empty');
        var conf = document.getElementById('m24-2-confirm');
        if (!cands.length) {
          sel.innerHTML = ''; sel.style.display = 'none'; empty.style.display = 'block';
          empty.textContent = 'No hay trabajadores autorizados para este almacén y bloque. Crea primero una asignación operativa.';
          conf.disabled = true;
        } else {
          sel.style.display = 'block'; empty.style.display = 'none'; conf.disabled = false;
          sel.innerHTML = cands.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(formatNombre(c.nombre || c.id)) + '</option>'; }).join('');
          if (opts.currentUserId) {
            var ok = cands.some(function (c) { return normId(c.id) === normId(opts.currentUserId); });
            if (ok) sel.value = String(opts.currentUserId);
          }
        }
        var ctx = await cargarSesionesContexto(opts.sesionId, opts.almId, opts.bloque);
        renderDays(ctx.sessions);
      } catch (e) {
        document.getElementById('m24-2-err').style.display = 'block';
        document.getElementById('m24-2-err').textContent = 'No se pudo cargar la asignación: ' + String(e && (e.message || e.details) || e);
        document.getElementById('m24-2-confirm').disabled = true;
      }
      document.getElementById(MODAL_ID).style.display = 'flex';
    });
  }

  function setSesionesMsg(text, ok) {
    var el = document.getElementById('m22-sesiones-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'm21-msg ' + (ok ? 'ok' : 'error');
  }

  function forceSesionesRefresh() {
    var root = document.getElementById('ciclos-m18-root');
    var panel = document.getElementById('m22-sesiones-panel');
    if (!root) return;
    var tick = document.createElement('span');
    tick.style.display = 'none';
    tick.setAttribute('data-m24-3-refresh', String(Date.now()));
    root.appendChild(tick);
    setTimeout(function () { if (tick.parentNode) tick.parentNode.removeChild(tick); }, 40);
    if (panel) panel.setAttribute('data-m24-3-last-refresh', String(Date.now()));
  }

  document.addEventListener('click', function (e) {
    var asg = e.target.closest && e.target.closest('[data-m24-asignar-sesion]');
    if (!asg) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (!isAdmin()) { setSesionesMsg('Sin permiso para asignar sesiones.', false); return; }
    var isChange = /cambiar/i.test(asg.textContent || '');
    openAsignarModal({
      sesionId: asg.dataset.m24AsignarSesion,
      almId: asg.dataset.alm,
      almNombre: asg.dataset.almNombre || asg.getAttribute('data-alm-nombre') || '',
      bloque: asg.dataset.bloque,
      isChange: isChange,
      currentUserId: asg.dataset.user || null
    }).then(function (result) {
      if (!result) return;
      setSesionesMsg('✓ ' + result.count + ' día(s) asignado(s) a ' + result.nombre + '.', true);
      forceSesionesRefresh();
    });
  }, true);

  window.__BC_M24_2_openAsignar = openAsignarModal;
})();
