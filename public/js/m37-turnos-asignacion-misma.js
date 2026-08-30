// BattleCruiser — M37.3: control visual de asignación por bloque
(function(){
  'use strict';
  if(window.__bcM37SameWorker)return;
  window.__bcM37SameWorker=true;
  const MODAL='.m33-modal';
  function selects(){return [...document.querySelectorAll(MODAL+' select[data-m33-sid]')]}
  function ensureControl(){
    const sels=selects();if(!sels.length)return;
    const body=sels[0].closest('.m33-body');if(!body)return;
    let box=body.querySelector('.m37-same-worker');
    if(!box){
      box=document.createElement('div');box.className='m37-same-worker';
      box.innerHTML='<label class="m37-label"><input type="checkbox" id="m37-same-worker-check"> <span>Asignar la misma dependienta a todas las sesiones de ese bloque</span></label>';
      body.insertBefore(box,body.firstChild);
    }
  }
  function css(){
    if(document.getElementById('m37-css'))return;
    const s=document.createElement('style');s.id='m37-css';s.textContent=`.m37-same-worker{grid-column:1/-1;margin-bottom:4px;padding:10px 12px;border:1px solid rgba(212,176,92,.16);border-radius:10px;background:rgba(212,176,92,.05)}.m37-label{display:flex!important;align-items:center;gap:8px;font-size:.84rem!important;text-transform:none!important;color:var(--text)!important;margin:0!important;cursor:pointer}.m37-label input{width:16px;height:16px;flex:0 0 auto}`;document.head.appendChild(s)
  }
  function boot(){css();const obs=new MutationObserver(ensureControl);obs.observe(document.body,{childList:true,subtree:true});window.__BC_M37_OBS=obs;ensureControl()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();