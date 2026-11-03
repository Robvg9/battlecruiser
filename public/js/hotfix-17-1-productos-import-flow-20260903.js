// BattleCruiser — 17.1.1: un solo propietario del formulario de Productos (M26).
(function () {
  'use strict';
  if (window.__BC171_SINGLE_OWNER) return;
  window.__BC171_SINGLE_OWNER = true;
  window.__BC171 = true;

  function restoreFormFromLegacyOverlay(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    var form = overlay.querySelector('#form-producto');
    var host = document.getElementById('bc-product-form-host');
    if (form && host && !host.contains(form)) host.appendChild(form);
    overlay.remove();
  }

  function cleanLegacy() {
    restoreFormFromLegacyOverlay('bc171-overlay');
    restoreFormFromLegacyOverlay('bc164-overlay');
    document.getElementById('bc171-add')?.remove();
    document.getElementById('bc-m55-template')?.remove();
    document.querySelectorAll('#tab-productos .bc-m55-bar').forEach(function (node) {
      node.remove();
    });
  }

  function ensure() {
    var tab = document.getElementById('tab-productos');
    var form = document.getElementById('form-producto');
    var modal = document.getElementById('bc-product-modal');
    var addButton = document.getElementById('bc-productos-agregar');

    // M26 crea el botón/modal después de que renderProductosLista esté listo.
    // No crear un segundo botón ni un segundo overlay mientras el propietario no exista.
    if (!tab || !form || !modal || !addButton ||
        typeof window.__BCM26_openProductModal !== 'function') return false;

    cleanLegacy();
    addButton.textContent = 'Registrar nuevo producto';
    addButton.setAttribute('aria-controls', 'bc-product-modal');
    addButton.setAttribute('aria-haspopup', 'dialog');

    // El alta desde el botón M26 ya limpia cualquier edición anterior.
    // La edición programática llama al API del modal sin borrar el ID preparado por M17.3.
    window.__BC171_open = function () {
      if (typeof window.__BCM26_openProductModal !== 'function') return false;
      window.__BCM26_openProductModal();
      return !modal.classList.contains('hidden');
    };
    window.__BC171_close = function () {
      if (typeof window.__BCM26_closeProductModal !== 'function') return false;
      window.__BCM26_closeProductModal(false);
      return true;
    };

    return true;
  }

  function boot() {
    [0, 300, 800, 1500, 3000, 5000].forEach(function (ms) {
      setTimeout(ensure, ms);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.__BC171_verify = function () {
    var form = document.getElementById('form-producto');
    var modal = document.getElementById('bc-product-modal');
    return {
      singleOwner: !!(form && modal && modal.contains(form)),
      nativeAddButton: !!document.getElementById('bc-productos-agregar'),
      addLabel: document.getElementById('bc-productos-agregar')?.textContent || null,
      noSecondAddButton: !document.getElementById('bc171-add'),
      noSecondOverlay: !document.getElementById('bc171-overlay'),
      openAdapter: typeof window.__BC171_open === 'function',
      closeAdapter: typeof window.__BC171_close === 'function'
    };
  };
})();
