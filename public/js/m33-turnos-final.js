// BattleCruiser - M33 Turnos expediente (sin competencia HOME)
// HOME listado = solo M29. Este módulo solo abre expediente / detalle.
// v33.11 — Jornada única abre su workspace Step 7 desde M33
(function () {
  'use strict';
  if (window.__bcM33TurnosFinal) return;
  window.__bcM33TurnosFinal = true;

  const ROOT_ID = 'ciclos-m18-root';
  const API = () => window.BattleCruiserTurnoAPI;
  const state = { turno: null, sesiones: [], step: 1, busy: false, isAdmin: false, readOnly: false };
  const root = () => document.getElementById(ROOT_ID);
  const esc = v => String(v == null ? '' : v).replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
  const date = v => {
    if (!v) return '-';
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return typeof fechaCorta === 'function' ? fechaCorta(v) : s.split('T')[0].split('-').reverse().join('/');
  };
  const users = () => ((_cache && _cache.usuarios) || []).filter(u => u.activo !== false && !u.archivado);
  const field = v => (v == null || v === '') ? '-' : v;

  function can(r, a) {
    return typeof tienePermiso === 'function' ? tienePermiso(r, a) : false;
  }
  function currentUserId() {
    try {
      return (typeof _usuarioActual !== 'undefined' && _usuarioActual && _usuarioActual.id) || null;
    } catch (e) {
      return null;
    }
  }
  function isDuenoRole() {
    var u = window.__bcUser || window._usuarioActual || null;
    if (!u) return false;
    var rol = String(u.rol || u.role || u.nombre_rol || '').toLowerCase();
    return rol.indexOf('due') === 0 || rol === 'admin' || rol === 'administrador' || !!u.is_admin;
  }
  function normalizeAdminFlag(r) {
    if (r === true || r === 'true' || r === 1 || r === '1') return true;
    if (r === false || r == null) return false;
    if (typeof r === 'object') {
      if (r.is_admin === true || r.isAdmin === true) return true;
      if (Array.isArray(r) && r.length === 1) return normalizeAdminFlag(r[0]);
    }
    return false;
  }
  async function resolveAdmin() {
    if (window.__BC_M29__ && typeof window.__BC_M29__.isAdmin === 'function') {
      try {
        var m = window.__BC_M29__.isAdmin();
        if (m === true) { state.isAdmin = true; return; }
      } catch (e) {}
    }
    var api = API();
    if (api && api.actorIsAdmin) {
      try {
        state.isAdmin = normalizeAdminFlag(await api.actorIsAdmin());
        if (state.isAdmin) return;
      } catch (e) {}
    }
    state.isAdmin = can('turnos', 'editar_any') || can('ciclos', 'editar_any') || isDuenoRole();
  }

  function css() {
    if (document.getElementById('bc-m33-css')) return;
    const s = document.createElement('style');
    s.id = 'bc-m33-css';
    s.textContent = '.m33-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}.m33-modal{width:min(920px,100%);max-width:100%;box-sizing:border-box;max-height:94vh;max-height:94dvh;overflow:hidden;background:var(--panel-bg,#171c24);color:var(--text,#fff);border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 26px 80px rgba(0,0,0,.5);display:flex;flex-direction:column}.m33-head{padding:12px 16px 8px;border-bottom:1px solid rgba(255,255,255,.08)}.m33-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.m33-title h3{margin:0;font-size:1.22rem}.m33-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:10px;overflow:visible}.m33-step{min-width:0;padding:6px 4px;text-align:center;line-height:1.2;overflow-wrap:anywhere;border:1px solid rgba(255,255,255,.1);border-radius:9px;font-size:.75rem;opacity:.55}.m33-step.active{opacity:1;border-color:rgba(59,130,246,.7);background:rgba(59,130,246,.12)}.m33-body{padding:12px 16px;overflow:auto;overscroll-behavior:contain;min-height:0;flex:1 1 auto}.m33-foot{padding:9px 16px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:10px}.m33-foot button{padding:10px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:transparent;color:inherit;font-weight:600;cursor:pointer}.m33-foot .primary{background:#2563eb;border-color:#2563eb;color:#fff}.m33-foot .danger{background:#b91c1c;border-color:#b91c1c;color:#fff}.m33-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.m33-box{padding:8px 9px;border:1px solid rgba(255,255,255,.08);border-radius:10px}.m33-box span{display:block;font-size:.72rem;opacity:.58;margin-bottom:3px}.m33-session{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)}.m33-session-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;min-width:0}.m33-assignment-grid .m33-assignment-card{display:grid;grid-template-columns:minmax(84px,.56fr) minmax(0,1fr);align-items:center;gap:8px;padding:5px 0;min-width:0}.m33-assignment-card label{min-width:0;margin:0!important;font-size:.76rem;line-height:1.25;overflow-wrap:anywhere}.m33-assignment-card select{width:100%;min-width:0;max-width:100%;box-sizing:border-box;margin:0!important;padding:7px 8px!important;min-height:38px;font-size:.86rem;line-height:1.2}.m33-assignment-card .m33-muted{min-width:0;font-size:.8rem;overflow-wrap:anywhere}.m33-session-row{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.m33-pill{font-size:.72rem;padding:3px 8px;border-radius:999px;background:rgba(148,163,184,.14)}.m33-ok{background:rgba(34,197,94,.15);color:#86efac}.m33-warn{background:rgba(251,191,36,.15);color:#fde68a}.m33-muted{opacity:.62}.m33-msg{min-height:1.2em;margin:6px 0;font-size:.9rem}.m33-msg.error{color:#f87171}.m33-msg.ok{color:#86efac}.m33-btn-sesion{padding:9px 14px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}.m33-btn-sesion:disabled{opacity:.5;cursor:not-allowed}.bc-m33-save-msg{font-size:.78rem;margin:6px 0;min-height:1em}.bc-m33-save-msg.ok{color:#86efac}.bc-m33-save-msg.error{color:#f87171}.m33-archive{margin-top:10px}.m33-archive-day{margin:6px 0;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:10px}.m33-archive-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.m33-archive-head b{display:block}.m33-archive-head small{display:block;opacity:.65;margin-top:3px}.m33-archive-head button{min-height:40px;padding:9px 12px;border-radius:8px;border:1px solid rgba(59,130,246,.55);background:rgba(59,130,246,.12);color:inherit;font-weight:600}.m33-archive-head button:disabled{opacity:.55}.m33-archive-host{margin-top:6px}.m33-archive-host[hidden]{display:none}.m33-archive-scroll{max-width:100%;overflow-x:auto}.m33-archive-table{width:100%;min-width:640px;border-collapse:collapse;font-size:.78rem}.m33-archive-table th,.m33-archive-table td{padding:6px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}.m33-archive-table th{opacity:.65}.m33-archive-empty{padding:10px;border:1px dashed rgba(255,255,255,.16);border-radius:8px;opacity:.75;font-size:.84rem}@media(max-width:720px){.m33-bg{padding:6px}.m33-modal{width:100%;max-width:100%;box-sizing:border-box;max-height:calc(100dvh - 12px);border-radius:12px}.m33-head{padding:10px 12px 7px}.m33-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.m33-steps{grid-template-columns:repeat(3,minmax(0,1fr))}.m33-step{font-size:.68rem;padding:6px 4px}.m33-session-grid{grid-template-columns:minmax(0,1fr)}.m33-body{padding:10px 12px;min-height:0;flex:1 1 auto}.m33-foot{padding:9px 12px}.m33-foot button{padding:8px 11px}}';
    document.head.appendChild(s);
  }

  function normalizeExp(d) {
    if (!d) return null;
    if (Array.isArray(d)) return d.length === 1 ? d[0] : null;
    return d;
  }
  async function getExp(id) {
    const a = API();
    if (!a || typeof a.obtenerExpedienteTurno !== 'function') throw Error('API de expediente no disponible.');
    const d = normalizeExp(await a.obtenerExpedienteTurno(id));
    if (!d) throw Error('No se encontró el expediente del Turno.');
    return d;
  }
  async function load(id) {
    const d = await getExp(id);
    state.turno = d;
    state.sesiones = Array.isArray(d.sesiones) ? d.sesiones : [];
    return d;
  }

  function labelBloque(b) {
    var s = String(b || '').toUpperCase();
    if (s === 'MANANA' || s === 'MAÑANA') return 'Mañana';
    if (s === 'TARDE') return 'Tarde';
    if (s === 'JORNADA') return 'Jornada completa';
    return b || '-';
  }
  function normEstadoSesion(e) {
    return String(e || '').toUpperCase().trim();
  }
  function sesionAsignadaAMi(s) {
    var me = currentUserId();
    if (!me || !s) return false;
    var uid = s.usuario_id || s.asignado_id || null;
    return uid && String(uid) === String(me);
  }

  function step1(t) {
    const s = state.sesiones;
    const assigned = s.filter(x => x.usuario_id).length;
    const declared = s.filter(x => x.dinero_declarado).length;
    return '<div class="m33-summary"><div class="m33-box"><span>Almacén</span><b>' + esc(field(t.almacen_nombre || t.almacen)) + '</b></div><div class="m33-box"><span>Estado</span><b>' + esc(field(t.estado_maestro || t.estado)) + '</b></div><div class="m33-box"><span>Desde</span><b>' + esc(date(t.fecha_inicio)) + '</b></div><div class="m33-box"><span>Hasta</span><b>' + esc(date(t.fecha_fin)) + '</b></div></div><div class="m33-summary" style="margin-top:9px"><div class="m33-box"><span>Duración</span><b>' + esc(field(t.dias_turno)) + ' día(s)</b></div><div class="m33-box"><span>Sesiones</span><b>' + s.length + '</b></div><div class="m33-box"><span>Dependientas</span><b>' + assigned + '/' + s.length + '</b></div><div class="m33-box"><span>Dinero</span><b>' + declared + '/' + s.length + '</b></div></div><h4 style="margin:12px 0 6px">Sesiones</h4><div class="m33-session-grid">' + (s.map(x => '<div class="m33-session"><div class="m33-session-row"><div><b>Día ' + esc(x.numero_dia) + ' · ' + esc(labelBloque(x.bloque)) + '</b><div class="m33-muted">' + esc(date(x.fecha)) + '</div></div><div><span class="m33-pill ' + (x.usuario_id ? 'm33-ok' : 'm33-warn') + '">' + esc(x.usuario_nombre || (x.usuario_id ? 'Asignada' : 'Sin asignar')) + '</span></div></div></div>').join('') || '<div class="m33-muted">Sin sesiones.</div>') + '</div>';
  }
  function step2() {
    if (state.readOnly) {
      return '<p class="m33-muted" role="status">Expediente histórico en solo lectura. Las asignaciones se muestran tal como quedaron registradas.</p><div class="m33-session-grid m33-assignment-grid">' +
        state.sesiones.map(function (session) {
          const assigned = session.usuario_nombre || (session.usuario_id ? 'Asignada' : 'Sin asignar');
          return '<div class="m33-session m33-assignment-card"><label>Día ' + esc(session.numero_dia) + ' · ' + esc(labelBloque(session.bloque)) +
            '</label><div class="m33-muted" data-m33-readonly-assignment="' + esc(session.id) + '">' + esc(assigned) + '</div></div>';
        }).join('') + '</div>';
    }
    const us = users();
    return '<p class="m33-muted">Asigna una trabajadora a cada sesión. Los cambios se guardan inmediatamente; el botón Guardar vuelve a verificar todo el bloque.</p>' +
      '<p id="m33-asig-msg" class="bc-m33-save-msg"></p><div class="m33-session-grid m33-assignment-grid">' + state.sesiones.map(s => {
        const opts = '<option value="">Sin asignar</option>' + us.map(u => '<option value="' + esc(u.id) + '" ' +
          (String(u.id) === String(s.usuario_id || '') ? 'selected' : '') + '>' + esc(u.nombre || u.email || u.id) + '</option>').join('');
        return '<div class="m33-session m33-assignment-card"><label>Día ' + esc(s.numero_dia) + ' · ' + esc(labelBloque(s.bloque)) +
          '</label><select data-m33-sid="' + esc(s.id) + '" data-bc-prev="' + esc(s.usuario_id || '') +
          '" style="width:100%;margin-top:6px;padding:9px;border-radius:8px">' + opts + '</select></div>';
      }).join('') + '</div>';
  }
  function archiveSessionsForViewer() {
    const sessions = state.sesiones || [];
    return state.isAdmin ? sessions : sessions.filter(sesionAsignadaAMi);
  }
  function archiveDayGroups(sessions) {
    const map = Object.create(null);
    (sessions || []).forEach(function (session) {
      const day = session.dia_n || session.numero_dia || '—';
      const dayDate = String(session.fecha || '').slice(0, 10);
      const key = String(day) + '|' + dayDate;
      if (!map[key]) map[key] = { day: day, date: dayDate, sessions: [] };
      map[key].sessions.push(session);
    });
    return Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || Number(a.day) - Number(b.day);
    });
  }
  function step3() {
    const groups = archiveDayGroups(archiveSessionsForViewer());
    if (!groups.length) return '<div class="m33-archive-empty">No hay sesiones disponibles para consultar.</div>';
    return '<div class="m33-archive"><p class="m33-muted">Archivo de solo lectura. Cada fecha consulta únicamente las sesiones de ese día; los registros no se modifican.</p>' +
      groups.map(function (group) {
        const ids = group.sessions.map(function (session) { return String(session.id || ''); }).filter(Boolean).join('|');
        const action = ids
          ? '<button type="button" data-m33-archive-sessions="' + esc(ids) + '" data-m33-archive-day="' + esc(group.day) + '" data-m33-archive-date="' + esc(group.date) + '" aria-expanded="false">Ver movimientos del día</button>'
          : '<span class="m33-muted">Sesiones sin identificador consultable.</span>';
        return '<section class="m33-archive-day"><div class="m33-archive-head"><div><b>Día ' + esc(group.day) + '</b><small>' + esc(date(group.date)) + '</small></div>' + action + '</div>' +
          '<div class="m33-archive-host" data-m33-archive-host hidden></div></section>';
      }).join('') + '</div>';
  }
  function step4() { return '<div class="m33-muted">Inventario del expediente (si hay datos).</div>'; }
  function step5(t) {
    const st = String(t.estado_maestro || t.estado || '').toUpperCase();
    return '<div class="m33-session-row"><span>Estado</span><b>' + esc(st) + '</b></div>';
  }

  function bodyDependienta(t) {
    var me = currentUserId();
    var mias = state.sesiones.filter(sesionAsignadaAMi);
    var html = state.readOnly ? '<p class="m33-muted" role="status">Expediente histórico en modo de solo lectura.</p>' : '';
    html += '<div class="m33-summary"><div class="m33-box"><span>Almacén</span><b>' + esc(field(t.almacen_nombre || t.almacen)) + '</b></div><div class="m33-box"><span>Estado turno</span><b>' + esc(field(t.estado_maestro || t.estado)) + '</b></div><div class="m33-box"><span>Desde</span><b>' + esc(date(t.fecha_inicio)) + '</b></div><div class="m33-box"><span>Hasta</span><b>' + esc(date(t.fecha_fin)) + '</b></div></div>';
    html += '<h4 style="margin:18px 0 8px">Tus sesiones</h4>';
    html += '<p class="m33-muted">Solo ves las sesiones asignadas a vos. La secuencia la controla el sistema.</p>';
    html += '<p id="m33-dep-msg" class="m33-msg"></p>';
    if (!me) { html += '<p class="m33-muted">No se pudo identificar tu usuario.</p>'; return html; }
    if (!mias.length) { html += '<p class="m33-muted">No tenés sesiones asignadas en este turno.</p>'; return html; }
    html += '<div class="m33-session-grid">' + mias.map(function (x) {
      var st = normEstadoSesion(x.estado);
      var labelSt = st === 'PENDIENTE' || st === 'PROGRAMADA' ? 'Sin comenzar' : st === 'EN_CURSO' ? 'En curso' : st === 'COMPLETADA' ? 'Completada' : (st || '—');
      var actions = '';
      if (state.readOnly) actions = '<span class="m33-pill">Solo lectura</span>';
      else if (String(x.bloque || '').toUpperCase() === 'JORNADA') actions = '<button type="button" class="m33-btn-sesion" data-m33-abrir-jornada="' + esc(x.id) + '">Gestionar jornada</button>';
      else if (st === 'PENDIENTE' || st === 'PROGRAMADA' || !st) actions = '<button type="button" class="m33-btn-sesion" data-m33-abrir-sesion="' + esc(x.id) + '">Abrir sesión</button>';
      else if (st === 'EN_CURSO') actions = '<span class="m33-pill m33-ok">Sesión en curso</span>';
      else actions = '<span class="m33-pill">' + esc(labelSt) + '</span>';
      return '<div class="m33-session"><div class="m33-session-row"><div><b>Día ' + esc(x.numero_dia || x.dia_n) + ' · ' + esc(labelBloque(x.bloque)) + '</b><div class="m33-muted">' + esc(date(x.fecha)) + ' · ' + esc(labelSt) + '</div></div><div>' + actions + '</div></div></div>';
    }).join('') + '</div>';
    html += '<h4 style="margin:12px 0 6px">Archivo de movimientos por día</h4>' + step3();
    return html;
  }

  function setDepMsg(text, ok) {
    var el = document.getElementById('m33-dep-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'm33-msg ' + (ok ? 'ok' : (text ? 'error' : ''));
  }

  // Jornada única usa el workspace Step 7 y nunca la RPC legacy MANANA/TARDE.
  async function abrirJornadaUnica(sesionId, btn) {
    if (state.readOnly || !sesionId) return;
    if (btn && btn.dataset.bcBusy === '1') return;
    if (btn) { btn.dataset.bcBusy = '1'; btn.disabled = true; }
    try {
      if (!navigator.onLine) throw new Error('Necesitas conexión para gestionar esta jornada.');
      var jornadaUI = window.__BC7_JORNADA__;
      if (!jornadaUI || typeof jornadaUI.openForSession !== 'function') {
        throw new Error('La interfaz de Jornada e inventario aún no está disponible. Actualiza la app y vuelve a abrir el turno.');
      }
      close();
      var opened = await jornadaUI.openForSession(sesionId);
      if (opened === false) throw new Error('No se pudo cargar la jornada desde el backend.');
    } catch (e) {
      setDepMsg('No se abrió la jornada: ' + String(e && e.message || e), false);
      if (btn) { btn.disabled = false; btn.dataset.bcBusy = '0'; }
    }
  }

  // Sesiones legacy MANANA/TARDE mantienen su apertura secuencial original.
  async function abrirSesionDependienta(sesionId, btn) {
    if (state.readOnly || !sesionId) return;
    if (btn && btn.dataset.bcBusy === '1') return;
    if (btn) { btn.dataset.bcBusy = '1'; btn.disabled = true; }
    setDepMsg('Abriendo sesión…', true);
    try {
      if (!navigator.onLine) { setDepMsg('Necesitás conexión para abrir la sesión.', false); return; }
      if (typeof client === 'undefined' || !client || !client.rpc) { setDepMsg('Cliente no disponible.', false); return; }
      var r = await client.rpc('bc_iniciar_turno_sesion_secuencial', { p_turno_sesion_id: sesionId });
      if (r && r.error) throw r.error;
      setDepMsg('✓ Sesión abierta. Ya podés vender.', true);
      try {
        if (typeof window.__BC_M25_refrescarTurno === 'function') await window.__BC_M25_refrescarTurno();
        else if (typeof refrescarTurnoActual === 'function') await refrescarTurnoActual();
      } catch (e) {}
      try { if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta(); } catch (e2) {}
      if (state.turno && state.turno.id) {
        try { await load(state.turno.id); renderModal(); } catch (e3) {}
      }
    } catch (e) {
      var msg = String((e && (e.message || e.details || e.code)) || e);
      setDepMsg(msg, false);
    } finally {
      if (btn) { btn.disabled = false; btn.dataset.bcBusy = '0'; }
    }
  }

  function close() { var bg = document.getElementById('m33-bg'); if (bg) bg.remove(); }
  async function deleteTurno() {
    if (!state.isAdmin || state.readOnly) return;
    if (!confirm('¿Eliminar este Turno?')) return;
    try { await API().anularTurno(state.turno.id, 'Cancelado por ADMIN'); close(); if (window.__BC_M29__ && window.__BC_M29__.renderHome) window.__BC_M29__.renderHome(); }
    catch (e) { alert('No se pudo eliminar: ' + (e.message || e)); }
  }

  function setAsignacionMsg(text, ok) {
    var el = document.getElementById('m33-asig-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'bc-m33-save-msg ' + (ok ? 'ok' : 'error');
  }

  async function persistAssignmentSelect(sel) {
    if (!state.isAdmin || state.readOnly || !sel || !sel.dataset.m33Sid) return;
    var next = sel.value || '';
    var prev = sel.dataset.bcPrev || '';
    if (next === prev) return;
    sel.disabled = true;
    try {
      if (!next) {
        // No existe un RPC de desasignación en el contrato actual; no fingimos que
        // quitar el valor lo guardó. Se recupera el último valor válido.
        sel.value = prev;
        throw new Error('Para quitar una asignación usá la reasignación del usuario; no se puede guardar "Sin asignar" desde este control.');
      }
      await API().asignarSesion(sel.dataset.m33Sid, next);
      sel.dataset.bcPrev = next;
      await load(state.turno.id);
      setAsignacionMsg('✓ Asignación guardada y confirmada.', true);
    } catch (e) {
      sel.value = prev;
      setAsignacionMsg('No se guardó la asignación: ' + String(e && e.message || e), false);
      throw e;
    } finally {
      sel.disabled = false;
    }
  }

  function bindAssignmentAutosave() {
    var ov = document.getElementById('m33-bg');
    if (!ov || ov.dataset.bcM33AssignBound === '1') return;
    ov.dataset.bcM33AssignBound = '1';
    ov.addEventListener('change', async function (e) {
      var sel = e.target && e.target.closest ? e.target.closest('select[data-m33-sid]') : null;
      if (!sel) return;
      try { await persistAssignmentSelect(sel); } catch (_) {}
    });
  }

  async function saveAssignments() {
    if (!state.isAdmin || state.readOnly) return;
    const ov = document.getElementById('m33-bg');
    const sels = [].slice.call(ov.querySelectorAll('select[data-m33-sid]'));
    try {
      for (var i = 0; i < sels.length; i++) {
        if (sels[i].value) await persistAssignmentSelect(sels[i]);
      }
      await load(state.turno.id);
      var expected = {};
      sels.forEach(function(sel){ expected[String(sel.dataset.m33Sid)] = sel.value; });
      var mismatches = (state.sesiones || []).filter(function(s){ return expected[String(s.id)] && String(s.usuario_id || '') !== String(expected[String(s.id)]); });
      if (mismatches.length) throw new Error('La verificación detectó asignaciones no persistidas.');
      setAsignacionMsg('✓ Asignaciones verificadas en Supabase.', true);
      renderModal();
    } catch (e) { setAsignacionMsg('No se pudieron guardar/verificar las asignaciones: ' + (e.message || e), false); }
  }

  function archiveTypeLabel(type) {
    return ({
      compra: 'Compra / entrada',
      venta: 'Venta / salida',
      transferencia_salida: 'Transferencia de salida',
      transferencia_entrada: 'Transferencia de entrada',
      vale: 'Vale de salida',
      merma: 'Merma',
      baja: 'Baja'
    })[String(type || '').toLowerCase()] || String(type || '—');
  }
  function bindArchiveButtons(overlay) {
    overlay.querySelectorAll('[data-m33-archive-sessions]').forEach(function (button) {
      button.addEventListener('click', function () { toggleArchiveDay(button); });
    });
  }
  async function toggleArchiveDay(button) {
    const group = button.closest('.m33-archive-day');
    const host = group && group.querySelector('[data-m33-archive-host]');
    if (!host) return;
    if (host.dataset.loaded === '1') {
      host.hidden = !host.hidden;
      button.setAttribute('aria-expanded', host.hidden ? 'false' : 'true');
      return;
    }
    host.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const title = '<h5>Día ' + esc(button.dataset.m33ArchiveDay || '—') + ' · ' + esc(date(button.dataset.m33ArchiveDate || '')) + '</h5>';
    if (!navigator.onLine) {
      host.innerHTML = title + '<div class="m33-archive-empty">El archivo del día requiere conexión al servidor.</div>';
      return;
    }
    const sessionIds = String(button.dataset.m33ArchiveSessions || '').split('|').filter(Boolean);
    if (!sessionIds.length) {
      host.innerHTML = title + '<div class="m33-archive-empty">No hay sesiones consultables para esta fecha.</div>';
      return;
    }
    button.disabled = true;
    host.innerHTML = title + '<div class="m33-archive-empty">Consultando movimientos…</div>';
    try {
      const rpcClient = window.client;
      if (!rpcClient || typeof rpcClient.rpc !== 'function') throw new Error('Cliente del servidor no disponible.');
      const sessionsById = new Map((state.sesiones || []).map(function (session) { return [String(session.id), session]; }));
      const rows = [];
      let readable = 0;
      let denied = 0;
      for (const sessionId of sessionIds) {
        const response = await rpcClient.rpc('bc7_movimientos_sesion', { p_turno_sesion_id: sessionId });
        if (response && response.error) {
          if (String(response.error.code || '') === '42501') { denied += 1; continue; }
          throw response.error;
        }
        readable += 1;
        const data = Array.isArray(response && response.data) ? response.data : (response && response.data ? [response.data] : []);
        data.forEach(function (row) {
          const session = sessionsById.get(String(sessionId));
          rows.push(Object.assign({}, row, { __sessionLabel: session ? labelBloque(session.bloque) : 'Sesión' }));
        });
      }
      if (!readable && denied) {
        host.innerHTML = title + '<div class="m33-archive-empty">Tu perfil no tiene permiso para consultar las sesiones de este día.</div>';
      } else if (!rows.length) {
        host.innerHTML = title + '<div class="m33-archive-empty">No hay operaciones vinculadas de forma verificable a las sesiones que puedes consultar. Las operaciones sin atribución segura permanecen en el Historial general.</div>';
      } else {
        rows.sort(function (a, b) { return new Date(b.fecha).getTime() - new Date(a.fecha).getTime(); });
        const body = rows.map(function (row) {
          const ref = String(row.operacion_id || '');
          const shortRef = ref ? '#' + ref.slice(-6) : '—';
          const timestamp = String(row.fecha || '').replace('T', ' ').slice(0, 19);
          return '<tr><td>' + esc(timestamp || '—') + '</td><td>' + esc(row.__sessionLabel || '—') +
            '</td><td>' + esc(archiveTypeLabel(row.tipo)) + '</td><td>' + esc(row.producto || '—') +
            '</td><td>' + esc(row.almacen || '—') + '</td><td>' + esc(row.cantidad == null ? '—' : row.cantidad) +
            '</td><td>' + esc(row.usuario || '—') + '</td><td>' + esc(shortRef) + '</td></tr>';
        }).join('');
        host.innerHTML = title + '<div class="m33-archive-scroll"><table class="m33-archive-table"><thead><tr><th>Fecha/hora</th><th>Sesión</th><th>Tipo</th><th>Producto</th><th>Almacén</th><th>Cantidad</th><th>Responsable</th><th>Ref.</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
          (denied ? '<div class="m33-archive-empty" role="status">Algunas sesiones no se muestran porque tu perfil no tiene permiso para consultarlas.</div>' : '');
      }
      host.dataset.loaded = '1';
    } catch (error) {
      host.innerHTML = title + '<div class="m33-archive-empty">No se pudo consultar el archivo de este día: ' +
        esc(error && error.message ? error.message : error) + '.</div>';
    } finally {
      button.disabled = false;
    }
  }

  function renderModal() {
    const ov = document.getElementById('m33-bg');
    if (!ov) return;
    const t = state.turno;
    if (!state.isAdmin) {
      ov.innerHTML = '<div class="m33-modal"><div class="m33-head"><div class="m33-title"><div><h3>Tu turno · ' + esc(field(t.almacen_nombre || t.almacen)) + '</h3><div class="m33-muted">Sesión de trabajo</div></div><button type="button" id="m33-x">X</button></div></div><div class="m33-body">' + bodyDependienta(t) + '</div><div class="m33-foot"><div></div><div><button type="button" id="m33-close-final">Cerrar</button></div></div></div>';
      ov.querySelector('#m33-x').onclick = close;
      var c = ov.querySelector('#m33-close-final'); if (c) c.onclick = close;
      bindArchiveButtons(ov);
      ov.querySelectorAll('[data-m33-abrir-sesion]').forEach(function (btn) { btn.addEventListener('click', function () { abrirSesionDependienta(btn.getAttribute('data-m33-abrir-sesion'), btn); }); });
      ov.querySelectorAll('[data-m33-abrir-jornada]').forEach(function (btn) { btn.addEventListener('click', function () { abrirJornadaUnica(btn.getAttribute('data-m33-abrir-jornada'), btn); }); });
      return;
    }
    const titles = ['Información', 'Asignaciones', 'Movimientos', 'Inventario', 'Resumen'];
    const bodies = [step1(t), step2(), step3(), step4(), step5(t)];
    const prev = state.step > 1 ? '<button type="button" id="m33-prev">Atrás</button>' : '';
    const next = state.step < 5 ? '<button type="button" id="m33-next" class="primary">Avanzar</button>' : '<button type="button" id="m33-close-final">Cerrar</button>';
    ov.innerHTML = '<div class="m33-modal"><div class="m33-head"><div class="m33-title"><div><h3>Turno · ' + esc(field(t.almacen_nombre || t.almacen)) + '</h3><div class="m33-muted">' + esc(titles[state.step - 1]) + '</div></div><button type="button" id="m33-x">X</button></div><div class="m33-steps">' + titles.map(function (x, i) { return '<div class="m33-step ' + (state.step === i + 1 ? 'active' : '') + '"><b>' + (i + 1) + '</b> · ' + x + '</div>'; }).join('') + '</div></div><div class="m33-body">' + (state.readOnly ? '<p class="m33-muted" role="status">Expediente histórico · Solo lectura.</p>' : '') + bodies[state.step - 1] + '</div><div class="m33-foot"><div>' + (!state.readOnly && state.step === 1 && String(t.estado_maestro || t.estado || '').toUpperCase() === 'PROGRAMADO' ? '<button type="button" id="m33-delete" class="danger">Eliminar</button>' : '') + '</div><div>' + prev + (state.step === 2 && !state.readOnly ? '<button type="button" id="m33-save" style="margin-left:8px">Guardar</button>' : '') + next + '</div></div></div>';
    ov.querySelector('#m33-x').onclick = close;
    var p = ov.querySelector('#m33-prev'); if (p) p.onclick = function () { state.step--; renderModal(); };
    var n = ov.querySelector('#m33-next'); if (n) n.onclick = function () { state.step++; renderModal(); };
    var cf = ov.querySelector('#m33-close-final'); if (cf) cf.onclick = close;
    var d = ov.querySelector('#m33-delete'); if (d) d.onclick = deleteTurno;
    var save = ov.querySelector('#m33-save'); if (save) save.onclick = saveAssignments;
    if (state.step === 2 && !state.readOnly) bindAssignmentAutosave();
    if (state.step === 3) bindArchiveButtons(ov);
  }

  async function open(id, options) {
    css(); state.step = 1; state.busy = true; state.readOnly = !!(options && options.readOnly === true); await resolveAdmin();
    const ov = document.createElement('div'); ov.id = 'm33-bg'; ov.className = 'm33-bg'; ov.innerHTML = '<div class="m33-modal"><div class="m33-body">Cargando…</div></div>'; document.body.appendChild(ov);
    try { await load(id); state.busy = false; renderModal(); }
    catch (e) { state.busy = false; ov.innerHTML = '<div class="m33-modal"><div class="m33-body"><h3>No se pudo cargar</h3><p>' + esc(e.message || e) + '</p><button type="button" id="m33-error-close">Cerrar</button></div></div>'; ov.querySelector('#m33-error-close').onclick = close; }
  }

  function renderHome() { if (window.__BC_M29__ && typeof window.__BC_M29__.renderHome === 'function') { if (window.__BC_M29__.claimHomeOwnership) window.__BC_M29__.claimHomeOwnership(); return window.__BC_M29__.renderHome(); } }
  function intercept() {
    const r = root(); if (!r || r.dataset.m33Bound === '1') return; r.dataset.m33Bound = '1';
    r.addEventListener('click', function (e) {
      const card = e.target.closest('[data-m33-id],.m29-card'); if (!card) return;
      const id = card.dataset.m33Id || card.dataset.turnoId || card.getAttribute('data-turno-id'); if (!id) return;
      e.preventDefault(); e.stopPropagation();
      // Route real M29 card taps through the public entrypoint so wrappers
      // (including overdue ADMIN recovery) execute on the actual user path.
      const hub = window.__BC_M33;
      if (hub && typeof hub.open === 'function') hub.open(id);
      else open(id);
    }, true);
  }
  function boot() { css(); intercept(); }
  window.__BC_M33 = { open: open, version: '33.11-dep', renderHome: renderHome };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
