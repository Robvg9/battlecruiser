// BattleCruiser — M29 Organización Turnos (Micro-misión 003)
// Home: [+ Crear Turno] + cards de turnos existentes (sin cards vacías de almacén).
// Crear Turno = modal. Detalle y RPC existentes vía TurnoAPI / turnos-maestro.
// No inventa backend. No toca Usuarios/Roles/Ventas.
(function () {
  'use strict';
  if (window.__bcM29TurnosOrg) return;
  window.__bcM29TurnosOrg = true;

  var ROOT_ID = 'ciclos-m18-root';
  var VERSION = '29.1';

  function API() { return window.BattleCruiserTurnoAPI; }

  function esc(v) {
    return typeof escHtml === 'function'
      ? escHtml(v == null ? '' : v)
      : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
  }

  function fmtDate(v) {
    if (!v) return '—';
    if (typeof fechaCorta === 'function') return fechaCorta(v);
    return String(v).split('-').reverse().join('/');
  }

  function labelEstado(e) {
    var api = API();
    return api ? api.labelEstado(e) : String(e || '—');
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

  var state = { isAdmin: false, turnos: [], busy: false };

  function injectCss() {
    if (document.getElementById('bc-m29-turnos-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-m29-turnos-css';
    s.textContent = [
      /* Ocultar UI legacy de ciclos en la pantalla principal de Turnos */
      '#tab-ciclos > .pendientes-header,',
      '#tab-ciclos > p.muted:not(.tm-keep),',
      '#tab-ciclos > .mando-filtros,',
      '#tab-ciclos > .cc-bloque,',
      '#tab-ciclos > #ciclo-detalle,',
      '#tab-ciclos > #msg-ciclos{display:none!important}',
      '#tab-turnos{display:none!important}',
      /* Hero + botón crear */
      '.m29-wrap{max-width:900px;margin:0 auto;padding:0 0 24px}',
      '.m29-hero{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}',
      '.m29-hero h2{margin:0;font-size:1.35rem;font-weight:700}',
      '.m29-hero p{margin:4px 0 0;opacity:.7;font-size:.9rem}',
      '.m29-btn-crear{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:600;font-size:.95rem;cursor:pointer;box-shadow:0 2px 8px rgba(37,99,235,.35)}',
      '.m29-btn-crear:hover{filter:brightness(1.08)}',
      '.m29-btn-crear:disabled{opacity:.5;cursor:not-allowed}',
      /* Cards */
      '.m29-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}',
      '.m29-card{background:var(--card-bg,rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 16px;cursor:pointer;transition:transform .15s,box-shadow .15s}',
      '.m29-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.25)}',
      '.m29-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}',
      '.m29-card-alm{font-weight:700;font-size:1.05rem}',
      '.m29-badge{font-size:.72rem;padding:3px 8px;border-radius:999px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}',
      '.m29-badge.activo,.m29-badge.en_curso{background:rgba(34,197,94,.2);color:#4ade80}',
      '.m29-badge.planificado,.m29-badge.borrador{background:rgba(59,130,246,.2);color:#93c5fd}',
      '.m29-badge.cerrado,.m29-badge.finalizado{background:rgba(148,163,184,.2);color:#cbd5e1}',
      '.m29-badge.suspendido{background:rgba(251,191,36,.2);color:#fbbf24}',
      '.m29-meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:.85rem;opacity:.85}',
      '.m29-meta span{opacity:.65}',
      '.m29-empty{text-align:center;padding:40px 16px;opacity:.65}',
      /* Modal */
      '.m29-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.m29-modal{background:var(--panel-bg,#1e293b);border-radius:16px;width:100%;max-width:420px;padding:20px 22px;box-shadow:0 20px 50px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08)}',
      '.m29-modal h3{margin:0 0 14px;font-size:1.15rem}',
      '.m29-field{margin-bottom:12px}',
      '.m29-field label{display:block;font-size:.8rem;opacity:.7;margin-bottom:4px}',
      '.m29-field input,.m29-field select{width:100%;padding:9px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:inherit;font-size:.95rem}',
      '.m29-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}',
      '.m29-actions button{padding:9px 16px;border-radius:8px;border:none;font-weight:600;cursor:pointer}',
      '.m29-actions .cancel{background:transparent;border:1px solid rgba(255,255,255,.2);color:inherit}',
      '.m29-actions .ok{background:#2563eb;color:#fff}',
      '.m29-msg{font-size:.85rem;margin-top:8px;min-height:1.2em}',
      '.m29-msg.error{color:#f87171}',
      '.m29-msg.ok{color:#4ade80}'
    ].join('');
    document.head.appendChild(s);
  }

  async function resolveAdmin() {
    var api = API();
    if (api && typeof api.actorIsAdmin === 'function') {
      try { state.isAdmin = !!(await api.actorIsAdmin()); return; } catch (_) {}
    }
    state.isAdmin = can('turnos', 'crear') || can('turnos', 'admin') || can('ciclos', 'crear') ||
      (window.__bcUser && (window.__bcUser.rol === 'admin' || window.__bcUser.is_admin));
  }

  async function loadTurnos() {
    var api = API();
    if (!api || typeof api.listarTurnos !== 'function') {
      state.turnos = [];
      return;
    }
    try {
      var data = await api.listarTurnos({});
      state.turnos = asArray(data).filter(function (t) { return t && (t.id || t.turno_id); });
    } catch (e) {
      console.warn('[M29] listarTurnos', e);
      state.turnos = [];
    }
  }

  function cardHtml(t) {
    var id = t.id || t.turno_id;
    var alm = t.almacen_nombre || t.almacen || t.nombre_almacen || 'Almacén';
    var est = labelEstado(t.estado || t.status);
    var estKey = String(t.estado || t.status || '').toLowerCase();
    var inicio = fmtDate(t.inicio_plan || t.fecha_inicio || t.inicio);
    var dias = t.cantidad_dias || t.dias || t.duracion_dias || '—';
    var fin = fmtDate(t.fin_plan || t.fecha_fin || t.final);
    var resp = t.responsable_nombre || t.responsable || t.admin_nombre || '';
    return [
      '<article class="m29-card" data-turno-id="' + esc(id) + '">',
      '<div class="m29-card-top">',
      '<div class="m29-card-alm">' + esc(alm) + '</div>',
      '<span class="m29-badge ' + esc(estKey) + '">' + esc(est) + '</span>',
      '</div>',
      '<div class="m29-meta">',
      '<div><span>Inicio</span><br>' + esc(inicio) + '</div>',
      '<div><span>Días</span><br>' + esc(dias) + '</div>',
      '<div><span>Final</span><br>' + esc(fin) + '</div>',
      resp ? '<div><span>Responsable</span><br>' + esc(resp) + '</div>' : '',
      '</div>',
      '</article>'
    ].join('');
  }

  async function renderHome() {
    var el = root();
    if (!el) return;
    injectCss();
    await resolveAdmin();
    await loadTurnos();

    var btnHtml = state.isAdmin
      ? '<button type="button" class="m29-btn-crear" id="m29-btn-crear">+ Crear Turno</button>'
      : '';

    var body;
    if (!state.turnos.length) {
      body = '<div class="m29-empty"><p>No hay turnos creados todavía.</p>' +
        (state.isAdmin ? '<p>Usá <strong>+ Crear Turno</strong> para empezar.</p>' : '') +
        '</div>';
    } else {
      body = '<div class="m29-grid">' + state.turnos.map(cardHtml).join('') + '</div>';
    }

    el.innerHTML = [
      '<div class="m29-wrap">',
      '<div class="m29-hero">',
      '<div><h2>Turnos</h2><p>Centro de turnos operativos</p></div>',
      btnHtml,
      '</div>',
      body,
      '</div>'
    ].join('');

    var btn = document.getElementById('m29-btn-crear');
    if (btn) btn.addEventListener('click', openCrearModal);

    el.querySelectorAll('.m29-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-turno-id');
        if (id) openDetalle(id, false);
      });
    });
  }

  function openDetalle(id, force) {
    if (window.BattleCruiserTurnosMaestro && typeof window.BattleCruiserTurnosMaestro.open === 'function') {
      window.BattleCruiserTurnosMaestro.open(id, force);
      return;
    }
    if (typeof abrirDetalleTurno === 'function') {
      abrirDetalleTurno(id);
      return;
    }
    console.warn('[M29] No hay opener de detalle de turno');
  }

  function closeCrearModal() {
    var ov = document.getElementById('m29-crear-overlay');
    if (ov) ov.remove();
  }

  function openCrearModal() {
    if (!state.isAdmin) return;
    closeCrearModal();
    var alms = warehouses();
    var opts = alms.map(function (a) {
      return '<option value="' + esc(a.id) + '">' + esc(a.nombre || a.name || a.id) + '</option>';
    }).join('');
    if (!opts) opts = '<option value="">(sin almacenes)</option>';

    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    var hoy = yyyy + '-' + mm + '-' + dd;

    var ov = document.createElement('div');
    ov.id = 'm29-crear-overlay';
    ov.className = 'm29-overlay';
    ov.innerHTML = [
      '<div class="m29-modal" role="dialog" aria-labelledby="m29-modal-title">',
      '<h3 id="m29-modal-title">Crear Turno</h3>',
      '<div class="m29-field"><label for="m29-almacen">Almacén / punto</label>',
      '<select id="m29-almacen">' + opts + '</select></div>',
      '<div class="m29-field"><label for="m29-inicio">Fecha de inicio</label>',
      '<input type="date" id="m29-inicio" value="' + hoy + '"></div>',
      '<div class="m29-field"><label for="m29-dias">Cantidad de días (1–7)</label>',
      '<input type="number" id="m29-dias" min="1" max="7" value="7"></div>',
      '<div class="m29-msg" id="m29-modal-msg"></div>',
      '<div class="m29-actions">',
      '<button type="button" class="cancel" id="m29-cancel-crear">Cancelar</button>',
      '<button type="button" class="ok" id="m29-confirm-crear">Crear</button>',
      '</div></div>'
    ].join('');
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) { if (e.target === ov) closeCrearModal(); });
    document.getElementById('m29-cancel-crear').addEventListener('click', closeCrearModal);
    document.getElementById('m29-confirm-crear').addEventListener('click', confirmCrear);
  }

  async function confirmCrear() {
    var api = API();
    if (!api || typeof api.crearTurno !== 'function') {
      setModalMsg('API de turnos no disponible.', false);
      return;
    }
    var alm = (document.getElementById('m29-almacen') || {}).value;
    var inicio = (document.getElementById('m29-inicio') || {}).value;
    var dias = parseInt((document.getElementById('m29-dias') || {}).value, 10);
    if (!alm) { setModalMsg('Elegí un almacén.', false); return; }
    if (!inicio) { setModalMsg('Indicá la fecha de inicio.', false); return; }
    if (!Number.isFinite(dias) || dias < 1 || dias > 31) { setModalMsg('Días inválidos (1–31).', false); return; }
    var btn = document.getElementById('m29-confirm-crear');
    if (btn) btn.disabled = true;
    try {
      var data = await api.crearTurno({
        almacenId: alm,
        inicioPlan: inicio,
        cantidadDias: dias,
        asignaciones: []
      });
      var id = data && (data.id || data.turno_id || (data.turno && data.turno.id));
      closeCrearModal();
      if (id) openDetalle(id, false);
      else await renderHome();
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

  function patchMaestro() {
    if (!window.BattleCruiserTurnosMaestro) window.BattleCruiserTurnosMaestro = {};
    window.BattleCruiserTurnosMaestro.home = renderHome;
    window.refrescarCiclos = renderHome;
    window.refrescarTurnos = renderHome;
  }

  function relabelTab() {
    var tab = document.querySelector('.tab-btn[data-tab="ciclos"]');
    if (tab) tab.textContent = 'Turnos';
    var old = document.querySelector('.tab-btn[data-tab="turnos"]');
    if (old) {
      old.style.display = 'none';
      old.classList.add('hidden', 'tab-sin-permiso');
    }
  }

  function onTab() {
    var tabs = document.getElementById('tabs');
    if (!tabs || tabs.dataset.m29Nav === '1') return;
    tabs.dataset.m29Nav = '1';
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.tab-btn[data-tab="ciclos"]');
      if (b) setTimeout(renderHome, 40);
    });
  }

  function boot() {
    injectCss();
    relabelTab();
    patchMaestro();
    onTab();
    if (root()) setTimeout(renderHome, 500);
    setTimeout(function () { patchMaestro(); if (root() && document.getElementById('tab-ciclos') && document.getElementById('tab-ciclos').classList.contains('visible')) renderHome(); }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 500); });
  } else {
    setTimeout(boot, 500);
  }
})();
