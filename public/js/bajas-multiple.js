// BattleCruiser — one atomic multi-product Baja request.
(function () {
  'use strict';
  if (window.__BC_BAJAS_MULTIPLE__ === '1.0') return;
  window.__BC_BAJAS_MULTIPLE__ = '1.0';
  const REASONS = ['Rotura','Hechado a perder','El Jefe lo cogió','Vencimiento','Daño o deterioro','Pérdida','Consumo interno','Otro'];
  let products = [], warehouses = [], sequence = 0, loading = false, submitting = false, pendingKey = null;
  function apiClient() { try { return window.client || (typeof client !== 'undefined' ? client : null); } catch (_) { return null; } }
  function canCreate() { return typeof window.tienePermiso === 'function' && window.tienePermiso('bajas','crear'); }
  function message(value, kind) {
    const el = document.getElementById('bc-bajas-message');
    if (!el) return;
    el.textContent = value || '';
    el.className = 'bc-bajas-message' + (kind ? ' is-' + kind : '');
  }
  function ensureUI() {
    const tab = document.getElementById('tab-operacion');
    if (!tab || !canCreate()) return null;
    let host = document.getElementById('bc-bajas-multiple-host');
    if (host) return host;
    host = document.createElement('section');
    host.id = 'bc-bajas-multiple-host';
    host.className = 'cc-bloque bc-bajas-multiple';
    host.innerHTML =
      '<h3>📉 Lista de bajas</h3>' +
      '<p class="bc-bajas-intro">Agrega varios productos de un mismo almacén y envía toda la lista en una sola operación. Las solicitudes normales quedan pendientes de revisión; el inventario y FIFO solo cambian cuando se aprueban.</p>' +
      '<form id="bc-bajas-multiple-form">' +
        '<label><span>Almacén</span><select id="bc-bajas-warehouse" required><option value="" disabled selected hidden>Seleccionar almacén…</option></select></label>' +
        '<div class="bc-bajas-lines" id="bc-bajas-lines"></div>' +
        '<div class="bc-bajas-actions"><button type="button" id="bc-baja-add">+ Añadir producto</button><button type="submit" id="bc-baja-submit">Enviar lista a revisión</button></div>' +
        '<p class="bc-bajas-message" id="bc-bajas-message" role="status" aria-live="polite"></p>' +
      '</form>';
    tab.insertBefore(host, tab.firstChild);
    const form = host.querySelector('#bc-bajas-multiple-form');
    host.querySelector('#bc-baja-add').addEventListener('click', addRow);
    form.addEventListener('submit', submit);
    form.addEventListener('input', () => { if (!submitting) pendingKey = null; });
    form.addEventListener('change', () => { if (!submitting) pendingKey = null; });
    addRow();
    return host;
  }
  function fillWarehouseSelect() {
    const select = document.getElementById('bc-bajas-warehouse');
    if (!select) return;
    const old = select.value;
    select.innerHTML = '<option value="" disabled selected hidden>Seleccionar almacén…</option>';
    warehouses.forEach(item => { const o = document.createElement('option'); o.value = item.id; o.textContent = item.nombre; select.appendChild(o); });
    if (warehouses.some(item => String(item.id) === String(old))) select.value = old;
  }
  function fillProductSelect(select) {
    if (!select) return;
    const old = select.value;
    select.innerHTML = '<option value="" disabled selected hidden>Seleccionar producto…</option>';
    products.forEach(item => { const o = document.createElement('option'); o.value = item.id; o.textContent = item.nombre; select.appendChild(o); });
    if (products.some(item => String(item.id) === String(old))) select.value = old;
  }
  function addRow() {
    const host = document.getElementById('bc-bajas-lines');
    if (!host || !products.length || submitting) return;
    const rowId = ++sequence;
    const row = document.createElement('div');
    row.className = 'bc-baja-line';
    row.innerHTML =
      '<label class="bc-baja-line-product"><span>Producto</span><select class="bc-baja-product" id="bc-baja-producto-' + rowId + '" required></select></label>' +
      '<label class="bc-baja-line-qty"><span>Cantidad</span><input class="bc-baja-quantity" type="number" min="0.0001" step="any" inputmode="decimal" placeholder="0" required></label>' +
      '<button type="button" class="bc-baja-line-remove" aria-label="Quitar producto">×</button>' +
      '<label class="bc-baja-line-reason"><span>Motivo</span><select class="bc-baja-reason" required><option value="" disabled selected hidden>Seleccionar motivo…</option></select></label>' +
      '<label class="bc-baja-line-other" hidden><span>Explica el motivo</span><input class="bc-baja-other" maxlength="180" placeholder="Describe el otro motivo"></label>';
    host.appendChild(row);
    fillProductSelect(row.querySelector('.bc-baja-product'));
    const reason = row.querySelector('.bc-baja-reason');
    REASONS.forEach(value => { const o = document.createElement('option'); o.value = value; o.textContent = value; reason.appendChild(o); });
    const otherWrap = row.querySelector('.bc-baja-line-other'), other = row.querySelector('.bc-baja-other');
    reason.addEventListener('change', () => { otherWrap.hidden = reason.value !== 'Otro'; other.required = reason.value === 'Otro'; });
    row.querySelector('.bc-baja-line-remove').addEventListener('click', () => {
      if (host.children.length > 1) row.remove();
      else { row.querySelector('.bc-baja-product').value=''; row.querySelector('.bc-baja-quantity').value=''; reason.value=''; other.value=''; otherWrap.hidden=true; other.required=false; }
      pendingKey = null;
    });
    pendingKey = null;
  }
  async function hasSession() {
    const api = apiClient();
    if (!api || !api.auth || !api.auth.getSession) return false;
    try { const r = await api.auth.getSession(); return !!(r && !r.error && r.data && r.data.session && r.data.session.user && r.data.session.access_token); }
    catch (_) { return false; }
  }
  async function loadCatalogs(force) {
    if (loading || !canCreate()) return;
    const host = ensureUI();
    if (!host || (!force && products.length && warehouses.length)) return;
    loading = true;
    const add = host.querySelector('#bc-baja-add'); if (add) add.disabled = true;
    message('Actualizando productos y almacenes autorizados…', '');
    try {
      const api = apiClient();
      if (!api || !await hasSession()) { message('Tu sesión no está activa. Vuelve a iniciar sesión para cargar los catálogos.', 'error'); return; }
      const result = await Promise.all([
        api.from('productos').select('id,nombre,activo,inventario_mixto,producto_padre_id').eq('activo', true).order('nombre', { ascending: true }),
        api.from('almacenes').select('id,nombre,activo').eq('activo', true).order('nombre', { ascending: true })
      ]);
      if (result[0].error) throw result[0].error;
      if (result[1].error) throw result[1].error;
      const raw = Array.isArray(result[0].data) ? result[0].data : [];
      const operational = typeof window.productosOperativos === 'function'
        ? window.productosOperativos(raw) : raw.filter(p => !p.inventario_mixto || p.producto_padre_id);
      products = operational.filter(p => p && p.id && p.nombre && p.activo !== false);
      warehouses = (Array.isArray(result[1].data) ? result[1].data : []).filter(a => a && a.id && a.activo !== false);
      fillWarehouseSelect();
      host.querySelectorAll('.bc-baja-product').forEach(fillProductSelect);
      if (!host.querySelector('.bc-baja-line')) addRow();
      message(products.length && warehouses.length ? 'Catálogos actualizados. Añade los productos que incluirá esta lista.'
        : 'No hay productos o almacenes activos disponibles.', products.length && warehouses.length ? 'success' : 'error');
    } catch (error) {
      message('No se pudieron cargar productos y almacenes: ' + String(error && (error.message || error) || 'Error desconocido'), 'error');
    } finally {
      loading = false;
      if (add) add.disabled = false;
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!canCreate()) return message('Tu usuario no tiene permiso para registrar Bajas.', 'error');
    const form = document.getElementById('bc-bajas-multiple-form');
    const warehouse = document.getElementById('bc-bajas-warehouse') && document.getElementById('bc-bajas-warehouse').value;
    const rows = Array.from(form ? form.querySelectorAll('.bc-baja-line') : []);
    if (!warehouse || !rows.length) return message('Selecciona un almacén y añade al menos un producto.', 'error');
    const lines = [];
    for (const row of rows) {
      const product = row.querySelector('.bc-baja-product').value;
      const quantity = Number(row.querySelector('.bc-baja-quantity').value);
      const reason = row.querySelector('.bc-baja-reason').value;
      const other = row.querySelector('.bc-baja-other').value.trim();
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || !reason || (reason === 'Otro' && !other)) {
        return message('Completa producto, cantidad y motivo en todas las líneas.', 'error');
      }
      lines.push({ almacen_id: warehouse, producto_id: product, cantidad: quantity, motivo: reason === 'Otro' ? 'Otro: ' + other : reason });
    }
    const api = apiClient();
    if (!api || !await hasSession()) return message('La sesión de Supabase no está activa. Vuelve a iniciar sesión; la lista se conserva.', 'error');
    pendingKey = pendingKey || (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : null);
    if (!pendingKey) return message('No se pudo generar una clave segura para evitar duplicados. Recarga la aplicación.', 'error');
    submitting = true;
    const submitButton = form.querySelector('#bc-baja-submit'), addButton = form.querySelector('#bc-baja-add');
    submitButton.disabled = true; submitButton.textContent = 'Enviando lista…'; addButton.disabled = true;
    message('Enviando la lista completa en una sola transacción…', '');
    try {
      const result = await api.rpc('crear_bajas_multiple', { p_lineas: lines, p_idempotency_key: pendingKey });
      if (result.error) throw result.error;
      const created = result.data && Array.isArray(result.data.bajas) ? result.data.bajas : [];
      const approved = created.length > 0 && created.every(item => item.estado === 'APROBADA');
      pendingKey = null; form.reset(); document.getElementById('bc-bajas-lines').innerHTML = ''; addRow();
      message(approved ? '✓ Lista registrada y aprobada. Stock y FIFO actualizados.'
        : '✓ Lista enviada a revisión administrativa. El stock no cambia hasta aprobar.', 'success');
      if (typeof window.refrescarAprobacionesAdmin === 'function') await window.refrescarAprobacionesAdmin();
    } catch (error) {
      const detail = String(error && (error.message || error.details || error) || 'Error desconocido');
      const authFailure = Number(error && error.status) === 401 || /permission denied for function crear_bajas_multiple|jwt.*(expired|invalid)|no hay sesión/i.test(detail);
      message(authFailure ? 'La sesión perdió la autorización antes de enviar. Inicia sesión nuevamente y reintenta; la lista se conserva sin duplicarse.'
        : 'No se pudo registrar la lista: ' + detail, 'error');
    } finally {
      submitting = false; submitButton.disabled = false; submitButton.textContent = 'Enviar lista a revisión'; addButton.disabled = false;
    }
  }
  function start(force) {
    if (!canCreate() || !ensureUI()) return;
    loadCatalogs(!!force);
  }
  document.addEventListener('DOMContentLoaded', () => window.setTimeout(() => start(false), 1300));
  document.addEventListener('click', event => {
    const tab = event.target.closest && event.target.closest('[data-tab]');
    if (tab && tab.dataset.tab === 'operacion') window.setTimeout(() => start(true), 200);
  });
  try {
    const api = apiClient();
    if (api && api.auth && api.auth.onAuthStateChange) {
      api.auth.onAuthStateChange((event, session) => {
        if (session && ['SIGNED_IN','INITIAL_SESSION'].includes(event)) window.setTimeout(() => start(false), 0);
      });
    }
  } catch (_) { /* tab activation provides a safe retry */ }
  window.refrescarBajasMultiple = () => loadCatalogs(true);
})();