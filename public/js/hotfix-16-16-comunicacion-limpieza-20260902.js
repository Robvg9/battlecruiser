// BattleCruiser — 16.16: eliminar panel duplicado de contactos bajo el chat.
(function(){'use strict';if(window.__BC1616)return;window.__BC1616=true;
function install(){var tab=document.getElementById('tab-comunicacion');if(!tab)return false;var layout=tab.querySelector('.com-layout');if(!layout)return false;
 var keep=new Set(['com-col-lista','com-col-chat']);
 layout.querySelectorAll(':scope > *').forEach(function(el){if(keep.has(el.id))return;var txt=(el.textContent||'').trim();var cs=getComputedStyle(el);if((/contactos|usuarios|personas/i.test(txt))&&cs.overflowY==='auto'&&el.scrollHeight>el.clientHeight){el.remove();}});
 // Legacy duplicated lists often live immediately below .com-layout.
 var sibling=layout.nextElementSibling;if(sibling){var txt=(sibling.textContent||'').trim();var cs=getComputedStyle(sibling);if(/contactos|usuarios|personas/i.test(txt)&&cs.overflowY==='auto')sibling.remove();}
 return true;}
function boot(){[0,300,700,1500,3000].forEach(function(ms){setTimeout(install,ms)})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.__BC1616_verify=function(){var tab=document.getElementById('tab-comunicacion');return{layout:!!tab?.querySelector('.com-layout')}};
})();
