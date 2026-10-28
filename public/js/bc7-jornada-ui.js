// BattleCruiser Step 7 — Jornada única, inventario físico, movimientos y cierre
// v7.1 — usa contratos bc5_* + bc7_*; no borra ni reescribe históricos de ventas.
(function bc7JornadaUI(){
  'use strict';
  if(window.__BC7_JORNADA_UI__) return;
  window.__BC7_JORNADA_UI__=true;

  const state={admin:false,rows:[],selected:null,detail:null,loading:false,warehouseId:'',lastPreview:null};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
  const dateHavana=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function addDays(s,n){const d=new Date(String(s||dateHavana())+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(n||0));return d.toISOString().slice(0,10);}
  function fmtDate(v){const s=String(v||'').slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s||'—';}
  function qty(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('es-ES',{maximumFractionDigits:3}):'—';}
  function money(v){return typeof window.money==='function'?window.money(Number(v||0)):Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function currentUser(){return window._usuarioActual||window.__bcUser||window.usuarioActual||null;}
  function warehouses(){return arr(window._cache&&window._cache.almacenes).filter(x=>x&&x.activo!==false);}
  function users(){return arr(window._cache&&window._cache.usuarios).filter(x=>x&&x.activo!==false&&!x.archivado);}
  function warehouseName(id){const w=warehouses().find(x=>String(x.id)===String(id));return w?w.nombre:('Almacén '+String(id||'').slice(0,8));}
  function userName(id){const u=users().find(x=>String(x.id)===String(id));return u?(u.nombre||u.nombre_usuario||u.email||'Responsable'):String(id||'Sin asignar');}
  function roleOf(u){return String(u&&(u.rol||u.role_name||u.nombre_rol||u.role)||'').toLowerCase();}
  function setStatus(msg,kind){const el=$('bc7-status');if(!el)return;el.textContent=msg||'';el.className='bc7-status '+(kind||'');}
  function msg(el,text,kind){if(!el)return;el.textContent=text||'';el.className='bc7-msg '+(kind||'');}
  function can(section,action){try{return typeof tienePermiso==='function'&&tienePermiso(section,action)}catch(e){return false}}
  async function rpc(name,params){
    if(!navigator.onLine)throw new Error('Estás sin conexión. Reconecta para consultar o guardar datos; nada se ha enviado.');
    if(typeof client==='undefined'||!client||typeof client.rpc!=='function')throw new Error('Cliente Supabase no disponible.');
    const r=await client.rpc(name,params||{});
    if(r&&r.error){const e=new Error(r.error.message||r.error.details||'La operación fue rechazada.');e.code=r.error.code;e.rpc=name;throw e;}
    return r?r.data:null;
  }
  function busy(btn,on){if(!btn)return;if(on){if(btn.dataset.bc7Busy==='1')return false;btn.dataset.bc7Busy='1';btn.disabled=true;btn.setAttribute('aria-busy','true');return true;}btn.dataset.bc7Busy='0';btn.disabled=false;btn.removeAttribute('aria-busy');return true;}
  function navTo(tab){try{if(typeof window.irATab==='function')window.irATab(tab);else{const b=document.querySelector('.tab-btn[data-tab="'+tab+'"]');if(b)b.click();}}catch(e){}}
  function ensureStyles(){
    if($('bc7-style'))return;
    const s=document.createElement('style');s.id='bc7-style';
    s.textContent=[
      '#tab-jornada{max-width:1080px;margin:0 auto;padding-bottom:28px}',
      '#tab-jornada .bc7-wrap{max-width:100%;margin:0 auto}',
      '#tab-jornada .bc7-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 14px;padding:4px 0 13px;border-bottom:1px solid var(--gold-dim)}',
      '#tab-jornada .bc7-hero h2{font-family:"Cormorant Garamond",serif;font-size:29px;line-height:1.1;margin:0;color:var(--text)}',
      '#tab-jornada .bc7-hero p{font-size:12px;color:var(--mist);margin:6px 0 0;max-width:640px}',
      '#tab-jornada .bc7-status{font-size:12px;color:var(--mist);min-height:18px;text-align:right;max-width:190px}',
      '#tab-jornada .bc7-status.error,#tab-jornada .bc7-msg.error{color:#e79a93}',
      '#tab-jornada .bc7-status.ok,#tab-jornada .bc7-msg.ok{color:#94d2aa}',
      '#tab-jornada .bc7-card{padding:14px;margin:10px 0;border-radius:10px;border:1px solid var(--gold-dim);background:var(--stone);min-width:0}',
      '#tab-jornada .bc7-card h3{font-size:17px;margin:0 0 8px;color:var(--text)}',
      '#tab-jornada .bc7-card h4{font-size:14px;margin:14px 0 8px}',
      '#tab-jornada .bc7-muted{color:var(--mist);font-size:12px;line-height:1.45}',
      '#tab-jornada .bc7-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
      '#tab-jornada .bc7-field{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:12px;color:var(--mist);margin:7px 0}',
      '#tab-jornada .bc7-field input,#tab-jornada .bc7-field select,#tab-jornada .bc7-field textarea,#tab-jornada .bc7-inline input,#tab-jornada .bc7-inline select{box-sizing:border-box;width:100%;min-width:0;padding:10px;border:1px solid var(--gold-dim);border-radius:6px;background:var(--void);color:var(--text);font:inherit}',
      '#tab-jornada .bc7-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}',
      '#tab-jornada .bc7-btn{min-height:42px;padding:9px 13px;border:1px solid var(--gold-dim);border-radius:7px;background:var(--void);color:var(--text);font:600 12px Inter,sans-serif;cursor:pointer}',
      '#tab-jornada .bc7-btn.primary{background:var(--gold);border-color:var(--gold);color:#17211b}',
      '#tab-jornada .bc7-btn.danger{border-color:#a45353;color:#efb1ac}',
      '#tab-jornada .bc7-btn:disabled{opacity:.45;cursor:not-allowed}',
      '#tab-jornada .bc7-day-rows{display:grid;gap:8px;margin-top:9px}',
      '#tab-jornada .bc7-day-row{display:grid;grid-template-columns:minmax(90px,.7fr) minmax(120px,1.5fr) minmax(150px,2fr);gap:8px;align-items:center;padding:9px;border-radius:7px;background:rgba(10,20,16,.28);border:1px solid var(--gold-dim)}',
      '#tab-jornada .bc7-day-row label{font-size:12px;color:var(--mist)}',
      '#tab-jornada .bc7-day-row select{width:100%;min-width:0;background:var(--void);color:var(--text);border:1px solid var(--gold-dim);border-radius:5px;padding:8px}',
      '#tab-jornada .bc7-list{display:grid;gap:8px}',
      '#tab-jornada .bc7-jornada{padding:12px;border:1px solid var(--gold-dim);border-radius:8px;background:rgba(7,19,15,.25)}',
      '#tab-jornada .bc7-jornada-top{display:flex;gap:9px;align-items:flex-start;justify-content:space-between}',
      '#tab-jornada .bc7-jornada strong{display:block;color:var(--text);font-size:14px}',
      '#tab-jornada .bc7-jornada p{margin:4px 0;font-size:12px;color:var(--mist)}',
      '#tab-jornada .bc7-pill{display:inline-block;padding:4px 7px;border:1px solid var(--gold-dim);border-radius:999px;font-size:10px;color:var(--mist);white-space:nowrap}',
      '#tab-jornada .bc7-pill.ok{color:#9fd7ad;border-color:#4b8860}',
      '#tab-jornada .bc7-pill.warn{color:#ebcf7e;border-color:#a9873c}',
      '#tab-jornada .bc7-table-wrap{width:100%;overflow:auto}',
      '#tab-jornada .bc7-table{width:100%;border-collapse:collapse;font-size:12px}',
      '#tab-jornada .bc7-table th,#tab-jornada .bc7-table td{padding:9px 7px;text-align:left;border-bottom:1px solid var(--gold-dim);white-space:nowrap}',
      '#tab-jornada .bc7-table th{color:var(--mist);font-weight:600}',
      '#tab-jornada .bc7-table input{width:96px;max-width:100%;box-sizing:border-box;padding:8px;background:var(--void);color:var(--text);border:1px solid var(--gold-dim);border-radius:5px}',
      '#tab-jornada .bc7-diff{font-weight:700}',
      '#tab-jornada .bc7-diff.bad{color:#efaaa2}',
      '#tab-jornada .bc7-diff.good{color:#a0d7af}',
      '#tab-jornada .bc7-msg{min-height:18px;margin:7px 0 0;font-size:12px;line-height:1.4}',
      '#tab-jornada .bc7-note{padding:10px;border-left:3px solid var(--gold);background:rgba(201,162,77,.08);font-size:12px;color:var(--mist)}',
      '#tab-jornada details.bc7-reschedule{margin-top:10px;border-top:1px solid var(--gold-dim);padding-top:8px}',
      '#tab-jornada details summary{cursor:pointer;color:var(--gold);font-size:12px}',
      '#tab-jornada .bc7-check{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text)}',
      '#tab-jornada .bc7-empty{padding:18px 10px;text-align:center;border:1px dashed var(--gold-dim);border-radius:8px;color:var(--mist);font-size:12px}',
      '@media(max-width:650px){#tab-jornada .bc7-hero{display:block}#tab-jornada .bc7-status{text-align:left;margin-top:9px;max-width:none}#tab-jornada .bc7-grid{grid-template-columns:1fr}#tab-jornada .bc7-day-row{grid-template-columns:1fr;gap:5px}#tab-jornada .bc7-day-row label{margin-top:4px}#tab-jornada .bc7-actions .bc7-btn{flex:1 1 140px}#tab-jornada .bc7-table th,#tab-jornada .bc7-table td{padding:8px 6px}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function ensureShell(){
    let button=document.querySelector('.tab-btn[data-tab="jornada"]');
    const oldTurnos=document.querySelector('.tab-btn[data-tab="turnos"]');
    if(!button&&oldTurnos){button=document.createElement('button');button.type='button';button.className=oldTurnos.className||'tab-btn';button.dataset.tab='jornada';button.textContent='Jornada e inventario';oldTurnos.insertAdjacentElement('afterend',button);}
    let tab=$('tab-jornada');
    if(!tab){
      const ref=$('tab-turnos')||$('tab-ciclos');
      if(ref){tab=document.createElement('section');tab.id='tab-jornada';tab.className='tab-panel';ref.insertAdjacentElement('beforebegin',tab);}
    }
    if(!tab)return null;
    tab.innerHTML='<div class="bc7-wrap">'+
      '<header class="bc7-hero"><div><h2>Jornada e inventario</h2><p>Controla qué persona trabaja cada día, el inventario físico inicial y final, y la declaración de dinero al cerrar.</p></div><div id="bc7-status" class="bc7-status">Comprobando acceso…</div></header>'+
      '<section class="bc7-card bc7-purpose" aria-labelledby="bc7-purpose-title"><h3 id="bc7-purpose-title">¿Para qué sirve esta sección?</h3><p class="bc7-muted">Una jornada es un día de trabajo de un almacén con responsable y horario definidos. Aquí se controla el inicio, el inventario contado físicamente, la actividad y el cierre; no es el historial general de todos los movimientos.</p><ol class="bc7-muted"><li>Consulta el calendario y abre la jornada que te corresponde.</li><li>Antes de empezar, confirma el inventario inicial contando la mercancía física.</li><li>Durante la jornada, registra las operaciones en sus secciones habituales.</li><li>Al terminar, confirma el inventario final y la declaración de dinero, y completa el cierre que autorice el servidor.</li></ol><p class="bc7-muted">Las operaciones se muestran dentro de un día del turno solo cuando existe un vínculo verificable con esa sesión. Las demás se conservan en Movimientos → Historial, organizadas por fecha y almacén.</p></section>'+
      '<section id="bc7-admin-panel" class="bc7-card" hidden>'+
       '<h3>Programación y responsable</h3><p class="bc7-muted">Define el horario, guarda una rotación explícita o programa fechas concretas. No se infieren descansos ni responsables.</p>'+
       '<div class="bc7-grid"><label class="bc7-field">Almacén<select id="bc7-warehouse"></select></label><label class="bc7-field">Modo de programación<select id="bc7-plan-mode"><option value="explicit">Fechas explícitas</option><option value="pattern">Usar patrón activo</option></select></label></div>'+
       '<form id="bc7-hours-form"><h4>Horario operativo</h4><div class="bc7-grid"><label class="bc7-field">Apertura<input type="time" id="bc7-hour-start" value="07:00" required></label><label class="bc7-field">Cierre<input type="time" id="bc7-hour-end" value="23:00" required></label></div><label class="bc7-field">Zona horaria IANA<input id="bc7-timezone" value="America/Havana" required></label><button class="bc7-btn" type="submit">Guardar horario</button><p class="bc7-msg" id="bc7-hours-msg"></p></form>'+
       '<form id="bc7-pattern-form"><h4>Rotación configurable</h4><div class="bc7-grid"><label class="bc7-field">Nombre del patrón<input id="bc7-pattern-name" maxlength="100" placeholder="Ej. 5 días de trabajo / 2 descanso" required></label><label class="bc7-field">Fecha ancla<input id="bc7-anchor" type="date" required></label><label class="bc7-field">Días del ciclo<input id="bc7-days-count" type="number" min="1" max="31" value="7" required></label><label class="bc7-field">Inicio de programación<input id="bc7-start-date" type="date" required></label></div><div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-build>Preparar días</button><button class="bc7-btn" type="submit">Guardar patrón</button></div><div id="bc7-day-rows" class="bc7-day-rows"></div><p class="bc7-msg" id="bc7-pattern-msg"></p></form>'+
       '<div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-preview>Previsualizar patrón</button><button class="bc7-btn primary" type="button" data-bc7-create>Crear jornadas</button></div><label class="bc7-field">Observación de programación (opcional)<input id="bc7-schedule-note" maxlength="1000" placeholder="Motivo administrativo o nota"></label><div id="bc7-preview" class="bc7-list"></div><p class="bc7-msg" id="bc7-create-msg"></p>'+
      '</section>'+
      '<section class="bc7-card"><h3>Calendario de jornadas</h3><div class="bc7-grid"><label class="bc7-field">Desde<input type="date" id="bc7-list-from"></label><label class="bc7-field">Días a consultar<input type="number" id="bc7-list-days" min="1" max="31" value="14"></label></div><div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-refresh>Actualizar calendario</button></div><div id="bc7-schedule-list" class="bc7-list"><div class="bc7-empty">Cargando calendario…</div></div><p class="bc7-msg" id="bc7-list-msg"></p></section>'+
      '<section id="bc7-workspace" class="bc7-card" hidden><h3 id="bc7-workspace-title">Detalle de jornada</h3><div id="bc7-workspace-body"></div></section>'+
      '</div>';
    return tab;
  }
  function fillWarehouses(){
    const sel=$('bc7-warehouse');if(!sel)return;
    const prev=sel.value;
    sel.innerHTML='<option value="">Selecciona un almacén</option>'+warehouses().map(w=>'<option value="'+esc(w.id)+'">'+esc(w.nombre)+'</option>').join('');
    if(warehouses().some(w=>String(w.id)===prev))sel.value=prev;
  }
  function staffOptions(selected){
    return '<option value="">Selecciona responsable</option>'+users().map(u=>'<option value="'+esc(u.id)+'"'+(String(u.id)===String(selected||'')?' selected':'')+'>'+esc(u.nombre||u.nombre_usuario||u.email||u.id)+'</option>').join('');
  }
  function readDayRows(){
    return Array.from(document.querySelectorAll('#bc7-day-rows .bc7-day-row')).map((r,i)=>{
      const works=r.querySelector('[data-bc7-works]')?.checked===true;
      const person=r.querySelector('[data-bc7-person]')?.value||'';
      return {numero_dia:i+1,trabaja:works,responsable_id:works?person:null};
    });
  }
  function buildDayRows(){
    const host=$('bc7-day-rows');if(!host)return;
    const n=Math.max(1,Math.min(31,Number($('bc7-days-count')?.value||7)));
    const old=readDayRows();const anchor=$('bc7-anchor')?.value||$('bc7-start-date')?.value||dateHavana();
    host.innerHTML=Array.from({length:n},(_,i)=>{
      const d=old[i]||{trabaja:true,responsable_id:null};
      return '<div class="bc7-day-row"><b>Día '+(i+1)+' · '+esc(fmtDate(addDays(anchor,i)))+'</b><label class="bc7-check"><input type="checkbox" data-bc7-works '+(d.trabaja?'checked':'')+'> Trabaja</label><label><span class="bc7-muted">Responsable</span><select data-bc7-person '+(!d.trabaja?'disabled':'')+'>'+staffOptions(d.responsable_id)+'</select></label></div>';
    }).join('');
    host.querySelectorAll('[data-bc7-works]').forEach(ch=>ch.addEventListener('change',()=>{const row=ch.closest('.bc7-day-row');const person=row&&row.querySelector('[data-bc7-person]');if(person){person.disabled=!ch.checked;if(!ch.checked)person.value='';}}));
    state.lastPreview=null;
    if($('bc7-preview'))$('bc7-preview').innerHTML='';
  }
  async function loadHours(){
    const warehouseId=$('bc7-warehouse')?.value;if(!warehouseId)return;
    try{const d=await rpc('bc5_obtener_configuracion_jornada',{p_almacen_id:warehouseId});if(d){$('bc7-hour-start').value=String(d.hora_inicio||'07:00').slice(0,5);$('bc7-hour-end').value=String(d.hora_fin||'23:00').slice(0,5);$('bc7-timezone').value=d.zona_horaria||'America/Havana';}}catch(e){msg($('bc7-hours-msg'),'No se pudo leer la configuración: '+e.message,'error');}
  }
  function rowHtml(r){
    const status=String(r.sesion_estado||r.estado||'—').toUpperCase();
    const rest=!r.trabaja||r.estado==='DESCANSO';
    const pill=rest?'<span class="bc7-pill">Descanso</span>':status==='COMPLETADA'?'<span class="bc7-pill ok">Cerrada</span>':status==='EN_CURSO'?'<span class="bc7-pill ok">En curso</span>':status==='PROGRAMADA'||status==='PENDIENTE'?'<span class="bc7-pill warn">Programada</span>':'<span class="bc7-pill">'+esc(status)+'</span>';
    const action=(!rest&&r.sesion_id)?'<button class="bc7-btn primary" type="button" data-bc7-open="'+esc(r.sesion_id)+'">Gestionar jornada</button>':'';
    let reschedule='';
    if(state.admin){
      reschedule='<details class="bc7-reschedule"><summary>Reprogramar responsable / descanso</summary><form data-bc7-reschedule="'+esc(r.id)+'" data-bc7-session="'+esc(r.sesion_id||'')+'"><label class="bc7-check"><input type="checkbox" data-bc7-rework '+(!rest?'checked':'')+'> Jornada laborable</label><label class="bc7-field">Responsable<select data-bc7-reperson '+(!rest?'':' disabled')+'>'+staffOptions(r.responsable_id)+'</select></label><label class="bc7-field">Motivo obligatorio<input data-bc7-reason maxlength="1000" required placeholder="Ausencia, sustitución o corrección"></label><button class="bc7-btn" type="submit">Guardar reprogramación</button><p class="bc7-msg" data-bc7-remsg></p></form></details>';
    }
    return '<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(fmtDate(r.fecha))+' · '+esc(warehouseName(r.almacen_id))+'</strong><p>'+esc(r.trabaja?userName(r.responsable_id):'Sin responsable (descanso)')+' · '+esc(String(r.hora_inicio_prevista||'07:00').slice(0,5))+'–'+esc(String(r.hora_fin_prevista||'23:00').slice(0,5))+' · '+esc(r.zona_horaria||'America/Havana')+'</p></div>'+pill+'</div><div class="bc7-actions">'+action+'</div>'+reschedule+'</article>';
  }
  async function loadCalendar(){
    const host=$('bc7-schedule-list');if(!host)return;
    const from=$('bc7-list-from')?.value||dateHavana();
    const days=Math.max(1,Math.min(31,Number($('bc7-list-days')?.value||14)));
    const to=addDays(from,days-1);
    host.innerHTML='<div class="bc7-empty">Cargando calendario…</div>';msg($('bc7-list-msg'),'');
    try{
      const data=arr(await rpc('bc5_mis_jornadas',{p_fecha_inicio:from,p_fecha_fin:to}));
      state.rows=data;
      if(!data.length){host.innerHTML='<div class="bc7-empty"><strong>No hay jornadas visibles en este rango.</strong><p>Prueba a pulsar “Actualizar calendario” o amplía “Días a consultar”. Si esperabas una jornada concreta, comprueba la fecha, el almacén y que estés asignado como responsable. Una lista vacía no demuestra que el servidor esté caído.</p></div>';return;}
      host.innerHTML=data.map(rowHtml).join('');
    }catch(e){host.innerHTML='<div class="bc7-empty">No se pudo consultar el calendario.</div>';msg($('bc7-list-msg'),e.message,'error');}
  }
  function cutHtml(cut,products){
    if(!cut)return '<div class="bc7-empty">Aún no hay conteo confirmado.</div>';
    const lines=arr(cut.lineas);
    return '<p class="bc7-muted">Confirmado '+esc(fmtDate(cut.confirmado_en||cut.creado_en))+' · autor '+esc(userName(cut.confirmado_por||cut.creado_por))+' · '+lines.length+' productos.</p>'+
      (cut.observacion?'<p class="bc7-muted">Nota: '+esc(cut.observacion)+'</p>':'')+
      '<div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Producto</th><th>Conteo físico</th><th>Stock sistema al confirmar</th><th>Diferencia</th></tr></thead><tbody>'+
      lines.map(l=>{const p=products.find(x=>String(x.producto_id)===String(l.producto_id))||{};const d=Number(l.diferencia??Number(l.cantidad_contada)-Number(l.stock_sistema));return '<tr><td>'+esc(p.nombre||l.producto_id)+'</td><td>'+esc(qty(l.cantidad_contada))+'</td><td>'+esc(qty(l.stock_sistema))+'</td><td class="bc7-diff '+(d===0?'good':'bad')+'">'+(d>0?'+':'')+esc(qty(d))+'</td></tr>';}).join('')+
      '</tbody></table></div>';
  }
  function countFormHtml(type,detail){
    const cut=detail.cortes&&detail.cortes[type];
    const session=detail.sesion;
    const allowed=type==='INICIAL'?['PENDIENTE','PROGRAMADA'].includes(String(session.estado).toUpperCase()):String(session.estado).toUpperCase()==='EN_CURSO';
    if(cut)return '<div class="bc7-note">El conteo '+(type==='INICIAL'?'inicial':'final')+' está confirmado e inmutable. Para corregirlo se necesita un proceso administrativo auditado.</div>'+cutHtml(cut,arr(detail.productos));
    if(!allowed)return '<div class="bc7-empty">El conteo '+(type==='INICIAL'?'inicial':'final')+' no puede modificarse en el estado actual ('+esc(session.estado)+').</div>';
    const products=arr(detail.productos);
    const table=products.length?'<div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Producto</th><th>Unidad</th><th>Stock actual</th><th>Conteo físico</th></tr></thead><tbody>'+products.map(p=>'<tr><td>'+esc(p.nombre)+'</td><td>'+esc(p.unidad||'ud')+'</td><td>'+esc(qty(p.stock_actual))+'</td><td><input type="number" min="0" step="0.001" inputmode="decimal" required data-bc7-count="'+esc(p.producto_id)+'" aria-label="Conteo físico de '+esc(p.nombre)+'" placeholder="Contar"></td></tr>').join('')+'</tbody></table></div>':'<div class="bc7-empty">Este almacén no tiene productos activos con fila de stock registrada. Si se trata realmente de un almacén vacío, puedes confirmar el conteo de cero productos.</div>';
    return '<p class="bc7-muted">Cuenta físicamente cada producto del listado. El stock del sistema solo sirve como comparación; no se copia como conteo físico.</p><form data-bc7-count-form="'+type+'">'+table+'<label class="bc7-field">Observación (opcional)<input data-bc7-count-note maxlength="1000" placeholder="Incidencia o aclaración del conteo"></label><div class="bc7-actions"><button class="bc7-btn primary" type="submit">Guardar y confirmar '+(type==='INICIAL'?'inventario inicial':'inventario final')+'</button></div><p class="bc7-msg" data-bc7-count-msg></p></form>';
  }
  function renderMovementRows(rows,session){
    const day=Number(session&&session.numero_dia||0);
    const date=String(session&&session.fecha||'').slice(0,10);
    const heading='<h4>Día '+esc(day||'—')+' · '+esc(date||'fecha no disponible')+'</h4>';
    if(!rows.length)return heading+'<div class="bc7-empty">No hay movimientos vinculados de forma verificable a esta sesión y a su tramo horario. Las operaciones que no puedan asociarse con seguridad siguen en Movimientos → Historial general; no se asignan solo por compartir fecha.</div>';
    return heading+'<div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Hora</th><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Usuario</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(String(r.fecha||'').replace('T',' ').slice(0,16))+'</td><td>'+esc(r.tipo||'—')+'</td><td>'+esc(r.producto||'—')+'</td><td>'+esc(qty(r.cantidad))+'</td><td>'+esc(r.usuario||'—')+'</td></tr>').join('')+'</tbody></table></div>';
  }
  async function loadMovements(detail){
    const host=$('bc7-movements');if(!host)return;
    host.innerHTML='<div class="bc7-empty">Consultando movimientos atribuidos al día y turno…</div>';
    try{
      const r=await rpc('bc7_movimientos_sesion',{p_turno_sesion_id:detail.sesion.id});
      host.innerHTML=renderMovementRows(arr(r),detail.sesion);
    }catch(e){host.innerHTML='<div class="bc7-empty">No se pudo consultar el archivo de esta sesión: '+esc(e.message)+'. No se han modificado datos.</div>';}
  }
  function renderWorkspace(detail){
    state.detail=detail;
    const s=detail.sesion;
    const cuts=detail.cortes||{};
    const initial=!!cuts.INICIAL,final=!!cuts.FINAL;
    const status=String(s.estado||'').toUpperCase();
    const isAssigned=!state.admin||String(currentUser()?.id||'')===String(s.responsable_id||'');
    let actionArea='';
    if((status==='PENDIENTE'||status==='PROGRAMADA')&&initial){
      actionArea='<div class="bc7-card"><h4>Iniciar jornada</h4><p class="bc7-muted">El backend comprobará la fecha, el responsable asignado, la secuencia y las excepciones horarias.</p><label class="bc7-field">Motivo si abres antes/después de la hora prevista<input id="bc7-start-reason" maxlength="1000" placeholder="Deja vacío si abres exactamente a la hora programada"></label><div class="bc7-actions"><button class="bc7-btn primary" type="button" data-bc7-start="'+esc(s.id)+'" '+(!isAssigned?'disabled':'')+'>Confirmar apertura</button></div><p class="bc7-msg" id="bc7-start-msg"></p></div>';
    } else if(status==='EN_CURSO'){
      const tramo=detail.tramo_activo;
      const savedDeclaration=detail.declaracion_dinero&&tramo&&String(detail.declaracion_dinero.turno_tramo_id)===String(tramo.id);
      actionArea='<div class="bc7-card"><h4>Declaración de dinero y cierre</h4><p class="bc7-muted">'+(savedDeclaration?'La declaración de este tramo ya está guardada; no se repetirá al reintentar el cierre.':'Introduce el efectivo real entregado, incluidos los valores cero si no hubo efectivo.')+' El cierre mantiene la validación y aprobación existentes.</p><form data-bc7-close-form="'+esc(s.id)+'"><label class="bc7-field">Dinero declarado<input id="bc7-cash" type="number" min="0" step="0.01" required placeholder="0.00" inputmode="decimal" value="'+(savedDeclaration?esc(detail.declaracion_dinero.monto):'')+'" '+(savedDeclaration?'readonly':'')+'></label><label class="bc7-field">Motivo si cierras antes/después de hora o fecha<input id="bc7-close-reason" maxlength="1000" placeholder="Motivo de excepción (si aplica)"></label><div class="bc7-actions"><button type="submit" class="bc7-btn danger" '+(!final||!tramo||!isAssigned?'disabled':'')+'>'+(savedDeclaration?'Cerrar jornada con declaración guardada':'Declarar dinero y cerrar jornada')+'</button></div><p class="bc7-msg" data-bc7-close-msg></p>'+(final?'':'<p class="bc7-note">El cierre está bloqueado hasta confirmar el inventario final.</p>')+'</form></div>';
    } else if(status==='COMPLETADA'){
      actionArea='<div class="bc7-note">Jornada completada. Los conteos confirmados y los movimientos permanecen como evidencia histórica.</div>';
    } else {
      actionArea='<div class="bc7-note">Estado actual: '+esc(status)+'. Las acciones de escritura solo aparecen cuando están permitidas por el backend.</div>';
    }
    let adjustment='';
    if(status==='EN_CURSO'&&isAssigned&&(can('mermas','crear')||can('bajas','crear'))){
      const products=arr(detail.productos);
      adjustment='<div class="bc7-card"><h4>Registrar movimiento de salida</h4><p class="bc7-muted">Mermas y bajas quedan pendientes de revisión. El stock no se altera hasta que la aprobación existente las acepte.</p><form data-bc7-adjust-form="'+esc(s.id)+'"><div class="bc7-grid"><label class="bc7-field">Tipo<select data-bc7-ajust-type required>'+((can('mermas','crear'))?'<option value="merma">Merma</option>':'')+((can('bajas','crear'))?'<option value="baja">Baja</option>':'')+'</select></label><label class="bc7-field">Producto<select data-bc7-ajust-product required><option value="">Selecciona producto</option>'+products.map(p=>'<option value="'+esc(p.producto_id)+'">'+esc(p.nombre)+' · stock '+esc(qty(p.stock_actual))+'</option>').join('')+'</select></label><label class="bc7-field">Cantidad<input type="number" min="0.001" step="0.001" data-bc7-ajust-qty required inputmode="decimal"></label><label class="bc7-field">Motivo<input data-bc7-ajust-reason maxlength="500" required placeholder="Describe la salida"></label></div><div class="bc7-actions"><button class="bc7-btn" type="submit">Enviar ajuste a revisión</button></div><p class="bc7-msg" data-bc7-ajust-msg></p></form></div>';
    }
    $('bc7-workspace-title').textContent='Jornada · '+fmtDate(s.fecha)+' · '+warehouseName(s.almacen_id);
    $('bc7-workspace-body').innerHTML='<div class="bc7-grid"><div class="bc7-note"><b>Estado:</b> '+esc(status)+'<br><b>Responsable:</b> '+esc(userName(s.responsable_id))+'<br><b>Horario:</b> '+esc(String(s.hora_inicio_prevista||'').slice(0,5))+'–'+esc(String(s.hora_fin_prevista||'').slice(0,5))+'<br><b>Zona:</b> '+esc(s.zona_horaria||'America/Havana')+'</div><div class="bc7-note"><b>Inventario inicial:</b> '+(initial?'confirmado':'pendiente')+'<br><b>Inventario final:</b> '+(final?'confirmado':'pendiente')+'<br><b>Jornada:</b> '+esc(s.id)+'</div></div>'+
      '<h4>1. Inventario inicial</h4>'+countFormHtml('INICIAL',detail)+
      '<h4>2. Inventario final y diferencias</h4>'+countFormHtml('FINAL',detail)+
      adjustment+actionArea+
      '<div class="bc7-card"><h4>Movimientos registrados en la fecha</h4><p class="bc7-muted">Vista de solo lectura; los tipos y registros provienen de la función canónica de movimientos.</p><div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-mov-refresh>Actualizar movimientos</button><button class="bc7-btn" type="button" data-bc7-open-movements>Abrir libro de movimientos</button></div><div id="bc7-movements"><div class="bc7-empty">Pulse Actualizar movimientos para consultar el libro.</div></div></div>';
    $('bc7-workspace').hidden=false;
    $('bc7-workspace').scrollIntoView({behavior:'smooth',block:'start'});
    loadMovements(detail);
  }
  async function openWorkspace(sessionId){
    $('bc7-workspace').hidden=false;$('bc7-workspace-body').innerHTML='<div class="bc7-empty">Cargando jornada y conteos confirmados…</div>';
    try{const detail=await rpc('bc7_obtener_inventario_jornada',{p_turno_sesion_id:sessionId});state.selected=sessionId;renderWorkspace(detail);}catch(e){$('bc7-workspace-body').innerHTML='<div class="bc7-empty">No se pudo abrir esta jornada: '+esc(e.message)+'</div>';}
  }
  async function saveCount(form){
    const type=form.dataset.bc7CountForm;
    const sessionId=state.selected;
    const inputs=Array.from(form.querySelectorAll('[data-bc7-count]'));
    const lines=inputs.map(i=>({producto_id:i.dataset.bc7Count,cantidad:i.value.trim()}));
    const bad=lines.find(x=>x.cantidad===''||!Number.isFinite(Number(x.cantidad))||Number(x.cantidad)<0||!/^\d+(?:\.\d{1,3})?$/.test(x.cantidad));
    if(bad){msg(form.querySelector('[data-bc7-count-msg]'),'Cuenta todos los productos e introduce cantidades válidas con hasta 3 decimales.','error');return;}
    const note=form.querySelector('[data-bc7-count-note]')?.value||null;
    const label=type==='INICIAL'?'inventario inicial':'inventario final';
    if(!confirm('Vas a confirmar el '+label+' físico. El corte quedará inmutable y se guardará quién/cuándo y el stock de sistema usado para comparar. ¿Confirmas que contaste todos los productos?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{await rpc('bc7_guardar_inventario_jornada',{p_turno_sesion_id:sessionId,p_tipo:type,p_lineas:lines.map(x=>({producto_id:x.producto_id,cantidad:Number(x.cantidad)})),p_observacion:note});await openWorkspace(sessionId);setStatus('Conteo confirmado y leído de nuevo desde el backend.','ok');}
    catch(e){msg(form.querySelector('[data-bc7-count-msg]'),'No se confirmó el conteo: '+e.message,'error');}
    finally{busy(btn,false);}
  }
  async function refreshPosArchiveAfterSessionStart() {
    // Starting a jornada changes the authoritative active turn/warehouse.
    // Re-read it before M74 decides whether the wholesale POS can be shown.
    try {
      if (typeof window.__BC_M25_refrescarTurno === 'function') {
        await window.__BC_M25_refrescarTurno();
      } else if (typeof window.refrescarTurnoActual === 'function') {
        await window.refrescarTurnoActual();
      }
    } catch (e) {
      try { console.warn('[BC7] No se pudo refrescar la sesión tras abrir la jornada.', e); } catch (ignored) {}
    }
    try {
      if (typeof window.__BC_M74_SYNC_POS_ARCHIVE__ === 'function') {
        window.__BC_M74_SYNC_POS_ARCHIVE__('jornada-started');
      }
    } catch (e) {}
  }

  async function startSession(btn){
    const sessionId=btn.dataset.bc7Start;if(!busy(btn,true))return;
    try{
      const reason=$('bc7-start-reason')?.value||null;
      if(!confirm('¿Confirmas abrir esta jornada ahora? La fecha, la asignación y la secuencia volverán a validarse en el servidor.'))return;
      await rpc('bc5_iniciar_jornada',{p_turno_sesion_id:sessionId,p_motivo_excepcion:reason});
      await refreshPosArchiveAfterSessionStart();
      await loadCalendar();await openWorkspace(sessionId);setStatus('Jornada abierta; estado releído del backend.','ok');
    }catch(e){msg($('bc7-start-msg'),'No se abrió la jornada: '+e.message,'error');}
    finally{busy(btn,false);}
  }
  async function closeSession(form){
    const sessionId=form.dataset.bc7CloseForm;
    let amount=$('bc7-cash')?.value.trim();
    const msgEl=form.querySelector('[data-bc7-close-msg]');
    if(!state.detail?.tramo_activo?.id){msg(msgEl,'No hay un tramo activo para declarar el dinero. La jornada no se ha cerrado.','error');return;}
    const tramoId=state.detail.tramo_activo.id;
    const saved=state.detail.declaracion_dinero&&String(state.detail.declaracion_dinero.turno_tramo_id)===String(tramoId);
    if(saved){amount=String(state.detail.declaracion_dinero.monto);}
    if(amount===''||amount==null||!Number.isFinite(Number(amount))||Number(amount)<0){msg(msgEl,'Introduce un importe real igual o mayor que cero.','error');return;}
    if(!state.detail?.cortes?.FINAL){msg(msgEl,'Primero confirma el inventario final.','error');return;}
    if(!confirm('Se registrará la declaración de dinero y, después, se solicitará el cierre. ¿El importe corresponde al efectivo realmente contado?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{
      if(!saved) await rpc('bc_declarar_dinero',{p_turno_tramo_id:tramoId,p_monto:Number(amount)});
      await rpc('bc5_cerrar_jornada',{p_turno_sesion_id:sessionId,p_motivo_excepcion:$('bc7-close-reason')?.value||null});
      await loadCalendar();await openWorkspace(sessionId);setStatus('Cierre ejecutado y estado releído del backend.','ok');
    }catch(e){
      const errorText='No se completó el cierre: '+e.message+'. La pantalla releerá el estado antes de permitir otro intento.';
      try{const d=await rpc('bc7_obtener_inventario_jornada',{p_turno_sesion_id:sessionId});renderWorkspace(d);msg(document.querySelector('[data-bc7-close-msg]'),errorText,'error');}
      catch(x){msg(form.querySelector('[data-bc7-close-msg]'),errorText,'error');}
    }
    finally{busy(btn,false);}
  }
  async function submitAdjustment(form){
    const sessionId=form.dataset.bc7AdjustForm;
    const type=form.querySelector('[data-bc7-ajust-type]').value;
    const product=form.querySelector('[data-bc7-ajust-product]').value;
    const quantity=form.querySelector('[data-bc7-ajust-qty]').value;
    const reason=form.querySelector('[data-bc7-ajust-reason]').value.trim();
    const msgEl=form.querySelector('[data-bc7-ajust-msg]');
    if(!product||!Number.isFinite(Number(quantity))||Number(quantity)<=0||!reason){msg(msgEl,'Selecciona producto, cantidad positiva y motivo.','error');return;}
    if(!confirm('Se enviará una solicitud de '+type+' a revisión administrativa. El inventario solo cambia cuando se apruebe. ¿Confirmas?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{
      await rpc('bc7_registrar_ajuste_jornada',{p_turno_sesion_id:sessionId,p_tipo:type,p_producto_id:product,p_cantidad:Number(quantity),p_motivo:reason,p_idempotency_key:crypto.randomUUID()});
      msg(msgEl,'Solicitud guardada y ligada a esta jornada. Está pendiente de revisión; no se marcó como aprobada.','ok');
      form.reset();await openWorkspace(sessionId);
    }catch(e){msg(msgEl,'No se registró el ajuste: '+e.message,'error');}
    finally{busy(btn,false);}
  }
  async function saveHours(form){
    const warehouse=$('bc7-warehouse')?.value;
    const start=$('bc7-hour-start').value,end=$('bc7-hour-end').value,zone=$('bc7-timezone').value.trim();
    if(!warehouse){msg($('bc7-hours-msg'),'Selecciona un almacén.','error');return;}
    if(!start||!end||start>=end||!zone){msg($('bc7-hours-msg'),'Revisa horas (apertura anterior al cierre) y zona IANA.','error');return;}
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{await rpc('bc5_configurar_horario_jornada',{p_almacen_id:warehouse,p_hora_inicio:start,p_hora_fin:end,p_zona_horaria:zone});msg($('bc7-hours-msg'),'Horario guardado.','ok');await loadCalendar();}
    catch(e){msg($('bc7-hours-msg'),'No se guardó el horario: '+e.message,'error');}
    finally{busy(btn,false);}
  }
  async function savePattern(form){
    const warehouse=$('bc7-warehouse')?.value;
    const name=$('bc7-pattern-name').value.trim(),anchor=$('bc7-anchor').value,days=readDayRows();
    if(!warehouse){msg($('bc7-pattern-msg'),'Selecciona un almacén.','error');return;}
    if(!name||!anchor||!days.length){msg($('bc7-pattern-msg'),'Nombre, fecha ancla y días son obligatorios.','error');return;}
    const bad=days.find(x=>x.trabaja&&!x.responsable_id);
    if(bad){msg($('bc7-pattern-msg'),'Cada día laborable necesita un responsable explícito (día '+bad.numero_dia+').','error');return;}
    if(!confirm('Se activará este patrón de trabajo/descanso para el almacén. No se alteran jornadas ya programadas. ¿Confirmas?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{const id=await rpc('bc5_guardar_patron_jornada',{p_almacen_id:warehouse,p_nombre:name,p_fecha_ancla:anchor,p_patron:days});msg($('bc7-pattern-msg'),'Patrón guardado: '+id+'.','ok');state.lastPreview=null;}
    catch(e){msg($('bc7-pattern-msg'),'No se guardó el patrón: '+e.message,'error');}
    finally{busy(btn,false);}
  }
  async function previewPattern(btn){
    const warehouse=$('bc7-warehouse')?.value,start=$('bc7-start-date')?.value,n=Math.max(1,Math.min(31,Number($('bc7-days-count')?.value||7)));
    if(!warehouse||!start){msg($('bc7-create-msg'),'Selecciona almacén e inicio.','error');return;}
    if(!busy(btn,true))return;
    try{
      const rows=arr(await rpc('bc5_previsualizar_jornada',{p_almacen_id:warehouse,p_fecha_inicio:start,p_dias:n}));
      state.lastPreview={start,warehouse,days:n,rows,mode:'pattern'};
      $('bc7-preview').innerHTML=rows.map(r=>'<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(fmtDate(r.fecha))+' · '+esc(r.trabaja?userName(r.responsable_id):'Descanso')+'</strong><p>'+esc(String(r.hora_inicio_prevista).slice(0,5))+'–'+esc(String(r.hora_fin_prevista).slice(0,5))+'</p></div>'+(r.conflicto?'<span class="bc7-pill warn">Conflicto</span>':'<span class="bc7-pill ok">Disponible</span>')+'</div>'+(r.motivo_conflicto?'<p>'+esc(r.motivo_conflicto)+'</p>':'')+'</article>').join('');
      msg($('bc7-create-msg'),rows.some(r=>r.conflicto)?'La vista previa contiene conflictos. Corrígelos antes de crear.':'Vista previa sin conflictos detectados. Aún falta confirmar la creación.','');
    }catch(e){state.lastPreview=null;msg($('bc7-create-msg'),'No se pudo previsualizar. ¿Hay un patrón activo? '+e.message,'error');}
    finally{busy(btn,false);}
  }
  async function createSchedule(btn){
    const warehouse=$('bc7-warehouse')?.value,start=$('bc7-start-date')?.value,n=Math.max(1,Math.min(31,Number($('bc7-days-count')?.value||7)));
    const mode=$('bc7-plan-mode')?.value||'explicit';
    if(!warehouse||!start){msg($('bc7-create-msg'),'Selecciona almacén y fecha inicial.','error');return;}
    let schedule=null;
    if(mode==='explicit'){
      schedule=readDayRows();
      if(schedule.length!==n){buildDayRows();schedule=readDayRows();}
      const missing=schedule.find(x=>x.trabaja&&!x.responsable_id);
      if(missing){msg($('bc7-create-msg'),'Cada día laborable necesita responsable explícito (día '+missing.numero_dia+').','error');return;}
      if(schedule.some(x=>!x.trabaja&&x.responsable_id)){msg($('bc7-create-msg'),'Los días de descanso no pueden tener responsable.','error');return;}
      const dates=schedule.map((r,i)=>addDays(start,i));
      state.lastPreview={start,warehouse,days:n,mode:'explicit',rows:schedule.map((r,i)=>({...r,fecha:dates[i],conflicto:false}))};
      $('bc7-preview').innerHTML=state.lastPreview.rows.map(r=>'<article class="bc7-jornada"><strong>'+esc(fmtDate(r.fecha))+' · '+esc(r.trabaja?userName(r.responsable_id):'Descanso')+'</strong></article>').join('');
    }else{
      if(!state.lastPreview||state.lastPreview.mode!=='pattern'||state.lastPreview.start!==start||state.lastPreview.warehouse!==warehouse||state.lastPreview.days!==n){
        msg($('bc7-create-msg'),'Previsualiza primero el patrón activo para este almacén/rango.','error');return;
      }
      if(state.lastPreview.rows.some(r=>r.conflicto)){msg($('bc7-create-msg'),'Hay conflictos en la vista previa. No se creó ningún dato.','error');return;}
    }
    if(!confirm('Se crearán '+n+' fechas de jornada en '+warehouseName(warehouse)+'. Las fechas ocupadas o los solapamientos serán rechazados por el backend. ¿Confirmas?'))return;
    if(!busy(btn,true))return;
    try{
      const result=await rpc('bc5_crear_jornada_unica',{p_almacen_id:warehouse,p_fecha_inicio:start,p_dias:n,p_programacion:mode==='pattern'?null:schedule,p_observacion:$('bc7-schedule-note')?.value.trim()||null});
      msg($('bc7-create-msg'),'Programación creada. Resultado: '+JSON.stringify(result),'ok');
      state.lastPreview=null;await loadCalendar();
    }catch(e){msg($('bc7-create-msg'),'No se creó la programación: '+e.message,'error');}
    finally{busy(btn,false);}
  }
  async function reschedule(form){
    const id=form.dataset.bc7Reschedule;
    const works=form.querySelector('[data-bc7-rework]').checked;
    const person=form.querySelector('[data-bc7-reperson]').value||null;
    const reason=form.querySelector('[data-bc7-reason]').value.trim();
    const msgEl=form.querySelector('[data-bc7-remsg]');
    if(!reason|| (works&&!person)||(!works&&person)){msg(msgEl,'Motivo obligatorio; jornada laborable requiere responsable y descanso no admite responsable.','error');return;}
    if(!confirm('Se registrará una reprogramación auditada. ¿Confirmas la ausencia, sustitución o descanso?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{await rpc('bc5_reprogramar_jornada',{p_programacion_id:id,p_trabaja:works,p_responsable_id:works?person:null,p_motivo:reason});msg(msgEl,'Reprogramación guardada.','ok');await loadCalendar();}
    catch(e){msg(msgEl,'No se reprogramó: '+e.message,'error');}
    finally{busy(btn,false);}
  }
  function openMovements(){
    const d=state.detail;if(!d)return;
    const warehouse=$('mov-filtro-almacen');if(warehouse)warehouse.value=d.sesion.almacen_id;
    const from=$('mov-filtro-desde');if(from)from.value=String(d.sesion.fecha).slice(0,10);
    const to=$('mov-filtro-hasta');if(to)to.value=String(d.sesion.fecha).slice(0,10);
    navTo('movimientos');
    const refresh=$('mov-refrescar-btn')||$('movimientos-refrescar-btn');
    if(refresh)setTimeout(()=>refresh.click(),150);
  }
  async function boot(){
    ensureStyles();if(!ensureShell())return;
    const today=dateHavana();
    if($('bc7-anchor'))$('bc7-anchor').value=today;
    if($('bc7-start-date'))$('bc7-start-date').value=today;
    if($('bc7-list-from'))$('bc7-list-from').value=today;
    fillWarehouses();buildDayRows();
    try{state.admin=!!(await rpc('bc_actor_is_admin',{}));}
    catch(e){state.admin=false;setStatus('No se verificó el rol: '+e.message,'error');}
    if($('bc7-admin-panel'))$('bc7-admin-panel').hidden=!state.admin;
    const btn=document.querySelector('.tab-btn[data-tab="jornada"]');if(btn&&state.admin)btn.textContent='Jornada e inventario · Admin';
    if(state.admin)setStatus(navigator.onLine?'Acceso administrativo verificado.':'Sin conexión: solo lectura local, no se permiten escrituras.','ok');
    else setStatus(navigator.onLine?'Acceso limitado al calendario propio.':'Sin conexión. Reconnecta para actualizar el calendario.','');
    const role=roleOf(currentUser());
    if(role.includes('dependienta')&&!state.admin){
      document.querySelectorAll('.tab-btn[data-tab="ventas"]').forEach(b=>{b.hidden=true;b.setAttribute('aria-hidden','true');b.title='El flujo ordinario pasa por Jornada e inventario; el historial legado permanece conservado.'});
      const sales=$('tab-ventas');if(sales&&sales.classList.contains('visible'))navTo('jornada');
    }
    if(!users().length)setStatus('Acceso verificado. La lista local de personas aún se está cargando. Una asignación solo queda confirmada cuando la valida el servidor.','');
    if($('bc7-warehouse'))$('bc7-warehouse').addEventListener('change',loadHours);
    // Catalog caches may finish loading just after auth/UI boot. Refresh their labels without changing any user selection.
    const refreshCatalogs=()=>{
      fillWarehouses();
      document.querySelectorAll('#bc7-day-rows [data-bc7-person],#bc7-schedule-list [data-bc7-reperson]').forEach(sel=>{
        const value=sel.value;sel.innerHTML=staffOptions(value);
        if(value)sel.value=value;
      });
    };
    setTimeout(refreshCatalogs,700);setTimeout(refreshCatalogs,1800);
    const listFrom=$('bc7-list-from');if(listFrom)listFrom.addEventListener('change',()=>{state.lastPreview=null;});
    await loadCalendar();
    window.addEventListener('online',()=>setStatus('Conexión restaurada. Actualiza el calendario para leer el estado LIVE.','ok'));
    window.addEventListener('offline',()=>setStatus('Sin conexión: las escrituras quedan bloqueadas.','error'));
  }
  document.addEventListener('click',async function(e){
    const t=e.target&&e.target.closest?e.target.closest('button,[data-bc7-build]'):null;if(!t)return;
    if(t.hasAttribute('data-bc7-build')){buildDayRows();return;}
    if(t.hasAttribute('data-bc7-refresh')){await loadCalendar();return;}
    if(t.hasAttribute('data-bc7-preview')){await previewPattern(t);return;}
    if(t.hasAttribute('data-bc7-create')){await createSchedule(t);return;}
    if(t.hasAttribute('data-bc7-open')){await openWorkspace(t.dataset.bc7Open);return;}
    if(t.hasAttribute('data-bc7-start')){await startSession(t);return;}
    if(t.hasAttribute('data-bc7-mov-refresh')){if(state.detail)await loadMovements(state.detail);return;}
    if(t.hasAttribute('data-bc7-open-movements')){openMovements();return;}
  });
  document.addEventListener('submit',async function(e){
    const f=e.target;if(!(f instanceof HTMLFormElement))return;
    if(f.id==='bc7-hours-form'){e.preventDefault();await saveHours(f);}
    else if(f.id==='bc7-pattern-form'){e.preventDefault();await savePattern(f);}
    else if(f.matches('[data-bc7-reschedule]')){e.preventDefault();await reschedule(f);}
    else if(f.matches('[data-bc7-count-form]')){e.preventDefault();await saveCount(f);}
    else if(f.matches('[data-bc7-close-form]')){e.preventDefault();await closeSession(f);}
    else if(f.matches('[data-bc7-adjust-form]')){e.preventDefault();await submitAdjustment(f);}
  });
  document.addEventListener('change',function(e){
    const t=e.target;
    if(t&&t.matches('[data-bc7-rework]')){const s=t.closest('form')?.querySelector('[data-bc7-reperson]');if(s){s.disabled=!t.checked;if(!t.checked)s.value='';}}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot());else boot();
})();