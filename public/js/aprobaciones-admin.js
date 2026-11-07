// BattleCruiser — Misión 2/7 · Aprobaciones administrativas
// Una sola capa para entregas/cuadres + gastos/mermas/bajas. Sin colas/cachés paralelas.
(function(){'use strict';
const ID='admin-aprobaciones',TIMEOUT=20000;
const esc=v=>typeof escHtml==='function'?escHtml(v):String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const key=()=>crypto.randomUUID(),money=v=>typeof window.money==='function'?window.money(v):Number(v||0).toFixed(2),can=(s,a)=>typeof tienePermiso==='function'&&tienePermiso(s,a);
const canAdmin=()=>can('entregas_caja','editar_any')||can('gastos','editar_any')||can('mermas','editar_any')||can('bajas','editar_any')||can('auditoria','editar_any');
const productos=()=>Array.isArray(window._cache?.productos)?window._cache.productos:[],almacenes=()=>Array.isArray(window._cache?.almacenes)?window._cache.almacenes.filter(a=>a.activo!==false):[];
async function rpc(name,params){if(!window.client)throw new Error('Backend no disponible');let timer;try{const p=client.rpc(name,params||{}),t=new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('Tiempo de espera agotado')),TIMEOUT)),r=await Promise.race([p,t]);if(r.error)throw r.error;return r.data}finally{clearTimeout(timer)}}
function ensurePanel(){if(!canAdmin())return null;let el=document.getElementById(ID);if(el)return el;const host=document.getElementById('cc-atencion');if(!host)return null;const b=document.createElement('div');b.className='cc-bloque';b.id=ID;b.innerHTML='<h3>🔐 Aprobaciones administrativas</h3><p class="muted">Revisa operaciones pendientes, acepta, rechaza o corrige la cantidad/monto real antes de aprobar.</p><div class="lista" id="admin-aprobaciones-lista"><p class="lista-estado">Cargando…</p></div><div id="admin-aprobacion-detalle"></div>';host.parentElement.insertBefore(b,host);return b}
const listEl=()=>{const p=ensurePanel();return p&&p.querySelector('#admin-aprobaciones-lista')};
function row(title,detail,buttons){const d=document.createElement('div');d.className='rep-fila';d.innerHTML='<span class="rep-fila-principal"><span class="cc-asunto-tipo">'+esc(title)+'</span><span class="muted">'+esc(detail)+'</span></span>';const box=document.createElement('div');box.className='btn-row';buttons.forEach(b=>{const x=document.createElement('button');x.type='button';x.className='cc-accion';x.textContent=b.text;x.onclick=b.fn;box.appendChild(x)});d.appendChild(box);return d}
async function load(){if(!canAdmin())return;const el=listEl();if(!el)return;if(!navigator.onLine){el.innerHTML='<p class="lista-estado">⚪ Sin conexión. Las aprobaciones requieren conexión.</p>';return}el.innerHTML='<p class="lista-estado">Cargando aprobaciones…</p>';try{const jobs=[];if(can('entregas_caja','editar_any')){jobs.push(rpc('listar_entregas_caja',{p_ciclo_id:null,p_almacen_id:null,p_estado:null}).then(e=>({k:'e',d:Array.isArray(e)?e:[]})));jobs.push(rpc('listar_cuadres',{p_limite:50,p_offset:0}).then(c=>({k:'c',d:Array.isArray(c)?c:[]})))}if(canAdmin())jobs.push(rpc('listar_aprobaciones_admin').then(a=>({k:'o',d:Array.isArray(a)?a:[]})));const rs=await Promise.all(jobs),rows=[];for(const r of rs){if(r.k==='e')r.d.filter(x=>['DECLARADA','CONTADA'].includes(x.estado)).forEach(x=>rows.push({rank:x.estado==='DECLARADA'?0:1,node:renderEntrega(x)}));if(r.k==='c')r.d.filter(x=>['CON_DIFERENCIA','EN_REVISION'].includes(x.estado)).forEach(x=>rows.push({rank:2,node:renderCuadre(x)}));if(r.k==='o')r.d.forEach(x=>rows.push({rank:3,node:renderOperativa(x)}))}rows.sort((a,b)=>a.rank-b.rank);if(!rows.length){el.innerHTML='<p class="lista-estado">✓ No hay aprobaciones pendientes.</p>';return}el.innerHTML='';rows.forEach(r=>el.appendChild(r.node))}catch(e){el.innerHTML='<p class="lista-estado">No se pudieron cargar las aprobaciones: '+esc(e.message||e)+'</p>'}}
function renderEntrega(x){const estado=x.estado==='DECLARADA'?'DECLARADA — falta contar':'CONTADA — falta aprobar';const dif=x.diferencia==null?'':' · Diferencia $'+money(x.diferencia);return row('💵 Entrega de caja',(x.declarado_nombre||'Usuario')+' · '+(x.almacen_nombre||'Almacén')+' · '+estado+' · Declarado $'+money(x.monto_declarado)+dif,x.estado==='DECLARADA'?[{text:'Contar dinero',fn:()=>contarEntrega(x.id)}]:[{text:'Aprobar',fn:()=>revisarEntrega(x.id,'aprobar')},{text:'Rechazar',fn:()=>revisarEntrega(x.id,'rechazar')}])}
function renderCuadre(x){const dif=Number(x.diferencia||0),s=dif<0?'Faltante $'+money(Math.abs(dif)):dif>0?'Sobrante $'+money(dif):'Exacto';return row('🧾 Cuadre pendiente','Esperado $'+money(x.dinero_esperado)+' · Declarado $'+money(x.dinero_declarado)+' · '+s,[{text:'Aprobar',fn:()=>revisarCuadre(x.id,'aprobar')},{text:'Rechazar',fn:()=>revisarCuadre(x.id,'rechazar')}])}
function renderOperativa(x){let d=x.usuario_nombre||'Usuario';if(x.almacen_nombre)d+=' · '+x.almacen_nombre;if(x.producto_nombre)d+=' · '+x.producto_nombre;if(x.monto!=null)d+=' · $'+money(x.monto);if(x.cantidad!=null)d+=' · Cant. '+x.cantidad;d+=' · '+(x.motivo||x.resumen||'');const t=x.tipo==='gasto'?'💸 Gasto pendiente':x.tipo==='merma'?'📉 Baja pendiente':'📉 Baja pendiente';return row(t,d,[{text:'Revisar / aprobar',fn:()=>abrirRevision(x)},{text:'Rechazar',fn:()=>resolver(x,'RECHAZAR')}])}
function abrirRevision(x){const host=document.getElementById('admin-aprobacion-detalle');if(!host)return;const esG=x.tipo==='gasto',v=esG?x.monto:x.cantidad;host.innerHTML='<div class="cc-bloque"><h4>Revisión: '+esc(x.tipo)+'</h4><div class="field"><label>'+ (esG?'Monto real':'Cantidad real')+'</label><input id="adm-real" type="number" min="0.01" step="0.01" value="'+esc(v)+'"></div><div class="field"><label>Comentario</label><input id="adm-comentario" placeholder="Opcional al aprobar; obligatorio al rechazar"></div><div class="btn-row"><button type="button" id="adm-aprobar-real">Aceptar y aprobar</button><button type="button" id="adm-cancelar-real">Cancelar</button></div><p class="msg" id="adm-real-msg"></p></div>';document.getElementById('adm-aprobar-real').onclick=async()=>{const real=Number(document.getElementById('adm-real').value);const c=document.getElementById('adm-comentario').value.trim();if(!Number.isFinite(real)||real<=0){document.getElementById('adm-real-msg').textContent='Valor real inválido.';return}await resolver(x,'APROBAR',real,c)};document.getElementById('adm-cancelar-real').onclick=()=>host.innerHTML=''}
async function resolver(x,decision,real=null,comentario=null){if(decision==='RECHAZAR'){comentario=comentario??prompt('Motivo obligatorio del rechazo:');if(!comentario||!comentario.trim())return}try{await rpc('resolver_aprobacion_operativa',{p_tipo:x.tipo,p_id:x.id,p_decision:decision,p_comentario:comentario||null,p_cantidad_real:x.tipo==='gasto'?null:real,p_monto_real:x.tipo==='gasto'?real:null});const d=document.getElementById('admin-aprobacion-detalle');if(d)d.innerHTML='';await load();if(typeof refrescarCentroControl==='function')await refrescarCentroControl()}catch(e){const m=document.getElementById('adm-real-msg');if(m)m.textContent='No se pudo resolver: '+(e.message||e);else alert('No se pudo resolver: '+(e.message||e))}}
async function contarEntrega(id){const raw=prompt('¿Cuánto dinero contaste realmente?');if(raw===null)return;const amount=Number(String(raw).replace(',','.'));if(!Number.isFinite(amount)||amount<0)return alert('Monto inválido.');try{await rpc('registrar_recepcion_entrega_caja',{p_entrega_id:id,p_monto_contado:amount,p_observacion_conteo:prompt('Observación (opcional):')||null,p_idempotency_key:key()});await load()}catch(e){alert(e.message||e)}}
async function revisarEntrega(id,decision){let c=decision==='rechazar'?prompt('Motivo obligatorio del rechazo:'):prompt('Comentario de aprobación (opcional):');if(decision==='rechazar'&&(!c||!c.trim()))return;try{await rpc('revisar_entrega_caja',{p_entrega_id:id,p_decision:decision,p_comentario:c||null,p_idempotency_key:key()});await load()}catch(e){alert(e.message||e)}}
async function revisarCuadre(id,decision){let c=prompt(decision==='rechazar'?'Motivo obligatorio del rechazo:':'Comentario de aprobación (opcional):');if(decision==='rechazar'&&(!c||!c.trim()))return;try{await rpc('revisar_cuadre',{p_cuadre_id:id,p_decision:decision,p_comentario:c||null,p_idempotency_key:key()});await load()}catch(e){alert(e.message||e)}}
function select(id,label,items){return '<label class="field"><span>'+label+'</span><select id="'+id+'"><option value="" disabled selected hidden>Seleccionar…</option>'+items.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nombre)+'</option>').join('')+'</select></label>'}
let formsLoading=false;
async function ensureForms(){
  const tab=document.getElementById('tab-operacion');
  if(!tab||(!can('gastos','crear')&&!can('bajas','crear')))return;
  let block=document.getElementById('admin-solicitudes');
  if(!block){
    block=document.createElement('div');block.className='cc-bloque';block.id='admin-solicitudes';
    block.innerHTML='<h3>Solicitar aprobación</h3><p class="muted">Los gastos y bajas quedan pendientes hasta revisión administrativa.</p><div class="admin-sol-grid"></div>';
    tab.insertBefore(block,tab.firstChild);
  }
  const grid=block.querySelector('.admin-sol-grid');
  if(can('gastos','crear')&&!grid.querySelector('#adm-gasto-form')){
    const form=document.createElement('form');form.id='adm-gasto-form';form.className='inline-form';
    form.innerHTML='<h4>💸 Gasto</h4><input id="adm-g-concepto" placeholder="Concepto" required><input id="adm-g-monto" type="number" min="0.01" step="0.01" placeholder="Monto" required><input id="adm-g-desc" placeholder="Descripción"><button type="submit">Solicitar gasto</button>';
    form.onsubmit=async e=>{e.preventDefault();try{await rpc('crear_gasto',{p_concepto:document.getElementById('adm-g-concepto').value,p_monto:Number(document.getElementById('adm-g-monto').value),p_descripcion:document.getElementById('adm-g-desc').value||null,p_idempotency_key:key()});form.reset();await load();alert('✓ Gasto enviado a aprobación.')}catch(x){alert(x.message||x)}};
    grid.appendChild(form);
  }
  if(!can('bajas','crear')||grid.querySelector('#adm-baja-form')||formsLoading)return;
  formsLoading=true;
  let catalogsFresh=true;
  try{
    try {
      if(typeof window.bcRefrescarCatalogosOperativos==='function') {
        const ready=await window.bcRefrescarCatalogosOperativos(true);
        if(!ready)return;
      } else {
        const api=window.client || (typeof client!=='undefined'?client:null);
        if(api && typeof api.from==='function') {
          const results=await Promise.all([
            api.from('productos').select('id,nombre,unidad,precio_normal,precio_mayorista,activo,imagen_url,categoria_id,presentacion_id,inventario_mixto,producto_padre_id,variante_nombre,categorias(nombre),presentaciones(nombre)').order('nombre'),
            api.from('almacenes').select('id,nombre,tipo,activo').order('nombre')
          ]);
          if(results[0].error)throw results[0].error;
          if(results[1].error)throw results[1].error;
          if(!window._cache)window._cache={};
          window._cache.productos=Array.isArray(results[0].data)?results[0].data:[];
          window._cache.almacenes=Array.isArray(results[1].data)?results[1].data:[];
        } else {
          throw new Error('Cliente Supabase no disponible para actualizar catálogos.');
        }
      }
    } catch(error) {
      catalogsFresh=false;
      console.warn('[BattleCruiser] No se pudieron actualizar catálogos de Baja desde Supabase:',error);
    }
    if(!catalogsFresh) {
      let warning=grid.querySelector('#adm-baja-catalog-warning');
      if(!warning){warning=document.createElement('p');warning.id='adm-baja-catalog-warning';warning.className='msg';grid.appendChild(warning)}
      warning.textContent='No se pudo confirmar la actualización de los catálogos desde Supabase. No se habilita la baja con datos posiblemente desactualizados.';
      return;
    }
    const raw=productos();
    const operational=typeof window.productosOperativos==='function'
      ? window.productosOperativos(raw)
      : raw.filter(p=>p&&p.activo!==false&&(!p.inventario_mixto||!!p.producto_padre_id));
    const activeProducts=operational.filter(p=>p&&p.activo!==false);
    const activeStores=almacenes();
    let warning=grid.querySelector('#adm-baja-catalog-warning');
    if(!activeProducts.length||!activeStores.length){
      if(!warning){warning=document.createElement('p');warning.id='adm-baja-catalog-warning';warning.className='msg';grid.appendChild(warning)}
      warning.textContent='No se pudieron cargar productos y almacenes activos. Actualiza los catálogos antes de solicitar una baja.';
      return;
    }
    if(warning)warning.remove();
    const form=document.createElement('form');form.id='adm-baja-form';form.className='inline-form';
    form.innerHTML='<h4>📉 Baja</h4>'+select('adm-b-alm','Almacén',activeStores)+select('adm-b-prod','Producto',activeProducts)+
      '<input id="adm-b-cant" type="number" min="0.001" step="any" placeholder="Cantidad" required>'+
      '<select id="adm-b-motivo" required><option value="" disabled selected hidden>Motivo de la baja</option>'+
      '<option value="Rotura">Rotura</option><option value="Hechado a perder">Hechado a perder</option>'+
      '<option value="El Jefe lo cogió">El Jefe lo cogió</option><option value="Vencimiento">Vencimiento</option>'+
      '<option value="Daño o deterioro">Daño o deterioro</option><option value="Pérdida">Pérdida</option>'+
      '<option value="Consumo interno">Consumo interno</option><option value="Otro">Otro</option></select>'+
      '<input id="adm-b-otro" maxlength="180" placeholder="Explica el otro motivo" hidden>'+
      '<button type="submit">Enviar a revisión</button>';
    const reason=form.querySelector('#adm-b-motivo'),other=form.querySelector('#adm-b-otro');
    reason.addEventListener('change',()=>{other.hidden=reason.value!=='Otro';other.required=reason.value==='Otro';if(!other.required)other.value=''});
    form.onsubmit=async e=>{
      e.preventDefault();
      const warehouse=form.querySelector('#adm-b-alm').value,product=form.querySelector('#adm-b-prod').value;
      const quantity=Number(form.querySelector('#adm-b-cant').value),selected=reason.value;
      const motive=selected==='Otro'?'Otro: '+String(other.value||'').trim():selected;
      if(!warehouse||!product||!(quantity>0)||!selected||(selected==='Otro'&&!other.value.trim())){alert('Completa almacén, producto, cantidad y motivo de la baja.');return}
      try{await rpc('crear_baja',{p_almacen_id:warehouse,p_producto_id:product,p_cantidad:quantity,p_motivo:motive,p_idempotency_key:key()});form.reset();other.hidden=true;other.required=false;await load();alert('✓ Baja enviada a aprobación.')}
      catch(x){alert(x.message||x)}
    };
    grid.appendChild(form);
  }finally{formsLoading=false}
}
async function start(){ensurePanel();await ensureForms();load();if(!window.__bcAdminApprovalTimer)window.__bcAdminApprovalTimer=setInterval(()=>{ensureForms();load()},30000)}
window.refrescarAprobacionesAdmin=load;document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1200));document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-tab]');if(b)setTimeout(()=>{ensureForms();if(b.dataset.tab==='resumen')load()},300)});
})();
