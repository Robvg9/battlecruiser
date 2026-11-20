// BattleCruiser — one atomic multi-product Baja request.
(function () {
  'use strict';
  if (window.__BC_BAJAS_MULTIPLE__ === '1.7') return;
  window.__BC_BAJAS_MULTIPLE__ = '1.7';
  const REASONS = ['Rotura','Hechado a perder','El Jefe lo cogió','Vencimiento','Daño o deterioro','Pérdida','Consumo interno','Otro'];
  let products = [], warehouses = [], draftLines = [], loading = false, submitting = false, pendingKey = null, catalogLoadPromise = null;
  let selectedProductIds = Object.create(null), bajaStep = 1;
  function apiClient() { try { return window.client || (typeof client !== 'undefined' ? client : null); } catch (_) { return null; } }
  function canCreate() { return typeof window.tienePermiso === 'function' && window.tienePermiso('bajas','crear'); }
  function refreshPicker(root) { if (typeof window.__BC_PRODUCT_PICKER_REFRESH__ === 'function') window.__BC_PRODUCT_PICKER_REFRESH__(root || document.body); }
  function escapeMarkup(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[character]);
  }
  function quantityLabel(value) {
    return Number(value).toLocaleString('es-ES', { maximumFractionDigits: 4 });
  }
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
      '<p class="bc-bajas-intro">Selecciona primero los productos y después indica cantidades y motivos. La lista completa se envía en una sola operación. Las solicitudes pendientes no modifican stock/FIFO hasta ser aprobadas.</p>' +
      '<form id="bc-bajas-multiple-form">' +
        '<div class="bc-bajas-context-fields">' +
          '<label><span>Almacén</span><select id="bc-bajas-warehouse" required><option value="" disabled selected hidden>Seleccionar almacén…</option></select></label>' +
        '</div>' +
        '<section id="bc-bajas-step-products" class="bc-bajas-step">' +
          '<p class="bc-bajas-step-label">PASO 1 DE 2 · Selecciona los productos</p>' +
          '<label class="bc-bajas-search">Buscar producto<input id="bc-bajas-product-search" type="search" placeholder="Escribe el nombre del producto"></label>' +
          '<div id="bc-bajas-product-picker" class="bc-bajas-product-picker"></div>' +
          '<div class="bc-bajas-actions"><button type="button" id="bc-bajas-clear-selection" class="secondary">Limpiar selección</button><button type="button" id="bc-bajas-next" disabled>Siguiente · 0</button></div>' +
        '</section>' +
        '<section id="bc-bajas-step-details" class="bc-bajas-step" hidden>' +
          '<p class="bc-bajas-step-label">PASO 2 DE 2 · Cantidades y motivos</p>' +
          '<button type="button" id="bc-bajas-back" class="secondary">← Volver a productos</button>' +
          '<div id="bc-bajas-reason-fields" class="bc-bajas-context-fields">' +
            '<label><span>Motivo general</span><select id="bc-bajas-default-reason" required><option value="" disabled selected hidden>Seleccionar motivo…</option></select></label>' +
            '<label id="bc-bajas-default-other-wrap" hidden><span>Explica el motivo general</span><input id="bc-bajas-default-other" maxlength="180" placeholder="Describe el motivo"></label>' +
          '</div>' +
          '<div class="bc-bajas-list-heading"><strong>PRODUCTOS SELECCIONADOS</strong><span id="bc-bajas-line-count">0 productos</span></div>' +
          '<div class="bc-bajas-lines" id="bc-bajas-lines"><p class="bc-bajas-list-empty">Selecciona productos en el paso anterior.</p></div>' +
          '<div class="bc-bajas-actions"><button type="submit" id="bc-baja-submit">Enviar lista a revisión</button></div>' +
        '</section>' +
        '<div class="bc-baja-line-editor" hidden><select id="bc-baja-product"></select><input id="bc-baja-quantity" type="number"><button type="button" id="bc-baja-add-line">Agregar</button></div>' +
        '<p class="bc-bajas-message" id="bc-bajas-message" role="status" aria-live="polite"></p>' +
      '</form>';
    modal.querySelector('.bc-bajas-modal-content').appendChild(host);
    const form = host.querySelector('#bc-bajas-multiple-form');
    const addButton = host.querySelector('#bc-baja-add-line');
    const productSelect = host.querySelector('#bc-baja-product');
    const quantityInput = host.querySelector('#bc-baja-quantity');
    const linesHost = host.querySelector('#bc-bajas-lines');
    addButton.addEventListener('click', addLineToList);
    quantityInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); addLineToList(); }
    });
    linesHost.addEventListener('click', event => {
      const remove = event.target.closest('[data-bc-baja-remove]');
      if (!remove || submitting) return;
      const [removedLine] = draftLines.splice(Number(remove.dataset.bcBajaRemove), 1);
      if (removedLine) delete selectedProductIds[String(removedLine.producto_id)];
      pendingKey = null;
      renderBajasProductPicker();
      renderDraftLines();
    });
    linesHost.addEventListener('change', event => {
      const select = event.target.closest('[data-bc-baja-reason]');
      if (!select) return;
      const index = Number(select.dataset.bcBajaReason);
      const line = draftLines[index];
      if (!line) return;
      line.motivo = select.value || '';
      const card = select.closest('.bc-baja-line');
      const otherWrap = card && card.querySelector('[data-bc-baja-other-wrap]');
      const otherInput = card && card.querySelector('[data-bc-baja-other]');
      if (otherWrap) otherWrap.hidden = line.motivo !== 'Otro';
      if (otherInput) otherInput.required = line.motivo === 'Otro';
      const label = card && card.querySelector('.bc-baja-line-reason-status');
      if (label) label.textContent = line.motivo ? (line.motivo === 'Otro' ? 'Otro motivo' : line.motivo) : 'Motivo general';
      pendingKey = null;
    });
    linesHost.addEventListener('input', event => {
      const quantity = event.target.closest('[data-bc-baja-quantity]');
      if (quantity) {
        const line = draftLines[Number(quantity.dataset.bcBajaQuantity)];
        if (line) line.cantidad = quantity.value;
        pendingKey = null;
      }
      const input = event.target.closest('[data-bc-baja-other]');
      if (input) {
        const line = draftLines[Number(input.dataset.bcBajaOther)];
        if (line) line.otro = input.value;
        pendingKey = null;
      }
    });
    host.querySelector('#bc-bajas-product-picker').addEventListener('change', event => {
      const box = event.target.closest('[data-bc-bajas-select]');
      if (!box) return;
      const id = String(box.dataset.bcBajasSelect);
      if (box.checked) selectedProductIds[id] = true;
      else {
        delete selectedProductIds[id];
        draftLines = draftLines.filter(line => String(line.producto_id) !== id);
      }
      renderBajasProductPicker();
      updateLineCount();
    });
    host.querySelector('#bc-bajas-product-search').addEventListener('input', renderBajasProductPicker);
    host.querySelector('#bc-bajas-next').addEventListener('click', () => showBajasStep(2));
    host.querySelector('#bc-bajas-back').addEventListener('click', () => showBajasStep(1));
    host.querySelector('#bc-bajas-clear-selection').addEventListener('click', () => {
      selectedProductIds = Object.create(null); draftLines = []; pendingKey = null;
      renderBajasProductPicker(); renderDraftLines();
    });
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
    renderDraftLines();
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
    products.forEach(item => {
      const option = document.createElement('option');
      option.value=item.id;
      option.textContent=item.nombre;
      select.appendChild(option);
    });
    if (products.some(item => String(item.id) === String(old))) select.value = old;
    refreshPicker(select);
  }
  function addLineToList() {
    if (submitting || loading) return;
    const productSelect = document.getElementById('bc-baja-product');
    const quantityInput = document.getElementById('bc-baja-quantity');
    const productId = productSelect && productSelect.value;
    const quantity = Number(quantityInput && quantityInput.value);
    const product = products.find(item => String(item.id) === String(productId));
    if (!product || !Number.isFinite(quantity) || quantity <= 0) {
      message('Selecciona un producto y escribe una cantidad válida.', 'error');
      return;
    }
    draftLines.push({
      producto_id: product.id,
      nombre: product.nombre,
      cantidad: quantity,
      motivo: '',
      otro: ''
    });
    if (productSelect) productSelect.value = '';
    if (quantityInput) quantityInput.value = '';
    pendingKey = null;
    renderDraftLines();
    message('Producto agregado. Puedes continuar con el siguiente.', 'success');
  }
  function renderBajasProductPicker() {
    const host = document.getElementById('bc-bajas-product-picker');
    const search = document.getElementById('bc-bajas-product-search');
    const next = document.getElementById('bc-bajas-next');
    if (!host) return;
    const query = String(search && search.value || '').trim().toLocaleLowerCase();
    const visible = products.filter(item => !query || String(item.nombre || '').toLocaleLowerCase().includes(query));
    host.innerHTML = visible.map(item => {
      const id = String(item.id);
      return '<label class="bc-bajas-product-choice"><input type="checkbox" data-bc-bajas-select="' + escapeMarkup(id) + '"' +
        (selectedProductIds[id] ? ' checked' : '') + '><span><strong>' + escapeMarkup(item.nombre) + '</strong><small>Unidad base</small></span></label>';
    }).join('') || '<p class="bc-bajas-list-empty">No hay productos que coincidan con la búsqueda.</p>';
    const count = Object.keys(selectedProductIds).filter(id => selectedProductIds[id]).length;
    if (next) { next.disabled = count === 0; next.textContent = 'Siguiente · ' + count; }
  }
  function showBajasStep(step) {
    if (step === 2) {
      const warehouse = document.getElementById('bc-bajas-warehouse')?.value;
      const selected = products.filter(item => selectedProductIds[String(item.id)]);
      if (!warehouse) return message('Selecciona primero el almacén.', 'error');
      if (!selected.length) return message('Selecciona al menos un producto.', 'error');
      const existing = new Map(draftLines.map(line => [String(line.producto_id), line]));
      draftLines = selected.map(item => existing.get(String(item.id)) || ({
        producto_id: item.id, nombre: item.nombre, cantidad: '', motivo: '', otro: ''
      }));
      bajaStep = 2;
      document.getElementById('bc-bajas-step-products').hidden = true;
      document.getElementById('bc-bajas-step-details').hidden = false;
      renderDraftLines();
      message('Indica la cantidad y aplica un motivo general o uno distinto por producto.', '');
      return;
    }
    bajaStep = 1;
    document.getElementById('bc-bajas-step-products').hidden = false;
    document.getElementById('bc-bajas-step-details').hidden = true;
    renderBajasProductPicker();
    message('', '');
  }
  function renderDraftLines() {
    const host = document.getElementById('bc-bajas-lines');
    if (!host) return;
    host.innerHTML = draftLines.length ? draftLines.map((line, index) => {
      const reasonLabel = line.motivo ? (line.motivo === 'Otro' ? 'Otro motivo' : line.motivo) : 'Motivo general';
      const options = ['<option value=""' + (!line.motivo ? ' selected' : '') + '>Usar motivo general</option>']
        .concat(REASONS.map(reason => '<option value="' + escapeMarkup(reason) + '"' + (line.motivo === reason ? ' selected' : '') + '>' + escapeMarkup(reason) + '</option>')).join('');
      const otherOpen = line.motivo === 'Otro';
      return '<article class="bc-baja-line">' +
        '<div class="bc-baja-line-summary"><div class="bc-baja-line-main"><strong>' + escapeMarkup(line.nombre) +
        '</strong><small><span class="bc-baja-line-reason-status">' + escapeMarkup(reasonLabel) + '</span></small></div>' +
        '<button type="button" class="bc-baja-line-remove" data-bc-baja-remove="' + index + '" aria-label="Quitar ' + escapeMarkup(line.nombre) + '">×</button></div>' +
        '<label class="bc-baja-quantity-field"><span>Cantidad a dar de baja</span><input type="number" min="0.0001" step="any" inputmode="decimal" data-bc-baja-quantity="' + index + '" value="' + escapeMarkup(line.cantidad == null ? '' : line.cantidad) + '" placeholder="Cantidad"></label>' +
        '<details class="bc-baja-line-reason-details"' + (line.motivo ? ' open' : '') + '>' +
          '<summary>Motivo distinto (opcional)</summary>' +
          '<label><span>Motivo para este producto</span><select data-bc-baja-reason="' + index + '">' + options + '</select></label>' +
          '<label data-bc-baja-other-wrap' + (otherOpen ? '' : ' hidden') + '><span>Explica este motivo</span><input data-bc-baja-other="' + index + '" maxlength="180" placeholder="Describe el motivo" value="' + escapeMarkup(line.otro || '') + '"' + (otherOpen ? ' required' : '') + '></label>' +
        '</details></article>';
    }).join('') : '<p class="bc-bajas-list-empty">Selecciona productos en el paso anterior.</p>';
    updateLineCount();
  }
  function updateLineCount() {
    const count=document.getElementById('bc-bajas-line-count');
    if (count) {
      const n=draftLines.length;
      count.textContent=n+' '+(n===1?'producto':'productos');
    }
  }
  async function loadCatalogs(force) {
    if (!canCreate()) return false;
    if (catalogLoadPromise) return catalogLoadPromise;
    const host = ensureUI();
    if (!host) return false;
    if (!force && products.length && warehouses.length) return true;
    loading = true;
    const add = host.querySelector('#bc-baja-add-line');
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
        fillProductSelect(host.querySelector('#bc-baja-product'));
        renderBajasProductPicker();
        refreshPicker(host);
        if (products.length && warehouses.length) {
          message(products.length + ' productos y ' + warehouses.length + ' almacenes disponibles. Selecciona los que incluirás en la lista.', 'success');
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
    if (bajaStep !== 2) return message('Completa primero la selección de productos.', 'error');
    if (!warehouse || !draftLines.length) return message('Selecciona un almacén y al menos un producto.', 'error');
    const defaultReason = document.getElementById('bc-bajas-default-reason')?.value || '';
    const defaultOther = document.getElementById('bc-bajas-default-other')?.value.trim() || '';
    if (!defaultReason || (defaultReason === 'Otro' && !defaultOther)) {
      return message('Selecciona el motivo general de la lista (y descríbelo si es Otro).', 'error');
    }
    const generalReason = defaultReason === 'Otro' ? 'Otro: ' + defaultOther : defaultReason;
    const requestLines = [];
    for (const line of draftLines) {
      const reason = line.motivo || defaultReason;
      const other = line.motivo === 'Otro' ? String(line.otro || '').trim() : defaultOther;
      if (!line.producto_id || !Number.isFinite(Number(line.cantidad)) || Number(line.cantidad) <= 0 || !reason || (reason === 'Otro' && !other)) {
        return message('Revisa los productos agregados y el motivo general o particular.', 'error');
      }
      requestLines.push({
        almacen_id: warehouse,
        producto_id: line.producto_id,
        cantidad: Number(line.cantidad),
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
      requestKey = await persistentRequestKey(warehouse, requestLines);
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
      p_lineas: requestLines,
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
      if (created.length !== requestLines.length || created.some(item => !item || !item.id)) {
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
      draftLines = [];
      selectedProductIds = Object.create(null);
      bajaStep = 1;
      document.getElementById('bc-bajas-step-products').hidden = false;
      document.getElementById('bc-bajas-step-details').hidden = true;
      const productEditor = document.getElementById('bc-baja-product');
      const quantityEditor = document.getElementById('bc-baja-quantity');
      if (productEditor) productEditor.value = '';
      if (quantityEditor) quantityEditor.value = '';
      renderBajasProductPicker();
      renderDraftLines();
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
      if (succeeded) renderDraftLines();
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
