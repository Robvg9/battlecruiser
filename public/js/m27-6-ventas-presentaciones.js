// BattleCruiser M27.6 — Presentaciones en Ventas
(function(){
  "use strict";
  if(window.__BC_M276_PRES__)return;
  window.__BC_M276_PRES__=true;
  var _pres=[];
  function esc(s){return typeof escHtml==="function"?escHtml(s):String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
  function almId(){try{if(typeof bcSincronizarSelectAlmacenTurno==="function"){var id=bcSincronizarSelectAlmacenTurno();if(id)return id;}}catch(e){}var s=document.getElementById("venta-almacen");return s?s.value:"";}
  function almTipo(){var id=almId();try{if(typeof ventaAlmacenesTipo!=="undefined"&&id&&ventaAlmacenesTipo[id]!=null)return String(ventaAlmacenesTipo[id]).toLowerCase();}catch(e){}try{var a=(_cache.almacenes||[]).find(function(x){return String(x.id)===String(id);});return a&&a.tipo?String(a.tipo).toLowerCase():null;}catch(e2){return null;}}
  function getCartLines(){
    try{if(typeof ventaLineas!=="undefined"&&Array.isArray(ventaLineas))return ventaLineas;}catch(e){}
    return Array.isArray(window.ventaLineas)?window.ventaLineas:[];
  }
  function getProd(pid){try{if(Array.isArray(ventaProductosLista)){var p=ventaProductosLista.find(function(x){return String(x.id)===String(pid);});if(p)return p;}}catch(e){}try{return(_cache.productos||[]).find(function(x){return String(x.id)===String(pid);})||null;}catch(e2){return null;}}
  function getPresentation(pid){
    var type=almTipo();
    if(type!=="minorista"&&type!=="mayorista")return null;
    try{
      if(typeof window.__BC_M275_getProductPresentation==="function")
        return window.__BC_M275_getProductPresentation(pid,type);
    }catch(e){}
    return null;
  }
  function canSell(pid){
    var type=almTipo(),prod=getProd(pid);
    if(!prod)return{ok:false,msg:"Producto no encontrado."};
    if(type!=="minorista"&&type!=="mayorista")return{ok:false,msg:"El turno no pertenece a un almacén minorista o mayorista."};
    var presentation=getPresentation(pid);
    if(!presentation)return{ok:false,msg:type==="mayorista"
      ?"Este producto no tiene una presentación mayorista configurada."
      :"Este producto no tiene una presentación minorista configurada."};
    if(!(Number(presentation.factor)>0)||!presentation.presentacion_id)
      return{ok:false,msg:"La presentación del producto no tiene un factor válido."};
    if(prod.precio_normal==null&&prod.precio_mayorista==null)
      return{ok:false,msg:"Este producto no tiene precio configurado."};
    return{ok:true,presentation:presentation};
  }
  function attachLinePresentation(pid,line){
    if(!line)return false;
    var check=canSell(pid);
    if(!check.ok)return false;
    var p=check.presentation, factor=Number(p.factor);
    line.presentacion_id=p.presentacion_id;
    line.factor_presentacion=factor;
    line.presentacion_nombre=p.nombre||"Presentación";
    line.cantidad_presentacion=Number(line.cantidad||0)/factor;
    return true;
  }
  window.__BC_M276_updatePresentationHint=updatePresentationHint;
  window.__BC_M276_attachLinePresentation=attachLinePresentation;
  function buildPLineasFromCart(lineas){
    return(lineas||[]).map(function(l){
      var factor=Number(l.factor_presentacion)||0;
      var quantityPresentation=factor>0?Number(l.cantidad||0)/factor:
        (l.cantidad_presentacion!=null?Number(l.cantidad_presentacion):null);
      return{
        producto_id:l.producto_id,
        cantidad:Number(l.cantidad)||0,
        presentacion_id:l.presentacion_id||null,
        cantidad_presentacion:quantityPresentation,
        tipo_precio:l.tipo_precio||null
      };
    });
  }
  window.__BC_M276_buildPLineas=buildPLineasFromCart;
  function ensureUI(){
    var form=document.getElementById("form-venta-linea");
    if(!form||document.getElementById("venta-presentacion-info"))return;
    var oldSelect=document.getElementById("venta-presentacion");
    if(oldSelect)oldSelect.remove();
    var info=document.createElement("span");
    info.id="venta-presentacion-info";
    info.className="bc-m276-pres-hint muted";
    info.textContent="Se utilizará la presentación configurada para el tipo de almacén.";
    var amount=document.getElementById("venta-cantidad");
    if(amount&&amount.parentNode===form)form.insertBefore(info,amount.nextSibling);
    else form.appendChild(info);
    if(amount){amount.step="1";amount.min="1";amount.placeholder="Cantidad de presentaciones";}
    var product=document.getElementById("venta-producto");
    if(product&&!product.dataset.bcM276PresHint){
      product.dataset.bcM276PresHint="1";
      product.addEventListener("change",updatePresentationHint);
    }
    var search=document.getElementById("venta-producto-buscar");
    if(search&&!search.dataset.bcM276PresHint){
      search.dataset.bcM276PresHint="1";
      search.addEventListener("click",function(){setTimeout(updatePresentationHint,0);});
      var results=document.getElementById("venta-producto-resultados");
      if(results)results.addEventListener("click",function(){setTimeout(updatePresentationHint,0);});
    }
  }
  function updatePresentationHint(){
    var id=document.getElementById("venta-producto")?.value||"";
    var hint=document.getElementById("venta-presentacion-info");
    var amount=document.getElementById("venta-cantidad");
    if(!hint)return;
    if(!id){hint.textContent="Se utilizará la presentación configurada para el tipo de almacén.";return;}
    var check=canSell(id);
    if(!check.ok){
      hint.textContent=check.msg;
      if(amount){amount.placeholder="Presentación no disponible";amount.removeAttribute("max");}
      return;
    }
    var p=check.presentation, factor=Number(p.factor);
    hint.textContent=(p.nombre||"Presentación")+" · 1 "+(p.nombre||"presentación")+" = "+factor+" unidades base";
    if(amount){
      amount.step="1";amount.min="1";amount.placeholder="Cantidad de "+(p.nombre||"presentaciones").toLowerCase();
      var alm=almId();
      if(alm&&typeof obtenerStockDisponible==="function"){
        var stock=Number(obtenerStockDisponible(id,alm).valor)||0;
        amount.max=String(Math.floor(stock/factor));
      }
    }
  }
  function patchAdd(){
    if(typeof window.agregarLineaVenta!=="function"||window.agregarLineaVenta.__bcM276)return;
    var old=window.agregarLineaVenta;
    function add(producto_id,cantidad,almacen_id,opts){
      opts=opts||{};
      var check=canSell(producto_id);
      if(!check.ok){if(typeof setMsg==="function")setMsg("msg-venta-linea",check.msg,false);return false;}
      var packageQuantity=Number(cantidad);
      if(!(packageQuantity>0)){if(typeof setMsg==="function")setMsg("msg-venta-linea","La cantidad debe ser mayor que cero.",false);return false;}
      var factor=Number(check.presentation.factor);
      var baseQuantity=packageQuantity*factor;
      var result=old.call(this,producto_id,baseQuantity,almacen_id,Object.assign({},opts,{__bcQuantityIsBase:true}));
      if(result!==false){
        var lines=getCartLines();
        var line=lines.find(function(item){return String(item.producto_id)===String(producto_id);})||null;
        if(line)attachLinePresentation(producto_id,line);
        if(typeof window.renderVentaLineas==="function")window.renderVentaLineas();
      }
      return result;
    }
    add.__bcM276=true;add.__bcM276Orig=old;
    window.agregarLineaVenta=add;
    try{agregarLineaVenta=add;}catch(e){}
  }
  function patchCartPresentation(){
    if(typeof window.renderVentaLineas!=="function"||window.renderVentaLineas.__bcM276Presentation)return;
    var old=window.renderVentaLineas;
    function render(){
      getCartLines().forEach(function(line){
        if(line&&line.presentacion_id){
          var factor=Number(line.factor_presentacion)||1;
          line.cantidad_presentacion=Number(line.cantidad||0)/factor;
        }
      });
      var result=old.apply(this,arguments);
      var container=document.getElementById("venta-lineas");
      if(container){
        Array.from(container.querySelectorAll(".lista-item")).forEach(function(row,index){
          var line=getCartLines()[index];
          var host=row.querySelector(".venta-linea-info");
          if(!line||!host||!line.presentacion_id)return;
          var factor=Number(line.factor_presentacion)||1;
          var qty=Number(line.cantidad_presentacion)||0;
          var input=row.querySelector(".venta-linea-cant-input");
          if(input){
            input.value=String(qty);
            input.step="1";
            input.min="1";
            input.setAttribute("step","1");
            input.setAttribute("min","1");
          }
          var badge=row.querySelector(".bc-m276-pres-label");
          if(!badge){badge=document.createElement("span");badge.className="bc-m276-pres-label muted";host.appendChild(badge);}
          badge.textContent=(line.presentacion_nombre||"Presentación")+" · "+qty+" × "+factor+" u";
        });
      }
      return result;
    }
    render.__bcM276Presentation=true;
    window.renderVentaLineas=render;
    try{renderVentaLineas=render;}catch(e){}
    patchCartQuantityControls();
  }

  function patchCartQuantityControls(){
    if(typeof window.actualizarCantidadLinea==="function"&&!window.actualizarCantidadLinea.__bcM276Quantity){
      var original=window.actualizarCantidadLinea;
      function updateQuantity(index,packageQuantity){
        var line=getCartLines()[index];
        if(!line||!line.presentacion_id)return original.apply(this,arguments);
        var packages=Number(packageQuantity);
        var factor=Number(line.factor_presentacion)||1;
        if(!Number.isFinite(packages))return;
        return original.call(this,index,packages<=0?0:packages*factor);
      }
      updateQuantity.__bcM276Quantity=true;
      updateQuantity.__bcM276QuantityOrig=original;
      window.actualizarCantidadLinea=updateQuantity;
      try{actualizarCantidadLinea=updateQuantity;}catch(e){}
    }
    var container=document.getElementById("venta-lineas");
    if(!container||container.dataset.bcM276QuantityControls==="1")return;
    container.dataset.bcM276QuantityControls="1";
    container.addEventListener("click",function(event){
      var button=event.target&&event.target.closest?event.target.closest(".venta-linea-mas,.venta-linea-menos"):null;
      if(!button)return;
      var index=Number(button.dataset.idx),line=getCartLines()[index];
      if(!line||!line.presentacion_id)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var current=Number(line.cantidad_presentacion)||0;
      window.actualizarCantidadLinea(index,current+(button.classList.contains("venta-linea-mas")?1:-1));
    },true);
  }
  function patchOp(){if(typeof window.ejecutarOperacion!=="function"||window.ejecutarOperacion.__bcM276)return;var old=window.ejecutarOperacion;function op(tipo,params){if(tipo==="venta"&&params){params=Object.assign({},params);var lines=getCartLines();if(lines.length)params.p_lineas=buildPLineasFromCart(lines);var t=almTipo();if(t==="mayorista")params.p_tipo_precio=params.p_tipo_precio||"mayorista";else if(t==="minorista")params.p_tipo_precio=params.p_tipo_precio||"normal";}return old.apply(this,arguments);}op.__bcM276=true;window.ejecutarOperacion=op;try{ejecutarOperacion=op;}catch(e){}}
  function boot(){ensureUI();patchAdd();patchCartPresentation();patchOp();updatePresentationHint();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  setTimeout(boot,300);setTimeout(boot,1200);
})();
