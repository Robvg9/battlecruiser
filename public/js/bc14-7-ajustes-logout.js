(function(){
'use strict';
if(window.__BC147)return;window.__BC147=true;
function fix(){
 var b=document.getElementById('ajustes-btn'),m=document.getElementById('ajustes-menu'),logout=document.getElementById('logout-btn');
 if(b)b.textContent='Ajustes ▾';
 if(logout){logout.textContent='Cerrar sesión';logout.type='button';}
 if(b&&m&&!b.dataset.bc147){b.dataset.bc147='1';b.addEventListener('click',function(){m.classList.toggle('hidden');});}
}
function boot(){fix();[250,700,1500,3000].forEach(function(ms){setTimeout(fix,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
