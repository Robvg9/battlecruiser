// BattleCruiser M75 v75.3 — interfaz compacta de Productos y encabezado global.
(function () {
  'use strict';
  if (window.__BCM75_PRODUCTS_UI) return;
  window.__BCM75_PRODUCTS_UI = true;
  var STYLE_ID = 'bc-m75-products-compact-style';
  var listObserver = null;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#app-shell.visible > .app-header{box-sizing:border-box;padding:8px 16px!important;min-height:54px;gap:8px!important;margin-bottom:8px!important}',
      '#app-shell.visible > .app-header .header-left{min-width:0;gap:9px!important;align-items:center}',
      '#app-shell.visible > .app-header .header-left h1{font-size:clamp(16px,2vw,19px)!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden;text-overflow:ellipsis}',
      '#app-shell.visible > .app-header .header-right{gap:6px 8px!important;font-size:11.5px!important;align-items:center}',
      '#app-shell.visible > .app-header .header-right button{min-height:32px!important;padding:6px 10px!important;border-radius:8px!important;font-size:11.5px!important;line-height:1.1!important;white-space:nowrap!important}',
      '#conn-status-app{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid rgba(212,176,92,.16);border-radius:999px;background:rgba(212,176,92,.055);font-size:10.5px!important;line-height:1.2}',
      '#conn-status-app .status-dot{width:7px;height:7px;flex:0 0 7px}',
      '#user-email{display:block;max-width:clamp(130px,22vw,260px);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px!important;line-height:1.2}',
      '@media(max-width:759px),(hover:none) and (pointer:coarse){',
      '#app-shell.visible > .app-header{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto!important;grid-template-areas:"brand account logout" "status queue user"!important;align-items:center!important;gap:5px 7px!important;padding:7px 2px 8px!important;width:100%}',
      '#app-shell.visible > .app-header .header-left{grid-area:brand;min-width:0;gap:7px!important;padding-left:0!important}',
      '#app-shell.visible > .app-header .header-left h1{font-size:16px!important;max-width:100%}',
      '#app-shell.visible > .app-header .header-right{display:contents!important}',
      '#sidebar-toggle-btn{width:36px!important;height:34px!important;min-width:36px!important;flex:0 0 36px!important;margin:0!important;border-radius:8px!important}',
      '#sidebar-toggle-btn svg{width:18px!important;height:18px!important}',
      '#mi-cuenta-btn{grid-area:account;justify-self:end;min-height:30px!important;padding:5px 8px!important;font-size:10.5px!important}',
      '#logout-btn{grid-area:logout;justify-self:end;min-height:30px!important;margin:0!important;padding:5px 8px!important;font-size:10.5px!important}',
      '#conn-status-app{grid-area:status;justify-self:start;min-width:0;padding:4px 7px;font-size:10px!important}',
      '#cola-pendientes-badge{grid-area:queue;justify-self:center;max-width:100%}',
      '#user-email{grid-area:user;justify-self:end;max-width:40vw;text-align:right;font-size:10.5px!important}',
      '}',
      '#tab-productos #bc-productos-barra{position:relative!important;top:auto!important;display:flex!important;flex-direction:column!important;gap:8px!important;margin:0 0 12px!important;padding:0 0 8px!important;background:transparent!important;z-index:3!important}',
      '#tab-productos #bc-productos-barra .bc-productos-search{width:100%!important;min-width:0!important}',
      '#tab-productos #bc-productos-barra #productos-buscar{width:100%!important;min-height:40px!important;box-sizing:border-box!important;border-radius:9px!important;padding:8px 12px!important;font-size:13px!important}',
      '#tab-productos #bc-productos-controles{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;flex-wrap:nowrap!important;width:100%!important}',
      '#tab-productos #bc-productos-filtros{display:flex;align-items:center;flex:1 1 auto;min-width:0}',
      '#tab-productos #bc-productos-categoria-filter{width:100%;min-width:0;min-height:36px;box-sizing:border-box;padding:6px 30px 6px 10px;border:1px solid rgba(212,176,92,.22);border-radius:8px;background:var(--stone);color:var(--text);font:500 11.5px Inter,sans-serif}',
      '#tab-productos #bc-productos-agregar{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;min-height:36px!important;min-width:116px!important;margin:0!important;padding:7px 12px!important;border:1px solid var(--gold)!important;border-radius:8px!important;background:var(--gold)!important;color:#0c1c18!important;font-size:12px!important;font-weight:700!important;line-height:1.1!important;white-space:nowrap!important;visibility:visible!important;opacity:1!important}',
      '#tab-productos #bc-productos-orden,#tab-productos #bc-productos-vista{display:none!important}',
      '#tab-productos #bc-productos-controles .bc-m44-view-tools{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important;flex:0 0 auto!important;margin:0!important;min-height:32px!important;padding:0!important}',
      '#tab-productos #bc-productos-controles .bc-m44-view-label{display:none!important}',
      '#tab-productos #bc-productos-controles .bc-m44-view-btn{min-height:32px!important;padding:6px 8px!important;font-size:10.5px!important;line-height:1!important}',
      '#tab-productos .bc-category-hidden{display:none!important}',
      '#tab-productos #productos-tools-nomenclatura{display:none!important}',
      '#bc-product-presentations-entry{margin:10px 0 14px;padding:12px 14px;border:1px solid rgba(212,176,92,.18);border-radius:10px;background:var(--stone)}',
      '#bc-product-presentations-entry h3{margin:0 0 5px;font-size:16px}',
      '#bc-product-presentations-entry p{margin:0 0 9px;font-size:11.5px;line-height:1.4;color:var(--mist)}',
      '#bc-product-presentations-entry #productos-tools-nomenclatura{display:block!important;margin:0!important}',
      '#bc-product-presentations-entry #productos-nomenclatura-btn{min-height:34px;padding:7px 11px;font-size:11.5px;border-radius:8px}',
      '#bc-product-modal .bc-product-modal-head{display:flex!important;align-items:center!important;gap:8px!important;padding:9px 12px 5px!important}',
      '#bc-product-modal .bc-product-modal-head h3{font-size:1.1rem!important;line-height:1.15!important;flex:1 1 auto;min-width:0}',
      '#bc-product-modal #bc-product-import-open{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-height:31px;padding:6px 8px;border:1px solid rgba(212,176,92,.35);border-radius:8px;background:rgba(212,176,92,.1);color:var(--gold-bright);font:600 10.5px/1.1 Inter,sans-serif;white-space:nowrap;cursor:pointer}',
      '#bc-product-modal #bc-product-form-host{padding:4px 12px 12px!important}',
      '#bc-product-modal #form-producto,#bc-product-modal #form-producto.bc-producto-modal-form{gap:8px!important}',
      '#bc-product-modal .bc-product-form-top{grid-template-columns:minmax(0,1fr) 104px!important;gap:8px!important}',
      '#bc-product-modal .bc-product-form-fields{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}',
      '#bc-product-modal .bc-product-field:nth-child(1),#bc-product-modal .bc-product-field:nth-child(2){grid-column:1/-1}',
      '#bc-product-modal .bc-product-field input,#bc-product-modal .bc-product-field select{height:36px!important;min-height:36px!important;max-height:36px!important;padding:0 8px!important;font-size:11.5px!important;line-height:36px!important;border-radius:8px!important}',
      '#bc-product-modal .bc-product-form-image,#bc-product-modal .prod-imagen-campo{width:104px!important;max-width:104px!important}',
      '#bc-product-modal .prod-imagen-campo{gap:5px!important;padding:6px!important;border-radius:9px!important}',
      '#bc-product-modal .prod-imagen-campo .prod-imagen-label{font-size:8px!important;line-height:1.2!important}',
      '#bc-product-modal .prod-imagen-preview{height:58px!important;max-width:88px!important}',
      '#bc-product-modal .prod-imagen-campo{align-items:flex-start!important;gap:6px!important}',
      '#bc-product-modal .prod-imagen-selector{display:flex!important;align-items:center!important;gap:8px!important;width:100%!important;min-height:34px!important}',
      '#bc-product-modal .prod-imagen-input-oculto{display:none!important}',
      '#bc-product-modal .prod-imagen-selector .prod-imagen-elegir{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;padding:6px!important;border:1px solid rgba(212,176,92,.4)!important;border-radius:8px!important;background:rgba(212,176,92,.12)!important;color:var(--gold-bright)!important;cursor:pointer!important}',
      '#bc-product-modal .prod-imagen-selector .prod-imagen-elegir svg{display:block!important;width:19px!important;height:19px!important}',
      '#bc-product-modal .prod-imagen-selector .prod-imagen-elegir:disabled{opacity:.55!important;cursor:wait!important}',
      '#bc-product-modal .prod-imagen-nombre{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:9px!important;color:var(--mist)!important}',
      '#bc-product-modal .prod-imagen-preview-wrap{align-items:flex-start!important;flex-direction:row!important;justify-content:flex-start!important;gap:7px!important}',
      '#bc-product-modal .prod-imagen-preview{width:88px!important;height:88px!important;max-width:88px!important;aspect-ratio:1/1!important;object-fit:cover!important;border-radius:9px!important}',

      '#bc-product-modal .prod-pres-config{padding:8px 9px!important;border-radius:9px!important}',
      '#bc-product-modal .prod-pres-config legend{font-size:11.5px!important;font-weight:600}',
      '#bc-product-modal .prod-pres-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}',
      '#bc-product-modal .prod-pres-config .field{min-width:0!important;gap:3px!important}',
      '#bc-product-modal .prod-pres-config .field label{font-size:9.5px!important;line-height:1.2!important}',
      '#bc-product-modal .prod-pres-config small{font-size:8.5px!important;line-height:1.2!important}',
      '#bc-product-modal .prod-pres-config select,#bc-product-modal .prod-pres-config input{width:100%;height:33px!important;min-height:33px!important;padding:0 7px!important;font-size:10.5px!important;border-radius:7px!important}',
      '#bc-product-modal .bc-product-form-actions #prod-submit-btn{min-height:40px!important;padding:10px 12px!important;font-size:13px!important;border-radius:9px!important}',
      '#bc-m55-overlay{z-index:11000!important;padding:8px!important}',
      '#bc-m55-overlay .bc-m55-modal{width:min(720px,100%)!important;margin:8px auto!important;padding:12px!important;border-radius:11px!important}',
      '@media(max-width:700px){#tab-productos #bc-productos-controles{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-areas:"filters add" "views views"!important;gap:7px!important}#tab-productos #bc-productos-filtros{grid-area:filters;min-width:0}#tab-productos #bc-productos-agregar{grid-area:add;min-width:108px!important;padding:7px 9px!important;font-size:11px!important}#tab-productos #bc-productos-controles .bc-m44-view-tools{grid-area:views;justify-self:end!important}#tab-productos #bc-productos-controles .bc-m44-view-btn{padding:6px 8px!important}#bc-product-modal{padding:7px!important}#bc-product-modal .bc-product-modal-dialog{width:100%!important;border-radius:12px!important}#bc-product-modal .bc-product-form-top{grid-template-columns:minmax(0,1fr) 92px!important;gap:7px!important}#bc-product-modal .bc-product-form-image,#bc-product-modal .prod-imagen-campo{width:92px!important;max-width:92px!important}#bc-product-modal .prod-pres-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}}'
    ].join('\n');
    style.textContent += "\n" + "/* Administration compact layout: styles travel with cache-busted M75. */\n#tab-config .bc-admin-content{display:grid;gap:10px;min-width:0}\n#tab-config .bc-admin-heading{margin:0;display:flex;align-items:flex-end;justify-content:space-between;gap:8px}\n#tab-config .bc-admin-heading h2{margin:0;font-size:clamp(22px,5vw,27px);line-height:1.08}\n#tab-config .bc-admin-heading p{margin:4px 0 0;font-size:11.5px;line-height:1.35}\n#tab-config .bc-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;align-items:stretch;min-width:0}\n#tab-config .bc-admin-card{display:flex;flex-direction:column;align-items:stretch;gap:7px;min-width:0;min-height:112px;margin:0;padding:10px 11px;border-radius:10px}\n#tab-config .bc-admin-card h3{margin:0;font-size:15px;line-height:1.2}\n#tab-config .bc-admin-card p{margin:0;font-size:10.5px;line-height:1.35;color:var(--mist)}\n#tab-config .bc-admin-card-heading{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}\n#tab-config .bc-admin-tag{flex:0 0 auto;padding:3px 6px;border:1px solid rgba(212,176,92,.2);border-radius:999px;color:var(--gold-bright);font-size:8.5px;line-height:1.15;text-transform:uppercase;letter-spacing:.04em}\n#tab-config .bc-admin-roles #bc-btn-config-roles{width:100%;min-height:36px;margin:0;padding:7px 9px;border-radius:8px;font-size:10.5px;line-height:1.2;white-space:normal}\n#tab-config .bc-admin-catalogs{grid-column:1/-1;min-height:0}\n#tab-config .bc-admin-catalog-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0}\n#tab-config .bc-admin-subcard{display:flex;flex-direction:column;gap:6px;min-width:0;padding:8px;border:1px solid rgba(212,176,92,.15);border-radius:8px;background:rgba(6,16,14,.28)}\n#tab-config .bc-admin-subcard h4{margin:0;font-size:11.5px;line-height:1.2;color:var(--gold-bright)}\n#tab-config .bc-admin-subcard .inline-form{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;margin:0}\n#tab-config .bc-admin-subcard .inline-form input{width:100%;min-width:0;height:34px;min-height:34px;padding:6px 8px;border-radius:7px;font-size:10.5px}\n#tab-config .bc-admin-subcard .inline-form button{min-height:34px;margin:0;padding:6px 8px;border-radius:7px;font-size:10px;line-height:1.15;white-space:normal}\n#tab-config .bc-admin-subcard .lista{display:flex;flex-direction:column;gap:0;max-height:132px;overflow:auto;overscroll-behavior:contain}\n#tab-config .bc-admin-subcard .lista .lista-item{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:0;padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.055);font-size:10px;line-height:1.2}\n#tab-config .bc-admin-subcard .lista .lista-item:last-child{border-bottom:0}\n#tab-config .bc-admin-subcard .lista .lista-item-acciones{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap}\n#tab-config .bc-admin-subcard .lista .catalogo-edit-btn,#tab-config .bc-admin-subcard .lista .catalogo-delete-btn,#tab-config .bc-admin-subcard .lista .catalogo-toggle-btn{flex:0 0 auto;min-height:27px;margin:0;padding:4px 7px;border-radius:6px;font-size:9px;line-height:1.1}\n#tab-config .bc-admin-subcard .lista .catalogo-delete-btn{border-color:rgba(220,105,90,.48);color:#e0a29a}\n#tab-config #msg-config{min-height:0;margin:0;font-size:10.5px;line-height:1.3}\n#bc-product-presentations-entry{min-width:0}\n@media(max-width:380px){#tab-config .bc-admin-grid{gap:7px}#tab-config .bc-admin-card{padding:9px;gap:6px}#tab-config .bc-admin-card h3{font-size:13px}#tab-config .bc-admin-catalog-grid{grid-template-columns:1fr;gap:7px}}";
    style.textContent += '';
    document.head.appendChild(style);
  }

  function removeLegacyProductControls(panel) {
    if (!panel) return;
    ['#bc164-add-open','#bc171-add','#bc-m55-template','#bc149-menu','.bc-m55-bar','.bc164-tools','.bc-product-toolbar'].forEach(function (selector) {
      panel.querySelectorAll(selector).forEach(function (node) { node.remove(); });
    });
    var primary = document.getElementById('bc-productos-agregar');
    panel.querySelectorAll('button').forEach(function (button) {
      if (button === primary) return;
      var label = (button.textContent || '').replace(/^[＋+]\s*/, '').trim().toLowerCase();
      if (label === 'agregar producto' || label === 'registrar nuevo producto') button.remove();
      if (/^(importar excel\s*\/\s*csv|importar productos|plantilla xlsx|plantilla csv)$/i.test(label)) button.remove();
    });
  }

  function refreshCategoryOptions(select) {
    if (!select) return;
    var rows = window._cache && Array.isArray(window._cache.categorias) ? window._cache.categorias : [];
    var current = select.value;
    var signature = rows.map(function (row) { return String(row.id) + ':' + String(row.nombre || row.name || ''); }).join('|');
    if (select.dataset.signature === signature) return;
    select.dataset.signature = signature;
    select.innerHTML = '';
    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'Todas las categorías';
    select.appendChild(all);
    rows.forEach(function (row) {
      var option = document.createElement('option');
      option.value = String(row.id);
      option.textContent = String(row.nombre || row.name || 'Sin nombre');
      select.appendChild(option);
    });
    if (rows.some(function (row) { return String(row.id) === current; })) select.value = current;
    else select.value = '';
  }

  function applyCategoryFilter() {
    var select = document.getElementById('bc-productos-categoria-filter');
    var list = document.getElementById('lista-productos');
    if (!select || !list) return;
    var categoryId = String(select.value || '');
    var products = window._cache && Array.isArray(window._cache.productos) ? window._cache.productos : [];
    list.querySelectorAll('[data-ctx-tipo="producto"][data-ctx-id]').forEach(function (card) {
      var product = products.find(function (row) { return String(row.id) === String(card.dataset.ctxId); });
      var matches = !categoryId || (product && String(product.categoria_id || '') === categoryId);
      card.classList.toggle('bc-category-hidden', !matches);
    });
  }

  function ensureToolbar() {
    var panel = document.getElementById('tab-productos');
    var controls = document.getElementById('bc-productos-controles');
    var add = document.getElementById('bc-productos-agregar');
    var bar = document.getElementById('bc-productos-barra');
    if (!panel || !controls || !add || !bar) return false;
    add.textContent = 'Agregar producto';
    add.setAttribute('aria-controls', 'bc-product-modal');
    add.setAttribute('aria-haspopup', 'dialog');
    var filterWrap = document.getElementById('bc-productos-filtros');
    if (!filterWrap) {
      filterWrap = document.createElement('div');
      filterWrap.id = 'bc-productos-filtros';
      var select = document.createElement('select');
      select.id = 'bc-productos-categoria-filter';
      select.setAttribute('aria-label', 'Filtrar productos por categoría');
      filterWrap.appendChild(select);
      controls.insertBefore(filterWrap, add);
      select.addEventListener('change', applyCategoryFilter);
    }
    refreshCategoryOptions(filterWrap.querySelector('select'));
    // Keep the single M44 selector (Filas/Cuadros) but remove M26's legacy
    // sort/view containers; M75 owns the compact toolbar layout.
    var viewTools = controls.querySelector('.bc-m44-view-tools');
    controls.querySelectorAll('#bc-productos-orden,#bc-productos-vista').forEach(function (node) { node.remove(); });
    var duplicateViewTools = controls.querySelectorAll('.bc-m44-view-tools');
    Array.prototype.slice.call(duplicateViewTools, 1).forEach(function (node) { node.remove(); });
    controls.insertBefore(filterWrap, viewTools || add);
    Array.from(controls.children).forEach(function (node) {
      if (node === add || node === filterWrap || node.classList.contains('bc-m44-view-tools')) return;
      node.remove();
    });
    removeLegacyProductControls(panel);
    if (!listObserver) {
      var list = document.getElementById('lista-productos');
      if (list && typeof MutationObserver === 'function') {
        listObserver = new MutationObserver(function () { applyCategoryFilter(); });
        listObserver.observe(list, { childList: true });
      }
    }
    applyCategoryFilter();
    return true;
  }

  function moveNomenclatureToAdmin() {
    ['#bc-product-presentations-entry','#productos-tools-nomenclatura','#productos-nomenclatura-btn','#productos-nomenclatura-modal'].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) { node.remove(); });
    });
    return false;
  }

  function ensureModalImporter() {
    var modal = document.getElementById('bc-product-modal');
    var head = modal && modal.querySelector('.bc-product-modal-head');
    if (!modal || !head) return false;
    var button = document.getElementById('bc-product-import-open');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'bc-product-import-open';
      button.textContent = 'Importar Excel / CSV';
      button.setAttribute('aria-label', 'Importar productos desde Excel o CSV');
      var close = head.querySelector('#bc-product-modal-close');
      head.insertBefore(button, close || null);
      button.addEventListener('click', function () {
        if (typeof window.__BCM55_openOffline === 'function') window.__BCM55_openOffline();
        else if (typeof window.setMsg === 'function') window.setMsg('msg-productos', 'El importador todavía está cargando. Cierra y vuelve a abrir la ventana.', false);
      });
    }
    modal.querySelectorAll('button').forEach(function (candidate) {
      if (candidate === button || candidate.id === 'bc-product-modal-close' || candidate.id === 'bc-product-modal-cancel') return;
      var label = (candidate.textContent || '').trim().toLowerCase();
      if (/importar|plantilla|excel|csv/.test(label)) candidate.remove();
    });
    return true;
  }

  function apply() {
    installStyles();
    var panel = document.getElementById('tab-productos');
    removeLegacyProductControls(panel);
    var a = ensureToolbar();
    var b = moveNomenclatureToAdmin();
    var c = ensureModalImporter();
    var logout = document.getElementById('logout-btn');
    if (logout) { logout.textContent = 'Salir'; logout.setAttribute('aria-label', 'Cerrar sesión'); logout.title = 'Cerrar sesión'; }
    var account = document.getElementById('mi-cuenta-btn');
    if (account) account.textContent = 'Mi cuenta';
    var user = document.getElementById('user-email');
    if (user && user.textContent) user.title = user.textContent.trim();
    return { toolbar: a, nomenclature: b, importer: c };
  }

  function boot() {
    var attempts = 0;
    function retry() { attempts += 1; apply(); if (attempts < 24) window.setTimeout(retry, 400); }
    retry();
  }

  window.__BCM75_apply = apply;
  window.__BCM75_verify = function () {
    var panel = document.getElementById('tab-productos');
    var modal = document.getElementById('bc-product-modal');
    var add = document.getElementById('bc-productos-agregar');
    var controls = document.getElementById('bc-productos-controles');
    var tools = document.getElementById('productos-tools-nomenclatura');
    var importButton = document.getElementById('bc-product-import-open');
    return {
      addButtonCount: panel ? Array.from(panel.querySelectorAll('button')).filter(function (button) {
        var label = (button.textContent || '').replace(/^[＋+]\s*/, '').trim().toLowerCase();
        return label === 'agregar producto' || label === 'registrar nuevo producto';
      }).length : 0,
      addLabel: add ? add.textContent : null,
      categoryFilter: !!document.getElementById('bc-productos-categoria-filter'),
      viewButtonCount: panel ? panel.querySelectorAll('.bc-m44-view-tools .bc-m44-view-btn').length : 0,
      viewControlsInToolbar: !!(controls && controls.querySelector('.bc-m44-view-tools')),
      nomenclatureInAdmin: false,
      presentationsPanelInAdministration: !!document.querySelector('#tab-config .presentaciones-panel'),
      presentationsPanelOutsideProducts: !document.querySelector('#tab-productos .presentaciones-panel'),
      duplicateCatalogModal: !!document.getElementById('productos-nomenclatura-modal'),
      importButtonCount: modal ? modal.querySelectorAll('#bc-product-import-open').length : 0,
      importButtonLabel: importButton ? importButton.textContent : null,
      formStillInNativeModal: !!(modal && modal.contains(document.getElementById('form-producto')))
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();