// BattleCruiser — 17.6: Presentaciones siempre localizables para perfiles autorizados
(function(){
  'use strict';
  if(window.__BC176)return;window.__BC176=true;
  function admin(){
    try{var u=window._usuarioActual||{};var r=String(u.rol||u.role||u.nombre_rol||'').toLowerCase();return ['admin','administrador','dueno','dueño','owner'].indexOf(r)>=0||typeof window.tienePermiso==='function'&&(tienePermiso('productos','crear')||tienePermiso('productos','editar')||tienePermiso('configuracion','editar')||tienePermiso('catalogos','editar_any'));}catch(_){return false;}
  }
  function show(){
    if(!admin())return false;
    var panel=document.querySelector('.presentaciones-panel');if(panel)panel.classList.remove('hidden');
    var create=document.getElementById('form-presentacion-nueva');if(create)create.classList.remove('hidden');
    var pp=document.getElementById('form-pp-nueva');if(pp&&document.getElementById('pp-producto-select')?.value)pp.classList.remove('hidden');
    var title=document.querySelector('#tab-productos h3');
    if(title&&!document.getElementById('bc176-pres-anchor')){var anchor=document.createElement('span');anchor.id='bc176-pres-anchor';anchor.textContent=' · Presentaciones disponibles';anchor.className='muted';title.insertAdjacentElement('afterend',anchor);}
    return !!panel;
  }
  function boot(){[0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(show,ms)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC176_verify=function(){var p=document.querySelector('.presentaciones-panel');var f=document.getElementById('form-presentacion-nueva');return{panel:!!(p&&!p.classList.contains('hidden')),create:!!(f&&!f.classList.contains('hidden'))}};
})();