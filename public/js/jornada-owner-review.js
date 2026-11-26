/* BattleCruiser — revisión integral de jornadas, Owner-only · daily approvals are retail cash proof */
// v1.21 — use audited movement rows as authority for resolved post-cut blockers.
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const money=v=>v==null?'—':Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  const qty=v=>v==null?'—':Number(v||0).toLocaleString('es-ES',{maximumFractionDigits:3});
  const differenceStatus=value=>{
    if(value==null||!Number.isFinite(Number(value)))return 'No calculable';
    const n=Number(value);
    if(n < -0.005){
      const amount=Math.abs(n);
      return 'Sobrante '+(Number.isInteger(amount)?amount.toLocaleString('es-ES',{maximumFractionDigits:0}):money(amount))+' CUP';
    }
    if(n > 0.005){
      return 'Faltante '+(Number.isInteger(n)?n.toLocaleString('es-ES',{maximumFractionDigits:0}):money(n))+' CUP';
    }
    return 'Cuadrada 0 CUP';
  };
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
      .bcjr-profit-highlight{display:grid;gap:7px;margin:12px 0;padding:14px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:12px;background:var(--stone-2,#1a3830)}
      .bcjr-profit-gross small,.bcjr-profit-clean small{display:block;color:var(--mist,#c9c0a8);font-size:.82rem}
      .bcjr-profit-gross strong{display:block;margin-top:4px;font-size:1.65rem;font-weight:850;line-height:1.2;overflow-wrap:anywhere}
      .bcjr-profit-clean{padding-top:7px;border-top:1px solid var(--gold-dim,#9a7c3e);color:#9fd2aa}
      .bcjr-profit-clean b{display:block;margin-top:3px;font-size:.94rem;font-weight:750;color:#9fd2aa}
      body.bc-theme-light .bcjr-profit-clean,body.bc-theme-light .bcjr-profit-clean b{color:#23683d}
      .bcjr-session{border:1px solid var(--gold-dim,#9a7c3e);border-radius:14px;margin:16px 0;padding:16px}
      .bcjr-session h3{margin:0 0 8px}.bcjr-muted{color:var(--mist,#c9c0a8);font-size:.88rem}
      .bcjr-pill{display:inline-block;border-radius:999px;padding:4px 9px;background:rgba(201,192,168,.16);color:var(--text,#f5efe3);font-size:.78rem;font-weight:700}
      .bcjr-pill.warn{background:rgba(212,176,92,.18);color:var(--gold-bright,#efd48a)}.bcjr-pill.ok{background:rgba(90,160,112,.18);color:#9fd2aa}
      .bcjr-alert{border-left:4px solid var(--gold,#d4b05c);background:rgba(212,176,92,.12);padding:10px 12px;margin:10px 0;border-radius:6px}
      .bcjr-table-wrap{overflow:auto;border:1px solid var(--gold-dim,#9a7c3e);border-radius:10px;margin:12px 0}
      .bcjr-table{border-collapse:collapse;width:100%;min-width:1180px;font-size:.82rem}
      .bcjr-table th,.bcjr-table td{padding:8px 9px;border-bottom:1px solid var(--gold-dim,#9a7c3e);white-space:nowrap;text-align:right}
      .bcjr-table th:first-child,.bcjr-table td:first-child{text-align:left;position:sticky;left:0;background:var(--stone,#122a24);z-index:1}
      .bcjr-table thead th{background:var(--stone-2,#1a3830);position:sticky;top:0;z-index:2}
      .bcjr-table tfoot td{font-weight:800;background:var(--stone-2,#1a3830)}
      .bcjr-field{display:flex;flex-wrap:wrap;align-items:end;gap:9px;margin:12px 0;padding:12px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:10px}
      .bcjr-field label{display:flex;flex-direction:column;gap:4px;font-size:.83rem}
      .bcjr-field input,.bcjr-field select,.bcjr-field textarea{padding:8px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:7px;max-width:100%}
      .bcjr-btn{border:1px solid var(--gold-dim,#9a7c3e);border-radius:9px;padding:9px 13px;background:var(--stone-2,#1a3830);color:var(--text,#f5efe3);cursor:pointer;font-weight:650}
      .bcjr-btn.primary{background:#315d4a;color:white;border-color:transparent}.bcjr-btn.danger{color:#ff8d86}
      .bcjr-btn:disabled{opacity:.45;cursor:not-allowed}
      .bcjr-footer{position:sticky;bottom:-22px;background:var(--stone,#122a24);padding:14px 0 0;border-top:1px solid var(--gold-dim,#9a7c3e);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:18px}
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
      body.bc-theme-light .bcjr-table th:first-child,body.bc-theme-light .bcjr-table td:first-child{background:#e8e4da!important}
      body.bc-theme-light .bcjr-field input,body.bc-theme-light .bcjr-field select,body.bc-theme-light .bcjr-field textarea{background:#f1eee5;color:#202722;border-color:#bdb39e}
      body.bc-theme-light .bcjr-btn{background:#e2ded3;color:#202722;border-color:#bdb39e}
      body.bc-theme-light .bcjr-btn.primary{background:#315d4a;color:#fff;border-color:#315d4a}
      body.bc-theme-light .bcjr-btn.danger{color:#8d3030}
      body.bc-theme-light .bcjr-footer{background:#e8e4da;border-color:#c7bda8}
      body.bc-theme-light .bcjr-message{color:#424b43}
      @media(max-width:650px){.bcjr-dialog{padding:14px;max-height:98vh}.bcjr-head h2{font-size:1.15rem}.bcjr-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.bcjr-session{padding:10px}.bcjr-inventory>summary{padding:12px;font-size:.9rem}.bcjr-inventory-body{padding:7px}}

    `;

    style.textContent += `
      .bcjr-dialog{display:flex;flex-direction:column;height:min(96dvh,960px);max-height:96dvh;min-height:0;overflow:hidden;box-sizing:border-box}
      #bcjr-content{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:0 3px 10px}
      .bcjr-head{flex:0 0 auto}
      .bcjr-footer{position:static;flex:0 0 auto;margin-top:8px;padding-top:9px}
      .bcjr-session,.bcjr-inventory-body{min-width:0}
      .bcjr-inventory{overflow:visible}
      .bcjr-table-wrap{max-width:100%;max-height:56vh;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
      .bcjr-table{width:100%;min-width:760px;table-layout:auto;border-collapse:separate;border-spacing:0}
      .bcjr-table th:first-child,.bcjr-table td:first-child{z-index:2;min-width:155px}
      .bcjr-table thead th{z-index:3}
      .bcjr-table thead th:first-child{z-index:4}
      .bcjr-table[data-bcjr-view="stock"]{min-width:0}
      .bcjr-table[data-bcjr-view="stock"] th:nth-child(n+7):not(:nth-child(15)),.bcjr-table[data-bcjr-view="stock"] td:nth-child(n+7):not(:nth-child(15)){display:none}
      .bcjr-table[data-bcjr-view="finance"] th:nth-child(n+2):nth-child(-n+6),.bcjr-table[data-bcjr-view="finance"] td:nth-child(n+2):nth-child(-n+6),.bcjr-table[data-bcjr-view="finance"] th:nth-child(15),.bcjr-table[data-bcjr-view="finance"] td:nth-child(15){display:none}
      .bcjr-table-switch{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}
      .bcjr-table-switch .active{background:#315d4a;color:#fff;border-color:#315d4a}
      .bcjr-detail{margin:9px 0;border:1px solid var(--gold-dim,#9a7c3e);border-radius:10px;overflow:hidden}
      .bcjr-detail>summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;background:var(--stone-2,#1a3830);font-weight:750;list-style:none}
      .bcjr-detail>summary::-webkit-details-marker{display:none}
      .bcjr-detail>summary:after{content:'＋';color:var(--gold,#d4b05c);font-size:1.1rem}
      .bcjr-detail[open]>summary:after{content:'−'}
      .bcjr-detail-body{padding:10px 12px;min-width:0}
      .bcjr-btn.small{padding:6px 8px;font-size:.75rem;white-space:nowrap}
      .bcjr-values-modal{position:fixed;inset:0;z-index:10090;display:grid;place-items:center;padding:14px;background:rgba(0,0,0,.68)}
      .bcjr-values-dialog{width:min(520px,100%);max-height:90dvh;overflow:auto;border:1px solid var(--gold-dim,#9a7c3e);border-radius:14px;padding:16px;background:var(--stone,#122a24);color:var(--text,#f5efe3);box-shadow:0 20px 70px rgba(0,0,0,.4)}
      .bcjr-values-dialog label{display:grid;gap:5px;margin:11px 0;font-size:.85rem}
      .bcjr-values-dialog input,.bcjr-values-dialog textarea{width:100%;min-width:0;padding:10px;border:1px solid var(--gold-dim,#9a7c3e);border-radius:8px;background:var(--void,#0a1613);color:var(--text,#f5efe3)}
      .bcjr-values-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}
      .bcjr-values-status{min-height:1.3em;margin:10px 0 0;font-size:.86rem;line-height:1.4;overflow-wrap:anywhere}
      .bcjr-values-status.error{color:#ff8d86}
      .bcjr-values-status.success{color:#9fd2aa}
      .bcjr-values-dialog label{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;line-height:1.35}
      .bcjr-values-dialog input,.bcjr-values-dialog textarea{display:block;box-sizing:border-box;min-height:42px}
      body.bc-theme-light .bcjr-values-dialog{background:#e8e4da;color:#202722}
      body.bc-theme-light .bcjr-values-dialog input,body.bc-theme-light .bcjr-values-dialog textarea{background:#f1eee5;color:#202722}
      body.bc-theme-light .bcjr-detail>summary{background:#e2ded3;color:#202722}
      @media(max-width:650px){
        #bc-jornada-review-modal{padding:0}
        .bcjr-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0;padding:10px}
        .bcjr-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
        .bcjr-card{padding:9px}
        .bcjr-session{padding:9px;margin:9px 0}
        .bcjr-table-wrap{max-height:50dvh}
        .bcjr-table{font-size:.76rem}
        .bcjr-table th,.bcjr-table td{padding:7px}
        .bcjr-table th:first-child,.bcjr-table td:first-child{min-width:125px}
        .bcjr-footer{gap:5px}
        .bcjr-footer-actions .bcjr-btn{padding:8px 9px;font-size:.78rem}
        .bcjr-message{flex:1 1 100%}
      }
    `;
    document.head.appendChild(style);
  }
  function ensure(){
    css();let modal=document.getElementById('bc-jornada-review-modal');if(modal)return modal;
    modal=document.createElement('div');modal.id='bc-jornada-review-modal';modal.hidden=true;
    modal.innerHTML='<div class="bcjr-backdrop" data-bcjr-close></div><section class="bcjr-dialog" role="dialog" aria-modal="true" aria-labelledby="bcjr-title" tabindex="-1"><header class="bcjr-head"><div><h2 id="bcjr-title">Revisión integral del turno</h2><p id="bcjr-subtitle">Recuperando liquidación…</p></div><button class="bcjr-close" type="button" data-bcjr-close aria-label="Cerrar">×</button></header><div id="bcjr-content"><p>Consultando datos del turno…</p></div><div class="bcjr-footer"><p id="bcjr-message" class="bcjr-message" role="status" aria-live="polite"></p><div class="bcjr-footer-actions"><button class="bcjr-btn danger" type="button" data-bcjr-action="reject">Solicitar correcciones</button><button class="bcjr-btn primary" type="button" data-bcjr-action="approve" disabled>Aprobar turno</button></div></div></section>';
    document.body.appendChild(modal);return modal;
  }
  function fmtDate(value){if(!value)return '—';try{return new Date(value+'T12:00:00').toLocaleDateString('es-ES')}catch(_){return String(value)}}
  function card(label,value){return '<div class="bcjr-card"><small>'+esc(label)+'</small><b>'+esc(value==null?'Pendiente':value)+'</b></div>'}
  function countPendingPostMovements(liquidacion){
    const l=liquidacion||{};
    const post=Array.isArray(l.movimientos_posteriores_corte)?l.movimientos_posteriores_corte:null;
    // When the RPC supplies movement rows, their audited classifications are authoritative.
    // Summary counters can be stale during the refresh immediately after saving a classification.
    if(post&&post.length>0)return post.filter(m=>!String(m.clasificacion||'').trim()).length;
    const pending=l.pendientes||{};
    return Math.max(0,Number(l.movimientos_posteriores_pendientes)||0,Number(pending.movimientos_posteriores_corte)||0,post?post.length:0);
  }
  function sessionHtml(s,turn){
    const l=s.liquidacion||{},lines=Array.isArray(l.lineas)?l.lineas:[];
    const rectifications=Array.isArray(l.rectificaciones_post_cierre)?l.rectificaciones_post_cierre:[];
    const turnClosed=turn.estado_maestro==='CERRADO'||turn.estado==='CERRADO';
    const pending=l.pendientes||{},post=Array.isArray(l.movimientos_posteriores_corte)?l.movimientos_posteriores_corte:[];
    const pendingPostRows=post.filter(m=>!String(m.clasificacion||'').trim());
    const pendingPostCount=countPendingPostMovements(l);
    const pendingPost=pendingPostCount>0;
    const blocked='Pendiente de clasificación';
    const cards=[
      ['Ventas estimadas',pendingPost?blocked:(l.ventas_estimadas==null?'No calculable':money(l.ventas_estimadas)+' CUP')],
      ['Ganancia bruta estimada',pendingPost?blocked:(l.ganancia_bruta_parcial==null?'No calculable':money(l.ganancia_bruta_parcial)+' CUP'+(l.ganancia_bruta_es_total?'':' · PARCIAL'))],
      ['Costo de ventas estimado',pendingPost?blocked:(lines.some(x=>x.costo_vendido_estimado!=null)?money(lines.reduce((v,x)=>v+Number(x.costo_vendido_estimado||0),0))+' CUP'+(Number(l.costos_sin_cobertura||0)>0?' · PARCIAL':''):'No calculable')],
      ['Efectivo total recogido',l.dinero_recogido_total==null?'Pendiente':money(l.dinero_recogido_total)+' CUP'],
      ['Salario',pendingPost?blocked:(l.salario_calculado==null?'Pendiente':money(l.salario_calculado)+' CUP')],
      ['Gastos aprobados',money(l.gastos_aprobados)+' CUP'],
      ['Reinversiones',money(l.reinversiones_aprobadas)+' CUP'],
      ['Efectivo esperado (sin salario)',pendingPost?blocked:((l.efectivo_esperado_despues_de_gastos_reinversiones??l.efectivo_esperado_despues_de_gastos_reinversiones_salario)==null?'No calculable':money(l.efectivo_esperado_despues_de_gastos_reinversiones??l.efectivo_esperado_despues_de_gastos_reinversiones_salario)+' CUP')],
      ['Resultado de caja',pendingPost?blocked:differenceStatus(l.diferencia)],
      ['Costo documentado',pendingPost?blocked:(qty(l.costos_con_cobertura)+' / '+qty(l.familias_total_costo)+' familias')]
    ];
    const entries=x=>Number(x.transferencias_entrada||0)+Number(x.compras||0)+Number(x.reinversiones_entrada||0);
    const exits=x=>Number(x.transferencias_salida||0)+Number(x.vales_salida||0)+Number(x.mermas_aprobadas||0)+Number(x.bajas_aprobadas||0);
    const sums={initial:0,entries:0,exits:0,final:0,sold:0,revenue:0,cost:0,profit:0};
    lines.forEach(x=>{sums.initial+=Number(x.inventario_inicial||0);sums.entries+=entries(x);sums.exits+=exits(x);sums.final+=Number(x.inventario_final||0);sums.sold+=Number(x.unidades_vendidas||0);if(x.importe_estimado!=null)sums.revenue+=Number(x.importe_estimado);if(x.costo_vendido_estimado!=null)sums.cost+=Number(x.costo_vendido_estimado);if(x.ganancia_bruta_estimada!=null)sums.profit+=Number(x.ganancia_bruta_estimada)});
    const missingCosts=[...new Map(lines.filter(x=>Number(x.unidades_vendidas||0)>0&&x.costo_unitario_estimado==null&&x.producto_id).map(x=>[String(x.producto_id),x])).values()];
    const bulkCostsEligible=!turnClosed&&s.estado==='COMPLETADA'&&l.faltan_cortes===false;
    const tableSwitch='<div class="bcjr-table-switch"><button type="button" class="bcjr-btn active" data-bcjr-table-view="stock">Inventario físico</button><button type="button" class="bcjr-btn" data-bcjr-table-view="finance">Ventas y rentabilidad</button>'+(bulkCostsEligible&&missingCosts.length?'<button type="button" class="bcjr-btn primary" data-bcjr-open-bulk-costs data-session="'+esc(s.id)+'">Completar '+esc(missingCosts.length)+' costos en lista</button>':'')+'</div>';
    const table='<div class="bcjr-table-wrap"><table class="bcjr-table" data-bcjr-view="stock"><thead><tr><th>Producto</th><th>Inventario inicial</th><th>Entradas</th><th>Salidas</th><th>Bajas incluidas</th><th>Inventario final</th><th>Unidades vendidas</th><th>Precio venta</th><th>Ingreso est.</th><th>Costo/u est.</th><th>Costo vendido est.</th><th>Ganancia bruta est.</th><th>Margen est.</th><th>Valores</th><th>Conteo</th></tr></thead><tbody>'+
      lines.map(x=>'<tr><td>'+esc(x.nombre||'Producto')+'</td><td>'+esc(qty(x.inventario_inicial))+'</td><td>'+esc(qty(entries(x)))+'</td><td>'+esc(qty(exits(x)))+'</td><td>'+esc(qty(x.bajas_aprobadas))+'</td><td>'+esc(qty(x.inventario_final))+'</td><td>'+esc(pendingPost?blocked:qty(x.unidades_vendidas))+'</td><td>'+esc(Array.isArray(x.precio_tramos)&&x.precio_tramos.length?x.precio_tramos.map(t=>qty(t.cantidad)+' × '+money(t.precio_unitario)).join(' · '):(x.precio_unitario==null?'Sin precio':money(x.precio_unitario)))+'</td><td>'+esc(pendingPost?blocked:(x.importe_estimado==null?'—':money(x.importe_estimado)))+'</td><td>'+esc(pendingPost?blocked:(x.costo_unitario_estimado==null?'Sin costo':money(x.costo_unitario_estimado)))+'</td><td>'+esc(pendingPost?blocked:(x.costo_vendido_estimado==null?'—':money(x.costo_vendido_estimado)))+'</td><td>'+esc(pendingPost?blocked:(x.ganancia_bruta_estimada==null?'—':money(x.ganancia_bruta_estimada)))+'</td><td>'+esc(pendingPost?blocked:(x.margen_bruto_estimado==null?'—':qty(x.margen_bruto_estimado)+'%'))+'</td><td><button type="button" class="bcjr-btn small" '+(turnClosed?'disabled title="Turno cerrado"':'')+' data-bcjr-open-values data-session="'+esc(s.id)+'" data-product="'+esc(x.producto_id)+'" data-name="'+esc(x.nombre||'Producto')+'" data-price="'+esc(x.precio_unitario==null?'':x.precio_unitario)+'" data-cost="'+esc(x.costo_unitario_estimado==null?'':x.costo_unitario_estimado)+'" data-session-state="'+esc(s.estado||'')+'">Editar valores</button><button type="button" class="bcjr-btn small" '+(turnClosed?'disabled title="Turno cerrado"':'')+' data-bcjr-open-tranches data-session="'+esc(s.id)+'" data-product="'+esc(x.producto_id)+'" data-name="'+esc(x.nombre||'Producto')+'" data-sold="'+esc(x.unidades_vendidas||0)+'">Precios por tramos</button></td><td>'+(x.inventario_final_original!=null?'<button type="button" class="bcjr-btn small" '+(turnClosed?'disabled title="Turno cerrado"':'')+' data-bcjr-open-count data-session="'+esc(s.id)+'" data-product="'+esc(x.producto_id)+'" data-name="'+esc(x.nombre||'Producto')+'" data-final="'+esc(x.inventario_final)+'">Corregir final</button>':'<span class="bcjr-muted">Sin línea final</span>')+'</td></tr>').join('')+
      '</tbody><tfoot><tr><td>TOTALES</td><td>'+esc(qty(sums.initial))+'</td><td>'+esc(qty(sums.entries))+'</td><td>'+esc(qty(sums.exits))+'</td><td>'+esc(qty(lines.reduce((v,x)=>v+Number(x.bajas_aprobadas||0),0)))+'</td><td>'+esc(qty(sums.final))+'</td><td>'+esc(pendingPost?blocked:qty(sums.sold))+'</td><td>—</td><td>'+esc(pendingPost?blocked:(l.ventas_estimadas==null?'No calculable':money(l.ventas_estimadas)))+'</td><td>—</td><td>'+esc(pendingPost?blocked:money(sums.cost)+'*')+'</td><td>'+esc(pendingPost?blocked:money(sums.profit)+'*')+'</td><td>—</td><td>—</td><td>—</td></tr></tfoot></table></div><p class="bcjr-muted">'+(pendingPost?'El inventario físico sí está disponible. Las ventas, costos y ganancias quedan ocultos hasta clasificar los movimientos posteriores al corte.':'* Costos y ganancias son estimaciones parciales cuando faltan costos históricos. No equivalen a un costo FIFO completo.')+'</p>';
    const warnings=[];
    const negative=Array.isArray(l.familias_vendidas_negativas_detalle)?l.familias_vendidas_negativas_detalle:[];
    if(l.faltan_cortes)warnings.push('Falta un corte de inventario confirmado.');
    if(Number(l.familias_sin_precio||0)>0)warnings.push(Number(l.familias_sin_precio)+' familias sin precio de venta válido.');
    if(Number(l.familias_con_vendidas_negativas||0)>0){
      warnings.push(Number(l.familias_con_vendidas_negativas)+' productos/familias tienen más unidades en el corte final que las disponibles. Verifica el conteo final o registra la entrada que falte.');
      negative.forEach(x=>warnings.push((x.nombre||'Producto')+': diferencia '+qty(x.unidades_vendidas)+' · inicial '+qty(x.inventario_inicial)+' + entradas '+qty(Number(x.transferencias_entrada||0)+Number(x.compras||0)+Number(x.reinversiones_entrada||0))+' − salidas '+qty(Number(x.transferencias_salida||0)+Number(x.vales_salida||0)+Number(x.mermas_aprobadas||0)+Number(x.bajas_aprobadas||0))+' − final '+qty(x.inventario_final)));
    }
    if(l.salario_porcentaje==null)warnings.push('Configura el porcentaje salarial de esta dependienta desde la sección Almacenes.');
    if(pendingPostCount>0)warnings.push(pendingPostCount+' bajas/mermas aprobadas después del inventario final necesitan clasificación para calcular ventas, salario y diferencia de caja.');
    if(Number(l.costos_sin_cobertura||0)>0)warnings.push(Number(l.costos_sin_cobertura)+' productos con ventas sin costo de compra histórico comprobado; la ganancia mostrada es parcial.');
    if(Number(l.productos_vendidos_con_precio_faltante||0)>0)warnings.push(Number(l.productos_vendidos_con_precio_faltante)+' productos vendidos sin precio de venta válido.');
    if(Number(pending.gastos||0)>0)warnings.push(Number(pending.gastos)+' gastos pendientes.');
    if(Number(pending.reinversiones||0)>0)warnings.push(Number(pending.reinversiones)+' reinversiones pendientes.');
    if(Number(pending.ajustes||0)>0)warnings.push(Number(pending.ajustes)+' bajas/mermas pendientes.');
    const postValue=pendingPostRows.reduce((v,m)=>v+Number(m.valor_estimado||0),0);
    const postValueKnown=pendingPostRows.every(m=>m.valor_estimado!=null);
    const operationalCut=s.corte_operativo_at?new Date(s.corte_operativo_at).toLocaleString():'no disponible';
    const movements=!turnClosed&&pendingPostRows.length?'<div class="bcjr-alert"><b>Bajas y mermas registradas después del cierre operativo</b><p>'+esc(pendingPostRows.length)+' bajas/mermas · cantidad total '+esc(qty(pendingPostRows.reduce((v,m)=>v+Number(m.cantidad||0),0)))+' · valor referencial a precio actual '+(postValueKnown?esc(money(postValue)+' CUP'):'incompleto')+'. El valor es orientativo, no un gasto de caja.</p><p>Corte operativo registrado: '+esc(operationalCut)+'. La fecha de aprobación no demuestra cuándo ocurrió la baja; contrasta con la hoja del turno y decide si ocurrió antes o después de este cierre.</p><div class="bcjr-field"><button type="button" class="bcjr-btn" data-bcjr-action="classify-all-before">Marcar todas: antes del cierre</button><button type="button" class="bcjr-btn" data-bcjr-action="classify-all-after">Marcar todas: después del cierre</button></div><div class="bcjr-movement-list">'+
       pendingPostRows.map(m=>'<article class="bcjr-movement-card" data-bcjr-movement-row data-type="'+esc(m.tipo)+'" data-id="'+esc(m.id)+'"><div class="bcjr-movement-title"><b>'+esc(m.tipo)+' · '+esc(m.producto)+'</b><strong>'+esc(qty(m.cantidad))+'</strong></div><div class="bcjr-movement-meta"><span>Registrado: '+esc(m.creado_en?new Date(m.creado_en).toLocaleString():'—')+'</span><span>Aprobado: '+esc(m.fecha_revision?new Date(m.fecha_revision).toLocaleString():'—')+'</span><span>Valor referencial: '+esc(m.valor_estimado==null?'Sin precio':money(m.valor_estimado)+' CUP')+'</span><span>Estado: '+esc(m.estado)+'</span></div><label class="bcjr-movement-decision">¿Cuándo ocurrió respecto al cierre operativo?<select data-bcjr-classification><option value="">Seleccionar momento real…</option><option value="ANTES_CORTE" '+(m.clasificacion==='ANTES_CORTE'?'selected':'')+'>Antes del cierre operativo (se incluye en esta jornada)</option><option value="DESPUES_CORTE" '+(m.clasificacion==='DESPUES_CORTE'?'selected':'')+'>Después del cierre operativo (queda fuera de esta jornada)</option></select></label><small class="bcjr-movement-reason">Motivo registrado: '+esc(m.motivo||'Sin motivo')+(m.comentario_revision?' · '+esc(m.comentario_revision):'')+'</small></article>').join('')+
       '</div><div class="bcjr-field"><label>Motivo general de la clasificación<input type="text" maxlength="500" data-bcjr-movement-comment placeholder="Ej.: conciliado con la hoja manual del 9–10 de noviembre"></label><button type="button" class="bcjr-btn" data-bcjr-action="classify" data-session="'+esc(s.id)+'">Guardar clasificación auditada</button></div></div>':'';
    const successor = s.successor_reconciliation || null;
    const successorRows = Array.isArray(successor?.lines) ? successor.lines : [];
    const successorPanel = successor?.has_reconciliation === true
      ? '<details class="bcjr-detail" open><summary>Recepción física de la jornada sucesora · conciliación</summary><div class="bcjr-detail-body"><p>Compara el FINAL confirmado de esta jornada con el INICIAL físico que recibió la jornada siguiente. Solo se pueden atribuir diferencias cuando la evidencia coincide y no hubo movimientos registrados de esos productos entre el corte y la recepción.</p><div class="bcjr-table-wrap"><table class="bcjr-table"><thead><tr><th>Producto</th><th>FINAL anterior</th><th>INICIAL recibido</th><th>Diferencia</th><th>Validación</th></tr></thead><tbody>'+
        successorRows.map(x=>'<tr><td>'+esc(x.producto)+'</td><td>'+esc(qty(x.cantidad_final_anterior))+'</td><td>'+esc(qty(x.cantidad_recibida_sucesora))+'</td><td>'+esc(x.diferencia_unidades==null?'—':qty(x.diferencia_unidades))+'</td><td>'+(x.elegible===true?'<span class="bcjr-pill ok">Sin movimientos</span>':'<span class="bcjr-pill warn">'+esc((x.bloqueos||[]).join(', ')||'Revisión necesaria')+'</span>')+'</td></tr>').join('')+
        '</tbody></table></div>'+
        (successor.already_applied===true
          ? '<p class="bcjr-pill ok">Conciliación aplicada y auditada. Los cortes originales y la recepción permanecen intactos.</p>'
          : successor.can_apply===true
            ? '<p class="bcjr-muted">La operación añadirá una superposición auditada al FINAL anterior. No modifica las líneas originales, el INICIAL recibido, la recepción, el stock global ni el catálogo.</p><label>Motivo y fuente de la conciliación<textarea rows="2" maxlength="500" data-bcjr-successor-comment>Conciliación física del FINAL anterior contra el INICIAL recibido por la jornada sucesora; no constan movimientos intermedios de estos productos.</textarea></label><button type="button" class="bcjr-btn primary" data-bcjr-action="apply-successor-reconciliation" data-session="'+esc(s.id)+'">Aplicar conciliación auditada</button>'
            : '<p class="bcjr-alert"><b>No se puede aplicar automáticamente.</b> '+esc(successor.products_blocked||0)+' producto(s) tienen evidencia incompleta o movimientos intermedios. No se modificó ningún dato.</p>')+'</div></details>'
      : '';
    const correctionForm=!turnClosed&&negative.length?'<div class="bcjr-alert"><b>Corregir un conteo final equivocado</b><p>Si al cotejar el conteo físico confirmas que la cantidad final se escribió mal, introduce aquí la cantidad correcta. El corte original no se borra: la corrección queda registrada con usuario, fecha y motivo. Si la cantidad física sí es correcta, no la cambies; registra la entrada faltante.</p><div class="bcjr-field">'+negative.map(x=>'<label>'+esc(x.nombre)+' · final guardado '+esc(qty(x.inventario_final))+'<input type="number" min="0" step="0.001" data-bcjr-final-correction data-product="'+esc(x.producto_id)+'" value="'+esc(x.inventario_final)+'"></label>').join('')+'<label>Motivo obligatorio<input type="text" maxlength="500" data-bcjr-final-correction-comment placeholder="Ej.: cotejado con el inventario físico y la hoja del turno"></label><button type="button" class="bcjr-btn primary" data-bcjr-action="correct-final-counts" data-session="'+esc(s.id)+'">Guardar corrección auditada</button></div></div>':'';
    const daily=Array.isArray(s.entregas_diarias)?s.entregas_diarias:[];
    const periodDays=Math.max(1,Number(turn?.dias_turno||1));
    const periodTitle=periodDays>1?'Periodo del turno · '+fmtDate(s.fecha)+' – '+fmtDate(s.fecha_fin||s.fecha)+' · '+periodDays+' días':'Periodo del turno · '+fmtDate(s.fecha);
    const isRetail=s.es_minorista===true;
    const cashRows=daily.map(e=>'<li>'+esc(fmtDate(e.fecha))+' · Entrega diaria'+(String(e.estado||'').toUpperCase()==='APROBADA'?' aprobada':' · '+esc(e.estado||'pendiente'))+': <b>'+esc(money(e.monto))+' CUP</b></li>');
    const finalCashDate=s.fecha_fin||s.fecha;
    const finalCashState=String(s.efectivo?.estado||'').toUpperCase();
    const finalCashPending=!isRetail&&s.efectivo?.declarado!=null&&s.efectivo?.contado==null;
    const ownerPhysicalCash=isRetail?null:s.efectivo?.contado;
    const ownerCashState=isRetail?null:s.efectivo?.estado;
    if(!isRetail&&s.efectivo?.declarado!=null)cashRows.push('<li>'+esc(fmtDate(finalCashDate))+' · Declaración final'+(finalCashState==='DECLARACION_APROBADA'?' aprobada':'')+': <b>'+esc(money(s.efectivo.declarado))+' CUP</b>'+(finalCashPending?' · Conteo físico del Dueño pendiente':'')+'</li>');
    if(ownerPhysicalCash!=null)cashRows.push('<li>'+esc(fmtDate(isRetail?finalCashDate:(s.efectivo?.contado_at||'').slice(0,10)||finalCashDate))+' · Conteo físico del Dueño: <b>'+esc(money(ownerPhysicalCash))+' CUP</b> · '+esc(ownerCashState||'sin estado')+'</li>');
    const countedDate=(s.efectivo?.contado_at||'').slice(0,10);
    const lateCount=!isRetail&&countedDate&&countedDate>(s.fecha_fin||s.fecha);
    const cashNote=isRetail
      ?'En almacenes minoristas, cada aprobación del Dueño verifica el efectivo declarado de esa fecha. La suma de las entregas diarias aprobadas es el efectivo reconocido en la liquidación; no se exige un segundo conteo.'
      :finalCashPending?'La declaración final está registrada, pero todavía no tiene conteo físico del Dueño. No se suma al efectivo total recogido hasta registrar el importe contado.':lateCount?'El conteo final se registró el '+esc(fmtDate(countedDate))+', después de terminar el período ('+esc(fmtDate(s.fecha_fin||s.fecha))+'). Se conserva la fecha real del registro.':'El conteo final se muestra separado de las entregas diarias para no duplicarlo.';
    const dailyCash='<details class="bcjr-detail"><summary>Entregas diarias de efectivo <small>'+esc(money(l.dinero_recogido_total))+' CUP</small></summary><div class="bcjr-detail-body">'+(cashRows.length?'<ul>'+cashRows.join('')+'</ul>':'<p class="bcjr-muted">No hay entregas diarias ni conteo físico registrados.</p>')+'<p class="bcjr-muted">'+cashNote+'</p></div></details>';
    const rectificationPanel=rectifications.length?'<details class="bcjr-detail" open><summary>Rectificaciones posteriores al cierre <small>'+rectifications.length+' producto(s) · solo lectura</small></summary><div class="bcjr-detail-body"><p class="bcjr-muted">El Turno y sus registros originales permanecen cerrados e intactos. Estos valores se aplican únicamente a la vista de revisión histórica y tienen trazabilidad separada.</p><ul>'+rectifications.map(r=>'<li><b>'+esc(r.producto||'Producto')+'</b> · versión '+esc(r.version)+' · '+esc(qty(r.cantidad_vendida))+' unidades · '+(Array.isArray(r.tramos)?esc(r.tramos.map(t=>qty(t.cantidad)+' × '+money(t.precio_unitario)).join(' + ')):'')+' = <b>'+esc(money(r.importe_total))+' CUP</b><br><small>Valor anterior: '+esc(money(r.estado_anterior?.importe_estimado))+' CUP · Registrado por '+esc(r.creado_nombre||'ADMIN')+' · '+esc(r.creado_en?new Date(r.creado_en).toLocaleString():'—')+'<br>Fuente: '+esc(r.fuente_documental)+' · Dropbox content hash: '+esc(r.fuente_content_hash)+'<br>Motivo: '+esc(r.comentario||'—')+'</small></li>').join('')+'</ul></div></details>':'';
    const warningsPanel=warnings.length?'<details class="bcjr-detail" open><summary>Validaciones pendientes <small>'+warnings.length+'</small></summary><div class="bcjr-detail-body"><ul>'+warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></div></details>':l.calculable===true?'<p class="bcjr-pill ok">Liquidación calculable · sin bloqueos</p>':'<div class="bcjr-alert"><b>Liquidación todavía no calculable</b><p>El servidor no devolvió una causa específica. Actualiza la revisión; el sistema no debe presentar esta jornada como libre de bloqueos mientras el cálculo siga pendiente.</p></div>';
    const correctionPanel=correctionForm?'<details class="bcjr-detail"><summary>Correcciones de conteo <small>'+negative.length+' producto(s)</small></summary><div class="bcjr-detail-body">'+correctionForm+'</div></details>':'';
    const movementPanel=movements?'<details class="bcjr-detail"><summary>Bajas y mermas para clasificar <small>'+post.length+'</small></summary><div class="bcjr-detail-body">'+movements+'</div></details>':'';
    const grossProfitLabel=pendingPost?'Pendiente de clasificación':(l.ganancia_bruta_parcial==null?'No calculable':money(l.ganancia_bruta_parcial)+' CUP'+(l.ganancia_bruta_es_total?'':' · PARCIAL'));
    const cleanProfitLabel=pendingPost?'Pendiente de clasificación':(l.ganancia_limpia==null?'Fórmula pendiente de definir':money(l.ganancia_limpia)+' CUP');
    const profitHighlight='<section class="bcjr-profit-highlight" aria-label="Ganancias de la jornada"><div class="bcjr-profit-gross"><small>Ganancia bruta estimada</small><strong>'+esc(grossProfitLabel)+'</strong></div><div class="bcjr-profit-clean"><small>Ganancia limpia</small><b>'+esc(cleanProfitLabel)+'</b></div></section>';
    const financePanel='<details class="bcjr-detail"><summary>Liquidación y desglose financiero</summary><div class="bcjr-detail-body">'+profitHighlight+'<div class="bcjr-cards">'+cards.map(x=>card(x[0],x[1])).join('')+'</div><p class="bcjr-muted">Efectivo esperado (sin salario) = ventas − gastos aprobados − reinversiones aprobadas. El salario se acumula en CuevaCoin y se paga por separado. Convención de caja unificada con la hoja de cuadre: negativo = sobrante; positivo = faltante.</p></div></details>';
    return '<section class="bcjr-session"><h3>'+esc(periodTitle)+(rectifications.length?' · RECTIFICACIÓN AUDITADA':'')+'</h3><p class="bcjr-muted">Estado de la sesión: '+esc(s.estado)+' · '+esc(isRetail?'efectivo diario aprobado':'efectivo físico')+' '+esc(money(isRetail?l.dinero_recogido_total:s.efectivo?.contado))+' CUP · '+esc((isRetail?l.estado_dinero_final:s.efectivo?.estado)||'sin conteo')+'</p>'+dailyCash+rectificationPanel+financePanel+warningsPanel+correctionPanel+movementPanel+successorPanel+'<details class="bcjr-inventory"><summary><span>Ver inventario y liquidación por producto</span><small>'+('Productos en los cortes · '+(lines.length?esc(lines.length):'Pendiente de cortes de inventario confirmados'))+'</small></summary><div class="bcjr-inventory-body">'+(lines.length?tableSwitch+table:'<p class="bcjr-muted">Todavía no hay líneas físicas de inventario confirmadas. Comprueba los cortes inicial y final para mostrar la tabla por producto.</p>')+'</div></details></section>';
  }
  function render(data){
    report=data;const modal=ensure(),turn=data.turno||{},sessions=Array.isArray(data.sesiones)?data.sesiones:[];
    const sub=document.getElementById('bcjr-subtitle');if(sub)sub.textContent=(turn.almacen_nombre||'Almacén')+' · '+fmtDate(turn.fecha)+' – '+fmtDate(sessions.reduce((latest,x)=>!latest||String(x.fecha_fin||x.fecha)>String(latest)?(x.fecha_fin||x.fecha):latest,null)||turn.fecha)+' · '+String(turn.dias_turno||1)+' día(s) · PENDIENTE DE REVISIÓN';
    const body=document.getElementById('bcjr-content');
    const grossProfit=sessions.reduce((v,s)=>v+Number(s.liquidacion?.ganancia_bruta_parcial||0),0);
    const costOfSales=sessions.reduce((v,s)=>v+(s.liquidacion?.lineas||[]).reduce((w,x)=>w+Number(x.costo_vendido_estimado||0),0),0);
    const completedSessions=sessions.filter(s=>s.estado==='COMPLETADA');
    const cashSessions=sessions.filter(s=>s.liquidacion?.dinero_recogido_total!=null);
    const cashComplete=sessions.length>0&&cashSessions.length===sessions.length;
    const cashTotal=cashSessions.reduce((v,s)=>v+Number(s.liquidacion.dinero_recogido_total),0);
    const cashLabel=cashComplete?money(cashTotal)+' CUP':cashSessions.length?money(cashTotal)+' CUP · PARCIAL':'Pendiente';
    const profitComplete=sessions.length>0&&sessions.every(s=>['COMPLETADA','CANCELADA'].includes(s.estado))
      &&completedSessions.every(s=>s.liquidacion?.ganancia_bruta_es_total===true);
    const totalSales=sessions.reduce((v,s)=>v+Number(s.liquidacion?.ventas_estimadas||0),0);
    const totalDifference=sessions.reduce((v,s)=>v+Number(s.liquidacion?.diferencia||0),0);
    body.innerHTML='<div class="bcjr-cards">'+[
      card('Estado',turn.estado_maestro==='CERRADO'||turn.estado==='CERRADO'?'APROBADO':'PENDIENTE DE REVISIÓN'),
      card('Ventas estimadas',sessions.length&&sessions.every(s=>s.liquidacion?.ventas_estimadas!=null)?money(totalSales)+' CUP':'Pendiente'),
      card('Efectivo total recogido',cashLabel),
      card('Resultado de caja',sessions.length&&sessions.every(s=>s.liquidacion?.diferencia!=null)?differenceStatus(totalDifference):'Pendiente')
    ].join('')+'</div>'+sessions.map(s=>sessionHtml(s,turn)).join('');
    const blockers=[];
    sessions.forEach(s=>{
      const l=s.liquidacion||{};
      if(!['COMPLETADA','CANCELADA','CERRADA_OPERATIVAMENTE'].includes(s.estado))blockers.push('Jornada '+fmtDate(s.fecha)+': todavía está operativamente abierta.');
      if(['COMPLETADA','CERRADA_OPERATIVAMENTE'].includes(s.estado)&&l.calculable!==true)blockers.push('Jornada '+fmtDate(s.fecha)+': liquidación todavía no calculable');
      const pendingPostCount=countPendingPostMovements(l);
      if(pendingPostCount>0)blockers.push('Jornada '+fmtDate(s.fecha)+': '+pendingPostCount+' movimientos posteriores sin clasificar');
    });
    const approved=turn.estado_maestro==='CERRADO'||turn.estado==='CERRADO';
    const reject=modal.querySelector('[data-bcjr-action="reject"]');
    if(reject){reject.disabled=busy||approved;reject.textContent=approved?'Turno cerrado · solo lectura':'Solicitar correcciones';}
    const btn=modal.querySelector('[data-bcjr-action="approve"]');
    btn.disabled=busy||blockers.length>0||approved||sessions.length===0;
    btn.textContent=approved?'Turno aprobado':blockers.length?'Aprobación bloqueada · '+blockers.length+' validación(es)':'Aprobar turno';
    const msg=document.getElementById('bcjr-message');
    msg.textContent=approved?'Este Turno ya fue aprobado.':blockers.length?blockers.join(' · '):'Revisa las cifras y confirma la aprobación cuando estés conforme.';
    msg.className='bcjr-message'+(blockers.length?' bcjr-error':'');
    modal.hidden=false;document.body.classList.add('bc-jornada-review-open');
  }
  async function openReview(turnId){
    activeTurnId=turnId;const modal=ensure();modal.hidden=false;
    document.body.classList.add('bc-jornada-review-open');
    document.getElementById('bcjr-title').textContent='Revisión integral del turno';
    document.getElementById('bcjr-subtitle').textContent='Recuperando liquidación…';
    document.getElementById('bcjr-content').innerHTML='<p>Consultando inventario, ventas, costos, efectivo y movimientos…</p>';
    try{
      const data=await rpc('bc7_obtener_revision_jornada_rectificada',{p_turno_id:turnId});
      const sessions=Array.isArray(data.sesiones)?data.sesiones:[];
      const previews=await Promise.all(sessions.map(async session=>{
        if(session.estado!=='COMPLETADA')return null;
        try{return await rpc('bc7_previsualizar_reconciliacion_final_sucesora',{p_sesion_origen_id:session.id});}
        catch(error){console.warn('[BattleCruiser] No se pudo revisar la recepción sucesora',error);return null;}
      }));
      sessions.forEach((session,index)=>{session.successor_reconciliation=previews[index];});
      render(data);return true;
    }catch(e){document.getElementById('bcjr-content').innerHTML='<div class="bcjr-alert">'+esc(e.message||e)+'</div>';document.getElementById('bcjr-message').textContent='No se pudo cargar el expediente.';return false;}
  }
  function close(){const m=document.getElementById('bc-jornada-review-modal');if(m)m.hidden=true;document.querySelector('.bcjr-values-modal')?.remove();document.body.classList.remove('bc-jornada-review-open');}
  function openValuesEditor(button){
    document.querySelector('.bcjr-values-modal')?.remove();
    const box=document.createElement('div');box.className='bcjr-values-modal';
    const sessionLocal=button.dataset.sessionState==='CERRADA_OPERATIVAMENTE';
    const guidance=sessionLocal
      ?'Esta jornada ya cerró operativamente. La corrección queda auditada y solo modifica su liquidación histórica; no altera el catálogo ni las jornadas futuras.'
      :'La jornada está completada. La corrección queda auditada y actualiza la referencia vigente del catálogo para futuras jornadas, sin reescribir los cortes ni las ventas anteriores.';
    box.innerHTML='<section class="bcjr-values-dialog" role="dialog" aria-modal="true"><h3>Valores históricos · '+esc(button.dataset.name)+'</h3><p class="bcjr-muted">'+guidance+' Precio actual en el cálculo: <b>'+esc(button.dataset.price===''?'Sin precio':money(button.dataset.price))+' CUP</b>. Costo documentado actual: <b>'+esc(button.dataset.cost===''?'Sin costo':money(button.dataset.cost))+' CUP</b>. Deja vacío cualquier campo que no quieras modificar; cuando hubo varios importes, usa el promedio ponderado de la jornada.</p><label>Nuevo precio de venta unitario / promedio (CUP)<input type="number" min="0" step="0.0001" data-bcjr-value-price placeholder="Sin cambio"></label><label>Nuevo costo de compra unitario / promedio histórico (CUP)<input type="number" min="0" step="0.0001" data-bcjr-value-cost placeholder="Sin cambio"></label><label>Motivo y fuente de verificación<textarea rows="3" maxlength="500" data-bcjr-value-reason placeholder="Ej.: conciliado con la hoja manual del 9–10 de noviembre"></textarea></label><p class="bcjr-values-status" data-bcjr-values-status role="status" aria-live="polite"></p><div class="bcjr-values-actions"><button type="button" class="bcjr-btn" data-bcjr-values-cancel>Cancelar</button><button type="button" class="bcjr-btn primary" data-bcjr-values-save data-session="'+esc(button.dataset.session)+'" data-product="'+esc(button.dataset.product)+'">Guardar valores auditados</button></div></section>';
    document.body.appendChild(box);box.querySelector('[data-bcjr-value-price]')?.focus();
  }
  // Preserve each historical price segment; revenue is summed from quantity × price, never inferred from an average.
  function openTranchesEditor(button){
    document.querySelector('.bcjr-values-modal')?.remove();
    const box=document.createElement('div');box.className='bcjr-values-modal';
    box.innerHTML='<section class="bcjr-values-dialog" role="dialog" aria-modal="true"><h3>Precios por tramos · '+esc(button.dataset.name)+'</h3><p class="bcjr-muted">Una línea por cada precio real: cantidad x precio. Si todas las unidades se vendieron al mismo precio, basta una sola línea. Las cantidades deben sumar exactamente '+esc(button.dataset.sold)+' unidades vendidas. Solo afecta esta jornada.</p><label>Tramos (cantidad x precio CUP), uno por línea<textarea rows="5" data-bcjr-tranches placeholder="0.95 x 1400&#10;0.50 x 1600"></textarea></label><label>Fuente de verificación<textarea rows="2" maxlength="500" data-bcjr-tranches-reason placeholder="Ej.: conciliado con Excel manual de la jornada"></textarea></label><p class="bcjr-values-status" data-bcjr-values-status role="status" aria-live="polite"></p><div class="bcjr-values-actions"><button type="button" class="bcjr-btn" data-bcjr-values-cancel>Cancelar</button><button type="button" class="bcjr-btn primary" data-bcjr-tranches-save data-session="'+esc(button.dataset.session)+'" data-product="'+esc(button.dataset.product)+'" data-sold="'+esc(button.dataset.sold)+'">Guardar tramos auditados</button></div></section>';
    document.body.appendChild(box);box.querySelector('[data-bcjr-tranches]')?.focus();
  }
  async function saveTranchesEditor(button){
    const box=button.closest('.bcjr-values-modal'),status=box?.querySelector('[data-bcjr-values-status]');
    const setStatus=(m,k='')=>{if(status){status.textContent=m;status.className='bcjr-values-status'+(k?' '+k:'');}};
    const raw=box?.querySelector('[data-bcjr-tranches]')?.value||'';
    const reason=(box?.querySelector('[data-bcjr-tranches-reason]')?.value||'').trim();
    const tramos=[];
    for(const line of raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
      const m=line.match(/^([0-9]+(?:[.,][0-9]{1,4})?)\s*(?:x|×|@)\s*([0-9]+(?:[.,][0-9]{1,4})?)$/i);
      if(!m){setStatus('Formato inválido. Usa cantidad x precio, por ejemplo: 12 x 50.','error');return;}
      tramos.push({cantidad:Number(m[1].replace(',','.')),precio_unitario:Number(m[2].replace(',','.'))});
    }
    const sum=tramos.reduce((a,x)=>a+x.cantidad,0),sold=Number(button.dataset.sold);
    const invalidTranche=tramos.some(x=>!Number.isFinite(x.cantidad)||x.cantidad<=0||!Number.isFinite(x.precio_unitario)||x.precio_unitario<0);
    if(tramos.length<1||tramos.length>30||invalidTranche||!Number.isFinite(sold)||sold<0||Math.abs(sum-sold)>0.0001||reason.length<5){
      setStatus(invalidTranche
        ?'Cada cantidad debe ser mayor que cero y cada precio debe ser cero o mayor.'
        :'Indica entre uno y treinta precios, cantidades que sumen '+sold+' y una fuente de 5 caracteres o más.','error');return;
    }
    if(busy){setStatus('Ya hay otra operación guardándose.','error');return;}
    busy=true;button.disabled=true;button.textContent='Guardando…';setStatus('Guardando tramos y auditoría…');
    try{
      await rpc('bc7_guardar_tramos_precio_jornada',{p_turno_sesion_id:button.dataset.session,p_producto_id:button.dataset.product,p_tramos:tramos,p_comentario:reason});
      box.remove();await openReview(activeTurnId);
    }catch(error){setStatus('No se pudo guardar: '+(error?.message||String(error)),'error');button.disabled=false;button.textContent='Reintentar guardado';}
    finally{busy=false;if(report&&!document.getElementById('bc-jornada-review-modal')?.hidden)render(report);}
  }
  async function saveValuesEditor(button){
    const box=button.closest('.bcjr-values-modal');
    const status=box?.querySelector('[data-bcjr-values-status]');
    const priceInput=box?.querySelector('[data-bcjr-value-price]');
    const costInput=box?.querySelector('[data-bcjr-value-cost]');
    const reasonInput=box?.querySelector('[data-bcjr-value-reason]');
    const setStatus=(message,kind='')=>{
      if(!status)return;
      status.textContent=message;
      status.className='bcjr-values-status'+(kind?' '+kind:'');
    };
    if(!box||!priceInput||!costInput||!reasonInput){
      setStatus('No se pudo preparar el formulario. Cierra esta ventana y vuelve a abrir la revisión.','error');
      return;
    }
    const price=priceInput.value.trim(),cost=costInput.value.trim(),reason=reasonInput.value.trim();
    const hasPrice=price!=='',hasCost=cost!=='';
    if((!hasPrice&&!hasCost)||(hasPrice&&(!Number.isFinite(Number(price))||Number(price)<0))||(hasCost&&(!Number.isFinite(Number(cost))||Number(cost)<0))||reason.length<5){
      setStatus('No se guardó: introduce un precio o costo válido y un motivo/fuente de al menos 5 caracteres.','error');return;
    }
    if(busy){setStatus('Ya hay otra operación guardándose. Espera a que termine.','error');return;}
    const sessionLocal=button.dataset.sessionState==='CERRADA_OPERATIVAMENTE';
    busy=true;button.disabled=true;button.textContent='Guardando…';
    setStatus(sessionLocal
      ?'Guardando una corrección auditada exclusiva de esta Jornada…'
      :'Guardando valores de esta Jornada y fijándolos para futuras Jornadas…');
    try{
      const result=await rpc('bc7_ajustar_valores_producto_jornada',{
        p_turno_sesion_id:button.dataset.session,
        p_ajustes:[{producto_id:button.dataset.product,precio_venta_unitario:hasPrice?Number(price):null,costo_unitario:hasCost?Number(cost):null}],
        p_comentario:reason
      });
      if(sessionLocal){
        if(result.valores_solo_jornada!==true||result.catalogo_modificado!==false){
          throw new Error('El servidor no confirmó una corrección exclusiva de esta Jornada. Reabre la revisión para comprobar el resultado antes de repetir el guardado.');
        }
        setStatus('Corrección guardada solo para esta Jornada. El catálogo global no cambió. Actualizando la liquidación…','success');
      }else{
        if(result.valores_producto_persistidos!==true){
          throw new Error('El servidor no confirmó la persistencia de los valores del producto para futuras Jornadas.');
        }
        setStatus('Valores guardados y persistidos para futuras Jornadas. Actualizando la liquidación…','success');
      }
      box.remove();await openReview(activeTurnId);
    }catch(error){
      setStatus('No se pudo guardar: '+(error?.message||String(error)),'error');
      button.disabled=false;button.textContent='Reintentar guardado';
    }finally{busy=false;if(report&&!document.getElementById('bc-jornada-review-modal')?.hidden)render(report);}
  }
  const verifiedHistoricCosts={
    'botellas de agua':310,'botella de agua':310,'cerveza cristal':667,'cerveza cristal lata':667,
    'cerveza mayabe':750,'cerveza mayabe lata':750,'chicle americano':70,'chupachupa':48,'chupa chupa':48,
    'cigarros criollos':720,'cigarro criollo':720,'cigarros englishman':1350,'cigarro englishman':1350,
    'cigarros popular rojo':1200,'cigarro popular rojo':1200,'condones':31,'preservativos':31,'cubalces':9,'cubalse':9,
    'galletas mantequilla':150,'galletas maria':210,'galletas picapau':320,'guataquitas':30,'guataquitas 40':30,
    'guataquitas fabio':40,'huevos sorpresa':100,'huevo sorpresa':100,'leche condensada':950,'malta bucanero':690,
    'mani grande':240,'maní grande':240,'mantecado iskener':35,'masarreal redonda':160,'masareal redonda':160,
    'mentiplus':180,'ojitos':36,'paniqueque grande':80,'pelly cebolla':170,'pelly de cebolla':170,'suspiros':75
  };
  const normalizeProductName=value=>String(value||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
  function openBulkCostsEditor(button){
    document.querySelector('.bcjr-values-modal')?.remove();
    const session=(report?.sesiones||[]).find(x=>String(x.id)===String(button.dataset.session));
    if(!session||session.estado!=='COMPLETADA'||session.liquidacion?.faltan_cortes!==false){
      const message=document.getElementById('bcjr-message');
      if(message){message.textContent='Solo puedes completar costos cuando la jornada está completada y sus cortes están confirmados.';message.className='bcjr-message bcjr-error';}
      return;
    }
    const lines=Array.isArray(session?.liquidacion?.lineas)?session.liquidacion.lineas:[];
    const pending=[...new Map(lines.filter(x=>Number(x.unidades_vendidas||0)>0&&x.costo_unitario_estimado==null&&x.producto_id).map(x=>[String(x.producto_id),x])).values()];
    if(!pending.length)return;
    const rows=pending.map(x=>{
      const normalized=normalizeProductName(x.nombre);
      const cost=verifiedHistoricCosts[normalized];
      return '<tr><td><b>'+esc(x.nombre||'Producto')+'</b><small class="bcjr-muted" style="display:block">'+esc(qty(x.unidades_vendidas))+' vendidas</small></td><td><input type="number" min="0" step="0.0001" max="9999999999.9999" inputmode="decimal" data-bcjr-bulk-cost="'+esc(x.producto_id)+'" value="'+(cost==null?'':esc(cost))+'" placeholder="Costo CUP" aria-label="Costo histórico de '+esc(x.nombre)+'"></td><td>'+(cost==null?'<span class="bcjr-pill warn">Revisar</span>':'<span class="bcjr-pill ok">Excel</span>')+'</td></tr>';
    }).join('');
    const mapped=pending.filter(x=>verifiedHistoricCosts[normalizeProductName(x.nombre)]!=null).length;
    const box=document.createElement('div');box.className='bcjr-values-modal';
    box.innerHTML='<section class="bcjr-values-dialog" role="dialog" aria-modal="true"><h3>Costos históricos · carga en lote</h3><p class="bcjr-muted">Una sola lista para toda la jornada. '+mapped+' de '+pending.length+' costos vienen precargados desde el Excel verificado. Revisa los importes; puedes corregirlos aquí. Los vacíos no se guardarán. Los costos guardados serán la referencia global del producto para futuras Jornadas; no se modifican los lotes de compra ni las liquidaciones anteriores.</p><div class="bcjr-table-wrap" style="max-height:58dvh"><table class="bcjr-table" style="min-width:0"><thead><tr><th>Producto / vendidas</th><th>Costo CUP</th><th>Fuente</th></tr></thead><tbody>'+rows+'</tbody></table></div><label>Fuente común<textarea rows="2" maxlength="500" data-bcjr-bulk-reason>Evidencia documental de precios y costos históricos correspondiente a esta jornada.</textarea></label><p class="bcjr-values-status" data-bcjr-values-status role="status" aria-live="polite"></p><div class="bcjr-values-actions"><button type="button" class="bcjr-btn" data-bcjr-values-cancel>Cancelar</button><button type="button" class="bcjr-btn primary" data-bcjr-bulk-costs-save data-session="'+esc(button.dataset.session)+'">Guardar costos completados</button></div></section>';
    document.body.appendChild(box);
  }
  async function saveBulkCostsEditor(button){
    const box=button.closest('.bcjr-values-modal'),status=box?.querySelector('[data-bcjr-values-status]');
    const setStatus=(message,kind='')=>{if(status){status.textContent=message;status.className='bcjr-values-status'+(kind?' '+kind:'');}};
    const inputs=[...(box?.querySelectorAll('[data-bcjr-bulk-cost]')||[])];
    const filled=inputs.filter(input=>input.value.trim()!=='');
    const reason=(box?.querySelector('[data-bcjr-bulk-reason]')?.value||'').trim();
    const validCost=value=>/^(?:[0-9]+(?:\.[0-9]{1,4})?|\.[0-9]{1,4})$/.test(value);
    const ids=filled.map(input=>String(input.dataset.bcjrBulkCost||'').trim());
    const duplicateIds=new Set(ids).size!==ids.length;
    const invalid=filled.some((input,index)=>{
      const raw=input.value.trim(),amount=Number(raw);
      return !/^[0-9a-f-]{36}$/i.test(ids[index])||!validCost(raw)||!Number.isFinite(amount)||amount<0||amount>9999999999.9999;
    });
    if(!filled.length){setStatus('No hay costos completados. Introduce al menos un importe; los campos vacíos no se guardan.','error');return;}
    if(filled.length>200){setStatus('El backend admite un máximo de 200 productos por guardado. Guarda hasta 200 costos y luego vuelve a abrir la lista.','error');return;}
    if(invalid||duplicateIds){setStatus('Hay productos duplicados o importes inválidos. Usa importes no negativos con hasta 4 decimales y verifica los productos. No se guardó nada.','error');return;}
    if(reason.length<5||reason.length>500){setStatus('La fuente debe tener entre 5 y 500 caracteres. No se guardó nada.','error');return;}
    if(busy){setStatus('Ya hay otra operación guardándose.','error');return;}
    const adjustments=filled.map(input=>({producto_id:input.dataset.bcjrBulkCost,precio_venta_unitario:null,costo_unitario:Number(input.value.trim())}));
    if(!confirm('Se guardarán '+adjustments.length+' costos corregidos como referencia global del producto para futuras Jornadas. Los precios de venta no cambiarán ni se reescribirán lotes históricos. ¿Continuar?'))return;
    busy=true;button.disabled=true;button.textContent='Guardando '+adjustments.length+'…';setStatus('Guardando todos los costos en una sola operación auditada…');
    try{
      try{
        const result=await rpc('bc7_ajustar_valores_producto_jornada',{p_turno_sesion_id:button.dataset.session,p_ajustes:adjustments,p_comentario:reason});
        if(!result||result.ok!==true||Number(result.productos_ajustados)!==adjustments.length||result.catalogo_modificado!==false||result.valores_producto_persistidos!==true){
          const error=new Error('El servidor no confirmó el número exacto de costos ni su persistencia para futuras Jornadas. Reabre la revisión para comprobar el resultado; no repitas el guardado desde esta ventana.');
          error.name='UnconfirmedBulkCostResult';
          throw error;
        }
      }catch(error){
        const message=error?.message||String(error);
        const statusCode=Number(error?.status||error?.statusCode||0);
        const uncertain=error?.name==='TypeError'||error?.name==='UnconfirmedBulkCostResult'||statusCode>=500||/network|fetch|timeout|timed out|abort|connection/i.test(message);
        if(uncertain){
          button.disabled=true;button.textContent='Resultado incierto';
          setStatus('No se pudo confirmar la respuesta del servidor. No vuelvas a guardar desde esta ventana. Ciérrala y abre de nuevo la revisión para comprobar qué costos quedaron guardados. Detalle: '+message,'error');
        }else{
          button.disabled=false;button.textContent='Reintentar guardado';
          setStatus('El servidor rechazó el guardado; no se aplicaron cambios: '+message,'error');
        }
        return;
      }
      button.disabled=true;button.textContent='Guardado';
      box.querySelectorAll('input,textarea').forEach(input=>{input.disabled=true;});
      setStatus('Costos guardados como referencia global del producto. Actualizando la liquidación…','success');
      try{
        const refreshed=await openReview(activeTurnId);
        if(refreshed)box.remove();
        else setStatus('Los costos sí se guardaron, pero no se pudo recargar la revisión. Cierra esta lista y vuelve a abrir la jornada; no vuelvas a guardar estos importes.','warning');
      }catch(refreshError){
        setStatus('Los costos sí se guardaron. Falló únicamente la actualización de la revisión. Cierra esta lista y vuelve a abrir la jornada; no vuelvas a guardar estos importes.','warning');
      }
    }finally{
      busy=false;
      if(report&&!document.getElementById('bc-jornada-review-modal')?.hidden)render(report);
    }
  }
  function openCountEditor(button){
    document.querySelector('.bcjr-values-modal')?.remove();
    const box=document.createElement('div');box.className='bcjr-values-modal';
    box.innerHTML='<section class="bcjr-values-dialog" role="dialog" aria-modal="true"><h3>Corregir inventario final · '+esc(button.dataset.name)+'</h3><p class="bcjr-muted">Corrige solo si el conteo físico confirma que la cantidad guardada es incorrecta. Se conserva el corte original y se registra usuario, fecha y motivo.</p><label>Cantidad final correcta<input type="number" min="0" step="0.001" data-bcjr-count-value value="'+esc(button.dataset.final)+'"></label><label>Motivo y evidencia<textarea rows="3" maxlength="500" data-bcjr-count-reason placeholder="Ej.: reconteo físico del expediente de la jornada"></textarea></label><p class="bcjr-values-status" data-bcjr-count-status role="status" aria-live="polite"></p><div class="bcjr-values-actions"><button type="button" class="bcjr-btn" data-bcjr-count-cancel>Cancelar</button><button type="button" class="bcjr-btn primary" data-bcjr-count-save data-session="'+esc(button.dataset.session)+'" data-product="'+esc(button.dataset.product)+'">Guardar corrección auditada</button></div></section>';
    document.body.appendChild(box);box.querySelector('[data-bcjr-count-value]')?.focus();
  }
  async function saveCountEditor(button){
    const box=button.closest('.bcjr-values-modal'),status=box?.querySelector('[data-bcjr-count-status]');
    const valueInput=box?.querySelector('[data-bcjr-count-value]'),reasonInput=box?.querySelector('[data-bcjr-count-reason]');
    const setStatus=(message,kind='')=>{if(status){status.textContent=message;status.className='bcjr-values-status'+(kind?' '+kind:'');}};
    if(!box||!valueInput||!reasonInput){setStatus('No se pudo preparar el formulario. Cierra esta ventana y vuelve a abrir la revisión.','error');return;}
    const value=valueInput.value.trim(),reason=reasonInput.value.trim();
    if(value===''||!Number.isFinite(Number(value))||Number(value)<0||reason.length<5){setStatus('No se guardó: introduce una cantidad final válida y un motivo de al menos 5 caracteres.','error');return;}
    if(busy){setStatus('Ya hay otra operación guardándose. Espera a que termine.','error');return;}
    busy=true;button.disabled=true;button.textContent='Guardando…';setStatus('Guardando corrección de inventario…');
    try{
      await rpc('bc7_corregir_inventario_final_jornada',{p_turno_sesion_id:button.dataset.session,p_correcciones:[{producto_id:button.dataset.product,cantidad:Number(value)}],p_comentario:reason});
      setStatus('Corrección guardada. Actualizando la liquidación…','success');
      box.remove();await openReview(activeTurnId);
    }catch(error){setStatus('No se pudo guardar: '+(error?.message||String(error)),'error');button.disabled=false;button.textContent='Reintentar guardado';}
    finally{busy=false;if(report&&!document.getElementById('bc-jornada-review-modal')?.hidden)render(report);}
  }
  async function click(e){
    const t=e.target.closest&&e.target.closest('[data-bcjr-action],[data-bcjr-close],[data-bcjr-table-view],[data-bcjr-open-values],[data-bcjr-open-tranches],[data-bcjr-tranches-save],[data-bcjr-values-save],[data-bcjr-values-cancel],[data-bcjr-open-count],[data-bcjr-count-save],[data-bcjr-count-cancel],[data-bcjr-open-bulk-costs],[data-bcjr-bulk-costs-save]');if(!t)return;
    if(t.hasAttribute('data-bcjr-close')){close();return;}
    if(t.hasAttribute('data-bcjr-table-view')){const body=t.closest('.bcjr-inventory-body'),table=body?.querySelector('.bcjr-table'),view=t.dataset.bcjrTableView;if(table){table.dataset.bcjrView=view;body.querySelectorAll('[data-bcjr-table-view]').forEach(b=>b.classList.toggle('active',b===t));}return;}
    if(t.hasAttribute('data-bcjr-open-values')){openValuesEditor(t);return;}
    if(t.hasAttribute('data-bcjr-open-tranches')){openTranchesEditor(t);return;}
    if(t.hasAttribute('data-bcjr-open-bulk-costs')){openBulkCostsEditor(t);return;}
    if(t.hasAttribute('data-bcjr-bulk-costs-save')){await saveBulkCostsEditor(t);return;}
    if(t.hasAttribute('data-bcjr-tranches-save')){await saveTranchesEditor(t);return;}
    if(t.hasAttribute('data-bcjr-values-cancel')){t.closest('.bcjr-values-modal')?.remove();return;}
    if(t.hasAttribute('data-bcjr-values-save')){await saveValuesEditor(t);return;}
    if(t.hasAttribute('data-bcjr-open-count')){openCountEditor(t);return;}
    if(t.hasAttribute('data-bcjr-count-cancel')){t.closest('.bcjr-values-modal')?.remove();return;}
    if(t.hasAttribute('data-bcjr-count-save')){await saveCountEditor(t);return;}
    const action=t.dataset.bcjrAction;
    if(busy)return;
    if(action==='apply-successor-reconciliation'){
      const section=t.closest('.bcjr-session');
      const comment=(section?.querySelector('[data-bcjr-successor-comment]')?.value||'').trim();
      if(comment.length<5||comment.length>500){
        document.getElementById('bcjr-message').textContent='Explica la fuente física de la conciliación (5–500 caracteres).';
        return;
      }
      if(!confirm('Se añadirá una corrección auditada al FINAL histórico de esta jornada para los productos sin movimientos intermedios. Los cortes originales, la recepción de la jornada sucesora, el stock global y el catálogo no se modificarán. ¿Confirmas?'))return;
      await run(async()=>{
        const key=window.crypto&&typeof window.crypto.randomUUID==='function'
          ?window.crypto.randomUUID()
          :String(Date.now())+'-'+Math.random().toString(16).slice(2);
        const result=await rpc('bc7_aplicar_reconciliacion_final_sucesora',{
          p_sesion_origen_id:t.dataset.session,
          p_comentario:comment,
          p_idempotency_key:key
        });
        if(!result||result.ok!==true)throw new Error('El servidor no confirmó la conciliación.');
        await openReview(activeTurnId);
        if(typeof window.refrescarAprobacionesAdmin==='function')await window.refrescarAprobacionesAdmin();
        if(typeof window.refrescarCentroControl==='function')await window.refrescarCentroControl();
      });
      return;
    }
    if(action==='correct-final-counts'){
      const section=t.closest('.bcjr-session');
      const comment=(section?.querySelector('[data-bcjr-final-correction-comment]')?.value||'').trim();
      const corrections=Array.from(section?.querySelectorAll('[data-bcjr-final-correction]')||[]).map(input=>({producto_id:input.dataset.product,cantidad:input.value}));
      if(!comment||corrections.some(x=>x.cantidad.trim()===''||!Number.isFinite(Number(x.cantidad))||Number(x.cantidad)<0)){
        document.getElementById('bcjr-message').textContent='Indica cantidades válidas y explica el motivo de la corrección.';
        return;
      }
      await run(async()=>{await rpc('bc7_corregir_inventario_final_jornada',{p_turno_sesion_id:t.dataset.session,p_correcciones:corrections,p_comentario:comment});await openReview(activeTurnId);});
    }else if(action==='classify-all-before'||action==='classify-all-after'){
      const section=t.closest('.bcjr-session');
      const value=action==='classify-all-before'?'ANTES_CORTE':'DESPUES_CORTE';
      section?.querySelectorAll('[data-bcjr-classification]').forEach(select=>{select.value=value;});
      const msg=document.getElementById('bcjr-message');
      if(msg)msg.textContent='Selección preparada. Revisa los movimientos y guarda la clasificación auditada para aplicar el cambio.';
      return;
    }
    if(action==='classify'){
      const session=t.dataset.session,section=t.closest('.bcjr-session');
      const rows=Array.from(section?.querySelectorAll('[data-bcjr-movement-row]')||[]);
      const comment=(section?.querySelector('[data-bcjr-movement-comment]')?.value||'').trim();
      const decisions=rows.map(row=>({tipo:row.dataset.type,id:row.dataset.id,
        clasificacion:row.querySelector('[data-bcjr-classification]')?.value||'',comentario:comment}));
      if(!comment||decisions.some(x=>!x.clasificacion)){document.getElementById('bcjr-message').textContent='Clasifica cada movimiento y escribe el motivo.';return;}
      await run(async()=>{await rpc('bc7_clasificar_movimientos_fuera_corte',{p_turno_sesion_id:session,p_decisiones:decisions});await openReview(activeTurnId);});
    }else if(action==='reject'){
      const comment=prompt('Describe las correcciones necesarias para esta jornada:');
      if(!comment||!comment.trim())return;
      await run(async()=>{await rpc('bc7_resolver_revision_jornada',{p_turno_id:activeTurnId,p_decision:'RECHAZAR',p_comentario:comment.trim()});await openReview(activeTurnId);});
    }else if(action==='approve'){
      const turn=report?.turno||{};
      const profitIsPartial=(report?.sesiones||[]).some(s=>s.estado==='COMPLETADA'&&s.liquidacion?.ganancia_bruta_es_total!==true);
      const confirmText=profitIsPartial
        ?'La ganancia bruta sigue siendo parcial porque faltan costos/precios históricos para algunos productos vendidos. Puedes aprobar inventario y caja, pero la ganancia no quedará cerrada como total. ¿Confirmas que revisaste esa limitación?'
        :'Vas a aprobar y cerrar definitivamente este Turno. Comprueba antes los importes, inventario y observaciones. ¿Confirmas?';
      if(!confirm(confirmText))return;
      await run(async()=>{await rpc('bc7_resolver_revision_jornada',{p_turno_id:activeTurnId,p_decision:'APROBAR',p_comentario:null});await openReview(activeTurnId);if(typeof window.refrescarAprobacionesAdmin==='function')await window.refrescarAprobacionesAdmin();if(typeof window.refrescarCentroControl==='function')await window.refrescarCentroControl();});
    }
  }
  async function run(fn){
    busy=true;const msg=document.getElementById('bcjr-message');if(msg)msg.textContent='Guardando…';
    try{await fn();}catch(e){if(msg){msg.textContent=e.message||String(e);msg.className='bcjr-message bcjr-error';}}
    finally{busy=false;if(report&&!document.getElementById('bc-jornada-review-modal')?.hidden)render(report);}
  }
  document.addEventListener('click',click);
  window.bcAbrirRevisionJornada=openReview;
})();
