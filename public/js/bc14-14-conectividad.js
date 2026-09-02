(function(){
'use strict';
if(window.__BC1414)return;window.__BC1414=true;
var permitOnline=false,lastState=null,lastAt=0;
function installMark(){
 if(typeof window.marcarConectividadReal!=='function'||window.marcarConectividadReal.__bc1414)return false;
 var original=window.marcarConectividadReal;
 function stable(estado){
  var now=Date.now();
  if(estado==='online'&&!permitOnline)return;
  if((estado==='online'||estado==='offline')&&estado===lastState&&now-lastAt<1000)return;
  if(estado==='online'||estado==='offline'){lastState=estado;lastAt=now;}
  return original.call(this,estado);
 }
 stable.__bc1414=true;window.marcarConectividadReal=stable;
 try{marcarConectividadReal=stable;}catch(_){ }
 return true;
}
function installProbe(){
 if(typeof window.sondearBackend!=='function'||window.sondearBackend.__bc1414)return false;
 var original=window.sondearBackend;
 async function probe(){permitOnline=true;try{return await original.apply(this,arguments);}finally{permitOnline=false;}}
 probe.__bc1414=true;window.sondearBackend=probe;
 try{sondearBackend=probe;}catch(_){ }
 return true;
}
function boot(){
 installMark();installProbe();
 [250,800,1800].forEach(function(ms){setTimeout(function(){installMark();installProbe();},ms);});
 window.addEventListener('offline',function(){permitOnline=false;if(typeof window.marcarConectividadReal==='function')window.marcarConectividadReal('offline');});
 window.addEventListener('online',function(){setTimeout(function(){if(typeof window.sondearBackend==='function')window.sondearBackend();},100);});
 setTimeout(function(){if(typeof window.sondearBackend==='function')window.sondearBackend();},1200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
