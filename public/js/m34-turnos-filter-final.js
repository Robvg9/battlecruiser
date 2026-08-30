// BattleCruiser — M34.2 filtro final HOME Turnos
// Regla: HOME nunca muestra Turnos CANCELADOS/ANULADOS.
(function(){
  'use strict';
  if(window.__bcM34TurnosFilterFinal)return;
  window.__bcM34TurnosFilterFinal=true;
  const ROOT_ID='ciclos-m18-root';
  function root(){return document.getElementById(ROOT_ID)}
  function isHome(){
    const r=root();
    return !!(r && (
      r.getAttribute('data-m33-home')==='1' ||
      r.getAttribute('data-m29-home')==='1' ||
      r.querySelector('.m33-home,.m29-wrap,.m30-grid')
    ));
  }
  function canceled(card){
    const txt=String(card.textContent||'').trim().toUpperCase();
    return /\bCANCELADO\b|\bANULADO\b|\bCANCELLED\b|\bVOID\b/.test(txt);
  }
  function purge(){
    const r=root();
    if(!r||!isHome())return;
    r.querySelectorAll('.m29-card,.m30-card,.m32-card,.m33-card').forEach(card=>{
      if(canceled(card))card.remove();
    });
  }
  function bindRoot(r){
    if(!r||r.dataset.m34Bound==='1')return true;
    r.dataset.m34Bound='1';
    purge();
    const obs=new MutationObserver(()=>purge());
    obs.observe(r,{childList:true,subtree:true});
    window.__BC_M34_OBSERVER=obs;
    return true;
  }
  function boot(){
    const r=root();
    if(r){bindRoot(r);purge();return;}
    const body=document.body;
    if(!body)return;
    if(body.dataset.m34Wait==='1')return;
    body.dataset.m34Wait='1';
    const wait=new MutationObserver(()=>{
      const rr=root();
      if(rr){wait.disconnect();delete body.dataset.m34Wait;bindRoot(rr);purge();}
    });
    wait.observe(body,{childList:true,subtree:true});
    setTimeout(()=>wait.disconnect(),10000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.__BC_M34={purge};
})();
