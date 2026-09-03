// BattleCruiser — Visibilidad final de navegación 2026-09-03
(function(){
  'use strict';
  if (window.__BC_SECCIONES_VISIBLES_20260903__) return;
  window.__BC_SECCIONES_VISIBLES_20260903__ = true;

  var KEEP_HIDDEN = { transferencias:true, vales:true, turnos:true };
  var LABELS = { config:'Configuración', ciclos:'Turnos' };

  function asegurarConfigButton(){
    var tabs = document.getElementById('tabs');
    if (!tabs) return;
    var btn = tabs.querySelector('.tab-btn[data-tab="config"]');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-btn';
      btn.setAttribute('data-tab','config');
      btn.textContent = LABELS.config;
      tabs.appendChild(btn);
    }
    if (btn) {
      btn.classList.remove('hidden','tab-sin-permiso');
      btn.style.removeProperty('display');
      btn.style.setProperty('display','flex','important');
      btn.style.setProperty('visibility','visible','important');
      btn.style.setProperty('opacity','1','important');
      btn.removeAttribute('aria-hidden');
      btn.tabIndex = 0;
    }
  }

  function normalizarSecciones(){
    var tabs = document.getElementById('tabs');
    if (!tabs) return;
    tabs.querySelectorAll('.tab-btn[data-tab]').forEach(function(btn){
      var tab = btn.dataset.tab;
      if (KEEP_HIDDEN[tab]) return;
      btn.classList.remove('hidden','tab-sin-permiso');
      btn.removeAttribute('aria-hidden');
      btn.tabIndex = 0;
      btn.style.removeProperty('display');
      btn.style.setProperty('display','flex','important');
      btn.style.setProperty('visibility','visible','important');
      btn.style.setProperty('opacity','1','important');
      if (LABELS[tab] && !btn.querySelector('.bc-nav-label')) {
        var hasIcon = btn.querySelector('.bc-nav-icon');
        if (hasIcon) {
          var span=document.createElement('span'); span.className='bc-nav-label'; span.textContent=LABELS[tab]; btn.appendChild(span);
        } else if (!btn.textContent.trim() || tab==='config') {
          btn.textContent=LABELS[tab];
        }
      }
    });
    asegurarConfigButton();
  }

  function injectCss(){
    if(document.getElementById('bc-secciones-visibles-css')) return;
    var s=document.createElement('style'); s.id='bc-secciones-visibles-css';
    s.textContent =
      '#tabs .tab-btn[data-tab="config"]{display:flex!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;height:auto!important;max-height:none!important;padding:revert!important;margin:revert!important;border:revert!important;}'+
      '#tab-config{display:block!important;visibility:visible!important;}';
    document.head.appendChild(s);
  }

  function run(){ injectCss(); normalizarSecciones(); }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ run(); setTimeout(run,250); setTimeout(run,900); setTimeout(run,1800); });
  else { run(); setTimeout(run,250); setTimeout(run,900); setTimeout(run,1800); }

  new MutationObserver(function(){
    clearTimeout(window.__bcSeccionesTimer);
    window.__bcSeccionesTimer=setTimeout(run,20);
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','aria-hidden']});
})();
