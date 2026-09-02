(function(){
'use strict';
if(window.__BC1410)return;window.__BC1410=true;
var HEADER=['nombre','categoria','precio_normal','precio_mayorista','presentacion_normal','presentacion_mayorista'];
var SAMPLE=['Cerveza Bucanero','Bebidas','650','600','unidad','caja x 24'];
function csv(){var text=HEADER.join(',')+'\n'+SAMPLE.map(function(x){return '"'+String(x).replace(/"/g,'""')+'"';}).join(',')+'\n';var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download='plantilla_productos_battlecruiser.csv';a.click();}
async function xlsx(){var X=window.XLSX||(typeof window.loadSheetJS==='function'?await window.loadSheetJS():null);if(!X)throw Error('No se pudo cargar el generador XLSX.');var wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet([HEADER,SAMPLE]);X.utils.book_append_sheet(wb,ws,'Productos');X.writeFile(wb,'plantilla_productos_battlecruiser.xlsx');}
function help(){alert('La plantilla tiene 6 columnas.\n\nOBLIGATORIO: nombre.\nOPCIONALES: categoria, precio_normal, precio_mayorista, presentacion_normal, presentacion_mayorista.\n\nEjemplo: Cerveza Bucanero | Bebidas | 650 | 600 | unidad | caja x 24.\nLos precios y presentaciones pueden quedar vacíos.');}
function bind(){
 var csvBtn=document.getElementById('bc-m55-template-csv');
 if(csvBtn&&!csvBtn.dataset.bc1410){csvBtn.dataset.bc1410='1';csvBtn.onclick=csv;}
 var x=document.querySelector('[data-a="xlsx"]');if(x&&!x.dataset.bc1410){x.dataset.bc1410='1';x.onclick=function(){xlsx().catch(function(e){alert(e.message||String(e));});};}
 var c=document.querySelector('[data-a="csv"]');if(c&&!c.dataset.bc1410){c.dataset.bc1410='1';c.onclick=csv;}
 var h=document.querySelector('[data-a="help"]');if(h&&!h.dataset.bc1410){h.dataset.bc1410='1';h.onclick=help;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
[300,800,1500,3000].forEach(function(ms){setTimeout(bind,ms);});
})();
