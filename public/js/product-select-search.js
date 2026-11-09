// BattleCruiser — shared searchable chooser for operational products and warehouses.
(function () {
  'use strict';
  if (window.__BC_PRODUCT_SELECT_PICKER__ === '2.1') return;
  window.__BC_PRODUCT_SELECT_PICKER__ = '2.1';
  const PRODUCT_KNOWN = new Set(['compra-producto','venta-producto','trf-producto','vale-producto','pp-producto-select','mov-multiple-producto']);
  const WAREHOUSE_KNOWN = new Set(['alm-selector','compra-multiple-almacen','trf-origen','trf-destino','vale-almacen','mov-multiple-origen','mov-multiple-destino','bc-bajas-warehouse','inv-filtro-almacen','op-g-alm','op-r-alm']);
  const PRODUCT_EXCLUDED = /categor[ií]|presentaci[oó]n|almac[eé]n|warehouse|motivo|estado|tipo|pago|prioridad|usuario/i;
  const WAREHOUSE_EXCLUDED = /categor[ií]|presentaci[oó]n|producto|product|motivo|estado|tipo|pago|prioridad|usuario/i;
  let active = null, activeKind = 'product', modal = null, search = null, results = null, status = null, title = null;
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
      if (event.target.closest('[data-bc-picker-close]')) { close(); return; }
      const button = event.target.closest('[data-bc-product-value]');
      if (button && active) {
        const value = button.getAttribute('data-bc-product-value');
        if (Array.from(active.options).some(option => option.value === value && !option.disabled)) {
          active.value = value; active.dispatchEvent(new Event('change', { bubbles: true })); update(active);
        }
        close();
      }
    });
    search.addEventListener('input', render);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal && !modal.hidden) close(); });
    return modal;
  }
  function update(select) {
    const button = select.parentElement && select.parentElement.querySelector('.bc-product-picker-trigger');
    if (!button) return;
    const option = Array.from(select.options).find(item => item.value === select.value);
    const noun = select.dataset.bcPickerNoun || (select.dataset.bcPickerKind === 'warehouse' ? 'almacén' : select.dataset.bcPickerKind === 'product' ? 'producto' : 'opción');
    button.textContent = option ? option.textContent.trim() : 'Elegir ' + noun + '…';
    button.disabled = !!select.disabled;
    button.classList.toggle('is-placeholder', !option || !select.value); button.title = button.textContent;
    button.setAttribute('aria-label', 'Elegir ' + noun);
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
    const plural = activeKind === 'warehouse' ? 'almacenes' : activeKind === 'product' ? 'productos' : 'opciones';
    status.textContent = matches.length ? matches.length + ' ' + plural : 'No hay ' + plural + ' que coincidan.';
  }
  function open(select, kind) {
    active = select; activeKind = kind || select.dataset.bcPickerKind || 'product'; ensureModal();
    const noun = select.dataset.bcPickerNoun || (activeKind === 'warehouse' ? 'almacén' : activeKind === 'product' ? 'producto' : 'opción');
    title.textContent = 'Elegir ' + noun; search.placeholder = 'Buscar ' + noun + '…'; search.setAttribute('aria-label', 'Buscar ' + noun);
    search.value = ''; render(); modal.hidden = false; document.body.classList.add('bc-product-picker-open');
    window.setTimeout(() => search.focus(), 0);
  }
  function close() { if (!modal) return; modal.hidden = true; document.body.classList.remove('bc-product-picker-open'); active = null; }
  function attach(select) {
    const kind = kindFor(select); if (!kind || !select.parentNode) return;
    const field = document.createElement('div'); field.className = 'bc-product-picker-field'; field.dataset.bcProductPickerField = '1';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'bc-product-picker-trigger is-placeholder';
    const text = identity(select).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
    const noun = /almacen|warehouse|origen|destino/.test(text) ? 'almacén' : /producto|product/.test(text) ? 'producto' : /categor/.test(text) ? 'categoría' : /presentacion/.test(text) ? 'presentación' : /proveedor/.test(text) ? 'proveedor' : /usuario|empleado|trabajador/.test(text) ? 'persona' : /pago/.test(text) ? 'método de pago' : /estado/.test(text) ? 'estado' : /tipo/.test(text) ? 'tipo' : /motivo/.test(text) ? 'motivo' : /unidad/.test(text) ? 'unidad' : /rol/.test(text) ? 'rol' : 'opción';
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-label', 'Elegir ' + noun);
    button.addEventListener('click', () => open(select, kind));
    select.dataset.bcSelectPicker = '1'; select.dataset.bcPickerKind = kind; select.dataset.bcPickerNoun = noun; select.dataset.bcProductPicker = '1';
    select.classList.add('bc-product-picker-native-select'); select.parentNode.insertBefore(field, select); field.append(button, select); update(select);
    select.addEventListener('change', () => update(select));
    new MutationObserver(() => { update(select); if (active === select && modal && !modal.hidden) render(); })
      .observe(select, { childList: true, subtree: true, characterData: true });
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.matches && root.matches('select')) attach(root);
    if (root.querySelectorAll) root.querySelectorAll('select').forEach(attach);
  }
  function refresh(root) { scan(root || document.body); }
  if (document.body) {
    refresh(document.body);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) refresh(node); })))
      .observe(document.body, { childList: true, subtree: true });
  }
  window.__BC_PRODUCT_PICKER_OPEN__ = open; window.__BC_PRODUCT_PICKER_CLOSE__ = close; window.__BC_PRODUCT_PICKER_REFRESH__ = refresh;
})();