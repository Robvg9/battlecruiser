(function(){
'use strict';
if(window.__BC143)return;window.__BC143=true;
function forceStock(){
  if(typeof window.cargarStockAlmacenes!=='function')return;
  Promise.resolve(window.cargarStockAlmacenes(true)).then(function(){
    if(typeof window.renderPanelAlmacenSeleccionado==='function')window.renderPanelAlmacenSeleccionado();
    if(typeof window.actualizarStockDisponibleUI==='function')window.actualizarStockDisponibleUI();
  }).catch(function(e){console.warn('[BC] refresh stock compra',e);});
}
function bind(){
  var box=document.getElementById('compra-multiple-msg');
  if(!box||box.dataset.bc143)return;
  box.dataset.bc143='1';
  var last='';
  var obs=new MutationObserver(function(){
    var t=(box.textContent||'').trim();
    if(t&&t!==last&&(t.indexOf('Stock actualizado')>=0||t.indexOf('Compra registrada')>=0)){last=t;setTimeout(forceStock,0);setTimeout(forceStock,800);}
  });
  obs.observe(box,{childList:true,subtree:true,characterData:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
[500,1200,2500].forEach(function(ms){setTimeout(bind,ms);});
})();
