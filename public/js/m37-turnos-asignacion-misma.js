// BattleCruiser — M37.2: asignación de la misma dependienta para todo el Turno
(function(){
  'use strict';
  if(window.__bcM37SameWorker)return;
  window.__bcM37SameWorker=true;
  const MODAL='.m33-modal';
  let propagating=false;
  function selects(){return [...document.querySelectorAll(MODAL+' select[data-m33-sid]')]}
  function existingWorker(){const s=selects().find(x=>x.value);return s?s.value:''}
  function applyAll(value){
    if(!value||propagating)return;
    propagating=true;
    try{selects().forEach(s=>{if(s.value!==String(value)){s.value=String(value);s.dispatchEvent(new Event('change',{bubbles:true}))}})}
    finally{propagating=false}
  }
  function ensureControl(){
    const sels=selects();if(!sels.length)return;
    const body=sels[0].closest('.m33-body');if(!body)return;
    let box=body.querySelector('.m37-same-worker');
    if(!box){
      box=document.createElement('div');box.className='m37-same-worker';
      box.innerHTML='<label class="m37-label"><input type="checkbox" id="m37-same-worker-check"> <span>Asignar la misma dependienta a todas las sesiones</span></label><div class="m37-hint">Activado: al elegir una dependienta en cualquier sesión, se aplicará automáticamente a todas las sesiones de este Turno.</div>';
      body.insertBefore(box,body.firstChild);
      const check=box.querySelector('#m37-same-worker-check');
      check.addEventListener('change',function(){if(this.checked){const v=existingWorker();if(v)applyAll(v)}});
      body.addEventListener('change',function(e){
        if(propagating)return;
        const sel=e.target.closest('select[data-m33-sid]');if(!sel)return;
        const c=box.querySelector('#m37-same-worker-check');if(c&&c.checked&&sel.value)applyAll(sel.value);
      });
    }
  }
  function css(){
    if(document.getElementById('m37-css'))return;
    const s=document.createElement('style');s.id='m37-css';s.textContent=`.m37-same-worker{grid-column:1/-1;margin-bottom:4px;padding:10px 12px;border:1px solid rgba(212,176,92,.16);border-radius:10px;background:rgba(212,176,92,.05)}.m37-label{display:flex!important;align-items:center;gap:8px;font-size:.84rem!important;text-transform:none!important;color:var(--text)!important;margin:0!important;cursor:pointer}.m37-label input{width:16px;height:16px;flex:0 0 auto}.m37-hint{margin:4px 0 0 24px;font-size:.72rem;color:var(--mist);line-height:1.35}`;document.head.appendChild(s)
  }
  function boot(){css();const obs=new MutationObserver(ensureControl);obs.observe(document.body,{childList:true,subtree:true});window.__BC_M37_OBS=obs;ensureControl()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();