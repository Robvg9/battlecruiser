/* BattleCruiser — mandatory Jornada price-change count gate. */
(function () {
  'use strict';
  if (window.__BC_JORNADA_PRICE_CHANGES__) return;
  window.__BC_JORNADA_PRICE_CHANGES__ = true;

  const STYLE_ID = 'bc-jpc-style';
  const MODAL_ID = 'bc-jpc-owner-modal';
  const GATE_ID = 'bc-jpc-attendant-gate';
  let contexts = [];
  let currentGate = null;
  let refreshing = false;
  let ownerBusy = false;
  let workerBusy = false;
  let priorBodyOverflow = '';

  function getDbClient() {
    try {
      if (typeof client !== 'undefined' && client && typeof client.rpc === 'function') return client;
      if (window.client && typeof window.client.rpc === 'function') return window.client;
      if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient && typeof window.supabaseClient.rpc === 'function') return window.supabaseClient;
    } catch (_) {}
    return null;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    try { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n); }
    catch (_) { return String(n); }
  }

  function rpc(name, params) {
    const db = getDbClient();
    if (!db) return Promise.reject(new Error('La conexión de BattleCruiser aún no está preparada.'));
    if (!navigator.onLine) return Promise.reject(new Error('Conéctate a Internet para realizar esta operación.'));
    return db.rpc(name, params || {}).then(function (response) {
      if (response && response.error) throw response.error;
      return response ? response.data : null;
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.bc-jpc-trigger{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--gold-dim,#a78a52);border-radius:8px;padding:10px 13px;background:var(--panel,#17191d);color:var(--text,#f2eee5);font:600 13px inherit;cursor:pointer;margin:8px 0 12px}',
      '.bc-jpc-trigger:hover{border-color:var(--gold,#c5a66a)}',
      '.bc-jpc-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.78);overflow:auto}',
      '.bc-jpc-dialog{width:min(780px,100%);max-height:min(92dvh,900px);display:flex;flex-direction:column;background:var(--panel,#17191d);color:var(--text,#f2eee5);border:1px solid var(--gold-dim,#8b754c);border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.48);overflow:hidden}',
      '.bc-jpc-head{padding:15px 17px;border-bottom:1px solid var(--line,rgba(255,255,255,.12));display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.bc-jpc-head h3{margin:0;font-size:17px}.bc-jpc-head p{margin:5px 0 0;color:var(--muted,#a9a9a9);font-size:12px;line-height:1.45}',
      '.bc-jpc-body{padding:14px 16px;overflow:auto;min-height:0}',
      '.bc-jpc-field{display:flex;flex-direction:column;gap:5px;margin:0 0 11px;font-size:12px;color:var(--muted,#c0c0c0)}',
      '.bc-jpc-field input,.bc-jpc-field select,.bc-jpc-product input{width:100%;min-width:0;background:var(--input-bg,#101215);border:1px solid var(--line,rgba(255,255,255,.16));border-radius:7px;color:var(--text,#f2eee5);padding:9px;font:inherit}',
      '.bc-jpc-summary{padding:9px 11px;border-radius:8px;background:rgba(180,150,90,.09);font-size:12px;line-height:1.5;margin:8px 0 13px}',
      '.bc-jpc-search{margin:8px 0 10px}',
      '.bc-jpc-products{display:grid;gap:7px}',
      '.bc-jpc-product{display:grid;grid-template-columns:24px minmax(0,1fr) 118px minmax(220px,260px);align-items:center;gap:10px;padding:10px;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:9px}',
      '.bc-jpc-product-name{min-width:0}.bc-jpc-product-name strong{display:block;font-size:13px}.bc-jpc-product-name small{display:block;color:var(--muted,#aaa);font-size:11px;margin-top:2px}',
      '.bc-jpc-product-price{font-size:12px;display:flex;flex-direction:column;gap:4px;white-space:nowrap}.bc-jpc-product-price small{color:var(--muted,#aaa);font-size:10px}',
      '.bc-jpc-product-fields{display:grid;grid-template-columns:1fr;gap:6px}.bc-jpc-product-fields label{display:flex;align-items:center;gap:7px;font-size:10px;color:var(--muted,#aaa)}.bc-jpc-product-fields label span{flex:0 0 76px}.bc-jpc-product-fields input{flex:1;min-width:0;width:100%;padding:8px;font-size:13px}',
      '.bc-jpc-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line,rgba(255,255,255,.12))}',
      '.bc-jpc-btn{border:1px solid var(--line,rgba(255,255,255,.18));border-radius:8px;padding:10px 13px;background:transparent;color:var(--text,#f2eee5);font-weight:600;cursor:pointer}',
      '.bc-jpc-btn.primary{background:var(--gold,#a88a50);border-color:var(--gold,#a88a50);color:#171717}.bc-jpc-btn:disabled{opacity:.5;cursor:wait}',
      '.bc-jpc-close{font-size:22px;line-height:1;border:0;background:transparent;color:var(--muted,#aaa);cursor:pointer}',
      '.bc-jpc-status{font-size:12px;line-height:1.5;margin:8px 0;color:var(--muted,#b8b8b8)}.bc-jpc-status.error{color:#ff9d9d}.bc-jpc-status.success{color:#a4dfb6}',
      '.bc-jpc-gate .bc-jpc-dialog{width:min(620px,100%);border-color:#bd8d43}.bc-jpc-gate .bc-jpc-body{padding:16px}',
      '.bc-jpc-count-row{display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:12px;align-items:center;border:1px solid var(--line,rgba(255,255,255,.14));border-radius:9px;padding:11px;margin:8px 0}',
      '.bc-jpc-count-row strong{display:block;font-size:13px}.bc-jpc-count-row small{display:block;color:var(--muted,#aaa);font-size:11px;margin-top:3px}',
      '.bc-jpc-count-row input{width:100%;background:var(--input-bg,#101215);border:1px solid var(--line,rgba(255,255,255,.18));border-radius:7px;color:var(--text,#f2eee5);padding:10px;font-size:16px}',
      '.bc-jpc-required{font-size:11px;color:#e4bf7e;margin:8px 0 0}',
      '@media(max-width:560px){.bc-jpc-overlay{padding:6px}.bc-jpc-dialog{max-height:96dvh;border-radius:10px}.bc-jpc-product{grid-template-columns:22px minmax(0,1fr) 90px}.bc-jpc-product-price{grid-column:2;grid-row:2;text-align:left}.bc-jpc-product input{grid-column:3;grid-row:1/3}.bc-jpc-count-row{grid-template-columns:minmax(0,1fr) 108px}.bc-jpc-head{padding:12px}.bc-jpc-body{padding:12px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureOwnerButton() {
    const tab = document.getElementById('tab-movimientos');
    if (!tab) return;
    injectStyles();
    let button = tab.querySelector('[data-bc-jpc-owner-open]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'bc165-action';
      button.setAttribute('data-bc-jpc-owner-open', '1');
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18"/></svg><span class="bc165-sr-only">Cambios de precio</span>';
      button.setAttribute('aria-label', 'Cambios de precio');
      button.title = 'Cambios de precio';
      const hero = tab.querySelector('.bc-m51-hero');
      let actions = hero && hero.querySelector('.bc165-actions');
      if (!actions && hero) { actions = document.createElement('div'); actions.className = 'bc165-actions'; hero.appendChild(actions); }
      if (actions) actions.appendChild(button);
      else tab.prepend(button);
      button.addEventListener('click', openOwnerModal);
    }
    rpc('bc_actor_is_admin', {}).then(function (isAdmin) {
      button.hidden = !isAdmin;
    }).catch(function () {
      button.hidden = true;
    });
  }

  function selectedContext() {
    const select = document.getElementById('bc-jpc-session');
    const id = select ? select.value : '';
    return contexts.find(function (item) { return String(item.sesion_id) === String(id); }) || null;
  }

  function renderOwnerProducts(context, filter) {
    const host = document.getElementById('bc-jpc-products');
    if (!host) return;
    const query = String(filter || '').trim().toLocaleLowerCase();
    const products = Array.isArray(context && context.productos) ? context.productos : [];
    const visible = products.filter(function (item) {
      return !query || String(item.nombre || '').toLocaleLowerCase().includes(query);
    });
    host.innerHTML = visible.map(function (item) {
      const checkboxId = 'bc-jpc-select-' + item.producto_id;
      return '<div class="bc-jpc-product">' +
        '<input type="checkbox" id="' + esc(checkboxId) + '" data-bc-jpc-select="' + esc(item.producto_id) + '">' +
        '<label for="' + esc(checkboxId) + '" class="bc-jpc-product-name"><strong>' + esc(item.nombre) + '</strong><small>' + esc(item.unidad || 'unidad') + ' · Stock de sistema: ' + esc(money(item.stock_sistema)) + '</small></label>' +
        '<span class="bc-jpc-product-price"><span>Venta actual: <b>' + esc(money(item.precio_actual)) + '</b></span><small>Costo actual: ' + esc(item.costo_actual==null?'Sin costo':money(item.costo_actual)) + '</small></span>' +
        '<div class="bc-jpc-product-fields"><label><span>Nuevo precio</span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Precio de venta" data-bc-jpc-price="' + esc(item.producto_id) + '" aria-label="Nuevo precio de venta de ' + esc(item.nombre) + '"></label>' +
        '<label><span>Nuevo costo (opcional)</span><input type="number" min="0" step="0.0001" inputmode="decimal" placeholder="Sin cambio" data-bc-jpc-cost="' + esc(item.producto_id) + '" aria-label="Nuevo costo unitario de ' + esc(item.nombre) + '"></label></div>' +
      '</div>';
    }).join('') || '<p class="bc-jpc-status">No hay productos que coincidan con la búsqueda.</p>';
    host.querySelectorAll('[data-bc-jpc-select]').forEach(function (box) {
      box.addEventListener('change', function () {
        const input = host.querySelector('[data-bc-jpc-price="' + CSS.escape(box.dataset.bcJpcSelect) + '"]');
        const cost = host.querySelector('[data-bc-jpc-cost="' + CSS.escape(box.dataset.bcJpcSelect) + '"]');
        if (input) input.disabled = !box.checked;
        if (cost) cost.disabled = !box.checked;
      });
    });
    host.querySelectorAll('[data-bc-jpc-price],[data-bc-jpc-cost]').forEach(function (input) { input.disabled = true; });
    const summary = document.getElementById('bc-jpc-session-summary');
    if (summary) summary.textContent = context.almacen_nombre + ' · ' + context.fecha + ' · Responsable asignada: ' + (context.responsable_id ? String(context.responsable_id).slice(0, 8) : 'sin identificar') + '. Los cambios esperarán al conteo físico de la dependienta.';
  }

  function ownerModalHtml() {
    const options = contexts.map(function (item) {
      return '<option value="' + esc(item.sesion_id) + '">' + esc(item.almacen_nombre) + ' · ' + esc(item.fecha) + ' · Jornada ' + esc(item.sesion_id.slice(0, 8)) + '</option>';
    }).join('');
    return '<div class="bc-jpc-overlay bc165-overlay" id="' + MODAL_ID + '">' +
      '<section class="bc-jpc-dialog bc165-modal" role="dialog" aria-modal="true" aria-labelledby="bc-jpc-owner-title">' +
        '<header class="bc-jpc-head bc165-head"><div><h3 id="bc-jpc-owner-title">Cambios de precio</h3><p>Selecciona uno o varios productos. El precio no cambia hasta que la dependienta cuente el stock físico.</p></div><button type="button" class="bc-jpc-close" data-bc-jpc-close aria-label="Cerrar">×</button></header>' +
        '<div class="bc-jpc-body">' +
          '<label class="bc-jpc-field">Jornada activa<select id="bc-jpc-session">' + options + '</select></label>' +
          '<div class="bc-jpc-summary" id="bc-jpc-session-summary"></div>' +
          '<label class="bc-jpc-field bc-jpc-search">Buscar producto<input id="bc-jpc-search" type="search" placeholder="Escribe el nombre del producto"></label>' +
          '<div id="bc-jpc-products" class="bc-jpc-products"></div>' +
          '<label class="bc-jpc-field" style="margin-top:13px">Motivo del cambio<textarea id="bc-jpc-reason" rows="2" maxlength="500" placeholder="Ej.: actualización de precios de venta"></textarea></label>' +
          '<p class="bc-jpc-status" id="bc-jpc-owner-status" role="status" aria-live="polite"></p>' +
        '</div>' +
        '<footer class="bc-jpc-actions"><button type="button" class="bc-jpc-btn" data-bc-jpc-close>Cancelar</button><button type="button" class="bc-jpc-btn primary" id="bc-jpc-submit">Solicitar conteo y cambio</button></footer>' +
      '</section></div>';
  }

  async function openOwnerModal() {
    if (ownerBusy) return;
    ownerBusy = true;
    try {
      contexts = await rpc('bc7_cambios_precio_contexto', {});
      if (!Array.isArray(contexts) || !contexts.length) {
        window.alert('No existe una jornada minorista activa con una dependienta trabajando. El cambio de precio solo se puede iniciar desde una jornada activa para exigir el conteo físico.');
        return;
      }
      injectStyles();
      document.getElementById(MODAL_ID)?.remove();
      document.body.insertAdjacentHTML('beforeend', ownerModalHtml());
      const select = document.getElementById('bc-jpc-session');
      const search = document.getElementById('bc-jpc-search');
      if (select) select.addEventListener('change', function () { renderOwnerProducts(selectedContext(), search && search.value); });
      if (search) search.addEventListener('input', function () { renderOwnerProducts(selectedContext(), search.value); });
      document.getElementById('bc-jpc-submit')?.addEventListener('click', submitOwnerChange);
      document.querySelectorAll('#' + MODAL_ID + ' [data-bc-jpc-close]').forEach(function (button) {
        button.addEventListener('click', function () { document.getElementById(MODAL_ID)?.remove(); });
      });
      renderOwnerProducts(selectedContext(), '');
      document.getElementById('bc-jpc-search')?.focus();
    } catch (error) {
      window.alert('No se pudieron cargar las jornadas y productos: ' + (error && error.message || String(error)));
    } finally {
      ownerBusy = false;
    }
  }

  async function submitOwnerChange() {
    const button = document.getElementById('bc-jpc-submit');
    const status = document.getElementById('bc-jpc-owner-status');
    const context = selectedContext();
    if (!context || !button || ownerBusy) return;
    const selected = Array.from(document.querySelectorAll('#bc-jpc-products [data-bc-jpc-select]:checked'));
    const changes = selected.map(function (check) {
      const input = document.querySelector('#bc-jpc-products [data-bc-jpc-price="' + CSS.escape(check.dataset.bcJpcSelect) + '"]');
      const cost = document.querySelector('#bc-jpc-products [data-bc-jpc-cost="' + CSS.escape(check.dataset.bcJpcSelect) + '"]');
      return { producto_id: check.dataset.bcJpcSelect, precio_nuevo: input ? input.value.trim() : '', costo_nuevo: cost && cost.value.trim()!=='' ? cost.value.trim() : null };
    });
    const reason = (document.getElementById('bc-jpc-reason')?.value || '').trim();
    if (!changes.length) {
      if (status) { status.textContent = 'Selecciona al menos un producto.'; status.className = 'bc-jpc-status error'; }
      return;
    }
    if (changes.some(function (item) { return item.precio_nuevo === '' || !Number.isFinite(Number(item.precio_nuevo)) || Number(item.precio_nuevo) < 0; })) {
      if (status) { status.textContent = 'Introduce un nuevo precio válido para cada producto seleccionado.'; status.className = 'bc-jpc-status error'; }
      return;
    }
    if (reason.length < 5) {
      if (status) { status.textContent = 'Explica el motivo del cambio (mínimo 5 caracteres).'; status.className = 'bc-jpc-status error'; }
      return;
    }
    ownerBusy = true;
    button.disabled = true;
    button.textContent = 'Enviando solicitud…';
    if (status) { status.textContent = 'Registrando la solicitud. Los precios siguen sin cambiar hasta el conteo.'; status.className = 'bc-jpc-status'; }
    try {
      const result = await rpc('bc7_solicitar_cambios_precio_jornada', {
        p_turno_sesion_id: context.sesion_id,
        p_cambios: changes,
        p_comentario: reason
      });
      if (status) { status.textContent = 'Solicitud creada para ' + Number(result && result.productos_pendientes_de_conteo || changes.length) + ' producto(s). La dependienta recibirá la ventana obligatoria de conteo.'; status.className = 'bc-jpc-status success'; }
      window.dispatchEvent(new CustomEvent('bc:data-changed', { detail: { domains: ['stock', 'products', 'movements'] } }));
      window.setTimeout(function () { document.getElementById(MODAL_ID)?.remove(); }, 1100);
    } catch (error) {
      if (status) { status.textContent = 'No se pudo crear la solicitud: ' + (error && error.message || String(error)); status.className = 'bc-jpc-status error'; }
      button.disabled = false;
      button.textContent = 'Reintentar solicitud';
    } finally {
      ownerBusy = false;
    }
  }

  function gateHtml(session) {
    const rows = Array.isArray(session.cambios) ? session.cambios : [];
    return '<div class="bc-jpc-overlay bc-jpc-gate" id="' + GATE_ID + '">' +
      '<section class="bc-jpc-dialog" role="dialog" aria-modal="true" aria-labelledby="bc-jpc-gate-title">' +
        '<header class="bc-jpc-head"><div><h3 id="bc-jpc-gate-title">Conteo obligatorio por cambio de precio</h3><p>Antes de activar los nuevos precios debes contar físicamente las existencias actuales. Las unidades que ya no estén quedarán valoradas al precio anterior.</p></div></header>' +
        '<div class="bc-jpc-body">' +
          '<div class="bc-jpc-summary">' + esc(session.fecha || '') + ' · Hay ' + rows.length + ' producto(s) pendientes. Esta ventana no se puede cerrar sin completar el conteo.</div>' +
          rows.map(function (item) {
            return '<label class="bc-jpc-count-row"><span><strong>' + esc(item.nombre) + '</strong><small>Precio anterior: ' + esc(money(item.precio_anterior)) + ' CUP · Nuevo precio: ' + esc(money(item.precio_nuevo)) + ' CUP' + (item.costo_nuevo!=null ? ' · Nuevo costo: ' + esc(money(item.costo_nuevo)) + ' CUP' : '') + '</small></span><input type="number" min="0" step="0.001" inputmode="decimal" required autocomplete="off" data-bc-jpc-count="' + esc(item.producto_id) + '" placeholder="Stock físico" aria-label="Stock físico de ' + esc(item.nombre) + '"></label>';
          }).join('') +
          '<p class="bc-jpc-required">Cuenta cada producto ahora. No introduzcas el stock de sistema: escribe lo que existe físicamente.</p>' +
          '<p class="bc-jpc-status" id="bc-jpc-gate-status" role="status" aria-live="polite"></p>' +
        '</div>' +
        '<footer class="bc-jpc-actions"><button type="button" class="bc-jpc-btn primary" id="bc-jpc-confirm-count">Confirmar conteo y activar precios</button></footer>' +
      '</section></div>';
  }

  function renderGate(sessions) {
    const session = sessions && sessions[0];
    if (!session || !Array.isArray(session.cambios) || !session.cambios.length) {
      document.getElementById(GATE_ID)?.remove();
      document.body.style.overflow = priorBodyOverflow;
      currentGate = null;
      return;
    }
    const signature = session.cambios.map(function (item) { return item.id; }).join('|');
    if (currentGate && currentGate.sesion_id === session.sesion_id &&
        currentGate._signature === signature && document.getElementById(GATE_ID)) return;
    session._signature = signature;
    const gateAlreadyOpen = !!document.getElementById(GATE_ID);
    currentGate = session;
    document.getElementById(GATE_ID)?.remove();
    injectStyles();
    if (!gateAlreadyOpen) priorBodyOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    document.body.insertAdjacentHTML('beforeend', gateHtml(session));
    document.getElementById('bc-jpc-confirm-count')?.addEventListener('click', confirmWorkerCount);
  }

  async function confirmWorkerCount() {
    const button = document.getElementById('bc-jpc-confirm-count');
    const status = document.getElementById('bc-jpc-gate-status');
    if (!currentGate || !button || workerBusy) return;
    const inputs = Array.from(document.querySelectorAll('#' + GATE_ID + ' [data-bc-jpc-count]'));
    const counts = inputs.map(function (input) {
      return { producto_id: input.dataset.bcJpcCount, cantidad: input.value.trim() };
    });
    if (counts.some(function (item) {
      return item.cantidad === '' || !Number.isFinite(Number(item.cantidad)) ||
        Number(item.cantidad) < 0 || !/^\d+(?:\.\d{1,3})?$/.test(item.cantidad);
    })) {
      if (status) { status.textContent = 'Falta contar uno o varios productos. Introduce cantidades físicas válidas, incluso 0 cuando no quede stock.'; status.className = 'bc-jpc-status error'; }
      return;
    }
    workerBusy = true;
    button.disabled = true;
    button.textContent = 'Guardando conteo…';
    if (status) { status.textContent = 'Guardando el conteo físico y aplicando los nuevos precios…'; status.className = 'bc-jpc-status'; }
    try {
      await rpc('bc7_confirmar_cambios_precio_conteo', {
        p_turno_sesion_id: currentGate.sesion_id,
        p_conteos: counts.map(function (item) { return { producto_id: item.producto_id, cantidad: Number(item.cantidad) }; })
      });
      if (status) { status.textContent = 'Conteo confirmado. Los precios nuevos ya están activos.'; status.className = 'bc-jpc-status success'; }
      const completedSessionId = currentGate.sesion_id;
      document.getElementById(GATE_ID)?.remove();
      document.body.style.overflow = priorBodyOverflow;
      currentGate = null;
      window.dispatchEvent(new CustomEvent('bc:data-changed', { detail: { domains: ['stock', 'products', 'movements'] } }));
      const workspace = window.__BC7_JORNADA__;
      if (workspace && typeof workspace.openForSession === 'function') {
        workspace.openForSession(completedSessionId);
      }
      refreshPending();
    } catch (error) {
      if (status) { status.textContent = 'No se pudo guardar el conteo: ' + (error && error.message || String(error)) + ' · No se activó ningún precio; puedes corregir las cantidades y reintentar.'; status.className = 'bc-jpc-status error'; }
      button.disabled = false;
      button.textContent = 'Reintentar conteo';
    } finally {
      workerBusy = false;
    }
  }

  async function refreshPending() {
    if (refreshing || !navigator.onLine || !getDbClient()) return;
    refreshing = true;
    try {
      const sessions = await rpc('bc7_mis_cambios_precio_pendientes', {});
      renderGate(Array.isArray(sessions) ? sessions : []);
    } catch (error) {
      if (document.getElementById(GATE_ID)) {
        const status = document.getElementById('bc-jpc-gate-status');
        if (status) { status.textContent = 'No se pudo verificar el estado del conteo. Mantén esta ventana abierta y reintenta cuando vuelva la conexión.'; status.className = 'bc-jpc-status error'; }
      }
      console.warn('[BattleCruiser] No se pudieron consultar cambios de precio pendientes.', error);
    } finally {
      refreshing = false;
    }
  }

  function boot() {
    injectStyles();
    ensureOwnerButton();
    refreshPending();
    window.addEventListener('online', refreshPending);
    window.addEventListener('focus', refreshPending);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshPending();
    });
    window.addEventListener('bc:data-changed', function () {
      ensureOwnerButton();
      refreshPending();
    });
    window.setInterval(refreshPending, 20000);
    const db = getDbClient();
    if (db && db.auth && typeof db.auth.onAuthStateChange === 'function') {
      db.auth.onAuthStateChange(function () {
        window.setTimeout(refreshPending, 250);
        window.setTimeout(ensureOwnerButton, 250);
      });
    }
    window.addEventListener('hashchange', ensureOwnerButton);
    window.setTimeout(ensureOwnerButton, 800);
  }

  window.__BC_JORNADA_PRICE_CHANGES_API__ = {
    refreshPending: refreshPending,
    openOwnerModal: openOwnerModal
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
