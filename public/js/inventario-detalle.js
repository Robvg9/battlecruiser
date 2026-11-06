/* BattleCruiser — detalle de inventario y mínimo por almacén */
(function () {
  'use strict';
  const esc = v => typeof window.escHtml === 'function'
    ? window.escHtml(String(v ?? '—'))
    : String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const qtyFmt = v => typeof window.numberFmt === 'function'
    ? window.numberFmt(v)
    : new Intl.NumberFormat('es-ES',{useGrouping:true,maximumFractionDigits:2})
      .formatToParts(num(v)).map(p=>p.type==='group'?'\u202f':p.value).join('');
  const estadoLabel = s => s==='agotado'?'🔴 Agotado':s==='bajo'?'🟡 Bajo mínimo':'🟢 Disponible';
  const puedeEditar = () => typeof window.tienePermiso==='function' && window.tienePermiso('stock','editar')===true;
  let filaActual = null;

  function estadoAlmacen(w) {
    if (num(w.cantidad)<=0) return 'agotado';
    if (w.minimo!=null && num(w.cantidad)<=num(w.minimo)) return 'bajo';
    return 'normal';
  }
  function recalcular(f) {
    f.almacenes.forEach(w=>w.estado=estadoAlmacen(w));
    f.cantidad=f.almacenes.reduce((s,w)=>s+num(w.cantidad),0);
    f.estado=f.cantidad<=0?'agotado':f.almacenes.some(w=>w.estado==='bajo')?'bajo':'normal';
  }
  function ensureModal() {
    let m=document.getElementById('bc-inv-producto-modal');
    if(m)return m;
    m=document.createElement('div');m.id='bc-inv-producto-modal';m.className='hidden';
    m.innerHTML='<div class="bc-inv-modal-backdrop" data-bc-inv-close="1"></div><section class="bc-inv-modal-card" role="dialog" aria-modal="true" aria-labelledby="bc-inv-modal-title" tabindex="-1"><button type="button" class="bc-inv-modal-close" data-bc-inv-close="1" aria-label="Cerrar">×</button><h2 id="bc-inv-modal-title"></h2><div class="bc-inv-modal-body"></div></section>';
    document.body.appendChild(m);
    m.addEventListener('click',e=>{
      if(e.target.closest('[data-bc-inv-close]')){m.classList.add('hidden');return;}
      const b=e.target.closest('[data-bc-save-minimum]');
      if(b){e.preventDefault();guardarMinimo(b);}
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.classList.contains('hidden'))m.classList.add('hidden');});
    return m;
  }

  function abrir(fila, aviso) {
    filaActual=fila;
    const m=ensureModal(), body=m.querySelector('.bc-inv-modal-body');
    const stores=Array.isArray(fila.almacenes)&&fila.almacenes.length?fila.almacenes:
      [{almacen:fila.almacen,almacen_id:fila.almacen_id,cantidad:fila.cantidad,minimo:fila.minimo,estado:fila.estado,unidad:fila.unidad,variantes:fila.variantes}];
    const total=stores.reduce((s,w)=>s+num(w.cantidad),0), canEdit=puedeEditar();
    m.querySelector('h2').textContent=fila.producto||'Producto';
    body.innerHTML='<div class="bc-inv-product-summary"><span>'+esc(estadoLabel(fila.estado))+'</span><strong>'+esc(qtyFmt(total)+' '+(fila.unidad||'u'))+'</strong><span>existencias totales · '+esc(qtyFmt(stores.length))+' almacenes</span></div>'+
      stores.map(w=>{
        const variants=Array.isArray(w.variantes)?w.variantes:[], status=estadoAlmacen(w);
        const editable=canEdit&&fila.producto_id&&w.almacen_id&&variants.length===0;
        const minimum=w.minimo==null?0:num(w.minimo);
        const saved=aviso&&String(aviso.almacenId)===String(w.almacen_id)?'<div class="bc-inv-minimum-feedback is-success" role="status">'+esc(aviso.message)+'</div>':'';
        return '<section class="bc-inv-warehouse-detail" data-warehouse-id="'+esc(w.almacen_id||'')+'">'+
          '<div class="bc-inv-warehouse-heading"><strong>'+esc(w.almacen||'Almacén')+'</strong><span>'+esc(estadoLabel(status))+'</span></div>'+
          '<div class="bc-inv-detail-row"><span>Stock actual</span><strong>'+esc(qtyFmt(w.cantidad)+' '+(w.unidad||fila.unidad||'u'))+'</strong></div>'+
          '<div class="bc-inv-minimum-editor"><label>Stock mínimo</label>'+
          (editable?'<div class="bc-inv-minimum-controls"><input data-bc-minimum-input type="number" min="0" step="any" inputmode="decimal" value="'+esc(String(minimum))+'" aria-label="Stock mínimo de '+esc(w.almacen||'almacén')+'"><button type="button" class="bc-inv-minimum-save" data-bc-save-minimum data-product-id="'+esc(fila.producto_id)+'" data-warehouse-id="'+esc(w.almacen_id)+'">Guardar</button></div>':'<strong class="bc-inv-minimum-readonly">'+esc(qtyFmt(minimum))+'</strong>')+
          saved+(variants.length?'<p class="bc-inv-minimum-hint">El mínimo de inventario por variantes está en modo de solo lectura.</p>':(!canEdit?'<p class="bc-inv-minimum-hint">Tu rol no tiene permiso para editar el stock mínimo.</p>':''))+'</div>'+
          (variants.length?'<div class="bc-inv-variants-title">Existencias por sabor / variante</div>'+variants.map(v=>'<div class="bc-inv-variant-row"><span>'+esc(v.nombre||'Variante')+'</span><strong>'+esc(qtyFmt(v.cantidad)+' '+(v.unidad||w.unidad||'u'))+'</strong></div>').join(''):'')+
          '</section>';
      }).join('');
    m.classList.remove('hidden');m.querySelector('.bc-inv-modal-card').focus();
  }

  async function guardarMinimo(button) {
    if(button.disabled)return;
    const section=button.closest('.bc-inv-warehouse-detail'), input=section&&section.querySelector('[data-bc-minimum-input]');
    const productId=button.dataset.productId, warehouseId=button.dataset.warehouseId;
    if(!section||!input)return;
    let feedback=section.querySelector('.bc-inv-minimum-feedback');
    if(!feedback){feedback=document.createElement('div');feedback.className='bc-inv-minimum-feedback';feedback.setAttribute('role','status');section.querySelector('.bc-inv-minimum-editor').appendChild(feedback);}
    const raw=String(input.value||'').trim(), value=raw===''?NaN:Number(raw);
    if(!Number.isFinite(value)||value<0){feedback.className='bc-inv-minimum-feedback is-error';feedback.textContent='Introduce un mínimo válido igual o mayor que 0.';input.focus();return;}
    if(!puedeEditar()){feedback.className='bc-inv-minimum-feedback is-error';feedback.textContent='Tu rol no tiene permiso para editar el stock mínimo.';return;}
    if(!window.client||typeof window.client.rpc!=='function'){feedback.className='bc-inv-minimum-feedback is-error';feedback.textContent='No está disponible la conexión con el inventario.';return;}
    const label=button.textContent;button.disabled=true;input.disabled=true;button.textContent='Guardando…';feedback.textContent='Guardando mínimo…';feedback.className='bc-inv-minimum-feedback';
    try{
      const result=await window.client.rpc('bc_actualizar_stock_minimo',{p_producto_id:productId,p_almacen_id:warehouseId,p_minimo:value});
      if(!result||result.error)throw new Error(result&&result.error&&(result.error.message||result.error.details)||'No se pudo guardar el mínimo.');
      let updated=null;
      if(typeof window.refrescarInventario==='function'){
        try{await window.refrescarInventario();const current=Array.isArray(window._invFilas)?window._invFilas:[];updated=current.find(r=>String(r.producto_id)===String(productId))||null;}catch(_){}
      }
      const target=updated||filaActual;
      if(target&&Array.isArray(target.almacenes)){
        const wh=target.almacenes.find(w=>String(w.almacen_id)===String(warehouseId));
        if(wh){wh.minimo=value;recalcular(target);}
      }
      abrir(target||filaActual,{almacenId:warehouseId,message:'✓ Stock mínimo guardado.'});
    }catch(error){
      button.disabled=false;input.disabled=false;button.textContent=label;
      feedback.className='bc-inv-minimum-feedback is-error';
      feedback.textContent='No se pudo guardar: '+String(error&&error.message||error);
    }
  }

  function bind() {
    const list=document.getElementById('inv-detalle');
    if(!list){setTimeout(bind,500);return;}
    if(list.dataset.bcInvDetailBound==='1')return;
    list.dataset.bcInvDetailBound='1';
    const style=document.createElement('style');
    style.textContent=
      '#bc-inv-producto-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:10px}'+
      '#bc-inv-producto-modal.hidden{display:none}.bc-inv-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72)}'+
      '.bc-inv-modal-card{position:relative;width:min(600px,100%);max-height:88vh;overflow:auto;background:var(--void,#0c1c18);border:1px solid var(--gold,#c9a24d);border-radius:10px;padding:14px;color:var(--text,#eee);box-shadow:0 18px 60px rgba(0,0,0,.5)}'+
      '.bc-inv-modal-card h2{margin:0 38px 9px 0;color:var(--gold,#c9a24d);font-size:1.2rem}.bc-inv-modal-close{position:absolute;right:9px;top:5px;border:0;background:none;color:var(--mist,#aaa);font-size:26px;cursor:pointer}'+
      '.bc-inv-product-summary{display:flex;align-items:center;flex-wrap:wrap;gap:5px 10px;margin-bottom:8px;font-size:.75rem;color:var(--mist,#aaa)}.bc-inv-product-summary strong{color:var(--text,#eee);font-size:.95rem}'+
      '.bc-inv-warehouse-detail{padding:9px 0;border-top:1px solid rgba(201,162,77,.16)}.bc-inv-warehouse-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px}.bc-inv-warehouse-heading strong{font-size:.88rem}.bc-inv-warehouse-heading span{font-size:.68rem;color:var(--mist,#aaa);white-space:nowrap}'+
      '.bc-inv-detail-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:.8rem}.bc-inv-detail-row span{color:var(--mist,#aaa)}'+
      '.bc-inv-minimum-editor{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 12px;padding-top:3px;font-size:.8rem}.bc-inv-minimum-editor>label{color:var(--mist,#aaa)}.bc-inv-minimum-controls{display:flex;align-items:center;gap:6px;min-width:0}'+
      '.bc-inv-minimum-controls input{width:105px;min-width:0;height:34px;box-sizing:border-box;padding:0 8px;border:1px solid rgba(201,162,77,.35);border-radius:6px;background:var(--void,#0c1c18);color:var(--text,#eee);font:inherit}'+
      '.bc-inv-minimum-save{height:34px;padding:0 11px;border:0;border-radius:6px;background:linear-gradient(180deg,var(--gold-bright,#e0bd69),var(--gold,#c9a24d));color:#211605;font-weight:600;font-size:.75rem;cursor:pointer;white-space:nowrap}.bc-inv-minimum-save:disabled{opacity:.55;cursor:wait}'+
      '.bc-inv-minimum-readonly{color:var(--text,#eee);justify-self:end}.bc-inv-minimum-feedback{grid-column:1/-1;min-height:1em;font-size:.7rem;color:var(--mist,#aaa)}.bc-inv-minimum-feedback.is-success{color:#9fc4ad}.bc-inv-minimum-feedback.is-error{color:#e88a96}.bc-inv-minimum-hint{grid-column:1/-1;margin:0;font-size:.67rem;color:var(--mist,#aaa)}'+
      '.bc-inv-variants-title{padding-top:6px;font-size:.69rem;color:var(--gold,#c9a24d)}.bc-inv-variant-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:.75rem;color:var(--mist,#aaa)}.bc-inv-variant-row strong{color:var(--text,#eee)}'+
      '.rep-fila[data-inv-producto]{cursor:pointer}.rep-fila[data-inv-producto]:focus{outline:1px solid var(--gold,#c9a24d);outline-offset:2px}@media(max-width:480px){.bc-inv-modal-card{padding:12px}.bc-inv-minimum-controls input{width:82px}.bc-inv-minimum-editor{gap:5px}}';
    document.head.appendChild(style);

    const render=()=>{
      const filas=Array.isArray(window._invFilas)?window._invFilas:[];
      const rows=Array.from(list.querySelectorAll('.rep-fila')).filter(x=>!x.classList.contains('rep-totales'));
      rows.forEach((row,i)=>{if(!filas[i])return;row.dataset.invProducto=filas[i].producto_id||'';row.setAttribute('role','button');row.setAttribute('tabindex','0');});
    };
    const openFromRow=row=>{
      const filas=Array.isArray(window._invFilas)?window._invFilas:[];
      const rows=Array.from(list.querySelectorAll('.rep-fila[data-inv-producto]'));
      const f=filas[rows.indexOf(row)];if(f)abrir(f);
    };
    list.addEventListener('click',e=>{
      if(e.target.closest('.bc-m53-variant-details')){e.stopPropagation();return;}
      const row=e.target.closest('.rep-fila[data-inv-producto]');if(row)openFromRow(row);
    });
    list.addEventListener('keydown',e=>{
      if(e.target.closest('.bc-m53-variant-details')){e.stopPropagation();return;}
      if(e.key!=='Enter'&&e.key!==' ')return;
      const row=e.target.closest('.rep-fila[data-inv-producto]');if(!row)return;
      e.preventDefault();openFromRow(row);
    });
    new MutationObserver(render).observe(list,{childList:true,subtree:true});render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();