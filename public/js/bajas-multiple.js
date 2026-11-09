// BattleCruiser — one atomic multi-product Baja request.
(function () {
  'use strict';
  if (window.__BC_BAJAS_MULTIPLE__ === '1.1') return;
  window.__BC_BAJAS_MULTIPLE__ = '1.1';
  const REASONS = ['Rotura','Hechado a perder','El Jefe lo cogió','Vencimiento','Daño o deterioro','Pérdida','Consumo interno','Otro'];
  let products = [], warehouses = [], sequence = 0, loading = false, submitting = false, pendingKey = null, catalogLoadPromise = null;
  function apiClient() { try { return window.client || (typeof client !== 'undefined' ? client : null); } catch (_) { return null; } }
  function canCreate() { return typeof window.tienePermiso === 'function' && window.tienePermiso('bajas','crear'); }
  function refreshPicker(root) { if (typeof window.__BC_PRODUCT_PICKER_REFRESH__ === 'function') window.__BC_PRODUCT_PICKER_REFRESH__(root || document.body); }
  function message(value, kind) {
    const el = document.getElementById('bc-bajas-message');
    if (!el) return;
    el.textContent = value || '';
    el.className = 'bc-bajas-message' + (kind ? ' is-' + kind : '');
  }
  function ensureModal() {
    let modal = document.getElementById('bc-bajas-multiple-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'bc-bajas-multiple-modal';
    modal.className = 'bc-bajas-multiple-modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="bc-bajas-modal-backdrop" data-bc-bajas-close></div>' +
      '<section class="bc-bajas-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="bc-bajas-modal-title" tabindex="-1">' +
        '<header class="bc-bajas-modal-head"><div><h2 id="bc-bajas-modal-title">📉 Lista de bajas</h2><p>Varios productos, un solo envío y una sola revisión.</p></div>' +
        '<button type="button" class="bc-bajas-modal-close" data-bc-bajas-close aria-label="Cerrar">×</button></header>' +
        '<div class="bc-bajas-modal-content"></div>' +
      '</section>';
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-bc-bajas-close]')) closeListModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) closeListModal();
    });
    return modal;
  }
  function closeListModal() {
    const modal = document.getElementById('bc-bajas-multiple-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('bc-bajas-modal-open');
  }
  function ensureUI() {
    if (!canCreate()) return null;
    const modal = ensureModal();
    let host = document.getElementById('bc-bajas-multiple-host');
    if (host) return host;
    host = document.createElement('section');
    host.id = 'bc-bajas-multiple-host';
    host.className = 'bc-bajas-multiple';
    host.innerHTML =
      '<p class="bc-bajas-intro">Selecciona un almacén y añade los productos que correspondan. Cada línea lleva su cantidad y motivo; toda la lista se envía en una única operación. Las solicitudes de usuarios sin permiso global de aprobación quedan pendientes y no modifican el stock/FIFO hasta ser aprobadas.</p>' +
      '<form id="bc-bajas-multiple-form">' +
        '<label><span>Almacén</span><select id="bc-bajas-warehouse" required><option value="" disabled selected hidden>Seleccionar almacén…</option></select></label>' +
        '<div class="bc-bajas-lines" id="bc-bajas-lines"></div>' +
        '<div class="bc-bajas-actions"><button type="button" id="bc-baja-add">+ Añadir producto</button><button type="submit" id="bc-baja-submit">Enviar lista a revisión</button></div>' +
        '<p class="bc-bajas-message" id="bc-bajas-message" role="status" aria-live="polite"></p>' +
      '</form>';
    modal.querySelector('.bc-bajas-modal-content').appendChild(host);
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
    warehouses.forEach(item => { const option = document.createElement('option'); option.value=item.id; option.textContent=item.nombre; select.appendChild(option); });
    if (warehouses.some(item => String(item.id) === String(old))) select.value = old;
    refreshPicker(select);
  }
  function fillProductSelect(select) {
    if (!select) return;
    const old = select.value;
    select.innerHTML = '<option value="" disabled selected hidden>Seleccionar producto…</option>';
    products.forEach(item => { const option = document.createElement('option'); option.value=item.id; option.textContent=item.nombre; select.appendChild(option); });
    if (products.some(item => String(item.id) === String(old))) select.value = old;
    refreshPicker(select);
  }
  function addRow() {
    const host = document.getElementById('bc-bajas-lines');
    if (!host || submitting) return;
    const rowId = ++sequence;
    const row = document.createElement('div');
    row.className = 'bc-baja-line';
    row.innerHTML =
      '<label class="bc-baja-line-product"><span>Producto</span><select class="bc-baja-product" id="bc-baja-producto-' + rowId + '" required><option value="" disabled selected hidden>Seleccionar producto…</option></select></label>' +
      '<label class="bc-baja-line-qty"><span>Cantidad</span><input class="bc-baja-quantity" type="number" min="0.0001" step="any" inputmode="decimal" placeholder="0" required></label>' +
      '<button type="button" class="bc-baja-line-remove" aria-label="Quitar producto">×</button>' +
      '<label class="bc-baja-line-reason"><span>Motivo</span><select class="bc-baja-reason" required><option value="" disabled selected hidden>Seleccionar motivo…</option></select></label>' +
      '<label class="bc-baja-line-other" hidden><span>Explica el motivo</span><input class="bc-baja-other" maxlength="180" placeholder="Describe el otro motivo"></label>';
    host.appendChild(row);
    fillProductSelect(row.querySelector('.bc-baja-product'));
    refreshPicker(row);
    const reason = row.querySelector('.bc-baja-reason');
    REASONS.forEach(value => { const o = document.createElement('option'); o.value=value; o.textContent=value; reason.appendChild(o); });
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
    if (!api || !api.auth || typeof api.auth.getSession !== 'function') return false;
    try {
      const result = await api.auth.getSession();
      if (!result || result.error || !result.data || !result.data.session ||
          !result.data.session.user || !result.data.session.access_token) return false;
      const expiry = Number(result.data.session.expires_at || 0) * 1000;
      if (expiry && expiry < Date.now() + 30000 && typeof api.auth.refreshSession === 'function') {
        const refreshed = await api.auth.refreshSession();
        return !!(refreshed && !refreshed.error && refreshed.data && refreshed.data.session &&
          refreshed.data.session.user && refreshed.data.session.access_token);
      }
      return true;
    } catch (_) { return false; }
  }
  async function loadCatalogs(force) {
    if (!canCreate()) return false;
    if (catalogLoadPromise) return catalogLoadPromise;
    const host = ensureUI();
    if (!host) return false;
    if (!force && products.length && warehouses.length) return true;
    loading = true;
    const add = host.querySelector('#bc-baja-add');
    if (add) add.disabled = true;
    message('Actualizando productos y almacenes autorizados…', '');
    const request = (async function () {
      try {
        const api = apiClient();
        if (!api || !await hasSession()) {
          message('Tu sesión no está activa. Vuelve a iniciar sesión para cargar los catálogos.', 'error');
          return false;
        }
        const results = await Promise.all([
          api.from('productos').select('id,nombre,activo,inventario_mixto,producto_padre_id').eq('activo', true).order('nombre', { ascending: true }),
          api.from('almacenes').select('id,nombre,activo').eq('activo', true).order('nombre', { ascending: true })
        ]);
        if (results[0].error) throw results[0].error;
        if (results[1].error) throw results[1].error;
        const raw = Array.isArray(results[0].data) ? results[0].data : [];
        let operational = raw;
        if (typeof window.productosOperativos === 'function') {
          const candidate = window.productosOperativos(raw);
          if (Array.isArray(candidate)) operational = candidate;
        } else operational = raw.filter(product => !product.inventario_mixto || !!product.producto_padre_id);
        products = operational.filter(product => product && product.id && product.nombre && product.activo !== false);
        warehouses = (Array.isArray(results[1].data) ? results[1].data : []).filter(item => item && item.id && item.activo !== false);
        fillWarehouseSelect();
        host.querySelectorAll('.bc-baja-product').forEach(fillProductSelect);
        if (!host.querySelector('.bc-baja-line')) addRow();
        refreshPicker(host);
        if (products.length && warehouses.length) {
          message(products.length + ' productos y ' + warehouses.length + ' almacenes disponibles. Añade los productos de esta lista.', 'success');
          return true;
        }
        message('No hay productos o almacenes activos disponibles para registrar la Baja.', 'error');
        return false;
      } catch (error) {
        message('No se pudieron cargar productos y almacenes: ' + String(error && (error.message || error) || 'Error desconocido'), 'error');
        return false;
      } finally { loading = false; if (add) add.disabled = false; }
    })();
    catalogLoadPromise = request.finally(function () { catalogLoadPromise = null; });
    return catalogLoadPromise;
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
    if (!api || !await hasSession()) {
      return message('La sesión de Supabase no está activa. Vuelve a iniciar sesión; la lista se conserva.', 'error');
    }
    pendingKey = pendingKey || (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : null);
    if (!pendingKey) return message('No se pudo generar una clave segura para evitar duplicados. Recarga la aplicación.', 'error');
    submitting = true;
    const submitButton = form.querySelector('#bc-baja-submit'), addButton = form.querySelector('#bc-baja-add');
    submitButton.disabled = true; submitButton.textContent = 'Enviando lista…'; addButton.disabled = true;
    message('Enviando la lista completa en una sola transacción…', '');
    try {
      // A 401 after the preflight session check means the access token may
      // have expired between the session read and the RPC. Refresh once and
      // retry with the exact same idempotency key; never create a second list.
      const params = { p_lineas: lines, p_idempotency_key: pendingKey };
      let result = await api.rpc('crear_bajas_multiple', params);
      const tokenRejected = result && result.error && (
        Number(result.error.status) === 401 ||
        /jwt.*(expired|invalid)|missing.*authorization|no authorization header/i.test(
          String(result.error.message || result.error.details || '')
        )
      );
      if (tokenRejected && api.auth && typeof api.auth.refreshSession === 'function') {
        const refreshed = await api.auth.refreshSession();
        const freshSession = refreshed && !refreshed.error && refreshed.data && refreshed.data.session;
        if (freshSession && freshSession.user && freshSession.access_token) {
          result = await api.rpc('crear_bajas_multiple', params);
        }
      }
      if (result.error) throw result.error;
      const created = result.data && Array.isArray(result.data.bajas) ? result.data.bajas : [];
      const approved = created.length > 0 && created.every(item => item.estado === 'APROBADA');
      pendingKey = null;
      form.reset();
      document.getElementById('bc-bajas-lines').innerHTML = '';
      addRow();
      message(approved ? '✓ Lista registrada y aprobada. Stock y FIFO actualizados.'
        : '✓ Lista enviada a revisión administrativa. El stock no cambia hasta aprobar.', 'success');
      if (typeof window.refrescarAprobacionesAdmin === 'function') await window.refrescarAprobacionesAdmin();
    } catch (error) {
      const detail = String(error && (error.message || error.details || error) || 'Error desconocido');
      const authFailure = Number(error && error.status) === 401 ||
        /permission denied for function crear_bajas_multiple|jwt.*(expired|invalid)|no hay sesión/i.test(detail);
      message(authFailure ? 'La sesión perdió la autorización antes de enviar. Inicia sesión nuevamente y reintenta; la lista se conserva sin duplicarse.'
        : 'No se pudo registrar la lista: ' + detail, 'error');
    } finally {
      submitting = false;
      submitButton.disabled = false; submitButton.textContent = 'Enviar lista a revisión';
      addButton.disabled = false;
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
    if (api && api.auth && typeof api.auth.onAuthStateChange === 'function') {
      api.auth.onAuthStateChange((event, session) => {
        if (session && ['SIGNED_IN','INITIAL_SESSION','TOKEN_REFRESHED'].includes(event)) window.setTimeout(() => start(false), 0);
      });
    }
  } catch (_) { /* activating the Operations tab retries catalog loading */ }
  window.abrirBajasMultiple = async function () {
    if (!canCreate()) return false;
    const host = ensureUI();
    if (!host) return false;
    const modal = ensureModal();
    modal.hidden = false;
    document.body.classList.add('bc-bajas-modal-open');
    await loadCatalogs(true);
    const warehouse = document.getElementById('bc-bajas-warehouse');
    if (warehouse) warehouse.focus({ preventScroll: true });
    return true;
  };
  window.refrescarBajasMultiple = () => loadCatalogs(true);
  window.setTimeout(() => start(false), 1300);
})();