// BattleCruiser Step 7 — Jornada única, inventario físico, movimientos y cierre
// v7.71 — restore archived and multi-day calendar periods; simplify Jornada planning.
(function bc7JornadaUI(){
  'use strict';
  if(window.__BC7_JORNADA_UI__) return;
  window.__BC7_JORNADA_UI__=true;

  const state={admin:false,rows:[],calendarRows:[],selected:null,detail:null,loading:false,warehouseId:'',visualWarehouseId:'',lastPreview:null,calendarSelectedDate:null,periodMoveDraft:null,periodMoveDrag:null,periodMoveDragRowsPromise:null,periodMoveDragRows:null,periodMoveDragPreview:null,workspaceTab:'inventario',staffLoading:false,staffLoaded:false,staffError:'',dailyCashData:null,dailyCashSessionId:null,dailyCashStatus:null,inventorySettlement:null,currentSession:null,receiveAttempts:{},workspaceRequestVersion:0,workspaceOperationSessionId:null,workspaceOperationPromise:null,workspaceOperationLoaded:false,calendarLoading:false,calendarLoadError:'',calendarCache:new Map(),calendarPromises:new Map(),calendarRevision:0};
  let warehouseLoadPromise=null,staffLoadPromise=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
  const dateHavana=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function addDays(s,n){const d=new Date(String(s||dateHavana())+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(n||0));return d.toISOString().slice(0,10);}
  function successorEndDate(delivery){
    const ordinal=value=>{const parts=String(value||'').slice(0,10).split('-').map(Number);if(parts.length!==3||parts.some(n=>!Number.isFinite(n)))return NaN;return Date.UTC(parts[0],parts[1]-1,parts[2]);};
    const start=ordinal(delivery&&delivery.fecha_inicio),end=ordinal(delivery&&delivery.fecha_fin_anterior);
    const days=Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.floor((end-start)/86400000)+1:1;
    return addDays(delivery&&delivery.fecha_destino,Math.max(0,days-1));
  }
  function fmtDate(v){const s=String(v||'').slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s||'—';}
  function fmtDateTimeHavana(v){if(!v)return '—';const d=new Date(v);if(!Number.isFinite(d.getTime()))return String(v);return new Intl.DateTimeFormat('es-CU',{timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
  function fmtDateHuman(v){const p=String(v||'').slice(0,10).split('-').map(Number);if(p.length!==3||!p[0]||!p[1]||!p[2])return fmtDate(v);return new Intl.DateTimeFormat('es-ES',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(Date.UTC(p[0],p[1]-1,p[2],12)));}
  function monthParts(value){
    const match=String(value||'').match(/^(\d{4})-(\d{2})$/);
    if(!match)return null;
    const year=Number(match[1]),month=Number(match[2]);
    if(month<1||month>12)return null;
    return {year,month};
  }
  function monthDayCount(value){
    const parts=monthParts(value);
    return parts?new Date(Date.UTC(parts.year,parts.month,0)).getUTCDate():0;
  }
  function shiftMonth(value,delta){
    const parts=monthParts(value)||monthParts(dateHavana().slice(0,7));
    const date=new Date(Date.UTC(parts.year,parts.month-1+Number(delta||0),1,12));
    return date.toISOString().slice(0,7);
  }
  function monthTitle(value){
    const parts=monthParts(value);
    if(!parts)return 'Calendario';
    return new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'})
      .format(new Date(Date.UTC(parts.year,parts.month-1,1,12)));
  }
  function calendarStatus(row){
    const status=String(row&&(row.sesion_estado||row.estado)||'').toUpperCase();
    const master=String(row&&(row.turno_estado_maestro||row.turno_estado)||'').toUpperCase();
    if(!row)return {kind:'other',short:'Programada',label:'Programada'};
    if(row.trabaja===false||status==='DESCANSO')return {kind:'scheduled',short:'Programada',label:'Programada'};
    if(status==='EN_CURSO')return {kind:'running',short:'En curso',label:'En curso'};
    if(['COMPLETADA','CERRADA','CERRADO','CERRADA_OPERATIVAMENTE'].includes(status)&&master==='CERRADO')return {kind:'closed',short:'Aprobada',label:'Aprobada y cerrada por el Dueño'};
    if(status==='CERRADA_OPERATIVAMENTE')return {kind:'sealed',short:'Pendiente de cuadre',label:'Pendiente de cuadre · cierre operativo realizado'};
    if(['COMPLETADA','CERRADA','CERRADO'].includes(status)&&['EN_CURSO','PENDIENTE_APROBACION'].includes(master))return {kind:'review',short:'Pendiente de cierre',label:'Jornada completada · pendiente de revisión y cierre del Turno maestro'};
    if((['COMPLETADA','CERRADA','CERRADO'].includes(status)&&master==='CERRADO')||['CANCELADA','CANCELADO'].includes(status))return {kind:'closed',short:'Archivada',label:humanStatus(status)};
    if(['PROGRAMADA','PROGRAMADO','PENDIENTE'].includes(status))return {kind:'scheduled',short:'Programada',label:'Programada'};
    return {kind:'other',short:humanStatus(status),label:humanStatus(status)};
  }
  function jornadaRangeStart(row){return String(row&&row.fecha||'').slice(0,10);}
  function jornadaRangeEnd(row){const start=jornadaRangeStart(row),candidate=String(row&&(row.fecha_fin||row.fecha)||start).slice(0,10);return candidate>=start?candidate:start;}
  function jornadaCoversDate(row,date){const start=jornadaRangeStart(row),end=jornadaRangeEnd(row);return !!start&&start<=date&&end>=date;}
  function groupJornadaPeriods(rows){
    const groups=new Map();
    arr(rows).forEach((row,index)=>{
      const parent=String(row&&row.turno_id||'').trim(),key=parent?'turno:'+parent:'programacion:'+(row&&row.id||row&&row.sesion_id||index);
      if(!groups.has(key))groups.set(key,{...row,_periodRows:[],_periodKey:key});
      groups.get(key)._periodRows.push(row);
    });
    return Array.from(groups.values()).map(group=>{
      const items=group._periodRows.slice().sort((a,b)=>jornadaRangeStart(a).localeCompare(jornadaRangeStart(b))||Number(a.numero_dia||0)-Number(b.numero_dia||0));
      const first=items[0]||group,start=String(first.turno_fecha_inicio||periodStartForRow(first)||jornadaRangeStart(first)).slice(0,10);
      const count=Number(first.dias_turno||0),declaredEnd=count>0?addDays(start,count-1):'';
      const ends=items.map(item=>String(item.fecha_fin||item.fecha||'').slice(0,10)).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value));
      if(declaredEnd)ends.push(declaredEnd);
      const end=ends.reduce((latest,value)=>value>latest?value:latest,start);
      const span=Math.max(1,Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1);
      const work=items,ids=Array.from(new Set(work.filter(item=>item.responsable_id).map(item=>String(item.responsable_id))));
      const priority=status=>{const value=String(status||'').toUpperCase();return value==='EN_CURSO'?0:value==='CERRADA_OPERATIVAMENTE'?1:value==='COMPLETADA'?2:['PROGRAMADA','PROGRAMADO'].includes(value)?3:['CANCELADA','CANCELADO'].includes(value)?5:4;};
      const sorted=work.slice().sort((a,b)=>priority(a.sesion_estado||a.estado)-priority(b.sesion_estado||b.estado));
      group._periodRows=items;group._periodDays=count>0?count:span;
      group._workingDays=work.length;
      group._responsibleIds=ids;group._responsibleLabel=ids.length===1?userName(ids[0]):ids.length>1?'Varios responsables':'Sin asignar';
      group._displayStatusRow=sorted[0]||first;group.fecha=start;group.fecha_fin=end;group.dias_turno=group._periodDays;
      group.trabaja=work.length>0;group.responsable_id=ids.length===1?ids[0]:null;
      group.sesion_id=(sorted.find(item=>item.sesion_id)||first).sesion_id||null;
      group.sesion_estado=group._displayStatusRow.sesion_estado||group._displayStatusRow.estado||'';
      return group;
    });
  }

  function renderVisualWarehouseSelector(){
    const options=warehouses();
    const current=String(state.visualWarehouseId||'');
    const formValue=String($('bc7-warehouse')?.value||'');
    const firstRow=arr(state.calendarRows||state.rows).find(row=>row&&row.almacen_id);
    const rowValue=String(firstRow&&firstRow.almacen_id||'');
    if(!options.some(item=>String(item.id)===current)){
      state.visualWarehouseId=options.some(item=>String(item.id)===formValue)?formValue:
        (options.some(item=>String(item.id)===rowValue)?rowValue:
        (options.length?String(options[0].id):rowValue));
    }
    const selected=String(state.visualWarehouseId||'');
    const select=$('bc7-visual-warehouse');
    if(select){
      const rows=options.slice();
      if(selected&&!rows.some(item=>String(item.id)===selected)){
        rows.push({id:selected,nombre:warehouseName(selected)});
      }
      select.innerHTML=rows.length
        ?rows.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.nombre||item.id)+'</option>').join('')
        :'<option value="">Cargando almacenes…</option>';
      select.value=selected;
      select.disabled=rows.length===0;
    }
    return selected;
  }
  function visualBoardRows(){
    const warehouseId=renderVisualWarehouseSelector();
    if(!warehouseId)return [];
    return arr(state.calendarRows||state.rows).filter(row=>String(row&&row.almacen_id||'')===String(warehouseId));
  }
  function notifyVisualCalendarUpdated(){
    try{window.dispatchEvent(new Event('bc7:visual-calendar-updated'));}catch(_){}
  }
  function renderMonthCalendar(month,rows){
    const host=$('bc7-month-board');
    if(!host)return;
    const parts=monthParts(month);
    if(!parts){host.innerHTML='<div class="bc7-empty">Elige un mes válido.</div>';return;}
    const count=monthDayCount(month);
    const first=new Date(Date.UTC(parts.year,parts.month-1,1,12));
    const offset=(first.getUTCDay()+6)%7;
    const cells=Math.ceil((offset+count)/7)*7;
    const weekdays=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const today=dateHavana();
    const periods=groupJornadaPeriods(rows);
    let html=weekdays.map(day=>'<div class="bc7-month-weekday" role="columnheader">'+day+'</div>').join('');
    for(let index=0;index<cells;index++){
      const date=new Date(Date.UTC(parts.year,parts.month-1,1+index-offset,12));
      const iso=date.toISOString().slice(0,10);
      const dayRows=periods.filter(period=>jornadaCoversDate(period,iso)).sort((a,b)=>jornadaRangeStart(a).localeCompare(jornadaRangeStart(b))||jornadaRangeEnd(a).localeCompare(jornadaRangeEnd(b)));
      const inside=iso.slice(0,7)===month;
      const selected=state.calendarSelectedDate===iso;
      const classes=['bc7-month-day'];
      if(!inside)classes.push('bc7-month-day--outside');
      if(selected)classes.push('bc7-month-day--selected');
      if(today===iso)classes.push('bc7-month-day--today');
      const chips=dayRows.slice(0,2).map(period=>{
        const daily=period._periodRows.find(item=>jornadaRangeStart(item)===iso)||period._displayStatusRow||period;
        const stateInfo=calendarStatus(daily),person=period._responsibleLabel||'Sin asignar';
        const rangeStart=jornadaRangeStart(period),rangeEnd=jornadaRangeEnd(period),multiDay=rangeEnd>rangeStart;
        const weekContinuation=multiDay&&iso>rangeStart&&new Date(iso+'T12:00:00Z').getUTCDay()===1;
        const segmentStart=iso===rangeStart||weekContinuation,segmentEnd=iso===rangeEnd;
        const chipClasses=['bc7-month-chip','is-'+stateInfo.kind];
        if(multiDay)chipClasses.push('is-multi-day',segmentStart?'is-range-start':(segmentEnd?'is-range-end':'is-range-middle'));
        if(weekContinuation)chipClasses.push('is-range-week-continuation');
        const periodLabel=fmtDateHuman(rangeStart)+(multiDay?' — '+fmtDateHuman(rangeEnd):'');
        const title=periodLabel+' · '+person+' · '+stateInfo.label+' · '+period._periodDays+' día(s)';
        const moveSource=(period._periodRows||[]).find(row=>canOfferPeriodMove(row))||null;
        const canMove=!!moveSource;
        const drag=canMove?' draggable="true" data-bc7-period-drag="'+esc(moveSource.id)+'" title="'+esc(title+' · Arrastra para proponer el traslado del período')+'" aria-grabbed="false"':' title="'+esc(title)+'"';
        const visibleName=!multiDay||segmentStart?person:'',visibleStatus=!multiDay||segmentStart?stateInfo.short:'';
        return '<button type="button" class="'+chipClasses.join(' ')+'" data-bc7-period-id="'+esc(period._periodKey)+'" data-bc7-calendar-select="'+iso+'"'+drag+' aria-label="'+esc(title+(canMove?' · Arrastrable; también puedes usar el botón Mover período completo':''))+'"><span class="bc7-month-chip-dot" aria-hidden="true"></span><span class="bc7-month-chip-person">'+esc(visibleName)+'</span><span class="bc7-month-chip-status">'+esc(visibleStatus)+'</span></button>';
      }).join('');
      const more=dayRows.length>2?'<button type="button" class="bc7-month-more" data-bc7-calendar-select="'+iso+'">+'+(dayRows.length-2)+' más</button>':'';
      const empty=inside&&!dayRows.length?'<span class="bc7-month-empty">—</span>':'';
      html+='<div class="'+classes.join(' ')+'" data-date="'+iso+'" role="gridcell" aria-selected="'+(selected?'true':'false')+'"><div class="bc7-month-day-top"><button type="button" class="bc7-month-date" '+(!inside?'disabled':'')+' data-bc7-calendar-select="'+iso+'" aria-label="'+esc(fmtDateHuman(iso))+'" aria-pressed="'+(selected?'true':'false')+'">'+date.getUTCDate()+'</button>'+(today===iso?'<span class="bc7-month-today-tag">HOY</span>':'')+(dayRows.length?'<span class="bc7-month-count">'+dayRows.length+'</span>':'')+'</div><div class="bc7-month-day-events">'+chips+more+empty+'</div></div>';
    }
    host.innerHTML=html;
    const weekRows=cells/7;
    host.style.display='grid';host.style.gridTemplateColumns='repeat(7,minmax(0,1fr))';
    host.style.gridTemplateRows='34px repeat('+weekRows+',minmax(62px,1fr))';
    host.setAttribute('role','grid');host.setAttribute('aria-colcount','7');host.setAttribute('aria-rowcount',String(weekRows+1));
    const label=$('bc7-month-label');
    if(label)label.textContent=monthTitle(month);
  }
  function renderCalendarDetail(date,rows){
    const host=$('bc7-calendar-detail');
    if(!host)return;
    const dayPeriods=groupJornadaPeriods(rows).filter(period=>jornadaCoversDate(period,date))
      .sort((a,b)=>jornadaRangeStart(a).localeCompare(jornadaRangeStart(b))||jornadaRangeEnd(a).localeCompare(jornadaRangeEnd(b)));
    const title=fmtDateHuman(date);
    host.innerHTML='<div class="bc7-calendar-detail-head"><div><span class="bc7-muted">DÍA SELECCIONADO</span><h4>'+esc(title)+'</h4></div><span class="bc7-calendar-detail-count">'+dayPeriods.length+' '+(dayPeriods.length===1?'jornada':'jornadas')+'</span></div>'+(dayPeriods.length?'<div class="bc7-calendar-detail-list">'+dayPeriods.map(periodGroupHtml).join('')+'</div>':'<div class="bc7-empty">No hay una jornada programada para esta fecha. Puedes elegir otro día o crear una programación desde el panel de administrador.</div>');
    renderPeriodMovePreview();
  }
  function selectCalendarDate(date){
    const month=$('bc7-calendar-month')?.value||dateHavana().slice(0,7);
    if(String(date||'').slice(0,7)!==month)return;
    state.calendarSelectedDate=date;
    const rows=visualBoardRows();
    renderMonthCalendar(month,rows);
    renderCalendarDetail(date,rows);
    notifyVisualCalendarUpdated();
  }
  function periodStartForRow(row){
    const day=Number(row&&row.numero_dia);
    const date=String(row&&row.fecha||'').slice(0,10);
    if(!Number.isInteger(day)||day<1||day>31||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
    return addDays(date,1-day);
  }
  function isMovablePeriodDay(row){
    if(!row||!row.id||!row.turno_id||!row.fecha||!row.numero_dia)return false;
    const programState=String(row.estado||'').toUpperCase();
    const sessionState=String(row.sesion_estado||'').toUpperCase();
    if(row.fecha_fin&&String(row.fecha_fin).slice(0,10)!==String(row.fecha).slice(0,10))return false;
    const start=periodStartForRow(row);
    if(!start||start<dateHavana())return false;
    if(row.trabaja===true){
      return programState==='PROGRAMADA'&&!!row.sesion_id&&['PENDIENTE','PROGRAMADA'].includes(sessionState);
    }
    return row.trabaja===false&&programState==='DESCANSO'&&(!row.sesion_id||sessionState==='CANCELADA');
  }
  function canOfferPeriodMove(row){
    if(!state.admin||!navigator.onLine||!isMovablePeriodDay(row))return false;
    // When any visible day belonging to this Turno has started, been closed or
    // become a consolidated range, suppress every drag/action for the same period.
    const visiblePeriod=state.rows.filter(item=>String(item&&item.turno_id||'')===String(row.turno_id||''));
    return visiblePeriod.every(isMovablePeriodDay);
  }
  function validateMovablePeriod(sourceRow,rows){
    if(!state.admin)throw new Error('Solo Administración puede mover un período completo.');
    if(!canOfferPeriodMove(sourceRow))throw new Error('Esta jornada no está disponible para reprogramación como período completo.');
    const period=arr(rows).filter(row=>String(row&&row.turno_id||'')===String(sourceRow.turno_id||''))
      .sort((a,b)=>Number(a.numero_dia)-Number(b.numero_dia));
    if(period.length<2||period.length>31)throw new Error('No se pudo confirmar la duración completa del período. Debe contener entre 2 y 31 días.');
    const originalStart=periodStartForRow(period[0]);
    if(!originalStart||originalStart!==String(period[0].fecha).slice(0,10)||originalStart<dateHavana())
      throw new Error('El período ya comenzó o su fecha inicial no es válida.');
    const warehouseId=String(sourceRow.almacen_id||'');
    const ids=new Set();
    for(let i=0;i<period.length;i++){
      const row=period[i],number=Number(row.numero_dia),date=String(row.fecha||'').slice(0,10);
      if(number!==i+1||ids.has(String(row.id))||String(row.almacen_id||'')!==warehouseId||
         String(row.fecha_fin||row.fecha).slice(0,10)!==date||date!==addDays(originalStart,i))
        throw new Error('La programación está incompleta o contiene un rango consolidado. No se ha cambiado ninguna fecha.');
      ids.add(String(row.id));
      const programState=String(row.estado||'').toUpperCase();
      const sessionState=String(row.sesion_estado||'').toUpperCase();
      if(row.trabaja===true){
        if(programState!=='PROGRAMADA'||!row.sesion_id||!['PENDIENTE','PROGRAMADA'].includes(sessionState))
          throw new Error('Al menos un día ya comenzó, se cerró o no tiene una sesión futura coherente.');
      }else if(row.trabaja===false){
        if(programState!=='DESCANSO'||(row.sesion_id&&sessionState!=='CANCELADA'))
          throw new Error('Una fecha tiene una sesión incompatible; el período debe revisarse antes de moverlo.');
      }else{
        throw new Error('El período contiene una fecha con datos de programación no válidos.');
      }
    }
    if(!period.some(row=>String(row.id)===String(sourceRow.id)))
      throw new Error('La jornada seleccionada no pertenece a la programación completa devuelta por el servidor.');
    return {turnoId:String(sourceRow.turno_id),warehouseId,rows:period,originalStart,days:period.length,originalEnd:addDays(originalStart,period.length-1)};
  }
  async function fetchMovablePeriod(sourceRow){
    if(!navigator.onLine)throw new Error('Conéctate para consultar y reprogramar el período. No se guardará nada sin conexión.');
    const start=periodStartForRow(sourceRow);
    if(!start||start<dateHavana())throw new Error('Solo se pueden mover períodos que todavía no han comenzado.');
    const rows=arr(await rpc('bc5_mis_jornadas',{p_fecha_inicio:start,p_fecha_fin:addDays(start,30)}));
    return validateMovablePeriod(sourceRow,rows);
  }
  function periodMoveRangeText(draft){
    if(!draft)return '';
    return fmtDateHuman(draft.nextStart)+' — '+fmtDateHuman(addDays(draft.nextStart,draft.days-1))+' · '+draft.days+' días';
  }
  function renderPeriodMoveGhost(){
    const board=$('bc7-month-board');
    if(!board)return;
    board.querySelectorAll('.bc7-month-day').forEach(cell=>{
      cell.classList.remove('bc7-month-day--move-preview','bc7-month-day--move-start','bc7-month-day--move-end','bc7-month-day--drag-hover');
      const label=cell.querySelector('.bc7-month-move-ghost');
      if(label)label.remove();
    });
    const draft=state.periodMoveDraft;
    const drag=state.periodMoveDragPreview;
    const preview=draft||drag;
    if(!preview)return;
    const start=String(preview.nextStart||preview.start||'').slice(0,10);
    const days=Number(preview.days||1);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isInteger(days)||days<1)return;
    const end=addDays(start,days-1);
    board.querySelectorAll('.bc7-month-day[data-date]').forEach(cell=>{
      const date=cell.getAttribute('data-date');
      if(date<start||date>end)return;
      cell.classList.add('bc7-month-day--move-preview');
      if(date===start)cell.classList.add('bc7-month-day--move-start');
      if(date===end)cell.classList.add('bc7-month-day--move-end');
      if(date===start||date===end){
        const label=document.createElement('span');
        label.className='bc7-month-move-ghost';
        label.textContent=date===start?'INICIO PROPUESTO':'FIN PROPUESTO';
        cell.querySelector('.bc7-month-day-top')?.appendChild(label);
      }
    });
    if(drag&&drag.targetDate){
      const target=board.querySelector('.bc7-month-day[data-date="'+drag.targetDate+'"]');
      if(target)target.classList.add('bc7-month-day--drag-hover');
    }
  }
  function syncPeriodMovePreview(form){
    const draft=state.periodMoveDraft;
    if(!draft||!form)return;
    const input=form.querySelector('[data-bc7-period-start]');
    const reason=form.querySelector('[data-bc7-period-reason]');
    const start=String(input&&input.value||'').slice(0,10);
    const reasonValue=String(reason&&reason.value||draft.reason||'');
    draft.reason=reasonValue;
    const range=form.querySelector('[data-bc7-period-range]');
    const button=form.querySelector('[data-bc7-period-confirm]');
    const valid=/^\d{4}-\d{2}-\d{2}$/.test(start)&&start>=dateHavana()&&start!==draft.originalStart;
    draft.nextStart=start;
    if(range)range.textContent=valid
      ?'Nuevo período: '+periodMoveRangeText(draft)
      :'Selecciona una nueva fecha de inicio futura, distinta de la actual.';
    if(button)button.disabled=!valid||!String(reason&&reason.value||'').trim()||!navigator.onLine;
    draft.idempotencyKey=null;
    renderPeriodMoveGhost();
  }
  function renderPeriodMovePreview(){
    const container=$('bc7-calendar-section')||$('bc7-calendar-detail')?.parentElement;
    if(!container)return;
    let host=$('bc7-period-move-preview');
    if(!state.periodMoveDraft){
      if(host)host.remove();
      renderPeriodMoveGhost();
      return;
    }
    const draft=state.periodMoveDraft;
    if(!host){host=document.createElement('section');host.id='bc7-period-move-preview';host.className='bc7-period-move-preview';container.appendChild(host);}
    host.innerHTML='<div class="bc7-period-move-head"><div><span class="bc7-muted">VISTA PREVIA · TODAVÍA SIN GUARDAR</span><h4>Mover período completo</h4></div><span class="bc7-period-move-days">'+draft.days+' días</span></div>'+
      '<p class="bc7-muted">Se desplazará el período completo, conservando responsable, secuencia y almacén. El servidor vuelve a comprobar inventario, actividad, conflictos y permisos antes de guardar.</p>'+
      '<div class="bc7-period-move-original"><span>Actual</span><strong>'+esc(fmtDateHuman(draft.originalStart))+' — '+esc(fmtDateHuman(draft.originalEnd))+'</strong></div>'+
      '<form data-bc7-period-move-form><label class="bc7-field">Nueva fecha del primer día<input type="date" data-bc7-period-start min="'+esc(dateHavana())+'" value="'+esc(draft.nextStart)+'" required></label>'+
      '<label class="bc7-field">Motivo obligatorio<textarea data-bc7-period-reason rows="2" maxlength="1000" required placeholder="Explica por qué se desplaza este período">'+esc(draft.reason||'')+'</textarea></label>'+
      '<p class="bc7-period-move-range" data-bc7-period-range role="status" aria-live="polite"></p>'+
      '<div class="bc7-actions"><button class="bc7-btn primary" type="submit" data-bc7-period-confirm disabled>Confirmar traslado</button><button class="bc7-btn" type="button" data-bc7-period-cancel>Cancelar</button></div>'+
      '<p class="bc7-msg" data-bc7-period-msg role="status" aria-live="polite"></p></form>';
    syncPeriodMovePreview(host.querySelector('form'));
    renderPeriodMoveGhost();
  }
  async function openPeriodMovePreview(rowId,targetDate,periodPromise){
    const source=state.rows.find(row=>String(row&&row.id||'')===String(rowId||''));
    if(!source||!state.admin)throw new Error('No se encontró una jornada autorizada para mover.');
    const period=periodPromise?await periodPromise:await fetchMovablePeriod(source);
    const start=targetDate?addDays(targetDate,1-Number(source.numero_dia)):period.originalStart;
    if(start<dateHavana())throw new Error('La nueva fecha inicial no puede quedar en el pasado ni comenzar hoy si el período ya se inició.');
    state.periodMoveDraft={...period,nextStart:start,idempotencyKey:null};
    renderCalendarDetail(state.calendarSelectedDate||String(source.fecha).slice(0,10),state.rows);
    const form=$('bc7-period-move-preview')?.querySelector('form');
    if(form){
      const input=form.querySelector('[data-bc7-period-start]');
      if(input)input.value=start;
      syncPeriodMovePreview(form);
      const previewHost=$('bc7-period-move-preview');
      if(previewHost&&typeof previewHost.scrollIntoView==='function')previewHost.scrollIntoView({behavior:'smooth',block:'nearest'});
      input?.focus();
    }
  }
  async function confirmPeriodMove(form){
    const draft=state.periodMoveDraft;
    if(!draft||!state.admin)throw new Error('La vista previa expiró. Vuelve a seleccionarla.');
    const start=String(form.querySelector('[data-bc7-period-start]')?.value||'').slice(0,10);
    const reason=String(form.querySelector('[data-bc7-period-reason]')?.value||'').trim();
    const message=form.querySelector('[data-bc7-period-msg]');
    if(!navigator.onLine){msg(message,'Conéctate antes de confirmar. No se ha enviado ninguna operación.','error');return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||start<dateHavana()||start===draft.originalStart||!reason||reason.length>1000){
      msg(message,'Elige una nueva fecha futura y escribe un motivo obligatorio de hasta 1000 caracteres.','error');return;
    }
    if(!window.crypto||typeof window.crypto.randomUUID!=='function'){
      msg(message,'Este navegador no ofrece una llave segura anti-duplicados. Actualiza el navegador antes de continuar.','error');return;
    }
    if(!window.confirm('Se moverán los '+draft.days+' días completos de '+fmtDate(draft.originalStart)+' a '+fmtDate(start)+'. El cambio quedará auditado y no se podrá aplicar a sesiones con actividad o inventario. ¿Confirmas el traslado?'))return;
    if(!draft.idempotencyKey)draft.idempotencyKey=window.crypto.randomUUID();
    const btn=form.querySelector('[data-bc7-period-confirm]');
    if(!busy(btn,true))return;
    try{
      const result=await rpc('bc5_reprogramar_periodo_jornada',{
        p_turno_id:draft.turnoId,
        p_fecha_inicio:start,
        p_motivo:reason,
        p_idempotency_key:draft.idempotencyKey
      });
      if(!result||String(result.turno_id||'')!==draft.turnoId)
        throw new Error('El servidor no devolvió una confirmación válida del traslado.');
      state.periodMoveDraft=null;
      state.periodMoveDrag=null;state.periodMoveDragRowsPromise=null;state.periodMoveDragRows=null;state.periodMoveDragPreview=null;
      const picker=$('bc7-calendar-month');
      if(picker)picker.value=start.slice(0,7);
      state.calendarSelectedDate=start;
      msg($('bc7-list-msg'),'Período reprogramado: '+fmtDate(start)+' — '+fmtDate(addDays(start,draft.days-1))+'. '+Number(result.filas_movidas||0)+' días actualizados y auditados.','ok');
      await loadCalendar();
      setStatus('El período completo se movió y quedó auditado por el servidor.','ok');
    }catch(error){
      msg(message,'No se pudo mover el período. '+friendlyError(error,'create'),'error');
    }finally{
      busy(btn,false);
    }
  }
  function clearPeriodMoveDrag(){
    state.periodMoveDrag=null;state.periodMoveDragRowsPromise=null;state.periodMoveDragRows=null;state.periodMoveDragPreview=null;
    renderPeriodMoveGhost();
  }
  function qty(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('es-ES',{maximumFractionDigits:3}):'—';}
  function money(v){return typeof window.money==='function'?window.money(Number(v||0)):Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function currentUser(){
    // auth.js declares _usuarioActual as a global lexical binding (let), not window._usuarioActual.
    // Read that authenticated context first; keep window aliases for offline/legacy integrations.
    try{if(typeof _usuarioActual!=='undefined'&&_usuarioActual)return _usuarioActual;}catch(_){}
    return window._usuarioActual||window.__bcUser||window.usuarioActual||null;
  }
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
    document.querySelectorAll('#bc7-period-responsible,#bc7-schedule-list [data-bc7-reperson],#bc7-calendar-detail [data-bc7-reperson]').forEach(sel=>{
      const previous=sel.value;
      sel.innerHTML=staffOptions(previous);
      if(previous&&people.some(user=>String(user.id)===String(previous)))sel.value=previous;
      sel.disabled=state.staffLoading||!state.staffLoaded||!people.length;
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
  function warehouseName(id){const w=warehouses().find(x=>String(x.id)===String(id));return w?(w.nombre||'Almacén'):'Almacén no disponible';}
  function userName(id){if(id==null||String(id)==='')return 'Sin asignar';const key=String(id);const sources=[staffRowsFrom(window.__BC_M29_STAFF_CACHE__),users(),eligibleStaff()];for(const source of sources){const u=source.find(person=>person&&String(person.id)===key);if(u){const name=u.nombre||u.nombre_completo||u.nombre_usuario||u.full_name||u.fullName||u.name||u.email||u.email_usuario;return String(name||'Responsable asignado').trim();}}return 'Responsable asignado';}
  function roleOf(u){
    let value=u&&(u.rol||u.role_name||u.nombre_rol||u.role)||'';
    if(value&&typeof value==='object')value=value.nombre||value.name||value.rol||value.role_name||'';
    return String(value||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();
  }
  function friendlyError(error,context){
    const raw=String(error&&error.message||error||'').trim();
    const value=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const code=String(error&&error.code||'').toUpperCase();
    if(context==='successor'&&raw&&code&&code!=='BC_AUTH_CONTEXT_NOT_READY') return raw;
    let message='';
    if(context==='adjustment'&&/stock insuficiente/.test(value)) message='La cantidad solicitada supera las existencias disponibles de uno o más productos. Revisa el stock y ajusta la lista; no se registró ninguna baja.';
    else if(context==='adjustment'&&/idempotencia|clave.*(otra lista|otro ajuste)/.test(value)) message='Esta referencia ya corresponde a otra solicitud. Actualiza la Jornada antes de volver a enviar la lista.';
    else if(/fecha inicial de la sucesora debe ser anterior a hoy/.test(value)) message='La recuperación requiere que la fecha inicial ya haya comenzado. Para un inicio de hoy o futuro, usa la programación normal.';
    else if(/opcion se reserva para periodos ya terminados/.test(value)) message='La recuperación solo se admite cuando la fecha inicial del nuevo período ya pasó. Para un inicio de hoy o futuro, usa la programación normal.';
    else if(/retroactiv|fecha.*(pasad|anterior)|no se admiten jornadas retroactivas|no se admiten programaciones retroactivas/.test(value)) message='La fecha de inicio ya pasó. Esta ruta solo sirve para recuperar una jornada iniciada en una fecha anterior.';
    else if(/no hay patron activo|no existe patron activo|patron activo/.test(value)) message='Todavía no hay una rotación guardada para este almacén. Guarda una rotación o elige «Elegir responsables día por día».';
    else if(/ya existe programacion|programacion para el almacen|programacion.*fecha|fecha.*ya existe/.test(value) && !/opcion se reserva para periodos ya terminados/.test(value)) message='Ya hay una jornada programada para una o más de esas fechas en este almacén. Revisa el calendario y elige fechas libres.';
    else if(/asignacion legacy|otra jornada programada|otro turno pendiente|ya tiene otra jornada/.test(value)) message='La persona elegida ya tiene otro turno pendiente en esa fecha. Elige otra persona o revisa ese turno.';
    else if(/turno activo para este almacen|hay un turno activo|turno activo o duplicado/.test(value)) message='Este almacén ya tiene un turno abierto o pendiente. Revisa ese turno antes de crear otra programación.';
    else if(/responsable.*(no esta activo|no elegible|rol elegible)|no esta activo o no tiene rol/.test(value)) message='Uno de los responsables ya no está disponible para trabajar. Actualiza la lista y vuelve a seleccionarlo.';
    else if(/configuracion de jornada no encontrada|falta.*horario/.test(value)) message='Todavía no está configurado el horario de este almacén. Guarda primero la hora de apertura y de cierre.';
    else if(/almacen inexistente|almacen.*inactivo|warehouse.*not found/.test(value)) message='El almacén seleccionado ya no está disponible. Actualiza la lista de almacenes y vuelve a intentarlo.';
    else if(code==='BC_AUTH_CONTEXT_NOT_READY') message='La sesión todavía se está validando. Espera a que termine la verificación de tu cuenta y vuelve a actualizar el calendario.';
    else if(code==='42501'&&/permission denied for function/.test(value)) message='El servidor rechazó la llamada de jornada antes de consultar los datos. Vuelve a validar la sesión; no concedas permisos administrativos para resolverlo.';
    else if(code==='42501'||/solo admin|sin permiso|not authorized|no autorizado/.test(value)) message='Tu cuenta no tiene permiso para hacer este cambio. Pide al administrador que revise tu acceso.';
    else if(code==='55P03') message='La jornada se está abriendo o editando en este momento. No se cambió ninguna fecha; vuelve a intentarlo en unos instantes.';
    else if(context==='transfer'&&(code==='23514'||code==='23505')) message=raw||'El servidor rechazó la atribución histórica. No se modificó la transferencia.';
    else if(code==='23505') message='Hay una jornada o asignación que se repite. Revisa las fechas y los responsables antes de volver a intentarlo.';
    else if(context==='inventory'&&code==='22023'&&/(\d+)\s+esperadas;\s*(\d+)\s+recibidas/i.test(raw)){const counts=raw.match(/(\d+)\s+esperadas;\s*(\d+)\s+recibidas/i);message='El conteo llegó incompleto: el servidor espera '+counts[1]+' productos/familias y recibió '+counts[2]+'. Actualiza la Jornada y revisa el listado antes de volver a guardar.';}
    else if(context==='inventory'&&code==='22023') message='El servidor rechazó el inventario porque faltan productos o hay líneas que no pertenecen a esta jornada. Actualiza la pantalla y revisa que estén todos los productos del listado.';
    else if(context==='inventory'&&code==='23514') message='El servidor no pudo confirmar el corte físico por el estado actual de la jornada. Actualiza la pantalla y revisa el estado del inventario.';
    else if(code==='22023'||/rango.*invalido|patron incompleto|entrada invalida|debe tener una entrada/.test(value)) message='Hay algún dato de la programación que debemos corregir. Revisa las fechas, la duración y que cada día de trabajo tenga una persona asignada.';
    else if(context==='transfer'&&/motivo/.test(value)) message=raw;
    else if(code==='23514'||/no puede|no se puede|conflicto/.test(value)) message='La programación no cumple una regla de trabajo. Revisa la disponibilidad de la responsable y las fechas repetidas.';
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
    const labels={PROGRAMADO:'Programado',PROGRAMADA:'Programada',PENDIENTE:'Pendiente',EN_CURSO:'En curso',COMPLETADA:'Completada',CERRADA:'Cerrada',CERRADO:'Cerrado',CANCELADA:'Cancelada',CANCELADO:'Cancelado',DESCANSO:'Programada',ABIERTO:'Abierto',APROBADO:'Aprobado',APROBADA:'Aprobada',RECHAZADO:'Rechazado',RECHAZADA:'Rechazada',ESPERANDO_ENTREGA:'Esperando entrega',ESPERANDO_APROBACION:'Esperando aprobación',DECLARACION_APROBADA:'Declaración aprobada · conteo físico pendiente'};
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
  function authenticatedContextReady(){
    try{
      if(typeof _bcSesionActivaId==='undefined'||!_bcSesionActivaId)return false;
      if(typeof _usuarioActual==='undefined'||!_usuarioActual||!_usuarioActual.id)return false;
      if(String(_usuarioActual.id)!==String(_bcSesionActivaId))return false;
      if(typeof _permisosCargaExitosa==='undefined'||_permisosCargaExitosa!==true)return false;
      return true;
    }catch(_){return false;}
  }
  const OFFLINE_JORNADA_WRITE_TYPES={
    bc7_registrar_gasto_jornada:'gasto_jornada',
    bc7_registrar_reinversion_jornada:'reinversion_jornada',
    bc7_registrar_bajas_multiple_jornada:'baja_jornada',
    bc7_registrar_ajuste_jornada:'ajuste_jornada'
  };
  const OFFLINE_JORNADA_READS=new Set([
    'bc_actor_is_admin','bc5_mis_jornadas','turno_actual_usuario',
    'bc5_obtener_configuracion_jornada','bc5_listar_patrones_jornada',
    'listar_almacenes_para_turnos','bc7_obtener_inventario_jornada',
    'bc7_estado_entrega_inventario_jornada','bc7_estado_confirmaciones_jornada',
    'bc7_productos_ajuste_jornada','bc7_liquidacion_inventario_jornada',
    'bc7_finanzas_jornada','bc7_ventas_jornada','bc7_entregas_diarias_jornada',
    'bc7_movimientos_sesion','bc7_transferencias_pendientes_vinculo_jornada'
  ]);
  function offlineReadAvailable(){
    return window.__BC_OFFLINE_AUTH__===true||!navigator.onLine||
      (typeof estaRealmenteDesconectado==='function'&&estaRealmenteDesconectado());
  }
  async function readJornadaSnapshot(name,params){
    if(!OFFLINE_JORNADA_READS.has(name)||typeof window.bcOfflineReadRpcSnapshot!=='function')return null;
    const snapshot=await window.bcOfflineReadRpcSnapshot(name,params||{});
    return snapshot&&snapshot.found?snapshot:null;
  }
  async function rpc(name,params){
    const args=params||{};
    if(!authenticatedContextReady()){
      const error=new Error('La sesión todavía está validando el usuario y sus permisos. No se consultaron ni modificaron datos.');
      error.code='BC_AUTH_CONTEXT_NOT_READY';error.rpc=name;throw error;
    }
    const queuedType=OFFLINE_JORNADA_WRITE_TYPES[name];
    if(queuedType){
      if(typeof window.ejecutarOperacion!=='function')throw new Error('La cola segura de operaciones no está disponible. No se envió ni guardó nada.');
      const payload=Object.assign({},args);
      if(!payload.p_idempotency_key){
        if(!window.crypto||typeof window.crypto.randomUUID!=='function')throw new Error('No se pudo preparar una clave segura anti-duplicados.');
        payload.p_idempotency_key=window.crypto.randomUUID();
      }
      const queued=await window.ejecutarOperacion(queuedType,payload);
      if(!queued||!queued.ok)throw (queued&&queued.error)||new Error('No se pudo registrar la operación.');
      if(queued.offline)return {__bcOfflineQueued:true,queueId:queued.operacion&&queued.operacion.id||null,operationType:queuedType};
      return queued.data;
    }
    if(offlineReadAvailable()){
      const snapshot=await readJornadaSnapshot(name,args);
      if(snapshot)return snapshot.data;
      if(!navigator.onLine||window.__BC_OFFLINE_AUTH__===true)
        throw new Error('Sin conexión: esta lectura de Jornada todavía no tiene una copia guardada en este dispositivo.');
    }
    if(typeof client==='undefined'||!client||typeof client.rpc!=='function')throw new Error('Cliente Supabase no disponible.');
    try{
      const r=await client.rpc(name,args);
      if(r&&r.error){
        const e=new Error(r.error.message||r.error.details||'La operación fue rechazada.');
        e.code=r.error.code;e.rpc=name;
        const networkError=typeof esErrorDeRed==='function'&&esErrorDeRed(r.error);
        if(networkError){
          const snapshot=await readJornadaSnapshot(name,args);
          if(snapshot)return snapshot.data;
        }
        throw e;
      }
      if(OFFLINE_JORNADA_READS.has(name)&&typeof window.bcOfflineRememberRpcSnapshot==='function')
        await window.bcOfflineRememberRpcSnapshot(name,args,r?r.data:null);
      return r?r.data:null;
    }catch(error){
      const networkError=typeof esErrorDeRed==='function'&&esErrorDeRed(error);
      if(networkError){
        const snapshot=await readJornadaSnapshot(name,args);
        if(snapshot)return snapshot.data;
      }
      throw error;
    }
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
      '#tab-jornada .bc7-current-session{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px;border:1px solid var(--gold-dim);border-left:3px solid var(--sage);border-radius:8px;background:rgba(159,196,173,.06)}',
      '#tab-jornada .bc7-current-session-copy{min-width:0}',
      '#tab-jornada .bc7-current-session-copy strong{display:block;font-size:13px;color:var(--text)}',
      '#tab-jornada .bc7-current-session-copy p{margin:3px 0 0;font-size:11px;color:var(--mist)}',
      '#tab-jornada .bc7-current-session[hidden]{display:none!important}',
      '#tab-jornada .bc7-current-session-actions{display:flex;flex-wrap:wrap;gap:6px}',
      '#tab-jornada .bc7-table-wrap{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}',
      '#tab-jornada .bc7-table{width:100%;min-width:720px;border-collapse:collapse;font-size:12px;table-layout:auto}',
      '#tab-jornada .bc7-table.bc7-table-wide{min-width:980px}',
      '#tab-jornada .bc7-table-scroll-hint{display:none;margin:4px 0;color:var(--mist);font-size:10px}',
      '@media(max-width:650px){#tab-jornada .bc7-current-session{align-items:stretch;flex-direction:column}#tab-jornada .bc7-current-session-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}#tab-jornada .bc7-table-scroll-hint{display:block}}',
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
      '#tab-jornada .bc7-pill.closed{color:#efaaa2;border-color:#a45353;background:rgba(164,83,83,.10)}',
      '#tab-jornada .bc7-table-wrap{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}',
      '#tab-jornada .bc7-table{width:100%;min-width:720px;border-collapse:collapse;font-size:12px;table-layout:auto}',
      '#tab-jornada .bc7-table.bc7-table-wide{min-width:980px}',
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
      '#tab-mi-jornada{max-width:980px;margin:0 auto;padding:8px 0 28px}',
      '#tab-mi-jornada .bc-worker-dashboard-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px;border:1px solid var(--gold-dim);border-radius:10px;background:var(--stone)}',
      '#tab-mi-jornada .bc-worker-dashboard-head span{font:700 10px Inter,sans-serif;letter-spacing:.08em;color:var(--gold)}',
      '#tab-mi-jornada .bc-worker-dashboard-head h3{margin:4px 0;color:var(--text);font-size:22px}',
      '#tab-mi-jornada .bc-worker-dashboard-head p{margin:5px 0 0;color:var(--mist);font-size:12px;line-height:1.45}',
      '#tab-mi-jornada .bc-worker-dashboard-head .bc7-btn{min-height:40px;padding:9px 13px;border:1px solid var(--gold-dim);border-radius:7px;background:var(--void);color:var(--text);font-weight:600}',
      '#tab-mi-jornada .bc-worker-shortcuts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:12px 0}',
      '#tab-mi-jornada .bc-worker-shortcut{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0;min-height:100px;padding:12px;border:1px solid var(--gold-dim);border-radius:9px;background:var(--stone);color:var(--text);text-align:left;cursor:pointer}',
      '#tab-mi-jornada .bc-worker-shortcut span{font-size:20px}',
      '#tab-mi-jornada .bc-worker-shortcut b{font-size:12px}',
      '#tab-mi-jornada .bc-worker-shortcut small{font-size:10px;color:var(--mist);line-height:1.35}',
      '#tab-mi-jornada .bc-worker-jornada-history{margin-top:14px}',
      '#tab-mi-jornada .bc-worker-jornada-history-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px}',
      '#tab-mi-jornada .bc-worker-jornada-history-head h4{margin:0;color:var(--text);font-size:15px}',
      '#tab-mi-jornada .bc-worker-jornada-history-head span{color:var(--mist);font-size:10px}',
      '#tab-mi-jornada .bc-worker-jornada-list{display:grid;gap:8px}',
      '#tab-mi-jornada .bc-worker-jornada-card{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid var(--gold-dim);border-radius:8px;background:var(--stone)}',
      '#tab-mi-jornada .bc-worker-jornada-copy{display:grid;gap:3px;min-width:0}',
      '#tab-mi-jornada .bc-worker-jornada-copy b{color:var(--text);font-size:13px}',
      '#tab-mi-jornada .bc-worker-jornada-copy span,#tab-mi-jornada .bc-worker-jornada-copy small{color:var(--mist);font-size:11px}',
      '#tab-mi-jornada .bc-worker-jornada-open{min-height:36px;padding:7px 11px;border:1px solid var(--gold-dim);border-radius:6px;background:var(--void);color:var(--text);font:600 11px Inter,sans-serif;cursor:pointer}',
      '#tab-mi-jornada .bc-worker-jornada-pending{font-size:10px;color:var(--mist)}',
      '#tab-mi-jornada .bc-worker-jornada-empty{display:grid;justify-items:center;gap:6px;padding:28px 14px;border:1px dashed var(--gold-dim);border-radius:9px;color:var(--mist);text-align:center}',
      '#tab-mi-jornada .bc-worker-jornada-empty span{font-size:26px}',
      '#tab-mi-jornada .bc-worker-jornada-empty b{color:var(--text);font-size:14px}',
      '#tab-mi-jornada .bc-worker-jornada-empty p{max-width:420px;margin:0;font-size:12px;line-height:1.4}',

      '@media(max-width:650px){#tab-mi-jornada .bc-worker-dashboard-head{align-items:stretch;flex-direction:column}#tab-mi-jornada .bc-worker-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}#tab-mi-jornada .bc-worker-jornada-card{align-items:flex-start;flex-direction:column}#tab-mi-jornada .bc-worker-jornada-actions{width:100%}#tab-mi-jornada .bc-worker-jornada-open{width:100%}#tab-jornada .bc7-hero{display:block}#tab-jornada .bc7-status{text-align:left;margin-top:9px;max-width:none}#tab-jornada .bc7-grid{grid-template-columns:1fr}#tab-jornada .bc7-day-row{grid-template-columns:1fr;gap:5px}#tab-jornada .bc7-day-row label{margin-top:4px}#tab-jornada .bc7-actions .bc7-btn{flex:1 1 140px}#tab-jornada .bc7-table th,#tab-jornada .bc7-table td{padding:8px 6px}}'
    ].join('\n');
    document.head.appendChild(s);
    if(!$('bc7-month-calendar-style')){
      const m=document.createElement('style');m.id='bc7-month-calendar-style';
      m.textContent=[
        "#tab-jornada .bc7-month-nav{display:flex;align-items:end;flex-wrap:wrap;gap:8px;margin:8px 0 12px}",
        "#tab-jornada .bc7-month-nav .bc7-btn{min-height:38px}",
        "#tab-jornada .bc7-month-picker{display:flex;flex-direction:column;gap:3px;min-width:170px;color:var(--mist);font-size:10px}",
        "#tab-jornada .bc7-month-picker input{box-sizing:border-box;min-height:38px;padding:7px 10px;border:1px solid var(--gold-dim);border-radius:7px;background:var(--void);color:var(--text);font:600 12px Inter,sans-serif}",
        "#tab-jornada .bc7-month-label{align-self:center;margin:0 auto 0 4px;color:var(--text);font-size:14px;font-weight:700;text-transform:capitalize}",
        "#tab-jornada .bc7-month-board{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));overflow:hidden;border:1px solid var(--gold-dim);border-radius:10px;background:rgba(4,13,12,.24)}",
        "#tab-jornada .bc7-month-weekday{display:flex;align-items:center;justify-content:center;min-height:34px;padding:5px 3px;border-right:1px solid var(--gold-dim);border-bottom:1px solid var(--gold-dim);background:rgba(201,162,77,.07);color:var(--gold);font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}",
        "#tab-jornada .bc7-month-weekday:nth-child(7){border-right:0}",
        "#tab-jornada .bc7-month-day{display:flex;flex-direction:column;gap:6px;min-width:0;min-height:112px;padding:8px 7px 6px;border-right:1px solid var(--gold-dim);border-bottom:1px solid var(--gold-dim);background:rgba(255,255,255,.018)}",
        "#tab-jornada .bc7-month-day:nth-child(7n + 7){border-right:0}",
        "#tab-jornada .bc7-month-day--outside{background:rgba(0,0,0,.12);opacity:.38}",
        "#tab-jornada .bc7-month-day--selected{background:rgba(74,153,212,.105);box-shadow:inset 0 0 0 2px rgba(91,174,226,.7)}",
        "#tab-jornada .bc7-month-day--today .bc7-month-date{border-color:var(--gold);color:var(--gold)}",
        "#tab-jornada .bc7-month-day-top{display:flex;align-items:center;gap:6px;min-height:24px}",
        "#tab-jornada .bc7-month-date{display:inline-grid;place-items:center;width:27px;height:27px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--text);font:700 12px Inter,sans-serif;cursor:pointer}",
        "#tab-jornada .bc7-month-date:disabled{cursor:default}",
        "#tab-jornada .bc7-month-today-tag{color:var(--gold);font-size:8px;font-weight:800;letter-spacing:.06em}",
        "#tab-jornada .bc7-month-count{margin-left:auto;color:var(--mist);font:600 9px 'IBM Plex Mono',monospace}",
        "#tab-jornada .bc7-month-day-events{display:grid;gap:4px;align-content:start;min-width:0}",
        "#tab-jornada .bc7-month-chip{display:flex;align-items:center;gap:5px;width:100%;min-width:0;min-height:24px;padding:3px 5px;border:1px solid rgba(212,176,92,.22);border-radius:5px;background:rgba(201,162,77,.06);color:var(--text);text-align:left;cursor:pointer}",
        "#tab-jornada .bc7-month-chip-dot{width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:var(--gold)}",
        "#tab-jornada .bc7-month-chip-person{overflow:hidden;min-width:0;color:var(--text);font-size:9px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}",
        "#tab-jornada .bc7-month-chip-status{display:none}",
        "#tab-jornada .bc7-month-chip.is-multi-day{position:relative;z-index:3;gap:4px;border-top-width:1px;border-bottom-width:1px}",
        "#tab-jornada .bc7-month-chip.is-range-start{margin-left:0;margin-right:-7px;width:calc(100% + 7px);border-right:0;border-radius:6px 0 0 6px}",
        "#tab-jornada .bc7-month-chip.is-range-middle{margin-left:-7px;margin-right:-7px;width:calc(100% + 14px);border-right:0;border-left:0;border-radius:0}",
        "#tab-jornada .bc7-month-chip.is-range-end{margin-left:-7px;margin-right:0;width:calc(100% + 7px);border-left:0;border-radius:0 6px 6px 0}",
        "#tab-jornada .bc7-month-chip.is-range-week-continuation .bc7-month-chip-person{font-weight:800}",
        "#tab-jornada .bc7-month-day-events{overflow:visible}",
        "#tab-jornada .bc7-month-chip.is-running{border-color:rgba(95,174,127,.44);background:rgba(95,174,127,.10)}",
        "#tab-jornada .bc7-month-chip.is-running .bc7-month-chip-dot{background:#7fc99a}",
        "#tab-jornada .bc7-month-chip.is-scheduled{border-color:rgba(216,181,92,.48);background:rgba(216,181,92,.09)}",
        "#tab-jornada .bc7-month-chip.is-closed,#tab-jornada .bc7-month-chip.is-sealed{border-color:rgba(197,105,105,.38);background:rgba(197,105,105,.08)}",
        "#tab-jornada .bc7-month-chip.is-closed .bc7-month-chip-dot,#tab-jornada .bc7-month-chip.is-sealed .bc7-month-chip-dot{background:#ca7777}",
        "#tab-jornada .bc7-month-more{justify-self:start;border:0;background:transparent;color:var(--gold);font-size:9px;cursor:pointer}",
        "#tab-jornada .bc7-month-empty{padding:2px 5px;color:var(--mist);font-size:10px;opacity:.4}",
        "#tab-jornada .bc7-calendar-detail{margin-top:12px;padding:10px;border:1px solid var(--gold-dim);border-radius:9px;background:rgba(255,255,255,.018)}",
        "#tab-jornada .bc7-calendar-detail-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:10px;margin-bottom:10px}",
        "#tab-jornada .bc7-calendar-detail-head h4{margin:3px 0 0;color:var(--text);font-size:14px;text-transform:capitalize}",
        "#tab-jornada .bc7-calendar-detail-count{color:var(--mist);font-size:10px}",
        "#tab-jornada .bc7-calendar-detail-list{display:grid;gap:7px}",
        "#tab-jornada .bc7-jornada-period{display:grid;gap:8px;border-color:rgba(145,154,210,.28)}",
        "#tab-jornada .bc7-jornada-period .bc7-period-days{border-top:1px solid var(--gold-dim);padding-top:7px}",
        "#tab-jornada .bc7-jornada-period .bc7-period-days>summary{font-size:10px}",
        "#tab-jornada .bc7-jornada-period .bc7-period-day-records{display:grid;gap:6px;padding-top:7px}",
        "#tab-jornada .bc7-period-day-entry{display:grid;gap:6px;padding:8px;border:1px solid var(--gold-dim);border-radius:8px;background:rgba(255,255,255,.015)}",
        "#tab-jornada .bc7-legacy-calendar-controls{display:none!important}",
        "#tab-jornada #bc7-schedule-list{display:grid!important}",
        ".bc7-visual-calendar-modal[hidden]{display:none!important}",
        ".bc7-visual-calendar-modal{position:fixed;inset:0;z-index:101500;display:grid;place-items:center;padding:18px;box-sizing:border-box}",
        ".bc7-visual-calendar-backdrop{position:absolute;inset:0;border:0;background:rgba(3,8,17,.84);backdrop-filter:blur(10px);cursor:default}",
        ".bc7-visual-calendar-dialog{position:relative;z-index:1;width:min(1760px,100%);height:min(960px,calc(100dvh - 36px));display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(115,139,194,.35);border-radius:22px;background:radial-gradient(1200px 520px at 14% -15%,rgba(53,89,158,.36),transparent 62%),linear-gradient(145deg,#101a2c 0%,#0b1220 70%,#0c1724 100%);box-shadow:0 32px 100px rgba(0,0,0,.56);color:#eef3ff}",
        ".bc7-visual-calendar-header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:20px 24px;border-bottom:1px solid rgba(141,159,203,.18);background:linear-gradient(90deg,rgba(76,108,181,.15),rgba(83,61,145,.10),transparent)}",
        ".bc7-visual-calendar-kicker{color:#a7b8e9;font-size:10px;font-weight:800;letter-spacing:.18em}",
        ".bc7-visual-calendar-header h2{margin:5px 0 3px;color:#f5f7ff;font-size:26px;letter-spacing:-.03em}",
        ".bc7-visual-calendar-header p{margin:0;color:#aebbd4;font-size:12px}",
        ".bc7-visual-calendar-close{width:42px;height:42px;border:1px solid rgba(172,190,232,.28);border-radius:12px;background:rgba(255,255,255,.06);color:#fff;font-size:27px;cursor:pointer}",
        ".bc7-visual-calendar-layout{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:18px;min-height:0;flex:1;padding:18px}",
        ".bc7-visual-calendar-main{display:flex;min-width:0;min-height:0;flex-direction:column;padding:14px;border:1px solid rgba(132,154,207,.19);border-radius:16px;background:rgba(8,15,28,.58)}",
        ".bc7-visual-calendar-main .bc7-month-nav{flex:0 0 auto;margin:0 0 14px;gap:8px}",
        ".bc7-visual-calendar-main .bc7-month-nav .bc7-btn{border-color:rgba(149,169,217,.24);background:rgba(255,255,255,.05);color:#dce5ff}",
        ".bc7-visual-calendar-main .bc7-month-picker{color:#aab9d7}",
        ".bc7-visual-calendar-main .bc7-month-picker input{background:#101c31;border-color:rgba(149,169,217,.3);color:#f3f6ff}",
        ".bc7-visual-calendar-main .bc7-month-label{color:#f1f4ff;font-size:18px}",
        ".bc7-visual-calendar-main .bc7-month-board{flex:1;min-height:0;grid-template-rows:34px repeat(6,minmax(62px,1fr));border-color:rgba(149,169,217,.25);background:rgba(2,8,17,.35)}",
        ".bc7-visual-calendar-main .bc7-month-weekday{min-height:34px;background:rgba(86,112,178,.12);border-color:rgba(149,169,217,.18);color:#aebff0}",
        ".bc7-visual-calendar-main .bc7-month-day{min-height:62px;padding:7px;border-color:rgba(149,169,217,.15);background:rgba(255,255,255,.018)}",
        ".bc7-visual-calendar-main .bc7-month-day--selected{background:rgba(69,119,224,.16);box-shadow:inset 0 0 0 2px rgba(115,157,255,.72)}",
        ".bc7-visual-calendar-main .bc7-month-day--outside{opacity:.23}",
        ".bc7-visual-calendar-main .bc7-month-date{color:#f0f4ff}",
        ".bc7-visual-calendar-main .bc7-month-chip{min-height:25px;border-radius:7px;border-color:rgba(120,151,221,.25);background:rgba(75,104,173,.12);color:#eaf0ff}",
        ".bc7-visual-calendar-main .bc7-month-chip-person{color:#edf2ff;font-size:10px}",
        ".bc7-visual-calendar-main .bc7-month-chip-status{color:#b7c6e5;font-size:8px}",
        ".bc7-visual-calendar-main .bc7-month-chip.is-running{background:rgba(45,153,108,.17);border-color:rgba(69,197,141,.36)}",
        ".bc7-visual-calendar-main .bc7-month-chip.is-scheduled{background:rgba(204,158,58,.15);border-color:rgba(226,183,89,.38)}",
        ".bc7-visual-calendar-main .bc7-month-chip.is-closed,.bc7-visual-calendar-main .bc7-month-chip.is-sealed{background:rgba(173,76,104,.16);border-color:rgba(210,108,131,.34)}",
        ".bc7-visual-calendar-side{display:flex;flex-direction:column;gap:14px;min-width:0;min-height:0;padding:16px;border:1px solid rgba(137,126,196,.28);border-radius:16px;background:linear-gradient(180deg,rgba(59,60,112,.20),rgba(12,20,35,.9))}",
        ".bc7-visual-calendar-side-title>span{color:#a99ee5;font-size:9px;font-weight:800;letter-spacing:.16em}",
        ".bc7-visual-calendar-side-title h3{margin:5px 0;color:#f2f0ff;font-size:17px}",
        ".bc7-visual-calendar-side-title p{margin:0;color:#aab6cf;font-size:11px;line-height:1.5}",
        ".bc7-visual-calendar-side .bc7-calendar-detail{display:flex;flex:1 1 0;flex-direction:column;min-height:170px;max-height:none;overflow:auto;margin:0;border-color:rgba(153,146,209,.25);background:rgba(4,10,21,.48);color:#eaf0ff}",
        ".bc7-visual-calendar-side .bc7-calendar-detail-head h4{color:#eef2ff;line-height:1.3;overflow-wrap:normal}",
        ".bc7-visual-calendar-side .bc7-calendar-detail-count,.bc7-visual-calendar-side .bc7-muted{color:#b0bdd8}",
        ".bc7-visual-calendar-side .bc7-calendar-detail .bc7-jornada{padding:13px;border-color:rgba(145,154,210,.2);background:rgba(255,255,255,.035);color:#eaf0ff}",
        ".bc7-visual-calendar-side .bc7-calendar-detail .bc7-jornada-top{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}",
        ".bc7-visual-calendar-side .bc7-calendar-detail .bc7-jornada-top>div{min-width:0}",
        ".bc7-visual-calendar-side .bc7-calendar-detail .bc7-jornada strong{font-size:14px;line-height:1.4;overflow-wrap:normal;word-break:normal}",
        ".bc7-visual-calendar-side .bc7-calendar-detail .bc7-pill{justify-self:start;max-width:100%;white-space:normal;line-height:1.35}",
        ".bc7-visual-calendar-legend{margin-top:auto;padding:13px;border:1px solid rgba(153,146,209,.22);border-radius:13px;background:rgba(4,10,21,.38)}",
        ".bc7-visual-calendar-legend-row{display:flex;align-items:center;gap:9px;margin-top:9px;color:#d8e0f3;font-size:11px}",
        ".bc7-visual-calendar-legend-row i{width:9px;height:9px;border-radius:50%;background:#c6a24d;box-shadow:0 0 12px currentColor}",
        ".bc7-visual-calendar-legend-row i.is-running{background:#57c58d;color:#57c58d}",
        ".bc7-visual-calendar-legend-row i.is-scheduled{background:#e3b95c;color:#e3b95c}",
        ".bc7-visual-calendar-legend-row i.is-closed{background:#d7798d;color:#d7798d}",
        ".bc7-visual-calendar-create{width:100%;min-height:44px;border:1px solid rgba(143,165,237,.42);background:linear-gradient(100deg,#536fca,#7653b5);color:#fff;font-weight:800}",
        "body.bc7-visual-calendar-open{overflow:hidden}",
        "@media(max-width:760px),(hover:none) and (pointer:coarse){.bc7-visual-calendar-modal{display:none!important}#tab-jornada .bc7-visual-calendar-open{display:none!important}#tab-jornada #bc7-schedule-list{display:grid!important}}",
        "@media(min-width:761px) and (max-height:760px){.bc7-visual-calendar-header{padding:12px 18px}.bc7-visual-calendar-layout{padding:12px;gap:12px;grid-template-columns:minmax(0,1fr) 390px}.bc7-visual-calendar-header h2{font-size:22px}.bc7-visual-calendar-main .bc7-month-day{min-height:52px;padding:5px}.bc7-visual-calendar-side{padding:12px}}",
        "@media(min-width:761px) and (max-width:1120px){.bc7-visual-calendar-layout{grid-template-columns:minmax(0,1fr) 320px;gap:10px;padding:10px}.bc7-visual-calendar-main{padding:9px}.bc7-visual-calendar-side{padding:10px}}",
        "@media(max-width:760px){#tab-jornada .bc7-month-board,#tab-jornada .bc7-calendar-detail{display:none!important}#tab-jornada #bc7-schedule-list{display:grid!important}}",
        "@media(max-width:760px){#tab-jornada .bc7-month-board,#tab-jornada .bc7-calendar-detail{display:none!important}#tab-jornada #bc7-schedule-list{display:grid!important}#tab-jornada .bc7-month-nav{display:grid;grid-template-columns:auto minmax(120px,1fr) auto auto;align-items:end;gap:5px}#tab-jornada .bc7-month-nav .bc7-btn{min-height:34px;padding:5px 8px;font-size:10px}#tab-jornada .bc7-month-picker{min-width:0}#tab-jornada .bc7-month-picker input{min-height:34px;width:100%;font-size:10px}#tab-jornada .bc7-month-label{grid-column:1/-1;grid-row:2;margin:2px 0 0;font-size:12px}#tab-jornada .bc7-month-day{min-height:0}}",
        "@media(max-width:420px){#tab-jornada .bc7-month-nav{grid-template-columns:auto minmax(110px,1fr) auto}#tab-jornada .bc7-month-nav [data-bc7-month-next]{grid-column:3;grid-row:1}#tab-jornada .bc7-month-nav [data-bc7-month-today]{grid-column:1;grid-row:2}#tab-jornada .bc7-month-nav [data-bc7-refresh]{grid-column:3;grid-row:2}}"
      ].join('\n');
      document.head.appendChild(m);
    }
    if(!$('bc7-period-move-style')){
      const p=document.createElement('style');p.id='bc7-period-move-style';
      p.textContent=[
        "#tab-jornada .bc7-month-chip[draggable=true]{cursor:grab;touch-action:pan-y}",
        "#tab-jornada .bc7-month-chip[draggable=true]:active{cursor:grabbing}",
        "#tab-jornada .bc7-month-day--drag-hover{outline:2px dashed var(--gold);outline-offset:-4px;background:rgba(201,162,77,.12)}",
        "#tab-jornada .bc7-month-day--move-preview{background:rgba(74,153,212,.12);box-shadow:inset 0 0 0 1px rgba(91,174,226,.45)}",
        "#tab-jornada .bc7-month-day--move-start{box-shadow:inset 0 3px 0 var(--gold),inset 0 0 0 1px rgba(91,174,226,.65)}",
        "#tab-jornada .bc7-month-day--move-end{box-shadow:inset 0 -3px 0 var(--gold),inset 0 0 0 1px rgba(91,174,226,.65)}",
        "#tab-jornada .bc7-month-move-ghost{display:block;max-width:100%;overflow:hidden;color:var(--gold);font-size:8px;font-weight:800;letter-spacing:.04em;text-overflow:ellipsis;white-space:nowrap}",
        "#tab-jornada .bc7-period-move-preview{margin-top:12px;padding:12px;border:1px solid var(--gold);border-radius:9px;background:rgba(201,162,77,.07)}",
        "#tab-jornada .bc7-period-move-head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
        "#tab-jornada .bc7-period-move-head h4{margin:3px 0 0;color:var(--text);font-size:14px}",
        "#tab-jornada .bc7-period-move-days{padding:4px 7px;border-radius:20px;background:rgba(201,162,77,.14);color:var(--gold);font-size:10px;font-weight:800}",
        "#tab-jornada .bc7-period-move-original{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0;padding:8px;border-radius:6px;background:rgba(0,0,0,.16)}",
        "#tab-jornada .bc7-period-move-original span{color:var(--mist);font-size:10px}",
        "#tab-jornada .bc7-period-move-original strong{color:var(--text);font-size:11px}",
        "#tab-jornada .bc7-period-move-preview .bc7-field{margin:8px 0}",
        "#tab-jornada .bc7-period-move-preview textarea{min-height:58px;resize:vertical}",
        "#tab-jornada .bc7-period-move-range{margin:7px 0;padding:8px;border:1px dashed var(--gold-dim);border-radius:6px;color:var(--gold);font-size:11px;font-weight:700}",
        "#tab-jornada .bc7-period-move-preview [data-bc7-period-confirm]:disabled{opacity:.45;cursor:not-allowed}",
        "#tab-jornada .bc7-period-move-preview:focus-within{outline:2px solid rgba(201,162,77,.2);outline-offset:2px}"
      ].join('\n');
      document.head.appendChild(p);
    }
        if(!$('bc7-receive-style')){const r=document.createElement('style');r.id='bc7-receive-style';r.textContent='#tab-jornada .bc7-receive-list{display:grid;gap:8px;margin:8px 0}#tab-jornada .bc7-receive-item{display:grid;gap:6px;padding:10px;border:1px solid var(--gold-dim);border-radius:8px;background:rgba(255,255,255,.02)}#tab-jornada .bc7-receive-item.is-marked{border-color:var(--gold);background:rgba(201,162,77,.06)}#tab-jornada .bc7-receive-product{display:flex;flex-direction:column;gap:2px}#tab-jornada .bc7-receive-count-wrap{display:grid;gap:2px}#tab-jornada .bc7-receive-item[hidden]{display:none!important}#tab-jornada [data-bc7-receive-pane][hidden]{display:none!important}';document.head.appendChild(r);}
    if(!$('bc7-compact-style')){const c=document.createElement('style');c.id='bc7-compact-style';c.textContent="#tab-jornada{max-width:1320px!important;padding-bottom:12px!important}\n#tab-jornada .bc7-hero{align-items:center!important;margin:0 0 7px!important;padding:3px 0 7px!important}\n#tab-jornada .bc7-hero h2{font-family:Inter,sans-serif!important;font-size:20px!important;font-weight:700!important}\n#tab-jornada .bc7-hero p{display:none!important}\n#tab-jornada .bc7-status{font-size:10px!important;min-height:0!important;max-width:none!important}\n#tab-jornada .bc7-card{padding:8px!important;margin:6px 0!important;border-radius:8px!important}\n#tab-jornada .bc7-card h3{font-size:13px!important;margin:0 0 5px!important}\n#tab-jornada .bc7-card h4{font-size:12px!important;margin:7px 0 5px!important}\n#tab-jornada .bc7-muted{font-size:10px!important;line-height:1.3!important}\n#tab-jornada .bc7-field{font-size:10px!important;gap:3px!important;margin:4px 0!important}\n#tab-jornada .bc7-field input,#tab-jornada .bc7-field select,#tab-jornada .bc7-field textarea{height:34px!important;min-height:34px!important;padding:6px 8px!important;font-size:11px!important}\n#tab-jornada .bc7-btn{min-height:34px!important;padding:6px 10px!important;font-size:10px!important;border-radius:6px!important}\n#tab-jornada .bc7-actions{gap:5px!important;margin-top:6px!important}\n#tab-jornada .bc7-jornada{display:block;grid-template-columns:minmax(0,1fr);min-width:0;width:100%;max-width:100%;box-sizing:border-box;padding:7px!important}\n#tab-jornada .bc7-jornada[data-bc7-cash-day-row]{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px}\n#tab-jornada .bc7-jornada[data-bc7-cash-day-row] .bc7-jornada-top{display:contents!important}\n#tab-jornada .bc7-jornada[data-bc7-cash-day-row] strong{font-size:11px!important;line-height:1.2}\n#tab-jornada .bc7-jornada[data-bc7-cash-day-row] p{font-size:10px!important;margin:2px 0 0!important}\n#tab-jornada .bc7-jornada[data-bc7-cash-day-row] .bc7-actions{margin:0!important;grid-column:3}\n#tab-jornada .bc7-jornada[data-bc7-cash-day-row] .bc7-btn{white-space:nowrap;min-height:30px!important;padding:5px 8px!important}\n#tab-jornada .bc7-help,#tab-jornada .bc7-admin-details{margin:4px 0!important;padding:6px 8px;border:1px solid var(--gold-dim);border-radius:7px;background:rgba(255,255,255,.02)}\n#tab-jornada .bc7-help summary,#tab-jornada .bc7-admin-details>summary{font-size:10px!important;font-weight:600;color:var(--gold);cursor:pointer;list-style:none}\n#tab-jornada .bc7-admin-details[hidden],#tab-jornada [hidden]{display:none!important}\n#tab-jornada .bc7-calendar-controls{display:grid;grid-template-columns:minmax(0,1fr) 68px auto;gap:6px;align-items:end}\n#tab-jornada .bc7-calendar-controls .bc7-field{margin:0!important}\n#tab-jornada .bc7-workspace-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}\n#tab-jornada .bc7-workspace-title-wrap{min-width:0;display:flex;align-items:center;gap:8px}\n#tab-jornada .bc7-workspace-head h3{font-size:14px!important;margin:0!important}\n#tab-jornada .bc7-back{min-height:30px!important;padding:5px 8px!important;white-space:nowrap}\n#tab-jornada .bc7-workspace-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:4px 0 8px}\n#tab-jornada .bc7-overview-item{min-width:0;padding:6px 7px;border:1px solid var(--gold-dim);border-radius:6px;background:rgba(255,255,255,.025)}\n#tab-jornada .bc7-overview-item small{display:block;font-size:9px;color:var(--mist);line-height:1.1}\n#tab-jornada .bc7-overview-item b{display:block;font-size:11px;margin-top:3px;overflow-wrap:anywhere}\n#tab-jornada .bc7-workspace-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:6px 0 8px;padding:3px;background:rgba(0,0,0,.18);border:1px solid var(--gold-dim);border-radius:7px}\n#tab-jornada .bc7-workspace-tab{min-width:0;min-height:32px;padding:5px 3px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--mist);font-size:10px;font-weight:600;cursor:pointer}\n#tab-jornada .bc7-workspace-tab[aria-selected=true]{color:var(--text);background:rgba(201,162,77,.16);border-color:var(--gold-dim)}\n#tab-jornada .bc7-workspace-panel[hidden]{display:none!important}\n#tab-jornada .bc7-panel-stack{display:grid;gap:6px}\n#tab-jornada .bc7-detail{border:1px solid var(--gold-dim);border-radius:7px;background:rgba(255,255,255,.018);padding:0 8px}\n#tab-jornada .bc7-detail>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;cursor:pointer;list-style:none;font-size:11px;font-weight:600}\n#tab-jornada .bc7-detail>summary small{font-size:9px;color:var(--mist);font-weight:500}\n#tab-jornada .bc7-detail-body{padding:0 0 7px;min-width:0}\n#tab-jornada .bc7-note{padding:7px!important;font-size:10px!important;line-height:1.3!important}\n#tab-jornada .bc7-table{font-size:10px!important}\n#tab-jornada .bc7-table th,#tab-jornada .bc7-table td{padding:5px!important}\n#tab-jornada .bc7-table input{width:76px!important;padding:5px!important;font-size:11px!important}\n@media(max-width:650px){#tab-jornada .bc7-calendar-controls{grid-template-columns:minmax(0,1fr) 60px auto}#tab-jornada .bc7-jornada{grid-template-columns:minmax(0,1fr) auto;gap:5px}#tab-jornada .bc7-jornada .bc7-actions{grid-column:2;grid-row:2}#tab-jornada .bc7-workspace-overview{grid-template-columns:repeat(3,minmax(0,1fr))}#tab-jornada .bc7-overview-item{padding:5px}#tab-jornada .bc7-overview-item b{font-size:10px}#tab-jornada .bc7-workspace-tab{font-size:9px;min-height:30px}#tab-jornada .bc7-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#tab-jornada .bc7-day-row{grid-template-columns:minmax(70px,.8fr) minmax(80px,1fr) minmax(100px,1.4fr)}#tab-jornada .bc7-day-row label{margin:0!important}}\n@media(max-width:390px){#tab-jornada .bc7-workspace-overview{grid-template-columns:repeat(2,minmax(0,1fr))}}";document.head.appendChild(c);}
  }
  function ensureDayRowsStyles(){
    if($('bc7-day-layout-style'))return;
    const style=document.createElement('style');style.id='bc7-day-layout-style';
    style.textContent='#tab-jornada .bc7-day-row{grid-template-columns:minmax(0,1.5fr) minmax(115px,.65fr) minmax(180px,1fr)!important;gap:10px!important;align-items:center!important;padding:11px!important}#tab-jornada .bc7-day-main{display:flex;flex-direction:column;gap:4px;min-width:0}#tab-jornada .bc7-day-main strong{font-size:13px;line-height:1.25;color:var(--text)}#tab-jornada .bc7-day-date{display:block;font-size:12px;line-height:1.4;white-space:normal;overflow-wrap:anywhere;color:var(--mist)}#tab-jornada .bc7-day-person{min-width:0;margin:0!important}#tab-jornada .bc7-day-person select{box-sizing:border-box;width:100%;min-width:0;min-height:38px;padding:8px}#tab-jornada .bc7-day-row .bc7-check{box-sizing:border-box;display:inline-flex;align-items:center;align-self:flex-start;gap:8px;width:max-content;max-width:100%;min-height:36px;padding:6px 10px;border:1px solid var(--gold-dim);border-radius:6px;background:rgba(201,162,77,.07);white-space:nowrap}#tab-jornada .bc7-day-row .bc7-check input[type=checkbox]{-webkit-appearance:checkbox!important;appearance:auto!important;box-sizing:border-box;width:18px!important;height:18px!important;min-width:18px!important;min-height:18px!important;max-width:18px!important;max-height:18px!important;margin:0!important;padding:0!important;flex:0 0 18px;accent-color:var(--gold);vertical-align:middle}@media(max-width:650px){#tab-jornada .bc7-day-row{grid-template-columns:minmax(0,1fr)!important;gap:7px!important;padding:10px!important}#tab-jornada .bc7-day-main{padding-bottom:2px}#tab-jornada .bc7-day-date{font-size:12px}#tab-jornada .bc7-day-person{width:100%}#tab-jornada .bc7-day-row .bc7-check{width:max-content!important;max-width:100%;justify-content:flex-start}}';
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
      '<header class="bc7-hero"><div><h2>Jornada e inventario</h2></div><div class="bc7-hero-actions"><button type="button" class="bc7-help-icon" data-bc7-help-open aria-label="Abrir guía de Jornada" title="Guía de Jornada">?</button><div id="bc7-status" class="bc7-status">Comprobando acceso…</div></div></header>'+
      '<section id="bc7-current-session-card" class="bc7-card" hidden aria-live="polite"></section>'+
      '<div id="bc7-help-modal" class="bc7-help-modal" hidden><button type="button" class="bc7-help-backdrop" data-bc7-help-close aria-label="Cerrar guía"></button><section class="bc7-help-dialog" role="dialog" aria-modal="true" aria-labelledby="bc7-help-title"><header><div><span>GUÍA OPERATIVA</span><h3 id="bc7-help-title">Jornada e inventario</h3></div><button type="button" class="bc7-btn" data-bc7-help-close aria-label="Cerrar">✕</button></header><div class="bc7-help-content"><p><b>Esta sección organiza cada período de trabajo y conserva la evidencia física y administrativa.</b></p><h4>¿Para qué sirve esta sección?</h4><p>Aquí organizas quién trabaja cada día. Cada responsable inicia su jornada, confirma el inventario físico inicial y final, y registra sus operaciones. Esta sección no es el historial general; para consultar todos los movimientos, entra en Movimientos → Historial.</p><p>Si no aparece una jornada, prueba otro mes y pulsa «Actualizar calendario». Una asignación solo queda confirmada cuando la valida el servidor.</p><h4>Estados de una jornada</h4><ul><li><b>Programada:</b> tiene fecha y responsable, pero aún no comienza.</li><li><b>En curso:</b> la responsable está trabajando y puede registrar operaciones.</li><li><b>Pendiente de cuadre:</b> la operación se selló; falta completar o revisar los datos físicos y administrativos. El sello no cierra el Turno maestro.</li><li><b>Pendiente de cierre maestro:</b> la jornada terminó, pero el Dueño aún debe revisar el período y aprobar el cierre definitivo.</li><li><b>Archivada:</b> el Turno maestro ya se cerró o la programación se canceló. Se conserva para consulta, fuera de la lista principal.</li></ul><h4>Los cinco pasos de la responsable</h4><ol><li><b>Entregas diarias de efectivo:</b> una entrega por cada fecha del período; registra 0 CUP si ese día no se entregó efectivo.</li><li><b>Gastos:</b> registrar todos los gastos reales.</li><li><b>Reinversiones:</b> registrar las compras/reinversiones correspondientes.</li><li><b>Bajas:</b> enviar todas las bajas y mermas y confirmar expresamente que no faltan más.</li><li><b>Inventario final:</b> contar físicamente cada producto del período y guardar el corte.</li></ol><h4>Reglas de seguridad</h4><ul><li>Enviar un bloque no aprueba automáticamente su contenido; Administración lo revisa por separado.</li><li>Una discrepancia de inventario queda auditada; no se reescribe el conteo inicial ni se ajusta el stock global automáticamente.</li><li>Los movimientos posteriores al corte deben atribuirse con evidencia; no se cargan a una persona solo por coincidir en fecha.</li><li>La jornada y el Turno maestro son estados distintos. El cierre operativo no equivale a aprobación administrativa.</li></ul><p>El historial archivado permanece disponible en el desplegable «Jornadas archivadas».</p></div></section></div>'+
      `<details id="bc7-admin-details" class="bc7-admin-details" hidden><summary>Organizar jornadas · Administrador</summary><section id="bc7-admin-panel" class="bc7-card">
<h3>Crear y organizar jornadas</h3><p class="bc7-muted">Elige el almacén, la duración y una responsable para toda la Jornada. Todas las fechas del período quedan agrupadas.</p>
<div class="bc7-grid"><div><label class="bc7-field">Almacén<select id="bc7-warehouse"></select></label><p class="bc7-msg" id="bc7-warehouse-msg" role="status" aria-live="polite"></p><button class="bc7-btn" type="button" id="bc7-warehouse-retry" hidden>Reintentar carga de almacenes</button></div><label class="bc7-field">Responsable de toda la Jornada<select id="bc7-period-responsible">'+staffOptions()+'</select></label></div>
<form id="bc7-pattern-form"><h4>Período y responsables</h4><div class="bc7-grid"><label class="bc7-field">Primera fecha<input id="bc7-start-date" type="date" required></label><label class="bc7-field">Duración (días)<input id="bc7-days-count" type="number" min="2" max="31" placeholder="2–31" inputmode="numeric"></label></div>

<p class="bc7-msg" id="bc7-staff-status" role="status" aria-live="polite">Cargando responsables activos…</p><button class="bc7-btn" type="button" id="bc7-staff-retry" hidden>Reintentar carga de responsables</button><div id="bc7-day-rows" class="bc7-day-rows"></div>
<p class="bc7-muted">Todas las fechas del período son laborables y comparten la responsable seleccionada.</p></form>
<div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-preview>Vista previa</button><button class="bc7-btn primary" type="button" data-bc7-create>Crear programación</button></div>
<details class="bc7-detail" id="bc7-schedule-note-details"><summary>Nota opcional</summary><div class="bc7-detail-body"><label class="bc7-field">Motivo administrativo o nota<input id="bc7-schedule-note" maxlength="1000" placeholder="Nota (opcional)"></label></div></details>
<div id="bc7-preview" class="bc7-list"></div><p class="bc7-msg" id="bc7-create-msg"></p>
<details class="bc7-detail" id="bc7-hours-details"><summary>Horario operativo · opciones avanzadas</summary><div class="bc7-detail-body"><form id="bc7-hours-form"><div class="bc7-grid"><label class="bc7-field">Apertura<input type="time" id="bc7-hour-start" value="07:00" required></label><label class="bc7-field">Cierre<input type="time" id="bc7-hour-end" value="23:00" required></label></div><label class="bc7-field">Zona horaria<input type="hidden" id="bc7-timezone" value="America/Havana"><span id="bc7-timezone-label" class="bc7-muted">Hora de Cuba (La Habana)</span></label><button class="bc7-btn" type="submit">Guardar horario</button><p class="bc7-msg" id="bc7-hours-msg"></p></form></div></details>
<details class="bc7-detail" id="bc7-retro-successor-box"><summary>Recuperar jornada atrasada · entrega pendiente</summary><div class="bc7-detail-body"><p class="bc7-muted">Usa esta opción solo para recuperar una sucesora cuya fecha inicial ya pasó y que dispone de una entrega pendiente. Hereda el inventario disponible; no inventa ni recaptura un inventario inicial.</p><div class="bc7-actions"><button class="bc7-btn primary" type="button" data-bc7-retro-handover-open>Buscar entregas pendientes</button></div><div id="bc7-retro-handover-content"><p class="bc7-muted">Pulsa para consultar las entregas que aún no tienen sucesora.</p></div></div></details>
</section></details>`+'<section class="bc7-card" id="bc7-calendar-section"><div class="bc7-workspace-head"><div><h3>Jornadas programadas</h3><span class="bc7-muted">Tu vista habitual se mantiene aquí. El tablero visual avanzado se abre aparte en computadora.</span></div><button class="bc7-btn primary bc7-visual-calendar-open" type="button" data-bc7-open-visual-calendar aria-haspopup="dialog" aria-controls="bc7-visual-calendar-modal">✦ Abrir tablero visual</button></div>'+
      '<div id="bc7-visual-calendar-modal" class="bc7-visual-calendar-modal" hidden>'+
      '<button type="button" class="bc7-visual-calendar-backdrop" data-bc7-close-visual-calendar aria-label="Cerrar calendario visual"></button>'+
      '<section class="bc7-visual-calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="bc7-visual-calendar-title">'+
      '<header class="bc7-visual-calendar-header"><div><span class="bc7-visual-calendar-kicker">PLANIFICADOR OPERATIVO · BATTLECRUISER</span><h2 id="bc7-visual-calendar-title">Calendario de jornadas</h2><p>Organiza períodos futuros, revisa responsables y mueve jornadas completas con una vista previa segura.</p></div><button type="button" class="bc7-visual-calendar-close" data-bc7-close-visual-calendar aria-label="Cerrar">×</button></header>'+
      '<div class="bc7-visual-calendar-layout"><section class="bc7-visual-calendar-main">'+
      '<div class="bc7-month-nav" aria-label="Navegación del calendario"><label class="bc7-visual-warehouse-picker"><span>ALMACÉN</span><select id="bc7-visual-warehouse" aria-label="Almacén del tablero"><option value="">Cargando almacenes…</option></select></label><button class="bc7-btn" type="button" data-bc7-month-prev aria-label="Mes anterior">‹</button><label class="bc7-month-picker"><span>Mes</span><input id="bc7-calendar-month" type="month" aria-label="Mes del calendario"></label><button class="bc7-btn" type="button" data-bc7-month-next aria-label="Mes siguiente">›</button><button class="bc7-btn" type="button" data-bc7-month-today>Hoy</button><button class="bc7-btn" type="button" data-bc7-refresh>Actualizar</button><strong id="bc7-month-label" class="bc7-month-label"></strong></div>'+
      '<input type="date" id="bc7-list-from" hidden><input type="number" id="bc7-list-days" min="1" max="31" value="31" hidden>'+
      '<div id="bc7-month-board" class="bc7-month-board" aria-label="Calendario de jornadas"><div class="bc7-empty">Cargando calendario…</div></div>'+
      '</section><aside class="bc7-visual-calendar-side"><div class="bc7-visual-calendar-side-title"><span>HERRAMIENTAS Y AMULETOS</span><h3>Planificador visual</h3><p>Arrastra una jornada al calendario. Los borradores no se guardan hasta confirmarlos.</p></div>'+
      '<section id="bc7-visual-tools" class="bc7-visual-tools" aria-label="Amuletos disponibles"><div class="bc7-empty">Cargando herramientas…</div></section>'+
      '<section id="bc7-visual-draft-panel" class="bc7-visual-draft-panel" hidden aria-live="polite"></section>'+
      '<div class="bc7-visual-calendar-side-title"><span>INSPECTOR</span><h3>Jornada seleccionada</h3><p>Selecciona un día para ver sus jornadas y acciones.</p></div>'+
      '<section id="bc7-calendar-detail" class="bc7-calendar-detail" aria-live="polite"><div class="bc7-empty">Selecciona un día del calendario para ver sus detalles.</div></section>'+
      '<section id="bc7-visual-activity" class="bc7-visual-activity" aria-live="polite"><div class="bc7-empty">La actividad real de la jornada aparecerá aquí.</div></section>'+
      '<section id="bc7-visual-history-panel" class="bc7-visual-history-panel" aria-live="polite"><div class="bc7-empty">El historial aparecerá aquí.</div></section>'+
      '<div class="bc7-visual-calendar-legend"><div class="bc7-visual-calendar-side-title"><span>ESTADOS</span><h3>Leyenda</h3></div><div class="bc7-visual-calendar-legend-row"><i class="is-running"></i><span>En curso</span></div><div class="bc7-visual-calendar-legend-row"><i class="is-scheduled"></i><span>Programada</span></div><div class="bc7-visual-calendar-legend-row"><i class="is-closed"></i><span>Cerrada</span></div></div>'+
      '<button class="bc7-btn primary bc7-visual-calendar-create" type="button" data-bc7-open-planner>+ Programar jornada</button></aside></div></section></div>'+
      '<div id="bc7-schedule-list" class="bc7-list"><div class="bc7-empty">Cargando calendario…</div></div><details id="bc7-archived-schedule" class="bc7-archive" hidden><summary>Jornadas archivadas (<span id="bc7-archived-schedule-count">0</span>)</summary><div id="bc7-archived-schedule-list" class="bc7-list"></div></details><p class="bc7-msg" id="bc7-list-msg" role="status" aria-live="polite"></p></section>'+
      '<section id="bc7-workspace" class="bc7-card" hidden><div class="bc7-workspace-head"><div class="bc7-workspace-title-wrap"><button type="button" class="bc7-btn bc7-back" data-bc7-back-calendar>← Calendario</button><h3 id="bc7-workspace-title">Jornada</h3></div></div><div id="bc7-workspace-body"></div></section>'+
      '</div>';
    const buildDaysButton=tab.querySelector('[data-bc7-build]');
    if(buildDaysButton&&!buildDaysButton.dataset.bc7Bound){
      buildDaysButton.dataset.bc7Bound='1';
      buildDaysButton.addEventListener('click',function(e){e.preventDefault();buildDayRows();});
    }
    return tab;
  }
  function setPageMode(workspace){
    const admin=$('bc7-admin-details'),calendar=$('bc7-calendar-section'),panel=$('bc7-workspace');
    if(admin)admin.hidden=!!workspace||!state.admin;
    if(calendar)calendar.hidden=!!workspace;
    if(panel)panel.hidden=!workspace;
  }
  function returnToCalendar(){
    setPageMode(false);
    const calendar=$('bc7-calendar-section');
    if(calendar)calendar.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function ensureWorkspaceOperationData(detail){
    if(!detail||!detail.sesion||!detail.sesion.id)return Promise.resolve(false);
    const sessionId=String(detail.sesion.id);
    if(state.workspaceOperationSessionId!==sessionId){state.workspaceOperationSessionId=sessionId;state.workspaceOperationPromise=null;state.workspaceOperationLoaded=false;}
    if(state.workspaceOperationLoaded)return Promise.resolve(true);if(state.workspaceOperationPromise)return state.workspaceOperationPromise;
    const requestVersion=state.workspaceRequestVersion,panel=$('bc7-workspace-body')?.querySelector('[data-bc7-workspace-panel="operacion"]');
    if(panel)panel.innerHTML='<div class="bc7-empty">Verificando responsable y cargando Operación y liquidación…</div>';
    const retail=detail.sesion.es_minorista===true,sessionStatus=String(detail.sesion.estado||'').toUpperCase();
    const activeSessionId=String(state.currentSession?.turno_sesion_id||'');
    const localAssignment=String(currentUser()?.id||'')===String(detail.sesion.responsable_id||'')||activeSessionId===sessionId;
    const access=retail&&!state.admin?rpc('bc7_entregas_diarias_jornada',{p_turno_sesion_id:sessionId}).then(data=>({ok:true,data:data||{}}),error=>({ok:false,error})):Promise.resolve({ok:true,data:null});
    state.workspaceOperationPromise=access.then(async accessResult=>{
      const current=()=>state.workspaceRequestVersion===requestVersion&&state.detail===detail&&String(state.selected||'')===sessionId;
      if(!current())return false;
      detail.server_responsible_access=!!accessResult.ok;
      if(retail&&!state.admin&&accessResult.ok){state.dailyCashData=accessResult.data;state.dailyCashSessionId=sessionId;}
      const assigned=retail?(!!state.admin||detail.server_responsible_access):localAssignment;
      const sessionAcceptsPendingOps=['EN_CURSO','CERRADA_OPERATIVAMENTE'].includes(sessionStatus);
      const canAdjust=sessionAcceptsPendingOps&&assigned&&(can('mermas','crear')||can('bajas','crear'));
      const canCreateReinvestment=sessionAcceptsPendingOps&&assigned&&can('reinversiones','crear');
      const needsProductCatalog=canAdjust||canCreateReinvestment;
      const results=await Promise.allSettled([
        rpc('bc7_estado_confirmaciones_jornada',{p_turno_sesion_id:sessionId}),
        needsProductCatalog?rpc('bc7_productos_ajuste_jornada',{p_turno_sesion_id:sessionId}):Promise.resolve([]),
        retail?rpc('bc7_liquidacion_inventario_jornada',{p_turno_sesion_id:sessionId}):Promise.resolve(null)
      ]);
      if(!current())return false;
      detail.checklist=results[0].status==='fulfilled'?results[0].value:{};
      detail.productos_ajuste=results[1].status==='fulfilled'&&Array.isArray(results[1].value)?results[1].value:[];
      if(results[2].status==='fulfilled'&&results[2].value!==null)detail.liquidacion=results[2].value;
      detail.operation_load_warnings=results.map((r,index)=>r.status==='rejected'?{index,message:friendlyError(r.reason,'calendar')}:null).filter(Boolean);
      state.workspaceOperationLoaded=true;state.workspaceOperationPromise=null;renderWorkspace(detail);return true;
    }).catch(error=>{
      const current=state.workspaceRequestVersion===requestVersion&&state.detail===detail&&String(state.selected||'')===sessionId;
      if(current){state.workspaceOperationPromise=null;const p=$('bc7-workspace-body')?.querySelector('[data-bc7-workspace-panel="operacion"]');
        if(p)p.innerHTML='<div class="bc7-empty">'+esc(friendlyError(error,'calendar'))+' No se modificaron datos. <button class="bc7-btn" type="button" data-bc7-operation-retry>Reintentar carga</button></div>';}
      return false;
    });return state.workspaceOperationPromise;
  }

  function activateWorkspaceTab(name){
    const allowed=['inventario','operacion','movimientos'];
    const tab=allowed.includes(name)?name:(name==='finanzas'?'operacion':'inventario');
    state.workspaceTab=tab;
    const body=$('bc7-workspace-body');if(!body)return;
    body.querySelectorAll('[data-bc7-workspace-tab]').forEach(button=>{
      const active=button.getAttribute('data-bc7-workspace-tab')===tab;
      button.setAttribute('aria-selected',active?'true':'false');
      button.classList.toggle('active',active);
    });
    body.querySelectorAll('[data-bc7-workspace-panel]').forEach(panel=>{panel.hidden=panel.getAttribute('data-bc7-workspace-panel')!==tab;});
    if(tab==='operacion'&&state.detail){
      ensureWorkspaceOperationData(state.detail);
      if(state.workspaceOperationLoaded){
        loadCashDaysWorkspace(state.detail);
        loadFinances(state.detail);
      }
    }
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
  function scheduleDayCount(){
    const input=$('bc7-days-count');
    const value=String(input&&input.value||'').trim();
    if(!value)return 0;
    const raw=Number(value);
    if(!Number.isFinite(raw))return 0;
    const count=Math.max(2,Math.min(31,raw));
    if(input&&input.value!==String(count))input.value=String(count);
    return Math.floor(count);
  }
  function readDayRows(){
    const n=scheduleDayCount(),responsibleId=$('bc7-period-responsible')?.value||null;
    return Array.from({length:n},(_,index)=>({numero_dia:index+1,trabaja:true,responsable_id:responsibleId}));
  }
  function buildDayRows(){
    const host=$('bc7-day-rows');if(!host)return;
    const n=scheduleDayCount(),start=$('bc7-start-date')?.value||dateHavana();
    if(!n){host.innerHTML='<p class="bc7-muted">Indica la duración del período para revisar sus fechas.</p>';state.lastPreview=null;if($('bc7-preview'))$('bc7-preview').innerHTML='';return;}
    host.innerHTML='<div class="bc7-period-summary" role="group" aria-label="Período completo"><strong>'+esc(fmtDateHuman(start))+' — '+esc(fmtDateHuman(addDays(start,n-1)))+'</strong><span>'+n+' días consecutivos · una sola Jornada</span><p>La misma responsable queda asignada a todas las fechas del período.</p></div>';
    const person=$('bc7-period-responsible');if(person)person.disabled=state.staffLoading||!state.staffLoaded||!eligibleStaff().length;
    state.lastPreview=null;if($('bc7-preview'))$('bc7-preview').innerHTML='';
  }
  async function loadHours(){
    const warehouseId=$('bc7-warehouse')?.value;if(!warehouseId)return;
    try{const d=await rpc('bc5_obtener_configuracion_jornada',{p_almacen_id:warehouseId});if(d){$('bc7-hour-start').value=String(d.hora_inicio||'07:00').slice(0,5);$('bc7-hour-end').value=String(d.hora_fin||'23:00').slice(0,5);$('bc7-timezone').value=d.zona_horaria||'America/Havana';setTimezoneLabel($('bc7-timezone').value);}}catch(e){msg($('bc7-hours-msg'),friendlyError(e,'hours'),'error');}
  }
  function rowHtml(r){
    const status=String(r.sesion_estado||r.estado||'—').toUpperCase();
    const isOperationallySealed=status==='CERRADA_OPERATIVAMENTE';
    const masterStatus=String(r.turno_estado_maestro||r.turno_estado||'').toUpperCase();
    const isApprovedMasterClose=masterStatus==='CERRADO'&&['COMPLETADA','CERRADA','CERRADO','CERRADA_OPERATIVAMENTE'].includes(status);
    const isClosed=['COMPLETADA','CERRADA','CERRADO'].includes(status);
    const isScheduled=['PROGRAMADA','PROGRAMADO','PENDIENTE'].includes(status);
    const pendingMasterClose=['COMPLETADA','CERRADA','CERRADO'].includes(status)&&['EN_CURSO','PENDIENTE_APROBACION'].includes(masterStatus);
    const pill=isApprovedMasterClose?'<span class="bc7-pill closed">Aprobada</span>':isOperationallySealed?'<span class="bc7-pill warn">Pendiente de cuadre</span>':pendingMasterClose?'<span class="bc7-pill warn">Pendiente de cierre maestro</span>':isClosed?'<span class="bc7-pill closed">Archivada</span>':status==='EN_CURSO'?'<span class="bc7-pill ok">En curso</span>':isScheduled?'<span class="bc7-pill warn">Programada</span>':'<span class="bc7-pill">'+esc(humanStatus(status))+'</span>';
    const isTerminal=['COMPLETADA','CERRADA','CERRADO','CERRADA_OPERATIVAMENTE','CANCELADA','CANCELADO'].includes(status)||masterStatus==='CERRADO';
    const viewable=status==='COMPLETADA'||isOperationallySealed;
    const action=(r.sesion_id&&(viewable||!isTerminal))?'<button class="bc7-btn primary" type="button" data-bc7-open="'+esc(r.sesion_id)+'">'+(viewable?'Ver jornada':'Gestionar jornada')+'</button>':'';
    let reschedule='';
    if(state.admin&&!isTerminal){
      reschedule='<details class="bc7-reschedule"><summary>Reasignar responsable</summary><form data-bc7-reschedule="'+esc(r.id)+'" data-bc7-session="'+esc(r.sesion_id||'')+'"><label class="bc7-field">Responsable<select data-bc7-reperson '+(state.staffLoading||!state.staffLoaded||!eligibleStaff().length?'disabled':'')+'>'+staffOptions(r.responsable_id)+'</select></label><label class="bc7-field">Motivo obligatorio<input data-bc7-reason maxlength="1000" required placeholder="Sustitución o corrección"></label><button class="bc7-btn" type="submit">Guardar reasignación</button><p class="bc7-msg" data-bc7-remsg></p></form></details>';
    }
    return '<article class="bc7-period-day-entry"><div class="bc7-jornada-top"><div><strong>'+esc(fmtDateHuman(r.fecha))+(r.fecha_fin&&r.fecha_fin!==r.fecha?' – '+esc(fmtDateHuman(r.fecha_fin)):'')+' · '+esc(warehouseName(r.almacen_id))+'</strong><p>'+esc(userName(r.responsable_id))+'</p></div>'+pill+'</div><div class="bc7-actions">'+action+'</div>'+reschedule+'</article>';
  }
  function periodGroupHtml(period){
    const rows=period._periodRows||[],statusRow=period._displayStatusRow||rows.find(row=>row.trabaja!==false)||rows[0]||period;
    const info=calendarStatus(statusRow),badgeClass=info.kind==='running'?'ok':info.kind==='closed'?'closed':['scheduled','sealed','review'].includes(info.kind)?'warn':'';
    const start=jornadaRangeStart(period),end=jornadaRangeEnd(period),range=start===end?fmtDateHuman(start):fmtDateHuman(start)+' – '+fmtDateHuman(end);
    const person=period._responsibleLabel||'Sin asignar';
    const moveSource=rows.find(row=>canOfferPeriodMove(row))||null;
    const move=moveSource?'<div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-period-move="'+esc(moveSource.id)+'">Mover período completo</button></div>':'';
    return '<article class="bc7-jornada bc7-jornada-period" data-bc7-period-turno="'+esc(period.turno_id||period._periodKey||'')+'">'+
      '<div class="bc7-jornada-top"><div><strong>Jornada · '+esc(range)+' · '+esc(warehouseName(period.almacen_id))+'</strong>'+
      '<p>'+esc(person)+' · '+esc(period._periodDays||rows.length)+' día(s)</p></div>'+
      '<span class="bc7-pill '+badgeClass+'">'+esc(info.label)+'</span></div>'+move+
      '<details class="bc7-period-days"><summary>Distribución diaria y sesiones ('+rows.length+')</summary><div class="bc7-period-day-records">'+rows.map(rowHtml).join('')+'</div></details></article>';
  }
  let calendarRefreshTimer=null;
  let calendarRealtimeChannel=null;
  let calendarRealtimeUserId=null;
  let calendarRealtimeConnected=false;

  function refreshCalendarAfterChange(reason){
    state.calendarRevision=(state.calendarRevision||0)+1;
    state.calendarCache.clear();
    state.calendarPromises.clear();
    if(calendarRefreshTimer!==null)window.clearTimeout(calendarRefreshTimer);
    calendarRefreshTimer=window.setTimeout(function(){
      calendarRefreshTimer=null;
      if(!bootStarted)return;
      if(!$('bc7-month-board')&&!$('bc7-schedule-list'))return;
      loadCalendar({force:true}).catch(function(error){
        console.warn('[BC7] No se pudo actualizar el calendario tras '+String(reason||'un cambio')+':',error);
      });
    },120);
  }

  function stopCalendarRealtimeSubscription(){
    const previous=calendarRealtimeChannel;
    calendarRealtimeChannel=null;
    calendarRealtimeUserId=null;
    calendarRealtimeConnected=false;
    if(!previous)return;
    try{
      const api=(typeof client!=='undefined'&&client)||window.client;
      if(api&&typeof api.removeChannel==='function')api.removeChannel(previous);
      else if(typeof previous.unsubscribe==='function')previous.unsubscribe();
    }catch(error){console.warn('[BC7] No se pudo cerrar el canal Realtime:',error);}
  }

  function ensureCalendarRealtimeSubscription(){
    const user=currentUser()||{};
    const userId=String(user.id||'');
    const api=(typeof client!=='undefined'&&client)||window.client;
    if(!userId||!api||typeof api.channel!=='function')return false;
    if(calendarRealtimeChannel&&calendarRealtimeUserId===userId)return true;
    stopCalendarRealtimeSubscription();
    try{
      const channel=api.channel('bc-jornada-calendar-'+userId);
      const onChange=function(){refreshCalendarAfterChange('sincronización Realtime');};
      channel.on('postgres_changes',{event:'*',schema:'public',table:'turno_sesiones'},onChange);
      channel.on('postgres_changes',{event:'*',schema:'public',table:'turnos'},onChange);
      calendarRealtimeChannel=channel;
      calendarRealtimeUserId=userId;
      channel.subscribe(function(status){
        if(status==='SUBSCRIBED'){
          if(calendarRealtimeConnected)refreshCalendarAfterChange('reconexión Realtime');
          calendarRealtimeConnected=true;
        }
      });
      return true;
    }catch(error){
      stopCalendarRealtimeSubscription();
      console.warn('[BC7] No se pudo iniciar la sincronización Realtime:',error);
      return false;
    }
  }

  window.addEventListener('bc:jornada-aprobada',function(){
    refreshCalendarAfterChange('aprobación de jornada');
  });
  window.addEventListener('online',function(){
    if(calendarRealtimeChannel)refreshCalendarAfterChange('reconexión de red');
    ensureCalendarRealtimeSubscription();
  });

  async function loadCalendar(options){
    options=options||{};const force=options.force===true;
    const board=$('bc7-month-board'),list=$('bc7-schedule-list');
    if(!board&&!list){state.calendarLoading=false;state.calendarLoadError='La vista del calendario no está disponible en esta sesión.';renderWorkerDashboard();return false;}
    const monthInput=$('bc7-calendar-month'),fallback=$('bc7-list-from')?.value||dateHavana();
    let month=String(monthInput&&monthInput.value||fallback.slice(0,7)).slice(0,7);if(!monthParts(month))month=dateHavana().slice(0,7);
    const from=month+'-01',days=monthDayCount(month),to=month+'-'+String(days).padStart(2,'0');
    if(monthInput)monthInput.value=month;const hiddenFrom=$('bc7-list-from');if(hiddenFrom)hiddenFrom.value=from;
    const hiddenDays=$('bc7-list-days');if(hiddenDays)hiddenDays.value=String(days);
    const label=$('bc7-month-label');if(label)label.textContent=monthTitle(month);
    const user=currentUser()||{},key=String(user.id||user.username||user.email||'authenticated-user')+'|'+month;
    const requestRevision=state.calendarRevision||0;
    const renderRows=data=>{
      if(requestRevision!==(state.calendarRevision||0))return;
      if(String($('bc7-calendar-month')?.value||month)!==month)return;
      state.calendarLoading=false;state.calendarLoadError='';
      const archived=[],visible=[];
      data.forEach(row=>{const st=String(row.sesion_estado||row.estado||'').toUpperCase();const master=String(row.turno_estado_maestro||row.turno_estado||'').toUpperCase();const isArchived=state.admin&&(st==='CANCELADA'||st==='CANCELADO'||(['COMPLETADA','CERRADA','CERRADO'].includes(st)&&master==='CERRADO')||(st==='CERRADA_OPERATIVAMENTE'&&master==='CERRADO'));(isArchived?archived:visible).push(row);});
      const rank=row=>{const st=String(row.sesion_estado||row.estado||'').toUpperCase();return st==='EN_CURSO'?0:st==='CERRADA_OPERATIVAMENTE'?1:(st==='COMPLETADA'?2:3);};
      visible.sort((a,b)=>rank(a)-rank(b)||String(a.fecha||'').localeCompare(String(b.fecha||''))||Number(a.numero_dia||0)-Number(b.numero_dia||0));
      archived.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
      state.rows=visible;state.archivedRows=archived;
      const calendarRows=[...visible,...archived].sort((a,b)=>jornadaRangeStart(a).localeCompare(jornadaRangeStart(b))||Number(a.numero_dia||0)-Number(b.numero_dia||0));
      state.calendarRows=calendarRows;
      if(!state.calendarSelectedDate||state.calendarSelectedDate.slice(0,7)!==month){const today=dateHavana();state.calendarSelectedDate=today.slice(0,7)===month?today:from;}
      renderVisualWarehouseSelector();
      const boardRows=visualBoardRows();
      if(board)renderMonthCalendar(month,boardRows);renderCalendarDetail(state.calendarSelectedDate,boardRows);
      notifyVisualCalendarUpdated();
      const visiblePeriods=groupJornadaPeriods(visible);
      if(list)list.innerHTML=visiblePeriods.length?visiblePeriods.map(periodGroupHtml).join(''):'<div class="bc7-empty"><strong>No hay jornadas visibles en este rango.</strong><p>Prueba otro mes. Las jornadas cerradas aparecen archivadas abajo. Una lista vacía no demuestra que el servidor esté caído. Una asignación solo queda confirmada cuando la valida el servidor.</p></div>';
      const archive=$('bc7-archived-schedule'),archiveList=$('bc7-archived-schedule-list'),archiveCount=$('bc7-archived-schedule-count');
      const archivedPeriods=groupJornadaPeriods(archived);
      if(archive&&state.admin){archive.hidden=!archivedPeriods.length;if(archiveCount)archiveCount.textContent=String(archivedPeriods.length);if(archiveList)archiveList.innerHTML=archivedPeriods.map(periodGroupHtml).join('');}
      renderWorkerDashboard();
    };
    const cached=state.calendarCache.get(key);
    if(!force&&cached&&Date.now()-cached.at<60000){state.calendarLoading=false;state.calendarLoadError='';renderRows(cached.rows);return true;}
    const existing=state.calendarPromises.get(key);if(!force&&existing)return existing;
    state.calendarLoading=true;state.calendarLoadError='';
    renderWorkerDashboardState('Cargando tus jornadas…','Estamos consultando tus asignaciones y el estado de tu jornada.');
    if(board&&!board.querySelector('.bc7-month-day'))board.innerHTML='<div class="bc7-empty">Cargando calendario…</div>';
    if(list&&!list.querySelector('.bc7-jornada'))list.innerHTML='<div class="bc7-empty">Cargando calendario…</div>';
    msg($('bc7-list-msg'),force?'Actualizando calendario…':'');let request;
    request=(async()=>{try{
      const data=arr(await rpc('bc5_mis_jornadas',{p_fecha_inicio:from,p_fecha_fin:to}));
      if(requestRevision!==(state.calendarRevision||0))return false;
      state.calendarCache.set(key,{at:Date.now(),rows:data});while(state.calendarCache.size>6)state.calendarCache.delete(state.calendarCache.keys().next().value);
      renderRows(data);msg($('bc7-list-msg'),'');return true;
    }catch(e){
      if(String($('bc7-calendar-month')?.value||month)===month){
        state.calendarLoading=false;state.calendarLoadError=friendlyError(e,'calendar');
        if(!cached){state.rows=[];state.calendarRows=[];
          if(board)board.innerHTML='<div class="bc7-empty">No se pudo consultar el calendario.</div>';
          if(list)list.innerHTML='<div class="bc7-empty">No se pudo consultar el calendario.</div>';
          const detail=$('bc7-calendar-detail');if(detail)detail.innerHTML='<div class="bc7-empty">No se pudieron consultar los detalles de este mes.</div>';
        }
        msg($('bc7-list-msg'),state.calendarLoadError,'error');
        renderWorkerDashboard();
      }return false;
    }finally{if(state.calendarPromises.get(key)===request)state.calendarPromises.delete(key);}})();
    state.calendarPromises.set(key,request);return request;
  }
  function renderCurrentSession(current){
    state.currentSession=current&&current.turno_sesion_id?current:null;
    const host=$('bc7-current-session-card');
    if(!host)return;
    if(!state.currentSession){host.hidden=true;host.innerHTML='';return;}
    const active=state.currentSession;
    host.hidden=false;
    host.innerHTML='<div class="bc7-current-session"><div class="bc7-current-session-copy"><strong>Mi jornada actual</strong><p>En curso · '+esc(fmtDateHuman(active.fecha))+' · '+esc(warehouseName(active.almacen_id))+'</p></div><div class="bc7-current-session-actions"><button class="bc7-btn primary" type="button" data-bc7-current-open>Continuar jornada</button><button class="bc7-btn" type="button" data-bc7-current-finance>Finanzas</button></div></div>';
  }
  async function loadCurrentSession(){
    try{
      const current=await rpc('turno_actual_usuario',{});
      renderCurrentSession(current);
      return state.currentSession;
    }catch(_){
      renderCurrentSession(null);
      return null;
    }
  }
  async function openCurrentSession(finance){
    const sessionId=state.currentSession&&state.currentSession.turno_sesion_id;
    if(!sessionId)return false;
    const opened=await openWorkspace(sessionId);
    if(opened&&finance){
      activateWorkspaceTab('finanzas');
      const target=document.querySelector('[data-bc7-workspace-panel="finanzas"]');
      if(target)target.scrollIntoView({behavior:'smooth',block:'center'});
    }
    return opened;
  }
  function renderWorkerDashboard(){
    const host=$('bc-worker-dashboard');if(!host)return;
    const user=currentUser()||{},role=roleOf(user);
    if(!role.includes('dependienta')){
      renderWorkerDashboardState('No pudimos identificar tu perfil','La sesión actual no permite resolver el perfil de esta vista. Vuelve a validar la sesión para cargar Mis jornadas.','boot');
      return;
    }
    if(state.calendarLoading){renderWorkerDashboardState('Cargando tus jornadas…','Estamos consultando tus asignaciones y el estado de tu jornada.');return;}
    const today=dateHavana();
    const ownRows=(state.rows||[]).filter(row=>
      row&&String(row.responsable_id||'')===String(user.id||'')&&row.trabaja!==false
    );
    const activeRows=ownRows.filter(row=>
      row.sesion_id&&(String(row.sesion_estado||'').toUpperCase()==='EN_CURSO'||(String(row.sesion_estado||'').toUpperCase()==='CERRADA_OPERATIVAMENTE'&&String(row.turno_estado_maestro||row.turno_estado||'').toUpperCase()!=='CERRADO'))
    ).sort((a,b)=>{
      const aToday=String(a.fecha||'').slice(0,10)<=today&&String(a.fecha_fin||a.fecha||'').slice(0,10)>=today;
      const bToday=String(b.fecha||'').slice(0,10)<=today&&String(b.fecha_fin||b.fecha||'').slice(0,10)>=today;
      return Number(bToday)-Number(aToday)||String(b.fecha||'').localeCompare(String(a.fecha||''));
    });
    const current=state.currentSession;
    const primary=activeRows[0]||null;
    const sessionId=current?.turno_sesion_id||primary?.sesion_id||'';
    const primaryRow=primary||ownRows.find(row=>String(row.sesion_id||'')===String(sessionId))||null;
    const shortcuts=[['declaracion_dinero','💵','Entregas diarias','Registrar efectivo del día'],['gastos','🧾','Gastos','Registrar un gasto'],['reinversiones','📦','Reinversiones','Registrar una reinversión'],['bajas','↘','Bajas','Registrar una baja'],['inventario_final','📋','Inventario final','Contar al terminar']];
    const header=sessionId
      ?'<div class="bc-worker-dashboard-head"><div><span>ESPACIO DE TRABAJO</span><h3>Mi jornada</h3><p>'+esc(fmtDateHuman(primaryRow?.fecha||current?.fecha||today))+(primaryRow?.fecha_fin&&primaryRow.fecha_fin!==primaryRow.fecha?' – '+esc(fmtDateHuman(primaryRow.fecha_fin)):'')+' · '+esc(calendarStatus(primaryRow||{sesion_estado:'EN_CURSO'}).short)+' · '+esc(warehouseName(primaryRow?.almacen_id||current?.almacen_id))+'</p></div><button type="button" class="bc7-btn" data-bc7-worker-open-jornada>Ver calendario</button></div>'+
       '<div class="bc-worker-shortcuts">'+shortcuts.map(item=>'<button type="button" class="bc-worker-shortcut" data-bc7-worker-shortcut="'+item[0]+'" data-session-id="'+esc(sessionId)+'"><span aria-hidden="true">'+item[1]+'</span><b>'+item[2]+'</b><small>'+item[3]+'</small></button>').join('')+'</div>'
      :'<div class="bc-worker-dashboard-head"><div><span>ESPACIO PERSONAL</span><h3>Mis jornadas</h3><p>No tienes una jornada activa o pendiente de cuadre. Tus asignaciones aparecen debajo.</p></div><button type="button" class="bc7-btn" data-bc7-worker-open-jornada>Ver calendario</button></div>';
    const sorted=ownRows.slice().sort((a,b)=>
      String(b.fecha||'').localeCompare(String(a.fecha||''))||Number(b.numero_dia||0)-Number(a.numero_dia||0)
    );
    const loadNotice=state.calendarLoadError
      ?'<div class="bc-worker-jornada-empty" role="status" aria-live="polite"><span aria-hidden="true">⚠️</span><b>No se pudo actualizar el calendario</b><p>'+esc(state.calendarLoadError)+'</p><button type="button" class="bc7-btn" data-bc7-worker-retry="calendar">Reintentar</button></div>'
      :'';
    const history=state.calendarLoadError&&!sorted.length
      ?''
      :sorted.length
      ?'<section class="bc-worker-jornada-history"><div class="bc-worker-jornada-history-head"><h4>Mis jornadas</h4><span>'+sorted.length+' registro(s)</span></div><div class="bc-worker-jornada-list">'+sorted.map(item=>{
        const status=calendarStatus(item);
        const period=fmtDateHuman(item.fecha)+(item.fecha_fin&&item.fecha_fin!==item.fecha?' – '+fmtDateHuman(item.fecha_fin):'');
        const action=item.sesion_id
          ?'<button type="button" class="bc-worker-jornada-open" data-bc7-open="'+esc(item.sesion_id)+'">Abrir jornada</button>'
          :'<span class="bc-worker-jornada-pending">Sesión aún no iniciada</span>';
        return '<article class="bc-worker-jornada-card"><div class="bc-worker-jornada-copy"><b>'+esc(period)+'</b><span>'+esc(warehouseName(item.almacen_id))+'</span><small>'+esc(status.label)+'</small></div><div class="bc-worker-jornada-actions">'+action+'</div></article>';
      }).join('')+'</div></section>'
      :'<div class="bc-worker-jornada-empty"><span aria-hidden="true">🗓️</span><b>No hay jornadas asignadas en este mes</b><p>Cuando Administración te asigne una jornada, aparecerá aquí con su estado y acceso directo.</p></div>';
    host.innerHTML=header+loadNotice+history;
  }
  function renderWorkerDashboardState(title,detail,retryAction){
    const host=$('bc-worker-dashboard');if(!host)return;
    const retry=retryAction
      ?'<button type="button" class="bc7-btn" data-bc7-worker-retry="'+esc(retryAction)+'">Reintentar</button>'
      :'';
    host.innerHTML='<div class="bc-worker-jornada-empty" role="status" aria-live="polite"><span aria-hidden="true">⏳</span><b>'+esc(title)+'</b><p>'+esc(detail)+'</p>'+retry+'</div>';
  }
  function checklistConfirmButtonHtml(detail,key,isAssigned){
    if(!isAssigned)return '';
    const done=detail?.checklist?.[key]?.completado===true;
    const label=key==='gastos'?'gastos':key==='reinversiones'?'reinversiones':'bajas';
    return '<div class="bc7-checklist-confirm"><p class="bc7-muted">'+(done?'Este bloque ya está confirmado. Si agregas otro registro, se reabrirá automáticamente.':'Cuando termines de registrar '+label+', confirma aquí que no falta nada.')+'</p><button type="button" class="bc7-btn '+(done?'':'primary')+'" data-bc7-checklist-toggle="'+key+'" data-completed="'+(done?'true':'false')+'">'+(done?'Reabrir bloque':'Sí, ya terminé de agregar '+label)+'</button></div>';
  }
  function financeFormHtml(detail,isAssigned,status){
    const sessionId=detail.sesion.id;
    // Use the server's current active-product catalog for reinvestments;
    // the immutable opening inventory is not a product catalogue.
    const products=Array.isArray(detail.productos_ajuste)?detail.productos_ajuste:arr(detail.productos);
    const isRetail=detail.sesion.es_minorista===true;
    const showExpenses=state.admin||isAssigned;
    const showReinvestments=state.admin||isAssigned;
    const showSales=!isRetail&&(state.admin||can('ventas','ver'));
    const showSettlement=isRetail&&(state.admin||isAssigned);
    const acceptsPendingOps=['EN_CURSO','CERRADA_OPERATIVAMENTE'].includes(String(status||'').toUpperCase());
    const hasWritableTranche=status==='EN_CURSO'?!!detail.tramo_activo:true;
    const createExpenses=isAssigned&&acceptsPendingOps&&hasWritableTranche&&can('gastos','crear')&&detail.checklist?.gastos?.completado!==true;
    const createReinvestments=isAssigned&&acceptsPendingOps&&hasWritableTranche&&can('reinversiones','crear')&&detail.checklist?.reinversiones?.completado!==true;
    if(!showExpenses&&!showReinvestments&&!showSales&&!showSettlement&&!createExpenses&&!createReinvestments)return '';
    let html='<section class="bc7-card" id="bc7-finance-section"><h4>Finanzas y liquidación de la jornada</h4>';
    if(isRetail){
      html+='<p class="bc7-muted">La Cueva calcula las unidades vendidas por diferencia entre inventarios y movimientos aprobados. No utiliza ventas individuales de POS ni reparte existencias por sabores.</p>';
      if(String(status||'').toUpperCase()==='CERRADA_OPERATIVAMENTE'&&(createExpenses||createReinvestments))
        html+='<div class="bc7-note"><b>Registro tardío de esta Jornada</b><p>Puedes añadir gastos o reinversiones que quedaron pendientes. Se guardarán con la fecha y el responsable de esta Jornada, quedarán sujetos a validación del servidor y aprobación del Dueño y no cambiarán caja ni inventario antes de aprobarse.</p></div>';
      if(showSettlement)html+='<div id="bc7-inventory-settlement"><div class="bc7-empty">Calculando liquidación por inventario…</div></div>';
    }else{
      html+='<p class="bc7-muted">Las ventas se muestran solo cuando están vinculadas al ID exacto de esta jornada. El efectivo declarado y contado se presenta por separado.</p>';
    }
    if(showSales)html+='<details class="bc7-finance-fold"><summary>Ventas vinculadas</summary><div id="bc7-sales-list"><div class="bc7-empty">Consultando ventas vinculadas a esta jornada…</div></div></details>';
    if(showExpenses)html+='<details class="bc7-finance-fold"><summary>Gastos registrados y pendientes</summary><div id="bc7-expenses-list"><div class="bc7-empty">Consultando gastos…</div></div></details>';
    if(showReinvestments)html+='<details class="bc7-finance-fold"><summary>Reinversiones registradas y pendientes</summary><div id="bc7-reinvestments-list"><div class="bc7-empty">Consultando reinversiones…</div></div></details>';
    if(createExpenses){
      html+='<details class="bc7-finance-fold"><summary>Registrar gasto</summary><form data-bc7-finance-form="gasto" data-bc7-finance-session="'+esc(sessionId)+'"><h4>Registrar gasto</h4>'+
        '<input type="hidden" data-bc7-op-key value="">'+
        '<label class="bc7-field">Categoría<select data-bc7-expense-category><option value="OTROS">Otros gastos</option><option value="SALARIOS">Salarios · retiro de salario acumulado</option><option value="UTILES_DE_LA_CAFETERIA">Útiles de la cafetería</option></select></label>'+
        '<label class="bc7-field" data-bc7-expense-beneficiary-wrap hidden>Persona que recibe el salario<select data-bc7-expense-beneficiary disabled><option value="">Selecciona una dependienta vinculada</option></select></label>'+
        '<p class="bc7-muted" data-bc7-expense-type-help>Gasto ordinario de la Jornada.</p>'+
        '<label class="bc7-field">Concepto<input data-bc7-expense-concept maxlength="160" required placeholder="Motivo del gasto"></label>'+
        '<label class="bc7-field">Monto<input data-bc7-expense-amount type="number" min="0.01" step="0.01" required inputmode="decimal" placeholder="0.00"></label>'+
        '<label class="bc7-field">Descripción (opcional)<input data-bc7-expense-description maxlength="1000" placeholder="Detalle o referencia"></label>'+
        '<div class="bc7-actions"><button class="bc7-btn" type="submit">Enviar gasto a aprobación</button></div><p class="bc7-msg" data-bc7-finance-msg></p></form></details>';
    }
    if(createReinvestments){
      const options='<option value="">Selecciona producto</option>'+products.map(p=>'<option value="'+esc(p.producto_id)+'">'+esc(p.nombre)+' · stock '+esc(qty(p.stock_actual))+'</option>').join('');
      html+='<details class="bc7-finance-fold"><summary>Registrar reinversión</summary><form data-bc7-finance-form="reinversion" data-bc7-finance-session="'+esc(sessionId)+'"><h4>Registrar reinversión</h4>'+
        '<input type="hidden" data-bc7-op-key value="">'+
        '<label class="bc7-field">Producto<select data-bc7-reinvestment-product required>'+options+'</select></label>'+
        '<div class="bc7-grid"><label class="bc7-field">Cantidad que entra al inventario<input data-bc7-reinvestment-quantity type="number" min="0.001" step="0.001" required inputmode="decimal"></label>'+
        '<label class="bc7-field">Costo unitario (CUP)<input data-bc7-reinvestment-unit-cost type="number" min="0.01" step="0.01" required inputmode="decimal" placeholder="Ej. 60.00"></label></div>'+
        '<p class="bc7-muted" data-bc7-reinvestment-estimate>Total calculado: introduce la cantidad y el costo unitario.</p>'+
        '<label class="bc7-field">Proveedor (opcional)<input data-bc7-reinvestment-provider maxlength="180"></label><p class="bc7-muted">El sistema multiplica cantidad × costo unitario y envía el costo total calculado. La solicitud queda pendiente: no modifica stock ni caja hasta tu aprobación administrativa.</p>'+
        '<div class="bc7-actions"><button class="bc7-btn" type="submit">Registrar reinversión</button></div><p class="bc7-msg" data-bc7-finance-msg></p></form></details>';
    }
    return html+'</section>';
  }
  // Retail Jornada Step 1 is date-based: never mount a second period-total declaration.
  function cashDaysManagerShellHtml(detail,isAssigned,status){
    if(!detail||detail.sesion?.es_minorista!==true)return '';
    const sessionId=String(detail.sesion.id||'');
    return '<section class="bc7-jornada" id="bc7-cash-days-manager"><h4>Dinero del período · por fecha</h4>'+
      '<p class="bc7-muted">Registra una entrega por cada fecha real del período. Escribe 0 CUP cuando ese día no se recogió dinero. No existe una declaración total adicional.</p>'+
      '<div data-bc7-close-form="'+esc(sessionId)+'" data-bc7-cash-mode="daily">'+
      '<div id="bc7-cash-days-list"><div class="bc7-empty">Consultando los importes del período…</div></div>'+
      '</div><p class="bc7-msg" id="bc7-cash-days-msg"></p></section>';
  }

  function renderCashDaysWorkspace(detail){
    const host=$('bc7-cash-days-list');
    if(!host||!detail||detail.sesion?.es_minorista!==true)return;
    const sessionId=String(detail.sesion.id||'');
    if(state.dailyCashSessionId!==sessionId||!state.dailyCashData){
      host.innerHTML='<div class="bc7-empty">Consultando las entregas diarias…</div>';return;
    }
    const firstDate=String(detail.sesion.fecha||'').slice(0,10);
    const lastDate=String(detail.sesion.fecha_fin||state.dailyCashData.fecha_fin||detail.sesion.fecha||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)||!/^\d{4}-\d{2}-\d{2}$/.test(lastDate)||lastDate<firstDate){
      host.innerHTML='<div class="bc7-empty">No se pudo determinar el período de la jornada. Actualiza el detalle antes de registrar el dinero.</div>';return;
    }
    const totalDays=Math.max(1,Math.round((Date.parse(lastDate+'T12:00:00Z')-Date.parse(firstDate+'T12:00:00Z'))/86400000)+1);
    const sessionState=String(detail.sesion.estado||'').toUpperCase();
    const isAssigned=!!detail.is_admin||detail.server_responsible_access===true;
    const editable=(sessionState==='EN_CURSO'&&!!detail.tramo_activo&&isAssigned)||
      (sessionState==='CERRADA_OPERATIVAMENTE'&&!!detail.tramo_registrable&&(isAssigned||!!detail.is_admin));
    const rows=arr(state.dailyCashData.entregas);
    const cashStatus=state.dailyCashStatus||null;
    const today=dateHavana();
    let html='<div class="bc7-list">';
    let registered=0;
    for(let index=0;index<totalDays;index++){
      const date=addDays(firstDate,index);
      const row=rows.find(item=>String(item.fecha||'').slice(0,10)===date);
      const rejected=!!row&&String(row.estado||'').toUpperCase()==='RECHAZADA';
      if(row&&!rejected){
        registered++;
        const dailyState=String(row.estado||'PENDIENTE').toUpperCase();
        const amount=dailyState==='APROBADA'&&row.monto_aprobado!=null?row.monto_aprobado:row.monto_declarado;
        html+='<article class="bc7-jornada" data-bc7-cash-day-row data-bc7-cash-date="'+esc(date)+'"><div class="bc7-jornada-top"><div><strong>Día '+(index+1)+' · '+esc(fmtDateHuman(date))+'</strong></div><span class="bc7-pill '+(dailyState==='APROBADA'?'ok':'warn')+'">'+esc(humanStatus(dailyState))+'</span></div>'+
          '<p><b>'+esc(money(amount))+' CUP</b>'+(row.creado_nombre?' · '+esc(row.creado_nombre):'')+'</p>'+
          (row.observacion?'<p class="bc7-muted">'+esc(row.observacion)+'</p>':'')+
          (row.comentario_revision?'<p class="bc7-muted">Revisión: '+esc(row.comentario_revision)+'</p>':'')+
          '</article>';
      }else if(editable&&date<=today){
        html+='<article class="bc7-jornada" data-bc7-cash-day-row data-bc7-cash-date="'+esc(date)+'"><div class="bc7-jornada-top"><strong>Día '+(index+1)+' · '+esc(fmtDateHuman(date))+'</strong><span class="bc7-pill warn">'+(rejected?'Rechazada · corregir':'Pendiente')+'</span></div>'+
          '<div class="bc7-grid"><label class="bc7-field">Dinero recogido este día (CUP)<input data-bc7-cash-day-amount type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="'+(rejected?esc(row.monto_declarado):'')+'"></label>'+
          '<label class="bc7-field">Observación (opcional)<input data-bc7-cash-day-note maxlength="500" value="'+(rejected?esc(row.observacion||''):'')+'" placeholder="Aclaración de la entrega"></label><input type="hidden" data-bc7-cash-day-key value=""></div>'+
          '<div class="bc7-actions"><button class="bc7-btn primary" type="button" data-bc7-save-cash-day>Enviar este día a Administración</button></div></article>';
      }else{
        html+='<article class="bc7-jornada" data-bc7-cash-day-row data-bc7-cash-date="'+esc(date)+'"><div class="bc7-jornada-top"><strong>Día '+(index+1)+' · '+esc(fmtDateHuman(date))+'</strong><span class="bc7-pill">No registrado</span></div><p class="bc7-muted">'+(date>today?'Este día todavía no se puede declarar.':'No hay importe registrado para esta fecha.')+'</p></article>';
      }
    }
    html+='<p class="bc7-muted">Fechas registradas: <b>'+registered+'/'+totalDays+'</b>. Administración revisa cada entrega diaria por separado.</p>';
    if(detail.is_admin===true&&['COMPLETADA','CERRADA_OPERATIVAMENTE'].includes(sessionState)){
      const approved=Number(cashStatus?.entregas_diarias_aprobadas||0);
      const expected=Number(cashStatus?.entregas_diarias_esperadas||totalDays);
      const totalApproved=Number(cashStatus?.total_diario_aprobado||0);
      const ready=expected>0&&approved===expected&&Number(cashStatus?.entregas_diarias_pendientes_aprobacion||0)===0;
      html+='<article class="bc7-jornada bc7-owner-cash-count"><div class="bc7-jornada-top"><strong>Verificación del efectivo por aprobaciones diarias</strong><span class="bc7-pill '+(ready?'ok':'warn')+'">'+(ready?'Aprobado':'Pendiente')+'</span></div>'+
        '<div class="bc7-workspace-overview"><div class="bc7-overview-item"><small>Entregas aprobadas</small><b>'+approved+'/'+expected+'</b></div>'+
        '<div class="bc7-overview-item"><small>Total de efectivo aceptado</small><b>'+esc(money(totalApproved))+' CUP</b></div></div>'+
        '<p class="bc7-muted">Cada aprobación diaria del Dueño verifica el importe de esa fecha. La suma de esos importes es el efectivo reconocido para la liquidación; no hace falta un segundo conteo ni otro formulario.</p></article>';
    }
    host.innerHTML=html;
  }

  async function loadCashDaysWorkspace(detail){
    const host=$('bc7-cash-days-list');
    if(!host||!detail||detail.sesion?.es_minorista!==true)return;
    const sessionId=String(detail.sesion.id||'');
    const activeSessionId=String(state.currentSession?.turno_sesion_id||'');
    const isAssigned=detail.server_responsible_access===true||activeSessionId===sessionId;
    if(!state.admin&&!isAssigned){
      host.innerHTML='<div class="bc7-empty">El servidor aún no ha confirmado tu asignación a esta jornada. No se mostraron importes.</div>';
      return;
    }
    if(state.dailyCashSessionId===sessionId&&state.dailyCashData&&state.dailyCashStatus){
      renderCashDaysWorkspace(detail);
      return true;
    }
    host.innerHTML='<div class="bc7-empty">Consultando las entregas diarias…</div>';
    try{
      const results=await Promise.allSettled([
        rpc('bc7_entregas_diarias_jornada',{p_turno_sesion_id:sessionId}),
        rpc('bc7_estado_conteo_efectivo_jornada',{p_turno_sesion_id:sessionId})
      ]);
      if(results[0].status==='rejected')throw results[0].reason;
      state.dailyCashData=results[0].value||{};
      state.dailyCashStatus=results[1].status==='fulfilled'?(results[1].value||{}):null;
      state.dailyCashSessionId=sessionId;
      renderCashDaysWorkspace(detail);
      if(results[1].status==='rejected'&&state.admin){
        const message=$('bc7-cash-days-msg');
        msg(message,'No se pudo consultar el estado de aprobación de las entregas diarias. Las entregas sí se cargaron; actualiza antes de revisar.','error');
      }
      return true;
    }catch(e){
      host.innerHTML='<div class="bc7-empty">'+esc(friendlyError(e,'calendar'))+' No se modificó ningún importe.</div>';
      return false;
    }
  }

  function refreshCashChecklistStep(checklist){
    const done=checklist?.declaracion_dinero?.completado===true;
    const row=document.querySelector('#tab-jornada [data-bc7-checklist-step="1"]');if(!row)return;
    row.classList.toggle('is-done',done);row.classList.toggle('is-pending',!done);
    const mark=row.querySelector('.bc7-checklist-mark');if(mark)mark.textContent=done?'✓':'1';
    const copy=row.querySelector('.bc7-checklist-copy small');
    if(copy){
      const registered=Number(checklist?.declaracion_dinero?.entregas_diarias_registradas||0);
      const expected=Number(checklist?.declaracion_dinero?.entregas_diarias_esperadas||0);
      copy.textContent=done?registered+'/'+expected+' entregas diarias registradas para todas las fechas del período.':'Registra una entrega por cada fecha del período ('+registered+'/'+expected+'). Escribe 0 CUP cuando ese día no hubo entrega.';
    }
    const action=row.querySelector('[data-bc7-checklist-open="declaracion_dinero"]');
    const stateLabel=row.querySelector('.bc7-checklist-state');
    if(done){
      if(action&&action.textContent.indexOf('Revisar y contar efectivo')===-1){
        const pill=document.createElement('span');pill.className='bc7-pill ok';pill.textContent='Enviado';action.replaceWith(pill);
      }
      if(stateLabel)stateLabel.textContent='✓ Enviado';
    }else{
      row.querySelector('.bc7-pill.ok')?.remove();
      if(!row.querySelector('[data-bc7-checklist-open="declaracion_dinero"]')){
        const button=document.createElement('button');button.type='button';button.className='bc7-btn primary';
        button.dataset.bc7ChecklistOpen='declaracion_dinero';button.textContent='Completar paso 1';
        row.insertBefore(button,stateLabel||null);
      }
      if(stateLabel)stateLabel.textContent='Pendiente';
    }
    const counter=row.closest('.bc7-checklist')?.querySelector('.bc7-checklist-count');
    if(counter&&state.detail?.checklist){
      const c=state.detail.checklist;
      const total=['gastos','reinversiones','bajas'].filter(k=>c[k]?.completado===true).length+(c.inventario_final?.completado===true?1:0)+(done?1:0);
      counter.textContent=total+'/5';
    }
  }
  async function saveCashDaysWorkspace(form,options){
    options=options||{};
    if(!form||!state.detail)return false;
    const detail=state.detail,sessionId=String(form.dataset.bc7CloseForm||detail.sesion?.id||'');
    // Step 1 rows are mounted in the cash workspace; the final handover button
    // lives in a separate form. Both entry points must read the same daily rows.
    const dayRoot=document.querySelector('#bc7-cash-days-manager [data-bc7-close-form]')||form;
    const message=dayRoot.querySelector('#bc7-cash-days-msg')||$('bc7-cash-days-msg')||form.querySelector('[data-bc7-close-msg]');
    const saveButton=options.button||dayRoot.querySelector('[data-bc7-save-cash-days]')||form.querySelector('[data-bc7-save-cash-days]');
    const entries=arr(state.dailyCashData?.entregas);
    const days=Array.from(dayRoot.querySelectorAll('[data-bc7-cash-day-row]'));
    const operations=[],missing=[];
    for(const day of days){
      const date=String(day.dataset.bc7CashDate||'');
      if(options.date&&date!==String(options.date))continue;
      const old=entries.find(item=>String(item.fecha||'').slice(0,10)===date);
      const oldRejected=old&&String(old.estado||'').toUpperCase()==='RECHAZADA';
      if(old&&!oldRejected)continue;
      if(options.verifyOnly){missing.push(fmtDateHuman(date));continue;}
      const raw=day.querySelector('[data-bc7-cash-day-amount]')?.value.trim()??'';
      if(raw===''){
        if(options.date){msg(message,'Introduce el importe real de '+fmtDateHuman(date)+'. Escribe 0 CUP si no se entregó dinero.','error');return false;}
        if(options.requireComplete)missing.push(fmtDateHuman(date));
        continue;
      }
      const amount=Number(raw);
      if(!Number.isFinite(amount)||amount<0){msg(message,'Revisa los importes diarios: todos deben ser números iguales o mayores que cero.','error');return false;}
      if(date>dateHavana()){msg(message,'No puedes declarar efectivo para una fecha futura.','error');return false;}
      operations.push({date,amount,note:day.querySelector('[data-bc7-cash-day-note]')?.value.trim()||null,keyField:day.querySelector('[data-bc7-cash-day-key]')});
    }
    if(options.requireComplete&&missing.length){
      msg(message,'Faltan entregas enviadas de estas fechas: '+missing.join(', ')+'. Introduce el importe y pulsa «Enviar este día a Administración»; registra 0 CUP cuando no hubo entrega.','error');return false;
    }
    if(!navigator.onLine){msg(message,'Conecta el dispositivo antes de registrar las entregas. No se modificó ningún dato.','error');return false;}
    if(!operations.length){
      let checklist=detail.checklist||null;
      if(options.requireComplete){
        try{
          checklist=await rpc('bc7_estado_confirmaciones_jornada',{p_turno_sesion_id:sessionId});
          detail.checklist=checklist;
        }catch(error){msg(message,'No se pudo verificar el estado actual del paso 1. '+friendlyError(error,'calendar'),'error');return false;}
      }
      if(checklist?.declaracion_dinero?.completado===true){msg(message,'El paso 1 ya está completo y confirmado por el servidor.','ok');return true;}
      if(options.requireComplete){
        const registered=Number(checklist?.declaracion_dinero?.entregas_diarias_registradas||0);
        const expected=Number(checklist?.declaracion_dinero?.entregas_diarias_esperadas||0);
        msg(message,'Todavía faltan entregas diarias ('+registered+'/'+expected+'). Registra los días restantes antes de entregar la jornada.','error');
        return false;
      }
      msg(message,'No hay una entrega nueva para enviar. Cada fecha se registra por separado.','error');return false;
    }
    const singleDay=!!options.date;
    const confirmation=singleDay
      ?'Se enviará únicamente la entrega del '+fmtDateHuman(operations[0].date)+' por '+money(operations[0].amount)+' CUP. Quedará pendiente de revisión administrativa; podrás registrar los demás días después. ¿Confirmas?'
      :'Se enviarán únicamente las entregas de cada fecha del período. Quedarán pendientes de revisión administrativa. ¿Confirmas?';
    if(!options.skipConfirm&&!confirm(confirmation))return false;
    if(saveButton&&!busy(saveButton,true))return false;

    const dailySubmitted=[];
    try{
      for(const operation of operations){
        let key=operation.keyField?.value.trim()||'';
        if(!key){key=freshIdempotencyKey();if(operation.keyField)operation.keyField.value=key;}
        const postClosedAdmin=!!detail.is_admin&&String(detail.sesion.estado||'').toUpperCase()==='CERRADA_OPERATIVAMENTE';
        const rpcArgs={p_turno_sesion_id:sessionId,p_fecha:operation.date,p_monto:operation.amount,p_observacion:operation.note,p_idempotency_key:key};
        const id=postClosedAdmin
          ?await rpc('bc7_admin_registrar_entrega_diaria_jornada',rpcArgs)
          :await rpc('bc7_registrar_entrega_diaria_jornada',rpcArgs);
        dailySubmitted.push({date:operation.date,amount:operation.amount,id:id?String(id):''});
      }
      if(dailySubmitted.length){
        const reread=await rpc('bc7_entregas_diarias_jornada',{p_turno_sesion_id:sessionId})||{};
        const readRows=arr(reread.entregas);
        const missingRows=dailySubmitted.filter(sent=>!readRows.some(item=>String(item.fecha||'').slice(0,10)===sent.date&&Number(item.monto_declarado)===sent.amount&&(!sent.id||String(item.id)===sent.id)));
        if(missingRows.length)throw new Error('El servidor no confirmó la lectura de '+missingRows.map(x=>fmtDateHuman(x.date)).join(', ')+'. Conservé las claves para evitar duplicados.');
        state.dailyCashData=reread;state.dailyCashSessionId=sessionId;state.dailyCashStatus=null;
        try{const latest=await rpc('bc7_estado_confirmaciones_jornada',{p_turno_sesion_id:sessionId});detail.checklist=latest;if(state.detail&&String(state.detail.sesion?.id||'')===sessionId)state.detail.checklist=latest;refreshCashChecklistStep(latest);}catch(_){/* Wait for authoritative checklist readback before changing the visible mark. */}
        try{state.dailyCashStatus=await rpc('bc7_estado_conteo_efectivo_jornada',{p_turno_sesion_id:sessionId});}catch(_){/* The daily-approval summary is refreshed independently from the delivered rows. */}
      }
      renderCashDaysWorkspace(state.detail);
      if(options.requireComplete){
        const ok=await openWorkspace(sessionId);
        if(!ok)throw new Error('Las entregas se enviaron, pero no se pudo volver a leer el checklist.');
        if(state.detail)await ensureWorkspaceOperationData(state.detail);
        if(state.detail?.checklist?.declaracion_dinero?.completado!==true){
          throw new Error('El servidor recibió las entregas, pero el paso 1 aún no registra una entrega por cada fecha del período.');
        }
        setStatus('Paso 1 confirmado: las entregas diarias están registradas para todas las fechas.','ok');
      }else if(singleDay){
        const sent=dailySubmitted[0];
        msg($('bc7-cash-days-msg')||message,'Entrega del '+fmtDateHuman(sent.date)+' enviada y confirmada por el servidor. Queda pendiente de revisión administrativa; puedes continuar con los otros días.','ok');
        setStatus('Entrega diaria del '+fmtDateHuman(sent.date)+' enviada a Administración.','ok');
      }else{
        msg($('bc7-cash-days-msg')||message,'Entregas diarias guardadas y confirmadas por el servidor.','ok');
        setStatus('Entregas diarias del período actualizadas.','ok');
      }
      return true;
    }catch(e){
      msg($('bc7-cash-days-msg')||message,friendlyError(e,'create')+' '+String(e&&e.message||'')+' Las claves de idempotencia se conservaron para evitar duplicados.','error');
      setStatus('No se pudo confirmar el paso 1 completo.','error');
      return false;
    }finally{if(saveButton)busy(saveButton,false);}
  }

  async function saveAdminCashDeclaration(form){
    const sessionId=String(form?.dataset?.bc7AdminCashDeclaration||'');
    const amountInput=form?.querySelector('[data-bc7-admin-cash-amount]');
    const noteInput=form?.querySelector('[data-bc7-admin-cash-note]');
    const amount=amountInput&&amountInput.value.trim()!==''?Number(amountInput.value):NaN;
    const note=String(noteInput?.value||'').trim();
    const message=form?.querySelector('[data-bc7-admin-cash-msg]');
    const button=form?.querySelector('button[type="submit"]');
    if(!state.admin||!sessionId||String(state.detail?.sesion?.estado||'').toUpperCase()!=='CERRADA_OPERATIVAMENTE'){
      msg(message,'Solo ADMIN puede transcribir una declaración de efectivo después del sello operativo.','error');return false;
    }
    if(!Number.isFinite(amount)||amount<0||note.length<5){
      msg(message,'Introduce un importe válido y una fuente/observación de al menos 5 caracteres.','error');return false;
    }
    if(!confirm('Se registrará el importe declarado por la responsable según la fuente indicada. No se guardará todavía ningún conteo físico. ¿Confirmas?'))return false;
    if(!busy(button,true))return false;
    try{
      await rpc('bc5_admin_transcribir_declaracion_dinero',{
        p_turno_sesion_id:sessionId,p_monto:amount,p_observacion:note
      });
      const loaded=await openWorkspace(sessionId);
      if(!loaded)throw new Error('La declaración fue enviada pero no se pudo recargar la Jornada.');
      setStatus('Declaración transcrita y auditada. El conteo físico del Dueño sigue separado.','ok');
      return true;
    }catch(error){
      msg(message,friendlyError(error,'create')+' '+String(error?.message||''),'error');
      return false;
    }finally{busy(button,false);}
  }
  async function rectifyAdminCashDeclaration(form){
    const declarationId=String(form?.dataset?.bc7RectifyCashDeclaration||'');
    const sessionId=String(form?.dataset?.bc7RectifyCashSession||'');
    const date=String(form?.querySelector('[data-bc7-rectify-cash-date]')?.value||'');
    const note=String(form?.querySelector('[data-bc7-rectify-cash-note]')?.value||'').trim();
    const message=form?.querySelector('[data-bc7-rectify-cash-msg]');
    const button=form?.querySelector('button[type="submit"]');
    const declaration=state.detail?.declaracion_dinero,session=state.detail?.sesion;
    if(!state.admin||!declarationId||!sessionId||String(session?.estado||'').toUpperCase()!=='CERRADA_OPERATIVAMENTE'||!declaration||String(declaration.id)!==declarationId||declaration.monto_contado!=null||!['PENDIENTE','ESPERANDO_APROBACION'].includes(String(declaration.estado_aprobacion||'').toUpperCase())){
      msg(message,'La declaración ya cambió o no está disponible para rectificación. Actualiza la Jornada.','error');return false;
    }
    if(!date||date<String(session.fecha||'').slice(0,10)||date>String(session.fecha_fin||session.fecha||'').slice(0,10)||note.length<5){
      msg(message,'Selecciona una fecha dentro del período y escribe un motivo de al menos 5 caracteres.','error');return false;
    }
    if(!confirm('Se conservará la declaración original de '+money(declaration.monto)+' CUP como RECTIFICADA y se creará una entrega diaria por el mismo importe para el '+fmtDateHuman(date)+'. El conteo físico final quedará pendiente hasta registrar la declaración final correcta. ¿Confirmas?'))return false;
    if(!busy(button,true))return false;
    try{
      await rpc('bc5_admin_rectificar_declaracion_a_entrega_diaria',{p_declaracion_id:declarationId,p_fecha:date,p_observacion:note});
      const loaded=await openWorkspace(sessionId);
      if(!loaded)throw new Error('La rectificación se envió, pero no se pudo recargar la Jornada.');
      setStatus('Declaración rectificada: importe diario y fecha guardados con auditoría.','ok');return true;
    }catch(error){
      msg(message,friendlyError(error,'create')+' '+String(error?.message||''),'error');return false;
    }finally{busy(button,false);}
  }

  function cashDeclarationHtml(detail){
    if(detail?.sesion?.es_minorista===true)return '';
    const d=detail&&detail.declaracion_dinero;
    if(!d)return '<div class="bc7-jornada" id="bc7-cash-summary"><h4>Entrega de efectivo</h4><p class="bc7-muted">Todavía no hay una declaración de efectivo para esta jornada.</p></div>';
    const counted=d.monto_contado!=null;
    const difference=d.diferencia!=null;
    const sessionState=String(detail?.sesion?.estado||'').toUpperCase();
    const approvalState=String(d.estado_aprobacion||'').toUpperCase();
    const statusLabel=sessionState==='COMPLETADA'
      ?((approvalState==='PENDIENTE'||approvalState==='ESPERANDO_APROBACION')?'Esperando aprobación':humanStatus(approvalState||'ESPERANDO_APROBACION'))
      :sessionState==='EN_CURSO'?'Esperando entrega':humanStatus(sessionState||approvalState||'ESPERANDO_ENTREGA');
    return '<div class="bc7-jornada" id="bc7-cash-summary"><h4>Entrega de efectivo</h4>'+
      '<div class="bc7-workspace-overview"><div class="bc7-overview-item"><small>Declarado por responsable</small><b>'+esc(money(d.monto))+' CUP</b></div>'+
      '<div class="bc7-overview-item"><small>Contado por Dueño</small><b>'+(counted?esc(money(d.monto_contado))+' CUP':'Pendiente')+'</b></div>'+
      '<div class="bc7-overview-item"><small>Diferencia</small><b>'+(difference?esc(money(d.diferencia))+' CUP':'Pendiente')+'</b></div></div>'+
      '<p class="bc7-muted">Estado: '+esc(statusLabel)+'.</p></div>';
  }

  function renderDailyCash(host,data){
    if(!host)return;
    const rows=arr(data&&data.entregas);
    if(!rows.length){
      host.innerHTML='<div class="bc7-jornada" id="bc7-daily-cash-summary"><h4>Dinero recogido diariamente</h4><p class="bc7-muted">Todavía no hay entregas diarias registradas.</p></div>';
      return;
    }
    host.innerHTML='<div class="bc7-jornada" id="bc7-daily-cash-summary"><h4>Dinero recogido diariamente</h4>'+
      '<div class="bc7-list">'+rows.map(function(item){
        const status=String(item.estado||'PENDIENTE').toUpperCase();
        const amount=status==='APROBADA'&&item.monto_aprobado!=null?item.monto_aprobado:item.monto_declarado;
        return '<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(fmtDateHuman(item.fecha))+' · '+esc(money(amount))+' CUP</strong>'+
          '<p>'+esc(item.creado_nombre||'Responsable')+(item.revisado_nombre?' · revisó '+esc(item.revisado_nombre):'')+'</p></div>'+
          '<span class="bc7-pill '+(status==='APROBADA'?'ok':status==='RECHAZADA'?'warn':'')+'">'+esc(humanStatus(status))+'</span></div>'+
          (item.observacion?'<p>'+esc(item.observacion)+'</p>':'')+
          (item.comentario_revision?'<p class="bc7-muted">Revisión: '+esc(item.comentario_revision)+'</p>':'')+'</article>';
      }).join('')+'</div></div>';
  }
  function renderInventorySettlement(host,result){
    if(!host)return;
    if(!result||result.aplica===false){
      host.innerHTML='<div class="bc7-empty">'+esc(result&&result.motivo||'La liquidación por inventario no está disponible.')+'</div>';
      return;
    }
    const pending=result.pendientes||{};
    const calculable=result.calculable===true;
    const summary=[
      ['Venta comprobada',result.ventas_estimadas],
      ['Salario calculado',result.salario_calculado],
      ['Gastos aprobados',result.gastos_aprobados],
      ['Reinversiones aprobadas',result.reinversiones_aprobadas],
      ['Dinero recogido',result.dinero_recogido_total],
      ['Efectivo esperado (sin salario)',(result.efectivo_esperado_despues_de_gastos_reinversiones??result.efectivo_esperado_despues_de_gastos_reinversiones_salario)],
      ['Sobrante / faltante (− sobrante · + faltante)',result.diferencia]
    ];
    const cards='<div class="bc7-workspace-overview">'+summary.map(function(item){
      const value=item[1]==null?'Pendiente':money(item[1])+' CUP';
      return '<div class="bc7-overview-item"><small>'+esc(item[0])+'</small><b>'+esc(value)+'</b></div>';
    }).join('')+'</div>';
    const rows=arr(result.lineas);
    const table=rows.length
      ?'<div class="bc7-table-wrap"><table class="bc7-table bc7-table-wide"><thead><tr><th>Familia</th><th>Inicial</th><th>Entradas</th><th>Salidas</th><th>Final</th><th>Vendidas</th><th>Precio</th><th>Importe</th></tr></thead><tbody>'+
        rows.map(function(line){
          const entries=Number(line.transferencias_entrada||0)+Number(line.compras||0)+Number(line.reinversiones_entrada||0);
          const exits=Number(line.transferencias_salida||0)+Number(line.vales_salida||0)+Number(line.mermas_aprobadas||0)+Number(line.bajas_aprobadas||0);
          return '<tr><td>'+esc(line.nombre||'Producto')+'</td>'+
            '<td>'+esc(qty(line.inventario_inicial))+'</td><td>'+esc(qty(entries))+'</td>'+
            '<td>'+esc(qty(exits))+'</td><td>'+esc(qty(line.inventario_final))+'</td>'+
            '<td><b>'+esc(qty(line.unidades_vendidas))+'</b></td>'+
            '<td>'+esc(line.precio_unitario==null?'Sin precio':money(line.precio_unitario))+'</td>'+
            '<td>'+esc(line.importe_estimado==null?'—':money(line.importe_estimado))+'</td></tr>';
        }).join('')+'</tbody></table></div>'
      :'<div class="bc7-empty">El cálculo aparecerá cuando existan cortes de inventario confirmados.</div>';
    const blockers=[];
    if(result.faltan_cortes)blockers.push('Falta confirmar el inventario inicial o final.');
    if(Number(result.familias_sin_precio||0)>0)blockers.push(Number(result.familias_sin_precio)+' familias no tienen un precio de venta único y válido.');
    if(Number(result.familias_con_vendidas_negativas||0)>0)blockers.push(Number(result.familias_con_vendidas_negativas)+' familias presentan unidades vendidas negativas; revisa sus movimientos y conteos.');
    if(result.salario_porcentaje==null)blockers.push('Configura el porcentaje salarial individual de esta dependienta desde Almacenes.');
    if(Number(pending.entregas_diarias||0)>0)blockers.push(Number(pending.entregas_diarias)+' entregas diarias pendientes de aprobación.');
    if(Number(pending.entregas_diarias_faltantes||result.entregas_diarias_faltantes||0)>0)blockers.push(Number(pending.entregas_diarias_faltantes||result.entregas_diarias_faltantes)+' días sin entrega diaria aprobada.');
    if(Number(pending.gastos||0)>0)blockers.push(Number(pending.gastos)+' gastos pendientes de aprobación.');
    if(Number(pending.reinversiones||0)>0)blockers.push(Number(pending.reinversiones)+' reinversiones pendientes de aprobación.');
    if(Number(pending.ajustes||0)>0)blockers.push(Number(pending.ajustes)+' bajas pendientes de aprobación.');
    host.innerHTML='<div class="bc7-jornada" id="bc7-inventory-settlement-summary"><h4>Liquidación por diferencia de inventario</h4>'+
      '<p class="bc7-muted">Inicial + entradas − salidas aprobadas − final = unidades vendidas. Precio normal de la familia o precio uniforme de sus variantes. El salario usa el porcentaje individual configurado para esta dependienta en Almacenes.</p>'+
      '<p class="bc7-muted">El salario se acumula en CuevaCoin y se paga después; no se descuenta del efectivo de esta jornada.</p>'+
      '<span class="bc7-pill '+(calculable?'ok':'warn')+'">'+(calculable?'Liquidación calculable':'Liquidación provisional · faltan validaciones')+'</span>'+
      cards+(rows.length?'<details class="bc7-finance-fold"><summary>Desglose por producto</summary>'+table+'</details>':table)+
      (blockers.length?'<div class="bc7-note"><b>Para cerrar la liquidación:</b><ul>'+blockers.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'<p class="bc7-muted">No quedan aprobaciones ni validaciones pendientes.</p>')+
      '</div>';
  }
  function renderFinanceList(host,rows,type){
    if(!host)return;
    if(!rows.length){
      host.innerHTML='<div class="bc7-empty">No hay '+(type==='gastos'?'gastos':'reinversiones')+' vinculadas a esta jornada.</div>';
      return;
    }
    if(type==='gastos'){
      host.innerHTML='<h4>Gastos</h4><div class="bc7-list">'+rows.map(g=>
        '<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(g.concepto||'Gasto')+' · '+esc(money(g.monto))+'</strong><p>'+esc(fmtDateHuman(g.creado_en))+' · '+esc(g.creado_nombre||'Responsable')+'</p></div><span class="bc7-pill '+(g.estado==='APROBADO'?'ok':g.estado==='RECHAZADO'?'warn':'')+'">'+esc(humanStatus(g.estado||'PENDIENTE'))+'</span></div>'+
        (g.categoria&&g.categoria!=='LEGACY'?'<p class="bc7-muted">'+esc(g.categoria==='SALARIOS'?'Salarios':g.categoria==='UTILES_DE_LA_CAFETERIA'?'Útiles de la cafetería':'Otros gastos')+(g.beneficiario_nombre?' · '+esc(g.beneficiario_nombre):'')+(g.cuevacoin_pago_estado&&g.cuevacoin_pago_estado!=='NO_APLICA'?' · CuevaCoin '+esc(g.cuevacoin_pago_estado):'')+'</p>':'')+
        (g.descripcion?'<p>'+esc(g.descripcion)+'</p>':'')+
        (g.comentario_revision?'<p class="bc7-muted">Revisión: '+esc(g.comentario_revision)+'</p>':'')+'</article>'
      ).join('')+'</div>';
    }else{
      host.innerHTML='<h4>Reinversiones</h4><div class="bc7-list">'+rows.map(r=>
        '<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(r.proveedor||'Reinversión')+' · '+esc(money(r.total))+'</strong><p>'+esc(fmtDateHuman(r.fecha))+' · '+esc(r.usuario_nombre||'Responsable')+'</p></div><span class="bc7-pill '+(r.estado==='APROBADA'?'ok':r.estado==='RECHAZADA'?'warn':'')+'">'+esc(humanStatus(r.estado||'PENDIENTE'))+'</span></div>'+
        '<div class="bc7-muted">'+arr(r.lineas).map(l=>esc(l.producto||'Producto no identificado')+' · '+esc(qty(l.cantidad_base))+' · '+esc(money(l.costo_total))).join('<br>')+'</div>'+(r.comentario_revision?'<p class="bc7-muted">Revisión: '+esc(r.comentario_revision)+'</p>':'')+'</article>'
      ).join('')+'</div>';
    }
  }
  function renderSalesLedger(host,data){
    if(!host)return;
    const rows=arr(data&&data.ventas),summary=data&&data.resumen||{};
    const methods=[
      ['Efectivo',summary.efectivo],
      ['Transferencia',summary.transferencia],
      ['Tarjeta',summary.tarjeta],
      ['Otro',summary.otro],
      ['Método no declarado',summary.sin_metodo]
    ];
    const cards='<div class="bc7-workspace-overview"><div class="bc7-overview-item"><small>Ventas vinculadas</small><b>'+esc(String(summary.cantidad||0))+'</b></div>'+
      '<div class="bc7-overview-item"><small>Total de ventas</small><b>'+esc(money(summary.total||0))+' CUP</b></div></div>'+
      '<div class="bc7-list">'+methods.map(function(item){
        return '<article class="bc7-jornada"><strong>'+esc(item[0])+' · '+esc(money(item[1]||0))+' CUP</strong></article>';
      }).join('')+'</div>';
    const list=rows.length?'<h4>Ventas registradas</h4><div class="bc7-list">'+rows.map(function(v){
      return '<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(money(v.total||0))+' CUP · '+esc(String(v.id||'').slice(0,8))+'</strong><p>'+esc(fmtDateHuman(v.fecha))+' · '+esc(String(v.metodo_pago||'NO_DECLARADO').replace(/_/g,' '))+'</p></div></div>'+
        '<div class="bc7-muted">'+arr(v.lineas).map(function(line){return esc(line.producto||'Producto')+' · '+esc(qty(line.cantidad))+' × '+esc(money(line.precio_unitario))+' = '+esc(money(line.subtotal));}).join('<br>')+'</div></article>';
    }).join('')+'</div>':'<div class="bc7-empty">No hay ventas nuevas vinculadas de forma verificable a esta jornada. Las ventas históricas sin ID de sesión siguen en el historial general y no se reasignan automáticamente.</div>';
    host.innerHTML='<h4>Ventas por forma de pago</h4>'+cards+list+
      '<p class="bc7-muted">Este desglose informa los importes registrados por método de pago. No equivale al efectivo esperado ni sustituye la declaración y el conteo físico.</p>';
  }
  async function loadFinances(detail){
    const activeSessionId=String(state.currentSession?.turno_sesion_id||'');
    const isRetail=detail.sesion.es_minorista===true;
    const localAssignment=String(currentUser()?.id||'')===String(detail.sesion.responsable_id||'')||activeSessionId===String(detail.sesion.id||'');
    const isAssigned=isRetail?(!!state.admin||detail.server_responsible_access===true):localAssignment;
    const hasExpenses=state.admin||isAssigned;
    const hasReinvestments=state.admin||isAssigned;
    const hasSettlement=isRetail&&(state.admin||isAssigned);
    const hasSales=!isRetail&&(state.admin||can('ventas','ver'));
    const hasFinance=hasExpenses||hasReinvestments;
    if(!hasFinance&&!hasSales&&!hasSettlement)return true;
    const sessionId=detail.sesion.id;
    let financeData={},salesData={},settlement=null;
    if(hasFinance){
      try{financeData=await rpc('bc7_finanzas_jornada',{p_turno_sesion_id:sessionId})||{};}
      catch(e){
        const message=friendlyError(e,'calendar')+' No se han modificado datos.';
        if($('bc7-expenses-list'))msg($('bc7-expenses-list'),message,'error');
        if($('bc7-reinvestments-list'))msg($('bc7-reinvestments-list'),message,'error');
      }
    }
    if(hasSales){
      try{
        salesData=await rpc('bc7_ventas_jornada',{p_turno_sesion_id:sessionId})||{};
        renderSalesLedger($('bc7-sales-list'),salesData);
      }catch(e){
        if($('bc7-sales-list'))msg($('bc7-sales-list'),friendlyError(e,'calendar')+' No se modificaron datos.','error');
      }
    }
    if(hasSettlement){
      try{
        settlement=detail.liquidacion||await rpc('bc7_liquidacion_inventario_jornada',{p_turno_sesion_id:sessionId})||{};
        detail.liquidacion=settlement;
        state.inventorySettlement=settlement;
        renderInventorySettlement($('bc7-inventory-settlement'),settlement);
      }catch(e){
        if($('bc7-inventory-settlement'))msg($('bc7-inventory-settlement'),friendlyError(e,'calendar')+' No se modificaron datos.','error');
      }
    }
    if(hasExpenses){
      try{
        const metadata=await rpc('bc7_payroll_list_expenses_for_session',{p_turno_sesion_id:sessionId});
        const byId=new Map(arr(metadata).map(item=>[String(item.id),item]));
        financeData.gastos=arr(financeData.gastos).map(item=>Object.assign({},item,byId.get(String(item.id))||{}));
      }catch(_){/* Legacy finance view remains usable if the extended metadata RPC is unavailable. */}
      renderFinanceList($('bc7-expenses-list'),arr(financeData.gastos),'gastos');
    }
    if(hasReinvestments)renderFinanceList($('bc7-reinvestments-list'),arr(financeData.reinversiones),'reinversiones');
    return true;
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
        const category=form.querySelector('[data-bc7-expense-category]')?.value||'OTROS';
        const beneficiary=form.querySelector('[data-bc7-expense-beneficiary]')?.value||null;
        if(category==='SALARIOS'&&!beneficiary)throw new Error('Selecciona la dependienta que recibe el retiro de salario.');
        createdId=await rpc('bc7_payroll_registrar_gasto_jornada',{
          p_turno_sesion_id:sessionId,p_categoria:category,
          p_beneficiario_usuario_id:category==='SALARIOS'?beneficiary:null,
          p_concepto:concept,p_monto:amount,p_descripcion:description||null,
          p_idempotency_key:key
        });
      }else if(type==='reinversion'){
        const product=form.querySelector('[data-bc7-reinvestment-product]').value;
        const quantity=Number(form.querySelector('[data-bc7-reinvestment-quantity]').value);
        const unitCost=Number(form.querySelector('[data-bc7-reinvestment-unit-cost]').value);
        const totalCost=Math.round(quantity*unitCost*100)/100;
        const supplier=form.querySelector('[data-bc7-reinvestment-provider]').value.trim();
        if(!product||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitCost)||unitCost<=0||!Number.isFinite(totalCost)||totalCost<=0)throw new Error('Selecciona producto, cantidad positiva y costo unitario válido.');
        updateReinvestmentEstimate(form);
        createdId=await rpc('bc7_registrar_reinversion_jornada',{
          p_turno_sesion_id:sessionId,
          p_lineas:[{producto_id:product,presentacion_id:null,cantidad_presentacion:null,cantidad_base:quantity,costo_total:totalCost}],
          p_idempotency_key:key,p_proveedor:supplier||null
        });
      }else{
        throw new Error('Tipo de operación financiera desconocido.');
      }
      if(createdId&&createdId.__bcOfflineQueued){
        form.reset();keyField.value='';
        msg(message,'Guardado en este dispositivo para esta Jornada. Queda pendiente de sincronización y aprobación; no se ha aplicado a caja ni inventario. Referencia local: '+(createdId.queueId||'pendiente'),'ok');
        setStatus('Gasto/reinversión pendiente de sincronización. No se confirmó ningún efecto real.','ok');
        return;
      }
      const canReadThisType=state.admin||can('turnos','ver');
      if(!canReadThisType){
        form.reset();keyField.value='';
        msg(message,'El servidor guardó la operación. No aparece en el historial de esta cuenta porque tu usuario no tiene permiso para consultarlo; los gastos siguen el proceso habitual de aprobación.','ok');
        await loadCalendar();
        setStatus('Operación aceptada por el servidor. El historial requiere el permiso de lectura de la sección.','ok');
        return;
      }
      const verified=await loadFinances(state.detail);
      if(!verified){
        msg(message,'El servidor aceptó la operación, pero no pudimos comprobarla al volver a consultar. No la envíes otra vez con una referencia nueva; el formulario conserva la referencia original para evitar duplicados.','error');
        return;
      }
      form.reset();
      keyField.value='';
      msg(message,type==='gasto'?'Gasto enviado y visible en la jornada; queda pendiente de aprobación.':'Reinversión enviada y visible en la jornada; no afecta stock ni caja hasta que la apruebes.','ok');
      await loadCalendar();
      setStatus('Operación financiera registrada y leída desde el servidor.','ok');
    }catch(e){
      msg(message,friendlyError(e,'create')+' La operación no quedó confirmada; no repitas el envío con otra clave.','error');
    }finally{busy(btn,false);}
  }

  function cutHtml(cut,products,delivery){
    if(!cut)return '<div class="bc7-empty">Aún no hay conteo confirmado.</div>';
    const lines=arr(cut.lineas);
    const sharedLines=new Map(arr(delivery&&delivery.lineas).map(x=>[String(x.producto_id),x]));
    const accepted=!!delivery&&delivery.estado==='ACEPTADA';
    const sharedNote=delivery
      ?'<div class="bc7-note"><b>Entrega compartida · '+esc(delivery.estado)+'</b><p class="bc7-muted">El valor declarado y la cantidad recibida se conservan en este expediente. La cantidad física aceptada alimenta el inventario inicial del destino; el FINAL del origen se mantiene independiente. No se repite una segunda tabla.</p>'+
        (accepted?'<p class="bc7-note">La cantidad física aceptada quedó confirmada como inventario inicial del destino; el FINAL del origen no se modifica por esta recepción.</p>':
          '<p class="bc7-note">La cantidad efectiva todavía no está aceptada. No se puede operar en la jornada de destino.</p>')+
        '</div>'
      :'';
    return '<p class="bc7-muted">Confirmado '+esc(fmtDateHuman(cut.confirmado_en||cut.creado_en))+' · responsable '+esc(userName(cut.confirmado_por||cut.creado_por))+' · '+lines.length+' productos.</p>'+
      (cut.origen_corte_id?'<p class="bc7-muted">Este inventario inicial pertenece a la entrega compartida del corte final anterior.</p>':'')+
      (cut.observacion?'<p class="bc7-muted">Nota: '+esc(cut.observacion)+'</p>':'')+
      '<div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Producto</th><th>'+(accepted?'Cantidad efectiva compartida':'Conteo registrado')+'</th><th>Saldo del sistema guardado (referencia)</th><th>Diferencia</th></tr></thead><tbody>'+
      lines.map(l=>{
        const p=products.find(x=>String(x.producto_id)===String(l.producto_id))||{};
        const shared=sharedLines.get(String(l.producto_id));
        const hasEffective=accepted&&shared&&shared.cantidad_efectiva!=null;
        const effective=hasEffective?Number(shared.cantidad_efectiva):Number(l.cantidad_contada);
        const d=effective-Number(l.stock_sistema||0);
        const audit=hasEffective?'<small>Declarado originalmente: '+esc(qty(shared.cantidad_declarada))+' · recibido físicamente: '+esc(qty(shared.cantidad_recibida))+'</small>':'';
        return '<tr><td>'+esc(p.nombre||'Producto no identificado')+'</td><td><b>'+esc(qty(effective))+'</b>'+audit+'</td><td>'+esc(qty(l.stock_sistema))+'</td><td class="bc7-diff '+(d===0?'good':'bad')+'">'+(d>0?'+':'')+esc(qty(d))+'</td></tr>';
      }).join('')+
      '</tbody></table></div><p class="bc7-muted">Diferencia inicial = cantidad efectiva compartida menos saldo del sistema guardado al crear este corte. No compara la declaración con la recepción ni demuestra por sí sola una pérdida.</p>'+sharedNote;
  }

  function receiveAttemptKey(deliveryId){
    return String(deliveryId||'');
  }
  function getReceiveAttempt(delivery){
    const key=receiveAttemptKey(delivery&&delivery.id);
    if(!key)return {key:'',mode:'fast',step:'select',search:'',marked:{},values:{},note:'',attestFast:false,attestDiff:false,inline:null,sending:false,idempotencyKey:'',lastSignature:''};
    if(!state.receiveAttempts[key]){
      state.receiveAttempts[key]={key,mode:'fast',step:'select',search:'',marked:{},values:{},note:'',attestFast:false,attestDiff:false,inline:null,sending:false,idempotencyKey:'',lastSignature:''};
    }
    const attempt=state.receiveAttempts[key];
    if(!attempt.marked||typeof attempt.marked!=='object')attempt.marked={};
    if(!attempt.values||typeof attempt.values!=='object')attempt.values={};
    if(!['select','values'].includes(attempt.step))attempt.step='select';
    if(typeof attempt.search!=='string')attempt.search='';
    return attempt;
  }
  function receiveSignature(payload){try{return JSON.stringify(payload);}catch(_){return String(Date.now());}}
  function isUncertainReceiveError(error){
    const value=String(error&&error.message||error||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const code=String(error&&error.code||'').toUpperCase();
    return code===''&&(/failed to fetch|network|timeout|load failed|fetch failed|abort|offline|sin conexion|cliente supabase no disponible/.test(value));
  }
  function receiveInlineStatusHtml(attempt,delivery){
    const backendPending=delivery&&delivery.estado==='PENDIENTE_REVISION';
    const backendRecount=delivery&&delivery.estado==='REQUIERE_RECUENTO';
    let text='',kind='';
    if(attempt&&attempt.inline){text=attempt.inline.text||'';kind=attempt.inline.kind||'';}
    else if(backendPending){text='Recepción enviada a revisión del Dueño. Jornada bloqueada hasta la decisión.';kind='ok';}
    else if(backendRecount){text='El Dueño rechazó el conteo anterior. Se requiere un nuevo conteo físico completo.';kind='error';}
    return '<p class="bc7-msg '+esc(kind)+'" data-bc7-receive-msg role="status" aria-live="polite">'+esc(text)+'</p>';
  }
  function receiveSummaryFromForm(form){
    const lines=arr(JSON.parse(form.dataset.bc7ReceiveLines||'[]'));
    const deliveryId=form.dataset.bc7ReceiveDelivery||'';
    const attempt=getReceiveAttempt({id:deliveryId});
    const mode=form.querySelector('[data-bc7-receive-mode][aria-pressed="true"]')?.dataset.bc7ReceiveMode||attempt.mode||'fast';
    let counted=0,matches=0,differences=0,invalid=0,pending=0;
    if(mode==='fast'){
      const attested=!!form.querySelector('[data-bc7-receive-attest-fast]')?.checked;
      if(attested){counted=lines.length;matches=lines.length;}
      else{pending=lines.length;}
      return {total:lines.length,counted,matches,differences,pending,invalid,mode,attested,selectedCount:0,step:'fast'};
    }
    const selected=lines.filter(l=>!!attempt.marked[String(l.producto_id)]);
    const selectedCount=selected.length;
    const step=attempt.step==='values'?'values':'select';
    if(step!=='values'){
      return {total:lines.length,counted:0,matches:lines.length-selectedCount,differences:0,pending:selectedCount,invalid:0,mode,attested:false,selectedCount,step};
    }
    const attested=!!form.querySelector('[data-bc7-receive-attest-diff]')?.checked;
    selected.forEach(l=>{
      const id=String(l.producto_id);
      const input=form.querySelector('[data-bc7-receive-count="'+CSS.escape(id)+'"]');
      const raw=String(input?input.value:(attempt.values[id]??'')).trim();
      if(raw===''){pending++;return;}
      if(!/^\d+(?:\.\d{1,3})?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)<0){invalid++;return;}
      counted++;
      const diff=Math.round((Number(raw)-Number(l.cantidad_declarada))*1000)/1000;
      if(Math.abs(diff)<0.0005)matches++; else differences++;
    });
    if(!attested)pending+=selectedCount;
    return {total:lines.length,counted,matches,differences,pending,invalid,mode,attested,selectedCount,step};
  }
  function renderReceiveSummary(form){
    const s=receiveSummaryFromForm(form);
    const el=form.querySelector('[data-bc7-receive-summary]');
    if(el){
      if(s.mode==='fast'){
        el.textContent=s.attested
          ?'✓ Coincidencia total confirmada · '+s.total+' productos · Sin diferencias'
          :'Conteo completo pendiente de confirmación · '+s.total+' productos';
        el.classList.toggle('is-confirmed',!!s.attested);
      }else if(s.step==='select'){
        el.textContent=s.total+' productos en la entrega · '+s.selectedCount+' diferencias seleccionadas';
        el.classList.remove('is-confirmed');
      }else{
        el.textContent=s.selectedCount+' productos con diferencia · '+s.counted+' cantidades válidas · '+s.differences+' cantidades distintas del saldo anterior · '+s.pending+' pendientes'+(s.invalid?' · '+s.invalid+' inválidas':'');
        el.classList.remove('is-confirmed');
      }
    }
    const submit=form.querySelector('[data-bc7-receive-submit]');
    if(submit){
      const canSend=!form.dataset.bc7Sending && s.mode==='fast'
        ? !!s.attested && s.pending===0 && s.invalid===0
        : !form.dataset.bc7Sending && s.mode==='diff' && s.step==='values' && s.selectedCount>0 && !!s.attested && s.invalid===0 && s.pending===0;
      submit.disabled=!canSend;
      submit.hidden=s.mode==='diff'&&s.step!=='values';
    }
    const next=form.querySelector('[data-bc7-receive-continue]');
    if(next)next.disabled=s.selectedCount===0;
    const fastState=form.querySelector('[data-bc7-receive-fast-state]');
    if(fastState)fastState.classList.toggle('is-confirmed',s.mode==='fast'&&!!s.attested);
  }
  function receiveDiffPaneHtml(lines,attempt){
    const selected=lines.filter(l=>!!attempt.marked[String(l.producto_id)]);
    const total=lines.length;
    if(attempt.step!=='values'){
      const candidates=lines.filter(l=>!attempt.marked[String(l.producto_id)]);
      const picker=candidates.map(l=>{
        const id=String(l.producto_id);
        return '<article class="bc7-receive-pick-row" data-bc7-receive-picker-row data-bc7-receive-name="'+esc(l.nombre||'Producto')+'">'+
          '<div class="bc7-receive-pick-copy"><strong>'+esc(l.nombre||'Producto')+'</strong><span>Saldo del turno anterior: '+esc(qty(l.cantidad_declarada))+'</span></div>'+
          '<button type="button" class="bc7-btn bc7-receive-compact-btn" data-bc7-receive-add="'+esc(id)+'">Agregar</button>'+
        '</article>';
      }).join('');
      const chosen=selected.map(l=>{
        const id=String(l.producto_id);
        return '<article class="bc7-receive-selected-row">'+
          '<div class="bc7-receive-pick-copy"><strong>'+esc(l.nombre||'Producto')+'</strong><span>Saldo anterior: '+esc(qty(l.cantidad_declarada))+'</span></div>'+
          '<button type="button" class="bc7-btn bc7-receive-compact-btn" data-bc7-receive-remove="'+esc(id)+'" aria-label="Quitar '+esc(l.nombre||'producto')+'">Quitar</button>'+
        '</article>';
      }).join('');
      return '<div class="bc7-receive-stage">'+
        '<div class="bc7-receive-step-heading"><span class="bc7-receive-step-number">1</span><div><b>Seleccionar productos con diferencias</b><small>Busca cada producto y agrégalo a la lista. Todavía no introduzcas cantidades.</small></div></div>'+
        '<label class="bc7-field"><span>Buscar producto</span><input type="search" data-bc7-receive-search value="'+esc(attempt.search||'')+'" placeholder="Escribe el nombre del producto"></label>'+
        '<div class="bc7-receive-picker-list" aria-label="Productos disponibles para seleccionar">'+
          (picker||'<div class="bc7-empty bc7-receive-picker-empty">No hay más productos por agregar. Revisa la selección.</div>')+
        '</div>'+
        '<div class="bc7-receive-selected-block"><div class="bc7-receive-list-heading"><b>Productos seleccionados</b><span>'+selected.length+'</span></div>'+
          '<div class="bc7-receive-selected-list">'+(chosen||'<div class="bc7-empty">Todavía no has seleccionado productos.</div>')+'</div></div>'+
        '<div class="bc7-actions"><button type="button" class="bc7-btn primary" data-bc7-receive-continue '+(selected.length?'':'disabled')+'>Continuar con '+selected.length+' productos</button></div>'+
        '<p class="bc7-muted bc7-receive-footnote">Los productos que no agregues conservan exactamente la cantidad declarada del turno anterior.</p>'+
      '</div>';
    }
    const correctionRows=selected.map(l=>{
      const id=String(l.producto_id);
      const value=attempt.values[id]!=null?String(attempt.values[id]):'';
      return '<article class="bc7-receive-correction-row">'+
        '<div class="bc7-receive-correction-copy"><strong>'+esc(l.nombre||'Producto')+'</strong><span>Saldo anterior: '+esc(qty(l.cantidad_declarada))+'</span><small data-bc7-receive-diff="'+esc(id)+'"></small></div>'+
        '<label class="bc7-field"><span>Cantidad real</span><input type="number" min="0" step="0.001" inputmode="decimal" data-bc7-receive-count="'+esc(id)+'" data-bc7-receive-declared="'+esc(l.cantidad_declarada)+'" aria-label="Cantidad física de '+esc(l.nombre||'Producto')+'" value="'+esc(value)+'" placeholder="0"></label>'+
      '</article>';
    }).join('');
    return '<div class="bc7-receive-stage">'+
      '<div class="bc7-receive-step-heading"><span class="bc7-receive-step-number">2</span><div><b>Corregir las cantidades encontradas</b><small>Solo aparecen los '+selected.length+' productos que seleccionaste.</small></div></div>'+
      '<div class="bc7-receive-correction-list">'+correctionRows+'</div>'+
      '<button type="button" class="bc7-btn bc7-receive-back-btn" data-bc7-receive-back>← Volver a seleccionar productos</button>'+
      '<label class="bc7-check"><input type="checkbox" data-bc7-receive-attest-diff '+(attempt.attestDiff?'checked':'')+'> <span>Confirmo que conté físicamente los '+selected.length+' productos seleccionados. Los demás conservan el saldo del turno anterior.</span></label>'+
      '<p class="bc7-muted bc7-receive-footnote">Al guardar, el sistema incluirá internamente todos los productos. Los no seleccionados conservarán su cantidad anterior sin que tengas que volver a escribirla.</p>'+
    '</div>';
  }
  function renderReceiveDiffPane(form){
    const pane=form.querySelector('[data-bc7-receive-pane="diff"]');
    if(!pane)return;
    const attempt=getReceiveAttempt({id:form.dataset.bc7ReceiveDelivery||''});
    const lines=arr(JSON.parse(form.dataset.bc7ReceiveLines||'[]'));
    pane.innerHTML=receiveDiffPaneHtml(lines,attempt);
  }
  function syncReceiveFormState(form){
    if(!form)return;
    const deliveryId=form.dataset.bc7ReceiveDelivery||'';
    const attempt=getReceiveAttempt({id:deliveryId});
    attempt.mode=form.querySelector('[data-bc7-receive-mode][aria-pressed="true"]')?.dataset.bc7ReceiveMode||attempt.mode||'fast';
    const note=form.querySelector('[data-bc7-receive-note]');
    if(note)attempt.note=note.value||'';
    const af=form.querySelector('[data-bc7-receive-attest-fast]'); if(af)attempt.attestFast=af.checked;
    const ad=form.querySelector('[data-bc7-receive-attest-diff]'); if(ad)attempt.attestDiff=ad.checked;
    const search=form.querySelector('[data-bc7-receive-search]');
    if(search)attempt.search=search.value||'';
    form.querySelectorAll('[data-bc7-receive-count]').forEach(input=>{
      const id=input.dataset.bc7ReceiveCount;
      attempt.values[id]=input.value;
      const diffBox=form.querySelector('[data-bc7-receive-diff="'+CSS.escape(id)+'"]');
      if(diffBox){
        const raw=String(input.value||'').trim();
        if(raw!=='' && /^\d+(?:\.\d{1,3})?$/.test(raw)){
          const d=Math.round((Number(raw)-Number(input.dataset.bc7ReceiveDeclared))*1000)/1000;
          diffBox.textContent='Diferencia: '+(d>0?'+':'')+qty(d);
        }else diffBox.textContent='';
      }
    });
    const q=String(attempt.search||'').toLowerCase().trim();
    form.querySelectorAll('[data-bc7-receive-picker-row]').forEach(row=>{
      const name=(row.getAttribute('data-bc7-receive-name')||'').toLowerCase();
      row.hidden=!!q&&!name.includes(q);
    });
    renderReceiveSummary(form);
  }
  function receiveFormHtml(delivery,detail){
    const lines=arr(delivery&&delivery.lineas);
    const attempt=getReceiveAttempt(delivery);
    const total=lines.length;
    const mode=attempt.mode||'fast';
    const recount=delivery.estado==='REQUIERE_RECUENTO'?'<p class="bc7-note">El dueño rechazó el intento anterior. Realiza otro conteo físico completo. El intento rechazado y su motivo permanecen en el historial.</p>':'';
    const modeTabs='<div class="bc7-actions bc7-receive-mode-tabs" role="tablist" aria-label="Modo de recepción">'+
      '<button type="button" class="bc7-btn '+(mode==='fast'?'primary':'')+'" data-bc7-receive-mode="fast" aria-pressed="'+(mode==='fast')+'">✓ Todo coincide</button>'+
      '<button type="button" class="bc7-btn '+(mode==='diff'?'primary':'')+'" data-bc7-receive-mode="diff" aria-pressed="'+(mode==='diff')+'">Registrar diferencias</button></div>';
    const fastPane='<section class="bc7-receive-fast-pane" data-bc7-receive-pane="fast" '+(mode!=='fast'?'hidden':'')+'>'+
      '<div class="bc7-receive-fast-state" data-bc7-receive-fast-state><span class="bc7-receive-fast-symbol">✓</span><div><b>Todo coincide</b><small>Cuenta todos los productos. Si no hay diferencias, confirma aquí y termina.</small></div></div>'+
      '<label class="bc7-check"><input type="checkbox" data-bc7-receive-attest-fast '+(attempt.attestFast?'checked':'')+'> <span>Confirmo que conté físicamente los '+total+' productos y que todos coinciden con lo declarado.</span></label>'+
      '</section>';
    const diffPane='<section class="bc7-receive-diff-pane" data-bc7-receive-pane="diff" '+(mode!=='diff'?'hidden':'')+'>'+receiveDiffPaneHtml(lines,attempt)+'</section>';
    const selectedCount=lines.filter(l=>!!attempt.marked[String(l.producto_id)]).length;
    const startSummary=mode==='fast'&&attempt.attestFast
      ?'✓ Coincidencia total confirmada · '+total+' productos · Sin diferencias'
      :mode==='diff'?total+' productos en la entrega · '+selectedCount+' diferencias seleccionadas'
      :'Conteo completo pendiente de confirmación · '+total+' productos';
    return '<div class="bc7-note"><b>Recepción física de inventario compartido</b><p class="bc7-muted">Confirma si todo coincide o registra únicamente las diferencias. No necesitas volver a introducir las cantidades que vienen iguales del turno anterior.</p>'+recount+'</div>'+
      '<form data-bc7-receive-form="'+esc(detail.sesion.id)+'" data-bc7-receive-delivery="'+esc(delivery.id)+'" data-bc7-receive-lines="'+esc(JSON.stringify(lines.map(l=>({producto_id:String(l.producto_id),cantidad_declarada:Number(l.cantidad_declarada),nombre:l.nombre||''}))))+'">'+
      modeTabs+fastPane+diffPane+
      '<div class="bc7-note bc7-receive-summary" data-bc7-receive-summary role="status" aria-live="polite">'+startSummary+'</div>'+
      '<label class="bc7-field">Observación de recepción (opcional)<input data-bc7-receive-note maxlength="1000" value="'+esc(attempt.note||'')+'" placeholder="Incidencias o diferencias observadas"></label>'+
      '<div class="bc7-actions"><button class="bc7-btn primary" type="submit" data-bc7-receive-submit '+(mode==='diff'&&attempt.step!=='values'?'hidden':'disabled')+'>Guardar recepción física</button></div>'+
      receiveInlineStatusHtml(attempt,delivery)+
      '</form>';
  }
  function updateReceivePreview(form){
    // Compatibility for existing input listener: sync and render summary.
    syncReceiveFormState(form);
  }

  function legacyInitialFormHtml(detail){
    const products=arr(detail.productos);
    const table=products.length?'<p class="bc7-table-scroll-hint">En móvil, desliza horizontalmente para ver todas las columnas.</p><div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Producto</th><th>Stock del sistema (referencia)</th><th>Conteo físico actual</th></tr></thead><tbody>'+products.map(p=>'<tr><td>'+esc(p.nombre)+'</td><td>'+esc(qty(p.stock_actual))+'</td><td><input type="number" min="0" step="0.001" inputmode="decimal" required data-bc7-legacy-count="'+esc(p.producto_id)+'" aria-label="Regularizar conteo físico de '+esc(p.nombre)+'" placeholder="Contar físicamente"></td></tr>').join('')+'</tbody></table></div>':'<div class="bc7-empty">Almacén sin productos activos con stock registrado.</div>';
    return '<div class="bc7-note"><b>Regularización legacy — excepción del dueño</b><p class="bc7-muted">La jornada ya está abierta y no tiene inventario inicial. Solo el dueño puede registrar ahora un conteo físico completo y explicar la excepción. No se copiará el stock del sistema ni se modificará el saldo global.</p></div>'+
      '<form data-bc7-legacy-initial-form="'+esc(detail.sesion.id)+'">'+table+
      '<label class="bc7-field">Motivo obligatorio de regularización<input data-bc7-legacy-reason required maxlength="1000" placeholder="Explica por qué falta el inventario inicial"></label>'+
      '<div class="bc7-actions"><button class="bc7-btn primary" type="submit">Guardar regularización auditada</button></div><p class="bc7-msg" data-bc7-legacy-msg></p></form>';
  }

  function sharedApprovalHtml(detail){
    const shared=detail.entrega_compartida||{};
    const delivery=[shared.entrada,shared.salida].find(x=>x&&x.estado==='PENDIENTE_REVISION');
    if(!detail.is_admin||!delivery)return '';
    const lines=arr(delivery.lineas);
    return '<div class="bc7-note"><b>Revisión del dueño · diferencia de recepción</b><p class="bc7-muted">No se ha creado el inventario inicial de destino. Al aprobar, las diferencias quedarán registradas en este expediente de recepción y la cantidad física aceptada se convertirá en el inventario inicial de destino. El inventario final cerrado del origen permanece intacto; cualquier corrección histórica del origen requiere una decisión separada del Dueño. Rechazar exige un nuevo conteo.</p>'+
      '<div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Producto</th><th>Declarado</th><th>Recibido</th><th>Diferencia</th></tr></thead><tbody>'+
      lines.map(l=>'<tr><td>'+esc(l.nombre||'Producto')+'</td><td>'+esc(qty(l.cantidad_declarada))+'</td><td>'+esc(l.cantidad_recibida==null?'—':qty(l.cantidad_recibida))+'</td><td class="bc7-diff '+(Number(l.diferencia)===0?'good':'bad')+'">'+(Number(l.diferencia)>0?'+':'')+esc(qty(l.diferencia||0))+'</td></tr>').join('')+
      '</tbody></table></div><label class="bc7-field">Motivo obligatorio de la decisión<input data-bc7-delivery-decision-note maxlength="1000" placeholder="Motivo de aprobación o rechazo"></label>'+
      '<div class="bc7-actions"><button class="bc7-btn primary" type="button" data-bc7-delivery-decision="APROBAR" data-bc7-delivery-id="'+esc(delivery.id)+'">Aprobar recepción</button><button class="bc7-btn danger" type="button" data-bc7-delivery-decision="RECHAZAR" data-bc7-delivery-id="'+esc(delivery.id)+'">Rechazar y exigir recuento</button></div>'+
      '<p class="bc7-msg" data-bc7-delivery-decision-msg></p></div>';
  }

  function countFormHtml(type,detail){
    const cut=detail.cortes&&detail.cortes[type];
    const session=detail.sesion;
    const shared=detail.entrega_compartida||{};
    const inbound=type==='INICIAL'?(shared.entrada||null):null;
    const outgoing=type==='FINAL'?(shared.salida||null):null;

    if(cut)return '<div class="bc7-note">El conteo '+(type==='INICIAL'?'inicial':'final')+' está confirmado e inmutable.</div>'+cutHtml(cut,arr(detail.productos),inbound||outgoing);
    if(type==='INICIAL'&&shared.sin_vincular){
      const d=shared.sin_vincular;
      if(detail.is_admin)return '<div class="bc7-note"><b>Entrega pendiente de vincular</b><p class="bc7-muted">Existe un inventario final del día anterior para este almacén. Vincula esta jornada ya programada como destino; no se creará otra sesión.</p><div class="bc7-actions"><button class="bc7-btn primary" type="button" data-bc7-link-delivery="'+esc(d.id)+'" data-bc7-link-session="'+esc(session.id)+'">Vincular esta jornada</button></div></div>';
      return '<div class="bc7-note"><b>Recepción bloqueada</b><p class="bc7-muted">Existe una entrega previa todavía no vinculada a esta jornada. El dueño debe vincular la sesión ya programada antes de registrar el conteo inicial.</p></div>';
    }
    if(type==='INICIAL'&&inbound){
      if(inbound.estado==='PENDIENTE_REVISION'){
        const attempt=getReceiveAttempt(inbound);
        if(!attempt.inline)attempt.inline={text:'Recepción enviada a revisión del Dueño. Jornada bloqueada hasta la decisión.',kind:'ok'};
        return '<div class="bc7-note"><b>Recepción pendiente de decisión del dueño</b><p class="bc7-muted">Se registró el conteo recibido. No existe un inventario inicial confirmado y no se puede abrir esta jornada hasta resolver la diferencia.</p></div>'+receiveInlineStatusHtml(attempt,inbound);
      }
      if(inbound.estado==='REQUIERE_RECUENTO'||inbound.estado==='PENDIENTE_RECEPCION')return receiveFormHtml(inbound,detail);
      if(inbound.estado==='ACEPTADA')return '<div class="bc7-empty">La entrega ya fue aceptada. Actualiza la jornada para recuperar el inventario inicial compartido.</div>';
    }
    if(type==='INICIAL'&&String(session.estado).toUpperCase()==='EN_CURSO'&&detail.is_admin)
      return legacyInitialFormHtml(detail);

    const sessionStatus=String(session.estado||'').toUpperCase();
    const sealed= sessionStatus==='CERRADA_OPERATIVAMENTE';
    const sealedResponsibleCapture=type==='FINAL'&&sealed&&detail.is_admin!==true&&detail.server_responsible_access===true;
    const sealedAdminCapture=type==='FINAL'&&sealed&&detail.is_admin===true;
    const sealedFinalCapture=sealedResponsibleCapture||sealedAdminCapture;
    const allowed=type==='INICIAL'?['PENDIENTE','PROGRAMADA'].includes(sessionStatus):(sessionStatus==='EN_CURSO'||sealedFinalCapture);
    if(!allowed)return '<div class="bc7-empty">El conteo '+(type==='INICIAL'?'inicial':'final')+' no se puede modificar en el estado actual ('+esc(humanStatus(session.estado))+').</div>';

    // detail.productos is the server-derived FINAL period set, including products created during this Jornada.
    // The immutable INICIAL cut remains unchanged; the backend validates the full FINAL set.
    const products=arr(detail.productos);
    if(sealedFinalCapture&&!products.length)
      return '<div class="bc7-empty">No se pudo recuperar el conjunto completo de productos del período. Actualiza la Jornada antes de contar; no se habilita un conteo parcial.</div>';

    const opening=type==='INICIAL'?detail.apertura_previa:null;
    const openingLines=new Map(arr(opening&&opening.lineas).map(x=>[String(x.producto_id),x]));
    const openingNote=type==='INICIAL'
      ?(opening?'<p class="bc7-note">Corte final anterior del Día '+esc(opening.numero_dia)+' ('+esc(fmtDate(opening.fecha))+'): se muestran las cantidades efectivas compartidas como referencia. Debes revisar y volver a contar físicamente cada producto antes de confirmar la recepción; una diferencia queda pendiente de decisión del dueño.</p>'
        :'<p class="bc7-note">No hay un inventario final confirmado del día inmediatamente anterior. Define el saldo inicial mediante conteo físico completo; no se copiará automáticamente el stock del sistema.</p>')
      :'';
    const empty='<div class="bc7-empty">Este almacén no tiene productos activos con fila de stock registrada. Si se trata realmente de un almacén vacío, puedes confirmar el conteo de cero productos.</div>';
    const table=products.length
      ?(type==='FINAL'
        ?'<div class="bc7-final-count-list" role="group" aria-label="Conteo físico final">'+products.map(p=>'<label class="bc7-final-count-row"><span class="bc7-final-count-product">'+esc(p.nombre)+'</span><input type="number" min="0" step="0.001" inputmode="decimal" required data-bc7-count="'+esc(p.producto_id)+'" aria-label="Cantidad final de '+esc(p.nombre)+'" placeholder="Final"></label>').join('')+'</div>'
        :'<p class="bc7-table-scroll-hint">En móvil cada producto aparece en una ficha legible; en escritorio se conserva la tabla completa.</p><div class="bc7-table-wrap"><table class="bc7-table bc7-count-table"><thead><tr><th>Producto</th><th>Unidad</th><th>Stock actual</th><th>Referencia anterior</th><th>Conteo físico actual</th></tr></thead><tbody>'+products.map(p=>{
          const prior=openingLines.get(String(p.producto_id));
          return '<tr><td data-label="Producto">'+esc(p.nombre)+'</td><td data-label="Unidad">'+esc(p.unidad||'ud')+'</td><td data-label="Stock actual">'+esc(qty(p.stock_actual))+'</td><td data-label="Referencia anterior">'+esc(prior?qty(prior.cantidad_contada):'—')+'</td><td data-label="Conteo físico actual"><input type="number" min="0" step="0.001" inputmode="decimal" required data-bc7-count="'+esc(p.producto_id)+'" aria-label="Conteo físico de '+esc(p.nombre)+'" value="'+(prior?esc(prior.cantidad_contada):'')+'" placeholder="Contar"></td></tr>';
        }).join('')+'</tbody></table></div>')
      :empty;

    const sealedCaptureNote=sealedResponsibleCapture
      ?'<div class="bc7-note"><b>Tu inventario final · corte del 20/11/2026 a las 23:00</b><p>Cuenta físicamente todos los productos de esta lista desde tu cuenta de responsable. Se guarda con tu usuario y representa el corte original; no reabre la operación ni modifica el stock global.</p></div>'
      :sealedAdminCapture
        ?'<div class="bc7-note"><b>Captura histórica ADMIN · sin reabrir la Jornada</b><p>Exporta la hoja «Inventario final» de la plantilla como CSV UTF-8 y súbela aquí. Debe incluir exactamente las familias del corte inicial y las cantidades físicas al 20/11/2026 23:00, hora de Cuba. No uses el stock actual ni incluyas las transferencias del 21/11.</p></div>'
        :'';
    const sealedCaptureFile=sealedAdminCapture
      ?'<label class="bc7-field">Archivo CSV del inventario final<input type="file" accept=".csv,text/csv" data-bc7-sealed-final-file required><small class="bc7-muted">Columnas requeridas: «Producto ID» y «Final físico al corte». El nombre y SHA-256 del archivo quedarán auditados.</small></label><input type="hidden" data-bc7-count-idempotency value=""><input type="hidden" data-bc7-count-source-sha value="">'
      :sealedResponsibleCapture?'<input type="hidden" data-bc7-count-idempotency value="">':'';
    const captureAttribute=sealedAdminCapture?'data-bc7-sealed-final-capture="true"':(sealedResponsibleCapture?'data-bc7-sealed-final-capture="responsible"':'');
    return openingNote+sealedCaptureNote+'<p class="bc7-muted">Cuenta físicamente cada producto del listado. La referencia del día anterior es solo una ayuda; el nuevo corte requiere confirmación física explícita. El stock del sistema solo sirve como comparación y no se copia como conteo físico.</p><form data-bc7-count-form="'+type+'" '+captureAttribute+'>'+table+sealedCaptureFile+'<label class="bc7-field">Observación (opcional)<input data-bc7-count-note maxlength="1000" placeholder="Incidencia o aclaración del conteo"></label><div class="bc7-actions"><button class="bc7-btn primary" type="submit">Guardar y confirmar '+(type==='INICIAL'?'inventario inicial':'inventario final')+'</button></div><p class="bc7-msg" data-bc7-count-msg></p></form>';
  }
  function renderMovementRows(rows,session){
    const day=Number(session&&session.numero_dia||0);
    const date=String(session&&session.fecha||'').slice(0,10);
    const heading='<h4>Día '+esc(day||'—')+' · '+esc(date||'fecha no disponible')+'</h4>';
    if(!rows.length)return heading+'<div class="bc7-empty">No hay movimientos vinculados de forma verificable a esta sesión y a su tramo horario. Las operaciones que no puedan asociarse con seguridad siguen en Movimientos → Historial general; no se asignan solo por compartir fecha.</div>';
    const labels={compra:'Compra',venta:'Venta',transferencia_salida:'Transferencia de salida',transferencia_entrada:'Transferencia de entrada',vale:'Vale de salida',merma:'Merma aprobada',merma_pendiente:'Merma pendiente',merma_rechazada:'Merma rechazada',baja:'Baja aprobada',baja_pendiente:'Baja pendiente',baja_rechazada:'Baja rechazada',gasto:'Gasto aprobado',gasto_pendiente:'Gasto pendiente',gasto_rechazado:'Gasto rechazado',reinversion:'Reinversión aprobada',reinversion_pendiente:'Reinversión pendiente',reinversion_rechazada:'Reinversión rechazada',entrega_diaria:'Efectivo diario aprobado',entrega_diaria_pendiente:'Efectivo diario pendiente',entrega_diaria_rechazada:'Efectivo diario rechazado',dinero_declarado_final:'Dinero final declarado',dinero_contado_final:'Dinero final contado por Dueño'};
    const financeTypes=/^(gasto|reinversion|entrega_diaria|dinero_)/;
    const value=r=>r.costo_unitario==null?'—':esc(money(r.costo_unitario))+' CUP'+(financeTypes.test(String(r.tipo||''))?'':'/u');
    return heading+'<div class="bc7-table-wrap"><table class="bc7-table bc7-movements-table"><thead><tr><th>Hora</th><th>Tipo</th><th>Producto / concepto</th><th>Cantidad</th><th>Valor</th><th>Usuario</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(String(r.fecha||'').replace('T',' ').slice(0,16))+'</td><td>'+esc(labels[r.tipo]||r.tipo||'—')+'</td><td>'+esc(r.producto||'—')+'</td><td>'+esc(r.cantidad==null?'—':qty(r.cantidad))+'</td><td>'+value(r)+'</td><td>'+esc(r.usuario||'—')+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function renderPendingInboundTransfers(rows,session,isAdmin){
    const groups=new Map();
    arr(rows).forEach(item=>{
      const id=String(item.transferencia_id||'');if(!id)return;
      if(!groups.has(id))groups.set(id,{id,fecha:item.fecha_registro,origen:item.almacen_origen||'Origen no identificado',destino:item.almacen_destino||'Destino no identificado',lineas:[]});
      groups.get(id).lineas.push(item);
    });
    if(!groups.size)return '<section class="bc7-pending-inbound"><h4>Entradas pendientes de atribución</h4><p class="bc7-empty">No hay entradas tardías completadas pendientes de vincular a esta jornada.</p></section>';
    const cards=Array.from(groups.values()).map(group=>{
      const units=group.lineas.reduce((sum,line)=>sum+Number(line.cantidad||0),0);
      const stamp=String(group.fecha||'').replace('T',' ').slice(0,16);
      const rowsHtml=group.lineas.map(line=>'<tr><td><input type="checkbox" data-bc7-transfer-line-select="'+esc(line.transferencia_linea_id||'')+'" aria-label="Seleccionar '+esc(line.producto||'producto')+'"></td><td>'+esc(line.producto||'Producto')+'</td><td>'+esc(qty(line.cantidad))+'</td></tr>').join('');
      return '<article class="bc7-card bc7-pending-inbound-card"><b>Entrada pendiente · '+group.lineas.length+' líneas</b>'+
        '<p class="bc7-muted">Fecha real de registro: '+esc(stamp)+'<br>'+esc(group.origen)+' → '+esc(group.destino)+'<br>Total: '+esc(qty(units))+' unidades</p>'+
        '<label class="bc7-transfer-select-all"><input type="checkbox" data-bc7-transfer-select-all>Seleccionar todas estas entradas</label>'+
        '<div class="bc7-table-wrap"><table class="bc7-table bc7-pending-inbound-table"><thead><tr><th>Incluir</th><th>Producto</th><th>Cantidad</th></tr></thead><tbody>'+rowsHtml+'</tbody></table></div>'+
        '<p class="bc7-muted">La transferencia ya existe. Atribuirla conserva el movimiento real y no vuelve a mover existencias.</p>'+
        (isAdmin?'<button type="button" class="bc7-btn primary" data-bc7-movement-link-transfer="'+esc(group.id)+'">Atribuir líneas seleccionadas</button>':'<small class="bc7-muted">Solo Administración puede atribuir una entrada histórica.</small>')+
        '</article>';
    }).join('');
    return '<section class="bc7-pending-inbound"><h4>Entradas pendientes de atribución · '+groups.size+'</h4>'+cards+'</section>';
  }
  async function loadMovements(detail){
    const host=$('bc7-movements');if(!host)return;
    host.innerHTML='<div class="bc7-empty">Consultando movimientos y entradas del período…</div>';
    const results=await Promise.allSettled([
      rpc('bc7_movimientos_sesion',{p_turno_sesion_id:detail.sesion.id}),
      rpc('bc7_transferencias_pendientes_vinculo_jornada',{p_turno_sesion_id:detail.sesion.id})
    ]);
    if(results[0].status==='rejected'){
      host.innerHTML='<div class="bc7-empty">'+esc(friendlyError(results[0].reason,'calendar'))+' No se han modificado datos.</div>';return;
    }
    const pending=results[1].status==='fulfilled'?arr(results[1].value):[];
    const pendingError=results[1].status==='rejected'
      ?'<p class="bc7-muted">No se pudo consultar la lista de entradas pendientes. Los movimientos ya atribuidos siguen disponibles.</p>':'';
    host.innerHTML=renderMovementRows(arr(results[0].value),detail.sesion)+pendingError+renderPendingInboundTransfers(pending,detail.sesion,detail.is_admin===true);
    host.onchange=e=>{
      const card=e.target&&e.target.closest?e.target.closest('.bc7-pending-inbound-card'):null;if(!card)return;
      const checks=Array.from(card.querySelectorAll('[data-bc7-transfer-line-select]'));
      const master=card.querySelector('[data-bc7-transfer-select-all]');
      if(e.target.matches&&e.target.matches('[data-bc7-transfer-select-all]')){checks.forEach(input=>{input.checked=e.target.checked;});return;}
      if(e.target.matches&&e.target.matches('[data-bc7-transfer-line-select]')&&master){const count=checks.filter(input=>input.checked).length;master.checked=checks.length>0&&count===checks.length;master.indeterminate=count>0&&count<checks.length;}
    };
    host.onclick=async e=>{
      const button=e.target&&e.target.closest?e.target.closest('[data-bc7-movement-link-transfer]'):null;if(!button)return;
      const transferId=button.dataset.bc7MovementLinkTransfer;
      const card=button.closest('article');
      const selectedLineIds=Array.from(card?.querySelectorAll('[data-bc7-transfer-line-select]:checked')||[])
        .map(input=>input.dataset.bc7TransferLineSelect).filter(Boolean);
      if(!selectedLineIds.length){alert('Selecciona las líneas concretas que pertenecen a esta jornada. No se modificó nada.');return;}
      const period=String(detail.sesion.fecha||'')+' a '+String(detail.sesion.fecha_fin||detail.sesion.fecha||'');
      const reason=window.prompt('Explica por qué estas '+selectedLineIds.length+' líneas corresponden al período '+period+'. La fecha real se conservará.','');
      if(!reason)return;
      if(reason.trim().length<15){alert('El motivo debe explicar la atribución (mínimo 15 caracteres). No se modificó nada.');return;}
      if(!window.confirm('Se atribuirán únicamente las '+selectedLineIds.length+' líneas seleccionadas. Las demás líneas de la transferencia no se incluirán. ¿Confirmas?'))return;
      button.disabled=true;
      try{
        await rpc('bc7_vincular_lineas_transferencia_jornada',{
          p_turno_sesion_id:detail.sesion.id,p_transferencia_id:transferId,
          p_transferencia_linea_ids:selectedLineIds,p_motivo:reason.trim()
        });
        await openWorkspace(detail.sesion.id);
        setStatus('Solo las líneas seleccionadas se atribuyeron a esta jornada.','ok');
      }catch(error){button.disabled=false;alert(friendlyError(error,'transfer')+' No se modificaron las líneas.');}
    };
  }
  function checklistHtml(detail,isAssigned,status){
    if(!['EN_CURSO','CERRADA_OPERATIVAMENTE'].includes(String(status||'').toUpperCase())||detail.sesion?.es_minorista!==true)return '';
    const checks=detail.checklist||{};
    const manual=[
      {key:'gastos',label:'Gastos',question:'Registra todos los gastos reales de este período.'},
      {key:'reinversiones',label:'Reinversiones',question:'Registra todas las reinversiones reales de este período.'},
      {key:'bajas',label:'Bajas',question:'Registra todas las bajas y mermas reales de este período.'}
    ];
    const rows=manual.map((item,index)=>{
      const done=checks[item.key]?.completado===true;
      const action=!isAssigned
        ?'<button type="button" class="bc7-btn" disabled>Acceso pendiente</button>'
        :done
          ?'<button type="button" class="bc7-btn" data-bc7-checklist-toggle="'+item.key+'" data-completed="true">Reabrir sección</button>'
          :'<button type="button" class="bc7-btn" data-bc7-checklist-open="'+item.key+'">Completar sección</button>';
      const description=done
        ?'Enviado y bloqueado · no admite más registros. Administración revisa las aprobaciones por separado.'
        :(String(status||'').toUpperCase()==='CERRADA_OPERATIVAMENTE'?'Completa el registro tardío desde tu cuenta; luego el bloque quedará cerrado.':item.question);
      return '<div class="bc7-checklist-row '+(done?'is-done':'is-pending')+'">'+
        '<span class="bc7-checklist-mark">'+(done?'✓':String(index+2))+'</span>'+
        '<div class="bc7-checklist-copy"><b>'+esc(item.label)+'</b><small>'+description+'</small></div>'+
        action+
        '<span class="bc7-checklist-state">'+(done?'✓ Enviado':'Pendiente')+'</span>'+
      '</div>';
    }).join('');

    const finalDone=checks.inventario_final?.completado===true;
    const sealed=String(status||'').toUpperCase()==='CERRADA_OPERATIVAMENTE';
    const sealedWorkerCapture=sealed&&detail.is_admin!==true&&detail.server_responsible_access===true;
    const sealedAdminCapture=sealed&&detail.is_admin===true;
    const finalAllowed=!sealed||sealedWorkerCapture||sealedAdminCapture;
    const finalDescription=finalDone
      ?'Conteo físico final registrado y auditado.'
      :(sealedWorkerCapture?'Regístralo tú desde esta PWA. El conteo corresponde al corte operativo original.':(sealedAdminCapture?'ADMIN puede registrar el conteo histórico si la responsable no puede hacerlo.':'Cuenta físicamente todos los productos antes de terminar.'));
    const finalAction=!finalAllowed||(!isAssigned&&!detail.is_admin)
      ?'<button type="button" class="bc7-btn" disabled>Acceso pendiente</button>'
      :finalDone
        ?'<button type="button" class="bc7-btn" data-bc7-checklist-inventory>Ver conteo</button>'
        :'<button type="button" class="bc7-btn primary" data-bc7-checklist-open="inventario_final">'+(sealedAdminCapture?'Cargar conteo ADMIN':'Registrar inventario final')+'</button>';
    const finalRow='<div class="bc7-checklist-row '+(finalDone?'is-done':'is-pending')+'" data-bc7-checklist-step="5">'+
      '<span class="bc7-checklist-mark">'+(finalDone?'✓':'5')+'</span>'+
      '<div class="bc7-checklist-copy"><b>Inventario final</b><small>'+finalDescription+'</small></div>'+
      finalAction+
      '<span class="bc7-checklist-state">'+(finalDone?'✓ Enviado':'Pendiente')+'</span>'+
    '</div>';

    const cash=checks.declaracion_dinero||{};
    const cashDone=cash.completado===true;
    const cashRegistered=cash.declaracion_registrada===true;
    const cashDaily=Number(cash.entregas_diarias_registradas||0);
    const cashExpected=Number(cash.entregas_diarias_esperadas||0);
    const cashDescription=cashDone
      ?cashDaily+'/'+cashExpected+' entregas diarias registradas para todas las fechas del período.'
      :'Registra una entrega por cada fecha del período ('+cashDaily+'/'+cashExpected+'). Escribe 0 CUP cuando no hubo entrega.';
    const ownerCashReview=detail.is_admin===true&&cashDone&&checks.lista_para_conteo===true;
    const cashAction=ownerCashReview
      ?'<button type="button" class="bc7-btn primary" data-bc7-checklist-open="declaracion_dinero">Revisar y contar efectivo</button>'
      :!isAssigned
        ?'<button type="button" class="bc7-btn" disabled>Acceso pendiente</button>'
        :cashDone
          ?'<span class="bc7-pill ok">Enviado</span>'
          :'<button type="button" class="bc7-btn primary" data-bc7-checklist-open="declaracion_dinero">Completar paso 1</button>';
    const cashRow='<div class="bc7-checklist-row '+(cashDone?'is-done':'is-pending')+'" data-bc7-checklist-step="1">'+
      '<span class="bc7-checklist-mark">'+(cashDone?'✓':'1')+'</span>'+
      '<div class="bc7-checklist-copy"><b>Entregas diarias de efectivo</b><small>'+cashDescription+'</small></div>'+
      cashAction+
      '<span class="bc7-checklist-state">'+(cashDone?'✓ Enviado':'Pendiente')+'</span>'+
    '</div>';

    const count=manual.filter(x=>checks[x.key]?.completado===true).length+(finalDone?1:0)+(cashDone?1:0);
    return '<section class="bc7-checklist" aria-label="Checklist de cinco pasos de la jornada">'+
      '<div class="bc7-checklist-head"><div><h4>Checklist de la jornada · 5 pasos</h4><p>Registra y envía cada bloque desde esta cuenta. Al enviarlo, queda bloqueado para evitar altas posteriores. El Dueño aprueba los registros por separado.</p></div>'+
      '<span class="bc7-checklist-count">'+count+'/5</span></div>'+
      cashRow+rows+finalRow+
      '<p class="bc7-muted">Las aprobaciones del Dueño no impiden que declares terminada tu captura. Si necesitas añadir algo después, reabre el bloque de forma explícita.</p>'+
    '</section>';
  }
  function calculationPhaseHtml(detail){
    // La revisión integral del turno es la fuente única de los cálculos financieros.
    // No duplicar este resumen en la pantalla de captura de la Jornada.
    return '';
  }
  function previewValue(value){return value==null?'—':esc(String(value));}
  function previewTable(headers,rows,primaryCount=3){
    if(!rows.length)return '<div class="bc7-empty">Todavía no hay registros para mostrar.</div>';
    return '<div class="bc7-preview-list">'+rows.map(row=>{
      const primary=row.slice(0,primaryCount),extra=row.slice(primaryCount);
      const primaryHtml=primary.map((value,index)=>'<div class="bc7-preview-field"><small>'+esc(headers[index])+'</small><b>'+previewValue(value)+'</b></div>').join('');
      const extraHtml=extra.length?'<details class="bc7-preview-more"><summary>Ver más</summary><dl>'+extra.map((value,index)=>'<div><dt>'+esc(headers[primaryCount+index])+'</dt><dd>'+previewValue(value)+'</dd></div>').join('')+'</dl></details>':'';
      return '<article class="bc7-preview-record"><div class="bc7-preview-primary">'+primaryHtml+'</div>'+extraHtml+'</article>';
    }).join('')+'</div>';
  }
  function previewMovementType(value){
    const labels={compra:'Compra',venta:'Venta',transferencia_salida:'Transferencia de salida',transferencia_entrada:'Transferencia de entrada',vale:'Vale de salida',baja:'Baja aprobada',baja_pendiente:'Baja pendiente',baja_rechazada:'Baja rechazada',merma:'Baja aprobada',merma_pendiente:'Baja pendiente',merma_rechazada:'Baja rechazada',gasto:'Gasto aprobado',gasto_pendiente:'Gasto pendiente',gasto_rechazado:'Gasto rechazado',reinversion:'Reinversión aprobada',reinversion_pendiente:'Reinversión pendiente',reinversion_rechazada:'Reinversión rechazada',entrega_diaria:'Efectivo diario aprobado',entrega_diaria_pendiente:'Efectivo diario pendiente',entrega_diaria_rechazada:'Efectivo diario rechazado',dinero_declarado_final:'Declaración final de efectivo',dinero_contado_final:'Conteo final de efectivo'};
    const key=String(value||'').toLowerCase();
    return labels[key]||value||'—';
  }
  async function openJornadaPreview(button){
    let detail=state.detail;
    if(!detail?.sesion?.id)return;
    if(button)button.disabled=true;
    const root=document.createElement('div');
    root.className='bc7-checklist-modal';
    root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
    root.innerHTML='<div class="bc7-checklist-modal-panel" style="max-width:1100px"><header class="bc7-checklist-modal-head"><div><p>JORNADA · PREVISUALIZACIÓN SIN CAMBIOS AUTOMÁTICOS</p><h3>Previsualización del cuadro</h3><small>La consulta no modifica registros. Solo la atribución histórica requiere una acción ADMIN explícita y confirmada.</small></div><button type="button" class="bc7-btn" data-bc7-preview-close>Cerrar ✕</button></header><div class="bc7-checklist-modal-body"><div class="bc7-empty">Reuniendo inventario, movimientos, bajas, finanzas y efectivo…</div></div></div>';
    (document.getElementById('tab-jornada')||document.body).appendChild(root);
    const close=()=>root.remove();
    root.querySelectorAll('[data-bc7-preview-close]').forEach(b=>b.addEventListener('click',close));
    root.addEventListener('click',async e=>{
      if(e.target===root){close();return;}
      const linkButton=e.target&&e.target.closest?e.target.closest('[data-bc7-link-transfer]'):null;
      if(!linkButton)return;
      e.preventDefault();
      const transferId=linkButton.dataset.bc7LinkTransfer;
      const card=linkButton.closest('article');
      const selectedLineIds=Array.from(card?.querySelectorAll('[data-bc7-transfer-line-select]:checked')||[])
        .map(input=>input.dataset.bc7TransferLineSelect).filter(Boolean);
      if(!selectedLineIds.length){alert('Selecciona las líneas concretas que pertenecen a esta jornada. No se modificó nada.');return;}
      const period=String(detail.sesion.fecha||'')+' a '+String(detail.sesion.fecha_fin||detail.sesion.fecha||'');
      const reason=window.prompt('Explica por qué estas '+selectedLineIds.length+' líneas corresponden al período '+period+'. La fecha real de registro se conservará.','');
      if(!reason||reason.trim().length<15)return;
      if(!confirm('Se atribuirán únicamente las '+selectedLineIds.length+' líneas seleccionadas. Las demás líneas de esta transferencia no se incluirán. ¿Confirmas?'))return;
      linkButton.disabled=true;
      try{
        await rpc('bc7_vincular_lineas_transferencia_jornada',{
          p_turno_sesion_id:detail.sesion.id,p_transferencia_id:transferId,
          p_transferencia_linea_ids:selectedLineIds,p_motivo:reason.trim()
        });
        close();
        await openWorkspace(detail.sesion.id);
        setStatus('Solo las líneas seleccionadas se atribuyeron a esta jornada.','ok');
        await openJornadaPreview(null);
      }catch(error){
        linkButton.disabled=false;
        alert(friendlyError(error,'transfer')+' No se modificaron las líneas.');
      }
    });
    try{
      // Re-read the session before building the preview. The owner may have
      // approved the final day's cash declaration after this workspace loaded.
      const refreshedDetail=await rpc('bc7_obtener_inventario_jornada',{p_turno_sesion_id:detail.sesion.id});
      if(!refreshedDetail?.sesion?.id||String(refreshedDetail.sesion.id)!==String(detail.sesion.id)){
        throw new Error('No se pudo actualizar la información de la jornada antes de previsualizar.');
      }
      Object.assign(detail,refreshedDetail);
      detail.is_admin=!!state.admin;
      detail.liquidacion=null;
      state.detail=detail;
      const [settlement,movements,finance,cash,unlinkedTransfers,cashCount]=await Promise.all([
        rpc('bc7_liquidacion_inventario_jornada',{p_turno_sesion_id:detail.sesion.id}),
        rpc('bc7_movimientos_sesion',{p_turno_sesion_id:detail.sesion.id}),
        rpc('bc7_finanzas_jornada',{p_turno_sesion_id:detail.sesion.id}),
        rpc('bc7_entregas_diarias_jornada',{p_turno_sesion_id:detail.sesion.id}),
        rpc('bc7_transferencias_pendientes_vinculo_jornada',{p_turno_sesion_id:detail.sesion.id}),
        rpc('bc7_estado_conteo_efectivo_jornada',{p_turno_sesion_id:detail.sesion.id})
      ]);
      detail.liquidacion=settlement||detail.liquidacion;
      const lines=arr(settlement?.lineas).map(x=>[
        x.nombre,
        x.inventario_final==null?'—':qty(x.inventario_final),
        qty(Number(x.bajas_aprobadas||0)+Number(x.mermas_aprobadas||0)),
        x.unidades_vendidas==null?'—':qty(x.unidades_vendidas),
        x.inventario_inicial==null?'—':qty(x.inventario_inicial),
        qty(Number(x.transferencias_entrada||0)+Number(x.compras||0)+Number(x.reinversiones_entrada||0)),
        qty(Number(x.transferencias_salida||0)+Number(x.vales_salida||0)),
        x.precio_unitario==null?'Sin precio':money(x.precio_unitario),
        x.importe_estimado==null?'Pendiente':money(x.importe_estimado)+' CUP'
      ]);
      const movementRows=arr(movements).map(x=>[
        fmtDateTimeHavana(x.fecha),previewMovementType(x.tipo),x.producto,qty(x.cantidad),x.almacen,x.usuario
      ]);
      const bajaRows=[...arr(finance?.bajas),...arr(finance?.mermas)].map(x=>[
        x.producto,qty(x.cantidad),humanStatus(x.estado),x.motivo,x.creado_nombre,x.revisado_nombre?'ADMIN':'Pendiente',fmtDateTimeHavana(x.creado_en)
      ]);
      const expenseRows=arr(finance?.gastos).map(x=>[x.concepto||x.descripcion,x.monto==null?'—':money(x.monto)+' CUP',humanStatus(x.estado),x.creado_nombre||x.usuario_nombre]);
      const reinvestmentRows=arr(finance?.reinversiones).map(x=>[arr(x.lineas).map(line=>line.producto+' × '+qty(line.cantidad_base)).join(', ')||'Sin detalle',money(x.total??x.monto)+' CUP',humanStatus(x.estado),x.proveedor||'']);
      const cashRows=arr(cash?.entregas).map(x=>[
        fmtDateHuman(x.fecha),money(x.monto_declarado)+' CUP',humanStatus(x.estado),
        x.monto_aprobado==null?'Pendiente':money(x.monto_aprobado)+' CUP',
        'Entrega diaria',x.observacion||'—'
      ]);
      const finalDeclaration=detail.sesion.es_minorista===true?null:detail.declaracion_dinero;
      if(finalDeclaration){
        const finalState=String(finalDeclaration.estado_aprobacion||'').toUpperCase();
        cashRows.push([
          fmtDateHuman(detail.sesion.fecha_fin||detail.sesion.fecha),
          money(finalDeclaration.monto)+' CUP',
          humanStatus(finalState),
          finalState==='DECLARACION_APROBADA'?money(finalDeclaration.monto)+' CUP':'Pendiente',
          'Declaración final',
          finalDeclaration.monto_contado==null?'Conteo físico pendiente':'Conteo físico: '+money(finalDeclaration.monto_contado)+' CUP'
        ]);
      }
      const pendingTransferGroups=[];
      for(const item of arr(unlinkedTransfers)){
        let group=pendingTransferGroups.find(x=>String(x.id)===String(item.transferencia_id));
        if(!group){
          group={id:item.transferencia_id,fecha:item.fecha_registro,origen:item.almacen_origen,destino:item.almacen_destino,total:item.lineas_total,lines:[]};
          pendingTransferGroups.push(group);
        }
        group.lines.push({id:item.transferencia_linea_id,producto:item.producto,cantidad:item.cantidad});
      }
      const periodLabel=fmtDate(detail.sesion.fecha)+' – '+fmtDate(detail.sesion.fecha_fin||detail.sesion.fecha);
      const pendingTransferHtml=pendingTransferGroups.length?pendingTransferGroups.map(group=>
        '<article class="bc7-card"><h4>Transferencia pendiente · '+group.lines.length+' líneas disponibles</h4>'+
        '<p><b>Fecha real de registro:</b> '+esc(fmtDateTimeHavana(group.fecha))+
        '<br><b>Origen → destino:</b> '+esc(group.origen)+' → '+esc(group.destino)+
        '<br><b>Período operativo propuesto:</b> '+esc(periodLabel)+'</p>'+
        '<div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Incluir</th><th>Producto</th><th>Cantidad</th></tr></thead><tbody>'+
        group.lines.map(line=>'<tr><td><input type="checkbox" data-bc7-transfer-line-select="'+esc(line.id||'')+'" aria-label="Seleccionar '+esc(line.producto||'producto')+'"></td><td>'+esc(line.producto||'Producto')+'</td><td>'+esc(qty(line.cantidad))+'</td></tr>').join('')+
        '</tbody></table></div>'+
        '<p class="bc7-note">La transferencia agrupada no se incluye automáticamente. Selecciona solo las líneas que pertenecen a este período; las demás quedan fuera.</p>'+
        (state.admin?'<button type="button" class="bc7-btn primary" data-bc7-link-transfer="'+esc(group.id)+'">Atribuir líneas seleccionadas</button>':'<span class="bc7-muted">Solo ADMIN puede atribuir líneas históricas.</span>')+
        '</article>'
      ).join(''):'<div class="bc7-empty">No hay transferencias completadas fuera del período pendientes de atribución.</div>';
      const declaration=detail.declaracion_dinero;
      const session=detail.sesion;
      const complete=String(session.estado||'').toUpperCase()==='COMPLETADA';
      const status=complete?'Jornada entregada':'Vista provisional · jornada en curso';
      const summary=[
        ['Estado',humanStatus(session.estado)],
        ['Responsable',userName(session.responsable_id)],
        ['Período',fmtDateHuman(session.fecha)+(session.fecha_fin&&session.fecha_fin!==session.fecha?' – '+fmtDateHuman(session.fecha_fin):'')],
        ['Ventas comprobadas',settlement?.ventas_estimadas==null?'Pendiente':money(settlement.ventas_estimadas)+' CUP'],
        ['Salario calculado',settlement?.salario_calculado==null?'Pendiente':money(settlement.salario_calculado)+' CUP'],
        ['Gastos aprobados',settlement?.gastos_aprobados==null?'Pendiente':money(settlement.gastos_aprobados)+' CUP'],
        ['Reinversiones aprobadas',settlement?.reinversiones_aprobadas==null?'Pendiente':money(settlement.reinversiones_aprobadas)+' CUP'],
        ['Dinero recogido',settlement?.dinero_recogido_total==null?'Pendiente':money(settlement.dinero_recogido_total)+' CUP'],
        ['Efectivo esperado',(settlement?.efectivo_esperado_despues_de_gastos_reinversiones??settlement?.efectivo_esperado_despues_de_gastos_reinversiones_salario)==null?'Pendiente':money(settlement.efectivo_esperado_despues_de_gastos_reinversiones??settlement.efectivo_esperado_despues_de_gastos_reinversiones_salario)+' CUP'],
        ['Diferencia de caja',settlement?.diferencia==null?'Pendiente':money(settlement.diferencia)+' CUP'],
      ];
      if(session.es_minorista===true){
        summary.push(
          ['Entregas diarias',Number(cashCount?.entregas_diarias_registradas||0)+'/'+Number(cashCount?.entregas_diarias_esperadas||0)+' fechas'],
          ['Efectivo diario aprobado',money(cashCount?.total_diario_aprobado||0)+' CUP'],
          ['Entregas aprobadas',Number(cashCount?.entregas_diarias_aprobadas||0)+'/'+Number(cashCount?.entregas_diarias_esperadas||0)+' fechas']
        );
      }else{
        summary.push(
          ['Efectivo declarado',declaration?.monto==null?'Pendiente':money(declaration.monto)+' CUP'],
          ['Conteo físico',declaration?.monto_contado==null?'Pendiente':money(declaration.monto_contado)+' CUP']
        );
      }
      const summaryHtml='<div class="bc7-workspace-overview">'+summary.map(([k,v])=>'<div class="bc7-overview-item"><small>'+esc(k)+'</small><b>'+esc(v)+'</b></div>').join('')+'</div>';
      const missing=[];
      if(!detail.cortes?.INICIAL)missing.push('Inventario inicial sin confirmar');
      if(!detail.cortes?.FINAL)missing.push('Inventario final sin confirmar');
      if(session.es_minorista===true){
        const dailyRegistered=Number(cashCount?.entregas_diarias_registradas||0);
        const dailyExpected=Number(cashCount?.entregas_diarias_esperadas||0);
        if(dailyExpected>0&&dailyRegistered!==dailyExpected)missing.push('Entregas diarias de efectivo incompletas ('+dailyRegistered+'/'+dailyExpected+').');
      }else if(!declaration)missing.push('Declaración de efectivo pendiente');
      if(settlement?.calculable!==true)missing.push('Liquidación todavía no calculable o con datos pendientes');
      const body=root.querySelector('.bc7-checklist-modal-body');
      body.innerHTML='<style>'+
        '.bc7-preview-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:8px}'+
        '.bc7-preview-record{min-width:0;padding:10px;border:1px solid var(--gold-dim);border-radius:9px;background:var(--stone-2,var(--stone))}'+
        '.bc7-preview-primary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}'+
        '.bc7-preview-field{min-width:0;overflow-wrap:anywhere}'+
        '.bc7-preview-field:first-child{grid-column:1/-1}'+
        '.bc7-preview-field small{display:block;color:var(--mist);font-size:10px;line-height:1.2}'+
        '.bc7-preview-field b{display:block;margin-top:3px;color:var(--text);font-size:12px;font-weight:650;overflow-wrap:anywhere;white-space:normal}'+
        '.bc7-preview-more{margin-top:8px;border-top:1px solid var(--gold-dim);padding-top:6px}'+
        '.bc7-preview-more summary{cursor:pointer;color:var(--gold);font-size:11px;font-weight:650;list-style:none}'+
        '.bc7-preview-more summary::-webkit-details-marker{display:none}'+
        '.bc7-preview-more dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0 0}'+
        '.bc7-preview-more dl>div{min-width:0;overflow-wrap:anywhere}'+
        '.bc7-preview-more dt{color:var(--mist);font-size:10px}'+
        '.bc7-preview-more dd{margin:2px 0 0;color:var(--text);font-size:11px;overflow-wrap:anywhere;white-space:normal}'+
        '@media(max-width:380px){.bc7-preview-more dl{grid-template-columns:1fr}}'+
        '</style>'+
        '<div class="bc7-note"><b>'+esc(status)+'</b><p>Los datos pendientes se muestran como pendientes; no se sustituyen por cero ni se consideran aprobados.</p></div>'+
        summaryHtml+
        (missing.length?'<section class="bc7-card"><h4>Pendientes de verificación</h4><ul>'+missing.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></section>':'')+
        '<section class="bc7-card"><h4>Inventario y ventas por diferencia</h4>'+previewTable(['Producto','Final','Bajas','Vendidas','Inicial','Entradas','Salidas','Precio','Importe'],lines,4)+'</section>'+
        '<section class="bc7-card"><h4>Movimientos del período</h4>'+previewTable(['Fecha de registro','Tipo','Producto','Cantidad','Almacén','Usuario'],movementRows,6)+'</section>'+
        '<section class="bc7-card"><h4>Transferencias completadas fuera del período · pendientes de atribución</h4><p class="bc7-muted">Estas entradas no están incluidas en el inventario calculado hasta que el Dueño las vincule expresamente a esta jornada.</p>'+pendingTransferHtml+'</section>'+
        '<section class="bc7-card"><h4>Bajas registradas</h4>'+previewTable(['Producto','Cantidad','Estado','Motivo','Registrada por','Revisada por','Fecha de registro'],bajaRows,3)+'</section>'+
        '<section class="bc7-card"><h4>Gastos</h4>'+previewTable(['Concepto','Importe','Estado','Responsable'],expenseRows,3)+'</section>'+
        '<section class="bc7-card"><h4>Reinversiones</h4>'+previewTable(['Producto','Importe','Estado','Proveedor'],reinvestmentRows,3)+'</section>'+
        '<section class="bc7-card"><h4>Dinero recogido por día</h4>'+previewTable(['Fecha','Declarado','Estado','Aprobado','Tipo','Detalle'],cashRows,4)+'</section>'+
        '<p class="bc7-muted">'+(session.es_minorista===true?'Las entregas diarias son la única declaración de efectivo de la responsable. El Dueño realiza un conteo físico independiente; ese conteo no se suma dos veces. ':'La declaración de efectivo y su conteo se muestran por separado.')+'Esta vista es de solo lectura; las transferencias históricas requieren un vínculo explícito con la jornada.</p>';
    }catch(error){
      root.querySelector('.bc7-checklist-modal-body').innerHTML='<div class="bc7-empty">'+esc(friendlyError(error,'calendar'))+' No se modificó ningún dato.</div>';
    }finally{if(button)button.disabled=false;}
  }
  function renderWorkspace(detail){
    state.detail=detail;
    const s=detail.sesion,cuts=detail.cortes||{},initial=!!cuts.INICIAL,final=!!cuts.FINAL;
    const status=String(s.estado||'').toUpperCase();
    const continuityAlerts=arr(detail.alertas_continuidad).map(item=>item&&item.alerta?item.alerta:item).filter(item=>item&&Array.isArray(item.diferencias)&&item.diferencias.length);
    const continuityNotice=continuityAlerts.map(alert=>{
      const differences=arr(alert.diferencias).map(line=>'<tr><td>'+esc(line.producto||'Producto')+'</td><td>'+esc(qty(line.cantidad_anterior))+'</td><td>'+esc(qty(line.cantidad_recibida))+'</td><td>'+esc(qty(line.diferencia))+'</td></tr>').join('');
      const detailTable='<div class="bc7-table-wrap"><table class="bc7-table"><thead><tr><th>Producto</th><th>Anterior</th><th>Recibido</th><th>Diferencia</th></tr></thead><tbody>'+differences+'</tbody></table></div>';
      const statusText=alert.movimientos_intermedios_detectados
        ?'Hay movimientos de inventario entre ambos cortes. La diferencia queda informada y el corte FINAL anterior se conserva para evitar atribuir movimientos a una persona incorrectamente.'
        :('El inventario FINAL anterior recibió '+esc(alert.correcciones_aplicadas||0)+' correcciones auditadas a partir del conteo físico recibido. El corte original se conserva.');
      return '<section class="bc7-note"><b>Discrepancia de inventario entre Jornadas</b><p>'+esc(alert.responsable_anterior_nombre||'Responsable anterior')+' → '+esc(alert.responsable_sucesora_nombre||'Responsable sucesora')+'</p><p>'+statusText+'</p>'+detailTable+'</section>';
    }).join('');
    const currentUserId=String(currentUser()?.id||'');
    const activeSessionId=String(state.currentSession?.turno_sesion_id||'');
    const localAssignment=currentUserId===String(s.responsable_id||'')||activeSessionId===String(s.id||'');
    const isAssigned=s.es_minorista===true?(!!state.admin||detail.server_responsible_access===true):localAssignment;
    const tramo=detail.tramo_activo;
    let actionArea='';
    if((status==='PENDIENTE'||status==='PROGRAMADA')&&initial&&s.sucesora_retroactiva===true){
      actionArea='<div class="bc7-note"><b>Recepción física aceptada.</b><p>Esta jornada sucesora se habilita automáticamente al llegar su hora programada. No requiere aprobación ni activación manual del Dueño.</p></div>';
    }else if((status==='PENDIENTE'||status==='PROGRAMADA')&&initial){
      actionArea='<div class="bc7-note"><b>Lista para comenzar.</b> El servidor valida fecha, responsable y secuencia.<form><label class="bc7-field">Motivo de excepción<input id="bc7-start-reason" maxlength="1000" placeholder="Solo si abres fuera del horario"></label><div class="bc7-actions"><button class="bc7-btn primary" type="button" data-bc7-start="'+esc(s.id)+'" '+(!isAssigned?'disabled':'')+'>Comenzar jornada</button></div><p class="bc7-msg" id="bc7-start-msg"></p></form></div>';
    }else if(status==='EN_CURSO'&&s.es_minorista===true){
      actionArea='<div class="bc7-note"><b>Completar jornada y enviarla a Administración.</b><p>Completa los cinco pasos desde el checklist. Después entrega la jornada: el Dueño podrá contar el efectivo y resolver las pendientes; el Turno maestro seguirá abierto para la revisión y aprobación final.</p><form data-bc7-close-form="'+esc(s.id)+'" data-bc7-cash-mode="daily">'+
        '<label class="bc7-field">Motivo de cierre anticipado o tiempo extra (opcional)<input id="bc7-close-reason" maxlength="1000" placeholder="Solo si cerraste antes o trabajaste tiempo extra"><small class="bc7-muted">Entregar los datos después de las 23:00 no requiere motivo: la jornada termina a la hora programada y el registro queda fechado por separado.</small></label>'+
        '<div class="bc7-actions"><button type="submit" class="bc7-btn danger" '+(!final||!tramo||!isAssigned||detail.checklist?.lista_para_conteo!==true?'disabled':'')+'>Cerrar jornada y enviar a Administración</button></div><p class="bc7-msg" data-bc7-close-msg></p>'+(final?'':'<p class="bc7-muted">Para finalizar, primero confirma el inventario final.</p>')+'</form></div>';
    }else if(status==='EN_CURSO'){
      const saved=detail.declaracion_dinero&&tramo&&String(detail.declaracion_dinero.turno_tramo_id)===String(tramo.id);
      actionArea='<div class="bc7-note"><b>Dinero entregado al Dueño.</b><p>Guarda el importe declarado. El Dueño lo contará cuando estén completos los cinco pasos; esta entrega de efectivo no cierra el Turno.</p><form data-bc7-close-form="'+esc(s.id)+'"><div class="bc7-grid"><label class="bc7-field">Dinero entregado (CUP)<input id="bc7-cash" type="number" min="0" step="0.01" required placeholder="0.00" inputmode="decimal" value="'+(saved?esc(detail.declaracion_dinero.monto):'')+'" '+(saved?'readonly':'')+'></label><label class="bc7-field">Motivo de cierre fuera del horario<input id="bc7-close-reason" maxlength="1000" placeholder="Explica por qué se cierra fuera del horario previsto"><small class="bc7-muted">Obligatorio solo si cierras en otra fecha u hora distinta de la programada. Si cierras a tiempo, déjalo vacío.</small></label></div><div class="bc7-actions">'+(saved?'<span class="bc7-pill ok">Dinero guardado</span>':'<button type="button" class="bc7-btn" data-bc7-save-cash '+(!tramo||!isAssigned?'disabled':'')+'>Guardar dinero entregado</button>')+'<button type="submit" class="bc7-btn danger" '+(!final||!tramo||!isAssigned?'disabled':'')+'>'+(saved?'Finalizar jornada':'Guardar entrega y finalizar')+'</button></div><p class="bc7-msg" data-bc7-close-msg></p>'+(final?'':'<p class="bc7-muted">El cierre se habilitará al confirmar el inventario final. Puedes guardar el importe ahora.</p>')+'</form></div>';
    }else if(status==='COMPLETADA'&&s.es_minorista===true){
      actionArea='<div class="bc7-note"><b>Jornada completada.</b><p>El registro de efectivo de cada día permanece disponible como historial.</p>'+cashDaysManagerShellHtml(detail,false,status)+'</div>';
    }else if(status==='COMPLETADA'&&s.es_minorista===true){
      actionArea='<div class="bc7-note"><b>Jornada completada.</b><p>El registro de efectivo de cada día permanece disponible como historial.</p>'+cashDaysManagerShellHtml(detail,false,status)+'</div>';
    }else if(status==='COMPLETADA'){
      actionArea='<div class="bc7-note">Jornada completada. Conteos y movimientos conservados como evidencia.</div>';
    }else if(status==='CERRADA_OPERATIVAMENTE'&&s.es_minorista===true){
      actionArea='<div class="bc7-note"><b>Sellado operativo · pendiente de conciliación.</b><p>La operación terminó a las '+esc(String(s.corte_operativo_at||s.cierre_operativo_at||'').slice(11,16)||'hora registrada')+'. Completa los cinco pasos desde el checklist. Las aprobaciones y el conteo físico del Dueño se realizan después, sin limitar tu captura.</p></div>';
    }else{
      actionArea='<div class="bc7-note">Estado: '+esc(humanStatus(status))+'. Las acciones disponibles dependen de esta jornada.</div>';
    }
    if(status==='EN_CURSO'&&s.es_minorista===true){
      actionArea+='<div class="bc7-note bc7-operational-seal"><b>Sellado operativo rápido · sin cuadre</b><p>Usa esta acción si la responsable terminó su jornada y no puede completar ahora los formularios. El servidor cierra el tramo a la hora programada (o registra la hora real y el motivo si es anticipado). No confirma inventario ni declara efectivo.</p><label class="bc7-field">Motivo obligatorio solo si cierras antes de la hora programada<input id="bc7-operational-close-reason" maxlength="1000" placeholder="Ej.: cierre anticipado por cansancio o incidencia"></label><div class="bc7-actions"><button class="bc7-btn danger" type="button" data-bc7-operational-close="'+esc(s.id)+'" '+(!isAssigned&&!state.admin?'disabled':'')+'>Cerrar operación · dejar cuadre pendiente</button></div><p class="bc7-msg" data-bc7-operational-close-msg></p></div>';
    }
    const ownerTurnId=s.turno_id||detail.turno_id||detail.turno?.id;
    if(['COMPLETADA','CERRADA_OPERATIVAMENTE'].includes(status)&&ownerTurnId&&(can('auditoria','editar_any')||can('entregas_caja','editar_any')||can('turnos','editar_any'))){
      actionArea+='<div class="bc7-note"><b>Revisión del Dueño</b><p>Abre el expediente completo de esta jornada: inventario, ventas estimadas, costos documentados, efectivo, diferencias y movimientos por validar.</p><div class="bc7-actions"><button type="button" class="bc7-btn primary" data-bc7-open-owner-review="'+esc(ownerTurnId)+'">Abrir revisión integral del turno</button></div></div>';
    }
    let adjustment='';
    if(['EN_CURSO','CERRADA_OPERATIVAMENTE'].includes(status)&&isAssigned&&(can('mermas','crear')||can('bajas','crear'))&&detail.checklist?.bajas?.completado!==true){
      const products=arr(detail.productos_ajuste);
      const canCreateBaja=can('bajas','crear'),canCreateMerma=can('mermas','crear');
      const adjustmentStorageType=canCreateBaja?'baja':'merma';
      const adjustmentTitle=canCreateBaja&&canCreateMerma?'Registrar baja o merma':(canCreateBaja?'Registrar lista de bajas':'Registrar merma');
      const adjustmentTypeField=canCreateBaja&&canCreateMerma
        ?'<label class="bc7-field">Tipo de ajuste<select data-bc7-ajust-type required><option value="baja">Baja de inventario · lista de productos</option><option value="merma">Merma · un producto</option></select></label>'
        :'<input type="hidden" data-bc7-ajust-type value="'+adjustmentStorageType+'">';
      const availableAdjustmentProducts=products.filter(p=>Number(p.stock_actual)>0);
      const adjustmentOptions='<option value="">Busca cualquier producto activo del almacén</option>'+products.map(p=>{
        const stock=Number(p.stock_actual||0),minimum=Number(p.minimo||0),hasStock=stock>0;
        return '<option value="'+esc(p.producto_id)+'" data-stock="'+esc(stock)+'" data-minimo="'+esc(minimum)+'">'+esc(p.nombre)+' · '+(hasStock?'stock '+esc(qty(stock)):'AGOTADO · stock 0')+(minimum>0?' · mínimo '+esc(qty(minimum)):'')+'</option>';
      }).join('');
      const adjustmentRow='<div class="bc7-grid bc7-adjustment-row" data-bc7-adjustment-row>'+
        '<label class="bc7-field">Producto<select data-bc7-ajust-product required>'+adjustmentOptions+'</select></label>'+
        '<label class="bc7-field">Cantidad<input type="number" min="0.001" step="0.001" data-bc7-ajust-qty required inputmode="decimal" placeholder="Cantidad real"></label>'+
        '<div class="bc7-adjustment-row-actions"><button class="bc7-btn" type="button" data-bc7-adjustment-remove hidden>Quitar</button></div></div>';
      adjustment='<details class="bc7-detail"><summary><span>'+adjustmentTitle+'</span><small>No afecta stock hasta aprobación</small></summary><div class="bc7-detail-body"><form data-bc7-adjust-form="'+esc(s.id)+'">'+adjustmentTypeField+
        '<label class="bc7-field">Motivo<select data-bc7-ajust-cause required><option value="">Selecciona un motivo</option><option value="Producto vencido">Producto vencido</option><option value="Producto roto o dañado">Producto roto o dañado</option><option value="Consumo del dueño">Consumo del dueño</option><option value="Otra causa">Otra causa</option></select></label>'+
        '<div data-bc7-adjustment-rows>'+adjustmentRow+'</div>'+
        '<div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-adjustment-add '+(!canCreateBaja?'hidden':'')+'>+ Añadir producto a la lista</button></div>'+
        '<label class="bc7-field">Detalle general (opcional)<input data-bc7-ajust-reason maxlength="160" placeholder="Aclaración común para toda la solicitud"></label>'+
        '<input type="hidden" data-bc7-adjust-key value="">'+
        '<p class="bc7-muted" data-bc7-adjustment-hint>'+(canCreateBaja?'Puedes incluir varios productos; Administración recibirá un único expediente para aprobar la lista completa.':'La merma se envía como una sola solicitud y no modifica stock hasta su aprobación.')+'</p>'+
        (availableAdjustmentProducts.length?'':'<p class="bc7-msg error">El catálogo está completo, pero no hay existencias positivas para registrar una baja o merma.</p>')+
        '<div class="bc7-actions"><button class="bc7-btn" type="submit" '+(!availableAdjustmentProducts.length?'disabled':'')+'>Enviar '+(canCreateBaja?'solicitud':'merma')+' a revisión</button></div><p class="bc7-msg" data-bc7-ajust-msg></p></form></div></details>';
    }
    const inv='<div class="bc7-panel-stack"><div class="bc7-workspace-overview"><div class="bc7-overview-item"><small>Inventario inicial</small><b>'+(initial?'Confirmado':'Pendiente')+'</b></div><div class="bc7-overview-item"><small>Inventario final</small><b>'+(final?'Confirmado':'Pendiente')+'</b></div><div class="bc7-overview-item"><small>Productos</small><b>'+arr(detail.productos).length+'</b></div></div>'+sharedApprovalHtml(detail)+'<details class="bc7-detail" '+(!initial?'open':'')+'><summary><span>1 · Inventario inicial</span><small>'+(initial?'Confirmado':'Pendiente')+'</small></summary><div class="bc7-detail-body">'+countFormHtml('INICIAL',detail)+'</div></details><div class="bc7-checklist-section-source" hidden><details class="bc7-detail" '+(initial&&!final?'open':'')+'><summary><span>2 · Inventario final</span><small>'+(final?'Confirmado':'Pendiente')+'</small></summary><div class="bc7-detail-body">'+countFormHtml('FINAL',detail)+'</div></details></div></div>';
    const fin=financeFormHtml(detail,isAssigned,status);
    const checks=checklistHtml(detail,isAssigned,status);
    const calculation=calculationPhaseHtml(detail);
    const op='<div class="bc7-panel-stack">'+checks+actionArea+'<div class="bc7-checklist-section-source" hidden>'+fin+adjustment+(s.es_minorista===true?cashDaysManagerShellHtml(detail,isAssigned,status):'')+'</div>'+calculation+'</div>';
    const mov='<div class="bc7-panel-stack"><div class="bc7-muted">Solo movimientos vinculados a esta sesión. El resto sigue en Movimientos → Historial.</div><div class="bc7-actions"><button class="bc7-btn" type="button" data-bc7-mov-refresh>Actualizar</button><button class="bc7-btn" type="button" data-bc7-open-movements>Abrir historial general</button></div><div id="bc7-movements"><div class="bc7-empty">Abre esta pestaña para consultar los movimientos.</div></div></div>';
    $('bc7-workspace-title').textContent=fmtDateHuman(s.fecha)+(s.fecha_fin&&s.fecha_fin!==s.fecha?' – '+fmtDateHuman(s.fecha_fin):'')+' · '+warehouseName(s.almacen_id);
    $('bc7-workspace-body').innerHTML='<div class="bc7-actions"><button type="button" class="bc7-btn primary" data-bc7-preview-jornada>Previsualizar cuadro completo</button></div>'+continuityNotice+'<div class="bc7-workspace-overview"><div class="bc7-overview-item"><small>Estado</small><b>'+esc(humanStatus(status))+'</b></div><div class="bc7-overview-item"><small>Responsable</small><b>'+esc(userName(s.responsable_id))+'</b></div><div class="bc7-overview-item"><small>Horario</small><b>'+esc(String(s.hora_inicio_prevista||'').slice(0,5))+'–'+esc(String(s.hora_fin_prevista||'').slice(0,5))+'</b></div></div><div class="bc7-workspace-tabs" role="tablist" aria-label="Secciones de la jornada"><button type="button" class="bc7-workspace-tab" role="tab" data-bc7-workspace-tab="inventario" aria-selected="true">Inventario</button><button type="button" class="bc7-workspace-tab" role="tab" data-bc7-workspace-tab="operacion" aria-selected="false">Operación y liquidación</button><button type="button" class="bc7-workspace-tab" role="tab" data-bc7-workspace-tab="movimientos" aria-selected="false">Movimientos</button></div><section class="bc7-workspace-panel" role="tabpanel" data-bc7-workspace-panel="inventario">'+inv+'</section><section class="bc7-workspace-panel" role="tabpanel" data-bc7-workspace-panel="operacion" hidden>'+op+'</section><section class="bc7-workspace-panel" role="tabpanel" data-bc7-workspace-panel="movimientos" hidden>'+mov+'</section>';
    $('bc7-workspace').hidden=false;setPageMode(true);$('bc7-workspace').scrollIntoView({behavior:'smooth',block:'start'});
    activateWorkspaceTab(state.workspaceTab);
  }
  async function openWorkspace(sessionId){
    closeChecklistModal({restore:false});
    if(!$('bc7-workspace')||!$('bc7-workspace-body'))return false;
    const requestVersion=++state.workspaceRequestVersion;
    const isNewSelection=String(state.selected||'')!==String(sessionId||'');
    state.detail=null;
    state.workspaceOperationSessionId=String(sessionId||'');
    state.workspaceOperationPromise=null;
    state.workspaceOperationLoaded=false;
    state.inventorySettlement=null;
    if(isNewSelection){state.workspaceTab='inventario';state.dailyCashData=null;state.dailyCashSessionId=null;state.dailyCashStatus=null;}
    setPageMode(true);$('bc7-workspace').hidden=false;$('bc7-workspace-title').textContent='Cargando jornada…';
    $('bc7-workspace-body').innerHTML='<div class="bc7-empty">Cargando jornada…</div>';
    try{
      let [detail,delivery]=await Promise.all([
        rpc('bc7_obtener_inventario_jornada',{p_turno_sesion_id:sessionId}),
        rpc('bc7_estado_entrega_inventario_jornada',{p_turno_sesion_id:sessionId})
      ]);
      if(state.workspaceRequestVersion!==requestVersion)return false;
      const sessionStatus=String(detail.sesion?.estado||'').toUpperCase();
      if(detail.sesion?.sucesora_retroactiva===true&&['PENDIENTE','PROGRAMADA'].includes(sessionStatus)){
        try{
          const startResult=await rpc('bc7_asegurar_inicio_sucesora_programada',{p_turno_sesion_id:sessionId});
          if(startResult&&startResult.iniciada===true){
            [detail,delivery]=await Promise.all([
              rpc('bc7_obtener_inventario_jornada',{p_turno_sesion_id:sessionId}),
              rpc('bc7_estado_entrega_inventario_jornada',{p_turno_sesion_id:sessionId})
            ]);
          }
        }catch(startError){
          console.warn('[BattleCruiser] La apertura automática de la sucesora sigue pendiente:',startError);
        }
      }
      if(state.workspaceRequestVersion!==requestVersion)return false;
      detail.entrega_compartida=delivery;
      detail.is_admin=!!state.admin;
      if(isNewSelection&&detail.sesion?.es_minorista===true&&['EN_CURSO','CERRADA_OPERATIVAMENTE'].includes(String(detail.sesion.estado||'').toUpperCase()))state.workspaceTab='operacion';
      state.selected=sessionId;renderWorkspace(detail);return true;
    }catch(e){
      if(state.workspaceRequestVersion!==requestVersion)return false;
      $('bc7-workspace-body').innerHTML='<div class="bc7-empty">'+esc(friendlyError(e,'calendar'))+' No se modificó ningún dato.</div>';
      return false;
    }
  }
  function parseSealedInventoryCsv(text,form){
    const source=String(text||'').replace(/^\uFEFF/,'');
    const firstLine=source.split(/\r?\n/).find(line=>line.trim())||'';
    let comma=0,semicolon=0,inQuotes=false;
    for(let i=0;i<firstLine.length;i++){
      const ch=firstLine[i];
      if(ch==='"'){if(inQuotes&&firstLine[i+1]==='"'){i++;continue;}inQuotes=!inQuotes;continue;}
      if(!inQuotes){if(ch===',')comma++;else if(ch===';')semicolon++;}
    }
    const delimiter=semicolon>comma?';':',';
    const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<source.length;i++){
      const ch=source[i];
      if(ch==='"'){
        if(quoted&&source[i+1]==='"'){field+='"';i++;}
        else quoted=!quoted;
      }else if(ch===delimiter&&!quoted){row.push(field);field='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){
        if(ch==='\r'&&source[i+1]==='\n')i++;
        row.push(field);field='';
        if(row.some(value=>String(value).trim()!==''))rows.push(row);
        row=[];
      }else field+=ch;
    }
    row.push(field);if(row.some(value=>String(value).trim()!==''))rows.push(row);
    if(rows.length<2)throw new Error('El CSV está vacío o solo contiene encabezados.');
    const norm=value=>String(value||'').replace(/^\uFEFF/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').trim().replace(/\s+/g,' ');
    const headers=rows[0].map(norm);
    const idIndex=headers.findIndex(value=>['producto id','id producto','product id','product_id'].includes(value));
    const qtyIndex=headers.findIndex(value=>['final fisico al corte','cantidad final','inventario final','final'].includes(value));
    if(idIndex<0||qtyIndex<0)throw new Error('No encuentro las columnas «Producto ID» y «Final físico al corte». Exporta la hoja correcta de la plantilla.');
    const inputs=Array.from(form.querySelectorAll('[data-bc7-count]'));
    const expected=new Map(inputs.map(input=>[String(input.dataset.bc7Count),input]));
    const seen=new Set(),lines=[];
    for(let i=1;i<rows.length;i++){
      const cells=rows[i];if(!cells.some(value=>String(value).trim()!==''))continue;
      const id=String(cells[idIndex]||'').trim().replace(/^"|"$/g,'');
      let raw=String(cells[qtyIndex]||'').trim();
      if(delimiter===';')raw=raw.replace(',','.');
      if(!id||!expected.has(id))throw new Error('La fila '+(i+1)+' contiene un producto que no pertenece al corte inicial: '+(id||'(sin ID)')+'.');
      if(seen.has(id))throw new Error('El producto '+id+' aparece más de una vez en el CSV.');
      if(raw===''||!/^\d+(?:\.\d{1,3})?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)<0)
        throw new Error('Cantidad inválida para el producto '+id+' en la fila '+(i+1)+'.');
      seen.add(id);lines.push({producto_id:id,cantidad:Number(raw)});
    }
    if(seen.size!==expected.size){
      const missing=Array.from(expected.keys()).filter(id=>!seen.has(id));
      throw new Error('El CSV está incompleto: faltan '+missing.length+' productos del corte inicial.');
    }
    lines.forEach(line=>{const input=expected.get(String(line.producto_id));if(input)input.value=String(line.cantidad);});
    return lines;
  }
  async function sha256File(file){
    if(!window.crypto||!window.crypto.subtle||!file||typeof file.arrayBuffer!=='function')
      throw new Error('Este navegador no permite calcular la huella SHA-256 del archivo.');
    const digest=await window.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,'0')).join('');
  }
  async function saveCount(form){
    const type=form.dataset.bc7CountForm;
    const sessionId=state.selected;
    const sealedMode=String(form.dataset.bc7SealedFinalCapture||'');
    const sealedAdmin=sealedMode==='true';
    const sealedResponsible=sealedMode==='responsible';
    let lines=[];
    let sourceFile=null,sourceSha='';
    if(sealedAdmin){
      sourceFile=form.querySelector('[data-bc7-sealed-final-file]')?.files?.[0]||null;
      if(!sourceFile){msg(form.querySelector('[data-bc7-count-msg]'),'Selecciona el CSV completo del inventario final.','error');return;}
      try{
        lines=parseSealedInventoryCsv(await sourceFile.text(),form);
        sourceSha=await sha256File(sourceFile);
      }catch(error){
        msg(form.querySelector('[data-bc7-count-msg]'),String(error&&error.message||error),'error');return;
      }
    }else{
      const inputs=Array.from(form.querySelectorAll('[data-bc7-count]'));
      lines=inputs.map(i=>({producto_id:i.dataset.bc7Count,cantidad:i.value.trim()}));
    }
    const bad=lines.find(x=>x.cantidad===''||!Number.isFinite(Number(x.cantidad))||Number(x.cantidad)<0||!/^\d+(?:\.\d{1,3})?$/.test(String(x.cantidad)));
    if(bad){msg(form.querySelector('[data-bc7-count-msg]'),'Cuenta todos los productos e introduce cantidades válidas con hasta 3 decimales.','error');return;}
    const note=form.querySelector('[data-bc7-count-note]')?.value||null;
    const label=type==='INICIAL'?'inventario inicial':'inventario final';
    const confirmText=sealedAdmin
      ?'Vas a guardar un inventario FINAL histórico para el corte operativo original mediante una captura auditada ADMIN. No se modificará el stock global. ¿Confirmas?'
      :(sealedResponsible
        ?'Vas a registrar tu conteo físico final desde tu cuenta de responsable. El registro quedará ligado al corte operativo original y no modificará el stock global. ¿Confirmas que contaste todos los productos?'
        :'Vas a confirmar el '+label+' físico. Después no podrás editar este conteo; quedará guardado quién lo hizo, cuándo y qué cantidades mostraba la aplicación para comparar. ¿Confirmas que contaste todos los productos?');
    if(!confirm(confirmText))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{
      if(sealedAdmin){
        const keyInput=form.querySelector('[data-bc7-count-idempotency]');
        const shaInput=form.querySelector('[data-bc7-count-source-sha]');
        if(!keyInput.value||shaInput.value!==sourceSha)keyInput.value=freshIdempotencyKey();
        shaInput.value=sourceSha;
        const result=await rpc('bc7_admin_registrar_inventario_final_sellado_jornada',{
          p_turno_sesion_id:sessionId,
          p_lineas:lines.map(x=>({producto_id:x.producto_id,cantidad:Number(x.cantidad)})),
          p_observacion:note||'Conteo histórico cargado por ADMIN al corte operativo original.',
          p_fuente_documental:sourceFile.name,
          p_fuente_sha256:sourceSha,
          p_idempotency_key:keyInput.value
        });
        await openWorkspace(sessionId);
        setStatus(result&&result.idempotente?'El mismo CSV ya estaba registrado; no se duplicó el inventario final.':'Inventario final histórico registrado y auditado por ADMIN.','ok');
      }else if(sealedResponsible){
        const keyInput=form.querySelector('[data-bc7-count-idempotency]');
        if(!keyInput.value)keyInput.value=freshIdempotencyKey();
        const result=await rpc('bc7_responsable_registrar_inventario_final_sellado_jornada',{
          p_turno_sesion_id:sessionId,
          p_lineas:lines.map(x=>({producto_id:x.producto_id,cantidad:Number(x.cantidad)})),
          p_observacion:note||null,
          p_idempotency_key:keyInput.value
        });
        const loaded=await openWorkspace(sessionId);
        if(!loaded||!state.detail?.cortes?.FINAL)throw new Error('El conteo se envió, pero la lectura de comprobación no confirmó el corte final.');
        setStatus(result&&result.idempotente?'El conteo final ya estaba guardado; no se duplicó.':'Inventario final registrado por la responsable y confirmado por el servidor.','ok');
      }else{
        await rpc('bc7_guardar_inventario_jornada',{p_turno_sesion_id:sessionId,p_tipo:type,p_lineas:lines.map(x=>({producto_id:x.producto_id,cantidad:Number(x.cantidad)})),p_observacion:note});
        await openWorkspace(sessionId);setStatus('Conteo confirmado y actualizado desde el servidor.','ok');
      }
    }catch(e){
      msg(form.querySelector('[data-bc7-count-msg]'),(sealedAdmin?'No se confirmó el inventario final histórico. ':(sealedResponsible?'No se confirmó tu inventario final. ':'No se confirmó el conteo. '))+friendlyError(e,'inventory')+(sealedAdmin?' Conserva el mismo CSV y vuelve a consultar el estado; no uses otra clave manual.':(sealedResponsible?' Conserva las cantidades y la misma clave; actualiza el estado antes de repetir.':'')),'error');
    }finally{busy(btn,false);}
  }
  async function saveReceipt(form){
    const sessionId=form.dataset.bc7ReceiveForm;
    const deliveryId=form.dataset.bc7ReceiveDelivery||'';
    const msgEl=form.querySelector('[data-bc7-receive-msg]');
    const btn=form.querySelector('button[type="submit"]');
    if(form.dataset.bc7Sending==='1')return;
    syncReceiveFormState(form);
    const attempt=getReceiveAttempt({id:deliveryId});
    const lineDefs=arr(JSON.parse(form.dataset.bc7ReceiveLines||'[]'));
    const mode=attempt.mode||'fast';
    const note=(form.querySelector('[data-bc7-receive-note]')?.value||'').trim()||null;

    let payloadLines=[];
    if(mode==='fast'){
      if(!form.querySelector('[data-bc7-receive-attest-fast]')?.checked){
        msg(msgEl,'Debes confirmar que contaste físicamente todos los productos y que todos coinciden.','error');return;
      }
      payloadLines=lineDefs.map(l=>({producto_id:l.producto_id,cantidad:Number(l.cantidad_declarada)}));
    }else{
      if(attempt.step!=='values'){
        msg(msgEl,'Primero selecciona los productos con diferencias y continúa al paso de corrección.','error');return;
      }
      const markedCount=lineDefs.filter(l=>!!attempt.marked[String(l.producto_id)]).length;
      if(markedCount===0){
        msg(msgEl,'Selecciona al menos un producto con diferencia o utiliza la opción Todo coincide.','error');return;
      }
      if(!form.querySelector('[data-bc7-receive-attest-diff]')?.checked){
        msg(msgEl,'Debes confirmar el conteo físico de los productos seleccionados.','error');return;
      }
      let bad=false;
      payloadLines=lineDefs.map(l=>{
        const id=String(l.producto_id);
        const marked=!!attempt.marked[id];
        if(!marked)return {producto_id:l.producto_id,cantidad:Number(l.cantidad_declarada)};
        const raw=String(attempt.values[id]??'').trim();
        if(raw===''||! /^\d+(?:\.\d{1,3})?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)<0){
          bad=true;return {producto_id:l.producto_id,cantidad:NaN};
        }
        return {producto_id:l.producto_id,cantidad:Number(raw)};
      });
      if(bad){msg(msgEl,'Cada producto seleccionado requiere una cantidad física válida (0 o hasta 3 decimales).','error');return;}
    }

    const payload={p_destino_sesion_id:sessionId,p_lineas:payloadLines,p_observacion:note};
    const signature=receiveSignature(payload);
    if(!attempt.idempotencyKey || attempt.lastSignature!==signature){
      try{attempt.idempotencyKey=freshIdempotencyKey();}catch(e){msg(msgEl,'No se pudo preparar el envío de forma segura. Actualiza e inténtalo de nuevo.','error');return;}
      attempt.lastSignature=signature;
    }
    const idempotencyKey=attempt.idempotencyKey;

    attempt.sending=true; attempt.inline={text:'Enviando recepción… no cierres esta pantalla.',kind:''};
    form.dataset.bc7Sending='1'; if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true');}
    msg(msgEl,attempt.inline.text,''); setStatus(attempt.inline.text,'');

    try{
      const result=await rpc('bc7_recibir_entrega_jornada',{...payload,p_idempotency_key:idempotencyKey});
      const diffCount=mode==='diff'?payloadLines.filter((l,i)=>Math.round((Number(l.cantidad)-Number(lineDefs[i].cantidad_declarada))*1000)!==0).length:(result&&result.requiere_revision?null:0);
      if(result&&result.requiere_recuento){
        attempt.inline={text:'Se detectó una corrección posterior en el inventario de origen. La entrega se actualizó y la recepción NO se guardó. Reabre el conteo y verifica las cantidades vigentes.',kind:'ok'};
      }else if(result&&result.requiere_revision){
        attempt.inline={text:'Recepción enviada a revisión del Dueño: '+(diffCount!=null?diffCount+' diferencias':'hay diferencias')+'; jornada bloqueada hasta la decisión.',kind:'ok'};
      }else{
        attempt.inline={text:'Recepción coincidente aceptada; inventario inicial compartido confirmado.',kind:'ok'};
      }
      attempt.idempotencyKey=''; attempt.lastSignature=''; // logical attempt completed
      const refreshed=await openWorkspace(sessionId);
      if(refreshed){setStatus(attempt.inline.text,'ok');}
      else{
        setStatus(attempt.inline.text+' No se pudo actualizar la vista automáticamente; recarga o reabre la jornada si es necesario.','ok');
        if($('bc7-workspace-body'))$('bc7-workspace-body').innerHTML='<div class="bc7-note"><b>'+esc(attempt.inline.text)+'</b><p class="bc7-muted">No se pudo actualizar la vista automáticamente. La recepción ya fue registrada en el servidor. Recarga o reabre la jornada para ver el estado actual.</p></div>';
      }
    }catch(e){
      let uncertain=isUncertainReceiveError(e);
      if(uncertain){
        try{
          const deliveryState=await rpc('bc7_estado_entrega_inventario_jornada',{p_turno_sesion_id:sessionId});
          const inbound=deliveryState&&deliveryState.entrada;
          if(inbound && (inbound.estado==='PENDIENTE_REVISION' || inbound.estado==='ACEPTADA')){
            const diff=(arr(inbound.lineas).filter(l=>Number(l.diferencia||0)!==0)).length;
            attempt.inline={text:inbound.estado==='PENDIENTE_REVISION'
              ?('Recepción enviada a revisión del Dueño: '+diff+' diferencias; jornada bloqueada hasta la decisión.')
              :'Recepción coincidente aceptada; inventario inicial compartido confirmado.',kind:'ok'};
            attempt.idempotencyKey=''; attempt.lastSignature='';
            const refreshed=await openWorkspace(sessionId);
            if(refreshed){setStatus(attempt.inline.text,'ok');}
            else{
              setStatus(attempt.inline.text+' No se pudo actualizar la vista automáticamente; recarga o reabre la jornada si es necesario.','ok');
              if($('bc7-workspace-body'))$('bc7-workspace-body').innerHTML='<div class="bc7-note"><b>'+esc(attempt.inline.text)+'</b><p class="bc7-muted">No se pudo actualizar la vista automáticamente. La recepción ya fue registrada en el servidor. Recarga o reabre la jornada para ver el estado actual.</p></div>';
            }
            return;
          }
          if(inbound && (inbound.estado==='PENDIENTE_RECEPCION' || inbound.estado==='REQUIERE_RECUENTO')){
            uncertain=false;
          }
        }catch(_){/* keep uncertain */}
      }
      if(uncertain){
        attempt.inline={text:'Respuesta incierta de la red. No se confirmó si se guardó. Pulsa "Guardar recepción física" para reintentar de forma segura (se reutilizará la misma clave si no cambiaste los datos).',kind:'error'};
        msg(msgEl,attempt.inline.text,'error');
        setStatus('Respuesta incierta: reintenta de forma segura sin cambiar los datos.','error');
      }else{
        attempt.inline={text:'No se confirmó la recepción. '+friendlyError(e,'create')+' Puedes corregir y reintentar; no se borraron tus selecciones.',kind:'error'};
        msg(msgEl,attempt.inline.text,'error');
        setStatus('No se confirmó la recepción.','error');
      }
    }finally{
      attempt.sending=false; form.dataset.bc7Sending=''; if(btn){btn.disabled=false;btn.removeAttribute('aria-busy');}
      syncReceiveFormState(form);
    }
  }

  async function saveLegacyInitial(form){
    const sessionId=form.dataset.bc7LegacyInitialForm;
    const inputs=Array.from(form.querySelectorAll('[data-bc7-legacy-count]'));
    const lines=inputs.map(i=>({producto_id:i.dataset.bc7LegacyCount,cantidad:i.value.trim()}));
    const bad=lines.find(x=>x.cantidad===''||!Number.isFinite(Number(x.cantidad))||Number(x.cantidad)<0||!/^\d+(?:\.\d{1,3})?$/.test(x.cantidad));
    const reason=form.querySelector('[data-bc7-legacy-reason]')?.value.trim()||'';
    const msgEl=form.querySelector('[data-bc7-legacy-msg]');
    if(bad||!reason){msg(msgEl,'Completa el conteo físico de todos los productos y el motivo de regularización.','error');return;}
    if(!confirm('Esta es una excepción de dueño para una jornada legacy ya abierta. Se registrará el conteo físico completo y el motivo; el stock global no cambiará. ¿Confirmas?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{
      await rpc('bc7_regularizar_inicial_jornada_legacy',{
        p_turno_sesion_id:sessionId,
        p_lineas:lines.map(x=>({producto_id:x.producto_id,cantidad:Number(x.cantidad)})),
        p_motivo:reason
      });
      await openWorkspace(sessionId);
      setStatus('Inventario inicial legacy regularizado con auditoría. No se modificó el stock global.','ok');
    }catch(e){msg(msgEl,'No se pudo regularizar el inventario. '+friendlyError(e,'create'),'error');}
    finally{busy(btn,false);}
  }

  async function resolveSharedDelivery(btn){
    const deliveryId=btn.dataset.bc7DeliveryId;
    const decision=btn.dataset.bc7DeliveryDecision;
    const note=document.querySelector('[data-bc7-delivery-decision-note]')?.value.trim()||'';
    const message=document.querySelector('[data-bc7-delivery-decision-msg]');
    if(!note){msg(message,'Registra el motivo de la decisión.','error');return;}
    if(!confirm(decision==='APROBAR'
      ?'Vas a aprobar la recepción. Las diferencias quedarán registradas en el expediente y se creará el inventario inicial con la cantidad física recibida. El inventario final del origen no se modificará. ¿Confirmas?'
      :'Vas a rechazar esta recepción. La jornada seguirá bloqueada y la dependienta tendrá que realizar otro conteo físico. ¿Confirmas?'))return;
    if(!busy(btn,true))return;
    try{
      const result=await rpc('bc7_resolver_entrega_jornada',{
        p_entrega_id:deliveryId,p_decision:decision,p_motivo:note
      });
      if(state.selected)await openWorkspace(state.selected);
      setStatus(decision==='APROBAR'
        ?'Recepción aprobada. La diferencia quedó en el expediente y la cantidad física recibida pasó al inventario inicial; el FINAL del origen no se modificó.'
        :'Diferencia rechazada. Se exige un nuevo conteo y la jornada sigue bloqueada.','ok');
    }catch(e){msg(message,'No se pudo resolver la entrega. '+friendlyError(e,'create'),'error');}
    finally{busy(btn,false);}
  }

  async function linkSharedDelivery(btn){
    const deliveryId=btn.dataset.bc7LinkDelivery;
    const sessionId=btn.dataset.bc7LinkSession;
    if(!confirm('Vas a vincular esta jornada ya programada como destino de la entrega anterior. No se creará otra jornada ni se duplicará la fecha. ¿Confirmas?'))return;
    if(!busy(btn,true))return;
    try{
      await rpc('bc7_vincular_entrega_jornada',{
        p_entrega_id:deliveryId,p_destino_sesion_id:sessionId
      });
      await openWorkspace(sessionId);
      setStatus('Jornada existente vinculada como destino de recepción.','ok');
    }catch(e){setStatus('No se pudo vincular la jornada existente. '+friendlyError(e,'create'),'error');}
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
      await loadCurrentSession();
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
  async function saveCashDeclaration(form,skipConfirm,alreadyBusy){
    if(!form)return false;
    const sessionId=form.dataset.bc7CloseForm||String(state.detail?.sesion?.id||'');
    const tramo=state.detail&&(state.detail.tramo_registrable||state.detail.tramo_activo);
    const trancheId=tramo&&tramo.id;
    const raw=form.querySelector('#bc7-cash')?.value.trim()||'';
    const amount=Number(raw);
    const declaration=state.detail?.declaracion_dinero;
    const declarationState=String(declaration?.estado_aprobacion||'').toUpperCase();
    const isSealed=String(state.detail?.sesion?.estado||'').toUpperCase()==='CERRADA_OPERATIVAMENTE';
    const registered=state.detail?.checklist?.declaracion_dinero?.declaracion_registrada===true;
    const saved=declaration&&String(declaration.turno_tramo_id)===String(trancheId)&&registered&&!['RECHAZADA','RECTIFICADA'].includes(declarationState);
    const message=form.querySelector('[data-bc7-close-msg]')||form.querySelector('#bc7-cash-days-msg')||$('bc7-cash-days-msg');
    if(saved){msg(message,'La declaración final de la responsable ya está guardada.','ok');return true;}
    if(!sessionId||!trancheId){msg(message,'No se encontró el tramo de la responsable para guardar la declaración.','error');return false;}
    if(raw===''||!Number.isFinite(amount)||amount<0){msg(message,'Introduce el total final real, igual o mayor que cero.','error');return false;}
    if(!skipConfirm&&!confirm('Se guardará la declaración final del período, separada de las entregas diarias. El Dueño contará el efectivo físicamente después. ¿Confirmas?'))return false;
    const btn=form.querySelector('[data-bc7-save-cash]')||form.querySelector('[data-bc7-save-cash-days]');
    if(!alreadyBusy&&!busy(btn,true))return false;
    try{
      if(isSealed){
        await rpc('bc5_responsable_declarar_dinero_jornada',{p_turno_sesion_id:sessionId,p_monto:amount});
      }else{
        await rpc('bc_declarar_dinero',{p_turno_tramo_id:trancheId,p_monto:amount});
      }
      state.dailyCashData=null;state.dailyCashSessionId=null;
      const reread=await openWorkspace(sessionId);
      if(!reread||!state.detail?.declaracion_dinero||String(state.detail.declaracion_dinero.turno_tramo_id)!==String(trancheId)||Number(state.detail.declaracion_dinero.monto)!==amount){
        throw new Error('El servidor no confirmó la declaración final al volver a consultar. No repitas el envío todavía.');
      }
      setStatus('Declaración final del período guardada por la responsable. El conteo físico del Dueño sigue separado.','ok');
      return true;
    }catch(e){
      try{
        state.dailyCashData=null;state.dailyCashSessionId=null;
        const reread=await openWorkspace(sessionId);
        if(reread&&state.detail?.declaracion_dinero&&String(state.detail.declaracion_dinero.turno_tramo_id)===String(trancheId)&&Number(state.detail.declaracion_dinero.monto)===amount){
          setStatus('Declaración final confirmada al volver a consultar. No se repitió la escritura.','ok');
          return true;
        }
      }catch(_){}
      msg(message,friendlyError(e,'create')+' No repitas el envío hasta comprobar el estado.','error');
      setStatus('No se pudo confirmar la declaración final del período.','error');
      return false;
    }finally{if(!alreadyBusy)busy(btn,false);}
  }

  async function closeOperationalSession(button){
    const sessionId=String(button?.dataset?.bc7OperationalClose||'');
    const reason=String($('bc7-operational-close-reason')?.value||'').trim()||null;
    const message=$('bc7-operational-close-msg');
    if(!sessionId||!state.detail||String(state.detail.sesion?.id)!==sessionId||
       String(state.detail.sesion?.estado||'').toUpperCase()!=='EN_CURSO'||
       state.detail.sesion?.es_minorista!==true){
      msg(message,'La Jornada cambió o ya no está operativamente abierta. Actualiza antes de continuar.','error');return false;
    }
    if(!confirm('Se cerrará únicamente la operación de esta Jornada. No se registrará inventario final, declaración de efectivo ni aprobación. La Jornada quedará pendiente de conciliación del Dueño. ¿Continuar?'))return false;
    if(!busy(button,true))return false;
    try{
      await rpc('bc5_cerrar_jornada_operativa',{
        p_turno_sesion_id:sessionId,
        p_motivo_excepcion:reason
      });
      await loadCalendar();
      await loadCurrentSession();
      const loaded=await openWorkspace(sessionId);
      if(!loaded)throw new Error('El sello se registró pero no se pudo recargar la Jornada. Actualiza la pantalla.');
      setStatus('Operación sellada. Inventario, caja y conciliación siguen pendientes.','ok');
      return true;
    }catch(error){
      msg(message,friendlyError(error,'create')+' '+String(error?.message||''),'error');
      return false;
    }finally{busy(button,false);}
  }
  async function closeSession(form){
    const sessionId=form.dataset.bc7CloseForm;
    let amount=$('bc7-cash')?.value.trim();
    let msgEl=form.querySelector('[data-bc7-close-msg]');
    const cashMode=form.dataset.bc7CashMode||'single';
    if(!state.detail?.tramo_activo?.id){msg(msgEl,'No hay un tramo activo para declarar el dinero. La jornada no se ha cerrado.','error');return;}
    if(!state.detail?.cortes?.FINAL){msg(msgEl,'Primero confirma el inventario final.','error');return;}
    if(cashMode==='daily'){
      const savedAllDays=await saveCashDaysWorkspace(form,{requireComplete:true,skipConfirm:true,verifyOnly:true});
      if(!savedAllDays)return;
      form=document.querySelector('form[data-bc7-close-form]')||form;
      msgEl=form.querySelector('[data-bc7-close-msg]')||msgEl;
      if(state.detail?.checklist?.declaracion_dinero?.completado!==true){
        msg(msgEl,'El servidor todavía no confirma una entrega registrada para cada fecha del período. La jornada no se ha cerrado.','error');return;
      }
      amount='';
    }else{
      amount=$('bc7-cash')?.value.trim();
      const tramoId=state.detail.tramo_activo.id;
      const saved=state.detail.declaracion_dinero&&String(state.detail.declaracion_dinero.turno_tramo_id)===String(tramoId);
      if(saved){amount=String(state.detail.declaracion_dinero.monto);}
      if(amount===''||amount==null||!Number.isFinite(Number(amount))||Number(amount)<0){msg(msgEl,'Introduce un importe real igual o mayor que cero.','error');return;}
    }
    if(state.detail?.sesion?.es_minorista===true){
      let checklist;
      try{
        checklist=await rpc('bc7_estado_confirmaciones_jornada',{p_turno_sesion_id:sessionId});
      }catch(e){
        msg(msgEl,'No se pudieron verificar los cinco pasos en el servidor. '+friendlyError(e,'calendar')+' La jornada sigue abierta.','error');
        return;
      }
      if(checklist?.lista_para_conteo!==true){
        msg(msgEl,'No se puede entregar todavía: la responsable debe completar gastos, reinversiones, bajas, inventario final y entregas diarias de efectivo. La jornada sigue abierta.','error');
        return;
      }
    }
    const tramoId=state.detail.tramo_activo.id;
    const saved=cashMode==='daily'
      ?state.detail?.checklist?.declaracion_dinero?.completado===true
      :!!(state.detail.declaracion_dinero&&String(state.detail.declaracion_dinero.turno_tramo_id)===String(tramoId));
    const confirmation=cashMode==='daily'
      ?'Las entregas diarias de todas las fechas están registradas. ¿Entregas la jornada al Dueño? Después podrá aprobarlas y contar físicamente el efectivo. El Turno maestro seguirá abierto.'
      :(saved?'Los cinco pasos están completos y el importe quedó declarado. ¿Entregas la jornada al Dueño? Después del traspaso podrá contar el efectivo y resolver las pendientes; el Turno seguirá abierto para la revisión final.':'Se guardará el importe declarado y se entregará la jornada. Después del traspaso, el Dueño podrá contar el efectivo y resolver las pendientes. ¿Confirmas?');
    if(!confirm(confirmation))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{
      if(cashMode!=='daily'&&!saved) await rpc('bc_declarar_dinero',{p_turno_tramo_id:tramoId,p_monto:Number(amount)});
      await rpc('bc5_cerrar_jornada',{p_turno_sesion_id:sessionId,p_motivo_excepcion:$('bc7-close-reason')?.value||null});
      await loadCalendar();
      await loadCurrentSession();
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
      setStatus('Jornada entregada al Dueño. La sesión quedó completada y el Turno maestro sigue abierto. El Dueño ya puede contar el efectivo y resolver las pendientes.','ok');
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
  let checklistModalContext=null;
  function closeChecklistModal(options){
    if(!checklistModalContext)return;
    const restore=options?.restore!==false;
    if(restore){
      checklistModalContext.entries.forEach(entry=>{
        if(entry.placeholder?.parentNode){
          entry.placeholder.parentNode.insertBefore(entry.node,entry.placeholder);
          entry.placeholder.remove();
          entry.node.open=false;
        }
      });
    }
    checklistModalContext.root?.remove();
    document.body.style.overflow=checklistModalContext.previousBodyOverflow||'';
    checklistModalContext=null;
  }
  async function openWorkerShortcut(sessionId,section){
    const editableSections=['gastos','reinversiones','bajas'];
    if(!sessionId||!['gastos','reinversiones','bajas','inventario_final','declaracion_dinero'].includes(section)){
      setStatus('Este acceso rápido no corresponde a una sección disponible.','error');
      return false;
    }
    // Worker shortcuts originate in #tab-mi-jornada. The workspace and its
    // checklist dialog live in #tab-jornada, so activate that tab before
    // opening the session; otherwise the dialog is mounted inside a hidden tab.
    navTo('jornada');
    if(!await openWorkspace(sessionId))return false;
    const completed=state.detail?.checklist?.[section]?.completado===true;
    if(editableSections.includes(section)&&completed){
      if(!navigator.onLine){
        setStatus('Sin conexión: no se puede reabrir el bloque hasta verificarlo con el servidor.','error');
        return false;
      }
      try{
        await rpc('bc7_confirmar_bloque_jornada',{
          p_turno_sesion_id:sessionId,
          p_bloque:section,
          p_completado:false
        });
        if(!await openWorkspace(sessionId))return false;
        setStatus('Bloque reabierto. Ya puedes registrar los movimientos que faltan; al enviar la evidencia volverá a quedar cerrado.','ok');
      }catch(error){
        setStatus('No se pudo reabrir el bloque. '+friendlyError(error,'create'),'error');
        return false;
      }
    }
    openChecklistSection(section);
    return true;
  }
  function openChecklistSection(key){
    if(!['gastos','reinversiones','bajas','inventario_final','declaracion_dinero'].includes(key))return;
    closeChecklistModal({restore:true});
    activateWorkspaceTab(key==='inventario_final'?'inventario':'operacion');
    const all=Array.from(document.querySelectorAll('#bc7-workspace-body details'));
    let targets=[];
    if(key==='gastos'){
      targets=all.filter(node=>node.querySelector('[data-bc7-finance-form="gasto"]')||/gastos registrados/i.test(node.querySelector('summary')?.textContent||''));
    }else if(key==='reinversiones'){
      targets=all.filter(node=>node.querySelector('[data-bc7-finance-form="reinversion"]')||/reinversiones registradas/i.test(node.querySelector('summary')?.textContent||''));
    }else if(key==='bajas'){
      const target=document.querySelector('[data-bc7-adjust-form]')?.closest('details');
      if(target)targets=[target];
    }else if(key==='declaracion_dinero'){
      const target=document.querySelector('#bc7-cash-days-manager');
      if(target)targets=[target];
    }else{
      const target=all.find(node=>node.querySelector('form[data-bc7-count-form="FINAL"]')||/2\s*[·.]\s*Inventario final/i.test(node.querySelector('summary')?.textContent||''));
      if(target)targets=[target];
    }
    if(!targets.length){setStatus('Esta subsección no está disponible en el estado actual de la jornada.','error');return;}
    const labels={gastos:'Gastos',reinversiones:'Reinversiones',bajas:'Bajas',inventario_final:'Inventario final',declaracion_dinero:'Dinero del período · Paso 1'};
    const completed=key==='inventario_final'
      ?!!state.detail?.cortes?.FINAL
      :key==='declaracion_dinero'
        ?state.detail?.checklist?.declaracion_dinero?.completado===true
        :state.detail?.checklist?.[key]?.completado===true;
    const root=document.createElement('div');
    root.className='bc7-checklist-modal';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label',labels[key]);
    const headerNote=key==='declaracion_dinero'
      ?'Registra una entrega por cada fecha real del período. Escribe 0 CUP cuando ese día no hubo entrega.'
      :(key==='bajas'?'Envía primero la lista completa de bajas o mermas. Después confirma que no faltan más registros.':'Completa este apartado y envía su evidencia a Administración.');
    const actionLabel=key==='inventario_final'
      ?'Guardar inventario final'
      :(key==='declaracion_dinero'?'Enviar paso 1 a Administración':(completed?'Reabrir sección':(key==='bajas'?'Confirmar que no faltan más bajas':'Enviar evidencia a Administración')));
    root.innerHTML='<div class="bc7-checklist-modal-panel">'+
      '<header class="bc7-checklist-modal-head"><div><p>JORNADA · '+esc(labels[key].toUpperCase())+'</p><h3>'+esc(labels[key])+'</h3><small>'+headerNote+'</small></div><button type="button" class="bc7-btn" data-bc7-checklist-modal-close aria-label="Cerrar">Cerrar ✕</button></header>'+
      '<div class="bc7-checklist-modal-body" data-bc7-checklist-modal-body></div>'+
      '<footer class="bc7-checklist-modal-foot"><span class="bc7-muted" data-bc7-checklist-modal-state>'+(completed?'Este apartado ya está confirmado.':'Los cambios se guardan en el servidor al enviarlos.')+'</span><button type="button" class="bc7-btn primary" data-bc7-checklist-modal-action '+(completed?'disabled':'')+'>'+actionLabel+'</button></footer>'+
    '</div>';
    const host=document.getElementById('tab-jornada')||document.body;
    host.appendChild(root);
    const body=root.querySelector('[data-bc7-checklist-modal-body]');
    const entries=[];
    targets.forEach(node=>{
      const placeholder=document.createComment('bc7-checklist-modal:'+key);
      node.parentNode.insertBefore(placeholder,node);
      body.appendChild(node);
      if(node.tagName==='DETAILS')node.open=true;
      entries.push({node,placeholder});
    });
    checklistModalContext={root,key,entries,previousBodyOverflow:document.body.style.overflow};
    document.body.style.overflow='hidden';
    root.querySelector('[data-bc7-checklist-modal-close]').addEventListener('click',()=>closeChecklistModal({restore:true}));
    root.addEventListener('click',e=>{if(e.target===root)closeChecklistModal({restore:true});});
    root.querySelector('[data-bc7-checklist-modal-action]').addEventListener('click',async()=>{
      const button=root.querySelector('[data-bc7-checklist-modal-action]');
      if(!checklistModalContext||!navigator.onLine){setStatus('La subsección requiere conexión para enviar evidencia.','error');return;}
      if(completed)return;
      if(key==='declaracion_dinero'){
        const cashForm=root.querySelector('[data-bc7-close-form]');
        if(!cashForm){setStatus('No se encontró el formulario de dinero del período. No se envió nada.','error');return;}
        const saved=await saveCashDaysWorkspace(cashForm,{requireComplete:true,skipConfirm:true,verifyOnly:true,button});
        if(!saved)return;
        setStatus('Paso 1 confirmado: las entregas diarias están registradas para todas las fechas.','ok');
        return;
      }
      if(key==='bajas'){
        const form=root.querySelector('[data-bc7-adjust-form]');
        if(form){
          const cause=form.querySelector('[data-bc7-ajust-cause]')?.value||'';
          const rows=Array.from(form.querySelectorAll('[data-bc7-adjustment-row]'));
          const hasUnsentInput=!!cause||rows.some(row=>!!row.querySelector('[data-bc7-ajust-product]')?.value||!!row.querySelector('[data-bc7-ajust-qty]')?.value);
          if(hasUnsentInput){
            setStatus('Hay bajas preparadas que todavía no se han enviado. Completa todas las filas y pulsa «Enviar solicitud a revisión». Después confirma que no faltan más bajas.','error');
            form.querySelector('[data-bc7-ajust-cause]')?.focus();
            return;
          }
        }
      }
      button.disabled=true;
      try{
        if(key==='inventario_final'){
          if(state.detail?.cortes?.FINAL){
            closeChecklistModal({restore:true});
            setStatus('El inventario final ya está confirmado.','ok');
            return;
          }
          const form=root.querySelector('form[data-bc7-count-form="FINAL"]');
          if(!form){button.disabled=false;setStatus('No se encontró el formulario del inventario final.','error');return;}
          form.requestSubmit();
          return;
        }
        await rpc('bc7_confirmar_bloque_jornada',{
          p_turno_sesion_id:state.selected,
          p_bloque:key,
          p_completado:true
        });
        closeChecklistModal({restore:false});
        const ok=await openWorkspace(state.selected);
        if(ok)setStatus('Evidencia enviada y bloque cerrado. No se admitirán nuevas altas hasta reabrirlo explícitamente.','ok');
      }catch(error){
        button.disabled=false;
        setStatus('No se pudo enviar la evidencia. '+friendlyError(error,'create'),'error');
      }
    });
    root.querySelector('[data-bc7-checklist-modal-close]').focus();
  }
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&checklistModalContext)closeChecklistModal({restore:true});
  });
  async function toggleChecklistBlock(button){
    const sessionId=state.selected;
    const block=button?.dataset?.bc7ChecklistToggle;
    if(!sessionId||!['gastos','reinversiones','bajas'].includes(block))return;
    const completed=button.dataset.completed!=='true';
    if(!navigator.onLine){setStatus('Sin conexión: el checklist requiere confirmación del servidor.','error');return;}
    button.disabled=true;
    try{
      await rpc('bc7_confirmar_bloque_jornada',{
        p_turno_sesion_id:sessionId,p_bloque:block,p_completado:completed
      });
      const ok=await openWorkspace(sessionId);
      if(ok)setStatus(completed?'Bloque confirmado. Si agregas otro registro, el sistema reabrirá este check.':'Bloque reabierto para seguir registrando.','ok');
    }catch(e){
      button.disabled=false;
      setStatus('No se pudo actualizar el checklist. '+friendlyError(e,'create'),'error');
    }
  }
  function updateReinvestmentEstimate(form){
    const output=form&&form.querySelector('[data-bc7-reinvestment-estimate]');
    if(!output)return;
    const quantity=Number(form.querySelector('[data-bc7-reinvestment-quantity]')?.value);
    const unitCost=Number(form.querySelector('[data-bc7-reinvestment-unit-cost]')?.value);
    if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitCost)||unitCost<=0){
      output.textContent='Total calculado: introduce la cantidad y el costo unitario.';return;
    }
    const total=Math.round(quantity*unitCost*100)/100;
    output.textContent=qty(quantity)+' × '+money(unitCost)+' CUP = '+money(total)+' CUP en total.';
  }
  function syncAdjustmentRows(form){
    if(!form)return;
    const type=form.querySelector('[data-bc7-ajust-type]')?.value||'baja';
    const rows=Array.from(form.querySelectorAll('[data-bc7-adjustment-row]'));
    const isList=type==='baja';
    if(!isList&&rows.length>1)rows.slice(1).forEach(row=>row.remove());
    const visibleRows=Array.from(form.querySelectorAll('[data-bc7-adjustment-row]'));
    visibleRows.forEach(row=>{
      const remove=row.querySelector('[data-bc7-adjustment-remove]');
      if(remove)remove.hidden=!isList||visibleRows.length<2;
    });
    const add=form.querySelector('[data-bc7-adjustment-add]');
    if(add)add.hidden=!isList;
    const hint=form.querySelector('[data-bc7-adjustment-hint]');
    if(hint)hint.textContent=isList?'Puedes incluir varios productos; Administración recibirá un único expediente para aprobar la lista completa.':'La merma se envía como una sola solicitud y no modifica stock hasta su aprobación.';
  }
  function addAdjustmentRow(form){
    if((form.querySelector('[data-bc7-ajust-type]')?.value||'baja')!=='baja')return;
    const rows=Array.from(form.querySelectorAll('[data-bc7-adjustment-row]'));
    if(!rows.length||rows.length>=100){msg(form.querySelector('[data-bc7-ajust-msg]'),'La lista debe contener entre 1 y 100 productos.','error');return;}
    const clone=rows[0].cloneNode(true);
    const select=clone.querySelector('[data-bc7-ajust-product]');
    if(select){
      select.value='';
      // cloneNode copies the enhanced select's "already attached" marker and
      // its inert trigger button, but not the original button's event handler.
      // Restore the native select before attaching a fresh searchable picker.
      const pickerField=select.closest('.bc-product-picker-field');
      if(pickerField)pickerField.replaceWith(select);
      ['bcSelectPicker','bcProductPicker','bcPickerKind','bcPickerNoun'].forEach(key=>delete select.dataset[key]);
      select.classList.remove('bc-product-picker-native-select');
      select.removeAttribute('aria-hidden');
      select.removeAttribute('tabindex');
    }
    const quantity=clone.querySelector('[data-bc7-ajust-qty]');if(quantity){quantity.value='';quantity.removeAttribute('max');quantity.setCustomValidity('');}
    const remove=clone.querySelector('[data-bc7-adjustment-remove]');if(remove)remove.hidden=false;
    form.querySelector('[data-bc7-adjustment-rows]').appendChild(clone);
    if(select&&typeof window.__BC_PRODUCT_PICKER_REFRESH__==='function')window.__BC_PRODUCT_PICKER_REFRESH__(select);
    syncAdjustmentRows(form);
  }
  function removeAdjustmentRow(button){
    const form=button.closest('[data-bc7-adjust-form]');
    const rows=form?Array.from(form.querySelectorAll('[data-bc7-adjustment-row]')):[];
    if(!form||rows.length<=1)return;
    button.closest('[data-bc7-adjustment-row]')?.remove();syncAdjustmentRows(form);
  }
  function validateAdjustmentRow(row){
    const select=row?.querySelector('[data-bc7-ajust-product]');
    const quantity=row?.querySelector('[data-bc7-ajust-qty]');
    if(!select||!quantity)return;
    const option=select.options[select.selectedIndex];
    const stock=Number(option?.dataset?.stock||0);
    if(select.value&&Number.isFinite(stock)&&stock>0)quantity.max=String(stock);else quantity.removeAttribute('max');
    const amount=Number(quantity.value);
    if(select.value&&quantity.value!==''&&Number.isFinite(amount)&&amount>stock){
      quantity.setCustomValidity('La cantidad supera el stock disponible ('+qty(stock)+').');
    }else quantity.setCustomValidity('');
  }
  async function submitAdjustment(form){
    const sessionId=form.dataset.bc7AdjustForm;
    const storageType=form.querySelector('[data-bc7-ajust-type]').value;
    const cause=form.querySelector('[data-bc7-ajust-cause]').value.trim();
    const detail=form.querySelector('[data-bc7-ajust-reason]').value.trim();
    const msgEl=form.querySelector('[data-bc7-ajust-msg]');
    const rows=Array.from(form.querySelectorAll('[data-bc7-adjustment-row]'));
    const sessionSealed=String(state.detail?.sesion?.estado||'').toUpperCase()==='CERRADA_OPERATIVAMENTE';
    const lines=rows.map(row=>{
      const select=row.querySelector('[data-bc7-ajust-product]');
      const quantityInput=row.querySelector('[data-bc7-ajust-qty]');
      const option=select?.options?.[select.selectedIndex];
      return {producto_id:select?.value||'',cantidad:Number(quantityInput?.value),stock:Number(option?.dataset?.stock||0),row};
    });
    if(!cause||!lines.length||(cause==='Otra causa'&&!detail)){
      msg(msgEl,'Selecciona el motivo y completa el detalle cuando elijas «Otra causa».','error');return;
    }
    if(lines.some(line=>!line.producto_id||!Number.isFinite(line.cantidad)||line.cantidad<=0)){
      msg(msgEl,'Selecciona un producto e introduce una cantidad positiva en cada fila.','error');return;
    }
    if(storageType!=='baja'&&lines.length!==1){
      msg(msgEl,'Una merma corresponde a un solo producto. Para varios productos, selecciona «Baja de inventario».','error');return;
    }
    if(!sessionSealed&&lines.some(line=>!Number.isFinite(line.stock)||line.stock<=0||line.cantidad>line.stock)){
      const bad=lines.find(line=>!Number.isFinite(line.stock)||line.stock<=0||line.cantidad>line.stock);
      const selected=bad?.row.querySelector('[data-bc7-ajust-product]');
      const selectedName=selected?.options?.[selected.selectedIndex]?.textContent||'uno de los productos';
      msg(msgEl,'Stock insuficiente para '+selectedName+'. La cantidad solicitada debe ser menor o igual al stock disponible.','error');return;
    }
    if(new Set(lines.map(line=>line.producto_id)).size!==lines.length){
      msg(msgEl,'No repitas un producto en la lista. Suma sus cantidades en una sola fila.','error');return;
    }
    const reason=cause+(detail?' — '+detail:'');
    const keyField=form.querySelector('[data-bc7-adjust-key]');
    if(!keyField){msg(msgEl,'Falta la referencia segura de esta solicitud. Actualiza la Jornada antes de continuar.','error');return;}
    let idempotencyKey=keyField.value.trim();
    try{if(!idempotencyKey){idempotencyKey=freshIdempotencyKey();keyField.value=idempotencyKey;}}
    catch(e){msg(msgEl,'No se pudo preparar la solicitud anti-duplicados. Actualiza la aplicación y vuelve a intentarlo.','error');return;}
    if(!confirm(storageType==='baja'
      ?'Se enviará una sola solicitud administrativa con '+lines.length+' producto(s). El inventario solo cambiará cuando se apruebe la lista completa. ¿Confirmas?'
      :'Se enviará una solicitud de merma para un producto a revisión administrativa. El inventario solo cambia cuando se apruebe. ¿Confirmas?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{
      let result=null;
      if(storageType==='baja'){
        result=await rpc('bc7_registrar_bajas_multiple_jornada',{
          p_turno_sesion_id:sessionId,
          p_lineas:lines.map(line=>({producto_id:line.producto_id,cantidad:line.cantidad,motivo:reason})),
          p_motivo_general:reason,p_idempotency_key:idempotencyKey
        });
      }else{
        const line=lines[0];
        result=await rpc('bc7_registrar_ajuste_jornada',{
          p_turno_sesion_id:sessionId,p_tipo:'merma',p_producto_id:line.producto_id,
          p_cantidad:line.cantidad,p_motivo:reason,p_idempotency_key:idempotencyKey
        });
      }
      if(result&&result.__bcOfflineQueued){
        keyField.value='';form.reset();
        const queuedMessage='Solicitud guardada localmente para esta Jornada. Sigue pendiente de sincronización y revisión; el stock no se ha modificado. Referencia local: '+(result.queueId||'pendiente');
        msg(msgEl,queuedMessage,'ok');setStatus(queuedMessage,'ok');return;
      }
      const bajaState=String(result?.estado||'PENDIENTE').toUpperCase();
      const successMessage=storageType==='baja'
        ?bajaState==='APROBADA'
          ?'Lista de '+lines.length+' producto(s) registrada y aprobada por los permisos de esta cuenta. El inventario fue actualizado por el servidor.'
          :'Lista de '+lines.length+' producto(s) enviada como un solo expediente. Está pendiente de una única aprobación administrativa.'
        :'Solicitud de merma guardada y ligada a esta jornada. Está pendiente de revisión; no se marcó como aprobada.';
      const reopenBajas=storageType==='baja';
      const keepBajasPanelOpen=checklistModalContext?.key==='bajas'&&!!checklistModalContext.root?.isConnected;
      keyField.value='';
      form.reset();
      // Clear extra cloned rows after a successful list submission, but keep the
      // current Bajas modal mounted so the worker can immediately confirm Step 4.
      Array.from(form.querySelectorAll('[data-bc7-adjustment-row]')).slice(1).forEach(row=>row.remove());
      syncAdjustmentRows(form);
      if(keepBajasPanelOpen){
        msg(msgEl,successMessage,'ok');
        const modalState=checklistModalContext.root.querySelector('[data-bc7-checklist-modal-state]');
        if(modalState)modalState.textContent='Solicitud enviada. Revisa si falta otra baja y confirma el cierre del paso cuando termines.';
        setStatus(successMessage+' La sección Bajas sigue abierta. Puedes pulsar ahora «Confirmar que no faltan más bajas».','ok');
        return;
      }
      if(reopenBajas)closeChecklistModal({restore:true});
      const refreshed=await openWorkspace(sessionId);
      if(refreshed&&reopenBajas){openChecklistSection('bajas');setStatus(successMessage+' Sigues en Bajas: revisa si falta registrar otra y después pulsa «Confirmar que no faltan más bajas».','ok');}
    }catch(e){msg(msgEl,'No se registró el ajuste. '+friendlyError(e,'adjustment')+' No repitas el envío con otra referencia hasta revisar el estado.','error');}
    finally{busy(btn,false);}
  }
  async function openRetroSuccessorPanel(btn){
    const host=$('bc7-retro-handover-content');
    if(!host)return;
    if(!state.admin){setStatus('Solo el Dueño/Admin puede regularizar una sucesora atrasada.','error');return;}
    if(!busy(btn,true))return;
    host.innerHTML='<div class="bc7-empty">Consultando entregas pendientes…</div>';
    try{
      await ensureResponsibleCatalog(true);
      const pending=arr(await rpc('bc7_listar_entregas_sucesoras_pendientes',{}));
      if(!pending.length){host.innerHTML='<div class="bc7-empty">No hay entregas cerradas esperando una jornada sucesora.</div>';return;}
      const first=pending[0];
      const deliveryOptions=pending.map(d=>'<option value="'+esc(d.entrega_id)+'">'+esc((d.almacen_nombre||'Almacén')+' · '+fmtDate(d.fecha_destino)+' · '+d.lineas+' familias · anterior '+fmtDate(d.fecha_inicio)+'–'+fmtDate(d.fecha_fin_anterior))+'</option>').join('');
      const personOptions='<option value="">Selecciona la responsable real</option>'+eligibleStaff().map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nombre||u.nombre_usuario||u.email||u.id)+'</option>').join('');
      host.innerHTML='<form id="bc7-retro-successor-form" class="bc7-panel-stack">'+
        '<label class="bc7-field">Entrega de inventario anterior<select id="bc7-retro-delivery" required>'+deliveryOptions+'</select></label>'+
        '<div class="bc7-grid"><label class="bc7-field">Inicio (heredado de la entrega)<input id="bc7-retro-start-date" type="date" value="'+esc(first.fecha_destino)+'" readonly></label>'+
        '<label class="bc7-field">Fin de la jornada<input id="bc7-retro-end-date" type="date" min="'+esc(first.fecha_destino)+'" max="'+esc(addDays(first.fecha_destino,30))+'" value="'+esc(successorEndDate(first))+'" required></label></div>'+
        '<label class="bc7-field">Responsable real del período<select id="bc7-retro-responsible" required>'+personOptions+'</select></label>'+
        '<label class="bc7-field">Motivo de regularización<input id="bc7-retro-note" maxlength="1000" minlength="5" value="Regularización del período atrasado tras el retraso del cierre del turno anterior y su conciliación auditada." required></label>'+
        '<div class="bc7-actions"><button class="bc7-btn primary" type="submit">Crear sucesora y vincular el inventario</button></div>'+
        '<p class="bc7-msg" id="bc7-retro-successor-msg"></p></form>'+
        '<p class="bc7-muted">Solo se crea la programación. La responsable debe realizar el conteo físico real antes de poder operar.</p>';
      const select=$('bc7-retro-delivery');
      select?.addEventListener('change',()=>{
        const d=pending.find(x=>String(x.entrega_id)===String(select.value));
        if(!d)return;
        $('bc7-retro-start-date').value=d.fecha_destino;
        $('bc7-retro-end-date').min=d.fecha_destino;
        $('bc7-retro-end-date').max=addDays(d.fecha_destino,30);
        $('bc7-retro-end-date').value=successorEndDate(d);
      });
    }catch(e){host.innerHTML='<div class="bc7-empty">'+esc(friendlyError(e,'create'))+'</div>';}
    finally{busy(btn,false);}
  }
  async function createRetroSuccessor(form){
    const deliveryId=$('bc7-retro-delivery')?.value;
    const start=$('bc7-retro-start-date')?.value;
    const end=$('bc7-retro-end-date')?.value;
    const responsible=$('bc7-retro-responsible')?.value;
    const note=$('bc7-retro-note')?.value.trim()||'';
    const output=$('bc7-retro-successor-msg');
    if(!deliveryId||!start||!end||end<start||!responsible||note.length<5){msg(output,'Selecciona la entrega, el período, la responsable y el motivo.','error');return;}
    if(!confirm('Se preparará una jornada única '+fmtDate(start)+'–'+fmtDate(end)+', con la responsable elegida. Se vinculará el inventario final existente; no se modificará el stock global ni se registrará un conteo inicial automático. Después la responsable tendrá que contar físicamente las familias. ¿Confirmas?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{
      const result=await rpc('bc7_admin_programar_sucesora_pendiente',{
        p_entrega_id:deliveryId,p_fecha_fin:end,p_responsable_id:responsible,p_observacion:note
      });
      const monthInput=$('bc7-calendar-month');if(monthInput)monthInput.value=start.slice(0,7);state.calendarSelectedDate=start;
      await loadCalendar();
      const host=$('bc7-retro-handover-content');
      if(host)host.innerHTML='<div class="bc7-note"><b>Sucesora preparada.</b><p>Período '+esc(fmtDate(result.fecha_inicio))+'–'+esc(fmtDate(result.fecha_fin))+' · '+esc(result.lineas_inventario)+' familias vinculadas · responsable '+esc(userName(result.responsable_id))+'.</p><p>La jornada sigue bloqueada hasta que se registre la recepción física.</p><div class="bc7-actions"><button class="bc7-btn primary" type="button" data-bc7-open="'+esc(result.sesion_id)+'">Abrir recepción física</button></div></div>';
      setStatus('Sucesora retroactiva preparada y vinculada. El turno anterior permanece cerrado.','ok');
    }catch(e){msg(output,'No se creó la sucesora. '+friendlyError(e,'successor'),'error');}
    finally{busy(btn,false);}
  }
  async function startRetroSuccessor(btn){
    const sessionId=btn.dataset.bc7StartRetro;
    const hour=$('bc7-retro-start-time')?.value;
    const reason=$('bc7-retro-start-reason')?.value.trim()||'';
    const message=$('bc7-retro-start-msg');
    if(!hour||reason.length<5){msg(message,'Indica la hora real y el motivo obligatorio.','error');return;}
    if(!confirm('Se abrirá la jornada atrasada con la hora real '+hour+' de su fecha programada. La recepción física ya debe estar aceptada. ¿Confirmas?'))return;
    if(!busy(btn,true))return;
    try{
      await rpc('bc7_admin_iniciar_sucesora_retroactiva',{
        p_turno_sesion_id:sessionId,p_hora_real:hour,p_motivo:reason
      });
      await refreshPosArchiveAfterSessionStart();await loadCalendar();await loadCurrentSession();await openWorkspace(sessionId);
      setStatus('Jornada sucesora retroactiva iniciada tras la recepción física.','ok');
    }catch(e){msg(message,'No se pudo iniciar la jornada. '+friendlyError(e,'create'),'error');}
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
    const warehouse=$('bc7-warehouse')?.value,start=$('bc7-start-date')?.value,n=scheduleDayCount(),mode='explicit';
    if(!n){msg($('bc7-create-msg'),'Indica cuántos días quieres programar (entre 2 y 31).','error');$('bc7-days-count')?.focus();return;}
    if(!warehouse||!start){msg($('bc7-create-msg'),'Selecciona el almacén y la primera fecha.','error');return;}
    if(start<dateHavana()){msg($('bc7-create-msg'),'La fecha de inicio ya pasó. Elige hoy o una fecha futura.','error');return;}
    if(mode==='explicit'){
      if(!staffCatalogReady()){msg($('bc7-create-msg'),'Espera a que se cargue la lista de responsables.','error');return;}
      let schedule=readDayRows();if(schedule.length!==n){buildDayRows();schedule=readDayRows();}
      const responsibleId=$('bc7-period-responsible')?.value||'';
      if(!responsibleId||schedule.some(x=>!x.trabaja||String(x.responsable_id||'')!==String(responsibleId))){msg($('bc7-create-msg'),'Selecciona una responsable para toda la Jornada.','error');return;}
      if(!busy(btn,true))return;
      try{
        const rows=schedule.map((row,index)=>({...row,fecha:addDays(start,index),hora_inicio_prevista:$('bc7-hour-start')?.value||'07:00',hora_fin_prevista:$('bc7-hour-end')?.value||'23:00'}));
        state.lastPreview={start,warehouse,days:n,rows,mode:'explicit'};
        $('bc7-preview').innerHTML='<article class="bc7-jornada"><strong>'+esc(fmtDateHuman(start))+' — '+esc(fmtDateHuman(addDays(start,n-1)))+'</strong><p>'+n+' días · '+esc(userName(schedule[0].responsable_id))+' · una sola Jornada</p></article>';
        msg($('bc7-create-msg'),'Vista previa de tu asignación. No se ha guardado nada. El servidor comprobará fechas ocupadas y conflictos de responsables al crear.','');
      }finally{busy(btn,false);}
      return;
    }
    if(!busy(btn,true))return;
    try{
      const rows=arr(await rpc('bc5_previsualizar_jornada',{p_almacen_id:warehouse,p_fecha_inicio:start,p_dias:n}));
      state.lastPreview={start,warehouse,days:n,rows,mode:'pattern'};
      $('bc7-preview').innerHTML=rows.map(r=>'<article class="bc7-jornada"><div class="bc7-jornada-top"><div><strong>'+esc(fmtDateHuman(r.fecha))+' · '+esc(r.trabaja?userName(r.responsable_id):'Descanso')+'</strong><p>'+esc(String(r.hora_inicio_prevista).slice(0,5))+'–'+esc(String(r.hora_fin_prevista).slice(0,5))+'</p></div>'+(r.conflicto?'<span class="bc7-pill warn">Revisar</span>':'<span class="bc7-pill ok">Disponible</span>')+'</div>'+(r.motivo_conflicto?'<p>'+esc(friendlyError(r.motivo_conflicto,'preview'))+'</p>':'')+'</article>').join('');
      msg($('bc7-create-msg'),rows.some(r=>r.conflicto)?'La vista previa contiene conflictos. Corrígelos antes de crear.':'Rotación verificada sin conflictos. Aún falta confirmar la creación.','');
    }catch(e){state.lastPreview=null;msg($('bc7-create-msg'),friendlyError(e,'preview'),'error');}
    finally{busy(btn,false);}
  }
  async function createSchedule(btn){
    const warehouse=$('bc7-warehouse')?.value,start=$('bc7-start-date')?.value,n=scheduleDayCount();
    if(!n){msg($('bc7-create-msg'),'Indica cuántos días quieres programar (entre 2 y 31).','error');$('bc7-days-count')?.focus();return false;}
    const mode='explicit';
    if(!warehouse||!start){msg($('bc7-create-msg'),'Selecciona el almacén y la primera fecha que quieres programar.','error');return false;}
    if(start<dateHavana()){msg($('bc7-create-msg'),'La fecha de inicio ya pasó. Elige hoy o una fecha futura.','error');return false;}
    let schedule=null;
    if(!staffCatalogReady()){msg($('bc7-create-msg'),'Espera a que se cargue la lista de personas disponibles antes de crear la Jornada.','error');return false;}
    schedule=readDayRows();
    const responsibleId=$('bc7-period-responsible')?.value||'';
    if(schedule.length!==n||!responsibleId||schedule.some(x=>!x.trabaja||String(x.responsable_id||'')!==String(responsibleId))){
      msg($('bc7-create-msg'),'Selecciona una única responsable para todo el período y vuelve a revisar.','error');return false;
    }
    if(!confirm('Se crearán '+n+' días de jornada en '+warehouseName(warehouse)+'. Si alguna fecha o persona ya tiene otro turno, la aplicación te avisará. ¿Confirmas?'))return false;
    if(!busy(btn,true))return false;
    try{
      const result=await rpc('bc5_crear_jornada_unica',{p_almacen_id:warehouse,p_fecha_inicio:start,p_dias:n,p_programacion:schedule,p_observacion:$('bc7-schedule-note')?.value.trim()||null});
      const monthInput=$('bc7-calendar-month');if(monthInput)monthInput.value=start.slice(0,7);state.calendarSelectedDate=start;
      const total=Number(result&&result.dias_total);
      const summary=Number.isFinite(total)?'Jornada creada: '+total+' días consecutivos con una sola responsable.':'La Jornada se creó correctamente.';
      msg($('bc7-create-msg'),summary,'ok');
      state.lastPreview=null;await loadCalendar({force:true});
      return true;
    }catch(e){msg($('bc7-create-msg'),'No se pudo crear la programación. '+friendlyError(e,'create'),'error');return false;}
    finally{busy(btn,false);}
  }
  async function reschedule(form){
    const id=form.dataset.bc7Reschedule;
    const person=form.querySelector('[data-bc7-reperson]').value||null;
    const reason=form.querySelector('[data-bc7-reason]').value.trim();
    const msgEl=form.querySelector('[data-bc7-remsg]');
    if(!staffCatalogReady()){msg(msgEl,'Espera a que se cargue la lista de responsables activos antes de hacer el cambio.','error');return;}
    if(!reason||!person){msg(msgEl,'Selecciona la responsable de la jornada y escribe el motivo del cambio.','error');return;}
    if(!confirm('Se guardará la reasignación en el historial de la jornada. ¿Confirmas el cambio de responsable?'))return;
    const btn=form.querySelector('button[type="submit"]');if(!busy(btn,true))return;
    try{await rpc('bc5_reprogramar_jornada',{p_programacion_id:id,p_trabaja:true,p_responsable_id:person,p_motivo:reason});msg(msgEl,'Responsable reasignada.','ok');await loadCalendar();}
    catch(e){msg(msgEl,'No se pudo guardar el cambio. '+friendlyError(e,'create'),'error');}
    finally{busy(btn,false);}
  }
  function openMovements(){
    const d=state.detail;if(!d)return;
    const warehouse=$('mov-filtro-almacen');if(warehouse)warehouse.value=d.sesion.almacen_id;
    const from=$('mov-filtro-desde');if(from)from.value=String(d.sesion.fecha).slice(0,10);
    const to=$('mov-filtro-hasta');if(to)to.value=String(d.sesion.fecha_fin||d.sesion.fecha).slice(0,10);
    navTo('movimientos');
    const refresh=$('mov-refrescar-btn')||$('movimientos-refrescar-btn');
    if(refresh)setTimeout(()=>refresh.click(),150);
  }
  async function boot(){
    ensureStyles();ensureDayRowsStyles();if(!ensureShell())return;
    if(!authenticatedContextReady()){
      setStatus('Esperando la validación segura de tu sesión antes de consultar las jornadas…','');
      renderWorkerDashboardState('Validando tu sesión…','Estamos comprobando tu identidad y permisos antes de mostrar tus jornadas.','boot');
      return false;
    }
    const today=dateHavana();
    
    if($('bc7-start-date'))$('bc7-start-date').value=today;
    if($('bc7-list-from'))$('bc7-list-from').value=today;
    if($('bc7-list-days'))$('bc7-list-days').value='31';
    if($('bc7-calendar-month'))$('bc7-calendar-month').value=today.slice(0,7);
    state.staffLoaded=eligibleStaff().length>0;
    fillWarehouses();buildDayRows();
    ensureWarehouseCatalog();
    try{state.admin=!!(await rpc('bc_actor_is_admin',{}));}
    catch(e){state.admin=false;setStatus(friendlyError(e,'general'),'error');}
    if(state.admin){try{await ensureResponsibleCatalog(true);}catch(_){}}
    if($('bc7-admin-panel'))$('bc7-admin-panel').hidden=false;
    if($('bc7-admin-details'))$('bc7-admin-details').hidden=!state.admin;
    const plannerShortcut=document.querySelector('[data-bc7-open-planner]');if(plannerShortcut)plannerShortcut.hidden=!state.admin;
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
    const refreshCatalogs=()=>{fillWarehouses();refreshResponsibleSelectors();renderVisualWarehouseSelector();notifyVisualCalendarUpdated();};
    setTimeout(refreshCatalogs,700);setTimeout(refreshCatalogs,1800);
    const staffRetry=$('bc7-staff-retry');
    if(staffRetry)staffRetry.addEventListener('click',async()=>{try{await ensureResponsibleCatalog(true);}catch(_){}});
    const listFrom=$('bc7-list-from');if(listFrom)listFrom.addEventListener('change',()=>{state.lastPreview=null;});
    const monthPicker=$('bc7-calendar-month');if(monthPicker)monthPicker.addEventListener('change',()=>{state.calendarSelectedDate=null;loadCalendar();});
    await Promise.all([loadCurrentSession(),loadCalendar()]);
    renderWorkerDashboard();
    window.addEventListener('online',()=>{setStatus('Conexión restaurada. Actualiza el calendario para leer el estado LIVE.','ok');ensureWarehouseCatalog();});
    window.addEventListener('offline',()=>setStatus('Sin conexión: las escrituras quedan bloqueadas.','error'));
    return true;
  }
  document.addEventListener('click',async function(e){
    const helpOpen=e.target&&e.target.closest?e.target.closest('[data-bc7-help-open]'):null;
    if(helpOpen){e.preventDefault();const modal=$('bc7-help-modal');if(modal){modal.hidden=false;modal.querySelector('[data-bc7-help-close]')?.focus();}return;}
    const helpClose=e.target&&e.target.closest?e.target.closest('[data-bc7-help-close]'):null;
    if(helpClose){e.preventDefault();const modal=$('bc7-help-modal');if(modal)modal.hidden=true;return;}
    const workerRetry=e.target&&e.target.closest?e.target.closest('[data-bc7-worker-retry]'):null;
    if(workerRetry){
      e.preventDefault();
      const retry=workerRetry.getAttribute('data-bc7-worker-retry');
      if(retry==='calendar'){
        state.calendarLoadError='';state.calendarLoading=true;
        renderWorkerDashboardState('Actualizando tus jornadas…','Volviendo a consultar tus asignaciones.');
        await Promise.all([loadCurrentSession(),loadCalendar({force:true})]);
        renderWorkerDashboard();
      }else{
        if(authWaitTimer!==null)window.clearTimeout(authWaitTimer);
        authWaitTimer=null;bootStarted=false;
        scheduleAuthenticatedBoot();
      }
      return;
    }
    const workerShortcut=e.target&&e.target.closest?e.target.closest('[data-bc7-worker-shortcut]'):null;
    if(workerShortcut){
      e.preventDefault();
      const sessionId=workerShortcut.getAttribute('data-session-id');
      const section=workerShortcut.getAttribute('data-bc7-worker-shortcut');
      await openWorkerShortcut(sessionId,section);
      return;
    }
    const workerOpen=e.target&&e.target.closest?e.target.closest('[data-bc7-worker-open-jornada]'):null;
    if(workerOpen){e.preventDefault();navTo('jornada');return;}
    const ownerReview=e.target&&e.target.closest?e.target.closest('[data-bc7-open-owner-review]'):null;
    if(ownerReview){e.preventDefault();if(typeof window.bcAbrirRevisionJornada==='function')window.bcAbrirRevisionJornada(ownerReview.getAttribute('data-bc7-open-owner-review'));else if(typeof window.alert==='function')alert('La revisión del Dueño todavía no está cargada. Actualiza la aplicación.');return;}
    const checklistOpen=e.target&&e.target.closest?e.target.closest('[data-bc7-checklist-open]'):null;
    if(checklistOpen){e.preventDefault();openChecklistSection(checklistOpen.getAttribute('data-bc7-checklist-open'));return;}
    const checklistToggle=e.target&&e.target.closest?e.target.closest('[data-bc7-checklist-toggle]'):null;
    if(checklistToggle){e.preventDefault();toggleChecklistBlock(checklistToggle);return;}
    const checklistInventory=e.target&&e.target.closest?e.target.closest('[data-bc7-checklist-inventory]'):null;
    if(checklistInventory){e.preventDefault();activateWorkspaceTab('inventario');return;}
    const checklistCash=e.target&&e.target.closest?e.target.closest('[data-bc7-checklist-cash]'):null;
    if(checklistCash){
      e.preventDefault();openChecklistSection('declaracion_dinero');return;
    }
    const preview=e.target&&e.target.closest?e.target.closest('[data-bc7-preview-jornada]'):null;
    if(preview){e.preventDefault();openJornadaPreview(preview);return;}
    const tab=e.target&&e.target.closest?e.target.closest('[data-bc7-workspace-tab]'):null;
    if(tab){e.preventDefault();activateWorkspaceTab(tab.getAttribute('data-bc7-workspace-tab'));return;}
    const back=e.target&&e.target.closest?e.target.closest('[data-bc7-back-calendar]'):null;
    if(back){e.preventDefault();returnToCalendar();}
  });
  async function validateVisualDraft(payload){
    if(!state.admin)throw new Error('Solo Administración puede crear una jornada desde el tablero visual.');
    if(!navigator.onLine)throw new Error('Conéctate para revisar y confirmar la programación. El borrador permanece local.');
    const warehouseId=String(payload&&payload.warehouseId||'');
    const startDate=String(payload&&payload.startDate||'').slice(0,10);
    const days=Number(payload&&payload.days);
    const schedule=arr(payload&&payload.schedule),responsableId=String(payload&&payload.responsableId||'');
    if(!warehouses().some(item=>String(item.id)===warehouseId))throw new Error('Selecciona un almacén activo disponible.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||startDate<dateHavana())throw new Error('La fecha inicial debe ser hoy o futura.');
    if(!Number.isInteger(days)||days<2||days>31||schedule.length!==days)throw new Error('El período debe tener entre 2 y 31 días asignados.');
    if(!staffCatalogReady())await ensureResponsibleCatalog(false);
    const people=new Map(eligibleStaff().map(person=>[String(person.id),person]));
    if(!responsableId||!people.has(responsableId))throw new Error('Selecciona una persona activa como responsable de toda la jornada.');
    const normalizedSchedule=schedule.map((item,index)=>{
      if(!item||Number(item.numero_dia)!==index+1)throw new Error('La distribución del Día '+(index+1)+' está incompleta.');
      return {numero_dia:index+1,trabaja:true,responsable_id:responsableId};
    });
    const conflicts=[],endDate=addDays(startDate,days-1);
    const existing=arr(await rpc('bc5_mis_jornadas',{p_fecha_inicio:startDate,p_fecha_fin:endDate}));
    for(let index=0;index<days;index++){
      const date=addDays(startDate,index),item=normalizedSchedule[index];
      const onWarehouse=existing.filter(row=>String(row.almacen_id||'')===warehouseId&&jornadaCoversDate(row,date)&&!['CANCELADA','CANCELADO'].includes(String(row.sesion_estado||row.estado||'').toUpperCase()));
      if(onWarehouse.length)conflicts.push({date,kind:'warehouse',detail:'El almacén ya tiene '+onWarehouse.length+' registro(s) en esta fecha.'});
      const onResponsible=existing.filter(row=>row.trabaja===true&&String(row.responsable_id||'')===responsableId&&jornadaCoversDate(row,date)&&!['CANCELADA','CANCELADO'].includes(String(row.sesion_estado||row.estado||'').toUpperCase()));
      if(onResponsible.length)conflicts.push({date,kind:'responsible',detail:(people.get(responsableId)?.nombre||'La persona seleccionada')+' ya tiene otra asignación visible.'});
    }
    return {valid:conflicts.length===0,warehouseId,startDate,endDate,days,responsableId,schedule:normalizedSchedule,conflicts,visibleRecordsChecked:existing.length,
      note:'Todos los días del período son laborables y comparten una única responsable. Se revisan conflictos visibles y el servidor valida de nuevo al confirmar.'};
  }
  async function createVisualDraft(payload,button){
    const validation=await validateVisualDraft(payload);
    if(!validation.valid)return {ok:false,validation,message:'Corrige los conflictos antes de confirmar.'};
    const warehouse=$('bc7-warehouse'),date=$('bc7-start-date'),count=$('bc7-days-count'),responsible=$('bc7-period-responsible');
    if(!warehouse||!date||!count||!responsible)throw new Error('El formulario seguro de programación no está disponible.');
    warehouse.value=validation.warehouseId;date.value=validation.startDate;count.value=String(validation.days);responsible.value=String(validation.responsableId||'');
    buildDayRows();
    if(!responsible.value||!eligibleStaff().some(person=>String(person.id)===responsible.value))throw new Error('No se pudo asignar la responsable única al período.');
    validation.schedule=arr(validation.schedule);
    const created=await createSchedule(button||document.querySelector('[data-bc7-create]'));
    return {ok:created===true,message:$('bc7-create-msg')?.textContent||'',validation};
  }
  window.__BC7_JORNADA__ = {
    openWorkspace: openWorkspace,
    responsibleName: userName,
    refreshResponsibleStaff: async function(){try{return await ensureResponsibleCatalog(true);}catch(_){return []; }},
    openForSession: async function(sessionId) {
      if (!sessionId) return false;
      navTo('jornada');
      return openWorkspace(sessionId);
    },
    visualPlanner:{
      getSnapshot:function(){
        const rows=visualBoardRows(),date=state.calendarSelectedDate||dateHavana();
        return {
          admin:state.admin===true,
          online:navigator.onLine===true,
          month:String($('bc7-calendar-month')?.value||date.slice(0,7)),
          selectedDate:date,
          warehouseId:String(state.visualWarehouseId||''),
          warehouses:warehouses().map(item=>({id:String(item.id),name:String(item.nombre||item.id)})),
          staff:state.admin?eligibleStaff().map(person=>({id:String(person.id),name:String(person.nombre||person.nombre_usuario||person.email||person.id)})):[],
          rows:rows.slice(),
          periods:groupJornadaPeriods(rows),
          historyRows:groupJornadaPeriods(rows).filter(period=>(period._periodRows||[]).some(row=>['COMPLETADA','CERRADA','CERRADO','CERRADA_OPERATIVAMENTE','CANCELADA','CANCELADO'].includes(String(row.sesion_estado||row.estado||'').toUpperCase()))),
          selectedRows:rows.filter(row=>jornadaCoversDate(row,date))
        };
      },
      setWarehouse:function(id){
        if(!warehouses().some(item=>String(item.id)===String(id)))return false;
        state.visualWarehouseId=String(id);
        renderVisualWarehouseSelector();
        const month=String($('bc7-calendar-month')?.value||dateHavana().slice(0,7)),rows=visualBoardRows();
        renderMonthCalendar(month,rows);renderCalendarDetail(state.calendarSelectedDate||dateHavana(),rows);notifyVisualCalendarUpdated();
        return true;
      },
      selectDate:function(date){selectCalendarDate(date);},
      previewDraft:validateVisualDraft,
      createDraft:createVisualDraft,
      loadMovements:async function(sessionId){
        if(!sessionId)return [];
        return arr(await rpc('bc7_movimientos_sesion',{p_turno_sesion_id:sessionId}));
      },
      openSessionMovements:async function(sessionId){
        if(!sessionId)return false;
        const opened=await openWorkspace(sessionId);
        if(opened!==false)activateWorkspaceTab('movimientos');
        return opened;
      }
    }
  };
  if(typeof window.__BC7_VISUAL_PLANNER_ATTACH__==='function')window.__BC7_VISUAL_PLANNER_ATTACH__();
  document.addEventListener('change',function(e){
    if(!e.target||e.target.id!=='bc7-visual-warehouse')return;
    const id=String(e.target.value||'');
    if(!id||!warehouses().some(item=>String(item.id)===id))return;
    state.visualWarehouseId=id;
    const month=String($('bc7-calendar-month')?.value||dateHavana().slice(0,7)),rows=visualBoardRows();
    renderMonthCalendar(month,rows);renderCalendarDetail(state.calendarSelectedDate||dateHavana(),rows);notifyVisualCalendarUpdated();
  });
  document.addEventListener('click',function(e){
    const t=e.target&&e.target.closest?e.target.closest('button,.tab-btn[data-tab="jornada"]'):null;if(!t)return;
    if(t.id==='bc7-warehouse-retry'){e.preventDefault();ensureWarehouseCatalog();return;}
    if(t.matches&&t.matches('.tab-btn[data-tab="jornada"]')){setTimeout(()=>{ensureWarehouseCatalog();},0);}
  });
  async function openVisualCalendar(){
    const modal=$('bc7-visual-calendar-modal');
    const trigger=document.querySelector('[data-bc7-open-visual-calendar]');
    const supported=window.matchMedia&&window.matchMedia('(min-width:761px) and (hover:hover) and (pointer:fine)').matches;
    if(!modal||!supported)return;
    modal.hidden=false;document.body.classList.add('bc7-visual-calendar-open');
    if(trigger)trigger.setAttribute('aria-expanded','true');
    modal.querySelector('.bc7-visual-calendar-close')?.focus();
    await ensureWarehouseCatalog();renderVisualWarehouseSelector();await loadCalendar();notifyVisualCalendarUpdated();
  }
  function closeVisualCalendar(){
    const modal=$('bc7-visual-calendar-modal');if(!modal)return;
    modal.hidden=true;document.body.classList.remove('bc7-visual-calendar-open');
    const trigger=document.querySelector('[data-bc7-open-visual-calendar]');
    if(trigger){trigger.setAttribute('aria-expanded','false');trigger.focus();}
  }
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('bc7-visual-calendar-modal')?.hidden)closeVisualCalendar();});
  document.addEventListener('click',async function(e){
    const modeBtn=e.target&&e.target.closest?e.target.closest('[data-bc7-receive-mode]'):null;
    if(modeBtn){
      const form=modeBtn.closest('form[data-bc7-receive-form]');
      if(form){
        const attempt=getReceiveAttempt({id:form.dataset.bc7ReceiveDelivery||''});
        form.querySelectorAll('[data-bc7-receive-mode]').forEach(b=>{const on=b===modeBtn;b.setAttribute('aria-pressed',on?'true':'false');b.classList.toggle('primary',on);});
        attempt.mode=modeBtn.dataset.bc7ReceiveMode||'fast';
        form.querySelectorAll('[data-bc7-receive-pane]').forEach(p=>{p.hidden=p.getAttribute('data-bc7-receive-pane')!==attempt.mode;});
        if(attempt.mode==='diff')renderReceiveDiffPane(form);
        syncReceiveFormState(form);
      }
      return;
    }
    const addDiff=e.target&&e.target.closest?e.target.closest('[data-bc7-receive-add]'):null;
    if(addDiff){
      const form=addDiff.closest('form[data-bc7-receive-form]');
      if(form){
        const attempt=getReceiveAttempt({id:form.dataset.bc7ReceiveDelivery||''});
        attempt.marked[addDiff.dataset.bc7ReceiveAdd]=true;
        attempt.step='select';
        attempt.attestDiff=false;
        renderReceiveDiffPane(form);
        syncReceiveFormState(form);
      }
      return;
    }
    const removeDiff=e.target&&e.target.closest?e.target.closest('[data-bc7-receive-remove]'):null;
    if(removeDiff){
      const form=removeDiff.closest('form[data-bc7-receive-form]');
      if(form){
        const attempt=getReceiveAttempt({id:form.dataset.bc7ReceiveDelivery||''});
        delete attempt.marked[removeDiff.dataset.bc7ReceiveRemove];
        attempt.step='select';
        attempt.attestDiff=false;
        renderReceiveDiffPane(form);
        syncReceiveFormState(form);
      }
      return;
    }
    const continueDiff=e.target&&e.target.closest?e.target.closest('[data-bc7-receive-continue]'):null;
    if(continueDiff){
      const form=continueDiff.closest('form[data-bc7-receive-form]');
      if(form){
        const attempt=getReceiveAttempt({id:form.dataset.bc7ReceiveDelivery||''});
        const selected=Object.keys(attempt.marked).filter(id=>attempt.marked[id]);
        if(!selected.length)return;
        attempt.step='values';
        attempt.attestDiff=false;
        renderReceiveDiffPane(form);
        syncReceiveFormState(form);
      }
      return;
    }
    const backDiff=e.target&&e.target.closest?e.target.closest('[data-bc7-receive-back]'):null;
    if(backDiff){
      const form=backDiff.closest('form[data-bc7-receive-form]');
      if(form){
        const attempt=getReceiveAttempt({id:form.dataset.bc7ReceiveDelivery||''});
        attempt.step='select';
        attempt.attestDiff=false;
        renderReceiveDiffPane(form);
        syncReceiveFormState(form);
      }
      return;
    }
    const t=e.target&&e.target.closest?e.target.closest('button,[data-bc7-build]'):null;if(!t)return;
    if(t.hasAttribute('data-bc7-open-visual-calendar')){await openVisualCalendar();return;}
    if(t.hasAttribute('data-bc7-close-visual-calendar')){closeVisualCalendar();return;}
    if(t.hasAttribute('data-bc7-period-move')){try{await openPeriodMovePreview(t.getAttribute('data-bc7-period-move'));}catch(error){const detail=error&&!error.code&&error.message?error.message:friendlyError(error,'calendar');msg($('bc7-list-msg'),'No se pudo preparar el traslado. '+detail,'error');}return;}
    if(t.hasAttribute('data-bc7-period-cancel')){state.periodMoveDraft=null;renderCalendarDetail(state.calendarSelectedDate||dateHavana(),state.rows);return;}
        if(t.hasAttribute('data-bc7-calendar-select')){selectCalendarDate(t.getAttribute('data-bc7-calendar-select'));return;}
    if(t.hasAttribute('data-bc7-month-prev')){const input=$('bc7-calendar-month');if(input)input.value=shiftMonth(input.value,-1);state.calendarSelectedDate=null;await loadCalendar();return;}
    if(t.hasAttribute('data-bc7-month-next')){const input=$('bc7-calendar-month');if(input)input.value=shiftMonth(input.value,1);state.calendarSelectedDate=null;await loadCalendar();return;}
    if(t.hasAttribute('data-bc7-month-today')){const input=$('bc7-calendar-month');if(input)input.value=dateHavana().slice(0,7);state.calendarSelectedDate=dateHavana();await loadCalendar();return;}
    if(t.hasAttribute('data-bc7-open-planner')){closeVisualCalendar();const panel=$('bc7-admin-details');if(panel){panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'});$('bc7-start-date')?.focus();}return;}
    if(t.hasAttribute('data-bc7-adjustment-add')){const form=t.closest('[data-bc7-adjust-form]');if(form)addAdjustmentRow(form);return;}
    if(t.hasAttribute('data-bc7-adjustment-remove')){removeAdjustmentRow(t);return;}
    if(t.hasAttribute('data-bc7-current-open')){await openCurrentSession(false);return;}
    if(t.hasAttribute('data-bc7-current-finance')){await openCurrentSession(true);return;}
    if(t.hasAttribute('data-bc7-save-cash-day')){const day=t.closest('[data-bc7-cash-day-row]');const form=day&&day.closest('[data-bc7-close-form]');if(form&&day)await saveCashDaysWorkspace(form,{date:String(day.dataset.bc7CashDate||''),requireComplete:false,button:t});return;}
    if(t.hasAttribute('data-bc7-save-cash-days')){const form=t.closest('[data-bc7-close-form]');if(form)await saveCashDaysWorkspace(form,{requireComplete:false});return;}
    if(t.hasAttribute('data-bc7-save-cash')){const form=t.closest('form[data-bc7-close-form]');if(form)await saveCashDeclaration(form);return;}
    if(t.hasAttribute('data-bc7-build')){buildDayRows();return;}
    if(t.hasAttribute('data-bc7-refresh')){await loadCalendar({force:true});return;}
    if(t.hasAttribute('data-bc7-preview')){await previewPattern(t);return;}
    if(t.hasAttribute('data-bc7-create')){await createSchedule(t);return;}
    if(t.hasAttribute('data-bc7-retro-handover-open')){await openRetroSuccessorPanel(t);return;}
    if(t.hasAttribute('data-bc7-start-retro')){await startRetroSuccessor(t);return;}
    if(t.hasAttribute('data-bc7-open')){navTo('jornada');await openWorkspace(t.dataset.bc7Open);return;}
    if(t.hasAttribute('data-bc7-operational-close')){await closeOperationalSession(t);return;}
    if(t.hasAttribute('data-bc7-start')){await startSession(t);return;}
    if(t.hasAttribute('data-bc7-link-delivery')){await linkSharedDelivery(t);return;}
    if(t.hasAttribute('data-bc7-delivery-decision')){await resolveSharedDelivery(t);return;}
    if(t.hasAttribute('data-bc7-operation-retry')){if(state.detail)ensureWorkspaceOperationData(state.detail);return;}
    if(t.hasAttribute('data-bc7-mov-refresh')){if(state.detail)await loadMovements(state.detail);return;}
    if(t.hasAttribute('data-bc7-open-movements')){openMovements();return;}
  });
  document.addEventListener('submit',async function(e){
    const f=e.target;if(!(f instanceof HTMLFormElement))return;
    if(f.matches('[data-bc7-period-move-form]')){e.preventDefault();await confirmPeriodMove(f);}
    else if(f.id==='bc7-retro-successor-form'){e.preventDefault();await createRetroSuccessor(f);}
    else if(f.id==='bc7-hours-form'){e.preventDefault();await saveHours(f);}
    else if(f.id==='bc7-pattern-form'){e.preventDefault();await savePattern(f);}
    else if(f.matches('[data-bc7-reschedule]')){e.preventDefault();await reschedule(f);}
    else if(f.matches('[data-bc7-count-form]')){e.preventDefault();await saveCount(f);}
    else if(f.matches('[data-bc7-receive-form]')){e.preventDefault();await saveReceipt(f);}
    else if(f.matches('[data-bc7-legacy-initial-form]')){e.preventDefault();await saveLegacyInitial(f);}
    else if(f.matches('[data-bc7-close-form]')){e.preventDefault();await closeSession(f);}
    else if(f.matches('[data-bc7-adjust-form]')){e.preventDefault();await submitAdjustment(f);}
    else if(f.matches('[data-bc7-finance-form]')){e.preventDefault();await submitFinance(f);}
    else if(f.matches('[data-bc7-admin-cash-declaration]')){e.preventDefault();await saveAdminCashDeclaration(f);}
    else if(f.matches('[data-bc7-rectify-cash-declaration]')){e.preventDefault();await rectifyAdminCashDeclaration(f);}
  });
  document.addEventListener('change',function(e){
    const t=e.target;
    if(t&&t.matches('#bc7-warehouse,#bc7-start-date,#bc7-days-count,#bc7-period-responsible')){state.lastPreview=null;if($('bc7-preview'))$('bc7-preview').innerHTML='';if(t.matches('#bc7-start-date,#bc7-days-count'))buildDayRows();}
    if(t&&(t.matches('[data-bc7-receive-attest-fast]')||t.matches('[data-bc7-receive-attest-diff]'))){
      const f=t.closest('form[data-bc7-receive-form]'); if(f)syncReceiveFormState(f);
    }
    if(t&&t.matches('[data-bc7-period-start]')){syncPeriodMovePreview(t.closest('form'));return;}
    if(t&&t.matches('[data-bc7-ajust-type]'))syncAdjustmentRows(t.closest('[data-bc7-adjust-form]'));
    if(t&&t.matches('[data-bc7-ajust-product]'))validateAdjustmentRow(t.closest('[data-bc7-adjustment-row]'));
  });
  document.addEventListener('input',function(e){
    const t=e.target;
    if(t&&t.matches('#bc7-start-date,#bc7-days-count')){state.lastPreview=null;if($('bc7-preview'))$('bc7-preview').innerHTML='';buildDayRows();}
    if(t&&(t.matches('[data-bc7-receive-count]')||t.matches('[data-bc7-receive-search]')||t.matches('[data-bc7-receive-note]'))){
      const receiveForm=t.closest('form[data-bc7-receive-form]');
      if(receiveForm)syncReceiveFormState(receiveForm);
    }
    if(t&&t.matches('[data-bc7-period-reason]')){const form=t.closest('form');if(form)syncPeriodMovePreview(form);return;}
    const reinvestment=t&&t.closest&&t.closest('[data-bc7-finance-form="reinversion"]');
    if(reinvestment&&t.matches('[data-bc7-reinvestment-quantity],[data-bc7-reinvestment-unit-cost]'))updateReinvestmentEstimate(reinvestment);
    if(t&&t.matches('[data-bc7-ajust-qty]'))validateAdjustmentRow(t.closest('[data-bc7-adjustment-row]'));
  });
  document.addEventListener('dragstart',function(e){
    const chip=e.target&&e.target.closest?e.target.closest('[data-bc7-period-drag]'):null;
    if(!chip||!state.admin)return;
    const row=state.rows.find(item=>String(item.id)===String(chip.getAttribute('data-bc7-period-drag')));
    if(!row||!canOfferPeriodMove(row)){e.preventDefault();return;}
    state.periodMoveDrag=row;
    state.periodMoveDragRows=null;
    state.periodMoveDragRowsPromise=fetchMovablePeriod(row).then(period=>{
      state.periodMoveDragRows=period;
      if(state.periodMoveDragPreview){state.periodMoveDragPreview.days=period.days;renderPeriodMoveGhost();}
      return period;
    }).catch(error=>{state.periodMoveDragError=error;throw error;});
    state.periodMoveDragRowsPromise.catch(()=>{});
    if(e.dataTransfer){
      e.dataTransfer.effectAllowed='move';
      try{e.dataTransfer.setData('text/plain',String(row.id));}catch(_){}
    }
    chip.setAttribute('aria-grabbed','true');
  });
  document.addEventListener('dragover',function(e){
    const cell=e.target&&e.target.closest?e.target.closest('#bc7-month-board .bc7-month-day[data-date]'):null;
    if(!cell||!state.periodMoveDrag)return;
    e.preventDefault();
    if(e.dataTransfer)e.dataTransfer.dropEffect='move';
    const targetDate=cell.getAttribute('data-date');
    const source=state.periodMoveDrag;
    const period=state.periodMoveDragRows;
    const days=period?period.days:1;
    state.periodMoveDragPreview={start:addDays(targetDate,1-Number(source.numero_dia)),days,targetDate};
    renderPeriodMoveGhost();
  });
  document.addEventListener('drop',async function(e){
    const cell=e.target&&e.target.closest?e.target.closest('#bc7-month-board .bc7-month-day[data-date]'):null;
    if(!cell||!state.periodMoveDrag)return;
    e.preventDefault();
    const source=state.periodMoveDrag,target=cell.getAttribute('data-date'),promise=state.periodMoveDragRowsPromise;
    const button=document.querySelector('[data-bc7-period-drag="'+String(source.id).replace(/"/g,'\\"')+'"]');
    if(button)button.setAttribute('aria-grabbed','false');
    state.periodMoveDrag=null;state.periodMoveDragRowsPromise=null;state.periodMoveDragRows=null;state.periodMoveDragPreview=null;
    renderPeriodMoveGhost();
    try{await openPeriodMovePreview(source.id,target,promise);}
    catch(error){msg($('bc7-list-msg'),'No se pudo preparar el traslado completo. '+friendlyError(error,'calendar'),'error');}
  });
  document.addEventListener('dragend',function(e){
    const chip=e.target&&e.target.closest?e.target.closest('[data-bc7-period-drag]'):null;
    if(chip)chip.setAttribute('aria-grabbed','false');
    if(state.periodMoveDrag)clearPeriodMoveDrag();
  });
  let bootStarted=false;
  let authWaitTimer=null;
  function scheduleAuthenticatedBoot(){
    if(bootStarted||authWaitTimer!==null)return;
    ensureStyles();ensureDayRowsStyles();
    if(!ensureShell())return;
    setStatus('Validando la sesión y los permisos de tu cuenta…','');
    renderWorkerDashboardState('Validando tu sesión…','Estamos comprobando tu identidad y permisos antes de mostrar tus jornadas.');
    const deadline=Date.now()+30000;
    function check(){
      authWaitTimer=null;
      if(bootStarted)return;
      if(authenticatedContextReady()){
        bootStarted=true;
        ensureCalendarRealtimeSubscription();
        Promise.resolve().then(boot).then(function(ready){
          if(ready===false){
            bootStarted=false;
            check();
          }
        }).catch(function(error){
          bootStarted=false;
          state.calendarLoading=false;
          renderWorkerDashboardState('No se pudo iniciar Mis jornadas',friendlyError(error,'general'),'boot');
          setStatus('No se pudo iniciar Jornada e inventario. Puedes reintentar desde Mis jornadas.','error');
          console.warn('[BC7] No se pudo iniciar tras validar la sesión:',error);
        });
        return;
      }
      if(Date.now()>=deadline){
        renderWorkerDashboardState('No se pudo validar la sesión','Vuelve a intentar. No se consultaron ni modificaron datos.','boot');
        setStatus('La sesión todavía no se ha validado. Vuelve a entrar en BattleCruiser y pulsa Actualizar calendario.','error');
        return;
      }
      authWaitTimer=window.setTimeout(check,150);
    }
    check();
  }
  try{
    if(typeof client!=='undefined'&&client&&client.auth&&typeof client.auth.onAuthStateChange==='function'){
      client.auth.onAuthStateChange(function(event,session){
        if(event==='SIGNED_OUT'){
          stopCalendarRealtimeSubscription();
          state.calendarCache.clear();state.calendarPromises.clear();state.calendarRevision=(state.calendarRevision||0)+1;
          if(authWaitTimer!==null)window.clearTimeout(authWaitTimer);
          authWaitTimer=null;bootStarted=false;
          return;
        }
        if(session)window.setTimeout(scheduleAuthenticatedBoot,0);
      });
    }
  }catch(error){console.warn('[BC7] No se pudo enlazar el estado Auth:',error);}
  document.addEventListener('click',function(e){
    const refresh=e.target&&e.target.closest?e.target.closest('[data-bc7-refresh]'):null;
    if(refresh&&!bootStarted){
      e.preventDefault();e.stopImmediatePropagation();scheduleAuthenticatedBoot();
    }
  },true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleAuthenticatedBoot,{once:true});
  else scheduleAuthenticatedBoot();
})();