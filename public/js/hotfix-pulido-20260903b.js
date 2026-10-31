// BattleCruiser — Pulido operativo B 2026-09-03
(function(){
  'use strict';
  if(window.__BC_PULIDO_B_20260903__)return;
  window.__BC_PULIDO_B_20260903__=true;
  var syncing=false;
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
  function norm(v){return String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
  function msg(t,ok){var e=document.getElementById('msg-productos');if(typeof window.setMsg==='function')window.setMsg('msg-productos',t,ok);else if(e)e.textContent=t;}
  function listPres(){return Array.isArray(window.__BC_PRES_CACHE)?window.__BC_PRES_CACHE:(Array.isArray(window._presentacionesCache)?window._presentacionesCache:[])}
  async function fetchPres(){if(typeof window.client==='undefined'||!client||!client.from)return listPres();try{var r=await client.from('presentaciones').select('id,nombre,activo,created_at').eq('activo',true).order('nombre');if(!r.error){window._presentacionesCache=r.data||[];window.__BC_PRES_CACHE=r.data||[];return r.data||[];}}catch(_){ }return listPres();}
  function addFactorControls(){
    ['normal','wholesale'].forEach(function(kind){
      var id='bc-pres-'+kind,sel=document.getElementById(id);if(!sel)return;
      var box=sel.closest('.bc-pres-box');if(!box||box.querySelector('.bc-pres-factor-field'))return;
      var row=document.createElement('div');row.className='field bc-pres-factor-field';row.innerHTML='<label for="bc-pres-'+kind+'-factor">Unidades base por '+(kind==='normal'?'venta normal':'venta mayorista')+'</label><input id="bc-pres-'+kind+'-factor" type="number" step="0.0001" min="0.0001" placeholder="Ej. 1 o 7"><div class="bc-pres-meta">Ej.: Paquete x 7 → 7 unidades base.</div>';
      var ref=box.querySelector('.bc-pres-custom');if(ref)box.insertBefore(row,ref);else box.appendChild(row);
      sel.addEventListener('change',function(){var custom=document.getElementById('bc-pres-'+kind+'-custom');if(custom)custom.classList.toggle('hidden',sel.value!=='__otro__');});
    });
  }
  async function saveProduct(){
    var id=document.getElementById('prod-editando-id')?.value||null;
    var nombre=document.getElementById('prod-nombre')?.value?.trim()||'';
    if(!nombre){msg('El nombre del producto es requerido.',false);return;}
    var pnRaw=document.getElementById('prod-precio-normal')?.value??'',pmRaw=document.getElementById('prod-precio-mayorista')?.value??'';
    var pn=String(pnRaw).trim()===''?null:Number(pnRaw),pm=String(pmRaw).trim()===''?null:Number(pmRaw);
    if((pn!==null&&!Number.isFinite(pn))||(pm!==null&&!Number.isFinite(pm))){msg('Los precios deben ser números válidos.',false);return;}
    function readPres(kind){
      var isW=kind==='wholesale',sel=document.getElementById(isW?'bc-pres-wholesale':'bc-pres-normal'),factorEl=document.getElementById('bc-pres-'+kind+'-factor'),customName=document.getElementById(isW?'bc-pres-wholesale-custom-name':'bc-pres-normal-custom-name'),customFactor=document.getElementById(isW?'bc-pres-wholesale-custom-factor':'bc-pres-normal-custom-factor');
      if(!sel||!sel.value)return{name:null,factor:null,id:null};
      if(sel.value==='__otro__')return{name:(customName?.value||'').trim()||null,factor:Number((customFactor?.value||factorEl?.value||''))||null,id:null};
      var hit=listPres().find(function(p){return String(p.id)===String(sel.value);});
      return{name:hit?.nombre||null,factor:Number(factorEl?.value||'')||null,id:sel.value};
    }
    var normal=readPres('normal'),wholesale=readPres('wholesale');
    var save=document.getElementById('bc171-save');if(save)save.disabled=true;
    try{
      if(normal.name&&!Number(normal.factor)>0)throw Error('Definí el factor de la presentación normal.');
      if(wholesale.name&&!Number(wholesale.factor)>0)throw Error('Definí el factor de la presentación mayorista.');
      if(typeof window.client==='undefined'||!client||!client.rpc)throw Error('No hay conexión con el backend.');
      var r=await client.rpc('bc_guardar_producto_catalogo',{p_producto_id:id||null,p_nombre:nombre,p_categoria_id:document.getElementById('prod-categoria')?.value||null,p_unidad:document.getElementById('prod-unidad')?.value?.trim()||null,p_precio_normal:pn,p_precio_mayorista:pm,p_presentacion_normal:normal.name,p_factor_normal:normal.factor,p_presentacion_mayorista:wholesale.name,p_factor_mayorista:wholesale.factor,p_idempotency_key:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random())});
      if(r.error)throw r.error;
      msg(id?'✓ Cambios guardados.':'✓ Producto registrado correctamente.',true);
      if(typeof window.refrescarProductos==='function')await window.refrescarProductos();
      await fetchPres();
      if(window.__BC171_close)window.__BC171_close();
    }catch(err){msg(err?.message||String(err),false);}finally{if(save)save.disabled=false;}
  }
  function formCapture(e){
    var f=e.target;if(!f||f.id!=='form-producto'||!document.getElementById('bc171-overlay')||syncing)return;
    e.preventDefault();e.stopImmediatePropagation();syncing=true;addFactorControls();Promise.resolve(saveProduct()).finally(function(){syncing=false;});
  }
  function hideEmptyCommunication(){
    document.querySelectorAll('#tab-comunicacion .lista-estado,#tab-comunicacion .lista > p').forEach(function(el){var t=norm(el.textContent||'');if(t.indexOf('no tenes conversaciones')===0||t.indexOf('no tienes conversaciones')===0||t.indexOf('inicia una nueva conversacion')>=0||t.indexOf('iniciá una nueva conversación')>=0)el.style.display='none';});
  }
  function enhancePresentationCatalog(){
    var panel=document.querySelector('#tab-productos .presentaciones-panel');if(!panel||document.getElementById('bc-pres-crud'))return;
    var box=document.createElement('div');box.id='bc-pres-crud';box.style.marginTop='12px';box.innerHTML='<div class="bc-catalog-pres-toolbar"><strong>Presentaciones comerciales</strong><button type="button" id="bc-pres-crud-refresh">Actualizar</button></div><div id="bc-pres-crud-list" class="bc-catalog-pres-list"></div>';
    var host=panel.querySelector('.presentaciones-catalogo')||panel;host.appendChild(box);box.querySelector('#bc-pres-crud-refresh').onclick=renderCrud;
    renderCrud();
  }
  async function renderCrud(){
    var el=document.getElementById('bc-pres-crud-list');if(!el)return;var ps=await fetchPres();el.innerHTML=ps.map(function(p){return '<div class="bc-catalog-pres-card"><strong>'+esc(p.nombre)+'</strong><span>Activa</span><div class="bc-pulido-actions"><button type="button" data-pres-edit="'+esc(p.id)+'">Editar</button><button type="button" data-pres-toggle="'+esc(p.id)+'">Desactivar</button></div></div>';}).join('')||'<div class="lista-estado">No hay presentaciones.</div>';
    el.querySelectorAll('[data-pres-edit]').forEach(function(b){b.onclick=async function(){var p=ps.find(function(x){return String(x.id)===String(b.dataset.presEdit)});if(!p)return;var n=prompt('Nuevo nombre de la presentación',p.nombre);if(n==null||!n.trim())return;try{var r=await client.rpc('actualizar_presentacion',{p_presentacion_id:p.id,p_nombre:n.trim(),p_idempotency_key:(crypto.randomUUID?crypto.randomUUID():String(Date.now()))});if(r.error)throw r.error;await fetchPres();renderCrud();}catch(e){alert(e.message||String(e));}};});
    el.querySelectorAll('[data-pres-toggle]').forEach(function(b){b.onclick=async function(){try{var r=await client.rpc('cambiar_estado_presentacion',{p_presentacion_id:b.dataset.presToggle,p_activo:false,p_idempotency_key:(crypto.randomUUID?crypto.randomUUID():String(Date.now()))});if(r.error)throw r.error;await fetchPres();renderCrud();}catch(e){alert(e.message||String(e));}};});
  }
  function customImport(){
    if(document.getElementById('bc-pulido-import'))return;
    var ov=document.createElement('div');ov.id='bc-pulido-import';ov.className='bc-pulido-import-overlay';ov.innerHTML='<div class="bc-pulido-dialog" role="dialog" aria-modal="true"><h3>Importar productos</h3><p>Seleccioná únicamente la <strong>plantilla CSV</strong> descargada desde el Paso 1.</p><input id="bc-pulido-import-file" type="file" accept=".csv,text/csv"><div id="bc-pulido-import-body"></div><div class="bc-pulido-dialog-actions"><button type="button" id="bc-pulido-import-cancel">Cancelar</button></div></div>';
    document.body.appendChild(ov);ov.querySelector('#bc-pulido-import-cancel').onclick=function(){ov.remove();};
    ov.querySelector('#bc-pulido-import-file').onchange=async function(){var f=this.files&&this.files[0],body=document.getElementById('bc-pulido-import-body');if(!f||!body)return;try{var lines=(await f.text()).replace(/^\uFEFF/,'').split(/\r?\n/).filter(function(x){return x.trim()});if(lines.length<2)throw Error('La plantilla está vacía.');function split(line){var a=[],c='',q=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='\"'){if(q&&line[i+1]==='\"'){c+='\"';i++;}else q=!q;}else if(ch===','&&!q){a.push(c.trim());c='';}else c+=ch;}a.push(c.trim());return a;}var h=split(lines[0]).map(norm),rows=lines.slice(1).map(function(line){var v=split(line),o={};h.forEach(function(k,i){o[k]=v[i]??''});return o;});if(h.indexOf('nombre')<0)throw Error('Falta la columna nombre.');var ok=0,fail=[];
        for(var i=0;i<rows.length;i++){var r=rows[i],name=String(r.nombre||'').trim();try{if(!name)throw Error('Fila '+(i+2)+': falta nombre.');var cat=String(r.categoria||'').trim(),cats=Array.isArray(window._cache?.categorias)?_cache.categorias:[],catId=null;if(cat){var hit=cats.find(function(c){return norm(c.nombre)===norm(cat)});if(!hit)throw Error('Fila '+(i+2)+': categoría no existe: '+cat);catId=hit.id;}var pn=String(r.precio_normal||'').trim()===''?null:Number(r.precio_normal),pm=String(r.precio_mayorista||'').trim()===''?null:Number(r.precio_mayorista);if(pn!==null&&!Number.isFinite(pn))throw Error('Fila '+(i+2)+': precio_normal inválido.');if(pm!==null&&!Number.isFinite(pm))throw Error('Fila '+(i+2)+': precio_mayorista inválido.');var nName=String(r.presentacion_normal||'').trim(),nFac=String(r.factor_normal||'').trim()===''?null:Number(r.factor_normal),wName=String(r.presentacion_mayorista||'').trim(),wFac=String(r.factor_mayorista||'').trim()===''?null:Number(r.factor_mayorista);if(nName&&!(nFac>0))throw Error('Fila '+(i+2)+': factor_normal inválido.');if(wName&&!(wFac>0))throw Error('Fila '+(i+2)+': factor_mayorista inválido.');var rr=await client.rpc('bc_guardar_producto_catalogo',{p_producto_id:null,p_nombre:name,p_categoria_id:catId,p_unidad:String(r.unidad||'').trim()||null,p_precio_normal:pn,p_precio_mayorista:pm,p_presentacion_normal:nName||null,p_factor_normal:nFac,p_presentacion_mayorista:wName||null,p_factor_mayorista:wFac,p_idempotency_key:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+i)});if(rr.error)throw rr.error;ok++;}catch(err){if(fail.length<10)fail.push(err.message||String(err));}}
        body.innerHTML='<p class="'+(fail.length?'bc-pulido-import-warn':'bc-pulido-import-ok')+'">'+ok+' producto(s) importado(s).'+(fail.length?' '+fail.length+' con error.':'')+'</p>'+(fail.length?'<p class="bc-pulido-import-error">'+fail.map(esc).join('<br>')+'</p>':'');if(typeof window.refrescarProductos==='function')await window.refrescarProductos();await fetchPres();
      }catch(err){body.innerHTML='<p class="bc-pulido-import-error">'+esc(err.message||String(err))+'</p>';}};
  }
  function patchProductModal(){
    var ov=document.getElementById('bc171-overlay');if(!ov)return;
    addFactorControls();
    var x=ov.querySelector('#bc171-csv,#bc171-xlsx');if(x){x.id='bc171-csv';x.textContent='Plantilla CSV';x.onclick=function(){var h=['nombre','categoria','unidad','precio_normal','precio_mayorista','presentacion_normal','factor_normal','presentacion_mayorista','factor_mayorista'],s=['Cerveza Bucanero','Bebidas','botella','650','600','Unidad','1','Paquete x 24','24'];var q=function(v){return '"'+String(v??'').replace(/"/g,'""')+'"';};var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([h.map(q).join(',')+'\n'+s.map(q).join(',')+'\n'],{type:'text/csv;charset=utf-8;'}));a.download='plantilla_productos_battlecruiser.csv';document.body.appendChild(a);a.click();a.remove();};}
    var imp=ov.querySelector('#bc171-import');if(imp){imp.textContent='Importar plantilla CSV';imp.onclick=customImport;}
    var title=ov.querySelector('.bc171-head h3');if(title)title.textContent=document.getElementById('prod-editando-id')?.value?'Editar producto':'Registrar nuevo producto';
    var save=ov.querySelector('#bc171-save');if(save)save.textContent=document.getElementById('prod-editando-id')?.value?'Guardar cambios':'Guardar producto';
    ov.querySelectorAll('#prod-cancelar-edicion,.bc171-native-hidden').forEach(function(el){el.style.display='none';});
  }
  function boot(){
    document.addEventListener('submit',formCapture,true);
    var obs=new MutationObserver(function(){patchProductModal();addFactorControls();hideEmptyCommunication();enhancePresentationCatalog();var tr=document.querySelector('#tabs [data-tab="transferencias"]');if(tr)tr.remove();var sec=document.getElementById('tab-transferencias');if(sec)sec.classList.remove('visible');});obs.observe(document.body,{childList:true,subtree:true});
    patchProductModal();addFactorControls();hideEmptyCommunication();enhancePresentationCatalog();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC_PULIDO_B_VERIFY=function(){return{productSubmitCapture:true,commercialFactorFields:!!document.getElementById('bc-pres-normal-factor')&&!!document.getElementById('bc-pres-wholesale-factor'),importButton:!!document.querySelector('#bc171-overlay #bc171-import'),transferSidebarPresent:!!document.querySelector('#tabs [data-tab="transferencias"]'),communicationEmptyHidden:Array.from(document.querySelectorAll('#tab-comunicacion .lista-estado')).every(function(x){return getComputedStyle(x).display==='none';})}};
})();
