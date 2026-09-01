// BattleCruiser M59 — cierre de sesión moderna desde Ventas
// La sesión abierta por M33/M56 vive en turno_sesiones/turno_tramos.
// M27.3 legado intentaba cerrar sesiones_ciclo. Este módulo intercepta
// exclusivamente el botón dinámico de cierre y usa la operación atómica moderna.
// v59.2 — oculta el control de cierre al finalizar y sincroniza estado de Ventas.
(function(){
  'use strict';
  if(window.__BC_M59_CIERRE_MODERNO__) return;
  window.__BC_M59_CIERRE_MODERNO__=true;

  var busy=false;

  function online(){ return typeof navigator==='undefined' || navigator.onLine !== false; }
  function escapeText(v){ return String(v==null?'':v); }
  function setMsg(el,text,ok){
    if(!el) return;
    el.className='bc-m273-msg '+(ok?'ok':'err');
    el.textContent=text||'';
  }

  function getTurnoActual(){
    try{ if(typeof _turnoActual!=='undefined' && _turnoActual) return _turnoActual; }catch(e){}
    try{ if(window._turnoActual) return window._turnoActual; }catch(e2){}
    return null;
  }

  function getAmount(){
    var inp=document.getElementById('bc-m273-monto');
    if(!inp) return null;
    var raw=String(inp.value||'').trim().replace(/\s/g,'').replace(',','.');
    if(raw==='') return null;
    if(!/^\d+(\.\d+)?$/.test(raw)) return null;
    var n=Number(raw);
    if(!Number.isFinite(n) || n<0) return null;
    return n;
  }

  async function syncTurno(){
    try{
      if(window.__BC_M58 && typeof window.__BC_M58.sync==='function') return await window.__BC_M58.sync({refreshVentas:false});
      if(window.__BC_M25_refrescarTurno && typeof window.__BC_M25_refrescarTurno==='function') return await window.__BC_M25_refrescarTurno();
      if(typeof refrescarTurnoActual==='function') return await refrescarTurnoActual();
    }catch(e){}
    return null;
  }

  function hideCloseButton(){
    var b=document.getElementById('bc-m273-cerrar-sesion-btn');
    if(b) b.classList.add('hidden');
  }

  async function cerrarConOperacionAtomica(msgEl,btn){
    if(busy) return;
    if(!online()){ setMsg(msgEl,'Necesitas conexión para cerrar esta sesión.',false); return; }
    var t=getTurnoActual();
    if(!t || String(t.estado||'').toUpperCase()!=='ABIERTO'){
      await syncTurno();
      t=getTurnoActual();
    }
    var sesionId=t && (t.turno_sesion_id || t.sesion_id);
    if(!sesionId){ setMsg(msgEl,'No se encontró la sesión operativa moderna activa.',false); return; }
    var monto=getAmount();
    if(monto===null){
      setMsg(msgEl,'Ingresá un monto válido (número ≥ 0).',false);
      var inp=document.getElementById('bc-m273-monto');
      if(inp) inp.focus();
      return;
    }

    busy=true;
    if(btn) btn.disabled=true;
    setMsg(msgEl,'Registrando declaración y cerrando sesión…',true);
    try{
      if(typeof client==='undefined' || !client || typeof client.rpc!=='function') throw new Error('Cliente Supabase no disponible.');
      var r=await client.rpc('bc_declarar_y_cerrar_turno_sesion',{p_turno_sesion_id:sesionId,p_monto:monto});
      if(r && r.error) throw r.error;

      try{ _turnoActual=null; }catch(e1){}
      try{ window._turnoActual=null; }catch(e2){}
      hideCloseButton();
      try{ await syncTurno(); }catch(e3){}
      try{ if(typeof actualizarPanelAlmacenVenta==='function') actualizarPanelAlmacenVenta(); }catch(e4){}

      var backdrop=document.getElementById('bc-m273-modal-backdrop');
      var modal=document.getElementById('bc-m273-modal');
      if(backdrop && modal){
        modal.innerHTML='<h3>✓ Sesión cerrada</h3>'+
          '<p class="bc-m273-lead">La sesión moderna quedó cerrada en el servidor.</p>'+
          '<div class="bc-m273-okbox"><strong>Dinero declarado:</strong> $'+escapeText((typeof money==='function'?money(monto):Number(monto).toFixed(2)))+'</div>'+ 
          '<div class="bc-m273-actions"><button type="button" class="bc-m273-ok" id="bc-m273-done-m59">Entendido</button></div>';
        var done=document.getElementById('bc-m273-done-m59');
        if(done) done.onclick=function(){ backdrop.remove(); };
      }else{
        alert('✓ Sesión cerrada correctamente.');
      }
    }catch(e){
      setMsg(msgEl,'No se pudo cerrar: '+String((e&&(e.message||e.details||e.code))||e),false);
    }finally{
      busy=false;
      if(btn) btn.disabled=false;
    }
  }

  // Capture: evita que M27.3 ejecute el flujo legacy declarar_entrega_caja/cerrar_sesion_operativa.
  document.addEventListener('click',function(e){
    var btn=e.target && e.target.closest ? e.target.closest('#bc-m273-ok') : null;
    if(!btn) return;
    var msgEl=document.getElementById('bc-m273-msg');
    if(!msgEl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    cerrarConOperacionAtomica(msgEl,btn);
  },true);

  window.__BC_M59={cerrar:cerrarConOperacionAtomica};
})();
