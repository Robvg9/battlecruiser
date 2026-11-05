// ==== BattleCruiser — M55: Importación masiva de productos ====
(function(){
'use strict';
if(window.__bcM55ProductosImport)return;
window.__bcM55ProductosImport=true;
const MAX_ROWS=2000,PREVIEW_ROWS=12;
const FIELDS=[
 {key:'nombre',label:'Nombre',required:true,aliases:['nombre','name','producto','product','descripcion','descripción']},
 {key:'precio_normal',label:'Precio',required:true,aliases:['precio','precio_normal','precio normal','price','pvp','precio_venta']},
 {key:'categoria',label:'Categoría',required:true,aliases:['categoria','categoría','category','cat']}
];
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
function can(){return typeof tienePermiso==='function'&&(tienePermiso('productos','crear')||tienePermiso('productos','editar'))}
function injectCss(){
 if(document.getElementById('bc-m55-import-css'))return;
 var s=document.createElement('style');s.id='bc-m55-import-css';
 s.textContent='.bc-m55-overlay{position:fixed;inset:0;background:rgba(6,14,11,.8);z-index:9200;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}.bc-m55-modal{background:var(--stone);border:1px solid rgba(212,176,92,.3);border-radius:14px;width:min(1000px,100%);margin:22px auto;padding:18px;box-shadow:0 24px 60px rgba(0,0,0,.55)}.bc-m55-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}.bc-m55-actions button{padding:9px 14px;border-radius:8px;cursor:pointer}.bc-m55-actions button:disabled{opacity:.45;cursor:not-allowed}.bc-m55-err{color:var(--wine);font-size:12px}.bc-m55-ok{color:var(--sage);font-size:12px}.bc-m55-warn{color:var(--gold-bright);font-size:12px}.bc-m55-template{display:block;padding:12px;border:1px solid rgba(212,176,92,.18);border-radius:9px;margin:12px 0}.bc-m55-template li{margin:5px 0}.bc-m55-step{font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--gold-bright)}.bc-m55-file{display:block;margin:12px 0;max-width:100%}';
 document.head.appendChild(s);
}
var state=null;
function close(){document.getElementById('bc-m55-overlay')?.remove();state=null}
function openModal(){
 if(!can()){if(typeof setMsg==='function')setMsg('msg-productos','Sin permiso para importar productos.',false);return}
 injectCss();close();state={step:1,headers:[],rows:[],map:{},validated:null,processing:false};
 var ov=document.createElement('div');ov.id='bc-m55-overlay';ov.className='bc-m55-overlay';
 ov.innerHTML='<div class="bc-m55-modal" role="dialog" aria-modal="true" aria-labelledby="bc-m55-title"><h3 id="bc-m55-title">Importar productos</h3><div id="bc-m55-body"></div><div class="bc-m55-actions"><button type="button" id="bc-m55-cancel">Cancelar</button></div></div>';
 document.body.appendChild(ov);
 ov.querySelector('#bc-m55-cancel').onclick=close;
 renderStepOne();
}
function setStatus(t,ok,kind){
 var b=document.getElementById('bc-m55-result')||document.getElementById('bc-m55-body');if(!b)return;
 b.innerHTML='<p class="'+(ok?'bc-m55-ok':kind==='warn'?'bc-m55-warn':'bc-m55-err')+'" role="status">'+esc(t)+'</p>';
}
function csvCell(value){return '"'+String(value==null?'':value).replace(/"/g,'""')+'"'}
function downloadTemplate(){
 var headers=['Nombre','Precio','Categoría'];
 var csv='\uFEFF'+headers.map(csvCell).join(';')+'\r\n';
 var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
 var url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='plantilla_productos_battlecruiser.csv';
 document.body.appendChild(a);a.click();a.remove();
 if(typeof URL.revokeObjectURL==='function')setTimeout(function(){URL.revokeObjectURL(url)},1500);
 var btn=document.getElementById('bc-m55-template-download');
 if(btn)btn.textContent='Plantilla descargada ✓';
}
function renderStepOne(){
 var b=document.getElementById('bc-m55-body');if(!b)return;
 b.innerHTML='<div class="bc-m55-step">PASO 1 DE 2 · DESCARGAR Y RELLENAR</div>'+
 '<p>Descarga la plantilla, ábrela con Excel o WPS Office y completa una fila por cada producto. Después vuelve aquí para importar el archivo completado.</p>'+
 '<div class="bc-m55-template"><b>La plantilla tiene únicamente estas tres columnas:</b><ul>'+
 '<li><b>Nombre:</b> nombre del producto.</li>'+
 '<li><b>Precio:</b> importe numérico mayor que cero.</li>'+
 '<li><b>Categoría:</b> debe coincidir con una categoría activa de Administración.</li>'+
 '</ul><p class="muted">No cambies los encabezados. Conserva el archivo como CSV al guardarlo. La unidad interna se asigna automáticamente.</p></div>'+
 '<div class="bc-m55-actions"><button type="button" id="bc-m55-template-download">Descargar plantilla para Excel</button>'+
 '<button type="button" id="bc-m55-continue">Ya completé la plantilla · Continuar al paso 2</button></div>';
 b.querySelector('#bc-m55-template-download').onclick=downloadTemplate;
 b.querySelector('#bc-m55-continue').onclick=function(){state.step=2;renderStepTwo()};
}
function renderStepTwo(){
 var b=document.getElementById('bc-m55-body');if(!b)return;
 b.innerHTML='<div class="bc-m55-step">PASO 2 DE 2 · IMPORTAR EL ARCHIVO COMPLETADO</div>'+
 '<p>Selecciona el archivo que completaste en Excel o WPS Office. Revisaremos Nombre, Precio y Categoría; ningún producto se guarda hasta que pulses «Procesar importación».</p>'+
 '<input class="bc-m55-file" type="file" id="bc-m55-file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Seleccionar plantilla completada">'+
 '<div id="bc-m55-result"></div><div id="bc-m55-preview"></div>'+
 '<div class="bc-m55-actions"><button type="button" id="bc-m55-back">Volver al paso 1</button></div>';
 b.querySelector('#bc-m55-back').onclick=function(){state.step=1;state.headers=[];state.rows=[];state.map={};state.validated=null;renderStepOne()};
 b.querySelector('#bc-m55-file').onchange=async function(){
  var f=this.files&&this.files[0];if(!f)return;
  try{await loadCategories();await parseFile(f);renderPreview(f.name||'archivo.csv')}
  catch(e){setStatus(e.message||'No se pudo leer el archivo.',false)}
 };
}
function parseCsv(text){
 var t=String(text||'').replace(/^\uFEFF/,'').trim();if(!t)throw Error('Archivo vacío.');
 var lines=t.split(/\r?\n/).filter(function(line){return line.trim()!==''});
 if(!lines.length)throw Error('El archivo está vacío.');
 var delim=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';
 var split=function(line){
  var a=[],c='',q=false;
  for(var i=0;i<line.length;i++){
   var ch=line[i];
   if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++}else q=!q}
   else if(ch===delim&&!q){a.push(c);c=''}
   else c+=ch;
  }
  a.push(c);return a.map(function(x){return x.trim()});
 };
 var h=split(lines[0]);
 var rows=lines.slice(1).map(function(line){var v=split(line),o={};h.forEach(function(k,i){o[k]=v[i]||''});return o});
 return{headers:h,rows:rows};
}
async function loadXLSX(){
 if(window.XLSX)return window.XLSX;
 if(typeof window.loadSheetJS==='function')return await window.loadSheetJS();
 throw Error('No está disponible el lector XLSX en este dispositivo. Abre la plantilla CSV con Excel y guárdala como CSV UTF-8 para importarla.');
}
async function parseFile(file){
 var name=(file.name||'').toLowerCase(),p;
 if(name.endsWith('.csv')){
  p=parseCsv(await file.text());
 }else if(name.endsWith('.xlsx')||name.endsWith('.xls')){
  var X=await loadXLSX(),wb=X.read(await file.arrayBuffer(),{type:'array',raw:false}),sheet=wb.Sheets[wb.SheetNames[0]];
  if(!sheet)throw Error('El libro de Excel no contiene hojas.');
  var aoa=X.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  var headers=(aoa[0]||[]).map(function(x){return String(x==null?'':x).trim()});
  var rows=aoa.slice(1).filter(function(row){return row.some(function(x){return String(x==null?'':x).trim()!==''})}).map(function(row){
   var obj={};headers.forEach(function(key,i){obj[key]=row[i]==null?'':String(row[i]).trim()});return obj;
  });
  p={headers:headers,rows:rows};
 }else{
  throw Error('Selecciona la plantilla CSV o un libro Excel XLSX/XLS.');
 }
 if(!p.headers.length||!p.rows.length)throw Error('El archivo debe conservar los encabezados y contener al menos un producto desde la fila 2.');
 if(p.rows.length>MAX_ROWS)throw Error('Máximo '+MAX_ROWS+' filas por importación.');
 state.headers=p.headers;state.rows=p.rows;state.map=autoMap(p.headers);
}
function autoMap(h){
 var m={};
 FIELDS.forEach(function(f){var x=h.find(function(v){return f.aliases.indexOf(norm(v))>=0});if(x)m[f.key]=x});
 return m;
}
function value(row,k){var h=state.map[k];return h?row[h]:''}
function parsePrice(value){
 var raw=String(value==null?'':value).trim().replace(/\s/g,'');
 if(!raw)return NaN;
 if(raw.indexOf(',')>=0&&raw.indexOf('.')>=0){
  raw=raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
 }else if(raw.indexOf(',')>=0){raw=raw.replace(',','.');}
 return Number(raw);
}
function categoriaId(name){
 var n=norm(name);if(!n)return null;
 var cs=Array.isArray(window._cache?.categorias)?window._cache.categorias:[];
 var hit=cs.find(function(c){return norm(c.nombre||c.name)===n&&c.activo!==false});
 return hit?hit.id:null;
}
function validateRows(){
 var errors=[];
 state.rows.forEach(function(r,i){
  var rowNo=i+2,nombre=String(value(r,'nombre')||'').trim(),categoria=String(value(r,'categoria')||'').trim();
  var precioRaw=String(value(r,'precio_normal')||'').trim(),precio=parsePrice(precioRaw);
  if(!nombre)errors.push('Fila '+rowNo+': falta Nombre.');
  if(!categoria)errors.push('Fila '+rowNo+': falta Categoría.');
  else if(!categoriaId(categoria))errors.push('Fila '+rowNo+': la categoría «'+categoria+'» no existe o está inactiva.');
  if(precioRaw===''||!Number.isFinite(precio)||precio<=0)errors.push('Fila '+rowNo+': Precio debe ser un número mayor a 0.');
 });
 return errors;
}
function renderPreview(fileName){
 var b=document.getElementById('bc-m55-preview');if(!b)return;
 var errors=validateRows();state.validated=errors;
 var cols=FIELDS.map(function(f){return f.key});
 b.innerHTML='<p class="muted">'+esc(fileName)+' · '+state.rows.length+' fila(s) · columnas reconocidas: '+esc(Object.keys(state.map).join(', ')||'ninguna')+'</p>'+
 (errors.length?'<p class="bc-m55-err">'+errors.slice(0,12).map(esc).join('<br>')+(errors.length>12?'<br>Y '+(errors.length-12)+' error(es) más.':'')+'</p>':'<p class="bc-m55-ok">✓ Plantilla válida. Nombre, precio y categoría revisados.</p>')+
 '<div style="overflow:auto;max-height:280px"><table><thead><tr>'+cols.map(function(k){return '<th>'+esc(FIELDS.find(function(f){return f.key===k}).label)+'</th>'}).join('')+'</tr></thead><tbody>'+
 state.rows.slice(0,PREVIEW_ROWS).map(function(r){return '<tr>'+cols.map(function(k){return '<td>'+esc(value(r,k))+'</td>'}).join('')+'</tr>'}).join('')+
 '</tbody></table></div><div class="bc-m55-actions"><button type="button" id="bc-m55-run" '+(errors.length?'disabled':'')+'>Procesar importación</button></div>';
 var runBtn=b.querySelector('#bc-m55-run');if(runBtn)runBtn.onclick=run;
}
async function loadCategories(){
 if(Array.isArray(window._cache?.categorias)&&window._cache.categorias.length)return;
 var q=await client.from('categorias').select('id,nombre,activo').eq('activo',true).order('nombre');
 if(q.error)throw q.error;
 window._cache=window._cache||{};window._cache.categorias=Array.isArray(q.data)?q.data:[];
}
function makeIdempotencyKey(){
 try{if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID()}catch(_){}
 return 'bc-import-'+Date.now()+'-'+Math.random().toString(36).slice(2);
}
async function run(){
 if(state.processing)return;
 var errs=state.validated||[];
 if(errs.length){setStatus(errs.slice(0,12).join(' · '),false);return}
 var runBtn=document.getElementById('bc-m55-run');if(runBtn)runBtn.disabled=true;
 state.processing=true;
 var ok=0,fail=0,queued=0,rowErrors=[];
 try{
  await loadCategories();
  for(var i=0;i<state.rows.length;i++){
   var r=state.rows[i],nombre=String(value(r,'nombre')||'').trim();
   var categoria=categoriaId(value(r,'categoria'));
   var pn=parsePrice(value(r,'precio_normal'));
   try{
    var res;
    if(typeof navigator==='undefined'||navigator.onLine!==false){
     var catalog=await client.rpc('bc_guardar_producto_catalogo',{
      p_producto_id:null,p_nombre:nombre,p_categoria_id:categoria,p_unidad:'unidad',
      p_precio_normal:pn,p_precio_mayorista:null,
      p_presentacion_normal:'unidad',p_factor_normal:1,
      p_presentacion_mayorista:null,p_factor_mayorista:null,
      p_idempotency_key:makeIdempotencyKey()
     });
     if(catalog.error)throw catalog.error;
     res={ok:true,offline:false,data:catalog.data};
    }else{
     res=await ejecutarOperacion('producto',{
      p_nombre:nombre,p_categoria_id:categoria,p_unidad:'unidad',
      p_precio_normal:pn,p_precio_mayorista:null
     });
     if(!res||!res.ok)throw (res&&res.error)||new Error('No se pudo guardar el producto.');
     if(res.offline)queued++;
    }
    if(!res||!res.ok)throw (res&&res.error)||new Error('No se pudo guardar el producto.');
    ok++;
   }catch(error){fail++;rowErrors.push('Fila '+(i+2)+': '+(error&&error.message?error.message:'no se pudo guardar.'))}
  }
  var msg=ok+' producto(s) procesado(s) · '+fail+' con error'+(queued?' · '+queued+' guardado(s) en cola offline':'')+'.';
  if(rowErrors.length)msg+=' '+rowErrors.slice(0,5).join(' ');
  setStatus(msg,fail===0,fail?'warn':undefined);
  if(ok>0&&typeof window.refrescarProductos==='function'){try{await window.refrescarProductos()}catch(_){}}
 }catch(error){setStatus(error&&error.message?error.message:'No se pudo cargar el catálogo de categorías.',false)}
 finally{state.processing=false;if(runBtn)runBtn.disabled=false}
}
window.__BCM55_openOffline=openModal;window.__BC1613_offline=true;
})();