// BattleCruiser — 17.15: Reportes sin duplicar el mismo registro lógico
(function(){
  'use strict';
  if(window.__BC1715)return;window.__BC1715=true;
  function shortId(id){var s=String(id||'');return s?s.slice(0,8):'';}
  function hook(){
    if(typeof window.renderVentas!=='function'||window.renderVentas.__bc1715)return false;
    var old=window.renderVentas;
    window.renderVentas=function(rows){
      var seen=new Set(),clean=[];
      (Array.isArray(rows)?rows:[]).forEach(function(r){var id=String(r&&r.id||'');if(id&&seen.has(id))return;if(id)seen.add(id);clean.push(r);});
      old.apply(this,[clean]);
      setTimeout(function(){
        var el=document.getElementById('rep-detalle');if(!el)return;
        el.querySelectorAll('.rep-fila').forEach(function(row,i){
          var r=clean[i];if(!r)return;
          row.dataset.repId=String(r.id||'');
          var principal=row.querySelector('.rep-fila-principal');
          if(principal&&!principal.querySelector('.bc1715-ref')&&r.id){var ref=document.createElement('span');ref.className='muted bc1715-ref';ref.style.cssText='display:block;font-size:.65rem;opacity:.75;margin-top:3px';ref.textContent='Ref. #'+shortId(r.id);principal.appendChild(ref);}
        });
      },0);
    };
    window.renderVentas.__bc1715=true;return true;
  }
  function boot(){[0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(hook,ms)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC1715_verify=function(){return typeof window.renderVentas==='function'&&!!window.renderVentas.__bc1715};
})();