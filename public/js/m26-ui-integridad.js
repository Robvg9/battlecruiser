// BattleCruiser — M26 UI integridad
// v9.2.45 — Productos: alta simple con tres datos NUNCA visible en la página (solo modal al pulsar Agregar/Editar)
(function () {
  'use strict';

  function unificarTurnos() {
    var real = document.getElementById('tab-ciclos');
    if (!real) return;
    document.querySelectorAll('.tab-btn[data-tab="turnos"]').forEach(function (b) { b.remove(); });
    var botones = Array.from(document.querySelectorAll('.tab-btn[data-tab="ciclos"]'));
    botones.slice(1).forEach(function (b) { b.remove(); });
    if (botones[0]) botones[0].textContent = 'Turnos';
    var legacy = document.getElementById('tab-turnos');
    if (legacy) legacy.style.display = 'none';
  }

  function ocultarCompraEnProductos() {
    var form = document.getElementById('form-compra');
    if (!form) return;
    var h = form.previousElementSibling;
    if (h && /^Registrar compra/i.test((h.textContent || '').trim())) h.style.display = 'none';
    form.style.display = 'none';
    form.setAttribute('aria-hidden', 'true');
  }

  // El catálogo de Presentaciones ya vive directamente en Administración.
  // No mover DOM ni crear/abrir una segunda ventana desde Productos.
  function fijarNomenclaturaSoloProductos() { return false; }
  function prepararNomenclatura() { return false; }

  function limpiarInterfazAgregarProducto() {
    var panel = document.getElementById('tab-productos');
    if (!panel) return;
    var m22 = document.getElementById('m22-productos-ui');
    if (m22) m22.remove();
    var m22Btn = document.getElementById('m22-agregar-producto');
    if (m22Btn) m22Btn.remove();
    var m22Close = document.getElementById('m22-cerrar-form');
    if (m22Close) m22Close.remove();
    var toolbarUi = document.querySelector('.bc-product-toolbar');
    if (toolbarUi) toolbarUi.remove();
    var legacyModal = document.getElementById('bc-product-modal');
    if (legacyModal && !legacyModal.querySelector('#bc-product-form-host')) legacyModal.remove();

    panel.querySelectorAll('button').forEach(function (btn) {
      var t = (btn.textContent || '').trim().toLowerCase();
      if ((t === 'cerrar' || t === '×') && !btn.closest('#productos-nomenclatura-modal') && btn.id !== 'bc-product-modal-close' && btn.id !== 'bc-product-modal-cancel') btn.remove();
    });
    panel.querySelectorAll('h1,h2,h3,h4,p,small,legend').forEach(function (el) {
      var t = (el.textContent || '').trim().toLowerCase();
      if (t === 'agregar producto' || t === 'productos' || t === 'catálogo operativo' || t === 'catalogo operativo' || t === 'presentaciones comerciales' || t === 'define la presentación obligatoria antes de guardar' || t === 'define la presentacion obligatoria antes de guardar') {
        if (!el.closest('#form-producto') && !el.closest('#productos-nomenclatura-modal') && !el.closest('#bc-product-modal')) el.remove();
      }
    });
    panel.querySelectorAll('button').forEach(function (btn) {
      var t = (btn.textContent || '').trim().toLowerCase().replace(/^＋\s*/, '');
      if ((t === 'agregar producto' || t === '＋ agregar producto') && btn.id !== 'prod-submit-btn' && btn.id !== 'bc-productos-agregar' && btn.type !== 'submit') btn.remove();
    });
  }

  function ocultarCampoUnidad(form) {
    if (!form) return;
    // productos.unidad stays internal; retail uses the base unit with factor 1.
    var unidad = document.getElementById('prod-unidad');
    if (unidad) {
      unidad.type = 'hidden';
      unidad.style.display = 'none';
      unidad.setAttribute('aria-hidden', 'true');
      unidad.removeAttribute('required');
      var wrap = unidad.closest('.field');
      if (wrap) {
        wrap.style.display = 'none';
        wrap.setAttribute('aria-hidden', 'true');
      }
    }
    var dl = document.getElementById('presentaciones-comunes');
    if (dl) dl.style.display = 'none';
  }

  function aplicarLayoutFormularioProducto(form) {
    if (!form) return;
    ocultarCampoUnidad(form);
    if (form.dataset.bcLayoutV926 === '1') return;

    var nombre = document.getElementById('prod-nombre');
    var categoria = document.getElementById('prod-categoria');
    var normal = document.getElementById('prod-precio-normal');
    var mayorista = document.getElementById('prod-precio-mayorista');
    var formatoVenta = document.getElementById('prod-formato-venta');
    var formatoFactor = document.getElementById('prod-formato-factor');
    var imageWrap = form.querySelector('.prod-imagen-campo');
    var legacyPresCfg = document.getElementById('prod-presentaciones-config');
    var submitBtn = document.getElementById('prod-submit-btn');
    var cancelEdit = document.getElementById('prod-cancelar-edicion');
    var editId = document.getElementById('prod-editando-id');
    var mixedSettings = document.getElementById('prod-inventario-mixto-settings');

    if (!nombre || !categoria || !normal || !mayorista || !formatoVenta || !formatoFactor || !imageWrap || !submitBtn) return;

    var top = document.createElement('div');
    top.className = 'bc-product-form-top';
    var left = document.createElement('div');
    left.className = 'bc-product-form-fields';
    function fieldBlock(el, labelText, className) {
      var box = document.createElement('div');
      box.className = className || 'bc-product-field';
      var lab = document.createElement('label');
      lab.textContent = labelText;
      if (el.id) lab.setAttribute('for', el.id);
      box.appendChild(lab);
      box.appendChild(el);
      return box;
    }
    categoria.required = true;
    nombre.required = true;
    normal.required = true;
    normal.placeholder = 'Precio';
    left.appendChild(fieldBlock(nombre, 'Nombre'));
    left.appendChild(fieldBlock(normal, 'Precio'));
    left.appendChild(fieldBlock(categoria, 'Categoría'));
    top.appendChild(left);
    // Existing advanced data remains editable, but is hidden for new product creation.
    if (legacyPresCfg) legacyPresCfg.remove();
    mayorista.removeAttribute('required');
    mayorista.placeholder = 'Precio mayorista';
    var commercial = document.createElement('section');
    commercial.id = 'bc-product-commercial-settings';
    commercial.className = 'bc-product-commercial-settings';
    var commercialToggle = document.createElement('button');
    commercialToggle.type = 'button';
    commercialToggle.id = 'bc-product-commercial-toggle';
    commercialToggle.className = 'bc-product-commercial-toggle';
    commercialToggle.textContent = 'Datos adicionales de este producto';
    commercialToggle.setAttribute('aria-expanded', 'false');
    commercialToggle.setAttribute('aria-controls', 'bc-product-commercial-panel');
    commercialToggle.hidden = true;
    commercialToggle.style.display = 'none';
    commercialToggle.addEventListener('click', function () {
      setCommercialOptionsExpanded(commercialToggle.getAttribute('aria-expanded') !== 'true');
    });

    var commercialPanel = document.createElement('div');
    commercialPanel.id = 'bc-product-commercial-panel';
    commercialPanel.className = 'bc-product-commercial-panel bc-product-edit-legacy-settings hidden';
    commercialPanel.hidden = true;
    var legacyHeading = document.createElement('div');
    legacyHeading.className = 'bc-product-edit-legacy-heading';
    legacyHeading.textContent = 'Datos adicionales de este producto';
    commercialPanel.appendChild(legacyHeading);
    var commercialFields = document.createElement('div');
    commercialFields.className = 'bc-product-commercial-fields';
    commercialFields.appendChild(fieldBlock(mayorista, 'Precio mayorista', 'bc-product-commercial-field'));
    var wholesaleFormat = document.createElement('div');
    wholesaleFormat.className = 'bc-product-commercial-field bc-product-wholesale-format-field';
    var wholesaleFormatLabel = document.createElement('label');
    wholesaleFormatLabel.setAttribute('for', 'prod-formato-venta');
    wholesaleFormatLabel.textContent = 'Formato de venta';
    var wholesaleFormatRow = document.createElement('div');
    wholesaleFormatRow.className = 'bc-product-wholesale-format-row';
    formatoVenta.placeholder = 'Ej. Caja';
    formatoVenta.setAttribute('aria-label', 'Nombre del formato de venta');
    formatoFactor.placeholder = 'Ej. 24 unidades';
    formatoFactor.setAttribute('aria-label', 'Unidades base por formato');
    wholesaleFormatRow.appendChild(formatoVenta);
    wholesaleFormatRow.appendChild(formatoFactor);
    var wholesaleFormatHint = document.createElement('small');
    wholesaleFormatHint.textContent = 'Unidades de inventario que descuenta cada formato vendido.';
    wholesaleFormat.appendChild(wholesaleFormatLabel);
    wholesaleFormat.appendChild(wholesaleFormatRow);
    wholesaleFormat.appendChild(wholesaleFormatHint);
    commercialFields.appendChild(wholesaleFormat);
    if (imageWrap) commercialFields.appendChild(imageWrap);
    if (mixedSettings) commercialFields.appendChild(mixedSettings);
    commercialPanel.appendChild(commercialFields);
    commercial.appendChild(commercialToggle);
    commercial.appendChild(commercialPanel);
    var actions = document.createElement('div');
    actions.className = 'bc-product-form-actions';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'bc-product-modal-cancel';
    cancelBtn.className = 'cc-accion';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', function (e) {
      e.preventDefault();
      cerrarModalProducto(true);
    });
    if (cancelEdit) {
      cancelEdit.classList.add('hidden');
      cancelEdit.style.display = 'none';
    }
    submitBtn.type = 'submit';
    submitBtn.classList.remove('hidden');
    submitBtn.removeAttribute('hidden');
    submitBtn.style.display = 'inline-flex';
    submitBtn.textContent = 'Guardar producto';
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    var unidad = document.getElementById('prod-unidad');
    var dl = document.getElementById('presentaciones-comunes');
    if (editId) form.appendChild(editId);
    form.appendChild(top);
    form.appendChild(commercial);
    if (unidad) {
      unidad.type = 'hidden';
      unidad.value = unidad.value || 'unidad';
      unidad.style.display = 'none';
      unidad.setAttribute('aria-hidden', 'true');
      form.appendChild(unidad);
    }
    if (dl) {
      dl.style.display = 'none';
      form.appendChild(dl);
    }
    form.appendChild(actions);    form.appendChild(actions);

    var mixedStyle = document.getElementById('bc-product-mixed-stock-css');
    if (!mixedStyle) {
      mixedStyle = document.createElement('style');
      mixedStyle.id = 'bc-product-mixed-stock-css';
      mixedStyle.textContent =
        '.bc-product-wholesale-format-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(105px,.62fr);gap:7px;align-items:center}' +
        '.bc-product-wholesale-format-row input{width:100%;min-width:0;height:36px;min-height:36px;box-sizing:border-box;padding:7px 9px;font-size:11.5px;border-radius:8px}' +
        '.bc-product-wholesale-format-field>small{display:block;margin-top:5px;font-size:9.5px;line-height:1.35;color:var(--mist)}' +
        '@media(max-width:420px){.bc-product-wholesale-format-row{grid-template-columns:minmax(0,1fr) minmax(92px,.62fr);gap:5px}}' +
        '.prod-inventario-mixto-settings{margin:2px 0 0;padding:11px;border:1px solid rgba(201,162,77,.2);border-radius:10px;background:rgba(8,18,15,.32)}' +
        '.prod-inventario-mixto-toggle{display:flex;align-items:flex-start;gap:9px;cursor:pointer}' +
        '.prod-inventario-mixto-toggle input{appearance:auto;width:18px!important;height:18px!important;min-width:18px!important;min-height:18px!important;max-width:18px!important;max-height:18px!important;box-sizing:border-box;padding:0!important;margin:2px 0 0!important;flex:0 0 18px!important;accent-color:var(--gold,#c9a24d)}' +
        '.prod-inventario-mixto-toggle span,.prod-variantes-heading{display:flex;flex-direction:column;gap:3px}' +
        '.prod-inventario-mixto-toggle strong,.prod-variantes-heading strong{font-size:11.5px;color:var(--gold-bright)}' +
        '.prod-inventario-mixto-toggle small,.prod-variantes-heading small{font-size:10px;line-height:1.35;color:var(--mist)}' +
        '.prod-variantes-editor{display:flex;flex-direction:column;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(201,162,77,.13)}' +
        '.prod-variantes-editor[hidden]{display:none!important}' +
        '.prod-variantes-lista{display:flex;flex-direction:column;gap:6px}' +
        '.prod-variante-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}' +
        '.prod-variante-row input{width:100%;min-width:0;height:34px;min-height:34px;padding:6px 9px;font-size:11px}' +
        '.prod-variante-row button{min-height:32px;margin:0;padding:5px 8px;font-size:10px}' +
        '#prod-variante-agregar{align-self:flex-start;min-height:32px;margin:0;padding:6px 9px;font-size:10.5px}' +
        '.producto-mixto-tag{display:inline-block;margin:4px 0 0;padding:3px 6px;border:1px solid rgba(201,162,77,.24);border-radius:6px;color:var(--gold-bright);font-size:9px}' +
        '@media(max-width:560px){.prod-inventario-mixto-settings{padding:9px}.prod-variante-row input{font-size:12px}}';
      document.head.appendChild(mixedStyle);
    }
    form.dataset.bcLayoutV926 = '1';
    form.classList.add('bc-producto-modal-form');
  }

  function asegurarModalProducto() {
    var modal = document.getElementById('bc-product-modal');
    var form = document.getElementById('form-producto');
    if (!form) return null;
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bc-product-modal';
      modal.className = 'bc-product-modal hidden';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML =
        '<div class="bc-product-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="bc-product-modal-title">' +
        '<div class="bc-product-modal-head">' +
        '<h3 id="bc-product-modal-title">Agregar producto</h3>' +
        '<button type="button" id="bc-product-modal-close" class="bc-product-modal-close" aria-label="Cerrar">×</button>' +
        '</div>' +
        '<div id="bc-product-form-host"></div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) cerrarModalProducto(true);
      });
      var close = modal.querySelector('#bc-product-modal-close');
      if (close) close.addEventListener('click', function () { cerrarModalProducto(true); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          var m = document.getElementById('bc-product-modal');
          if (m && !m.classList.contains('hidden')) cerrarModalProducto(true);
        }
      });
    }
    var host = modal.querySelector('#bc-product-form-host');
    if (host && !host.contains(form)) host.appendChild(form);
    aplicarLayoutFormularioProducto(form);
    form.classList.remove('hidden');
    form.removeAttribute('hidden');
    form.classList.add('bc-producto-modal-form');
    return modal;
  }

  function cerrarModalProducto(cancelar) {
    var modal = document.getElementById('bc-product-modal');
    var form = document.getElementById('form-producto');
    if (cancelar && form && form.classList.contains('bc-mixed-config-mode') &&
        typeof window.bcSalirConfiguracionSabores === 'function') {
      window.bcSalirConfiguracionSabores();
      return;
    }
    if (cancelar) {
      if (typeof window.cancelarEdicionProducto === 'function') {
        try {
          if (!window.cancelarEdicionProducto.__bcClosing) {
            window.cancelarEdicionProducto.__bcClosing = true;
            try { window.cancelarEdicionProducto(); } finally { window.cancelarEdicionProducto.__bcClosing = false; }
          }
        } catch (e) {}
      } else if (form) {
        try { form.reset(); } catch (e) {}
        var editando = document.getElementById('prod-editando-id');
        if (editando) editando.value = '';
      }
    }
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (form) {
      form.classList.add('hidden');
      form.dataset.bcProductFormOpen = '0';
    }
  }

  function mostrarFormularioProducto() {
    var form = document.getElementById('form-producto');
    if (!form) return;
    var modal = asegurarModalProducto();
    if (!modal) return;
    var editando = document.getElementById('prod-editando-id');
    var title = modal.querySelector('#bc-product-modal-title');
    var submitBtn = document.getElementById('prod-submit-btn');
    var commercialToggle = document.getElementById('bc-product-commercial-toggle');
    var edit = !!(editando && editando.value);
    if (title) title.textContent = edit ? 'Editar producto' : 'Agregar producto';
    if (submitBtn) submitBtn.textContent = edit ? 'Guardar cambios' : 'Guardar producto';
    // Keep compatibility for M17.2/Pulido while hiding the control on new product creation.
    if (commercialToggle) {
      commercialToggle.hidden = !edit;
      commercialToggle.style.display = edit ? 'flex' : 'none';
    }
    setCommercialOptionsExpanded(edit);
    ocultarCampoUnidad(form);
    form.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    form.dataset.bcProductFormOpen = '1';
    var nombre = document.getElementById('prod-nombre');
    if (nombre) setTimeout(function () { try { nombre.focus(); } catch (e) {} }, 0);
  }

  function setCommercialOptionsExpanded(expanded) {
    var panel = document.getElementById('bc-product-commercial-panel');
    var button = document.getElementById('bc-product-commercial-toggle');
    if (!panel || !button) return false;
    var open = !!expanded;
    panel.hidden = !open;
    panel.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    return true;
  }

  // API estable para que el alta/edición use este único modal y comparta una sola
  // configuración comercial entre categoría, mayorista y pares etiqueta/factor.
  window.__BCM26_openProductModal = mostrarFormularioProducto;
  window.__BCM26_closeProductModal = cerrarModalProducto;
  window.__BCM26_setCommercialOptionsExpanded = setCommercialOptionsExpanded;
  window.__BCM26_ensureCommercialOptions = function () {
    var form = document.getElementById('form-producto');
    if (!form) return false;
    if (form.dataset.bcLayoutV926 !== '1') aplicarLayoutFormularioProducto(form);
    return !!document.getElementById('bc-product-commercial-panel');
  };

  function ocultarFormularioProducto() {
    cerrarModalProducto(false);
  }

  function inyectarEstilosProductos() {
    if (document.getElementById('bc-productos-simple-style')) return;
    var style = document.createElement('style');
    style.id = 'bc-productos-simple-style';
    style.textContent = [
      /* CRÍTICO v9.2.44: el form NUNCA se muestra inline en Productos */
      '#tab-productos #form-producto{display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important}',
      '#form-producto:not(.bc-producto-modal-form){display:none!important}',
      '#bc-product-modal.hidden #form-producto{display:none!important}',
      '#bc-product-modal .bc-product-form-actions{display:flex!important;justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(201,162,77,.18)}',
      '#bc-product-modal #prod-submit-btn{display:inline-flex!important;visibility:visible!important;opacity:1!important;align-items:center;justify-content:center;min-height:40px;padding:10px 16px;border-radius:10px;font-weight:700}',
      '#bc-productos-barra{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;position:sticky;top:0;z-index:20;background:var(--void);padding:6px 0}',
      '#bc-productos-barra .bc-productos-search{width:100%}',
      '#bc-productos-barra #productos-buscar{display:block!important;width:100%;box-sizing:border-box}',
      '#bc-productos-controles{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '#bc-productos-orden{display:flex;gap:7px;flex-wrap:wrap;flex:1 1 auto}',
      '#bc-productos-orden button{flex:0 1 auto}',
      '#bc-productos-orden button.active{border-color:var(--gold);color:var(--gold)}',
      '#bc-productos-vista{display:flex;gap:6px;margin-left:auto}',
      '#bc-productos-agregar{flex:0 0 auto;visibility:visible!important;opacity:1!important;display:inline-flex!important}',
      '#lista-productos{display:block!important}',
      '#lista-productos.bc-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:stretch}',
      '#lista-productos.bc-grid>.lista-item{box-sizing:border-box;min-width:0;min-height:0;aspect-ratio:1/1;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:6px;padding:8px;overflow:hidden}',
      '#lista-productos.bc-grid>.lista-item .producto-thumb{display:block;width:100%;height:60%;min-height:0;max-height:none;object-fit:cover;flex:0 0 60%;border-radius:7px}',
      '#lista-productos.bc-grid>.lista-item .producto-thumb-vacia{height:60%;flex:0 0 60%;background:rgba(255,255,255,.06);border-radius:7px}',
      '#lista-productos.bc-grid>.lista-item>span:not(.lista-item-acciones){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#lista-productos.bc-grid>.lista-item .lista-item-acciones{display:flex;gap:4px;margin-top:auto}',
      '#lista-productos.bc-grid>.lista-item .lista-item-acciones button{flex:1 1 0;min-width:0;padding:5px 4px;font-size:11px}',
      '#bc-product-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:12px;padding-top:max(12px,env(safe-area-inset-top));background:rgba(0,0,0,.72);box-sizing:border-box;overflow:auto}',
      '#bc-product-modal.hidden{display:none!important}',
      '#bc-product-modal .bc-product-modal-dialog{width:min(560px,100%);max-height:none;margin:auto 0;overflow:visible;background:#0f1f1a;border:1px solid rgba(201,162,77,.28);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:0}',
      '#bc-product-modal .bc-product-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 6px;background:#0f1f1a;z-index:2}',
      '#bc-product-modal .bc-product-modal-head h3{margin:0;font-family:Cormorant Garamond,serif;font-weight:600;font-size:1.25rem;color:#c9a24d}',
      '#bc-product-modal .bc-product-modal-close{border:0;background:transparent;color:rgba(255,255,255,.75);font-size:26px;line-height:1;cursor:pointer;padding:2px 8px}',
      '#bc-product-modal #bc-product-form-host{padding:6px 16px 16px}',
      '#bc-product-modal #form-producto,#bc-product-modal #form-producto.bc-producto-modal-form{display:flex!important;flex-direction:column;gap:12px;visibility:visible!important;height:auto!important;overflow:visible!important}',
      '#bc-product-modal #form-producto.hidden{display:flex!important}',
      '#bc-product-modal #presentaciones-comunes{display:none!important}',
      '#bc-product-modal .bc-product-form-top{display:grid;grid-template-columns:minmax(0,1fr) 132px;gap:12px;align-items:start}',
      '#bc-product-modal .bc-product-form-fields{display:flex;flex-direction:column;gap:8px;min-width:0;align-self:start}',
      '#bc-product-modal .bc-product-field{display:block;flex:none!important;height:auto!important;min-height:0!important}',
      '#bc-product-modal .bc-product-field label{display:none}',
      '#bc-product-modal .bc-product-field input,#bc-product-modal .bc-product-field select{display:block;width:100%;height:42px!important;min-height:42px!important;max-height:42px!important;box-sizing:border-box;border-radius:10px;padding:0 12px;background:#0a1612;border:1px solid rgba(255,255,255,.1);color:inherit;line-height:42px;flex:none!important}',
      '#bc-product-modal .bc-product-field input:focus,#bc-product-modal .bc-product-field select:focus{outline:none;border-color:#c9a24d;box-shadow:0 0 0 1px rgba(201,162,77,.35)}',
      '#bc-product-modal .bc-product-form-image{display:block;width:132px;align-self:start}',
      '#bc-product-modal .prod-imagen-campo{width:132px;box-sizing:border-box;padding:8px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#0a1612;display:flex;flex-direction:column;align-items:stretch;gap:6px;text-align:left;overflow:hidden}',
      '#bc-product-modal .prod-imagen-campo .prod-imagen-label{font-size:9px;line-height:1.25;margin:0;letter-spacing:.03em;text-transform:uppercase;color:rgba(255,255,255,.5);white-space:normal}',
      '#bc-product-modal .prod-imagen-campo input[type=file]{width:100%;max-width:100%;font-size:10px;color:rgba(255,255,255,.65)}',
      '#bc-product-modal .prod-imagen-preview-wrap{width:100%;display:flex;flex-direction:column;align-items:center;gap:4px;margin:0}',
      '#bc-product-modal .prod-imagen-preview-wrap.hidden{display:none!important}',
      '#bc-product-modal .prod-imagen-preview{display:block;width:100%;max-width:110px;height:72px;object-fit:cover;border-radius:8px;background:rgba(255,255,255,.04)}',
      '#bc-product-modal .btn-quitar-imagen{width:100%;font-size:11px;padding:6px 8px;margin:0;border-radius:8px;line-height:1.2;white-space:normal}',
      '#bc-product-modal .bc-product-commercial-settings{width:100%;border:1px solid rgba(201,162,77,.22);border-radius:11px;background:rgba(10,22,18,.44);overflow:hidden}',
      '#bc-product-modal .bc-product-commercial-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border:0;background:rgba(201,162,77,.08);color:var(--text);text-align:left;cursor:pointer}',
      '#bc-product-modal .bc-product-commercial-toggle-copy{display:flex;flex-direction:column;gap:3px;min-width:0}',
      '#bc-product-modal .bc-product-commercial-toggle strong{font-size:12.5px;font-weight:700;color:var(--gold-bright)}',
      '#bc-product-modal .bc-product-commercial-toggle small{font-size:10px;line-height:1.35;color:var(--mist)}',
      '#bc-product-modal .bc-product-commercial-chevron{flex:0 0 auto;font-size:20px;line-height:1;color:var(--gold-bright)}',
      '#bc-product-modal .bc-product-commercial-panel{display:block;padding:10px 12px 12px}',
      '#bc-product-modal .bc-product-commercial-panel[hidden],#bc-product-modal .bc-product-commercial-panel.hidden{display:none!important}',
      '#bc-product-modal .bc-product-commercial-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:8px}',
      '#bc-product-modal .bc-product-commercial-field{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '#bc-product-modal .bc-product-commercial-field label{display:block!important;font-size:10px;font-weight:600;line-height:1.25;color:var(--mist)}',
      '#bc-product-modal .bc-product-commercial-field input,#bc-product-modal .bc-product-commercial-field select{width:100%;height:36px;min-height:36px;box-sizing:border-box;padding:0 9px;border-radius:8px;background:#0a1612;border:1px solid rgba(255,255,255,.12);color:inherit;font:500 11.5px Inter,sans-serif}',
      '#bc-product-modal .bc-product-commercial-field input:focus,#bc-product-modal .bc-product-commercial-field select:focus{outline:none;border-color:#c9a24d;box-shadow:0 0 0 1px rgba(201,162,77,.25)}',
      '#bc-product-modal .bc-product-form-actions{display:flex;flex-direction:column;gap:0;border-top:none;padding-top:2px;margin-top:0}',
      '#bc-product-modal .bc-product-form-actions #bc-product-modal-cancel{display:none!important}',
      '#bc-product-modal .bc-product-form-actions #prod-submit-btn{margin:0;width:100%;border:0;border-radius:12px;padding:13px 16px;font-weight:600;font-size:15px;background:#c9a24d;color:#0c1c18;cursor:pointer;height:auto!important;min-height:0!important}',
      '#bc-product-modal .bc-product-form-actions #prod-submit-btn:hover{filter:brightness(1.05)}',
      '#bc-product-modal #prod-cancelar-edicion{display:none!important}',
      '#bc-product-modal #form-producto.inline-form{display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;gap:12px!important}',
      '#bc-product-modal #form-producto.inline-form>*{flex:none!important;width:auto}',
      '#bc-product-modal #form-producto.inline-form input,#bc-product-modal #form-producto.inline-form select{flex:none!important}',
      '@media(max-width:700px){#lista-productos.bc-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#lista-productos.bc-grid>.lista-item{padding:7px}#bc-product-modal{padding:8px;align-items:flex-start}#bc-product-modal .bc-product-modal-dialog{width:100%;border-radius:14px}#bc-product-modal .bc-product-form-top{grid-template-columns:minmax(0,1fr) 120px;gap:10px;align-items:start}#bc-product-modal .bc-product-form-image,#bc-product-modal .prod-imagen-campo{width:120px}#bc-product-modal .bc-product-field input,#bc-product-modal .bc-product-field select{height:40px!important;min-height:40px!important;max-height:40px!important;line-height:40px}#bc-product-modal .bc-product-commercial-fields{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(style);
  }

  function simplificarProductos() {
    var panel = document.getElementById('tab-productos');
    if (!panel) return false;
    var form = document.getElementById('form-producto');
    var lista = document.getElementById('lista-productos');
    var buscar = document.getElementById('productos-buscar');
    if (!form || !lista || !buscar || typeof renderProductosLista !== 'function') return false;

    // Siempre: CSS + ocultar form (idempotente, aunque ya se haya simplificado)
    inyectarEstilosProductos();
    asegurarModalProducto();

    // The boot retry may run after the owner has already opened the modal.
    // Once compact mode is initialized, do not close an active form on retries.
    if (panel.dataset.bcSimple === '1') return true;
    ocultarFormularioProducto();
    panel.dataset.bcSimple = '1';
    limpiarInterfazAgregarProducto();
    form = document.getElementById('form-producto');
    if (!form) return false;
    ocultarFormularioProducto();

    if (!document.getElementById('bc-productos-barra')) {
      var barra = document.createElement('div');
      barra.id = 'bc-productos-barra';
      barra.className = 'bc-productos-barra';
      var searchWrap = document.createElement('div');
      searchWrap.className = 'bc-productos-search';
      var parent = buscar.parentElement;
      searchWrap.appendChild(buscar);
      if (parent && parent !== panel && parent !== searchWrap) parent.style.display = 'none';
      barra.appendChild(searchWrap);

      var controles = document.createElement('div');
      controles.id = 'bc-productos-controles';
      controles.className = 'bc-productos-controles';
      var orden = document.createElement('div');
      orden.id = 'bc-productos-orden';
      orden.className = 'bc-productos-orden';
      [['nombre-asc', 'A–Z'], ['nombre-desc', 'Z–A'], ['categoria', 'Categoría']].forEach(function (pair) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'cc-accion bc-prod-sort'; b.dataset.sort = pair[0]; b.textContent = pair[1]; orden.appendChild(b);
      });
      var vista = document.createElement('div');
      vista.id = 'bc-productos-vista'; vista.className = 'bc-productos-vista';
      var fila = document.createElement('button');
      fila.type = 'button'; fila.className = 'cc-accion active'; fila.textContent = '☰'; fila.title = 'Vista en filas';
      var cuadricula = document.createElement('button');
      cuadricula.type = 'button'; cuadricula.className = 'cc-accion'; cuadricula.textContent = '■ ■ ■ ■'; cuadricula.title = 'Vista en cuadros';
      vista.appendChild(fila); vista.appendChild(cuadricula); orden.appendChild(vista); controles.appendChild(orden);

      var agregar = document.createElement('button');
      agregar.type = 'button';
      agregar.id = 'bc-productos-agregar';
      agregar.className = 'cc-accion';
      agregar.textContent = 'Agregar producto';
      agregar.setAttribute('aria-controls', 'form-producto');
      agregar.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof cancelarEdicionProducto === 'function') {
          try { cancelarEdicionProducto(); } catch (err) {}
        }
        var openNativeProductModal = window.__BCM26_openProductModal;
        if (typeof openNativeProductModal === 'function') openNativeProductModal();
        else mostrarFormularioProducto();
      });
      controles.appendChild(agregar);
      barra.appendChild(controles);
      panel.insertBefore(barra, panel.firstChild);

      if (!panel.contains(lista)) panel.appendChild(lista);

      Array.from(panel.children).forEach(function (el) {
        if (el === barra || el === lista || el === form || el.id === 'msg-productos' || el.id === 'productos-nomenclatura-btn' || el.id === 'productos-tools-nomenclatura') return;
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'h3' || el.id === 'form-compra' || el.classList.contains('presentaciones-panel') || el.classList.contains('productos-buscador-controles')) {
          el.style.display = 'none';
          el.setAttribute('aria-hidden', 'true');
        }
      });

      var sortMode = 'nombre-asc';
      function ordenarProductos() {
        if (typeof _cache === 'undefined' || !Array.isArray(_cache.productos)) return;
        var arr = _cache.productos.slice();
        arr.sort(function (a, b) {
          if (sortMode === 'categoria') {
            var ca = ((a.categorias && a.categorias.nombre) || '').localeCompare((b.categorias && b.categorias.nombre) || '', 'es', { sensitivity: 'base' });
            return ca || (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
          }
          var c = (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
          return sortMode === 'nombre-desc' ? -c : c;
        });
        _cache.productos = arr;
        renderProductosLista();
      }
      orden.querySelectorAll('.bc-prod-sort').forEach(function (b) {
        b.addEventListener('click', function () {
          sortMode = b.dataset.sort;
          orden.querySelectorAll('.bc-prod-sort').forEach(function (x) { x.classList.toggle('active', x === b); });
          ordenarProductos();
        });
      });
      orden.querySelector('.bc-prod-sort').classList.add('active');

      function setVista(grid) {
        lista.classList.toggle('bc-grid', grid);
        fila.classList.toggle('active', !grid);
        cuadricula.classList.toggle('active', grid);
        try { localStorage.setItem('bc-productos-vista', grid ? 'grid' : 'lista'); } catch (e) {}
      }
      fila.addEventListener('click', function () { setVista(false); });
      cuadricula.addEventListener('click', function () { setVista(true); });
      var guardada = 'lista';
      try { guardada = localStorage.getItem('bc-productos-vista') || 'lista'; } catch (e) {}
      setVista(guardada === 'grid');
    }

    if (typeof window.cancelarEdicionProducto === 'function' && !window.cancelarEdicionProducto.__bcM26) {
      var originalCancel = window.cancelarEdicionProducto;
      window.cancelarEdicionProducto = function () {
        originalCancel.apply(this, arguments);
        var submitBtn = document.getElementById('prod-submit-btn');
        if (submitBtn) submitBtn.textContent = 'Guardar producto';
        if (!window.cancelarEdicionProducto.__bcClosing) ocultarFormularioProducto();
      };
      window.cancelarEdicionProducto.__bcM26 = true;
    }

    if (form && !form.dataset.bcM26SubmitHook) {
      form.dataset.bcM26SubmitHook = '1';
      form.addEventListener('submit', function () {
        setTimeout(function () {
          var msg = document.getElementById('msg-productos');
          if (msg && /creado|actualizado|✓/i.test(msg.textContent || '')) {
            ocultarFormularioProducto();
          }
        }, 500);
      });
    }

    if (lista && !lista.dataset.bcM26EditHook) {
      lista.dataset.bcM26EditHook = '1';
      lista.addEventListener('click', function (e) {
        if (e.target.closest('.btn-editar-producto')) {
          setTimeout(function () { mostrarFormularioProducto(); }, 0);
        }
      });
    }

    return true;
  }

  function arreglarEdicionProducto() {}

  function asegurarAccesoGasto() {
    var tab = document.getElementById('tab-operacion');
    if (!tab || document.getElementById('bc-acceso-gasto')) return;
    var header = tab.querySelector('.pendientes-header');
    if (!header) return;
    var btn = document.createElement('button');
    btn.id = 'bc-acceso-gasto';
    btn.type = 'button';
    btn.className = 'cc-accion';
    btn.textContent = '💸 Registrar gasto';
    btn.addEventListener('click', function () {
      var form = document.getElementById('form-gasto-operativo');
      if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var input = document.getElementById('fin-g-concepto');
        if (input) input.focus();
      } else if (typeof setMsg === 'function') {
        setMsg('msg-operacion', 'No tienes permiso para crear gastos o el módulo todavía está cargando.', false);
      }
    });
    header.appendChild(btn);
  }

  function run() {
    unificarTurnos();
    ocultarCompraEnProductos();
    limpiarInterfazAgregarProducto();
    simplificarProductos();
    arreglarEdicionProducto();
    asegurarAccesoGasto();
  }

  // Reintentos: a veces productos.js aún no expuso renderProductosLista
  function boot() {
    run();
    var intentos = 0;
    var t = setInterval(function () {
      intentos++;
      var ok = simplificarProductos();
      if (ok || intentos >= 12) clearInterval(t);
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }
})();
