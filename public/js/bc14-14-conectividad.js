(function(){
'use strict';
if(window.__BC1414)return;window.__BC1414=true;
function install(){
 if(typeof window.marcarConectividadReal!=='function'||window.marcarConectividadReal.__bc1414)return false;
 var old=window.marcarConectividadReal;
 function stable(estado){
  estado=(estado==='online'||estado==='offline')?estado:null;
  if(estado===null)return old.apply(this,arguments);
  var now=Date.now(),prev=window.__BC1414State;
  if(prev&&prev.estado===estado&&now-prev.at<1000)return;
  window.__BC1414State={estado:estado,at:now};
  return old.call(this,estado);
 }
 stable.__bc1414=true;window.marcarConectividadReal=stable;
 try{marcarConectividadReal=stable;}catch(_){ }
 return true;
}
function boot(){if(install())return;[150,400,900,1800,3000].forEach(function(ms){setTimeout(install,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
