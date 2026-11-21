/* BattleCruiser — mandatory Jornada price-change count gate. */
(function () {
  'use strict';
  if (window.__BC_JORNADA_PRICE_CHANGES__) return;
  window.__BC_JORNADA_PRICE_CHANGES__ = true;

  const STYLE_ID = 'bc-jpc-style';
  const MODAL_ID = 'bc-jpc-owner-modal';
  const GATE_ID = 'bc-jpc-attendant-gate';
  let contexts = [];
  let scheduledRows = [];
  let currentGate = null;
  let refreshing = false;
  let ownerBusy = false;
  let ownerActionAvailable = false;
  let workerBusy = false;
  let ownerStep = 1;
  let ownerSelectedIds = Object.create(null);
  let ownerDraftValues = Object.create(null);
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
      '.bc-jpc-body{padding:14px 16px;overflow:auto;min-height:0}',
      '.bc-jpc-dialog{width:min(760px,100%);max-height:min(88dvh,820px);display:flex;flex-direction:column}',
      '.bc-jpc-step-label{font-size:10px;font-weight:750;letter-spacing:.06em;color:var(--gold,#d2ad68);margin:12px 0 7px}',
      '.bc-jpc-select-list{display:grid;gap:5px;max-height:min(48vh,430px);overflow:auto;overscroll-behavior:contain}',
      '.bc-jpc-select-row{display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 11px;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:8px;background:rgba(255,255,255,.025);cursor:pointer}',
      '.bc-jpc-select-row input{width:18px;height:18px;flex:0 0 18px;accent-color:var(--gold,#bd9a5c)}',
      '.bc-jpc-select-row span{min-width:0}.bc-jpc-select-row strong{display:block;font-size:13px}.bc-jpc-select-row small{display:block;font-size:10px;color:var(--muted,#aaa);margin-top:2px}',
      '.bc-jpc-detail-list{display:grid;gap:8px}',
      '.bc-jpc-product-heading strong{display:block;font-size:13px}.bc-jpc-product-heading small{display:block;color:var(--muted,#aaa);font-size:10.5px;margin-top:3px}',
      '.bc-jpc-body [hidden]{display:none!important}',
      '.bc-jpc-field{display:flex;flex-direction:column;gap:5px;margin:0 0 11px;font-size:12px;color:var(--muted,#c0c0c0)}',
      '.bc-jpc-field input,.bc-jpc-field select,.bc-jpc-product-fields input{width:100%;min-width:0;background:var(--input-bg,#101215);border:1px solid var(--line,rgba(255,255,255,.16));border-radius:7px;color:var(--text,#f2eee5);padding:9px;font:inherit}',
      '.bc-jpc-summary{padding:9px 11px;border-radius:8px;background:rgba(180,150,90,.09);font-size:12px;line-height:1.5;margin:8px 0 13px}',
      '.bc-jpc-search{margin:8px 0 10px}',
      '.bc-jpc-products{display:grid;gap:7px}',
      '.bc-jpc-product{display:grid;grid-template-columns:minmax(0,1fr);gap:9px;padding:11px;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:9px}',
      '.bc-jpc-product-name{min-width:0}.bc-jpc-product-name strong{display:block;font-size:13px}.bc-jpc-product-name small{display:block;color:var(--muted,#aaa);font-size:11px;margin-top:2px}',
      '.bc-jpc-product-price{font-size:12px;display:flex;flex-direction:column;gap:4px;white-space:nowrap}.bc-jpc-product-price small{color:var(--muted,#aaa);font-size:10px}',
      '.bc-jpc-product-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.bc-jpc-product-fields label{display:flex;flex-direction:column;gap:5px;font-size:10.5px;color:var(--muted,#aaa);min-width:0}.bc-jpc-product-fields label span{flex:auto}.bc-jpc-product-fields input{min-width:0;width:100%;padding:9px;font-size:14px}',
      '.bc-jpc-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line,rgba(255,255,255,.12))}',
      '.bc-jpc-btn{border:1px solid var(--line,rgba(255,255,255,.18));border-radius:8px;padding:10px 13px;background:transparent;color:var(--text,#f2eee5);font-weight:600;cursor:pointer}',
      '.bc-jpc-btn.primary{background:var(--gold,#a88a50);border-color:var(--gold,#a88a50);color:#171717}.bc-jpc-btn:disabled{opacity:.5;cursor:wait}',
      '.bc-jpc-status{font-size:12px;line-height:1.5;margin:8px 0;color:var(--muted,#b8b8b8)}.bc-jpc-status.error{color:#ff9d9d}.bc-jpc-status.success{color:#a4dfb6}',
      '.bc-jpc-gate .bc-jpc-dialog{width:min(620px,100%);border-color:#bd8d43}.bc-jpc-gate .bc-jpc-body{padding:16px}',
      '.bc-jpc-count-row{display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:12px;align-items:center;border:1px solid var(--line,rgba(255,255,255,.14));border-radius:9px;padding:11px;margin:8px 0}',
      '.bc-jpc-count-row strong{display:block;font-size:13px}.bc-jpc-count-row small{display:block;color:var(--muted,#aaa);font-size:11px;margin-top:3px}',
      '.bc-jpc-count-row input{width:100%;background:var(--input-bg,#101215);border:1px solid var(--line,rgba(255,255,255,.18));border-radius:7px;color:var(--text,#f2eee5);padding:10px;font-size:16px}',
      '.bc-jpc-required{font-size:11px;color:#e4bf7e;margin:8px 0 0}',
      '@media(max-width:560px){.bc-jpc-product-fields{grid-template-columns:minmax(0,1fr)}.bc-jpc-count-row{grid-template-columns:minmax(0,1fr) 108px}.bc-jpc-body{padding:12px}.bc-jpc-actions{padding:10px 12px}.bc-jpc-actions button{flex:1 1 100%}.bc-jpc-select-list{max-height:44vh}}'
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
    ownerActionAvailable = false;
    button.hidden = true;
    window.dispatchEvent(new CustomEvent('bc:price-changes-availability', { detail: { available: false } }));
    rpc('bc_actor_is_admin', {}).then(function (isAdmin) {
      ownerActionAvailable = isAdmin === true;
      button.hidden = !ownerActionAvailable;
      window.dispatchEvent(new CustomEvent('bc:price-changes-availability', { detail: { available: ownerActionAvailable } }));
    }).catch(function () {
      ownerActionAvailable = false;
      button.hidden = true;
      window.dispatchEvent(new CustomEvent('bc:price-changes-availability', { detail: { available: false } }));
    });
  }

  function selectedContext() {
    const select = document.getElementById('bc-jpc-session');
    const id = select ? select.value : '';
    return contexts.find(function (item) { return String(item.sesion_id) === String(id); }) || null;
  }

  function responsibleName(context) {
    const id = context && context.responsable_id;
    if (id == null || String(id) === '') return 'Sin asignar';
    const jornada = window.__BC7_JORNADA__;
    if (jornada && typeof jornada.responsibleName === 'function') {
      const name = jornada.responsibleName(id);
      if (name && name !== 'Responsable asignado') return String(name);
    }
    const sources = [window.__BC_M29_STAFF_CACHE__, window._cache && window._cache.usuarios, window.__BC7_STAFF_CACHE__];
    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      const person = source.find(function(item) { return item && String(item.id) === String(id); });
      if (!person) continue;
      const name = person.nombre || person.nombre_completo || person.nombre_usuario || person.full_name || person.name || person.email;
      if (name) return String(name).trim();
    }
    return 'Responsable asignada';
  }

  function humanDate(value) {
    const parts = String(value || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(function(part) { return !Number.isFinite(part); }) ||
        parts[0] < 2000 || parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > 31) return '';
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)));
  }

  function sessionPeriod(context) {
    const related = scheduledRows.filter(function(item) {
      return context && context.turno_id && String(item.turno_id) === String(context.turno_id) &&
        String(item.almacen_id || '') === String(context.almacen_id || '') && item.estado !== 'CANCELADA';
    });
    const dates = related.map(function(item) { return String(item.fecha || '').slice(0, 10); }).filter(Boolean).sort();
    const start = String(context && context.fecha_inicio || dates[0] || context && context.fecha || '').slice(0, 10);
    const end = String(context && context.fecha_fin || dates[dates.length - 1] || start).slice(0, 10);
    const startLabel = humanDate(start), endLabel = humanDate(end);
    if (!startLabel) return 'Turno activo';
    if (!endLabel || start === end) return 'Turno del ' + startLabel;
    const a = start.split('-'), b = end.split('-');
    if (a[0] === b[0] && a[1] === b[1]) {
      return 'Turno del ' + Number(a[2]) + ' al ' + Number(b[2]) + ' de ' + endLabel.split(' ').slice(-1).join(' ');
    }
    return 'Turno del ' + startLabel + ' al ' + endLabel;
  }

  function shiftDate(value, days) {
    const parts = String(value || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(function(part) { return !Number.isFinite(part); })) return '';
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(days || 0), 12));
    return date.toISOString().slice(0, 10);
  }

  async function loadHumanSchedulePeriods(items) {
    const seen = Object.create(null);
    const active = (Array.isArray(items) ? items : []).filter(function(item) {
      return item && item.turno_id && item.fecha && (!item.fecha_inicio || !item.fecha_fin);
    });
    const anchors = active.filter(function(item) {
      const key = String(item.turno_id) + '|' + String(item.almacen_id || '') + '|' + String(item.fecha);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
    const ranges = anchors.map(function(item) {
      const day = String(item.fecha).slice(0, 10);
      return [
        { p_fecha_inicio: shiftDate(day, -30), p_fecha_fin: day },
        { p_fecha_inicio: day, p_fecha_fin: shiftDate(day, 30) }
      ];
    }).flat();
    const responses = await Promise.all(ranges.map(function(range) {
      return rpc('bc5_mis_jornadas', range);
    }));
    const merged = new Map();
    responses.forEach(function(rows) {
      (Array.isArray(rows) ? rows : []).forEach(function(row) {
        if (row && row.id) merged.set(String(row.id), row);
      });
    });
    scheduledRows = Array.from(merged.values());
  }

  function humanContextLabel(context) {
    return String(context && context.almacen_nombre || 'Almacén') + ' · ' + sessionPeriod(context) + ' · Responsable ' + responsibleName(context);
  }

  function updateOwnerWizardControls() {
    const count = Object.keys(ownerSelectedIds).filter(function(id) { return ownerSelectedIds[id]; }).length;
    const next = document.getElementById('bc-jpc-next');
    const back = document.getElementById('bc-jpc-back');
    const submit = document.getElementById('bc-jpc-submit');
    const search = document.getElementById('bc-jpc-search-wrap');
    const reason = document.getElementById('bc-jpc-reason-wrap');
    const step = document.getElementById('bc-jpc-step-label');
    if (next) { next.hidden = ownerStep !== 1; next.disabled = count === 0; next.textContent = 'Siguiente · ' + count; }
    if (back) back.hidden = ownerStep !== 2;
    if (submit) submit.hidden = ownerStep !== 2;
    if (search) search.hidden = ownerStep !== 1;
    if (reason) reason.hidden = ownerStep !== 2;
    if (step) step.textContent = ownerStep === 1
      ? 'PASO 1 DE 2 · Selecciona los productos'
      : 'PASO 2 DE 2 · Define los nuevos valores';
  }

  function saveOwnerDraftValues() {
    document.querySelectorAll('#bc-jpc-products [data-bc-jpc-price]').forEach(function(input) {
      const id = input.dataset.bcJpcPrice;
      ownerDraftValues[id] = ownerDraftValues[id] || {};
      ownerDraftValues[id].price = input.value;
    });
    document.querySelectorAll('#bc-jpc-products [data-bc-jpc-cost]').forEach(function(input) {
      const id = input.dataset.bcJpcCost;
      ownerDraftValues[id] = ownerDraftValues[id] || {};
      ownerDraftValues[id].cost = input.value;
    });
  }

  function setOwnerStep(step) {
    if (ownerStep === 2 && step === 1) saveOwnerDraftValues();
    ownerStep = step === 2 ? 2 : 1;
    const search = document.getElementById('bc-jpc-search');
    renderOwnerProducts(selectedContext(), search && search.value);
    const status = document.getElementById('bc-jpc-owner-status');
    if (status) { status.textContent = ''; status.className = 'bc-jpc-status'; }
  }

  function renderOwnerProducts(context, filter) {
    const host = document.getElementById('bc-jpc-products');
    if (!host) return;
    const query = String(filter || '').trim().toLocaleLowerCase();
    const products = Array.isArray(context && context.productos) ? context.productos : [];
    const selected = products.filter(function(item) { return !!ownerSelectedIds[String(item.producto_id)]; });

    if (ownerStep === 1) {
      const visible = products.filter(function(item) {
        return !query || String(item.nombre || '').toLocaleLowerCase().includes(query);
      });
      host.classList.add('bc-jpc-select-list');
      host.classList.remove('bc-jpc-detail-list');
      host.innerHTML = visible.map(function(item) {
        const id = String(item.producto_id);
        const checkboxId = 'bc-jpc-select-' + id;
        return '<label class="bc-jpc-select-row" for="' + esc(checkboxId) + '">' +
          '<input type="checkbox" id="' + esc(checkboxId) + '" data-bc-jpc-select="' + esc(id) + '"' + (ownerSelectedIds[id] ? ' checked' : '') + '>' +
          '<span><strong>' + esc(item.nombre) + '</strong><small>' + esc(item.unidad || 'Unidad base') + '</small></span>' +
        '</label>';
      }).join('') || '<p class="bc-jpc-status">No hay productos que coincidan con la búsqueda.</p>';
      host.querySelectorAll('[data-bc-jpc-select]').forEach(function(box) {
        box.addEventListener('change', function() {
          const id = String(box.dataset.bcJpcSelect);
          if (box.checked) ownerSelectedIds[id] = true;
          else { delete ownerSelectedIds[id]; delete ownerDraftValues[id]; }
          updateOwnerWizardControls();
        });
      });
    } else {
      host.classList.remove('bc-jpc-select-list');
      host.classList.add('bc-jpc-detail-list');
      host.innerHTML = selected.map(function(item) {
        const id = String(item.producto_id);
        const draft = ownerDraftValues[id] || {};
        return '<article class="bc-jpc-product">' +
          '<div class="bc-jpc-product-heading"><strong>' + esc(item.nombre) + '</strong><small>Venta actual: ' + esc(money(item.precio_actual)) +
          ' · Costo actual: ' + esc(item.costo_actual == null ? 'Sin costo' : money(item.costo_actual)) + '</small></div>' +
          '<div class="bc-jpc-product-fields">' +
            '<label><span>Nuevo precio de venta</span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Nuevo precio" value="' + esc(draft.price || '') +
            '" data-bc-jpc-price="' + esc(id) + '" aria-label="Nuevo precio de venta de ' + esc(item.nombre) + '" required></label>' +
            '<label><span>Nuevo costo (opcional)</span><input type="number" min="0" step="0.0001" inputmode="decimal" placeholder="Sin cambio" value="' + esc(draft.cost || '') +
            '" data-bc-jpc-cost="' + esc(id) + '" aria-label="Nuevo costo unitario de ' + esc(item.nombre) + '"></label>' +
          '</div></article>';
      }).join('') || '<p class="bc-jpc-status">Vuelve al paso anterior y selecciona al menos un producto.</p>';
    }

    const summary = document.getElementById('bc-jpc-session-summary');
    if (summary) summary.textContent = humanContextLabel(context) + '. Los cambios solo se activan después del conteo físico obligatorio de la dependienta.';
    updateOwnerWizardControls();
  }

  function ownerModalHtml() {
    const options = contexts.map(function(item) {
      return '<option value="' + esc(item.sesion_id) + '">' + esc(humanContextLabel(item)) + '</option>';
    }).join('');
    return '<div class="bc165-overlay" id="' + MODAL_ID + '">' +
      '<section class="bc-jpc-dialog bc165-modal" role="dialog" aria-modal="true" aria-labelledby="bc-jpc-owner-title">' +
        '<header class="bc165-head"><div><h3 id="bc-jpc-owner-title">Cambios de precio</h3><p>Primero selecciona los productos; después define sus nuevos precios.</p></div><button type="button" class="bc165-close" data-bc-jpc-close aria-label="Cerrar">×</button></header>' +
        '<div class="bc-jpc-body">' +
          '<label class="bc-jpc-field">Jornada activa<select id="bc-jpc-session">' + options + '</select></label>' +
          '<div class="bc-jpc-summary" id="bc-jpc-session-summary"></div>' +
          '<p class="bc-jpc-step-label" id="bc-jpc-step-label">PASO 1 DE 2 · Selecciona los productos</p>' +
          '<label class="bc-jpc-field bc-jpc-search" id="bc-jpc-search-wrap">Buscar producto<input id="bc-jpc-search" type="search" placeholder="Escribe el nombre del producto"></label>' +
          '<div id="bc-jpc-products" class="bc-jpc-products bc-jpc-select-list"></div>' +
          '<div id="bc-jpc-reason-wrap" hidden><label class="bc-jpc-field" style="margin-top:13px">Motivo del cambio<textarea id="bc-jpc-reason" rows="2" maxlength="500" placeholder="Ej.: actualización de precios de venta"></textarea></label></div>' +
          '<p class="bc-jpc-status" id="bc-jpc-owner-status" role="status" aria-live="polite"></p>' +
        '</div>' +
        '<footer class="bc-jpc-actions"><button type="button" class="bc-jpc-btn" data-bc-jpc-close>Cancelar</button><button type="button" class="bc-jpc-btn" id="bc-jpc-back" hidden>Volver a productos</button><button type="button" class="bc-jpc-btn primary" id="bc-jpc-next" disabled>Siguiente · 0</button><button type="button" class="bc-jpc-btn primary" id="bc-jpc-submit" hidden>Solicitar conteo y cambio</button></footer>' +
      '</section></div>';
  }

  async function openOwnerModal() {
    if (!ownerActionAvailable) {
      window.alert('Este acceso está reservado al administrador.');
      return;
    }
    if (ownerBusy) return;
    ownerBusy = true;
    try {
      try {
        const staff = window.__BC7_JORNADA__;
        if (staff && typeof staff.refreshResponsibleStaff === 'function') await staff.refreshResponsibleStaff();
      } catch (staffError) {
        console.warn('[BattleCruiser] No se pudo actualizar el catálogo de responsables:', staffError);
      }
      contexts = await rpc('bc7_cambios_precio_contexto', {});
      if (Array.isArray(contexts) && contexts.some(function(item) { return !item.fecha_inicio || !item.fecha_fin; })) {
        try {
          await loadHumanSchedulePeriods(contexts);
        } catch (scheduleError) {
          scheduledRows = [];
          console.warn('[BattleCruiser] No se pudo completar el período programado de la Jornada:', scheduleError);
        }
      } else {
        scheduledRows = [];
      }
      if (!Array.isArray(contexts) || !contexts.length) {
        window.alert('No existe una jornada minorista activa con una dependienta trabajando. El cambio de precio solo se puede iniciar desde una jornada activa para exigir el conteo físico.');
        return;
      }
      ownerStep = 1;
      ownerSelectedIds = Object.create(null);
      ownerDraftValues = Object.create(null);
      injectStyles();
      document.getElementById(MODAL_ID)?.remove();
      document.body.insertAdjacentHTML('beforeend', ownerModalHtml());
      const select = document.getElementById('bc-jpc-session');
      const search = document.getElementById('bc-jpc-search');
      if (select) select.addEventListener('change', function() {
        ownerSelectedIds = Object.create(null);
        ownerDraftValues = Object.create(null);
        ownerStep = 1;
        renderOwnerProducts(selectedContext(), search && search.value);
      });
      if (search) search.addEventListener('input', function() { renderOwnerProducts(selectedContext(), search.value); });
      document.getElementById('bc-jpc-next')?.addEventListener('click', function() {
        if (Object.keys(ownerSelectedIds).filter(function(id) { return ownerSelectedIds[id]; }).length) setOwnerStep(2);
      });
      document.getElementById('bc-jpc-back')?.addEventListener('click', function() { setOwnerStep(1); });
      document.getElementById('bc-jpc-submit')?.addEventListener('click', submitOwnerChange);
      document.querySelectorAll('#' + MODAL_ID + ' [data-bc-jpc-close]').forEach(function(button) {
        button.addEventListener('click', function() { document.getElementById(MODAL_ID)?.remove(); });
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
    if (ownerStep !== 2) {
      if (status) { status.textContent = 'Completa primero la selección de productos.'; status.className = 'bc-jpc-status error'; }
      return;
    }
    const changes = Object.keys(ownerSelectedIds).filter(function(id) { return ownerSelectedIds[id]; }).map(function(id) {
      const input = document.querySelector('#bc-jpc-products [data-bc-jpc-price="' + CSS.escape(id) + '"]');
      const cost = document.querySelector('#bc-jpc-products [data-bc-jpc-cost="' + CSS.escape(id) + '"]');
      return { producto_id: id, precio_nuevo: input ? input.value.trim() : '', costo_nuevo: cost && cost.value.trim()!=='' ? cost.value.trim() : null };
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
    if (changes.some(function (item) {
      return item.costo_nuevo !== null &&
        (!Number.isFinite(Number(item.costo_nuevo)) || Number(item.costo_nuevo) < 0 || !/^\d+(?:\.\d{1,4})?$/.test(item.costo_nuevo));
    })) {
      if (status) { status.textContent = 'El costo opcional debe ser un número no negativo con hasta 4 decimales.'; status.className = 'bc-jpc-status error'; }
      return;
    }
    if (reason.length < 5) {
      if (status) { status.textContent = 'Explica el motivo del cambio (mínimo 5 caracteres).'; status.className = 'bc-jpc-status error'; }
      return;
    }
    ownerBusy = true;
    button.disabled = true;
    button.textContent = 'Enviando solicitud…';
    if (status) { status.textContent = 'Registrando la solicitud. El catálogo no cambia hasta el conteo físico.'; status.className = 'bc-jpc-status'; }
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
    return '<div class="bc165-overlay bc-jpc-gate" id="' + GATE_ID + '">' +
      '<section class="bc-jpc-dialog bc165-modal" role="dialog" aria-modal="true" aria-labelledby="bc-jpc-gate-title">' +
        '<header class="bc165-head"><div><h3 id="bc-jpc-gate-title">Conteo obligatorio por cambio de precio</h3><p>Antes de activar los nuevos valores debes contar físicamente las existencias actuales. Las unidades que ya no estén quedarán valoradas al precio anterior.</p></div></header>' +
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
    if (status) { status.textContent = 'Guardando el conteo físico y aplicando los nuevos valores…'; status.className = 'bc-jpc-status'; }
    try {
      await rpc('bc7_confirmar_cambios_precio_conteo', {
        p_turno_sesion_id: currentGate.sesion_id,
        p_conteos: counts.map(function (item) { return { producto_id: item.producto_id, cantidad: Number(item.cantidad) }; })
      });
      if (status) { status.textContent = 'Conteo confirmado. Los nuevos valores ya están activos.'; status.className = 'bc-jpc-status success'; }
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
    openOwnerModal: openOwnerModal,
    canOpenOwnerModal: function () { return ownerActionAvailable; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
