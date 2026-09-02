(function(){
'use strict';
if(window.__BC146)return;window.__BC146=true;
function admin(){
 var u=window._usuarioActual||{};
 var role=String(u.rol||u.role||'').toLowerCase();
 return ['dueno','dueño','owner','admin','administrador'].indexOf(role)>=0 || (typeof window.tienePermiso==='function' && (window.tienePermiso('usuarios','editar')||window.tienePermiso('turnos','editar_any')||window.tienePermiso('ciclos','editar_any')));
}
function fix(){
 if(!admin())return;
 var b=document.querySelector('.tab-btn[data-tab="config"]'),p=document.getElementById('tab-config');
 if(b){b.classList.remove('hidden','tab-sin-permiso','bc-config-tab-hidden');b.style.removeProperty('display');b.removeAttribute('aria-hidden');}
 if(p)p.classList.remove('hidden');
}
function boot(){fix();[250,600,1200,2000,4000].forEach(function(ms){setTimeout(fix,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
