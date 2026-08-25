// BattleCruiser M24.2-FE — reparación directa de selects Usuario / Almacén
// No crea estado paralelo. Usa las RPC existentes y repuebla solo los selects M24.
(function () {
  'use strict';
  if (window.__BC_M242__) return;
  window.__BC_M242__ = true;

  var busy = false;
  var lastUserSelection = '';
  var lastAlmSelection = '';

  function esc(v) {
    return typeof escHtml === 'function' ? escHtml(v == null ? '' : v) : String(v == null ? '' : v);
  }

  async function cargarUsuariosDirecto() {
    var r = await client.rpc('listar_usuarios_admin', {});
    if (r && r.error) throw r.error;
    var rows = Array.isArray(r && r.data) ? r.data : [];
    return rows.filter(function (u) { return u && u.activo !== false; });
  }

  async function cargarAlmacenesDirecto() {
    var r = await client.rpc('listar_almacenes_para_turnos', {});
    if (r && r.error) throw r.error;
    var rows = Array.isArray(r && r.data) ? r.data : [];
    return rows.filter(function (a) { return a && a.activo !== false; });
  }

  function guardarSeleccion() {
    var su = document.getElementById('m24-user');
    var sa = document.getElementById('m24-alm');
    if (su && su.value) lastUserSelection = su.value;
    if (sa && sa.value) lastAlmSelection = sa.value;
  }

  function setOptions(select, rows, valueField, labelField, placeholder) {
    if (!select) return;
    var old = select.value;
    var html = '<option value="">' + esc(placeholder) + '</option>';
    rows.forEach(function (row) {
      var value = row && row[valueField] != null ? row[valueField] : '';
      var label = row && row[labelField] != null ? row[labelField] : value;
      if (!value) return;
      html += '<option value="' + esc(value) + '">' + esc(label) + '</option>';
    });
    select.innerHTML = html;
    var wanted = old || (select.id === 'm24-user' ? lastUserSelection : lastAlmSelection);
    if (wanted && Array.prototype.some.call(select.options, function (o) { return String(o.value) === String(wanted); })) {
      select.value = String(wanted);
    } else if (select.options.length > 1) {
      select.selectedIndex = 1;
    }
  }

  async function hydrate() {
    if (busy) return;
    var su = document.getElementById('m24-user');
    var sa = document.getElementById('m24-alm');
    if (!su || !sa) return;
    if (typeof tienePermiso === 'function' && !tienePermiso('ciclos', 'editar_any')) return;

    busy = true;
    guardarSeleccion();
    try {
      var results = await Promise.all([cargarUsuariosDirecto(), cargarAlmacenesDirecto()]);
      setOptions(su, results[0], 'id', 'nombre', 'Selecciona un usuario');
      setOptions(sa, results[1], 'id', 'nombre', 'Selecciona un almacén');
      su.disabled = false;
      sa.disabled = false;
      su.removeAttribute('aria-busy');
      sa.removeAttribute('aria-busy');
      var msg = document.getElementById('m24-msg');
      if (msg && /cargando|vac[ií]o/i.test(msg.textContent || '')) msg.textContent = '';
    } catch (e) {
      console.warn('[M24.2] No se pudieron hidratar los selects:', e);
      su.innerHTML = '<option value="">No se pudieron cargar los usuarios</option>';
      sa.innerHTML = '<option value="">No se pudieron cargar los almacenes</option>';
    } finally {
      busy = false;
    }
  }

  function scheduleHydrate() {
    setTimeout(hydrate, 100);
  }

  document.addEventListener('change', function (e) {
    if (e.target && (e.target.id === 'm24-user' || e.target.id === 'm24-alm')) guardarSeleccion();
  });

  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('.tab-btn[data-tab="ciclos"]');
    if (tab) scheduleHydrate();
    var retry = e.target.closest && e.target.closest('#m24-guardar');
    if (retry) scheduleHydrate();
  });

  var observer = new MutationObserver(function (mutations) {
    var relevant = mutations.some(function (m) {
      return m.target && (m.target.id === 'm24-user' || m.target.id === 'm24-alm' ||
        (m.target.closest && m.target.closest('#m24-asig-panel')));
    });
    if (relevant) scheduleHydrate();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scheduleHydrate();
})();

// M27.4 — Restricción visual de Turnos para dependientes.
// Solo se muestran ciclos que tengan una sesión asignada al usuario para HOY.
(function () {
  'use strict';
  if (window.__BC_M274__) return;
  window.__BC_M274__ = true;

  function isAdmin() {
    return typeof tienePermiso === 'function' && tienePermiso('ciclos', 'editar_any');
  }

  function uid() {
    try {
      return (typeof _usuarioActual !== 'undefined' && _usuarioActual && _usuarioActual.id) || null;
    } catch (e) {
      return null;
    }
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function norm(v) { return String(v == null ? '' : v); }

  async function sesionesDelCiclo(cicloId) {
    var r = await client.rpc('listar_sesiones_operativas', {
      p_ciclo_id: cicloId,
      p_almacen_id: null,
      p_fecha: null,
      p_estado: null
    });
    if (r && r.error) throw r.error;
    var d = r ? r.data : [];
    return Array.isArray(d) ? d : (d ? [d] : []);
  }

  function cicloCard(btn) {
    if (!btn) return null;
    return btn.closest('.m21-card') || btn.closest('[data-m21-enter]')?.parentElement || null;
  }

  function asignadaHoy(s) {
    var me = uid();
    if (!me || !s) return false;
    var assigned = s.usuario_id || s.trabajador_id || s.responsable_id || null;
    return !!assigned && norm(assigned) === norm(me) && norm(s.fecha).slice(0, 10) === todayIso();
  }

  function ocultarFilasFuturas(card) {
    var list = card && card.querySelector('#m22-sesiones-lista');
    if (!list) return;
    var today = todayIso();
    list.querySelectorAll('.m21-row').forEach(function (row) {
      var text = row.textContent || '';
      var m = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
      if (!m) return;
      var raw = m[1];
      var iso = raw.indexOf('-') === 4 ? raw : raw.split('/').reverse().join('-');
      row.style.display = iso === today ? '' : 'none';
    });
  }

  async function aplicar() {
    if (isAdmin()) return;
    var me = uid();
    if (!me) return;
    var buttons = Array.from(document.querySelectorAll('[data-m21-enter]'));
    if (!buttons.length) return;

    await Promise.all(buttons.map(async function (btn) {
      var card = cicloCard(btn);
      var cicloId = btn.dataset.m21Enter;
      if (!card || !cicloId) return;
      try {
        var sesiones = await sesionesDelCiclo(cicloId);
        var visible = sesiones.some(asignadaHoy);
        card.style.display = visible ? '' : 'none';
        if (visible) ocultarFilasFuturas(card);
      } catch (e) {
        // Ante error no concedemos acceso visual a una dependiente.
        card.style.display = 'none';
      }
    }));
  }

  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      aplicar().catch(function (e) { console.warn('[M27.4] Restricción de Turnos', e); });
    }, 150);
  }

  function init() {
    schedule();
    var root = document.getElementById('ciclos-m18-root');
    if (!root || root.dataset.m274Obs === '1') return;
    root.dataset.m274Obs = '1';
    new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
