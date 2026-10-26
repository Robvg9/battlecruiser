// BattleCruiser - M33 Turnos expediente (sin competencia HOME)
// HOME listado = solo M29. Este módulo solo abre expediente / detalle.
// v33.7 — ADMIN: wizard completo · DEPENDIENTA: vista operativa · fechas civiles · asignación persistente inmediata
(function () {
  'use strict';
  if (window.__bcM33TurnosFinal) return;
  window.__bcM33TurnosFinal = true;

  const ROOT_ID = 'ciclos-m18-root';
  const API = () => window.BattleCruiserTurnoAPI;
  const state = { turno: null, sesiones: [], step: 1, busy: false, isAdmin: false, forceCloseMessage: '' };
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
    s.textContent = '.m33-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}.m33-modal{width:min(920px,100%);max-height:90vh;overflow:hidden;background:var(--panel-bg,#171c24);color:var(--text,#fff);border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 26px 80px rgba(0,0,0,.5);display:flex;flex-direction:column}.m33-head{padding:20px 22px 12px;border-bottom:1px solid rgba(255,255,255,.08)}.m33-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.m33-title h3{margin:0;font-size:1.22rem}.m33-steps{display:flex;gap:7px;margin-top:14px;overflow:auto}.m33-step{flex:1;min-width:100px;padding:7px 9px;border:1px solid rgba(255,255,255,.1);border-radius:9px;font-size:.75rem;opacity:.55}.m33-step.active{opacity:1;border-color:rgba(59,130,246,.7);background:rgba(59,130,246,.12)}.m33-body{padding:20px 22px;overflow:auto}.m33-foot{padding:13px 22px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:10px}.m33-foot button{padding:10px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:transparent;color:inherit;font-weight:600;cursor:pointer}.m33-foot .primary{background:#2563eb;border-color:#2563eb;color:#fff}.m33-foot .danger{background:#b91c1c;border-color:#b91c1c;color:#fff}.m33-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.m33-box{padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:10px}.m33-box span{display:block;font-size:.72rem;opacity:.58;margin-bottom:3px}.m33-session{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}.m33-session-row{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.m33-pill{font-size:.72rem;padding:3px 8px;border-radius:999px;background:rgba(148,163,184,.14)}.m33-ok{background:rgba(34,197,94,.15);color:#86efac}.m33-warn{background:rgba(251,191,36,.15);color:#fde68a}.m33-muted{opacity:.62}.m33-msg{min-height:1.2em;margin:10px 0;font-size:.9rem}.m33-msg.error{color:#f87171}.m33-msg.ok{color:#86efac}.m33-btn-sesion{padding:9px 14px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}.m33-btn-sesion:disabled{opacity:.5;cursor:not-allowed}.bc-m33-save-msg{font-size:.78rem;margin:6px 0;min-height:1em}.bc-m33-save-msg.ok{color:#86efac}.bc-m33-save-msg.error{color:#f87171}@media(max-width:720px){.m33-summary{grid-template-columns:1fr 1fr}}';
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
    return '<div class="m33-summary"><div class="m33-box"><span>Almacén</span><b>' + esc(field(t.almacen_nombre || t.almacen)) + '</b></div><div class="m33-box"><span>Estado</span><b>' + esc(field(t.estado_maestro || t.estado)) + '</b></div><div class="m33-box"><span>Desde</span><b>' + esc(date(t.fecha_inicio)) + '</b></div><div class="m33-box"><span>Hasta</span><b>' + esc(date(t.fecha_fin)) + '</b></div></div><div class="m33-summary" style="margin-top:9px"><div class="m33-box"><span>Duración</span><b>' + esc(field(t.dias_turno)) + ' día(s)</b></div><div class="m33-box"><span>Sesiones</span><b>' + s.length + '</b></div><div class="m33-box"><span>Dependientas</span><b>' + assigned + '/' + s.length + '</b></div><div class="m33-box"><span>Dinero</span><b>' + declared + '/' + s.length + '</b></div></div><h4 style="margin:20px 0 8px">Sesiones</h4>' + (s.map(x => '<div class="m33-session"><div class="m33-session-row"><div><b>Día ' + esc(x.numero_dia) + ' · ' + esc(labelBloque(x.bloque)) + '</b><div class="m33-muted">' + esc(date(x.fecha)) + '</div></div><div><span class="m33-pill ' + (x.usuario_id ? 'm33-ok' : 'm33-warn') + '">' + esc(x.usuario_nombre || (x.usuario_id ? 'Asignada' : 'Sin asignar')) + '</span></div></div></div>').join('') || '<div class="m33-muted">Sin sesiones.</div>');
  }
  function step2() {
    const us = users();
    return '<p class="m33-muted">Asigna una trabajadora a cada sesión. Los cambios se guardan inmediatamente; el botón Guardar vuelve a verificar todo el bloque.</p>' + '<p id="m33-asig-msg" class="bc-m33-save-msg"></p>' + state.sesiones.map(s => {
      const opts = '<option value="">Sin asignar</option>' + us.map(u => '<option value="' + esc(u.id) + '" ' + (String(u.id) === String(s.usuario_id || '') ? 'selected' : '') + '>' + esc(u.nombre || u.email || u.id) + '</option>').join('');
      return '<div class="m33-session"><label>Día ' + esc(s.numero_dia) + ' · ' + esc(labelBloque(s.bloque)) + '</label><select data-m33-sid="' + esc(s.id) + '" data-bc-prev="' + esc(s.usuario_id || '') + '" style="width:100%;margin-top:6px;padding:9px;border-radius:8px">' + opts + '</select></div>';
    }).join('');
  }
  function step3() { return '<div class="m33-muted">Movimientos del expediente (si hay datos).</div>'; }
  function step4() { return '<div class="m33-muted">Inventario del expediente (si hay datos).</div>'; }
  function localDateKey() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function step5(t) {
    const st = String(t.estado_maestro || t.estado || '').toUpperCase();
    let html = '<div class="m33-session-row"><span>Estado</span><b>' + esc(st) + '</b></div>';
    const end = String(t.fecha_fin || '').slice(0, 10);
    const canRecover = state.isAdmin &&
      ['EN_CURSO', 'ABIERTO', 'PENDIENTE_APROBACION'].includes(st) &&
      /^\d{4}-\d{2}-\d{2}$/.test(end) && end < localDateKey();
    if (state.forceCloseMessage) {
      html += '<p class="m33-msg ok" id="m33-force-close-result">' + esc(state.forceCloseMessage) + '</p>';
    }
    if (canRecover) {
      html += '<div class="m33-session" style="margin-top:16px">' +
        '<h4>Recuperar turno vencido</h4>' +
        '<p class="m33-muted">Este turno ya terminó en la fecha programada, pero continúa abierto. El cierre forzado cerrará tramos activos, marcará como completadas las sesiones que estaban en curso y cancelará las que no comenzaron. No crea declaraciones de dinero, conteos de inventario ni un cuadre ficticio. La acción queda auditada con el motivo indicado.</p>' +
        '<label for="m33-force-close-reason">Motivo obligatorio del cierre administrativo</label>' +
        '<textarea id="m33-force-close-reason" rows="3" maxlength="1000" placeholder="Describe por qué el turno vencido no pudo cerrarse por el flujo normal"></textarea>' +
        '<div class="m33-actions" style="margin-top:10px"><button type="button" id="m33-force-close" class="danger" data-m33-force-close>Cerrar turno vencido (forzado y auditado)</button></div>' +
        '<p class="m33-msg" id="m33-force-close-msg" role="status" aria-live="polite"></p>' +
        '</div>';
    }
    return html;
  }

  function bodyDependienta(t) {
    var me = currentUserId();
    var mias = state.sesiones.filter(sesionAsignadaAMi);
    var html = '<div class="m33-summary"><div class="m33-box"><span>Almacén</span><b>' + esc(field(t.almacen_nombre || t.almacen)) + '</b></div><div class="m33-box"><span>Estado turno</span><b>' + esc(field(t.estado_maestro || t.estado)) + '</b></div><div class="m33-box"><span>Desde</span><b>' + esc(date(t.fecha_inicio)) + '</b></div><div class="m33-box"><span>Hasta</span><b>' + esc(date(t.fecha_fin)) + '</b></div></div>';
    html += '<h4 style="margin:18px 0 8px">Tus sesiones</h4>';
    html += '<p class="m33-muted">Solo ves las sesiones asignadas a vos. La secuencia la controla el sistema.</p>';
    html += '<p id="m33-dep-msg" class="m33-msg"></p>';
    if (!me) { html += '<p class="m33-muted">No se pudo identificar tu usuario.</p>'; return html; }
    if (!mias.length) { html += '<p class="m33-muted">No tenés sesiones asignadas en este turno.</p>'; return html; }
    html += mias.map(function (x) {
      var st = normEstadoSesion(x.estado);
      var labelSt = st === 'PENDIENTE' || st === 'PROGRAMADA' ? 'Sin comenzar' : st === 'EN_CURSO' ? 'En curso' : st === 'COMPLETADA' ? 'Completada' : (st || '—');
      var actions = '';
      if (st === 'PENDIENTE' || st === 'PROGRAMADA' || !st) actions = '<button type="button" class="m33-btn-sesion" data-m33-abrir-sesion="' + esc(x.id) + '">Abrir sesión</button>';
      else if (st === 'EN_CURSO') actions = '<span class="m33-pill m33-ok">Sesión en curso</span>';
      else actions = '<span class="m33-pill">' + esc(labelSt) + '</span>';
      return '<div class="m33-session"><div class="m33-session-row"><div><b>Día ' + esc(x.numero_dia || x.dia_n) + ' · ' + esc(labelBloque(x.bloque)) + '</b><div class="m33-muted">' + esc(date(x.fecha)) + ' · ' + esc(labelSt) + '</div></div><div>' + actions + '</div></div></div>';
    }).join('');
    return html;
  }

  function setDepMsg(text, ok) {
    var el = document.getElementById('m33-dep-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'm33-msg ' + (ok ? 'ok' : (text ? 'error' : ''));
  }

  // Apertura de una sesión M29/turno_sesiones. La RPC dedicada valida asignación,
  // fecha de hoy, secuencia estricta y crea el tramo + ABIERTO legacy en la misma transacción.
  async function abrirSesionDependienta(sesionId, btn) {
    if (!sesionId) return;
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
  async function forceCloseOverdueTurn(button) {
    if (!state.isAdmin || !state.turno || !state.turno.id) return;
    const reasonEl = document.getElementById('m33-force-close-reason');
    const msgEl = document.getElementById('m33-force-close-msg');
    const reason = String(reasonEl && reasonEl.value || '').trim();
    const end = String(state.turno.fecha_fin || '').slice(0, 10);
    if (!end || end >= localDateKey()) {
      if (msgEl) msgEl.textContent = 'El turno no figura vencido; se bloqueó la recuperación forzada.';
      return;
    }
    if (reason.length < 12) {
      if (msgEl) msgEl.textContent = 'Escribe un motivo concreto de al menos 12 caracteres.';
      if (reasonEl) reasonEl.focus();
      return;
    }
    if (!window.confirm('CONFIRMACIÓN FINAL: se cerrará el turno vencido y se cancelarán las sesiones que no comenzaron. Las sesiones en curso se marcarán como cierre forzado. No se crearán conteos ni declaraciones de dinero. ¿Continuar?')) return;
    if (button) button.disabled = true;
    if (msgEl) msgEl.textContent = 'Registrando cierre administrativo y auditoría…';
    try {
      const result = await API().forzarCierreAdmin(state.turno.id, reason);
      const estado = String(result && result.estado || '').toUpperCase();
      if (estado !== 'CERRADO' && !(result && result.ya_cerrado)) {
        throw new Error('El backend no confirmó el estado CERRADO. No se dará por completada la recuperación.');
      }
      const completed = Number(result && result.sesiones_completadas || 0);
      const cancelled = Number(result && result.sesiones_canceladas || 0);
      state.forceCloseMessage = 'Cierre forzado registrado en auditoría. Sesiones en curso cerradas: ' + completed + '; sesiones pendientes/programadas canceladas: ' + cancelled + '. No se inventaron declaraciones ni conteos.';
      await load(state.turno.id);
      renderModal();
    } catch (e) {
      const currentMsg = document.getElementById('m33-force-close-msg');
      if (currentMsg) currentMsg.textContent = 'No se cerró el turno: ' + String(e && e.message || e);
      const currentButton = document.getElementById('m33-force-close');
      if (currentButton) currentButton.disabled = false;
    }
  }

  async function deleteTurno() {
    if (!state.isAdmin) return;
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
    if (!state.isAdmin || !sel || !sel.dataset.m33Sid) return;
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
    if (!state.isAdmin) return;
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

  function renderModal() {
    const ov = document.getElementById('m33-bg');
    if (!ov) return;
    const t = state.turno;
    if (!state.isAdmin) {
      ov.innerHTML = '<div class="m33-modal"><div class="m33-head"><div class="m33-title"><div><h3>Tu turno · ' + esc(field(t.almacen_nombre || t.almacen)) + '</h3><div class="m33-muted">Sesión de trabajo</div></div><button type="button" id="m33-x">X</button></div></div><div class="m33-body">' + bodyDependienta(t) + '</div><div class="m33-foot"><div></div><div><button type="button" id="m33-close-final">Cerrar</button></div></div></div>';
      ov.querySelector('#m33-x').onclick = close;
      var c = ov.querySelector('#m33-close-final'); if (c) c.onclick = close;
      ov.querySelectorAll('[data-m33-abrir-sesion]').forEach(function (btn) { btn.addEventListener('click', function () { abrirSesionDependienta(btn.getAttribute('data-m33-abrir-sesion'), btn); }); });
      return;
    }
    const titles = ['Información', 'Asignaciones', 'Movimientos', 'Inventario', 'Resumen'];
    const bodies = [step1(t), step2(), step3(), step4(), step5(t)];
    const prev = state.step > 1 ? '<button type="button" id="m33-prev">Atrás</button>' : '';
    const next = state.step < 5 ? '<button type="button" id="m33-next" class="primary">Avanzar</button>' : '<button type="button" id="m33-close-final">Cerrar</button>';
    ov.innerHTML = '<div class="m33-modal"><div class="m33-head"><div class="m33-title"><div><h3>Turno · ' + esc(field(t.almacen_nombre || t.almacen)) + '</h3><div class="m33-muted">' + esc(titles[state.step - 1]) + '</div></div><button type="button" id="m33-x">X</button></div><div class="m33-steps">' + titles.map(function (x, i) { return '<div class="m33-step ' + (state.step === i + 1 ? 'active' : '') + '"><b>' + (i + 1) + '</b> · ' + x + '</div>'; }).join('') + '</div></div><div class="m33-body">' + bodies[state.step - 1] + '</div><div class="m33-foot"><div>' + (state.step === 1 && String(t.estado_maestro || t.estado || '').toUpperCase() === 'PROGRAMADO' ? '<button type="button" id="m33-delete" class="danger">Eliminar</button>' : '') + '</div><div>' + prev + (state.step === 2 ? '<button type="button" id="m33-save" style="margin-left:8px">Guardar</button>' : '') + next + '</div></div></div>';
    ov.querySelector('#m33-x').onclick = close;
    var p = ov.querySelector('#m33-prev'); if (p) p.onclick = function () { state.step--; renderModal(); };
    var n = ov.querySelector('#m33-next'); if (n) n.onclick = function () { state.step++; renderModal(); };
    var cf = ov.querySelector('#m33-close-final'); if (cf) cf.onclick = close;
    var d = ov.querySelector('#m33-delete'); if (d) d.onclick = deleteTurno;
    var forceClose = ov.querySelector('[data-m33-force-close]');
    if (forceClose) forceClose.addEventListener('click', function () { forceCloseOverdueTurn(forceClose); });
    var save = ov.querySelector('#m33-save'); if (save) save.onclick = saveAssignments;
    if (state.step === 2) bindAssignmentAutosave();
  }

  async function open(id) {
    css(); state.step = 1; state.busy = true; state.forceCloseMessage = ''; await resolveAdmin();
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
      e.preventDefault(); e.stopPropagation(); open(id);
    }, true);
  }
  function boot() { css(); intercept(); }
  window.__BC_M33 = { open: open, version: '33.7-dep', renderHome: renderHome };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
