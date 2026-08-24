// BattleCruiser M22-FE — Sesiones operativas dentro de Turnos (M21).
// No reemplaza m18-ciclos-ux.js: lo complementa.
// RPCs: listar_sesiones_operativas, iniciar_sesion_operativa, cerrar_sesion_operativa.
// NO toca offline, legacy turnos físicos ni backend.
(function () {
  'use strict';
  var RPC_LIST = 'listar_sesiones_operativas';
  var RPC_INICIAR = 'iniciar_sesion_operativa';
  var RPC_CERRAR = 'cerrar_sesion_operativa';
  var PANEL_ID = 'm22-sesiones-panel';
  var busy = false;

  function can(s, a) {
    return typeof tienePermiso === 'function' && tienePermiso(s, a);
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
    return ({ PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', COMPLETADA: 'Completada', CANCELADA: 'Cancelada' })[e] || e || '—';
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
      if (b && b.dataset.m21Enter) window.__BC_M22_CICLO_ID = b.dataset.m21Enter;
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
      if (typeof refrescarTurnoActual === 'function') await refrescarTurnoActual();
    } catch (e) {}
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
    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'm21-card';
    panel.innerHTML = '<h4>Sesiones de trabajo</h4><p class="muted">Mañana / tarde · trabajador · abrir y cerrar.</p><div id="m22-sesiones-lista" class="m22-ses-lista"><p class="muted">Cargando sesiones…</p></div><p id="m22-sesiones-msg" class="m21-msg"></p>';
    var wrap = root.querySelector('.m21-wrap') || root;
    var firstCard = wrap.querySelector('.m21-card');
    if (firstCard && firstCard.parentNode) {
      firstCard.parentNode.insertBefore(panel, firstCard.nextSibling);
    } else {
      wrap.appendChild(panel);
    }
    return panel;
  }

  function setMsg(text, ok) {
    var el = document.getElementById('m22-sesiones-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'm21-msg ' + (ok ? 'ok' : 'error');
  }

  function renderLista(sesiones, cicloEstado) {
    var el = document.getElementById('m22-sesiones-lista');
    if (!el) return;
    if (!sesiones || !sesiones.length) {
      el.innerHTML = '<p class="muted">Sin sesiones en este turno.</p>';
      return;
    }
    var cicloActivo = cicloEstado === 'ACTIVO' || cicloEstado === 'EN_VALIDACION';
    el.innerHTML = sesiones.map(function (s) {
      var estado = String(s.estado || '');
      var trabajador = s.usuario_nombre || s.trabajador_nombre || s.responsable_nombre || '—';
      var apertura = s.apertura_real || s.iniciado_en || s.hora_apertura || null;
      var cierre = s.cierre_real || s.cerrado_en || s.hora_cierre || null;
      var actions = '';
      if (estado === 'PENDIENTE' && cicloActivo && can('ciclos', 'crear')) {
        actions = '<button type="button" class="cc-accion" data-m22-abrir="' + esc(s.id) + '">Abrir sesión</button>';
      } else if (estado === 'EN_CURSO' && can('ciclos', 'editar')) {
        actions = '<button type="button" class="cc-accion" data-m22-cerrar="' + esc(s.id) + '">Cerrar sesión</button>';
      } else if (estado === 'COMPLETADA') {
        actions = '<span class="muted">Finalizada</span>';
      }
      return (
        '<div class="m21-row">' +
        '<div><b>Día ' + esc(s.dia_n) + ' · ' + esc(labelBloque(s.bloque)) + '</b>' +
        '<small>' + esc(fmtFecha(s.fecha)) + ' · ' + esc(trabajador) + '</small>' +
        '<span class="m21-status">' + esc(labelEstado(estado)) +
        (apertura ? ' · abre ' + esc(fmtHora(apertura)) : '') +
        (cierre ? ' · cierra ' + esc(fmtHora(cierre)) : '') +
        '</span></div>' +
        '<div class="m21-actions">' + actions + '</div></div>'
      );
    }).join('');
  }

  async function refresh() {
    if (busy) return;
    var cicloId = cicloIdDesdeUi();
    if (!cicloId) return;
    var panel = ensurePanel();
    if (!panel) return;
    panel.dataset.cicloId = cicloId;
    busy = true;
    try {
      var sesiones = await listarSesiones(cicloId);
      var estado = 'ACTIVO';
      var root = document.getElementById('ciclos-m18-root');
      if (root && /Planificado/i.test(root.textContent || '')) estado = 'PLANIFICADO';
      if (root && /validaci/i.test(root.textContent || '')) estado = 'EN_VALIDACION';
      renderLista(sesiones, estado);
    } catch (e) {
      setMsg('No se pudieron cargar las sesiones: ' + String(e && (e.message || e.details) || e), false);
    } finally {
      busy = false;
    }
  }

  async function abrir(id, btn) {
    if (!can('ciclos', 'crear')) { setMsg('Sin permiso para abrir sesiones.', false); return; }
    if (btn) { btn.disabled = true; }
    try {
      await mutar(RPC_INICIAR, id, null);
      setMsg('✓ Sesión abierta. Ya podés trabajar y registrar ventas.', true);
      await syncVentas();
      await refresh();
    } catch (e) {
      setMsg('No se pudo abrir: ' + String(e && (e.message || e.details) || e), false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function cerrar(id, btn) {
    if (!can('ciclos', 'editar')) { setMsg('Sin permiso para cerrar sesiones.', false); return; }
    if (!window.confirm('¿Cerrar esta sesión de trabajo?')) return;
    if (btn) { btn.disabled = true; }
    try {
      await mutar(RPC_CERRAR, id, null);
      setMsg('✓ Sesión cerrada.', true);
      await syncVentas();
      await refresh();
    } catch (e) {
      setMsg('No se pudo cerrar: ' + String(e && (e.message || e.details) || e), false);
    } finally {
      if (btn) btn.disabled = false;
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
    });
  }

  function observe() {
    var root = document.getElementById('ciclos-m18-root');
    if (!root || root.dataset.m22Obs === '1') return;
    root.dataset.m22Obs = '1';
    var t = null;
    var obs = new MutationObserver(function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        trackCicloFromClicks();
        bind();
        refresh();
      }, 80);
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  function init() {
    trackCicloFromClicks();
    bind();
    observe();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
