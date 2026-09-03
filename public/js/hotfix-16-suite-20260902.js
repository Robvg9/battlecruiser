// BattleCruiser — 16.x regression suite
(function(){'use strict';if(window.__BC16Suite)return;window.__BC16Suite=true;
function r7(){var t=document.getElementById('tab-reportes');if(!t)return false;var f=t.querySelector('.bc-m42-filters');if(f){f.style.display='none';f.dataset.bc16='quick-hidden';}return !!t.querySelector('.bc-m45-quick');}
function boot(){setTimeout(r7,800);setTimeout(r7,1800);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.__BC16_verify7=function(){var f=document.querySelector('#tab-reportes .bc-m42-filters');return{quick:!!document.querySelector('#tab-reportes .bc-m45-quick'),filtersHidden:!!(f&&f.dataset.bc16==='quick-hidden')}};
})();
