// ==== BattleCruiser · js/compra-multiple.js ====
// Compra múltiple: documento con N líneas + presentaciones comerciales.
(function(){
  function esc(v){ return String(v ?? '').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
  function productos(){ return (typeof _cache!=='undefined' && Array.isArray(_cache.productos)) ? _cache.productos : []; }
  function almacenes(){ return (typeof _cache!=='undefined' && Array.isArray(_cache.almacenes)) ? _cache.almacenes : []; }
  function msg(text,ok){ const el=document.getElementById('compra-multiple-msg'); if(!el)return; el.textContent=text; el.className=ok?'msg success':'msg error'; }
  async function presentacionesDeProducto(productoId){
    if(!productoId) return [];
    try{
      const data=await withCache('asociaciones:'+productoId,()=>client.from('producto_presentaciones').select('id,presentacion_id,factor,activo,presentaciones(nombre)').eq('producto_id',productoId).eq('activo',true).order('created_at'));
      return Array.isArray(data)?data.filter(x=>x.presentacion_id&&Number(x.factor)>0):[];
    }catch(e){ console.warn('[BattleCruiser] No se pudieron cargar presentaciones:',e); return []; }
  }

  function init(){
    if(document.getElementById('tab-compras')) return;
    const tabs=document.getElementById('tabs');
    const main=document.querySelector('.main-content');
    if(!tabs||!main) return;

    const tab=document.createElement('button');
    tab.type='button'; tab.className='tab-btn'; tab.id='btn-tab-compras'; tab.dataset.tab='compras'; tab.textContent='Compras';
    tabs.insertBefore(tab, tabs.querySelector('[data-tab="transferencias"]') || null);

    const section=document.createElement('section');
    section.id='tab-compras'; section.className='tab-panel';
    section.innerHTML=`
      <div class="seccion-cuerpo compra-multiple-panel">
        <div class="seccion-principal">
          <h2>Registrar compra</h2>
          <p class="muted">Agrega todos los productos que llegaron en una sola compra y regístralos juntos.</p>
          <div class="inline-form compra-cabecera">
            <select id="compra-multiple-almacen" required><option value="">Almacén de destino</option></select>
            <input id="compra-multiple-proveedor" placeholder="Proveedor (opcional)">
            <input id="compra-multiple-fecha" type="datetime-local">
          </div>
          <div class="inline-form compra-linea-editor">
            <select id="compra-multiple-producto"><option value="">Producto</option></select>
            <select id="compra-multiple-presentacion"><option value="">Unidad / presentación</option></select>
            <input id="compra-multiple-cantidad" type="number" min="0.0001" step="any" inputmode="decimal" placeholder="Cantidad">
            <input id="compra-multiple-costo" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Costo por unidad">
            <button type="button" id="compra-multiple-add">+ Agregar producto</button>
          </div>
          <p id="compra-multiple-pres-ayuda" class="muted">Selecciona una presentación para registrar cajas, paquetes, etc. y pagar el costo de esa presentación.</p>
          <div id="compra-multiple-lineas" class="lista"></div>
          <div class="venta-total"><span>Total compra</span><strong id="compra-multiple-total">$0.00</strong></div>
          <div class="btn-row">
            <button type="button" id="compra-multiple-confirmar">Registrar compra completa</button>
            <button type="button" id="compra-multiple-limpiar">Limpiar</button>
          </div>
          <p id="compra-multiple-msg" class="msg"></p>
        </div>
      </div>`;
    main.appendChild(section);

    const almacen=document.getElementById('compra-multiple-almacen');
    const proveedor=document.getElementById('compra-multiple-proveedor');
    const fecha=document.getElementById('compra-multiple-fecha');
    const producto=document.getElementById('compra-multiple-producto');
    const presentacion=document.getElementById('compra-multiple-presentacion');
    const cantidad=document.getElementById('compra-multiple-cantidad');
    const costo=document.getElementById('compra-multiple-costo');
    const ayuda=document.getElementById('compra-multiple-pres-ayuda');
    const lista=document.getElementById('compra-multiple-lineas');
    const total=document.getElementById('compra-multiple-total');
    const confirmar=document.getElementById('compra-multiple-confirmar');
    const limpiar=document.getElementById('compra-multiple-limpiar');
    let lineas=[];
    let presActual=[];

    fecha.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);

    function poblar(){
      const av=almacen.value,pv=producto.value;
      almacen.innerHTML='<option value="">Almacén de destino</option>'+almacenes().map(a=>`<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join('');
      producto.innerHTML='<option value="">Producto</option>'+productos().filter(p=>p.estado!==false).map(p=>`<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('');
      if(av) almacen.value=av; if(pv) producto.value=pv;
    }

    function actualizarCamposPresentacion(){
      const seleccion=presActual.find(x=>x.presentacion_id===presentacion.value);
      if(seleccion){
        cantidad.placeholder='Cantidad de '+(seleccion.presentaciones?.nombre||'presentaciones');
        costo.placeholder='Costo por '+(seleccion.presentaciones?.nombre||'presentación');
        ayuda.textContent=`${seleccion.presentaciones?.nombre||'Presentación'} = ${Number(seleccion.factor)} unidades base. El costo se registra por ${seleccion.presentaciones?.nombre||'presentación'}.`;
      }else{
        cantidad.placeholder='Cantidad en unidades';
        costo.placeholder='Costo por unidad';
        ayuda.textContent=presActual.length?'Sin presentación: se registra directamente en unidades base.':'Este producto no tiene presentaciones asociadas. Se registra en unidades base.';
      }
    }

    async function cargarPresentaciones(){
      const pid=producto.value;
      presentacion.disabled=true;
      presentacion.innerHTML='<option value="">Cargando…</option>';
      presActual=await presentacionesDeProducto(pid);
      presentacion.innerHTML='<option value="">Unidad base</option>'+presActual.map(p=>`<option value="${esc(p.presentacion_id)}">${esc(p.presentaciones?.nombre||'Presentación')} · ×${Number(p.factor)}</option>`).join('');
      presentacion.disabled=false;
      actualizarCamposPresentacion();
    }

    function render(){
      lista.innerHTML=lineas.length?lineas.map((l,i)=>{
        const etiqueta=l.presentacion_nombre?`${l.cantidad_presentacion} × ${esc(l.presentacion_nombre)}`:`${l.cantidad} unidades`;
        const subtotal=(l.cantidad_documento*l.costo).toFixed(2);
        return `<div class="lista-item"><span><strong>${esc(l.nombre)}</strong><span class="muted"> · ${etiqueta} · costo $${l.costo.toFixed(2)} · $${subtotal}</span></span><button type="button" data-compra-remove="${i}">Eliminar</button></div>`;
      }).join(''):'<p class="lista-estado">Todavía no hay productos en esta compra.</p>';
      total.textContent='$'+lineas.reduce((s,l)=>s+l.cantidad_documento*l.costo,0).toFixed(2);
    }

    function add(){
      const p=productos().find(x=>x.id===producto.value); const q=Number(cantidad.value); const c=Number(costo.value);
      const pres=presActual.find(x=>x.presentacion_id===presentacion.value);
      if(!p||!Number.isFinite(q)||q<=0||!Number.isFinite(c)||c<0){msg('Selecciona producto y escribe cantidad/costo válidos.',false);return;}
      if(pres && !(Number(pres.factor)>0)){msg('La presentación seleccionada no tiene un factor válido.',false);return;}
      const key=p.id+'::'+(pres?.presentacion_id||'base');
      const existente=lineas.find(x=>x.key===key);
      if(existente){ existente.cantidad_documento+=q; }
      else lineas.push({key,producto_id:p.id,nombre:p.nombre,cantidad:pres?null:q,cantidad_presentacion:pres?q:null,cantidad_documento:q,presentacion_id:pres?.presentacion_id||null,presentacion_nombre:pres?.presentaciones?.nombre||null,factor:pres?Number(pres.factor):1,costo:c});
      cantidad.value=''; costo.value=''; msg('',true); render();
    }

    document.getElementById('compra-multiple-add').addEventListener('click',add);
    producto.addEventListener('change',cargarPresentaciones);
    presentacion.addEventListener('change',actualizarCamposPresentacion);
    [cantidad,costo].forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add();}}));
    lista.addEventListener('click',e=>{const b=e.target.closest('[data-compra-remove]');if(b){lineas.splice(Number(b.dataset.compraRemove),1);render();}});
    limpiar.addEventListener('click',()=>{lineas=[];proveedor.value='';fecha.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);producto.value='';presentacion.innerHTML='<option value="">Unidad base</option>';presActual=[];actualizarCamposPresentacion();msg('',true);render();});
    confirmar.addEventListener('click',async()=>{
      if(!almacen.value){msg('Selecciona el almacén de destino.',false);return;}
      if(!lineas.length){msg('Agrega al menos un producto.',false);return;}
      confirmar.disabled=true;
      try{
        const {data,error}=await client.rpc('registrar_compra_multiple',{
          p_almacen_id:almacen.value,
          p_proveedor:proveedor.value.trim()||null,
          p_fecha:fecha.value?new Date(fecha.value).toISOString():new Date().toISOString(),
          p_lineas:lineas.map(l=>({producto_id:l.producto_id,cantidad:l.cantidad,costo_unitario:l.costo,presentacion_id:l.presentacion_id,cantidad_presentacion:l.cantidad_presentacion})),
          p_idempotency_key:crypto.randomUUID()
        });
        if(error) throw error;
        lineas=[]; render(); msg('✓ Compra registrada. Stock actualizado.',true);
        if(typeof refrescarStockYSelects==='function') await refrescarStockYSelects();
      }catch(e){ msg('No se pudo registrar la compra: '+(typeof explicarError==='function'?explicarError(e,'registrar compra'):(e?.message||'error desconocido')),false); }
      finally{ confirmar.disabled=false; }
    });

    function activar(){
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b===tab));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('visible',p===section));
      poblar(); render();
      if(producto.value) cargarPresentaciones();
    }
    tab.addEventListener('click',activar);
    poblar(); render(); actualizarCamposPresentacion();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
