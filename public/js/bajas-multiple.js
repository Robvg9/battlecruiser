// BattleCruiser — one atomic multi-product Baja request.
(function () {
  'use strict';
  if (window.__BC_BAJAS_MULTIPLE__ === '1.6') return;
  window.__BC_BAJAS_MULTIPLE__ = '1.6';
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
  const PENDING_REQUEST_PREFIX = 'bc:bajas:pending:v1:';
  function createSecureUuid() {
    const cryptoApi = window.crypto;
    if (!cryptoApi) throw new Error('Este navegador no ofrece generación segura de claves.');
    if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    if (typeof cryptoApi.getRandomValues !== 'function') throw new Error('No se pudo generar una clave segura para esta solicitud.');
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }
  async function persistentRequestKey(warehouse, lines) {
    let storage;
    try {
      storage = window.localStorage;
      const probe = PENDING_REQUEST_PREFIX + 'probe';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
    } catch (_) {
      throw new Error('El navegador bloqueó el almacenamiento local de seguridad. No se envió la lista para evitar duplicados.');
    }
    const canonical = JSON.stringify({
      warehouse: String(warehouse),
      lines: lines.map(line => ({
        almacen_id: String(line.almacen_id),
        producto_id: String(line.producto_id),
        cantidad: Number(line.cantidad),
        motivo: String(line.motivo),
        motivo_general: String(line.motivo_general || '')
      }))
    });
    let fingerprint;
    try {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
      fingerprint = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      throw new Error('No se pudo calcular la huella segura de la lista. No se envió.');
    }
    const storageKey = PENDING_REQUEST_PREFIX + fingerprint;
    let saved = null;
    try { saved = JSON.parse(storage.getItem(storageKey) || 'null'); } catch (_) { saved = null; }
    const key = saved && typeof saved.key === 'string' ? saved.key : createSecureUuid();
    if (!saved || saved.key !== key) {
      try { storage.setItem(storageKey, JSON.stringify({ key, createdAt: Date.now() })); }
      catch (_) { throw new Error('No se pudo guardar la clave anti-duplicados. No se envió la lista.'); }
    }
    try {
      const entries = [];
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (!name || !name.startsWith(PENDING_REQUEST_PREFIX) || name === storageKey) continue;
        let value = null;
        try { value = JSON.parse(storage.getItem(name) || 'null'); } catch (_) {}
        entries.push({ name, createdAt: Number(value && value.createdAt || 0) });
      }
      entries.sort((a, b) => a.createdAt - b.createdAt);
      while (entries.length >= 20) storage.removeItem(entries.shift().name);
    } catch (_) {}
    return { key, storage, storageKey };
  }
  function updateModalViewportHeight(modal) {
    const viewport = window.visualViewport;
    const height = viewport && Number(viewport.height) > 0 ? viewport.height : window.innerHeight;
    if (modal && modal.style && Number(height) > 0) modal.style.setProperty('--bc-bajas-vv-height', Math.round(height) + 'px');
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
    const syncViewport = () => updateModalViewportHeight(modal);
    syncViewport();
    window.addEventListener('resize', syncViewport, { passive: true });
    window.addEventListener('orientationchange', syncViewport, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewport, { passive: true });
      window.visualViewport.addEventListener('scroll', syncViewport, { passive: true });
    }
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
        '<div class="bc-bajas-context-fields">' +
          '<label><span>Almacén</span><select id="bc-bajas-warehouse" required><option value="" disabled selected hidden>Seleccionar almacén…</option></select></label>' +
          '<label><span>Motivo general de la lista</span><select id="bc-bajas-default-reason" required><option value="" disabled selected hidden>Seleccionar motivo…</option></select></label>' +
          '<label id="bc-bajas-default-other-wrap" hidden><span>Explica el motivo general</span><input id="bc-bajas-default-other" maxlength="180" placeholder="Describe el motivo"></label>' +
        '</div>' +
        '<div class="bc-bajas-list-heading"><strong>PRODUCTOS A DAR DE BAJA</strong><span id="bc-bajas-line-count">0 productos</span></div>' +
        '<div class="bc-bajas-lines" id="bc-bajas-lines"></div>' +
        '<div class="bc-bajas-actions"><button type="button" id="bc-baja-add">+ Añadir producto</button><button type="submit" id="bc-baja-submit">Enviar lista a revisión</button></div>' +
        '<p class="bc-bajas-message" id="bc-bajas-message" role="status" aria-live="polite"></p>' +
      '</form>';
    modal.querySelector('.bc-bajas-modal-content').appendChild(host);
    const form = host.querySelector('#bc-bajas-multiple-form');
    host.querySelector('#bc-baja-add').addEventListener('click', addRow);
    const defaultReason = host.querySelector('#bc-bajas-default-reason');
    REASONS.forEach(value => { const option=document.createElement('option'); option.value=value; option.textContent=value; defaultReason.appendChild(option); });
    defaultReason.addEventListener('change', () => {
      const wrap=host.querySelector('#bc-bajas-default-other-wrap'), input=host.querySelector('#bc-bajas-default-other');
      wrap.hidden=defaultReason.value!=='Otro'; input.required=defaultReason.value==='Otro';
      pendingKey=null;
    });
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
    row.dataset.reasonOverride='false';
    row.innerHTML =
      '<label class="bc-baja-line-product"><span>Producto</span><select class="bc-baja-product" id="bc-baja-producto-' + rowId + '" required><option value="" disabled selected hidden>Seleccionar producto…</option></select></label>' +
      '<label class="bc-baja-line-qty"><span>Cantidad</span><input class="bc-baja-quantity" type="number" min="0.0001" step="any" inputmode="decimal" placeholder="0" required></label>' +
      '<button type="button" class="bc-baja-line-remove" aria-label="Quitar producto">×</button>' +
      '<button type="button" class="bc-baja-line-reason-toggle">Motivo distinto</button>' +
      '<label class="bc-baja-line-reason" hidden><span>Motivo solo para este producto</span><select class="bc-baja-reason"><option value="" selected>Usar motivo general</option></select></label>' +
      '<label class="bc-baja-line-other" hidden><span>Explica este motivo</span><input class="bc-baja-other" maxlength="180" placeholder="Describe el motivo"></label>';
    host.appendChild(row);
    fillProductSelect(row.querySelector('.bc-baja-product'));
    refreshPicker(row);
    const reason = row.querySelector('.bc-baja-reason');
    REASONS.forEach(value => { const o = document.createElement('option'); o.value=value; o.textContent=value; reason.appendChild(o); });
    const otherWrap = row.querySelector('.bc-baja-line-other'), other = row.querySelector('.bc-baja-other');
    const reasonWrap = row.querySelector('.bc-baja-line-reason');
    row.querySelector('.bc-baja-line-reason-toggle').addEventListener('click', event => {
      const enabled = row.dataset.reasonOverride !== 'true';
      row.dataset.reasonOverride = enabled ? 'true' : 'false';
      reasonWrap.hidden = !enabled;
      event.currentTarget.textContent = enabled ? 'Usar motivo general' : 'Motivo distinto';
      if (!enabled) { reason.value=''; other.value=''; otherWrap.hidden=true; other.required=false; }
      pendingKey=null;
      updateLineCount();
    });
    reason.addEventListener('change', () => { otherWrap.hidden = reason.value !== 'Otro'; other.required = reason.value === 'Otro'; });
    row.querySelector('.bc-baja-line-remove').addEventListener('click', () => {
      if (host.children.length > 1) row.remove();
      else { row.querySelector('.bc-baja-product').value=''; row.querySelector('.bc-baja-quantity').value=''; reason.value=''; other.value=''; otherWrap.hidden=true; other.required=false; }
      pendingKey = null;
      updateLineCount();
    });
    pendingKey = null;
    updateLineCount();
  }
  function updateLineCount() {
    const host=document.getElementById('bc-bajas-lines'), count=document.getElementById('bc-bajas-line-count');
    if (count) { const n=host ? host.children.length : 0; count.textContent=n+' '+(n===1?'producto':'productos'); }
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
        if (!api) {
          message('No se pudo inicializar Supabase. Recarga la aplicación e inténtalo de nuevo.', 'error');
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
    // Lock synchronously, before hashing or touching localStorage. This closes
    // the Android double-tap window that previously allowed two different keys.
    if (submitting) return;
    if (!canCreate()) return message('Tu usuario no tiene permiso para registrar Bajas.', 'error');
    const form = document.getElementById('bc-bajas-multiple-form');
    const warehouse = document.getElementById('bc-bajas-warehouse') && document.getElementById('bc-bajas-warehouse').value;
    const rows = Array.from(form ? form.querySelectorAll('.bc-baja-line') : []);
    if (!warehouse || !rows.length) return message('Selecciona un almacén y añade al menos un producto.', 'error');
    const defaultReason = document.getElementById('bc-bajas-default-reason')?.value || '';
    const defaultOther = document.getElementById('bc-bajas-default-other')?.value.trim() || '';
    if (!defaultReason || (defaultReason === 'Otro' && !defaultOther)) {
      return message('Selecciona el motivo general de la lista (y descríbelo si es Otro).', 'error');
    }
    const generalReason = defaultReason === 'Otro' ? 'Otro: ' + defaultOther : defaultReason;
    const lines = [];
    for (const row of rows) {
      const product = row.querySelector('.bc-baja-product').value;
      const quantity = Number(row.querySelector('.bc-baja-quantity').value);
      const customReason = row.dataset.reasonOverride === 'true';
      const reason = customReason ? row.querySelector('.bc-baja-reason').value : defaultReason;
      const other = customReason ? row.querySelector('.bc-baja-other').value.trim() : defaultOther;
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || !reason || (reason === 'Otro' && !other)) {
        return message('Completa producto y cantidad; revisa el motivo general o el motivo particular marcado.', 'error');
      }
      lines.push({
        almacen_id: warehouse,
        producto_id: product,
        cantidad: quantity,
        motivo: reason === 'Otro' ? 'Otro: ' + other : reason,
        motivo_general: generalReason
      });
    }
    const api = apiClient();
    if (!api || !api.auth || typeof api.rpc !== 'function') {
      return message('No se pudo inicializar la sesión de Supabase. Recarga la aplicación; la lista se conserva.', 'error');
    }

    const submitButton = form.querySelector('#bc-baja-submit');
    if (!submitButton) return message('No se encontró el botón de envío. La lista se conserva.', 'error');
    const controlStates = Array.from(form.querySelectorAll('button,input,select,textarea')).map(control => ({
      control, disabled: control.disabled
    }));
    const originalSubmitText = submitButton.textContent || 'Enviar lista a revisión';
    submitting = true;
    controlStates.forEach(state => { state.control.disabled = true; });
    submitButton.textContent = 'Protegiendo lista…';
    message('Protegiendo el envío para evitar solicitudes duplicadas…', '');

    let requestKey;
    try {
      requestKey = await persistentRequestKey(warehouse, lines);
      pendingKey = requestKey.key;
    } catch (error) {
      submitting = false;
      controlStates.forEach(state => {
        if (state.control && state.control.isConnected) state.control.disabled = state.disabled;
      });
      submitButton.textContent = originalSubmitText;
      return message(String(error && (error.message || error) || 'No se pudo preparar la clave anti-duplicados.'), 'error');
    }

    submitButton.textContent = 'Enviando lista…';
    message('Enviando la lista completa en una sola transacción…', '');

    const requestIdempotencyKey = pendingKey;
    const callRpc = () => api.rpc('crear_bajas_multiple', {
      p_lineas: lines,
      p_idempotency_key: requestIdempotencyKey
    });
    const sendWithTimeout = () => typeof window.withNetworkTimeout === 'function'
      ? window.withNetworkTimeout(callRpc, 20000, 'crear_bajas_multiple')
      : callRpc();
    let succeeded = false;
    try {
      let result = await sendWithTimeout();
      const tokenRejected = result && result.error && (
        Number(result.error.status) === 401 ||
        /jwt.*(expired|invalid)|missing.*authorization|no authorization header|permission denied for function crear_bajas_multiple/i.test(
          String(result.error.message || result.error.details || '')
        )
      );
      if (tokenRejected && api.auth && typeof api.auth.refreshSession === 'function') {
        const refreshed = await api.auth.refreshSession().catch(refreshError => ({ error: refreshError }));
        const freshSession = refreshed && !refreshed.error && refreshed.data && refreshed.data.session;
        if (freshSession && freshSession.user && freshSession.access_token) {
          // Reuse the exact same request and idempotency key after token refresh.
          result = await sendWithTimeout();
        }
      }
      if (result && result.error) throw result.error;
      const created = result && result.data && Array.isArray(result.data.bajas) ? result.data.bajas : [];
      if (created.length !== lines.length || created.some(item => !item || !item.id)) {
        throw new Error('La respuesta no confirmó todas las líneas de la lista. La clave se conserva; reintenta esta misma lista sin cambiarla.');
      }
      try { requestKey.storage.removeItem(requestKey.storageKey); } catch (_) {}
      pendingKey = null;
      form.reset();
      const defaultReasonEl = document.getElementById('bc-bajas-default-reason');
      if (defaultReasonEl) defaultReasonEl.value = '';
      const defaultOtherWrap = document.getElementById('bc-bajas-default-other-wrap');
      if (defaultOtherWrap) defaultOtherWrap.hidden = true;
      const defaultOtherEl = document.getElementById('bc-bajas-default-other');
      if (defaultOtherEl) { defaultOtherEl.value = ''; defaultOtherEl.required = false; }
      document.getElementById('bc-bajas-lines').innerHTML = '';
      const approved = created.every(item => item.estado === 'APROBADA');
      message(approved ? '✓ Lista registrada como una sola solicitud y aprobada. Stock y FIFO actualizados.'
        : '✓ Lista enviada como una sola solicitud a revisión administrativa. El stock no cambia hasta aprobar.', 'success');
      succeeded = true;
      if (typeof window.refrescarAprobacionesAdmin === 'function') {
        try { await window.refrescarAprobacionesAdmin(); }
        catch (refreshError) {
          message(approved
            ? '✓ Lista registrada y aprobada. No se pudo actualizar el panel de revisión; recárgalo aparte.'
            : '✓ Lista enviada a revisión. La solicitud sí se registró; no se pudo actualizar el panel de revisión.',
            'success');
          try { console.warn('[BattleCruiser] Bajas confirmada; falló el refresco del panel:', refreshError); } catch (_) {}
        }
      }
    } catch (error) {
      const detail = String(error && (error.message || error.details || error) || 'Error desconocido');
      const authFailure = Number(error && error.status) === 401 ||
        /permission denied for function crear_bajas_multiple|jwt.*(expired|invalid)|no hay sesión/i.test(detail);
      message(authFailure
        ? 'La sesión no autorizó el envío. Vuelve a iniciar sesión; la lista y su clave anti-duplicados se conservan.'
        : 'No se confirmó la respuesta del servidor: ' + detail + '. La lista y su clave quedan guardadas; reintenta sin cambiarla para no duplicar.',
        'error');
    } finally {
      submitting = false;
      controlStates.forEach(state => {
        if (state.control && state.control.isConnected) state.control.disabled = state.disabled;
      });
      submitButton.textContent = originalSubmitText;
      if (succeeded) addRow();
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
    updateModalViewportHeight(modal);
    const dialog = modal.querySelector('.bc-bajas-modal-dialog');
    if (dialog) dialog.focus({ preventScroll: true });
    return true;
  };
  window.refrescarBajasMultiple = () => loadCatalogs(true);
  window.setTimeout(() => start(false), 1300);
})();