// BattleCruiser — 17.1: flujo definitivo de alta/importación de productos
(function(){
  'use strict';
  if(window.__BC171)return; window.__BC171=true;
  var overlay=null, placeholder=null, form=null;
  function css(){
    if(document.getElementById('bc171-css'))return;
    var s=document.createElement('style');s.id='bc171-css';s.textContent=''
      +'.bc171-overlay{position:fixed;inset:0;z-index:9800;background:rgba(4,12,10,.84);display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow:auto}'
      +'.bc171-modal{width:min(920px,100%);margin:20px auto;background:var(--stone);border:1px solid rgba(212,176,92,.34);border-radius:14px;box-shadow:0 28px 80px rgba(0,0,0,.62);padding:18px}'
      +'.bc171-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}'
      +'.bc171-head h3{margin:0;color:var(--gold);font-family:Inter,system-ui,sans-serif;font-size:20px}'
      +'.bc171-close{width:34px;height:34px;border:1px solid rgba(212,176,92,.2);border-radius:8px;background:transparent;color:var(--mist);font-size:22px;cursor:pointer}'
      +'.bc171-steps{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0 14px}'
      +'.bc171-step{padding:12px;border:1px solid rgba(212,176,92,.18);border-radius:10px;background:rgba(8,20,17,.55)}'
      +'.bc171-step strong{display:block;color:var(--gold-bright);font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}'
      +'.bc171-step p{margin:0 0 9px;color:var(--mist);font-size:12px;line-height:1.35}'
      +'.bc171-step-actions{display:flex;flex-wrap:wrap;gap:7px}'
      +'.bc171-tool{padding:9px 12px;border-radius:8px;border:1px solid rgba(212,176,92,.28);background:rgba(212,176,92,.08);color:var(--text);cursor:pointer;font-weight:600;font-size:12px}'
      +'.bc171-tool:hover{border-color:var(--gold);color:var(--gold-bright)}'
      +'.bc171-form-wrap{margin-top:12px;padding-top:12px;border-top:1px solid rgba(212,176,92,.15)}'
      +'.bc171-form-wrap #form-producto{display:grid!important}'
      +'.bc171-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}'
      +'.bc171-footer button{padding:10px 15px;border-radius:8px;cursor:pointer}'
      +'.bc171-save{background:rgba(212,176,92,.16);border:1px solid rgba(212,176,92,.35);color:var(--text);font-weight:700}'
      +'.bc171-cancel{background:transparent;border:1px solid rgba(212,176,92,.2);color:var(--mist)}'
      +'.bc171-add{margin:0 0 12px;padding:10px 15px;border-radius:8px;border:1px solid rgba(212,176,92,.35);background:rgba(212,176,92,.12);color:var(--text);font-weight:700;cursor:pointer}'
      +'.bc171-native-hidden{display:none!important}'
      +'@media(max-width:700px){.bc171-steps{grid-template-columns:1fr}}';document.head.appendChild(s);
  }
  function txt(el){return (el&&el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase()}
  function cleanLegacy(){
    document.getElementById('bc149-menu')?.remove();
    document.getElementById('bc-m55-template')?.remove();
    document.getElementById('bc164-add-open')?.remove();
    document.querySelectorAll('#tab-productos .bc-m55-bar').forEach(function(x){x.remove()});
    document.querySelectorAll('#tab-productos button').forEach(function(b){
      if(b.closest('#bc171-overlay'))return;
      if(b.id==='bc171-add')return;
      var t=txt(b);
      if(/^(importar excel\s*\/\s*csv|importar productos|plantilla xlsx|plantilla csv|como llenar|cómo llenar|agregar producto)$/.test(t))b.remove();
    });
    document.getElementById('bc164-overlay')?.remove();
  }
  function close(){
    if(!overlay||!form||!placeholder)return;
    placeholder.parentNode.insertBefore(form,placeholder.nextSibling);
    var native=form.querySelector('#prod-submit-btn');if(native)native.classList.remove('bc171-native-hidden');
    overlay.remove();overlay=null;
  }
  function toolButton(id,label,fn){
    var b=document.createElement('button');b.type='button';b.className='bc171-tool';b.id=id;b.textContent=label;b.onclick=fn;return b;
  }
  function open(){
    if(overlay)return;
    form=document.getElementById('form-producto');if(!form)return;
    css();cleanLegacy();
    if(!placeholder){placeholder=document.createComment('bc171-form-placeholder');form.parentNode.insertBefore(placeholder,form);}
    overlay=document.createElement('div');overlay.id='bc171-overlay';overlay.className='bc171-overlay';
    var modal=document.createElement('div');modal.className='bc171-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    var head=document.createElement('div');head.className='bc171-head';head.innerHTML='<h3>Registrar nuevo producto</h3><button type="button" class="bc171-close" aria-label="Cerrar">×</button>';
    var steps=document.createElement('div');steps.className='bc171-steps';
    var s1=document.createElement('div');s1.className='bc171-step';s1.innerHTML='<strong>Paso 1 · Descargar plantilla</strong><p>Descargá la plantilla vacía, completala con tus productos y conservá los encabezados.</p>';
    var a1=document.createElement('div');a1.className='bc171-step-actions';
    a1.appendChild(toolButton('bc171-xlsx','Plantilla XLSX',function(){if(typeof window.__BC1410_xlsx==='function')window.__BC1410_xlsx();}));
    a1.appendChild(toolButton('bc171-csv','Plantilla CSV',function(){if(typeof window.__BC1410_csv==='function')window.__BC1410_csv();}));
    s1.appendChild(a1);
    var s2=document.createElement('div');s2.className='bc171-step';s2.innerHTML='<strong>Paso 2 · Importar productos</strong><p>Subí la plantilla que ya llenaste. El sistema la previsualiza antes de procesarla.</p>';
    var a2=document.createElement('div');a2.className='bc171-step-actions';
    a2.appendChild(toolButton('bc171-import','Importar Excel / CSV',function(){
      var x=document.getElementById('bc-m55-open');
      if(x){x.click();return;}
      if(typeof window.__BCM55_openOffline==='function'){window.__BCM55_openOffline();return;}
      alert('El importador todavía no terminó de cargar.');
    }));
    a2.appendChild(toolButton('bc171-help','Cómo llenar',function(){alert('Obligatorio: nombre. Opcionales: categoria, precio_normal, precio_mayorista, presentacion_normal y presentacion_mayorista.');}));
    s2.appendChild(a2);steps.appendChild(s1);steps.appendChild(s2);
    var fw=document.createElement('div');fw.className='bc171-form-wrap';fw.id='bc171-form-host';fw.appendChild(form);
    var foot=document.createElement('div');foot.className='bc171-footer';
    var cancel=document.createElement('button');cancel.type='button';cancel.className='bc171-cancel';cancel.textContent='Cancelar';cancel.onclick=close;
    var save=document.createElement('button');save.type='button';save.className='bc171-save';save.id='bc171-save';save.textContent='Registrar nuevo producto';save.onclick=function(){if(form.requestSubmit)form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));};
    foot.appendChild(cancel);foot.appendChild(save);
    modal.appendChild(head);modal.appendChild(steps);modal.appendChild(fw);modal.appendChild(foot);overlay.appendChild(modal);document.body.appendChild(overlay);
    var native=form.querySelector('#prod-submit-btn');if(native)native.classList.add('bc171-native-hidden');
    head.querySelector('.bc171-close').onclick=close;overlay.addEventListener('click',function(e){if(e.target===overlay)close()});
  }
  function ensure(){
    var tab=document.getElementById('tab-productos'),f=document.getElementById('form-producto');if(!tab||!f)return false;
    form=f;css();cleanLegacy();
    var old=document.getElementById('bc171-add');if(!old){old=document.createElement('button');old.type='button';old.id='bc171-add';old.className='bc171-add';old.textContent='Registrar nuevo producto';old.onclick=open;tab.insertBefore(old,tab.firstChild)}
    window.__BC171_open=open;window.__BC171_close=close;return true;
  }
  function boot(){[0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(ensure,ms)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC171_verify=function(){return{addButton:!!document.getElementById('bc171-add'),legacyGone:!document.getElementById('bc149-menu')&&!document.getElementById('bc-m55-template')&&!document.querySelector('#tab-productos .bc-m55-bar')&&!document.getElementById('bc164-add-open'),form:!!document.getElementById('form-producto'),inModal:!!(document.querySelector('#bc171-overlay #form-producto')),step1:!!document.getElementById('bc171-xlsx')&&!!document.getElementById('bc171-csv'),step2:!!document.getElementById('bc171-import'),save:!!document.getElementById('bc171-save')}};
})();