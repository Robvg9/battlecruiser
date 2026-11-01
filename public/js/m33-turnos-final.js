// BattleCruiser - M33 Turnos expediente (sin competencia HOME)
// HOME listado = solo M29. Este módulo solo abre expediente / detalle.
// v33.17 — progreso real del turno y libro Excel compartido por rol
(function () {
  'use strict';
  if (window.__bcM33TurnosFinal) return;
  window.__bcM33TurnosFinal = true;

  const ROOT_ID = 'ciclos-m18-root';
  const API = () => window.BattleCruiserTurnoAPI;
  const state = { turno: null, sesiones: [], step: 1, busy: false, isAdmin: false, readOnly: false, staffError: '', staffLoading: false, staffLoaded: false, staffRequestAttempted: false, inventoryBook: null };
  const root = () => document.getElementById(ROOT_ID);
  const esc = v => String(v == null ? '' : v).replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
  const date = v => {
    if (!v) return '-';
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return typeof fechaCorta === 'function' ? fechaCorta(v) : s.split('T')[0].split('-').reverse().join('/');
  };
  const users = () => {
    if (window.__BC_M29__ && typeof window.__BC_M29__.eligibleStaff === 'function') {
      try { return window.__BC_M29__.eligibleStaff(); } catch (error) {}
    }
    const cache = (window._cache && Array.isArray(window._cache.usuarios)) ? window._cache.usuarios : [];
    const source = Array.isArray(window.__BC_M29_STAFF_CACHE__) ? window.__BC_M29_STAFF_CACHE__ : [];
    const rows = window.__BC_M29_STAFF_CACHE_LOADED__ === true ? source : cache;
    return rows.filter(function (user) {
      if (!user || !user.id || user.activo === false || user.archivado) return false;
      var role = user.rol || user.nombre_rol || user.role_name || user.role || '';
      if (role && typeof role === 'object') role = role.nombre || role.name || role.rol || '';
      role = String(role || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return role.indexOf('dependienta') >= 0 || role.indexOf('dueno') === 0 || role === 'admin' || role === 'administrador';
    });
  };
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

  async function ensureAssignmentUsers(forceRefresh) {
    const current = users();
    if (current.length && !forceRefresh) return current;
    if (!navigator.onLine) throw new Error('Conecta el dispositivo para consultar responsables.');
    const hub = window.__BC_M29__;
    if (hub && typeof hub.loadResponsibleStaff === 'function') {
      const rows = await hub.loadResponsibleStaff(!!forceRefresh);
      state.staffError = '';
      return rows;
    }
    if (!window.client || typeof window.client.rpc !== 'function') throw new Error('Cliente del servidor no disponible para cargar responsables.');
    const response = await window.client.rpc('listar_usuarios_admin', { p_incluir_archivados: false });
    if (response && response.error) throw response.error;
    const rows = Array.isArray(response && response.data) ? response.data : [];
    window.__BC_M29_STAFF_CACHE__ = rows;
    window.__BC_M29_STAFF_CACHE_LOADED__ = true;
    window._cache = window._cache || {};
    window._cache.usuarios = rows;
    const result = users();
    if (!result.length) throw new Error('La consulta no devolvió responsables activos elegibles.');
    state.staffError = '';
    return result;
  }

  function css() {
    if (document.getElementById('bc-m33-css')) return;
    const s = document.createElement('style');
    s.id = 'bc-m33-css';
    s.textContent = '.m33-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}.m33-modal{width:min(920px,100%);max-width:100%;box-sizing:border-box;max-height:94vh;max-height:94dvh;overflow:hidden;background:var(--panel-bg,#171c24);color:var(--text,#fff);border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 26px 80px rgba(0,0,0,.5);display:flex;flex-direction:column}.m33-head{padding:12px 16px 8px;border-bottom:1px solid rgba(255,255,255,.08)}.m33-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.m33-title h3{margin:0;font-size:1.22rem}.m33-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:10px;overflow:visible}.m33-step{min-width:0;padding:6px 4px;text-align:center;line-height:1.2;overflow-wrap:anywhere;border:1px solid rgba(255,255,255,.1);border-radius:9px;font-size:.75rem;opacity:.55}.m33-step.active{opacity:1;border-color:rgba(59,130,246,.7);background:rgba(59,130,246,.12)}.m33-body{padding:12px 16px;overflow:auto;overscroll-behavior:contain;min-height:0;flex:1 1 auto}.m33-foot{padding:9px 16px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:10px}.m33-foot button{padding:10px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:transparent;color:inherit;font-weight:600;cursor:pointer}.m33-foot .primary{background:#2563eb;border-color:#2563eb;color:#fff}.m33-foot .danger{background:#b91c1c;border-color:#b91c1c;color:#fff}.m33-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.m33-box{padding:8px 9px;border:1px solid rgba(255,255,255,.08);border-radius:10px}.m33-box span{display:block;font-size:.72rem;opacity:.58;margin-bottom:3px}.m33-session{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07)}.m33-session-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;min-width:0}.m33-assignment-grid .m33-assignment-card{display:grid;grid-template-columns:minmax(84px,.56fr) minmax(0,1fr);align-items:center;gap:8px;padding:5px 0;min-width:0}.m33-assignment-card label{min-width:0;margin:0!important;font-size:.76rem;line-height:1.25;overflow-wrap:anywhere}.m33-assignment-card select{width:100%;min-width:0;max-width:100%;box-sizing:border-box;margin:0!important;padding:7px 8px!important;min-height:38px;font-size:.86rem;line-height:1.2}.m33-assignment-card .m33-muted{min-width:0;font-size:.8rem;overflow-wrap:anywhere}.m33-session-row{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.m33-pill{font-size:.72rem;padding:3px 8px;border-radius:999px;background:rgba(148,163,184,.14)}.m33-ok{background:rgba(34,197,94,.15);color:#86efac}.m33-warn{background:rgba(251,191,36,.15);color:#fde68a}.m33-muted{opacity:.62}.m33-msg{min-height:1.2em;margin:6px 0;font-size:.9rem}.m33-msg.error{color:#f87171}.m33-msg.ok{color:#86efac}.m33-btn-sesion{padding:9px 14px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}.m33-btn-sesion:disabled{opacity:.5;cursor:not-allowed}.bc-m33-save-msg{font-size:.78rem;margin:6px 0;min-height:1em}.bc-m33-save-msg.ok{color:#86efac}.bc-m33-save-msg.error{color:#f87171}.m33-archive{margin-top:10px}.m33-archive-day{margin:6px 0;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:10px}.m33-archive-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.m33-archive-head b{display:block}.m33-archive-head small{display:block;opacity:.65;margin-top:3px}.m33-archive-head button{min-height:40px;padding:9px 12px;border-radius:8px;border:1px solid rgba(59,130,246,.55);background:rgba(59,130,246,.12);color:inherit;font-weight:600}.m33-archive-head button:disabled{opacity:.55}.m33-archive-host{margin-top:6px}.m33-archive-host[hidden]{display:none}.m33-archive-scroll{max-width:100%;overflow-x:auto}.m33-archive-table{width:100%;min-width:640px;border-collapse:collapse;font-size:.78rem}.m33-archive-table th,.m33-archive-table td{padding:6px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}.m33-archive-table th{opacity:.65}.m33-archive-empty{padding:10px;border:1px dashed rgba(255,255,255,.16);border-radius:8px;opacity:.75;font-size:.84rem}.m33-inventory{display:grid;gap:8px;margin-top:8px}.m33-inventory-day{padding:9px;border:1px solid rgba(255,255,255,.12);border-radius:9px}.m33-inventory-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.m33-inventory-head b{display:block}.m33-inventory-head small{display:block;opacity:.62;margin-top:2px}.m33-inventory-head button{min-height:34px;padding:7px 10px;border-radius:7px;border:1px solid rgba(59,130,246,.5);background:rgba(59,130,246,.12);color:inherit;font-size:.78rem;font-weight:600}.m33-inventory-host{margin-top:8px}.m33-inventory-host[hidden]{display:none}.m33-inventory-scroll{max-width:100%;overflow:auto}.m33-inventory-table{width:100%;min-width:720px;border-collapse:collapse;font-size:.74rem}.m33-inventory-table th,.m33-inventory-table td{padding:6px 7px;text-align:left;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.08);white-space:nowrap}.m33-inventory-table th{opacity:.65;font-weight:600}.m33-inventory-table td.m33-num{text-align:right;font-variant-numeric:tabular-nums}.m33-inventory-table tr.m33-opening{background:rgba(34,197,94,.07);font-weight:600}.m33-inventory-note{padding:8px 10px;margin:7px 0;border-left:2px solid rgba(201,162,77,.7);background:rgba(201,162,77,.07);font-size:.78rem;line-height:1.4}.m33-inventory-note.error{border-color:#ef7777;color:#ffc0bb}.m33-inventory-host .m33-archive-empty{margin-top:7px}@media(max-width:720px){.m33-bg{padding:6px}.m33-modal{width:100%;max-width:100%;box-sizing:border-box;max-height:calc(100dvh - 12px);border-radius:12px}.m33-head{padding:10px 12px 7px}.m33-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.m33-steps{grid-template-columns:repeat(3,minmax(0,1fr))}.m33-step{font-size:.68rem;padding:6px 4px}.m33-session-grid{grid-template-columns:minmax(0,1fr)}.m33-body{padding:10px 12px;min-height:0;flex:1 1 auto}.m33-foot{padding:9px 12px}.m33-foot button{padding:8px 11px}}';
    document.head.appendChild(s);
    if (!document.getElementById('bc-m33-compact-sheet-css')) {
      const compact = document.createElement('style');
      compact.id = 'bc-m33-compact-sheet-css';
      compact.textContent = [
        '.m33-bg{padding:6px!important}',
        '.m33-modal{width:min(1240px,calc(100vw - 12px))!important;max-width:1240px!important;max-height:calc(100dvh - 12px)!important;border-radius:12px!important}',
        '.m33-head{padding:8px 12px 6px!important}',
        '.m33-title h3{font-size:1.04rem!important;line-height:1.2!important}',
        '.m33-steps{gap:3px!important;margin-top:6px!important}',
        '.m33-step{padding:4px 2px!important;font-size:.66rem!important;line-height:1.12!important;border-radius:6px!important}',
        '.m33-body{padding:8px 12px!important}',
        '.m33-foot{padding:7px 12px!important}',
        '.m33-foot button{padding:7px 11px!important;font-size:11px!important}',
        '.m33-summary{gap:4px!important}',
        '.m33-box{padding:6px 7px!important}',
        '.m33-session{padding:4px 0!important}',
        '.m33-dep-cash{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;min-width:150px}.m33-dep-cash label{font-size:.7rem;display:grid;gap:3px}.m33-dep-cash input{width:100%;min-width:0;box-sizing:border-box;padding:7px 8px;border:1px solid rgba(255,255,255,.2);border-radius:7px;background:rgba(0,0,0,.18);color:inherit}.m33-dep-cash button{min-height:32px;padding:6px 9px;font-size:.76rem}.m33-dep-cash small{font-size:.7rem;line-height:1.3}.m33-dep-cash .m33-msg.error{color:#fca5a5}.m33-dep-cash .m33-msg.ok{color:#86efac}',
        '.m33-assignment-card select{min-height:31px!important;padding:5px 7px!important;font-size:11px!important}',
        '.m33-muted{font-size:.72rem!important;line-height:1.28!important}',
        '.m33-book{display:grid;gap:7px;min-width:0}',
        '.m33-book-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}',
        '.m33-book-top b{display:block;font-size:.94rem}',
        '.m33-book-top small{display:block;font-size:.68rem;opacity:.65;margin-top:2px}',
        '.m33-book-top button{min-height:29px;padding:5px 9px;border:1px solid rgba(59,130,246,.5);border-radius:6px;background:rgba(59,130,246,.12);color:inherit;font-size:10px;font-weight:600}',
        '.m33-book-host{display:grid;gap:9px;min-width:0}',
        '.m33-book-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}',
        '.m33-book-metric{min-width:0;padding:6px 7px;border:1px solid rgba(255,255,255,.1);border-radius:6px;background:rgba(255,255,255,.025)}',
        '.m33-book-metric small{display:block;font-size:9px;opacity:.62;line-height:1.1}',
        '.m33-book-metric b{display:block;font-size:12px;line-height:1.25;margin-top:3px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
        '.m33-book-section{min-width:0}',
        '.m33-book-section h4{font-size:11px;margin:2px 0 5px!important}',
        '.m33-book-scroll{width:100%;max-width:100%;overflow:auto;border:1px solid rgba(255,255,255,.11);border-radius:6px;-webkit-overflow-scrolling:touch}',
        '.m33-book-table{width:100%;min-width:1320px;border-collapse:separate;border-spacing:0;font-size:10px;font-variant-numeric:tabular-nums}',
        '.m33-book-table th,.m33-book-table td{padding:5px 6px;border-right:1px solid rgba(255,255,255,.055);border-bottom:1px solid rgba(255,255,255,.07);white-space:nowrap;text-align:right}',
        '.m33-book-table th{position:sticky;top:0;z-index:1;background:#202a32;color:#d9d2c2;font-size:9px;font-weight:700;text-align:center}',
        '.m33-book-table th:nth-child(5),.m33-book-table td:nth-child(5){position:sticky;left:0;z-index:2;text-align:left;background:#18241f;min-width:170px}',
        '.m33-book-table th:nth-child(5){z-index:3;background:#202a32}',
        '.m33-book-table td:first-child,.m33-book-table td:nth-child(5){text-align:left}',
        '.m33-book-table tfoot th,.m33-book-table tfoot td{background:rgba(212,176,92,.09);font-weight:700}',
        '.m33-book-table .m33-negative{color:#ffaaa0}',
        '.m33-book-note{padding:6px 8px;border-left:2px solid rgba(201,162,77,.7);background:rgba(201,162,77,.06);font-size:10px;line-height:1.3}',
        '.m33-book-subtables{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
        '.m33-book-subtable{width:100%;border-collapse:collapse;font-size:10px}',
        '.m33-book-subtable th,.m33-book-subtable td{padding:5px 6px;text-align:left;border-bottom:1px solid rgba(255,255,255,.07)}',
        '.m33-book-subtable th{font-size:9px;opacity:.65}',
        '.m33-book-empty{padding:7px 8px;border:1px dashed rgba(255,255,255,.15);border-radius:6px;font-size:10px;opacity:.72}',
        '@media(max-width:720px){.m33-bg{padding:3px!important}.m33-modal{width:calc(100vw - 6px)!important;max-height:calc(100dvh - 6px)!important;border-radius:9px!important}.m33-head{padding:6px 8px 5px!important}.m33-title h3{font-size:.96rem!important}.m33-steps{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:2px!important}.m33-step{font-size:.56rem!important;padding:4px 1px!important;overflow-wrap:anywhere}.m33-body{padding:6px 8px!important}.m33-foot{padding:6px 8px!important}.m33-book-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.m33-book-subtables{grid-template-columns:minmax(0,1fr)}.m33-book-table{min-width:1220px}}'
      ].join('');
      document.head.appendChild(compact);
    }
    if (!document.getElementById('bc-m33-dependent-card-css')) {
      var dependentStyle = document.createElement('style');
      dependentStyle.id = 'bc-m33-dependent-card-css';
      dependentStyle.textContent = [
        '.m33-dependent{display:grid;gap:12px}',
        '.m33-dependent-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:11px 12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.025)}',
        '.m33-dependent-top h4{margin:0 0 3px!important;font-size:1.02rem}',
        '.m33-dependent-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}',
        '.m33-dependent-meta .m33-box{min-width:0}',
        '.m33-dependent-schedule{font-size:.76rem;opacity:.7;margin:0}',
        '.m33-dependent-section{padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;min-width:0}',
        '.m33-dependent-section h4{margin:0 0 7px!important;font-size:.96rem}',
        '.m33-dependent-day{padding:9px 0;border-top:1px solid rgba(255,255,255,.07)}',
        '.m33-dependent-day:first-child{border-top:0;padding-top:2px}',
        '.m33-dependent-day-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}',
        '.m33-dependent-day-head b{font-size:.9rem}',
        '.m33-dependent-day-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px}',
        '.m33-dependent-legacy{font-size:.72rem;opacity:.64;margin-top:3px}',
        '.m33-dependent-cash-list{display:grid;gap:7px}',
        '.m33-dependent-cash-row{padding:9px;border-radius:9px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}',
        '.m33-dependent-cash-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:7px}',
        '.m33-dependent-cash-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}',
        '.m33-dependent-cash-metric{min-width:0}',
        '.m33-dependent-cash-metric small{display:block;font-size:.68rem;opacity:.62;line-height:1.2}',
        '.m33-dependent-cash-metric b{display:block;font-size:.88rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin-top:2px}',
        '.m33-dependent-note{font-size:.76rem;line-height:1.35;opacity:.68;margin:0}',
        '.m33-dependent-progress{display:flex;flex-wrap:wrap;gap:6px;margin-top:-5px}',
        '.m33-dependent-progress-item{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid rgba(255,255,255,.09);border-radius:999px;font-size:.7rem;line-height:1.2;opacity:.82}',
        '.m33-dependent-progress-item b{font-variant-numeric:tabular-nums}',
        '.m33-dependent-status-pill{white-space:normal;text-align:center;max-width:175px}',
        '.m33-dependent-status-pill.is-done{border-color:rgba(87,178,128,.4)}',
        '.m33-dependent-status-pill.is-progress{border-color:rgba(91,157,207,.4)}',
        '.m33-dependent-status-pill.is-review{border-color:rgba(215,166,79,.5)}',
        '.m33-dependent-status-pill.is-warning{border-color:rgba(208,114,90,.5)}',
        '.m33-dependent-details>summary{cursor:pointer;font-weight:650;padding:2px 0}',
        '.m33-dependent-details .m33-archive{margin-top:8px}',
        '.m33-dependent .m33-btn-sesion{min-height:36px;padding:7px 11px;font-size:.78rem}',
        '@media(max-width:720px){.m33-dependent{gap:9px}.m33-dependent-top{padding:9px}.m33-dependent-meta{gap:5px}.m33-dependent-section{padding:8px}.m33-dependent-cash-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.m33-dependent-cash-grid .m33-dependent-cash-metric:last-child{grid-column:1/-1}}'
      ].join('');
      document.head.appendChild(dependentStyle);
    }
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
    if (state.staffLoading) {
      return '<p class="m33-muted" role="status">Consultando responsables activos en el servidor…</p><p id="m33-asig-msg" class="bc-m33-save-msg"></p>';
    }
    if (!state.staffLoaded) {
      return '<p class="m33-muted" role="status">No se pudo confirmar la lista actual de responsables. ' + esc(state.staffError || 'La consulta aún no ha terminado.') + '</p>' +
        '<button type="button" class="m33-btn-sesion" data-m33-reload-staff>Reintentar carga de responsables</button>' +
        '<p id="m33-asig-msg" class="bc-m33-save-msg"></p>';
    }
    const us = users();
    if (!us.length) {
      return '<p class="m33-muted" role="status">El servidor respondió, pero no hay responsables activos elegibles para asignar.</p>' +
        '<button type="button" class="m33-btn-sesion" data-m33-reload-staff>Actualizar responsables</button>' +
        '<p id="m33-asig-msg" class="bc-m33-save-msg"></p>';
    }
    return '<p class="m33-muted">Responsable por sesión. Los cambios se guardan y verifican en el servidor.</p>' +
      '<p id="m33-asig-msg" class="bc-m33-save-msg"></p><div class="m33-session-grid m33-assignment-grid">' + state.sesiones.map(s => {
        const opts = '<option value="">Sin asignar</option>' + us.map(u => '<option value="' + esc(u.id) + '" ' +
          (String(u.id) === String(s.usuario_id || s.responsable_id || '') ? 'selected' : '') + '>' + esc(u.nombre || u.nombre_usuario || u.email || u.id) + '</option>').join('');
        return '<div class="m33-session m33-assignment-card"><label>Día ' + esc(s.numero_dia) + ' · ' + esc(labelBloque(s.bloque)) +
          '</label><select data-m33-sid="' + esc(s.id) + '" data-bc-prev="' + esc(s.usuario_id || s.responsable_id || '') + '">' + opts + '</select></div>';
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
  function inventoryDayGroups() {
    return archiveDayGroups(archiveSessionsForViewer());
  }
  function step4() {
    const sessions = archiveSessionsForViewer().slice().sort(function (a, b) {
      return String(a.fecha || '').localeCompare(String(b.fecha || ''));
    });
    if (!sessions.length) return '<div class="m33-archive-empty">No hay sesiones disponibles para consultar el inventario de este turno.</div>';
    const first = date(sessions[0].fecha);
    const last = date(sessions[sessions.length - 1].fecha);
    return '<section class="m33-book">' +
      '<header class="m33-book-top"><div><b>Inventario del turno</b><small>' + esc(first) + (first !== last ? ' → ' + esc(last) : '') + ' · ' + sessions.length + ' registro(s) de jornada</small></div>' +
      '<button type="button" data-m33-inventory-book>Actualizar libro</button></header>' +
      '<div class="m33-book-host" data-m33-inventory-host><div class="m33-archive-empty">Preparando la hoja de inventario…</div></div></section>';
  }
  function inventoryQuantity(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('es-ES', { maximumFractionDigits: 3 }) : '—';
  }
  function inventoryTimestamp(value) {
    if (!value) return '—';
    return String(value).replace('T', ' ').slice(0, 16);
  }
  function inventoryTypeLabel(value) {
    return ({
      compra: 'Compra / entrada',
      venta: 'Venta / salida',
      transferencia_salida: 'Transferencia de salida',
      transferencia_entrada: 'Transferencia de entrada',
      vale: 'Vale / salida',
      merma: 'Baja aprobada',
      baja: 'Baja aprobada'
    })[String(value || '').toLowerCase()] || String(value || 'Movimiento');
  }
  function bookNameKey(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function bookNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  function bookQty(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('es-ES', { maximumFractionDigits: 3 });
  }
  function bookMoney(value, approximate) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return (approximate ? '≈ ' : '') + Number(value).toLocaleString('es-ES', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }
  function bookRows(value) {
    if (Array.isArray(value)) return value;
    return value && typeof value === 'object' ? [value] : [];
  }
  function loadInventoryBook(button) {
    const overlay = document.getElementById('m33-bg');
    const host = overlay && overlay.querySelector('[data-m33-inventory-host]');
    if (!host || button.dataset.m33BookLoading === '1') return;
    button.disabled = true;
    button.dataset.m33BookLoading = '1';
    host.innerHTML = '<div class="m33-archive-empty">Calculando la hoja consolidada del turno…</div>';
    loadInventoryBookData(host).finally(function () {
      button.disabled = false;
      delete button.dataset.m33BookLoading;
    });
  }
  async function loadInventoryBookData(host) {
    try {
      const rpcClient = window.client;
      if (!navigator.onLine) throw new Error('El libro consolidado requiere conexión al servidor.');
      if (!rpcClient || typeof rpcClient.rpc !== 'function') throw new Error('Cliente del servidor no disponible.');
      const sessions = archiveSessionsForViewer().slice().sort(function (a, b) {
        return String(a.fecha || '').localeCompare(String(b.fecha || '')) ||
          Number(a.numero_dia || a.dia_n || 0) - Number(b.numero_dia || b.dia_n || 0);
      });
      if (!sessions.length) {
        host.innerHTML = '<div class="m33-book-empty">No hay sesiones asociadas a este turno.</div>';
        return;
      }
      const sessionData = [];
      const salesIds = new Set();
      let readable = 0;
      let denied = 0;
      let hasMovementRead = false;
      for (const session of sessions) {
        const isJornada = String(session.bloque || '').toUpperCase() === 'JORNADA';
        const calls = await Promise.all([
          rpcClient.rpc('bc7_movimientos_sesion', { p_turno_sesion_id: session.id }),
          isJornada
            ? rpcClient.rpc('bc7_obtener_inventario_jornada', { p_turno_sesion_id: session.id })
            : Promise.resolve({ data: null, error: null }),
          isJornada
            ? rpcClient.rpc('bc7_finanzas_jornada', { p_turno_sesion_id: session.id })
            : Promise.resolve({ data: null, error: null })
        ]);
        const movementResponse = calls[0];
        const inventoryResponse = calls[1];
        const financeResponse = calls[2];
        [movementResponse, inventoryResponse, financeResponse].forEach(function (response) {
          if (response && response.error) {
            if (String(response.error.code || '') === '42501') denied += 1;
            else throw response.error;
          }
        });
        const movementsDenied = movementResponse && movementResponse.error;
        const inventoryDenied = inventoryResponse && inventoryResponse.error;
        const financeDenied = financeResponse && financeResponse.error;
        if (!movementsDenied) {
          hasMovementRead = true;
          readable += 1;
        }
        const movementRows = movementsDenied ? [] : bookRows(movementResponse && movementResponse.data);
        movementRows.forEach(function (movement) {
          if (String(movement.tipo || '').toLowerCase() === 'venta' && movement.operacion_id) {
            salesIds.add(String(movement.operacion_id));
          }
        });
        sessionData.push({
          session: session,
          movements: movementRows,
          inventory: inventoryDenied ? null : (inventoryResponse && inventoryResponse.data || null),
          finance: financeDenied ? {} : (financeResponse && financeResponse.data || {}),
          movementDenied: !!movementsDenied
        });
      }
      if (!readable && denied) {
        host.innerHTML = '<div class="m33-book-empty">Tu perfil no tiene permiso para consultar los movimientos y el inventario de este turno.</div>';
        return;
      }

      const byId = new Map();
      const byName = new Map();
      function ensureProduct(id, name, unit) {
        const productId = id == null || id === '' ? '' : String(id);
        const nameText = String(name || (productId || 'Producto sin nombre'));
        const nameKey = bookNameKey(nameText);
        let row = productId ? byId.get(productId) : null;
        if (!row && nameKey && byName.has(nameKey)) row = byName.get(nameKey);
        if (!row) {
          row = {
            id: productId || null, name: nameText, unit: unit || '',
            opening: null, final: null, incoming: 0, reinvestment: 0,
            losses: 0, otherOut: 0, posMovementQty: 0,
            costWeightedQty: 0, costWeightedTotal: 0,
            saleCostQty: 0, saleCostTotal: 0,
            salePriceQty: 0, salePriceTotal: 0,
            saleLinesQty: 0, saleRevenue: 0, saleProfit: 0,
            hasSaleLine: false, hasSaleCost: true, currentPrice: null, lossCostTotal: 0, lossValueApprox: false
          };
        } else {
          if (productId && !row.id) row.id = productId;
          if (nameText && (!row.name || row.name === row.id || row.name === 'Producto sin nombre')) row.name = nameText;
          if (unit && !row.unit) row.unit = unit;
        }
        if (productId) byId.set(productId, row);
        if (nameKey) byName.set(nameKey, row);
        return row;
      }
      function addCost(row, quantity, unitCost) {
        const q = Math.abs(bookNumber(quantity));
        const cost = Number(unitCost);
        if (q > 0 && Number.isFinite(cost) && cost >= 0) {
          row.costWeightedQty += q;
          row.costWeightedTotal += q * cost;
        }
      }

      sessionData.forEach(function (entry) {
        const inventory = entry.inventory;
        if (inventory && Array.isArray(inventory.productos)) {
          inventory.productos.forEach(function (product) {
            ensureProduct(product.producto_id || product.id, product.nombre, product.unidad);
          });
        }
      });

      const jornadaSessions = sessionData.filter(function (entry) {
        return String(entry.session.bloque || '').toUpperCase() === 'JORNADA' && entry.inventory;
      });
      const firstInventory = jornadaSessions.length ? jornadaSessions[0].inventory : null;
      const lastInventory = jornadaSessions.length ? jornadaSessions[jornadaSessions.length - 1].inventory : null;
      const initialCut = firstInventory && firstInventory.cortes && firstInventory.cortes.INICIAL;
      const finalCut = lastInventory && lastInventory.cortes && lastInventory.cortes.FINAL;
      const hasOpening = !!(initialCut && initialCut.estado === 'CONFIRMADO');
      const hasFinal = !!(finalCut && finalCut.estado === 'CONFIRMADO');
      if (hasOpening) {
        bookRows(initialCut.lineas).forEach(function (line) {
          const row = ensureProduct(line.producto_id, null, '');
          row.opening = bookNumber(line.cantidad_contada);
        });
      }
      if (hasFinal) {
        bookRows(finalCut.lineas).forEach(function (line) {
          const row = ensureProduct(line.producto_id, null, '');
          row.final = bookNumber(line.cantidad_contada);
        });
      }

      const reinvestmentRows = [];
      const expenseRows = [];
      const pendingAdjustmentRows = [];
      const declarationFallback = [];
      let reinvestmentTotal = 0;
      let expenseTotal = 0;
      let expensePendingTotal = 0;
      let expenseRejectedTotal = 0;
      let expenseOtherStatusTotal = 0;
      sessionData.forEach(function (entry) {
        const session = entry.session;
        entry.movements.forEach(function (movement) {
          const type = String(movement.tipo || '').toLowerCase();
          const quantity = Math.abs(bookNumber(movement.cantidad));
          const row = ensureProduct(null, movement.producto, '');
          if (type === 'compra') {
            row.incoming += quantity;
            addCost(row, quantity, movement.costo_unitario);
          } else if (type === 'transferencia_entrada') {
            row.incoming += quantity;
          } else if (type === 'venta') {
            row.posMovementQty += quantity;
          } else if (type === 'merma' || type === 'baja') {
            row.losses += quantity;
            if (Number.isFinite(Number(movement.costo_unitario))) {
              row.lossCostTotal += quantity * Number(movement.costo_unitario);
            }
          } else if (type === 'vale' || type === 'transferencia_salida') {
            row.otherOut += quantity;
          }
        });
        const finance = entry.finance || {};
        bookRows(finance.reinversiones).forEach(function (reinvestment) {
          bookRows(reinvestment.lineas).forEach(function (line) {
            const row = ensureProduct(line.producto_id, line.producto, '');
            const quantity = Math.abs(bookNumber(line.cantidad_base));
            const total = Math.abs(bookNumber(line.costo_total));
            const unit = Number(line.costo_unitario);
            row.reinvestment += quantity;
            if (quantity > 0 && Number.isFinite(unit)) addCost(row, quantity, unit);
            else if (quantity > 0 && total > 0) addCost(row, quantity, total / quantity);
            reinvestmentTotal += total;
            reinvestmentRows.push({
              date: reinvestment.fecha || session.fecha,
              product: line.producto || line.producto_id || '—',
              quantity: quantity,
              unitCost: Number.isFinite(unit) ? unit : (quantity ? total / quantity : null),
              total: total,
              actor: reinvestment.usuario_nombre || '—',
              supplier: reinvestment.proveedor || ''
            });
          });
        });
        bookRows(finance.gastos).forEach(function (expense) {
          const amount = bookNumber(expense.monto);
          const expenseStatus = String(expense.estado || 'REGISTRADO').toUpperCase();
          if (expenseStatus === 'APROBADO') expenseTotal += amount;
          else if (expenseStatus === 'PENDIENTE') expensePendingTotal += amount;
          else if (expenseStatus === 'RECHAZADO') expenseRejectedTotal += amount;
          else expenseOtherStatusTotal += amount;
          expenseRows.push({
            date: expense.creado_en || session.fecha,
            concept: expense.concepto || 'Gasto operativo',
            description: expense.descripcion || expense.comentario_revision || '',
            amount: amount,
            status: expense.estado || 'Registrado',
            actor: expense.creado_nombre || '—'
          });
        });
        ['mermas', 'bajas'].forEach(function (bucket) {
          bookRows(finance[bucket]).forEach(function (request) {
            const status = String(request.estado || 'PENDIENTE').toUpperCase();
            if (status === 'APROBADA') return;
            pendingAdjustmentRows.push({
              date: request.creado_en || session.fecha,
              kind: 'Baja',
              product: request.producto || request.producto_id || '—',
              quantity: bookNumber(request.cantidad),
              reason: request.motivo || '',
              status: status + ' · no descuenta existencias',
              actor: request.creado_nombre || '—'
            });
          });
        });
        const declaration = entry.inventory && entry.inventory.declaracion_dinero;
        if (declaration && declaration.monto != null) {
          declarationFallback.push({
            sessionId: String(session.id),
            date: declaration.declarado_at || session.fecha,
            amount: bookNumber(declaration.monto),
            currency: declaration.moneda || 'Sin moneda registrada',
            userId: declaration.usuario_id || (entry.inventory.sesion && entry.inventory.sesion.responsable_id) || session.usuario_id,
            status: declaration.estado_aprobacion || 'Declarado',
            collected: declaration.monto_contado == null ? null : bookNumber(declaration.monto_contado),
            difference: declaration.diferencia == null ? null : bookNumber(declaration.diferencia),
            counterId: declaration.contado_por || null,
            countedAt: declaration.contado_at || null
          });
        }
      });

      let salesLines = null;
      if (salesIds.size && typeof rpcClient.from === 'function') {
        try {
          const salesResponse = await rpcClient.from('ventas_lineas')
            .select('venta_id,producto_id,cantidad,precio_unitario,subtotal,costo_unitario_fifo')
            .in('venta_id', Array.from(salesIds));
          if (salesResponse && salesResponse.error) throw salesResponse.error;
          salesLines = Array.isArray(salesResponse && salesResponse.data) ? salesResponse.data : [];
        } catch (salesError) {
          salesLines = null;
        }
      } else if (!salesIds.size) {
        salesLines = [];
      }
      if (salesLines) {
        salesLines.forEach(function (line) {
          const row = ensureProduct(line.producto_id, null, '');
          const quantity = Math.abs(bookNumber(line.cantidad));
          const unitPrice = Number(line.precio_unitario);
          const subtotal = Number.isFinite(Number(line.subtotal))
            ? Number(line.subtotal)
            : (Number.isFinite(unitPrice) ? quantity * unitPrice : 0);
          const unitCost = Number(line.costo_unitario_fifo);
          row.saleLinesQty += quantity;
          row.saleRevenue += subtotal;
          row.hasSaleLine = true;
          if (Number.isFinite(unitPrice)) {
            row.salePriceQty += quantity;
            row.salePriceTotal += unitPrice * quantity;
          }
          if (quantity > 0 && Number.isFinite(unitCost)) {
            row.saleCostQty += quantity;
            row.saleCostTotal += unitCost * quantity;
            row.saleProfit += subtotal - unitCost * quantity;
          } else if (quantity > 0) {
            row.hasSaleCost = false;
          }
        });
      }

      const productIds = Array.from(byId.keys());
      const cachedProducts = (window._cache && Array.isArray(window._cache.productos)) ? window._cache.productos : [];
      cachedProducts.forEach(function (product) {
        const row = product && byId.get(String(product.id || product.producto_id || ''));
        if (row && Number.isFinite(Number(product.precio_normal))) row.currentPrice = Number(product.precio_normal);
      });
      if (productIds.length && typeof rpcClient.from === 'function') {
        try {
          const priceResponse = await rpcClient.from('productos').select('id,nombre,precio_normal').in('id', productIds);
          if (!priceResponse.error) {
            (priceResponse.data || []).forEach(function (product) {
              const row = byId.get(String(product.id));
              if (row && Number.isFinite(Number(product.precio_normal))) row.currentPrice = Number(product.precio_normal);
              if (row && product.nombre) row.name = product.nombre;
            });
          }
        } catch (priceError) {}
      }

      let declarations = null;
      if (typeof rpcClient.from === 'function') {
        try {
          const declarationResponse = await rpcClient.from('turno_declaraciones')
            .select('turno_sesion_id,turno_tramo_id,usuario_id,monto,moneda,declarado_at,estado_aprobacion,monto_contado,diferencia,contado_por,contado_at,observacion_conteo')
            .in('turno_sesion_id', sessions.map(function (session) { return String(session.id); }));
          if (!declarationResponse.error) declarations = Array.isArray(declarationResponse.data) ? declarationResponse.data : [];
        } catch (declarationError) {}
      }
      const cashRows = [];
      if (declarations && declarations.length) {
        const sessionMap = new Map(sessions.map(function (session) { return [String(session.id), session]; }));
        declarations.forEach(function (declaration) {
          const session = sessionMap.get(String(declaration.turno_sesion_id));
          if (!session) return;
          cashRows.push({
            sessionId: String(session.id),
            date: declaration.declarado_at || session.fecha,
            responsible: inventoryUserLabel(declaration.usuario_id || session.usuario_id),
            declared: bookNumber(declaration.monto),
            currency: declaration.moneda || 'Sin moneda registrada',
            status: declaration.estado_aprobacion || 'Declarado',
            collected: declaration.monto_contado == null ? null : bookNumber(declaration.monto_contado),
            difference: declaration.diferencia == null ? null : bookNumber(declaration.diferencia),
            counter: inventoryUserLabel(declaration.contado_por),
            countedAt: declaration.contado_at || null
          });
        });
      } else {
        declarationFallback.forEach(function (declaration) {
          const session = sessions.find(function (item) { return String(item.id) === declaration.sessionId; });
          cashRows.push({
            sessionId: declaration.sessionId,
            date: declaration.date,
            responsible: inventoryUserLabel(declaration.userId || (session && session.usuario_id)),
            declared: declaration.amount,
            currency: declaration.currency || 'Sin moneda registrada',
            status: declaration.status,
            collected: declaration.collected == null ? null : declaration.collected,
            difference: declaration.difference == null ? null : declaration.difference,
            counter: inventoryUserLabel(declaration.counterId),
            countedAt: declaration.countedAt || null
          });
        });
      }
      const coveredCashSessions = new Set(cashRows.map(function (row) { return String(row.sessionId || ''); }));
      sessions.forEach(function (session) {
        if (!session || !session.dinero_id || coveredCashSessions.has(String(session.id))) return;
        cashRows.push({
          sessionId: String(session.id),
          date: session.fecha,
          responsible: inventoryUserLabel(session.usuario_id),
          declared: bookNumber(session.dinero_monto),
          currency: 'CUP',
          status: session.dinero_estado_aprobacion || 'Declarado',
          collected: session.dinero_monto_contado == null ? null : bookNumber(session.dinero_monto_contado),
          difference: session.dinero_diferencia == null ? null : bookNumber(session.dinero_diferencia),
          counter: inventoryUserLabel(session.dinero_contado_por),
          countedAt: session.dinero_contado_at || null
        });
      });
      cashRows.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });

      const productRows = Array.from(new Set(Array.from(byId.values()).concat(Array.from(byName.values()))))
        .filter(function (row) { return row && row.name; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'es'); });
      const totals = {
        opening: 0, incoming: 0, reinvestment: 0, losses: 0, otherOut: 0,
        final: 0, balanceSales: 0, posSales: 0, profit: 0, revenue: 0, lossValue: 0,
        declaration: 0
      };
      const allOpening = productRows.length > 0 && productRows.every(function (row) { return row.opening != null; });
      const allFinal = productRows.length > 0 && productRows.every(function (row) { return row.final != null; });
      const tableRows = productRows.map(function (row) {
        const cost = row.hasSaleCost && row.saleCostQty > 0
          ? row.saleCostTotal / row.saleCostQty
          : (row.costWeightedQty > 0 ? row.costWeightedTotal / row.costWeightedQty : null);
        const hasLineDetail = !!(salesLines && row.hasSaleLine);
        const saleQty = hasLineDetail ? row.saleLinesQty : row.posMovementQty;
        const salePrice = hasLineDetail && row.salePriceQty > 0
          ? row.salePriceTotal / row.salePriceQty : row.currentPrice;
        const costApprox = !(row.hasSaleCost && row.saleCostQty > 0) && cost != null;
        const priceApprox = !hasLineDetail && salePrice != null;
        const unitGain = salePrice != null && cost != null ? salePrice - cost : null;
        const unitGainApprox = (costApprox || priceApprox) && unitGain != null;
        const markup = cost > 0 && unitGain != null ? unitGain / cost * 100 : null;
        const balanceSales = row.opening != null && row.final != null
          ? row.opening + row.incoming + row.reinvestment - row.losses - row.otherOut - row.final
          : null;
        const revenue = hasLineDetail
          ? row.saleRevenue
          : (saleQty > 0 && salePrice != null ? saleQty * salePrice : (row.posMovementQty > 0 ? null : 0));
        const profit = hasLineDetail && row.hasSaleCost
          ? row.saleProfit
          : (saleQty > 0 && unitGain != null ? saleQty * unitGain : (row.posMovementQty > 0 ? null : 0));
        const revenueApprox = !hasLineDetail && saleQty > 0 && revenue != null;
        const profitApprox = (!hasLineDetail || !row.hasSaleCost) && saleQty > 0 && profit != null;
        const lossValue = row.lossCostTotal > 0
          ? row.lossCostTotal
          : (row.losses > 0 && cost != null ? row.losses * cost : null);
        const lossValueApprox = row.losses > 0 && row.lossCostTotal <= 0 && lossValue != null;
        if (row.opening != null) totals.opening += row.opening;
        if (row.final != null) totals.final += row.final;
        totals.incoming += row.incoming;
        totals.reinvestment += row.reinvestment;
        totals.losses += row.losses;
        totals.otherOut += row.otherOut;
        if (balanceSales != null) totals.balanceSales += balanceSales;
        totals.posSales += saleQty;
        if (profit != null) totals.profit += profit;
        if (revenue != null) totals.revenue += revenue;
        if (lossValue != null) totals.lossValue += lossValue;
        return Object.assign({}, row, {
          cost: cost,
          salePrice: salePrice,
          unitGain: unitGain,
          unitGainApprox: unitGainApprox,
          costApprox: costApprox,
          priceApprox: priceApprox,
          markup: markup,
          markupApprox: unitGainApprox,
          balanceSales: balanceSales,
          saleQty: saleQty,
          revenue: revenue,
          profit: profit,
          revenueApprox: revenueApprox,
          profitApprox: profitApprox,
          lossValue: lossValue,
          lossValueApprox: lossValueApprox
        });
      });
      const salesApprox = !salesLines || (salesIds.size > 0 && salesLines.length === 0);
      const hasAnySalesDetail = !!salesLines && salesLines.length > 0;
      const declaredByCurrency = new Map();
      cashRows.forEach(function (row) {
        const currency = String(row.currency || 'Sin moneda registrada');
        declaredByCurrency.set(currency, (declaredByCurrency.get(currency) || 0) + bookNumber(row.declared));
      });
      const fmtCell = function (value, type, approximate) {
        if (value == null) return '—';
        return type === 'money' ? bookMoney(value, approximate) : bookQty(value);
      };
      const totalsApprox = tableRows.some(function (row) { return row.revenueApprox || row.profitApprox; });
      const totalLossApprox = tableRows.some(function (row) { return row.lossValueApprox; });
      const tableBody = tableRows.map(function (row) {
        const cells = [
          row.markup == null ? '—' : (row.markupApprox ? '≈ ' : '') + row.markup.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '%',
          fmtCell(row.unitGain, 'money', row.unitGainApprox),
          fmtCell(row.cost, 'money', row.costApprox),
          fmtCell(row.salePrice, 'money', row.priceApprox),
          esc(row.name),
          fmtCell(row.opening, 'qty', false),
          fmtCell(row.incoming, 'qty', false),
          fmtCell(row.reinvestment, 'qty', false),
          fmtCell(row.losses, 'qty', false),
          fmtCell(row.otherOut, 'qty', false),
          fmtCell(row.final, 'qty', false),
          fmtCell(row.balanceSales, 'qty', false),
          fmtCell(row.saleQty, 'qty', false),
          fmtCell(row.profit, 'money', row.profitApprox),
          fmtCell(row.revenue, 'money', row.revenueApprox),
          fmtCell(row.lossValue, 'money', row.lossValueApprox)
        ];
        return '<tr>' + cells.map(function (cell, index) {
          return '<td' + ((index === 13 || index === 14 || index === 15) ? ' class="m33-num"' : '') + '>' + cell + '</td>';
        }).join('') + '</tr>';
      }).join('');
      const totalMarkup = '<tr><th colspan="5">TOTAL DEL TURNO</th>' +
        '<td>' + (allOpening ? bookQty(totals.opening) : '—') + '</td>' +
        '<td>' + bookQty(totals.incoming) + '</td>' +
        '<td>' + bookQty(totals.reinvestment) + '</td>' +
        '<td>' + bookQty(totals.losses) + '</td>' +
        '<td>' + bookQty(totals.otherOut) + '</td>' +
        '<td>' + (allFinal ? bookQty(totals.final) : '—') + '</td>' +
        '<td>' + (allOpening && allFinal ? bookQty(totals.balanceSales) : '—') + '</td>' +
        '<td>' + bookQty(totals.posSales) + '</td>' +
        '<td>' + bookMoney(totals.profit, totalsApprox) + '</td>' +
        '<td>' + bookMoney(totals.revenue, totalsApprox) + '</td>' +
        '<td>' + bookMoney(totals.lossValue, totalLossApprox) + '</td></tr>';
      const reinvestmentBody = reinvestmentRows.length ? reinvestmentRows.map(function (row) {
        return '<tr><td>' + esc(date(row.date)) + '</td><td>' + esc(row.product) + '</td><td>' + bookQty(row.quantity) +
          '</td><td>' + bookMoney(row.unitCost, false) + '</td><td>' + bookMoney(row.total, false) + '</td><td>' +
          esc(row.actor) + (row.supplier ? '<small> · ' + esc(row.supplier) + '</small>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="6">Sin reinversiones registradas.</td></tr>';
      const expenseBody = expenseRows.length ? expenseRows.map(function (row) {
        return '<tr><td>' + esc(date(row.date)) + '</td><td>' + esc(row.concept) +
          (row.description ? '<small>' + esc(row.description) + '</small>' : '') + '</td><td>' +
          bookMoney(row.amount, false) + '</td><td>' + esc(row.status) + '</td><td>' + esc(row.actor) + '</td></tr>';
      }).join('') : '<tr><td colspan="5">Sin gastos registrados.</td></tr>';
      const cashBody = cashRows.length ? cashRows.map(function (row) {
        const counted = row.collected == null ? '—' : bookMoney(row.collected, false) +
          (row.counter ? '<small> · ' + esc(row.counter) + '</small>' : '');
        const difference = row.difference == null ? '—' : bookMoney(row.difference, false);
        return '<tr><td>' + esc(date(row.date)) + '</td><td>' + esc(row.responsible) + '</td><td>' +
          bookMoney(row.declared, false) + ' ' + esc(row.currency || 'Sin moneda registrada') + '</td><td>' + counted +
          '</td><td>' + difference + '</td><td>' + esc(row.status) + '</td></tr>';
      }).join('') : '<tr><td colspan="6">No hay declaraciones de dinero registradas.</td></tr>';
      const pendingAdjustmentBody = pendingAdjustmentRows.length ? pendingAdjustmentRows.map(function (row) {
        return '<tr><td>' + esc(date(row.date)) + '</td><td>' + esc(row.kind) + '</td><td>' + esc(row.product) +
          '</td><td>' + bookQty(row.quantity) + '</td><td>' + esc(row.reason) + '</td><td>' + esc(row.status) +
          '</td><td>' + esc(row.actor) + '</td></tr>';
      }).join('') : '<tr><td colspan="7">No hay solicitudes pendientes o rechazadas asociadas al turno.</td></tr>';
      const snapshotNote = (!hasOpening || !hasFinal)
        ? 'El inventario inicial y/o final no está confirmado en todas las fechas que delimitan el turno. La columna “Venta (saldo)” queda sin cálculo cuando falta uno de esos cortes.'
        : '';
      const needsRevenueEstimate = tableRows.some(function (row) { return row.revenueApprox; });
      const needsProfitEstimate = tableRows.some(function (row) { return row.profitApprox; });
      const salesNote = needsRevenueEstimate
        ? 'Algunos importes POS están aproximados con precio actual porque no se pudo leer su línea histórica. La ganancia usa costo FIFO cuando está disponible; cualquier alternativa se marca ≈.'
        : (needsProfitEstimate
          ? 'El ingreso procede de líneas POS históricas; la ganancia de productos sin costo FIFO completo usa un costo alternativo documentado y se marca como aproximada.'
          : 'El ingreso y la ganancia POS proceden de las líneas de venta y su costo FIFO histórico.');
      const cashNote = 'La declaración de la responsable y el conteo físico del dueño se guardan por separado. Las diferencias quedan vinculadas al expediente y requieren revisión; no se descuenta dinero automáticamente.';
      const summaryItems = [
        ['Ingreso POS', bookMoney(totals.revenue, totalsApprox)],
        ['Ganancia', bookMoney(totals.profit, totalsApprox)],
        ['Reinversiones', bookMoney(reinvestmentTotal, false)],
        ['Gastos aprobados', bookMoney(expenseTotal, false)],
        ['Gastos pendientes', bookMoney(expensePendingTotal, false)]
      ];
      if (expenseRejectedTotal > 0) summaryItems.push(['Gastos rechazados', bookMoney(expenseRejectedTotal, false)]);
      if (expenseOtherStatusTotal > 0) summaryItems.push(['Gastos · otros estados', bookMoney(expenseOtherStatusTotal, false)]);
      declaredByCurrency.forEach(function (amount, currency) {
        summaryItems.push(['Dinero declarado · ' + currency, bookMoney(amount, false) + (currency === 'Sin moneda registrada' ? '' : ' ' + currency)]);
      });
      const summary = summaryItems.map(function (item) {
        return '<div class="m33-book-metric"><small>' + item[0] + '</small><b>' + item[1] + '</b></div>';
      }).join('');
      const notes = [snapshotNote, salesNote, cashNote].filter(Boolean).map(function (item) {
        return '<div class="m33-book-note">' + esc(item) + '</div>';
      }).join('');
      host.innerHTML = '<div class="m33-book-summary">' + summary + '</div>' + notes +
        '<section class="m33-book-section"><h4>Inventario consolidado por producto</h4><div class="m33-book-scroll">' +
        '<table class="m33-book-table"><thead><tr><th>% G</th><th>G/u</th><th>P.C.</th><th>P.V.</th><th>Producto</th><th>Inv. inicial</th><th>Entradas</th><th>Reinversión</th><th>Bajas</th><th>Otros</th><th>Inv. final</th><th>Venta (saldo)</th><th>Venta POS</th><th>Ganancia</th><th>Ingreso</th><th>Bajas $</th></tr></thead><tbody>' +
        (tableBody || '<tr><td colspan="16">No hay productos asociados a los cortes o movimientos del turno.</td></tr>') +
        '</tbody><tfoot>' + totalMarkup + '</tfoot></table></div></section>' +
        '<div class="m33-book-subtables">' +
        '<section class="m33-book-section"><h4>Reinversiones detalladas · ' + bookMoney(reinvestmentTotal, false) + '</h4><div class="m33-book-scroll"><table class="m33-book-subtable"><thead><tr><th>Fecha</th><th>Producto</th><th>Uds.</th><th>P.C.</th><th>Inversión</th><th>Responsable</th></tr></thead><tbody>' + reinvestmentBody + '</tbody></table></div></section>' +
        '<section class="m33-book-section"><h4>Gastos aprobados · ' + bookMoney(expenseTotal, false) +
        ' · pendientes ' + bookMoney(expensePendingTotal, false) + '</h4><div class="m33-book-scroll"><table class="m33-book-subtable"><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>' + expenseBody + '</tbody></table></div></section>' +
        '</div>' +
        '<section class="m33-book-section"><h4>Conciliación de dinero</h4><div class="m33-book-scroll"><table class="m33-book-subtable"><thead><tr><th>Fecha</th><th>Responsable</th><th>Declarado</th><th>Contado por dueño</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>' + cashBody + '</tbody></table></div></section>' +
        '<section class="m33-book-section"><h4>Solicitudes de baja · fuera del saldo hasta aprobarse</h4><div class="m33-book-scroll"><table class="m33-book-subtable"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Motivo</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>' + pendingAdjustmentBody + '</tbody></table></div></section>';
      state.inventoryBook = {
        products: tableRows,
        totals: totals,
        reinvestmentRows: reinvestmentRows,
        expenseRows: expenseRows,
        cashRows: cashRows,
        pendingAdjustmentRows: pendingAdjustmentRows,
        salesApprox: salesApprox,
        hasMovementRead: hasMovementRead
      };
    } catch (error) {
      host.innerHTML = '<div class="m33-book-empty">No se pudo construir el inventario consolidado: ' +
        esc(error && error.message ? error.message : error) + '. No se han modificado registros.</div>';
    }
  }

  function renderInventoryLedger(rows, hasOpening, pendingMessage) {
    if (!rows.length) {
      return (pendingMessage ? '<div class="m33-inventory-note">' + esc(pendingMessage) + '</div>' : '') +
        '<div class="m33-archive-empty">Todavía no hay movimientos registrados para este día. ' +
        (hasOpening ? 'El libro conserva el saldo inicial confirmado.' : 'Cuando exista el primer conteo físico confirmado, aparecerá como saldo de apertura.') +
        '</div>';
    }
    const balances = new Map();
    rows.sort(function (a, b) {
      return String(a.timestamp || '').localeCompare(String(b.timestamp || '')) ||
        Number(a.order || 0) - Number(b.order || 0);
    });
    const body = rows.map(function (row) {
      const productKey = String(row.productKey || row.productId || '');
      let balance = null;
      if (row.kind === 'opening') {
        balance = Number(row.quantity);
        if (productKey) balances.set(productKey, balance);
      } else if (row.stockEffect != null && productKey && balances.has(productKey)) {
        balance = balances.get(productKey) + Number(row.stockEffect);
        balances.set(productKey, balance);
      } else if (productKey && balances.has(productKey)) {
        balance = balances.get(productKey);
      }
      const incoming = row.kind === 'opening' || row.stockEffect == null ? '—' :
        Number(row.stockEffect) > 0 ? inventoryQuantity(row.stockEffect) : '—';
      const outgoing = row.stockEffect != null && Number(row.stockEffect) < 0
        ? inventoryQuantity(Math.abs(Number(row.stockEffect))) : '—';
      const opening = row.kind === 'opening' ? inventoryQuantity(row.quantity) : '—';
      const cash = row.cashOut != null ? inventoryQuantity(row.cashOut) : '—';
      const saldo = balance == null ? '—' : inventoryQuantity(balance);
      const detail = row.detail ? '<div class="m33-muted">' + esc(row.detail) + '</div>' : '';
      return '<tr class="' + (row.kind === 'opening' ? 'm33-opening' : '') + '">' +
        '<td>' + esc(inventoryTimestamp(row.timestamp)) + '</td>' +
        '<td>' + esc(row.label || 'Movimiento') + detail + '</td>' +
        '<td>' + esc(row.product || '—') + '</td>' +
        '<td class="m33-num">' + incoming + '</td>' +
        '<td class="m33-num">' + outgoing + '</td>' +
        '<td class="m33-num">' + opening + '</td>' +
        '<td class="m33-num">' + saldo + '</td>' +
        '<td class="m33-num">' + cash + '</td>' +
        '<td>' + esc(row.status || 'Registrado') + '</td>' +
        '<td>' + esc(row.actor || '—') + '</td></tr>';
    }).join('');
    return (pendingMessage ? '<div class="m33-inventory-note">' + esc(pendingMessage) + '</div>' : '') +
      '<div class="m33-inventory-scroll"><table class="m33-inventory-table"><thead><tr>' +
      '<th>Fecha/hora</th><th>Movimiento</th><th>Producto / concepto</th><th>Entradas</th><th>Salidas</th><th>Saldo inicial</th><th>Saldo</th><th>Gasto CUP</th><th>Estado</th><th>Responsable</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  async function loadInventoryDay(button) {
    const group = button.closest('.m33-inventory-day');
    const host = group && group.querySelector('[data-m33-inventory-host]');
    if (!host) return;
    if (button.dataset.m33InventoryLoading === '1') return;
    if (host.dataset.loaded === '1') {
      host.hidden = !host.hidden;
      button.setAttribute('aria-expanded', host.hidden ? 'false' : 'true');
      return;
    }
    host.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.disabled = true;
    button.dataset.m33InventoryLoading = '1';
    host.innerHTML = '<div class="m33-archive-empty">Consultando el libro de inventario…</div>';
    const ids = String(button.dataset.m33InventorySessions || '').split('|').filter(Boolean);
    const sessionsById = new Map((state.sesiones || []).map(function (session) { return [String(session.id), session]; }));
    const ledgerRows = [];
    let hasOpening = false;
    let anyReadable = false;
    let denied = 0;
    let pendingMessages = [];
    try {
      const rpcClient = window.client;
      if (!navigator.onLine) throw new Error('El libro requiere conexión al servidor.');
      if (!rpcClient || typeof rpcClient.rpc !== 'function') throw new Error('Cliente del servidor no disponible.');
      for (const sessionId of ids) {
        const session = sessionsById.get(String(sessionId));
        if (!session) continue;
        let inventory = null;
        if (String(session.bloque || '').toUpperCase() === 'JORNADA') {
          const inventoryResponse = await rpcClient.rpc('bc7_obtener_inventario_jornada', { p_turno_sesion_id: sessionId });
          if (inventoryResponse && inventoryResponse.error) {
            if (String(inventoryResponse.error.code || '') === '42501') { denied += 1; continue; }
            throw inventoryResponse.error;
          }
          inventory = inventoryResponse && inventoryResponse.data || {};
        }
        const movementResponse = await rpcClient.rpc('bc7_movimientos_sesion', { p_turno_sesion_id: sessionId });
        if (movementResponse && movementResponse.error) {
          if (String(movementResponse.error.code || '') === '42501') { denied += 1; continue; }
          throw movementResponse.error;
        }
        anyReadable = true;
        const movements = Array.isArray(movementResponse && movementResponse.data)
          ? movementResponse.data
          : (movementResponse && movementResponse.data ? [movementResponse.data] : []);
        movements.forEach(function (movement) {
          const quantity = Number(movement.cantidad);
          const productName = movement.producto || '—';
          ledgerRows.push({
            timestamp: movement.fecha,
            order: 20,
            kind: 'movement',
            label: inventoryTypeLabel(movement.tipo),
            productKey: String(productName).trim().toLowerCase(),
            product: productName,
            stockEffect: Number.isFinite(quantity) ? quantity : null,
            actor: movement.usuario || '—',
            status: 'Aplicado',
            detail: movement.operacion_id ? 'Ref. #' + String(movement.operacion_id).slice(-6) : ''
          });
        });
        if (!inventory) continue;
        const products = Array.isArray(inventory.productos) ? inventory.productos : [];
        const initialCut = inventory.cortes && inventory.cortes.INICIAL;
        if (initialCut && initialCut.estado === 'CONFIRMADO') {
          hasOpening = true;
          (Array.isArray(initialCut.lineas) ? initialCut.lineas : []).forEach(function (line) {
            const product = products.find(function (item) { return String(item.producto_id) === String(line.producto_id); }) || {};
            const productName = product.nombre || line.producto_id;
            ledgerRows.push({
              timestamp: initialCut.confirmado_en || initialCut.creado_en || session.fecha,
              order: 0,
              kind: 'opening',
              productKey: String(productName).trim().toLowerCase(),
              productId: String(line.producto_id),
              label: 'Inventario inicial confirmado',
              product: productName,
              quantity: Number(line.cantidad_contada),
              actor: inventoryUserLabel(initialCut.confirmado_por || initialCut.creado_por),
              status: 'Confirmado',
              detail: initialCut.observacion || ''
            });
          });
        } else {
          pendingMessages.push('Día ' + String(session.numero_dia || session.dia_n || '') + ': no existe corte inicial confirmado. No se presenta el stock actual como saldo histórico.');
        }
        const financeResponse = await rpcClient.rpc('bc7_finanzas_jornada', { p_turno_sesion_id: sessionId });
        if (financeResponse && financeResponse.error) {
          if (String(financeResponse.error.code || '') === '42501') { denied += 1; continue; }
          throw financeResponse.error;
        }
        const finance = financeResponse && financeResponse.data || {};
        (Array.isArray(finance.gastos) ? finance.gastos : []).forEach(function (expense) {
          ledgerRows.push({
            timestamp: expense.creado_en || session.fecha,
            order: 30,
            kind: 'cash',
            label: 'Gasto',
            product: expense.concepto || 'Gasto operativo',
            cashOut: Number(expense.monto),
            actor: expense.creado_nombre || '—',
            status: expense.estado || 'Registrado',
            detail: expense.descripcion || expense.comentario_revision || ''
          });
        });
        (Array.isArray(finance.reinversiones) ? finance.reinversiones : []).forEach(function (reinvestment) {
          (Array.isArray(reinvestment.lineas) ? reinvestment.lineas : []).forEach(function (line) {
            const productName = line.producto || line.producto_id;
            ledgerRows.push({
              timestamp: reinvestment.fecha || session.fecha,
              order: 10,
              kind: 'reinvestment',
              productKey: String(productName).trim().toLowerCase(),
              label: 'Reinversión / entrada',
              productId: String(line.producto_id),
              product: productName,
              stockEffect: Number(line.cantidad_base),
              cashOut: Number(line.costo_total),
              actor: reinvestment.usuario_nombre || '—',
              status: 'Registrada',
              detail: reinvestment.proveedor || ''
            });
          });
        });
        ['mermas', 'bajas'].forEach(function (bucket) {
          (Array.isArray(finance[bucket]) ? finance[bucket] : []).forEach(function (request) {
            if (String(request.estado || '').toUpperCase() === 'APROBADA') return;
            ledgerRows.push({
              timestamp: request.creado_en || session.fecha,
              order: 40,
              kind: 'request',
              label: 'Solicitud de baja',
              product: request.producto || request.producto_id || '—',
              actor: request.creado_nombre || '—',
              status: String(request.estado || 'PENDIENTE') + ' · no descuenta stock',
              detail: inventoryQuantity(request.cantidad) + ' solicitada' + (request.motivo ? ' · ' + request.motivo : '')
            });
          });
        });
      }
      if (!anyReadable && denied) {
        host.innerHTML = '<div class="m33-archive-empty">Tu perfil no tiene permiso para consultar el inventario y movimientos de este día.</div>';
      } else {
        const pending = pendingMessages.join(' ');
        host.innerHTML = (hasOpening ? '' : '<div class="m33-inventory-note">No hay apertura física confirmada disponible para este día. Las cantidades que aparecen son únicamente movimientos documentados; no se inventa un saldo inicial.</div>') +
          renderInventoryLedger(ledgerRows, hasOpening, pending);
        host.dataset.loaded = '1';
      }
    } catch (error) {
      host.innerHTML = '<div class="m33-archive-empty">No se pudo consultar el libro de inventario: ' +
        esc(error && error.message ? error.message : error) + '. No se han modificado datos.</div>';
    } finally {
      button.disabled = false;
      delete button.dataset.m33InventoryLoading;
    }
  }
  function inventoryUserLabel(id) {
    const user = users().find(function (item) { return String(item.id) === String(id); });
    return user ? (user.nombre || user.nombre_usuario || user.email || String(id)) : (id ? String(id) : '—');
  }
  function bindInventoryButtons(overlay) {
    overlay.querySelectorAll('[data-m33-inventory-book]').forEach(function (button) {
      button.addEventListener('click', function () { loadInventoryBook(button); });
    });
  }
  function step5(t) {
    const st = String(t.estado_maestro || t.estado || '').toUpperCase();
    return '<div class="m33-session-row"><span>Estado</span><b>' + esc(st) + '</b></div>';
  }

  function dependentStatusLabel(value) {
    var status = String(value || '').toUpperCase();
    return ({
      APROBADA: 'Aprobada', APROBADO: 'Aprobado',
      PENDIENTE: 'Pendiente de revisión', RECHAZADA: 'Rechazada', RECHAZADO: 'Rechazado',
      DECLARADO: 'Declarado', COMPLETADA: 'Completada', EN_CURSO: 'En curso', ABIERTO: 'En curso',
      PROGRAMADA: 'No iniciada', PROGRAMADO: 'No iniciado', CANCELADA: 'Cancelada', CERRADO: 'Cerrado', CERRADA: 'Cerrado', PENDIENTE_APROBACION: 'Pendiente de aprobación'
    })[status] || (value || 'Sin estado');
  }


  function dependentDayProgress(session) {
    var status = normEstadoSesion(session && session.estado);
    var approval = String(session && session.dinero_estado_aprobacion || '').toUpperCase();
    var hasDeclaration = !!(session && (session.dinero_declarado === true || session.dinero_id || session.dinero_monto != null));
    var hasOwnerCount = !!(session && session.dinero_monto_contado != null);
    if (status === 'CANCELADA' || status === 'CANCELADO') return 'Cancelada';
    if (status === 'PENDIENTE' || status === 'PROGRAMADA' || !status) return 'No iniciada';
    if (/RECHAZ/.test(approval)) return 'Revisión requerida';
    if (status === 'EN_CURSO') return hasDeclaration ? 'Pendiente de revisión del dueño' : 'En curso';
    if (status === 'COMPLETADA' || status === 'CERRADO' || status === 'CERRADA') {
      if (!hasDeclaration) return 'Declaración pendiente';
      if (!hasOwnerCount || !/APROBAD/.test(approval)) return 'Pendiente de revisión del dueño';
      return 'Completada';
    }
    return dependentStatusLabel(status);
  }

  function dependentProgressTone(label) {
    var value = String(label || '').toLowerCase();
    if (value.indexOf('revisión requerida') >= 0 || value.indexOf('rechaz') >= 0) return 'is-warning';
    if (value.indexOf('pendiente de revisión') >= 0 || value.indexOf('declaración pendiente') >= 0) return 'is-review';
    if (value.indexOf('completad') >= 0) return 'is-done';
    if (value.indexOf('curso') >= 0) return 'is-progress';
    return 'is-neutral';
  }

  function dependentTurnProgress(turn, sessions) {
    var active = (sessions || []).filter(function (session) {
      var status = normEstadoSesion(session && session.estado);
      return status !== 'CANCELADA' && status !== 'CANCELADO';
    });
    if (!active.length) return 'Sin jornadas activas';
    var labels = active.map(dependentDayProgress);
    if (labels.indexOf('Revisión requerida') >= 0) return 'Revisión requerida';
    if (labels.indexOf('Pendiente de revisión del dueño') >= 0) return 'Turno pendiente de revisión';
    if (labels.indexOf('Declaración pendiente') >= 0) return 'Declaración pendiente';
    if (labels.indexOf('En curso') >= 0) return 'Turno en curso';
    if (labels.every(function (label) { return label === 'No iniciada'; })) return 'No iniciado';
    if (labels.indexOf('No iniciada') >= 0) return 'Turno en curso';
    if (labels.every(function (label) { return label === 'Completada'; })) {
      var master = String(turn && (turn.estado_maestro || turn.estado) || '').toUpperCase();
      return master === 'CERRADO' || master === 'CERRADA' ? 'Turno completado' : 'Turno pendiente de revisión';
    }
    return 'Turno en revisión';
  }

  function dependentProgressSummary(sessions) {
    var counts = Object.create(null);
    (sessions || []).forEach(function (session) {
      var label = dependentDayProgress(session);
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.keys(counts).map(function (label) {
      return '<span class="m33-dependent-progress-item ' + dependentProgressTone(label) + '"><b>' +
        counts[label] + '</b> ' + esc(label) + '</span>';
    }).join('');
  }

  function dependentMoney(value, currency) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    var amount = Number(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return amount + (currency ? ' ' + currency : '');
  }

  function bodyDependienta(t) {
    var me = currentUserId();
    var mias = state.sesiones.filter(sesionAsignadaAMi).slice().sort(function (a, b) {
      return String(a.fecha || '').localeCompare(String(b.fecha || '')) ||
        Number(a.numero_dia || a.dia_n || 0) - Number(b.numero_dia || b.dia_n || 0);
    });
    var turnProgress = dependentTurnProgress(t, mias);
    var html = '<div class="m33-dependent">';
    if (state.readOnly) html += '<p class="m33-muted" role="status">Expediente histórico en modo de solo lectura.</p>';
    html += '<section class="m33-dependent-top"><div><h4>Tu jornada · ' +
      esc(field(t.almacen_nombre || t.almacen)) + '</h4><p class="m33-dependent-schedule">Horario operativo previsto · 07:00–23:00</p></div>' +
      '<span class="m33-pill m33-dependent-status-pill ' + dependentProgressTone(turnProgress) + '" data-m33-turn-status>' + esc(turnProgress) + '</span></section>' +
      (mias.length ? '<div class="m33-dependent-progress" aria-label="Progreso de tus jornadas">' + dependentProgressSummary(mias) + '</div>' : '');
    html += '<div class="m33-dependent-meta">' +
      '<div class="m33-box"><span>Desde</span><b>' + esc(date(t.fecha_inicio || (mias[0] && mias[0].fecha))) + '</b></div>' +
      '<div class="m33-box"><span>Hasta</span><b>' + esc(date(t.fecha_fin || (mias[mias.length - 1] && mias[mias.length - 1].fecha))) + '</b></div>' +
      '</div><p id="m33-dep-msg" class="m33-msg"></p>';
    if (!me) {
      html += '<p class="m33-dependent-note">No se pudo identificar tu usuario.</p></div>';
      return html;
    }
    if (!mias.length) {
      html += '<section class="m33-dependent-section"><h4>Tus días</h4><p class="m33-dependent-note">No tienes jornadas asignadas en este turno.</p></section></div>';
      return html;
    }
    html += '<section class="m33-dependent-section"><h4>Tus días</h4>' +
      '<p class="m33-dependent-note">Una jornada completa por día. Los registros antiguos se conservan como historial y no se convierten automáticamente.</p>';
    html += mias.map(function (session) {
      var status = normEstadoSesion(session.estado);
      var labelStatus = dependentDayProgress(session);
      var isJornada = String(session.bloque || '').toUpperCase() === 'JORNADA';
      var actions = '';
      var sid = esc(session.id);
      if (state.readOnly) {
        actions = '<span class="m33-pill">Solo lectura</span>';
      } else if (isJornada) {
        actions = '<button type="button" class="m33-btn-sesion" data-m33-abrir-jornada="' + sid + '">' +
          (status === 'COMPLETADA' ? 'Ver jornada' : 'Gestionar jornada') + '</button>';
      } else if (status === 'PENDIENTE' || status === 'PROGRAMADA' || !status) {
        actions = '<button type="button" class="m33-btn-sesion" data-m33-abrir-sesion="' + sid + '">Continuar registro anterior</button>';
      } else if (status === 'EN_CURSO') {
        var hasDeclaration = session.dinero_declarado === true || !!session.dinero_id;
        var cashAmount = hasDeclaration && session.dinero_monto != null ? String(session.dinero_monto) : '';
        actions = '<div class="m33-dep-cash">' +
          (hasDeclaration
            ? '<span class="m33-pill m33-ok">Dinero entregado: ' + esc(cashAmount) + ' CUP</span><small class="m33-muted">' + esc(dependentStatusLabel(session.dinero_estado_aprobacion || 'Declarado')) + '</small>'
            : '<label>Dinero entregado (CUP)<input type="number" min="0" step="0.01" inputmode="decimal" data-m33-cash-amount="' + sid + '" placeholder="0.00"></label><button type="button" class="m33-btn-sesion" data-m33-declare-cash="' + sid + '">Guardar entrega</button>') +
          '<button type="button" class="m33-btn-sesion" data-m33-close-legacy-session="' + sid + '"' + (!hasDeclaration ? ' disabled' : '') + '>Cerrar registro anterior</button>' +
          '<small class="m33-muted" data-m33-legacy-msg="' + sid + '"></small></div>';
      } else {
        actions = '<span class="m33-pill">' + esc(labelStatus) + '</span>';
      }
      var legacyNote = isJornada ? '' :
        '<div class="m33-dependent-legacy">Registro histórico del formato anterior</div>';
      return '<article class="m33-dependent-day" data-m33-dependent-day="' + sid + '">' +
        '<div class="m33-dependent-day-head"><div><b>Día ' + esc(session.numero_dia || session.dia_n || '—') +
        ' · ' + esc(date(session.fecha)) + '</b><div class="m33-muted">' + esc(labelStatus) + '</div>' + legacyNote +
        '</div><span class="m33-pill">' + esc(isJornada ? 'Jornada completa' : 'Histórico') + '</span></div>' +
        (actions ? '<div class="m33-dependent-day-actions">' + actions + '</div>' : '') +
        '</article>';
    }).join('');
    html += '</section>';
    html += '<section class="m33-dependent-section"><h4>Resumen de caja</h4>' +
      '<div id="m33-dep-cash-history" class="m33-dependent-cash-list" aria-live="polite">' +
      '<div class="m33-archive-empty">Consultando declaraciones de tus días…</div></div>' +
      '<p class="m33-dependent-note" style="margin-top:7px">El importe declarado, el conteo del dueño y la diferencia se muestran por separado, tal como quedaron registrados.</p></section>';
    html += '<details class="m33-dependent-section m33-dependent-details" data-m33-dependent-book><summary>Hoja tipo Excel · inventario y liquidación</summary>' +
      '<p class="m33-dependent-note">La misma hoja que consulta el administrador, con los datos de tus jornadas asignadas y sus permisos de lectura.</p>' +
      step4() + '</details>';
    html += '<details class="m33-dependent-section m33-dependent-details"><summary>Movimientos de tus días</summary>' +
      '<p class="m33-dependent-note">Solo movimientos atribuibles a tus sesiones. Lo que no tenga vínculo verificable permanece en el historial general.</p>' +
      step3() + '</details></div>';
    return html;
  }

  async function loadDependentCashHistory(overlay) {
    var host = overlay && overlay.querySelector('#m33-dep-cash-history');
    if (!host) return;
    // The authenticated expediente RPC already returns the declaration, owner
    // count and difference. Do not query the private declarations table directly.
    var sessions = archiveSessionsForViewer().slice().sort(function (a, b) {
      return String(a.fecha || '').localeCompare(String(b.fecha || '')) ||
        Number(a.numero_dia || a.dia_n || 0) - Number(b.numero_dia || b.dia_n || 0);
    });
    var rows = sessions.filter(function (session) {
      return session.dinero_declarado === true || !!session.dinero_id;
    });
    if (!rows.length) {
      host.innerHTML = '<div class="m33-archive-empty">Todavía no hay declaraciones de efectivo registradas para tus días.</div>';
      return;
    }
    host.innerHTML = rows.map(function (session) {
      var currency = session.dinero_moneda || 'CUP';
      var status = String(session.dinero_estado_aprobacion || 'DECLARADO').toUpperCase();
      var statusClass = /APROBAD/.test(status) ? 'm33-ok' : '';
      return '<article class="m33-dependent-cash-row" data-m33-cash-session="' + esc(session.id) + '">' +
        '<div class="m33-dependent-cash-head"><b>Día ' + esc(session.numero_dia || session.dia_n || '—') +
        ' · ' + esc(date(session.fecha || session.dinero_declarado_at)) + '</b><span class="m33-pill ' + statusClass + '">' +
        esc(dependentStatusLabel(status)) + '</span></div><div class="m33-dependent-cash-grid">' +
        '<div class="m33-dependent-cash-metric"><small>Declarado</small><b>' +
        esc(dependentMoney(session.dinero_monto, currency)) + '</b></div>' +
        '<div class="m33-dependent-cash-metric"><small>Contado por el dueño</small><b>' +
        esc(session.dinero_monto_contado == null ? 'Pendiente' : dependentMoney(session.dinero_monto_contado, currency)) + '</b></div>' +
        '<div class="m33-dependent-cash-metric"><small>Diferencia</small><b>' +
        esc(session.dinero_diferencia == null ? 'Pendiente' : dependentMoney(session.dinero_diferencia, currency)) + '</b></div>' +
        '</div></article>';
    }).join('');
  }

  function setDepMsg(text, ok) {
    var el = document.getElementById('m33-dep-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'm33-msg ' + (ok ? 'ok' : (text ? 'error' : ''));
  }
  function setLegacyCashMsg(sesionId, text, ok) {
    document.querySelectorAll('[data-m33-legacy-msg]').forEach(function (el) {
      if (String(el.getAttribute('data-m33-legacy-msg')) !== String(sesionId)) return;
      el.textContent = text || '';
      el.className = 'm33-muted m33-msg ' + (ok ? 'ok' : (text ? 'error' : ''));
    });
  }
  async function declararDineroSesionLegacy(sesionId, button) {
    if (state.readOnly || !sesionId || !API()) return;
    var card = button && button.closest('.m33-session');
    var input = card && card.querySelector('[data-m33-cash-amount]');
    var raw = input ? input.value.trim() : '';
    var monto = Number(raw);
    if (raw === '' || !Number.isFinite(monto) || monto < 0) {
      setLegacyCashMsg(sesionId,'Introduce el importe real que entregas, incluido 0 si corresponde.',false);
      return;
    }
    if (!window.confirm('¿Confirmas que este es el efectivo real que entregas al dueño? Después de guardarlo, no podrás cambiar la declaración.')) return;
    if (button) button.disabled = true;
    try {
      if (!navigator.onLine) throw new Error('Necesitas conexión para registrar la entrega.');
      var tramos = await API().listarTramosSesion(sesionId);
      var rows = Array.isArray(tramos) ? tramos : [];
      var active = rows.find(function (item) { return String(item.estado || '').toUpperCase() === 'ACTIVO'; });
      if (!active || !active.id) throw new Error('No se encontró un tramo de trabajo para esta sesión.');
      await API().declararDinero(active.id,monto);
    } catch (error) {
      setLegacyCashMsg(sesionId,'No se guardó la entrega: ' + String(error && error.message || error),false);
      if (button) button.disabled = false;
      return;
    }
    setLegacyCashMsg(sesionId,'Dinero entregado confirmado por el servidor. Actualizando vista…',true);
    try {
      await load(state.turno.id);
      renderModal();
    } catch (refreshError) {
      if (input) input.disabled = true;
      if (button) { button.disabled = true; button.textContent = 'Entrega guardada'; }
      setLegacyCashMsg(sesionId,'Entrega guardada en el servidor. No se pudo refrescar la pantalla; vuelve a abrir el turno para ver el estado actualizado.',true);
    }
  }
  async function cerrarSesionLegacyResponsable(sesionId, button) {
    if (state.readOnly || !sesionId || !API()) return;
    var session = (state.sesiones || []).find(function (item) { return String(item.id) === String(sesionId); });
    if (!session || !(session.dinero_declarado === true || session.dinero_id)) {
      setLegacyCashMsg(sesionId,'Primero debes guardar el dinero entregado.',false);
      return;
    }
    if (!window.confirm('¿Cerrar esta sesión? La declaración de dinero y las operaciones quedarán registradas. El cierre no elimina ni altera el turno histórico.')) return;
    if (button) button.disabled = true;
    try {
      if (!navigator.onLine) throw new Error('Necesitas conexión para cerrar la sesión.');
      await API().cerrarSesion(sesionId);
    } catch (error) {
      setLegacyCashMsg(sesionId,'No se pudo cerrar la sesión: ' + String(error && error.message || error),false);
      if (button) button.disabled = false;
      return;
    }
    setLegacyCashMsg(sesionId,'Cierre confirmado por el servidor. Actualizando vista…',true);
    try {
      await load(state.turno.id);
      renderModal();
    } catch (refreshError) {
      if (button) { button.disabled = true; button.textContent = 'Sesión cerrada'; }
      setLegacyCashMsg(sesionId,'Sesión cerrada en el servidor. No se pudo refrescar la pantalla; vuelve a abrir el turno para ver el estado actualizado.',true);
    }
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
      merma: 'Baja',
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
          const sessionLabel = !session ? 'Registro histórico' : (state.isAdmin
            ? labelBloque(session.bloque)
            : (String(session.bloque || '').toUpperCase() === 'JORNADA' ? 'Jornada completa' : 'Registro histórico'));
          rows.push(Object.assign({}, row, { __sessionLabel: sessionLabel }));
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
        host.innerHTML = title + '<div class="m33-archive-scroll"><table class="m33-archive-table"><thead><tr><th>Fecha/hora</th><th>' + (state.isAdmin ? 'Sesión' : 'Jornada') + '</th><th>Tipo</th><th>Producto</th><th>Almacén</th><th>Cantidad</th><th>Responsable</th><th>Ref.</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
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
      bindInventoryButtons(ov);
      var dependentBook = ov.querySelector('[data-m33-dependent-book]');
      if (dependentBook) dependentBook.addEventListener('toggle', function () {
        if (!dependentBook.open || dependentBook.dataset.autoLoaded === '1') return;
        dependentBook.dataset.autoLoaded = '1';
        var bookButton = dependentBook.querySelector('[data-m33-inventory-book]');
        if (bookButton) loadInventoryBook(bookButton);
      });
      loadDependentCashHistory(ov);
      ov.querySelectorAll('[data-m33-abrir-sesion]').forEach(function (btn) { btn.addEventListener('click', function () { abrirSesionDependienta(btn.getAttribute('data-m33-abrir-sesion'), btn); }); });
      ov.querySelectorAll('[data-m33-abrir-jornada]').forEach(function (btn) { btn.addEventListener('click', function () { abrirJornadaUnica(btn.getAttribute('data-m33-abrir-jornada'), btn); }); });
       ov.querySelectorAll('[data-m33-declare-cash]').forEach(function (btn) { btn.addEventListener('click', function () { declararDineroSesionLegacy(btn.getAttribute('data-m33-declare-cash'),btn); }); });
       ov.querySelectorAll('[data-m33-close-legacy-session]').forEach(function (btn) { btn.addEventListener('click', function () { cerrarSesionLegacyResponsable(btn.getAttribute('data-m33-close-legacy-session'),btn); }); });
      return;
    }
    if (state.step === 2 && !state.readOnly && !state.staffRequestAttempted) {
      state.staffRequestAttempted = true;
      state.staffLoading = true;
      state.staffError = 'Cargando responsables…';
      ensureAssignmentUsers(true).then(function () {
        state.staffLoaded = true;
        state.staffLoading = false;
        state.staffError = '';
        renderModal();
      }).catch(function (error) {
        state.staffLoaded = false;
        state.staffLoading = false;
        state.staffError = String(error && error.message ? error.message : error);
        renderModal();
      });
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
    if (state.step === 2 && !state.readOnly) {
      bindAssignmentAutosave();
      const retryStaff = ov.querySelector('[data-m33-reload-staff]');
      if (retryStaff) retryStaff.addEventListener('click', async function () {
        state.staffRequestAttempted = true;
        state.staffLoading = true;
        state.staffLoaded = false;
        state.staffError = '';
        renderModal();
        try {
          await ensureAssignmentUsers(true);
          state.staffLoaded = true;
        } catch (error) {
          state.staffError = String(error && error.message ? error.message : error);
        }
        state.staffLoading = false;
        renderModal();
      });
    }
    if (state.step === 3) bindArchiveButtons(ov);
    if (state.step === 4) {
      bindInventoryButtons(ov);
      const bookButton = ov.querySelector('[data-m33-inventory-book]');
      if (bookButton) loadInventoryBook(bookButton);
    }
  }

  async function open(id, options) {
    css();
    state.step = 1;
    state.busy = true;
    state.readOnly = !!(options && options.readOnly === true);
    state.staffError = '';
    state.staffLoading = false;
    state.staffLoaded = false;
    state.staffRequestAttempted = false;
    await resolveAdmin();
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
  window.__BC_M33 = { open: open, version: '33.16', renderHome: renderHome, loadInventoryBook: loadInventoryBook };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
