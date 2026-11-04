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
  function closeProductModal(){
    if(typeof window.__BCM26_closeProductModal==='function')return window.__BCM26_closeProductModal(false);
    if(typeof window.__BC171_close==='function')return window.__BC171_close();
    return false;
  }
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
      +'.bc-pres-grid-compact{display:flex!important;flex-direction:column!important;gap:7px!important;margin-top:8px!important}'
      +'.bc-pres-section-title{font-size:10.5px;font-weight:700;color:var(--mist);margin:2px 0 0}'
      +'.bc-pres-grid-compact .bc-pres-row{grid-template-columns:84px minmax(0,1fr) 92px}'
      + '@media(max-width:700px){.bc-pres-grid-compact .bc-pres-row{grid-template-columns:64px minmax(0,1fr) 78px;gap:5px;padding:6px}.bc-pres-row-title{font-size:9.5px}}'
      + '@media(max-width:360px){.bc-pres-grid-compact .bc-pres-row{grid-template-columns:1fr 1fr}.bc-pres-row-title{grid-column:1/-1}}'
      +'.bc-pres-row{display:grid;grid-template-columns:84px minmax(0,1fr) 92px;gap:7px;align-items:center;padding:7px;border:1px solid rgba(212,176,92,.14);border-radius:8px;background:rgba(8,20,17,.28)}'
      +'.bc-pres-row-title{font-size:10.5px;color:var(--gold-bright);white-space:nowrap}'
      +'.bc-pres-row input{min-width:0;width:100%;height:34px;min-height:34px;padding:0 8px;font-size:10.5px;box-sizing:border-box}'
      +'.bc-pres-optional-note{grid-column:1/-1;margin:0;font-size:9.5px;color:var(--mist);line-height:1.3}'
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
      +'#tab-config .presentaciones-panel{display:block!important;visibility:visible!important;max-height:none!important;overflow:visible!important}'
      +'#tab-productos .bc171-native-hidden{display:none!important}'
      +'#tab-productos #prod-cancelar-edicion{display:none!important}'
      +'#tab-productos .bc-pres-grid input,#tab-productos .bc-pres-grid select{width:100%}'
      +'#tab-productos #form-producto.bc-pulido-form{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px 14px!important;align-items:end!important}'
      +'#tab-productos #form-producto.bc-pulido-form .prod-imagen-campo{grid-column:1/-1}'
      +'#tab-transferencias{display:none!important}'
      +'#tabs [data-tab=transferencias]{display:none!important}'
      +'#tab-ventas .bc-pulido-product-card{cursor:pointer}'
      +'#tab-ventas .bc-pulido-product-card:focus{outline:2px solid var(--gold);outline-offset:2px}'
      +'#tab-comunicacion .bc-pulido-empty-chat{display:none!important}'
      +'@media(max-width:700px){.bc-pulido-tools,.bc-pres-grid,.bc-pulido-help-grid,#tab-productos #form-producto.bc-pulido-form{grid-template-columns:1fr!important}.bc-pres-custom{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }

  async function preloadStock(force){
    if(STOCK_LOADING && !force) return;
    if(STOCK_READY && !force) return;
    if(typeof client==='undefined'||!client||typeof client.rpc!=='function') return;
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
    if(getAlmList().length||typeof client==='undefined'||!client||!client.from)return;
    try{var r=await client.from('almacenes').select('id,nombre,tipo,activo').eq('activo',true).order('nombre');if(!r.error){if(window._cache)_cache.almacenes=r.data||[];fillWarehouseSelects();}}catch(_){ }
  }

  function loadPresentaciones(){
    var list=Array.isArray(window._presentacionesCache)?window._presentacionesCache:[];
    if(list.length)PRES_CACHE=list.slice();
    if(PRES_CACHE.length)return Promise.resolve(PRES_CACHE);
    if(typeof client==='undefined'||!client||!client.from)return Promise.resolve(PRES_CACHE);
    return client.from('presentaciones').select('id,nombre,activo,created_at').eq('activo',true).order('nombre').then(function(r){if(!r.error&&Array.isArray(r.data)){PRES_CACHE=r.data.slice();window._presentacionesCache=PRES_CACHE.slice();}return PRES_CACHE;}).catch(function(){return PRES_CACHE;});
  }
  function ensurePresFields(){
    var form=document.getElementById('form-producto');if(!form)return false;
    form.classList.add('bc-pulido-form');
    if(typeof window.__BCM26_ensureCommercialOptions==='function')window.__BCM26_ensureCommercialOptions();
    // Remove any stale copy left by an older cached script before building the
    // sole approved label + factor editor inside the commercial-options panel.
    var legacy=document.getElementById('prod-presentaciones-config');if(legacy)legacy.remove();
    var host=document.getElementById('bc-product-commercial-panel');
    if(!host)return false;
    var box=document.getElementById('bc-product-commercial-fields');
    if(box){
      if(box.parentNode!==host)host.appendChild(box);
      return true;
    }
    box=document.createElement('div');box.id='bc-product-commercial-fields';box.className='bc-pres-grid bc-pres-grid-compact';
    box.innerHTML=
      '<div class="bc-pres-section-title">Presentaciones y factores</div>'+
      '<div class="bc-pres-row"><strong class="bc-pres-row-title">Formato minorista</strong><input id="bc-pres-normal-name" type="text" maxlength="60" list="presentaciones-comunes" placeholder="Etiqueta (ej. Botella)" aria-label="Etiqueta de presentación minorista"><input id="bc-pres-normal-factor" type="number" step="any" min="0.0001" inputmode="decimal" placeholder="Factor (ej. 1)" aria-label="Factor numérico minorista"></div>'+
      '<div class="bc-pres-row"><strong class="bc-pres-row-title">Formato mayorista</strong><input id="bc-pres-wholesale-name" type="text" maxlength="60" list="presentaciones-comunes" placeholder="Etiqueta (ej. Caja)" aria-label="Etiqueta de presentación mayorista"><input id="bc-pres-wholesale-factor" type="number" step="any" min="0.0001" inputmode="decimal" placeholder="Factor (ej. 50)" aria-label="Factor numérico mayorista"></div>'+
      '<p class="bc-pres-optional-note">Configura únicamente las presentaciones que utilices. Cada una requiere etiqueta y factor positivo; deja ambas vacías si no aplica.</p>';
    host.appendChild(box);
    loadPresentaciones();
    return true;
  }
  function selectedPres(which){
    var isWholesale=which==='wholesale';
    var nameEl=document.getElementById(isWholesale?'bc-pres-wholesale-name':'bc-pres-normal-name');
    var factorEl=document.getElementById(isWholesale?'bc-pres-wholesale-factor':'bc-pres-normal-factor');
    var name=nameEl?(nameEl.value||'').trim():'';
    var raw=factorEl?(factorEl.value||'').trim():'';
    if(!name&&!raw)return{name:null,factor:null,id:null};
    return{name:name||null,factor:raw===''?null:Number(raw),id:null};
  }

  async function loadProductPres(productId){
    if(!productId||typeof client==='undefined'||!client||!client.from)return[];
    try{
      var r=await client.from('producto_presentaciones')
        .select('id,presentacion_id,factor,activo,presentaciones(id,nombre)')
        .eq('producto_id',productId).eq('activo',true).order('created_at');
      if(!r.error&&Array.isArray(r.data))return r.data;
    }catch(_){ }
    return[];
  }

  async function hydrateEditPres(productId){
    ensurePresFields();
    var rows=await loadProductPres(productId);
    var prod=activeProducts().find(function(p){return String(p.id)===String(productId);});
    var wholesaleId=prod&&prod.presentacion_id?String(prod.presentacion_id):null;
    var wholesale=wholesaleId?rows.find(function(r){return String(r.presentacion_id)===wholesaleId;}):null;
    var normal=rows.find(function(r){return !wholesaleId||String(r.presentacion_id)!==wholesaleId;})||null;
    function setRow(kind,row){
      var isW=kind==='wholesale';
      var nameEl=document.getElementById(isW?'bc-pres-wholesale-name':'bc-pres-normal-name');
      var factorEl=document.getElementById(isW?'bc-pres-wholesale-factor':'bc-pres-normal-factor');
      if(nameEl)nameEl.value=row&&row.presentaciones?String(row.presentaciones.nombre||''):'';
      if(factorEl)factorEl.value=row&&row.factor!=null?String(row.factor):'';
    }
    setRow('normal',normal);
    setRow('wholesale',wholesale);
    var category=document.getElementById('prod-categoria')?.value||'';
    var wholesalePrice=document.getElementById('prod-precio-mayorista')?.value?.trim()||'';
    var hasPresentation=!!(normal||wholesale);
    if(typeof window.__BCM26_setCommercialOptionsExpanded==='function'){
      window.__BCM26_setCommercialOptionsExpanded(!!(category||wholesalePrice||hasPresentation));
    }
  }

  function patchEditBridge(){
    if(typeof window.iniciarEdicionProducto==='function'&&window.iniciarEdicionProducto.__bcPulido)return;
    var orig=window.iniciarEdicionProducto;
    window.iniciarEdicionProducto=function(p){
      if(!p)return;
      function set(id,value){var el=document.getElementById(id);if(el)el.value=value==null?'':String(value);}
      set('prod-editando-id',p.id);
      set('prod-nombre',p.nombre);
      set('prod-categoria',p.categoria_id);
      set('prod-unidad',p.unidad);
      set('prod-precio-normal',p.precio_normal);
      set('prod-precio-mayorista',p.precio_mayorista);
      ensurePresFields();
      if(typeof window.__BC171_open==='function')window.__BC171_open();
      hydrateEditPres(p.id);
      var title=document.querySelector('#bc171-overlay .bc171-head h3');
      if(title)title.textContent='Editar producto';
      var save=document.getElementById('bc171-save');
      if(save)save.textContent='Guardar cambios';
      return true;
    };
    window.iniciarEdicionProducto.__bcPulido=true;
    window.iniciarEdicionProducto.__bcPulidoOrig=orig;
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
    var form=document.getElementById('form-producto');
    var modal=document.getElementById('bc-product-modal');
    // The sole supported owner is M26's native modal. Do not depend on the
    // retired M17 overlay, which is intentionally absent in the current UI.
    if(!form||!modal||!modal.contains(form))return false;
    e.preventDefault();e.stopImmediatePropagation();
    var id=document.getElementById('prod-editando-id')?.value||null;
    var imageFile=window.__BC_PRODUCT_IMAGE_FILE__||null;
    var nombre=document.getElementById('prod-nombre')?.value?.trim()||'';
    if(!nombre){msg('El nombre del producto es requerido.',false);return true;}
    var save=document.getElementById('prod-submit-btn')||document.getElementById('bc171-save');if(save)save.disabled=true;
    var pnRaw=document.getElementById('prod-precio-normal')?.value??'';var pmRaw=document.getElementById('prod-precio-mayorista')?.value??'';
    var pn=String(pnRaw).trim()===''?null:Number(pnRaw);var pm=String(pmRaw).trim()===''?null:Number(pmRaw);
    if(pn===null||!Number.isFinite(pn)||pn<0.01){msg('El precio normal debe ser mayor a 0.',false);if(save)save.disabled=false;return true;}
    if(pm!==null&&(!Number.isFinite(pm)||pm<0)){msg('El precio mayorista debe ser un número válido o dejarse vacío.',false);if(save)save.disabled=false;return true;}
    var normal=selectedPres('normal'), wholesale=selectedPres('wholesale');
    function presentationValid(value){
      var hasName=!!(value.name&&String(value.name).trim());
      var hasFactor=value.factor!==null&&value.factor!==undefined;
      var factor=Number(value.factor);
      return (!hasName&&!hasFactor)||(hasName&&hasFactor&&Number.isFinite(factor)&&factor>0);
    }
    if(!presentationValid(normal)||!presentationValid(wholesale)){
      msg('Cada presentación opcional necesita una etiqueta y un factor numérico mayor que cero. Deja ambos vacíos si no aplica.',false);
      if(save)save.disabled=false;return true;
    }
    if(normal.name&&wholesale.name&&norm(normal.name)===norm(wholesale.name)){
      msg('Las etiquetas minorista y mayorista deben ser distintas.',false);
      if(save)save.disabled=false;return true;
    }
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
        if(normal.name||normal.factor!==null||wholesale.name||wholesale.factor!==null){
          msg('Para guardar presentaciones y factores necesitas conexión. No se guardó el producto ni se creó parcialmente.',false);
          return true;
        }
        var q=await window.ejecutarOperacion(id?'producto_actualizar':'producto',{...(id?{p_producto_id:id}:{}),p_nombre:nombre,p_categoria_id:document.getElementById('prod-categoria')?.value||null,p_unidad:document.getElementById('prod-unidad')?.value?.trim()||null,p_precio_normal:pn,p_precio_mayorista:pm});
        if(q?.ok){msg('✓ Producto guardado localmente. Las opciones de presentación quedaron sin configurar; puedes añadirlas al recuperar conexión.'+(imageFile?' La imagen requiere conexión: vuelve a seleccionarla al recuperar internet.':''),true);window.__BC_PRODUCT_IMAGE_FILE__=null;closeProductModal();}else msg('No se pudo guardar offline.',false);
        return true;
      }
      if(typeof client==='undefined'||!client||!client.rpc)throw Error('No hay conexión con el backend.');
      var params={p_producto_id:id||null,p_nombre:nombre,p_categoria_id:document.getElementById('prod-categoria')?.value||null,p_unidad:document.getElementById('prod-unidad')?.value?.trim()||null,p_precio_normal:pn,p_precio_mayorista:pm,p_presentacion_normal:normal.name,p_factor_normal:normal.factor,p_presentacion_mayorista:wholesale.name,p_factor_mayorista:wholesale.factor,p_idempotency_key:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random())};
      var r=await client.rpc('bc_guardar_producto_catalogo',params);
      if(r.error)throw r.error;
      var imageNotice='';
      if(imageFile){
        var savedProductId=id||r.data;
        if(!savedProductId)throw Error('El producto se guardó, pero no se obtuvo su ID para subir la imagen.');
        if(typeof window.subirImagenProducto!=='function')throw Error('El módulo de carga de imágenes no está disponible; selecciona de nuevo la imagen al editarlo.');
        var imageResult=await window.subirImagenProducto(savedProductId,imageFile);
        if(!imageResult.ok)imageNotice=' La imagen no se pudo subir; vuelve a seleccionarla al editar el producto.';
        window.__BC_PRODUCT_IMAGE_FILE__=null;
        var imageInput=document.getElementById('prod-imagen-input');if(imageInput)imageInput.value='';
      }
      if(typeof window.refrescarProductos==='function')await window.refrescarProductos();
      await loadPresentaciones();
      msg((id?'✓ Producto actualizado.':'✓ Producto creado.')+imageNotice,!imageNotice);
      closeProductModal();
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
        var nf=normFacRaw===''?null:Number(normFacRaw),wf=whFacRaw===''?null:Number(whFacRaw);
        var normalPair=(!normName&&normFacRaw==='')||(!!normName&&Number.isFinite(nf)&&nf>0);
        var wholesalePair=(!whName&&whFacRaw==='')||(!!whName&&Number.isFinite(wf)&&wf>0);
        if(!normalPair)throw Error('Fila '+(i+2)+': la presentación minorista requiere etiqueta y factor positivo, o ambos vacíos.');
        if(!wholesalePair)throw Error('Fila '+(i+2)+': la presentación mayorista requiere etiqueta y factor positivo, o ambos vacíos.');
        if(normName&&whName&&norm(normName)===norm(whName))throw Error('Fila '+(i+2)+': las etiquetas minorista y mayorista deben ser distintas.');
        if(typeof client==='undefined'||!client||!client.rpc)throw Error('No hay conexión con el backend.');
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

  // El catálogo único lo mantiene presentaciones.js dentro de Administración.
  // No crear un segundo listado ni un segundo botón de actualización.
  function buildPresentationCatalog(){ return false; }
  async function renderPresentationCatalog(){ return false; }
  // El único submit handler del catálogo vive en presentaciones.js.
  function ensurePresentationCreateForm(){ return false; }

  function cleanCommunicationEmpty(){
    document.querySelectorAll('#tab-comunicacion *').forEach(function(el){var t=norm(el.textContent||'');if((t==='no tenes conversaciones todavia inicia una nueva conversacion'||t==='no tienes conversaciones todavía. iniciá una nueva conversación para comenzar a chatear.')&&el.children.length===0)el.classList.add('bc-pulido-empty-chat');});
  }
  function normalizarEtiquetaConfig(){
    var b=document.querySelector('#tabs [data-tab="config"]');if(!b)return;
    var label=b.querySelector('.bc-nav-label');
    if(label){if(label.textContent!=='Administración')label.textContent='Administración';return;}
    if(b.querySelector('.bc-nav-icon')){var span=document.createElement('span');span.className='bc-nav-label';span.textContent='Administración';b.appendChild(span);}
    else if(b.textContent.trim()!=='Administración')b.textContent='Administración';
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
    var obs=new MutationObserver(function(){productModalPolish();discoverEditButtons();cleanCommunicationEmpty();reportsSingleFilter();normalizarEtiquetaConfig();repaintStockCards();});obs.observe(document.body,{subtree:true,childList:true});
  }
  function boot(){
    css();
    ensureWarehouses();preloadStock();patchStockGetter();bindCatalogClicks();
    ensurePresFields();patchProductSubmit();patchEditBridge();normalizarEtiquetaConfig();removeTransferSection();cleanCommunicationEmpty();reportsSingleFilter();discoverEditButtons();productModalObserver();
    setTimeout(function(){preloadStock(true);ensureWarehouses();patchStockGetter();patchEditBridge();},800);
    setTimeout(function(){productModalPolish();ensurePresFields();discoverEditButtons();repaintStockCards();},1400);
    setTimeout(function(){normalizarEtiquetaConfig();removeTransferSection();cleanCommunicationEmpty();reportsSingleFilter();},2500);
    window.__BC_PULIDO_20260903_VERIFY=function(){var panel=document.getElementById('bc-product-commercial-panel');var fields=document.getElementById('bc-product-commercial-fields');return{stockReady:STOCK_READY,stockRows:Object.keys(STOCK_MAP).length,warehouseOptions:['trf-origen','trf-destino','compra-almacen'].map(function(id){var e=document.getElementById(id);return [id,e?e.options.length:0]}),transferSidebarPresent:!!document.querySelector('#tabs [data-tab="transferencias"]'),configVisible:!!document.querySelector('#tabs [data-tab="config"]')&&document.querySelector('#tabs [data-tab="config"]').getAttribute('data-bc-permiso')==='1'&&getComputedStyle(document.querySelector('#tabs [data-tab="config"]')).display!=='none',presentationsVisible:!!(document.querySelector('#tab-config .presentaciones-panel')&&getComputedStyle(document.querySelector('#tab-config .presentaciones-panel')).display!=='none'),commercialPanel:!!panel,commercialPanelExpanded:!!(panel&&!panel.hidden),commercialFields:!!fields,commercialFieldCount:fields?fields.querySelectorAll('input').length:0,legacyPresentationBlock:!!document.getElementById('prod-presentaciones-config')}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('online',function(){setTimeout(function(){preloadStock(true);ensureWarehouses();},300);});
})();
