// BattleCruiser — M50.4: orden determinista de la Parte 1 del expediente
// Garantiza: info general → h4 Sesiones → grid Mañana|Tarde
(function(){
  'use strict';
  if(window.__bcM50TurnoOrderV4)return;
  window.__bcM50TurnoOrderV4=true;

  function findStep1Body(){
    const modal=document.querySelector('.m33-modal');
    if(!modal)return null;
    const explicit=modal.querySelector('.m33-body[data-m33-step="1"]');
    if(explicit)return explicit;
    const bodies=[...modal.querySelectorAll('.m33-body')];
    if(bodies.length===1)return bodies[0];
    return bodies.find(b=>getComputedStyle(b).display!=='none')||null;
  }

  function findSessionsGrid(body){
    return body&&body.querySelector(':scope > .m49-session-grid, :scope > .bc-m48-grid, :scope > .m46-session-columns');
  }

  function findSessionsHeading(body){
    if(!body)return null;
    return [...body.children].find(el=>{
      const t=String(el.tagName||'').toUpperCase();
      if(!/^H[1-6]$/.test(t))return false;
      return String(el.textContent||'').trim().toLowerCase()==='sesiones';
    })||null;
  }

  function reorder(){
    const body=findStep1Body();
    if(!body)return false;
    // Solo actuar si hay grilla de sesiones (Step 1 con layout M49)
    const grid=findSessionsGrid(body);
    if(!grid)return false;

    const heading=findSessionsHeading(body);
    const summaries=[...body.querySelectorAll(':scope > .m33-summary')];

    // 1) Summaries al inicio (en su orden original)
    summaries.forEach((s,i)=>{
      const target=body.children[i];
      if(target!==s)body.insertBefore(s,target||null);
    });

    // 2) Heading justo después de los summaries
    if(heading){
      const afterSummaries=summaries.length?summaries[summaries.length-1].nextSibling:body.firstChild;
      if(heading!==afterSummaries){
        if(summaries.length)summaries[summaries.length-1].insertAdjacentElement('afterend',heading);
        else body.insertBefore(heading,body.firstChild);
      }
    }

    // 3) Grid inmediatamente después del heading (o de summaries)
    const anchor=heading||(summaries.length?summaries[summaries.length-1]:null);
    if(anchor){
      if(anchor.nextElementSibling!==grid)anchor.insertAdjacentElement('afterend',grid);
    }else if(body.firstElementChild!==grid){
      body.insertBefore(grid,body.firstElementChild);
    }

    return true;
  }

  function boot(){
    const run=()=>reorder();
    const obs=new MutationObserver(()=>{try{run()}catch(_){}});
    obs.observe(document.body,{childList:true,subtree:true});
    window.__BC_M50_OBS_V4=obs;
    run();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
