// BattleCruiser — 17.5: controles de Nueva Compra interactivos dentro del modal
(function(){
  'use strict';
  if(window.__BC175)return; window.__BC175=true;
  function css(){if(document.getElementById('bc175-css'))return;var s=document.createElement('style');s.id='bc175-css';s.textContent='#bc165-overlay #tab-compras,#bc165-overlay #tab-compras *{pointer-events:auto!important}#bc165-overlay #tab-compras{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;max-width:none!important}#bc165-overlay #tab-compras select,#bc165-overlay #tab-compras input,#bc165-overlay #tab-compras button{position:relative;z-index:2;pointer-events:auto!important}#bc165-overlay .bc165-modal{overflow:auto!important;box-sizing:border-box!important}';document.head.appendChild(s);}
  function repair(){
    css();
    var modal=document.getElementById('bc165-overlay');if(!modal)return false;
    var panel=document.getElementById('tab-compras');if(!panel)return false;
    panel.classList.add('bc175-active');
    ['compra-multiple-almacen','compra-multiple-proveedor','compra-multiple-fecha','compra-multiple-producto','compra-multiple-presentacion','compra-multiple-cantidad','compra-multiple-costo','compra-multiple-add','compra-multiple-confirmar','compra-multiple-limpiar'].forEach(function(id){var e=document.getElementById(id);if(e){e.disabled=false;e.removeAttribute('disabled');e.style.pointerEvents='auto';e.style.position='relative';e.style.zIndex='3';}});
    return true;
  }
  function hook(){
    var open=window.__BC165_open;if(typeof open!=='function')return false;
    if(open.__bc175)return true;
    function wrapped(type){var r=open.apply(this,arguments);setTimeout(repair,0);setTimeout(repair,120);setTimeout(repair,500);return r;}
    wrapped.__bc175=true;window.__BC165_open=wrapped;
    return true;
  }
  function boot(){[0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(function(){hook();repair();},ms)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC175_verify=function(){return{patched:!!(window.__BC165_open&&window.__BC165_open.__bc175),panel:!!document.getElementById('tab-compras'),controls:['compra-multiple-almacen','compra-multiple-producto','compra-multiple-presentacion','compra-multiple-cantidad','compra-multiple-costo'].every(function(id){var e=document.getElementById(id);return !e||(!e.disabled&&e.style.pointerEvents!=='none')})}};
})();