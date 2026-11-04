// BattleCruiser M27.5 — Política de precio por almacén + opción de precio alternativo
// Bloque 5: actualización inmediata del catálogo en Ventas (sin polling).
(function(){
  'use strict';
  if(window.__BC_M275__) return;
  window.__BC_M275__=true;

  const LS='bc-ventas-precio-alternativo-v1';
  let allowAlt=false;
  let presentationChannels={};
  let presentationChannelsLoaded=false;
  let presentationChannelsLoading=null;

  function normalizeType(t){
    const s=String(t||'').toLowerCase();
    if(s==='venta') return 'minorista';
    if(s==='minorista'||s==='mayorista'||s==='almacenamiento') return s;
    return s||null;
  }
  function getWarehouseId(){ const s=document.getElementById('venta-almacen'); return s?s.value:''; }
  function getWarehouseType(){
    const id=getWarehouseId();
    try{
      if(typeof ventaAlmacenesTipo!=='undefined'&&id&&ventaAlmacenesTipo[id]!=null)
        return normalizeType(ventaAlmacenesTipo[id]);
    }catch(e){}
    try{
      const a=(_cache&&_cache.almacenes||[]).find(x=>String(x.id)===String(id));
      return a?normalizeType(a.tipo):null;
    }catch(e2){return null;}
  }
  function getProducts(){
    try{
      if(Array.isArray(ventaProductosLista)&&ventaProductosLista.length)
        return ventaProductosLista;
    }catch(e){}
    try{
      if(typeof _cache!=='undefined'&&Array.isArray(_cache.productos)&&_cache.productos.length)
        return _cache.productos;
    }catch(e2){}
    return [];
  }
  function isSellType(t){ return t==='mayorista'||t==='minorista'; }

  function presentationChannelSignature(){
    return getProducts().map(function(p){return String(p.id)+':'+String(p.presentacion_id||'')+':'+String(p.activo!==false);}).sort().join('|');
  }
  function restoreCachedPresentationChannels(){
    try{
      const saved=JSON.parse(localStorage.getItem('bc-product-presentation-channels-v1')||'null');
      if(!saved||saved.signature!==presentationChannelSignature()||!saved.channels)return false;
      presentationChannels=saved.channels;
      presentationChannelsLoaded=true;
      window.__BC_M275_PRESENTATION_CHANNELS=presentationChannels;
      return true;
    }catch(e){return false;}
  }

  async function refreshPresentationChannels(){
    if(presentationChannelsLoading)return presentationChannelsLoading;
    if(!window.client||!client.from)return false;
    presentationChannelsLoaded=false;
    presentationChannelsLoading=(async function(){
      try{
        const result=await client.from('producto_presentaciones').select('producto_id,presentacion_id,factor,activo,presentaciones(nombre)').eq('activo',true);
        if(result.error)throw result.error;
        const rows=Array.isArray(result.data)?result.data:[];
        const next={};
        getProducts().forEach(function(product){
          const linked=rows.filter(function(row){return String(row.producto_id)===String(product.id);});
          const wholesaleId=product.presentacion_id?String(product.presentacion_id):null;
          const wholesaleRows=wholesaleId?linked.filter(function(row){return String(row.presentacion_id)===wholesaleId;}):[];
          const retailRows=linked.filter(function(row){return !wholesaleId||String(row.presentacion_id)!==wholesaleId;});
          function shape(row){
            if(!row)return null;
            return{presentacion_id:String(row.presentacion_id),factor:Number(row.factor),nombre:String(row.presentaciones&&row.presentaciones.nombre||'')};
          }
          // Each channel must resolve to exactly one association. Ambiguous legacy
          // products fail closed instead of selecting an arbitrary package size.
          next[String(product.id)]={
            minorista:retailRows.length===1&&Number(retailRows[0].factor)>0?shape(retailRows[0]):null,
            mayorista:wholesaleRows.length===1&&Number(wholesaleRows[0].factor)>0?shape(wholesaleRows[0]):null
          };
        });
        presentationChannels=next;
        presentationChannelsLoaded=true;
        window.__BC_M275_PRESENTATION_CHANNELS=next;
        try{localStorage.setItem('bc-product-presentation-channels-v1',JSON.stringify({signature:presentationChannelSignature(),channels:next}));}catch(e){}
        return true;
      }catch(error){
        presentationChannels={};
        presentationChannelsLoaded=restoreCachedPresentationChannels();
        window.__BC_M275_PRESENTATION_CHANNEL_ERROR=String(error&&error.message||error||'error');
        return presentationChannelsLoaded;
      }finally{
        presentationChannelsLoading=null;
      }
    })();
    return presentationChannelsLoading;
  }

  function channelAvailable(product,type){
    if(!isSellType(type))return true;
    if(!presentationChannelsLoaded||!product)return false;
    const channels=presentationChannels[String(product.id)];
    return !!(channels&&channels[type]&&channels[type].presentacion_id&&channels[type].factor>0);
  }

  function patchRefreshVentas(){
    const original=window.refrescarVentas;
    if(typeof original!=='function'||original.__bcM275PresentationWrapped)return;
    const wrapped=async function(){
      const result=await original.apply(this,arguments);
      await refreshPresentationChannels();
      render();
      if(typeof window.__BC_M276_updatePresentationHint==='function')window.__BC_M276_updatePresentationHint();
      return result;
    };
    wrapped.__bcM275PresentationWrapped=true;
    window.refrescarVentas=wrapped;
    try{refrescarVentas=wrapped;}catch(e){}
  }
  function hasBase(p,t){
    if(!isSellType(t)) return p.precio_normal!=null||p.precio_mayorista!=null;
    return t==='mayorista' ? p.precio_mayorista!=null : p.precio_normal!=null;
  }
  function hasAlt(p,t){
    if(!isSellType(t)) return false;
    return t==='mayorista' ? p.precio_normal!=null : p.precio_mayorista!=null;
  }
  function priceFor(p,t){
    if(t==='mayorista') return p.precio_mayorista!=null?p.precio_mayorista:p.precio_normal;
    return p.precio_normal!=null?p.precio_normal:p.precio_mayorista;
  }
  function typeFor(p,t){
    if(t==='mayorista') return p.precio_mayorista!=null?'mayorista':'normal';
    return p.precio_normal!=null?'normal':'mayorista';
  }

  function injectStyles(){
    if(document.getElementById('bc-m275-style')) return;
    const s=document.createElement('style');s.id='bc-m275-style';
    s.textContent=[
      '.bc-m275-policy{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0 10px;padding:7px 10px;border:1px solid var(--gold-dim);border-radius:9px;background:var(--stone);color:var(--text);font-size:12px}',
      '.bc-m275-policy label{display:flex;align-items:center;gap:8px;margin:0;text-transform:none;font-size:12px;color:var(--text);cursor:pointer}',
      '.bc-m275-policy input{width:16px;height:16px;accent-color:var(--gold);margin:0}',
      '.bc-m275-badge{font-size:10px;color:var(--mist);white-space:nowrap}',
      '.bc-m275-price-type{font-size:10px;color:var(--mist);margin-top:2px}'
    ].join('');document.head.appendChild(s);
  }
  function ensureControl(){
    const host=document.getElementById('venta-modo-catalogo')||document.getElementById('venta-operativa-bloque');
    if(!host)return;
    if(document.getElementById('bc-m275-policy'))return;
    const wrap=document.createElement('div');wrap.id='bc-m275-policy';wrap.className='bc-m275-policy';
    wrap.innerHTML='<label><input id="bc-m275-alt" type="checkbox"> Mostrar también precios alternativos</label><span id="bc-m275-badge" class="bc-m275-badge"></span>';
    host.insertBefore(wrap,host.firstChild);
    const cb=document.getElementById('bc-m275-alt');
    if(cb){cb.checked=allowAlt;cb.addEventListener('change',()=>{allowAlt=cb.checked;try{localStorage.setItem(LS,allowAlt?'1':'0');}catch(e){};render();});}
  }
  function updateLabel(){
    const b=document.getElementById('bc-m275-badge');
    const t=getWarehouseType();
    if(!b)return;
    if(t==='mayorista') b.textContent='Almacén mayorista';
    else if(t==='minorista') b.textContent='Almacén minorista';
    else if(t==='almacenamiento') b.textContent='Almacén de almacenamiento';
    else b.textContent='';
  }
  function visibleProducts(){
    const t=getWarehouseType();
    return getProducts().filter(p=>{
      if(!p||p.activo===false)return false;
      if(!t||t==='almacenamiento')return true;
      if(!channelAvailable(p,t))return false;
      return hasBase(p,t)||(allowAlt&&hasAlt(p,t));
    });
  }
  function emptyCatalogMessage(allActive,listLen){
    if(!allActive.length){
      return '<p class="lista-estado">Cargando productos…</p>';
    }
    if(!listLen){
      return '<p class="lista-estado">No hay productos compatibles con este tipo de almacén.</p>';
    }
    return '<p class="lista-estado">No hay productos activos para mostrar en esta categoría.</p>';
  }
  function patchGrid(){
    if(typeof renderCatalogoGrid!=='function'||renderCatalogoGrid.__bcM275)return;
    const orig=renderCatalogoGrid;
    window.renderCatalogoGrid=function(){
      ensureControl();updateLabel();
      const grid=document.getElementById('catalogo-grid');if(!grid)return orig.apply(this,arguments);
      const t=getWarehouseType();
      let cat='';try{cat=String(catalogoCategoriaActiva||'');}catch(e){}
      const allActive=getProducts().filter(p=>p&&p.activo!==false);
      const list=visibleProducts().filter(p=>!cat||String(p.categoria_id)===cat);
      if(!list.length){
        grid.innerHTML=emptyCatalogMessage(allActive,0);
        return;
      }
      grid.innerHTML='';
      list.forEach(p=>{
        const price=priceFor(p,t);const ptype=typeFor(p,t);let stockTxt=null;
        try{if(getWarehouseId()&&typeof obtenerStockDisponible==='function')stockTxt=Number(obtenerStockDisponible(p.id,getWarehouseId()).valor||0);}catch(e){}
        const card=document.createElement('button');card.type='button';card.className='catalogo-card';card.dataset.productoId=p.id;
        const img=p.imagen_url?'<img src="'+(typeof escHtml==='function'?escHtml(p.imagen_url):p.imagen_url)+'" alt="" class="catalogo-card-img" loading="lazy">':'<span class="catalogo-card-img catalogo-card-img-vacia" aria-hidden="true"></span>';
        card.innerHTML=img+'<span class="catalogo-card-nombre">'+(typeof escHtml==='function'?escHtml(p.nombre):p.nombre)+'</span><span class="catalogo-card-precio">'+(price==null?'Sin precio':'$'+(typeof money==='function'?money(price):Number(price).toFixed(2)))+'</span><span class="bc-m275-price-type">'+(ptype==='mayorista'?'Precio mayorista':'Precio minorista')+(stockTxt!==null?' · Stock: '+(typeof money==='function'?money(stockTxt):stockTxt):'')+'</span>';
        grid.appendChild(card);
      });
    };
    window.renderCatalogoGrid.__bcM275=true;
  }
  function patchAdd(){
    if(typeof agregarLineaVenta!=='function'||agregarLineaVenta.__bcM275)return;
    const orig=agregarLineaVenta;
    window.agregarLineaVenta=function(pid,cantidad,almacen){
      const t=getWarehouseType();const p=getProducts().find(x=>String(x.id)===String(pid));if(!p)return false;
      if(isSellType(t)&&!channelAvailable(p,t)){
        if(typeof setMsg==='function')setMsg('msg-venta-linea',presentationChannelsLoaded
          ?(t==='mayorista'?'Este producto no tiene presentación mayorista y no puede venderse desde un almacén mayorista.':'Este producto no tiene presentación minorista y no puede venderse desde un almacén minorista.')
          :'No se pudo verificar la presentación del producto. Actualiza el catálogo e inténtalo de nuevo.',false);
        return false;
      }
      const effectiveType=typeFor(p,t);
      const isAltOnly=allowAlt&&t&&((t==='mayorista'&&p.precio_mayorista==null&&p.precio_normal!=null)||(t==='minorista'&&p.precio_normal==null&&p.precio_mayorista!=null));
      if(isAltOnly){
        const price=priceFor(p,t);const lines=ventaLineas;if(!Array.isArray(lines))return orig.apply(this,arguments);
        const presentation=typeof window.__BC_M275_getProductPresentation==='function'?window.__BC_M275_getProductPresentation(pid,t):null;
        const factor=presentation?Number(presentation.factor):0;
        if(!presentation||!(factor>0)){
          if(typeof setMsg==='function')setMsg('msg-venta-linea','No se puede vender: falta una presentación válida para este almacén.',false);
          return false;
        }
        const baseQuantity=Number(cantidad)*factor;
        const stock=typeof obtenerStockDisponible==='function'?obtenerStockDisponible(pid,almacen):{valor:Infinity};
        const existing=lines.find(l=>String(l.producto_id)===String(pid));const current=existing?Number(existing.cantidad)||0:0;
        if(current+baseQuantity>Number(stock.valor)){if(typeof setMsg==='function')setMsg('msg-venta-linea','No hay suficiente stock de '+p.nombre+' (disponible: '+money(Number(stock.valor)||0)+').',false);return false;}
        var line;
        if(existing){existing.cantidad=current+baseQuantity;existing.precio_unitario=price;existing.subtotal=existing.cantidad*price;existing.tipo_precio=effectiveType;line=existing;}
        else {line={producto_id:p.id,nombre:p.nombre,cantidad:baseQuantity,precio_unitario:price,subtotal:baseQuantity*price,tipo_precio:effectiveType};lines.push(line);}
        if(typeof window.__BC_M276_attachLinePresentation==='function')window.__BC_M276_attachLinePresentation(pid,line);
        else {line.presentacion_id=presentation.presentacion_id;line.factor_presentacion=factor;line.presentacion_nombre=presentation.nombre;line.cantidad_presentacion=baseQuantity/factor;}
        if(typeof renderVentaLineas==='function')renderVentaLineas();return true;
      }
      return orig.apply(this,arguments);
    };
    window.agregarLineaVenta.__bcM275=true;
  }
  function patchOperation(){
    if(typeof ejecutarOperacion!=='function'||ejecutarOperacion.__bcM275)return;
    const orig=ejecutarOperacion;
    window.ejecutarOperacion=async function(tipo,params){
      if(tipo==='venta'){
        params=params||{};const t=getWarehouseType();params.p_tipo_precio=t==='mayorista'?'mayorista':'normal';
        if(ventaLineas.some(l=>l.tipo_precio==='normal'&&t==='mayorista'))params.p_tipo_precio='mayorista';
        if(ventaLineas.some(l=>l.tipo_precio==='mayorista'&&t!=='mayorista'))params.p_tipo_precio='normal';
        params.p_lineas=(params.p_lineas||[]).map((l,i)=>{const src=ventaLineas[i];return src&&src.tipo_precio?Object.assign({},l,{tipo_precio:src.tipo_precio}):l;});
      }
      return orig.apply(this,arguments);
    };
    window.ejecutarOperacion.__bcM275=true;
  }
  function patchAlmacenChange(){
    const s=document.getElementById('venta-almacen');
    if(!s||s.dataset.bcM275==='1')return;
    s.dataset.bcM275='1';
    s.addEventListener('change',function(){
      try{
        if(typeof ventaAlmacenesTipo!=='undefined'&&s.value){
          const a=(_cache&&_cache.almacenes||[]).find(x=>String(x.id)===String(s.value));
          if(a&&a.tipo) ventaAlmacenesTipo[s.value]=normalizeType(a.tipo);
        }
      }catch(e){}
      render();
    });
  }
  function render(){
    ensureControl();updateLabel();
    const grid=document.getElementById('catalogo-grid');
    if(isSellType(getWarehouseType())&&!presentationChannelsLoaded&&grid){
      grid.innerHTML='<p class="lista-estado">'+(window.__BC_M275_PRESENTATION_CHANNEL_ERROR
        ?'No se pudo verificar la compatibilidad de presentaciones. Revisa la conexión y vuelve a intentar.'
        :'Verificando presentaciones compatibles con este almacén…')+'</p>';
      return;
    }
    if(typeof renderCatalogoGrid==='function')try{renderCatalogoGrid();}catch(e){}
  }
  // API para que otros módulos invaliden el catálogo sin reload.
  window.__BC_M275_refreshCatalog=function(){try{render();}catch(e){}};
  window.__BC_M275_reloadPresentationChannels=async function(){const ok=await refreshPresentationChannels();render();return ok;};
  window.__BC_M275_productChannelAllowed=function(productId,type){
    const product=getProducts().find(function(p){return String(p.id)===String(productId);});
    return channelAvailable(product,normalizeType(type));
  };
  window.__BC_M275_getProductPresentation=function(productId,type){
    const product=getProducts().find(function(p){return String(p.id)===String(productId);});
    const channel=normalizeType(type);
    if(!channelAvailable(product,channel))return null;
    const entry=presentationChannels[String(productId)];
    return entry?entry[channel]:null;
  };
  function boot(){
    injectStyles();
    try{allowAlt=localStorage.getItem(LS)==='1';}catch(e){allowAlt=false;}
    ensureControl();patchGrid();patchAdd();patchOperation();patchAlmacenChange();patchRefreshVentas();render();
    setTimeout(async function(){patchRefreshVentas();await refreshPresentationChannels();render();if(typeof window.__BC_M276_updatePresentationHint==='function')window.__BC_M276_updatePresentationHint();},900);
    window.addEventListener('online',async function(){await refreshPresentationChannels();render();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,700));else setTimeout(boot,700);
})();
