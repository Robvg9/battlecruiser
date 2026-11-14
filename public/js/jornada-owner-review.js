/* BattleCruiser — revisión integral de jornadas, Owner-only */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const money=v=>v==null?'—':Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const qty=v=>v==null?'—':Number(v||0).toLocaleString('es-ES',{maximumFractionDigits:3});
  const rpc=async(name,args)=>{
    const api=window.client||(typeof client!=='undefined'?client:null);
    if(!api||typeof api.rpc!=='function')throw new Error('Backend no disponible.');
    const result=await api.rpc(name,args||{});
    if(result.error)throw result.error;
    return result.data;
  };
  let activeTurnId=null,report=null,busy=false;
  function css(){
    if(document.getElementById('bc-jornada-review-style'))return;
    const style=document.createElement('style');style.id='bc-jornada-review-style';
    style.textContent=`
      #bc-jornada-review-modal{position:fixed;inset:0;z-index:10080;display:flex;align-items:center;justify-content:center;padding:2vh 2vw}
      #bc-jornada-review-modal[hidden]{display:none}
      .bcjr-backdrop{position:absolute;inset:0;background:rgba(10,18,30,.72);backdrop-filter:blur(3px)}
      .bcjr-dialog{position:relative;width:min(1440px,100%);max-height:96vh;overflow:auto;background:var(--stone,#122a24);color:var(--text,#f5efe3);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.35);padding:22px}
      .bcjr-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid var(--gold-dim,#9a7c3e);padding-bottom:14px;margin-bottom:16px}
      .bcjr-head h2{margin:0 0 5px;font-size:1.4rem}.bcjr-head p{margin:0;color:var(--mist,#c9c0a8)}
      .bcjr-close{border:0;background:transparent;font-size:28px;cursor:pointer;color:inherit}
      .bcjr-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:14px 0}
      .bcjr-card{border:1px solid var(--gold-dim,#9a7c3e);border-radius:12px;padding:12px;background:var(--stone-2,#1a3830)}
      .bcjr-card small{display:block;color:var(--mist,#c9c0a8);font-size:.78rem}.bcjr-card b{display:block;font-size:1.12rem;margin-top:5px;overflow-wrap:anywhere}
      .bcjr-session{border:1px solid var(--gold-dim,#9a7c3e);border-radius:14px;margin:16px 0;padding:16px}
      .bcjr-session h3{margin:0 0 8px}.bcjr-muted{color:var(--mist,#c9c0a8);font-size:.88rem}
      .bcjr-pill{display:inline-block;border-radius:999px;padding:4px 9px;background:rgba(201,192,168,.16);color:var(--text,#f5efe3);font-size:.78rem;font-weight:700}
      .bcjr-pill.warn{background:rgba(212,176,92,.18);color:var(--gold-bright,#efd48a)}.bcjr-pill.ok{background:rgba(90,160,112,.18);color:#9fd2aa}
      .bcjr-alert{border-left:4px solid var(--gold,#d4b05c);background:rgba(212,176,92,.12);padding:10px 12px;margin:10px 0;border-radius:6px}
      .bcjr-table-wrap{position:relative;isolation:isolate;overflow:auto;border:1px solid var(--gold-dim,#9a7c3e);border-radius:10px;margin:12px 0;z-index:0}
      .bcjr-table{border-collapse:collapse;width:100%;min-width:0;font-size:.82rem;table-layout:auto}
      .bcjr-stock-table{min-width:760px}.bcjr-finance-table{min-width:900px}
      .bcjr-table th,.bcjr-table td{padding:8px 9px;border-bottom:1px solid var(--gold-dim,#9a7c3e);white-space:nowrap;text-align:right}
      .bcjr-table th:first-child,.bcjr-table td:first-child{text-align:left;position:static;background:transparent;z-index:auto}
      .bcjr-table thead th{background:var(--stone-2,#1a3830);position:sticky;top:0;z-index:2}
      .bcjr-table tfoot td{font-weight:800;background:var(--stone-2,#1a3830)}
      .bcjr-field{display:flex;flex-wrap:wrap;align-items:end;gap:9px;margin:12px 0;padding:12px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:10px}
      .bcjr-field label{display:flex;flex-direction:column;gap:4px;font-size:.83rem}
      .bcjr-field input,.bcjr-field select,.bcjr-field textarea{padding:8px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:7px;max-width:100%}
      .bcjr-btn{border:1px solid var(--gold-dim,#9a7c3e);border-radius:9px;padding:9px 13px;background:var(--stone-2,#1a3830);color:var(--text,#f5efe3);cursor:pointer;font-weight:650}
      .bcjr-btn.primary{background:#315d4a;color:white;border-color:transparent}.bcjr-btn.danger{color:#ff8d86}
      .bcjr-btn:disabled{opacity:.45;cursor:not-allowed}
      .bcjr-footer{position:relative;z-index:10;background:var(--stone,#122a24);padding:14px 0 0;border-top:1px solid var(--gold-dim,#9a7c3e);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:18px}
      .bcjr-footer-actions{display:flex;gap:8px;flex-wrap:wrap}
      .bcjr-message{min-height:1.3em;color:var(--mist,#c9c0a8);font-size:.88rem}.bcjr-error{color:#ff8d86}
      
      .bcjr-movement-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:9px;margin:12px 0}
      .bcjr-movement-card{min-width:0;padding:12px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:10px;background:var(--stone-2,#1a3830);color:var(--text,#f5efe3)}
      .bcjr-movement-title{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.bcjr-movement-title b{overflow-wrap:anywhere}.bcjr-movement-title strong{white-space:nowrap;color:var(--gold-bright,#efd48a)}
      .bcjr-movement-meta{display:grid;gap:3px;margin:8px 0;color:var(--mist,#c9c0a8);font-size:.76rem}
      .bcjr-movement-decision{display:grid;gap:6px;font-size:.82rem;font-weight:700}
      .bcjr-movement-decision select{width:100%;min-height:42px;padding:9px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:8px;background:var(--void,#0a1613);color:var(--text,#f5efe3)}
      .bcjr-movement-reason{display:block;margin-top:8px;color:var(--mist,#c9c0a8);line-height:1.4}
      body.bc-theme-light .bcjr-movement-card{background:#efede5!important;color:#202722!important;border-color:#c7bda8!important}
      body.bc-theme-light .bcjr-movement-meta,body.bc-theme-light .bcjr-movement-reason{color:#4b534b}
      body.bc-theme-light .bcjr-movement-title strong{color:#75571d}
      body.bc-theme-light .bcjr-movement-decision select{background:#f1eee5!important;color:#202722!important;border-color:#bdb39e!important}
      .bcjr-inventory{margin:14px 0;border:1px solid var(--gold-dim,#9a7c3e);border-radius:12px;overflow:hidden}
      .bcjr-inventory>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;list-style:none;cursor:pointer;padding:13px 15px;background:var(--stone-2,#1a3830);color:var(--text,#f5efe3);font-weight:750}
      .bcjr-inventory>summary::-webkit-details-marker{display:none}
      .bcjr-inventory>summary:after{content:'＋';font-size:1.2rem;color:var(--gold,#d4b05c)}
      .bcjr-inventory[open]>summary:after{content:'−'}
      .bcjr-inventory-body{padding:10px;background:var(--stone,#122a24)}
      .bcjr-inventory .bcjr-table{min-width:980px}
      .bcjr-panel{margin:10px 0;border:1px solid var(--gold-dim,#9a7c3e);border-radius:10px;overflow:hidden}
      .bcjr-panel>summary{cursor:pointer;list-style:none;padding:11px 13px;font-weight:700;background:var(--stone-2,#1a3830)}
      .bcjr-panel>summary::-webkit-details-marker{display:none}.bcjr-panel>summary:after{content:'＋';float:right;color:var(--gold,#d4b05c)}
      .bcjr-panel[open]>summary:after{content:'−'}.bcjr-panel-body{padding:12px}
      .bcjr-product-tools{display:flex;justify-content:space-between;align-items:end;gap:10px;flex-wrap:wrap}
      .bcjr-product-tools label{display:grid;gap:4px;min-width:min(280px,100%);font-size:.84rem}
      .bcjr-product-tools input{padding:9px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:8px;background:var(--void,#0a1613);color:var(--text,#f5efe3)}
      .bcjr-product-tabs{display:flex;gap:7px;flex-wrap:wrap}.bcjr-product-tabs .active{background:#315d4a;color:#fff}
      .bcjr-table td small{white-space:normal;display:block;max-width:160px;font-size:.7rem;line-height:1.35}
      .bcjr-correction-backdrop{position:absolute;inset:0;z-index:40;background:rgba(10,18,30,.68);display:flex;align-items:center;justify-content:center;padding:16px}
      .bcjr-correction-backdrop[hidden]{display:none}.bcjr-correction-dialog{width:min(520px,100%);max-height:90%;overflow:auto;background:var(--stone,#122a24);color:var(--text,#f5efe3);border:1px solid var(--gold-dim,#9a7c3e);border-radius:14px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.38)}
      .bcjr-correction-dialog h3{margin-top:0}.bcjr-correction-fields{display:grid;gap:10px}.bcjr-correction-fields label{display:grid;gap:5px;font-size:.85rem}
      .bcjr-correction-fields input,.bcjr-correction-fields textarea{width:100%;padding:10px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:8px;background:var(--void,#0a1613);color:var(--text,#f5efe3)}
      .bcjr-correction-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}
      body.bc-theme-light .bcjr-panel,body.bc-theme-light .bcjr-correction-dialog{border-color:#c3b9a5}
      body.bc-theme-light .bcjr-panel>summary{background:#e2ded3;color:#202722}
      body.bc-theme-light .bcjr-product-tools input,body.bc-theme-light .bcjr-correction-fields input,body.bc-theme-light .bcjr-correction-fields textarea{background:#f1eee5;color:#202722;border-color:#bdb39e}
      body.bc-theme-light .bcjr-correction-dialog{background:#e8e4da;color:#202722}
      .bcjr-field input,.bcjr-field select,.bcjr-field textarea{background:var(--void,#0a1613);color:var(--text,#f5efe3)}
      .bcjr-field select option{background:var(--stone,#122a24);color:var(--text,#f5efe3)}
      body.bc-theme-light .bcjr-dialog{background:#e8e4da;color:#202722}
      body.bc-theme-light .bcjr-head,body.bc-theme-light .bcjr-session,body.bc-theme-light .bcjr-field,body.bc-theme-light .bcjr-table-wrap,body.bc-theme-light .bcjr-inventory{border-color:#c3b9a5}
      body.bc-theme-light .bcjr-card{background:#f3efe6;border-color:#c9bfac;color:#202722}
      body.bc-theme-light .bcjr-card small,body.bc-theme-light .bcjr-muted{color:#4b534b}
      body.bc-theme-light .bcjr-alert{background:#f1e8d4;color:#332b1d;border-left-color:#9b742b}
      body.bc-theme-light .bcjr-pill.warn{background:#f2dfb8;color:#654812}
      body.bc-theme-light .bcjr-pill.ok{background:#dce9dc;color:#285333}
      body.bc-theme-light .bcjr-table th,body.bc-theme-light .bcjr-table td{background:#efede5;color:#202722;border-color:#c7bda8}
      body.bc-theme-light .bcjr-table thead th,body.bc-theme-light .bcjr-table tfoot td,body.bc-theme-light .bcjr-inventory>summary{background:#e2ded3!important;color:#202722!important}
      body.bc-theme-light .bcjr-table th:first-child,body.bc-theme-light .bcjr-table td:first-child{background:transparent!important}
      body.bc-theme-light .bcjr-field input,body.bc-theme-light .bcjr-field select,body.bc-theme-light .bcjr-field textarea{background:#f1eee5;color:#202722;border-color:#bdb39e}
      body.bc-theme-light .bcjr-btn{background:#e2ded3;color:#202722;border-color:#bdb39e}
      body.bc-theme-light .bcjr-btn.primary{background:#315d4a;color:#fff;border-color:#315d4a}
      body.bc-theme-light .bcjr-btn.danger{color:#8d3030}
      body.bc-theme-light .bcjr-footer{background:#e8e4da;border-color:#c7bda8}
      body.bc-theme-light .bcjr-message{color:#424b43}
      @media(max-width:650px){.bcjr-dialog{padding:14px;max-height:98vh}.bcjr-head h2{font-size:1.15rem}.bcjr-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.bcjr-session{padding:10px}.bcjr-inventory>summary{padding:12px;font-size:.9rem}.bcjr-inventory-body{padding:7px}}

    `;
    document.head.appendChild(style);
  }
  function ensure(){
    css();let modal=document.getElementById('bc-jornada-review-modal');if(modal)return modal;
    modal=document.createElement('div');modal.id='bc-jornada-review-modal';modal.hidden=true;
    modal.innerHTML='<div class="bcjr-backdrop" data-bcjr-close></div><section class="bcjr-dialog" role="dialog" aria-modal="true" aria-labelledby="bcjr-title" tabindex="-1"><header class="bcjr-head"><div><h2 id="bcjr-title">Revisión integral del turno</h2><p id="bcjr-subtitle">Recuperando liquidación…</p></div><button class="bcjr-close" type="button" data-bcjr-close aria-label="Cerrar">×</button></header><div id="bcjr-content"><p>Consultando datos del turno…</p></div><div class="bcjr-footer"><p id="bcjr-message" class="bcjr-message" role="status" aria-live="polite"></p><div class="bcjr-footer-actions"><button class="bcjr-btn danger" type="button" data-bcjr-action="reject">Solicitar correcciones</button><button class="bcjr-btn primary" type="button" data-bcjr-action="approve" disabled>Aprobar turno</button></div></div></section><div id="bcjr-correction-modal" class="bcjr-correction-backdrop" data-bcjr-correction-close hidden><section class="bcjr-correction-dialog" role="dialog" aria-modal="true" aria-labelledby="bcjr-correction-title"><h3 id="bcjr-correction-title">Corrección auditada</h3><p id="bcjr-correction-subtitle" class="bcjr-muted"></p><div id="bcjr-correction-fields" class="bcjr-correction-fields"></div><div class="bcjr-correction-actions"><button type="button" class="bcjr-btn" data-bcjr-action="cancel-correction">Cancelar</button><button type="button" class="bcjr-btn primary" data-bcjr-action="save-correction">Guardar corrección auditada</button></div></section></div>';
    document.body.appendChild(modal);return modal;
  }
  function fmtDate(value){if(!value)return '—';try{return new Date(value+'T12:00:00').toLocaleDateString('es-ES')}catch(_){return String(value)}}
  function card(label,value){return '<div class="bcjr-card"><small>'+esc(label)+'</small><b>'+esc(value==null?'Pendiente':value)+'</b></div>'}
  function sessionHtml(s,turn){
    const l=s.liquidacion||{},lines=Array.isArray(l.lineas)?l.lineas:[];
    const pending=l.pendientes||{},post=Array.isArray(l.movimientos_posteriores_corte)?l.movimientos_posteriores_corte:[];
    const pendingPost=Number(l.movimientos_posteriores_pendientes||pending.movimientos_posteriores_corte||0)>0;
    const blocked='Pendiente de clasificación';
    const cards=[
      ['Ventas estimadas',pendingPost?blocked:(l.ventas_estimadas==null?'No calculable':money(l.ventas_estimadas)+' CUP')],
      ['Ganancia bruta estimada',pendingPost?blocked:(l.ganancia_bruta_parcial==null?'No calculable':money(l.ganancia_bruta_parcial)+' CUP'+(l.ganancia_bruta_es_total?'':' · PARCIAL'))],
      ['Costo de ventas estimado',pendingPost?blocked:(lines.some(x=>x.costo_vendido_estimado!=null)?money(lines.reduce((v,x)=>v+Number(x.costo_vendido_estimado||0),0))+' CUP'+(Number(l.costos_sin_cobertura||0)>0?' · PARCIAL':''):'No calculable')],
      ['Efectivo total recogido',l.dinero_recogido_total==null?'Pendiente':money(l.dinero_recogido_total)+' CUP'],
      ['Salario',pendingPost?blocked:(l.salario_calculado==null?'Pendiente':money(l.salario_calculado)+' CUP')],
      ['Gastos aprobados',money(l.gastos_aprobados)+' CUP'],
      ['Reinversiones',money(l.reinversiones_aprobadas)+' CUP'],
      ['Efectivo esperado',pendingPost?blocked:(l.efectivo_esperado_despues_de_gastos_reinversiones_salario==null?'No calculable':money(l.efectivo_esperado_despues_de_gastos_reinversiones_salario)+' CUP')],
      ['Diferencia',pendingPost?blocked:(l.diferencia==null?'No calculable':money(l.diferencia)+' CUP')],
      ['Costo documentado',pendingPost?blocked:(qty(l.costos_con_cobertura)+' / '+qty(l.familias_total_costo)+' familias')]
    ];
    const entries=x=>Number(x.transferencias_entrada||0)+Number(x.compras||0)+Number(x.reinversiones_entrada||0);
    const exits=x=>Number(x.transferencias_salida||0)+Number(x.vales_salida||0)+Number(x.mermas_aprobadas||0)+Number(x.bajas_aprobadas||0);
    const sums={initial:0,entries:0,exits:0,final:0,sold:0,cost:0,profit:0};
    lines.forEach(x=>{sums.initial+=Number(x.inventario_inicial||0);sums.entries+=entries(x);sums.exits+=exits(x);sums.final+=Number(x.inventario_final||0);sums.sold+=Number(x.unidades_vendidas||0);if(x.costo_vendido_estimado!=null)sums.cost+=Number(x.costo_vendido_estimado);if(x.ganancia_bruta_estimada!=null)sums.profit+=Number(x.ganancia_bruta_estimada)});
    const stockTable='<div class="bcjr-table-wrap"><table class="bcjr-table bcjr-stock-table"><thead><tr><th>Producto</th><th>Inicial</th><th>Entradas</th><th>Salidas</th><th>Bajas</th><th>Final</th><th>Vendidas</th><th>Acción</th></tr></thead><tbody>'+
      lines.map(x=>'<tr data-bcjr-product-row data-product-name="'+esc(x.nombre||'')+'"><td>'+esc(x.nombre||'Producto')+'</td><td>'+esc(qty(x.inventario_inicial))+'</td><td>'+esc(qty(entries(x)))+'</td><td>'+esc(qty(exits(x)))+'</td><td>'+esc(qty(Number(x.bajas_aprobadas||0)+Number(x.mermas_aprobadas||0)))+'</td><td><b>'+esc(qty(x.inventario_final))+'</b></td><td>'+esc(pendingPost?blocked:qty(x.unidades_vendidas))+'</td><td><button type="button" class="bcjr-btn" data-bcjr-action="open-count-correction" data-session="'+esc(s.id)+'" data-product="'+esc(x.producto_id)+'" data-name="'+esc(x.nombre||'Producto')+'" data-current="'+esc(x.inventario_final)+'">Corregir conteo</button></td></tr>').join('')+
      '</tbody><tfoot><tr><td>TOTALES</td><td>'+esc(qty(sums.initial))+'</td><td>'+esc(qty(sums.entries))+'</td><td>'+esc(qty(sums.exits))+'</td><td>'+esc(qty(lines.reduce((v,x)=>v+Number(x.bajas_aprobadas||0)+Number(x.mermas_aprobadas||0),0)))+'</td><td>'+esc(qty(sums.final))+'</td><td>'+esc(pendingPost?blocked:qty(sums.sold))+'</td><td>—</td></tr></tfoot></table></div>';
    const financeTable='<div class="bcjr-table-wrap"><table class="bcjr-table bcjr-finance-table"><thead><tr><th>Producto</th><th>Precio venta</th><th>Ingreso</th><th>Costo/u</th><th>Costo vendido</th><th>Ganancia</th><th>Margen</th><th>Fuente</th><th>Acción</th></tr></thead><tbody>'+
      lines.map(x=>'<tr data-bcjr-product-row data-product-name="'+esc(x.nombre||'')+'"><td>'+esc(x.nombre||'Producto')+'</td><td>'+esc(x.precio_unitario==null?'Sin precio':money(x.precio_unitario))+'</td><td>'+esc(pendingPost?blocked:(x.importe_estimado==null?'—':money(x.importe_estimado)))+'</td><td>'+esc(pendingPost?blocked:(x.costo_unitario_estimado==null?'Sin costo':money(x.costo_unitario_estimado)))+'</td><td>'+esc(pendingPost?blocked:(x.costo_vendido_estimado==null?'—':money(x.costo_vendido_estimado)))+'</td><td>'+esc(pendingPost?blocked:(x.ganancia_bruta_estimada==null?'—':money(x.ganancia_bruta_estimada)))+'</td><td>'+esc(pendingPost?blocked:(x.margen_bruto_estimado==null?'—':qty(x.margen_bruto_estimado)+'%'))+'</td><td><small>'+esc(x.estado_precio||'—')+' · '+esc(x.estado_costo||'—')+'</small></td><td><button type="button" class="bcjr-btn" data-bcjr-action="open-values-correction" data-session="'+esc(s.id)+'" data-product="'+esc(x.producto_id)+'" data-name="'+esc(x.nombre||'Producto')+'" data-price="'+esc(x.precio_unitario??'')+'" data-cost="'+esc(x.costo_unitario_estimado??'')+'">Ajustar valores</button></td></tr>').join('')+
      '</tbody><tfoot><tr><td>TOTALES</td><td>—</td><td>'+esc(pendingPost?blocked:(l.ventas_estimadas==null?'No calculable':money(l.ventas_estimadas)))+'</td><td>—</td><td>'+esc(pendingPost?blocked:money(sums.cost)+'*')+'</td><td>'+esc(pendingPost?blocked:money(sums.profit)+'*')+'</td><td>—</td><td>—</td><td>—</td></tr></tfoot></table></div>';
    const table='<div class="bcjr-product-tools"><label>Buscar producto<input type="search" data-bcjr-product-search placeholder="Nombre del producto…"></label><div class="bcjr-product-tabs"><button type="button" class="bcjr-btn active" data-bcjr-action="table-view" data-bcjr-table-view="stock">Existencias</button><button type="button" class="bcjr-btn" data-bcjr-action="table-view" data-bcjr-table-view="finance">Ventas y márgenes</button></div></div><div data-bcjr-table-panel="stock">'+stockTable+'</div><div data-bcjr-table-panel="finance" hidden>'+financeTable+'</div><p class="bcjr-muted">Los ajustes quedan auditados para esta jornada; no alteran los cortes físicos originales ni el catálogo actual.</p>';
    const warnings=[];
    const negative=Array.isArray(l.familias_vendidas_negativas_detalle)?l.familias_vendidas_negativas_detalle:[];
    if(l.faltan_cortes)warnings.push('Falta un corte de inventario confirmado.');
    if(Number(l.familias_sin_precio||0)>0)warnings.push(Number(l.familias_sin_precio)+' familias sin precio de venta válido.');
    if(Number(l.familias_con_vendidas_negativas||0)>0){warnings.push(Number(l.familias_con_vendidas_negativas)+' productos/familias tienen más unidades en el corte final que las disponibles. Verifica el conteo o registra la entrada que falte.');negative.forEach(x=>warnings.push((x.nombre||'Producto')+': diferencia '+qty(x.unidades_vendidas)+' · inicial '+qty(x.inventario_inicial)+' + entradas '+qty(Number(x.transferencias_entrada||0)+Number(x.compras||0)+Number(x.reinversiones_entrada||0))+' − salidas '+qty(Number(x.transferencias_salida||0)+Number(x.vales_salida||0)+Number(x.mermas_aprobadas||0)+Number(x.bajas_aprobadas||0))+' − final '+qty(x.inventario_final)));}
    if(l.salario_porcentaje==null)warnings.push('Falta fijar el porcentaje salarial del Dueño.');
    if(Number(l.movimientos_posteriores_pendientes||0)>0)warnings.push(Number(l.movimientos_posteriores_pendientes)+' bajas/mermas aprobadas después del inventario final necesitan clasificación.');
    if(Number(l.costos_sin_cobertura||0)>0)warnings.push(Number(l.costos_sin_cobertura)+' productos vendidos sin costo histórico documentado; la ganancia es parcial.');
    if(Number(l.productos_vendidos_con_precio_faltante||0)>0)warnings.push(Number(l.productos_vendidos_con_precio_faltante)+' productos vendidos sin precio válido.');
    if(Number(pending.gastos||0)>0)warnings.push(Number(pending.gastos)+' gastos pendientes.');
    if(Number(pending.reinversiones||0)>0)warnings.push(Number(pending.reinversiones)+' reinversiones pendientes.');
    if(Number(pending.ajustes||0)>0)warnings.push(Number(pending.ajustes)+' bajas/mermas pendientes.');
    const salary=s.salario_porcentaje==null?'<details class="bcjr-panel"><summary>Configurar porcentaje salarial</summary><div class="bcjr-panel-body"><div class="bcjr-field"><label>Porcentaje salarial de esta jornada (%)<input type="number" min="0" max="100" step="0.01" data-bcjr-salary-input="'+esc(s.id)+'" placeholder="Escribe el porcentaje"></label><button type="button" class="bcjr-btn" data-bcjr-action="salary" data-session="'+esc(s.id)+'">Guardar porcentaje</button></div><p class="bcjr-muted">Es una decisión del Dueño; no se aplica un valor predeterminado.</p></div></details>':'<p class="bcjr-muted">Salario fijado: <b>'+esc(qty(s.salario_porcentaje))+'%</b></p>';
    const postValue=post.reduce((v,m)=>v+Number(m.valor_estimado||0),0),postValueKnown=post.every(m=>m.valor_estimado!=null);
    const movements=post.length?'<details class="bcjr-panel"><summary>Revisar '+esc(post.length)+' bajas/mermas posteriores al corte · '+esc(qty(post.reduce((v,m)=>v+Number(m.cantidad||0),0)))+' unidades</summary><div class="bcjr-panel-body"><div class="bcjr-alert"><p>Valor orientativo a precio actual: '+(postValueKnown?esc(money(postValue)+' CUP'):'incompleto')+'. No es un gasto de caja. La fecha de aprobación no demuestra cuándo ocurrió cada baja.</p><div class="bcjr-field"><button type="button" class="bcjr-btn" data-bcjr-action="classify-all-before">Marcar todas: antes</button><button type="button" class="bcjr-btn" data-bcjr-action="classify-all-after">Marcar todas: después</button></div><div class="bcjr-movement-list">'+post.map(m=>'<article class="bcjr-movement-card" data-bcjr-movement-row data-type="'+esc(m.tipo)+'" data-id="'+esc(m.id)+'"><div class="bcjr-movement-title"><b>'+esc(m.tipo)+' · '+esc(m.producto)+'</b><strong>'+esc(qty(m.cantidad))+'</strong></div><div class="bcjr-movement-meta"><span>Registrado: '+esc(m.creado_en?new Date(m.creado_en).toLocaleString():'—')+'</span><span>Aprobado: '+esc(m.fecha_revision?new Date(m.fecha_revision).toLocaleString():'—')+'</span><span>Valor referencial: '+esc(m.valor_estimado==null?'Sin precio':money(m.valor_estimado)+' CUP')+'</span><span>Estado: '+esc(m.estado)+'</span></div><label class="bcjr-movement-decision">¿Cuándo ocurrió esta baja/merma?<select data-bcjr-classification><option value="">Seleccionar momento real…</option><option value="ANTES_CORTE" '+(m.clasificacion==='ANTES_CORTE'?'selected':'')+'>Antes del inventario final</option><option value="DESPUES_CORTE" '+(m.clasificacion==='DESPUES_CORTE'?'selected':'')+'>Después del inventario final</option></select></label><small class="bcjr-movement-reason">Motivo: '+esc(m.motivo||'Sin motivo')+(m.comentario_revision?' · '+esc(m.comentario_revision):'')+'</small></article>').join('')+'</div><div class="bcjr-field"><label>Motivo general<input type="text" maxlength="500" data-bcjr-movement-comment placeholder="Ej.: conciliado con la hoja del 9–10 de noviembre"></label><button type="button" class="bcjr-btn" data-bcjr-action="classify" data-session="'+esc(s.id)+'">Guardar clasificación auditada</button></div></div></div></details>':'';
    const daily=Array.isArray(s.entregas_diarias)?s.entregas_diarias:[];
    const periodDays=Math.max(1,Number(turn?.dias_turno||1));
    const periodTitle=periodDays>1?'Jornada · '+fmtDate(s.fecha)+' – '+fmtDate(s.fecha_fin||s.fecha)+' · '+periodDays+' días':'Jornada · '+fmtDate(s.fecha);
    const cashRows=daily.map(e=>'<li>'+esc(fmtDate(e.fecha))+' · Entrega diaria aprobada: <b>'+esc(money(e.monto))+' CUP</b></li>');
    if(s.efectivo?.contado!=null)cashRows.push('<li>'+esc(fmtDate((s.efectivo.contado_at||'').slice(0,10)||s.fecha_fin||s.fecha))+' · Conteo final de caja: <b>'+esc(money(s.efectivo.contado))+' CUP</b> · '+esc(s.efectivo.estado||'sin estado')+'</li>');
    const countedDate=(s.efectivo?.contado_at||'').slice(0,10),lateCount=countedDate&&countedDate>(s.fecha_fin||s.fecha);
    const cashNote=lateCount?'El conteo final se registró el '+esc(fmtDate(countedDate))+', después de terminar el período ('+esc(fmtDate(s.fecha_fin||s.fecha))+'). Se conserva la fecha real del registro.':'El conteo final se muestra separado de las entregas diarias para no duplicarlo.';
    const dailyCash=cashRows.length?'<details class="bcjr-panel"><summary>Detalle del efectivo · '+esc(money(l.dinero_recogido_total))+' CUP</summary><div class="bcjr-panel-body"><ul>'+cashRows.join('')+'</ul><p class="bcjr-muted">'+cashNote+'</p></div></details>':'<p class="bcjr-muted">No hay entregas diarias ni conteo final registrados.</p>';
    const warningDetails=warnings.length?'<details class="bcjr-panel"><summary>Validaciones pendientes · '+esc(warnings.length)+'</summary><div class="bcjr-panel-body"><ul>'+warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></div></details>':'<p class="bcjr-pill ok">Sin bloqueos de cálculo</p>';
    const financeDetails='<details class="bcjr-panel"><summary>Ver otros indicadores y liquidación</summary><div class="bcjr-panel-body"><div class="bcjr-cards">'+cards.slice(4).map(x=>card(x[0],x[1])).join('')+'</div></div></details>';
    return '<section class="bcjr-session"><h3>'+esc(periodTitle)+'</h3><p class="bcjr-muted">Estado: '+esc(s.estado)+' · efectivo final contado '+esc(money(s.efectivo?.contado))+' CUP · '+esc(s.efectivo?.estado||'sin aprobación')+'</p>'+dailyCash+'<span class="bcjr-pill '+(l.calculable===true?'ok':'warn')+'">'+(l.calculable===true?'Liquidación calculable':'Liquidación provisional')+'</span><div class="bcjr-cards">'+cards.slice(0,4).map(x=>card(x[0],x[1])).join('')+'</div>'+financeDetails+salary+warningDetails+movements+'<details class="bcjr-inventory"><summary><span>Ver inventario y liquidación por producto</span><small>'+(lines.length?esc(lines.length)+' productos · vistas separadas':'Pendiente de cortes de inventario confirmados')+'</small></summary><div class="bcjr-inventory-body">'+(lines.length?table:'<p class="bcjr-muted">No hay líneas físicas confirmadas. Comprueba los cortes inicial y final.</p>')+'</div></details></section>';
  }
  function render(data){
    report=data;const modal=ensure(),turn=data.turno||{},sessions=Array.isArray(data.sesiones)?data.sesiones:[];
    const lastDate=sessions.reduce((latest,x)=>!latest||String(x.fecha_fin||x.fecha)>String(latest)?(x.fecha_fin||x.fecha):latest,null)||turn.fecha;
    const sub=document.getElementById('bcjr-subtitle');if(sub)sub.textContent=(turn.almacen_nombre||'Almacén')+' · '+fmtDate(turn.fecha)+' – '+fmtDate(lastDate)+' · '+String(turn.dias_turno||1)+' día(s) · PENDIENTE DE REVISIÓN';
    const body=document.getElementById('bcjr-content');
    const hasPendingPost=sessions.some(s=>Number(s.liquidacion?.movimientos_posteriores_pendientes||0)>0);
    const grossProfit=sessions.reduce((v,s)=>v+Number(s.liquidacion?.ganancia_bruta_parcial||0),0);
    const costOfSales=sessions.reduce((v,s)=>v+(s.liquidacion?.lineas||[]).reduce((w,x)=>w+Number(x.costo_vendido_estimado||0),0),0);
    const completed=sessions.filter(s=>s.estado==='COMPLETADA');
    const cashSessions=sessions.filter(s=>s.liquidacion?.dinero_recogido_total!=null);
    const cashComplete=sessions.length>0&&cashSessions.length===sessions.length;
    const cashTotal=cashSessions.reduce((v,s)=>v+Number(s.liquidacion.dinero_recogido_total),0);
    const cashLabel=cashComplete?money(cashTotal)+' CUP':cashSessions.length?money(cashTotal)+' CUP · PARCIAL':'Pendiente';
    const profitComplete=sessions.length>0&&sessions.every(s=>['COMPLETADA','CANCELADA'].includes(s.estado))&&completed.every(s=>s.liquidacion?.ganancia_bruta_es_total===true);
    const mainCards=[
      card('Estado de revisión',turn.estado_maestro==='CERRADO'||turn.estado==='CERRADO'?'APROBADO':'PENDIENTE DE REVISIÓN'),
      card('Periodo del turno',String(turn.dias_turno||1)+' día(s) · '+fmtDate(turn.fecha)+' – '+fmtDate(lastDate)),
      card('Productos en los cortes',String(sessions.reduce((n,s)=>n+(s.liquidacion?.lineas?.length||0),0))),
      card('Efectivo recogido',cashLabel)
    ];
    const detailCards=[
      card('Ventas estimadas',hasPendingPost?'Pendiente de clasificación':(completed.some(s=>s.liquidacion?.ventas_estimadas!=null)?money(completed.reduce((v,s)=>v+Number(s.liquidacion?.ventas_estimadas||0),0))+' CUP':'No calculable')),
      card('Ganancia bruta estimada',hasPendingPost?'Pendiente de clasificación':(completed.some(s=>s.liquidacion?.ganancia_bruta_parcial!=null)?money(grossProfit)+' CUP'+(profitComplete?'':' · PARCIAL'):'No calculable')),
      card('Costo de ventas estimado',hasPendingPost?'Pendiente de clasificación':(completed.some(s=>(s.liquidacion?.lineas||[]).some(x=>x.costo_vendido_estimado!=null))?money(costOfSales)+' CUP'+(profitComplete?'':' · PARCIAL'):'No calculable')),
      card('Gastos',money(sessions.reduce((v,s)=>v+Number(s.liquidacion?.gastos_aprobados||0),0))+' CUP'),
      card('Reinversiones',money(sessions.reduce((v,s)=>v+Number(s.liquidacion?.reinversiones_aprobadas||0),0))+' CUP')
    ];
    body.innerHTML='<div class="bcjr-cards">'+mainCards.join('')+'</div><details class="bcjr-panel"><summary>Ver resumen financiero completo</summary><div class="bcjr-panel-body"><div class="bcjr-cards">'+detailCards.join('')+'</div></div></details>'+sessions.map(s=>sessionHtml(s,turn)).join('');
    const blockers=[];
    sessions.forEach(s=>{
      const l=s.liquidacion||{};
      if(!['COMPLETADA','CANCELADA'].includes(s.estado))blockers.push('Jornada '+fmtDate(s.fecha)+': todavía no se ha completado.');
      if(s.estado==='COMPLETADA'&&l.calculable!==true)blockers.push('Jornada '+fmtDate(s.fecha)+': liquidación todavía no calculable');
      if(Number(l.movimientos_posteriores_pendientes||0)>0)blockers.push('Jornada '+fmtDate(s.fecha)+': movimientos posteriores sin clasificar');
    });
    const approved=turn.estado_maestro==='CERRADO'||turn.estado==='CERRADO';
    const btn=modal.querySelector('[data-bcjr-action="approve"]');
    btn.disabled=busy||blockers.length>0||approved||sessions.length===0;
    btn.textContent=approved?'Turno aprobado':blockers.length?'Aprobación bloqueada · '+blockers.length+' validación(es)':'Aprobar turno';
    const msg=document.getElementById('bcjr-message');
    msg.textContent=approved?'Este Turno ya fue aprobado.':blockers.length?blockers.slice(0,3).join(' · ')+(blockers.length>3?' · y '+(blockers.length-3)+' más':''):'Revisa las cifras y confirma la aprobación cuando estés conforme.';
    msg.className='bcjr-message'+(blockers.length?' bcjr-error':'');
    modal.hidden=false;document.body.classList.add('bc-jornada-review-open');
  }
  let correctionContext=null;
  function openCorrectionModal(kind,data){
    correctionContext={kind,session:data.session,product:data.product,name:data.name};
    const modal=document.getElementById('bcjr-correction-modal'),title=document.getElementById('bcjr-correction-title'),subtitle=document.getElementById('bcjr-correction-subtitle'),fields=document.getElementById('bcjr-correction-fields');
    if(!modal||!fields)return;
    title.textContent=kind==='count'?'Corregir conteo final':'Ajustar valores históricos';
    subtitle.textContent=data.name+' · Esta corrección queda vinculada a la jornada y no modifica el corte original ni el catálogo actual.';
    fields.innerHTML=kind==='count'
      ?'<label>Cantidad física final correcta<input type="number" min="0" step="0.001" data-bcjr-correction-count value="'+esc(data.current)+'"></label><label>Motivo obligatorio<textarea rows="3" maxlength="500" data-bcjr-correction-comment placeholder="Ej.: cotejado con la hoja y el conteo físico"></textarea></label>'
      :'<label>Precio medio de venta de esta jornada (CUP)<input type="number" min="0.01" step="0.01" data-bcjr-correction-price value="'+esc(data.price)+'" placeholder="Dejar vacío para no cambiar"></label><label>Costo unitario documentado (CUP)<input type="number" min="0" step="0.01" data-bcjr-correction-cost value="'+esc(data.cost)+'" placeholder="Dejar vacío para no cambiar"></label><label>Motivo y evidencia<textarea rows="3" maxlength="500" data-bcjr-correction-comment placeholder="Ej.: confirmado en la hoja manual del 9–10 de noviembre"></textarea></label>';
    modal.hidden=false;const first=fields.querySelector('input');if(first)first.focus();
  }
  function closeCorrectionModal(){const modal=document.getElementById('bcjr-correction-modal');if(modal)modal.hidden=true;correctionContext=null;}
  async function click(e){
    const t=e.target.closest&&e.target.closest('[data-bcjr-action],[data-bcjr-close],[data-bcjr-correction-close]');if(!t)return;
    if(t.hasAttribute('data-bcjr-close')){close();return;}
    if(t.id==='bcjr-correction-modal'&&e.target===t){closeCorrectionModal();return;}
    const action=t.dataset.bcjrAction;
    if(action==='cancel-correction'){closeCorrectionModal();return;}
    if(action==='open-count-correction'){openCorrectionModal('count',{session:t.dataset.session,product:t.dataset.product,name:t.dataset.name,current:t.dataset.current});return;}
    if(action==='open-values-correction'){openCorrectionModal('values',{session:t.dataset.session,product:t.dataset.product,name:t.dataset.name,price:t.dataset.price,cost:t.dataset.cost});return;}
    if(action==='table-view'){
      const section=t.closest('.bcjr-session'),view=t.dataset.bcjrTableView;
      section?.querySelectorAll('[data-bcjr-table-panel]').forEach(panel=>{panel.hidden=panel.dataset.bcjrTablePanel!==view;});
      section?.querySelectorAll('[data-bcjr-table-view]').forEach(button=>button.classList.toggle('active',button===t));return;
    }
    if(busy)return;
    if(action==='save-correction'){
      if(!correctionContext)return;
      const fields=document.getElementById('bcjr-correction-fields'),comment=(fields?.querySelector('[data-bcjr-correction-comment]')?.value||'').trim();
      const error=document.getElementById('bcjr-correction-subtitle');
      if(comment.length<5){error.textContent='Escribe un motivo de al menos 5 caracteres.';return;}
      if(correctionContext.kind==='count'){
        const value=fields?.querySelector('[data-bcjr-correction-count]')?.value||'';
        if(value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0){error.textContent='Introduce una cantidad final válida.';return;}
        const context={...correctionContext};
        await run(async()=>{await rpc('bc7_corregir_inventario_final_jornada',{p_turno_sesion_id:context.session,p_correcciones:[{producto_id:context.product,cantidad:value}],p_comentario:comment});closeCorrectionModal();await openReview(activeTurnId);});
      }else{
        const p=fields?.querySelector('[data-bcjr-correction-price]')?.value.trim()||'',c=fields?.querySelector('[data-bcjr-correction-cost]')?.value.trim()||'';
        if(!p&&!c){error.textContent='Indica al menos el precio de venta o el costo unitario.';return;}
        const price=p===''?null:Number(p),cost=c===''?null:Number(c);
        if((price!==null&&(!Number.isFinite(price)||price<=0))||(cost!==null&&(!Number.isFinite(cost)||cost<0))){error.textContent='Precio de venta mayor que 0 y costo unitario no negativo.';return;}
        const context={...correctionContext};
        await run(async()=>{await rpc('bc7_corregir_valores_historicos_producto_jornada',{p_turno_sesion_id:context.session,p_producto_id:context.product,p_precio_venta:price,p_costo_unitario:cost,p_comentario:comment});closeCorrectionModal();await openReview(activeTurnId);});
      }return;
    }
    if(action==='correct-final-counts'){
      const section=t.closest('.bcjr-session'),comment=(section?.querySelector('[data-bcjr-final-correction-comment]')?.value||'').trim();
      const corrections=Array.from(section?.querySelectorAll('[data-bcjr-final-correction]')||[]).map(input=>({producto_id:input.dataset.product,cantidad:input.value}));
      if(!comment||corrections.some(x=>x.cantidad.trim()===''||!Number.isFinite(Number(x.cantidad))||Number(x.cantidad)<0)){document.getElementById('bcjr-message').textContent='Indica cantidades válidas y explica el motivo.';return;}
      await run(async()=>{await rpc('bc7_corregir_inventario_final_jornada',{p_turno_sesion_id:t.dataset.session,p_correcciones:corrections,p_comentario:comment});await openReview(activeTurnId);});
    }else if(action==='classify-all-before'||action==='classify-all-after'){
      const section=t.closest('.bcjr-session'),value=action==='classify-all-before'?'ANTES_CORTE':'DESPUES_CORTE';
      section?.querySelectorAll('[data-bcjr-classification]').forEach(select=>{select.value=value;});
      const msg=document.getElementById('bcjr-message');if(msg)msg.textContent='Selección preparada; revisa cada baja antes de guardar.';return;
    }else if(action==='salary'){
      const input=document.querySelector('[data-bcjr-salary-input="'+t.dataset.session+'"]'),value=Number(input&&input.value);
      if(!input||input.value.trim()===''||!Number.isFinite(value)||value<0||value>100){document.getElementById('bcjr-message').textContent='Escribe un porcentaje entre 0 y 100.';return;}
      await run(async()=>{await rpc('bc7_configurar_salario_porcentaje_jornada',{p_turno_sesion_id:t.dataset.session,p_porcentaje:value});await openReview(activeTurnId);});
    }else if(action==='classify'){
      const session=t.dataset.session,section=t.closest('.bcjr-session'),rows=Array.from(section?.querySelectorAll('[data-bcjr-movement-row]')||[]),comment=(section?.querySelector('[data-bcjr-movement-comment]')?.value||'').trim();
      const decisions=rows.map(row=>({tipo:row.dataset.type,id:row.dataset.id,clasificacion:row.querySelector('[data-bcjr-classification]')?.value||'',comentario:comment}));
      if(!comment||decisions.some(x=>!x.clasificacion)){document.getElementById('bcjr-message').textContent='Clasifica cada movimiento y escribe el motivo.';return;}
      await run(async()=>{await rpc('bc7_clasificar_movimientos_fuera_corte',{p_turno_sesion_id:session,p_decisiones:decisions});await openReview(activeTurnId);});
    }else if(action==='reject'){
      const comment=prompt('Describe las correcciones necesarias para esta jornada:');if(!comment||!comment.trim())return;
      await run(async()=>{await rpc('bc7_resolver_revision_jornada',{p_turno_id:activeTurnId,p_decision:'RECHAZAR',p_comentario:comment.trim()});await openReview(activeTurnId);});
    }else if(action==='approve'){
      const partial=(report?.sesiones||[]).some(s=>s.estado==='COMPLETADA'&&s.liquidacion?.ganancia_bruta_es_total!==true);
      const confirmText=partial?'La ganancia bruta sigue siendo parcial porque faltan costos/precios históricos documentados. ¿Confirmas que revisaste esa limitación?':'Vas a aprobar y cerrar definitivamente este Turno. Comprueba antes los importes e inventario. ¿Confirmas?';
      if(!confirm(confirmText))return;
      await run(async()=>{await rpc('bc7_resolver_revision_jornada',{p_turno_id:activeTurnId,p_decision:'APROBAR',p_comentario:null});await openReview(activeTurnId);if(typeof window.refrescarAprobacionesAdmin==='function')await window.refrescarAprobacionesAdmin();if(typeof window.refrescarCentroControl==='function')await window.refrescarCentroControl();});
    }
  }
  function filterProducts(e){
    const input=e.target.closest&&e.target.closest('[data-bcjr-product-search]');if(!input)return;
    const section=input.closest('.bcjr-session'),query=input.value.trim().toLocaleLowerCase();
    section?.querySelectorAll('[data-bcjr-product-row]').forEach(row=>{row.hidden=query!==''&&!String(row.dataset.productName||'').toLocaleLowerCase().includes(query);});
  }
  async function run(fn){
    busy=true;const msg=document.getElementById('bcjr-message');if(msg)msg.textContent='Guardando…';
    try{await fn();}catch(e){if(msg){msg.textContent=e.message||String(e);msg.className='bcjr-message bcjr-error';}}
    finally{busy=false;if(report&&!document.getElementById('bc-jornada-review-modal')?.hidden)render(report);}
  }
  document.addEventListener('click',click);
  document.addEventListener('input',filterProducts);
  window.bcAbrirRevisionJornada=openReview;
})();
