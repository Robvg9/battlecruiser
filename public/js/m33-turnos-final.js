// BattleCruiser - M33 Turnos expediente (sin competencia HOME)
// HOME listado = solo M29. Este módulo solo abre expediente / detalle.
(function () {
  'use strict';
  if (window.__bcM33TurnosFinal) return;
  window.__bcM33TurnosFinal = true;

  const ROOT_ID = 'ciclos-m18-root';
  const API = () => window.BattleCruiserTurnoAPI;
  const state = { turno: null, sesiones: [], step: 1, busy: false };
  const root = () => document.getElementById(ROOT_ID);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c]));
  const date = v => !v ? '-' : (typeof fechaCorta === 'function' ? fechaCorta(v) : String(v).split('T')[0].split('-').reverse().join('/'));
  const money = v => Number(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CUP';
  const users = () => ((_cache && _cache.usuarios) || []).filter(u => u.activo !== false && !u.archivado);
  const field = v => (v == null || v === '') ? '-' : v;

  function css() {
    if (document.getElementById('bc-m33-css')) return;
    const s = document.createElement('style');
    s.id = 'bc-m33-css';
    s.textContent = '.m33-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}.m33-modal{width:min(920px,100%);max-height:90vh;overflow:hidden;background:var(--panel-bg,#171c24);color:var(--text,#fff);border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 26px 80px rgba(0,0,0,.5);display:flex;flex-direction:column}.m33-head{padding:20px 22px 12px;border-bottom:1px solid rgba(255,255,255,.08)}.m33-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.m33-title h3{margin:0;font-size:1.22rem}.m33-steps{display:flex;gap:7px;margin-top:14px;overflow:auto}.m33-step{flex:1;min-width:100px;padding:7px 9px;border:1px solid rgba(255,255,255,.1);border-radius:9px;font-size:.75rem;opacity:.55}.m33-step.active{opacity:1;border-color:rgba(59,130,246,.7);background:rgba(59,130,246,.12)}.m33-body{padding:20px 22px;overflow:auto}.m33-foot{padding:13px 22px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:10px}.m33-foot button{padding:10px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:transparent;color:inherit;font-weight:600;cursor:pointer}.m33-foot .primary{background:#2563eb;border-color:#2563eb;color:#fff}.m33-foot .danger{background:#b91c1c;border-color:#b91c1c;color:#fff}.m33-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.m33-box{padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:10px}.m33-box span{display:block;font-size:.72rem;opacity:.58;margin-bottom:3px}.m33-session{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}.m33-session-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.m33-pill{font-size:.72rem;padding:3px 8px;border-radius:999px;background:rgba(148,163,184,.14)}.m33-ok{background:rgba(34,197,94,.15);color:#86efac}.m33-warn{background:rgba(251,191,36,.15);color:#fde68a}.m33-table{width:100%;border-collapse:collapse;font-size:.82rem}.m33-table th,.m33-table td{padding:8px 7px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left}.m33-muted{opacity:.62}@media(max-width:720px){.m33-summary{grid-template-columns:1fr 1fr}}';
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

  function step1(t) {
    const s = state.sesiones;
    const assigned = s.filter(x => x.usuario_id).length;
    const declared = s.filter(x => x.dinero_declarado).length;
    return '<div class="m33-summary"><div class="m33-box"><span>Almacén</span><b>' + esc(field(t.almacen_nombre || t.almacen)) + '</b></div><div class="m33-box"><span>Estado</span><b>' + esc(field(t.estado_maestro || t.estado)) + '</b></div><div class="m33-box"><span>Desde</span><b>' + esc(date(t.fecha_inicio)) + '</b></div><div class="m33-box"><span>Hasta</span><b>' + esc(date(t.fecha_fin)) + '</b></div></div><div class="m33-summary" style="margin-top:9px"><div class="m33-box"><span>Duración</span><b>' + esc(field(t.dias_turno)) + ' día(s)</b></div><div class="m33-box"><span>Sesiones</span><b>' + s.length + '</b></div><div class="m33-box"><span>Dependientas</span><b>' + assigned + '/' + s.length + '</b></div><div class="m33-box"><span>Dinero</span><b>' + declared + '/' + s.length + '</b></div></div><h4 style="margin:20px 0 8px">Sesiones</h4>' + (s.map(x => '<div class="m33-session"><div class="m33-session-row"><div><b>Día ' + esc(x.numero_dia) + ' · ' + esc(x.bloque === 'MANANA' ? 'Mañana' : x.bloque === 'TARDE' ? 'Tarde' : x.bloque || '-') + '</b><div class="m33-muted">' + esc(date(x.fecha)) + '</div></div><div><span class="m33-pill ' + (x.usuario_id ? 'm33-ok' : 'm33-warn') + '">' + esc(x.usuario_nombre || (x.usuario_id ? 'Asignada' : 'Sin asignar')) + '</span></div></div></div>').join('') || '<div class="m33-muted">Sin sesiones.</div>');
  }
  function step2() {
    const us = users();
    return '<p class="m33-muted">Asigna una trabajadora a cada sesión.</p>' + state.sesiones.map(s => {
      const opts = '<option value="">Sin asignar</option>' + us.map(u => '<option value="' + esc(u.id) + '" ' + (String(u.id) === String(s.usuario_id || '') ? 'selected' : '') + '>' + esc(u.nombre || u.email || u.id) + '</option>').join('');
      return '<div class="m33-session"><label>Día ' + esc(s.numero_dia) + '</label><select data-m33-sid="' + esc(s.id) + '" style="width:100%;margin-top:6px;padding:9px;border-radius:8px">' + opts + '</select></div>';
    }).join('');
  }
  function step3(t) {
    return '<div class="m33-muted">Movimientos del expediente (si hay datos).</div>';
  }
  function step4(t) {
    return '<div class="m33-muted">Inventario del expediente (si hay datos).</div>';
  }
  function step5(t) {
    const st = String(t.estado_maestro || t.estado || '').toUpperCase();
    return '<div class="m33-session-row"><span>Estado</span><b>' + esc(st) + '</b></div>';
  }

  function close() { document.getElementById('m33-bg') && document.getElementById('m33-bg').remove(); }
  async function deleteTurno() {
    if (!confirm('¿Eliminar este Turno?')) return;
    try {
      await API().anularTurno(state.turno.id, 'Cancelado por ADMIN');
      close();
      if (window.__BC_M29__ && window.__BC_M29__.renderHome) window.__BC_M29__.renderHome();
    } catch (e) { alert('No se pudo eliminar: ' + (e.message || e)); }
  }
  async function saveAssignments() {
    const ov = document.getElementById('m33-bg');
    const sels = [].slice.call(ov.querySelectorAll('select[data-m33-sid]'));
    try {
      for (var i = 0; i < sels.length; i++) {
        if (sels[i].value) await API().asignarSesion(sels[i].dataset.m33Sid, sels[i].value);
      }
      await load(state.turno.id);
      renderModal();
    } catch (e) { alert('No se pudieron guardar: ' + (e.message || e)); }
  }
  function renderModal() {
    const ov = document.getElementById('m33-bg');
    if (!ov) return;
    const t = state.turno;
    const titles = ['Información', 'Asignaciones', 'Movimientos', 'Inventario', 'Resumen'];
    const bodies = [step1(t), step2(), step3(t), step4(t), step5(t)];
    const prev = state.step > 1 ? '<button id="m33-prev">Atrás</button>' : '';
    const next = state.step < 5 ? '<button id="m33-next" class="primary">Avanzar</button>' : '<button id="m33-close-final">Cerrar</button>';
    ov.innerHTML = '<div class="m33-modal"><div class="m33-head"><div class="m33-title"><div><h3>Turno · ' + esc(field(t.almacen_nombre || t.almacen)) + '</h3><div class="m33-muted">' + esc(titles[state.step - 1]) + '</div></div><button id="m33-x">X</button></div><div class="m33-steps">' + titles.map(function (x, i) { return '<div class="m33-step ' + (state.step === i + 1 ? 'active' : '') + '"><b>' + (i + 1) + '</b> · ' + x + '</div>'; }).join('') + '</div></div><div class="m33-body">' + bodies[state.step - 1] + '</div><div class="m33-foot"><div>' + (state.step === 1 && String(t.estado_maestro || t.estado || '').toUpperCase() === 'PROGRAMADO' ? '<button id="m33-delete" class="danger">Eliminar</button>' : '') + '</div><div>' + prev + (state.step === 2 ? '<button id="m33-save" style="margin-left:8px">Guardar</button>' : '') + next + '</div></div></div>';
    ov.querySelector('#m33-x').onclick = close;
    var p = ov.querySelector('#m33-prev'); if (p) p.onclick = function () { state.step--; renderModal(); };
    var n = ov.querySelector('#m33-next'); if (n) n.onclick = function () { state.step++; renderModal(); };
    var c = ov.querySelector('#m33-close-final'); if (c) c.onclick = close;
    var d = ov.querySelector('#m33-delete'); if (d) d.onclick = deleteTurno;
    var save = ov.querySelector('#m33-save'); if (save) save.onclick = saveAssignments;
  }

  async function open(id) {
    css();
    state.step = 1;
    state.busy = true;
    const ov = document.createElement('div');
    ov.id = 'm33-bg';
    ov.className = 'm33-bg';
    ov.innerHTML = '<div class="m33-modal"><div class="m33-body">Cargando expediente...</div></div>';
    document.body.appendChild(ov);
    try {
      await load(id);
      state.busy = false;
      renderModal();
    } catch (e) {
      state.busy = false;
      ov.innerHTML = '<div class="m33-modal"><div class="m33-body"><h3>No se pudo cargar el expediente</h3><p>' + esc(e.message || e) + '</p><button id="m33-error-close">Cerrar</button></div></div>';
      ov.querySelector('#m33-error-close').onclick = close;
    }
  }

  function renderHome() {
    if (window.__BC_M29__ && typeof window.__BC_M29__.renderHome === 'function') {
      if (window.__BC_M29__.claimHomeOwnership) window.__BC_M29__.claimHomeOwnership();
      return window.__BC_M29__.renderHome();
    }
  }

  function intercept() {
    const r = root();
    if (!r || r.dataset.m33Bound === '1') return;
    r.dataset.m33Bound = '1';
    r.addEventListener('click', function (e) {
      const card = e.target.closest('[data-m33-id],.m29-card');
      if (!card) return;
      const id = card.dataset.m33Id || card.dataset.turnoId || card.getAttribute('data-turno-id');
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      open(id);
    }, true);
  }

  function boot() {
    css();
    intercept();
    // NO rebind refrescarTurnos / refrescarCiclos - owner = M29
    // NO auto renderHome
  }

  window.__BC_M33 = { open: open, version: '33.3-exp', renderHome: renderHome };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
