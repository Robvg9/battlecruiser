// BattleCruiser — shared searchable chooser for operational products and warehouses.
(function () {
  'use strict';
  if (window.__BC_PRODUCT_SELECT_PICKER__ === '2.3') return;
  window.__BC_PRODUCT_SELECT_PICKER__ = '2.3';
  const PRODUCT_KNOWN = new Set(['compra-producto','venta-producto','trf-producto','vale-producto','pp-producto-select','mov-multiple-producto']);
  const WAREHOUSE_KNOWN = new Set(['alm-selector','compra-multiple-almacen','trf-origen','trf-destino','vale-almacen','mov-multiple-origen','mov-multiple-destino','bc-bajas-warehouse','inv-filtro-almacen','op-g-alm','op-r-alm']);
  const PRODUCT_EXCLUDED = /categor[ií]|presentaci[oó]n|almac[eé]n|warehouse|motivo|estado|tipo|pago|prioridad|usuario/i;
  const WAREHOUSE_EXCLUDED = /categor[ií]|presentaci[oó]n|producto|product|motivo|estado|tipo|pago|prioridad|usuario/i;
  let active = null, activeTrigger = null, activeKind = 'product', modal = null, modalController = null, search = null, results = null, status = null, title = null;
  const norm = value => String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
  function identity(select) {
    const label = select.closest('label');
    return [select.id,select.className,select.getAttribute('aria-label'),select.getAttribute('name'),label?label.textContent:''].join(' ');
  }
  function kindFor(select) {
    if (!select || select.tagName !== 'SELECT' || select.multiple || select.dataset.bcSelectPicker === '1' || select.dataset.bcProductPicker === '1') return null;
    if (select.closest('#legacy-product-purchase') || select.closest('#bc-product-picker-modal')) return null;
    const text = identity(select);
    if (select.id === 'venta-producto' && document.getElementById('venta-producto-buscar')) return null;
    if (select.id === 'compra-multiple-presentacion') return 'unit';
    if (!WAREHOUSE_EXCLUDED.test(text) && (WAREHOUSE_KNOWN.has(select.id) || /almac[eé]n|warehouse|origen|destino/i.test(text))) return 'warehouse';
    if (!PRODUCT_EXCLUDED.test(text) && (PRODUCT_KNOWN.has(select.id) || /producto|product|(^|[-_])prod($|[-_])/i.test(text))) return 'product';
    return 'generic';
  }
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div'); modal.id = 'bc-product-picker-modal'; modal.className = 'bc-product-picker-modal'; modal.hidden = true;
    modal.innerHTML = '<div class="bc-product-picker-backdrop" data-bc-picker-close></div>' +
      '<section class="bc-product-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="bc-product-picker-title" tabindex="-1">' +
      '<header class="bc-product-picker-header"><strong id="bc-product-picker-title">Elegir producto</strong>' +
      '<button type="button" class="bc-product-picker-close" data-bc-picker-close aria-label="Cerrar">×</button></header>' +
      '<input id="bc-product-picker-search" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar producto…" aria-label="Buscar producto">' +
      '<div id="bc-product-picker-results" class="bc-product-picker-results" role="listbox"></div>' +
      '<p class="bc-product-picker-status" role="status" aria-live="polite"></p></section>';
    document.body.appendChild(modal);
    search = modal.querySelector('#bc-product-picker-search'); results = modal.querySelector('#bc-product-picker-results');
    status = modal.querySelector('.bc-product-picker-status'); title = modal.querySelector('#bc-product-picker-title');
    modal.addEventListener('click', event => {
      const button = event.target.closest('[data-bc-product-value]');
      if (!button || !active) return;
      const value = button.getAttribute('data-bc-product-value');
      if (Array.from(active.options).some(option => option.value === value && !option.disabled)) {
        active.value = value;
        active.dispatchEvent(new Event('change', { bubbles: true }));
        update(active);
        close();
      }
    });
    search.addEventListener('input', render);
    syncViewport();
    window.addEventListener('resize', syncViewport, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewport, { passive: true });
      window.visualViewport.addEventListener('scroll', syncViewport, { passive: true });
    }
    if (!window.BCModalManager || typeof window.BCModalManager.create !== 'function') {
      throw new Error('BCModalManager debe cargarse antes del selector compartido.');
    }
    modalController = window.BCModalManager.create(modal, {
      dialogSelector: '.bc-product-picker-dialog',
      initialFocusSelector: '#bc-product-picker-search',
      closeSelector: '[data-bc-picker-close]',
      backdropSelector: '.bc-product-picker-backdrop',
      hiddenClass: null,
      hiddenAttribute: true,
      closeOnEscape: true,
      closeOnBackdrop: true,
      trapFocus: true,
      lockScroll: true,
      onOpen: function () {
        document.body.classList.add('bc-product-picker-open');
        if (activeTrigger) activeTrigger.setAttribute('aria-expanded', 'true');
      },
      onClose: function () {
        document.body.classList.remove('bc-product-picker-open');
        if (activeTrigger) activeTrigger.setAttribute('aria-expanded', 'false');
        active = null;
        activeTrigger = null;
      }
    });
    return modal;
  }
  function syncViewport() {
    if (!modal) return;
    const viewport = window.visualViewport;
    const top = viewport ? Math.max(0, viewport.offsetTop || 0) : 0;
    const height = viewport ? Math.max(240, viewport.height || window.innerHeight) : Math.max(240, window.innerHeight || 600);
    modal.style.setProperty('--bc-picker-viewport-top', top + 'px');
    modal.style.setProperty('--bc-picker-viewport-height', height + 'px');
  }
  function update(select) {
    const button = select.parentElement && select.parentElement.querySelector('.bc-product-picker-trigger');
    if (!button) return;
    const option = Array.from(select.options).find(item => item.value === select.value);
    const noun = select.dataset.bcPickerNoun || (select.dataset.bcPickerKind === 'warehouse' ? 'almacén' : select.dataset.bcPickerKind === 'product' ? 'producto' : 'opción');
    button.textContent = option ? option.textContent.trim() : 'Elegir ' + noun + '…';
    button.disabled = !!select.disabled;
    button.classList.toggle('is-placeholder', !option || !select.value);
    button.classList.toggle('has-selection', !!option && !!select.value);
    button.title = button.textContent;
    button.setAttribute('aria-label', option ? noun + ': ' + button.textContent : 'Elegir ' + noun);
  }
  function render() {
    if (!active || !results) return;
    const term = norm(search.value);
    const matches = Array.from(active.options).filter(option => option.value && !option.disabled && norm(option.textContent).includes(term));
    results.innerHTML = '';
    matches.forEach(option => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'bc-product-picker-result' + (option.value === active.value ? ' is-selected' : '');
      button.setAttribute('role', 'option'); button.setAttribute('aria-selected', option.value === active.value ? 'true' : 'false');
      button.setAttribute('data-bc-product-value', option.value); button.textContent = option.textContent.trim(); results.appendChild(button);
    });
    const plural = activeKind === 'warehouse' ? 'almacenes' : activeKind === 'product' ? 'productos' : activeKind === 'unit' ? 'unidades' : 'opciones';
    const singular = activeKind === 'warehouse' ? 'almacén' : activeKind === 'product' ? 'producto' : activeKind === 'unit' ? 'unidad' : 'opción';
    status.textContent = matches.length ? matches.length + ' ' + (matches.length === 1 ? singular : plural) : 'No hay ' + plural + ' que coincidan.';
  }
  function open(select, kind) {
    active = select;
    activeKind = kind || select.dataset.bcPickerKind || 'product';
    ensureModal();
    activeTrigger = select.parentElement && select.parentElement.querySelector('.bc-product-picker-trigger');
    if (activeTrigger) {
      try { activeTrigger.focus({ preventScroll: true }); } catch (_) { activeTrigger.focus(); }
    }
    const noun = select.dataset.bcPickerNoun ||
      (activeKind === 'warehouse' ? 'almacén' : activeKind === 'product' ? 'producto' : activeKind === 'unit' ? 'unidad base' : 'opción');
    title.textContent = 'Elegir ' + noun;
    search.placeholder = 'Buscar ' + noun + '…';
    search.setAttribute('aria-label', 'Buscar ' + noun);
    search.value = '';
    render();
    syncViewport();
    modalController.open();
    window.setTimeout(syncViewport, 0);
  }
  function close() {
    if (!modalController || !modalController.isOpen()) return;
    modalController.close();
  }
  function injectPurchaseStyles() {
    if (document.getElementById('bc-purchase-picker-ux-style')) return;
    const style = document.createElement('style');
    style.id = 'bc-purchase-picker-ux-style';
    style.textContent = [
      '#tab-compras .bc-product-picker-field--purchase{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;align-content:start;min-width:0;width:100%;}',
      '#tab-compras .bc-product-picker-field-label{display:block;margin:0;color:var(--mist);font-size:10px;font-weight:700;letter-spacing:.075em;line-height:1.2;text-transform:uppercase;}',
      '#tab-compras .bc-product-picker-field-help{display:block;margin:1px 0 0;color:var(--mist);font-size:10px;line-height:1.3;}',
      '#tab-compras .bc-product-picker-field--purchase>.bc-product-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-width:0;min-height:50px;height:auto;margin:0;padding:11px 13px;border:1px solid rgba(212,176,92,.38);border-radius:10px;background:var(--void,#0a1613);color:var(--text,#f5efe3);font-size:13px;font-weight:650;line-height:1.3;text-align:left;box-shadow:inset 3px 0 0 rgba(212,176,92,.2);}',
      '#tab-compras .bc-product-picker-field--purchase>.bc-product-picker-trigger:after{content:"⌄";flex:0 0 auto;color:var(--gold-bright,var(--gold));font-size:19px;line-height:1;}',
      '#tab-compras .bc-product-picker-field--purchase>.bc-product-picker-trigger.is-placeholder{color:var(--mist);font-weight:500;box-shadow:none;}',
      '#tab-compras .bc-product-picker-field--purchase>.bc-product-picker-trigger.has-selection{border-color:rgba(212,176,92,.62);box-shadow:inset 3px 0 0 var(--gold);}',
      '#tab-compras .bc-product-picker-field--purchase>.bc-product-picker-trigger:focus-visible{outline:2px solid var(--bc-control-focus,rgba(212,176,92,.8));outline-offset:2px;}',
      '#tab-compras .compra-linea-editor{align-items:start;}',
      '#tab-compras .compra-cabecera .bc-product-picker-field--purchase{margin-top:4px;}',
      '#bc-product-picker-modal .bc-product-picker-dialog{width:min(100%,600px);}',
      '#bc-product-picker-modal .bc-product-picker-result:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}',
      '@media(max-width:720px){#tab-compras .compra-linea-editor{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;}#tab-compras .compra-linea-editor .bc-product-picker-field--purchase{grid-column:1/-1;}#tab-compras .compra-linea-editor #compra-multiple-add{grid-column:1/-1;min-height:42px;}}',
      '@media(max-width:380px){#tab-compras .compra-linea-editor{grid-template-columns:minmax(0,1fr);}#tab-compras .compra-linea-editor>*{grid-column:1/-1!important;}}'
    ].join('');
    document.head.appendChild(style);
  }
  function attach(select) {
    const kind = kindFor(select); if (!kind || !select.parentNode) return;
    const isPurchase = !!select.closest('#tab-compras');
    const isPurchaseProduct = isPurchase && select.id === 'compra-multiple-producto';
    const isPurchaseUnit = isPurchase && select.id === 'compra-multiple-presentacion';
    const field = document.createElement('div');
    field.className = 'bc-product-picker-field' + (isPurchase ? ' bc-product-picker-field--purchase' : '');
    field.dataset.bcProductPickerField = '1';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bc-product-picker-trigger is-placeholder';
    const text = identity(select).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
    const noun = isPurchaseUnit ? 'unidad base' : /almacen|warehouse|origen|destino/.test(text) ? 'almacén' : /producto|product/.test(text) ? 'producto' : /categor/.test(text) ? 'categoría' : /presentacion/.test(text) ? 'presentación' : /proveedor/.test(text) ? 'proveedor' : /usuario|empleado|trabajador/.test(text) ? 'persona' : /pago/.test(text) ? 'método de pago' : /estado/.test(text) ? 'estado' : /tipo/.test(text) ? 'tipo' : /motivo/.test(text) ? 'motivo' : /unidad/.test(text) ? 'unidad' : /rol/.test(text) ? 'rol' : 'opción';
    if (isPurchaseProduct || isPurchaseUnit) {
      const label = document.createElement('span');
      label.className = 'bc-product-picker-field-label';
      label.textContent = isPurchaseUnit ? 'Unidad base' : 'Producto';
      field.appendChild(label);
    }
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'bc-product-picker-modal');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Elegir ' + noun);
    button.addEventListener('click', () => open(select, kind));
    select.dataset.bcSelectPicker = '1';
    select.dataset.bcPickerKind = kind;
    select.dataset.bcPickerNoun = noun;
    select.dataset.bcProductPicker = '1';
    select.classList.add('bc-product-picker-native-select');
    select.parentNode.insertBefore(field, select);
    field.appendChild(button);
    if (isPurchaseProduct || isPurchaseUnit) {
      const help = document.createElement('span');
      help.className = 'bc-product-picker-field-help';
      help.textContent = isPurchaseUnit
        ? 'La cantidad se registrará en esta unidad.'
        : 'Busca y selecciona un producto del catálogo.';
      field.appendChild(help);
    }
    field.appendChild(select);
    update(select);
    if (isPurchase) injectPurchaseStyles();
    select.addEventListener('change', () => update(select));
    new MutationObserver(() => { update(select); if (active === select && modal && !modal.hidden) render(); })
      .observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.matches && root.matches('select')) attach(root);
    if (root.querySelectorAll) root.querySelectorAll('select').forEach(attach);
  }
  function refresh(root) { scan(root || document.body); }
  document.addEventListener('change', event => {
    if (event.target && event.target.tagName === 'SELECT') document.querySelectorAll('select[data-bc-select-picker="1"]').forEach(update);
  });
  if (document.body) {
    refresh(document.body);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) refresh(node); })))
      .observe(document.body, { childList: true, subtree: true });
  }
  window.__BC_PRODUCT_PICKER_OPEN__ = open; window.__BC_PRODUCT_PICKER_CLOSE__ = close; window.__BC_PRODUCT_PICKER_REFRESH__ = refresh;
})();