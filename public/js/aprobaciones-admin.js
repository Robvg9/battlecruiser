// BattleCruiser — Aprobaciones administrativas
// Usa exclusivamente RPCs existentes. No crea cola ni caché paralelas.
(function(){
  'use strict';
  const ID='admin-aprobaciones';
  const TIMEOUT=20000;
  function esc(v){return typeof escHtml==='function'?escHtml(v):String(v==null?'':v).replace(/[&<>\"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[s]));}
  function key(){return crypto.randomUUID();}
  function money(v){return typeof window.money==='function'?window.money(v):Number(v||0).toFixed(2);}
  function canAdmin(){return typeof tienePermiso==='function' && tienePermiso('entregas_caja','editar_any');}
  async function rpc(name,params){
    if(!window.client) throw new Error('Backend no disponible');
    let timer;
    try{
      const p=client.rpc(name,params);
      const t=new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('Tiempo de espera agotado')),TIMEOUT));
      const r=await Promise.race([p,t]);
      if(r.error) throw r.error;
      return r.data;
    }finally{if(timer)clearTimeout(timer);}
  }
  function ensurePanel(){
    if(!canAdmin()) return null;
    let el=document.getElementById(ID);
    if(el) return el;
    const host=document.getElementById('cc-atencion');
    if(!host) return null;
    const block=document.createElement('div');
    block.className='cc-bloque';
    block.id=ID;
    block.innerHTML='<h3>Aprobaciones administrativas</h3><div class="lista" id="admin-aprobaciones-lista"><p class="lista-estado">Cargando…</p></div>';
    host.parentElement.insertBefore(block,host);
    return block;
  }
  function listEl(){const p=ensurePanel();return p&&p.querySelector('#admin-aprobaciones-lista');}
  async function load(){
    if(!canAdmin()) return;
    const el=listEl(); if(!el)return;
    el.innerHTML='<p class="lista-estado">Cargando aprobaciones…</p>';
    if(!navigator.onLine){el.innerHTML='<p class="lista-estado">⚪ Sin conexión. Las aprobaciones requieren conexión.</p>';return;}
    try{
      const [cuadres,entregas]=await Promise.all([
        rpc('listar_cuadres',{p_limite:50,p_offset:0}),
        rpc('listar_entregas_caja',{p_ciclo_id:null,p_almacen_id:null,p_estado:null})
      ]);
      const c=Array.isArray(cuadres)?cuadres:[];
      const e=Array.isArray(entregas)?entregas:[];
      const pendientesC=c.filter(x=>['CON_DIFERENCIA','EN_REVISION'].includes(x.estado));
      const pendientesE=e.filter(x=>['DECLARADA','CONTADA'].includes(x.estado));
      const rows=[];
      pendientesE.forEach(x=>rows.push({kind:'entrega',x,rank:x.estado==='DECLARADA'?0:1}));
      pendientesC.forEach(x=>rows.push({kind:'cuadre',x,rank:2}));
      rows.sort((a,b)=>a.rank-b.rank);
      if(!rows.length){el.innerHTML='<p class="lista-estado">✓ No hay aprobaciones pendientes.</p>';return;}
      el.innerHTML='';
      rows.forEach(r=>el.appendChild(renderRow(r)));
    }catch(err){
      console.warn('[Battlecruiser] aprobaciones-admin:',err);
      el.innerHTML='<p class="lista-estado">No se pudieron cargar las aprobaciones: '+esc(err.message||err)+'</p>';
    }
  }
  function renderRow(r){
    const x=r.x, d=document.createElement('div'); d.className='rep-fila';
    if(r.kind==='entrega'){
      const estado=x.estado==='DECLARADA'?'DECLARADA — falta contar':'CONTADA — falta aprobar';
      const dif=x.diferencia==null?'':(' · Diferencia $'+money(x.diferencia));
      d.innerHTML='<span class="rep-fila-principal"><span class="cc-asunto-tipo">Entrega de caja</span><span class="muted">'+esc(x.declarado_nombre||'Usuario')+' · '+esc(x.almacen_nombre||'Almacén')+' · '+estado+' · Declarado $'+money(x.monto_declarado)+dif+'</span></span>';
      const box=document.createElement('div'); box.className='btn-row';
      if(x.estado==='DECLARADA'){
        const b=document.createElement('button');b.className='cc-accion';b.textContent='Contar dinero';b.onclick=()=>contarEntrega(x.id);box.appendChild(b);
      }else{
        const a=document.createElement('button');a.className='cc-accion';a.textContent='Aprobar';a.onclick=()=>revisarEntrega(x.id,'aprobar');
        const z=document.createElement('button');z.className='cc-accion';z.textContent='Rechazar';z.onclick=()=>revisarEntrega(x.id,'rechazar');box.append(a,z);
      }
      d.appendChild(box);
    }else{
      const dif=Number(x.diferencia||0);
      d.innerHTML='<span class="rep-fila-principal"><span class="cc-asunto-tipo">Cuadre pendiente de revisión</span><span class="muted">Esperado $'+money(x.dinero_esperado)+' · Declarado $'+money(x.dinero_declarado)+' · '+(dif<0?'Faltante $'+money(Math.abs(dif)):dif>0?'Sobrante $'+money(dif):'Exacto')+'</span></span>';
      const box=document.createElement('div');box.className='btn-row';
      const a=document.createElement('button');a.className='cc-accion';a.textContent='Aprobar';a.onclick=()=>revisarCuadre(x.id,'aprobar');
      const z=document.createElement('button');z.className='cc-accion';z.textContent='Rechazar';z.onclick=()=>revisarCuadre(x.id,'rechazar');box.append(a,z);d.appendChild(box);
    }
    return d;
  }
  async function contarEntrega(id){
    const raw=prompt('¿Cuánto dinero contaste realmente?'); if(raw===null)return;
    const amount=Number(String(raw).replace(',','.')); if(!Number.isFinite(amount)||amount<0){alert('Monto inválido.');return;}
    const obs=prompt('Observación (opcional):')||null;
    try{await rpc('registrar_recepcion_entrega_caja',{p_entrega_id:id,p_monto_contado:amount,p_observacion_conteo:obs,p_idempotency_key:key()});await load();}
    catch(e){alert('No se pudo registrar el conteo: '+(e.message||e));}
  }
  async function revisarEntrega(id,decision){
    let comentario=null;
    if(decision==='rechazar'){comentario=prompt('Motivo obligatorio del rechazo:');if(!comentario||!comentario.trim())return;}
    else comentario=prompt('Comentario de aprobación (opcional):')||null;
    try{await rpc('revisar_entrega_caja',{p_entrega_id:id,p_decision:decision,p_comentario:comentario,p_idempotency_key:key()});await load();}
    catch(e){alert('No se pudo revisar la entrega: '+(e.message||e));}
  }
  async function revisarCuadre(id,decision){
    let comentario=prompt(decision==='rechazar'?'Motivo del rechazo:':'Comentario de aprobación (opcional):')||null;
    try{await rpc('revisar_cuadre',{p_cuadre_id:id,p_decision:decision,p_comentario:comentario,p_idempotency_key:key()});await load();}
    catch(e){alert('No se pudo revisar el cuadre: '+(e.message||e));}
  }
  function start(){
    if(!canAdmin())return;
    ensurePanel();load();
    if(!window.__bcAdminApprovalTimer) window.__bcAdminApprovalTimer=setInterval(load,30000);
  }
  window.refrescarAprobacionesAdmin=load;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1200));
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-tab="resumen"]');if(b)setTimeout(load,300);});
})();