// BattleCruiser — Misión 2/7 · Aprobaciones administrativas
// Una sola capa para entregas/cuadres + gastos/mermas/bajas. Sin colas/cachés paralelas.
(function(){'use strict';
const ID='admin-aprobaciones',TIMEOUT=20000;
const esc=v=>typeof escHtml==='function'?escHtml(v):String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const key=()=>crypto.randomUUID(),money=v=>typeof window.money==='function'?window.money(v):Number(v||0).toFixed(2),can=(s,a)=>typeof tienePermiso==='function'&&tienePermiso(s,a);
const canAdmin=()=>can('entregas_caja','editar_any')||canViewOperationalQueue();
const canViewOperationalQueue=()=>can('gastos','editar_any')||can('mermas','editar_any')||can('bajas','editar_any')||can('reinversiones','editar_any')||can('entregas_caja','editar_any')||can('auditoria','editar_any');
async function hasLiveSession(){const api=window.client||(typeof client!=='undefined'?client:null);if(!api||!api.auth||typeof api.auth.getSession!=='function')return false;try{const pack=await api.auth.getSession();return !!(pack&&!pack.error&&pack.data&&pack.data.session&&pack.data.session.user&&pack.data.session.user.id)}catch(_){return false}}
const productos=()=>Array.isArray(window._cache?.productos)?window._cache.productos:[],almacenes=()=>Array.isArray(window._cache?.almacenes)?window._cache.almacenes.filter(a=>a.activo!==false):[];
async function rpc(name,params){if(!window.client)throw new Error('Backend no disponible');let timer;try{const p=client.rpc(name,params||{}),t=new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('Tiempo de espera agotado')),TIMEOUT)),r=await Promise.race([p,t]);if(r.error)throw r.error;return r.data}finally{clearTimeout(timer)}}
function ensurePanel(){if(!canAdmin())return null;let el=document.getElementById(ID);if(el)return el;const host=document.getElementById('cc-atencion');if(!host)return null;const b=document.createElement('div');b.className='cc-bloque';b.id=ID;b.innerHTML='<h3>🔐 Aprobaciones administrativas</h3><p class="muted">Revisa cada solicitud en su propio menú flotante, consulta productos y motivos, y después acepta o rechaza.</p><div class="lista" id="admin-aprobaciones-lista"><p class="lista-estado">Cargando…</p></div>';host.parentElement.insertBefore(b,host);return b}
const listEl=()=>{const p=ensurePanel();return p&&p.querySelector('#admin-aprobaciones-lista')};
function row(title,detail,buttons){const d=document.createElement('div');d.className='rep-fila';d.innerHTML='<span class="rep-fila-principal"><span class="cc-asunto-tipo">'+esc(title)+'</span><span class="muted">'+esc(detail)+'</span></span>';const box=document.createElement('div');box.className='btn-row';buttons.forEach(b=>{const x=document.createElement('button');x.type='button';x.className='cc-accion';x.textContent=b.text;x.onclick=b.fn;box.appendChild(x)});d.appendChild(box);return d}
async function load(){if(!canAdmin()||!(await hasLiveSession()))return;const el=listEl();if(!el)return;if(!navigator.onLine){el.innerHTML='<p class="lista-estado">⚪ Sin conexión. Las aprobaciones requieren conexión.</p>';return}el.innerHTML='<p class="lista-estado">Cargando aprobaciones…</p>';try{const jobs=[];if(can('entregas_caja','editar_any')){jobs.push(rpc('listar_entregas_caja',{p_ciclo_id:null,p_almacen_id:null,p_estado:null}).then(e=>({k:'e',d:Array.isArray(e)?e:[]})));jobs.push(rpc('listar_cuadres',{p_limite:50,p_offset:0}).then(c=>({k:'c',d:Array.isArray(c)?c:[]})))}if(canViewOperationalQueue())jobs.push(rpc('listar_aprobaciones_admin').then(a=>({k:'o',d:Array.isArray(a)?a:[]})));const rs=await Promise.all(jobs),rows=[];for(const r of rs){if(r.k==='e')r.d.filter(x=>['DECLARADA','CONTADA'].includes(x.estado)).forEach(x=>rows.push({rank:x.estado==='DECLARADA'?0:1,node:renderEntrega(x)}));if(r.k==='c')r.d.filter(x=>['CON_DIFERENCIA','EN_REVISION'].includes(x.estado)).forEach(x=>rows.push({rank:2,node:renderCuadre(x)}));if(r.k==='o')r.d.forEach(x=>rows.push({rank:3,node:renderOperativa(x)}))}rows.sort((a,b)=>a.rank-b.rank);if(typeof window.bcActualizarBadgeAprobacionesAdmin==='function')window.bcActualizarBadgeAprobacionesAdmin(rows.length);if(!rows.length){el.innerHTML='<p class="lista-estado">✓ No hay aprobaciones pendientes.</p>';return}el.innerHTML='';rows.forEach(r=>el.appendChild(r.node))}catch(e){el.innerHTML='<p class="lista-estado">No se pudieron cargar las aprobaciones: '+esc(e.message||e)+'</p>'}}
function renderEntrega(x){const estado=x.estado==='DECLARADA'?'DECLARADA — falta contar':'CONTADA — falta aprobar';const dif=x.diferencia==null?'':' · Diferencia $'+money(x.diferencia);return row('💵 Entrega de caja',(x.declarado_nombre||'Usuario')+' · '+(x.almacen_nombre||'Almacén')+' · '+estado+' · Declarado $'+money(x.monto_declarado)+dif,x.estado==='DECLARADA'?[{text:'Contar dinero',fn:()=>contarEntrega(x.id)}]:[{text:'Aprobar',fn:()=>revisarEntrega(x.id,'aprobar')},{text:'Rechazar',fn:()=>revisarEntrega(x.id,'rechazar')}])}
function renderCuadre(x){const dif=Number(x.diferencia||0),s=dif<0?'Faltante $'+money(Math.abs(dif)):dif>0?'Sobrante $'+money(dif):'Exacto';return row('🧾 Cuadre pendiente','Esperado $'+money(x.dinero_esperado)+' · Declarado $'+money(x.dinero_declarado)+' · '+s,[{text:'Aprobar',fn:()=>revisarCuadre(x.id,'aprobar')},{text:'Rechazar',fn:()=>revisarCuadre(x.id,'rechazar')}])}
function renderOperativa(x){
  const who=x.usuario_nombre||'Sheila';
  let title,detail='';
  if(x.tipo==='gasto'){
    title='💸 Gasto pendiente';
    detail=who+' ha registrado un gasto: '+(x.resumen||'Gasto')+' · '+money(x.monto)+' CUP';
  }else if(x.tipo==='reinversion'){
    title='🛒 Reinversión pendiente';
    detail=who+' ha registrado una reinversión: '+(x.resumen||'Producto')+' = '+money(x.monto)+' CUP';
  }else if(x.tipo==='declaracion_jornada'){
    title='💵 Declaración final de efectivo';
    detail=who+' ha declarado '+money(x.monto)+' CUP · '+(String(x.motivo||'').toUpperCase()==='LISTO_PARA_CONTAR'?'Lista para conteo físico':'Pendiente: '+(x.motivo||'completar checklist'));
  }else if(x.tipo==='entrega_diaria'){
    title='💵 Entrega diaria de efectivo pendiente';
    detail=who+' ha declarado '+money(x.monto)+' CUP';
  }else if(x.tipo==='baja_lista'){
    title='📋 Lista de bajas pendiente';
    detail=who+' ha registrado '+(x.producto_nombre||'una lista de bajas')+(x.cantidad!=null?' · '+x.cantidad+' u':'');
  }else{
    title=x.tipo==='merma'?'📉 Merma pendiente':'📉 Baja pendiente';
    detail=who+' · '+(x.producto_nombre||'Producto')+(x.cantidad!=null?' · '+x.cantidad+' u':'')+(x.motivo?' · '+x.motivo:'');
  }
  return row(title,detail,[{text:'Revisar',fn:()=>abrirRevision(x)}]);
}
let approvalFocusReturn=null;
function ensureApprovalModal(){
  let modal=document.getElementById('admin-aprobacion-modal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='admin-aprobacion-modal';
  modal.className='bc-admin-approval-modal';
  modal.hidden=true;
  modal.innerHTML=
    '<div class="bc-admin-approval-backdrop" data-bc-admin-close></div>'+
    '<section class="bc-admin-approval-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-approval-title" tabindex="-1">'+
      '<header class="bc-admin-approval-head"><div><h2 id="admin-approval-title">Revisión administrativa</h2><p id="admin-approval-subtitle"></p></div>'+
      '<button type="button" class="bc-admin-approval-close" data-bc-admin-close aria-label="Cerrar">×</button></header>'+
      '<div class="bc-admin-approval-body" id="admin-approval-body"></div>'+
      '<footer class="bc-admin-approval-footer" id="admin-approval-footer">'+
        '<button type="button" class="cc-accion bc-admin-approval-reject" id="admin-approval-reject">Rechazar</button>'+
        '<button type="button" class="cc-accion bc-admin-approval-accept" id="admin-approval-accept">Aceptar y aprobar</button>'+
      '</footer>'+
    '</section>';
  document.body.appendChild(modal);
  modal.addEventListener('click',event=>{
    if(event.target.closest('[data-bc-admin-close]'))closeApprovalModal();
  });
  modal.querySelector('#admin-approval-reject').addEventListener('click',()=>resolverDesdeModal('RECHAZAR'));
  modal.querySelector('#admin-approval-accept').addEventListener('click',()=>resolverDesdeModal('APROBAR'));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!modal.hidden)closeApprovalModal();
  });
  return modal;
}
function closeApprovalModal(){
  const modal=document.getElementById('admin-aprobacion-modal');
  if(!modal)return;
  modal.hidden=true;
  document.body.classList.remove('bc-admin-approval-open');
  if(approvalFocusReturn&&approvalFocusReturn.isConnected){
    try{approvalFocusReturn.focus({preventScroll:true})}catch(_){}
  }
  approvalFocusReturn=null;
}
function setApprovalMessage(value,isError){
  const el=document.getElementById('admin-approval-message');
  if(!el)return;
  el.textContent=value||'';
  el.className='bc-admin-approval-message'+(isError?' is-error':'');
}
function renderApprovalDetails(x,detail){
  const modal=ensureApprovalModal();
  const body=modal.querySelector('#admin-approval-body');
  const subtitle=modal.querySelector('#admin-approval-subtitle');
  const footer=modal.querySelector('#admin-approval-footer');
  const isList=x.tipo==='baja_lista';
  const isExpense=x.tipo==='gasto';
  const isReinvestment=x.tipo==='reinversion';
  const isDailyCash=x.tipo==='entrega_diaria';
  const isFinalCash=x.tipo==='declaracion_jornada';
  const finalCashReady=['LISTO_PARA_CONTAR','COMPLETADA'].includes(String(x.motivo||'').toUpperCase());
  const isMoney=isExpense||isReinvestment||isDailyCash||isFinalCash;
  const isLegacyBaja=x.tipo==='baja';
  const isStockChange=x.tipo==='merma'||isLegacyBaja;
  const lines=isList?(Array.isArray(detail.lineas)?detail.lineas:[]):isLegacyBaja?[{
    id:x.id,producto_nombre:x.producto_nombre,cantidad:x.cantidad,motivo:x.motivo,estado:x.estado
  }]:[];
  const title=isList?'Lista de bajas':isExpense?'Gasto pendiente':isReinvestment?'Reinversión pendiente':isDailyCash?'Entrega diaria de efectivo':isFinalCash?'Declaración final de efectivo':x.tipo==='merma'?'Merma pendiente':'Baja pendiente';
  modal.querySelector('#admin-approval-title').textContent='Revisión administrativa · '+title;
  subtitle.textContent=(detail.usuario_nombre||x.usuario_nombre||'Usuario')
    +(isExpense||isReinvestment?'':(detail.almacen_nombre||x.almacen_nombre?' · '+(detail.almacen_nombre||x.almacen_nombre):''))
    +(detail.fecha||x.fecha?' · '+new Date(detail.fecha||x.fecha).toLocaleString():'');
  modal.dataset.approvalType=x.tipo;
  modal.dataset.approvalId=x.id;
  modal.dataset.sessionState=String(x.motivo||'');
  modal.dataset.finalCashReady=String(finalCashReady);
  modal.dataset.declaredAmount=String(x.monto??'');
  let html='';
  if(isList){
    html+='<section class="bc-admin-approval-summary"><strong>'+esc(detail.motivo_general||x.motivo||'Motivo general no especificado')+'</strong>'+
      '<span>'+lines.length+' productos en una sola solicitud. La aprobación se ejecuta como una operación atómica.</span></section>';
    html+='<div class="bc-admin-approval-lines">';
    lines.forEach(line=>{
      html+='<article class="bc-admin-approval-line">'+
        '<div class="bc-admin-approval-line-info"><strong>'+esc(line.producto_nombre||'Producto')+'</strong>'+
        '<span>Motivo: '+esc(line.motivo||'—')+'</span>'+
        (line.estado&&line.estado!=='PENDIENTE'?'<span class="bc-admin-approval-line-state">'+esc(line.estado)+'</span>':'')+
        '</div>'+
        '<label><span>Cantidad a aprobar</span><input type="number" min="0.0001" step="any" max="'+esc(line.cantidad)+'" value="'+esc(line.cantidad)+'" data-bc-approval-line-qty data-line-id="'+esc(line.id)+'" '+(line.estado==='PENDIENTE'?'':'disabled')+'></label>'+
        '</article>';
    });
    html+='</div>';
  }else if(isMoney){
    const amountLabel=isFinalCash?'Conteo físico real del Dueño':isDailyCash?'Dinero contado realmente':'Importe';
    const minAmount=(isDailyCash||isFinalCash)?'0':'0.01';
    if(isExpense||isReinvestment){
      const heading=isExpense?who+' ha registrado un gasto':who+' ha registrado una reinversión';
      const summary=isExpense
        ?(x.resumen||'Gasto')+' · '+money(x.monto)+' CUP'
        :(x.resumen||'Reinversión')+' = '+money(x.monto)+' CUP';
      html+='<section class="bc-admin-approval-summary"><strong>'+esc(heading)+'</strong><span>'+esc(summary)+'</span></section>'+
        '<p class="bc-admin-approval-message">'+(isExpense?'Confirma el concepto y el monto antes de aprobar.':'La aprobación aplica la salida de caja y la entrada de inventario. El cálculo usa la cantidad y el costo unitario indicados.')+'</p>';
    }else{
      const finalCashNote=isFinalCash
        ?(finalCashReady?'<p class="bc-admin-approval-message">Introduce el efectivo contado físicamente. El conteo no depende de que la jornada esté cerrada.</p>':'<p class="bc-admin-approval-message">Aún no está listo para contar: '+esc(x.motivo||'Completa los tres checks de Sheila, el inventario final y las aprobaciones pendientes.')+'</p>')
        :'';
      html+='<section class="bc-admin-approval-summary"><strong>'+esc(x.resumen||(isDailyCash?'Entrega diaria':'Declaración final de efectivo'))+'</strong>'+
        (isFinalCash?'<span>Declarado por la responsable: '+esc(money(x.monto))+' CUP.</span>':'<span>'+esc(x.motivo||'')+'</span>')+'</section>'+
        '<label class="bc-admin-approval-field"><span>'+amountLabel+' (CUP)</span><input id="admin-approval-real" type="number" min="'+minAmount+'" step="0.01" inputmode="decimal" autocomplete="off" value="'+(isFinalCash?'':esc(x.monto))+'" placeholder="'+(isFinalCash?'Escribe el importe contado físicamente':'')+'" '+(isFinalCash&&!finalCashReady?'disabled':'')+'></label>'+finalCashNote;
    }
  }else if(isStockChange){
    html+='<section class="bc-admin-approval-summary"><strong>'+esc(x.producto_nombre||'Producto')+'</strong>'+
      '<span>Motivo: '+esc(x.motivo||'—')+'</span></section>'+
      '<label class="bc-admin-approval-field"><span>Cantidad a aprobar</span><input id="admin-approval-real" type="number" min="0.0001" step="any" max="'+esc(x.cantidad)+'" value="'+esc(x.cantidad)+'"></label>';
  }else{
    html+='<section class="bc-admin-approval-summary"><strong>'+esc(x.resumen||title)+'</strong>'+
      '<span>'+esc(x.motivo||'Sin detalle adicional')+'</span></section>'+
      '<label class="bc-admin-approval-field"><span>Valor real</span><input id="admin-approval-real" type="number" min="0.01" step="0.01" value="'+esc(isExpense?x.monto:x.cantidad||'')+'"></label>';
  }
  html+='<label class="bc-admin-approval-field"><span>Comentario administrativo</span><textarea id="admin-approval-comment" rows="2" placeholder="Obligatorio para rechazar; opcional para aprobar"></textarea></label>'+
    '<p id="admin-approval-message" class="bc-admin-approval-message" role="status" aria-live="polite"></p>';
  body.innerHTML=html;
  const rejectButton=modal.querySelector('#admin-approval-reject');
  const acceptButton=modal.querySelector('#admin-approval-accept');
  rejectButton.textContent=isList?'Rechazar lista completa':'Rechazar';
  rejectButton.hidden=isFinalCash;
  acceptButton.textContent=isList?'Aceptar lista completa':isFinalCash?(finalCashReady?'Registrar conteo físico':'Pendiente de checklist'):'Aceptar y aprobar';
  acceptButton.disabled=isFinalCash&&!finalCashReady;
  modal.hidden=false;
  footer.hidden=false;
  document.body.classList.add('bc-admin-approval-open');
  modal.querySelector('.bc-admin-approval-dialog').focus({preventScroll:true});
}
async function abrirRevision(x){
  const modal=ensureApprovalModal();
  approvalFocusReturn=document.activeElement;
  modal.hidden=false;
  modal.querySelector('#admin-approval-title').textContent='Cargando detalle…';
  modal.querySelector('#admin-approval-subtitle').textContent='';
  modal.querySelector('#admin-approval-body').innerHTML='<p class="lista-estado">Recuperando los productos y motivos de la solicitud…</p>';
  modal.querySelector('#admin-approval-footer').hidden=true;
  document.body.classList.add('bc-admin-approval-open');
  modal.querySelector('.bc-admin-approval-dialog').focus({preventScroll:true});
  try{
    let detail=x;
    if(x.tipo==='baja_lista'){
      detail=await rpc('obtener_detalle_solicitud_baja_admin',{p_solicitud_id:x.id});
    }
    renderApprovalDetails(x,detail||x);
  }catch(error){
    const body=modal.querySelector('#admin-approval-body');
    body.innerHTML='<p class="bc-admin-approval-message is-error">No se pudo abrir el detalle: '+esc(error.message||error)+'</p>'+
      '<button type="button" class="cc-accion" data-bc-admin-close>Cerrar</button>';
  }
}
async function resolverDesdeModal(decision){
  const modal=document.getElementById('admin-aprobacion-modal');
  if(!modal||modal.hidden)return;
  const type=modal.dataset.approvalType,id=modal.dataset.approvalId;
  const comment=(modal.querySelector('#admin-approval-comment')?.value||'').trim();
  if(decision==='RECHAZAR'&&!comment){
    setApprovalMessage('Escribe el motivo obligatorio del rechazo.',true);
    modal.querySelector('#admin-approval-comment')?.focus();
    return;
  }
  const accept=modal.querySelector('#admin-approval-accept'),reject=modal.querySelector('#admin-approval-reject');
  accept.disabled=true;reject.disabled=true;
  setApprovalMessage(decision==='APROBAR'?'Aplicando la aprobación…':'Registrando el rechazo…',false);
  try{
    if(type==='baja_lista'){
      const lineInputs=Array.from(modal.querySelectorAll('[data-bc-approval-line-qty]')).filter(input=>!input.disabled);
      const lines=lineInputs.map(input=>({id:input.dataset.lineId,cantidad_real:Number(input.value)}));
      if(decision==='APROBAR'&&lines.some(line=>!Number.isFinite(line.cantidad_real)||line.cantidad_real<=0)){
        throw new Error('Cada producto debe tener una cantidad real mayor que cero.');
      }
      await rpc('resolver_solicitud_bajas_admin',{
        p_solicitud_id:id,
        p_decision:decision,
        p_comentario:comment||null,
        p_lineas_reales:decision==='APROBAR'?lines:[]
      });
    }else{
      const isExpense=type==='gasto';
      const isDailyCash=type==='entrega_diaria';
      const isFinalCash=type==='declaracion_jornada';
      const isMoney=isExpense||type==='reinversion'||isDailyCash||isFinalCash;
      const input=modal.querySelector('#admin-approval-real');
      const real=input?Number(input.value):null;
      if(decision==='APROBAR'&&input&&(!Number.isFinite(real)||((isDailyCash||isFinalCash)?real<0:real<=0))){
        throw new Error((isDailyCash||isFinalCash)?'El conteo físico no puede ser negativo.':'El valor real debe ser mayor que cero.');
      }
      if(isFinalCash){
        if(decision!=='APROBAR')throw new Error('La declaración final se resuelve con conteo físico, no con rechazo.');
        if(modal.dataset.finalCashReady!=='true')throw new Error('Completa los checks de Sheila y resuelve las aprobaciones antes de contar el efectivo.');
        if(!confirm('Declarado por la responsable: '+money(Number(modal.dataset.declaredAmount))+' CUP.\nConteo físico real: '+money(real)+' CUP.\n\nEl servidor aprobará solo si ambos importes coinciden. ¿Confirmas el conteo?')){accept.disabled=false;reject.disabled=false;return;}
        await rpc('bc5_contar_dinero_entregado',{
          p_declaracion_id:id,p_monto_contado:real,p_observacion:comment||null
        });
      }else{
        await rpc('resolver_aprobacion_operativa',{
          p_tipo:type,p_id:id,p_decision:decision,p_comentario:comment||null,
          p_cantidad_real:isMoney?null:real,
          p_monto_real:isMoney?real:null
        });
      }
    }
    closeApprovalModal();
    await load();
    if(typeof refrescarCentroControl==='function')await refrescarCentroControl();
  }catch(error){
    setApprovalMessage('No se pudo resolver: '+(error.message||error),true);
    accept.disabled=false;reject.disabled=false;
  }
}
async function contarEntrega(id){const raw=prompt('¿Cuánto dinero contaste realmente?');if(raw===null)return;const amount=Number(String(raw).replace(',','.'));if(!Number.isFinite(amount)||amount<0)return alert('Monto inválido.');try{await rpc('registrar_recepcion_entrega_caja',{p_entrega_id:id,p_monto_contado:amount,p_observacion_conteo:prompt('Observación (opcional):')||null,p_idempotency_key:key()});await load()}catch(e){alert(e.message||e)}}
async function revisarEntrega(id,decision){let c=decision==='rechazar'?prompt('Motivo obligatorio del rechazo:'):prompt('Comentario de aprobación (opcional):');if(decision==='rechazar'&&(!c||!c.trim()))return;try{await rpc('revisar_entrega_caja',{p_entrega_id:id,p_decision:decision,p_comentario:c||null,p_idempotency_key:key()});await load()}catch(e){alert(e.message||e)}}
async function revisarCuadre(id,decision){let c=prompt(decision==='rechazar'?'Motivo obligatorio del rechazo:':'Comentario de aprobación (opcional):');if(decision==='rechazar'&&(!c||!c.trim()))return;try{await rpc('revisar_cuadre',{p_cuadre_id:id,p_decision:decision,p_comentario:c||null,p_idempotency_key:key()});await load()}catch(e){alert(e.message||e)}}
function select(id,label,items){return '<label class="field"><span>'+label+'</span><select id="'+id+'"><option value="" disabled selected hidden>Seleccionar…</option>'+items.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nombre)+'</option>').join('')+'</select></label>'}
let formsLoading=false;
async function ensureForms(){
  const tab=document.getElementById('tab-operacion');
  if(!tab||!can('gastos','crear')||!(await hasLiveSession()))return;
  let block=document.getElementById('admin-solicitudes');
  if(!block){
    block=document.createElement('div');block.className='cc-bloque';block.id='admin-solicitudes';
    block.innerHTML='<h3>Solicitar aprobación</h3><p class="muted">Los gastos quedan pendientes de revisión administrativa.</p><div class="admin-sol-grid"></div>';
    tab.insertBefore(block,tab.firstChild);
  }
  const grid=block.querySelector('.admin-sol-grid');
  if(can('gastos','crear')&&!grid.querySelector('#adm-gasto-form')){
    const form=document.createElement('form');form.id='adm-gasto-form';form.className='inline-form';
    form.innerHTML='<h4>💸 Gasto</h4><input id="adm-g-concepto" placeholder="Concepto" required><input id="adm-g-monto" type="number" min="0.01" step="0.01" placeholder="Monto" required><input id="adm-g-desc" placeholder="Descripción"><button type="submit">Solicitar gasto</button>';
    form.onsubmit=async e=>{e.preventDefault();try{await rpc('crear_gasto',{p_concepto:document.getElementById('adm-g-concepto').value,p_monto:Number(document.getElementById('adm-g-monto').value),p_descripcion:document.getElementById('adm-g-desc').value||null,p_idempotency_key:key()});form.reset();await load();alert('✓ Gasto enviado a aprobación.')}catch(x){alert(x.message||x)}};
    grid.appendChild(form);
  }
  // Bajas are entered only through the dedicated batch editor.
  if(can('bajas','crear')){
    const stale=grid.querySelector('#adm-baja-form');if(stale)stale.remove();
    const warning=grid.querySelector('#adm-baja-catalog-warning');if(warning)warning.remove();
  }

}
async function start(){if(!(await hasLiveSession()))return;ensurePanel();await ensureForms();load();if(!window.__bcAdminApprovalTimer)window.__bcAdminApprovalTimer=setInterval(()=>{ensureForms();load()},30000)}
window.refrescarAprobacionesAdmin=load;document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1200));document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-tab]');if(b)setTimeout(()=>{ensureForms();if(b.dataset.tab==='resumen')load()},300)});
try{const api=window.client||(typeof client!=='undefined'?client:null);if(api&&api.auth&&typeof api.auth.onAuthStateChange==='function')api.auth.onAuthStateChange((event,session)=>{if(session&&['SIGNED_IN','INITIAL_SESSION','TOKEN_REFRESHED'].includes(event))setTimeout(()=>start(),0)})}catch(_){/* Auth can initialize after this module; the tab listener remains a retry path. */}
})();
