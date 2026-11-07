// BattleCruiser — 16.5: formularios de Transferencias y Compras en Movimientos.
(function () {
  'use strict';
  if (window.__BC165) return;
  window.__BC165 = true;

  const refs = { transferencias: null, compras: null };

  function visibilitySnapshot(panel) {
    const styles = {};
    ['display', 'visibility', 'opacity'].forEach(property => {
      styles[property] = {
        value: panel.style.getPropertyValue(property),
        priority: panel.style.getPropertyPriority(property)
      };
    });
    return { styles, hidden: panel.hasAttribute('hidden'), ariaHidden: panel.getAttribute('aria-hidden') };
  }

  function revealPanel(panel) {
    panel.removeAttribute('hidden');
    panel.removeAttribute('aria-hidden');
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('visibility', 'visible', 'important');
    panel.style.setProperty('opacity', '1', 'important');
  }

  function restorePanel(panel, snapshot) {
    if (!snapshot) return;
    ['display', 'visibility', 'opacity'].forEach(property => {
      const entry = snapshot.styles[property];
      if (entry && entry.value) panel.style.setProperty(property, entry.value, entry.priority);
      else panel.style.removeProperty(property);
    });
    if (snapshot.hidden) panel.setAttribute('hidden', '');
    else panel.removeAttribute('hidden');
    if (snapshot.ariaHidden === null) panel.removeAttribute('aria-hidden');
    else panel.setAttribute('aria-hidden', snapshot.ariaHidden);
  }

  function captureTab(key) {
    let current = refs[key];
    if (current && current.panel && current.placeholder && current.originalParent) {
      if (current.button) current.button.classList.add('hidden');
      const activeOverlay = document.getElementById('bc165-overlay');
      // Transferencia uses a detached, dedicated form host; its source tab
      // stays parked outside the overlay while the form itself remains active.
      if (!(activeOverlay && (activeOverlay.contains(current.panel) ||
          (key === 'transferencias' && activeOverlay.querySelector('#form-transferencia'))))) {
        current.panel.classList.remove('visible');
        current.panel.classList.add('bc165-placeholder');
      }
      return current;
    }
    const button = document.querySelector('.tab-btn[data-tab="' + key + '"]');
    const panel = document.getElementById('tab-' + key);
    if (!panel || !panel.parentNode) return null;
    const originalParent = panel.parentNode;
    const placeholder = document.createComment('bc165-' + key);
    originalParent.insertBefore(placeholder, panel);
    current = { button, panel, placeholder, originalParent };
    refs[key] = current;
    panel.dataset.bc165 = '1';
    if (button) button.classList.add('hidden');
    panel.classList.remove('visible');
    panel.classList.add('bc165-placeholder');
    return current;
  }

  function setModalStatus(overlay, message) {
    const host = overlay && overlay.querySelector('.bc165-panel-host');
    if (!host) return;
    let status = host.querySelector('.bc165-feedback');
    if (!status) {
      status = document.createElement('p');
      status.className = 'bc165-feedback';
      status.setAttribute('role', 'status');
      host.insertBefore(status, host.firstChild);
    }
    status.textContent = message || '';
    status.hidden = !message;
  }

  function hasSelectableOption(id) {
    const select = document.getElementById(id);
    return !!select && Array.prototype.some.call(select.options, option => option.value !== '');
  }

  function rememberAndMove(node, key, destination, reference) {
    if (!node || !node.parentNode || node.parentNode === destination) return;
    const current = refs.transferencias;
    const placeholder = document.createComment('bc165-' + key);
    node.parentNode.insertBefore(placeholder, node);
    current[key + 'Placeholder'] = placeholder;
    destination.insertBefore(node, reference || null);
  }

  function restoreMovedNode(current, key, fallbackParent) {
    const placeholder = current && current[key + 'Placeholder'];
    if (!placeholder || !placeholder.parentNode) return;
    const node = document.getElementById(
      key === 'multiPanel' ? 'movimiento-multiple-panel' :
      key === 'transferForm' ? 'form-transferencia' :
      key === 'transferMessage' ? 'msg-transferencias' : 'trf-stock-disponible'
    );
    if (node) placeholder.parentNode.insertBefore(node, placeholder.nextSibling);
    placeholder.remove();
  }

  function ensureTransferField(form, id, labelText, placeholderText) {
    const control = form.querySelector('#' + id);
    if (!control) return;
    let wrapper = form.querySelector('[data-bc165-field="' + id + '"]');
    if (!wrapper) {
      const existingLabel = form.querySelector('label[for="' + id + '"]');
      wrapper = document.createElement('div');
      wrapper.className = 'bc165-transfer-field';
      wrapper.dataset.bc165Field = id;
      const anchor = existingLabel || control;
      form.insertBefore(wrapper, anchor);
      const label = existingLabel || document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = labelText;
      wrapper.appendChild(label);
      wrapper.appendChild(control);
    } else {
      const label = wrapper.querySelector('label');
      if (label) label.textContent = labelText;
    }
    control.setAttribute('aria-label', labelText);
    if (control.tagName === 'SELECT') {
      let empty = Array.prototype.find.call(control.options, option => option.value === '');
      if (!empty) {
        empty = document.createElement('option');
        empty.value = '';
        control.insertBefore(empty, control.firstChild);
      }
      empty.textContent = placeholderText;
      empty.disabled = false;
      if (!control.value) control.value = '';
    } else if (placeholderText) {
      control.setAttribute('placeholder', placeholderText);
    }
  }

  function prepareTransferForm(current, overlay) {
    const sourcePanel = current && current.panel;
    const multiPanel = sourcePanel && sourcePanel.querySelector('#movimiento-multiple-panel');
    const host = overlay && overlay.querySelector('.bc165-panel-host');
    if (!multiPanel || !host) {
      setModalStatus(overlay, 'No se cargó el formulario de transferencia múltiple. Actualiza la PWA y vuelve a abrirla.');
      return null;
    }
    host.innerHTML =
      '<section class="bc165-transfer-shell" aria-label="Transferencia de varios productos">' +
        '<div class="bc165-transfer-multi-host"></div>' +
      '</section>';
    rememberAndMove(multiPanel, 'multiPanel', host.querySelector('.bc165-transfer-multi-host'));
    multiPanel.classList.add('bc165-transfer-multiple');
    const legacyForm = sourcePanel.querySelector('#form-transferencia');
    if (legacyForm) { legacyForm.style.display = 'none'; legacyForm.setAttribute('aria-hidden', 'true'); }
    return multiPanel;
  }

  function ensureTransferFormPlaceholders() {
    const form = document.getElementById('form-transferencia');
    if (!form) return;
    ensureTransferField(form, 'trf-origen', 'Almacén de origen', 'Selecciona el almacén de origen…');
    ensureTransferField(form, 'trf-destino', 'Almacén de destino', 'Selecciona el almacén de destino…');
    ensureTransferField(form, 'trf-producto', 'Producto', 'Selecciona el producto…');
    ensureTransferField(form, 'trf-cantidad', 'Cantidad a transferir', 'Escribe la cantidad…');
  }

  function activateTransferCatalogs(overlay) {
    const needsWarehouses = !hasSelectableOption('mov-multiple-origen') || !hasSelectableOption('mov-multiple-destino');
    const needsProducts = !hasSelectableOption('mov-multiple-producto');
    const tasks = [];
    if (needsWarehouses && typeof window.refrescarAlmacenes === 'function') {
      tasks.push(Promise.resolve().then(() => window.refrescarAlmacenes()));
    }
    if (needsProducts && typeof window.refrescarStockYSelects === 'function') {
      tasks.push(Promise.resolve().then(() => window.refrescarStockYSelects()));
    }
    return Promise.allSettled(tasks).then(() => {
      if (typeof window.__BC_MOVIMIENTO_MULTIPLE_REFRESH__ === 'function') {
        try { window.__BC_MOVIMIENTO_MULTIPLE_REFRESH__(); } catch (error) { console.warn(error); }
      }
      const missing = [];
      if (!hasSelectableOption('mov-multiple-origen') || !hasSelectableOption('mov-multiple-destino')) missing.push('almacenes');
      if (!hasSelectableOption('mov-multiple-producto')) missing.push('productos');
      setModalStatus(overlay, missing.length
        ? 'No se pudieron cargar ' + missing.join(' y ') + '. Comprueba la conexión e inténtalo de nuevo. No se ha registrado ninguna transferencia.'
        : '');
    });
  }

  function style() {
    if (document.getElementById('bc165-css')) return;
    const sheet = document.createElement('style');
    sheet.id = 'bc165-css';
    sheet.textContent =
      '.bc165-actions{display:flex;align-items:center;justify-content:flex-end;flex:0 0 auto;width:auto;min-width:0;box-sizing:border-box;gap:6px;margin:0 0 0 auto}' +
      '.bc165-action{display:inline-flex;align-items:center;justify-content:center;height:42px;min-height:42px;min-width:42px;width:42px;box-sizing:border-box;padding:0;white-space:nowrap;line-height:1.3;background:var(--stone-2);color:var(--gold-bright);border:1px solid var(--gold-dim);border-radius:50%;cursor:pointer;font-size:12.5px;font-weight:600}' +
      '.bc165-action svg{width:21px;height:21px;display:block}.bc165-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}' +
      '.bc165-action:hover{border-color:var(--gold);color:var(--gold-bright)}' +
      '.bc165-overlay{position:fixed;inset:0;z-index:9400;background:rgba(6,14,11,.82);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}' +
      '.bc165-modal{width:min(760px,100%);max-height:calc(100dvh - 32px);overflow:auto;margin:16px auto;background:var(--stone);border:1px solid rgba(212,176,92,.32);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:16px}' +
      '.bc165-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.bc165-head h3{margin:0;color:var(--gold)}' +
      '.bc165-close{background:none;border:1px solid rgba(212,176,92,.2);border-radius:7px;color:var(--mist);width:34px;height:34px;cursor:pointer;font-size:18px}' +
      '.bc165-panel-host{min-height:40px}.bc165-feedback{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(212,176,92,.22);border-radius:8px;background:rgba(212,176,92,.07);color:var(--mist);font-size:12px;line-height:1.4}' +
      '.bc165-transfer-shell{display:flex;flex-direction:column;gap:10px}.bc165-transfer-multi-host{min-width:0}.bc165-transfer-multi-host>#movimiento-multiple-panel{max-width:none}.bc165-transfer-multi-host .mov-transfer-lines{max-height:160px}.bc165-transfer-intro{margin:0;color:var(--mist);font-size:.8rem;line-height:1.45}' +
      '#bc165-overlay #form-transferencia.bc165-transfer-form{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:100%;margin:0;padding:4px 0;visibility:visible!important;opacity:1!important}' +
      '#bc165-overlay .bc165-transfer-field{display:flex;flex-direction:column;gap:5px;min-width:0}' +
      '#bc165-overlay .bc165-transfer-field label{display:block;color:var(--mist);font-size:.72rem;font-weight:600}' +
      '#bc165-overlay .bc165-transfer-field select,#bc165-overlay .bc165-transfer-field input{display:block!important;width:100%;height:44px;min-width:0;box-sizing:border-box;padding:0 11px;border:1px solid rgba(212,176,92,.32);border-radius:7px;background:var(--void,#0c1c18);color:var(--text);font-size:.85rem;visibility:visible!important;opacity:1!important}' +
      '#bc165-overlay #form-transferencia .bc165-transfer-submit{grid-column:1/-1;min-height:44px;width:100%;padding:10px 14px;border:0;border-radius:7px;background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#211605;font-weight:700;font-size:.85rem;cursor:pointer}' +
      '.bc165-transfer-support{display:flex;flex-direction:column;gap:6px}.bc165-transfer-support .msg{margin:0}.bc165-transfer-support #trf-stock-disponible{margin:0;font-size:.76rem}' +
      '.bc165-panel-host>.tab-panel{display:block!important;visibility:visible!important;position:static!important;margin:0!important;max-width:none!important}' +
      '.bc165-overlay #tab-transferencias,.bc165-overlay #tab-compras{display:block!important;visibility:visible!important;opacity:1!important;position:static!important;margin:0!important;max-width:none!important;min-width:0!important;width:100%!important;box-sizing:border-box!important}' +
      '.bc165-overlay #tab-transferencias input,.bc165-overlay #tab-transferencias select,.bc165-overlay #tab-transferencias button,.bc165-overlay #tab-compras input,.bc165-overlay #tab-compras select,.bc165-overlay #tab-compras button{pointer-events:auto!important;position:relative;z-index:2}' +
      '#tab-movimientos.bc-m51 .bc-m51-hero{display:flex;flex-wrap:nowrap;align-items:center;gap:9px;min-width:0;max-width:100%;box-sizing:border-box}' +
      '#tab-movimientos.bc-m51 .bc-m51-hero>*{min-width:0;max-width:100%;box-sizing:border-box}#tab-movimientos.bc-m51 .bc-m51-hero>div:first-child{flex:1 1 auto}#tab-movimientos.bc-m51 .bc-m51-hero h3{font-size:clamp(1.05rem,4vw,1.55rem);line-height:1.05}#tab-movimientos.bc-m51 .bc165-actions{flex:0 0 auto;width:auto;min-width:0}' +
      '@media(max-width:640px){#tab-movimientos.bc-m51 .bc165-actions{gap:5px}.bc165-overlay{padding:8px}.bc165-modal{width:100%;max-width:100%;box-sizing:border-box;padding:12px;margin:8px auto}#bc165-overlay #form-transferencia.bc165-transfer-form{grid-template-columns:minmax(0,1fr);gap:10px}}' +
      '.bc165-modal .bc-m51,.bc165-modal .bc-m51 *{max-width:none}.bc165-placeholder{display:none!important}';
    document.head.appendChild(sheet);
  }

  function open(type) {
    const current = captureTab(type);
    if (!current || !current.panel) return;
    const existing = document.getElementById('bc165-overlay');
    if (existing && existing.dataset.type === type &&
        (type === 'transferencias' ? !!existing.querySelector('#movimiento-multiple-panel') : existing.contains(current.panel))) return;
    if (existing) close(existing.dataset.type, existing);

    const overlay = document.createElement('div');
    overlay.className = 'bc165-overlay';
    overlay.id = 'bc165-overlay';
    overlay.dataset.type = type;
    const title = type === 'transferencias' ? 'Nueva Transferencia' : 'Nueva Compra';
    current.modalVisibility = visibilitySnapshot(current.panel);
    overlay.innerHTML =
      '<div class="bc165-modal" role="dialog" aria-modal="true" aria-label="' + title + '">' +
        '<div class="bc165-head"><h3>' + title + '</h3><button type="button" class="bc165-close" aria-label="Cerrar">×</button></div>' +
        '<div class="bc165-panel-host"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    if (type === 'transferencias') {
      prepareTransferForm(current, overlay);
      activateTransferCatalogs(overlay);
    } else {
      overlay.querySelector('.bc165-panel-host').appendChild(current.panel);
      current.panel.classList.remove('bc165-placeholder');
      current.panel.classList.add('visible');
      revealPanel(current.panel);
      if (typeof window.__BC_COMPRAS_ACTIVAR === 'function') {
        Promise.resolve().then(() => window.__BC_COMPRAS_ACTIVAR()).catch(error => {
          console.error('[BattleCruiser] No se pudo cargar el catálogo de compra', error);
        });
      }
    }

    overlay.querySelector('.bc165-close').onclick = () => close(type, overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(type, overlay);
    });
  }

  function restoreTransferForm(current) {
    if (!current || !current.panel) return;
    restoreMovedNode(current, 'multiPanel', current.panel);
    const multiPanel = current.panel.querySelector('#movimiento-multiple-panel');
    if (multiPanel) multiPanel.classList.remove('bc165-transfer-multiple');
    const legacyForm = current.panel.querySelector('#form-transferencia');
    if (legacyForm) { legacyForm.style.display = 'none'; legacyForm.setAttribute('aria-hidden', 'true'); }
  }

  function close(type, overlay) {
    const current = refs[type];
    if (type === 'transferencias') restoreTransferForm(current);
    if (current && current.panel && current.modalVisibility) {
      restorePanel(current.panel, current.modalVisibility);
      current.modalVisibility = null;
    }
    if (current && current.panel && current.placeholder && current.placeholder.parentNode === current.originalParent) {
      current.originalParent.insertBefore(current.panel, current.placeholder.nextSibling);
    }
    if (current && current.panel) {
      current.panel.classList.remove('visible');
      current.panel.classList.add('bc165-placeholder');
    }
    if (overlay) overlay.remove();
  }

  function install() {
    const movements = document.getElementById('tab-movimientos');
    if (!movements) return false;
    style();
    captureTab('transferencias');
    captureTab('compras');
    const host = movements.querySelector('.bc-m51-hero') || movements.firstElementChild;
    if (!host) return false;
    let actions = host.querySelector('.bc165-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'bc165-actions';
      host.appendChild(actions);
    }
    function ensure(key, label) {
      const current = refs[key];
      if (!current || !current.panel || actions.querySelector('[data-bc165="' + key + '"]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bc165-action';
      button.dataset.bc165 = key;
      button.setAttribute('aria-label', label);
      button.title = label;
      const icon = key === 'transferencias'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h17l-4-4M21 17H4l4 4"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2l2.2 11h10.9L21 7H6"/><circle cx="10" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/></svg>';
      button.innerHTML = icon + '<span class="bc165-sr-only">' + label + '</span>';
      button.onclick = () => {
        if (typeof window.__BC165_open === 'function') window.__BC165_open(key);
      };
      actions.appendChild(button);
    }
    ensure('transferencias', 'Nueva Transferencia');
    ensure('compras', 'Nueva Compra');
    return true;
  }

  function boot() {
    [0, 300, 900, 1800, 3000, 5000].forEach(delay => setTimeout(install, delay));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.__BC165_open = open;
  window.__BC165_close = close;
  window.__BC165_verify = function () {
    return {
      transferTabHidden: !!document.querySelector('.tab-btn[data-tab="transferencias"].hidden') ||
        !!document.querySelector('.tab-btn[data-tab="transferencias"].hidden'),
      purchaseTabHidden: !document.querySelector('.tab-btn[data-tab="compras"]') ||
        !!document.querySelector('.tab-btn[data-tab="compras"].hidden'),
      newTransfer: !!document.querySelector('[data-bc165="transferencias"]'),
      newPurchase: !!document.querySelector('[data-bc165="compras"]'),
      transferPanelPresent: !!(refs.transferencias && refs.transferencias.panel),
      transferFormPresent: !!document.querySelector('#bc165-overlay #movimiento-multiple-panel'),
      transferLegacyFormHidden: !!(refs.transferencias && refs.transferencias.panel &&
        refs.transferencias.panel.querySelector('#form-transferencia') &&
        refs.transferencias.panel.querySelector('#form-transferencia').style.display === 'none'),
      purchasePanelPresent: !!(refs.compras && refs.compras.panel)
    };
  };
})();