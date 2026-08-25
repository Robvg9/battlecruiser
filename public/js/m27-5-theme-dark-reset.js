// BattleCruiser M27.5 — Restauración de tema oscuro + cierre operativo compacto
(function(){
  'use strict';
  if(window.__BC_M275_THEME__) return;
  window.__BC_M275_THEME__=true;
  const LS='bc-ui-preferences-v2';

  function forceDark(){
    try{const p=JSON.parse(localStorage.getItem(LS)||'{}');p.appearance='dark';localStorage.setItem(LS,JSON.stringify(p));}catch(e){}
    document.body.classList.remove('bc-theme-light');
    document.body.classList.add('bc-theme-dark');
  }
  function inject(){
    if(document.getElementById('bc-m275-dark-theme')) return;
    const s=document.createElement('style');s.id='bc-m275-dark-theme';
    s.textContent=`
      :root{
        --void:#090e12;--stone:#10181d;--stone-2:#162128;--gold:#b8a06a;--gold-bright:#d9c48c;--gold-dim:#706545;
        --wine:#7a303a;--sage:#87a995;--text:#eeeae0;--mist:#a9afb0;--mist-dim:#6f7678;
      }
      body,body.bc-theme-dark{background:radial-gradient(ellipse at top,#101820 0%,#090e12 62%)!important;color:var(--text)!important;}
      .app-shell,.main-content,.tab-panel,.seccion-cuerpo,.cc-bloque,.lista,.lista-item,.card,.pass-panel,.ajustes-menu,.sidebar,.app-header,.venta-almacen-operativo,.venta-sin-turno,.com-col-chat,.com-lista,.com-input-bar,.com-nueva-panel{background-color:var(--stone)!important;color:var(--text)!important;}
      .sidebar{background:linear-gradient(180deg,#0c1419,#0a1115)!important;border-right-color:rgba(184,160,106,.22)!important;}
      .sidebar-nav .tab-btn,.header-right button,.ajustes-menu button{color:var(--text)!important;background:transparent!important;}
      input,select,textarea{background:var(--void)!important;color:var(--text)!important;border-color:rgba(184,160,106,.28)!important;}
      .tab-btn.active,.catalogo-chip.activo{background:rgba(184,160,106,.14)!important;color:var(--gold-bright)!important;border-color:var(--gold-dim)!important;}
      .catalogo-card,.lista-item,.resumen-card,.cc-bloque{border-color:rgba(184,160,106,.18)!important;box-shadow:0 8px 24px rgba(0,0,0,.16)!important;}
      .bc-aj-app-btn[data-app="light"]{display:none!important;}
      #bc-m273-cerrar-sesion-btn{display:inline-flex!important;width:auto!important;max-width:max-content!important;margin:10px 0 8px!important;padding:7px 11px!important;border-radius:8px!important;font-size:12px!important;line-height:1.2!important;font-weight:600!important;letter-spacing:.01em!important;box-shadow:none!important;}
      #bc-m273-cerrar-sesion-btn.hidden{display:none!important;}
      #bc-m273-cerrar-sesion-btn:hover{transform:translateY(-1px);}
    `;document.head.appendChild(s);
  }
  function hideLightOption(){const btn=document.querySelector('.bc-aj-app-btn[data-app="light"]');if(btn)btn.style.display='none';}
  function init(){inject();forceDark();hideLightOption();const obs=new MutationObserver(()=>{hideLightOption();forceDark();});obs.observe(document.body,{childList:true,subtree:true});setTimeout(()=>obs.disconnect(),15000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,300));else setTimeout(init,300);
})();
