// BattleCruiser — Intelligent Visual Planner for Jornada.
// Desktop-only. Drag and resize operate on an in-memory draft; no write occurs before explicit confirmation.
(function bc7VisualIntelligentPlanner(){
  'use strict';
  if(window.__BC7_VISUAL_INTELLIGENT_PLANNER__)return;
  window.__BC7_VISUAL_INTELLIGENT_PLANNER__=true;

  const $=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state={
    attached:false,
    draft:null,
    drag:null,
    ghost:null,
    movementCache:new Map(),
    movementLoading:new Set(),
    movementRequest:0
  };
  const MIME='application/x-battlecruiser-visual-planner';

  function api(){
    return window.__BC7_JORNADA__&&window.__BC7_JORNADA__.visualPlanner
      ?window.__BC7_JORNADA__.visualPlanner:null;
  }
  function snapshot(){
    const bridge=api();
    return bridge?bridge.getSnapshot():null;
  }
  function isoDate(value){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  }
  function ordinal(value){
    if(!isoDate(value))return NaN;
    const p=String(value).split('-').map(Number);
    return Math.floor(Date.UTC(p[0],p[1]-1,p[2],12)/86400000);
  }
  function addDays(value,offset){
    const n=ordinal(value);
    if(!Number.isFinite(n))return '';
    return new Date((n+Number(offset||0))*86400000).toISOString().slice(0,10);
  }
  function dayDelta(a,b){return ordinal(b)-ordinal(a);}
  function today(){
    return new Intl.DateTimeFormat('en-CA',{
      timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit'
    }).format(new Date());
  }
  function humanDate(value){
    if(!isoDate(value))return String(value||'');
    return new Intl.DateTimeFormat('es-ES',{
      weekday:'short',day:'2-digit',month:'short',timeZone:'UTC'
    }).format(new Date(value+'T12:00:00Z'));
  }
  function personName(model,id){
    const person=(model&&model.staff||[]).find(row=>String(row.id)===String(id));
    return person?person.name:'Sin asignar';
  }
  function warehouseName(model,id){
    const item=(model&&model.warehouses||[]).find(row=>String(row.id)===String(id));
    return item?item.name:String(id||'Almacén');
  }
  function makeDay(index){
    return {numero_dia:index+1,trabaja:true,responsable_id:null};
  }
  function normalizeSchedule(draft){
    while(draft.schedule.length<draft.days)draft.schedule.push(makeDay(draft.schedule.length));
    draft.schedule=draft.schedule.slice(0,draft.days).map((item,index)=>({
      numero_dia:index+1,
      trabaja:item.trabaja!==false,
      responsable_id:item.trabaja===false?null:(item.responsable_id||null)
    }));
  }
  function isComplete(draft){
    return !!draft&&draft.schedule.every(day=>day.trabaja!==true||!!day.responsable_id);
  }
  function signature(draft){
    if(!draft)return '';
    return JSON.stringify({
      warehouseId:draft.warehouseId,
      startDate:draft.startDate,
      days:draft.days,
      schedule:draft.schedule.map(day=>({
        trabaja:day.trabaja===true,
        responsable_id:day.responsable_id||null
      }))
    });
  }
  function invalidate(message){
    if(!state.draft)return;
    state.draft.validated=false;
    state.draft.validatedSignature='';
    state.draft.conflicts=[];
    state.draft.message=message||'El borrador cambió. Vuelve a revisar los conflictos.';
    state.draft.messageKind='';
  }
  function announce(message,kind){
    const status=$('bc7-vp-gesture-status');
    if(status){
      status.textContent=message||'';
      status.className='bc7-vp-status '+(kind||'');
    }
    if(state.draft){
      state.draft.message=message;
      state.draft.messageKind=kind||'';
      renderDraftPanel(snapshot());
    }
  }

  function ensureStyles(){
    if($('bc7-visual-planner-style'))return;
    const rules=[
      '.bc7-visual-calendar-dialog{width:min(96vw,1680px)!important;height:min(94vh,980px)!important}',
      '.bc7-visual-calendar-layout{grid-template-columns:minmax(0,1fr) minmax(320px,390px)!important;min-height:0!important}',
      '.bc7-visual-calendar-main{min-width:0;min-height:0}',
      '.bc7-visual-calendar-side{min-height:0;max-height:calc(94vh - 130px);overflow:auto;overscroll-behavior:contain;padding:10px!important}',
      '.bc7-visual-warehouse-picker{display:flex;flex-direction:column;gap:3px;min-width:145px}',
      '.bc7-visual-warehouse-picker span{font-size:9px;font-weight:800;letter-spacing:.08em;color:var(--mist)}',
      '.bc7-visual-warehouse-picker select{min-height:34px;max-width:190px}',
      '.bc7-visual-tools,.bc7-visual-draft-panel,.bc7-visual-activity{border:1px solid var(--gold-dim);border-radius:10px;padding:10px;margin:8px 0;background:rgba(255,255,255,.025)}',
      '.bc7-visual-draft-panel[hidden]{display:none!important}',
      '.bc7-vp-section-kicker{font-size:9px;letter-spacing:.12em;font-weight:800;color:var(--gold);text-transform:uppercase}',
      '.bc7-vp-palette-card{display:flex;align-items:center;gap:10px;width:100%;margin:7px 0;padding:10px;border:1px solid rgba(201,162,77,.48);border-radius:9px;background:linear-gradient(135deg,rgba(201,162,77,.15),rgba(95,89,177,.12));color:var(--text);text-align:left;cursor:grab}',
      '.bc7-vp-palette-card:active,.bc7-vp-staff-chip:active{cursor:grabbing}',
      '.bc7-vp-palette-icon{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:8px;background:rgba(201,162,77,.18);font-size:19px}',
      '.bc7-vp-palette-copy{display:grid;gap:3px;min-width:0}',
      '.bc7-vp-palette-copy strong{font-size:12px}',
      '.bc7-vp-palette-copy small{font-size:10px;color:var(--mist);line-height:1.25}',
      '.bc7-vp-staff-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
      '.bc7-vp-staff-chip{border:1px solid rgba(117,171,219,.45);border-radius:999px;background:rgba(58,116,169,.14);padding:6px 9px;color:var(--text);font-size:10px;font-weight:700;cursor:grab}',
      '.bc7-vp-palette-hint,.bc7-vp-muted{color:var(--mist);font-size:10px;line-height:1.4}',
      '.bc7-vp-draft-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '.bc7-vp-draft-head h4{margin:3px 0;font-size:14px}',
      '.bc7-vp-draft-grid{display:grid;grid-template-columns:minmax(0,1fr) 90px;gap:7px;margin:9px 0}',
      '.bc7-vp-field{display:grid;gap:3px;min-width:0}',
      '.bc7-vp-field span{font-size:10px;color:var(--mist);font-weight:700}',
      '.bc7-vp-field input,.bc7-vp-field select{min-width:0;width:100%;min-height:34px;font-size:11px}',
      '.bc7-vp-day-list{display:grid;gap:6px;margin:8px 0}',
      '.bc7-vp-day-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;padding:7px;border:1px solid rgba(201,162,77,.22);border-radius:8px;background:rgba(0,0,0,.12)}',
      '.bc7-vp-day-row.is-rest{opacity:.78}',
      '.bc7-vp-day-copy{display:grid;gap:3px;min-width:0}',
      '.bc7-vp-day-copy strong{font-size:11px}',
      '.bc7-vp-day-copy small{font-size:9px;color:var(--mist)}',
      '.bc7-vp-day-actions{display:flex;gap:4px;align-items:center}',
      '.bc7-vp-day-actions button{min-height:27px;padding:4px 6px;font-size:9px}',
      '.bc7-vp-day-person{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr);gap:3px}',
      '.bc7-vp-day-person select{width:100%;min-height:31px;font-size:10px}',
      '.bc7-vp-day-slot{grid-column:1/-1;border:1px dashed rgba(117,171,219,.4);border-radius:6px;padding:5px;color:var(--mist);font-size:9px}',
      '.bc7-vp-day-slot.is-drop-target{border-color:#67d4e9;background:rgba(65,183,207,.12)}',
      '.bc7-vp-draft-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}',
      '.bc7-vp-draft-actions .primary{grid-column:1/-1}',
      '.bc7-vp-status{margin:7px 0 0;padding:7px;border-radius:7px;background:rgba(255,255,255,.035);font-size:10px;line-height:1.4}',
      '.bc7-vp-status.ok{color:#a6e3bc;border:1px solid rgba(90,183,125,.35)}',
      '.bc7-vp-status.error{color:#ffb5a7;border:1px solid rgba(205,88,76,.42)}',
      '.bc7-vp-conflicts{margin:7px 0;padding-left:17px;color:#ffb5a7;font-size:10px}',
      '.bc7-vp-draft-segment{position:relative;display:flex;align-items:center;gap:3px;min-height:22px;margin:2px 0;padding:3px 5px;border:1px solid rgba(123,205,226,.7);border-radius:5px;background:rgba(57,160,184,.25);color:var(--text);font-size:9px;font-weight:800;cursor:grab;overflow:visible;z-index:2}',
      '.bc7-vp-draft-segment.is-rest{border-color:rgba(201,162,77,.7);background:rgba(201,162,77,.17)}',
      '.bc7-vp-draft-segment.is-unassigned{border-style:dashed;border-color:#e2ae58;background:rgba(201,145,52,.18)}',
      '.bc7-vp-draft-label{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bc7-vp-resize-handle{flex:0 0 10px;width:10px;height:15px;padding:0;border:0;border-radius:3px;background:rgba(255,255,255,.23);color:var(--text);font-size:9px;cursor:ew-resize}',
      '.bc7-vp-ghost-segment{min-height:20px;margin:2px 0;padding:3px 5px;border:1px dashed #67d4e9;border-radius:5px;background:rgba(65,183,207,.2);color:var(--text);font-size:9px;font-weight:800;pointer-events:none}',
      '.bc7-vp-ghost-segment.is-conflict{border-color:#ed746b;background:rgba(191,62,54,.24)}',
      '.bc7-vp-drop-target{outline:2px solid rgba(104,213,235,.78);outline-offset:-3px}',
      '.bc7-vp-movement-groups{display:flex;flex-wrap:wrap;gap:6px;margin:7px 0}',
      '.bc7-vp-movement-amulet{display:flex;align-items:center;gap:5px;border:1px solid rgba(122,169,202,.38);border-radius:999px;background:rgba(67,113,151,.12);padding:6px 8px;color:var(--text);font-size:10px}',
      '.bc7-vp-movement-amulet small{color:var(--mist);font-size:9px}',
      '.bc7-vp-movement-list{display:grid;gap:5px;margin:7px 0}',
      '.bc7-vp-movement-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;padding:6px 7px;border-radius:6px;background:rgba(255,255,255,.025);font-size:10px}',
      '.bc7-vp-movement-item small{display:block;color:var(--mist);font-size:9px;margin-top:2px}',
      '.bc7-vp-movement-value{white-space:nowrap;font-weight:800}',
      '@media(max-width:900px){.bc7-visual-calendar-dialog{width:98vw!important}.bc7-visual-calendar-layout{grid-template-columns:minmax(0,1fr) 300px!important}.bc7-visual-calendar-side{padding:7px!important}}'
    ];
    const style=document.createElement('style');
    style.id='bc7-visual-planner-style';
    style.textContent=rules.join('\n');
    document.head.appendChild(style);
  }

  function newDraft(date,model){
    if(!model||!model.admin){announce('Solo Administración puede crear jornadas desde este tablero.','error');return;}
    if(!model.online){announce('Conéctate para preparar y confirmar la programación.','error');return;}
    if(state.draft){announce('Ya tienes un borrador abierto. Complétalo o descártalo antes de crear otro.','error');return;}
    if(!isoDate(date)||date<today()){announce('Elige hoy o una fecha futura para comenzar la jornada.','error');return;}
    if(!model.warehouseId){announce('Selecciona primero un almacén en la parte superior del tablero.','error');return;}
    state.draft={
      warehouseId:model.warehouseId,
      startDate:date,
      days:2,
      schedule:[makeDay(0),makeDay(1)],
      validated:false,
      validatedSignature:'',
      conflicts:[],
      message:'Borrador local. Asigna un responsable a cada día laborable y revisa los conflictos antes de crear.',
      messageKind:''
    };
    api().selectDate(date);
    render();
  }

  function clearGhost(){
    const board=$('bc7-month-board');
    if(board){
      board.querySelectorAll('[data-bc7-vp-ghost]').forEach(node=>node.remove());
      board.querySelectorAll('.bc7-vp-drop-target').forEach(node=>node.classList.remove('bc7-vp-drop-target'));
    }
    const panel=$('bc7-visual-draft-panel');
    if(panel)panel.querySelectorAll('.bc7-vp-day-slot.is-drop-target').forEach(node=>node.classList.remove('is-drop-target'));
    const status=$('bc7-vp-gesture-status');
    if(status)status.textContent='';
    state.ghost=null;
  }

  function renderToolbox(model){
    const host=$('bc7-visual-tools');
    if(!host||!model)return;
    if(!model.admin){
      host.innerHTML='<p class="bc7-vp-muted">Modo de consulta. Aquí se muestran jornadas y movimientos vinculados; la programación solo está disponible para Administración.</p>';
      return;
    }
    if(!model.online){
      host.innerHTML='<p class="bc7-vp-muted">Sin conexión. El calendario y los registros guardados siguen en modo de consulta. Conéctate para revisar conflictos y crear nuevas jornadas.</p>';
      return;
    }
    const staff=model.staff||[];
    host.innerHTML=
      '<div class="bc7-vp-section-kicker">CREAR</div>'+
      '<button type="button" class="bc7-vp-palette-card" draggable="true" data-bc7-vp-tool="new" aria-label="Nueva jornada. Arrastra al día inicial o pulsa para crear un borrador">'+
        '<span class="bc7-vp-palette-icon" aria-hidden="true">✦</span><span class="bc7-vp-palette-copy"><strong>Nueva jornada</strong><small>Arrastra al primer día del período. Se crea como borrador local.</small></span>'+
      '</button>'+
      '<div class="bc7-vp-section-kicker">RESPONSABLES</div>'+
      '<p class="bc7-vp-palette-hint">Arrastra una persona a cada día laborable o selecciónala en el inspector del borrador.</p>'+
      (staff.length?'<div class="bc7-vp-staff-list">'+staff.map(person=>
        '<button type="button" class="bc7-vp-staff-chip" draggable="true" data-bc7-vp-staff="'+esc(person.id)+'" aria-label="Responsable '+esc(person.name)+'">'+esc(person.name)+'</button>'
      ).join('')+'</div>':'<div class="bc7-vp-muted">No hay responsables elegibles cargados. Actualiza el catálogo de responsables en Jornada.</div>')+
      '<p class="bc7-vp-toolbar-note">Las asignaciones se guardan solo al confirmar. El arrastre nunca abre ni modifica una sesión operativa.</p>';
  }

  function renderDraftSegments(model){
    const board=$('bc7-month-board');
    if(!board)return;
    board.querySelectorAll('[data-bc7-vp-draft-segment],[data-bc7-vp-ghost]').forEach(node=>node.remove());
    if(!state.draft||String(state.draft.warehouseId)!==String(model&&model.warehouseId||''))return;
    const draft=state.draft;
    normalizeSchedule(draft);
    for(let index=0;index<draft.days;index++){
      const date=addDays(draft.startDate,index);
      const cell=board.querySelector('[data-date="'+date+'"]');
      const events=cell&&cell.querySelector('.bc7-month-day-events');
      if(!events)continue;
      const item=draft.schedule[index];
      const label=item.trabaja?personName(model,item.responsable_id):'Descanso';
      const segment=document.createElement('div');
      segment.className='bc7-vp-draft-segment'+(item.trabaja===false?' is-rest':'')+(item.trabaja&&!item.responsable_id?' is-unassigned':'');
      segment.draggable=true;
      segment.dataset.bc7VpDraftSegment=String(index+1);
      segment.setAttribute('role','button');
      segment.setAttribute('tabindex','0');
      segment.setAttribute('aria-label','Borrador, día '+(index+1)+', '+label+'. Arrastra para mover el período.');
      if(index===0){
        const handle=document.createElement('button');
        handle.type='button';handle.className='bc7-vp-resize-handle';
        handle.draggable=true;handle.dataset.bc7VpResize='start';
        handle.setAttribute('aria-label','Cambiar el primer día del período');
        handle.textContent='⋮';
        segment.appendChild(handle);
      }
      const text=document.createElement('span');
      text.className='bc7-vp-draft-label';
      text.textContent=(index===0?'Borrador · ':'D'+(index+1)+' · ')+label;
      segment.appendChild(text);
      if(index===draft.days-1){
        const handle=document.createElement('button');
        handle.type='button';handle.className='bc7-vp-resize-handle';
        handle.draggable=true;handle.dataset.bc7VpResize='end';
        handle.setAttribute('aria-label','Cambiar el último día del período');
        handle.textContent='⋮';
        segment.appendChild(handle);
      }
      events.appendChild(segment);
    }
  }

  function renderGhost(model,targetDate){
    clearGhost();
    if(!state.drag||!isoDate(targetDate))return;
    const board=$('bc7-month-board');
    if(!board)return;
    const draft=state.draft;
    let start='',days=2;
    if(state.drag.type==='new'){
      start=targetDate;days=2;
    }else if(state.drag.type==='resize-end'&&draft){
      start=draft.startDate;days=dayDelta(start,targetDate)+1;
    }else if(state.drag.type==='resize-start'&&draft){
      const end=addDays(draft.startDate,draft.days-1);
      start=targetDate;days=dayDelta(start,end)+1;
    }else if(state.drag.type==='move'&&draft){
      start=targetDate;days=draft.days;
    }else if(state.drag.type==='staff'&&draft){
      const index=dayDelta(draft.startDate,targetDate);
      const cell=board.querySelector('[data-date="'+targetDate+'"]');
      if(index>=0&&index<draft.days&&cell)cell.classList.add('bc7-vp-drop-target');
      const slot=$('bc7-visual-draft-panel')?.querySelector('[data-bc7-vp-day-slot="'+index+'"]');
      if(slot)slot.classList.add('is-drop-target');
      return;
    }else return;
    const valid=days>=2&&days<=31&&start>=today();
    const occupied=[];
    if(valid){
      for(let index=0;index<days;index++){
        const date=addDays(start,index);
        const blocked=(model.rows||[]).some(row=>
          String(row.almacen_id||'')===String(model.warehouseId||'')&&
          date>=String(row.fecha||'').slice(0,10)&&
          date<=String(row.fecha_fin||row.fecha||'').slice(0,10)&&
          !['CANCELADA','CANCELADO'].includes(String(row.sesion_estado||row.estado||'').toUpperCase())
        );
        if(blocked)occupied.push(date);
      }
    }
    state.ghost={startDate:start,days,valid:valid&&occupied.length===0,occupied};
    for(let index=0;index<days;index++){
      const date=addDays(start,index);
      const cell=board.querySelector('[data-date="'+date+'"]');
      const events=cell&&cell.querySelector('.bc7-month-day-events');
      if(!events)continue;
      cell.classList.add('bc7-vp-drop-target');
      const ghost=document.createElement('div');
      ghost.dataset.bc7VpGhost='true';
      ghost.className='bc7-vp-ghost-segment'+(valid&&occupied.length===0?'':' is-conflict');
      ghost.textContent=index===0?'Vista previa · '+days+' días':(valid?'·':'Ocupado');
      events.appendChild(ghost);
    }
    const status=$('bc7-vp-gesture-status');
    if(status)status.textContent=!valid
      ?'Rango inválido. Debe durar entre 2 y 31 días y comenzar hoy o más adelante.'
      :(occupied.length?'Conflicto visible: '+occupied.join(', '):'Rango provisional · '+humanDate(start)+' → '+humanDate(addDays(start,days-1)));
  }

  function adjustRange(kind,targetDate){
    const draft=state.draft;
    if(!draft||!isoDate(targetDate))return false;
    if(kind==='move'){
      if(targetDate<today())return false;
      draft.startDate=targetDate;
    }else if(kind==='resize-end'){
      const count=dayDelta(draft.startDate,targetDate)+1;
      if(count<2||count>31)return false;
      draft.days=count;
      normalizeSchedule(draft);
    }else if(kind==='resize-start'){
      const oldStart=draft.startDate;
      const oldEnd=addDays(oldStart,draft.days-1);
      const count=dayDelta(targetDate,oldEnd)+1;
      if(targetDate<today()||count<2||count>31)return false;
      const shift=dayDelta(targetDate,oldStart);
      if(shift>0)draft.schedule=Array.from({length:shift},(_,index)=>makeDay(index)).concat(draft.schedule);
      if(shift<0)draft.schedule=draft.schedule.slice(Math.abs(shift));
      draft.startDate=targetDate;
      draft.days=count;
      normalizeSchedule(draft);
    }
    draft.schedule.forEach((item,index)=>item.numero_dia=index+1);
    invalidate(draft,'El rango cambió. Vuelve a revisar los conflictos antes de crear.');
    return true;
  }

  function assignStaff(date,personId){
    const draft=state.draft;
    if(!draft)return false;
    const index=dayDelta(draft.startDate,date);
    if(index<0||index>=draft.days)return false;
    draft.schedule[index].trabaja=true;
    draft.schedule[index].responsable_id=String(personId);
    invalidate(draft,'Se actualizó el responsable del día '+(index+1)+'. Revisa los conflictos.');
    return true;
  }

  function renderDraftPanel(model){
    const host=$('bc7-visual-draft-panel');
    if(!host)return;
    if(!state.draft){host.hidden=true;host.innerHTML='';return;}
    const draft=state.draft;
    normalizeSchedule(draft);
    host.hidden=false;
    const sameWarehouse=String(model&&model.warehouseId||'')===String(draft.warehouseId);
    const staff=model&&model.staff||[];
    const working=draft.schedule.filter(item=>item.trabaja===true).length;
    const validated=draft.validated===true&&draft.validatedSignature===signature(draft);
    const conflicts=draft.conflicts||[];
    const canCreate=!!(model&&model.admin&&model.online&&sameWarehouse&&validated&&!conflicts.length&&isComplete(draft));
    const rows=draft.schedule.map((day,index)=>{
      const date=addDays(draft.startDate,index);
      const options='<option value="">'+(day.trabaja?'Selecciona responsable':'Día de descanso')+'</option>'+staff.map(person=>
        '<option value="'+esc(person.id)+'"'+(String(person.id)===String(day.responsable_id||'')?' selected':'')+'>'+esc(person.name)+'</option>'
      ).join('');
      return '<div class="bc7-vp-day-row'+(day.trabaja?'':' is-rest')+'">'+
        '<div class="bc7-vp-day-copy"><strong>Día '+(index+1)+' · '+esc(humanDate(date))+'</strong><small>'+(day.trabaja?(day.responsable_id?'Responsable asignado':'Requiere responsable'):'Descanso')+'</small></div>'+
        '<div class="bc7-vp-day-actions"><button type="button" class="bc7-btn" data-bc7-vp-toggle-rest="'+index+'">'+(day.trabaja?'Marcar descanso':'Marcar trabajo')+'</button></div>'+
        '<label class="bc7-vp-day-person"><select data-bc7-vp-responsible="'+index+'" '+(!day.trabaja?'disabled':'')+'>'+options+'</select></label>'+
        '<div class="bc7-vp-day-slot" data-bc7-vp-day-slot="'+index+'">Arrastra aquí a un responsable para asignarlo a este día</div>'+
      '</div>';
    }).join('');
    host.innerHTML=
      '<div class="bc7-vp-draft-head"><div><span class="bc7-vp-section-kicker">BORRADOR LOCAL</span><h4>Nueva jornada · '+esc(warehouseName(model,draft.warehouseId))+'</h4></div><button type="button" class="bc7-btn" data-bc7-vp-discard>Descartar</button></div>'+
      '<p class="bc7-vp-muted">Este borrador vive solo en esta sesión del navegador. No cambia stock, caja ni jornadas hasta confirmar.</p>'+
      '<div class="bc7-vp-draft-grid">'+
        '<label class="bc7-vp-field"><span>Primer día</span><input type="date" data-bc7-vp-start value="'+esc(draft.startDate)+'"></label>'+
        '<label class="bc7-vp-field"><span>Días</span><input type="number" min="2" max="31" inputmode="numeric" data-bc7-vp-days value="'+draft.days+'"></label>'+
      '</div>'+
      (!sameWarehouse?'<p class="bc7-vp-status error">Este borrador pertenece a '+esc(warehouseName(model,draft.warehouseId))+'. Selecciona ese almacén arriba para continuar.</p>':'')+
      '<div class="bc7-vp-day-list">'+rows+'</div>'+
      '<div class="bc7-vp-draft-actions">'+
        '<button type="button" class="bc7-btn" data-bc7-vp-preview '+(!model.online||!sameWarehouse?'disabled':'')+'>Revisar conflictos</button>'+
        '<button type="button" class="bc7-btn primary" data-bc7-vp-create '+(!canCreate?'disabled':'')+'>Confirmar y crear</button>'+
      '</div>'+
      '<div class="bc7-vp-status '+(draft.messageKind||'')+'">'+esc(draft.message||'Asigna cada día y revisa el período antes de crearlo.')+'</div>'+
      (conflicts.length?'<ul class="bc7-vp-conflicts">'+conflicts.map(item=>'<li>'+esc(humanDate(item.date))+': '+esc(item.detail)+'</li>').join('')+'</ul>':'')+
      '<p class="bc7-vp-muted">'+esc(draft.validationNote||'La revisión consulta las programaciones visibles. El servidor vuelve a validar todos los conflictos al crear.')+'</p>'+
      '<div class="bc7-vp-status" id="bc7-vp-gesture-status" aria-live="polite"></div>'+
      '<p class="bc7-vp-muted">'+working+' día(s) laborable(s) · '+(draft.days-working)+' día(s) de descanso · '+(isComplete(draft)?'responsables completos':'faltan responsables')+'</p>';
  }

  async function runPreview(){
    const bridge=api(),model=snapshot(),draft=state.draft;
    if(!draft||!bridge||!model)return;
    if(!model.admin||!model.online){
      draft.message='Solo Administración conectada puede revisar y crear programaciones.';
      draft.messageKind='error';render();return;
    }
    if(String(model.warehouseId)!==String(draft.warehouseId)){
      draft.message='Vuelve a seleccionar el almacén del borrador.';
      draft.messageKind='error';render();return;
    }
    if(!isComplete(draft)){
      draft.message='Asigna una persona activa a cada día laborable antes de revisar.';
      draft.messageKind='error';render();return;
    }
    const before=signature(draft);
    draft.message='Consultando jornadas y responsables visibles…';
    draft.messageKind='';renderDraftPanel(model);
    try{
      const result=await bridge.previewDraft({
        warehouseId:draft.warehouseId,
        startDate:draft.startDate,
        days:draft.days,
        schedule:draft.schedule
      });
      if(!state.draft||signature(state.draft)!==before)return;
      draft.validated=result.valid===true;
      draft.validatedSignature=draft.validated?before:'';
      draft.conflicts=result.conflicts||[];
      draft.validationNote=result.note||'El servidor validará de nuevo antes de guardar.';
      draft.message=draft.validated
        ?'Revisión sin conflictos visibles. El servidor volverá a validar al confirmar.'
        :'Se encontraron conflictos. Corrige los días marcados y vuelve a revisar.';
      draft.messageKind=draft.validated?'ok':'error';
    }catch(error){
      draft.validated=false;draft.validatedSignature='';
      draft.message=String(error&&error.message||error||'No se pudo revisar la programación.');
      draft.messageKind='error';
    }
    render();
  }

  async function runCreate(button){
    const bridge=api(),model=snapshot(),draft=state.draft;
    if(!draft||!bridge||!model||!model.admin||!model.online)return;
    if(!draft.validated||draft.validatedSignature!==signature(draft)){
      draft.message='Primero pulsa «Revisar conflictos».';
      draft.messageKind='error';render();return;
    }
    if(!isComplete(draft)){
      draft.message='Asigna a una persona activa a cada día laborable.';
      draft.messageKind='error';render();return;
    }
    button.disabled=true;button.textContent='Validando y creando…';
    const before=signature(draft);
    try{
      const result=await bridge.createDraft({
        warehouseId:draft.warehouseId,
        startDate:draft.startDate,
        days:draft.days,
        schedule:draft.schedule
      },button);
      if(!state.draft)return;
      if(result&&result.ok){
        state.draft=null;
        state.movementCache.clear();
        announce('La programación fue confirmada y guardada por el servidor.','ok');
        await bridge.selectDate(draft.startDate);
        render();
      }else{
        draft.validated=false;draft.validatedSignature='';
        draft.conflicts=result&&result.validation&&result.validation.conflicts||[];
        draft.message=String(result&&result.message||'El servidor no confirmó la creación. El borrador se conserva.');
        draft.messageKind='error';render();
      }
    }catch(error){
      draft.validated=false;draft.validatedSignature='';
      draft.message=String(error&&error.message||error||'No se pudo crear la programación. El borrador se conserva.');
      draft.messageKind='error';render();
    }
  }

  function movementTypeInfo(type){
    const value=String(type||'').toLowerCase();
    if(value.includes('compra'))return {icon:'🛒',name:'Compras'};
    if(value.includes('venta'))return {icon:'🧾',name:'Ventas'};
    if(value.includes('transferencia'))return {icon:'🔄',name:'Transferencias'};
    if(value.includes('merma'))return {icon:'⚠️',name:'Mermas'};
    if(value.includes('baja'))return {icon:'🗑️',name:'Bajas'};
    if(value.includes('vale'))return {icon:'📦',name:'Vales'};
    if(value.includes('gasto'))return {icon:'💸',name:'Gastos'};
    if(value.includes('reinversion'))return {icon:'♻️',name:'Reinversiones'};
    if(value.includes('entrega')||value.includes('dinero'))return {icon:'💰',name:'Efectivo'};
    return {icon:'•',name:String(type||'Otros')};
  }
  function renderMovementPanel(model){
    const host=$('bc7-visual-activity');
    if(!host)return;
    const row=(model.selectedRows||[]).find(item=>item&&item.sesion_id&&item.trabaja!==false);
    if(!row){
      host.innerHTML='<div class="bc7-vp-section-kicker">ACTIVIDAD REAL</div><p class="bc7-vp-muted">El día seleccionado no tiene una sesión laborable vinculada, por lo que no se muestran movimientos.</p>';
      return;
    }
    const sessionId=String(row.sesion_id),cached=state.movementCache.get(sessionId);
    if(!cached){
      host.innerHTML='<div class="bc7-vp-section-kicker">ACTIVIDAD REAL · '+esc(humanDate(row.fecha))+'</div><p class="bc7-vp-muted">Consultando movimientos atribuidos a esta sesión…</p>';
      if(state.movementLoading.has(sessionId))return;
      state.movementLoading.add(sessionId);
      const request=++state.movementRequest;
      api().loadMovements(sessionId).then(rows=>{
        state.movementCache.set(sessionId,Array.isArray(rows)?rows:[]);
      }).catch(error=>{
        state.movementCache.set(sessionId,{error:String(error&&error.message||error||'No se pudieron consultar los movimientos.')});
      }).finally(()=>{
        state.movementLoading.delete(sessionId);
        const current=snapshot();
        const selected=(current&&current.selectedRows||[]).some(item=>String(item.sesion_id||'')===sessionId);
        if(selected&&request<=state.movementRequest)renderMovementPanel(current);
      });
      return;
    }
    host.innerHTML='<div class="bc7-vp-section-kicker">ACTIVIDAD REAL · '+esc(humanDate(row.fecha))+'</div>';
    if(!Array.isArray(cached)){
      host.innerHTML+='<p class="bc7-vp-status error">'+esc(cached.error)+'</p>';
      return;
    }
    if(!cached.length)host.innerHTML+='<p class="bc7-vp-muted">No hay movimientos atribuidos a esta sesión.</p>';
    else{
      const groups=new Map();
      cached.forEach(item=>{
        const info=movementTypeInfo(item.tipo);
        const key=String(item.tipo||'otro');
        const entry=groups.get(key)||{info,count:0};
        entry.count++;groups.set(key,entry);
      });
      host.innerHTML+='<div class="bc7-vp-movement-groups">'+Array.from(groups.entries()).map(([key,entry])=>
        '<span class="bc7-vp-movement-amulet" title="'+esc(key)+'">'+entry.info.icon+' '+esc(entry.info.name)+' <small>'+entry.count+'</small></span>'
      ).join('')+'</div>';
      host.innerHTML+='<div class="bc7-vp-movement-list">'+cached.slice(0,16).map(item=>
        '<div class="bc7-vp-movement-item"><span>'+esc(item.producto||item.tipo||'Movimiento')+'<small>'+esc(item.tipo||'')+' · '+esc(item.usuario||'')+'</small></span><span class="bc7-vp-movement-value">'+(item.cantidad==null?'':esc(item.cantidad))+'</span></div>'
      ).join('')+'</div>';
      if(cached.length>16)host.innerHTML+='<p class="bc7-vp-muted">Se muestran 16 de '+cached.length+' movimientos.</p>';
    }
    host.innerHTML+='<button type="button" class="bc7-btn" data-bc7-vp-open-session="'+esc(sessionId)+'">Abrir detalle de esta jornada</button>';
    host.innerHTML+='<p class="bc7-vp-muted">Amuletos informativos. Consultarlos no cambia inventario, caja ni atribuciones.</p>';
  }

  function render(){
    const model=snapshot();
    if(!model)return;
    ensureStyles();
    renderToolbox(model);
    renderDraftPanel(model);
    renderDraftSegments(model);
    renderMovementPanel(model);
  }
  function createTransfer(event,type){
    const data=event&&event.dataTransfer;
    if(!data)return;
    try{
      data.effectAllowed=type==='staff'||type==='new'?'copy':'move';
      data.setData(MIME,type);
      data.setData('text/plain','bc7-visual-planner:'+type);
    }catch(_){}
  }
  function onDragStart(event){
    const target=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-tool],[data-bc7-vp-staff],[data-bc7-vp-resize],[data-bc7-vp-draft-segment]'):null;
    if(!target)return;
    if(target.hasAttribute('data-bc7-vp-tool')){
      state.drag={type:'new'};createTransfer(event,'new');
    }else if(target.hasAttribute('data-bc7-vp-staff')){
      state.drag={type:'staff',staffId:target.getAttribute('data-bc7-vp-staff')};createTransfer(event,'staff');
    }else if(target.hasAttribute('data-bc7-vp-resize')){
      state.drag={type:'resize-'+target.getAttribute('data-bc7-vp-resize')};createTransfer(event,state.drag.type);
    }else if(target.hasAttribute('data-bc7-vp-draft-segment')){
      state.drag={type:'move'};createTransfer(event,'move');
    }else return;
    event.stopPropagation();
  }
  function onDragOver(event){
    if(!state.drag)return;
    const cell=event.target&&event.target.closest?event.target.closest('#bc7-month-board .bc7-month-day[data-date]'):null;
    const slot=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-day-slot]'):null;
    if(!cell&&!slot)return;
    event.preventDefault();
    if(event.dataTransfer)event.dataTransfer.dropEffect=state.drag.type==='staff'||state.drag.type==='new'?'copy':'move';
    const model=snapshot();
    if(state.drag.type==='staff'){
      clearGhost();
      const date=(cell&&cell.dataset.date)||(slot&&state.draft?addDays(state.draft.startDate,Number(slot.dataset.bc7VpDaySlot)):'');
      const index=state.draft&&isoDate(date)?dayDelta(state.draft.startDate,date):-1;
      if(index>=0&&index<state.draft.days){
        if(cell)cell.classList.add('bc7-vp-drop-target');
        const drop=$('bc7-visual-draft-panel')?.querySelector('[data-bc7-vp-day-slot="'+index+'"]');
        if(drop)drop.classList.add('is-drop-target');
      }
      return;
    }
    if(cell)renderGhost(model,cell.dataset.date);
  }
  function onDrop(event){
    if(!state.drag)return;
    const cell=event.target&&event.target.closest?event.target.closest('#bc7-month-board .bc7-month-day[data-date]'):null;
    const slot=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-day-slot]'):null;
    if(!cell&&!slot)return;
    event.preventDefault();event.stopPropagation();
    const date=(cell&&cell.dataset.date)||(slot&&state.draft?addDays(state.draft.startDate,Number(slot.dataset.bc7VpDaySlot)):'');
    const drag=state.drag;
    if(drag.type==='new'){
      newDraft(date,snapshot());
    }else if(drag.type==='staff'){
      if(assignStaff(date,drag.staffId))render();
      else announce('Suelta a la persona en un día del borrador.','error');
    }else if(['move','resize-start','resize-end'].includes(drag.type)){
      if(adjustRange(drag.type,date))render();
      else announce('El rango debe durar entre 2 y 31 días y no puede comenzar en el pasado.','error');
    }
    clearDrag();
    renderDraftSegments(snapshot());
  }
  function onDragEnd(){
    if(state.drag){state.drag=null;clearGhost();renderDraftSegments(snapshot());}
  }
  function onClick(event){
    const tool=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-tool="new"]'):null;
    if(tool){event.preventDefault();newDraft(snapshot()?.selectedDate||today(),snapshot());return;}
    const segment=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-draft-segment]'):null;
    if(segment){const model=snapshot();if(model)api().selectDate(addDays(state.draft.startDate,Number(segment.dataset.bc7VpDraftSegment)-1));return;}
    const toggle=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-toggle-rest]'):null;
    if(toggle&&state.draft){
      const index=Number(toggle.dataset.bc7VpToggleRest),item=state.draft.schedule[index];
      if(item){item.trabaja=!item.trabaja;if(!item.trabaja)item.responsable_id=null;invalidate(item.trabaja?'El día vuelve a ser laborable. Asigna responsable y revisa.':'Día marcado como descanso. Revisa de nuevo.');render();}
      return;
    }
    const preview=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-preview]'):null;
    if(preview){event.preventDefault();runPreview();return;}
    const create=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-create]'):null;
    if(create){event.preventDefault();runCreate(create);return;}
    const discard=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-discard]'):null;
    if(discard){state.draft=null;clearGhost();render();return;}
    const open=event.target&&event.target.closest?event.target.closest('[data-bc7-vp-open-session]'):null;
    if(open){api().openSessionMovements(open.dataset.bc7VpOpenSession);return;}
  }
  function onChange(event){
    const target=event.target;
    if(!state.draft||!target)return;
    if(target.matches&&target.matches('[data-bc7-vp-start]')){
      if(!isoDate(target.value)||target.value<today()){
        announce('La fecha inicial debe ser hoy o futura.','error');
        renderDraftPanel(snapshot());return;
      }
      const newEnd=addDays(target.value,state.draft.days-1);
      const count=dayDelta(target.value,newEnd)+1;
      if(count<2||count>31){announce('La duración debe mantenerse entre 2 y 31 días.','error');renderDraftPanel(snapshot());return;}
      state.draft.startDate=target.value;
      invalidate('Cambió la fecha inicial. Revisa de nuevo los conflictos.');
      render();return;
    }
    if(target.matches&&target.matches('[data-bc7-vp-days]')){
      const count=Number(target.value);
      if(!Number.isInteger(count)||count<2||count>31){announce('La duración debe estar entre 2 y 31 días.','error');renderDraftPanel(snapshot());return;}
      state.draft.days=count;normalizeSchedule(state.draft);
      invalidate('Cambió la duración. Revisa de nuevo los conflictos.');
      render();return;
    }
    if(target.matches&&target.matches('[data-bc7-vp-responsible]')){
      const index=Number(target.dataset.bc7VpResponsible),day=state.draft.schedule[index];
      if(day&&day.trabaja){day.responsable_id=target.value||null;invalidate('Cambió el responsable. Revisa de nuevo los conflictos.');render();}
    }
  }

  function attach(){
    if(state.attached||!api())return;
    state.attached=true;
    ensureStyles();
    window.addEventListener('bc7:visual-calendar-updated',render);
    document.addEventListener('dragstart',onDragStart);
    document.addEventListener('dragover',onDragOver);
    document.addEventListener('drop',onDrop);
    document.addEventListener('dragend',onDragEnd);
    document.addEventListener('click',onClick);
    document.addEventListener('change',onChange);
    render();
  }
  window.__BC7_VISUAL_PLANNER_ATTACH__=attach;
  if(api())attach();
})();