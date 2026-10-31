// BattleCruiser — 17.13: etiqueta de Administración sin autoridad de visibilidad.
// La visibilidad la decide exclusivamente permisos-navegacion.js.
(function(){
  'use strict';
  if(window.__BC1713)return;window.__BC1713=true;
  function normalizeLabel(){
    var b=document.querySelector('#tabs [data-tab="config"]');
    if(!b)return false;
    var label=b.querySelector('.bc-nav-label');
    if(label){label.textContent='Administración';return true;}
    if(b.querySelector('.bc-nav-icon')){
      var span=document.createElement('span');
      span.className='bc-nav-label';
      span.textContent='Administración';
      b.appendChild(span);
    }else if(b.textContent.trim()!=='Administración'){
      b.textContent='Administración';
    }
    return true;
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',normalizeLabel,{once:true});
  }else{
    normalizeLabel();
  }
  window.__BC1713_verify=function(){
    var b=document.querySelector('#tabs [data-tab="config"]');
    return {
      button:!!b,
      permitted:!!b&&b.getAttribute('data-bc-permiso')==='1',
      visible:!!b&&b.getAttribute('data-bc-permiso')==='1'&&
        !b.hidden&&getComputedStyle(b).display!=='none'
    };
  };
})();
