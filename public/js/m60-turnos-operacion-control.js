// BattleCruiser M60 — Turnos: bloques, dinero declarado/aprobacion y cierre forzado
(function(){
  'use strict';
  if(window.__BC_M60__) return;
  window.__BC_M60__=true;

  var turnId=null, exp=null, loading=false, loadedTurnId=null, adminCache=null;
  var PHRASE='LaCuevaDeleteSesion';

  function esc(v){return typeof escHtml==='function'?escHtml(v==null?'':v):String(v==null?'':v).replace(/[&<>\"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'})[c]})}
  function moneyFmt(v){var n=Number(v);if(!isFinite(n))return '0.00';return typeof money==='function'?money(n):n.toFixed(2)}
  function usuarioId(){try{if(typeof _usuarioActual!=='undefined'&&_usuarioActual&&_usuarioActual.id)return _usuarioActual.id}catch(e){};return null}
  function normBloque(b){var x=String(b||'').toUpperCase().trim();return x==='MAÑANA'?'MANANA':x}
  function labelBloque(b){return normBloque(b)==='MANANA'?'Mañana':normBloque(b)==='TARDE'?'Tarde':String(b||'—')}
  function labelSesion(s){var e=String(s&&s.estado||'').toUpperCase();return e==='EN_CURSO'?'En curso':e==='COMPLETADA'?'Terminada':e==='CANCELADA'?'Cancelada':e==='PROGRAMADA'||e==='PENDIENTE'?'Sin comenzar':e||'—'}
  function labelAprob(s){var e=String(s&&s.dinero_estado_aprobacion||'SIN_DECLARACION').toUpperCase();return e==='APROBADA'?'Aprobada':e==='ESPERANDO_APROBACION'?'Esperando aprobación':e==='RECHAZADA'?'Rechazada':'Sin declaración'}
  function modal(){return document.getElementById('m33-bg')}
  function isAdmin(){
    if(adminCache!==null)return adminCache;
    try{var u=window.__bcUser||window._usuarioActual||null;var r=String(u&&(u.rol||u.role||u.nombre_rol)||'').toLowerCase();if(r==='admin'||r==='administrador'||r.indexOf('due')===0||(u&&u.is_admin===true)){adminCache=true;return true}}catch(e){}
    try{if(typeof tienePermiso==='function'&&(tienePermiso('turnos','editar_any')||tienePermiso('ciclos','editar_any'))){adminCache=true;return true}}catch(e2){}
    adminCache=false;return false;
  }
  async function resolveAdmin(){
    if(adminCache!==null)return adminCache;
    try{var r=await client.rpc('bc_actor_is_admin',{});var d=r&&r.data;if(d===true||(d&&d.is_admin===true)){adminCache=true;return true}}catch(e){}
    return isAdmin();
  }
  async function loadExp(force){
    if(!turnId||loading||typeof client==='undefined'||!client.rpc)return exp;
    if(!force&&exp&&loadedTurnId===turnId)return exp;
    loading=true;
    try{var r=await client.rpc('bc_obtener_expediente_turno',{p_turno_id:turnId});if(r&&r.error)throw r.error;exp=r&&r.data;loadedTurnId=turnId;return exp}catch(e){console.warn('[M60] expediente',e);return null}finally{loading=false}
  }
  function captureTurnId(e){var card=e.target&&e.target.closest?e.target.closest('.m29-card[data-turno-id]'):null;if(card){var id=card.getAttribute('data-turno-id');if(id!==turnId){turnId=id;exp=null;loadedTurnId=null;}setTimeout(function(){enrichModal(false)},30)}}
  function decorateStep2(body){
    var sels=[].slice.call(body.querySelectorAll('select[data-m33-sid]'));if(!sels.length||!exp)return;
    var byId={};(exp.sesiones||[]).forEach(function(s){byId[String(s.id)]=s});
    sels.forEach(function(sel){
      var s=byId[String(sel.getAttribute('data-m33-sid'))];if(!s)return;
      var card=sel.closest('.m33-session');if(!card)return;
      var b=normBloque(s.bloque);card.dataset.bcM60Bloque=b;card.dataset.bcM60SesionId=s.id;
      var label=card.querySelector('label');var desired='Día '+String(s.numero_dia||s.dia_n||'—')+' · '+labelBloque(s.bloque);if(label&&label.textContent!==desired)label.textContent=desired;
    });
    var grid=body.querySelector('.m49-session-grid');if(!grid)return;
    var cols=grid.querySelectorAll('.m49-session-col');if(cols.length<2)return;
    var left=cols[0],right=cols[1];
    [].slice.call(body.querySelectorAll('.m49-step2-card')).forEach(function(card){
      var b=normBloque(card.dataset.bcM60Bloque||'');var target=b==='TARDE'?right:left;
      if(target&&card.parentNode!==target)target.appendChild(card);
    });
  }
  function canApprove(s){
    if(!s||String(s.dinero_estado_aprobacion||'').toUpperCase()!=='ESPERANDO_APROBACION')return false;
    if(isAdmin())return true;
    if(normBloque(s.bloque)!=='MANANA'||!exp)return false;
    var me=usuarioId();if(!me)return false;
    return (exp.sesiones||[]).some(function(x){return normBloque(x.bloque)==='TARDE'&&Number(x.numero_dia||x.dia_n)===Number(s.numero_dia||s.dia_n)&&String(x.usuario_id||'')===String(me)});
  }
  async function approve(id,btn){
    if(!id)return;if(btn)btn.disabled=true;
    try{var r=await client.rpc('bc_aprobar_declaracion',{p_declaracion_id:id});if(r&&r.error)throw r.error;await loadExp(true);renderStep1();}
    catch(e){alert('No se pudo aprobar: '+String(e&&(e.message||e.details||e.code)||e));if(btn)btn.disabled=false}
  }
  async function forceClose(){
    if(!await resolveAdmin())return alert('Solo ADMIN puede forzar el cierre de un turno.');
    var typed=window.prompt('Para forzar el cierre del turno escribe exactamente: '+PHRASE);if(typed!==PHRASE)return;
    if(!turnId)return;
    try{var r=await client.rpc('bc_forzar_cierre_turno',{p_turno_id:turnId});if(r&&r.error)throw r.error;var bg=document.getElementById('m33-bg');if(bg)bg.remove();if(window.__BC_M29__&&typeof window.__BC_M29__.renderHome==='function')await window.__BC_M29__.renderHome();else if(typeof refrescarTurnos==='function')await refrescarTurnos();}
    catch(e){alert('No se pudo forzar el cierre: '+String(e&&(e.message||e.details||e.code)||e))}
  }
  function findSessionForRow(row){
    if(!exp||!Array.isArray(exp.sesiones))return null;
    var mt=String(row.textContent||'').match(/Día\s+(\d+)\s*·\s*([^·]+)/i);if(!mt)return null;
    var dia=Number(mt[1]),b=normBloque(mt[2]);
    return exp.sesiones.find(function(x){return Number(x.numero_dia||x.dia_n)===dia&&normBloque(x.bloque)===b})||null;
  }
  function renderStep1(){
    var m=modal();if(!m||!exp||!Array.isArray(exp.sesiones))return;
    var body=m.querySelector('.m33-body[data-m33-step="1"]')||[].slice.call(m.querySelectorAll('.m33-body')).find(function(b){return !b.querySelector('select[data-m33-sid]')});if(!body)return;
    var rows=[].slice.call(body.querySelectorAll('.m33-session'));if(!rows.length)return;
    rows.forEach(function(row){
      var s=findSessionForRow(row);if(!s){var mt=String(row.textContent||'').match(/Día\s+(\d+)/i);if(mt){var dia=Number(mt[1]);s=(exp.sesiones||[]).find(function(x){return Number(x.numero_dia||x.dia_n)===dia&&!row.dataset.bcM60Done})}}if(!s)return;
      row.dataset.bcM60Done=s.id;
      var old=row.querySelector('.bc-m60-details');
      var sig=s.id+'|'+String(s.estado)+'|'+String(s.dinero_id||'')+'|'+String(s.dinero_estado_aprobacion||'');
      if(old&&old.dataset.sig===sig)return;
      if(old)old.remove();
      var box=document.createElement('div');box.className='bc-m60-details';
      var moneyLine=s.dinero_declarado?('Dinero declarado: $'+moneyFmt(s.dinero_monto)+' · '+labelAprob(s)):'Dinero: sin declaración';
      box.innerHTML='<div>Sesión: <strong>'+esc(labelSesion(s))+'</strong></div><div>'+esc(moneyLine)+'</div>';box.dataset.sig=sig;
      if(canApprove(s)){var b=document.createElement('button');b.type='button';b.className='cc-accion bc-m60-approve';b.textContent='Aprobar dinero';b.dataset.declaracionId=s.dinero_id||'';box.appendChild(b)}
      row.appendChild(box);
    });
    if(!document.getElementById('bc-m60-force-close')&&isAdmin()&&String(exp.estado||'').toUpperCase()!=='CERRADO'){
      var wrap=document.createElement('div');wrap.id='bc-m60-force-close';wrap.style.cssText='margin-top:16px;padding:14px;border:1px solid rgba(180,40,40,.35);border-radius:10px';
      wrap.innerHTML='<strong>Administración</strong><div class="muted" style="margin:5px 0 10px">Cierra forzosamente el turno y termina las sesiones operativas restantes.</div>';
      var btn=document.createElement('button');btn.type='button';btn.className='cc-accion';btn.textContent='⚠️ Forzar cierre del turno';btn.addEventListener('click',forceClose);wrap.appendChild(btn);body.appendChild(wrap);
    }
  }
  function bindClicks(m){
    if(!m||m.dataset.bcM60Bound==='1')return;m.dataset.bcM60Bound='1';
    m.addEventListener('click',function(e){var a=e.target.closest('.bc-m60-approve');if(!a)return;e.preventDefault();e.stopPropagation();approve(a.dataset.declaracionId,a);});
  }
  async function enrichModal(force){
    var m=modal();if(!m||!turnId)return;bindClicks(m);await resolveAdmin();var data=await loadExp(!!force);if(!data)return;renderStep1();var body=m.querySelector('.m33-body[data-m33-step="2"]')||[].slice.call(m.querySelectorAll('.m33-body')).find(function(b){return b.querySelector('select[data-m33-sid]')});if(body)decorateStep2(body);
  }
  document.addEventListener('click',captureTurnId,true);
  var obs=new MutationObserver(function(){var m=modal();if(m&&turnId&&!loading){clearTimeout(obs._t);obs._t=setTimeout(function(){enrichModal(false)},80)}});obs.observe(document.body,{childList:true,subtree:true});
  window.__BC_M60={refresh:function(){return enrichModal(true)}};
})();