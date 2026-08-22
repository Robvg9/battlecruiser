/* BattleCruiser M23 — Historiales Premium
 * No reemplaza reportes: mejora su presentación y usa el RPC premium solo para detalle.
 */
(function(){
  'use strict';
  const boot=()=>{
    const lista=document.getElementById('rep-detalle');
    if(!lista || document.getElementById('bc-m23-style')) return;
    const style=document.createElement('style'); style.id='bc-m23-style'; style.textContent=`
      #rep-detalle .rep-fila{position:relative;display:block;padding:14px 15px;margin:8px 0;border:1px solid rgba(201,162,77,.18);border-radius:10px;background:linear-gradient(135deg,rgba(255,255,255,.035),rgba(255,255,255,.012));cursor:pointer;transition:transform .16s ease,border-color .16s ease,background .16s ease}
      #rep-detalle .rep-fila:hover{transform:translateY(-1px);border-color:rgba(201,162,77,.4);background:rgba(201,162,77,.055)}
      #rep-detalle .rep-fila::after{content:'›';position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:22px;color:var(--gold,#c9a24d);opacity:.65}
      #rep-detalle .rep-fila-principal{display:block;padding-right:24px}
      #rep-detalle .rep-linea{margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.05)}
      #bc-m23-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 12px}
      .bc-m23-chip{padding:8px 10px;border:1px solid rgba(201,162,77,.14);border-radius:8px;background:rgba(255,255,255,.025)}
      .bc-m23-chip small{display:block;color:var(--mist,#aaa);font-size:10px;margin-bottom:3px}.bc-m23-chip strong{font-size:12px}
      .bc-m23-detail-lines{margin-top:12px}.bc-m23-line{display:flex;justify-content:space-between;gap:12px;padding:9px 10px;border-bottom:1px solid rgba(201,162,77,.09)}
      @media(max-width:650px){#bc-m23-meta{grid-template-columns:1fr 1fr}.bc-m23-line{display:block}.bc-m23-line strong{display:block;margin-top:3px}}
    `; document.head.appendChild(style);

    let meta=document.getElementById('bc-m23-meta');
    if(!meta){meta=document.createElement('div');meta.id='bc-m23-meta';lista.parentNode.insertBefore(meta,lista);}

    const tipo=()=>window._repSubreporte||'ventas';
    const setMeta=(rows)=>{
      const total=rows.filter(x=>!x.classList.contains('rep-totales')).length;
      meta.innerHTML=[['Historial',tipo()],['Registros',total],['Estado','Consultable'],['Detalle','Tocar una fila']].map(x=>`<div class="bc-m23-chip"><small>${esc(x[0])}</small><strong>${esc(x[1])}</strong></div>`).join('');
    };
    const decorate=()=>{
      const rows=[...lista.querySelectorAll('.rep-fila:not(.rep-totales)')];
      rows.forEach(r=>{r.setAttribute('role','button');r.setAttribute('tabindex','0');});setMeta(rows);
    };
    new MutationObserver(decorate).observe(lista,{childList:true,subtree:true}); decorate();

    function esc(v){return typeof escHtml==='function'?escHtml(String(v??'—')):String(v??'—');}
    async function premiumDetail(row){
      if(!row||row.classList.contains('rep-totales'))return;
      const rows=[...lista.querySelectorAll('.rep-fila:not(.rep-totales)')];
      const index=rows.indexOf(row); if(index<0)return;
      const sub=tipo();
      const rpcMap={ventas:'reporte_ventas',transferencias:'reporte_transferencias',compras:'historial_compras',movimiento:'reporte_movimiento_inventario'};
      try{
        const f=typeof leerFiltrosReportes==='function'?leerFiltrosReportes():{};
        let q;
        if(sub==='ventas')q=await client.rpc('reporte_ventas',{p_desde:f.desde,p_hasta:f.hasta,p_almacen_id:f.almacen,p_producto_id:null,p_limite:_REP_POR_PAG,p_offset:(window._repPagina||0)*_REP_POR_PAG});
        else if(sub==='transferencias')q=await client.rpc('reporte_transferencias',{p_desde:f.desde,p_hasta:f.hasta,p_origen_id:f.almacen,p_destino_id:null,p_estado:null,p_limite:_REP_POR_PAG,p_offset:(window._repPagina||0)*_REP_POR_PAG});
        else if(sub==='compras')q=await client.rpc('historial_compras',{p_desde:f.desde,p_hasta:f.hasta,p_almacen_id:f.almacen,p_limite:_REP_POR_PAG,p_offset:(window._repPagina||0)*_REP_POR_PAG});
        else if(sub==='movimiento')q=await client.rpc('reporte_movimiento_inventario',{p_desde:f.desde,p_hasta:f.hasta,p_producto_id:null,p_almacen_id:f.almacen,p_limite:_REP_POR_PAG,p_offset:(window._repPagina||0)*_REP_POR_PAG});
        if(!q||q.error)throw(q&&q.error)||new Error('No se pudo obtener el registro');
        const base=q.data?.[index]; if(!base)throw new Error('Registro no encontrado');
        const id=base.id||base.lote_id||base.operacion_id;
        const d=await client.rpc('historial_premium_detalle',{p_tipo:sub,p_id:id});
        if(d.error)throw d.error;
        mostrar(d.data||{});
      }catch(e){console.warn('[Battlecruiser] M23 detalle premium:',e); if(window.BattleCruiserHistorialDetalle)window.BattleCruiserHistorialDetalle.openDetail(row);}
    }
    function mostrar(d){
      let m=document.getElementById('bc-m23-modal');if(!m){m=document.createElement('div');m.id='bc-m23-modal';m.className='hidden';m.innerHTML='<div class="historial-detalle-backdrop"></div><section class="historial-detalle-card"><button type="button" class="historial-detalle-close">×</button><h2></h2><div class="bc-m23-body"></div></section>';document.body.appendChild(m);m.querySelector('.historial-detalle-close').onclick=()=>m.classList.add('hidden');m.querySelector('.historial-detalle-backdrop').onclick=()=>m.classList.add('hidden');}
      const labels={fecha:'Fecha y hora',usuario:'Usuario',almacen:'Almacén',estado:'Estado',tipo:'Tipo',proveedor:'Proveedor',origen:'Origen',destino:'Destino',producto:'Producto',cantidad:'Cantidad',cantidad_restante:'Restante',costo_unitario:'Costo unidad',costo_total:'Costo total',total:'Total',direccion:'Dirección',resumen:'Resumen'};
      const body=m.querySelector('.bc-m23-body');m.querySelector('h2').textContent=(d.tipo||'Registro')+' · Detalle';
      const skip=new Set(['id','lineas']);let html='<div class="bc-m23-detail-lines">';Object.entries(d).forEach(([k,v])=>{if(skip.has(k)||v==null||typeof v==='object')return;html+=`<div class="bc-m23-line"><span>${esc(labels[k]||k)}</span><strong>${esc(k.includes('costo')||k==='total'?'$'+(Number(v)||0):v)}</strong></div>`});
      if(Array.isArray(d.lineas)){d.lineas.forEach((l,i)=>{html+=`<div class="bc-m23-line"><span>${esc((i+1)+'. '+(l.producto||'Producto'))}</span><strong>${esc((l.cantidad??0)+' u'+(l.precio_unitario!=null?' · $'+l.precio_unitario:''))}</strong></div>`})}
      html+='</div>';body.innerHTML=html;m.classList.remove('hidden');
    }
    lista.addEventListener('click',e=>{const r=e.target.closest('.rep-fila:not(.rep-totales)');if(r)premiumDetail(r)});
    lista.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const r=e.target.closest('.rep-fila:not(.rep-totales)');if(r){e.preventDefault();premiumDetail(r)}});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,300);
})();
