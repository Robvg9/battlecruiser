// ==== BattleCruiser · Compra múltiple — estilo tipo vale ====
(function(){
  'use strict';
  function aplicar(){
    const host=document.getElementById('compra-multiple-lineas');
    if(!host||host.dataset.valeStyled==='1')return;
    host.dataset.valeStyled='1';
    const css=document.createElement('style');
    css.textContent=`.compra-multiple-panel .vale-lista-head{display:flex;justify-content:space-between;align-items:center;margin:14px 0 6px;padding:10px 12px;border:1px solid var(--gold-dim);background:var(--stone);border-radius:7px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.04em}.compra-multiple-panel .vale-lista-head span{font-family:Inter,sans-serif;font-size:12px;color:var(--mist)}.compra-multiple-panel #compra-multiple-lineas{border:1px solid var(--gold-dim);border-radius:8px;overflow:hidden}.compra-multiple-panel #compra-multiple-lineas .lista-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;margin:0!important;border:0;border-bottom:1px solid #c9a24d22;border-radius:0;padding:12px 13px;background:var(--void)}.compra-multiple-panel #compra-multiple-lineas .lista-item:last-child{border-bottom:0}.compra-multiple-panel #compra-multiple-lineas .lista-item button{white-space:nowrap}.compra-multiple-panel #compra-multiple-lineas .muted{font-size:11px}`;
    document.head.appendChild(css);
    const head=document.createElement('div');head.className='vale-lista-head';head.innerHTML='<strong>DETALLE DE LA COMPRA</strong><span>Verifica todas las líneas antes de registrar</span>';host.parentNode.insertBefore(head,host);
  }
  function wait(){aplicar();const mo=new MutationObserver(aplicar);const host=document.getElementById('compra-multiple-lineas');if(host)mo.observe(host,{childList:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wait,{once:true});else wait();
})();
