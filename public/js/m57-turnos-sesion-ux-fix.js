// BattleCruiser — M57.3 · UX de secuencia + entrada directa a Ventas
// Solo la sesión elegible queda clickeable. El guard también bloquea intentos directos.
// Tras apertura confirmada por M33: refresca turno_actual_usuario y entra a Ventas.
(function () {
  'use strict';
  if (window.__bcM57TurnosSessionUx) return;
  window.__bcM57TurnosSessionUx = true;

  var observer = null;
  var timer = null;
  var busy = false;
  var rendering = false;

  function norm(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function strip(v) { return norm(v).replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N'); }
  function terminal(st) { st = strip(st); return st === 'COMPLETADA' || st === 'CANCELADA' || st === 'CANCELLED' || st === 'ANULADA'; }
  function order(s) { var d=Number(s.numero_dia!=null?s.numero_dia:s.dia_n)||999999; var b=strip(s.bloque)==='MANANA'?1:2; return [d,b]; }
  function before(a,b){var x=order(a),y=order(b);return x[0]<y[0]||(x[0]===y[0]&&x[1]<y[1]);}
  function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function api(){return window.BattleCruiserTurnoAPI||null;}
  function turnoId(){var card=document.querySelector('.m29-card[data-turno-id]');return card?card.getAttribute('data-turno-id'):null;}

  async function loadRows(){
    var a=api(),id=turnoId(); if(!a||!id||typeof a.listarSesionesTurno!=='function') return [];
    try{
      var r=await a.listarSesionesTurno(id);
      if(Array.isArray(r)) return r;
      if(r&&Array.isArray(r.sesiones)) return r.sesiones;
      if(r&&Array.isArray(r.items)) return r.items;
    }catch(e){try{console.warn('[M57.3] sesiones',e);}catch(x){}}
    return [];
  }
  function eligibleId(rows){
    var all=rows.slice().filter(Boolean).sort(function(a,b){var x=order(a),y=order(b);return x[0]-y[0]||x[1]-y[1];}),h=today();
    for(var i=0;i<all.length;i++){
      var cur=all[i],st=strip(cur.estado); if(terminal(st)||st==='EN_CURSO'||String(cur.fecha||'').slice(0,10)!==h) continue;
      var blocked=false; for(var j=0;j<all.length;j++) if(before(all[j],cur)&&!terminal(all[j].estado)){blocked=true;break;}
      if(!blocked) return String(cur.id);
    }
    return null;
  }
  function css(){
    if(document.getElementById('bc-m57-css')) return;
    var s=document.createElement('style'); s.id='bc-m57-css';
    s.textContent='.m57-locked{opacity:.45!important;filter:saturate(.3)!important;cursor:not-allowed!important;pointer-events:auto!important}.m57-lock-icon{margin-right:6px}';
    document.head.appendChild(s);
  }
  function render(rows){
    var modal=document.querySelector('#m33-bg .m33-modal'); if(!modal)return;
    var buttons=Array.prototype.slice.call(modal.querySelectorAll('[data-m33-abrir-sesion]')); if(!buttons.length)return;
    css(); var ok=eligibleId(rows);
    buttons.forEach(function(btn){
      var canOpen=!!ok&&String(btn.getAttribute('data-m33-abrir-sesion'))===ok;
      if(canOpen){
        if(btn.disabled||btn.classList.contains('m57-locked')||btn.textContent.trim()!=='Abrir sesión'){
          btn.disabled=false;btn.classList.remove('m57-locked');btn.removeAttribute('aria-disabled');btn.removeAttribute('title');btn.textContent='Abrir sesión';
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
    if(rendering) return;
    rendering=true;
    loadRows().then(function(rows){render(rows);successCheck();}).catch(function(){}).finally(function(){rendering=false;});
  }
  async function refreshAndGoVentas(){
    if(busy)return; busy=true; window.__BC_SESSION_OPEN_REDIRECTING__=true;
    try{
      if(typeof window.bcRefrescarTurnoYPanelVenta==='function') await window.bcRefrescarTurnoYPanelVenta();
      else if(typeof window.__BC_M25_refrescarTurno==='function') await window.__BC_M25_refrescarTurno();
      else if(typeof refrescarTurnoActual==='function') await refrescarTurnoActual();
    }catch(e){}
    var bg=document.getElementById('m33-bg');if(bg)bg.remove();
    setTimeout(function(){
      try{if(typeof irATab==='function')irATab('ventas');else{var b=document.querySelector('.tab-btn[data-tab="ventas"]');if(b)b.click();}}catch(e2){}
      setTimeout(function(){try{if(typeof window.bcRefrescarTurnoYPanelVenta==='function')window.bcRefrescarTurnoYPanelVenta();else if(typeof actualizarPanelAlmacenVenta==='function')actualizarPanelAlmacenVenta();}catch(e3){}
        setTimeout(function(){window.__BC_SESSION_OPEN_REDIRECTING__=false;busy=false;},800);
      },180);
    },40);
  }
  function successCheck(){if(window.__BC_SESSION_OPEN_REDIRECTING__)return;var msg=document.getElementById('m33-dep-msg');if(msg&&strip(msg.textContent).indexOf('SESION ABIERTA')>=0)refreshAndGoVentas();}
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;runRender();},90);}
  function bind(){
    document.addEventListener('click',function(e){
      var btn=e.target&&e.target.closest?e.target.closest('[data-m33-abrir-sesion]'):null;if(!btn)return;
      if(btn.disabled||btn.getAttribute('aria-disabled')==='true'||btn.classList.contains('m57-locked')){e.preventDefault();e.stopImmediatePropagation();var msg=document.getElementById('m33-dep-msg');if(msg)msg.textContent='🔒 Esta sesión todavía no se puede abrir. Completá primero la sesión anterior y respetá la fecha programada.';}
    },true);
    observer=new MutationObserver(function(){if(!rendering)schedule();});
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    runRender();
  }
  function boot(){if(!document.body)return;bind();setTimeout(runRender,250);setTimeout(runRender,700);}
  window.__BC_M57={render:runRender,refreshVentas:refreshAndGoVentas};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
