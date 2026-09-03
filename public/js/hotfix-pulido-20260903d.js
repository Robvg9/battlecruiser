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
      var wId=prod?.presentacion_id||null;
      var normal=rows.find(function(x){return Number(x.factor)===1;})||rows[0]||null;
      var wholesale=wId?rows.find(function(x){return String(x.presentacion_id)===String(wId);})||null:(rows.length>1?rows[rows.length-1]:null);
      function set(kind,row){
        if(!row)return;
        var sel=document.getElementById(kind==='wholesale'?'bc-pres-wholesale':'bc-pres-normal');
        var factor=document.getElementById('bc-pres-'+kind+'-factor');
        if(sel&&row.presentacion_id){sel.value=String(row.presentacion_id);}
        if(factor)factor.value=String(row.factor??'');
        var custom=document.getElementById('bc-pres-'+kind+'-custom');if(custom)custom.classList.add('hidden');
      }
      set('normal',normal);set('wholesale',wholesale);
    }catch(_){ }
  }
  function boot(){setTimeout(hydrate,120);setTimeout(hydrate,700);setTimeout(hydrate,1600);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC_PULIDO_D_VERIFY=function(){return{loaded:true,editId:!!document.getElementById('prod-editando-id')}};
})();
