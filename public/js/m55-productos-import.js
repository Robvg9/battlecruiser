// ==== BattleCruiser — M55: Importación masiva de productos ====
(function(){
'use strict';
if(window.__bcM55ProductosImport)return;
window.__bcM55ProductosImport=true;
const MAX_ROWS=2000,PREVIEW_ROWS=12;
const FIELDS=[
 {key:'nombre',label:'Producto',required:true,aliases:['nombre','name','producto','productos','product','products','descripcion','descripción']},
 {key:'precio_normal',label:'Precio',required:true,aliases:['precio','precios','precio_normal','precio normal','price','prices','pvp','precio_venta']},
 {key:'categoria',label:'Categoría',required:true,aliases:['categoria','categoría','categorias','categorías','category','categories','cat']}
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
 injectCss();close();state={step:1,headers:[],rows:[],rowNumbers:[],map:{},validated:null,processing:false};
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
function u8(s){return new TextEncoder().encode(String(s))}
function crc32(bytes){var c=-1;for(var i=0;i<bytes.length;i++){c^=bytes[i];for(var j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^-1)>>>0}
function zipStored(files){
 var locals=[],centrals=[],offset=0;
 files.forEach(function(file){
  var name=u8(file.name),data=u8(file.data),crc=crc32(data),lh=new Uint8Array(30+name.length),lv=new DataView(lh.buffer);
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);
  lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);lh.set(name,30);
  locals.push(lh,data);
  var ch=new Uint8Array(46+name.length),cv=new DataView(ch.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);
  cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);ch.set(name,46);
  centrals.push(ch);offset+=lh.length+data.length;
 });
 var centralSize=centrals.reduce(function(n,x){return n+x.length},0),end=new Uint8Array(22),ev=new DataView(end.buffer);
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
 return new Blob(locals.concat(centrals,[end]),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function xmlEsc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function makeTemplateXlsx(){
 var headers=['Productos','Precios','Categorias'];
 var sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/><col min="3" max="3" width="25" customWidth="1"/></cols><sheetData><row r="1">'+
 headers.map(function(v,i){var ref=String.fromCharCode(65+i)+'1';return '<c r="'+ref+'" t="inlineStr"><is><t>'+xmlEsc(v)+'</t></is></c>'}).join('')+
 '</row></sheetData><autoFilter ref="A1:C1"/></worksheet>';
 return zipStored([
  {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
  {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
  {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Productos" sheetId="1" r:id="rId1"/></sheets></workbook>'},
  {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
  {name:'xl/worksheets/sheet1.xml',data:sheet}
 ]);
}
function downloadTemplate(){
 var blob=makeTemplateXlsx(),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='plantilla_productos_battlecruiser.xlsx';
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
 '<li><b>Productos:</b> nombre del producto.</li>'+
 '<li><b>Precios:</b> importe numérico mayor que cero.</li>'+
 '<li><b>Categorias:</b> debe coincidir con una categoría activa de Administración.</li>'+
 '</ul><p class="muted">Cada encabezado está en su propia columna. Completa las filas debajo y conserva el archivo como XLSX. También puedes importar CSV.</p></div>'+
 '<div class="bc-m55-actions"><button type="button" id="bc-m55-template-download">Descargar plantilla Excel (.xlsx)</button>'+
 '<button type="button" id="bc-m55-continue">Ya completé la plantilla · Continuar al paso 2</button></div>';
 b.querySelector('#bc-m55-template-download').onclick=downloadTemplate;
 b.querySelector('#bc-m55-continue').onclick=function(){state.step=2;renderStepTwo()};
}
function renderStepTwo(){
 var b=document.getElementById('bc-m55-body');if(!b)return;
 b.innerHTML='<div class="bc-m55-step">PASO 2 DE 2 · IMPORTAR EL ARCHIVO COMPLETADO</div>'+
 '<p>Selecciona el archivo que completaste en Excel o WPS Office. Revisaremos Nombre, Precio y Categoría; ningún producto se guarda hasta que pulses «Procesar importación».</p>'+
 '<input class="bc-m55-file" type="file" id="bc-m55-file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Seleccionar plantilla completada">'+
 '<div id="bc-m55-result"></div><div id="bc-m55-preview"></div>'+
 '<div class="bc-m55-actions"><button type="button" id="bc-m55-back">Volver al paso 1</button></div>';
 b.querySelector('#bc-m55-back').onclick=function(){state.step=1;state.headers=[];state.rows=[];state.rowNumbers=[];state.map={};state.validated=null;renderStepOne()};
 b.querySelector('#bc-m55-file').onchange=async function(){
  var f=this.files&&this.files[0];if(!f)return;
  try{await loadCategories();await parseFile(f);renderPreview(f.name||'archivo.csv')}
  catch(e){setStatus(e.message||'No se pudo leer el archivo.',false)}
 };
}
function delimiterFor(text){
 var sample=String(text||'').split(/\r?\n/).slice(0,12),candidates=['\t',';',','];var best=';',score=-1;
 candidates.forEach(function(d){var n=0;sample.forEach(function(line){var q=false;for(var i=0;i<line.length;i++){if(line[i]==='"'){if(q&&line[i+1]==='"')i++;else q=!q}else if(line[i]===d&&!q)n++}});if(n>score){score=n;best=d}});
 return best;
}
function csvMatrix(text){
 var d=delimiterFor(text),out=[],row=[],cell='',quoted=false,t=String(text||'').replace(/^\uFEFF/,'');
 for(var i=0;i<t.length;i++){var ch=t[i];
  if(ch==='"'){if(quoted&&t[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(ch===d&&!quoted){row.push(cell);cell=''}
  else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(cell);if(row.some(function(v){return String(v).trim()!==''}))out.push(row);row=[];cell=''}
  else cell+=ch;
 }
 row.push(cell);if(row.some(function(v){return String(v).trim()!==''}))out.push(row);
 return out;
}
function headerIndex(matrix){
 var best=-1,bestScore=0;
 matrix.slice(0,15).forEach(function(row,i){var score=0;row.forEach(function(v){var n=norm(v);if(FIELDS.some(function(f){return f.aliases.some(function(a){return norm(a)===n})}))score++});if(score>bestScore){bestScore=score;best=i}});
 if(bestScore<2)throw Error('No se encontraron encabezados reconocibles. Usa Productos, Precios y Categorias, cada uno en su propia columna.');
 return best;
}
function matrixToRows(matrix,start){
 var headers=(matrix[start]||[]).map(function(v){return String(v==null?'':v).trim()}),rows=[],rowNumbers=[];
 matrix.slice(start+1).forEach(function(values,index){if(!values.some(function(v){return String(v==null?'':v).trim()!==''}))return;var obj={};headers.forEach(function(k,i){if(k)obj[k]=values[i]==null?'':String(values[i]).trim()});rows.push(obj);rowNumbers.push(start+index+2)});
 return{headers:headers,rows:rows,rowNumbers:rowNumbers};
}
function parseCsv(text){var matrix=csvMatrix(text);if(!matrix.length)throw Error('Archivo vacío.');return matrixToRows(matrix,headerIndex(matrix))}
async function unzipEntry(buffer,name){
 var bytes=new Uint8Array(buffer),view=new DataView(buffer),eocd=-1;
 for(var p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(view.getUint32(p,true)===0x06054b50){eocd=p;break}}
 if(eocd<0)throw Error('El archivo parece Excel, pero su estructura XLSX está dañada.');
 var count=view.getUint16(eocd+10,true),offset=view.getUint32(eocd+16,true),found=null;
 for(var i=0;i<count;i++){if(view.getUint32(offset,true)!==0x02014b50)break;var method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),nl=view.getUint16(offset+28,true),el=view.getUint16(offset+30,true),cl=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true),fname=new TextDecoder().decode(bytes.slice(offset+46,offset+46+nl));if(fname===name){var lnl=view.getUint16(local+26,true),lel=view.getUint16(local+28,true),start=local+30+lnl+lel;found={method,data:bytes.slice(start,start+size)};break}offset+=46+nl+el+cl}
 if(!found)return null;if(found.method===0)return new TextDecoder().decode(found.data);
 if(found.method!==8)throw Error('El XLSX utiliza una compresión no compatible.');
 if(typeof DecompressionStream!=='function')throw Error('Este navegador no puede descomprimir XLSX. Guarda una copia como CSV UTF-8.');
 var stream=new Blob([found.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
function colIndex(ref){var m=String(ref||'').match(/^([A-Z]+)/i);if(!m)return 0;var n=0;for(var i=0;i<m[1].length;i++)n=n*26+m[1].toUpperCase().charCodeAt(i)-64;return n-1}
async function parseXlsx(buffer){
 var [sheetXml,sharedXml]=await Promise.all([unzipEntry(buffer,'xl/worksheets/sheet1.xml'),unzipEntry(buffer,'xl/sharedStrings.xml')]);
 if(!sheetXml)throw Error('No se encontró la primera hoja del libro Excel.');
 var parser=new DOMParser(),doc=parser.parseFromString(sheetXml,'application/xml'),shared=[];
 if(sharedXml){var sd=parser.parseFromString(sharedXml,'application/xml');shared=Array.from(sd.getElementsByTagName('si')).map(function(si){return Array.from(si.getElementsByTagName('t')).map(function(t){return t.textContent}).join('')})}
 var matrix=Array.from(doc.getElementsByTagName('row')).map(function(row){var vals=[];Array.from(row.getElementsByTagName('c')).forEach(function(c){var i=colIndex(c.getAttribute('r'));var v=c.getElementsByTagName('v')[0],inline=c.getElementsByTagName('is')[0],value='';if(c.getAttribute('t')==='s'&&v)value=shared[Number(v.textContent)]||'';else if(inline)value=Array.from(inline.getElementsByTagName('t')).map(function(t){return t.textContent}).join('');else if(v)value=v.textContent;vals[i]=value});return vals});
 return matrixToRows(matrix,headerIndex(matrix));
}
async function loadXLSX(){
 if(window.XLSX)return window.XLSX;
 if(typeof window.loadSheetJS==='function')return await window.loadSheetJS();
 throw Error('Este archivo XLS antiguo no es compatible. Ábrelo con WPS/Excel y guárdalo como XLSX o CSV UTF-8.');
}
async function parseFile(file){
 var name=(file.name||'').toLowerCase(),buffer=null,p;
 if(typeof file.arrayBuffer!=='function'){
  if(typeof file.text!=='function')throw Error('No se pudo leer el archivo seleccionado.');
  p=parseCsv(await file.text());
 }else{
  buffer=await file.arrayBuffer();
  var magic=new Uint8Array(buffer.slice(0,8)),isZip=magic[0]===0x50&&magic[1]===0x4b;
  var isOle=magic[0]===0xd0&&magic[1]===0xcf&&magic[2]===0x11&&magic[3]===0xe0;
  if(isZip||name.endsWith('.xlsx')){
   p=await parseXlsx(buffer);
  }else if(isOle||name.endsWith('.xls')){
   var X=await loadXLSX(),wb=X.read(buffer,{type:'array',raw:false}),sheet=wb.Sheets[wb.SheetNames[0]];
   if(!sheet)throw Error('El libro de Excel no contiene hojas.');
   var aoa=X.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});p=matrixToRows(aoa,headerIndex(aoa));
  }else{
   var bytes=new Uint8Array(buffer),raw=buffer.byteLength>=2&&bytes[0]===0xff&&bytes[1]===0xfe?new TextDecoder('utf-16le').decode(buffer):new TextDecoder('utf-8').decode(buffer);
   p=parseCsv(raw);
  }
 }
 if(!p.headers.length||!p.rows.length)throw Error('El archivo debe conservar los encabezados y contener al menos un producto debajo de ellos.');
 if(p.rows.length>MAX_ROWS)throw Error('Máximo '+MAX_ROWS+' filas por importación.');
 state.headers=p.headers;state.rows=p.rows;state.rowNumbers=p.rowNumbers||[];state.map=autoMap(p.headers);
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
  var rowNo=state.rowNumbers[i]||i+2,nombre=String(value(r,'nombre')||'').trim(),categoria=String(value(r,'categoria')||'').trim();
  var precioRaw=String(value(r,'precio_normal')||'').trim(),precio=parsePrice(precioRaw);
  if(!nombre)errors.push('Fila '+rowNo+': falta Nombre.');
  if(!categoria)errors.push('Fila '+rowNo+': falta Categoría.');
  else if(!categoriaId(categoria))errors.push('Fila '+rowNo+': la categoría «'+categoria+'» no existe o está inactiva.');
  if(precioRaw===''||!Number.isFinite(precio)||precio<=0)errors.push('Fila '+rowNo+': Precio debe ser un número mayor a 0.');
 });
 return errors;
}
function fmtRows(v){return typeof window.numberFmt==='function'?window.numberFmt(v):String(v==null?0:v);}
function renderPreview(fileName){
 var b=document.getElementById('bc-m55-preview');if(!b)return;
 var errors=validateRows();state.validated=errors;
 var cols=FIELDS.map(function(f){return f.key});
 b.innerHTML='<p class="muted">'+esc(fileName)+' · '+state.rows.length+' fila(s) · columnas reconocidas: '+esc(Object.keys(state.map).join(', ')||'ninguna')+'</p>'+
 (errors.length?'<p class="bc-m55-err">'+errors.slice(0,12).map(esc).join('<br>')+(errors.length>12?'<br>Y '+fmtRows(errors.length-12)+' error(es) más.':'')+'</p>':'<p class="bc-m55-ok">✓ Plantilla válida. Nombre, precio y categoría revisados.</p>')+
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
   }catch(error){fail++;rowErrors.push('Fila '+(state.rowNumbers[i]||i+2)+': '+(error&&error.message?error.message:'no se pudo guardar.'))}
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