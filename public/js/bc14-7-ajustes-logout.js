(function(){
'use strict';
if(window.__BC147)return;window.__BC147=true;
function fix(){
 var btn=document.querySelector('.tab-btn[data-tab="ajustes"]');
 if(btn){btn.textContent='Ajustes';btn.classList.remove('logout','btn-logout');}
 var logout=document.getElementById('btn-logout');
 if(logout)logout.textContent='Cerrar sesión';
}
function boot(){fix();[250,700,1500,3000].forEach(function(ms){setTimeout(fix,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
