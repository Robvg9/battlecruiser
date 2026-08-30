// BattleCruiser — M34 filtro final HOME Turnos
(function(){
  'use strict';
  if(window.__bcM34TurnosFilterFinal)return;
  window.__bcM34TurnosFilterFinal=true;
  const ROOT_ID='ciclos-m18-root';
  function root(){return document.getElementById(ROOT_ID)}
  function isHome(){const r=root();return !!(r&&(
    r.getAttribute('data-m33-home')==='1' ||
    r.getAttribute('data-m29-home')==='1' ||
    r.getAttribute('data-m30-home')==='1'
  ))}
  function canceled(card){
    const txt=String(card.textContent||'').trim().toUpperCase();
    return /\bCANCELADO\b|\bANULADO\b/.test(txt);
  }
  function purge(){
    const r=root();
    if(!r||!isHome())return;
    r.querySelectorAll('.m29-card,.m30-card,.m32-card,.m33-card').forEach(card=>{
      if(canceled(card))card.remove();
    });
  }
  function bind(){
    const r=root();
    if(!r||r.dataset.m34Bound==='1')return;
    r.dataset.m34Bound='1';
    purge();
    const obs=new MutationObserver(()=>purge());
    obs.observe(r,{childList:true,subtree:true});
    window.__BC_M34_OBSERVER=obs;
    window.addEventListener('pageshow',purge);
  }
  function boot(){bind();purge();setTimeout(purge,200);setTimeout(purge,700);setTimeout(purge,1500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.__BC_M34={purge};
})();
