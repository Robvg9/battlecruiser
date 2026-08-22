// BattleCruiser — M21 Finanzas operativas
(function(){
  'use strict';
  const ID='finanzas-operativas';
  const esc=v=>typeof escHtml==='function'?escHtml(v):String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const key=()=>crypto.randomUUID();
  const productos=()=>Array.isArray(window._cache?.productos)?window._cache.productos:[];
  const almacenes=()=>Array.isArray(window._cache?.almacenes)?window._cache.almacenes.filter(a=>a.activo!==false):[];
  const rpc=async(name,params)=>{const r=await client.rpc(name,params||{});if(r.error)throw r.error;return r.data};
  const can=(s,a)=>typeof tienePermiso==='function'&&tienePermiso(s,a);
  const money=v=>typeof window.money==='function'?window.money(v):Number(v||0).toFixed(2);

  function ensure(){
    const tab=document.getElementById('tab-operacion');
    if(!tab||document.getElementById(ID))return;
    if(!(can('reinversiones','crear')||can('gastos','crear')||can('mermas','crear')||can('bajas','crear')||can('gastos','editar_any')||can('auditoria','editar_any')))return;
    const b=document.createElement('div');b.className='cc-bloque';b.id=ID;
    b.innerHTML=`<h3>💰 Operaciones de caja e inventario</h3><p class="muted">Gasto = sale dinero. Baja/merma = sale producto. Reinversión = sale dinero y entra producto.</p><div id="fin-gasto-wrap"></div><div id="fin-salida-wrap"></div><form id="form-reinversion" class="inline-form"><h4>🟢 Reinversión</h4><select id="rein-almacen" required><option value="">Almacén</option></select><input id="rein-proveedor" placeholder="Proveedor (opcional)"><div id="rein-lineas" class="lista"></div><div class="btn-row"><button type="button" id="rein-add">+ Agregar producto</button><button type="submit">Registrar reinversión</button></div><p class="msg" id="rein-msg"></p></form><div class="cc-bloque" id="fin-historial"><h4>📒 Movimientos de caja</h4><div class="lista" id="fin-caja-lista"><p class="lista-estado">Cargando…</p></div><h4>📦 Reinversiones recientes</h4><div class="lista" id="fin-reinv-lista"><p class="lista-estado">Cargando…</p></div></div>`;
    tab.insertBefore(b,tab.firstChild);
    const alm=document.getElementById('rein-almacen');alm.innerHTML='<option value="">Almacén</option>'+almacenes().map(a=>`<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join('');
    document.getElementById('rein-add').onclick=addLine;
    document.getElementById('form-reinversion').onsubmit=submit;
    addLine();
    ensureGasto();
    ensureSalida();
    refrescarFinanzas();
  }

  function ensureGasto(){
    const host=document.getElementById('fin-gasto-wrap');
    if(!host||document.getElementById('form-gasto-operativo'))return;
    if(!can('gastos','crear'))return;
    const old=document.querySelectorAll('#admin-solicitudes form');
    old.forEach(f=>{const h=f.querySelector('h4');if(h&&/Gasto/i.test(h.textContent))f.style.display='none'});
    host.innerHTML=`<form id="form-gasto-operativo" class="inline-form"><h4>💸 Gasto</h4><input id="fin-g-concepto" placeholder="Motivo / concepto" required><input id="fin-g-monto" type="number" min="0.01" step="0.01" placeholder="Cantidad de dinero" required><input id="fin-g-desc" placeholder="Descripción (opcional)"><select id="fin-g-almacen"><option value="">Almacén (opcional)</option></select><button type="submit">Enviar a aprobación</button><p class="msg" id="fin-g-msg"></p></form>`;
    document.getElementById('fin-g-almacen').innerHTML='<option value="">Almacén (opcional)</option>'+almacenes().map(a=>`<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join('');
    document.getElementById('form-gasto-operativo').onsubmit=submitGasto;
  }

  async function submitGasto(e){
    e.preventDefault();const msg=document.getElementById('fin-g-msg');
    try{
      await rpc('crear_gasto',{p_concepto:document.getElementById('fin-g-concepto').value,p_monto:Number(document.getElementById('fin-g-monto').value),p_descripcion:document.getElementById('fin-g-desc').value||null,p_almacen_id:document.getElementById('fin-g-almacen').value||null,p_idempotency_key:key()});
      e.target.reset();msg.textContent='✓ Gasto enviado a aprobación. No descuenta caja hasta ser aprobado.';
      if(typeof refrescarAprobacionesAdmin==='function')refrescarAprobacionesAdmin();
      await refrescarFinanzas();
    }catch(err){msg.textContent='No se pudo registrar: '+(err.message||err)}
  }

  function ensureSalida(){
    const host=document.getElementById('fin-salida-wrap');if(!host||document.getElementById('form-salida-producto'))return;if(!(can('mermas','crear')||can('bajas','crear')))return;
    const old=document.querySelectorAll('#admin-solicitudes form');old.forEach(f=>{const h=f.querySelector('h4');if(h&&/(Merma|Baja)/i.test(h.textContent))f.style.display='none'});
    host.innerHTML=`<form id="form-salida-producto" class="inline-form"><h4>🔴 Salida de producto — Baja / Merma</h4><select id="sal-tipo"><option value="merma">Merma</option><option value="baja">Baja</option></select><select id="sal-almacen" required><option value="">Almacén</option></select><select id="sal-prod" required>${productOptions()}</select><input id="sal-cant" type="number" min="0.001" step="any" placeholder="Cantidad" required><input id="sal-motivo" placeholder="Motivo" required><button type="submit">Enviar a revisión</button><p class="msg" id="sal-msg"></p></form>`;
    document.getElementById('sal-almacen').innerHTML='<option value="">Almacén</option>'+almacenes().map(a=>`<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join('');
    document.getElementById('form-salida-producto').onsubmit=submitSalida;
  }

  async function submitSalida(e){
    e.preventDefault();const msg=document.getElementById('sal-msg');
    try{const tipo=document.getElementById('sal-tipo').value;await rpc(tipo==='merma'?'crear_merma':'crear_baja',{p_almacen_id:document.getElementById('sal-almacen').value,p_producto_id:document.getElementById('sal-prod').value,p_cantidad:Number(document.getElementById('sal-cant').value),p_motivo:document.getElementById('sal-motivo').value,p_idempotency_key:key()});e.target.reset();msg.textContent='✓ Solicitud enviada a revisión administrativa. El stock no cambia hasta aprobar.';if(typeof refrescarAprobacionesAdmin==='function')refrescarAprobacionesAdmin();await refrescarFinanzas();}catch(err){msg.textContent='No se pudo registrar: '+(err.message||err)}}

  function productOptions(){return '<option value="">Producto</option>'+productos().filter(p=>p.activo!==false).map(p=>`<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}
  function addLine(){const host=document.getElementById('rein-lineas');if(!host)return;const row=document.createElement('div');row.className='rep-fila rein-linea';row.innerHTML=`<select class="rein-prod" required>${productOptions()}</select><select class="rein-pres"><option value="">Unidad base</option></select><input class="rein-qty" type="number" min="0.001" step="any" placeholder="Cantidad" required><input class="rein-cost" type="number" min="0.01" step="0.01" placeholder="Costo total" required><button type="button" class="cc-accion rein-del">×</button>`;host.appendChild(row);row.querySelector('.rein-prod').onchange=()=>loadPres(row);row.querySelector('.rein-del').onclick=()=>{if(host.children.length>1)row.remove()};}
  async function loadPres(row){const prod=row.querySelector('.rein-prod').value,pres=row.querySelector('.rein-pres');pres.innerHTML='<option value="">Unidad base</option>';if(!prod)return;try{const data=await withCache('asociaciones:'+prod,()=>client.from('producto_presentaciones').select('id,factor,activo,presentacion_id,presentaciones(nombre)').eq('producto_id',prod).eq('activo',true).order('created_at'));(data||[]).forEach(x=>{const o=document.createElement('option');o.value=x.presentacion_id;o.textContent=(x.presentaciones?.nombre||'Presentación')+' × '+x.factor;pres.appendChild(o)});}catch(e){console.warn('[Battlecruiser] presentaciones reinversion',e)}}

  async function submit(e){
    e.preventDefault();const msg=document.getElementById('rein-msg');msg.textContent='';const almacen=document.getElementById('rein-almacen').value,rows=[...document.querySelectorAll('#rein-lineas .rein-linea')];
    if(!almacen){msg.textContent='Selecciona un almacén.';return}
    const lineas=[];for(const row of rows){const producto_id=row.querySelector('.rein-prod').value,presentacion_id=row.querySelector('.rein-pres').value||null,cantidad=Number(row.querySelector('.rein-qty').value),costo=Number(row.querySelector('.rein-cost').value);if(!producto_id||!(cantidad>0)||!(costo>0)){msg.textContent='Completa correctamente todas las líneas.';return}lineas.push({producto_id,presentacion_id,cantidad_presentacion:presentacion_id?cantidad:null,cantidad_base:presentacion_id?null:cantidad,costo_total:costo})}
    try{await rpc('registrar_reinversion_multiple',{p_almacen_id:almacen,p_proveedor:document.getElementById('rein-proveedor').value||null,p_fecha:new Date().toISOString(),p_lineas:lineas,p_idempotency_key:key()});document.getElementById('form-reinversion').reset();document.getElementById('rein-lineas').innerHTML='';addLine();msg.textContent='✓ Reinversión registrada: inventario ↑, costo unitario calculado y caja ↓.';await refrescarFinanzas();}catch(err){msg.textContent='No se pudo registrar: '+(err.message||err)}}

  async function refrescarFinanzas(){
    const caja=document.getElementById('fin-caja-lista'),reinv=document.getElementById('fin-reinv-lista');if(!caja||!reinv||!navigator.onLine)return;
    try{
      const [movs,rs]=await Promise.all([rpc('listar_movimientos_caja',{p_limite:20,p_offset:0}),rpc('listar_reinversiones',{p_limite:10,p_offset:0})]);
      caja.innerHTML=(Array.isArray(movs)&&movs.length)?movs.map(m=>`<div class="rep-fila"><span class="rep-fila-principal"><span class="cc-asunto-tipo">${esc(m.tipo||'MOVIMIENTO')} · ${esc(m.direccion||'')}</span><span class="muted">$${money(m.monto)} · ${esc(m.concepto||'')} · ${esc(m.almacen_nombre||'')}</span></span><span class="muted">${esc(m.creado_nombre||'')} · ${m.fecha?new Date(m.fecha).toLocaleString('es-ES'):''}</span></div>`).join(''):'<p class="lista-estado">No hay movimientos de caja registrados.</p>';
      reinv.innerHTML=(Array.isArray(rs)&&rs.length)?rs.map(r=>{const lines=Array.isArray(r.lineas)?r.lineas:[];const detalle=lines.map(l=>`${esc(l.producto_nombre||'Producto')} × ${esc(l.cantidad_base)} · $${money(l.costo_total)} ($${Number(l.costo_unitario||0).toFixed(4)}/u)`).join(' · ');return `<div class="rep-fila"><span class="rep-fila-principal"><span class="cc-asunto-tipo">Reinversión · $${money(r.total)}</span><span class="muted">${esc(r.almacen_nombre||'')} · ${esc(r.proveedor||'Sin proveedor')} · ${esc(detalle)}</span></span><span class="muted">${esc(r.usuario_nombre||'')} · ${r.fecha?new Date(r.fecha).toLocaleString('es-ES'):''}</span></div>`}).join(''):'<p class="lista-estado">No hay reinversiones registradas.</p>';
    }catch(e){caja.innerHTML='<p class="lista-estado">No se pudo cargar el historial de caja.</p>';reinv.innerHTML='<p class="lista-estado">No se pudo cargar el historial de reinversiones.</p>'}
  }

  function start(){ensure();ensureGasto();ensureSalida();refrescarFinanzas();if(!window.__bcFinanzasTimer)window.__bcFinanzasTimer=setInterval(()=>{ensure();ensureGasto();ensureSalida();refrescarFinanzas()},10000)}
  window.refrescarFinanzas=refrescarFinanzas;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(start,1500));
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-tab]');if(b&&b.dataset.tab==='operacion')setTimeout(()=>{ensure();ensureGasto();ensureSalida();refrescarFinanzas()},200)});
})();
