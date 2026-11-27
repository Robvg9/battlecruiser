(function(){
  'use strict';
  const CC_URL='https://zqgmjwfvluboiporytcq.supabase.co';
  const CC_KEY='sb_publishable_fyqk_L78-Kv--pmzbIsqPw_iWFjVLug';
  const EDGE=CC_URL+'/functions/v1/bc-payroll-bridge';
  let loading=false,autoProcessing=false,lastHost=null;
  const esc=value=>typeof escHtml==='function'?escHtml(value):String(value??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const money=value=>typeof window.money==='function'?window.money(value):Number(value||0).toFixed(2);
  function api(){return window.client||(typeof client!=='undefined'?client:null);}
  async function rpc(name,args){
    const supa=api();if(!supa)throw new Error('BattleCruiser no está conectado.');
    const result=await supa.rpc(name,args||{});if(result.error)throw result.error;return result.data;
  }
  async function invoke(payload){
    const supa=api();if(!supa?.auth?.getSession)throw new Error('No hay sesión activa en BattleCruiser.');
    const sessionResult=await supa.auth.getSession();
    const token=sessionResult?.data?.session?.access_token;
    if(!token)throw new Error('Inicia sesión como Dueño para operar nómina.');
    const response=await fetch(EDGE,{method:'POST',headers:{apikey:CC_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
    let data={};try{data=await response.json();}catch(_){}
    if(!response.ok||data.ok===false)throw new Error(data.error||'La operación segura de nómina no fue confirmada.');
    return data;
  }
  async function loadAdminData(){
    const calls=await Promise.allSettled([
      rpc('bc7_payroll_list_employees'),
      rpc('bc7_payroll_list_salaries'),
      rpc('bc7_payroll_list_pending_withdrawals'),
      rpc('bc7_payroll_get_settings'),
      invoke({action:'list_dependents'})
    ]);
    const names=['empleados','salarios','retiros','configuracion','dependientes'];
    const data={empleados:[],salarios:[],retiros:[],configuracion:{modo_pago:'MANUAL'},dependientes:[]};
    const errors=[];
    calls.forEach((item,index)=>{
      if(item.status==='rejected'){errors.push(names[index]+': '+String(item.reason?.message||item.reason));return;}
      const value=item.value;
      if(names[index]==='dependientes')data.dependientes=Array.isArray(value.dependents)?value.dependents:[];
      else if(names[index]==='configuracion')data.configuracion=value||data.configuracion;
      else data[names[index]]=Array.isArray(value)?value:[];
    });
    data.errors=errors;return data;
  }
  function salaryCard(item,mode){
    const status=String(item.estado||'').toUpperCase();
    const stateLabel=status==='RETENIDO'?'Retenido · espera validación de la jornada sucesora':
      status==='LISTO_PARA_PAGO'?'Validado por la jornada sucesora · listo para pago':
      status==='PROCESANDO'?'Pago en conciliación':
      status==='PAGADO'?'Pagado en CuevaCoin':
      status==='REVISION_MANUAL'?'Revisión manual requerida':status;
    const rates=Array.isArray(item.porcentaje_resumen)?item.porcentaje_resumen:[];
    const rateText=rates.map(x=>(x.porcentaje??'—')+'%').filter(Boolean).join(' / ')||'—';
    const successor=item.sucesor_turno_id
      ?'Validó: '+(item.sucesor_empleado||'Otra dependienta')+' · '+(item.sucesor_almacen||item.almacen_nombre||'Almacén')+' · '+(item.sucesor_fecha||'Jornada sucesora')
      :'Aún no existe una entrega física aceptada al siguiente turno.';
    const canPay=mode!=='AUTOMATICO'&&status==='LISTO_PARA_PAGO'&&item.cc_vinculado===true&&Number(item.salario_neto)>0;
    const btn=canPay?'<button type="button" class="cc-accion" data-bcpay-credit="'+esc(item.id)+'">Aprobar y pagar salario</button>':'';
    const mappingNote=item.cc_vinculado?'Cuenta CuevaCoin vinculada':'Falta confirmar el vínculo con CuevaCoin.';
    const problem=status==='REVISION_MANUAL'?'<p class="muted">No se habilita el pago automático cuando el cálculo no es válido o los descuentos superan el salario bruto.</p>':'';
    return '<article class="rep-fila bc-payroll-salary"><div class="rep-fila-principal">'+
      '<strong>'+esc(item.empleado_nombre||'Dependienta')+' · '+esc(item.fecha_inicio||'—')+' a '+esc(item.fecha_fin||'—')+'</strong>'+
      '<span class="muted">'+esc(item.almacen_nombre||'Almacén')+' · '+esc(stateLabel)+'</span>'+
      '<span class="muted">Ventas '+money(item.ventas_total)+' CUP · Porcentaje '+esc(rateText)+'</span>'+
      '<span class="muted">Salario bruto '+money(item.salario_bruto)+' · Descuentos aprobados '+money(item.descuentos_aprobados)+' · Neto '+(item.salario_neto==null?'Revisión':money(item.salario_neto))+' CUP</span>'+
      '<span class="muted">'+esc(successor)+'</span><span class="muted">'+esc(mappingNote)+'</span>'+
      (item.ultimo_error?'<span class="muted">Último intento: '+esc(item.ultimo_error)+'</span>':'')+problem+'</div>'+
      (btn?'<div class="btn-row">'+btn+'</div>':'')+'</article>';
  }
  function withdrawalCard(item){
    return '<article class="rep-fila bc-payroll-withdrawal"><div class="rep-fila-principal">'+
      '<strong>Retiro de salario · '+esc(item.beneficiario_nombre||'Dependienta')+'</strong>'+
      '<span class="muted">'+esc(item.almacen_nombre||'Almacén')+' · '+esc(item.concepto||'Retiro de salario acumulado')+'</span>'+
      '<span class="muted">'+money(item.monto)+' CUP · '+esc(item.estado||'PENDIENTE')+'</span>'+
      (item.descripcion?'<span class="muted">'+esc(item.descripcion)+'</span>':'')+
      (item.cuevacoin_pago_error?'<span class="muted">Revisión: '+esc(item.cuevacoin_pago_error)+'</span>':'')+
      '</div><div class="btn-row"><button type="button" class="cc-accion" data-bcpay-withdraw="'+esc(item.id)+'">Confirmar débito y aprobar gasto</button>'+
      '<button type="button" class="cc-accion" data-bcpay-reject="'+esc(item.id)+'">Rechazar gasto</button></div></article>';
  }
  function adminHtml(data){
    const dependents=data.dependientes||[];
    const employeeRows=(data.empleados||[]).map(employee=>{
      const options='<option value="">Seleccionar cuenta activa de CuevaCoin</option>'+dependents.map(profile=>
        '<option value="'+esc(profile.id)+'" '+(String(profile.id)===String(employee.cc_perfil_id)?'selected':'')+'>'+
        esc(profile.nombre||profile.usuario||'Cuenta dependiente')+' · '+esc(profile.usuario||'')+'</option>'
      ).join('');
      return '<article class="rep-fila"><div class="rep-fila-principal"><strong>'+esc(employee.nombre)+'</strong>'+
        '<span class="muted">'+(employee.vinculado?'Cuenta CuevaCoin confirmada':'Sin vínculo confirmado')+'</span></div>'+
        '<div class="btn-row"><select aria-label="Cuenta CuevaCoin para '+esc(employee.nombre)+'" data-bcpay-map-select="'+esc(employee.bc_usuario_id)+'">'+options+'</select>'+
        '<button type="button" class="cc-accion" data-bcpay-map-save="'+esc(employee.bc_usuario_id)+'">Confirmar vínculo</button></div></article>';
    }).join('');
    const mappings='<details class="bc-payroll-mappings"><summary>Vincular cuentas de nómina · confirmación manual</summary>'+
      '<p class="muted">Cada vínculo debe confirmarlo el Dueño. Solo aparecen perfiles activos marcados como dependientes en CuevaCoin; no se vincula por nombre automáticamente.</p>'+
      (dependents.length?'':'<p class="lista-estado">No hay cuentas dependientes activas disponibles en CuevaCoin.</p>')+
      (employeeRows||'<p class="lista-estado">No hay dependientas activas en BattleCruiser.</p>')+'</details>';
    const mode=String(data.configuracion?.modo_pago||'MANUAL').toUpperCase();
    const salaries=(data.salarios||[]).map(item=>salaryCard(item,mode)).join('')||'<p class="lista-estado">Todavía no hay liquidaciones salariales congeladas.</p>';
    const withdrawals=(data.retiros||[]).map(withdrawalCard).join('')||'<p class="lista-estado">No hay retiros de salario pendientes.</p>';
    const errorText=(data.errors||[]).map(x=>'<p class="lista-estado">No se pudo consultar '+esc(x)+'</p>').join('');
    return '<section class="bc-bloque bc-payroll-admin"><h3>💰 Nómina · BattleCruiser ↔ CuevaCoin</h3>'+
      '<p class="muted">El salario se congela al aprobar el turno. La jornada sucesora debe cerrar con recepción física aceptada antes de liberar el pago.</p>'+
      '<div class="bc-payroll-settings"><label class="field"><span>Modo de acreditación de salarios</span><select data-bcpay-mode>'+
        '<option value="MANUAL" '+(mode==='MANUAL'?'selected':'')+'>Manual · cada pago requiere aprobación</option>'+
        '<option value="AUTOMATICO" '+(mode==='AUTOMATICO'?'selected':'')+'>Automático · pagar al validarse la sucesión</option></select></label>'+
        '<button type="button" class="cc-accion" data-bcpay-mode-save>Guardar modalidad</button>'+
        '<p class="muted">Configuración actual: '+(mode==='MANUAL'?'Manual':'Automático')+'. El sistema comienza en Manual.</p></div>'+
      mappings+
      '<h4>Salarios retenidos y pagos</h4>'+salaries+
      '<h4>Retiros de salario pendientes</h4>'+withdrawals+
      errorText+'<p class="muted" data-bcpay-status role="status" aria-live="polite"></p></section>';
  }
  async function refreshAdmin(target){
    const data=await loadAdminData();target.innerHTML=adminHtml(data);
    if(data.errors.length)target.dataset.hasErrors='true';else delete target.dataset.hasErrors;
    const mode=String(data.configuracion?.modo_pago||'MANUAL').toUpperCase();
    if(mode==='AUTOMATICO'&&!autoProcessing&&navigator.onLine){
      autoProcessing=true;
      try{const processed=await invoke({action:'process_automatic'});if(processed.processed>0){const updated=await loadAdminData();target.innerHTML=adminHtml(updated);}}
      catch(error){const status=target.querySelector('[data-bcpay-status]');if(status)status.textContent='Automático pendiente de conciliación: '+(error.message||error);}
      finally{autoProcessing=false;}
    }
  }
  function ensureAdminModal(){
    let modal=document.getElementById('bc-payroll-admin-modal');
    if(modal)return modal;
    if(!document.getElementById('bc-payroll-admin-modal-style')){
      const style=document.createElement('style');
      style.id='bc-payroll-admin-modal-style';
      style.textContent=
        'body.bc-payroll-admin-modal-open{overflow:hidden}' +
        '#bc-payroll-admin-modal[hidden]{display:none!important}' +
        '#bc-payroll-admin-modal{position:fixed;inset:0;z-index:10070;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(3,10,8,.78);box-sizing:border-box}' +
        '#bc-payroll-admin-modal .bc-payroll-admin-surface{position:relative;display:flex;flex-direction:column;width:min(980px,100%);max-height:min(94vh,900px);overflow:hidden;border:1px solid rgba(212,176,92,.32);border-radius:14px;background:var(--stone,#122a24);box-shadow:0 24px 72px rgba(0,0,0,.62);color:var(--text)}' +
        '#bc-payroll-admin-modal .bc-payroll-admin-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(212,176,92,.18);flex:0 0 auto}' +
        '#bc-payroll-admin-modal .bc-payroll-admin-head h2{margin:0;font-family:Cormorant Garamond,serif;font-size:1.35rem;color:var(--gold-bright,var(--gold))}' +
        '#bc-payroll-admin-modal .bc-payroll-admin-close{width:36px;height:36px;border:1px solid var(--gold-dim);border-radius:8px;background:transparent;color:var(--text);font-size:20px;cursor:pointer}' +
        '#bc-payroll-admin-modal .bc-payroll-admin-modal-content{min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 16px 18px}' +
        '#bc-payroll-admin-modal .bc-payroll-admin-modal-content>#bc-payroll-admin-host{max-width:100%}' +
        '#bc-payroll-admin-modal .bc-payroll-admin-modal-content .bc-payroll-admin{margin:0!important}' +
        '@media(max-width:560px){#bc-payroll-admin-modal{padding:6px}#bc-payroll-admin-modal .bc-payroll-admin-surface{max-height:96vh;border-radius:11px}#bc-payroll-admin-modal .bc-payroll-admin-head{padding:10px 12px}#bc-payroll-admin-modal .bc-payroll-admin-modal-content{padding:9px 10px 14px}}';
      document.head.appendChild(style);
    }
    modal=document.createElement('div');
    modal.id='bc-payroll-admin-modal';
    modal.hidden=true;
    modal.innerHTML=
      '<section class="bc-payroll-admin-surface" role="dialog" aria-modal="true" aria-labelledby="bc-payroll-admin-modal-title" tabindex="-1">' +
        '<header class="bc-payroll-admin-head"><h2 id="bc-payroll-admin-modal-title">💰 Nómina · BattleCruiser ↔ CuevaCoin</h2>' +
        '<button type="button" class="bc-payroll-admin-close" data-bcpay-admin-close aria-label="Cerrar nómina" title="Cerrar">×</button></header>' +
        '<div class="bc-payroll-admin-modal-content"><div id="bc-payroll-admin-host"></div></div>' +
      '</section>';
    modal.addEventListener('click',event=>{
      if(event.target===modal||event.target.closest?.('[data-bcpay-admin-close]'))closeAdminModal();
    });
    document.body.appendChild(modal);
    return modal;
  }
  function closeAdminModal(){
    const modal=document.getElementById('bc-payroll-admin-modal');
    if(!modal||modal.hidden)return;
    modal.hidden=true;
    document.body.classList.remove('bc-payroll-admin-modal-open');
    const trigger=modal._trigger;
    if(trigger&&trigger.isConnected)trigger.focus();
  }
  async function openAdminModal(trigger){
    const modal=ensureAdminModal();
    modal._trigger=trigger||null;
    modal.hidden=false;
    document.body.classList.add('bc-payroll-admin-modal-open');
    const surface=modal.querySelector('.bc-payroll-admin-surface');
    if(surface)surface.focus();
    const host=modal.querySelector('.bc-payroll-admin-modal-content');
    await mountAdminPanel(host);
    return true;
  }
  async function mountAdminPanel(panel){
    if(!panel)return;
    let target=panel.querySelector('#bc-payroll-admin-host');
    if(!target){target=document.createElement('div');target.id='bc-payroll-admin-host';panel.insertBefore(target,panel.firstChild);}
    if(loading)return;loading=true;lastHost=target;
    try{await refreshAdmin(target);}catch(error){target.innerHTML='<section id="bc-payroll-admin" class="bc-bloque"><h3>💰 Nómina</h3><p class="lista-estado">No se pudo verificar la nómina: '+esc(error.message||error)+'</p></section>';}
    finally{loading=false;}
  }
  async function processAutomatic(){
    if(autoProcessing)return {ok:true,skipped:true};
    autoProcessing=true;
    try{return await invoke({action:'process_automatic'});}
    finally{autoProcessing=false;}
  }
  async function click(event){
    const closeButton=event.target.closest?.('[data-bcpay-admin-close]');
    if(closeButton){closeAdminModal();return;}
    const openButton=event.target.closest?.('[data-bcpay-open-admin]');
    if(openButton){
      event.preventDefault();
      if(openButton.disabled)return;
      openButton.disabled=true;
      try{await openAdminModal(openButton);}
      catch(error){alert('No se pudo abrir Nómina: '+(error.message||error));}
      finally{openButton.disabled=false;}
      return;
    }
    const button=event.target.closest?.('[data-bcpay-credit],[data-bcpay-withdraw],[data-bcpay-reject],[data-bcpay-map-save],[data-bcpay-mode-save]');
    if(!button)return;
    const target=button.closest('#bc-payroll-admin-host')||lastHost||document.getElementById('bc-payroll-admin-host');
    const status=target?.querySelector('[data-bcpay-status]');
    button.disabled=true;
    try{
      if(button.hasAttribute('data-bcpay-map-save')){
        const bcId=button.dataset.bcpayMapSave;
        const select=target.querySelector('[data-bcpay-map-select="'+bcId+'"]');
        if(!select?.value)throw new Error('Selecciona una cuenta dependiente activa de CuevaCoin.');
        if(!confirm('¿Confirmas que esta cuenta CuevaCoin pertenece a '+(select.closest('article')?.querySelector('strong')?.textContent||'esta persona')+'?'))return;
        await invoke({action:'save_mapping',bc_usuario_id:bcId,cc_perfil_id:select.value});
        if(status)status.textContent='Vínculo de nómina guardado por el Dueño.';
      }else if(button.hasAttribute('data-bcpay-mode-save')){
        const select=target.querySelector('[data-bcpay-mode]');
        const mode=select?.value||'MANUAL';
        if(mode==='AUTOMATICO'&&!confirm('La nómina se acreditará automáticamente cuando el siguiente turno del mismo almacén sea aprobado y la entrega física quede aceptada. ¿Activar modo automático?'))return;
        await invoke({action:'set_mode',mode});
        if(status)status.textContent='Modalidad guardada: '+(mode==='MANUAL'?'Manual':'Automática')+'.';
      }else if(button.hasAttribute('data-bcpay-credit')){
        if(!confirm('¿Acreditar este salario en la cuenta CuevaCoin vinculada?'))return;
        await invoke({action:'credit_salary',salary_id:button.dataset.bcpayCredit});
        if(status)status.textContent='Salario acreditado en CuevaCoin y conciliado con BattleCruiser.';
      }else if(button.hasAttribute('data-bcpay-withdraw')){
        if(!confirm('Confirma que el efectivo fue entregado a la dependienta. Se descontará el mismo importe de su saldo acumulado en CuevaCoin.'))return;
        await invoke({action:'withdraw_salary',expense_id:button.dataset.bcpayWithdraw});
        if(status)status.textContent='Gasto aprobado y débito salarial confirmado en CuevaCoin.';
      }else if(button.hasAttribute('data-bcpay-reject')){
        const reason=prompt('Motivo obligatorio del rechazo:');
        if(!reason||!reason.trim())return;
        await rpc('resolver_aprobacion_operativa',{p_tipo:'gasto',p_id:button.dataset.bcpayReject,p_decision:'RECHAZAR',p_comentario:reason.trim(),p_cantidad_real:null,p_monto_real:null});
        if(status)status.textContent='Retiro rechazado; el saldo CuevaCoin no fue modificado.';
      }
      if(target)await refreshAdmin(target);
      if(typeof window.refrescarAprobacionesAdmin==='function')await window.refrescarAprobacionesAdmin();
    }catch(error){if(status)status.textContent='No se completó la operación: '+(error.message||error);else alert(error.message||error);}
    finally{button.disabled=false;}
  }
  document.addEventListener('change',async function(event){
    const category=event.target.closest?.('[data-bc7-expense-category]');
    if(!category)return;
    const form=category.closest('form');
    const wrap=form?.querySelector('[data-bc7-expense-beneficiary-wrap]');
    const select=form?.querySelector('[data-bc7-expense-beneficiary]');
    const help=form?.querySelector('[data-bc7-expense-type-help]');
    const concept=form?.querySelector('[data-bc7-expense-concept]');
    const value=category.value;
    if(wrap)wrap.hidden=value!=='SALARIOS';
    if(select){select.disabled=value!=='SALARIOS';select.required=value==='SALARIOS';}
    if(value==='SALARIOS'){
      if(help)help.textContent='El Dueño aprobará la entrega y el mismo importe se descontará del saldo salarial de CuevaCoin.';
      if(concept&&!concept.value)concept.value='Retiro de salario acumulado';
      if(select){
        select.innerHTML='<option value="">Cargando dependientas vinculadas…</option>';
        try{
          const people=await rpc('bc7_payroll_list_mapped_employees');
          select.innerHTML='<option value="">Selecciona una dependienta</option>'+
            (Array.isArray(people)?people:[]).map(person=>'<option value="'+esc(person.bc_usuario_id)+'">'+esc(person.nombre)+'</option>').join('');
          if(!people?.length){
            select.innerHTML='<option value="">No hay cuentas vinculadas</option>';
            if(help)help.textContent='El Dueño debe confirmar primero el vínculo de esta persona con CuevaCoin en Administración → Nómina.';
          }
        }catch(error){
          select.innerHTML='<option value="">No se pudieron consultar las cuentas</option>';
          if(help)help.textContent='No se pudo cargar la lista: '+(error.message||error);
        }
      }
    }else if(value==='UTILES_DE_LA_CAFETERIA'){
      if(help)help.textContent='Compra de escoba, detergente, agua, trapeador y otros útiles. Es un gasto normal y no modifica CuevaCoin.';
      if(concept)concept.placeholder='Ej. Escoba, detergente, agua o trapeador';
      if(select){select.value='';select.innerHTML='<option value="">No requiere beneficiario</option>';}
    }else{
      if(help)help.textContent='Gasto ordinario de la Jornada. No modifica CuevaCoin.';
      if(concept)concept.placeholder='Motivo del gasto';
      if(select){select.value='';select.innerHTML='<option value="">No requiere beneficiario</option>';}
    }
  });
  document.addEventListener('click',click);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAdminModal();});
  window.BCPayrollBridge={invoke,rpc,mountAdminPanel,openAdminModal,closeAdminModal,processAutomatic,refresh:()=>lastHost?refreshAdmin(lastHost):Promise.resolve()};
})();