// BattleCruiser — 17.2: guardado directo de producto, precio opcional
(function(){
  'use strict';
  if(window.__BC172)return; window.__BC172=true;
  function msg(t,ok){if(typeof setMsg==='function')setMsg('msg-productos',t,ok);}
  function numOrNull(id){var e=document.getElementById(id);if(!e)return null;var raw=String(e.value||'').trim();if(raw==='')return null;var n=Number(raw);return Number.isFinite(n)?n:null;}
  function configure(){
    var form=document.getElementById('form-producto');if(!form)return false;
    var pn=document.getElementById('prod-precio-normal'),pm=document.getElementById('prod-precio-mayorista');
    [pn,pm].forEach(function(e){if(!e)return;e.required=false;e.removeAttribute('required');e.removeAttribute('min');e.step='0.01';});
    var native=document.getElementById('prod-submit-btn');if(native){native.type='submit';native.textContent='Guardar producto';}
    if(form.dataset.bc172Bound==='1')return true;
    form.dataset.bc172Bound='1';
    form.addEventListener('submit',async function(e){
      e.preventDefault();e.stopImmediatePropagation();
      var nombre=(document.getElementById('prod-nombre')?.value||'').trim();
      var categoria_id=document.getElementById('prod-categoria')?.value||null;
      var unidad=(document.getElementById('prod-unidad')?.value||'').trim()||null;
      var precio_normal=numOrNull('prod-precio-normal');
      var precio_mayorista=numOrNull('prod-precio-mayorista');
      var id=document.getElementById('prod-editando-id')?.value||null;
      if(!nombre){msg('El nombre del producto es requerido.',false);return;}
      if(precio_normal!==null&&precio_normal<0){msg('El precio normal no puede ser negativo.',false);return;}
      if(precio_mayorista!==null&&precio_mayorista<0){msg('El precio mayorista no puede ser negativo.',false);return;}
      var save=document.getElementById('bc171-save')||native;if(save)save.disabled=true;
      try{
        var r=await ejecutarOperacion(id?'producto_actualizar':'producto',{
          ...(id?{p_producto_id:id}:{}),p_nombre:nombre,p_categoria_id:categoria_id,p_unidad:unidad,p_precio_normal:precio_normal,p_precio_mayorista:precio_mayorista
        });
        if(!r||!r.ok){msg('No se pudo '+(id?'actualizar':'crear')+': '+(typeof explicarError==='function'?explicarError(r&&r.error,id?'editar producto':'crear producto'):((r&&r.error&&r.error.message)||'error')),false);return;}
        var realId=id||r.data||null;
        var file=document.getElementById('prod-imagen-input')?.files?.[0]||null;
        if(file&&realId&&!r.offline&&typeof subirImagenProducto==='function'){
          var ir=await subirImagenProducto(realId,file);
          if(!ir.ok)msg('Producto guardado, pero la imagen no se pudo subir: '+((ir.error&&ir.error.message)||'error'),false);
        }
        if(typeof cancelarEdicionProducto==='function')cancelarEdicionProducto();
        msg(r.offline?'✓ Producto guardado localmente — se sincronizará al recuperar conexión.':(id?'✓ Producto actualizado.':'✓ Producto creado.'),true);
        if(!r.offline&&typeof refrescarProductos==='function')await refrescarProductos();
        if(typeof window.__BC171_close==='function')window.__BC171_close();
      }catch(err){msg('No se pudo guardar el producto: '+(err&&err.message||String(err)),false);}finally{if(save)save.disabled=false;}
    },true);
    return true;
  }
  function boot(){[0,300,800,1500,3000].forEach(function(ms){setTimeout(configure,ms)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC172_verify=function(){var f=document.getElementById('form-producto'),pn=document.getElementById('prod-precio-normal');return{form:!!f,bound:!!(f&&f.dataset.bc172Bound==='1'),normalPriceOptional:!!(pn&&!pn.required&&!pn.hasAttribute('required')),save:!!document.getElementById('bc171-save')}};
})();