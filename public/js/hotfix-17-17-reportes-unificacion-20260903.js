// BattleCruiser — 17.17: Reportes sin controles de reporte duplicados
(function(){
 'use strict';if(window.__BC1717)return;window.__BC1717=true;
 var TYPES=['ventas','compras','rentabilidad','transferencias','stock','movimiento'];
 function clean(){var tab=document.getElementById('tab-reportes');if(!tab)return false;
   tab.querySelectorAll('*').forEach(function(el){
     var t=(el.textContent||'').replace(/\s+/g,' ').trim();
     if(el===tab)return;
     if(/^(acciones rápidas|acciones rapidas)$/.test(t.toLowerCase())&&el.children.length===0)el.remove();
   });
   var tabs=Array.from(tab.querySelectorAll('.rep-tabs,.bc-m42-quick-actions,[data-rep-actions]'));
   var detailed=tab.querySelector('.bc-m42-detail');
   var canonical=tab.querySelector('.rep-tabs');
   tabs.forEach(function(group){if(group!==canonical){group.style.display='none';group.setAttribute('aria-hidden','true');}});
   if(canonical){canonical.querySelectorAll('.rep-tab-btn').forEach(function(b){var r=b.getAttribute('data-rep');if(r==='vales')b.remove();});}
   if(detailed){var body=detailed.querySelector('.bc-m42-detail-body');if(body&&canonical&&canonical.parentElement!==body)body.prepend(canonical);}
   // Hay una sola fuente de estado para el reporte activo; los botones rápidos ocultos
   // ya no pueden cambiar el reporte desde otra interfaz.
   return true;}
 function boot(){clean();[300,800,1500,3000,5000].forEach(function(ms){setTimeout(clean,ms)});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
 window.__BC1717_verify=function(){var t=document.getElementById('tab-reportes');if(!t)return{ok:false};var groups=Array.from(t.querySelectorAll('.rep-tabs,.bc-m42-quick-actions,[data-rep-actions]')).filter(function(g){return getComputedStyle(g).display!=='none';});var fs=Array.from(t.querySelectorAll('.bc-m42-filters,#reportes-filtros')).filter(function(x){return getComputedStyle(x).display!=='none';});return{ok:true,visibleNavGroups:groups.length,visibleFilterBlocks:fs.length}};
})();