/* BattleCruiser — detalle accionable de inventario por producto y almacén */
(function () {
  'use strict';

  const esc = value => typeof window.escHtml === 'function'
    ? window.escHtml(String(value ?? '—'))
    : String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const qtyFmt = value => typeof window.numberFmt === 'function'
    ? window.numberFmt(value)
    : new Intl.NumberFormat('es-ES', { useGrouping: true, maximumFractionDigits: 2 })
      .formatToParts(num(value)).map(part => part.type === 'group' ? '\u202f' : part.value).join('');
  const estadoLabel = state => state === 'sin_minimo' ? '🟠 Mínimo pendiente'
    : state === 'agotado' ? '🔴 Agotado'
    : state === 'bajo' ? '🟡 Bajo mínimo' : '🟢 Disponible';
  const MOVEMENT_LABELS = {
    compra: 'Compra',
    reinversion: 'Reinversión',
    venta: 'Venta',
    transferencia_salida: 'Transferencia · salida',
    transferencia_entrada: 'Transferencia · entrada',
    movimiento_interno: 'Movimiento interno',
    vale: 'Vale de salida',
    merma: 'Baja',
    baja: 'Baja',
    ajuste: 'Ajuste'
  };

  let filaActual = null;
  let modalSequence = 0;

  function getClient() {
    try {
      if (typeof client !== 'undefined' && client) return client;
    } catch (_) {}
    return window.client || null;
  }

  function estadoAlmacen(warehouse) {
    const variants = warehouse && Array.isArray(warehouse.variantes) ? warehouse.variantes : [];
    if (variants.length) {
      if (variants.some(variant => variant && num(variant.minimo) <= 0)) return 'sin_minimo';
      if (num(warehouse.cantidad) <= 0) return 'agotado';
      if (variants.some(variant => variant &&
        (variant.estado === 'bajo' || variant.estado === 'agotado' || num(variant.cantidad) <= num(variant.minimo)))) return 'bajo';
      return 'normal';
    }
    if (!warehouse || warehouse.minimo == null || num(warehouse.minimo) <= 0) return 'sin_minimo';
    if (num(warehouse.cantidad) <= 0) return 'agotado';
    if (num(warehouse.cantidad) <= num(warehouse.minimo)) return 'bajo';
    return 'normal';
  }

  function recalcular(fila) {
    if (!fila || !Array.isArray(fila.almacenes)) return;
    fila.almacenes.forEach(warehouse => { warehouse.estado = estadoAlmacen(warehouse); });
    fila.cantidad = fila.almacenes.reduce((sum, warehouse) => sum + num(warehouse.cantidad), 0);
    fila.estado = fila.almacenes.some(warehouse => warehouse.estado === 'sin_minimo') ? 'sin_minimo'
      : fila.cantidad <= 0 ? 'agotado'
      : fila.almacenes.some(warehouse => warehouse.estado === 'bajo') ? 'bajo' : 'normal';
  }

  function ensureModal() {
    let modal = document.getElementById('bc-inv-producto-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'bc-inv-producto-modal';
    modal.className = 'hidden';
    modal.innerHTML =
      '<div class="bc-inv-modal-backdrop" data-bc-inv-close="1"></div>' +
      '<section class="bc-inv-modal-card" role="dialog" aria-modal="true" aria-labelledby="bc-inv-modal-title" tabindex="-1">' +
        '<button type="button" class="bc-inv-modal-close" data-bc-inv-close="1" aria-label="Cerrar">×</button>' +
        '<h2 id="bc-inv-modal-title"></h2><div class="bc-inv-modal-body"></div>' +
      '</section>';
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-bc-inv-close]')) {
        modal.classList.add('hidden');
        return;
      }
      const variantButton = event.target.closest('[data-bc-save-variant-minimum]');
      if (variantButton) { event.preventDefault(); guardarMinimoVariante(variantButton); return; }
      const assignButton = event.target.closest('[data-bc-assign-warehouse]');
      if (assignButton) { event.preventDefault(); asignarAlmacenConMinimo(assignButton); return; }
      const button = event.target.closest('[data-bc-save-minimum]');
      if (button) { event.preventDefault(); guardarMinimo(button); }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.classList.contains('hidden')) modal.classList.add('hidden');
    });
    return modal;
  }

  async function cargarDatosProducto(productId) {
    if (!productId) return null;
    const cache = (() => { try { return typeof _cache !== 'undefined' && _cache ? _cache : null; } catch (_) { return null; } })();
    const cached = cache && Array.isArray(cache.productos)
      ? cache.productos.find(product => String(product.id) === String(productId))
      : null;
    if (cached && (cached.unidad || cached.categorias || cached.presentaciones)) return cached;
    const supabaseClient = getClient();
    if (!supabaseClient) return cached || null;
    try {
      const result = await supabaseClient.from('productos')
        .select('id, nombre, unidad, categorias(nombre), presentaciones(nombre), inventario_mixto, producto_padre_id, variante_nombre')
        .eq('id', productId)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data || cached || null;
    } catch (error) {
      console.warn('[BattleCruiser] No se pudieron cargar los datos descriptivos del producto:', error);
      return cached || null;
    }
  }

  async function cargarMovimientosRecientes(productId) {
    if (!productId) return { rows: [], error: null };
    const supabaseClient = getClient();
    if (!supabaseClient || typeof supabaseClient.rpc !== 'function') {
      return { rows: [], error: 'Conexión no disponible.' };
    }
    try {
      const result = await supabaseClient.rpc('movimientos_producto', {
        p_producto_id: productId,
        p_almacen_id: null,
        p_desde: null,
        p_hasta: null,
        p_tipo: null,
        p_limite: 5,
        p_offset: 0
      });
      if (result.error) throw result.error;
      return { rows: Array.isArray(result.data) ? result.data : [], error: null };
    } catch (error) {
      return { rows: [], error: String(error && (error.message || error.details) || error) };
    }
  }

  function fechaMovimiento(value) {
    if (!value) return 'Fecha no disponible';
    try {
      if (typeof window.fechaHora === 'function') return window.fechaHora(value);
      return new Date(value).toLocaleString('es-ES', {
        timeZone: 'America/Havana', day: '2-digit', month: 'short',
        year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return String(value);
    }
  }

  function renderMovimientos(movements, movementError, unit) {
    if (movementError) {
      return '<p class="bc-inv-history-empty">El historial reciente no está disponible ahora.</p>';
    }
    if (!movements || !movements.length) {
      return '<p class="bc-inv-history-empty">Todavía no hay movimientos registrados para este producto.</p>';
    }
    return '<div class="bc-inv-history-list">' + movements.map(movement => {
      const type = String(movement.tipo || '').toLowerCase();
      const label = MOVEMENT_LABELS[type] || movement.tipo || 'Movimiento';
      const amount = num(movement.cantidad);
      const signed = amount > 0 ? '+' + qtyFmt(amount) : qtyFmt(amount);
      return '<article class="bc-inv-history-row">' +
        '<div class="bc-inv-history-main"><strong>' + esc(label) + '</strong>' +
        '<span>' + esc(movement.almacen || 'Almacén no disponible') + '</span>' +
        '<small>' + esc(fechaMovimiento(movement.fecha)) + '</small></div>' +
        '<strong class="bc-inv-history-amount">' + esc(signed + ' ' + (unit || 'u')) + '</strong>' +
      '</article>';
    }).join('') + '</div>';
  }

  function render(fila, meta, movements, movementError, feedback, loadingExtra) {
    const modal = ensureModal();
    const body = modal.querySelector('.bc-inv-modal-body');
    const stores = Array.isArray(fila.almacenes) && fila.almacenes.length
      ? fila.almacenes
      : [{ almacen: fila.almacen, almacen_id: fila.almacen_id, cantidad: fila.cantidad,
          minimo: fila.minimo, estado: fila.estado, unidad: fila.unidad, variantes: fila.variantes }];
    const total = stores.reduce((sum, warehouse) => sum + num(warehouse.cantidad), 0);
    const unit = (meta && meta.unidad) || fila.unidad ||
      (stores[0] && stores[0].unidad) || 'u';
    const category = meta && meta.categorias && meta.categorias.nombre
      ? meta.categorias.nombre : 'Sin categoría';
    const presentation = meta && meta.presentaciones && meta.presentaciones.nombre
      ? meta.presentaciones.nombre : '';
    const mixed = !!(meta && meta.inventario_mixto) ||
      stores.some(warehouse => Array.isArray(warehouse.variantes) && warehouse.variantes.length > 0);
    const productId = fila.producto_id || fila.id || '';
    const warehouseCatalog = Array.isArray(window._cache && window._cache.almacenes)
      ? window._cache.almacenes.filter(warehouse => warehouse && warehouse.activo !== false && warehouse.id)
      : [];
    const assignedWarehouseIds = new Set(stores.map(warehouse => String(warehouse.almacen_id || warehouse.id || '')).filter(Boolean));
    const unassignedWarehouses = !mixed && !loadingExtra
      ? warehouseCatalog.filter(warehouse => !assignedWarehouseIds.has(String(warehouse.id)))
      : [];

    modal.querySelector('h2').textContent = fila.producto || (meta && meta.nombre) || 'Producto';
    body.innerHTML =
      '<div class="bc-inv-product-summary">' +
        '<span class="bc-inv-product-status">' + esc(estadoLabel(fila.estado)) + '</span>' +
        '<strong>' + esc(qtyFmt(total) + ' ' + unit) + '</strong>' +
        '<span>existencias totales · ' + esc(qtyFmt(stores.length)) + ' almacenes</span>' +
      '</div>' +
      '<section class="bc-inv-product-meta" aria-label="Datos del producto">' +
        '<div class="bc-inv-meta-title">Datos del producto</div>' +
        '<div class="bc-inv-meta-grid">' +
          '<div><span>Categoría</span><strong>' + esc(category) + '</strong></div>' +
          '<div><span>Unidad</span><strong>' + esc(unit) + '</strong></div>' +
          (presentation ? '<div><span>Presentación</span><strong>' + esc(presentation) + '</strong></div>' : '') +
          (mixed ? '<div><span>Inventario</span><strong>Por variantes</strong></div>' : '') +
        '</div>' +
      '</section>' +
      stores.map(function (warehouse, index) {
        const variants = Array.isArray(warehouse.variantes) ? warehouse.variantes : [];
        const status = estadoAlmacen(warehouse);
        const productId = fila.producto_id || fila.id || '';
        const warehouseId = warehouse.almacen_id || warehouse.id || '';
        const hasIdentity = !!productId && !!warehouseId;
        const editable = hasIdentity && variants.length === 0 && !!getClient();
        const minimum = warehouse.minimo == null ? 0 : num(warehouse.minimo);
        const inputId = 'bc-inv-minimum-' + index;
        const savedFeedback = feedback && String(feedback.almacenId) === String(warehouseId)
          ? '<div class="bc-inv-minimum-feedback is-success" role="status">' + esc(feedback.message) + '</div>'
          : '';
        const editor = variants.length
          ? '<strong class="bc-inv-minimum-readonly">Mínimos individuales por sabor</strong>'
          : (editable
            ? '<div class="bc-inv-minimum-controls">' +
                '<input id="' + inputId + '" data-bc-minimum-input type="number" min="0.001" step="any" inputmode="decimal" required value="' + esc(String(minimum > 0 ? minimum : '')) + '" aria-label="Stock mínimo de ' + esc(warehouse.almacen || 'almacén') + '">' +
                '<button type="button" class="bc-inv-minimum-save" data-bc-save-minimum data-product-id="' + esc(productId) + '" data-warehouse-id="' + esc(warehouseId) + '">Guardar</button>' +
              '</div>'
            : '<strong class="bc-inv-minimum-readonly">' + esc(qtyFmt(minimum)) + '</strong>');
        const hint = variants.length
          ? '<p class="bc-inv-minimum-hint">Cada sabor necesita un mínimo mayor que cero en este almacén. Configúralos debajo.</p>'
          : (!hasIdentity
            ? '<p class="bc-inv-minimum-hint is-warning">No se pudo identificar este almacén para habilitar el guardado. Actualiza Inventario y vuelve a abrir el producto.</p>'
            : (minimum <= 0
              ? '<p class="bc-inv-minimum-hint is-warning">Obligatorio: define un mínimo mayor que cero para este almacén.</p>'
              : (!getClient() ? '<p class="bc-inv-minimum-hint is-warning">La conexión no está disponible para guardar el mínimo.</p>' : '')));
        return '<section class="bc-inv-warehouse-detail" data-warehouse-id="' + esc(warehouseId) + '">' +
          '<div class="bc-inv-warehouse-heading"><strong>' + esc(warehouse.almacen || 'Almacén') + '</strong>' +
            '<span class="bc-inv-warehouse-status">' + esc(estadoLabel(status)) + '</span></div>' +
          '<div class="bc-inv-detail-row"><span>Stock actual</span><strong>' +
            esc(qtyFmt(warehouse.cantidad) + ' ' + (warehouse.unidad || unit)) + '</strong></div>' +
          '<div class="bc-inv-minimum-editor"><label for="' + (editable ? inputId : '') + '">Stock mínimo</label>' +
            editor + savedFeedback + hint +
          '</div>' +
          (variants.length
            ? '<div class="bc-inv-variants-title">Existencias por sabor / variante</div>' +
              variants.map(function (variant) {
                const variantId = variant.producto_id || '';
                const variantMinimum = variant.minimo == null ? 0 : num(variant.minimo);
                const variantState = variant.estado || (variantMinimum <= 0 ? 'sin_minimo' : (num(variant.cantidad) <= 0 ? 'agotado' : (num(variant.cantidad) <= variantMinimum ? 'bajo' : 'normal')));
                const variantFeedback = feedback && String(feedback.variantId || '') === String(variantId) && String(feedback.almacenId || '') === String(warehouseId)
                  ? '<div class="bc-inv-minimum-feedback is-success" role="status">' + esc(feedback.message) + '</div>' : '';
                const variantEditor = variantId && warehouseId && getClient()
                  ? '<div class="bc-inv-variant-minimum"><label>Stock mínimo</label><input data-bc-variant-minimum-input type="number" min="0.001" step="any" required inputmode="decimal" value="' + esc(String(variantMinimum > 0 ? variantMinimum : '')) + '" aria-label="Stock mínimo de ' + esc(variant.nombre || 'variante') + '">' +
                    '<button type="button" class="bc-inv-minimum-save" data-bc-save-variant-minimum data-variant-id="' + esc(variantId) + '" data-warehouse-id="' + esc(warehouseId) + '">Guardar</button></div>'
                  : '<span class="bc-inv-minimum-readonly">Mínimo: ' + esc(qtyFmt(variantMinimum)) + '</span>';
                return '<div class="bc-inv-variant-row"><div class="bc-inv-variant-main"><strong>' + esc(variant.nombre || 'Variante') + '</strong>' +
                  '<span>' + esc(qtyFmt(variant.cantidad) + ' ' + (variant.unidad || unit)) + ' · ' + esc(estadoLabel(variantState)) + '</span></div>' +
                  variantEditor + variantFeedback + '</div>';
              }).join('')
            : '') +
        '</section>';
      }).join('') +
      (unassignedWarehouses.length && productId && getClient()
        ? '<section class="bc-inv-add-warehouse">' +
            '<strong>Agregar este producto a otro almacén</strong>' +
            '<p>Se creará la asignación con stock 0. Define primero su mínimo obligatorio para poder recibir compras o transferencias.</p>' +
            '<div class="bc-inv-add-warehouse-controls">' +
              '<select data-bc-new-warehouse aria-label="Nuevo almacén"><option value="">Seleccionar almacén…</option>' +
                unassignedWarehouses.map(warehouse => '<option value="' + esc(warehouse.id) + '">' + esc(warehouse.nombre) + '</option>').join('') +
              '</select>' +
              '<input data-bc-new-warehouse-minimum type="number" min="0.001" step="any" inputmode="decimal" placeholder="Stock mínimo" aria-label="Stock mínimo obligatorio">' +
              '<button type="button" class="bc-inv-minimum-save" data-bc-assign-warehouse data-product-id="' + esc(productId) + '">Asignar</button>' +
            '</div><div class="bc-inv-minimum-feedback" data-bc-assign-feedback role="status"></div>' +
          '</section>'
        : '') +
      '<section class="bc-inv-history" aria-label="Movimientos recientes">' +
        '<div class="bc-inv-history-heading"><strong>Movimientos recientes</strong><span>Últimos 5</span></div>' +
        (loadingExtra
          ? '<p class="bc-inv-history-empty">Cargando historial…</p>'
          : renderMovimientos(movements, movementError, unit)) +
      '</section>';
    modal.classList.remove('hidden');
    modal.querySelector('.bc-inv-modal-card').focus();
  }

  async function abrirProducto(fila, feedback) {
    filaActual = fila;
    const sequence = ++modalSequence;
    render(fila, null, [], null, feedback || null, true);
    const productId = fila.producto_id || fila.id || '';
    const [meta, history] = await Promise.all([
      cargarDatosProducto(productId),
      cargarMovimientosRecientes(productId)
    ]);
    if (sequence !== modalSequence || !filaActual || String(filaActual.producto_id || filaActual.id) !== String(productId)) return;
    render(filaActual, meta, history.rows, history.error, feedback || null, false);
  }

  async function guardarMinimo(button) {
    if (button.disabled) return;
    const modal = document.getElementById('bc-inv-producto-modal');
    const warehouseSection = button.closest('.bc-inv-warehouse-detail');
    const input = warehouseSection && warehouseSection.querySelector('[data-bc-minimum-input]');
    const productId = button.getAttribute('data-product-id');
    const warehouseId = button.getAttribute('data-warehouse-id');
    if (!modal || !warehouseSection || !input || !productId || !warehouseId) return;

    let feedback = warehouseSection.querySelector('.bc-inv-minimum-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.className = 'bc-inv-minimum-feedback';
      feedback.setAttribute('role', 'status');
      warehouseSection.querySelector('.bc-inv-minimum-editor').appendChild(feedback);
    }
    const raw = String(input.value || '').trim();
    const minimum = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(minimum) || minimum <= 0) {
      feedback.className = 'bc-inv-minimum-feedback is-error';
      feedback.textContent = 'Introduce un mínimo válido: debe ser obligatorio y mayor que cero.';
      input.focus();
      return;
    }

    const supabaseClient = getClient();
    if (!supabaseClient || typeof supabaseClient.rpc !== 'function') {
      feedback.className = 'bc-inv-minimum-feedback is-error';
      feedback.textContent = 'No está disponible la conexión con el inventario.';
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    input.disabled = true;
    button.textContent = 'Guardando…';
    feedback.className = 'bc-inv-minimum-feedback';
    feedback.textContent = 'Guardando mínimo…';
    try {
      // The RPC is the authority for stock.edit permission; the UI must not
      // hide the editor because a client-side permission cache is still stale.
      const result = await supabaseClient.rpc('bc_actualizar_stock_minimo_obligatorio', {
        p_producto_id: productId,
        p_almacen_id: warehouseId,
        p_minimo: minimum
      });
      if (!result || result.error) {
        throw new Error(result && result.error && (result.error.message || result.error.details) || 'No se pudo guardar el mínimo.');
      }

      if (typeof window.bcNotificarCambioDatos === 'function') {
        window.bcNotificarCambioDatos('stock_minimum', false);
      }
      let refreshed = null;
      if (typeof window.refrescarInventario === 'function') {
        try {
          await window.refrescarInventario();
          const currentRows = Array.isArray(window._invFilas) ? window._invFilas : [];
          refreshed = currentRows.find(row => String(row.producto_id || row.id) === String(productId)) || null;
        } catch (_) {
          refreshed = null;
        }
      }
      const target = refreshed || filaActual;
      if (target && Array.isArray(target.almacenes)) {
        const targetWarehouse = target.almacenes.find(row => String(row.almacen_id || row.id) === String(warehouseId));
        if (targetWarehouse) {
          targetWarehouse.minimo = minimum;
          recalcular(target);
        }
      }
      await abrirProducto(target || filaActual, {
        almacenId: warehouseId,
        message: '✓ Stock mínimo guardado.'
      });
    } catch (error) {
      button.disabled = false;
      input.disabled = false;
      button.textContent = originalText;
      feedback.className = 'bc-inv-minimum-feedback is-error';
      feedback.textContent = 'No se pudo guardar: ' + String(error && error.message || error);
    }
  }

  async function guardarMinimoVariante(button) {
    if (!button || button.disabled) return;
    const row = button.closest('.bc-inv-variant-row');
    const input = row && row.querySelector('[data-bc-variant-minimum-input]');
    const variantId = button.getAttribute('data-variant-id');
    const warehouseId = button.getAttribute('data-warehouse-id');
    if (!row || !input || !variantId || !warehouseId) return;
    const raw = String(input.value || '').trim();
    const minimum = raw === '' ? NaN : Number(raw);
    let feedback = row.querySelector('.bc-inv-minimum-feedback');
    if (!feedback) { feedback = document.createElement('div'); feedback.className = 'bc-inv-minimum-feedback'; feedback.setAttribute('role', 'status'); row.appendChild(feedback); }
    if (!Number.isFinite(minimum) || minimum <= 0) { feedback.className = 'bc-inv-minimum-feedback is-error'; feedback.textContent = 'Introduce un mínimo válido para este sabor: debe ser mayor que cero.'; input.focus(); return; }
    const supabaseClient = getClient();
    if (!supabaseClient || typeof supabaseClient.rpc !== 'function') { feedback.className = 'bc-inv-minimum-feedback is-error'; feedback.textContent = 'No está disponible la conexión con el inventario.'; return; }
    const originalText = button.textContent;
    button.disabled = true; input.disabled = true; button.textContent = 'Guardando…';
    feedback.className = 'bc-inv-minimum-feedback'; feedback.textContent = 'Guardando mínimo del sabor…';
    try {
      const result = await supabaseClient.rpc('bc_actualizar_stock_minimo_variante', { p_producto_id: variantId, p_almacen_id: warehouseId, p_minimo: minimum });
      if (!result || result.error) throw new Error(result && result.error && (result.error.message || result.error.details) || 'No se pudo guardar el mínimo del sabor.');
      if (typeof window.bcNotificarCambioDatos === 'function') window.bcNotificarCambioDatos('stock_minimum', false);
      let refreshed = null;
      if (typeof window.refrescarInventario === 'function') {
        try {
          await window.refrescarInventario();
          const rows = Array.isArray(window._invFilas) ? window._invFilas : [];
          const currentId = filaActual && (filaActual.producto_id || filaActual.id);
          refreshed = rows.find(item => String(item.producto_id || item.id) === String(currentId)) || null;
        } catch (_) { refreshed = null; }
      }
      await abrirProducto(refreshed || filaActual, { almacenId: warehouseId, variantId: variantId, message: '✓ Mínimo del sabor guardado.' });
    } catch (error) {
      button.disabled = false; input.disabled = false; button.textContent = originalText;
      feedback.className = 'bc-inv-minimum-feedback is-error'; feedback.textContent = 'No se pudo guardar: ' + String(error && error.message || error);
    }
  }

  function bind() {
    const list = document.getElementById('inv-detalle');
    if (!list) { setTimeout(bind, 500); return; }
    if (list.dataset.bcInvDetailBound === '1') return;
    list.dataset.bcInvDetailBound = '1';

    const style = document.createElement('style');
    style.textContent =
      '#bc-inv-producto-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:10px}' +
      '#bc-inv-producto-modal.hidden{display:none}' +
      '.bc-inv-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72)}' +
      '.bc-inv-modal-card{position:relative;width:min(620px,100%);max-height:88vh;overflow:auto;background:var(--void,#0c1c18);border:1px solid var(--gold,#c9a24d);border-radius:10px;padding:14px;color:var(--text,#eee);box-shadow:0 18px 60px rgba(0,0,0,.5)}' +
      '.bc-inv-modal-card h2{margin:0 38px 9px 0;color:var(--gold,#c9a24d);font-size:1.2rem}' +
      '.bc-inv-modal-close{position:absolute;right:9px;top:5px;border:0;background:none;color:var(--mist,#aaa);font-size:26px;cursor:pointer}' +
      '.bc-inv-product-summary{display:flex;align-items:center;flex-wrap:wrap;gap:5px 10px;margin-bottom:8px;font-size:.75rem;color:var(--mist,#aaa)}' +
      '.bc-inv-product-summary strong{color:var(--text,#eee);font-size:.95rem}.bc-inv-product-status{font-size:.72rem;color:var(--mist,#aaa)}' +
      '.bc-inv-product-meta{padding:8px 0 9px;border-top:1px solid rgba(201,162,77,.16)}' +
      '.bc-inv-meta-title{margin-bottom:6px;color:var(--gold,#c9a24d);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}' +
      '.bc-inv-meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px}' +
      '.bc-inv-meta-grid>div{display:flex;flex-direction:column;gap:2px;min-width:0}.bc-inv-meta-grid span{font-size:.68rem;color:var(--mist,#aaa)}.bc-inv-meta-grid strong{font-size:.8rem;overflow-wrap:anywhere}' +
      '.bc-inv-warehouse-detail{padding:9px 0;border-top:1px solid rgba(201,162,77,.16)}' +
      '.bc-inv-warehouse-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px}' +
      '.bc-inv-warehouse-heading strong{font-size:.88rem}.bc-inv-warehouse-status{font-size:.68rem;color:var(--mist,#aaa);white-space:nowrap}' +
      '.bc-inv-detail-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:.8rem}.bc-inv-detail-row span{color:var(--mist,#aaa)}' +
      '.bc-inv-minimum-editor{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 12px;padding-top:3px;font-size:.8rem}' +
      '.bc-inv-minimum-editor>label{color:var(--mist,#aaa)}.bc-inv-minimum-controls{display:flex;align-items:center;gap:6px;min-width:0}' +
      '.bc-inv-minimum-controls input{width:105px;min-width:0;height:36px;box-sizing:border-box;padding:0 8px;border:1px solid rgba(201,162,77,.45);border-radius:6px;background:var(--void,#0c1c18);color:var(--text,#eee);font:inherit}' +
      '.bc-inv-minimum-save{height:36px;padding:0 12px;border:0;border-radius:6px;background:linear-gradient(180deg,var(--gold-bright,#e0bd69),var(--gold,#c9a24d));color:#211605;font-weight:700;font-size:.75rem;cursor:pointer;white-space:nowrap}' +
      '.bc-inv-minimum-save:disabled{opacity:.55;cursor:wait}.bc-inv-minimum-readonly{color:var(--text,#eee);justify-self:end}' +
      '.bc-inv-minimum-feedback{grid-column:1/-1;min-height:1em;font-size:.7rem;color:var(--mist,#aaa)}' +
      '.bc-inv-minimum-feedback.is-success{color:#9fc4ad}.bc-inv-minimum-feedback.is-error{color:#e88a96}' +
      '.bc-inv-minimum-hint{grid-column:1/-1;margin:0;font-size:.67rem;color:var(--mist,#aaa)}.bc-inv-minimum-hint.is-warning{color:#e8c56a}' +
      '.bc-inv-add-warehouse{margin:10px 0;padding:10px;border:1px dashed rgba(201,162,77,.35);border-radius:8px;display:grid;gap:7px}' +
      '.bc-inv-add-warehouse>strong{font-size:.8rem;color:var(--gold,#c9a24d)}.bc-inv-add-warehouse>p{margin:0;font-size:.7rem;color:var(--mist,#aaa)}' +
      '.bc-inv-add-warehouse-controls{display:grid;grid-template-columns:minmax(0,1fr) 105px auto;gap:6px;align-items:center}' +
      '.bc-inv-add-warehouse-controls select,.bc-inv-add-warehouse-controls input{min-width:0;width:100%;height:36px;box-sizing:border-box;padding:0 7px;border:1px solid rgba(201,162,77,.35);border-radius:6px;background:var(--void,#0c1c18);color:var(--text,#eee);font:inherit;font-size:.75rem}' +
      '@media(max-width:430px){.bc-inv-add-warehouse-controls{grid-template-columns:1fr 1fr}.bc-inv-add-warehouse-controls select{grid-column:1/-1}.bc-inv-add-warehouse-controls button{grid-column:1/-1}}' +
      '.bc-inv-variants-title{padding-top:6px;font-size:.69rem;color:var(--gold,#c9a24d)}' +
      '.bc-inv-variant-row{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;padding:7px 0;font-size:.75rem;color:var(--mist,#aaa);border-top:1px solid rgba(201,162,77,.1)}' +
      '.bc-inv-variant-main{display:flex;justify-content:space-between;gap:8px;align-items:center}.bc-inv-variant-main strong{color:var(--text,#eee)}' +
      '.bc-inv-variant-minimum{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.bc-inv-variant-minimum label{font-size:.68rem;color:var(--mist,#aaa)}' +
      '.bc-inv-variant-minimum input{width:86px;height:32px;box-sizing:border-box;padding:0 7px;border:1px solid rgba(201,162,77,.35);border-radius:6px;background:var(--void,#0c1c18);color:var(--text,#eee);font:inherit}' +
      '.bc-inv-history{margin-top:7px;padding-top:9px;border-top:1px solid rgba(201,162,77,.2)}' +
      '.bc-inv-history-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px}.bc-inv-history-heading strong{font-size:.8rem}.bc-inv-history-heading span{font-size:.66rem;color:var(--mist,#aaa)}' +
      '.bc-inv-history-list{display:flex;flex-direction:column;gap:5px}.bc-inv-history-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px;border:1px solid rgba(201,162,77,.1);border-radius:7px;background:rgba(255,255,255,.015)}' +
      '.bc-inv-history-main{display:flex;flex-direction:column;gap:2px;min-width:0}.bc-inv-history-main strong{font-size:.74rem}.bc-inv-history-main span,.bc-inv-history-main small{font-size:.66rem;color:var(--mist,#aaa);overflow-wrap:anywhere}' +
      '.bc-inv-history-amount{font-size:.76rem;white-space:nowrap}.bc-inv-history-empty{margin:0;padding:5px 0;font-size:.7rem;color:var(--mist,#aaa)}' +
      '.rep-fila[data-inv-producto]{cursor:pointer}.rep-fila[data-inv-producto]:focus{outline:1px solid var(--gold,#c9a24d);outline-offset:2px}' +
      '@media(max-width:480px){.bc-inv-modal-card{padding:12px}.bc-inv-minimum-controls input{width:82px}.bc-inv-minimum-editor{gap:5px}.bc-inv-meta-grid{grid-template-columns:1fr 1fr}}';
    document.head.appendChild(style);

    const tagRows = () => {
      const rows = Array.from(list.querySelectorAll('.rep-fila')).filter(row => !row.classList.contains('rep-totales'));
      rows.forEach((row, index) => {
        const data = Array.isArray(window._invFilas) ? window._invFilas[index] : null;
        if (!data) return;
        row.dataset.invProducto = data.producto_id || data.id || '';
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
      });
    };
    const openFromRow = row => {
      const filas = Array.isArray(window._invFilas) ? window._invFilas : [];
      const rows = Array.from(list.querySelectorAll('.rep-fila[data-inv-producto]'));
      const fila = filas[rows.indexOf(row)];
      if (fila) abrirProducto(fila);
    };

    list.addEventListener('click', event => {
      if (event.target.closest('.bc-m53-variant-details')) { event.stopPropagation(); return; }
      const row = event.target.closest('.rep-fila[data-inv-producto]');
      if (row) openFromRow(row);
    });
    list.addEventListener('keydown', event => {
      if (event.target.closest('.bc-m53-variant-details')) { event.stopPropagation(); return; }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('.rep-fila[data-inv-producto]');
      if (!row) return;
      event.preventDefault();
      openFromRow(row);
    });
    new MutationObserver(tagRows).observe(list, { childList: true, subtree: true });
    tagRows();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();