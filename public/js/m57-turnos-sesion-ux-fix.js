// BattleCruiser — M57.6 · guard canónico de secuencia y sesiones atrasadas
// Solo la sesión elegible queda clickeable. El guard bloquea intentos directos.
// Fecha operativa = America/Puerto_Rico (misma fuente que backend y M62).
// Tras apertura confirmada por M33: refresca turno_actual_usuario y entra a Ventas.
(function () {
  'use strict';
  if (window.__bcM57TurnosSessionUx) return;
  window.__bcM57TurnosSessionUx = true;

  var observer = null;
  var timer = null;
  var busy = false;
  var rendering = false;
  var selectedTurnoId = null;
  var ZONA = 'America/Puerto_Rico';

  function norm(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function strip(v) { return norm(v).replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E').replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖ]/g,'O').replace(/[ÚÙÛÜ]/g,'U').replace(/Ñ/g,'N'); }
  function terminal(st) { st=strip(st); return st==='COMPLETADA'||st==='CANCELADA'||st==='CANCELLED'||st==='ANULADA'; }
  function order(s) { var d=Number(s.numero_dia!=null?s.numero_dia:s.dia_n)||999999; var b=strip(s.bloque)==='MANANA'?1:2; return [d,b]; }
  function before(a,b) { var x=order(a),y=order(b); return x[0]<y[0] || (x[0]===y[0]&&x[1]<y[1]); }
  // Fuente única de fecha operativa del negocio (NO device local timezone).
  function today() {
    try {
      if (window.__BC_M62 && typeof window.__BC_M62.hoyNegocio === 'function') return window.__BC_M62.hoyNegocio();
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      var y = p.find(function (x) { return x.type === 'year'; }).value;
      var m = p.find(function (x) { return x.type === 'month'; }).value;
      var d = p.find(function (x) { return x.type === 'day'; }).value;
      return y + '-' + m + '-' + d;
    } catch (e) {
      var d2 = new Date();
      return d2.getUTCFullYear() + '-' + String(d2.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d2.getUTCDate()).padStart(2, '0');
    }
  }
  function api() { return window.BattleCruiserTurnoAPI||null; }
  function turnoId() {
    if (selectedTurnoId) return selectedTurnoId;
    var card = document.querySelector('.m29-card[data-turno-id]');
    return card ? card.getAttribute('data-turno-id') : null;
  }

  async function loadRows() {
    var a=api(),id=turnoId(); if(!a||!id||typeof a.listarSesionesTurno!=='function') return [];
    try {
      var r=await a.listarSesionesTurno(id);
      if(Array.isArray(r)) return r;
      if(r&&Array.isArray(r.sesiones)) return r.sesiones;
      if(r&&Array.isArray(r.items)) return r.items;
    } catch(e) { try{console.warn('[M57.5] sesiones',e);}catch(x){} }
    return [];
  }
  function eligibleId(rows) {
    var all=rows.slice().filter(Boolean).sort(function(a,b){var x=order(a),y=order(b);return x[0]-y[0]||x[1]-y[1];}),h=today();
    for(var i=0;i<all.length;i++) {
      var cur=all[i],st=strip(cur.estado);
      var sessionDate=String(cur.fecha||'').slice(0,10);
      if(terminal(st)||st==='EN_CURSO'||!sessionDate||sessionDate>h) continue;
      var blocked=false;
      for(var j=0;j<all.length;j++) if(before(all[j],cur)&&!terminal(all[j].estado)){blocked=true;break;}
      if(!blocked) return String(cur.id);
    }
    return null;
  }
  function css() {
    if(document.getElementById('bc-m57-css')) return;
    var s=document.createElement('style'); s.id='bc-m57-css';
    s.textContent='.m57-locked{opacity:.45!important;filter:saturate(.3)!important;cursor:not-allowed!important;pointer-events:auto!important}.m57-lock-icon{margin-right:6px}';
    document.head.appendChild(s);
  }
  function render(rows) {
    var modal=document.querySelector('#m33-bg .m33-modal'); if(!modal)return;
    var buttons=Array.prototype.slice.call(modal.querySelectorAll('[data-m33-abrir-sesion]')); if(!buttons.length)return;
    css(); var ok=eligibleId(rows);
    buttons.forEach(function(btn){
      var canOpen=!!ok&&String(btn.getAttribute('data-m33-abrir-sesion'))===ok;
      if(canOpen){
        if(btn.disabled||btn.classList.contains('m57-locked')||btn.classList.contains('m56-lock')||btn.textContent.indexOf('Abrir sesión')===-1||btn.textContent.indexOf('🔒')>=0){
          btn.disabled=false;btn.classList.remove('m57-locked','m56-lock');btn.removeAttribute('aria-disabled');btn.removeAttribute('title');btn.textContent='Abrir sesión';
        }
      }else{
        var desired='🔒 Abrir sesión';
        if(!btn.disabled||!btn.classList.contains('m57-locked')||btn.textContent.trim()!==desired){
          btn.disabled=true;btn.classList.add('m57-locked');btn.setAttribute('aria-disabled','true');btn.setAttribute('title','Esta sesión está bloqueada por la secuencia o por su fecha programada.');btn.innerHTML='<span class="m57-lock-icon">🔒</span> Abrir sesión';
        }
      }
    });
  }
  function runRender(){
    if(rendering)return;
    rendering=true;
    loadRows().then(function(rows){render(rows);successCheck();}).catch(function(){}).finally(function(){rendering=false;});
  }
  async function refreshAndGoVentas(){
    if(busy)return;
    busy=true;window.__BC_SESSION_OPEN_REDIRECTING__=true;
    try{
      if(typeof window.bcRefrescarTurnoYPanelVenta==='function')await window.bcRefrescarTurnoYPanelVenta();
      else if(typeof window.__BC_M25_refrescarTurno==='function')await window.__BC_M25_refrescarTurno();
      else if(typeof refrescarTurnoActual==='function')await refrescarTurnoActual();
    }catch(e){}
    var bg=document.getElementById('m33-bg');if(bg)bg.remove();
    setTimeout(function(){
      try{if(typeof irATab==='function')irATab('ventas');else{var b=document.querySelector('.tab-btn[data-tab="ventas"]');if(b)b.click();}}catch(e2){}
      setTimeout(function(){
        try{if(typeof window.bcRefrescarTurnoYPanelVenta==='function')window.bcRefrescarTurnoYPanelVenta();else if(typeof actualizarPanelAlmacenVenta==='function')actualizarPanelAlmacenVenta();}catch(e3){}
        setTimeout(function(){window.__BC_SESSION_OPEN_REDIRECTING__=false;busy=false;},800);
      },180);
    },40);
  }
  function successCheck(){
    if(window.__BC_SESSION_OPEN_REDIRECTING__)return;
    var msg=document.getElementById('m33-dep-msg');
    if(msg&&strip(msg.textContent).indexOf('SESION ABIERTA')>=0)refreshAndGoVentas();
  }
  function schedule(){
    if(timer)clearTimeout(timer);
    timer=setTimeout(function(){timer=null;runRender();},90);
  }
  function mutationRelevante(m){
    var bg=document.getElementById('m33-bg');
    if(!bg)return false;
    var t=m.target;
    if(t&&t.nodeType===1&&t.closest&&t.closest('#m33-bg'))return true;
    if(t&&t.parentElement&&t.parentElement.closest&&t.parentElement.closest('#m33-bg'))return true;
    for(var i=0;i<(m.addedNodes||[]).length;i++){
      var n=m.addedNodes[i];
      if(n.nodeType!==1)continue;
      if(n.id==='m33-bg'||(n.querySelector&&n.querySelector('#m33-bg'))||(n.closest&&n.closest('#m33-bg')))return true;
    }
    return false;
  }
  function bind(){
    document.addEventListener('click',function(e){
      var card=e.target&&e.target.closest?e.target.closest('.m29-card[data-turno-id]'):null;
      if(card) selectedTurnoId = card.getAttribute('data-turno-id') || null;

      var btn=e.target&&e.target.closest?e.target.closest('[data-m33-abrir-sesion]'):null;if(!btn)return;
      // Si M62 ya liberó el botón, no interceptar el click.
      if(btn.classList.contains('m62-eligible') && !btn.disabled) return;
      if(btn.disabled||btn.getAttribute('aria-disabled')==='true'||btn.classList.contains('m57-locked')){
        e.preventDefault();e.stopImmediatePropagation();
        var msg=document.getElementById('m33-dep-msg');if(msg)msg.textContent='🔒 Esta sesión todavía no se puede abrir. Completá primero la sesión anterior y respetá la fecha programada.';
      }
    },true);
    observer=new MutationObserver(function(mutations){for(var i=0;i<mutations.length;i++)if(mutationRelevante(mutations[i])){if(!rendering)schedule();break;}});
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    runRender();
  }
  function boot(){if(!document.body)return;
    try{if(window.__BC_M56&&typeof window.__BC_M56.disable==='function')window.__BC_M56.disable();}catch(e){}
    bind();setTimeout(runRender,250);setTimeout(runRender,700);
  }
  window.__BC_M57={render:runRender,refreshVentas:refreshAndGoVentas,today:today,eligibleId:eligibleId,version:'57.6'};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
