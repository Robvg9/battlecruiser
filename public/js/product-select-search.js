// BattleCruiser — searchable product selectors
// Adds a small local filter to every operational product select. It only
// filters the existing option list; it never changes product IDs or submits data.
(function () {
  'use strict';
  if (window.__BC_PRODUCT_SELECT_SEARCH__) return;
  window.__BC_PRODUCT_SELECT_SEARCH__ = true;

  const KNOWN_IDS = new Set([
    'compra-producto', 'venta-producto', 'trf-producto', 'vale-producto',
    'pp-producto-select', 'adm-b-prod', 'sal-prod', 'mov-multiple-producto'
  ]);
  const EXCLUDED = /categor[ií]|presentaci[oó]n|almac[eé]n|warehouse|motivo|estado|tipo|pago|prioridad|usuario/i;

  function normalized(value) {
    return String(value == null ? '' : value).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  }

  function isProductSelect(select) {
    if (!select || select.tagName !== 'SELECT' || select.dataset.bcProductSearch === '1') return false;
    if (select.multiple) return false;
    if (select.id === 'venta-producto' && document.getElementById('venta-producto-buscar')) return false;
    const label = select.closest('label');
    const labelText = label ? label.textContent : '';
    const identity = [select.id, select.className, select.getAttribute('aria-label'),
      select.getAttribute('name'), labelText].join(' ');
    if (EXCLUDED.test(identity)) return false;
    const keyMatch = KNOWN_IDS.has(select.id) || /producto|product|(^|[-_])prod($|[-_])/i.test(identity);
    if (!keyMatch) return false;
    return true;
  }

  function attach(select) {
    if (!isProductSelect(select) || !select.parentNode) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'bc-product-select-search-wrap';
    wrapper.dataset.bcProductSearchWrap = '1';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'bc-product-select-search';
    input.placeholder = 'Buscar producto…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Buscar producto en la lista');

    const noResults = document.createElement('small');
    noResults.className = 'bc-product-select-no-results';
    noResults.textContent = 'No hay productos que coincidan.';
    noResults.hidden = true;

    select.dataset.bcProductSearch = '1';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(input, select, noResults);

    function filter() {
      const term = normalized(input.value);
      let matches = 0;
      Array.from(select.options).forEach(option => {
        const placeholder = option.value === '' || (option.disabled && !option.value);
        const match = placeholder || !term || normalized(option.textContent).includes(term);
        option.hidden = !match && !option.selected;
        if (!placeholder && match) matches++;
      });
      noResults.hidden = !term || matches > 0;
    }

    input.addEventListener('input', filter);
    new MutationObserver(filter).observe(select, { childList: true });
    filter();
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches('select')) attach(root);
    if (root.querySelectorAll) root.querySelectorAll('select').forEach(attach);
  }

  scan(document.body);
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(scan));
  }).observe(document.body, { childList: true, subtree: true });
})();
