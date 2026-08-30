// BattleCruiser — M49: layout definitivo de Turnos (Partes 1 y 2)
// v49.4 — anula grid de m36 en Step2 + cards densas a ancho completo
(function(){
  'use strict';
  // Permitir re-inyección de CSS aunque el flag exista (cache / hot reload)
  const STYLE_ID='bc-m49-turnos-layout-css-v494';
  let busy=false;
  if(window.__BC_M49_TURNOS_LAYOUT_V494)return;
  window.__BC_M49_TURNOS_LAYOUT_V494=true;
  // Marcar también el flag legado para que scripts viejos no peleen
  window.__BC_M49_TURNOS_LAYOUT=true;

  function css(){
    // Quitar estilos viejos de m49 y neutralizar layout conflictivo de m36 en Step2
    ['bc-m49-turnos-layout-css','bc-m49-turnos-layout-css-v494','m36-layout-css'].forEach(id=>{
      const el=document.getElementById(id); if(el)el.remove();
    });
    const s=document.createElement('style'); s.id=STYLE_ID;
    s.textContent=`
      /* CRITICAL: m36 ponía el body Step2 en grid 2 col → la grilla m49 solo ocupaba 1 col (hueco derecho) */
      .m33-modal .m33-body[data-m33-step="2"],
      .m33-modal .m33-body{
        display:block!important;
      }
      .m49-session-grid{
        display:grid!important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
        gap:18px!important;
        align-items:stretch!important;
        margin-top:8px!important;
        width:100%!important;
        max-width:100%!important;
        box-sizing:border-box!important;
      }
      .m49-session-col{
        display:flex!important;
        flex-direction:column!important;
        gap:14px!important;
        min-width:0!important;
        width:100%!important;
      }
      .m49-session-heading{
        padding:12px 14px!important;
        border:1px solid rgba(212,176,92,.2)!important;
        border-radius:12px!important;
        background:rgba(212,176,92,.06)!important;
        color:var(--gold-bright,#e8c76a)!important;
        font-size:.82rem!important;
        font-weight:700!important;
        text-transform:uppercase!important;
        letter-spacing:.07em!important;
        text-align:center!important;
      }
      .m49-session-card{
        width:100%!important;
        min-width:0!important;
        max-width:100%!important;
        box-sizing:border-box!important;
        margin:0!important;
        padding:14px 16px!important;
        border:1px solid rgba(255,255,255,.08)!important;
        border-radius:12px!important;
        background:rgba(255,255,255,.02)!important;
        overflow:hidden!important;
      }
      .m49-session-card .m33-session-row{
        display:flex!important;
        justify-content:space-between!important;
        align-items:flex-start!important;
        gap:10px!important;
        min-width:0!important;
      }
      .m49-session-card .m33-session-row>div{min-width:0!important;max-width:100%!important}
      .m49-session-card .m33-session-row>div:last-child{
        display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important;gap:5px!important
      }
      .m49-session-card .m33-pill{
        max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important
      }
      .m49-step2-control{
        grid-column:1/-1!important;
        margin:0 0 6px!important;
        padding:14px 16px!important;
        border:1px solid rgba(212,176,92,.2)!important;
        border-radius:12px!important;
        background:rgba(212,176,92,.06)!important;
      }
      .m49-step2-label{
        display:flex!important;align-items:center!important;gap:10px!important;
        margin:0!important;font-size:.9rem!important;cursor:pointer!important;font-weight:600!important
      }
      .m49-step2-label input{width:18px!important;height:18px!important;flex:0 0 auto!important}
      .m49-step2-hint{
        margin:8px 0 0 28px!important;font-size:.75rem!important;line-height:1.45!important;color:var(--mist,#9aa3b2)!important
      }
      /* Step 2 cards: ocupan de verdad el ancho y se ven densas */
      .m49-step2-card{
        padding:18px 18px!important;
        min-height:112px!important;
        display:flex!important;
        flex-direction:column!important;
        justify-content:center!important;
        gap:10px!important;
        border:1px solid rgba(255,255,255,.12)!important;
        background:rgba(255,255,255,.035)!important;
        border-radius:14px!important;
        flex:1 1 auto!important;
      }
      .m49-step2-card label{
        display:block!important;
        margin:0!important;
        line-height:1.35!important;
        font-size:.95rem!important;
        font-weight:700!important;
        letter-spacing:.02em!important;
        color:var(--text,#f3f4f6)!important;
        text-transform:uppercase!important;
      }
      .m49-step2-card select{
        width:100%!important;
        min-width:0!important;
        max-width:100%!important;
        box-sizing:border-box!important;
        margin:0!important;
        padding:14px 16px!important;
        min-height:52px!important;
        font-size:1rem!important;
        font-weight:500!important;
        border-radius:10px!important;
        border:1px solid rgba(255,255,255,.16)!important;
        background:var(--void,#0c1c18)!important;
        color:inherit!important;
        cursor:pointer!important;
      }
      .m49-step2-card select:focus{
        outline:none!important;
        border-color:rgba(59,130,246,.7)!important;
        box-shadow:0 0 0 3px rgba(59,130,246,.22)!important;
      }
      .m49-step2-card .m36-offline{
        font-size:.72rem!important;
        opacity:.65!important;
        margin-top:2px!important;
        line-height:1.3!important;
      }
      /* Texto intro de m33: debajo o compacto, no roba el layout */
      .m33-body > .m33-muted{
        margin:14px 0 0!important;
        font-size:.85rem!important;
        line-height:1.4!important;
        opacity:.7!important;
      }
      @media(max-width:720px){
        .m49-session-grid{grid-template-columns:1fr!important;gap:14px!important}
        .m49-step2-card{min-height:96px!important;padding:16px!important}
        .m49-step2-card select{min-height:48px!important}
      }
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
    if(bs.length===1){
      // Inferir por contenido: selects = step2, summaries = step1
      const b=bs[0];
      if(step===2 && b.querySelector('select[data-m33-sid]'))return b;
      if(step===1 && (b.querySelector('.m33-summary')||b.querySelector('.m33-session')))return b;
      return step===1?b:null;
    }
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

  function findSesionesHeading(body){
    return [...body.children].find(el=>{
      const t=String(el.tagName||'').toUpperCase();
      if(t!=='H1'&&t!=='H2'&&t!=='H3'&&t!=='H4'&&t!=='H5'&&t!=='H6')return false;
      return String(el.textContent||'').trim().toLowerCase()==='sesiones';
    })||null;
  }

  function placeGridAfterInfo(body,grid){
    const heading=findSesionesHeading(body);
    if(heading){ heading.insertAdjacentElement('afterend',grid); return; }
    const summaries=[...body.querySelectorAll(':scope > .m33-summary')];
    if(summaries.length){ summaries[summaries.length-1].insertAdjacentElement('afterend',grid); return; }
    body.appendChild(grid);
  }

  function organizeStep1(){
    const body=stepBody(1); if(!body||body.dataset.bcM49Step1==='1')return;
    // No reorganizar Step2 como Step1
    if(body.querySelector('select[data-m33-sid]'))return;
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
      grid.append(left,right);
      placeGridAfterInfo(body,grid);
      body.dataset.bcM49Step1='1';
    }finally{busy=false}
  }

  function organizeStep2(){
    const body=stepBody(2); if(!body||body.dataset.bcM49Step2==='1')return;
    const nodes=sessionNodes(body); if(!nodes.length)return;
    busy=true;
    try{
      clearOldLayout(body);
      // Forzar atributo para overrides CSS y m36
      body.setAttribute('data-m33-step','2');
      const grid=document.createElement('div');grid.className='m49-session-grid';
      const left=document.createElement('div');left.className='m49-session-col';
      const right=document.createElement('div');right.className='m49-session-col';
      left.innerHTML='<div class="m49-session-heading">☀️ Mañana</div>';
      right.innerHTML='<div class="m49-session-heading">🌙 Tarde</div>';
      const control=document.createElement('div');
      control.className='m49-step2-control';
      control.innerHTML='<label class="m49-step2-label"><input type="checkbox" id="m49-block-same"><span>Asignar la misma dependienta en cada bloque</span></label><div class="m49-step2-hint">Activa esta opción para que una dependienta elegida en Mañana se replique en todas las Mañanas. Tarde funciona por separado.</div>';
      grid.appendChild(control);
      nodes.forEach(n=>{n.classList.add('m49-session-card','m49-step2-card');(isTarde(n)?right:left).appendChild(n)});
      grid.append(left,right);
      // Grid primero; el párrafo muted de m33 queda debajo
      body.insertBefore(grid, body.firstElementChild);
      const check=control.querySelector('#m49-block-same');
      function applyFrom(source){
        if(!check.checked||!source||!source.value)return;
        const targetKind=isTarde(source.closest('.m49-session-card'))?'tarde':'manana';
        nodes.forEach(card=>{
          const sel=card.querySelector('select[data-m33-sid],select[data-sid]');
          if(!sel)return;
          if((isTarde(card)?'tarde':'manana')===targetKind&&sel.value!==source.value){
            sel.value=source.value;sel.dispatchEvent(new Event('change',{bubbles:true}));
          }
        });
      }
      grid.addEventListener('change',e=>{const sel=e.target.closest('select');if(sel)applyFrom(sel)});
      check.addEventListener('change',()=>{
        if(!check.checked)return;
        ['manana','tarde'].forEach(k=>{
          const card=nodes.find(c=>(isTarde(c)?'tarde':'manana')===k&&c.querySelector('select')?.value);
          if(card)applyFrom(card.querySelector('select'));
        });
      });
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
