// BattleCruiser — M20 Finanzas operativas
(function(){
  'use strict';
  const ID='finanzas-operativas';
  const esc=v=>typeof escHtml==='function'?escHtml(v):String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const key=()=>crypto.randomUUID();
  const productos=()=>Array.isArray(window._cache?.productos)?window._cache.productos:[];
  const almacenes=()=>Array.isArray(window._cache?.almacenes)?window._cache.almacenes.filter(a=>a.activo!==false):[];
  const rpc=async(name,params)=>{const r=await client.rpc(name,params||{});if(r.error)throw r.error;return r.data};
  const can=(s,a)=>typeof tienePermiso==='function'&&tienePermiso(s,a);
  function ensure(){
    const tab=document.getElementById('tab-operacion');
    if(!tab||document.getElementById(ID)||!can('reinversiones','crear'))return;
    const b=document.createElement('div');b.className='cc-bloque';b.id=ID;
    b.innerHTML=`<h3>💰 Operaciones de caja e inventario</h3><p class="muted">Gasto = sale dinero. Baja/merma = sale producto. Reinversión = sale dinero y entra producto.</p><form id="form-reinversion" class="inline-form"><h4>🟢 Reinversión</h4><select id="rein-almacen" required><option value="">Almacén</option></select><input id="rein-proveedor" placeholder="Proveedor (opcional)"><div id="rein-lineas" class="lista"></div><div class="btn-row"><button type="button" id="rein-add">+ Agregar producto</button><button type="submit">Registrar reinversión</button></div><p class="msg" id="rein-msg"></p></form>`;
    tab.insertBefore(b,tab.firstChild);
    const alm=document.getElementById('rein-almacen');alm.innerHTML='<option value="">Almacén</option>'+almacenes().map(a=>`<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join('');
    document.getElementById('rein-add').onclick=addLine;document.getElementById('form-reinversion').onsubmit=submit;addLine();
  }
  function productOptions(){return '<option value="">Producto</option>'+productos().filter(p=>p.activo!==false).map(p=>`<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}
  function addLine(){const host=document.getElementById('rein-lineas');if(!host)return;const row=document.createElement('div');row.className='rep-fila rein-linea';row.innerHTML=`<select class="rein-prod" required>${productOptions()}</select><select class="rein-pres"><option value="">Unidad base</option></select><input class="rein-qty" type="number" min="0.001" step="any" placeholder="Cantidad" required><input class="rein-cost" type="number" min="0.01" step="0.01" placeholder="Costo total" required><button type="button" class="cc-accion rein-del">×</button>`;host.appendChild(row);row.querySelector('.rein-prod').onchange=()=>loadPres(row);row.querySelector('.rein-del').onclick=()=>{if(host.children.length>1)row.remove()};}
  async function loadPres(row){const prod=row.querySelector('.rein-prod').value,pres=row.querySelector('.rein-pres');pres.innerHTML='<option value="">Unidad base</option>';if(!prod)return;try{const data=await withCache('asociaciones:'+prod,()=>client.from('producto_presentaciones').select('id,factor,activo,presentacion_id,presentaciones(nombre)').eq('producto_id',prod).eq('activo',true).order('created_at'));(data||[]).forEach(x=>{const o=document.createElement('option');o.value=x.presentacion_id;o.textContent=(x.presentaciones?.nombre||'Presentación')+' × '+x.factor;pres.appendChild(o)});}catch(e){console.warn('[Battlecruiser] presentaciones reinversion',e)}}
  async function submit(e){e.preventDefault();const msg=document.getElementById('rein-msg');msg.textContent='';const almacen=document.getElementById('rein-almacen').value,rows=[...document.querySelectorAll('#rein-lineas .rein-linea')];if(!almacen){msg.textContent='Selecciona un almacén.';return}const lineas=[];for(const row of rows){const producto_id=row.querySelector('.rein-prod').value,presentacion_id=row.querySelector('.rein-pres').value||null,cantidad=Number(row.querySelector('.rein-qty').value),costo=Number(row.querySelector('.rein-cost').value);if(!producto_id||!(cantidad>0)||!(costo>0)){msg.textContent='Completa correctamente todas las líneas.';return}lineas.push({producto_id,presentacion_id,cantidad_presentacion:presentacion_id?cantidad:null,cantidad_base:presentacion_id?null:cantidad,costo_total:costo})}try{await rpc('registrar_reinversion_multiple',{p_almacen_id:almacen,p_proveedor:document.getElementById('rein-proveedor').value||null,p_fecha:new Date().toISOString(),p_lineas:lineas,p_idempotency_key:key()});document.getElementById('form-reinversion').reset();document.getElementById('rein-lineas').innerHTML='';addLine();msg.textContent='✓ Reinversión registrada: inventario ↑ y caja ↓.';}catch(err){msg.textContent='No se pudo registrar: '+(err.message||err)}}
  function start(){ensure();if(!window.__bcFinanzasTimer)window.__bcFinanzasTimer=setInterval(ensure,5000)}
  document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1500));document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-tab]');if(b&&b.dataset.tab==='operacion')setTimeout(ensure,200)});
})();
