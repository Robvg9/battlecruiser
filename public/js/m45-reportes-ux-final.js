// BattleCruiser — M45.2: acabado final de Reportes
(function(){
  'use strict';
  if(window.__bcM45ReportesUxV2)return;
  window.__bcM45ReportesUxV2=true;

  let refreshWrapped=false;

  function css(){
    if(document.getElementById('bc-m45-reportes-css'))return;
    const s=document.createElement('style');s.id='bc-m45-reportes-css';s.textContent=`
      #tab-reportes .bc-m45-quick{margin:0 0 12px;padding:12px;border:1px solid rgba(212,176,92,.12);border-radius:12px;background:rgba(8,20,17,.48)}
      #tab-reportes .bc-m45-quick-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      #tab-reportes .bc-m45-quick-head strong{font-size:.76rem;color:var(--text)}
      #tab-reportes .bc-m45-quick-head span{font-size:.66rem;color:var(--mist)}
      #tab-reportes .bc-m45-quick-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px}
      #tab-reportes .bc-m45-quick-btn{min-width:0;padding:9px 10px;border-radius:9px;border:1px solid rgba(212,176,92,.13);background:rgba(18,42,36,.66);color:var(--mist);font-size:.72rem;cursor:pointer;text-align:left}
      #tab-reportes .bc-m45-quick-btn:hover{color:var(--text);border-color:rgba(212,176,92,.32);background:rgba(26,56,48,.78)}
      #tab-reportes .bc-m45-quick-btn.active{color:var(--gold-bright);border-color:rgba(212,176,92,.34);background:rgba(212,176,92,.08)}
      #tab-reportes .bc-m45-timeout{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding:10px 11px;border-radius:9px;border:1px solid rgba(196,74,90,.18);background:rgba(196,74,90,.05);color:var(--mist);font-size:.72rem}
      #tab-reportes .bc-m45-timeout button{padding:7px 10px;border-radius:8px;border:1px solid rgba(212,176,92,.2);background:rgba(212,176,92,.08);color:var(--text);cursor:pointer}
      @media(max-width:640px){#tab-reportes .bc-m45-quick-grid{grid-template-columns:1fr 1fr}}
    `;document.head.appendChild(s);
  }

  function quickActions(){
    const tab=document.getElementById('tab-reportes');
    if(!tab)return;
    const tabs=[...tab.querySelectorAll('.rep-tab-btn')];
    if(!tabs.length||tab.querySelector('.bc-m45-quick'))return;
    const block=document.createElement('section');block.className='bc-m45-quick';
    block.innerHTML='<div class="bc-m45-quick-head"><strong>Acciones rápidas</strong><span>Reportes disponibles</span></div><div class="bc-m45-quick-grid"></div>';
    const grid=block.querySelector('.bc-m45-quick-grid');
    tabs.forEach(function(btn){
      const b=document.createElement('button');b.type='button';b.className='bc-m45-quick-btn';b.textContent=btn.textContent.trim();b.dataset.rep=btn.dataset.rep||'';
      b.setAttribute('aria-label','Abrir reporte '+btn.textContent.trim());
      b.addEventListener('click',function(){btn.click();const d=tab.querySelector('.bc-m42-detail');if(d)d.open=true;syncActive()});
      grid.appendChild(b);
    });
    const detail=tab.querySelector('.bc-m42-detail');
    if(detail)detail.before(block); else tab.appendChild(block);
    function syncActive(){grid.querySelectorAll('.bc-m45-quick-btn').forEach(x=>{const target=tabs.find(b=>String(b.dataset.rep)===String(x.dataset.rep));x.classList.toggle('active',!!target&&target.classList.contains('active'));})}
    const obs=new MutationObserver(syncActive);obs.observe(tab,{subtree:true,attributes:true,attributeFilter:['class']});syncActive();
  }

  function wrapRefresh(){
    if(refreshWrapped||typeof window.refrescarReportes!=='function')return;
    refreshWrapped=true;
    const original=window.refrescarReportes;
    window.refrescarReportes=async function(){
      const tab=document.getElementById('tab-reportes');
      if(!tab)return original.apply(this,arguments);
      const messageId='bc-m45-timeout-msg';
      const existing=document.getElementById(messageId);if(existing)existing.remove();
      let timedOut=false;
      const timer=setTimeout(function(){
        timedOut=true;
        const host=tab.querySelector('.bc-m42-shell')||tab;
        const msg=document.createElement('div');msg.id=messageId;msg.className='bc-m45-timeout';msg.innerHTML='<span>La consulta está tardando más de lo esperado.</span><button type="button">Reintentar</button>';
        msg.querySelector('button').onclick=function(){msg.remove();window.refrescarReportes()};
        const detail=tab.querySelector('.bc-m42-detail');if(detail)detail.after(msg);else host.appendChild(msg);
      },18000);
      try{return await original.apply(this,arguments)}finally{clearTimeout(timer);if(!timedOut){const msg=document.getElementById(messageId);if(msg)msg.remove()}}
    };
    window.refrescarReportes.__bcM45=true;
  }

  function boot(){
    css();
    const tab=document.getElementById('tab-reportes');if(!tab)return;
    const aplicar=tab.querySelector('#rep-aplicar-btn');if(aplicar)aplicar.textContent='Generar reporte';
    const limpiar=tab.querySelector('#rep-limpiar-btn');if(limpiar)limpiar.textContent='Limpiar';
    const conn=tab.querySelector('#reportes-conn-info');if(conn)conn.setAttribute('aria-live','polite');
    quickActions();wrapRefresh();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot();setTimeout(boot,600);setTimeout(boot,1500)});else{boot();setTimeout(boot,600);setTimeout(boot,1500)}
})();