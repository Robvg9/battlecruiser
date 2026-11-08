// BattleCruiser — one-modal product chooser for operational product selects.
(function () {
  'use strict';
  if (window.__BC_PRODUCT_SELECT_PICKER__ === '2.0') return;
  window.__BC_PRODUCT_SELECT_PICKER__ = '2.0';
  const KNOWN = new Set(['compra-producto','venta-producto','trf-producto','vale-producto','pp-producto-select','mov-multiple-producto']);
  const EXCLUDED = /categor[ií]|presentaci[oó]n|almac[eé]n|warehouse|motivo|estado|tipo|pago|prioridad|usuario/i;
  let active = null, modal = null, search = null, results = null, status = null;
  const norm = value => String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
  function isProduct(select) {
    if (!select || select.tagName !== 'SELECT' || select.multiple || select.dataset.bcProductPicker === '1') return false;
    if (select.id === 'venta-producto' && document.getElementById('venta-producto-buscar')) return false;
    const label=select.closest('label'), identity=[select.id,select.className,select.getAttribute('aria-label'),select.getAttribute('name'),label?label.textContent:''].join(' ');
    return !EXCLUDED.test(identity) && (KNOWN.has(select.id) || /producto|product|(^|[-_])prod($|[-_])/i.test(identity));
  }
  function ensureModal() {
    if (modal) return modal;
    modal=document.createElement('div');modal.id='bc-product-picker-modal';modal.className='bc-product-picker-modal';modal.hidden=true;
    modal.innerHTML='<div class="bc-product-picker-backdrop" data-bc-picker-close></div><section class="bc-product-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="bc-product-picker-title" tabindex="-1"><header class="bc-product-picker-header"><strong id="bc-product-picker-title">Elegir producto</strong><button type="button" class="bc-product-picker-close" data-bc-picker-close aria-label="Cerrar">×</button></header><input id="bc-product-picker-search" type="search" autocomplete="off" spellcheck="false" placeholder="Buscar producto…" aria-label="Buscar producto"><div id="bc-product-picker-results" class="bc-product-picker-results" role="listbox"></div><p class="bc-product-picker-status" role="status" aria-live="polite"></p></section>';
    document.body.appendChild(modal);search=modal.querySelector('#bc-product-picker-search');results=modal.querySelector('#bc-product-picker-results');status=modal.querySelector('.bc-product-picker-status');
    modal.addEventListener('click',event=>{
      if(event.target.closest('[data-bc-picker-close]')){close();return;}
      const button=event.target.closest('[data-bc-product-value]');
      if(button&&active){const value=button.getAttribute('data-bc-product-value');if(Array.from(active.options).some(o=>o.value===value&&!o.disabled)){active.value=value;active.dispatchEvent(new Event('change',{bubbles:true}));update(active);}close();}
    });
    search.addEventListener('input',render);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal&&!modal.hidden)close();});
    return modal;
  }
  function update(select) {
    const button=select.parentElement&&select.parentElement.querySelector('.bc-product-picker-trigger');if(!button)return;
    const option=Array.from(select.options).find(o=>o.value===select.value);
    button.textContent=option?option.textContent.trim():'Elegir producto…';button.classList.toggle('is-placeholder',!option||!select.value);button.title=button.textContent;
  }
  function render() {
    if(!active||!results)return;const term=norm(search.value);
    const matches=Array.from(active.options).filter(o=>o.value&&!o.disabled&&norm(o.textContent).includes(term));results.innerHTML='';
    matches.forEach(option=>{const b=document.createElement('button');b.type='button';b.className='bc-product-picker-result'+(option.value===active.value?' is-selected':'');b.setAttribute('role','option');b.setAttribute('aria-selected',option.value===active.value?'true':'false');b.setAttribute('data-bc-product-value',option.value);b.textContent=option.textContent.trim();results.appendChild(b);});
    status.textContent=matches.length?matches.length+(matches.length===1?' producto':' productos'):'No hay productos que coincidan.';
  }
  function open(select){active=select;ensureModal();search.value='';render();modal.hidden=false;document.body.classList.add('bc-product-picker-open');window.setTimeout(()=>search.focus(),0);}
  function close(){if(!modal)return;modal.hidden=true;document.body.classList.remove('bc-product-picker-open');active=null;}
  function attach(select) {
    if(!isProduct(select)||!select.parentNode)return;
    const field=document.createElement('div');field.className='bc-product-picker-field';field.dataset.bcProductPickerField='1';
    const button=document.createElement('button');button.type='button';button.className='bc-product-picker-trigger is-placeholder';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-label','Elegir producto');button.addEventListener('click',()=>open(select));
    select.dataset.bcProductPicker='1';select.classList.add('bc-product-picker-native-select');select.parentNode.insertBefore(field,select);field.append(button,select);update(select);
    select.addEventListener('change',()=>update(select));
    new MutationObserver(()=>{update(select);if(active===select&&modal&&!modal.hidden)render();}).observe(select,{childList:true,subtree:true,characterData:true});
  }
  function scan(root){if(!root||root.nodeType!==1)return;if(root.matches&&root.matches('select'))attach(root);if(root.querySelectorAll)root.querySelectorAll('select').forEach(attach);}
  if(document.body){scan(document.body);new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node);}))).observe(document.body,{childList:true,subtree:true});}
  window.__BC_PRODUCT_PICKER_OPEN__=open;window.__BC_PRODUCT_PICKER_CLOSE__=close;
})();