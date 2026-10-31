// BattleCruiser — M69: aislamiento estricto de secciones y Productos
// Repara estilos inline heredados que dejan Configuración pintada sobre otras pestañas.
// No toca permisos de datos ni operaciones de negocio.
(function () {
  'use strict';
  var VERSION = '20261030.1';
  if (window.__BC_SECTION_SCOPE_FIX__ === VERSION) return;
  window.__BC_SECTION_SCOPE_FIX__ = VERSION;

  var timer = null;
  var applying = false;
  var initialized = false;

  function mainRoot() {
    return document.querySelector('.main-content');
  }

  function permissionsReady() {
    var shell = document.getElementById('app-shell');
    return !!(shell && shell.getAttribute('data-bc-permisos-cargados') === '1');
  }

  function panels() {
    var main = mainRoot();
    if (!main) return [];
    return Array.prototype.filter.call(main.children, function (el) {
      return el && el.classList && el.classList.contains('tab-panel');
    });
  }

  function activePanel(all) {
    var main = mainRoot();
    if (!main) return null;
    var buttons = Array.prototype.slice.call(
      document.querySelectorAll('#tabs .tab-btn.active[data-tab]')
    );
    for (var i = buttons.length - 1; i >= 0; i--) {
      var btn = buttons[i];
      if (btn.getAttribute('data-bc-permiso') !== '1' ||
          btn.classList.contains('hidden') ||
          btn.classList.contains('tab-sin-permiso') ||
          btn.style.display === 'none') continue;
      var id = 'tab-' + btn.getAttribute('data-tab');
      var target = document.getElementById(id);
      if (target && target.parentElement === main &&
          target.classList.contains('tab-panel') &&
          target.getAttribute('data-bc-permiso') === '1' &&
          !target.hasAttribute('hidden') &&
          all.indexOf(target) !== -1) return target;
    }
    for (var j = 0; j < all.length; j++) {
      if (all[j].classList.contains('visible') &&
          all[j].getAttribute('data-bc-permiso') === '1' &&
          !all[j].hasAttribute('hidden') &&
          !all[j].classList.contains('hidden') &&
          !all[j].classList.contains('tab-sin-permiso')) return all[j];
    }
    return null;
  }

  function setImportant(el, property, value) {
    if (!el) return;
    if (el.style.getPropertyValue(property) !== value ||
        el.style.getPropertyPriority(property) !== 'important') {
      el.style.setProperty(property, value, 'important');
    }
  }

  function installStyles() {
    if (document.getElementById('bc-section-scope-style')) return;
    var style = document.createElement('style');
    style.id = 'bc-section-scope-style';
    style.textContent =
      '#tab-productos .presentaciones-panel,' +
      '#tab-productos #form-compra,' +
      '#tab-productos #bc176-pres-anchor,' +
      '#tab-productos .productos-buscador-controles{' +
      'display:none!important;visibility:hidden!important}' +
      '#tab-productos #productos-tools-nomenclatura{' +
      'display:flex;justify-content:flex-end;margin:0 0 10px}' +
      '#tab-productos #productos-nomenclatura-btn{display:inline-flex!important}';
    document.head.appendChild(style);
  }

  function isolateProductExtras() {
    var product = document.getElementById('tab-productos');
    if (!product) return;

    // The product surface is the catalogue; master catalogs live only in the
    // explicit Nomenclatura modal, while supplier purchase uses #tab-compras.
    var purchase = product.querySelector('#form-compra');
    if (purchase) {
      setImportant(purchase, 'display', 'none');
      purchase.setAttribute('aria-hidden', 'true');
      var heading = purchase.previousElementSibling;
      if (heading && /^registrar compra/i.test((heading.textContent || '').trim())) {
        setImportant(heading, 'display', 'none');
        heading.setAttribute('aria-hidden', 'true');
      }
    }

    Array.prototype.forEach.call(
      product.querySelectorAll('.presentaciones-panel, #bc176-pres-anchor, .productos-buscador-controles'),
      function (el) {
        // Only suppress the legacy in-tab copy. Content moved to a modal is
        // outside #tab-productos and is therefore not affected by this rule.
        setImportant(el, 'display', 'none');
        setImportant(el, 'visibility', 'hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    );

    var tools = product.querySelector('#productos-tools-nomenclatura');
    if (tools && !tools.closest('#productos-nomenclatura-modal')) {
      tools.removeAttribute('aria-hidden');
      if (tools.style.getPropertyValue('display') === 'none' &&
          tools.style.getPropertyPriority('display') === 'important') {
        tools.style.removeProperty('display');
      }
    }
  }

  function enforce() {
    if (applying) return;
    var main = mainRoot();
    var all = panels();
    if (!main || !all.length) return;
    if (!permissionsReady()) {
      all.forEach(function (panel) {
        if (panel.classList.contains('visible')) panel.classList.remove('visible');
        setImportant(panel, 'display', 'none');
        panel.setAttribute('aria-hidden', 'true');
      });
      return;
    }
    var current = activePanel(all);
    if (!current) {
      all.forEach(function (panel) {
        if (panel.classList.contains('visible')) panel.classList.remove('visible');
        setImportant(panel, 'display', 'none');
        panel.setAttribute('aria-hidden', 'true');
      });
      return;
    }
    applying = true;
    try {
      all.forEach(function (panel) {
        var selected = panel === current;
        if (selected) {
          if (!panel.classList.contains('visible')) panel.classList.add('visible');
          setImportant(panel, 'display', 'block');
          setImportant(panel, 'visibility', 'visible');
          setImportant(panel, 'opacity', '1');
          panel.setAttribute('aria-hidden', 'false');
        } else {
          if (panel.classList.contains('visible')) panel.classList.remove('visible');
          // Inline !important beats stale overrides from legacy scripts. On
          // selection, this same contract restores the active panel to block.
          setImportant(panel, 'display', 'none');
          panel.setAttribute('aria-hidden', 'true');
        }
      });
      isolateProductExtras();
      window.__BC_SECTION_SCOPE_DIAGNOSTICS__ = {
        version: VERSION,
        activePanelId: current.id,
        visiblePanelIds: all.filter(function (panel) {
          return panel.style.getPropertyValue('display') !== 'none';
        }).map(function (panel) { return panel.id; }),
        productExtrasHidden: (function () {
          var product = document.getElementById('tab-productos');
          if (!product) return false;
          var extras = product.querySelectorAll('.presentaciones-panel, #form-compra, #bc176-pres-anchor, .productos-buscador-controles');
          return Array.prototype.every.call(extras, function (el) {
            return el.style.getPropertyValue('display') === 'none' &&
              el.style.getPropertyPriority('display') === 'important';
          });
        })()
      };
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      timer = null;
      enforce();
    }, 0);
  }

  function isTabButtonNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches && node.matches('.tab-btn[data-tab]')) return true;
    return !!(node.querySelector && node.querySelector('.tab-btn[data-tab]'));
  }

  function handleTabsMutations(records) {
    var relevant = records.some(function (record) {
      if (record.type === 'attributes') {
        return !!(record.target && record.target.classList &&
          record.target.classList.contains('tab-btn'));
      }
      var changed = Array.prototype.slice.call(record.addedNodes || [])
        .concat(Array.prototype.slice.call(record.removedNodes || []));
      return changed.some(isTabButtonNode);
    });
    if (relevant) schedule();
  }

  function handleMainMutations(records, main) {
    var relevant = records.some(function (record) {
      if (record.type === 'attributes') {
        return record.target && record.target.parentElement === main &&
          record.target.classList && record.target.classList.contains('tab-panel');
      }
      var changed = Array.prototype.slice.call(record.addedNodes || [])
        .concat(Array.prototype.slice.call(record.removedNodes || []));
      return changed.some(function (node) {
        return !!(node && node.nodeType === 1 && node.classList &&
          node.classList.contains('tab-panel'));
      });
    });
    if (relevant) schedule();
  }

  function boot() {
    if (initialized) return;
    initialized = true;
    installStyles();
    schedule();
    [80, 300, 900, 1800, 3200, 5200].forEach(function (delay) {
      window.setTimeout(enforce, delay);
    });

    var tabs = document.getElementById('tabs');
    var main = mainRoot();
    if (tabs) {
      tabs.addEventListener('click', function (event) {
        var button = event.target && event.target.closest
          ? event.target.closest('.tab-btn[data-tab]') : null;
        if (!button || !tabs.contains(button)) return;
        schedule();
        window.setTimeout(enforce, 50);
        window.setTimeout(enforce, 180);
      }, true);
      new MutationObserver(handleTabsMutations).observe(tabs, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'data-tab', 'style']
      });
    }
    if (main) {
      // Only direct tab-panel boundaries affect section isolation. Watching every
      // descendant class made ordinary control updates re-run the full panel scan.
      new MutationObserver(function (records) {
        handleMainMutations(records, main);
      }).observe(main, {
        childList: true, attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    window.setTimeout(boot, 0); // covers dynamically evaluated late scripts and DOM emulators
  } else {
    boot();
  }
  window.__BC_SECTION_SCOPE_VERIFY__ = function () {
    enforce();
    return window.__BC_SECTION_SCOPE_DIAGNOSTICS__ || null;
  };
})();