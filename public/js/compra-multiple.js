// ==== BattleCruiser · js/compra-multiple.js ====
// Extiende el formulario de compra existente a un documento con N líneas.
// No crea una segunda sección de compras.
(function(){
  function init(){
    const form=document.getElementById('form-compra');
    if(!form || form.dataset.multipleCompra==='1') return;
    form.dataset.multipleCompra='1';
    const producto=form.querySelector('#compra-producto');
    const almacen=form.querySelector('#compra-almacen');
    const presentacion=form.querySelector('#compra-presentacion');
    const cantidad=form.querySelector('#compra-cantidad');
    const costo=form.querySelector('#compra-costo');
    if(!producto||!almacen||!presentacion||!cantidad||!costo) return;
    const resumen=document.getElementById('compra-resumen');
    const proveedorInput=document.createElement('input'); proveedorInput.id='compra-proveedor-multiple'; proveedorInput.placeholder='Proveedor (opcional)';
    const fechaInput=document.createElement('input'); fechaInput.id='compra-fecha-multiple'; fechaInput.type='datetime-local';
    fechaInput.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    form.insertBefore(proveedorInput, producto); form.insertBefore(fechaInput, producto);
    const add=document.createElement('button'); add.type='button'; add.id='compra-agregar-linea'; add.textContent='+ Agregar producto';
    const lista=document.createElement('div'); lista.id='compra-lineas-multiples'; lista.className='lista';
    const total=document.createElement('div'); total.id='compra-total-multiple'; total.className='venta-total'; total.innerHTML='<span>Total compra</span><span id="compra-total-multiple-valor">$0.00</span>';
    const confirmar=form.querySelector('button[type="submit"]');
    if(confirmar) confirmar.textContent='Registrar compra completa';
    form.insertBefore(add, confirmar || null); form.parentNode.insertBefore(lista, form.nextSibling); form.parentNode.insertBefore(total, lista.nextSibling);
    let lineas=[];
    function prodName(id){ const p=(typeof _cache!=='undefined'&&_cache.productos||[]).find(x=>x.id===id); return p?p.nombre:id; }
    function render(){
      lista.innerHTML=lineas.length?lineas.map((l,i)=>`<div class="lista-item"><span><strong>${escHtml(prodName(l.producto_id))}</strong><span class="muted"> · ${l.cantidad} ${l.presentacion_nombre||'u'} × $${Number(l.costo_unitario).toFixed(2)} = $${(l.cantidad*l.costo_unitario).toFixed(2)}</span></span><button type="button" data-compra-eliminar="${i}">Eliminar</button></div>`).join(''):'<p class="lista-estado">Agrega los productos recibidos uno por uno y luego registra la compra completa.</p>';
      const t=lineas.reduce((s,l)=>s+l.cantidad*l.costo_unitario,0); document.getElementById('compra-total-multiple-valor').textContent='$'+t.toFixed(2);
    }
    function addLine(){
      const pid=producto.value, qty=Number(cantidad.value), cost=Number(costo.value), pp=presentacion.value||null;
      if(!pid||!Number.isFinite(qty)||qty<=0||!Number.isFinite(cost)||cost<0) return;
      const ppo=(typeof presentacionCompraActual==='function')?presentacionCompraActual():null;
      const existing=lineas.find(l=>l.producto_id===pid && l.presentacion_id===pp);
      if(existing) existing.cantidad+=qty; else lineas.push({producto_id:pid,cantidad:qty,costo_unitario:cost,presentacion_id:pp,cantidad_presentacion:pp?qty:null,presentacion_nombre:ppo&&ppo.presentaciones?ppo.presentaciones.nombre:null});
      cantidad.value=''; costo.value=''; if(resumen) resumen.classList.add('hidden'); render();
    }
    add.addEventListener('click',addLine);
    lista.addEventListener('click',e=>{const b=e.target.closest('[data-compra-eliminar]');if(b){lineas.splice(Number(b.dataset.compraEliminar),1);render();}});
    form.addEventListener('submit',async e=>{
      e.preventDefault(); e.stopImmediatePropagation();
      if(!lineas.length){setMsg('msg-productos','Agrega al menos un producto a la compra.',false);return;}
      if(!almacen.value){setMsg('msg-productos','Selecciona el almacén.',false);return;}
      const btn=form.querySelector('button[type="submit"]'); btn.disabled=true;
      const {data,error}=await client.rpc('registrar_compra_multiple',{p_almacen_id:almacen.value,p_proveedor:proveedorInput.value.trim()||null,p_fecha:fechaInput.value?new Date(fechaInput.value).toISOString():new Date().toISOString(),p_lineas:lineas.map(l=>({producto_id:l.producto_id,cantidad:l.presentacion_id?null:l.cantidad,costo_unitario:l.costo_unitario,presentacion_id:l.presentacion_id,cantidad_presentacion:l.cantidad_presentacion})),p_idempotency_key:crypto.randomUUID()});
      btn.disabled=false;
      if(error){setMsg('msg-productos','No se pudo registrar la compra: '+explicarError(error,'registrar compra'),false);return;}
      lineas=[]; proveedorInput.value=''; fechaInput.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); form.reset(); render(); setMsg('msg-productos','✓ Compra registrada completa. Stock actualizado.',true);
      if(typeof refrescarStockYSelects==='function') await refrescarStockYSelects();
    });
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
