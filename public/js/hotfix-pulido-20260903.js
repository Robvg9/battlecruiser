// BattleCruiser — Pulido operativo 2026-09-03
(function(){
  'use strict';
  if(window.__BC_PULIDO_20260903__) return;
  window.__BC_PULIDO_20260903__ = true;

  var PRES_CACHE = [];
  var STOCK_MAP = Object.create(null);
  var STOCK_READY = false;
  var STOCK_LOADING = false;

  function norm(v){return String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  function msg(t,ok){if(typeof window.setMsg==='function') window.setMsg('msg-productos',t,ok); else {var e=document.getElementById('msg-productos');if(e)e.textContent=t;}}
  function key(prod,alm){return String(prod||'')+'::'+String(alm||'')}
  function getAlmList(){
    var a=Array.isArray(window._cache&&_cache.almacenes)?_cache.almacenes:[];
    return a.filter(function(x){return x&&x.activo!==false;});
  }
  function activeProducts(){return Array.isArray(window._cache&&_cache.productos)?_cache.productos.filter(function(p){return p&&p.activo!==false;}):[];}

  function css(){
    if(document.getElementById('bc-pulido-css')) return;
    var s=document.createElement('style');s.id='bc-pulido-css';
    s.textContent=''
      +'.bc-pulido-tools{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 14px}'
      +'.bc-pulido-tool{padding:12px;border:1px solid rgba(212,176,92,.16);border-radius:10px;background:rgba(8,20,17,.42)}'
      +'.bc-pulido-tool h4{margin:0 0 5px;color:var(--gold-bright);font-size:12px}'
      +'.bc-pulido-tool p{margin:0;color:var(--mist);font-size:11.5px;line-height:1.45}'
      +'.bc-pulido-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}'
      +'.bc-pulido-actions button{min-height:38px}'
      +'.bc-pres-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}'
      +'.bc-pres-box{padding:12px;border:1px solid rgba(212,176,92,.15);border-radius:10px;background:rgba(8,20,17,.34)}'
      +'.bc-pres-box h4{margin:0 0 8px;color:var(--gold-bright);font-size:12px}'
      +'.bc-pres-box .field{margin:0 0 8px}'
      +'.bc-pres-meta{font-size:11px;color:var(--mist);margin-top:5px;line-height:1.35}'
      +'.bc-pres-custom{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:8px;margin-top:8px}'
      +'.bc-product-save-status{grid-column:1/-1;min-height:18px;font-size:12px}'
      +'.bc-catalog-pres-panel{margin-top:14px}'
      +'.bc-catalog-pres-toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}'
      +'.bc-catalog-pres-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}'
      +'.bc-catalog-pres-card{padding:10px;border:1px solid rgba(212,176,92,.12);border-radius:8px;background:rgba(255,255,255,.02)}'
      +'.bc-catalog-pres-card strong{display:block;font-size:12px;color:var(--text);margin-bottom:4px}'
      +'.bc-catalog-pres-card span{font-size:11px;color:var(--mist)}'
      +'.bc-pulido-help-overlay,.bc-pulido-import-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(4,12,10,.84)}'
      +'.bc-pulido-help-overlay{z-index:18000}.bc-pulido-import-overlay{z-index:17000}'
      +'.bc-pulido-dialog{width:min(760px,100%);max-height:calc(100vh - 36px);overflow:auto;background:var(--stone);border:1px solid rgba(212,176,92,.3);border-radius:12px;padding:18px;box-shadow:0 28px 80px rgba(0,0,0,.62)}'
      +'.bc-pulido-dialog h3{margin:0;color:var(--gold);font-size:18px}.bc-pulido-dialog p{font-size:12px;line-height:1.55;color:var(--mist)}'
      +'.bc-pulido-help-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}'
      +'.bc-pulido-help-card{padding:10px;border:1px solid rgba(212,176,92,.12);border-radius:8px;background:rgba(8,20,17,.38)}'
      +'.bc-pulido-help-card strong{display:block;color:var(--gold-bright);font-size:12px;margin-bottom:4px}.bc-pulido-help-card p{margin:0}'
      +'.bc-pulido-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}'
      +'.bc-pulido-dialog-actions button{min-height:38px}'
      +'.bc-pulido-import-error{color:#e88a96!important}.bc-pulido-import-ok{color:var(--sage)!important}.bc-pulido-import-warn{color:var(--gold-bright)!important}'
      +'#bc-pulido-stock-status{font-size:11px;color:var(--mist);margin:5px 0 10px}'
      +'#tab-productos .presentaciones-panel{display:block!important;visibility:visible!important;max-height:none!important;overflow:visible!important}'
      +'#tab-productos .bc171-native-hidden{display:none!important}'
      +'#tab-productos #prod-cancelar-edicion{display:none!important}'
      +'#tab-productos .bc-pres-grid input,#tab-productos .bc-pres-grid select{width:100%}'
      +'#tab-productos #form-producto.bc-pulido-form{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px 14px!important;align-items:end!important}'
      +'#tab-productos #form-producto.bc-pulido-form .prod-imagen-campo{grid-column:1/-1}'
      +'#tab-transferencias{display:none!important}'
      +'#tabs [data-tab=transferencias]{display:none!important}'
      +'#tabs [data-tab=config]{display:flex!important;visibility:visible!important;opacity:1!important}'
      +'#tab-config{visibility:visible!important}'
      +'#tab-ventas .bc-pulido-product-card{cursor:pointer}'
      +'#tab-ventas .bc-pulido-product-card:focus{outline:2px solid var(--gold);outline-offset:2px}'
      +'#tab-comunicacion .bc-pulido-empty-chat{display:none!important}'
      +'@media(max-width:700px){.bc-pulido-tools,.bc-pres-grid,.bc-pulido-help-grid,#tab-productos #form-producto.bc-pulido-form{grid-template-columns:1fr!important}.bc-pres-custom{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }

  async function preloadStock(force){
    if(STOCK_LOADING && !force) return;
    if(STOCK_READY && !force) return;
    if(typeof window.client==='undefined'||!client||typeof client.rpc!=='function') return;
    STOCK_LOADING=true;
    try{
      var r=await client.rpc('bc_stock_operativo');
      if(r.error) throw r.error;
      STOCK_MAP=Object.create(null);
      (Array.isArray(r.data)?r.data:[]).forEach(function(row){STOCK_MAP[key(row.producto_id,row.almacen_id)]=Number(row.cantidad)||0;});
      window.__BC_STOCK_MAP=STOCK_MAP;STOCK_READY=true;
      if(window._cache){
        _cache.stock=Array.isArray(r.data)?r.data:[];
        _cache.stockPorProductoAlmacen=STOCK_MAP;
      }
      var status=document.getElementById('bc-pulido-stock-status');
      if(status)status.textContent='Stock operativo cargado automáticamente.';
      repaintStockCards();
    }catch(e){
      var st=document.getElementById('bc-pulido-stock-status');if(st)st.textContent='Stock operativo no disponible todavía.';
    }finally{STOCK_LOADING=false;}
  }
  function currentAlmId(){
    try{if(typeof bcSincronizarSelectAlmacenTurno==='function'){var x=bcSincronizarSelectAlmacenTurno();if(x)return x;}}catch(_){ }
    var el=document.getElementById('venta-almacen');return el&&el.value?el.value:null;
  }
  function stockFor(prod,alm){
    var v=STOCK_MAP[key(prod,alm)];
    if(v==null && Array.isArray(window._cache&&_cache.stock)){
      var hit=_cache.stock.find(function(x){return String(x.producto_id)===String(prod)&&String(x.almacen_id)===String(alm);});if(hit)v=Number(hit.cantidad)||0;
    }
    return v==null?0:Number(v);
  }
  function patchStockGetter(){
    if(typeof window.obtenerStockDisponible!=='function'||window.obtenerStockDisponible.__bcPulido)return;
    var orig=window.obtenerStockDisponible;
    window.obtenerStockDisponible=function(producto_id,almacen_id){
      var v=stockFor(producto_id,almacen_id||currentAlmId());
      if(STOCK_READY) return {valor:v,origen:'bc_stock_operativo'};
      try{return orig.apply(this,arguments);}catch(_){return {valor:0,origen:'fallback'};}
    };
    window.obtenerStockDisponible.__bcPulido=true;
    window.obtenerStockDisponible.__bcPulidoOrig=orig;
  }
  function repaintStockCards(){
    var alm=currentAlmId();
    if(!alm)return;
    document.querySelectorAll('#catalogo-grid .catalogo-card').forEach(function(card){
      var pid=card.dataset.productoId||card.dataset.productId||card.getAttribute('data-id')||'';
      if(!pid){
        var b=card.querySelector('[data-producto-id],[data-product-id],[data-id]');
        if(b)pid=b.dataset.productoId||b.dataset.productId||b.dataset.id||'';
      }
      if(!pid)return;
      card.classList.add('bc-pulido-product-card');
      var n=stockFor(pid,alm);
      var el=card.querySelector('.catalogo-card-stock');
      var stockLabel='Stock: '+n;
      if(el){if(el.textContent!==stockLabel)el.textContent=stockLabel;}
      else{var p=document.createElement('div');p.className='catalogo-card-stock';p.textContent=stockLabel;card.appendChild(p);}
    });
  }
  function bindCatalogClicks(){
    if(document.documentElement.dataset.bcPulidoClicks==='1')return;
    document.documentElement.dataset.bcPulidoClicks='1';
    document.addEventListener('click',function(e){
      var card=e.target.closest&&e.target.closest('#catalogo-grid .catalogo-card');
      if(!card)return;
      if(e.target.closest('button,input,select,a'))return;
      var pid=card.dataset.productoId||card.dataset.productId||card.dataset.id||'';
      if(!pid){var d=card.querySelector('[data-producto-id],[data-product-id],[data-id]');if(d)pid=d.dataset.productoId||d.dataset.productId||d.dataset.id||'';}
      if(!pid){
        var text=norm(card.textContent||'');
        var p=activeProducts().find(function(x){return text.indexOf(norm(x.nombre))!==-1;});if(p)pid=p.id;
      }
      if(!pid)return;
      var alm=currentAlmId();
      if(!alm){if(typeof setMsg==='function')setMsg('msg-venta-linea','No hay un almacén de venta activo.',false);return;}
      try{
        if(typeof window.agregarLineaVenta==='function'){
          var ok=window.agregarLineaVenta(pid,1,alm,{fromCatalogo:true});
          if(ok!==false){e.preventDefault();e.stopPropagation();}
        }
      }catch(err){if(typeof setMsg==='function')setMsg('msg-venta-linea',err&&err.message||'No se pudo agregar el producto.',false);}
    },true);
  }

  function fillWarehouseSelects(){
    var list=getAlmList();
    ['trf-origen','trf-destino','compra-almacen','vale-almacen','turno-almacen-abrir'].forEach(function(id){
      var sel=document.getElementById(id);if(!sel)return;
      var old=sel.value;
      if(!list.length)return;
      var first=sel.querySelector('option[value=""]');
      var html=first?'<option value="">'+esc(first.textContent||'Elegí un almacén…')+'</option>':'';
      list.forEach(function(a){html+='<option value="'+esc(a.id)+'">'+esc(a.nombre)+(a.tipo?' · '+esc(a.tipo):'')+'</option>';});
      sel.innerHTML=html;
      if(old&&list.some(function(a){return String(a.id)===String(old);}))sel.value=old;
    });
  }
  async function ensureWarehouses(){
    fillWarehouseSelects();
    if(getAlmList().length||typeof window.client==='undefined'||!client||!client.from)return;
    try{var r=await client.from('almacenes').select('id,nombre,tipo,activo').eq('activo',true).order('nombre');if(!r.error){if(window._cache)_cache.almacenes=r.data||[];fillWarehouseSelects();}}catch(_){ }
  }

  function loadPresentaciones(){
    var list=Array.isArray(window._presentacionesCache)?window._presentacionesCache:[];
    if(list.length)PRES_CACHE=list.slice();
    if(PRES_CACHE.length)return Promise.resolve(PRES_CACHE);
    if(typeof window.client==='undefined'||!client||!client.from)return Promise.resolve(PRES_CACHE);
    return client.from('presentaciones').select('id,nombre,activo,created_at').eq('activo',true).order('nombre').then(function(r){if(!r.error&&Array.isArray(r.data)){PRES_CACHE=r.data.slice();window._presentacionesCache=PRES_CACHE.slice();}return PRES_CACHE;}).catch(function(){return PRES_CACHE;});
  }
  function ensurePresFields(){
    var form=document.getElementById('form-producto');if(!form)return false;
    form.classList.add('bc-pulido-form');
    if(document.getElementById('bc-product-commercial-fields'))return true;
    var box=document.createElement('div');box.id='bc-product-commercial-fields';box.className='bc-pres-grid';box.innerHTML=
      '<div class="bc-pres-box"><h4>Presentación normal</h4><div class="field"><label for="bc-pres-normal">Presentación</label><select id="bc-pres-normal"><option value="">Sin presentación</option></select></div><div id="bc-pres-normal-custom" class="bc-pres-custom hidden"><input id="bc-pres-normal-custom-name" placeholder="Ej. Paquete x 7"><input id="bc-pres-normal-custom-factor" type="number" step="0.0001" min="0.0001" placeholder="Unidades base"></div><div class="bc-pres-meta">Ej.: Unidad = 1. Se usa para la venta normal.</div></div>'+
      '<div class="bc-pres-box"><h4>Presentación mayorista</h4><div class="field"><label for="bc-pres-wholesale">Presentación</label><select id="bc-pres-wholesale"><option value="">Sin presentación</option></select></div><div id="bc-pres-wholesale-custom" class="bc-pres-custom hidden"><input id="bc-pres-wholesale-custom-name" placeholder="Ej. Paquete x 7"><input id="bc-pres-wholesale-custom-factor" type="number" step="0.0001" min="0.0001" placeholder="7 unidades base"></div><div class="bc-pres-meta">Ej.: Paquete x 7 + factor 7 = cada venta descuenta 7 unidades base.</div></div>';
    var submit=form.querySelector('#prod-submit-btn');
    var host=submit&&submit.parentNode===form?submit.parentNode:null;
    if(host)form.insertBefore(box,host.querySelector('.prod-imagen-campo')||submit); else form.appendChild(box);
    ['bc-pres-normal','bc-pres-wholesale'].forEach(function(id){var s=document.getElementById(id);if(!s)return;s.addEventListener('change',function(){var custom=document.getElementById(id==='bc-pres-normal'?'bc-pres-normal-custom':'bc-pres-wholesale-custom');if(custom)custom.classList.toggle('hidden',s.value!=='__otro__');});});
    loadPresentaciones().then(function(list){fillPresSelect('bc-pres-normal',list);fillPresSelect('bc-pres-wholesale',list);});
    return true;
  }
  function fillPresSelect(id,list){var s=document.getElementById(id);if(!s)return;var old=s.value;var html='<option value="">Sin presentación</option>';list.forEach(function(p){html+='<option value="'+esc(p.id)+'">'+esc(p.nombre)+'</option>';});html+='<option value="__otro__">Otro…</option>';s.innerHTML=html;if(old&&Array.from(s.options).some(function(o){return o.value===old;}))s.value=old;}
  function selectedPres(which){
    var isW=which==='wholesale',sel=document.getElementById(isW?'bc-pres-wholesale':'bc-pres-normal');
    if(!sel||!sel.value)return{name:null,factor:null,id:null};
    if(sel.value==='__otro__'){
      var name=document.getElementById(isW?'bc-pres-wholesale-custom-name':'bc-pres-normal-custom-name')?.value?.trim()||'';
      var fac=Number(document.getElementById(isW?'bc-pres-wholesale-custom-factor':'bc-pres-normal-custom-factor')?.value);
      return{name:name||null,factor:fac>0?fac:null,id:null};
    }
    var hit=PRES_CACHE.find(function(p){return String(p.id)===String(sel.value);});
    return{name:hit?hit.nombre:null,factor:null,id:sel.value};
  }
  async function loadProductPres(productId){
    if(!productId||typeof window.client==='undefined'||!client||!client.from)return[];
    try{var r=await client.from('producto_presentaciones').select('id,presentacion_id,factor,activo,presentaciones(id,nombre)').eq('producto_id',productId).eq('activo',true).order('created_at');if(!r.error&&Array.isArray(r.data))return r.data;}
    catch(_){ }
    return[];
  }
  async function hydrateEditPres(productId){
    ensurePresFields();await loadPresentaciones();fillPresSelect('bc-pres-normal',PRES_CACHE);fillPresSelect('bc-pres-wholesale',PRES_CACHE);
    var rows=await loadProductPres(productId);if(!rows.length)return;
    var normal=rows.find(function(r){return Number(r.factor)===1;})||rows[0];
    var wholesale=null;
    try{var prod=activeProducts().find(function(p){return String(p.id)===String(productId);});if(prod&&prod.presentacion_id)wholesale=rows.find(function(r){return String(r.presentacion_id)===String(prod.presentacion_id);})||null;}catch(_){ }
    if(!wholesale&&rows.length>1)wholesale=rows[rows.length-1];
    function setRow(selId,customId,row){var s=document.getElementById(selId);if(!s||!row)return;var pid=row.presentacion_id;if(PRES_CACHE.some(function(p){return String(p.id)===String(pid);}))s.value=pid;else{s.value='__otro__';} if(s.value==='__otro__'){var ov=document.getElementById(customId);if(ov)ov.classList.remove('hidden');var nm=document.getElementById(customId==='bc-pres-normal-custom'?'bc-pres-normal-custom-name':'bc-pres-wholesale-custom-name');var fc=document.getElementById(customId==='bc-pres-normal-custom'?'bc-pres-normal-custom-factor':'bc-pres-wholesale-custom-factor');if(nm)nm.value=row.presentaciones?.nombre||'';if(fc)fc.value=row.factor||'';}}
    setRow('bc-pres-normal','bc-pres-normal-custom',normal);if(wholesale) setRow('bc-pres-wholesale','bc-pres-wholesale-custom',wholesale);
  }
  function patchEditBridge(){
    if(typeof window.iniciarEdicionProducto==='function'&&window.iniciarEdicionProducto.__bcPulido)return;
    var orig=window.iniciarEdicionProducto;
    window.iniciarEdicionProducto=function(p){
      if(!p){return;}
      var set=function(id,v){var e=document.getElementById(id);if(e)e.value=v==null?'':String(v);};
      set('prod-editando-id',p.id);set('prod-nombre',p.nombre);set('prod-categoria',p.categoria_id);set('prod-unidad',p.unidad);set('prod-precio-normal',p.precio_normal);set('prod-precio-mayorista',p.precio_mayorista);
      ensurePresFields();window.__BC171_open&&window.__BC171_open();hydrateEditPres(p.id);
      var title=document.querySelector('#bc171-overlay .bc171-head h3');if(title)title.textContent='Editar producto';
      var save=document.getElementById('bc171-save');if(save)save.textContent='Guardar cambios';
      return true;
    };
    window.iniciarEdicionProducto.__bcPulido=true;window.iniciarEdicionProducto.__bcPulidoOrig=orig;
  }
  function discoverEditButtons(){
    document.querySelectorAll('#lista-productos button').forEach(function(b){
      if(!/editar/i.test(b.textContent||''))return;
      if(b.dataset.bcPulidoEdit==='1')return;
      b.dataset.bcPulidoEdit='1';
      b.addEventListener('click',function(e){
        var item=b.closest('.lista-item,[data-producto-id],[data-product-id]');
        var pid=b.dataset.productoId||b.dataset.productId||b.dataset.id||item?.dataset?.productoId||item?.dataset?.productId||item?.dataset?.id||'';
        if(!pid&&item){var t=norm(item.textContent||'');var p=activeProducts().find(function(x){return t.indexOf(norm(x.nombre))!==-1;});if(p)pid=p.id;}
        var p=activeProducts().find(function(x){return String(x.id)===String(pid);});
        if(p&&typeof window.iniciarEdicionProducto==='function'){e.preventDefault();e.stopImmediatePropagation();window.iniciarEdicionProducto(p);}
      },true);
    });
  }
  async function saveCatalogoProduct(e){
    if(!document.getElementById('bc171-overlay'))return false;
    e.preventDefault();e.stopImmediatePropagation();
    var id=document.getElementById('prod-editando-id')?.value||null;
    var nombre=document.getElementById('prod-nombre')?.value?.trim()||'';
    if(!nombre){msg('El nombre del producto es requerido.',false);return true;}
    var save=document.getElementById('bc171-save');if(save)save.disabled=true;
    var pnRaw=document.getElementById('prod-precio-normal')?.value??'';var pmRaw=document.getElementById('prod-precio-mayorista')?.value??'';
    var pn=String(pnRaw).trim()===''?null:Number(pnRaw);var pm=String(pmRaw).trim()===''?null:Number(pmRaw);
    if((pn!==null&&!Number.isFinite(pn))||(pm!==null&&!Number.isFinite(pm))){msg('Los precios deben ser números válidos.',false);if(save)save.disabled=false;return true;}
    var normal=selectedPres('normal'), wholesale=selectedPres('wholesale');
    if((normal.name&&!normal.factor&&normal.id==null)||(wholesale.name&&!wholesale.factor&&wholesale.id==null)){msg('Una presentación nueva necesita definir cuántas unidades base contiene.',false);if(save)save.disabled=false;return true;}
    if((normal.id&&!normal.factor)){
      var hitN=PRES_CACHE.find(function(p){return String(p.id)===String(normal.id);});normal.name=hitN?.nombre||null;normal.factor=null;
      try{var rn=await client.from('producto_presentaciones').select('factor').eq('producto_id',id||'00000000-0000-0000-0000-000000000000').eq('presentacion_id',normal.id).limit(1);if(rn.data?.[0])normal.factor=Number(rn.data[0].factor)||1;}catch(_){normal.factor=1;}
    }
    if((wholesale.id&&!wholesale.factor)){
      var hitW=PRES_CACHE.find(function(p){return String(p.id)===String(wholesale.id);});wholesale.name=hitW?.nombre||null;
      try{var rw=await client.from('producto_presentaciones').select('factor').eq('producto_id',id||'00000000-0000-0000-0000-000000000000').eq('presentacion_id',wholesale.id).limit(1);if(rw.data?.[0])wholesale.factor=Number(rw.data[0].factor)||1;}catch(_){wholesale.factor=1;}
    }
    try{
      if(!navigator.onLine&&typeof window.ejecutarOperacion==='function'){
        var q=await window.ejecutarOperacion(id?'producto_actualizar':'producto',{...(id?{p_producto_id:id}:{}),p_nombre:nombre,p_categoria_id:document.getElementById('prod-categoria')?.value||null,p_unidad:document.getElementById('prod-unidad')?.value?.trim()||null,p_precio_normal:pn,p_precio_mayorista:pm});
        if(q?.ok){msg('✓ Producto guardado localmente. Las asociaciones comerciales se completarán al sincronizar.',true);window.__BC171_close&&window.__BC171_close();}else msg('No se pudo guardar offline.',false);
        return true;
      }
      if(typeof window.client==='undefined'||!client||!client.rpc)throw Error('No hay conexión con el backend.');
      var params={p_producto_id:id||null,p_nombre:nombre,p_categoria_id:document.getElementById('prod-categoria')?.value||null,p_unidad:document.getElementById('prod-unidad')?.value?.trim()||null,p_precio_normal:pn,p_precio_mayorista:pm,p_presentacion_normal:normal.name,p_factor_normal:normal.factor,p_presentacion_mayorista:wholesale.name,p_factor_mayorista:wholesale.factor,p_idempotency_key:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random())};
      var r=await client.rpc('bc_guardar_producto_catalogo',params);
      if(r.error)throw r.error;
      if(typeof window.refrescarProductos==='function')await window.refrescarProductos();
      await loadPresentaciones();
      msg(id?'✓ Producto actualizado.':'✓ Producto creado.',true);
      window.__BC171_close&&window.__BC171_close();
    }catch(err){msg((err&&err.message)||'No se pudo guardar el producto.',false);}finally{if(save)save.disabled=false;}
    return true;
  }

  function patchProductSubmit(){
    ensurePresFields();
    var form=document.getElementById('form-producto');if(!form||form.dataset.bcPulidoSubmit==='1')return false;
    form.dataset.bcPulidoSubmit='1';form.addEventListener('submit',saveCatalogoProduct,true);return true;
  }

  function productModalPolish(){
    var ov=document.getElementById('bc171-overlay');if(!ov)return;
    var title=ov.querySelector('.bc171-head h3');if(title){title.textContent=document.getElementById('prod-editando-id')?.value?'Editar producto':'Registrar nuevo producto';}
    var save=ov.querySelector('#bc171-save');if(save)save.textContent=document.getElementById('prod-editando-id')?.value?'Guardar cambios':'Guardar producto';
    ov.querySelectorAll('#prod-cancelar-edicion,.bc171-native-hidden').forEach(function(x){x.style.display='none';});
    var help=ov.querySelector('#bc171-help');if(help)help.textContent='Cómo llenar';
    var x=ov.querySelector('#bc171-xlsx');if(x){x.textContent='Plantilla CSV';x.id='bc171-csv';x.onclick=downloadTemplate;}
    var imp=ov.querySelector('#bc171-import');if(imp){imp.textContent='Importar plantilla CSV';imp.onclick=openImport;}
    ensurePresFields();
  }
  function downloadTemplate(){
    var header=['nombre','categoria','unidad','precio_normal','precio_mayorista','presentacion_normal','factor_normal','presentacion_mayorista','factor_mayorista'];
    var sample=['Cerveza Bucanero','Bebidas','botella','650','600','Unidad','1','Paquete x 24','24'];
    var escCsv=function(x){return '"'+String(x??'').replace(/"/g,'""')+'"';};
    var blob=new Blob([header.map(escCsv).join(',')+'\n'+sample.map(escCsv).join(',')+'\n'],{type:'text/csv;charset=utf-8;'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='plantilla_productos_battlecruiser.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  }
  function openHelp(){
    if(document.getElementById('bc-pulido-help'))return;
    var ov=document.createElement('div');ov.id='bc-pulido-help';ov.className='bc-pulido-help-overlay';ov.innerHTML='<div class="bc-pulido-dialog" role="dialog" aria-modal="true"><h3>Cómo llenar la plantilla</h3><p>Usá únicamente la plantilla CSV descargada en el Paso 1. No cambies los encabezados, no agregues columnas y no borres la primera fila.</p><div class="bc-pulido-help-grid">'
      +'<div class="bc-pulido-help-card"><strong>nombre · obligatorio</strong><p>Un producto por fila. Ej.: Cerveza Bucanero. No lo dejes vacío.</p></div>'
      +'<div class="bc-pulido-help-card"><strong>categoria · opcional</strong><p>Debe coincidir con una categoría existente para asociarse automáticamente.</p></div>'
      +'<div class="bc-pulido-help-card"><strong>unidad · opcional</strong><p>Es la unidad base del inventario: botella, lata, libra, kg, etc. No uses “paquete x7” como unidad base.</p></div>'
      +'<div class="bc-pulido-help-card"><strong>precio_normal · opcional</strong><p>Solo número. Ej.: 650. Si no aplica, déjalo vacío.</p></div>'
      +'<div class="bc-pulido-help-card"><strong>precio_mayorista · opcional</strong><p>Solo número. Ej.: 200. Si no aplica, déjalo vacío.</p></div>'
      +'<div class="bc-pulido-help-card"><strong>presentacion_normal + factor</strong><p>Ej.: Unidad + 1. El factor es cuántas unidades base representa una venta.</p></div>'
      +'<div class="bc-pulido-help-card"><strong>presentacion_mayorista + factor</strong><p>Ej.: Paquete x 7 + 7. Una venta mayorista de 1 paquete descontará 7 unidades base.</p></div>'
      +'<div class="bc-pulido-help-card"><strong>Regla crítica</strong><p>No escribas “7 unidades” dentro del factor. El factor debe ser solo un número positivo.</p></div>'
      +'</div><div class="bc-pulido-dialog-actions"><button type="button" id="bc-pulido-help-close">Cerrar</button></div></div>';
    document.body.appendChild(ov);ov.querySelector('#bc-pulido-help-close').onclick=function(){ov.remove();};ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
  }
  function parseCsv(text){
    var lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(function(x){return x.trim()});if(lines.length<2)throw Error('La plantilla debe tener encabezados y al menos una fila.');
    function split(line){var out=[],cur='',q=false;for(var i=0;i<line.length;i++){var c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur.trim());cur='';}else cur+=c;}out.push(cur.trim());return out;}
    var h=split(lines[0]).map(norm);var rows=lines.slice(1).map(function(line){var v=split(line),o={};h.forEach(function(k,i){o[k]=v[i]??''});return o;});return{h:h,rows:rows};
  }
  function val(r,k,aliases){for(var i=0;i<aliases.length;i++){var v=r[norm(aliases[i])];if(v!=null&&String(v).trim()!=='')return String(v).trim();}return '';}
  function catId(name){if(!name)return null;var cs=Array.isArray(window._cache&&_cache.categorias)?_cache.categorias:[];var hit=cs.find(function(c){return norm(c.nombre)===norm(name);});return hit?hit.id:null;}
  async function importRows(file,body){
    var text=await file.text(),parsed=parseCsv(text),ok=0,fail=0,errors=[];
    var headersRequired=['nombre','categoria','unidad','precio_normal','precio_mayorista','presentacion_normal','factor_normal','presentacion_mayorista','factor_mayorista'];
    if(parsed.h.indexOf('nombre')<0)throw Error('Falta la columna nombre.');
    for(var i=0;i<parsed.rows.length;i++){
      var r=parsed.rows[i],nombre=val(r,'nombre',['nombre']);
      try{
        if(!nombre)throw Error('Fila '+(i+2)+': falta nombre.');
        var pnRaw=val(r,'precio_normal',['precio_normal','precio normal']),pmRaw=val(r,'precio_mayorista',['precio_mayorista','precio mayorista']);
        var pn=pnRaw===''?null:Number(pnRaw),pm=pmRaw===''?null:Number(pmRaw);if(pn!==null&&!Number.isFinite(pn))throw Error('Fila '+(i+2)+': precio_normal inválido.');if(pm!==null&&!Number.isFinite(pm))throw Error('Fila '+(i+2)+': precio_mayorista inválido.');
        var normName=val(r,'presentacion_normal',['presentacion_normal','presentación normal','presentacion']),normFacRaw=val(r,'factor_normal',['factor_normal','factor normal']);
        var whName=val(r,'presentacion_mayorista',['presentacion_mayorista','presentación mayorista']),whFacRaw=val(r,'factor_mayorista',['factor_mayorista','factor mayorista']);
        var nf=normName?(normFacRaw===''?1:Number(normFacRaw)):null,wf=whName?(whFacRaw===''?null:Number(whFacRaw)):null;if(normName&&(!(nf>0)))throw Error('Fila '+(i+2)+': factor_normal inválido.');if(whName&&(!(wf>0)))throw Error('Fila '+(i+2)+': factor_mayorista inválido.');
        if(typeof window.client==='undefined'||!client||!client.rpc)throw Error('No hay conexión con el backend.');
        var p={p_producto_id:null,p_nombre:nombre,p_categoria_id:catId(val(r,'categoria',['categoria','category'])),p_unidad:val(r,'unidad',['unidad','unit','uom'])||null,p_precio_normal:pn,p_precio_mayorista:pm,p_presentacion_normal:normName||null,p_factor_normal:nf,p_presentacion_mayorista:whName||null,p_factor_mayorista:wf,p_idempotency_key:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+i)};
        var rr=await client.rpc('bc_guardar_producto_catalogo',p);if(rr.error)throw rr.error;ok++;
      }catch(err){fail++;if(errors.length<10)errors.push(err.message||String(err));}
    }
    body.innerHTML='<p class="'+(fail?'bc-pulido-import-warn':'bc-pulido-import-ok')+'">'+ok+' producto(s) importado(s) correctamente'+(fail?' · '+fail+' con error.':' .')+'</p>'+(errors.length?'<p class="bc-pulido-import-error">'+errors.map(esc).join('<br>')+'</p>':'');
    if(typeof window.refrescarProductos==='function')await window.refrescarProductos();
  }
  function openImport(){
    if(document.getElementById('bc-pulido-import'))return;
    var ov=document.createElement('div');ov.id='bc-pulido-import';ov.className='bc-pulido-import-overlay';ov.innerHTML='<div class="bc-pulido-dialog" role="dialog" aria-modal="true"><h3>Importar productos</h3><p>Seleccioná la <strong>plantilla CSV</strong> que completaste. Se procesa localmente y luego las altas se registran en el backend.</p><input id="bc-pulido-import-file" type="file" accept=".csv,text/csv"><div id="bc-pulido-import-body"></div><div class="bc-pulido-dialog-actions"><button type="button" id="bc-pulido-import-cancel">Cancelar</button></div></div>';
    document.body.appendChild(ov);ov.querySelector('#bc-pulido-import-cancel').onclick=function(){ov.remove();};ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
    ov.querySelector('#bc-pulido-import-file').onchange=async function(){var f=this.files&&this.files[0],body=ov.querySelector('#bc-pulido-import-body');if(!f||!body)return;body.innerHTML='<p>Validando archivo…</p>';try{await importRows(f,body);}catch(err){body.innerHTML='<p class="bc-pulido-import-error">'+esc(err.message||String(err))+'</p>';}};
  }

  function buildPresentationCatalog(){
    var panel=document.querySelector('#tab-productos .presentaciones-panel');if(!panel)return;
    var catalog=panel.querySelector('.presentaciones-catalogo');if(!catalog)return;
    var old=catalog.querySelector('.bc-catalog-pres-panel');if(old)old.remove();
    var wrap=document.createElement('div');wrap.className='bc-catalog-pres-panel';
    wrap.innerHTML='<div class="bc-catalog-pres-toolbar"><strong>Presentaciones comerciales</strong><button type="button" id="bc-pres-refresh">Actualizar</button></div><div id="bc-pres-catalog-list" class="bc-catalog-pres-list"></div>';
    catalog.appendChild(wrap);
    wrap.querySelector('#bc-pres-refresh').onclick=function(){renderPresentationCatalog();};
  }
  async function renderPresentationCatalog(){
    var el=document.getElementById('bc-pres-catalog-list');if(!el)return;await loadPresentaciones();el.innerHTML=PRES_CACHE.map(function(p){return '<div class="bc-catalog-pres-card"><strong>'+esc(p.nombre)+'</strong><span>Activa · disponible para asociar a productos</span></div>';}).join('')||'<div class="lista-estado">No hay presentaciones comerciales creadas.</div>';
  }
  function ensurePresentationCreateForm(){
    var f=document.getElementById('form-presentacion-nueva');if(!f)return;f.classList.remove('hidden');if(f.dataset.bcPulido==='1')return;f.dataset.bcPulido='1';
    f.addEventListener('submit',async function(e){e.preventDefault();e.stopImmediatePropagation();var input=document.getElementById('pres-nombre-nueva'),n=input?.value?.trim()||'';if(!n)return;try{var r=await client.rpc('crear_presentacion',{p_nombre:n,p_idempotency_key:(crypto.randomUUID?crypto.randomUUID():String(Date.now()))});if(r.error)throw r.error;if(input)input.value='';await loadPresentaciones();fillPresSelect('bc-pres-normal',PRES_CACHE);fillPresSelect('bc-pres-wholesale',PRES_CACHE);renderPresentationCatalog();var m=document.getElementById('msg-presentaciones');if(m)m.textContent='✓ Presentación creada.';}catch(err){var m2=document.getElementById('msg-presentaciones');if(m2)m2.textContent=err.message||String(err);}},true);
  }

  function cleanCommunicationEmpty(){
    document.querySelectorAll('#tab-comunicacion *').forEach(function(el){var t=norm(el.textContent||'');if((t==='no tenes conversaciones todavia inicia una nueva conversacion'||t==='no tienes conversaciones todavía. iniciá una nueva conversación para comenzar a chatear.')&&el.children.length===0)el.classList.add('bc-pulido-empty-chat');});
  }
  function configVisible(){
    var tabs=document.getElementById('tabs');if(!tabs)return;var b=tabs.querySelector('[data-tab="config"]');if(!b){b=document.createElement('button');b.type='button';b.className='tab-btn';b.dataset.tab='config';b.textContent='Configuración';tabs.appendChild(b);if(typeof window.navegarTab==='function')b.onclick=function(){window.navegarTab('config');};else b.addEventListener('click',function(){document.querySelectorAll('.tab-btn').forEach(function(x){x.classList.remove('active');});b.classList.add('active');document.querySelectorAll('.tab-panel').forEach(function(x){x.classList.remove('visible');});var p=document.getElementById('tab-config');if(p)p.classList.add('visible');});}b.style.display='flex';b.hidden=false;b.removeAttribute('aria-hidden');
  }
  function reportsSingleFilter(){
    var tab=document.getElementById('tab-reportes');if(!tab)return;
    var fs=Array.from(tab.querySelectorAll('.mando-filtros,#reportes-filtros,.bc-m42-filters'));if(fs.length<=1)return;
    var keep=tab.querySelector('#reportes-filtros')||fs[0];fs.forEach(function(f){if(f!==keep){f.style.display='none';f.setAttribute('aria-hidden','true');}});
    ['rep-filtro-desde','rep-filtro-hasta','rep-filtro-almacen'].forEach(function(id){var e=document.getElementById(id);if(e&&!e.dataset.bcPulidoChange){e.dataset.bcPulidoChange='1';e.addEventListener('change',function(){if(typeof window.refrescarReportes==='function')window.refrescarReportes();if(typeof window.renderReporte==='function')window.renderReporte();});}});
  }
  function removeTransferSection(){
    var b=document.querySelector('#tabs [data-tab="transferencias"]');if(b)b.remove();var sec=document.getElementById('tab-transferencias');if(sec)sec.classList.remove('visible');
  }
  function productModalObserver(){
    var obs=new MutationObserver(function(){productModalPolish();discoverEditButtons();cleanCommunicationEmpty();reportsSingleFilter();configVisible();repaintStockCards();});obs.observe(document.body,{subtree:true,childList:true});
  }
  function boot(){
    css();
    ensureWarehouses();preloadStock();patchStockGetter();bindCatalogClicks();
    ensurePresFields();patchProductSubmit();patchEditBridge();ensurePresentationCreateForm();buildPresentationCatalog();configVisible();removeTransferSection();cleanCommunicationEmpty();reportsSingleFilter();discoverEditButtons();productModalObserver();
    setTimeout(function(){preloadStock(true);ensureWarehouses();patchStockGetter();patchEditBridge();},800);
    setTimeout(function(){productModalPolish();ensurePresFields();renderPresentationCatalog();discoverEditButtons();repaintStockCards();},1400);
    setTimeout(function(){configVisible();removeTransferSection();cleanCommunicationEmpty();reportsSingleFilter();},2500);
    window.__BC_PULIDO_20260903_VERIFY=function(){return{stockReady:STOCK_READY,stockRows:Object.keys(STOCK_MAP).length,warehouseOptions:['trf-origen','trf-destino','compra-almacen'].map(function(id){var e=document.getElementById(id);return [id,e?e.options.length:0]}),transferSidebarPresent:!!document.querySelector('#tabs [data-tab="transferencias"]'),configVisible:!!document.querySelector('#tabs [data-tab="config"]')&&getComputedStyle(document.querySelector('#tabs [data-tab="config"]')).display!=='none',presentationsVisible:!!(document.querySelector('#tab-productos .presentaciones-panel')&&getComputedStyle(document.querySelector('#tab-productos .presentaciones-panel')).display!=='none'),commercialFields:!!document.getElementById('bc-product-commercial-fields')}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('online',function(){setTimeout(function(){preloadStock(true);ensureWarehouses();},300);});
})();
