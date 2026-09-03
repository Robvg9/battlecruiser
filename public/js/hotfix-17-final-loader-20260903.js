// BattleCruiser — cargador final de la segunda ronda
(function(){'use strict';if(window.__BC17FINAL)return;window.__BC17FINAL=true;
var mods=[
 ['hotfix-17-7-reportes-filtro-unico-20260903.js','17.7'],
 ['hotfix-17-8-transfer-history-atomic-20260903.js','17.8'],
 ['hotfix-17-9-venta-double-submit-20260903.js','17.9'],
 ['hotfix-17-10-ventas-stock-visible-20260903.js','17.10'],
 ['hotfix-17-11-carrito-cantidad-box-20260903.js','17.11'],
 ['hotfix-17-12-comunicacion-limpiar-pruebas-20260903.js','17.12'],
 ['hotfix-17-13-configuracion-admin-visible-20260903.js','17.13'],
 ['hotfix-17-15-reportes-dedupe-id-20260903.js','17.15'],
 ['hotfix-17-17-reportes-unificacion-20260903.js','17.17'],
 ['hotfix-17-18-presentacion-rpc-map-20260903.js','17.18']
];
function load(name,v){if(document.querySelector('script[src*="'+name+'"]'))return;var s=document.createElement('script');s.src='js/'+name+'?v='+v;s.async=false;document.body.appendChild(s)}
function boot(){mods.forEach(function(x){load(x[0],x[1])})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.__BC17FINAL_verify=function(){return mods.reduce(function(o,x){o[x[0]]=!!document.querySelector('script[src*="'+x[0]+'"]');return o;},{});};
})();