// BattleCruiser M24-FE — Asignación operativa de Turnos
// Admin asigna · Dependienta ejecuta · Backend verifica
// M25.4: observer ignora #m22-sesiones-panel (rompe bucle M22↔M24).
(function () {
  'use strict';

  var PANEL_ID = 'm24-asig-panel';
  var M22_PANEL_ID = 'm22-sesiones-panel';
  var cacheAsig = [];
  var cacheUsers = [];
  var lastUserOpts = '';
  var lastAlmOpts = '';
  var savedSel = { user: '', alm: '', bloque: 'MANANA', activo: true };
  var refreshing = false;

  function can(s, a) {
    return typeof tienePermiso === 'function' && tienePermiso(s, a);
  }
  function isAdminAsig() {
    return can('ciclos', 'editar_any');
  }
  function esc(v) {
    return typeof escHtml === 'function' ? escHtml(v == null ? '' : v) : String(v == null ? '' : v);
  }
  function labelBloque(b) {
    var s = String(b || '').toUpperCase();
    if (s === 'MANANA' || s === 'MAÑANA') return 'Mañana';
    if (s === 'TARDE') return 'Tarde';
    return b || '—';
  }
  function normBloque(b) {
    var s = String(b || '').toUpperCase().replace('Ñ', 'N');
    if (s === 'MAÑANA' || s === 'MANANA') return 'MANANA';
    if (s === 'TARDE') return 'TARDE';
    return s;
  }

  async function rpc(name, params) {
    var r = await client.rpc(name, params || {});
    if (r && r.error) throw r.error;
    var d = r ? r.data : null;
    return Array.isArray(d) ? d : (d != null ? d : null);
  }

  async function listarAsignaciones(filtros) {
    filtros = filtros || {};
    var rows = await rpc('listar_asignaciones_operativas', {
      p_usuario_id: filtros.usuario_id || null,
      p_almacen_id: filtros.almacen_id || null,
      p_bloque: filtros.bloque || null
    });
    cacheAsig = Array.isArray(rows) ? rows : [];
    window.__BC_M24_ASIG__ = cacheAsig;
    return cacheAsig;
  }

  async function cargarUsuarios() {
    if (cacheUsers.length) return cacheUsers;
    try {
      var r = await client.rpc('listar_usuarios_admin', {});
      if (r && !r.error && Array.isArray(r.data)) {
        cacheUsers = r.data.filter(function (u) { return u && u.activo !== false; });
        return cacheUsers;
      }
    } catch (e) {
      console.warn('[M24] listar_usuarios_admin', e);
    }
    var map = {};
    cacheAsig.forEach(function (a) {
      if (a.usuario_id) {
        map[a.usuario_id] = {
          id: a.usuario_id,
          nombre: a.usuario_nombre || a.nombre_usuario || a.usuario_id,
          activo: true
        };
      }
    });
    cacheUsers = Object.keys(map).map(function (k) { return map[k]; });
    return cacheUsers;
  }

  function almacenesActivos() {
    var list = (typeof _cache !== 'undefined' && _cache && Array.isArray(_cache.almacenes))
      ? _cache.almacenes
      : [];
    return list.filter(function (a) { return a && a.activo !== false; });
  }

  async function ensureAlmacenes() {
    var a = almacenesActivos();
    if (a.length) return a;
    if (typeof asegurarAlmacenesParaTurnos === 'function') {
      try { await asegurarAlmacenesParaTurnos(); } catch (e) {}
    }
    return almacenesActivos();
  }

  function nombreAlmacen(id) {
    var a = almacenesActivos().find(function (x) { return x.id === id; });
    return a ? (a.nombre || id) : (id || '—');
  }

  function nombreUsuario(id) {
    var u = cacheUsers.find(function (x) { return x.id === id; });
    if (u) return u.nombre || id;
    var a = cacheAsig.find(function (x) { return x.usuario_id === id; });
    return (a && (a.usuario_nombre || a.nombre_usuario)) || id || '—';
  }

  function candidatosParaSesion(almacenId, bloque) {
    var b = normBloque(bloque);
    return cacheAsig.filter(function (a) {
      if (a.activo === false) return false;
      if (String(a.almacen_id) !== String(almacenId)) return false;
      if (normBloque(a.bloque) !== b) return false;
      return true;
    }).map(function (a) {
      return {
        id: a.usuario_id,
        nombre: a.usuario_nombre || a.nombre_usuario || nombreUsuario(a.usuario_id)
      };
    });
  }

  function captureForm() {
    var su = document.getElementById('m24-user');
    var sa = document.getElementById('m24-alm');
    var sb = document.getElementById('m24-bloque');
    var ac = document.getElementById('m24-activo');
    if (su && su.value) savedSel.user = su.value;
    if (sa && sa.value) savedSel.alm = sa.value;
    if (sb && sb.value) savedSel.bloque = normBloque(sb.value);
    if (ac) savedSel.activo = !!ac.checked;
  }

  function applySaved(selectEl, value) {
    if (!selectEl || value == null || value === '') return;
    var ok = Array.prototype.some.call(selectEl.options, function (o) {
      return String(o.value) === String(value);
    });
    if (ok) selectEl.value = String(value);
  }

  function ensurePanel() {
    if (!isAdminAsig()) return null;
    var root = document.getElementById('ciclos-m18-root');
    if (!root) return null;
    var existing = document.getElementById(PANEL_ID);
    if (existing) return existing;
    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'm21-card';
    panel.innerHTML =
      '<h4>Asignaciones operativas</h4>' +
      '<p class="muted">Autorizá trabajador · almacén · bloque (Mañana/Tarde). Requiere ciclos.editar_any.</p>' +
      '<div class="m24-form" style="display:grid;gap:8px;margin:12px 0">' +
      '<label>Usuario <select id="m24-user"></select></label>' +
      '<label>Almacén <select id="m24-alm"></select></label>' +
      '<label>Bloque <select id="m24-bloque"><option value="MANANA">Mañana</option><option value="TARDE">Tarde</option></select></label>' +
      '<label><input type="checkbox" id="m24-activo" checked> Activo</label>' +
      '<div class="m21-actions">' +
      '<button type="button" class="cc-accion" id="m24-guardar">Guardar asignación</button>' +
      '</div></div>' +
      '<div id="m24-lista" class="m22-ses-lista"><p class="muted">Cargando…</p></div>' +
      '<p id="m24-msg" class="m21-msg"></p>';
    var wrap = root.querySelector('.m21-wrap') || root;
    wrap.appendChild(panel);
    return panel;
  }

  function setMsg(t, ok) {
    var el = document.getElementById('m24-msg');
    if (!el) return;
    el.textContent = t || '';
    el.className = 'm21-msg ' + (ok ? 'ok' : 'error');
  }

  function fillSelects() {
    var su = document.getElementById('m24-user');
    var sa = document.getElementById('m24-alm');
    var sb = document.getElementById('m24-bloque');
    var ac = document.getElementById('m24-activo');
    if (!su || !sa) return;
    captureForm();
    var userHtml = cacheUsers.map(function (u) {
      return '<option value="' + esc(u.id) + '">' + esc(u.nombre || u.id) + '</option>';
    }).join('') || '<option value="">—</option>';
    var alms = almacenesActivos();
    var almHtml = alms.map(function (a) {
      return '<option value="' + esc(a.id) + '">' + esc(a.nombre || a.id) + '</option>';
    }).join('') || '<option value="">—</option>';
    if (userHtml !== lastUserOpts) {
      su.innerHTML = userHtml;
      lastUserOpts = userHtml;
    }
    if (almHtml !== lastAlmOpts) {
      sa.innerHTML = almHtml;
      lastAlmOpts = almHtml;
    }
    applySaved(su, savedSel.user);
    applySaved(sa, savedSel.alm);
    if (sb) applySaved(sb, savedSel.bloque || 'MANANA');
    if (ac) ac.checked = savedSel.activo !== false;
  }

  function renderLista() {
    var el = document.getElementById('m24-lista');
    if (!el) return;
    if (!cacheAsig.length) {
      el.innerHTML = '<p class="muted">Sin asignaciones operativas.</p>';
      return;
    }
    el.innerHTML = cacheAsig.map(function (a) {
      var activo = a.activo !== false;
      return (
        '<div class="m21-row">' +
        '<div><b>' + esc(a.usuario_nombre || a.nombre_usuario || nombreUsuario(a.usuario_id)) + '</b>' +
        '<small>' + esc(nombreAlmacen(a.almacen_id)) + ' · ' + esc(labelBloque(a.bloque)) +
        ' · ' + (activo ? 'Activo' : 'Inactivo') + '</small></div>' +
        '<div class="m21-actions">' +
        (activo
          ? '<button type="button" class="cc-accion" data-m24-revocar="' + esc(a.usuario_id) +
            '" data-alm="' + esc(a.almacen_id) + '" data-bloque="' + esc(normBloque(a.bloque)) +
            '">Revocar</button>'
          : '<span class="muted">Revocada</span>') +
        '</div></div>'
      );
    }).join('');
  }

  async function refreshPanel(opts) {
    opts = opts || {};
    if (refreshing) return;
    if (!isAdminAsig()) {
      var old = document.getElementById(PANEL_ID);
      if (old) old.remove();
      return;
    }
    var root = document.getElementById('ciclos-m18-root');
    if (!root) return;
    if (root.querySelector('[data-m21-declare], [data-m21-accept], [data-m21-final]')) return;

    refreshing = true;
    try {
      var panelExiste = !!document.getElementById(PANEL_ID);
      if (panelExiste && !opts.force) {
        captureForm();
        try { await listarAsignaciones({}); } catch (e) {}
        renderLista();
        applySaved(document.getElementById('m24-user'), savedSel.user);
        applySaved(document.getElementById('m24-alm'), savedSel.alm);
        applySaved(document.getElementById('m24-bloque'), savedSel.bloque);
        return;
      }

      await ensureAlmacenes();
      try { await listarAsignaciones({}); } catch (e) { console.warn('[M24] listar_asignaciones', e); }
      await cargarUsuarios();
      var panel = ensurePanel();
      if (!panel) return;
      fillSelects();
      renderLista();
    } finally {
      refreshing = false;
    }
  }

  async function guardar() {
    if (!isAdminAsig()) return;
    captureForm();
    var userId = savedSel.user || (document.getElementById('m24-user') || {}).value;
    var almId = savedSel.alm || (document.getElementById('m24-alm') || {}).value;
    var bloque = savedSel.bloque || (document.getElementById('m24-bloque') || {}).value || 'MANANA';
    var activo = savedSel.activo;
    if (!userId || !almId) {
      setMsg('Seleccioná usuario y almacén.', false);
      return;
    }
    try {
      await rpc('asignar_usuario_operativo', {
        p_usuario_id: userId,
        p_almacen_id: almId,
        p_bloque: normBloque(bloque),
        p_activo: activo
      });
      setMsg('✓ Asignación guardada.', true);
      await listarAsignaciones({});
      renderLista();
      applySaved(document.getElementById('m24-user'), userId);
      applySaved(document.getElementById('m24-alm'), almId);
      applySaved(document.getElementById('m24-bloque'), bloque);
    } catch (e) {
      setMsg('No se pudo guardar: ' + String(e && (e.message || e.details) || e), false);
    }
  }

  async function revocar(userId, almId, bloque) {
    if (!isAdminAsig()) return;
    if (!window.confirm('¿Revocar esta asignación operativa?')) return;
    captureForm();
    try {
      await rpc('revocar_usuario_operativo', {
        p_usuario_id: userId,
        p_almacen_id: almId,
        p_bloque: normBloque(bloque)
      });
      setMsg('✓ Asignación revocada.', true);
      await listarAsignaciones({});
      renderLista();
      applySaved(document.getElementById('m24-user'), savedSel.user);
      applySaved(document.getElementById('m24-alm'), savedSel.alm);
      applySaved(document.getElementById('m24-bloque'), savedSel.bloque);
    } catch (e) {
      setMsg('No se pudo revocar: ' + String(e && (e.message || e.details) || e), false);
    }
  }

  async function asignarSesion(sesionId, usuarioId) {
    if (!isAdminAsig()) throw new Error('Sin permiso administrativo.');
    await rpc('asignar_sesion_operativa', {
      p_sesion_id: sesionId,
      p_usuario_id: usuarioId
    });
  }

  function bind() {
    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'm24-guardar') {
        e.preventDefault();
        guardar();
        return;
      }
      var rev = e.target.closest && e.target.closest('[data-m24-revocar]');
      if (rev) {
        e.preventDefault();
        revocar(rev.dataset.m24Revocar, rev.dataset.alm, rev.dataset.bloque);
      }
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.id) return;
      if (t.id === 'm24-user') savedSel.user = t.value;
      if (t.id === 'm24-alm') savedSel.alm = t.value;
      if (t.id === 'm24-bloque') savedSel.bloque = normBloque(t.value);
      if (t.id === 'm24-activo') savedSel.activo = !!t.checked;
    });
  }

  function nodeInSelfOrM22(node) {
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentNode;
    if (!node || node.nodeType !== 1) return false;
    if (node.id === PANEL_ID || (node.closest && node.closest('#' + PANEL_ID))) return true;
    if (node.id === M22_PANEL_ID || (node.closest && node.closest('#' + M22_PANEL_ID))) return true;
    return false;
  }

  function observe() {
    var root = document.getElementById('ciclos-m18-root');
    if (!root || root.dataset.m24Obs === '1') return;
    root.dataset.m24Obs = '1';
    var t = null;
    var mountedOnce = false;
    new MutationObserver(function (mutations) {
      var onlyInternal = mutations.every(function (m) {
        return nodeInSelfOrM22(m.target);
      });
      if (onlyInternal) return;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        var exists = !!document.getElementById(PANEL_ID);
        if (exists && mountedOnce) return;
        refreshPanel({ force: !exists });
        if (document.getElementById(PANEL_ID)) mountedOnce = true;
      }, 200);
    }).observe(root, { childList: true, subtree: true });
  }

  window.__BC_M24__ = {
    isAdmin: isAdminAsig,
    listarAsignaciones: listarAsignaciones,
    candidatosParaSesion: candidatosParaSesion,
    asignarSesion: asignarSesion,
    getAsignaciones: function () { return cacheAsig.slice(); },
    cargarUsuarios: cargarUsuarios,
    labelBloque: labelBloque,
    normBloque: normBloque,
    nombreUsuario: nombreUsuario
  };

  function boot() {
    bind();
    observe();
    setTimeout(function () { refreshPanel({ force: true }); }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
