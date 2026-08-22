// ==== BattleCruiser · js/compras.js ====
// Compra múltiple: un documento con N líneas, almacén, proveedor, fecha y costo.

(function initComprasMultiples(){
  function esc(v){ return typeof escHtml === 'function' ? escHtml(String(v ?? '')) : String(v ?? ''); }
  function productos(){ return (typeof _cache !== 'undefined' && Array.isArray(_cache.productos)) ? _cache.productos : []; }
  function almacenes(){ return (typeof _cache !== 'undefined' && Array.isArray(_cache.almacenes)) ? _cache.almacenes : []; }

  function construirUI(){
    const tabs=document.getElementById('tabs');
    const main=document.querySelector('.main-content');
    if(!tabs || !main || document.getElementById('tab-compras')) return;

    const btn=document.createElement('button');
    btn.className='tab-btn'; btn.dataset.tab='compras'; btn.type='button'; btn.textContent='Compras';
    const ref=Array.from(tabs.querySelectorAll('.tab-btn')).find(x=>x.dataset.tab==='ventas');
    if(ref) ref.insertAdjacentElement('beforebegin',btn); else tabs.appendChild(btn);

    const panel=document.createElement('section');
    panel.id='tab-compras'; panel.className='tab-panel';
    panel.innerHTML=`
      <div class="card">
        <h2>Registrar compra</h2>
        <p class="muted">Agrega todos los productos recibidos y confirma la compra una sola vez.</p>
        <div class="form-grid">
          <div class="field"><label for="compra-almacen">Almacén</label><select id="compra-almacen"></select></div>
          <div class="field"><label for="compra-proveedor">Proveedor</label><input id="compra-proveedor" type="text" maxlength="160" placeholder="Opcional"></div>
          <div class="field"><label for="compra-fecha">Fecha</label><input id="compra-fecha" type="datetime-local"></div>
        </div>
        <hr>
        <div class="form-grid">
          <div class="field"><label for="compra-producto">Producto</label><select id="compra-producto"></select></div>
          <div class="field"><label for="compra-cantidad">Cantidad</label><input id="compra-cantidad" type="number" min="0.001" step="0.001" placeholder="0"></div>
          <div class="field"><label for="compra-costo">Costo unitario</label><input id="compra-costo" type="number" min="0" step="0.01" placeholder="0.00"></div>
          <div class="field"><label>&nbsp;</label><button type="button" id="compra-agregar-linea">+ Agregar producto</button></div>
        </div>
        <div id="compra-lineas" class="lista"></div>
        <div class="compra-total" id="compra-total">Total: $0.00</div>
        <div class="btn-row"><button type="button" id="compra-confirmar">Registrar compra completa</button><button type="button" id="compra-limpiar">Limpiar</button></div>
        <p class="msg" id="compra-msg"></p>
      </div>`;
    main.appendChild(panel);

    document.getElementById('compra-fecha').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    poblarSelects();
    eventos();
  }

  function poblarSelects(){
    const a=document.getElementById('compra-almacen'); const p=document.getElementById('compra-producto');
    if(a){ a.innerHTML='<option value="">Selecciona almacén</option>'+almacenes().map(x=>`<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join(''); }
    if(p){ p.innerHTML='<option value="">Selecciona producto</option>'+productos().filter(x=>x.activo!==false).map(x=>`<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join(''); }
  }

  let lineas=[];
  function render(){
    const el=document.getElementById('compra-lineas'); if(!el) return;
    if(!lineas.length){ el.innerHTML='<p class="lista-estado">Todavía no hay productos en la compra.</p>'; document.getElementById('compra-total').textContent='Total: $0.00'; return; }
    el.innerHTML='';
    lineas.forEach((l,i)=>{
      const d=document.createElement('div'); d.className='lista-item';
      d.innerHTML=`<div><strong>${esc(l.nombre)}</strong><div class="muted">${l.cantidad} u × $${Number(l.costo).toFixed(2)} = $${(l.cantidad*l.costo).toFixed(2)}</div></div><button type="button" data-eliminar-linea="${i}" class="icon-btn" aria-label="Eliminar línea">✕</button>`;
      el.appendChild(d);
    });
    const total=lineas.reduce((s,l)=>s+l.cantidad*l.costo,0);
    document.getElementById('compra-total').textContent='Total: $'+total.toFixed(2);
  }

  function agregar(){
    const pid=document.getElementById('compra-producto').value;
    const cantidad=Number(document.getElementById('compra-cantidad').value);
    const costo=Number(document.getElementById('compra-costo').value);
    const msg=document.getElementById('compra-msg');
    const prod=productos().find(x=>x.id===pid);
    if(!pid || !prod){msg.textContent='Selecciona un producto.';return;}
    if(!Number.isFinite(cantidad)||cantidad<=0){msg.textContent='La cantidad debe ser mayor que 0.';return;}
    if(!Number.isFinite(costo)||costo<0){msg.textContent='El costo no puede ser negativo.';return;}
    const existente=lineas.find(x=>x.producto_id===pid);
    if(existente){ existente.cantidad+=cantidad; existente.costo=costo; }
    else lineas.push({producto_id:pid,nombre:prod.nombre,cantidad,costo});
    document.getElementById('compra-cantidad').value=''; document.getElementById('compra-costo').value=''; msg.textContent=''; render();
  }

  async function confirmar(){
    const msg=document.getElementById('compra-msg');
    const almacen=document.getElementById('compra-almacen').value;
    const proveedor=document.getElementById('compra-proveedor').value.trim() || null;
    const fecha=document.getElementById('compra-fecha').value;
    if(!almacen){msg.textContent='Selecciona el almacén.';return;}
    if(!lineas.length){msg.textContent='Agrega al menos un producto.';return;}
    const key=crypto.randomUUID();
    const payload=lineas.map(l=>({producto_id:l.producto_id,cantidad:l.cantidad,costo_unitario:l.costo}));
    const btn=document.getElementById('compra-confirmar'); btn.disabled=true;
    if(typeof showLoading==='function') showLoading();
    try{
      const {data,error}=await client.rpc('registrar_compra_multiple',{p_almacen_id:almacen,p_proveedor:proveedor,p_fecha:fecha?new Date(fecha).toISOString():new Date().toISOString(),p_lineas:payload,p_idempotency_key:key});
      if(error) throw error;
      msg.textContent='✓ Compra registrada correctamente.';
      lineas=[]; render();
      if(typeof cargarCatalogos==='function') await cargarCatalogos();
      else if(typeof refrescarProductos==='function') await refrescarProductos();
    }catch(e){
      console.error('[BattleCruiser] registrar_compra_multiple:',e);
      msg.textContent='No se pudo registrar la compra: '+String(e?.message||e);
    }finally{ if(typeof hideLoading==='function') hideLoading(); btn.disabled=false; }
  }

  function limpiar(){lineas=[];document.getElementById('compra-proveedor').value='';document.getElementById('compra-msg').textContent='';render();}
  function eventos(){
    document.getElementById('compra-agregar-linea').addEventListener('click',agregar);
    document.getElementById('compra-confirmar').addEventListener('click',confirmar);
    document.getElementById('compra-limpiar').addEventListener('click',limpiar);
    document.getElementById('compra-lineas').addEventListener('click',e=>{const b=e.target.closest('[data-eliminar-linea]');if(!b)return;lineas.splice(Number(b.dataset.eliminarLinea),1);render();});
  }
  window.refrescarCompras=function(){ poblarSelects(); render(); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',construirUI,{once:true}); else construirUI();
})();
