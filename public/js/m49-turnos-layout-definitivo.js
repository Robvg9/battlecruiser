// BattleCruiser — M49: layout definitivo de Turnos (Partes 1 y 2)
(function(){
  'use strict';
  if(window.__BC_M49_TURNOS_LAYOUT)return;
  window.__BC_M49_TURNOS_LAYOUT=true;

  const STYLE_ID='bc-m49-turnos-layout-css';
  let busy=false;

  function css(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style'); s.id=STYLE_ID;
    s.textContent=`
      .m49-session-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:14px!important;align-items:start!important;margin-top:12px!important}
      .m49-session-col{display:flex!important;flex-direction:column!important;gap:9px!important;min-width:0!important}
      .m49-session-heading{padding:9px 11px!important;border:1px solid rgba(212,176,92,.16)!important;border-radius:10px!important;background:rgba(212,176,92,.045)!important;color:var(--gold-bright)!important;font-size:.75rem!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.06em!important;text-align:center!important}
      .m49-session-card{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;margin:0!important;padding:11px 12px!important;border:1px solid rgba(255,255,255,.075)!important;border-radius:11px!important;background:rgba(255,255,255,.018)!important;overflow:hidden!important}
      .m49-session-card .m33-session-row{display:flex!important;justify-content:space-between!important;align-items:flex-start!important;gap:10px!important;min-width:0!important}
      .m49-session-card .m33-session-row>div{min-width:0!important;max-width:100%!important}
      .m49-session-card .m33-session-row>div:last-child{display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important;gap:5px!important}
      .m49-session-card .m33-pill{max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
      .m49-step2-control{grid-column:1/-1!important;margin:0 0 2px!important;padding:10px 12px!important;border:1px solid rgba(212,176,92,.16)!important;border-radius:10px!important;background:rgba(212,176,92,.05)!important}
      .m49-step2-label{display:flex!important;align-items:center!important;gap:8px!important;margin:0!important;font-size:.83rem!important;cursor:pointer!important}
      .m49-step2-label input{width:16px!important;height:16px!important;flex:0 0 auto!important}
      .m49-step2-hint{margin:4px 0 0 24px!important;font-size:.7rem!important;line-height:1.35!important;color:var(--mist)!important}
      .m49-step2-card label{display:block!important;margin:0 0 6px!important;line-height:1.3!important}
      .m49-step2-card select{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
      @media(max-width:720px){.m49-session-grid{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(s);
  }

  function modal(){return document.querySelector('.m33-modal')}
  function bodies(){const m=modal();return m?[...m.querySelectorAll('.m33-body')]:[]}
  function isVisible(el){return !!el && getComputedStyle(el).display!=='none' && getComputedStyle(el).visibility!=='hidden'}
  function stepBody(step){
    const m=modal(); if(!m)return null;
    const explicit=m.querySelector('.m33-body[data-m33-step="'+step+'"]'); if(explicit)return explicit;
    const bs=bodies();
    if(bs.length===1)return step===1?bs[0]:null;
    const visible=bs.find(isVisible); return visible||null;
  }
  function normalizeText(el){return String(el.textContent||'').toUpperCase().replace(/\s+/g,' ')}
  function isTarde(el){return normalizeText(el).includes('TARDE')}
  function sessionNodes(body){
    return [...body.querySelectorAll('.m33-session')].filter(el=>!el.closest('.m49-session-grid'));
  }

  function clearOldLayout(body){
    body.querySelectorAll('.m46-session-columns,.bc-m48-grid,.bc-m41-assignment-head,.bc-m41-assignment-grid,.m49-session-grid').forEach(x=>x.remove());
    [...body.querySelectorAll('.m46-session-card,.bc-m48-item,.bc-m41-session')].forEach(x=>x.classList.remove('m46-session-card','bc-m48-item','bc-m41-session'));
    body.dataset.bcM46=''; body.dataset.bcM41Ready=''; body.dataset.bcM48='';
  }

  function organizeStep1(){
    const body=stepBody(1); if(!body||body.dataset.bcM49Step1==='1')return;
    const nodes=sessionNodes(body); if(!nodes.length)return;
    busy=true;
    try{
      clearOldLayout(body);
      const grid=document.createElement('div');grid.className='m49-session-grid';
      const left=document.createElement('div');left.className='m49-session-col';
      const right=document.createElement('div');right.className='m49-session-col';
      left.innerHTML='<div class="m49-session-heading">☀️ Mañana</div>';
      right.innerHTML='<div class="m49-session-heading">🌙 Tarde</div>';
      nodes.forEach(n=>{n.classList.add('m49-session-card');(isTarde(n)?right:left).appendChild(n)});
      const first=body.firstElementChild;
      body.insertBefore(grid,first);
      grid.append(left,right);
      body.dataset.bcM49Step1='1';
    }finally{busy=false}
  }

  function organizeStep2(){
    const body=stepBody(2); if(!body||body.dataset.bcM49Step2==='1')return;
    const nodes=sessionNodes(body); if(!nodes.length)return;
    busy=true;
    try{
      clearOldLayout(body);
      const grid=document.createElement('div');grid.className='m49-session-grid';
      const left=document.createElement('div');left.className='m49-session-col';
      const right=document.createElement('div');right.className='m49-session-col';
      left.innerHTML='<div class="m49-session-heading">☀️ Mañana</div>';
      right.innerHTML='<div class="m49-session-heading">🌙 Tarde</div>';
      const control=document.createElement('div');control.className='m49-step2-control';control.innerHTML='<label class="m49-step2-label"><input type="checkbox" id="m49-block-same"><span>Asignar la misma dependienta en cada bloque</span></label><div class="m49-step2-hint">Activa esta opción para que una dependienta elegida en Mañana se replique en todas las Mañanas. Tarde funciona por separado.</div>';
      grid.appendChild(control); nodes.forEach(n=>{n.classList.add('m49-session-card','m49-step2-card');(isTarde(n)?right:left).appendChild(n)});grid.append(left,right);
      body.insertBefore(grid,body.firstElementChild);
      const check=control.querySelector('#m49-block-same');
      function applyFrom(source){
        if(!check.checked||!source||!source.value)return;
        const targetKind=isTarde(source.closest('.m49-session-card'))?'tarde':'manana';
        nodes.forEach(card=>{const sel=card.querySelector('select[data-m33-sid],select[data-sid]');if(!sel)return;if((isTarde(card)?'tarde':'manana')===targetKind&&sel.value!==source.value){sel.value=source.value;sel.dispatchEvent(new Event('change',{bubbles:true}))}});
      }
      grid.addEventListener('change',e=>{const sel=e.target.closest('select');if(sel)applyFrom(sel)});
      check.addEventListener('change',()=>{if(!check.checked)return;['manana','tarde'].forEach(k=>{const card=nodes.find(c=>(isTarde(c)?'tarde':'manana')===k&&c.querySelector('select')?.value);if(card)applyFrom(card.querySelector('select'))})});
      body.dataset.bcM49Step2='1';
    }finally{busy=false}
  }

  function run(){
    if(busy)return;
    css();
    organizeStep1();
    organizeStep2();
  }

  function boot(){
    css();
    const obs=new MutationObserver(()=>{if(!busy)run()});
    obs.observe(document.body,{childList:true,subtree:true});
    window.__BC_M49_OBS=obs;
    run();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();