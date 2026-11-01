// BattleCruiser — turnos-maestro.js
// UX operativa del modelo TURNO (expediente / detalle / acciones).
// HOME listado = ÚNICAMENTE M29. Este módulo NO compite por #ciclos-m18-root.
// API: BattleCruiserTurnoAPI (bc_*). Online-only.
(function () {
  'use strict';

  const API = function () { return window.BattleCruiserTurnoAPI; };
  const ROOT_ID = 'ciclos-m18-root';
  const VERSION = '9.4.5-turno';

  let state = {
    view: 'detalle',
    turno: null,
    sesiones: [],
    config: null,
    isAdmin: false,
    busy: false
  };

  function esc(v) {
    return typeof escHtml === 'function'
      ? escHtml(v == null ? '' : v)
      : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
          return ({ '&': '&', '<': '&lt;', '>': '&gt;', '"': '"', "'": '&#39;' })[c];
        });
  }

  function money(v) {
    return typeof window.money === 'function' ? window.money(Number(v || 0)) : Number(v || 0).toFixed(2);
  }

  function fmtDate(v) {
    if (!v) return '—';
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    if (typeof fechaCorta === 'function') return fechaCorta(v);
    return s.split('-').reverse().join('/');
  }

  function root() { return document.getElementById(ROOT_ID); }

  function setHtml(h) {
    const r = root();
    if (r) r.innerHTML = h;
  }

  function msg(text, ok) {
    const el = document.getElementById('tm-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'm21-msg ' + (ok ? 'ok' : 'error');
  }

  function can(recurso, accion) {
    return typeof tienePermiso === 'function' ? tienePermiso(recurso, accion) : false;
  }

  function currentUserId() {
    return (typeof _usuarioActual !== 'undefined' && _usuarioActual && _usuarioActual.id) || null;
  }

  function warehouses() {
    return ((_cache && _cache.almacenes) || []).filter(function (a) { return a.activo !== false; });
  }

  function styles() {
    if (document.getElementById('tm-turnos-style')) return;
    const s = document.createElement('style');
    s.id = 'tm-turnos-style';
    s.textContent = [
      '#tab-turnos{display:none!important}',
      '.tm-wrap{max-width:860px;margin:auto}',
      '.tm-card{border:1px solid var(--gold-dim);background:var(--stone);border-radius:10px;padding:16px;margin:10px 0}',
      '.tm-card h4{margin:0 0 10px}',
      '.tm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
      '.tm-meta{padding:10px;border:1px solid var(--gold-dim);border-radius:7px}',
      '.tm-meta b{color:var(--gold)}',
      '.tm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
      '.tm-actions button{min-height:42px}',
      '.tm-day-movimientos{display:block;flex:1 0 100%;width:100%;min-width:0;box-sizing:border-box;padding:12px;border:1px solid var(--gold-dim);border-radius:8px;background:rgba(7,20,16,.55)}',
      '.tm-day-movimientos h5{margin:0 0 8px;color:var(--gold);font-size:13px}',
      '.tm-day-movimientos .tm-mov-scroll{max-width:100%;overflow-x:auto}',
      '.tm-day-movimientos table{width:100%;min-width:460px;border-collapse:collapse;font-size:11px}',
      '.tm-day-movimientos th,.tm-day-movimientos td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--gold-dim);vertical-align:top}',
      '.tm-day-movimientos th{color:var(--mist);font-weight:600}',
      '.tm-day-movimientos .tm-mov-empty{padding:10px;border:1px dashed var(--gold-dim);border-radius:6px;color:var(--mist);font-size:12px;line-height:1.45}',
      '.tm-day-movimientos[hidden]{display:none!important}',
      '.tm-day-group{border-top:1px solid var(--gold-dim);padding:8px 0 4px}',
      '.tm-day-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 0}',
      '.tm-day-head b{color:var(--gold)}',
      '.tm-day-head small{display:block;color:var(--mist);font-size:11px;margin-top:3px}',
      '.tm-day-head button{min-height:42px;max-width:100%;white-space:normal}',
      '.tm-day-sessions{border:1px solid var(--gold-dim);border-radius:8px;padding:0 10px}',
      '.tm-day-sessions .tm-row{padding:11px 0}',
      '.tm-day-movimientos{margin-top:10px}',

      '.tm-back{background:transparent!important}',
      '.tm-msg{min-height:20px;margin-top:10px}',
      '.tm-msg.ok{color:#8fc79d}',
      '.tm-msg.error{color:#d98b7f}',
      '.tm-empty{padding:18px;text-align:center;color:var(--mist)}',
      '.tm-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border-top:1px solid var(--gold-dim);padding:11px 0}',
      '.tm-row:first-child{border-top:0}',
      '.tm-row small,.tm-status{display:block;color:var(--mist);font-size:11px}',
      '.tm-status{text-transform:uppercase;letter-spacing:.04em}',
      '.tm-duration{display:flex;gap:7px;flex-wrap:wrap}',
      '.tm-duration button{min-width:52px}',
      '.tm-duration button.active{border-color:var(--gold);color:var(--gold)}',
      '.tm-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9990;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.tm-modal{background:var(--stone);border:1px solid var(--gold-dim);border-radius:12px;max-width:520px;width:100%;max-height:90vh;overflow:auto;padding:18px}',
      '.tm-modal h3{margin:0 0 12px}',
      '.tm-modal .field{margin-bottom:10px}',
      '.tm-modal label{display:block;font-size:12px;color:var(--mist);margin-bottom:4px}',
      '.tm-modal input,.tm-modal select,.tm-modal textarea{width:100%;padding:9px 11px;background:var(--void);border:1px solid #c9a24d33;border-radius:5px;color:var(--text)}',
      '@media(max-width:650px){.tm-grid{grid-template-columns:1fr}.tm-row{grid-template-columns:1fr}.tm-day-head{align-items:stretch;flex-direction:column}.tm-day-head button{width:100%;box-sizing:border-box}}'
    ].join('');
    document.head.appendChild(s);
  }

  function labelEstado(e) {
    const api = API();
    return api ? api.labelEstado(e) : String(e || '—');
  }

  function labelBloque(b) {
    const s = String(b || '').toUpperCase();
    if (s === 'MANANA' || s === 'MAÑANA' || s === 'TARDE' || s === 'JORNADA') return 'Jornada diaria';
    return b || '—';
  }

  async function refreshAdminFlag() {
    try {
      if (can('ciclos', 'editar_any') || can('turnos', 'editar_any')) {
        state.isAdmin = true;
        return;
      }
      const api = API();
      if (!api) { state.isAdmin = false; return; }
      const r = await api.actorIsAdmin();
      state.isAdmin = r === true || (r && (r.is_admin === true || r === 'true'));
    } catch (e) {
      state.isAdmin = can('ciclos', 'editar_any') || can('turnos', 'editar_any');
    }
  }

  async function loadConfig() {
    try {
      const api = API();
      if (!api) return null;
      state.config = await api.obtenerConfiguracion();
      return state.config;
    } catch (e) {
      state.config = null;
      return null;
    }
  }

  function asArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.turnos)) return data.turnos;
    if (Array.isArray(data.items)) return data.items;
    return [data];
  }

  // ---------------------------------------------------------------------------
  // HOME — DELEGADO a M29 (único owner). Nunca pintar lista propia aquí.
  // ---------------------------------------------------------------------------
  function home() {
    state.view = 'home';
    state.turno = null;
    if (window.__BC_M29__ && typeof window.__BC_M29__.renderHome === 'function') {
      if (window.__BC_M29__.claimHomeOwnership) window.__BC_M29__.claimHomeOwnership();
      return window.__BC_M29__.renderHome();
    }
    // Fallback mínimo si M29 aún no cargó: no inventar cards por almacén.
    const r = root();
    if (r && !r.querySelector('.m29-wrap')) {
      r.innerHTML = '<div class="tm-wrap"><div class="tm-empty">Cargando Turnos…</div></div>';
    }
  }

  // ---------------------------------------------------------------------------
  // CREAR TURNO (form interno; preferir modal M29)
  // ---------------------------------------------------------------------------
  function createForm(almacenId) {
    const a = warehouses().find(function (x) { return x.id === almacenId; });
    const cfg = state.config || {};
    const fija = !!(cfg.duracion_fija || cfg.habilitada || cfg.fija);
    const diasFijos = cfg.dias_fijos || cfg.x_dias || 3;
    const hoy = new Date().toISOString().slice(0, 10);
    let diasBtns = '';
    if (fija) {
      diasBtns = '<p class="muted">Duración fija activa: <b>' + esc(diasFijos) + ' día(s)</b>.</p>' +
        '<input type="hidden" id="tm-dias" value="' + esc(diasFijos) + '">';
    } else {
      diasBtns = '<div class="tm-duration" id="tm-duration">';
      for (let d = 1; d <= 7; d++) {
        diasBtns += '<button type="button" class="cc-accion' + (d === 3 ? ' active' : '') + '" data-days="' + d + '">' + d + ' día' + (d > 1 ? 's' : '') + '</button>';
      }
      diasBtns += '</div><input type="hidden" id="tm-dias" value="3">';
    }
    setHtml(
      '<div class="tm-wrap"><div class="tm-card">' +
      '<h4>Nuevo turno · ' + esc(a ? a.nombre : 'Almacén') + '</h4>' +
      '<div class="tm-grid">' +
      '<div class="tm-meta">Almacén<br><b>' + esc(a ? a.nombre : almacenId) + '</b></div>' +
      '<div class="tm-meta">Inicio<br><label class="muted"><input type="date" id="tm-inicio" value="' + esc(hoy) + '"></label></div>' +
      '</div>' +
      '<p class="muted" style="margin-top:12px">Cada fecha trabajada es una jornada completa de 07:00 a 23:00, con una sola dependienta responsable. Este formulario antiguo no crea turnos; utiliza el programador oficial.</p>' +
      diasBtns +
      '<div class="tm-actions">' +
      '<button type="button" class="cc-accion" data-tm-confirm-create="' + esc(almacenId) + '">Crear turno</button>' +
      '<button type="button" class="cc-accion tm-back" data-tm-home>← Atrás</button>' +
      '</div><p id="tm-msg" class="tm-msg"></p></div></div>'
    );
  }

  async function confirmCreate() {
    msg('La creación desde el formulario antiguo está deshabilitada. Utiliza el programador oficial de Jornada completa (07:00–23:00) para asignar una responsable por fecha.', false);
  }

  // ---------------------------------------------------------------------------
  // DETALLE TURNO
  // ---------------------------------------------------------------------------
  async function openTurno(turnoId, isLegacy) {
    state.view = 'detalle';
    const api = API();
    if (!api) { msg('API Turno no cargada.', false); return; }

    if (isLegacy) {
      if (window.BattleCruiserM21 && typeof window.BattleCruiserM21.enter === 'function') {
        return window.BattleCruiserM21.enter(turnoId);
      }
    }

    let detalle = null;
    try {
      detalle = await api.estado(turnoId);
    } catch (e) {
      try {
        const list = asArray(await api.listarTurnos({ limit: 100 }));
        detalle = list.find(function (t) { return String(t.id) === String(turnoId); }) || null;
      } catch (x) {
        msg('No se pudo cargar el turno: ' + String(e && e.message || e), false);
        return;
      }
    }
    if (!detalle) {
      msg('Turno no encontrado.', false);
      return;
    }
    if (Array.isArray(detalle)) detalle = detalle[0];
    state.turno = detalle;

    let sesiones = [];
    try {
      sesiones = await api.listarSesionesTurno(turnoId);
    } catch (e) {
      sesiones = Array.isArray(detalle.sesiones) ? detalle.sesiones : [];
    }
    state.sesiones = sesiones || [];

    const t = state.turno;
    const est = t.estado_maestro || t.estado;
    const dias = t.dias_turno != null ? t.dias_turno : t.cantidad_dias;
    const alm = t.almacen_nombre || t.almacen_id || '—';

    let sesHtml = '';
    const me = currentUserId();
    const visibleSessions = state.sesiones.filter(function (s) {
      const status = String(s.estado || '').toUpperCase();
      if (status === 'CANCELADA' || status === 'CANCELADO') return false;
      if (state.isAdmin) return true;
      const assigned = s.usuario_id || s.asignado_id || null;
      return !!me && !!assigned && String(assigned) === String(me);
    });
    if (!visibleSessions.length) {
      sesHtml = '<p class="muted">No tienes jornadas activas para consultar.</p>';
    } else {
      const dayGroups = Object.create(null);
      visibleSessions.forEach(function (s) {
        const day = s.dia_n || s.numero_dia || '—';
        const date = String(s.fecha || '').slice(0, 10);
        const dayKey = String(day) + '|' + date;
        if (!dayGroups[dayKey]) dayGroups[dayKey] = { day: day, date: date, sessions: [] };
        dayGroups[dayKey].sessions.push(s);
      });

      sesHtml = Object.keys(dayGroups).map(function (dayKey) {
        const group = dayGroups[dayKey];
        const sessionIds = group.sessions.map(function (s) { return String(s.id || ''); }).filter(Boolean).join('|');
        const sessionRows = group.sessions.map(function (s) {
          const assigned = s.usuario_id || s.asignado_id || null;
          const nombre = s.usuario_nombre || s.asignado_nombre || (assigned ? '—' : 'Sin asignar');
          const se = String(s.estado || '').toUpperCase();
          const bloque = String(s.bloque || '').toUpperCase();
          const blockLabel = group.sessions.length === 1 && (bloque === 'MANANA' || bloque === 'TARDE')
            ? 'Jornada completa' : labelBloque(s.bloque);
          let actions = '';
          if (!assigned && state.isAdmin && (se === 'PENDIENTE' || se === 'PROGRAMADA' || !se)) {
            actions += '<button type="button" class="cc-accion" data-tm-asignar="' + esc(s.id) + '">Asignar</button>';
          }
          if (assigned && state.isAdmin && (se === 'PENDIENTE' || se === 'PROGRAMADA')) {
            actions += '<button type="button" class="cc-accion" data-tm-asignar="' + esc(s.id) + '">Cambiar</button>';
          }
          const me = currentUserId();
          const puedoIniciar = (se === 'PENDIENTE' || se === 'PROGRAMADA') &&
            bloque !== 'JORNADA' && assigned && me && String(assigned) === String(me);
          if (puedoIniciar) {
            actions += '<button type="button" class="cc-accion" data-tm-iniciar="' + esc(s.id) + '">Iniciar jornada</button>';
          }
          if (state.isAdmin && (bloque === 'MANANA' || bloque === 'TARDE') &&
              (se === 'PENDIENTE' || se === 'PROGRAMADA')) {
            actions += '<button type="button" class="cc-accion" data-tm-cancelar-programada="' + esc(s.id) + '">Cancelar bloque no trabajado</button>';
          }
          if (se === 'EN_CURSO' && assigned && me && String(assigned) === String(me)) {
            actions += '<button type="button" class="cc-accion" data-tm-declarar="' + esc(s.id) + '">Dinero entregado</button>';
            actions += '<button type="button" class="cc-accion" data-tm-cerrar-ses="' + esc(s.id) + '">Cerrar jornada</button>';
            actions += '<button type="button" class="cc-accion" data-tm-interrumpir="' + esc(s.id) + '">Interrumpir / relevo</button>';
          }
          if (!assigned && se === 'PENDIENTE') {
            actions += '<span class="muted">No puede comenzar: sin dependiente asignada.</span>';
          }
          if (assigned && me && String(assigned) !== String(me) && se === 'PENDIENTE' && !state.isAdmin) {
            actions += '<span class="muted">Asignada a otro trabajador.</span>';
          }
          return (
            '<div class="tm-row" data-sesion-id="' + esc(s.id) + '">' +
            '<div><b>' + esc(blockLabel) + '</b>' +
            '<small>' + esc(fmtDate(s.fecha)) + ' · ' + esc(nombre) + '</small>' +
            '<span class="tm-status">' + esc(labelEstado(se)) + '</span></div>' +
            '<div class="tm-actions">' + actions + '</div></div>'
          );
        }).join('');
        return (
          '<section class="tm-day-group">' +
          '<header class="tm-day-head"><div><b>Día ' + esc(group.day) + '</b><small>' + esc(fmtDate(group.date)) + '</small></div>' +
          '<button type="button" class="cc-accion" data-tm-mov-dia="' + esc(group.day) +
          '" data-tm-mov-fecha="' + esc(group.date) + '" data-tm-sessions="' + esc(sessionIds) +
          '" aria-expanded="false">Ver movimientos del día</button></header>' +
          '<div class="tm-day-sessions">' + sessionRows + '</div>' +
          '<div class="tm-day-movimientos" data-tm-movimientos-day-host hidden></div>' +
          '</section>'
        );
      }).join('');
    }
    if (state.isAdmin && cancelledSessions.length) {
      sesHtml += '<p class="muted">Bloques antiguos no trabajados cancelados: ' + cancelledSessions.length +
        '. Sus asignaciones y eventos se conservan en el expediente; no requieren declaración de efectivo.</p>';
    }

    let adminActions = '';
    if (state.isAdmin) {
      const eu = String(est || '').toUpperCase();
      if (eu === 'EN_CURSO' || eu === 'PENDIENTE_APROBACION') {
        adminActions += '<button type="button" class="cc-accion" data-tm-enviar-aprobacion="' + esc(t.id) + '">Enviar a aprobación</button>';
      }
      if (eu === 'PENDIENTE_APROBACION') {
        adminActions += '<button type="button" class="cc-accion" data-tm-aprobar="' + esc(t.id) + '">Aprobar turno</button>';
        adminActions += '<button type="button" class="cc-accion" data-tm-descuento="' + esc(t.id) + '">Descuento</button>';
      }
      adminActions += '<button type="button" class="cc-accion" data-tm-entrega-inv="' + esc(t.id) + '">Entregar inventario</button>';
    }

    setHtml(
      '<div class="tm-wrap"><div class="tm-card">' +
      '<h4>Turno · ' + esc(alm) + '</h4>' +
      '<div class="tm-grid">' +
      '<div class="tm-meta">Estado<br><b>' + esc(labelEstado(est)) + '</b></div>' +
      '<div class="tm-meta">Duración<br><b>' + esc(dias) + ' día(s)</b></div>' +
      '<div class="tm-meta">Inicio<br><b>' + esc(fmtDate(t.inicio_plan || t.fecha_inicio)) + '</b></div>' +
      '<div class="tm-meta">Final<br><b>' + esc(fmtDate(t.fin_plan || t.fecha_fin)) + '</b></div>' +
      '</div>' +
      '<h4 style="margin-top:16px">Sesiones de trabajo</h4>' +
      '<p class="muted">Solo la dependiente asignada puede iniciar. Sin asignación no puede comenzar. Cerrar sesión exige declaración de dinero (incluido $0).</p>' +
      sesHtml +
      '<div class="tm-actions" style="margin-top:16px">' +
      adminActions +
      '<button type="button" class="cc-accion tm-back" data-tm-home>← Turnos</button>' +
      '</div><p id="tm-msg" class="tm-msg"></p></div></div>'
    );
  }

  function closeModal() {
    const m = document.getElementById('tm-modal-bg');
    if (m) m.remove();
  }

  function openModal(title, bodyHtml, onConfirm) {
    closeModal();
    const bg = document.createElement('div');
    bg.id = 'tm-modal-bg';
    bg.className = 'tm-modal-bg';
    bg.innerHTML =
      '<div class="tm-modal" role="dialog">' +
      '<h3>' + esc(title) + '</h3>' +
      bodyHtml +
      '<div class="tm-actions">' +
      '<button type="button" class="cc-accion" id="tm-modal-ok">Confirmar</button>' +
      '<button type="button" class="cc-accion tm-back" id="tm-modal-cancel">Cancelar</button>' +
      '</div><p id="tm-modal-msg" class="tm-msg"></p></div>';
    document.body.appendChild(bg);
    bg.querySelector('#tm-modal-cancel').addEventListener('click', closeModal);
    bg.addEventListener('click', function (e) { if (e.target === bg) closeModal(); });
    bg.querySelector('#tm-modal-ok').addEventListener('click', function () {
      if (typeof onConfirm === 'function') onConfirm(bg);
    });
  }

  async function promptAsignar(sesionId) {
    const users = ((_cache && _cache.usuarios) || []).filter(function (u) {
      return u.activo !== false;
    });
    let opts = '<option value="">Elegí dependiente…</option>';
    users.forEach(function (u) {
      opts += '<option value="' + esc(u.id) + '">' + esc(u.nombre || u.email || u.id) + '</option>';
    });
    openModal(
      'Asignar sesión',
      '<div class="field"><label>Dependiente</label><select id="tm-asig-user">' + opts + '</select></div>' +
      '<p class="muted">Solo usuarios activos. El backend valida elegibilidad.</p>',
      async function () {
        const sel = document.getElementById('tm-asig-user');
        const uid = sel ? sel.value : '';
        if (!uid) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = 'Seleccioná un usuario.'; m.className = 'tm-msg error'; }
          return;
        }
        try {
          await API().asignarSesion(sesionId, uid);
          closeModal();
          if (state.turno) await openTurno(state.turno.id, false);
        } catch (e) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = String(e && e.message || e); m.className = 'tm-msg error'; }
        }
      }
    );
  }

  async function doIniciar(sesionId) {
    try {
      await API().iniciarSesion(sesionId);
      msg('✓ Sesión iniciada.', true);
      if (typeof refrescarTurnoActual === 'function') await refrescarTurnoActual();
      if (state.turno) await openTurno(state.turno.id, false);
    } catch (e) {
      msg('No se pudo iniciar: ' + String(e && e.message || e), false);
    }
  }

  async function doDeclarar(sesionId) {
    let tramos = [];
    try {
      tramos = await API().listarTramosSesion(sesionId);
    } catch (e) {
      msg('No se pudieron cargar los tramos: ' + String(e && e.message || e), false);
      return;
    }
    const activo = (tramos || []).find(function (t) {
      return String(t.estado || '').toUpperCase() === 'ACTIVO';
    }) || (tramos || [])[tramos.length - 1];
    if (!activo || !activo.id) {
      msg('No hay tramo activo para declarar dinero.', false);
      return;
    }
    openModal(
      'Declarar dinero entregado',
      '<div class="field"><label>Monto (CUP). $0 es válido.</label>' +
      '<input id="tm-monto" type="number" inputmode="decimal" step="0.01" min="0" value="0"></div>' +
      '<p class="muted">Sin declaración no se puede cerrar la sesión. Declarar 0 no equivale a omitir.</p>',
      async function () {
        const input = document.getElementById('tm-monto');
        const monto = input ? parseFloat(input.value) : NaN;
        if (!Number.isFinite(monto) || monto < 0) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = 'Monto inválido.'; m.className = 'tm-msg error'; }
          return;
        }
        try {
          await API().declararDinero(activo.id, monto);
          closeModal();
          msg('✓ Dinero declarado: $' + money(monto), true);
        } catch (e) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = String(e && e.message || e); m.className = 'tm-msg error'; }
        }
      }
    );
  }

  async function doCerrarSesion(sesionId) {
    if (!window.confirm('¿Cerrar esta sesión?\n\nDebe existir declaración de dinero (incluido $0). Cerrar la sesión NO cierra el Turno.')) return;
    try {
      await API().cerrarSesion(sesionId);
      msg('✓ Sesión cerrada.', true);
      if (typeof refrescarTurnoActual === 'function') await refrescarTurnoActual();
      if (state.turno) await openTurno(state.turno.id, false);
    } catch (e) {
      msg('No se pudo cerrar: ' + String(e && e.message || e), false);
    }
  }

  async function doInterrumpir(sesionId) {
    openModal(
      'Interrupción / relevo de emergencia',
      '<p class="muted">Solo para emergencias. Debe haber una persona dispuesta a permanecer. El sustituto introduce sus credenciales aquí; no se cierra el login general.</p>' +
      '<div class="field"><label>Usuario o correo del sustituto</label><input id="tm-sub-user" type="text" autocomplete="username"></div>' +
      '<div class="field"><label>Contraseña del sustituto</label><input id="tm-sub-pass" type="password" autocomplete="current-password"></div>' +
      '<div class="field"><label>Motivo</label><textarea id="tm-sub-motivo" rows="2"></textarea></div>',
      async function () {
        const u = (document.getElementById('tm-sub-user') || {}).value || '';
        const p = (document.getElementById('tm-sub-pass') || {}).value || '';
        const motivo = (document.getElementById('tm-sub-motivo') || {}).value || '';
        if (!u || !p) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = 'Credenciales del sustituto obligatorias.'; m.className = 'tm-msg error'; }
          return;
        }
        if (!String(motivo).trim()) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = 'Indicá el motivo de la interrupción.'; m.className = 'tm-msg error'; }
          return;
        }
        try {
          const sust = await API().autenticarSustituto(u, p);
          await API().interrumpirYRelevar(sesionId, sust.id, motivo);
          closeModal();
          msg('✓ Relevo aplicado. El sustituto asume el tramo.', true);
          if (state.turno) await openTurno(state.turno.id, false);
        } catch (e) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = String(e && e.message || e); m.className = 'tm-msg error'; }
        }
      }
    );
  }

  async function doCancelarSesionProgramada(sesionId) {
    const motivo = 'Reconciliación de jornada única 07:00–23:00: bloque legacy no trabajado; se conserva su historial.';
    if (!window.confirm('¿Cancelar este bloque programado que no se trabajó?\n\nNo se declarará efectivo ni se borrará el historial. El backend rechazará la operación si existe actividad, dinero o inventario asociado.')) return;
    try {
      await API().cancelarSesionProgramada(sesionId, motivo);
      msg('✓ Bloque no trabajado cancelado; historial preservado.', true);
      if (state.turno) await openTurno(state.turno.id, false);
    } catch (e) {
      msg('No se pudo cancelar el bloque: ' + String(e && e.message || e), false);
    }
  }

  async function doEnviarAprobacion(turnoId) {
    try {
      await API().enviarAprobacion(turnoId);
      msg('✓ Turno enviado a pendiente de aprobación.', true);
      await openTurno(turnoId, false);
    } catch (e) {
      msg('No se pudo enviar a aprobación: ' + String(e && e.message || e), false);
    }
  }

  async function doAprobar(turnoId) {
    openModal(
      'Aprobar turno',
      '<div class="field"><label>Observación (opcional)</label>' +
      '<textarea id="tm-apr-obs" rows="3"></textarea></div>',
      async function () {
        const obs = (document.getElementById('tm-apr-obs') || {}).value || null;
        try {
          await API().aprobarTurno(turnoId, obs);
          closeModal();
          msg('✓ Turno aprobado / cerrado.', true);
          await openTurno(turnoId, false);
        } catch (e) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = String(e && e.message || e); m.className = 'tm-msg error'; }
        }
      }
    );
  }

  async function doDescuento(turnoId) {
    const users = ((_cache && _cache.usuarios) || []).filter(function (u) { return u.activo !== false; });
    let opts = '<option value="">Elegí responsable…</option>';
    users.forEach(function (u) {
      opts += '<option value="' + esc(u.id) + '">' + esc(u.nombre || u.email || u.id) + '</option>';
    });
    openModal(
      'Registrar descuento',
      '<div class="field"><label>Dependiente / responsable</label><select id="tm-desc-user">' + opts + '</select></div>' +
      '<div class="field"><label>Monto a descontar (manual)</label><input id="tm-desc-monto" type="number" step="0.01" min="0" value="0"></div>' +
      '<div class="field"><label>Motivo</label><textarea id="tm-desc-motivo" rows="2"></textarea></div>' +
      '<p class="muted">El monto es manual. No se asume automáticamente que diferencia = descuento.</p>',
      async function () {
        const uid = (document.getElementById('tm-desc-user') || {}).value;
        const monto = parseFloat((document.getElementById('tm-desc-monto') || {}).value);
        const motivo = (document.getElementById('tm-desc-motivo') || {}).value || '';
        if (!uid || !Number.isFinite(monto) || monto < 0 || !String(motivo).trim()) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = 'Completá responsable, monto y motivo.'; m.className = 'tm-msg error'; }
          return;
        }
        try {
          await API().crearDescuento({
            turnoId: turnoId,
            usuarioId: uid,
            monto: monto,
            motivo: motivo
          });
          closeModal();
          msg('✓ Descuento registrado.', true);
        } catch (e) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = String(e && e.message || e); m.className = 'tm-msg error'; }
        }
      }
    );
  }

  async function doEntregaInv(turnoId) {
    if (!window.confirm('¿Registrar entrega de inventario de este turno?\n\nEl receptor lo determina el backend (responsable con sesión activa).')) return;
    try {
      await API().registrarEntregaInventario(turnoId, null);
      msg('✓ Entrega de inventario registrada.', true);
    } catch (e) {
      msg('No se pudo registrar entrega: ' + String(e && e.message || e), false);
    }
  }

  async function openConfig() {
    await loadConfig();
    const cfg = state.config || {};
    const fija = !!(cfg.duracion_fija || cfg.habilitada || cfg.fija);
    const dias = cfg.dias_fijos || cfg.x_dias || 3;
    openModal(
      'Duración de turnos',
      '<div class="field"><label><input type="checkbox" id="tm-cfg-fija"' + (fija ? ' checked' : '') + '> Fijar duración de los turnos</label></div>' +
      '<div class="field"><label>Días fijos (1–31)</label><input id="tm-cfg-dias" type="number" min="1" max="31" value="' + esc(dias) + '"></div>' +
      '<p class="muted">Con duración fija, los turnos nuevos (y sucesores) usan exactamente X días. No modifica turnos existentes.</p>',
      async function () {
        const hab = !!(document.getElementById('tm-cfg-fija') || {}).checked;
        const d = parseInt((document.getElementById('tm-cfg-dias') || {}).value, 10);
        try {
          await API().configurarDuracion(hab, hab ? d : null);
          closeModal();
          await loadConfig();
          msg('✓ Configuración guardada.', true);
        } catch (e) {
          const m = document.getElementById('tm-modal-msg');
          if (m) { m.textContent = String(e && e.message || e); m.className = 'tm-msg error'; }
        }
      }
    );
  }

  async function openRevision() {
    const api = API();
    if (!api) return;
    let list = [];
    try {
      list = asArray(await api.listarTurnos({ estado: 'PENDIENTE_APROBACION', limit: 50 }));
    } catch (e) {
      msg('No se pudieron cargar turnos pendientes: ' + String(e && e.message || e), false);
      return;
    }
    if (!list.length) {
      msg('No hay turnos pendientes de aprobación.', true);
      return;
    }
    const rows = list.map(function (t) {
      return (
        '<div class="tm-row"><div><b>' + esc(t.almacen_nombre || t.almacen_id) + '</b>' +
        '<small>' + esc(fmtDate(t.inicio_plan)) + ' → ' + esc(fmtDate(t.fin_plan)) + '</small>' +
        '<span class="tm-status">' + esc(labelEstado(t.estado_maestro || t.estado)) + '</span></div>' +
        '<div class="tm-actions"><button type="button" class="cc-accion" data-tm-open="' + esc(t.id) + '">Revisar</button></div></div>'
      );
    }).join('');
    setHtml(
      '<div class="tm-wrap"><div class="tm-card"><h4>Revisión administrativa</h4>' +
      '<p class="muted">Solo ADMIN. Revisá el expediente y aprobá, dejá pendiente o registrá descuentos.</p>' +
      rows +
      '<div class="tm-actions"><button type="button" class="cc-accion tm-back" data-tm-home>← Turnos</button></div>' +
      '<p id="tm-msg" class="tm-msg"></p></div></div>'
    );
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------
  async function toggleDayMovements(button) {
    const dayGroup = button && button.closest('.tm-day-group');
    const host = dayGroup && dayGroup.querySelector('.tm-day-movimientos');
    const sessionIds = String(button && button.dataset.tmSessions || '').split('|').filter(Boolean);
    if (!host || !sessionIds.length) return;
    if (host.dataset.loaded === '1') {
      host.hidden = !host.hidden;
      button.setAttribute('aria-expanded', host.hidden ? 'false' : 'true');
      return;
    }
    if (!navigator.onLine) {
      host.hidden = false;
      host.innerHTML = '<div class="tm-mov-empty">Sin conexión: el archivo del día requiere consultar el servidor.</div>';
      button.setAttribute('aria-expanded', 'true');
      return;
    }
    host.hidden = false;
    host.innerHTML = '<div class="tm-mov-empty">Consultando las sesiones de este día…</div>';
    button.disabled = true;
    try {
      const client = window.client;
      if (!client || typeof client.rpc !== 'function') throw new Error('Cliente del servidor no disponible.');
      const sessionsById = new Map((state.sesiones || []).map(function (s) { return [String(s.id), s]; }));
      const rows = [];
      let readableSessions = 0;
      let deniedSessions = 0;
      for (const sessionId of sessionIds) {
        const session = sessionsById.get(String(sessionId));
        try {
          const result = await client.rpc('bc7_movimientos_sesion', { p_turno_sesion_id: sessionId });
          if (result && result.error) throw result.error;
          readableSessions += 1;
          const items = Array.isArray(result && result.data) ? result.data : [];
          items.forEach(function (row) {
            rows.push(Object.assign({}, row, {
              __sessionLabel: session && ['MANANA','TARDE'].includes(String(session.bloque || '').toUpperCase()) ? 'Jornada completa' : (session ? labelBloque(session.bloque) : 'Sesión'),
              __sessionDay: session ? (session.dia_n || session.numero_dia || button.dataset.tmMovDia || '—') : (button.dataset.tmMovDia || '—')
            }));
          });
        } catch (error) {
          if (String(error && error.code || '') === '42501') {
            deniedSessions += 1;
            continue;
          }
          throw error;
        }
      }

      const title = '<h5>Movimientos del día ' + esc(button.dataset.tmMovDia || '—') +
        ' · ' + esc(fmtDate(button.dataset.tmMovFecha || '')) + '</h5>';
      if (!readableSessions) {
        host.innerHTML = title + '<div class="tm-mov-empty">Tu perfil no tiene permiso para consultar las sesiones de este día.</div>';
      } else if (!rows.length) {
        host.innerHTML = title + '<div class="tm-mov-empty">No hay operaciones vinculadas de forma verificable a las sesiones que puedes consultar. Las operaciones sin atribución segura siguen en Movimientos → Historial general; no se asignan solo por compartir fecha.</div>';
      } else {
        rows.sort(function (a, b) { return new Date(b.fecha).getTime() - new Date(a.fecha).getTime(); });
        const label = function(tipo) {
          return ({
            compra:'Compra / entrada', venta:'Venta / salida',
            transferencia_salida:'Transferencia de salida',
            transferencia_entrada:'Transferencia de entrada',
            vale:'Vale de salida', merma:'Merma', baja:'Baja'
          })[String(tipo || '').toLowerCase()] || String(tipo || '—');
        };
        const body = rows.map(function (row) {
          const ref = String(row.operacion_id || '');
          const shortRef = ref ? '#' + ref.slice(-6) : '—';
          return '<tr><td>' + esc(String(row.fecha || '').replace('T', ' ').slice(0, 16)) +
            '</td><td>' + esc(row.__sessionLabel || '—') +
            '</td><td>' + esc(label(row.tipo)) +
            '</td><td>' + esc(row.producto || '—') +
            '</td><td>' + esc(row.cantidad == null ? '—' : row.cantidad) +
            '</td><td>' + esc(row.usuario || '—') +
            '</td><td>' + esc(shortRef) + '</td></tr>';
        }).join('');
        host.innerHTML = title + '<div class="tm-mov-scroll"><table><thead><tr><th>Fecha/hora</th><th>Sesión</th><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Responsable</th><th>Ref.</th></tr></thead><tbody>' +
          body + '</tbody></table></div>' +
          (deniedSessions ? '<div class="tm-mov-empty" role="status">Algunas sesiones de este día no se muestran porque tu perfil no tiene permiso para consultarlas.</div>' : '');
      }
      host.dataset.loaded = '1';
      button.setAttribute('aria-expanded', 'true');
    } catch (error) {
      host.innerHTML = '<div class="tm-mov-empty">No se pudo consultar el archivo de este día: ' +
        esc(error && error.message ? error.message : error) + '.</div>';
      button.setAttribute('aria-expanded', 'true');
    } finally {
      button.disabled = false;
    }
  }

  function bind() {
    const r = root();
    if (!r || r.dataset.tmBound === '1') return;
    r.dataset.tmBound = '1';
    r.addEventListener('click', async function (e) {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tmHome != null) return home();
      if (b.dataset.tmSessions != null) return toggleDayMovements(b);
      if (b.dataset.tmCreate) return createForm(b.dataset.tmCreate);
      if (b.dataset.tmConfirmCreate) return confirmCreate(b.dataset.tmConfirmCreate);
      if (b.dataset.tmOpen) return openTurno(b.dataset.tmOpen, b.dataset.legacy === '1');
      if (b.dataset.tmAsignar) return promptAsignar(b.dataset.tmAsignar);
      if (b.dataset.tmIniciar) return doIniciar(b.dataset.tmIniciar);
      if (b.dataset.tmCancelarProgramada) return doCancelarSesionProgramada(b.dataset.tmCancelarProgramada);
      if (b.dataset.tmDeclarar) return doDeclarar(b.dataset.tmDeclarar);
      if (b.dataset.tmCerrarSes) return doCerrarSesion(b.dataset.tmCerrarSes);
      if (b.dataset.tmInterrumpir) return doInterrumpir(b.dataset.tmInterrumpir);
      if (b.dataset.tmEnviarAprobacion) return doEnviarAprobacion(b.dataset.tmEnviarAprobacion);
      if (b.dataset.tmAprobar) return doAprobar(b.dataset.tmAprobar);
      if (b.dataset.tmDescuento) return doDescuento(b.dataset.tmDescuento);
      if (b.dataset.tmEntregaInv) return doEntregaInv(b.dataset.tmEntregaInv);
      if (b.dataset.tmConfig != null) return openConfig();
      if (b.dataset.tmRevision != null) return openRevision();
      if (b.dataset.days) {
        const wrap = document.getElementById('tm-duration');
        if (wrap) wrap.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        const hid = document.getElementById('tm-dias');
        if (hid) hid.value = b.dataset.days;
      }
    });
  }

  function hideLegacyTab() {
    const old = document.querySelector('.tab-btn[data-tab="turnos"]');
    if (old) old.style.display = 'none';
    const panel = document.getElementById('tab-turnos');
    if (panel) panel.classList.remove('visible');
    const tab = document.querySelector('.tab-btn[data-tab="ciclos"]');
    if (tab) {
      tab.textContent = 'Turnos';
      tab.dataset.tmLabelled = '1';
    }
  }

  function init() {
    styles();
    hideLegacyTab();
    bind();
    window.BattleCruiserTurnosMaestro = {
      home: home,
      open: openTurno,
      version: VERSION
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 400); }, { once: true });
  } else {
    setTimeout(init, 400);
  }
})();
