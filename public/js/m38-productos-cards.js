// BattleCruiser — M38: cards compactas para Productos
(function(){
  'use strict';
  if(window.__bcM38ProductosCards)return;
  window.__bcM38ProductosCards=true;
  const LIST_ID='lista-productos';
  function list(){return document.getElementById(LIST_ID)}
  function mark(){
    const l=list();if(!l)return;
    l.classList.add('bc-productos-cards');
    [...l.children].forEach(item=>{
      if(!(item instanceof HTMLElement))return;
      item.classList.add('bc-product-card');
      const imgs=item.querySelectorAll('img');
      imgs.forEach(img=>{
        img.classList.add('bc-product-thumb');
        img.removeAttribute('width');img.removeAttribute('height');
      });
    });
  }
  function css(){
    if(document.getElementById('m38-productos-css'))return;
    const s=document.createElement('style');s.id='m38-productos-css';s.textContent=`#lista-productos.bc-productos-cards{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;align-items:stretch;max-height:none;overflow:visible}#lista-productos.bc-productos-cards>.bc-product-card{display:flex!important;align-items:center;gap:12px;width:100%;min-width:0;min-height:86px;max-height:116px;overflow:hidden;margin:0!important;padding:10px 12px!important;border:1px solid rgba(201,162,77,.16)!important;border-radius:12px!important;background:linear-gradient(180deg,rgba(26,56,48,.72),rgba(18,42,36,.78))!important;box-shadow:0 5px 18px rgba(0,0,0,.16);transition:border-color .15s ease,transform .15s ease,box-shadow .15s ease}#lista-productos.bc-productos-cards>.bc-product-card:hover{transform:translateY(-1px);border-color:rgba(212,176,92,.34)!important;box-shadow:0 8px 22px rgba(0,0,0,.22)}#lista-productos.bc-productos-cards .bc-product-thumb{display:block!important;flex:0 0 64px!important;width:64px!important;height:64px!important;max-width:64px!important;max-height:64px!important;min-width:64px!important;min-height:64px!important;object-fit:cover!important;border-radius:9px!important;border:1px solid rgba(201,162,77,.18);background:var(--void);overflow:hidden}#lista-productos.bc-productos-cards>.bc-product-card>*{min-width:0}#lista-productos.bc-productos-cards .producto-nombre,#lista-productos.bc-productos-cards .producto-nombre-container,#lista-productos.bc-productos-cards .lista-item-nombre{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#lista-productos.bc-productos-cards .muted{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#lista-productos.bc-productos-cards button{flex:0 0 auto;white-space:nowrap;font-size:11.5px;padding:6px 9px;border-radius:8px}@media(max-width:700px){#lista-productos.bc-productos-cards{grid-template-columns:1fr}#lista-productos.bc-productos-cards>.bc-product-card{max-height:108px}}`;
    document.head.appendChild(s);
  }
  function boot(){css();mark();const l=list();if(!l||l.dataset.bcM38Obs==='1')return;l.dataset.bcM38Obs='1';const obs=new MutationObserver(mark);obs.observe(l,{childList:true,subtree:true});window.__BC_M38_OBS=obs}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,400));else setTimeout(boot,400);
})();