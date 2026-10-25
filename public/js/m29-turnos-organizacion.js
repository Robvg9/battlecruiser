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
  var VERSION = '29.11';
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
      '.m29-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:0 0 14px}',
      '.m29-filter{display:block;font-size:.82rem;opacity:.85}',
      '.m29-filter span{display:block;margin-bottom:5px}',
      '.m29-filter select{width:100%;min-height:42px;padding:9px 10px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:var(--card-bg,rgba(255,255,255,.04));color:inherit}',
      '.m29-filter select option{background:#1e293b;color:#fff}',
      '.m29-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.m29-modal{background:#1e293b;border-radius:16px;width:100%;max-width:420px;padding:20px 22px;border:1px solid rgba(255,255,255,.08)}',
      '.m29-field{margin-bottom:12px}',
      '.m29-field label{display:block;font-size:.8rem;opacity:.7;margin-bottom:4px}',
      '.m29-field input,.m29-field select{width:100%;padding:9px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:inherit}',
      '.m29-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}',
      '.m29-actions button{padding:9px 16px;border-radius:8px;border:none;font-weight:600;cursor:pointer}',
      '.m29-actions .cancel{background:transparent;border:1px solid rgba(255,255,255,.2);color:inherit}',
      '.m29-actions .ok{background:#2563eb;color:#fff}',
      '.m29-msg{font-size:.85rem;margin-top:8px;min-height:1.2em}',
      '.m29-msg.error{color:#f87171}',
      '[' + HOME_MARK + '="1"] #m24-asig-panel,[' + HOME_MARK + '="1"] #m22-sesiones-panel,.m33-home{display:none!important}'
    ].join('');
    document.head.appendChild(s);
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

  function repaintListBody() {
    var el = root();
    var list = el && el.querySelector('#m29-list');
    if (list) list.innerHTML = renderListBody();
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
      var filterHtml = state.turnos.length ? filtersHtml() : '';
      el.innerHTML = '<div class="m29-wrap"><div class="m29-hero"><div><h2>Turnos</h2><p>' +
        (state.isAdmin ? 'Centro de turnos operativos' : 'Tus turnos y sesiones de trabajo') +
        '</p></div>' + btnHtml + '</div>' + filterHtml + '<div id="m29-list">' + renderListBody() + '</div></div>';
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
      el.querySelectorAll('.m29-card').forEach(function (card) {
        card.addEventListener('click', function () {
          var id = card.getAttribute('data-turno-id');
          if (id) openDetalle(id, false);
        });
      });
    } finally {
      window.__BC_M29_RENDERING = false;
    }
  }

  function openDetalle(id, isLegacy) {
    window.__BC_M29_VIEW = 'detalle';
    var el = root();
    if (el) el.removeAttribute(HOME_MARK);
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
  function openCrearModal() {
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
    ov.innerHTML = '<div class="m29-modal"><h3>Crear Turno</h3><div class="m29-field"><label>Almacén</label><select id="m29-almacen">' + opts + '</select></div><div class="m29-field"><label>Fecha inicio</label><input type="date" id="m29-inicio" value="' + hoy + '"></div><div class="m29-field"><label>Días (1-31)</label><input type="number" id="m29-dias" min="1" max="31" value="7"></div><div class="m29-msg" id="m29-modal-msg"></div><div class="m29-actions"><button type="button" class="cancel" id="m29-cancel-crear">Cancelar</button><button type="button" class="ok" id="m29-confirm-crear">Crear</button></div></div>';
    document.body.appendChild(ov);
    document.getElementById('m29-cancel-crear').onclick = closeCrearModal;
    document.getElementById('m29-confirm-crear').onclick = confirmCrear;
  }
  async function confirmCrear() {
    if (!state.isAdmin) return;
    var api = API();
    if (!api || !api.crearTurno) { setModalMsg('API no disponible', false); return; }
    if (offlineNow()) { setModalMsg('Requiere conexión', false); return; }
    var alm = (document.getElementById('m29-almacen') || {}).value;
    var inicio = (document.getElementById('m29-inicio') || {}).value;
    var dias = parseInt((document.getElementById('m29-dias') || {}).value, 10);
    if (!alm || !inicio || !Number.isFinite(dias) || dias < 1) { setModalMsg('Completa los datos', false); return; }
    var btn = document.getElementById('m29-confirm-crear');
    if (btn) btn.disabled = true;
    try {
      await api.crearTurno({ almacenId: alm, inicioPlan: inicio, cantidadDias: dias, asignaciones: [] });
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
    isTurnoReal: isTurnoReal,
    isAdmin: function () { return !!state.isAdmin; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
