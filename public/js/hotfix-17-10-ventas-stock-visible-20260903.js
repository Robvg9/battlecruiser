// BattleCruiser — 17.10: stock visible y no bloqueante en Ventas
(function(){
  'use strict';
  if(window.__BC1710)return;window.__BC1710=true;
  function stock(pid,aid){try{return typeof obtenerStockDisponible==='function'?Number(obtenerStockDisponible(pid,aid).valor):0}catch(_){return 0}}
  function paint(){
    var tab=document.getElementById('tab-ventas');if(!tab)return false;
    var aid=document.getElementById('venta-almacen')?.value||'';
    var grid=document.getElementById('catalogo-grid');
    if(grid){grid.querySelectorAll('.catalogo-card').forEach(function(card){
      var pid=card.dataset.productoId;if(!pid||!aid)return;
      var val=stock(pid,aid),el=card.querySelector('.bc1710-stock');
      if(!el){el=document.createElement('span');el.className='catalogo-card-stock bc1710-stock';card.appendChild(el);}
      el.textContent='Stock: '+(Number.isInteger(val)?val:val.toLocaleString('es-ES',{maximumFractionDigits:2}));
      el.setAttribute('data-stock',String(val));
    });}
    tab.querySelectorAll('*').forEach(function(e){if(/cargando stock del almac[eé]n/i.test(e.textContent||'')&&e.children.length===0){e.textContent='';e.classList.add('bc1710-no-wait');e.setAttribute('aria-hidden','true');}});
    return true;
  }
  function boot(){paint();var grid=document.getElementById('catalogo-grid');if(grid&&!grid.dataset.bc1710Obs){grid.dataset.bc1710Obs='1';new MutationObserver(function(){paint()}).observe(grid,{childList:true,subtree:true});} }
  [0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(boot,ms)});
  window.addEventListener('resize',paint);
  window.__BC1710_verify=function(){return!!document.querySelector('#tab-ventas .bc1710-stock')||!!document.getElementById('catalogo-grid')};
})();