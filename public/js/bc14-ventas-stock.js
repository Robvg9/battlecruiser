(function(){
'use strict';
if(window.__BC142)return;
window.__BC142=true;
function sync(){
  if(typeof window.cargarStockAlmacenes!=='function')return;
  Promise.resolve(window.cargarStockAlmacenes(false)).then(function(){
    if(typeof window.actualizarStockDisponibleUI==='function')window.actualizarStockDisponibleUI();
    if(typeof window.renderCatalogoGrid==='function')window.renderCatalogoGrid();
  }).catch(function(e){console.warn('[BC] stock ventas',e);});
}
function bind(){
  var b=document.querySelector('.tab-btn[data-tab="ventas"]');
  if(b&&!b.dataset.bc142){b.dataset.bc142='1';b.addEventListener('click',function(){setTimeout(sync,0);});}
  var p=document.getElementById('tab-ventas');
  if(p&&p.classList.contains('active'))sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
[300,800,1600,3000].forEach(function(ms){setTimeout(bind,ms);});
})();
