// BattleCruiser — 16.13: puente único para abrir el importador sin depender de conexión.
(function(){'use strict';if(window.__BC1613)return;window.__BC1613=true;
function install(){
 var tab=document.getElementById('tab-productos');if(!tab||typeof window.__BCM55_openOffline!=='function')return false;
 var b=document.getElementById('bc-m55-open');if(!b){b=document.createElement('button');b.type='button';b.id='bc-m55-open';b.hidden=true;b.setAttribute('aria-hidden','true');b.onclick=function(){window.__BCM55_openOffline()};document.body.appendChild(b)}else b.onclick=function(){window.__BCM55_openOffline()};
 return true;
}
function boot(){if(install())return;[250,600,1200,2200].forEach(function(ms){setTimeout(install,ms)});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.__BC1613_verify=function(){return{bridge:!!document.getElementById('bc-m55-open'),offlineOpen:typeof window.__BCM55_openOffline==='function'}};
})();
