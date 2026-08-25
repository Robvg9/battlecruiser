// BattleCruiser M27.5 — Política de precio por almacén + opción de precio alternativo
(function(){
  'use strict';
  if(window.__BC_M275__) return;
  window.__BC_M275__=true;

  const LS='bc-ventas-precio-alternativo-v1';
  let allowAlt=false;

  function getWarehouseId(){ const s=document.getElementById('venta-almacen'); return s?s.value:''; }
  function getWarehouseType(){ const id=getWarehouseId(); try{return (typeof ventaAlmacenesTipo!=='undefined'&&id)?ventaAlmacenesTipo[id]:null;}catch(e){return null;} }
  function getProducts(){ try{return Array.isArray(ventaProductosLista)?ventaProductosLista:[];}catch(e){return [];} }
  function hasBase(p,t){ return t==='mayorista' ? p.precio_mayorista!=null : p.precio_normal!=null; }
  function hasAlt(p,t){ return t==='mayorista' ? p.precio_normal!=null : p.precio_mayorista!=null; }
  function priceFor(p,t){ if(t==='mayorista') return p.precio_mayorista!=null?p.precio_mayorista:p.precio_normal; return p.precio_normal!=null?p.precio_normal:p.precio_mayorista; }
  function typeFor(p,t){ if(t==='mayorista') return p.precio_mayorista!=null?'mayorista':'normal'; return p.precio_normal!=null?'normal':'mayorista'; }

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
  function updateLabel(){const b=document.getElementById('bc-m275-badge');const t=getWarehouseType();if(b)b.textContent=t==='mayorista'?'Almacén mayorista':(t==='venta'?'Almacén minorista':'');}
  function visibleProducts(){
    const t=getWarehouseType();
    return getProducts().filter(p=>{if(!p||p.activo===false)return false;if(!t)return true;return hasBase(p,t)||(allowAlt&&hasAlt(p,t));});
  }
  function patchGrid(){
    if(typeof renderCatalogoGrid!=='function'||renderCatalogoGrid.__bcM275)return;
    const orig=renderCatalogoGrid;
    window.renderCatalogoGrid=function(){
      ensureControl();updateLabel();
      const grid=document.getElementById('catalogo-grid');if(!grid)return orig.apply(this,arguments);
      const t=getWarehouseType();let cat='';try{cat=String(catalogoCategoriaActiva||'');}catch(e){}
      const list=visibleProducts().filter(p=>!cat||String(p.categoria_id)===cat);
      if(!list.length){grid.innerHTML='<p class="lista-estado">No hay productos compatibles con este tipo de almacén.</p>';return;}
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
      const effectiveType=typeFor(p,t);
      const isAltOnly=allowAlt&&t&&((t==='mayorista'&&p.precio_mayorista==null&&p.precio_normal!=null)||(t!=='mayorista'&&p.precio_normal==null&&p.precio_mayorista!=null));
      if(isAltOnly){
        const price=priceFor(p,t);const lines=ventaLineas;if(!Array.isArray(lines))return orig.apply(this,arguments);
        const stock=typeof obtenerStockDisponible==='function'?obtenerStockDisponible(pid,almacen):{valor:Infinity};
        const existing=lines.find(l=>String(l.producto_id)===String(pid));const current=existing?Number(existing.cantidad)||0:0;
        if(current+cantidad>Number(stock.valor)){if(typeof setMsg==='function')setMsg('msg-venta-linea','No hay suficiente stock de '+p.nombre+' (disponible: '+money(Number(stock.valor)||0)+').',false);return false;}
        if(existing){existing.cantidad=current+cantidad;existing.precio_unitario=price;existing.subtotal=existing.cantidad*price;existing.tipo_precio=effectiveType;}
        else lines.push({producto_id:p.id,nombre:p.nombre,cantidad:cantidad,precio_unitario:price,subtotal:cantidad*price,tipo_precio:effectiveType});
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
  function patchAlmacenChange(){const s=document.getElementById('venta-almacen');if(!s||s.dataset.bcM275==='1')return;s.dataset.bcM275='1';s.addEventListener('change',render);}
  function render(){ensureControl();updateLabel();if(typeof renderCatalogoGrid==='function')try{renderCatalogoGrid();}catch(e){}}
  function boot(){injectStyles();try{allowAlt=localStorage.getItem(LS)==='1';}catch(e){allowAlt=false;}ensureControl();patchGrid();patchAdd();patchOperation();patchAlmacenChange();render();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,700));else setTimeout(boot,700);
})();
