// BattleCruiser M22 + M24 + M25 + M25.1 + M25.3 + M25.4 — Sesiones en Turnos.
// M25.4: romper bucle M22↔M24. refresh solo si falta panel o cambió ciclo; ignora paneles internos.
(function () {
  'use strict';
  var RPC_LIST = 'listar_sesiones_operativas';
  var RPC_INICIAR = 'iniciar_sesion_operativa';
  var RPC_CERRAR = 'cerrar_sesion_operativa';
  var PANEL_ID = 'm22-sesiones-panel';
  var M24_PANEL_ID = 'm24-asig-panel';
  var busy = false;
  var suppressObs = false;
  var lastSesiones = [];
  var lastRefreshKey = '';

  function can(s, a) {
    return typeof tienePermiso === 'function' && tienePermiso(s, a);
  }
  function isAdmin() {
    return can('ciclos', 'editar_any');
  }
  function uid() {
    return (typeof _usuarioActual !== 'undefined' && _usuarioActual && _usuarioActual.id) || null;
  }
  function esc(v) {
    return typeof escHtml === 'function' ? escHtml(v == null ? '' : v) : String(v == null ? '' : v);
  }
  function key() { return crypto.randomUUID(); }
  function fmtHora(v) {
    if (!v) return '—';
    if (typeof fechaHora === 'function') return fechaHora(v);
    try { return new Date(v).toLocaleString('es'); } catch (e) { return String(v); }
  }
  function fmtFecha(v) {
    if (!v) return '—';
    if (typeof fechaCorta === 'function') return fechaCorta(v);
    return String(v).split('-').reverse().join('/');
  }
  function labelBloque(b) {
    var s = String(b || '').toUpperCase();
    if (s === 'MANANA' || s === 'MAÑANA') return 'Mañana';
    if (s === 'TARDE') return 'Tarde';
    return b || '—';
  }
  function labelEstado(e) {
    if (typeof window.__BC_M25_labelEstadoSesion === 'function') {
      return window.__BC_M25_labelEstadoSesion(e);
    }
    var k = String(e || '').toUpperCase();
    return ({ PENDIENTE: 'Sin comenzar', EN_CURSO: 'En proceso', COMPLETADA: 'Completada', CANCELADA: 'Cancelada' })[k] || e || '—';
  }
  function normEstado(e) {
    return String(e || '').toUpperCase().trim();
  }
  function sesionUsuarioId(s) {
    var id = s.usuario_id || s.trabajador_id || s.responsable_id || null;
    if (id === '' || id === undefined) return null;
    return id;
  }
  function sesionUsuarioNombre(s) {
    return s.usuario_nombre || s.trabajador_nombre || s.responsable_nombre || null;
  }
  function puedeAbrirSesion(s) {
    if (normEstado(s.estado) !== 'PENDIENTE') return false;
    var assigned = sesionUsuarioId(s);
    if (!assigned) return false;
    if (isAdmin()) return can('ciclos', 'crear') || can('turnos', 'crear');
    var me = uid();
    if (!me || String(assigned) !== String(me)) return false;
    return can('turnos', 'crear') || can('ciclos', 'crear');
  }
  function puedeCerrarSesion(s) {
    if (normEstado(s.estado) !== 'EN_CURSO') return false;
    if (isAdmin()) return true;
    var me = uid();
    var assigned = sesionUsuarioId(s);
    if (!me || !assigned || String(assigned) !== String(me)) return false;
    return can('turnos', 'crear') || can('turnos', 'editar') ||
           can('ciclos', 'crear') || can('ciclos', 'editar');
  }

  function cicloIdDesdeUi() {
    var p = document.getElementById(PANEL_ID);
    if (p && p.dataset.cicloId) return p.dataset.cicloId;
    return window.__BC_M22_CICLO_ID || null;
  }

  function trackCicloFromClicks() {
    var root = document.getElementById('ciclos-m18-root');
    if (!root || root.dataset.m22Track === '1') return;
    root.dataset.m22Track = '1';
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m21-enter]');
      if (b && b.dataset.m21Enter) {
        window.__BC_M22_CICLO_ID = b.dataset.m21Enter;
        lastRefreshKey = '';
        setTimeout(function () { refresh(true); }, 80);
      }
    }, true);
  }

  async function listarSesiones(cicloId) {
    if (!cicloId || !navigator.onLine) return [];
    var r = await client.rpc(RPC_LIST, {
      p_ciclo_id: cicloId,
      p_almacen_id: null,
      p_fecha: null,
      p_estado: null
    });
    if (r && r.error) throw r.error;
    var d = r ? r.data : [];
    return Array.isArray(d) ? d : (d ? [d] : []);
  }

  async function mutar(rpc, sesionId, obs) {
    if (!navigator.onLine) throw new Error('Las sesiones requieren Internet.');
    var r = await client.rpc(rpc, {
      p_sesion_id: sesionId,
      p_idempotency_key: key(),
      p_observacion: obs || null
    });
    if (r && r.error) throw r.error;
    return r ? r.data : null;
  }

  async function syncVentas() {
    try {
      if (typeof window.__BC_M25_refrescarTurno === 'function') {
        await window.__BC_M25_refrescarTurno();
      } else if (typeof refrescarTurnoActual === 'function') {
        await refrescarTurnoActual();
      }
    } catch (e) {
      try { console.warn('[M22] syncVentas turno', e); } catch (x) {}
    }
    try {
      if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
    } catch (e) {}
  }

  function ensurePanel() {
    var root = document.getElementById('ciclos-m18-root');
    if (!root) return null;
    var existing = document.getElementById(PANEL_ID);
    if (existing) return existing;
    var hasStart = !!root.querySelector('[data-m21-start]');
    var hasStep2 = !!root.querySelector('[data-m21-step2]');
    if (!hasStart && !hasStep2) return null;
    suppressObs = true;
    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'm21-card';
    panel.innerHTML = '<h4>Sesiones de trabajo</h4><p class="muted">Mañana / tarde · trabajador asignado · abrir y cerrar.</p><div id="m22-sesiones-lista" class="m22-ses-lista"><p class="muted">Cargando sesiones…</p></div><p id="m22-sesiones-msg" class="m21-msg"></p>';
    var wrap = root.querySelector('.m21-wrap') || root;
    var firstCard = wrap.querySelector('.m21-card');
    if (firstCard && firstCard.parentNode) {
      firstCard.parentNode.insertBefore(panel, firstCard.nextSibling);
    } else {
      wrap.appendChild(panel);
    }
    setTimeout(function () { suppressObs = false; }, 0);
    return panel;
  }

  function setMsg(text, ok) {
    var el = document.getElementById('m22-sesiones-msg');
    if (!el) return;
    suppressObs = true;
    el.textContent = text || '';
    el.className = 'm21-msg ' + (ok ? 'ok' : 'error');
    setTimeout(function () { suppressObs = false; }, 0);
  }

  function actionsHtml(s, cicloOperable) {
    var estado = normEstado(s.estado);
    var assigned = sesionUsuarioId(s);
    var nombre = sesionUsuarioNombre(s);
    var me = uid();
    var admin = isAdmin();

    if (estado === 'COMPLETADA' || estado === 'CANCELADA') {
      return '<span class="muted">' + esc(labelEstado(estado)) + '</span>';
    }

    if (estado === 'EN_CURSO') {
      if (puedeCerrarSesion(s)) {
        return '<button type="button" class="cc-accion" data-m22-cerrar="' + esc(s.id) + '">Cerrar sesión</button>';
      }
      if (assigned && me && String(assigned) !== String(me)) {
        return '<span class="muted">En proceso · asignada a otro trabajador' +
          (nombre ? ' (' + esc(nombre) + ')' : '') + '</span>';
      }
      return '<span class="muted">En proceso</span>';
    }

    if (!assigned) {
      if (admin) {
        return '<button type="button" class="cc-accion" data-m24-asignar-sesion="' + esc(s.id) +
          '" data-alm="' + esc(s.almacen_id || '') +
          '" data-bloque="' + esc(s.bloque || '') +
          '">Asignar trabajador</button>' +
          '<span class="muted">Sesión pendiente de asignación</span>';
      }
      return '<span class="muted">Sesión pendiente de asignación</span>';
    }

    if (admin && (estado === 'PENDIENTE' || !estado)) {
      var openBtn = (cicloOperable && puedeAbrirSesion(s))
        ? '<button type="button" class="cc-accion" data-m22-abrir="' + esc(s.id) + '">Abrir sesión</button>'
        : '';
      return openBtn +
        '<button type="button" class="cc-accion" data-m24-asignar-sesion="' + esc(s.id) +
        '" data-alm="' + esc(s.almacen_id || '') +
        '" data-bloque="' + esc(s.bloque || '') +
        '" data-user="' + esc(assigned) +
        '">Cambiar trabajador</button>';
    }

    if (String(assigned) !== String(me) && !admin) {
      return '<span class="muted">Sesión asignada a otro trabajador' +
        (nombre ? ' (' + esc(nombre) + ')' : '') + '.</span>';
    }

    if (cicloOperable && puedeAbrirSesion(s)) {
      return '<button type="button" class="cc-accion" data-m22-abrir="' + esc(s.id) + '">Abrir sesión</button>';
    }

    if (!cicloOperable) {
      return '<span class="muted">Ciclo no activo para abrir</span>';
    }

    return '<span class="muted">Sin permiso para abrir</span>';
  }

  function renderLista(sesiones, cicloEstado) {
    var el = document.getElementById('m22-sesiones-lista');
    if (!el) return;
    lastSesiones = sesiones || [];
    suppressObs = true;
    if (!sesiones || !sesiones.length) {
      el.innerHTML = '<p class="muted">Sin sesiones en este turno.</p>';
      setTimeout(function () { suppressObs = false; }, 0);
      return;
    }
    var cicloOperable = cicloEstado === 'ACTIVO' || cicloEstado === 'EN_VALIDACION';
    el.innerHTML = sesiones.map(function (s) {
      var estado = normEstado(s.estado);
      var trabajador = sesionUsuarioNombre(s) || (sesionUsuarioId(s) ? '—' : 'Sin asignar');
      var alm = s.almacen_nombre || s.nombre_almacen || '';
      var apertura = s.apertura_real || s.iniciado_en || s.hora_apertura || null;
      var cierre = s.cierre_real || s.cerrado_en || s.hora_cierre || null;
      return (
        '<div class="m21-row" data-sesion-estado="' + esc(estado) + '">' +
        '<div><b>Día ' + esc(s.dia_n) + ' · ' + esc(labelBloque(s.bloque)) + '</b>' +
        '<small>' + esc(fmtFecha(s.fecha)) +
        (alm ? ' · ' + esc(alm) : '') +
        ' · Trabajador: ' + esc(trabajador) + '</small>' +
        '<span class="m21-status">' + esc(labelEstado(estado)) +
        (apertura ? ' · abre ' + esc(fmtHora(apertura)) : '') +
        (cierre ? ' · cierra ' + esc(fmtHora(cierre)) : '') +
        '</span></div>' +
        '<div class="m21-actions">' + actionsHtml(s, cicloOperable) + '</div></div>'
      );
    }).join('');
    setTimeout(function () { suppressObs = false; }, 0);
  }

  function detectarEstadoCiclo(root) {
    if (!root) return 'ACTIVO';
    var badge = root.querySelector('[data-ciclo-estado], .m21-ciclo-estado, .m21-status-ciclo');
    if (badge) {
      var raw = (badge.getAttribute('data-ciclo-estado') || badge.textContent || '').toUpperCase();
      if (/PLANIFIC/.test(raw)) return 'PLANIFICADO';
      if (/VALIDAC/.test(raw)) return 'EN_VALIDACION';
      if (/ACTIV/.test(raw)) return 'ACTIVO';
      if (/CERRAD|COMPLET/.test(raw)) return 'CERRADO';
    }
    var first = root.querySelector('.m21-card');
    var txt = first ? (first.textContent || '') : '';
    if (/Planificado/i.test(txt) && !/En curso|Activo/i.test(txt)) return 'PLANIFICADO';
    if (/validaci/i.test(txt)) return 'EN_VALIDACION';
    return 'ACTIVO';
  }

  async function refresh(force) {
    if (busy) return;
    var cicloId = cicloIdDesdeUi();
    if (!cicloId) return;
    var root = document.getElementById('ciclos-m18-root');
    if (!root) return;
    var hasSurface = !!(root.querySelector('[data-m21-start], [data-m21-step2]'));
    if (!hasSurface) return;

    var panel = ensurePanel();
    if (!panel) return;
    panel.dataset.cicloId = cicloId;

    var key = String(cicloId);
    if (!force && key === lastRefreshKey && document.getElementById('m22-sesiones-lista')) {
      return;
    }

    busy = true;
    try {
      var sesiones = await listarSesiones(cicloId);
      var estado = detectarEstadoCiclo(root);
      renderLista(sesiones, estado);
      lastRefreshKey = key;
    } catch (e) {
      setMsg('No se pudieron cargar las sesiones: ' + String(e && (e.message || e.details) || e), false);
    } finally {
      busy = false;
    }
  }

  async function abrir(id, btn) {
    var s = lastSesiones.find(function (x) { return String(x.id) === String(id); });
    if (s && !puedeAbrirSesion(s)) {
      setMsg('No podés abrir esta sesión (asignación o permiso).', false);
      return;
    }
    if (btn) { btn.disabled = true; }
    try {
      await mutar(RPC_INICIAR, id, null);
      setMsg('✓ Sesión abierta. Ya podés trabajar y registrar ventas.', true);
      await syncVentas();
      lastRefreshKey = '';
      await refresh(true);
    } catch (e) {
      setMsg('No se pudo abrir: ' + String(e && (e.message || e.details) || e), false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function cerrar(id, btn) {
    var s = lastSesiones.find(function (x) { return String(x.id) === String(id); });
    if (s && !puedeCerrarSesion(s)) {
      setMsg('No podés cerrar esta sesión.', false);
      return;
    }
    if (!window.confirm('¿Estás seguro de que terminaste esta sesión?\n\nAceptar = Sí, cerrar sesión.')) return;
    if (btn) { btn.disabled = true; }
    try {
      await mutar(RPC_CERRAR, id, null);
      setMsg('✓ Sesión cerrada.', true);
      await syncVentas();
      lastRefreshKey = '';
      await refresh(true);
    } catch (e) {
      setMsg('No se pudo cerrar: ' + String(e && (e.message || e.details) || e), false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function promptAsignar(sesionId, almId, bloque, isChange, currentUserId) {
    if (!isAdmin()) {
      setMsg('Sin permiso para asignar sesiones.', false);
      return;
    }
    if (typeof window.__BC_M24_2_openAsignar === 'function') {
      var result = await window.__BC_M24_2_openAsignar({
        sesionId: sesionId,
        almId: almId,
        bloque: bloque,
        isChange: !!isChange,
        currentUserId: currentUserId || null
      });
      if (!result) return;
      setMsg('✓ Sesión asignada' + (result.nombre ? ' a ' + result.nombre : '') + '.', true);
      lastRefreshKey = '';
      await refresh(true);
      return;
    }
    var M = window.__BC_M24__;
    if (!M) {
      setMsg('Módulo de asignaciones no cargado.', false);
      return;
    }
    try {
      await M.listarAsignaciones({});
      await M.cargarUsuarios();
    } catch (e) {}
    var cands = M.candidatosParaSesion(almId, bloque);
    if (!cands.length) {
      setMsg('No hay trabajadores autorizados para este almacén y bloque.', false);
      return;
    }
    try {
      await M.asignarSesion(sesionId, cands[0].id);
      setMsg('✓ Sesión asignada a ' + (cands[0].nombre || cands[0].id) + '.', true);
      lastRefreshKey = '';
      await refresh(true);
    } catch (e) {
      setMsg('No se pudo asignar: ' + String(e && (e.message || e.details) || e), false);
    }
  }

  function bind() {
    var root = document.getElementById('ciclos-m18-root');
    if (!root) return;
    if (root.dataset.m22Bound === '1') return;
    root.dataset.m22Bound = '1';
    root.addEventListener('click', function (e) {
      var a = e.target.closest('[data-m22-abrir]');
      if (a) { e.stopPropagation(); abrir(a.dataset.m22Abrir, a); return; }
      var c = e.target.closest('[data-m22-cerrar]');
      if (c) { e.stopPropagation(); cerrar(c.dataset.m22Cerrar, c); return; }
      var asg = e.target.closest('[data-m24-asignar-sesion]');
      if (asg) {
        e.stopPropagation();
        var isChange = /cambiar/i.test(asg.textContent || '');
        promptAsignar(asg.dataset.m24AsignarSesion, asg.dataset.alm, asg.dataset.bloque, isChange, asg.dataset.user);
      }
    });
  }

  function nodeInInternalPanel(node) {
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentNode;
    if (!node || node.nodeType !== 1) return false;
    var p22 = document.getElementById(PANEL_ID);
    var p24 = document.getElementById(M24_PANEL_ID);
    if (p22 && (node === p22 || p22.contains(node))) return true;
    if (p24 && (node === p24 || p24.contains(node))) return true;
    return false;
  }

  function mutacionSoloPanelesInternos(mutations) {
    if (!mutations || !mutations.length) return true;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      var targets = [m.target];
      var lists = [m.addedNodes, m.removedNodes];
      for (var L = 0; L < lists.length; L++) {
        var list = lists[L];
        if (!list) continue;
        for (var j = 0; j < list.length; j++) targets.push(list[j]);
      }
      for (var t = 0; t < targets.length; t++) {
        if (!nodeInInternalPanel(targets[t])) return false;
      }
    }
    return true;
  }

  function observe() {
    var root = document.getElementById('ciclos-m18-root');
    if (!root || root.dataset.m22Obs === '1') return;
    root.dataset.m22Obs = '1';
    var t = null;
    new MutationObserver(function (mutations) {
      if (suppressObs || busy) return;
      if (mutacionSoloPanelesInternos(mutations)) return;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        if (suppressObs || busy) return;
        var hasSurface = !!(root.querySelector('[data-m21-start], [data-m21-step2]'));
        if (!hasSurface) {
          lastRefreshKey = '';
          return;
        }
        bind();
        var cid = cicloIdDesdeUi();
        var panel = document.getElementById(PANEL_ID);
        if (panel && cid && String(cid) === lastRefreshKey) return;
        if (!cid) return;
        refresh(false);
      }, 250);
    }).observe(root, { childList: true, subtree: true });
  }

  function init() {
    trackCicloFromClicks();
    bind();
    observe();
    setTimeout(function () { refresh(false); }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
