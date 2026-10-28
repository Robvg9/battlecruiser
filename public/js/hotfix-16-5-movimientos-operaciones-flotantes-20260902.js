// BattleCruiser — 16.5: Transferencias + Compras viven como operaciones de Movimientos.
(function(){
'use strict';
if(window.__BC165)return;window.__BC165=true;
var refs={transferencias:null,compras:null};
function style(){if(document.getElementById('bc165-css'))return;var s=document.createElement('style');s.id='bc165-css';s.textContent='.bc165-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));flex:1 0 100%;width:100%;min-width:0;box-sizing:border-box;gap:8px;margin:12px 0 0}.bc165-action{display:block;height:auto;min-height:38px;min-width:0;width:100%;box-sizing:border-box;padding:9px 12px;white-space:normal;overflow-wrap:anywhere;line-height:1.3;background:var(--stone-2);color:var(--text);border:1px solid var(--gold-dim);border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:600}.bc165-action:hover{border-color:var(--gold);color:var(--gold-bright)}.bc165-overlay{position:fixed;inset:0;z-index:9400;background:rgba(6,14,11,.82);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}.bc165-modal{width:min(1050px,100%);margin:20px auto;background:var(--stone);border:1px solid rgba(212,176,92,.32);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:16px}.bc165-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.bc165-head h3{margin:0;color:var(--gold)}.bc165-close{background:none;border:1px solid rgba(212,176,92,.2);border-radius:7px;color:var(--mist);width:34px;height:34px;cursor:pointer;font-size:18px}.bc165-panel-host{min-height:40px}.bc165-panel-host>.tab-panel{display:block!important;visibility:visible!important;position:static!important;margin:0!important;max-width:none!important}.bc165-overlay #tab-transferencias,.bc165-overlay #tab-compras{display:block!important;visibility:visible!important;opacity:1!important;position:static!important;margin:0!important;max-width:none!important;min-width:0!important;width:100%!important;box-sizing:border-box!important}.bc165-overlay #tab-transferencias input,.bc165-overlay #tab-transferencias select,.bc165-overlay #tab-transferencias button,.bc165-overlay #tab-compras input,.bc165-overlay #tab-compras select,.bc165-overlay #tab-compras button{pointer-events:auto!important;position:relative;z-index:2}#tab-movimientos.bc-m51 .bc-m51-hero{display:flex;flex-wrap:wrap;align-items:flex-start;min-width:0;max-width:100%;box-sizing:border-box}#tab-movimientos.bc-m51 .bc-m51-hero>*{min-width:0;max-width:100%;box-sizing:border-box}#tab-movimientos.bc-m51 .bc165-actions{flex:1 0 100%;width:100%;min-width:0}@media(max-width:640px){#tab-movimientos.bc-m51 .bc165-actions{grid-template-columns:1fr}.bc165-overlay{padding:8px}.bc165-modal{width:100%;max-width:100%;box-sizing:border-box;padding:12px;margin:8px auto}}.bc165-modal .bc-m51,.bc165-modal .bc-m51 *{max-width:none}.bc165-placeholder{display:none!important}';document.head.appendChild(s)}
function captureTab(key){
 var current=refs[key];
 if(current&&current.panel&&current.placeholder&&current.originalParent){
   if(current.button)current.button.classList.add('hidden');
   var activeOverlay=document.getElementById('bc165-overlay');
   if(!(activeOverlay&&activeOverlay.contains(current.panel))){
     current.panel.classList.remove('visible');
     current.panel.classList.add('bc165-placeholder');
   }
   return current;
 }
 var button=document.querySelector('.tab-btn[data-tab="'+key+'"]');
 var panel=document.getElementById('tab-'+key);
 if(!panel||!panel.parentNode)return null;
 var originalParent=panel.parentNode;
 var placeholder=document.createComment('bc165-'+key);
 originalParent.insertBefore(placeholder,panel);
 current={button:button,panel:panel,placeholder:placeholder,originalParent:originalParent};
 refs[key]=current;
 panel.dataset.bc165='1';
 if(button)button.classList.add('hidden');
 var overlay=document.getElementById('bc165-overlay');
 if(!(overlay&&overlay.contains(panel))){
   panel.classList.remove('visible');
   panel.classList.add('bc165-placeholder');
 }
 return current;
}
function open(type){
 var r=captureTab(type);
 if(!r||!r.panel)return;
 var existing=document.getElementById('bc165-overlay');
 if(existing&&existing.dataset.type===type&&existing.contains(r.panel))return;
 if(existing)close(existing.dataset.type,existing);
 var ov=document.createElement('div');
 ov.className='bc165-overlay';ov.id='bc165-overlay';ov.dataset.type=type;
 var title=type==='transferencias'?'Nueva Transferencia':'Nueva Compra';
 ov.innerHTML='<div class="bc165-modal" role="dialog" aria-modal="true" aria-label="'+title+'"><div class="bc165-head"><h3>'+title+'</h3><button type="button" class="bc165-close" aria-label="Cerrar">×</button></div><div class="bc165-panel-host"></div></div>';
 document.body.appendChild(ov);
 ov.querySelector('.bc165-panel-host').appendChild(r.panel);
 r.panel.classList.remove('bc165-placeholder');
 r.panel.classList.add('visible');
 ov.querySelector('.bc165-close').onclick=function(){close(type,ov);};
 ov.addEventListener('click',function(e){if(e.target===ov)close(type,ov);});
}
function close(type,ov){
 var r=refs[type];
 if(r&&r.panel&&r.placeholder&&r.placeholder.parentNode===r.originalParent){
   r.originalParent.insertBefore(r.panel,r.placeholder.nextSibling);
 }
 if(r&&r.panel){r.panel.classList.remove('visible');r.panel.classList.add('bc165-placeholder');}
 if(ov)ov.remove();
}
function install(){
 var mov=document.getElementById('tab-movimientos');if(!mov)return false;
 style();
 captureTab('transferencias');captureTab('compras');
 var host=mov.querySelector('.bc-m51-hero')||mov.firstElementChild;if(!host)return false;
 var actions=host.querySelector('.bc165-actions');
 if(!actions){actions=document.createElement('div');actions.className='bc165-actions';host.appendChild(actions);}
 function ensure(key,label){
   var ref=refs[key];if(!ref||!ref.panel)return;
   if(actions.querySelector('[data-bc165="'+key+'"]'))return;
   var b=document.createElement('button');b.type='button';b.className='bc165-action';b.dataset.bc165=key;b.textContent=label;
   b.onclick=function(){if(typeof window.__BC165_open==='function')window.__BC165_open(key);};
   actions.appendChild(b);
 }
 ensure('transferencias','Nueva Transferencia');ensure('compras','Nueva Compra');return true;
}
function boot(){[0,300,900,1800,3000,5000].forEach(function(ms){setTimeout(install,ms)});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.__BC165_open=open;window.__BC165_close=close;
window.__BC165_verify=function(){return{transferTabHidden:!!document.querySelector('.tab-btn[data-tab="transferencias"].hidden')||!!document.querySelector('.tab-btn[data-tab="transferencias"].hidden'),purchaseTabHidden:!document.querySelector('.tab-btn[data-tab="compras"]')||!!document.querySelector('.tab-btn[data-tab="compras"].hidden'),newTransfer:!!document.querySelector('[data-bc165="transferencias"]'),newPurchase:!!document.querySelector('[data-bc165="compras"]'),transferPanelPresent:!!(refs.transferencias&&refs.transferencias.panel),purchasePanelPresent:!!(refs.compras&&refs.compras.panel)}};
})();
