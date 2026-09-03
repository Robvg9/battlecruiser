// BattleCruiser — Configuración: preferencias migradas desde Ajustes
(function(){'use strict';
  if(window.__BC_CONFIG_AJUSTES_20260903__)return;
  window.__BC_CONFIG_AJUSTES_20260903__=true;
  function boot(){
    var tab=document.getElementById('tab-config'); if(!tab)return;
    var src=document.getElementById('cfg-ajustes-basicos'); if(!src)return;
    if(src.dataset.bcMigrated==='1')return;
    src.dataset.bcMigrated='1';
    var title=src.querySelector('h3'); if(title)title.textContent='⚙️ Ajustes básicos';
    var p=src.querySelector('.muted'); if(p)p.textContent='Preferencias generales de la aplicación. Se guardan localmente en este dispositivo.';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot();setTimeout(boot,400);setTimeout(boot,1200);});else{boot();setTimeout(boot,400);setTimeout(boot,1200);}
})();
