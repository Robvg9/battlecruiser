// BattleCruiser — 17.11: cantidad del carrito visible entre − y +
(function(){
  'use strict';
  if(window.__BC1711)return;window.__BC1711=true;
  function css(){if(document.getElementById('bc1711-css'))return;var s=document.createElement('style');s.id='bc1711-css';s.textContent='#venta-lineas .venta-linea-cant-wrap{display:inline-flex!important;align-items:center!important;gap:5px!important}#venta-lineas .venta-linea-cant-input{width:42px!important;height:28px!important;min-width:42px!important;max-width:42px!important;padding:0 4px!important;text-align:center!important;background:#000!important;color:#fff!important;border:1px solid #333!important;border-radius:5px!important;font-weight:700!important;box-sizing:border-box!important}#venta-lineas .venta-linea-cant-input::-webkit-inner-spin-button,#venta-lineas .venta-linea-cant-input::-webkit-outer-spin-button{opacity:1}';document.head.appendChild(s);}
  function clean(){var list=document.getElementById('venta-lineas');if(!list)return false;css();list.querySelectorAll('.venta-linea-cant-wrap').forEach(function(w){var input=w.querySelector('.venta-linea-cant-input');if(!input)return;input.title='Cantidad en carrito';input.setAttribute('aria-label','Cantidad en carrito');});return true;}
  function boot(){clean();var list=document.getElementById('venta-lineas');if(list&&!list.dataset.bc1711){list.dataset.bc1711='1';new MutationObserver(clean).observe(list,{childList:true,subtree:true});}}
  [0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(boot,ms)});
  window.__BC1711_verify=function(){return!!document.querySelector('#venta-lineas .venta-linea-cant-input')};
})();