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
