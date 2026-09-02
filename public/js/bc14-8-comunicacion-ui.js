(function(){
'use strict';
if(window.__BC148)return;window.__BC148=true;
function install(){
 if(document.getElementById('bc148-css'))return true;
 var s=document.createElement('style');s.id='bc148-css';
 s.textContent='#tab-comunicacion .com-layout{display:grid!important;grid-template-columns:minmax(240px,320px) minmax(0,1fr)!important;gap:16px!important;height:calc(100vh - 250px)!important;min-height:520px!important}#tab-comunicacion .com-col-lista,#tab-comunicacion .com-col-chat{min-width:0;background:var(--stone)!important;border:1px solid rgba(212,176,92,.18)!important;border-radius:14px!important;overflow:hidden!important}#tab-comunicacion .com-col-lista{display:flex!important;flex-direction:column!important}#tab-comunicacion .com-col-chat{display:flex!important;flex-direction:column!important}#tab-comunicacion .com-lista-header,#tab-comunicacion .com-chat-header{padding:14px 16px!important;border-bottom:1px solid rgba(212,176,92,.14)!important;background:rgba(0,0,0,.16)!important}#tab-comunicacion .com-lista,#tab-comunicacion .com-mensajes{padding:10px!important;overflow:auto!important;flex:1!important}#tab-comunicacion .com-item{margin:4px 0!important;padding:11px 12px!important;border-radius:10px!important;border:1px solid transparent!important}#tab-comunicacion .com-item:hover,#tab-comunicacion .com-item.active{border-color:rgba(212,176,92,.3)!important;background:rgba(212,176,92,.07)!important}#tab-comunicacion .com-composer{padding:10px!important;border-top:1px solid rgba(212,176,92,.14)!important}#tab-comunicacion .com-composer textarea{min-height:58px!important;resize:vertical!important}@media(max-width:820px){#tab-comunicacion .com-layout{grid-template-columns:1fr!important;height:auto!important;min-height:0!important}#tab-comunicacion .com-col-lista{max-height:320px!important}#tab-comunicacion .com-col-chat{min-height:520px!important}}';
 document.head.appendChild(s);return true;
}
function boot(){install();[300,900,1800].forEach(function(ms){setTimeout(install,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
