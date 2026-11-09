// BattleCruiser · Transferencias múltiples en una sola operación.
(function () {
  'use strict';
  if (window.__BC_MOVIMIENTO_MULTIPLE__) return;
  window.__BC_MOVIMIENTO_MULTIPLE__ = true;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function productos() {
    const rows = (typeof _cache !== 'undefined' && Array.isArray(_cache.productos)) ? _cache.productos : [];
    return typeof productosOperativos === 'function' ? productosOperativos(rows) : rows.filter(p => !p.inventario_mixto || !!p.producto_padre_id);
  }
  function almacenes() { return (typeof _cache !== 'undefined' && Array.isArray(_cache.almacenes)) ? _cache.almacenes : []; }
  function stockDisponible(productId, warehouseId) {
    if (typeof window.stockDisponibleOrigen === 'function') return window.stockDisponibleOrigen(productId, warehouseId);
    const snapshot = window.__BC_TRANSFER_STOCK_SNAPSHOT__;
    const rows = Array.isArray(snapshot) ? snapshot : ((typeof _cache !== 'undefined' && Array.isArray(_cache.stock)) ? _cache.stock : []);
    const row = rows.find(s => String(s.producto_id) === String(productId) && String(s.almacen_id) === String(warehouseId));
    if (Array.isArray(snapshot)) return { cantidad: row ? Number(row.cantidad) || 0 : 0, aproximado: false };
    return row ? { cantidad: Number(row.cantidad) || 0, aproximado: false } : null;
  }
  function fmt(v) { return typeof window.numberFmt === 'function' ? window.numberFmt(v) : String(v == null ? 0 : v); }
  let lineas = [], enviando = false, selectors = null, catalogosRefreshPromise = null, stockRefreshPromise = null;
  if (!Array.isArray(window.__BC_TRANSFER_STOCK_SNAPSHOT__)) window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
  if (typeof window.__BC_TRANSFER_STOCK_CONFIRMED__ !== 'boolean') window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
  if (typeof window.__BC_TRANSFER_STOCK_USER_ID__ !== 'string') window.__BC_TRANSFER_STOCK_USER_ID__ = null;

  function feedback(message, success) {
    const el = document.getElementById('mov-multiple-msg');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'msg mov-transfer-feedback' + (success ? ' success' : message ? ' error' : '');
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  }
  function producto(id) { return productos().find(p => String(p.id) === String(id)) || null; }

  function poblarSelects() {
    if (!selectors) return;
    const old = { o: selectors.origin.value, d: selectors.destination.value, p: selectors.product.value };
    const as = almacenes(), ps = productos().filter(p => p.activo !== false && p.estado !== false);
    selectors.origin.innerHTML = '<option value="" disabled selected hidden>Origen</option>' + as.map(a => '<option value="' + esc(a.id) + '">' + esc(a.nombre) + '</option>').join('');
    selectors.destination.innerHTML = '<option value="" disabled selected hidden>Destino</option>' + as.map(a => '<option value="' + esc(a.id) + '">' + esc(a.nombre) + '</option>').join('');
    selectors.product.innerHTML = '<option value="" disabled selected hidden>Producto</option>' + ps.map(p => '<option value="' + esc(p.id) + '">' + esc(p.nombre) + '</option>').join('');
    if (as.some(a => String(a.id) === old.o)) selectors.origin.value = old.o;
    if (as.some(a => String(a.id) === old.d)) selectors.destination.value = old.d;
    if (ps.some(p => String(p.id) === old.p)) selectors.product.value = old.p;
  }
  function asegurarCatalogos() {
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('transferencias','crear')) {
      window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
      window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
      window.__BC_TRANSFER_STOCK_USER_ID__ = null;
      window.__BC_TRANSFER_STOCK_ERROR__ = 'Tu usuario no tiene permiso para crear transferencias.';
      return Promise.resolve();
    }
    if (catalogosRefreshPromise) return catalogosRefreshPromise;
    catalogosRefreshPromise = (async function () {
      poblarSelects();
      const api = window.client || (typeof client !== 'undefined' ? client : null);
      if (!api || !api.auth || typeof api.auth.getSession !== 'function') {
        window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
        window.__BC_TRANSFER_STOCK_ERROR__ = 'Cliente Supabase no disponible.';
        return;
      }
      try {
        const authState = await api.auth.getSession();
        if (!authState || authState.error || !authState.data || !authState.data.session || !authState.data.session.user) {
          window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
          window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
          window.__BC_TRANSFER_STOCK_USER_ID__ = null;
          return;
        }
        const currentUserId = String(authState.data.session.user.id || '');
        if (window.__BC_TRANSFER_STOCK_USER_ID__ !== currentUserId) {
          window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
          window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
          window.__BC_TRANSFER_STOCK_USER_ID__ = currentUserId;
        }
      } catch (_) {
        window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
        window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
        window.__BC_TRANSFER_STOCK_USER_ID__ = null;
        return;
      }
      try {
        if (!almacenes().length && typeof window.refrescarAlmacenes === 'function') await window.refrescarAlmacenes();
        if (!productos().length && typeof window.refrescarProductos === 'function') await window.refrescarProductos();
        if (navigator.onLine && window.__BC_TRANSFER_STOCK_CONFIRMED__ !== true) await actualizarInventarioConfirmado();
      } catch (error) {
        window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
        window.__BC_TRANSFER_STOCK_ERROR__ = error && error.message ? error.message : 'No se pudieron cargar los catálogos de transferencia.';
        console.warn('[BattleCruiser] No se pudieron cargar catálogos de transferencia:', error);
      }
      poblarSelects(); actualizarStockHint();
    })();
    return catalogosRefreshPromise.finally(function () { catalogosRefreshPromise = null; });
  }
  async function ejecutarActualizacionInventarioConfirmado() {
    const api = window.client || (typeof client !== 'undefined' ? client : null);
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('transferencias','crear')) {
      window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
      window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
      window.__BC_TRANSFER_STOCK_USER_ID__ = null;
      window.__BC_TRANSFER_STOCK_ERROR__ = 'Tu usuario no tiene permiso para crear transferencias.';
      return false;
    }
    if (!navigator.onLine || !api || !api.auth || typeof api.auth.getSession !== 'function' || typeof api.rpc !== 'function') {
      window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
      window.__BC_TRANSFER_STOCK_ERROR__ = 'No hay conexión o cliente Supabase autenticado disponible.';
      return false;
    }
    try {
      const auth = await api.auth.getSession();
      if (!auth || auth.error || !auth.data || !auth.data.session || !auth.data.session.user || !auth.data.session.access_token) {
        window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
        window.__BC_TRANSFER_STOCK_ERROR__ = 'No hay una sesión autenticada activa.';
        return false;
      }
      const expiry = Number(auth.data.session.expires_at || 0) * 1000;
      if (expiry && expiry < Date.now() + 30000 && typeof api.auth.refreshSession === 'function') {
        const refreshed = await api.auth.refreshSession();
        if (!refreshed || refreshed.error || !refreshed.data || !refreshed.data.session || !refreshed.data.session.access_token) {
          throw (refreshed && refreshed.error) || new Error('No se pudo renovar la sesión.');
        }
      }
      const request = api.rpc('bc_stock_operativo');
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Supabase tardó demasiado al consultar las existencias (20 s).')), 20000);
        Promise.resolve(request).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
      });
      if (result && result.error) throw result.error;
      if (!result || !Array.isArray(result.data)) throw new Error('Supabase no devolvió una lista válida de existencias.');
      window.__BC_TRANSFER_STOCK_SNAPSHOT__ = result.data.map(row => ({
        id: row.id, producto_id: row.producto_id, almacen_id: row.almacen_id,
        cantidad: row.cantidad, minimo: row.minimo, producto_nombre: row.producto_nombre, almacen_nombre: row.almacen_nombre
      }));
      window.__BC_TRANSFER_STOCK_USER_ID__ = auth.data.session.user.id;
      window.__BC_TRANSFER_STOCK_CONFIRMED__ = true;
      window.__BC_TRANSFER_STOCK_ERROR__ = null;
      window.__BC_TRANSFER_STOCK_LAST_SYNC__ = Date.now();
      poblarSelects(); actualizarStockHint();
      return true;
    } catch (error) {
      window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
      window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
      window.__BC_TRANSFER_STOCK_ERROR__ = error && error.message ? error.message : 'Error al leer el inventario desde Supabase.';
      return false;
    }
  }
  function actualizarInventarioConfirmado() {
    if (stockRefreshPromise) return stockRefreshPromise;
    const request = ejecutarActualizacionInventarioConfirmado();
    stockRefreshPromise = request.finally(function () { stockRefreshPromise = null; });
    return stockRefreshPromise;
  }
  window.__BC_TRANSFER_STOCK_REFRESH__ = actualizarInventarioConfirmado;

  function validarStock(id, amount, source) {
    if (window.__BC_TRANSFER_STOCK_CONFIRMED__ !== true) {
      const detail = window.__BC_TRANSFER_STOCK_ERROR__ ? ' Detalle: ' + String(window.__BC_TRANSFER_STOCK_ERROR__) : '';
      return { ok: false, message: 'No se ha confirmado una lectura reciente del inventario desde Supabase. Actualiza existencias antes de transferir.' + detail };
    }
    const info = stockDisponible(id, source);
    if (!info) return { ok: true, info: null };
    const available = Number(info.cantidad) || 0;
    return available < amount
      ? { ok: false, message: 'Stock insuficiente. Disponible: ' + fmt(available) + (info.aproximado ? ' · estimado con pendientes' : '') + '.' }
      : { ok: true, info };
  }
  function actualizarStockHint() {
    const hint = document.getElementById('mov-multiple-stock');
    if (!hint || !selectors) return;
    if (!selectors.origin.value || !selectors.product.value) {
      hint.textContent = 'El stock se valida en el almacén de origen.'; hint.className = 'muted mov-transfer-stock'; return;
    }
    if (window.__BC_TRANSFER_STOCK_CONFIRMED__ !== true) {
      hint.textContent = window.__BC_TRANSFER_STOCK_ERROR__ ? 'Existencias sin confirmar: ' + window.__BC_TRANSFER_STOCK_ERROR__ : 'Actualiza existencias para consultar el stock real.';
      hint.className = 'muted mov-transfer-stock is-low'; return;
    }
    const info = stockDisponible(selectors.product.value, selectors.origin.value);
    if (!info) { hint.textContent = 'Stock disponible: no confirmado en la caché actual.'; hint.className = 'muted mov-transfer-stock'; return; }
    hint.textContent = 'Disponible en origen: ' + fmt(info.cantidad) + (info.aproximado ? ' · estimado con operaciones pendientes' : '');
    hint.className = 'muted mov-transfer-stock' + (Number(info.cantidad) <= 0 ? ' is-low' : '');
  }
  function render() {
    const host = document.getElementById('mov-multiple-lineas'), count = document.getElementById('mov-multiple-count');
    if (!host) return;
    host.innerHTML = lineas.length ? lineas.map((l, i) =>
      '<div class="mov-transfer-line"><span class="mov-transfer-line-name"><strong>' + esc(l.nombre) + '</strong></span>' +
      '<span class="mov-transfer-line-qty">' + fmt(l.cantidad) + ' u</span>' +
      '<button type="button" data-mov-remove="' + i + '" aria-label="Quitar ' + esc(l.nombre) + '">×</button></div>'
    ).join('') : '<p class="mov-transfer-empty">Añade los productos que viajarán en esta transferencia.</p>';
    if (count) count.textContent = fmt(lineas.length);
    host.querySelectorAll('[data-mov-remove]').forEach(b => b.addEventListener('click', () => { lineas.splice(Number(b.dataset.movRemove), 1); render(); }));
  }
  async function agregarLinea() {
    if (window.__BC_TRANSFER_STOCK_CONFIRMED__ !== true) {
      feedback('Consultando existencias actuales en Supabase…', true);
      if (!(await actualizarInventarioConfirmado())) {
        return feedback('No se pudo confirmar el inventario. ' + (window.__BC_TRANSFER_STOCK_ERROR__ || 'Comprueba la conexión y vuelve a intentar.'), false);
      }
    }
    const id = selectors.product.value, source = selectors.origin.value, dest = selectors.destination.value;
    const amount = Number(selectors.quantity.value), prod = producto(id);
    if (!source || !dest) return feedback('Selecciona origen y destino.', false);
    if (String(source) === String(dest)) return feedback('El origen y el destino deben ser distintos.', false);
    if (!prod || !(amount > 0) || !Number.isFinite(amount)) return feedback('Selecciona un producto y una cantidad válida.', false);
    const existing = lineas.find(l => String(l.producto_id) === String(id));
    const total = amount + (existing ? existing.cantidad : 0), stock = validarStock(id, total, source);
    if (!stock.ok) return feedback(prod.nombre + ': ' + stock.message, false);
    if (existing) existing.cantidad = total; else lineas.push({ producto_id: prod.id, nombre: prod.nombre, cantidad: amount });
    selectors.quantity.value = ''; feedback('', true); render(); actualizarStockHint(); selectors.product.focus();
  }
  async function confirmarTransferencia() {
    if (enviando) return;
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('transferencias', 'crear')) return feedback('Tu usuario no tiene permiso para registrar transferencias.', false);
    const source = selectors.origin.value, dest = selectors.destination.value;
    if (!source || !dest) return feedback('Selecciona el origen y el destino.', false);
    if (String(source) === String(dest)) return feedback('El origen y el destino deben ser distintos.', false);
    if (!lineas.length) return feedback('Agrega al menos un producto antes de registrar.', false);
    feedback('Confirmando las existencias actuales desde Supabase…', true);
    if (!(await actualizarInventarioConfirmado())) {
      return feedback('No se puede registrar la transferencia sin confirmar el inventario. ' + (window.__BC_TRANSFER_STOCK_ERROR__ || 'Reintenta la lectura.'), false);
    }
    for (const item of lineas) {
      const valid = validarStock(item.producto_id, item.cantidad, source);
      if (!valid.ok) return feedback(item.nombre + ': ' + valid.message, false);
    }
    const summary = lineas.length + (lineas.length === 1 ? ' producto' : ' productos');
    if (!window.confirm('¿Registrar una transferencia con ' + summary + '? El stock se moverá entre almacenes.')) return;
    const button = document.getElementById('mov-multiple-confirmar');
    enviando = true; if (button) { button.disabled = true; button.textContent = 'Procesando…'; }
    try {
      const result = await window.ejecutarOperacion('transferencia', {
        p_origen_id: source, p_destino_id: dest,
        p_lineas: lineas.map(item => ({ producto_id: item.producto_id, cantidad: item.cantidad }))
      });
      if (!result || !result.ok) throw (result && result.error) || new Error('No se pudo registrar la transferencia.');
      if (result.offline) feedback('✓ Transferencia guardada en este dispositivo; se sincronizará al recuperar la conexión.', true);
      else {
        feedback('✓ Transferencia registrada. Se movieron ' + summary + ' en una sola operación.', true);
        if (typeof window.refrescarTransferencias === 'function') await window.refrescarTransferencias();
        await actualizarInventarioConfirmado();
      }
      lineas = []; render(); actualizarStockHint();
    } catch (error) {
      const detail = typeof window.explicarError === 'function' ? window.explicarError(error, 'transferencia') : (error && error.message || 'error desconocido');
      feedback('No se pudo registrar la transferencia: ' + detail, false);
    } finally { enviando = false; if (button) { button.disabled = false; button.textContent = 'Registrar transferencia'; } }
  }
  function injectStyles() {
    if (document.getElementById('mov-transfer-css')) return;
    const style = document.createElement('style'); style.id = 'mov-transfer-css';
    style.textContent =
      '#movimiento-multiple-panel{margin:0;padding:0;background:transparent;border:0;display:flex;flex-direction:column;gap:9px}' +
      '#movimiento-multiple-panel .mov-transfer-intro{margin:0;color:var(--mist);font-size:.78rem;line-height:1.35}' +
      '#movimiento-multiple-panel .mov-transfer-warehouses{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}' +
      '#movimiento-multiple-panel .mov-transfer-warehouses label,#movimiento-multiple-panel .mov-transfer-line-editor label{display:grid;gap:4px;min-width:0}' +
      '#movimiento-multiple-panel .mov-transfer-warehouses label>span,#movimiento-multiple-panel .mov-transfer-line-editor label>span{font-size:11px;color:var(--mist)}' +
      '#movimiento-multiple-panel .mov-transfer-line-editor{display:grid;grid-template-columns:minmax(0,1fr) 104px auto;gap:7px;align-items:center}' +
      '#movimiento-multiple-panel select,#movimiento-multiple-panel input{width:100%;height:42px;min-width:0;box-sizing:border-box;padding:0 10px;border:1px solid rgba(212,176,92,.32);border-radius:7px;background:var(--void,#0c1c18);color:var(--text);font-size:.82rem}' +
      '#movimiento-multiple-panel button{min-height:40px;padding:8px 12px;border:1px solid rgba(212,176,92,.28);border-radius:7px;background:var(--stone-2);color:var(--text);font-weight:600;cursor:pointer}' +
      '#movimiento-multiple-panel #mov-multiple-add,#movimiento-multiple-panel #mov-multiple-confirmar{background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#211605;border:0}' +
      '#movimiento-multiple-panel .mov-transfer-stock{margin:-3px 0 0;font-size:.72rem;min-height:1em}' +
      '#movimiento-multiple-panel .mov-transfer-stock.is-low{color:#e0a06f}' +
      '#movimiento-multiple-panel #mov-multiple-refresh-stock{min-height:34px;padding:6px 10px;font-size:.72rem;justify-self:start}' +
      '#movimiento-multiple-panel .mov-transfer-lines-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 0;font-size:.72rem;letter-spacing:.04em}' +
      '#movimiento-multiple-panel .mov-transfer-lines{display:flex;flex-direction:column;gap:5px;max-height:160px;overflow:auto}' +
      '#movimiento-multiple-panel .mov-transfer-line{display:grid;grid-template-columns:minmax(0,1fr) auto 32px;gap:8px;align-items:center;padding:7px 8px;background:var(--void,#0c1c18);border:1px solid rgba(212,176,92,.16);border-radius:7px;font-size:.78rem}' +
      '#movimiento-multiple-panel .mov-transfer-line-name{min-width:0;overflow-wrap:anywhere}#movimiento-multiple-panel .mov-transfer-line-qty{white-space:nowrap;color:var(--mist)}' +
      '#movimiento-multiple-panel .mov-transfer-line button{min-height:30px;width:30px;padding:0;font-size:19px}' +
      '#movimiento-multiple-panel .mov-transfer-empty{margin:0;padding:9px 10px;border:1px dashed rgba(212,176,92,.22);border-radius:7px;color:var(--mist);font-size:.75rem}' +
      '#movimiento-multiple-panel .mov-transfer-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}' +
      '#movimiento-multiple-panel .mov-transfer-feedback{margin:0;min-height:1em;font-size:.76rem}' +
      '@media(max-width:420px){#movimiento-multiple-panel .mov-transfer-line-editor{grid-template-columns:minmax(0,1fr) 96px}#movimiento-multiple-panel #mov-multiple-add{grid-column:1/-1}}';
    document.head.appendChild(style);
  }
  function init() {
    const legacyForm = document.getElementById('form-transferencia');
    if (!legacyForm || document.getElementById('movimiento-multiple-panel')) return;
    if (!legacyForm.closest('#tab-transferencias')) return;
    injectStyles();
    const panel = document.createElement('section'); panel.id = 'movimiento-multiple-panel';
    panel.className = 'movimiento-vale-panel'; panel.setAttribute('aria-label', 'Nueva transferencia con varios productos');
    panel.innerHTML =
      '<p class="mov-transfer-intro">Agrupa varios productos del mismo origen al mismo destino. Se registra una sola transferencia.</p>' +
      '<div class="mov-transfer-warehouses"><label><span>Origen</span><select id="mov-multiple-origen" aria-label="Almacén de origen"><option value="" disabled selected hidden>Seleccionar origen</option></select></label>' +
      '<label><span>Destino</span><select id="mov-multiple-destino" aria-label="Almacén de destino"><option value="" disabled selected hidden>Seleccionar destino</option></select></label></div>' +
      '<div class="mov-transfer-line-editor"><label><span>Producto</span><select id="mov-multiple-producto" aria-label="Producto"><option value="" disabled selected hidden>Seleccionar producto</option></select></label>' +
      '<input id="mov-multiple-cantidad" type="number" min="0.0001" step="any" inputmode="decimal" placeholder="Cantidad" aria-label="Cantidad a transferir">' +
      '<button type="button" id="mov-multiple-add">+ Agregar</button></div>' +
      '<p id="mov-multiple-stock" class="muted mov-transfer-stock">El stock se valida en el almacén de origen.</p>' +
      '<button type="button" id="mov-multiple-refresh-stock">Actualizar existencias</button>' +
      '<div class="mov-transfer-lines-head"><strong>PRODUCTOS DE LA TRANSFERENCIA</strong><span><b id="mov-multiple-count">0</b> líneas</span></div>' +
      '<div id="mov-multiple-lineas" class="mov-transfer-lines"></div>' +
      '<div class="mov-transfer-actions"><button type="button" id="mov-multiple-confirmar">Registrar transferencia</button><button type="button" id="mov-multiple-limpiar">Limpiar</button></div>' +
      '<p id="mov-multiple-msg" class="msg mov-transfer-feedback" role="status" aria-live="polite"></p>';
    legacyForm.parentNode.insertBefore(panel, legacyForm); legacyForm.style.display = 'none'; legacyForm.setAttribute('aria-hidden', 'true');
    selectors = {
      origin: panel.querySelector('#mov-multiple-origen'), destination: panel.querySelector('#mov-multiple-destino'),
      product: panel.querySelector('#mov-multiple-producto'), quantity: panel.querySelector('#mov-multiple-cantidad')
    };
    selectors.origin.addEventListener('change', actualizarStockHint);
    selectors.product.addEventListener('change', actualizarStockHint);
    selectors.destination.addEventListener('change', function () {
      if (selectors.origin.value && selectors.origin.value === selectors.destination.value) feedback('El origen y el destino deben ser distintos.', false);
      else feedback('', true);
    });
    selectors.quantity.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarLinea(); } });
    panel.querySelector('#mov-multiple-add').addEventListener('click', agregarLinea);
    panel.querySelector('#mov-multiple-refresh-stock').addEventListener('click', async function () {
      const button = this;
      button.disabled = true; button.textContent = 'Actualizando…';
      feedback('Leyendo existencias directamente desde Supabase…', true);
      const ok = await actualizarInventarioConfirmado();
      button.disabled = false; button.textContent = 'Actualizar existencias';
      feedback(ok ? '✓ Inventario actualizado y confirmado desde Supabase.' :
        'No se pudo confirmar el inventario. ' + (window.__BC_TRANSFER_STOCK_ERROR__ || 'Comprueba la conexión y vuelve a intentar.'), ok);
    });
    panel.querySelector('#mov-multiple-confirmar').addEventListener('click', confirmarTransferencia);
    panel.querySelector('#mov-multiple-limpiar').addEventListener('click', function () {
      lineas = []; selectors.quantity.value = ''; feedback('Lista limpiada.', true); render(); actualizarStockHint();
    });
    window.__BC_MOVIMIENTO_MULTIPLE_REFRESH__ = asegurarCatalogos;
    window.__BC_MOVIMIENTO_MULTIPLE_STATE__ = () => ({ lineas: lineas.map(x => Object.assign({}, x)), enviando });
    // The movement editor may initialize before Auth restores a saved session.
    // Retry the catalogue and authoritative stock read after Supabase emits a
    // session event; never relax RLS or fall back to anon table grants.
    try {
      const api = window.client || (typeof client !== 'undefined' ? client : null);
      if (api && api.auth && typeof api.auth.onAuthStateChange === 'function') {
        api.auth.onAuthStateChange(function (event, session) {
          if (event === 'SIGNED_OUT' || !session) {
            window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
            window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
            window.__BC_TRANSFER_STOCK_USER_ID__ = null;
            window.__BC_TRANSFER_STOCK_ERROR__ = 'La sesión terminó; vuelve a autenticarte para leer existencias.';
            actualizarStockHint();
            return;
          }
          if (!['SIGNED_IN', 'INITIAL_SESSION', 'TOKEN_REFRESHED'].includes(event)) return;
          window.setTimeout(async function () {
            try { await asegurarCatalogos(); }
            finally { poblarSelects(); actualizarStockHint(); }
          }, 0);
        });
      }
    } catch (error) {
      console.warn('[BattleCruiser] No se pudo enlazar el refresco de Transferencias con Auth:', error);
    }
    window.addEventListener('offline', function () {
      window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
      window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
      window.__BC_TRANSFER_STOCK_ERROR__ = 'Sin conexión: se requiere una nueva lectura al reconectar.';
      actualizarStockHint();
    });
    window.addEventListener('online', function () {
      window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
      window.__BC_TRANSFER_STOCK_ERROR__ = null;
      asegurarCatalogos();
    });
    window.addEventListener('bc:data-changed', function (event) {
      const detail = event.detail || {};
      const domains = detail.domains || [];
      if (!['products', 'warehouses', 'stock', 'inventory', 'categories'].some(domain => domains.includes(domain))) return;
      if (detail.offline || !navigator.onLine) {
        window.__BC_TRANSFER_STOCK_CONFIRMED__ = false;
        window.__BC_TRANSFER_STOCK_SNAPSHOT__ = null;
        window.__BC_TRANSFER_STOCK_ERROR__ = 'Sin conexión: se requiere una nueva lectura al reconectar.';
        actualizarStockHint(); return;
      }
      // Nueva compra ya espera su refresco forzado al terminar. Para las demás
      // mutaciones volvemos a leer stock de Supabase antes de recalcular transferencias.
      if (!detail.remote && detail.operation === 'compra') return;
      window.setTimeout(async function () {
        try {
          if (domains.includes('products') && typeof window.refrescarProductos === 'function') await window.refrescarProductos();
          if (domains.includes('warehouses') && typeof window.refrescarAlmacenes === 'function') await window.refrescarAlmacenes();
          if (domains.includes('stock') || domains.includes('inventory')) await actualizarInventarioConfirmado();
          else await asegurarCatalogos();
        } catch (error) {
          console.warn('[BattleCruiser] No se pudo sincronizar inventario en Transferencias:', error);
        }
        poblarSelects();
        actualizarStockHint();
      }, 180);
    });
    asegurarCatalogos(); render();
  }
  window.__BC_MOVIMIENTO_MULTIPLE_BOOT__ = init;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();