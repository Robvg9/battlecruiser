// BattleCruiser Step 7 — Jornada única, inventario físico, movimientos y cierre
// v7.9 — catálogo autoritativo de responsables con reintento y bloqueo seguro.
(function bc7JornadaUI(){
  'use strict';
  if(window.__BC7_JORNADA_UI__) return;
  window.__BC7_JORNADA_UI__=true;

  const state={admin:false,rows:[],selected:null,detail:null,loading:false,warehouseId:'',lastPreview:null,workspaceTab:'inventario',staffLoading:false,staffLoaded:false,staffError:''};
  let warehouseLoadPromise=null,staffLoadPromise=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
  const dateHavana=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function addDays(s,n){const d=new Date(String(s||dateHavana())+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(n||0));return d.toISOString().slice(0,10);}
  function fmtDate(v){const s=String(v||'').slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s||'—';}
  function fmtDateHuman(v){const p=String(v||'').slice(0,10).split('-').map(Number);if(p.length!==3||!p[0]||!p[1]||!p[2])return fmtDate(v);return new Intl.DateTimeFormat('es-ES',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(Date.UTC(p[0],p[1]-1,p[2],12)));}
  function qty(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('es-ES',{maximumFractionDigits:3}):'—';}
  function money(v){return typeof window.money==='function'?window.money(Number(v||0)):Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function currentUser(){return window._usuarioActual||window.__bcUser||window.usuarioActual||null;}
  function catalogCache(){
    try{if(typeof _cache!=='undefined'&&_cache)return _cache;}catch(_){}
    return window._cache||null;
  }
  function warehouses(){const cache=catalogCache();return arr(cache&&cache.almacenes).filter(x=>x&&x.activo!==false);}
  function users(){const cache=catalogCache();return arr(cache&&cache.usuarios).filter(x=>x&&x.activo!==false&&!x.archivado);}
  function eligibleStaff(){
    const hub=window.__BC_M29__;
    if(hub&&typeof hub.eligibleStaff==='function'){
      try{const current=arr(hub.eligibleStaff());if(current.length)return current;}catch(_){}
    }
    const source=window.__BC_M29_STAFF_CACHE_LOADED__===true?arr(window.__BC_M29_STAFF_CACHE__):users();
    return source.filter(user=>{
      if(!user||!user.id||user.activo===false||String(user.activo).toLowerCase()==='false'||user.activo===0||user.archivado===true||String(user.archivado).toLowerCase()==='true'||user.archivado===1)return false;
      let role=user.rol||user.nombre_rol||user.role_name||user.role||'';
      if(role&&typeof role==='object')role=role.nombre||role.name||role.rol||role.role_name||'';
      role=String(role||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
      return role.includes('dependienta')||role.startsWith('dueno')||role==='admin'||role==='administrador';
    }).sort((a,b)=>String(a.nombre||a.nombre_usuario||a.email||'').localeCompare(String(b.nombre||b.nombre_usuario||b.email||''),'es'));
  }
  function staffRowsFrom(value){
    if(Array.isArray(value))return value;
    if(!value||typeof value!=='object')return [];
    for(const key of ['usuarios','users','rows','items','data'])if(Array.isArray(value[key]))return value[key];
    return value.id?[value]:[];
  }
  function staffOptions(selected){
    const people=eligibleStaff();
    const placeholder=state.staffLoading?'Cargando responsables…':state.staffError?'Responsables no disponibles':'Selecciona responsable';
    return '<option value="">'+placeholder+'</option>'+people.map(u=>'<option value="'+esc(u.id)+'"'+(String(u.id)===String(selected||'')?' selected':'')+'>'+esc(u.nombre||u.nombre_usuario||u.email||u.id)+'</option>').join('');
  }
  function staffCatalogReady(){return state.staffLoaded&&!state.staffLoading&&eligibleStaff().length>0;}
  function staffFeedback(){
    const status=$('bc7-staff-status'),retry=$('bc7-staff-retry'),people=eligibleStaff();
    if(status){
      if(state.staffLoading)status.textContent='Consultando responsables activos en el servidor…';
      else if(state.staffError)status.textContent=friendlyError(state.staffError,'staff');
      else if(people.length)status.textContent=people.length+' responsables activos disponibles.';
      else status.textContent='No hay responsables activos elegibles. Actualiza el catálogo para continuar.';
      status.className='bc7-msg '+(state.staffError?'error':people.length&&!state.staffLoading?'ok':'');
    }
    if(retry)retry.hidden=state.staffLoading||(!state.staffError&&people.length>0);
  }
  function refreshResponsibleSelectors(){
    const people=eligibleStaff();
    document.querySelectorAll('#bc7-day-rows [data-bc7-person],#bc7-schedule-list [data-bc7-reperson]').forEach(sel=>{
      const previous=sel.value;
      sel.innerHTML=staffOptions(previous);
      if(previous&&people.some(user=>String(user.id)===String(previous)))sel.value=previous;
      const row=sel.closest('.bc7-day-row,form');
      const works=sel.matches('[data-bc7-person]')?row?.querySelector('[data-bc7-works]')?.checked!==false:row?.querySelector('[data-bc7-rework]')?.checked!==false;
      sel.disabled=!works||state.staffLoading||!state.staffLoaded||!people.length;
    });
    staffFeedback();
  }
  async function ensureResponsibleCatalog(forceRefresh){
    const current=eligibleStaff();
    if(current.length&&!forceRefresh){state.staffLoaded=true;state.staffError='';refreshResponsibleSelectors();return current;}
    if(staffLoadPromise)return staffLoadPromise;
    if(!navigator.onLine){
      const error=new Error('Conecta el dispositivo para consultar la lista de responsables.');
      state.staffLoaded=false;state.staffError=error.message;refreshResponsibleSelectors();throw error;
    }
    state.staffLoading=true;state.staffError='';refreshResponsibleSelectors();
    staffLoadPromise=(async()=>{
      const hub=window.__BC_M29__;
      if(hub&&typeof hub.loadResponsibleStaff==='function'){
        await hub.loadResponsibleStaff(!!forceRefresh);
      }else{
        const response=await rpc('listar_usuarios_admin',{p_incluir_archivados:false});
        const rows=staffRowsFrom(response);
        window.__BC_M29_STAFF_CACHE__=rows;
        window.__BC_M29_STAFF_CACHE_LOADED__=true;
        window._cache=window._cache||{};
        window._cache.usuarios=rows;
      }
      const people=eligibleStaff();
      if(!people.length)throw new Error('El servidor respondió, pero no devolvió responsables activos con rol Dependienta o Dueño.');
      state.staffLoaded=true;state.staffError='';
      return people;
    })().catch(error=>{
      state.staffLoaded=false;
      state.staffError=String(error&&error.message||error||'');
      throw error;
    }).finally(()=>{
      state.staffLoading=false;staffLoadPromise=null;refreshResponsibleSelectors();
    });
    return staffLoadPromise;
  }
  function warehouseName(id){const w=warehouses().find(x=>String(x.id)===String(id));return w?w.nombre:('Almacén '+String(id||'').slice(0,8));}
  function userName(id){const u=users().find(x=>String(x.id)===String(id));return u?(u.nombre||u.nombre_usuario||u.email||'Responsable'):String(id||'Sin asignar');}
  function roleOf(u){return String(u&&(u.rol||u.role_name||u.nombre_rol||u.role)||'').toLowerCase();}
  function friendlyError(error,context){
    const raw=String(error&&error.message||error||'').trim();
    const value=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const code=String(error&&error.code||'').toUpperCase();
    let message='';
    if(/retroactiv|fecha.*(pasad|anterior)|no se admiten jornadas retroactivas|no se admiten programaciones retroactivas/.test(value)) message='La fecha de inicio ya pasó. Elige hoy o una fecha futura.';
    else if(/no hay patron activo|no existe patron activo|patron activo/.test(value)) message='Todavía no hay una rotación guardada para este almacén. Guarda una rotación o elige «Elegir responsables día por día».';
    else if(/ya existe programacion|programacion para el almacen|programacion.*fecha|fecha.*ya existe/.test(value)) message='Ya hay una jornada programada para una o más de esas fechas en este almacén. Revisa el calendario y elige fechas libres.';
    else if(/asignacion legacy|otra jornada programada|otro turno pendiente|ya tiene otra jornada/.test(value)) message='La persona elegida ya tiene otro turno pendiente en esa fecha. Elige otra persona o revisa ese turno.';
    else if(/turno activo para este almacen|hay un turno activo|turno activo o duplicado/.test(value)) message='Este almacén ya tiene un turno abierto o pendiente. Revisa ese turno antes de crear otra programación.';
    else if(/responsable.*(no esta activo|no elegible|rol elegible)|no esta activo o no tiene rol/.test(value)) message='Uno de los responsables ya no está disponible para trabajar. Actualiza la lista y vuelve a seleccionarlo.';
    else if(/configuracion de jornada no encontrada|falta.*horario/.test(value)) message='Todavía no está configurado el horario de este almacén. Guarda primero la hora de apertura y de cierre.';
    else if(/almacen inexistente|almacen.*inactivo|warehouse.*not found/.test(value)) message='El almacén seleccionado ya no está disponible. Actualiza la lista de almacenes y vuelve a intentarlo.';
    else if(code==='42501'||/solo admin|permiso|not authorized|permission denied|no autorizado/.test(value)) message='Tu cuenta no tiene permiso para hacer este cambio. Pide al administrador que revise tu acceso.';
    else if(code==='23505') message='Hay una jornada o asignación que se repite. Revisa las fechas y los responsables antes de volver a intentarlo.';
    else if(code==='22023'||/rango.*invalido|patron incompleto|entrada invalida|debe tener una entrada/.test(value)) message='Hay algún dato de la programación que debemos corregir. Revisa las fechas, la duración y que cada día de trabajo tenga una persona asignada.';
    else if(code==='23514'||/no puede|no se puede|conflicto/.test(value)) message='La programación no cumple una regla de trabajo. Revisa los días de descanso, los responsables y las fechas repetidas.';
    else if(/offline|sin conexion|failed to fetch|network|timeout|fetch failed|load failed|cliente supabase no disponible/.test(value)) message='No se pudo conectar con el servicio. Comprueba internet y vuelve a intentarlo.';
    else if(code==='P0002') message='No encontramos la configuración o la programación que necesitas. Revisa el almacén y vuelve a cargar la sección.';
    else if(context==='staff') message='No se pudo cargar la lista de responsables. Comprueba la conexión y pulsa «Reintentar carga de responsables».';
    else if(context==='preview') message='No se pudo revisar la programación. Comprueba que hayas guardado una rotación para este almacén o elige la asignación día por día.';
    else if(context==='create') message='No se pudo crear la programación. Revisa las fechas, el almacén y las personas asignadas; no se confirmó ningún cambio.';
    else if(context==='pattern') message='No se pudo guardar la rotación. Comprueba el almacén, la fecha y que cada día de trabajo tenga una persona asignada.';
    else if(context==='calendar') message='No se pudo cargar el calendario. Comprueba la conexión y vuelve a actualizarlo.';
    else if(context==='hours') message='No se pudo guardar el horario. Comprueba que la hora de apertura sea anterior a la de cierre.';
    else if(context==='warehouse') message='No se pudieron cargar los almacenes. Comprueba la conexión y pulsa «Reintentar carga de almacenes».';
    else message='No se pudo completar esta acción. Revisa los datos y la conexión; vuelve a intentarlo.';
    try{console.warn('[BC7] '+String(context||'operacion')+':',error);}catch(_){}
    return message;
  }
  function humanStatus(value){
    const key=String(value||'').toUpperCase();
    const labels={PROGRAMADO:'Programado',PROGRAMADA:'Programada',PENDIENTE:'Pendiente',EN_CURSO:'En curso',COMPLETADA:'Completada',CERRADA:'Cerrada',CERRADO:'Cerrado',CANCELADA:'Cancelada',CANCELADO:'Cancelado',DESCANSO:'Descanso',ABIERTO:'Abierto',APROBADO:'Aprobado',RECHAZADO:'Rechazado'};
    return labels[key]||'En revisión';
  }
  function friendlyTimezone(value){
    const zone=String(value||'America/Havana').trim();
    const known={'America/Havana':'Hora de Cuba (La Habana)','America/Puerto_Rico':'Hora de Puerto Rico','America/New_York':'Hora del Este','America/Chicago':'Hora central','America/Denver':'Hora de la montaña','America/Los_Angeles':'Hora del Pacífico','Europe/Madrid':'Hora de España (Madrid)'};
    if(known[zone])return known[zone];
    try{const parts=new Intl.DateTimeFormat('es-ES',{timeZone:zone,timeZoneName:'long'}).formatToParts(new Date());const name=parts.find(x=>x.type==='timeZoneName')?.value;return name?'Hora local: '+name:'Hora local configurada';}catch(_){return 'Hora local configurada';}
  }
  function setTimezoneLabel(value){const label=$('bc7-timezone-label');if(label)label.textContent=friendlyTimezone(value);}
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
    if(!$('bc7-compact-style')){const c=document.createElement('style');c.id='bc7-compact-style';c.textContent="#tab-jornada{max-width:1320px!important;padding-bottom:12px!important}\n#tab-jornada .bc7-hero{align-items:center!important;margin:0 0 7px!important;padding:3px 0 7px!important}\n#tab-jornada .bc7-hero h2{font-family:Inter,sans-serif!important;font-size:20px!important;font-weight:700!important}\n#tab-jornada .bc7-hero p{display:none!important}\n#tab-jornada .bc7-status{font-size:10px!important;min-height:0!important;max-width:none!important}\n#tab-jornada .bc7-card{padding:8px!important;margin:6px 0!important;border-radius:8px!important}\n#tab-jornada .bc7-card h3{font-size:13px!important;margin:0 0 5px!important}\n#tab-jornada .bc7-card h4{font-size:12px!important;margin:7px 0 5px!important}\n#tab-jornada .bc7-muted{font-size:10px!important;line-height:1.3!important}\n#tab-jornada .bc7-field{font-size:10px!important;gap:3px!important;margin:4px 0!important}\n#tab-jornada .bc7-field input,#tab-jornada .bc7-field select,#tab-jornada .bc7-field textarea{height:34px!important;min-height:34px!important;padding:6px 8px!important;font-size:11px!important}\n#tab-jornada .bc7-btn{min-height:34px!important;padding:6px 10px!important;font-size:10px!important;border-radius:6px!important}\n#tab-jornada .bc7-actions{gap:5px!important;margin-top:6px!important}\n#tab-jornada .bc7-jornada{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px;padding:7px!important}\n#tab-jornada .bc7-jornada-top{display:contents!important}\n#tab-jornada .bc7-jornada strong{font-size:11px!important;line-height:1.2}\n#tab-jornada .bc7-jornada p{font-size:10px!important;margin:2px 0 0!important}\n#tab-jornada .bc7-jornada .bc7-actions{margin:0!important;grid-column:3}\n#tab-jornada .bc7-jornada .bc7-btn{white-space:nowrap;min-height:30px!important;padding:5px 8px!important}\n#tab-jornada .bc7-help,#tab-jornada .bc7-admin-details{margin:4px 0!important;padding:6px 8px;border:1px solid var(--gold-dim);border-radius:7px;background:rgba(255,255,255,.02)}\n#tab-jornada .bc7-help summary,#tab-jornada .bc7-admin-details>summary{font-size:10px!important;font-weight:600;color:var(--gold);cursor:pointer;list-style:none}\n#tab-jornada .bc7-admin-details[hidden],#tab-jornada [hidden]{display:none!important}\n#tab-jornada .bc7-calendar-controls{display:grid;grid-template-columns:minmax(0,1fr) 68px auto;gap:6px;align-items:end}\n#tab-jornada .bc7-calendar-controls .bc7-field{margin:0!important}\n#tab-jornada .bc7-workspace-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}\n#tab-jornada .bc7-workspace-title-wrap{min-width:0;display:flex;align-items:center;gap:8px}\n#tab-jornada .bc7-workspace-head h3{font-size:14px!important;margin:0!important}\n#tab-jornada .bc7-back{min-height:30px!important;padding:5px 8px!important;white-space:nowrap}\n#tab-jornada .bc7-workspace-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:4px 0 8px}\n#tab-jornada .bc7-overview-item{min-width:0;padding:6px 7px;border:1px solid var(--gold-dim);border-radius:6px;background:rgba(255,255,255,.025)}\n#tab-jornada .bc7-overview-item small{display:block;font-size:9px;color:var(--mist);line-height:1.1}\n#tab-jornada .bc7-overview-item b{display:block;font-size:11px;margin-top:3px;overflow-wrap:anywhere}\n#tab-jornada .bc7-workspace-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:6px 0 8px;padding:3px;background:rgba(0,0,0,.18);border:1px solid var(--gold-dim);border-radius:7px}\n#tab-jornada .bc7-workspace-tab{min-width:0;min-height:32px;padding:5px 3px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--mist);font-size:10px;font-weight:600;cursor:pointer}\n#tab-jornada .bc7-workspace-tab[aria-selected=true]{color:var(--text);background:rgba(201,162,77,.16);border-color:var(--gold-dim)}\n#tab-jornada .bc7-workspace-panel[hidden]{display:none!important}\n#tab-jornada .bc7-panel-stack{display:grid;gap:6px}\n#tab-jornada .bc7-detail{border:1px solid var(--gold-dim);border-radius:7px;background:rgba(255,255,255,.018);padding:0 8px}\n#tab-jornada .bc7-detail>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;cursor:pointer;list-style:none;font-size:11px;font-weight:600}\n#tab-jornada .bc7-detail>summary small{font-size:9px;color:var(--mist);font-weight:500}\n#tab-jornada .bc7-detail-body{padding:0 0 7px;min-width:0}\n#tab-jornada .bc7-note{padding:7px!important;font-size:10px!important;line-height:1.3!important}\n#tab-jornada .bc7-table{font-size:10px!important}\n#tab-jornada .bc7-table th,#tab-jornada .bc7-table td{padding:5px!important}\n#tab-jornada .bc7-table input{width:76px!important;padding:5px!important;font-size:11px!important}\n@media(max-width:650px){#tab-jornada .bc7-calendar-controls{grid-template-columns:minmax(0,1fr) 60px auto}#tab-jornada .bc7-jornada{grid-template-columns:minmax(0,1fr) auto;gap:5px}#tab-jornada .bc7-jornada .bc7-actions{grid-column:2;grid-row:2}#tab-jornada .bc7-workspace-overview{grid-template-columns:repeat(3,minmax(0,1fr))}#tab-jornada .bc7-overview-item{padding:5px}#tab-jornada .bc7-overview-item b{font-size:10px}#tab-jornada .bc7-workspace-tab{font-size:9px;min-height:30px}#tab-jornada .bc7-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#tab-jornada .bc7-day-row{grid-template-columns:minmax(70px,.8fr) minmax(80px,1fr) minmax(100px,1.4fr)}#tab-jornada .bc7-day-row label{margin:0!important}}\n@media(max-width:390px){#tab-jornada .bc7-workspace-overview{grid-template-columns:repeat(2,minmax(0,1fr))}}";document.head.appendChild(c);}
  }
  function ensureDayRowsStyles(){
    if($('bc7-day-layout-style'))return;
    const style=document.createElement('style');style.id='bc7-day-layout-style';
    style.textContent='#tab-jornada .bc7-day-row{grid-template-columns:minmax(0,1.5fr) minmax(115px,.65fr) minmax(180px,1fr)!important;gap:10px!important;align-items:center!important;padding:11px!important}#tab-jornada .bc7-day-main{display:flex;flex-direction:column;gap:4px;min-width:0}#tab-jornada .bc7-day-main strong{font-size:13px;line-height:1.25;color:var(--text)}#tab-jornada .bc7-day-date{display:block;font-size:12px;line-height:1.4;white-space:normal;overflow-wrap:anywhere;color:var(--mist)}#tab-jornada .bc7-day-person{min-width:0;margin:0!important}#tab-jornada .bc7-day-person select{box-sizing:border-box;width:100%;min-width:0;min-height:38px;padding:8px}#tab-jornada .bc7-day-row .bc7-check{box-sizing:border-box;display:flex;align-items:center;gap:8px;min-height:38px;padding:8px;border:1px solid var(--gold-dim);border-radius:6px;white-space:nowrap}#tab-jornada .bc7-day-row .bc7-check input{flex:0 0 auto}@media(max-width:650px){#tab-jornada .bc7-day-row{grid-template-columns:minmax(0,1fr)!important;gap:7px!important;padding:10px!important}#tab-jornada .bc7-day-main{padding-bottom:2px}#tab-jornada .bc7-day-date{font-size:12px}#tab-jornada .bc7-day-person{width:100%}#tab-jornada .bc7-day-row .bc7-check{width:100%;justify-content:flex-start}}';
    document.head.appendChild(style);
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
      '<header class="bc7-hero"><div><h2>Jornada e inventario</h2></div><div id="bc7-status" class="bc7-status">Comprobando acceso…</div></header>'+
      '<details id="bc7-help-details" class="bc7-help"><summary>¿Para qué sirve esta sección? · Guía rápida</summary><div class="bc7-purpose"><p class="bc7-muted">Aquí organizas quién trabaja cada día. Después, cada responsable abre su jornada, cuenta el inventario físico inicial y final para saber con qué existencias empieza y termina, y registra su actividad.</p><ol class="bc7-muted"><li>Abre la jornada asignada.</li><li>Confirma el inventario inicial con conteo físico.</li><li>Registra las operaciones en sus secciones habituales.</li><li>Al terminar, confirma inventario final y dinero declarado para solicitar el cierre.</li></ol><p class="bc7-muted">Aquí aparecen las operaciones que se pueden relacionar con esta jornada. Esta sección no es el historial general de movimientos; para consultar todos los movimientos, entra en Movimientos → Historial.</p></div></details>'+
      '<details id="bc7-admin-details" class="bc7-admin-details" hidden><summary>Organizar jornadas · Administrador</summary><section id="bc7-admin-panel" class="bc7-card">'+
       '<h3>Crear y organizar jornadas</h3><p class="bc7-muted">Elige el almacén, la fecha y quién trabaja cada día. Puedes asignar las personas una por una o repetir una rotación que hayas guardado.</p>'+
       '<div class="bc7-grid"><div><label class="bc7-field">Almacén<select id="bc7-warehouse"></select></label><p class="bc7-msg" id="bc7-warehouse-msg" role="status" aria-live="polite"></p><button class="bc7-btn" type="button" id="bc7-warehouse-retry" hidden>Reintentar carga de almacenes</button></div><label class="bc7-field">¿Cómo quieres organizar los días?<select id="bc7-plan-mode"><option value="explicit">Elegir responsables día por día</option><option value="pattern">Repetir una rotación guardada</option></select></label></div>'+
       '<form id="bc7-hours-form"><h4>Horario operativo</h4><div class="bc7-grid"><label class="bc7-field">Apertura<input type="time" id="bc7-hour-start" value="07:00" required></label><label class="bc7-field">Cierre<input type="time" id="bc7-hour-end" value="23:00" required></label></div><label class="bc7-field">Hora local del almacén<input type="hidden" id="bc7-timezone" value="America/Havana"><span id="bc7-timezone-label" class="bc7-muted">Hora de Cuba (La Habana)</span></label><button class="bc7-btn" type="submit">Guardar horario</button><p class="bc7-msg" id="bc7-hours-msg"></p></form>'+
       '<form id="bc7-pattern-form"><h4>Guardar una rotación de trabajo</h4><div class="bc7-grid"><label class="bc7-field">Nombre de la rotación<input id="bc7-pattern-name" maxlength="100" placeholder="Ej. 5 días trabajando y 2 descansando" required></label><label class="bc7-field">Fecha desde la que se repite la rotación<input id="bc7-anchor" type="date" required></label><label class="bc7-field">Duración de la rotación (días)<input id="bc7-days-count" type="number" min="1" max="31" value="7" required></label><label class="bc7-field">Primera fecha que quieres programar<input id="bc7-start-date" type="date" required></label></div><div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-build>Mostrar días</button><button class="bc7-btn" type="submit">Guardar rotación</button></div><p class="bc7-msg" id="bc7-staff-status" role="status" aria-live="polite">Cargando responsables activos…</p><button class="bc7-btn" type="button" id="bc7-staff-retry" hidden>Reintentar carga de responsables</button><div id="bc7-day-rows" class="bc7-day-rows"></div><p class="bc7-msg" id="bc7-pattern-msg"></p></form>'+
       '<div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-preview>Revisar fechas</button><button class="bc7-btn primary" type="button" data-bc7-create>Crear programación</button></div><label class="bc7-field">Nota (opcional)<input id="bc7-schedule-note" maxlength="1000" placeholder="Motivo administrativo o nota"></label><div id="bc7-preview" class="bc7-list"></div><p class="bc7-msg" id="bc7-create-msg"></p>'+
      '</section></details>'+
      '<section class="bc7-card" id="bc7-calendar-section"><div class="bc7-workspace-head"><h3>Calendario</h3><span class="bc7-muted">Jornadas asignadas</span></div><div class="bc7-calendar-controls"><label class="bc7-field">Desde<input type="date" id="bc7-list-from"></label><label class="bc7-field">Días<input type="number" id="bc7-list-days" min="1" max="31" value="14"></label><button class="bc7-btn" type="button" data-bc7-refresh>Actualizar calendario</button></div><div id="bc7-schedule-list" class="bc7-list"><div class="bc7-empty">Cargando calendario…</div></div><p class="bc7-msg" id="bc7-list-msg"></p></section>'+
      '<section id="bc7-workspace" class="bc7-card" hidden><div class="bc7-workspace-head"><div class="bc7-workspace-title-wrap"><button type="button" class="bc7-btn bc7-back" data-bc7-back-calendar>← Calendario</button><h3 id="bc7-workspace-title">Jornada</h3></div></div><div id="bc7-workspace-body"></div></section>'+
      '</div>';
    return tab;
  }
  function setPageMode(workspace){
    const help=$('bc7-help-details'),admin=$('bc7-admin-details'),calendar=$('bc7-calendar-section'),panel=$('bc7-workspace');
    if(help)help.hidden=!!workspace;
    if(admin)admin.hidden=!!workspace||!state.admin;
    if(calendar)calendar.hidden=!!workspace;
    if(panel)panel.hidden=!workspace;
  }
  function returnToCalendar(){
    setPageMode(false);
    const calendar=$('bc7-calendar-section');
    if(calendar)calendar.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function activateWorkspaceTab(name){
    const allowed=['inventario','operacion','finanzas','movimientos'];
    const tab=allowed.includes(name)?name:'inventario';
    state.workspaceTab=tab;
    const body=$('bc7-workspace-body');if(!body)return;
    body.querySelectorAll('[data-bc7-workspace-tab]').forEach(button=>{
      const active=button.getAttribute('data-bc7-workspace-tab')===tab;
      button.setAttribute('aria-selected',active?'true':'false');
      button.classList.toggle('active',active);
    });
    body.querySelectorAll('[data-bc7-workspace-panel]').forEach(panel=>{panel.hidden=panel.getAttribute('data-bc7-workspace-panel')!==tab;});
    if(tab==='finanzas'&&state.detail)loadFinances(state.detail);
    if(tab==='movimientos'&&state.detail)loadMovements(state.detail);
  }
  function fillWarehouses(){
    const sel=$('bc7-warehouse');if(!sel)return;
    const prev=sel.value;
    const list=warehouses();
    sel.innerHTML='<option value="">'+(list.length?'Selecciona un almacén':'No hay almacenes cargados')+'</option>'+list.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.nombre)+'</option>').join('');
    if(list.some(w=>String(w.id)===prev))sel.value=prev;
    sel.disabled=list.length===0;
  }
  function setWarehouseMessage(text,kind){
    const el=$('bc7-warehouse-msg');
    if(!el)return;
    el.textContent=text||'';
    el.className='bc7-msg '+(kind||'');
    const retry=$('bc7-warehouse-retry');
    if(retry)retry.hidden=!(text&&kind==='error')&&!(/No se encontraron almacenes activos/i.test(text||''));
  }
  function mergeWarehouseRows(rows){
    const cache=catalogCache();
    if(!Array.isArray(rows)||!rows.length||!cache)return;
    if(!Array.isArray(cache.almacenes))cache.almacenes=[];
    const byId=new Map();
    cache.almacenes.forEach(w=>{if(w&&w.id!=null)byId.set(String(w.id),w);});
    rows.forEach(w=>{
      if(!w||w.id==null)return;
      const id=String(w.id);
      const active=w.activo!==false;
      const old=byId.get(id);
      if(old){
        if(w.nombre!=null)old.nombre=w.nombre;
        if(w.tipo!=null)old.tipo=w.tipo;
        old.activo=active;
      }else if(active){
        const item={id:w.id,nombre:w.nombre||id,tipo:w.tipo||null,activo:true};
        cache.almacenes.push(item);byId.set(id,item);
      }
    });
  }
  async function ensureWarehouseCatalog(){
    fillWarehouses();
    if(warehouses().length){setWarehouseMessage('');return warehouses();}
    if(!navigator.onLine){
      setWarehouseMessage('Sin conexión. Reconecta para cargar los almacenes y vuelve a intentarlo.','error');
      return [];
    }
    if(warehouseLoadPromise)return warehouseLoadPromise;
    const sel=$('bc7-warehouse');
    const retry=$('bc7-warehouse-retry');
    if(sel){sel.disabled=true;sel.innerHTML='<option value="">Cargando almacenes…</option>';}
    if(retry)retry.hidden=true;
    setWarehouseMessage('Cargando los almacenes disponibles…');
    warehouseLoadPromise=(async()=>{
      try{
        let rows=[];
        if(typeof window.asegurarAlmacenesParaTurnos==='function'){
          try{rows=arr(await window.asegurarAlmacenesParaTurnos());}catch(_){}
        }
        if(!warehouses().length&&!rows.length){
          rows=arr(await rpc('listar_almacenes_para_turnos',{}));
        }
        mergeWarehouseRows(rows);
        fillWarehouses();
        const list=warehouses();
        if(!list.length){
          setWarehouseMessage('No se encontraron almacenes activos para este usuario. Comprueba los permisos o vuelve a intentar.','');
          if(retry)retry.hidden=false;
        }else{
          setWarehouseMessage('');
          if(retry)retry.hidden=true;
        }
        return list;
      }catch(e){
        fillWarehouses();
        setWarehouseMessage(friendlyError(e,'warehouse'),'error');
        if(retry)retry.hidden=false;
        return warehouses();
      }finally{
        warehouseLoadPromise=null;
        fillWarehouses();
      }
    })();
    return warehouseLoadPromise;
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
      return '<div class="bc7-day-row" role="group" aria-label="Día '+(i+1)+'"><div class="bc7-day-main"><strong>Día '+(i+1)+'</strong><span class="bc7-day-date">'+esc(fmtDateHuman(addDays(anchor,i)))+'</span></div><label class="bc7-check"><input type="checkbox" data-bc7-works '+(d.trabaja?'checked':'')+'><span>Trabaja</span></label><label class="bc7-field bc7-day-person"><span>Responsable</span><select data-bc7-person '+(!d.trabaja||state.staffLoading||!state.staffLoaded||!eligibleStaff().length?'disabled':'')+'>'+staffOptions(d.responsable_id)+'</select></label></div>';
    }).join('');
    host.querySelectorAll('[data-bc7-works]').forEach(ch=>ch.addEventListener('change',()=>{const row=ch.closest('.bc7-day-row');const person=row&&row.querySelector('[data-bc7-person]');if(person){person.disabled=!ch.checked||state.staffLoading||!state.staffLoaded||!eligibleStaff().length;if(!ch.checked)person.value='';}}));
    state.lastPreview=null;
    if($('bc7-preview'))$('bc7-preview').innerHTML='';
  }
  async function loadHours(){
    const warehouseId=$('bc7-warehouse')?.value;if(!warehouseId)return;
    try{const d=await rpc('bc5_obtener_configuracion_jornada',{p_almacen_id:warehouseId});if(d){$('bc7-hour-start').value=String(d.hora_inicio||'07:00').slice(0,5);$('bc7-hour-end').value=String(d.hora_fin||'23:00').slice(0,5);$('bc7-timezone').value=d.zona_horaria||'America/Havana';setTimezoneLabel($('bc7-timezone').value);}}catch(e){msg($('bc7-hours-msg'),friendlyError(e,'hours'),'error');}
  }
  function rowHtml(r){
    const status=String(r.sesion_estado||r.estado||'—').toUpperCase();
    const rest=!r.trabaja||r.estado==='DESCANSO';
    const pill=rest?'<span class="bc7-pill">Descanso</span>':status==='COMPLETADA'?'<span class="bc7-pill ok">Cerrada</span>':status==='EN_CURSO'?'<span class="bc7-pill ok">En curso</span>':status==='PROGRAMADA'||status==='PENDIENTE'?'<span class="bc7-pill warn">Programada</span>':'<span class="bc7-pill">'+esc(humanStatus(status))+'</span>';
    const action=(!rest&&r.sesion_id)?'<button class="bc7-btn primary" type="button" data-bc7-open="'+esc(r.sesion_id)+'">Gestionar jornada</button>':'';
    let reschedule='';
    if(state.admin){
      reschedule='<details class="bc7-reschedule"><summary>Reprogramar responsable / descanso</summary><form data-bc7-reschedule="'+esc(r.id)+'" data-bc7-session="'+esc(r.sesion_id||'')+'"><label class="bc7-check"><input type="checkbox" data-bc7-rework '+(!rest?'checked':'')+'> Jornada laborable</label><label class="bc7-field">Responsable<select data-bc7-reperson '+(rest||state.staffLoading||!state.staffLoaded||!eligibleStaff().length?'disabled':'')+'>'+staffOptions(r.responsable_id)+'</select></label><label class="bc7-field">Motivo obligatorio<input data-bc7-reason maxlength="1000" required placeholder="Ausencia, sustitución o corrección"></label><button class="bc7-btn" type="submit">Guardar reprogramación</button><p class="bc7-msg" data-bc7-remsg></p></form></details>';
    }
    return '<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(fmtDate(r.fecha))+' · '+esc(warehouseName(r.almacen_id))+'</strong><p>'+esc(r.trabaja?userName(r.responsable_id):'Descanso')+'</p></div>'+pill+'</div><div class="bc7-actions">'+action+'</div>'+reschedule+'</article>';
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
    }catch(e){host.innerHTML='<div class="bc7-empty">No se pudo consultar el calendario.</div>';msg($('bc7-list-msg'),friendlyError(e,'calendar'),'error');}
  }
  function financeFormHtml(detail,isAssigned,status){
    const sessionId=detail.sesion.id;
    const products=arr(detail.productos);
    const showExpenses=state.admin||can('gastos','ver');
    const showReinvestments=state.admin||can('reinversiones','ver');
    const createExpenses=isAssigned&&status==='EN_CURSO'&&!!detail.tramo_activo&&can('gastos','crear');
    const createReinvestments=isAssigned&&status==='EN_CURSO'&&!!detail.tramo_activo&&can('reinversiones','crear');
    if(!showExpenses&&!showReinvestments&&!createExpenses&&!createReinvestments)return '';
    let html='<section class="bc7-card" id="bc7-finance-section"><h4>Finanzas de esta jornada</h4><p class="bc7-muted">Cada operación queda vinculada a esta jornada, al responsable y al tramo activo. Los gastos siguen pendientes de aprobación; una reinversión usa el registro de inventario/FIFO y caja existente.</p>';
    if(showExpenses)html+='<div id="bc7-expenses-list"><div class="bc7-empty">Consultando gastos…</div></div>';
    else if(createExpenses)html+='<p class="bc7-muted">Puedes registrar un gasto. Para consultar su estado posterior se necesita el permiso gastos.ver.</p>';
    if(showReinvestments)html+='<div id="bc7-reinvestments-list"><div class="bc7-empty">Consultando reinversiones…</div></div>';
    else if(createReinvestments)html+='<p class="bc7-muted">Puedes registrar una reinversión. Para consultar su historial se necesita el permiso reinversiones.ver.</p>';
    if(createExpenses){
      html+='<form data-bc7-finance-form="gasto" data-bc7-finance-session="'+esc(sessionId)+'"><h4>Registrar gasto</h4>'+
        '<input type="hidden" data-bc7-op-key value="">'+
        '<label class="bc7-field">Concepto<input data-bc7-expense-concept maxlength="160" required placeholder="Motivo del gasto"></label>'+
        '<label class="bc7-field">Monto<input data-bc7-expense-amount type="number" min="0.01" step="0.01" required inputmode="decimal" placeholder="0.00"></label>'+
        '<label class="bc7-field">Descripción (opcional)<input data-bc7-expense-description maxlength="1000" placeholder="Detalle o referencia"></label>'+
        '<div class="bc7-actions"><button class="bc7-btn" type="submit">Enviar gasto a aprobación</button></div><p class="bc7-msg" data-bc7-finance-msg></p></form>';
    }
    if(createReinvestments){
      const options='<option value="">Selecciona producto</option>'+products.map(p=>'<option value="'+esc(p.producto_id)+'">'+esc(p.nombre)+' · stock '+esc(qty(p.stock_actual))+'</option>').join('');
      html+='<form data-bc7-finance-form="reinversion" data-bc7-finance-session="'+esc(sessionId)+'"><h4>Registrar reinversión</h4>'+
        '<input type="hidden" data-bc7-op-key value="">'+
        '<label class="bc7-field">Producto<select data-bc7-reinvestment-product required>'+options+'</select></label>'+
        '<div class="bc7-grid"><label class="bc7-field">Cantidad (unidad base)<input data-bc7-reinvestment-quantity type="number" min="0.001" step="0.001" required inputmode="decimal"></label>'+
        '<label class="bc7-field">Costo total<input data-bc7-reinvestment-cost type="number" min="0.01" step="0.01" required inputmode="decimal"></label></div>'+
        '<label class="bc7-field">Proveedor (opcional)<input data-bc7-reinvestment-provider maxlength="180"></label>'+
        '<div class="bc7-actions"><button class="bc7-btn" type="submit">Registrar reinversión</button></div><p class="bc7-msg" data-bc7-finance-msg></p></form>';
    }
    return html+'</section>';
  }
  function renderFinanceList(host,rows,type){
    if(!host)return;
    if(!rows.length){
      host.innerHTML='<div class="bc7-empty">No hay '+(type==='gastos'?'gastos':'reinversiones')+' vinculadas a esta jornada.</div>';
      return;
    }
    if(type==='gastos'){
      host.innerHTML='<h4>Gastos</h4><div class="bc7-list">'+rows.map(g=>
        '<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(g.concepto||'Gasto')+' · '+esc(money(g.monto))+'</strong><p>'+esc(fmtDate(g.creado_en))+' · '+esc(g.creado_nombre||'Responsable')+'</p></div><span class="bc7-pill '+(g.estado==='APROBADO'?'ok':g.estado==='RECHAZADO'?'warn':'')+'">'+esc(g.estado||'PENDIENTE')+'</span></div>'+
        (g.descripcion?'<p>'+esc(g.descripcion)+'</p>':'')+
        (g.comentario_revision?'<p class="bc7-muted">Revisión: '+esc(g.comentario_revision)+'</p>':'')+'</article>'
      ).join('')+'</div>';
    }else{
      host.innerHTML='<h4>Reinversiones</h4><div class="bc7-list">'+rows.map(r=>
        '<article class="bc7-jornada"><strong>'+esc(r.proveedor||'Reinversión')+' · '+esc(money(r.total))+'</strong><p>'+esc(fmtDate(r.fecha))+' · '+esc(r.usuario_nombre||'Responsable')+'</p>'+
        '<div class="bc7-muted">'+arr(r.lineas).map(l=>esc(l.producto||l.producto_id)+' · '+esc(qty(l.cantidad_base))+' · '+esc(money(l.costo_total))).join('<br>')+'</div></article>'
      ).join('')+'</div>';
    }
  }
  async function loadFinances(detail){
    const hasExpenses=state.admin||can('gastos','ver');
    const hasReinvestments=state.admin||can('reinversiones','ver');
    if(!hasExpenses&&!hasReinvestments)return true;
    try{
      const data=await rpc('bc7_finanzas_jornada',{p_turno_sesion_id:detail.sesion.id})||{};
      if(hasExpenses)renderFinanceList($('bc7-expenses-list'),arr(data.gastos),'gastos');
      if(hasReinvestments)renderFinanceList($('bc7-reinvestments-list'),arr(data.reinversiones),'reinversiones');
      return true;
    }catch(e){
      const text=friendlyError(e,'calendar')+' No se han modificado datos.';
      if($('bc7-expenses-list'))msg($('bc7-expenses-list'),text,'error');
      if($('bc7-reinvestments-list'))msg($('bc7-reinvestments-list'),text,'error');
      return false;
    }
  }
  function freshIdempotencyKey(){
    if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID();
    throw new Error('No se pudo preparar la operación de forma segura. Actualiza la aplicación y vuelve a intentarlo.');
  }
  async function submitFinance(form){
    const type=form.dataset.bc7FinanceForm;
    const sessionId=form.dataset.bc7FinanceSession;
    const message=form.querySelector('[data-bc7-finance-msg]');
    const keyField=form.querySelector('[data-bc7-op-key]');
    if(!sessionId||!keyField){msg(message,'Falta el vínculo de esta operación con la jornada.','error');return;}
    let key=keyField.value.trim();
    try{if(!key){key=freshIdempotencyKey();keyField.value=key;}}
    catch(e){msg(message,'No se pudo preparar la operación de forma segura. Actualiza la aplicación y vuelve a intentarlo.','error');return;}
    const btn=form.querySelector('button[type="submit"]');
    if(!busy(btn,true))return;
    try{
      let createdId=null;
      if(type==='gasto'){
        const concept=form.querySelector('[data-bc7-expense-concept]').value.trim();
        const amount=Number(form.querySelector('[data-bc7-expense-amount]').value);
        const description=form.querySelector('[data-bc7-expense-description]').value.trim();
        if(!concept||!Number.isFinite(amount)||amount<=0)throw new Error('Completa un concepto y un monto mayor que cero.');
        createdId=await rpc('bc7_registrar_gasto_jornada',{
          p_turno_sesion_id:sessionId,p_concepto:concept,p_monto:amount,
          p_descripcion:description||null,p_idempotency_key:key
        });
      }else if(type==='reinversion'){
        const product=form.querySelector('[data-bc7-reinvestment-product]').value;
        const quantity=Number(form.querySelector('[data-bc7-reinvestment-quantity]').value);
        const cost=Number(form.querySelector('[data-bc7-reinvestment-cost]').value);
        const supplier=form.querySelector('[data-bc7-reinvestment-provider]').value.trim();
        if(!product||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(cost)||cost<=0)throw new Error('Selecciona producto, cantidad positiva y costo total válido.');
        createdId=await rpc('bc7_registrar_reinversion_jornada',{
          p_turno_sesion_id:sessionId,
          p_lineas:[{producto_id:product,presentacion_id:null,cantidad_presentacion:null,cantidad_base:quantity,costo_total:cost}],
          p_idempotency_key:key,p_proveedor:supplier||null
        });
      }else{
        throw new Error('Tipo de operación financiera desconocido.');
      }
      const canReadThisType=state.admin||(type==='gasto'?can('gastos','ver'):can('reinversiones','ver'));
      if(!canReadThisType){
        form.reset();keyField.value='';
        msg(message,'El servidor aceptó la operación ('+String(createdId||'ID confirmado').slice(0,12)+'). No aparece en el historial de esta cuenta porque no tiene permiso de lectura; la aprobación de gastos sigue su flujo habitual.','ok');
        await loadCalendar();
        setStatus('Operación aceptada por el servidor. El historial requiere el permiso de lectura de la sección.','ok');
        return;
      }
      const verified=await loadFinances(state.detail);
      if(!verified){
        msg(message,'El servidor aceptó la operación, pero la lectura de confirmación falló. No vuelvas a enviarla con una clave nueva; el formulario conserva la misma clave para un reintento idempotente.','error');
        return;
      }
      form.reset();
      keyField.value='';
      msg(message,type==='gasto'?'Gasto guardado y releído. Su aprobación sigue pendiente.':'Reinversión registrada y releída en el expediente de la jornada.','ok');
      await loadCalendar();
      setStatus('Operación financiera registrada y leída desde el servidor.','ok');
    }catch(e){
      msg(message,friendlyError(e,'create')+' La operación no quedó confirmada; no repitas el envío con otra clave.','error');
    }finally{busy(btn,false);}
  }

  function cutHtml(cut,products){
    if(!cut)return '<div class="bc7-empty">Aún no hay conteo confirmado.</div>';
    const lines=arr(cut.lineas);
    return '<p class="bc7-muted">Confirmado '+esc(fmtDate(cut.confirmado_en||cut.creado_en))+' · autor '+esc(userName(cut.confirmado_por||cut.creado_por))+' · '+lines.length+' productos.</p>'+
      (cut.origen_corte_id?'<p class="bc7-muted">Saldo de apertura derivado del corte final anterior · origen '+esc(cut.origen_corte_id)+'. Este corte permanece independiente e inmutable.</p>':'')+
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
    const opening=type==='INICIAL'?detail.apertura_previa:null;
    const openingLines=new Map(arr(opening&&opening.lineas).map(x=>[String(x.producto_id),x]));
    const openingNote=type==='INICIAL'
      ?(opening?'<p class="bc7-note">Referencia del Día '+esc(opening.numero_dia)+' ('+esc(fmtDate(opening.fecha))+'): se sugieren las cantidades del inventario final confirmado anterior. Debes volver a contar físicamente cada producto y confirmar este nuevo corte. El inventario del día anterior no se modifica.</p>'
        :'<p class="bc7-note">No hay un inventario final confirmado del día inmediatamente anterior. Define el saldo inicial mediante conteo físico completo; no se copiará automáticamente el stock del sistema.</p>')
      :'';
    const table=products.length?'<div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Producto</th><th>Unidad</th><th>Stock actual</th><th>Referencia anterior</th><th>Conteo físico actual</th></tr></thead><tbody>'+products.map(p=>{
      const prior=openingLines.get(String(p.producto_id));
      return '<tr><td>'+esc(p.nombre)+'</td><td>'+esc(p.unidad||'ud')+'</td><td>'+esc(qty(p.stock_actual))+'</td><td>'+esc(prior?qty(prior.cantidad_contada):'—')+'</td><td><input type="number" min="0" step="0.001" inputmode="decimal" required data-bc7-count="'+esc(p.producto_id)+'" aria-label="Conteo físico de '+esc(p.nombre)+'" value="'+(prior?esc(prior.cantidad_contada):'')+'" placeholder="Contar"></td></tr>';
    }).join('')+'</tbody></table></div>':'<div class="bc7-empty">Este almacén no tiene productos activos con fila de stock registrada. Si se trata realmente de un almacén vacío, puedes confirmar el conteo de cero productos.</div>';
    return openingNote+'<p class="bc7-muted">Cuenta físicamente cada producto del listado. La referencia del día anterior es solo una ayuda; el nuevo corte requiere confirmación física explícita. El stock del sistema solo sirve como comparación y no se copia como conteo físico.</p><form data-bc7-count-form="'+type+'">'+table+'<label class="bc7-field">Observación (opcional)<input data-bc7-count-note maxlength="1000" placeholder="Incidencia o aclaración del conteo"></label><div class="bc7-actions"><button class="bc7-btn primary" type="submit">Guardar y confirmar '+(type==='INICIAL'?'inventario inicial':'inventario final')+'</button></div><p class="bc7-msg" data-bc7-count-msg></p></form>';
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
    }catch(e){host.innerHTML='<div class="bc7-empty">'+esc(friendlyError(e,'calendar'))+' No se han modificado datos.</div>';}
  }
  function renderWorkspace(detail){
    state.detail=detail;
    const s=detail.sesion,cuts=detail.cortes||{},initial=!!cuts.INICIAL,final=!!cuts.FINAL;
    const status=String(s.estado||'').toUpperCase(),isAssigned=String(currentUser()?.id||'')===String(s.responsable_id||'');
    let actionArea='';
    if((status==='PENDIENTE'||status==='PROGRAMADA')&&initial){
      actionArea='<div class="bc7-note"><b>Lista para comenzar.</b> El servidor valida fecha, responsable y secuencia.<form><label class="bc7-field">Motivo de excepción<input id="bc7-start-reason" maxlength="1000" placeholder="Solo si abres fuera del horario"></label><div class="bc7-actions"><button class="bc7-btn primary" type="button" data-bc7-start="'+esc(s.id)+'" '+(!isAssigned?'disabled':'')+'>Comenzar jornada</button></div><p class="bc7-msg" id="bc7-start-msg"></p></form></div>';
    }else if(status==='EN_CURSO'){
      const tramo=detail.tramo_activo,saved=detail.declaracion_dinero&&tramo&&String(detail.declaracion_dinero.turno_tramo_id)===String(tramo.id);
      actionArea='<div class="bc7-note"><b>Finalizar jornada.</b> Declara el efectivo real contado; el cierre exige inventario final y autorización.<form data-bc7-close-form="'+esc(s.id)+'"><div class="bc7-grid"><label class="bc7-field">Dinero declarado<input id="bc7-cash" type="number" min="0" step="0.01" required placeholder="0.00" inputmode="decimal" value="'+(saved?esc(detail.declaracion_dinero.monto):'')+'" '+(saved?'readonly':'')+'></label><label class="bc7-field">Motivo de excepción<input id="bc7-close-reason" maxlength="1000" placeholder="Solo si aplica"></label></div><div class="bc7-actions"><button type="submit" class="bc7-btn danger" '+(!final||!tramo||!isAssigned?'disabled':'')+'>'+(saved?'Finalizar con declaración guardada':'Declarar y finalizar')+'</button></div><p class="bc7-msg" data-bc7-close-msg></p>'+(final?'':'<p class="bc7-muted">Bloqueado: falta confirmar inventario final.</p>')+'</form></div>';
    }else if(status==='COMPLETADA')actionArea='<div class="bc7-note">Jornada completada. Conteos y movimientos conservados como evidencia.</div>';
    else actionArea='<div class="bc7-note">Estado: '+esc(humanStatus(status))+'. Las acciones disponibles dependen de esta jornada.</div>';
    let adjustment='';
    if(status==='EN_CURSO'&&isAssigned&&(can('mermas','crear')||can('bajas','crear'))){
      const products=arr(detail.productos);
      adjustment='<details class="bc7-detail"><summary><span>Solicitar merma o baja</span><small>No afecta stock hasta aprobación</small></summary><div class="bc7-detail-body"><form data-bc7-adjust-form="'+esc(s.id)+'"><div class="bc7-grid"><label class="bc7-field">Tipo<select data-bc7-ajust-type required>'+((can('mermas','crear'))?'<option value="merma">Merma</option>':'')+((can('bajas','crear'))?'<option value="baja">Baja</option>':'')+'</select></label><label class="bc7-field">Producto<select data-bc7-ajust-product required><option value="">Selecciona producto</option>'+products.map(p=>'<option value="'+esc(p.producto_id)+'">'+esc(p.nombre)+' · stock '+esc(qty(p.stock_actual))+'</option>').join('')+'</select></label><label class="bc7-field">Cantidad<input type="number" min="0.001" step="0.001" data-bc7-ajust-qty required inputmode="decimal"></label><label class="bc7-field">Motivo<input data-bc7-ajust-reason maxlength="500" required placeholder="Motivo obligatorio"></label></div><div class="bc7-actions"><button class="bc7-btn" type="submit">Enviar a revisión</button></div><p class="bc7-msg" data-bc7-ajust-msg></p></form></div></details>';
    }
    const inv='<div class="bc7-panel-stack"><div class="bc7-workspace-overview"><div class="bc7-overview-item"><small>Inventario inicial</small><b>'+(initial?'Confirmado':'Pendiente')+'</b></div><div class="bc7-overview-item"><small>Inventario final</small><b>'+(final?'Confirmado':'Pendiente')+'</b></div><div class="bc7-overview-item"><small>Productos</small><b>'+arr(detail.productos).length+'</b></div></div><details class="bc7-detail" '+(!initial?'open':'')+'><summary><span>1 · Inventario inicial</span><small>'+(initial?'Confirmado':'Pendiente')+'</small></summary><div class="bc7-detail-body">'+countFormHtml('INICIAL',detail)+'</div></details><details class="bc7-detail" '+(initial&&!final?'open':'')+'><summary><span>2 · Inventario final</span><small>'+(final?'Confirmado':'Pendiente')+'</small></summary><div class="bc7-detail-body">'+countFormHtml('FINAL',detail)+'</div></details></div>';
    const op='<div class="bc7-panel-stack">'+actionArea+adjustment+'</div>';
    const fin=financeFormHtml(detail,isAssigned,status);
    const mov='<div class="bc7-panel-stack"><div class="bc7-muted">Solo movimientos vinculados a esta sesión. El resto sigue en Movimientos → Historial.</div><div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-mov-refresh>Actualizar</button><button class="bc7-btn" type="button" data-bc7-open-movements>Abrir historial general</button></div><div id="bc7-movements"><div class="bc7-empty">Abre esta pestaña para consultar los movimientos.</div></div></div>';
    $('bc7-workspace-title').textContent=fmtDate(s.fecha)+' · '+warehouseName(s.almacen_id);
    $('bc7-workspace-body').innerHTML='<div class="bc7-workspace-overview"><div class="bc7-overview-item"><small>Estado</small><b>'+esc(humanStatus(status))+'</b></div><div class="bc7-overview-item"><small>Responsable</small><b>'+esc(userName(s.responsable_id))+'</b></div><div class="bc7-overview-item"><small>Horario</small><b>'+esc(String(s.hora_inicio_prevista||'').slice(0,5))+'–'+esc(String(s.hora_fin_prevista||'').slice(0,5))+'</b></div></div><div class="bc7-workspace-tabs" role="tablist" aria-label="Secciones de la jornada"><button type="button" class="bc7-workspace-tab" role="tab" data-bc7-workspace-tab="inventario" aria-selected="true">Inventario</button><button type="button" class="bc7-workspace-tab" role="tab" data-bc7-workspace-tab="operacion" aria-selected="false">Operación</button><button type="button" class="bc7-workspace-tab" role="tab" data-bc7-workspace-tab="finanzas" aria-selected="false">Finanzas</button><button type="button" class="bc7-workspace-tab" role="tab" data-bc7-workspace-tab="movimientos" aria-selected="false">Movimientos</button></div><section class="bc7-workspace-panel" role="tabpanel" data-bc7-workspace-panel="inventario">'+inv+'</section><section class="bc7-workspace-panel" role="tabpanel" data-bc7-workspace-panel="operacion" hidden>'+op+'</section><section class="bc7-workspace-panel" role="tabpanel" data-bc7-workspace-panel="finanzas" hidden>'+fin+'</section><section class="bc7-workspace-panel" role="tabpanel" data-bc7-workspace-panel="movimientos" hidden>'+mov+'</section>';
    $('bc7-workspace').hidden=false;setPageMode(true);$('bc7-workspace').scrollIntoView({behavior:'smooth',block:'start'});
    activateWorkspaceTab(state.workspaceTab);
  }
  async function openWorkspace(sessionId){
    if(!$('bc7-workspace')||!$('bc7-workspace-body'))return false;
    if(String(state.selected||'')!==String(sessionId||''))state.workspaceTab='inventario';
    setPageMode(true);$('bc7-workspace').hidden=false;$('bc7-workspace-title').textContent='Cargando jornada…';
    $('bc7-workspace-body').innerHTML='<div class="bc7-empty">Cargando jornada…</div>';
    try{const detail=await rpc('bc7_obtener_inventario_jornada',{p_turno_sesion_id:sessionId});state.selected=sessionId;renderWorkspace(detail);return true;}
    catch(e){$('bc7-workspace-body').innerHTML='<div class="bc7-empty">'+esc(friendlyError(e,'calendar'))+' No se modificó ningún dato.</div>';return false;}
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
    catch(e){msg(form.querySelector('[data-bc7-count-msg]'),'No se confirmó el conteo. '+friendlyError(e,'create'),'error');}
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
      let archiveRefreshFailed=false;
      try{await refreshPosArchiveAfterSessionStart();}catch(e){archiveRefreshFailed=true;}
      await loadCalendar();
      const reread=await openWorkspace(sessionId);
      if(!reread){
        setStatus('La solicitud de inicio fue aceptada, pero no se pudo releer el estado. Actualiza antes de repetir la operación.','error');
        return;
      }
      const currentState=String(state.detail?.sesion?.estado||'').toUpperCase();
      if(currentState!=='EN_CURSO'){
        setStatus('La jornada todavía no aparece como iniciada. Estado: '+humanStatus(currentState)+'. Actualiza antes de volver a intentarlo.','error');
        return;
      }
      setStatus(archiveRefreshFailed
        ? 'Jornada iniciada y confirmada; no se pudo actualizar el archivo de caja.'
        : 'Jornada iniciada y confirmada.','ok');
    }catch(e){
      const errorText='No se pudo confirmar todavía el inicio. '+friendlyError(e,'create')+' Se comprobará el estado antes de permitir otro intento.';
      try{
        const d=await rpc('bc7_obtener_inventario_jornada',{p_turno_sesion_id:sessionId});
        renderWorkspace(d);
        const rereadState=String(d?.sesion?.estado||'').toUpperCase();
        if(rereadState==='EN_CURSO'){
          await loadCalendar();
          setStatus('Inicio confirmado al volver a consultar la jornada. No se repitió la escritura.','ok');
        }else{
          setStatus('El servidor todavía no confirma el inicio. Estado actual: '+humanStatus(rereadState)+'.','error');
          msg($('bc7-start-msg'),errorText,'error');
        }
      }catch(x){
        setStatus('No se pudo confirmar el estado del inicio por falta de lectura del servidor. No repitas la escritura todavía.','error');
        msg($('bc7-start-msg'),errorText+' Tampoco se pudo consultar el estado actual. '+friendlyError(x,'calendar'),'error');
      }
    }
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
      await loadCalendar();
      const reread=await openWorkspace(sessionId);
      if(!reread){
        setStatus('La solicitud de cierre fue aceptada, pero no se pudo releer el resumen. Actualiza antes de repetir cualquier operación.','error');
        return;
      }
      const finalState=String(state.detail?.sesion?.estado||'').toUpperCase();
      if(finalState!=='COMPLETADA'){
        setStatus('La jornada todavía no aparece como finalizada. Estado: '+humanStatus(finalState)+'. Actualiza antes de volver a intentarlo.','error');
        return;
      }
      setStatus('Jornada finalizada y confirmada.','ok');
    }catch(e){
      const errorText='No se pudo confirmar todavía el cierre. '+friendlyError(e,'create')+' Se comprobará el estado antes de permitir otro intento.';
      try{
        const d=await rpc('bc7_obtener_inventario_jornada',{p_turno_sesion_id:sessionId});
        renderWorkspace(d);
        const rereadState=String(d?.sesion?.estado||'').toUpperCase();
        if(rereadState==='COMPLETADA'){
          await loadCalendar();
          setStatus('Cierre confirmado al volver a consultar la jornada. No se repitió la escritura.','ok');
        }else{
          setStatus('El servidor todavía no confirma el cierre. Estado actual: '+humanStatus(rereadState)+'.','error');
          const currentMsg=document.querySelector('[data-bc7-close-msg]')||msgEl;
          msg(currentMsg,errorText,'error');
        }
      }catch(x){
        setStatus('No se pudo confirmar el estado del cierre por falta de lectura del servidor. No repitas la escritura todavía.','error');
        msg(form.querySelector('[data-bc7-close-msg]')||msgEl,errorText+' Tampoco se pudo consultar el estado actual. '+friendlyError(x,'calendar'),'error');
      }
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
    }catch(e){msg(msgEl,'No se registró la solicitud. '+friendlyError(e,'create'),'error');}
    finally{busy(btn,false);}
  }
  async function saveHours(form){
    const warehouse=$('bc7-warehouse')?.value;
    const start=$('bc7-hour-start').value,end=$('bc7-hour-end').value,zone=$('bc7-timezone').value.trim();
    if(!warehouse){msg($('bc7-hours-msg'),'Selecciona un almacén.','error');return;}
    if(!start||!end||start>=end||!zone){msg($('bc7-hours-msg'),'La hora de apertura debe ser anterior a la hora de cierre.','error');return;}
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{await rpc('bc5_configurar_horario_jornada',{p_almacen_id:warehouse,p_hora_inicio:start,p_hora_fin:end,p_zona_horaria:zone});msg($('bc7-hours-msg'),'Horario guardado.','ok');await loadCalendar();}
    catch(e){msg($('bc7-hours-msg'),'No se guardó el horario. '+friendlyError(e,'hours'),'error');}
    finally{busy(btn,false);}
  }
  async function savePattern(form){
    const warehouse=$('bc7-warehouse')?.value;
    const name=$('bc7-pattern-name').value.trim(),anchor=$('bc7-anchor').value,days=readDayRows();
    if(!warehouse){msg($('bc7-pattern-msg'),'Selecciona un almacén.','error');return;}
    if(!name||!anchor||!days.length){msg($('bc7-pattern-msg'),'Escribe un nombre para la rotación, elige la fecha desde la que comienza y muestra los días.','error');return;}
    if(days.some(x=>x.trabaja)&&!staffCatalogReady()){msg($('bc7-pattern-msg'),'Espera a que se cargue la lista de personas disponibles antes de guardar la rotación.','error');return;}
    const bad=days.find(x=>x.trabaja&&!x.responsable_id);
    if(bad){msg($('bc7-pattern-msg'),'El Día '+bad.numero_dia+' está marcado como día de trabajo, pero todavía no tiene una persona asignada.','error');return;}
    if(!confirm('Se guardará esta rotación para el almacén. Las jornadas que ya existen no cambiarán. ¿Confirmas?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{await rpc('bc5_guardar_patron_jornada',{p_almacen_id:warehouse,p_nombre:name,p_fecha_ancla:anchor,p_patron:days});msg($('bc7-pattern-msg'),'Rotación guardada. Ya puedes revisar las fechas y crear la programación.','ok');state.lastPreview=null;}
    catch(e){msg($('bc7-pattern-msg'),'No se pudo guardar la rotación. '+friendlyError(e,'pattern'),'error');}
    finally{busy(btn,false);}
  }
  async function previewPattern(btn){
    const warehouse=$('bc7-warehouse')?.value,start=$('bc7-start-date')?.value,n=Math.max(1,Math.min(31,Number($('bc7-days-count')?.value||7)));
    if(!warehouse||!start){msg($('bc7-create-msg'),'Selecciona el almacén y la primera fecha que quieres programar.','error');return;}
    if(start<dateHavana()){msg($('bc7-create-msg'),'La fecha de inicio ya pasó. Elige hoy o una fecha futura.','error');return;}
    if(!busy(btn,true))return;
    try{
      const rows=arr(await rpc('bc5_previsualizar_jornada',{p_almacen_id:warehouse,p_fecha_inicio:start,p_dias:n}));
      state.lastPreview={start,warehouse,days:n,rows,mode:'pattern'};
      $('bc7-preview').innerHTML=rows.map(r=>'<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(fmtDateHuman(r.fecha))+' · '+esc(r.trabaja?userName(r.responsable_id):'Descanso')+'</strong><p>'+esc(String(r.hora_inicio_prevista).slice(0,5))+'–'+esc(String(r.hora_fin_prevista).slice(0,5))+'</p></div>'+(r.conflicto?'<span class="bc7-pill warn">Revisar</span>':'<span class="bc7-pill ok">Disponible</span>')+'</div>'+(r.motivo_conflicto?'<p>'+esc(friendlyError(r.motivo_conflicto,'preview'))+'</p>':'')+'</article>').join('');
      msg($('bc7-create-msg'),rows.some(r=>r.conflicto)?'La vista previa contiene conflictos. Corrígelos antes de crear.':'Vista previa sin conflictos detectados. Aún falta confirmar la creación.','');
    }catch(e){state.lastPreview=null;msg($('bc7-create-msg'),friendlyError(e,'preview'),'error');}
    finally{busy(btn,false);}
  }
  async function createSchedule(btn){
    const warehouse=$('bc7-warehouse')?.value,start=$('bc7-start-date')?.value,n=Math.max(1,Math.min(31,Number($('bc7-days-count')?.value||7)));
    const mode=$('bc7-plan-mode')?.value||'explicit';
    if(!warehouse||!start){msg($('bc7-create-msg'),'Selecciona el almacén y la primera fecha que quieres programar.','error');return;}
    if(start<dateHavana()){msg($('bc7-create-msg'),'La fecha de inicio ya pasó. Elige hoy o una fecha futura.','error');return;}
    let schedule=null;
    if(mode==='explicit'&&!staffCatalogReady()){msg($('bc7-create-msg'),'Espera a que se cargue la lista de personas disponibles antes de crear las jornadas.','error');return;}
    if(mode==='explicit'){
      schedule=readDayRows();
      if(schedule.length!==n){buildDayRows();schedule=readDayRows();}
      const missing=schedule.find(x=>x.trabaja&&!x.responsable_id);
      if(missing){msg($('bc7-create-msg'),'El Día '+missing.numero_dia+' está marcado como día de trabajo, pero todavía no tiene una persona asignada.','error');return;}
      if(schedule.some(x=>!x.trabaja&&x.responsable_id)){msg($('bc7-create-msg'),'En los días marcados como descanso, borra la persona que aparece asignada.','error');return;}
      const dates=schedule.map((r,i)=>addDays(start,i));
      state.lastPreview={start,warehouse,days:n,mode:'explicit',rows:schedule.map((r,i)=>({...r,fecha:dates[i],conflicto:false}))};
      $('bc7-preview').innerHTML=state.lastPreview.rows.map(r=>'<article class="bc7-jornada"><strong>'+esc(fmtDateHuman(r.fecha))+' · '+esc(r.trabaja?userName(r.responsable_id):'Descanso')+'</strong></article>').join('');
    }else{
      if(!state.lastPreview||state.lastPreview.mode!=='pattern'||state.lastPreview.start!==start||state.lastPreview.warehouse!==warehouse||state.lastPreview.days!==n){
        msg($('bc7-create-msg'),'Antes de crear, pulsa «Revisar fechas» para comprobar que la rotación esté libre en el almacén elegido.','error');return;
      }
      if(state.lastPreview.rows.some(r=>r.conflicto)){msg($('bc7-create-msg'),'La revisión muestra fechas ocupadas o personas con otro turno. Corrige esos avisos antes de crear la programación. No se creó ningún cambio.','error');return;}
    }
    if(!confirm('Se crearán '+n+' días de jornada en '+warehouseName(warehouse)+'. Si alguna fecha o persona ya tiene otro turno, la aplicación te avisará. ¿Confirmas?'))return;
    if(!busy(btn,true))return;
    try{
      const result=await rpc('bc5_crear_jornada_unica',{p_almacen_id:warehouse,p_fecha_inicio:start,p_dias:n,p_programacion:mode==='pattern'?null:schedule,p_observacion:$('bc7-schedule-note')?.value.trim()||null});
      const total=Number(result&&result.dias_total),work=Number(result&&result.dias_laborables),rest=Number(result&&result.dias_descanso);
      const summary=Number.isFinite(total)&&Number.isFinite(work)&&Number.isFinite(rest)?'Se programaron '+total+' días: '+work+' de trabajo y '+rest+' de descanso.':'La programación se creó correctamente.';
      msg($('bc7-create-msg'),summary,'ok');
      state.lastPreview=null;await loadCalendar();
    }catch(e){msg($('bc7-create-msg'),'No se pudo crear la programación. '+friendlyError(e,'create'),'error');}
    finally{busy(btn,false);}
  }
  async function reschedule(form){
    const id=form.dataset.bc7Reschedule;
    const works=form.querySelector('[data-bc7-rework]').checked;
    const person=form.querySelector('[data-bc7-reperson]').value||null;
    const reason=form.querySelector('[data-bc7-reason]').value.trim();
    const msgEl=form.querySelector('[data-bc7-remsg]');
    if(works&&!staffCatalogReady()){msg(msgEl,'Espera a que se cargue la lista de personas disponibles antes de hacer el cambio.','error');return;}
    if(!reason|| (works&&!person)||(!works&&person)){msg(msgEl,'Escribe el motivo del cambio y, si ese día se trabaja, elige quién lo cubrirá. En un día de descanso no debe quedar nadie asignado.','error');return;}
    if(!confirm('Se guardará este cambio en el historial de la jornada. ¿Confirmas la ausencia, la sustitución o el día de descanso?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{await rpc('bc5_reprogramar_jornada',{p_programacion_id:id,p_trabaja:works,p_responsable_id:works?person:null,p_motivo:reason});msg(msgEl,'Reprogramación guardada.','ok');await loadCalendar();}
    catch(e){msg(msgEl,'No se pudo guardar el cambio. '+friendlyError(e,'create'),'error');}
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
    ensureStyles();ensureDayRowsStyles();if(!ensureShell())return;
    const today=dateHavana();
    if($('bc7-anchor'))$('bc7-anchor').value=today;
    if($('bc7-start-date'))$('bc7-start-date').value=today;
    if($('bc7-list-from'))$('bc7-list-from').value=today;
    state.staffLoaded=eligibleStaff().length>0;
    fillWarehouses();buildDayRows();
    ensureWarehouseCatalog();
    try{state.admin=!!(await rpc('bc_actor_is_admin',{}));}
    catch(e){state.admin=false;setStatus(friendlyError(e,'general'),'error');}
    if(state.admin){try{await ensureResponsibleCatalog(true);}catch(_){}}
    if($('bc7-admin-panel'))$('bc7-admin-panel').hidden=false;
    if($('bc7-admin-details'))$('bc7-admin-details').hidden=!state.admin;
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
    const refreshCatalogs=()=>{fillWarehouses();refreshResponsibleSelectors();};
    setTimeout(refreshCatalogs,700);setTimeout(refreshCatalogs,1800);
    const staffRetry=$('bc7-staff-retry');
    if(staffRetry)staffRetry.addEventListener('click',async()=>{try{await ensureResponsibleCatalog(true);}catch(_){}});
    const listFrom=$('bc7-list-from');if(listFrom)listFrom.addEventListener('change',()=>{state.lastPreview=null;});
    await loadCalendar();
    window.addEventListener('online',()=>{setStatus('Conexión restaurada. Actualiza el calendario para leer el estado LIVE.','ok');ensureWarehouseCatalog();});
    window.addEventListener('offline',()=>setStatus('Sin conexión: las escrituras quedan bloqueadas.','error'));
  }
  document.addEventListener('click',function(e){
    const tab=e.target&&e.target.closest?e.target.closest('[data-bc7-workspace-tab]'):null;
    if(tab){e.preventDefault();activateWorkspaceTab(tab.getAttribute('data-bc7-workspace-tab'));return;}
    const back=e.target&&e.target.closest?e.target.closest('[data-bc7-back-calendar]'):null;
    if(back){e.preventDefault();returnToCalendar();}
  });
  window.__BC7_JORNADA__ = {
    openWorkspace: openWorkspace,
    refreshResponsibleStaff: async function(){try{return await ensureResponsibleCatalog(true);}catch(_){return []; }},
    openForSession: async function(sessionId) {
      if (!sessionId) return false;
      navTo('jornada');
      return openWorkspace(sessionId);
    }
  };
  document.addEventListener('click',function(e){
    const t=e.target&&e.target.closest?e.target.closest('button,.tab-btn[data-tab="jornada"]'):null;if(!t)return;
    if(t.id==='bc7-warehouse-retry'){e.preventDefault();ensureWarehouseCatalog();return;}
    if(t.matches&&t.matches('.tab-btn[data-tab="jornada"]')){setTimeout(()=>{ensureWarehouseCatalog();},0);}
  });
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
    else if(f.matches('[data-bc7-finance-form]')){e.preventDefault();await submitFinance(f);}
  });
  document.addEventListener('change',function(e){
    const t=e.target;
    if(t&&t.matches('[data-bc7-rework]')){const s=t.closest('form')?.querySelector('[data-bc7-reperson]');if(s){s.disabled=!t.checked||state.staffLoading||!state.staffLoaded||!eligibleStaff().length;if(!t.checked)s.value='';}}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot());else boot();
})();