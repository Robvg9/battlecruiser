// BattleCruiser — Pulido operativo D 2026-09-03
(function(){
  'use strict';
  if(window.__BC_PULIDO_D_20260903__)return;
  window.__BC_PULIDO_D_20260903__=true;
  async function hydrate(){
    var id=document.getElementById('prod-editando-id')?.value||'';if(!id)return;
    if(typeof window.client==='undefined'||!client||!client.from)return;
    try{
      var r=await client.from('producto_presentaciones').select('presentacion_id,factor,presentaciones(id,nombre)').eq('producto_id',id).eq('activo',true).order('created_at');
      var rows=Array.isArray(r.data)?r.data:[];
      var prod=(Array.isArray(window._cache?.productos)?_cache.productos:[]).find(function(p){return String(p.id)===String(id);});
      var wholesaleId=prod&&prod.presentacion_id?String(prod.presentacion_id):null;
      var wholesale=wholesaleId?rows.find(function(x){return String(x.presentacion_id)===wholesaleId;}):null;
      var normal=rows.find(function(x){return !wholesaleId||String(x.presentacion_id)!==wholesaleId;})||null;
      function set(kind,row){
        var isW=kind==='wholesale';
        var name=document.getElementById(isW?'bc-pres-wholesale-name':'bc-pres-normal-name');
        var factor=document.getElementById(isW?'bc-pres-wholesale-factor':'bc-pres-normal-factor');
        if(name)name.value=row&&row.presentaciones?String(row.presentaciones.nombre||''):'';
        if(factor)factor.value=row&&row.factor!=null?String(row.factor):'';
      }
      set('normal',normal);
      set('wholesale',wholesale);
    }catch(_){ }
  }
  function boot(){setTimeout(hydrate,120);setTimeout(hydrate,700);setTimeout(hydrate,1600);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC_PULIDO_D_VERIFY=function(){return{loaded:true,editId:!!document.getElementById('prod-editando-id')}};
})();
