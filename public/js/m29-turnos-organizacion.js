// BattleCruiser - M29 Organización Turnos
// ÚNICO OWNER de la HOME de Turnos (contrato congelado).
// RPC: bc_listar_turnos_maestros_home vía TurnoAPI.listarTurnosMaestros
// v29.11 — CREAR TURNO solo ADMIN real (no ciclos.crear de dependienta)
(function () {
  'use strict';
  if (window.__bcM29TurnosOrg) return;
  window.__bcM29TurnosOrg = true;
  window.__BC_TURNOS_HOME_OWNER = 'm29';
  window.__BC_M29_VIEW = 'home';
  var ROOT_ID = 'ciclos-m18-root';
  var VERSION = '29.18';
  var HOME_MARK = 'data-m29-home';

  function API() { return window.BattleCruiserTurnoAPI; }
  function esc(v) {
    return typeof escHtml === 'function'
      ? escHtml(v == null ? '' : v)
      : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
          return ({ '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#39;' })[c];
        });
  }
  function fmtDate(v) {
    if (!v) return '-';
    var s = String(v);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    if (typeof fechaCorta === 'function') return fechaCorta(v);
    return s.split('T')[0].split('-').reverse().join('/');
  }
  function labelEstado(e) {
    var api = API();
    return api ? api.labelEstado(e) : String(e || '-');
  }
  function can(recurso, accion) {
    return typeof tienePermiso === 'function' ? tienePermiso(recurso, accion) : false;
  }
  function warehouses() {
    return ((_cache && _cache.almacenes) || []).filter(function (a) { return a.activo !== false; });
  }
  function root() { return document.getElementById(ROOT_ID); }
  function asArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.turnos)) return data.turnos;
    if (Array.isArray(data.items)) return data.items;
    return [data];
  }
  function offlineNow() {
    if (typeof estaRealmenteDesconectado === 'function' && estaRealmenteDesconectado()) return true;
    return !navigator.onLine;
  }
  function normalizeEstado(raw) {
    var e = String(raw || '').trim().toUpperCase();
    if (e === 'PLANIFICADO') return 'PROGRAMADO';
    if (e === 'ACTIVO') return 'EN_CURSO';
    if (e === 'EN_VALIDACION') return 'PENDIENTE_APROBACION';
    return e;
  }
  function isTurnoReal(t) {
    if (!t || typeof t !== 'object') return false;
    var id = t.id || t.turno_id;
    if (!id || t.dias_turno == null || t.almacen_id == null) return false;
    if (t.ciclo_id != null || t.cicloId != null || t.sesion_id != null || t.sesionId != null) return false;
    var estado = normalizeEstado(t.estado_maestro || t.estado || t.status);
    if (estado === 'CANCELADO' || estado === 'ANULADO' || estado === 'CANCELLED' || estado === 'VOID' || estado === 'CERRADO') return false;
    return estado === 'PROGRAMADO' || estado === 'EN_CURSO' || estado === 'PENDIENTE_APROBACION';
  }

  var state = { isAdmin: false, turnos: [], busy: false, errorMsg: '', loadOk: false, filters: { almacenId: '', estado: '' } };

  function injectCss() {
    if (document.getElementById('bc-m29-turnos-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-m29-turnos-css';
    s.textContent = [
      '#tab-turnos{display:none!important}',
      '#tab-ciclos > .pendientes-header,#tab-ciclos > p.muted:not(.tm-keep),#tab-ciclos > .mando-filtros,#tab-ciclos > .cc-bloque,#tab-ciclos > #ciclo-detalle,#tab-ciclos > #msg-ciclos{display:none!important}',
      '.m29-wrap{max-width:900px;margin:0 auto;padding:0 0 24px}',
      '.m29-hero{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}',
      '.m29-hero h2{margin:0;font-size:1.35rem;font-weight:700}',
      '.m29-hero p{margin:4px 0 0;opacity:.7;font-size:.9rem}',
      '.m29-btn-crear{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:600;font-size:.95rem;cursor:pointer;box-shadow:0 2px 8px rgba(37,99,235,.35)}',
      '.m29-btn-crear:hover{filter:brightness(1.08)}','.m29-btn-crear:disabled{opacity:.5;cursor:not-allowed}',
      '.m29-hero-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.m29-btn-refresh{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:transparent;color:inherit;font-weight:600;font-size:.92rem;cursor:pointer}',
      '.m29-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}',
      '.m29-card{background:var(--card-bg,rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 16px;cursor:pointer;transition:transform .15s,box-shadow .15s}',
      '.m29-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.25)}',
      '.m29-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}',
      '.m29-card-alm{font-weight:700;font-size:1.05rem}',
      '.m29-badge{font-size:.72rem;padding:3px 8px;border-radius:999px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}',
      '.m29-badge.activo,.m29-badge.en_curso{background:rgba(34,197,94,.2);color:#4ade80}',
      '.m29-badge.planificado,.m29-badge.borrador,.m29-badge.programado{background:rgba(59,130,246,.2);color:#93c5fd}',
      '.m29-badge.pendiente_aprobacion{background:rgba(251,191,36,.2);color:#fbbf24}',
      '.m29-meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:.85rem;opacity:.85}',
      '.m29-meta span{opacity:.65}',
      '.m29-empty{text-align:center;padding:40px 16px;opacity:.65}',
      '.m29-empty.error{opacity:1;color:#f87171}',
      '.m29-archive-list{display:grid;gap:10px}.m29-archive-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:var(--card-bg,rgba(255,255,255,.04))}.m29-archive-card small{display:block;opacity:.65;margin-top:4px}.m29-archive-card button{min-height:40px;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;font-weight:600}.m29-archive-note{font-size:.82rem;opacity:.7;margin:10px 0}',
      '.m29-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:0 0 14px}',
      '.m29-filter{display:block;font-size:.82rem;opacity:.85}',
      '.m29-filter span{display:block;margin-bottom:5px}',
      '.m29-filter select{width:100%;min-height:42px;padding:9px 10px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:var(--card-bg,rgba(255,255,255,.04));color:inherit}',
      '.m29-filter select option{background:#1e293b;color:#fff}',
      '.m29-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.m29-modal{background:#1e293b;border-radius:14px;width:100%;max-width:640px;max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;padding:14px 16px;border:1px solid rgba(255,255,255,.08)}',
      '.m29-field{margin-bottom:12px}',
      '.m29-field label{display:block;font-size:.8rem;opacity:.7;margin-bottom:4px}',
      '.m29-field input,.m29-field select{width:100%;padding:9px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:inherit}',
      '.m29-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}',
      '.m29-actions button{padding:9px 16px;border-radius:8px;border:none;font-weight:600;cursor:pointer}',
      '.m29-actions .cancel{background:transparent;border:1px solid rgba(255,255,255,.2);color:inherit}',
      '.m29-actions .ok{background:#2563eb;color:#fff}',
      '.m29-msg{font-size:.85rem;margin-top:8px;min-height:1.2em}',
      '.m29-msg.error{color:#f87171}',
      '.m29-create-day{display:grid;grid-template-columns:minmax(100px,.7fr) auto minmax(190px,1.3fr);gap:7px;align-items:center;padding:6px 8px;margin:4px 0;min-height:44px;border:1px solid rgba(255,255,255,.10);border-radius:8px}',
      '.m29-create-day>strong{font-size:12px;line-height:1.2}',
      '#m29-crear-overlay .m29-create-day input[type=checkbox]{appearance:auto!important;-webkit-appearance:checkbox!important;display:inline-block!important;width:16px!important;height:16px!important;min-width:16px!important;min-height:16px!important;max-width:16px!important;max-height:16px!important;margin:0 2px 0 0!important;padding:0!important;flex:0 0 16px!important;vertical-align:middle;accent-color:#c6a35b}',
      '#m29-crear-overlay .m29-create-day .m29-create-check{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:11px;line-height:1.2}',

      '.m29-create-day label{display:flex;flex-direction:column;gap:3px;font-size:11px;opacity:.85;min-width:0}',

      '.m29-create-day select{box-sizing:border-box;min-width:0;width:100%;min-height:34px;padding:5px 8px;border:1px solid rgba(255,255,255,.14);border-radius:6px;background:#17212b;color:inherit;font-size:12px;line-height:1.2}',

      '.m29-create-day .m29-create-check{flex-direction:row;align-items:center}',
      '.m29-create-summary{padding:10px;margin-top:8px;border:1px solid rgba(201,162,77,.2);border-radius:8px;font-size:12px;line-height:1.6}',
      '@media(max-width:560px){.m29-modal{max-height:calc(100dvh - 12px);padding:12px}.m29-overlay{align-items:flex-start;padding:6px}.m29-create-day{grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;padding:7px}.m29-create-day label:not(.m29-create-check){grid-column:1/-1}.m29-create-day .m29-create-check{margin:0}.m29-create-day select{min-height:32px}}',
      '[' + HOME_MARK + '="1"] #m24-asig-panel,[' + HOME_MARK + '="1"] #m22-sesiones-panel,.m33-home{display:none!important}'
    ].join('');
    document.head.appendChild(s);
    if (!document.getElementById('bc-m29-compact-modal-css')) {
      var compact = document.createElement('style');
      compact.id = 'bc-m29-compact-modal-css';
      compact.textContent = [
        '#m29-crear-overlay{padding:7px!important;align-items:center!important}',
        '#m29-crear-overlay .m29-modal{width:min(760px,calc(100vw - 14px))!important;max-width:760px!important;max-height:calc(100dvh - 14px)!important;overflow:auto!important;padding:10px 12px!important;border-radius:11px!important;display:flex!important;flex-direction:column!important;gap:5px!important}',
        '#m29-crear-overlay .m29-modal>h3{font-size:1.08rem!important;margin:0 0 3px!important;line-height:1.2!important}',
        '#m29-crear-overlay .m29-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 100px;gap:7px;align-items:end}',
        '#m29-crear-overlay .m29-field{margin:0!important;min-width:0}',
        '#m29-crear-overlay .m29-field label{font-size:10px!important;margin:0 0 3px!important;letter-spacing:.03em}',
        '#m29-crear-overlay .m29-field input,#m29-crear-overlay .m29-field select{box-sizing:border-box;min-height:32px!important;padding:5px 7px!important;font-size:12px!important;width:100%;margin:0!important}',
        '#m29-crear-overlay .m29-mode-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}',
        '#m29-crear-overlay #m29-mode-label{margin:0!important;font-size:11px;line-height:1.25;opacity:.8}',
        '#m29-crear-overlay #m29-toggle-plan-b{min-height:28px!important;padding:4px 8px!important;font-size:10px!important;white-space:nowrap}',
        '#m29-crear-overlay #m29-staff-status{margin:0!important;min-height:14px!important;font-size:10px!important;line-height:1.2}',
        '#m29-crear-overlay #m29-create-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}',
        '#m29-crear-overlay .m29-create-day{display:grid!important;grid-template-columns:minmax(78px,.85fr) auto minmax(112px,1.2fr)!important;gap:4px!important;align-items:center!important;padding:4px 5px!important;margin:0!important;min-height:34px!important;border-radius:6px!important}',
        '#m29-crear-overlay .m29-create-day>strong{font-size:10px!important;line-height:1.15!important;white-space:normal}',
        '#m29-crear-overlay .m29-create-day label{font-size:9px!important;line-height:1.1!important;margin:0!important;gap:2px!important;min-width:0}',
        '#m29-crear-overlay .m29-create-day label.m29-create-check{font-size:9px!important;gap:3px!important;white-space:nowrap}',
        '#m29-crear-overlay .m29-create-day select{min-height:28px!important;padding:4px 5px!important;font-size:10px!important;line-height:1.1!important}',
        '#m29-crear-overlay .m29-create-day input[type=checkbox]{width:13px!important;height:13px!important;min-width:13px!important;min-height:13px!important;max-width:13px!important;max-height:13px!important;flex:0 0 13px!important}',
        '#m29-crear-overlay .m29-create-summary{margin:0!important;padding:5px 7px!important;font-size:10px!important;line-height:1.2!important}',
        '#m29-crear-overlay .m29-actions{margin:2px 0 0!important;gap:6px!important}',
        '#m29-crear-overlay .m29-actions button{min-height:32px!important;padding:6px 12px!important;font-size:11px!important}',
        '#m29-crear-overlay #m29-modal-msg{min-height:0!important;margin:0!important}',
        '@media(max-width:620px){#m29-crear-overlay .m29-fields{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 76px;gap:5px}#m29-crear-overlay #m29-create-days{grid-template-columns:minmax(0,1fr)}#m29-crear-overlay .m29-create-day{grid-template-columns:minmax(78px,.85fr) auto minmax(130px,1.3fr)!important}}',
        '@media(max-width:380px){#m29-crear-overlay .m29-fields{grid-template-columns:1fr 1fr}#m29-crear-overlay .m29-field:nth-child(3){grid-column:1/-1}}'
      ].join('');
      document.head.appendChild(compact);
    }
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
  function isDuenoRole() {
    var u = window.__bcUser || window._usuarioActual || null;
    if (!u) return false;
    var rol = String(u.rol || u.role || u.nombre_rol || '').toLowerCase();
    return rol.indexOf('due') === 0 || rol === 'admin' || rol === 'administrador' || !!u.is_admin;
  }
  async function resolveAdmin() {
    var api = API();
    if (api && api.actorIsAdmin) {
      try {
        state.isAdmin = normalizeAdminFlag(await api.actorIsAdmin());
        if (state.isAdmin) return;
      } catch (_) {}
    }
    state.isAdmin =
      can('turnos', 'editar_any') ||
      can('ciclos', 'editar_any') ||
      isDuenoRole();
  }

  async function loadTurnos() {
    state.errorMsg = '';
    state.loadOk = false;
    state.turnos = [];
    if (offlineNow()) {
      state.errorMsg = 'Turnos requiere conexión para consultar/actualizar el estado oficial.';
      return;
    }
    var api = API();
    if (!api || !api.listarTurnosMaestros) {
      state.errorMsg = 'API de turnos no disponible.';
      return;
    }
    try {
      var raw = asArray(await api.listarTurnosMaestros({ limit: 100 }));
      state.turnos = raw.filter(isTurnoReal);
      state.loadOk = true;
    } catch (e) {
      console.warn('[M29] listarTurnosMaestros', e);
      state.errorMsg = String(e && e.message ? e.message : e);
    }
  }

  function cardHtml(t) {
    var id = t.id || t.turno_id;
    var alm = t.almacen_nombre || t.almacen || 'Almacén';
    var estRaw = t.estado_maestro || t.estado || '';
    var est = labelEstado(estRaw);
    var estKey = String(normalizeEstado(estRaw)).toLowerCase();
    var inicio = fmtDate(t.fecha_inicio || t.inicio_plan || t.fecha);
    var dias = t.dias_turno != null ? t.dias_turno : '-';
    var fin = fmtDate(t.fecha_fin || t.fin_plan);
    var assigned = t.sesiones_asignadas;
    var total = t.sesiones_total;
    return '<article class="m29-card" data-turno-id="' + esc(id) + '"><div class="m29-card-top"><div class="m29-card-alm">' + esc(alm) + '</div><span class="m29-badge ' + esc(estKey) + '">' + esc(est) + '</span></div><div class="m29-meta"><div><span>Inicio</span><br>' + esc(inicio) + '</div><div><span>Días</span><br>' + esc(dias) + '</div><div><span>Final</span><br>' + esc(fin) + '</div><div><span>Dependientas</span><br>' + esc(assigned != null && total != null ? assigned + '/' + total : 'Ver detalle') + '</div></div></article>';
  }

  function filterWarehouses() {
    var byId = new Map();
    warehouses().forEach(function (a) {
      if (a && a.id != null) byId.set(String(a.id), { id: String(a.id), nombre: a.nombre || a.id });
    });
    state.turnos.forEach(function (t) {
      var id = t && t.almacen_id != null ? String(t.almacen_id) : '';
      if (id && !byId.has(id)) byId.set(id, { id: id, nombre: t.almacen_nombre || t.almacen || id });
    });
    return Array.from(byId.values()).sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
  }

  function filteredTurnos() {
    return state.turnos.filter(function (t) {
      var almacenId = String(t.almacen_id || '');
      var estado = normalizeEstado(t.estado_maestro || t.estado || t.status);
      return (!state.filters.almacenId || almacenId === state.filters.almacenId) &&
        (!state.filters.estado || estado === state.filters.estado);
    });
  }

  function filtersHtml() {
    var warehouseOptions = filterWarehouses().map(function (a) {
      return '<option value="' + esc(a.id) + '">' + esc(a.nombre) + '</option>';
    }).join('');
    return '<div class="m29-filters" aria-label="Filtros de turnos">' +
      '<label class="m29-filter"><span>Estado del turno</span><select id="m29-filtro-estado" aria-label="Filtrar turnos por estado">' +
        '<option value="">Todos los estados</option>' +
        '<option value="EN_CURSO">En curso</option>' +
        '<option value="PROGRAMADO">Programado</option>' +
        '<option value="PENDIENTE_APROBACION">Pendiente de aprobación</option>' +
      '</select></label>' +
      '<label class="m29-filter"><span>Almacén</span><select id="m29-filtro-almacen" aria-label="Filtrar turnos por almacén">' +
        '<option value="">Todos los almacenes</option>' + warehouseOptions +
      '</select></label></div>';
  }

  function renderListBody() {
    if (state.errorMsg) return '<div class="m29-empty error"><p>' + esc(state.errorMsg) + '</p></div>';
    if (!state.turnos.length) return '<div class="m29-empty"><p>No existe ningún turno actualmente.</p></div>';
    var visible = filteredTurnos();
    if (!visible.length) return '<div class="m29-empty"><p>No hay turnos que coincidan con los filtros seleccionados.</p></div>';
    return '<div class="m29-grid">' + visible.map(cardHtml).join('') + '</div>';
  }

  function bindCardClicks(container) {
    if (!container) return;
    container.querySelectorAll('.m29-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-turno-id');
        if (id) openDetalle(id, false);
      });
    });
  }

  function repaintListBody() {
    var el = root();
    var list = el && el.querySelector('#m29-list');
    if (list) {
      list.innerHTML = renderListBody();
      bindCardClicks(list);
    }
  }

  async function renderHome() {
    var el = root();
    if (!el || window.__BC_M29_RENDERING) return;
    window.__BC_M29_RENDERING = true;
    try {
      claimHomeOwnership();
      window.__BC_M29_VIEW = 'home';
      injectCss();
      el.setAttribute(HOME_MARK, '1');
      el.innerHTML = '<div class="m29-wrap"><div class="m29-empty"><p>Cargando turnos...</p></div></div>';
      await resolveAdmin();
      await loadTurnos();
      el.querySelectorAll('#m24-asig-panel,#m22-sesiones-panel,.m33-home,.tm-wrap').forEach(function (n) { n.remove(); });
      var btnHtml = state.isAdmin ? '<button type="button" class="m29-btn-crear" id="m29-btn-crear">+ Crear Turno</button>' : '';
      var historyBtnHtml = '<button type="button" class="m29-btn-refresh" id="m29-btn-historial">Historial cerrado</button>';
      var refreshBtnHtml = '<button type="button" class="m29-btn-refresh" id="m29-btn-refrescar" aria-label="Actualizar lista de turnos">Refrescar</button>';
      var filterHtml = state.turnos.length ? filtersHtml() : '';
      el.innerHTML = '<div class="m29-wrap"><div class="m29-hero"><div><h2>Turnos</h2><p>' +
        (state.isAdmin ? 'Centro de turnos operativos' : 'Tus turnos y sesiones de trabajo') +
        '</p></div><div class="m29-hero-actions">' + btnHtml + historyBtnHtml + refreshBtnHtml + '</div></div>' + filterHtml + '<div id="m29-list">' + renderListBody() + '</div></div>';
      var estadoFilter = el.querySelector('#m29-filtro-estado');
      if (estadoFilter) {
        estadoFilter.value = state.filters.estado;
        estadoFilter.addEventListener('change', function () {
          state.filters.estado = estadoFilter.value;
          repaintListBody();
        });
      }
      var almacenFilter = el.querySelector('#m29-filtro-almacen');
      if (almacenFilter) {
        almacenFilter.value = state.filters.almacenId;
        almacenFilter.addEventListener('change', function () {
          state.filters.almacenId = almacenFilter.value;
          repaintListBody();
        });
      }
      var btn = document.getElementById('m29-btn-crear');
      if (btn) btn.addEventListener('click', openCrearModal);
      var refreshBtn = document.getElementById('m29-btn-refrescar');
      if (refreshBtn) refreshBtn.addEventListener('click', function () { renderHome(); });
      var historyBtn = document.getElementById('m29-btn-historial');
      if (historyBtn) historyBtn.addEventListener('click', function () { openClosedHistory(); });
      bindCardClicks(el);
    } finally {
      window.__BC_M29_RENDERING = false;
    }
  }

  async function openClosedHistory() {
    var el = root();
    var api = API();
    if (!el) return;
    window.__BC_M29_VIEW = 'closed-history';
    if (offlineNow()) {
      el.innerHTML = '<div class="m29-wrap"><div class="m29-hero"><div><h2>Historial de turnos</h2><p>Consulta de solo lectura.</p></div><button type="button" class="m29-btn-refresh" id="m29-btn-history-back">Volver a Turnos</button></div><div class="m29-empty">El historial cerrado requiere conexión al servidor.</div></div>';
      var offlineBack = el.querySelector('#m29-btn-history-back');
      if (offlineBack) offlineBack.addEventListener('click', function () { renderHome(); });
      return;
    }
    if (!api || typeof api.listarTurnosMaestros !== 'function') {
      el.innerHTML = '<div class="m29-wrap"><div class="m29-hero"><div><h2>Historial de turnos</h2></div><button type="button" class="m29-btn-refresh" id="m29-btn-history-back">Volver a Turnos</button></div><div class="m29-empty error">API de turnos no disponible.</div></div>';
      var unavailableBack = el.querySelector('#m29-btn-history-back');
      if (unavailableBack) unavailableBack.addEventListener('click', function () { renderHome(); });
      return;
    }
    el.innerHTML = '<div class="m29-wrap"><div class="m29-hero"><div><h2>Historial de turnos</h2><p>Los turnos cerrados conservan su expediente. Esta vista no crea ni modifica registros.</p></div><button type="button" class="m29-btn-refresh" id="m29-btn-history-back">Volver a Turnos</button></div><div class="m29-empty">Consultando el historial…</div></div>';
    try {
      var all = [];
      var seen = Object.create(null);
      var truncated = false;
      var offset = 0;
      var pages = 0;
      // Use the authorized master-turn endpoint; the legacy listing mixes session rows.
      // Master rows include the immutable multi-day/date fields needed to reopen the record.
      while (pages < 50) {
        var batch = asArray(await api.listarTurnosMaestros({ limit: 100, offset: offset }));
        batch.forEach(function (turn) {
          var id = String(turn && (turn.id || turn.turno_id) || '');
          var stateName = String(turn && (turn.estado_maestro || turn.estado || turn.status) || '').toUpperCase();
          if (id && !seen[id] && (stateName === 'CERRADO' || stateName === 'VALIDADO')) {
            seen[id] = true;
            all.push(turn);
          }
        });
        if (batch.length < 100) break;
        offset += batch.length;
        pages += 1;
        if (pages >= 50) truncated = true;
      }
      all.sort(function (a, b) {
        var dateA = String(a.cierre_real || a.fecha_fin || a.fin_plan || a.fecha || '');
        var dateB = String(b.cierre_real || b.fecha_fin || b.fin_plan || b.fecha || '');
        return dateB.localeCompare(dateA);
      });
      var cards = all.map(function (turn) {
        var id = String(turn.id || turn.turno_id);
        var warehouseId = String(turn.almacen_id || '');
        var warehouse = warehouses().find(function (candidate) { return String(candidate.id) === warehouseId; });
        var warehouseName = turn.almacen_nombre || turn.almacen || (warehouse && warehouse.nombre) || warehouseId || 'Almacén';
        var start = turn.fecha_inicio || turn.inicio_plan || turn.fecha || turn.apertura_real;
        var end = turn.fecha_fin || turn.fin_plan || turn.cierre_real || turn.fecha;
        var stateName = String(turn.estado_maestro || turn.estado || turn.status || '').toUpperCase();
        return '<article class="m29-archive-card"><div><b>' + esc(warehouseName) + '</b><small>' +
          esc(fmtDate(start)) + ' → ' + esc(fmtDate(end)) + ' · ' + esc(labelEstado(stateName)) +
          '</small></div><button type="button" data-m29-closed-open="' + esc(id) + '">Abrir expediente</button></article>';
      }).join('');
      var empty = '<div class="m29-empty">No hay turnos cerrados visibles para este usuario.</div>';
      el.innerHTML = '<div class="m29-wrap"><div class="m29-hero"><div><h2>Historial de turnos</h2><p>Consulta de solo lectura; los movimientos permanecen vinculados al turno original.</p></div><button type="button" class="m29-btn-refresh" id="m29-btn-history-back">Volver a Turnos</button></div>' +
        (all.length ? '<div class="m29-archive-list">' + cards + '</div>' : empty) +
        (truncated ? '<p class="m29-archive-note" role="status">Se alcanzó el límite de lectura segura; contacta al administrador para consultar el resto.</p>' : '') + '</div>';
      el.querySelectorAll('[data-m29-closed-open]').forEach(function (button) {
        button.addEventListener('click', function () { openDetalle(button.dataset.m29ClosedOpen, false, true); });
      });
    } catch (error) {
      el.innerHTML = '<div class="m29-wrap"><div class="m29-hero"><div><h2>Historial de turnos</h2></div><button type="button" class="m29-btn-refresh" id="m29-btn-history-back">Volver a Turnos</button></div><div class="m29-empty error">No se pudo cargar el historial: ' +
        esc(error && error.message ? error.message : error) + '</div></div>';
    }
    var back = el.querySelector('#m29-btn-history-back');
    if (back) back.addEventListener('click', function () { renderHome(); });
  }

  function openDetalle(id, isLegacy, readOnly) {
    var el = root();
    if (el) el.removeAttribute(HOME_MARK);
    if (readOnly) {
      window.__BC_M29_VIEW = 'closed-history';
      // Never fall back to a potentially editable legacy detail from archive history.
      if (window.__BC_M33 && typeof window.__BC_M33.open === 'function') {
        window.__BC_M33.open(id, { readOnly: true });
      }
      return;
    }
    window.__BC_M29_VIEW = 'detalle';
    if (window.__BC_M33 && window.__BC_M33.open) {
      try { window.__BC_M33.open(id); return; } catch (e) {}
    }
    if (window.BattleCruiserTurnosMaestro && window.BattleCruiserTurnosMaestro.open) {
      window.BattleCruiserTurnosMaestro.open(id, isLegacy);
    }
  }

  function closeCrearModal() {
    var ov = document.getElementById('m29-crear-overlay');
    if (ov) ov.remove();
  }
  function staffRowsFrom(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    var keys = ['usuarios','users','rows','items','data'];
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(value[keys[i]])) return value[keys[i]];
    }
    return value.id ? [value] : [];
  }
  function staffRole(user) {
    var value = user && (user.rol || user.nombre_rol || user.role_name || user.role);
    if (value && typeof value === 'object') value = value.nombre || value.name || value.rol || value.role_name;
    return String(value || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function staffIsEligible(user) {
    if (!user || !user.id) return false;
    if (user.activo === false || String(user.activo).toLowerCase() === 'false' || user.activo === 0) return false;
    if (user.archivado === true || String(user.archivado).toLowerCase() === 'true' || user.archivado === 1) return false;
    var role = staffRole(user);
    return role.indexOf('dependienta') >= 0 || role.indexOf('dueno') === 0 || role === 'admin' || role === 'administrador';
  }
  function eligibleStaff() {
    var cached = [];
    try { if (typeof _cache !== 'undefined' && _cache) cached = staffRowsFrom(_cache.usuarios); } catch (_) {}
    if (!cached.length) cached = staffRowsFrom(window._cache && window._cache.usuarios);
    var authoritative = staffRowsFrom(window.__BC_M29_STAFF_CACHE__);
    // Once the server catalog has loaded, it is the sole source of truth.
    // Do not resurrect archived/deleted people from a stale local cache.
    var rows = window.__BC_M29_STAFF_CACHE_LOADED__ === true ? authoritative : cached;
    return rows.filter(staffIsEligible).sort(function (a, b) {
      return String(a.nombre || a.nombre_usuario || a.email || '').localeCompare(String(b.nombre || b.nombre_usuario || b.email || ''), 'es');
    });
  }
  async function ensureEligibleStaff(forceRefresh) {
    var people = eligibleStaff();
    if (people.length && !forceRefresh) return people;
    if (offlineNow()) {
      if (people.length) return people;
      throw new Error('Conecta el dispositivo para cargar la lista de responsables.');
    }
    if (typeof client === 'undefined' || !client || typeof client.rpc !== 'function') {
      if (people.length) return people;
      throw new Error('El cliente del servidor no está disponible para cargar responsables.');
    }
    var response = await client.rpc('listar_usuarios_admin', { p_incluir_archivados: false });
    if (response && response.error) {
      if (people.length && !forceRefresh) return people;
      throw new Error(response.error.message || response.error.details || 'El servidor rechazó la consulta de usuarios.');
    }
    var rows = staffRowsFrom(response && response.data);
    window.__BC_M29_STAFF_CACHE__ = rows;
    window.__BC_M29_STAFF_CACHE_LOADED__ = true;
    try {
      if (typeof _cache !== 'undefined' && _cache) _cache.usuarios = rows;
      else {
        window._cache = window._cache || {};
        window._cache.usuarios = rows;
      }
    } catch (_) {}
    people = eligibleStaff();
    if (!people.length) throw new Error('La consulta del servidor respondió, pero no contiene responsables activos con rol Dependienta o Dueño.');
    return people;
  }
  function staffOptions(selected) {
    var people = eligibleStaff();
    var placeholder = people.length
      ? '<option value="">Selecciona responsable</option>'
      : '<option value="">Responsables no disponibles</option>';
    return placeholder + people.map(function (u) {
      var name = u.nombre || u.nombre_usuario || u.email || u.id;
      return '<option value="' + esc(u.id) + '"' +
        (String(u.id) === String(selected || '') ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
  }
  function readCreateRows() {
    var host = document.getElementById('m29-create-days');
    if (!host) return [];
    var legacy = host.dataset.mode === 'legacy';
    return Array.prototype.map.call(host.querySelectorAll('[data-m29-day]'), function (row) {
      if (legacy) {
        return {
          numero_dia: Number(row.dataset.m29Day),
          manana: (row.querySelector('[data-m29-manana]') || {}).value || '',
          tarde: (row.querySelector('[data-m29-tarde]') || {}).value || ''
        };
      }
      var works = !!(row.querySelector('[data-m29-works]') || {}).checked;
      return {
        numero_dia: Number(row.dataset.m29Day),
        trabaja: works,
        responsable_id: works ? ((row.querySelector('[data-m29-person]') || {}).value || '') : ''
      };
    });
  }
  function buildCreateRows() {
    var host = document.getElementById('m29-create-days');
    if (!host) return;
    var n = Math.max(1, Math.min(31, parseInt((document.getElementById('m29-dias') || {}).value, 10) || 7));
    var inicio = (document.getElementById('m29-inicio') || {}).value || '';
    var legacy = host.dataset.mode === 'legacy';
    var old = readCreateRows();
    host.innerHTML = Array.from({ length: n }, function (_, i) {
      var dateValue = inicio ? new Date(inicio + 'T12:00:00').toLocaleDateString('es-ES') : 'Fecha pendiente';
      if (inicio) {
        var d = new Date(inicio + 'T12:00:00');
        d.setDate(d.getDate() + i);
        dateValue = d.toLocaleDateString('es-ES');
      }
      var prev = old[i] || {};
      if (legacy) {
        return '<div class="m29-create-day" data-m29-day="' + (i + 1) + '">' +
          '<strong>Día ' + (i + 1) + ' · ' + esc(dateValue) + '</strong>' +
          '<label>Mañana<select data-m29-manana>' + staffOptions(prev.manana) + '</select></label>' +
          '<label>Tarde<select data-m29-tarde>' + staffOptions(prev.tarde) + '</select></label></div>';
      }
      var works = prev.trabaja !== false;
      return '<div class="m29-create-day" data-m29-day="' + (i + 1) + '">' +
        '<strong>Día ' + (i + 1) + ' · ' + esc(dateValue) + '</strong>' +
        '<label class="m29-create-check"><input type="checkbox" data-m29-works ' + (works ? 'checked' : '') + '> Trabaja</label>' +
        '<label>Responsable<select data-m29-person ' + (!works ? 'disabled' : '') + '>' + staffOptions(prev.responsable_id) + '</select></label></div>';
    }).join('');
    host.querySelectorAll('[data-m29-works]').forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        var select = checkbox.closest('[data-m29-day]').querySelector('[data-m29-person]');
        if (select) {
          select.disabled = !checkbox.checked;
          if (!checkbox.checked) select.value = '';
        }
        renderCreateSummary();
      });
    });
    host.querySelectorAll('select').forEach(function (select) {
      select.addEventListener('change', renderCreateSummary);
    });
    renderCreateSummary();
  }
  function toggleCreateMode() {
    var host = document.getElementById('m29-create-days');
    var button = document.getElementById('m29-toggle-plan-b');
    var legacy = !!(host && host.dataset.mode !== 'legacy');
    if (!host || !button) return;
    host.dataset.mode = legacy ? 'legacy' : 'jornada';
    button.textContent = legacy ? 'Volver a Jornada completa' : 'Plan alternativo: dividir en Mañana y Tarde';
    var label = document.getElementById('m29-mode-label');
    if (label) label.textContent = legacy
      ? 'Plan alternativo · sesiones independientes por bloque'
      : 'Jornada completa · una persona responsable por día';
    buildCreateRows();
  }
  function renderCreateSummary() {
    var host = document.getElementById('m29-create-days');
    var summary = document.getElementById('m29-create-summary');
    if (!host || !summary) return;
    var rows = readCreateRows();
    var assigned = 0;
    var rest = 0;
    var pending = 0;
    if (host.dataset.mode === 'legacy') {
      rows.forEach(function (row) {
        if (row.manana) assigned += 1; else pending += 1;
        if (row.tarde) assigned += 1; else pending += 1;
      });
      summary.textContent = assigned + ' sesiones asignadas · ' + pending + ' sin asignar';
      return;
    }
    rows.forEach(function (row) {
      if (!row.trabaja) rest += 1;
      else if (row.responsable_id) assigned += 1;
      else pending += 1;
    });
    summary.textContent = assigned + ' responsables asignados · ' + rest + ' descansos' +
      (pending ? ' · ' + pending + ' pendientes' : '');
  }
  async function openCrearModal() {
    if (!state.isAdmin) return;
    closeCrearModal();
    var opts = warehouses().map(function (a) {
      return '<option value="' + esc(a.id) + '">' + esc(a.nombre || a.id) + '</option>';
    }).join('') || '<option value="">(sin almacenes)</option>';
    var today = new Date();
    var hoy = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var ov = document.createElement('div');
    ov.id = 'm29-crear-overlay';
    ov.className = 'm29-overlay';
    ov.innerHTML = '<div class="m29-modal"><h3>Crear turno</h3>' +
      '<div class="m29-fields">' +
      '<div class="m29-field"><label>Almacén</label><select id="m29-almacen">' + opts + '</select></div>' +
      '<div class="m29-field"><label>Fecha inicial</label><input type="date" id="m29-inicio" value="' + hoy + '"></div>' +
      '<div class="m29-field"><label>Días</label><input type="number" id="m29-dias" min="1" max="31" value="7"></div>' +
      '</div>' +
      '<div class="m29-mode-row"><span id="m29-mode-label">Jornada completa · un responsable por jornada</span>' +
      '<button type="button" class="m29-btn-refresh" id="m29-toggle-plan-b">Alternar Mañana / Tarde</button></div>' +
      '<p id="m29-staff-status" class="m29-msg" role="status" aria-live="polite">Cargando responsables…</p>' +
      '<div id="m29-create-days" data-mode="jornada"></div>' +
      '<div class="m29-create-summary"><span id="m29-create-summary">Preparando programación…</span></div>' +
      '<div class="m29-msg" id="m29-modal-msg"></div>' +
      '<div class="m29-actions"><button type="button" class="cancel" id="m29-cancel-crear">Cancelar</button><button type="button" class="ok" id="m29-confirm-crear" disabled>Crear turno</button></div></div>';
    document.body.appendChild(ov);
    document.getElementById('m29-cancel-crear').onclick = closeCrearModal;
    document.getElementById('m29-toggle-plan-b').onclick = toggleCreateMode;
    document.getElementById('m29-inicio').addEventListener('change', buildCreateRows);
    document.getElementById('m29-dias').addEventListener('change', buildCreateRows);
    document.getElementById('m29-confirm-crear').onclick = confirmCrear;
    try {
      // Online creation always validates the canonical active staff catalog.
      // Offline creation may continue from the last locally verified catalog.
      var people = await ensureEligibleStaff(!offlineNow());
      var status = document.getElementById('m29-staff-status');
      if (status) { status.textContent = people.length + ' responsables activos disponibles.'; status.className = 'm29-msg ok'; }
      buildCreateRows();
      var confirm = document.getElementById('m29-confirm-crear');
      if (confirm) confirm.disabled = false;
    } catch (error) {
      var statusError = document.getElementById('m29-staff-status');
      if (statusError) { statusError.textContent = 'No se pudo cargar el personal: ' + String(error && error.message || error); statusError.className = 'm29-msg error'; }
      var confirmError = document.getElementById('m29-confirm-crear');
      if (confirmError) confirmError.disabled = true;
      buildCreateRows();
    }
  }
  async function confirmCrear() {
    if (!state.isAdmin) return;
    if (offlineNow()) { setModalMsg('Requiere conexión', false); return; }
    var alm = (document.getElementById('m29-almacen') || {}).value;
    var inicio = (document.getElementById('m29-inicio') || {}).value;
    var dias = parseInt((document.getElementById('m29-dias') || {}).value, 10);
    var host = document.getElementById('m29-create-days');
    if (!alm || !inicio || !Number.isFinite(dias) || dias < 1 || dias > 31 || !host) {
      setModalMsg('Completa los datos del turno.', false); return;
    }
    var rows = readCreateRows();
    var legacy = host.dataset.mode === 'legacy';
    var assignments = [];
    var schedule = [];
    if (legacy) {
      rows.forEach(function (r) {
        if (r.manana) assignments.push({ numero_dia: r.numero_dia, bloque: 'MANANA', usuario_id: r.manana });
        if (r.tarde) assignments.push({ numero_dia: r.numero_dia, bloque: 'TARDE', usuario_id: r.tarde });
      });
      if (!assignments.length) { setModalMsg('Asigna al menos una sesión de Mañana o Tarde.', false); return; }
    } else {
      schedule = rows.map(function (r) {
        return { numero_dia: r.numero_dia, trabaja: r.trabaja, responsable_id: r.trabaja ? (r.responsable_id || null) : null };
      });
      var missing = schedule.find(function (r) { return r.trabaja && !r.responsable_id; });
      if (missing) { setModalMsg('Falta responsable en el Día ' + missing.numero_dia + '.', false); return; }
      if (schedule.some(function (r) { return !r.trabaja && r.responsable_id; })) {
        setModalMsg('Los días de descanso no pueden tener responsable.', false); return;
      }
    }
    var summaryText = legacy
      ? 'Se crearán ' + dias + ' fechas con sesiones MANANA/TARDE según las asignaciones. No se crearán jornadas completas.'
      : 'Se crearán ' + schedule.filter(function (r) { return r.trabaja; }).length + ' jornadas completas y ' +
        schedule.filter(function (r) { return !r.trabaja; }).length + ' descansos. Cada día laborable tendrá una sola persona responsable.';
    if (!window.confirm(summaryText + ' ¿Confirmas?')) return;
    var btn = document.getElementById('m29-confirm-crear');
    if (btn) btn.disabled = true;
    try {
      if (legacy) {
        var api = API();
        if (!api || !api.crearTurno) throw new Error('API de Turnos no disponible.');
        await api.crearTurno({ almacenId: alm, inicioPlan: inicio, cantidadDias: dias, asignaciones: assignments });
      } else {
        if (typeof client === 'undefined' || !client || typeof client.rpc !== 'function') {
          throw new Error('Cliente Supabase no disponible.');
        }
        var response = await client.rpc('bc5_crear_jornada_unica', {
          p_almacen_id: alm,
          p_fecha_inicio: inicio,
          p_dias: dias,
          p_programacion: schedule,
          p_observacion: 'Creado desde Turnos · Jornada completa'
        });
        if (response && response.error) throw new Error(response.error.message || 'El backend rechazó la jornada.');
      }
      closeCrearModal();
      await renderHome();
    } catch (e) {
      setModalMsg('No se pudo crear: ' + String(e && e.message || e), false);
      if (btn) btn.disabled = false;
    }
  }
  function setModalMsg(t, ok) {
    var m = document.getElementById('m29-modal-msg');
    if (!m) return;
    m.textContent = t || '';
    m.className = 'm29-msg ' + (ok ? 'ok' : 'error');
  }

  function claimHomeOwnership() {
    window.__BC_TURNOS_HOME_OWNER = 'm29';
    window.refrescarCiclos = renderHome;
    window.refrescarTurnos = renderHome;
    if (!window.BattleCruiserTurnosMaestro) window.BattleCruiserTurnosMaestro = {};
    window.BattleCruiserTurnosMaestro.home = renderHome;
    window.BattleCruiserTurnosMaestro.version = VERSION;
  }
  function relabelTabs() {
    var tab = document.querySelector('.tab-btn[data-tab="ciclos"]');
    if (tab) tab.textContent = 'Turnos';
    var old = document.querySelector('.tab-btn[data-tab="turnos"]');
    if (old) { old.style.display = 'none'; old.classList.add('hidden'); }
  }
  function hookNavigation() {
    var tabs = document.getElementById('tabs');
    if (!tabs || tabs.dataset.m29Nav === '1') return;
    tabs.dataset.m29Nav = '1';
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.tab-btn');
      if (!b) return;
      if (b.dataset.tab === 'ciclos' || b.dataset.tab === 'turnos') {
        queueMicrotask(function () { claimHomeOwnership(); renderHome(); });
      }
    });
  }
  function guardForeignHome() {
    if (window.__BC_M29_VIEW !== 'home') return;
    var el = root();
    if (!el) return;
    if (el.querySelector('.m33-home') || el.querySelector('.tm-wrap') || !el.querySelector('.m29-wrap')) {
      claimHomeOwnership();
      renderHome();
    }
  }
  function boot() {
    injectCss();
    relabelTabs();
    claimHomeOwnership();
    hookNavigation();
    var panel = document.getElementById('tab-ciclos');
    if (panel && panel.classList.contains('visible') && root()) renderHome();
    setTimeout(function () { claimHomeOwnership(); guardForeignHome(); }, 800);
    setTimeout(function () { claimHomeOwnership(); guardForeignHome(); }, 2000);
    setInterval(function () { claimHomeOwnership(); guardForeignHome(); }, 3000);
  }
  window.__BC_M29__ = {
    version: VERSION,
    renderHome: renderHome,
    openDetalle: openDetalle,
    claimHomeOwnership: claimHomeOwnership,
    loadResponsibleStaff: ensureEligibleStaff,
    eligibleStaff: eligibleStaff,
    isTurnoReal: isTurnoReal,
    isAdmin: function () { return !!state.isAdmin; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
