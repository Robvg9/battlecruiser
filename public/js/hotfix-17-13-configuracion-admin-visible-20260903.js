// BattleCruiser — 17.13: Configuración visible para administradores
(function(){
  'use strict';
  if(window.__BC1713)return;window.__BC1713=true;
  function isAdmin(){
    try{var u=window._usuarioActual||{};var r=String(u.rol||u.role||u.nombre_rol||'').toLowerCase();if(['admin','administrador','dueno','dueño','owner'].includes(r))return true;var p=window.tienePermiso;return typeof p==='function'&&(p('configuracion','ver')||p('configuracion','editar')||p('roles','editar_any'));}catch(_){return false;}
  }
  function show(){
    if(!isAdmin())return false;
    var b=document.querySelector('.tab-btn[data-tab="config"]');var p=document.getElementById('tab-config');
    [b,p].forEach(function(e){if(!e)return;e.classList.remove('hidden');e.removeAttribute('hidden');e.style.removeProperty('display');e.style.removeProperty('visibility');e.style.removeProperty('opacity');});
    return !!b;
  }
  function boot(){show();if(!window.__BC1713_OBS){window.__BC1713_OBS=true;new MutationObserver(show).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});}}
  [0,200,500,1000,2000,4000,8000].forEach(function(ms){setTimeout(boot,ms)});
  window.__BC1713_verify=function(){var b=document.querySelector('.tab-btn[data-tab="config"]');return{admin:isAdmin(),visible:!!(b&&!b.classList.contains('hidden')&&!b.hasAttribute('hidden')&&getComputedStyle(b).display!=='none')}};
})();