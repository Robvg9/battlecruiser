/* BattleCruiser — Historiales: fila resumida + detalle completo */
(function(){
  'use strict';
  if (document.getElementById('bc-historial-detalle-style')) return;
  const style=document.createElement('style'); style.id='bc-historial-detalle-style'; style.textContent=`
    #historial-detalle-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}
    #historial-detalle-modal.hidden{display:none}
    .historial-detalle-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72)}
    .historial-detalle-card{position:relative;width:min(680px,100%);max-height:min(86vh,760px);overflow:auto;background:var(--void,#0c1c18);border:1px solid var(--gold-dim,#c9a24d55);border-radius:10px;box-shadow:0 18px 60px rgba(0,0,0,.45);padding:18px;color:var(--text,#eee)}
    .historial-detalle-card h2{margin:0 42px 16px 0;font-size:20px;color:var(--gold,#c9a24d)}
    .historial-detalle-close{position:absolute;right:12px;top:10px;background:transparent;border:0;color:var(--mist,#aaa);font-size:28px;cursor:pointer}
    .historial-detalle-row{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1.5fr);gap:12px;padding:9px 0;border-bottom:1px solid rgba(201,162,77,.12)}
    .historial-detalle-row span{color:var(--mist,#aaa);font-size:12px;text-transform:none}
    .historial-detalle-row strong{font-weight:500;overflow-wrap:anywhere}
    .historial-detalle-section{margin:16px 0 6px;color:var(--gold,#c9a24d);font-weight:600}
    .historial-detalle-fila{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;margin:4px 0;background:rgba(255,255,255,.025);border-radius:5px}
    .rep-fila.lista-item-accion{cursor:pointer}
    .rep-fila.lista-item-accion:focus{outline:1px solid var(--gold,#c9a24d);outline-offset:2px}
    @media(max-width:560px){#historial-detalle-modal{padding:8px}.historial-detalle-card{max-height:92vh;padding:14px}.historial-detalle-row{grid-template-columns:1fr;gap:3px}}
  `; document.head.appendChild(style);

  const esc=v=>typeof escHtml==='function'?escHtml(String(v??'—')):String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moneySafe=v=>typeof money==='function'?'$'+money(v):String(v??'—');
  const labels={id:'Referencia',fecha:'Fecha y hora',fecha_compra:'Fecha de compra',almacen:'Almacén',origen:'Almacén origen',destino:'Almacén destino',estado:'Estado',tipo:'Tipo',producto:'Producto',categoria:'Categoría',cantidad:'Cantidad',cantidad_inicial:'Cantidad inicial',cantidad_restante:'Cantidad restante',minimo:'Mínimo',unidades:'Unidades',total:'Total',ingreso:'Ingreso',costo_total:'Costo total / CMV',costo_unitario:'Costo unitario',margen:'Ganancia',margen_porcentaje:'Margen %',direccion:'Dirección'};
  const tituloMap={ventas:'Venta',transferencias:'Transferencia',vales:'Vale de salida',stock:'Stock',movimiento:'Movimiento de inventario',compras:'Compra',rentabilidad:'Rentabilidad'};

  function fmt(key,v){
    if(v===null||v===undefined||v==='') return '—';
    if((key==='fecha'||key==='fecha_compra')&&typeof fechaHoraCompleta==='function') return fechaHoraCompleta(v);
    if(['total','ingreso','costo_total','costo_unitario','margen'].includes(key)) return moneySafe(v);
    if(key==='margen_porcentaje') return (typeof money==='function'?money(v):v)+'%';
    if(typeof v==='boolean') return v?'Sí':'No';
    return String(v);
  }

  function ensureModal(){
    let el=document.getElementById('historial-detalle-modal');
    if(el) return el;
    el=document.createElement('div'); el.id='historial-detalle-modal'; el.className='hidden'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true');
    el.innerHTML='<div class="historial-detalle-backdrop"></div><section class="historial-detalle-card" tabindex="-1"><button type="button" class="historial-detalle-close" aria-label="Cerrar">×</button><h2></h2><div class="historial-detalle-body"></div></section>';
    document.body.appendChild(el);
    const close=()=>{el.classList.add('hidden');document.body.classList.remove('historial-detalle-abierto');};
    el.querySelector('.historial-detalle-close').onclick=close;
    el.querySelector('.historial-detalle-backdrop').onclick=close;
    el._close=close;
    return el;
  }

  function renderRow(row){
    const parts=[];
    Object.entries(row||{}).forEach(([k,v])=>{
      if(['lineas','almacenes','productos'].includes(k)||v===null||v===undefined||v==='') return;
      if(typeof v==='object') return;
      parts.push('<div class="historial-detalle-row"><span>'+esc(labels[k]||k)+'</span><strong>'+esc(fmt(k,v))+'</strong></div>');
    });
    if(row&&row.almacenes&&typeof row.almacenes==='object') parts.push('<div class="historial-detalle-row"><span>Almacén</span><strong>'+esc(row.almacenes.nombre||'—')+'</strong></div>');
    if(row&&row.productos&&typeof row.productos==='object') parts.push('<div class="historial-detalle-row"><span>Producto</span><strong>'+esc(row.productos.nombre||'—')+'</strong></div>');
    if(Array.isArray(row&&row.lineas)){
      parts.push('<div class="historial-detalle-section">Detalle de productos</div>');
      row.lineas.forEach((l,i)=>{
        const nombre=l.producto||l.nombre||l.producto_nombre||l.productos?.nombre||l.producto_id||'Producto';
        const vals=[]; if(l.cantidad!=null) vals.push(l.cantidad+' u'); if(l.precio_unitario!=null) vals.push(moneySafe(l.precio_unitario)); if(l.subtotal!=null) vals.push(moneySafe(l.subtotal));
        parts.push('<div class="historial-detalle-fila"><span>'+esc((i+1)+'. '+nombre)+'</span><strong>'+esc(vals.join(' · '))+'</strong></div>');
      });
    }
    return parts.join('')||'<p class="lista-estado">Sin detalles disponibles.</p>';
  }

  async function obtenerFila(sub,index){
    const f=leerFiltrosReportes(); const off=_repPagina*_REP_POR_PAG; let r;
    if(sub==='ventas') r=await client.rpc('reporte_ventas',{p_desde:f.desde,p_hasta:f.hasta,p_almacen_id:f.almacen,p_producto_id:null,p_limite:_REP_POR_PAG,p_offset:off});
    else if(sub==='transferencias') r=await client.rpc('reporte_transferencias',{p_desde:f.desde,p_hasta:f.hasta,p_origen_id:f.almacen,p_destino_id:null,p_estado:null,p_limite:_REP_POR_PAG,p_offset:off});
    else if(sub==='vales') r=await client.rpc('reporte_vales',{p_desde:f.desde,p_hasta:f.hasta,p_almacen_id:f.almacen,p_tipo:null,p_limite:_REP_POR_PAG,p_offset:off});
    else if(sub==='stock') r=await client.rpc('reporte_stock',{p_almacen_id:f.almacen,p_categoria_id:null});
    else if(sub==='movimiento') r=await client.rpc('reporte_movimiento_inventario',{p_desde:f.desde,p_hasta:f.hasta,p_producto_id:null,p_almacen_id:f.almacen,p_limite:_REP_POR_PAG,p_offset:off});
    else if(sub==='compras') r=await client.rpc('historial_compras',{p_desde:f.desde,p_hasta:f.hasta,p_almacen_id:f.almacen,p_limite:_REP_POR_PAG,p_offset:off});
    else if(sub==='rentabilidad') r=await client.rpc('rentabilidad_ventas',{p_desde:f.desde,p_hasta:f.hasta,p_almacen_id:f.almacen,p_limite:_REP_POR_PAG,p_offset:off});
    else return null;
    if(r.error) throw r.error;
    return Array.isArray(r.data)?r.data[index]:null;
  }

  async function openDetail(row){
    if(row.classList.contains('rep-totales')) return;
    const modal=ensureModal(); const body=modal.querySelector('.historial-detalle-body'); const h2=modal.querySelector('h2');
    const sub=typeof _repSubreporte!=='undefined'?_repSubreporte:'movimiento';
    const rows=Array.from(document.querySelectorAll('#rep-detalle .rep-fila:not(.rep-totales)')); const index=rows.indexOf(row);
    h2.textContent='Detalle · '+(tituloMap[sub]||'Registro'); body.innerHTML='<p class="lista-estado">Cargando detalle…</p>'; modal.classList.remove('hidden'); document.body.classList.add('historial-detalle-abierto'); modal.querySelector('.historial-detalle-card').focus();
    try{const data=await obtenerFila(sub,index); if(!data) throw new Error('Registro no encontrado'); h2.textContent=(tituloMap[sub]||'Registro')+(data.id&&typeof idCorto==='function'?' #'+idCorto(data.id):''); body.innerHTML=renderRow(data);}catch(e){body.innerHTML='<p class="lista-estado">No se pudo cargar el detalle completo.</p>';console.warn('[Battlecruiser] historial detalle:',e);}
  }

  function marcarFilas(){document.querySelectorAll('#rep-detalle .rep-fila:not(.rep-totales)').forEach(row=>{row.classList.add('lista-item-accion');row.setAttribute('role','button');row.setAttribute('tabindex','0');row.setAttribute('aria-label','Abrir detalle del registro');});}
  function bind(){
    const lista=document.getElementById('rep-detalle'); if(!lista) return;
    lista.addEventListener('click',e=>{const row=e.target.closest('.rep-fila:not(.rep-totales)');if(row)openDetail(row);});
    lista.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const row=e.target.closest('.rep-fila:not(.rep-totales)');if(row){e.preventDefault();openDetail(row);}});
    new MutationObserver(marcarFilas).observe(lista,{childList:true,subtree:true}); marcarFilas();
  }
  if(typeof safeInit==='function') safeInit('historiales-fila-detalle',bind); else if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  window.BattleCruiserHistorialDetalle={openDetail};
})();
