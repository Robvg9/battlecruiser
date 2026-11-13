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
      .bcjr-dialog{position:relative;width:min(1440px,100%);max-height:96vh;overflow:auto;background:var(--card-bg,#fff);color:var(--text,#172033);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.35);padding:22px}
      .bcjr-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid var(--border,#ddd);padding-bottom:14px;margin-bottom:16px}
      .bcjr-head h2{margin:0 0 5px;font-size:1.4rem}.bcjr-head p{margin:0;color:var(--muted,#667085)}
      .bcjr-close{border:0;background:transparent;font-size:28px;cursor:pointer;color:inherit}
      .bcjr-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:14px 0}
      .bcjr-card{border:1px solid var(--border,#ddd);border-radius:12px;padding:12px;background:var(--surface,#f8fafc)}
      .bcjr-card small{display:block;color:var(--muted,#667085);font-size:.78rem}.bcjr-card b{display:block;font-size:1.12rem;margin-top:5px;overflow-wrap:anywhere}
      .bcjr-session{border:1px solid var(--border,#ddd);border-radius:14px;margin:16px 0;padding:16px}
      .bcjr-session h3{margin:0 0 8px}.bcjr-muted{color:var(--muted,#667085);font-size:.88rem}
      .bcjr-pill{display:inline-block;border-radius:999px;padding:4px 9px;background:#eef2f6;font-size:.78rem;font-weight:700}
      .bcjr-pill.warn{background:#fff2d6;color:#895b00}.bcjr-pill.ok{background:#e4f5e9;color:#176c38}
      .bcjr-alert{border-left:4px solid #c88c16;background:#fff8e7;padding:10px 12px;margin:10px 0;border-radius:6px}
      .bcjr-table-wrap{overflow:auto;border:1px solid var(--border,#ddd);border-radius:10px;margin:12px 0}
      .bcjr-table{border-collapse:collapse;width:100%;min-width:1180px;font-size:.82rem}
      .bcjr-table th,.bcjr-table td{padding:8px 9px;border-bottom:1px solid var(--border,#e2e8f0);white-space:nowrap;text-align:right}
      .bcjr-table th:first-child,.bcjr-table td:first-child{text-align:left;position:sticky;left:0;background:var(--card-bg,#fff);z-index:1}
      .bcjr-table thead th{background:var(--surface,#f1f5f9);position:sticky;top:0;z-index:2}
      .bcjr-table tfoot td{font-weight:800;background:var(--surface,#f1f5f9)}
      .bcjr-field{display:flex;flex-wrap:wrap;align-items:end;gap:9px;margin:12px 0;padding:12px;border:1px solid var(--border,#ddd);border-radius:10px}
      .bcjr-field label{display:flex;flex-direction:column;gap:4px;font-size:.83rem}
      .bcjr-field input,.bcjr-field select,.bcjr-field textarea{padding:8px;border:1px solid var(--border,#bbb);border-radius:7px;max-width:100%}
      .bcjr-btn{border:1px solid var(--border,#bbb);border-radius:9px;padding:9px 13px;background:var(--surface,#f5f7fa);color:inherit;cursor:pointer;font-weight:650}
      .bcjr-btn.primary{background:var(--primary,#164e8a);color:white;border-color:transparent}.bcjr-btn.danger{color:#a32323}
      .bcjr-btn:disabled{opacity:.45;cursor:not-allowed}
      .bcjr-footer{position:sticky;bottom:-22px;background:var(--card-bg,#fff);padding:14px 0 0;border-top:1px solid var(--border,#ddd);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:18px}
      .bcjr-footer-actions{display:flex;gap:8px;flex-wrap:wrap}
      .bcjr-message{min-height:1.3em;color:var(--muted,#667085);font-size:.88rem}.bcjr-error{color:#b42318}
      @media(max-width:650px){.bcjr-dialog{padding:14px;max-height:98vh}.bcjr-head h2{font-size:1.15rem}.bcjr-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.bcjr-session{padding:10px}}
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
  function sessionHtml(s){
    const l=s.liquidacion||{},lines=Array.isArray(l.lineas)?l.lineas:[];
    const pending=l.pendientes||{},post=Array.isArray(l.movimientos_posteriores_corte)?l.movimientos_posteriores_corte:[];
    const cards=[
      ['Ventas estimadas',l.ventas_estimadas==null?'No calculable':money(l.ventas_estimadas)+' CUP'],
      ['Efectivo recogido',l.dinero_recogido_total==null?'Pendiente':money(l.dinero_recogido_total)+' CUP'],
      ['Salario',l.salario_calculado==null?'Pendiente':money(l.salario_calculado)+' CUP'],
      ['Gastos aprobados',money(l.gastos_aprobados)+' CUP'],
      ['Reinversiones',money(l.reinversiones_aprobadas)+' CUP'],
      ['Efectivo esperado',l.efectivo_esperado_despues_de_gastos_reinversiones_salario==null?'No calculable':money(l.efectivo_esperado_despues_de_gastos_reinversiones_salario)+' CUP'],
      ['Diferencia',l.diferencia==null?'No calculable':money(l.diferencia)+' CUP'],
      ['Costo documentado',qty(l.costos_con_cobertura)+' / '+qty(l.familias_total_costo)+' familias']
    ];
    const entries=x=>Number(x.transferencias_entrada||0)+Number(x.compras||0)+Number(x.reinversiones_entrada||0);
    const exits=x=>Number(x.transferencias_salida||0)+Number(x.vales_salida||0)+Number(x.mermas_aprobadas||0)+Number(x.bajas_aprobadas||0);
    const sums={initial:0,entries:0,exits:0,final:0,sold:0,revenue:0,cost:0,profit:0};
    lines.forEach(x=>{sums.initial+=Number(x.inventario_inicial||0);sums.entries+=entries(x);sums.exits+=exits(x);sums.final+=Number(x.inventario_final||0);sums.sold+=Number(x.unidades_vendidas||0);if(x.importe_estimado!=null)sums.revenue+=Number(x.importe_estimado);if(x.costo_vendido_estimado!=null)sums.cost+=Number(x.costo_vendido_estimado);if(x.ganancia_bruta_estimada!=null)sums.profit+=Number(x.ganancia_bruta_estimada)});
    const table='<div class="bcjr-table-wrap"><table class="bcjr-table"><thead><tr><th>Producto</th><th>Inicial</th><th>Entradas</th><th>Salidas</th><th>Bajas</th><th>Final</th><th>Vendidas</th><th>Precio venta</th><th>Ingreso est.</th><th>Costo/u est.</th><th>Costo vendido est.</th><th>Ganancia bruta est.</th><th>Margen est.</th></tr></thead><tbody>'+
      lines.map(x=>'<tr><td>'+esc(x.nombre||'Producto')+'</td><td>'+esc(qty(x.inventario_inicial))+'</td><td>'+esc(qty(entries(x)))+'</td><td>'+esc(qty(exits(x)))+'</td><td>'+esc(qty(x.bajas_aprobadas))+'</td><td>'+esc(qty(x.inventario_final))+'</td><td>'+esc(qty(x.unidades_vendidas))+'</td><td>'+esc(x.precio_unitario==null?'Sin precio':money(x.precio_unitario))+'</td><td>'+esc(x.importe_estimado==null?'—':money(x.importe_estimado))+'</td><td>'+esc(x.costo_unitario_estimado==null?'Sin costo':money(x.costo_unitario_estimado))+'</td><td>'+esc(x.costo_vendido_estimado==null?'—':money(x.costo_vendido_estimado))+'</td><td>'+esc(x.ganancia_bruta_estimada==null?'—':money(x.ganancia_bruta_estimada))+'</td><td>'+esc(x.margen_bruto_estimado==null?'—':qty(x.margen_bruto_estimado)+'%')+'</td></tr>').join('')+
      '</tbody><tfoot><tr><td>TOTALES</td><td>'+esc(qty(sums.initial))+'</td><td>'+esc(qty(sums.entries))+'</td><td>'+esc(qty(sums.exits))+'</td><td>'+esc(qty(lines.reduce((v,x)=>v+Number(x.bajas_aprobadas||0),0)))+'</td><td>'+esc(qty(sums.final))+'</td><td>'+esc(qty(sums.sold))+'</td><td>—</td><td>'+esc(l.ventas_estimadas==null?'No calculable':money(l.ventas_estimadas))+'</td><td>—</td><td>'+esc(money(sums.cost))+'*</td><td>'+esc(money(sums.profit))+'*</td><td>—</td></tr></tfoot></table></div><p class="bcjr-muted">* Costos y ganancias son estimaciones parciales cuando faltan costos históricos. No equivalen a un costo FIFO completo.</p>';
    const warnings=[];
    if(l.faltan_cortes)warnings.push('Falta un corte de inventario confirmado.');
    if(Number(l.familias_sin_precio||0)>0)warnings.push(Number(l.familias_sin_precio)+' familias sin precio de venta válido.');
    if(Number(l.familias_con_vendidas_negativas||0)>0)warnings.push(Number(l.familias_con_vendidas_negativas)+' familias con unidades vendidas negativas; revisar inventario o entradas no registradas.');
    if(l.salario_porcentaje==null)warnings.push('Falta fijar el porcentaje salarial del Dueño.');
    if(Number(l.movimientos_posteriores_pendientes||0)>0)warnings.push(Number(l.movimientos_posteriores_pendientes)+' bajas/mermas aprobadas después del inventario final necesitan clasificación.');
    if(Number(l.costos_sin_cobertura||0)>0)warnings.push(Number(l.costos_sin_cobertura)+' familias sin costo de compra histórico comprobado; la ganancia total no puede considerarse cerrada.');
    if(Number(pending.gastos||0)>0)warnings.push(Number(pending.gastos)+' gastos pendientes.');
    if(Number(pending.reinversiones||0)>0)warnings.push(Number(pending.reinversiones)+' reinversiones pendientes.');
    if(Number(pending.ajustes||0)>0)warnings.push(Number(pending.ajustes)+' bajas/mermas pendientes.');
    const salary=s.salario_porcentaje==null?'<div class="bcjr-field"><label>Porcentaje salarial de esta jornada (%)<input type="number" min="0" max="100" step="0.01" data-bcjr-salary-input="'+esc(s.id)+'" placeholder="Escribe el porcentaje"></label><button type="button" class="bcjr-btn" data-bcjr-action="salary" data-session="'+esc(s.id)+'">Guardar porcentaje</button><small>Es una decisión del Dueño; no se aplica un valor predeterminado.</small></div>':'<p class="bcjr-muted">Porcentaje salarial fijado: <b>'+esc(qty(s.salario_porcentaje))+'%</b></p>';
    const movements=post.length?'<div class="bcjr-alert"><b>Movimientos aprobados después del inventario final</b><p>Confirma si cada pérdida ocurrió antes o después del conteo físico. El sistema no la incluirá en la fórmula hasta que la clasifiques.</p><div class="bcjr-table-wrap"><table class="bcjr-table" style="min-width:840px"><thead><tr><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Registrado</th><th>Estado</th><th>Momento real</th><th>Motivo</th></tr></thead><tbody>'+
      post.map(m=>'<tr data-bcjr-movement-row data-type="'+esc(m.tipo)+'" data-id="'+esc(m.id)+'"><td>'+esc(m.tipo)+'</td><td>'+esc(m.producto)+'</td><td>'+esc(qty(m.cantidad))+'</td><td>'+esc(m.creado_en?new Date(m.creado_en).toLocaleString():'—')+'</td><td>'+esc(m.estado)+'</td><td><select data-bcjr-classification><option value="">Seleccionar…</option><option value="ANTES_CORTE" '+(m.clasificacion==='ANTES_CORTE'?'selected':'')+'>Ocurrió antes del inventario final</option><option value="DESPUES_CORTE" '+(m.clasificacion==='DESPUES_CORTE'?'selected':'')+'>Ocurrió después del inventario final</option></select></td><td>'+esc(m.motivo||'—')+(m.comentario_revision?'<small> · '+esc(m.comentario_revision)+'</small>':'')+'</td></tr>').join('')+
      '</tbody></table></div><div class="bcjr-field"><label>Motivo general de la clasificación<input type="text" maxlength="500" data-bcjr-movement-comment placeholder="Por qué confirmas el momento de estos movimientos"></label><button type="button" class="bcjr-btn" data-bcjr-action="classify" data-session="'+esc(s.id)+'">Guardar clasificación auditada</button></div></div>':'';
    return '<section class="bcjr-session"><h3>Día '+esc(s.numero_dia)+' · '+esc(fmtDate(s.fecha))+(s.fecha_fin&&s.fecha_fin!==s.fecha?' – '+esc(fmtDate(s.fecha_fin)):'')+'</h3><p class="bcjr-muted">Estado '+esc(s.estado)+' · efectivo declarado '+esc(money(s.efectivo?.declarado))+' CUP · contado '+esc(money(s.efectivo?.contado))+' CUP · '+esc(s.efectivo?.estado||'sin declaración')+'</p><span class="bcjr-pill '+(l.calculable===true?'ok':'warn')+'">'+(l.calculable===true?'Liquidación calculable':'Liquidación provisional')+'</span><div class="bcjr-cards">'+cards.map(x=>card(x[0],x[1])).join('')+'</div>'+salary+(warnings.length?'<div class="bcjr-alert"><b>Validaciones pendientes</b><ul>'+warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></div>':'<p class="bcjr-pill ok">Sin bloqueos de cálculo</p>')+movements+(lines.length?table:'<p class="bcjr-muted">No hay líneas de inventario para esta sesión.</p>')+'</section>';
  }
  function render(data){
    report=data;const modal=ensure(),turn=data.turno||{},sessions=Array.isArray(data.sesiones)?data.sesiones:[];
    const sub=document.getElementById('bcjr-subtitle');if(sub)sub.textContent=(turn.almacen_nombre||'Almacén')+' · '+fmtDate(turn.fecha)+' · '+sessions.length+' sesión(es) · '+(turn.estado_maestro||turn.estado||'');
    const body=document.getElementById('bcjr-content');
    body.innerHTML='<div class="bcjr-cards">'+[
      card('Estado del turno',turn.estado_maestro||turn.estado),
      card('Jornadas completadas',sessions.filter(s=>s.estado==='COMPLETADA').length+' / '+sessions.length),
      card('Efectivo contado',money(sessions.reduce((v,s)=>v+Number(s.liquidacion?.dinero_recogido_total||0),0))+' CUP'),
      card('Gastos',money(sessions.reduce((v,s)=>v+Number(s.liquidacion?.gastos_aprobados||0),0))+' CUP'),
      card('Reinversiones',money(sessions.reduce((v,s)=>v+Number(s.liquidacion?.reinversiones_aprobadas||0),0))+' CUP')
    ].join('')+'</div>'+sessions.map(sessionHtml).join('');
    const blockers=[];
    sessions.forEach(s=>{
      const l=s.liquidacion||{};
      if(s.estado==='COMPLETADA'&&l.calculable!==true)blockers.push('Día '+s.numero_dia+': liquidación todavía no calculable');
      if(Number(l.movimientos_posteriores_pendientes||0)>0)blockers.push('Día '+s.numero_dia+': movimientos posteriores sin clasificar');
    });
    const approved=turn.estado_maestro==='CERRADO'||turn.estado==='CERRADO';
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
    try{const data=await rpc('bc7_obtener_revision_jornada',{p_turno_id:turnId});render(data);}
    catch(e){document.getElementById('bcjr-content').innerHTML='<div class="bcjr-alert">'+esc(e.message||e)+'</div>';document.getElementById('bcjr-message').textContent='No se pudo cargar el expediente.';}
  }
  function close(){const m=document.getElementById('bc-jornada-review-modal');if(m)m.hidden=true;document.body.classList.remove('bc-jornada-review-open');}
  async function click(e){
    const t=e.target.closest&&e.target.closest('[data-bcjr-action],[data-bcjr-close]');if(!t)return;
    if(t.hasAttribute('data-bcjr-close')){close();return;}
    const action=t.dataset.bcjrAction;
    if(busy)return;
    if(action==='salary'){
      const input=document.querySelector('[data-bcjr-salary-input="'+t.dataset.session+'"]');
      const value=Number(input&&input.value);
      if(!input||input.value.trim()===''||!Number.isFinite(value)||value<0||value>100){document.getElementById('bcjr-message').textContent='Escribe un porcentaje entre 0 y 100.';return;}
      await run(async()=>{await rpc('bc7_configurar_salario_porcentaje_jornada',{p_turno_sesion_id:t.dataset.session,p_porcentaje:value});await openReview(activeTurnId);});
    }else if(action==='classify'){
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
      if(!confirm('Vas a aprobar y cerrar definitivamente este Turno. Comprueba antes los importes, inventario y observaciones. ¿Confirmas?'))return;
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
