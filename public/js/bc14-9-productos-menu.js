(function(){
'use strict';
if(window.__BC149)return;window.__BC149=true;
function install(){
 var b=document.getElementById('prod-submit-btn'),f=document.getElementById('form-producto');
 if(!b||!f||f.dataset.bc149)return false;
 f.dataset.bc149='1';b.type='button';b.textContent='Agregar producto ▾';
 var menu=document.createElement('div');menu.id='bc149-menu';menu.hidden=true;menu.style.cssText='position:absolute;z-index:9000;min-width:230px;padding:6px;background:var(--stone);border:1px solid var(--gold-dim);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.35)';
 menu.innerHTML='<button type="button" data-a="save">Guardar producto</button><button type="button" data-a="import">Importar Excel / CSV</button><button type="button" data-a="xlsx">Plantilla XLSX</button><button type="button" data-a="csv">Plantilla CSV</button><button type="button" data-a="help">Cómo llenar</button>';
 menu.querySelectorAll('button').forEach(function(x){x.style.cssText='display:block;width:100%;padding:10px;border:0;background:none;color:var(--text);text-align:left;cursor:pointer';});f.style.position='relative';f.appendChild(menu);
 b.onclick=function(e){e.preventDefault();menu.hidden=!menu.hidden;menu.style.top=(b.offsetTop+b.offsetHeight+5)+'px';menu.style.left=b.offsetLeft+'px';};
 menu.querySelector('[data-a="save"]').onclick=function(){menu.hidden=true;f.requestSubmit();};
 menu.querySelector('[data-a="import"]').onclick=function(){menu.hidden=true;document.getElementById('bc-m55-open')?.click();};
 menu.querySelector('[data-a="xlsx"]').onclick=function(){menu.hidden=true;document.getElementById('bc14-template-xlsx')?.click();};
 menu.querySelector('[data-a="csv"]').onclick=function(){menu.hidden=true;document.getElementById('bc14-template-csv')?.click();};
 menu.querySelector('[data-a="help"]').onclick=function(){alert('NOMBRE es obligatorio. Categoría, precio normal, precio mayorista, presentación normal y presentación mayorista son opcionales.');menu.hidden=true;};
 var x=document.createElement('button');x.type='button';x.id='bc14-template-xlsx';x.hidden=true;x.onclick=function(){if(typeof window.__BC1410_xlsx==='function')window.__BC1410_xlsx();};f.appendChild(x);
 var c=document.createElement('button');c.type='button';c.id='bc14-template-csv';c.hidden=true;c.onclick=function(){if(typeof window.__BC1410_csv==='function')window.__BC1410_csv();};f.appendChild(c);
 return true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){if(!install())setTimeout(install,600);},{once:true});else if(!install())setTimeout(install,600);
})();
