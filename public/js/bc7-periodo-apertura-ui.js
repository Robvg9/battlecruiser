// BattleCruiser — apertura administrativa de jornada ya iniciada
// v1.6 — importación de la columna Fin, mapeo de familias y bloqueo de filas sin correspondencia.
(function(){
  'use strict';
  if(window.__BC7_PERIOD_OPENING__)return;
  window.__BC7_PERIOD_OPENING__=true;

  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
  const asArray=v=>Array.isArray(v)?v:(v==null?[]:[v]);
  let preview=null,parsed=null,productsByName=new Map(),modal=null;

  function db(){
    if(typeof client==='undefined'||!client||typeof client.rpc!=='function')throw new Error('Cliente Supabase no disponible.');
    return client;
  }
  async function callRpc(name,args){
    if(!navigator.onLine)throw new Error('Esta operación requiere Internet.');
    const r=await db().rpc(name,args||{});
    if(r&&r.error){const e=new Error(r.error.message||'Error RPC');e.code=r.error.code||'RPC_ERROR';throw e;}
    return r?r.data:null;
  }
  function notify(text,kind){
    const el=$('bc7-period-open-status');if(!el)return;
    el.textContent=text||'';el.className='bc7-msg '+(kind||'');
  }
  function style(){
    if($('bc7-period-open-style'))return;
    const s=document.createElement('style');s.id='bc7-period-open-style';
    s.textContent='.bc7-period-overlay{position:fixed;inset:0;z-index:9400;background:rgba(3,10,8,.84);display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto}.bc7-period-modal{width:min(980px,100%);margin:18px auto;padding:16px;background:var(--stone,#17211b);color:var(--text,#f4f0e5);border:1px solid var(--gold-dim,rgba(201,162,77,.4));border-radius:12px;box-shadow:0 24px 70px #0009}.bc7-period-modal h3{margin:0 0 8px}.bc7-period-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bc7-period-field{display:flex;flex-direction:column;gap:5px;margin:7px 0;font-size:12px;color:var(--mist,#b9c0b6)}.bc7-period-field input,.bc7-period-field select{box-sizing:border-box;width:100%;min-height:38px;padding:8px;background:var(--void,#0d1511);color:var(--text,#f4f0e5);border:1px solid var(--gold-dim,rgba(201,162,77,.4));border-radius:6px}.bc7-period-box{margin:10px 0;padding:10px;border:1px solid var(--gold-dim,rgba(201,162,77,.4));border-radius:8px}.bc7-period-transfer{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;padding:8px 0;border-bottom:1px solid var(--gold-dim,rgba(201,162,77,.2));font-size:12px}.bc7-period-transfer:last-child{border-bottom:0}.bc7-period-table-wrap{max-height:330px;overflow:auto;border:1px solid var(--gold-dim,rgba(201,162,77,.25));border-radius:6px}.bc7-period-table{width:100%;border-collapse:collapse;font-size:11px}.bc7-period-table thead{position:sticky;top:0;background:var(--stone,#17211b);z-index:1}.bc7-period-table th,.bc7-period-table td{text-align:left;padding:6px;border-bottom:1px solid var(--gold-dim,rgba(201,162,77,.2))}.bc7-period-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px}.bc7-period-actions button{min-height:38px;padding:8px 12px;border:1px solid var(--gold-dim,rgba(201,162,77,.4));border-radius:7px;background:var(--void,#0d1511);color:var(--text,#f4f0e5);cursor:pointer}.bc7-period-actions button.primary{background:var(--gold,#c9a24d);color:#17211b}.bc7-period-actions button:disabled{opacity:.45;cursor:not-allowed}.bc7-period-muted{font-size:11px;color:var(--mist,#b9c0b6);line-height:1.4}.bc7-period-error{color:#efaaa2;font-size:12px}.bc7-period-ok{color:#a0d7af;font-size:12px}@media(max-width:650px){.bc7-period-grid{grid-template-columns:1fr}.bc7-period-modal{padding:12px}.bc7-period-transfer{grid-template-columns:auto minmax(0,1fr)}.bc7-period-transfer small{grid-column:2}}';
    document.head.appendChild(s);
  }
  function insertButton(){
    const panel=$('bc7-admin-panel');
    if(!panel||$('bc7-period-open-card'))return;
    const card=document.createElement('section');
    card.id='bc7-period-open-card';card.className='bc7-card';
    card.innerHTML='<h3>Registrar una jornada ya iniciada</h3><p class="bc7-muted">Para jornadas que comenzaron físicamente antes de quedar registradas en BattleCruiser. Importa el inventario inicial y vincula entradas ya existentes, sin modificar el stock general.</p><div class="bc7-actions"><button type="button" class="bc7-btn primary" id="bc7-period-open-button">Registrar jornada ya iniciada</button></div><p class="bc7-msg" id="bc7-period-open-status" role="status" aria-live="polite"></p>';
    const first=panel.querySelector('form')||panel.firstElementChild;
    if(first)panel.insertBefore(card,first);else panel.appendChild(card);
  }
  function csvMatrix(text){
    const firstLine=String(text||'').split(/\r?\n/).find(line=>line.trim())||'';
    const counts={',':0,';':0,'\t':0};let probeQuoted=false;
    for(let i=0;i<firstLine.length;i++){
      const ch=firstLine[i];
      if(ch==='"'&&firstLine[i+1]==='"'){i++;continue;}
      if(ch==='"'){probeQuoted=!probeQuoted;continue;}
      if(!probeQuoted&&Object.prototype.hasOwnProperty.call(counts,ch))counts[ch]++;
    }
    const delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
      else if(ch==='"')quoted=true;
      else if(ch===delimiter){row.push(cell);cell='';}
      else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
      else if(ch!=='\r')cell+=ch;
    }
    if(cell.length||row.length){row.push(cell);rows.push(row);}
    return rows;
  }
  async function zipText(buffer,name){
    const bytes=new Uint8Array(buffer),view=new DataView(buffer);let eocd=-1;
    for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(view.getUint32(p,true)===0x06054b50){eocd=p;break;}}
    if(eocd<0)throw new Error('El archivo no tiene una estructura XLSX válida.');
    const count=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true),found=null;
    for(let i=0;i<count;i++){
      if(view.getUint32(offset,true)!==0x02014b50)break;
      const method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),nl=view.getUint16(offset+28,true),el=view.getUint16(offset+30,true),cl=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
      const filename=new TextDecoder().decode(bytes.slice(offset+46,offset+46+nl));
      if(filename===name){const lnl=view.getUint16(local+26,true),lel=view.getUint16(local+28,true),start=local+30+lnl+lel;found={method,data:bytes.slice(start,start+size)};break;}
      offset+=46+nl+el+cl;
    }
    if(!found)return null;
    if(found.method===0)return new TextDecoder().decode(found.data);
    if(found.method!==8||typeof DecompressionStream!=='function')throw new Error('No se pudo descomprimir el Excel. Guarda una copia como CSV UTF-8.');
    const stream=new Blob([found.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
  }
  function colIndex(ref){const m=String(ref||'').match(/^([A-Z]+)/i);if(!m)return 0;let n=0;for(const ch of m[1].toUpperCase())n=n*26+ch.charCodeAt(0)-64;return n-1;}
  async function xlsxMatrix(buffer){
    const [xml,sharedXml]=await Promise.all([zipText(buffer,'xl/worksheets/sheet1.xml'),zipText(buffer,'xl/sharedStrings.xml')]);
    if(!xml)throw new Error('No se encontró la hoja INV en la primera posición del Excel.');
    const parser=new DOMParser(),doc=parser.parseFromString(xml,'application/xml'),shared=[];
    if(sharedXml){const sd=parser.parseFromString(sharedXml,'application/xml');shared.push(...Array.from(sd.getElementsByTagName('si')).map(si=>Array.from(si.getElementsByTagName('t')).map(t=>t.textContent).join('')));}
    return Array.from(doc.getElementsByTagName('row')).map(row=>{
      const vals=[];
      Array.from(row.getElementsByTagName('c')).forEach(cell=>{
        const idx=colIndex(cell.getAttribute('r')),v=cell.getElementsByTagName('v')[0],inline=cell.getElementsByTagName('is')[0];
        let value='';
        if(cell.getAttribute('t')==='s'&&v)value=shared[Number(v.textContent)]||'';
        else if(inline)value=Array.from(inline.getElementsByTagName('t')).map(t=>t.textContent).join('');
        else if(v)value=v.textContent;
        vals[idx]=value;
      });
      return vals;
    });
  }
  function parseQuantity(v){
    let s=String(v==null?'':v).trim().replace(/\s/g,'');
    if(!s)return NaN;
    if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(',','.');
    const n=Number(s);return Number.isFinite(n)&&n>=0?n:NaN;
  }
  async function parseInventoryFile(file){
    const name=String(file.name||'').toLowerCase();let matrix;
    if(name.endsWith('.csv'))matrix=csvMatrix(await file.text());
    else if(name.endsWith('.xlsx'))matrix=await xlsxMatrix(await file.arrayBuffer());
    else throw new Error('Formato no compatible. Selecciona el Excel .xlsx o una copia CSV UTF-8.');
    let header=-1,productCol=-1,finalCol=-1;
    for(let i=0;i<Math.min(matrix.length,25);i++){
      const row=matrix[i]||[];
      const p=row.findIndex(v=>['producto','productos','nombre'].includes(norm(v)));
      const f=row.findIndex(v=>norm(v)==='fin'||norm(v)==='inventario final');
      if(p>=0&&f>=0){header=i;productCol=p;finalCol=f;break;}
    }
    if(header<0)throw new Error('No encontré las columnas Productos y Fin en la hoja INV.');
    const rows=[];
    const summaryRows=new Set(['ganancias','ingreso','cantidad','calculos','totales']);
    for(let index=0;index<matrix.length-header-1;index++){
      const row=matrix[header+index+1]||[];
      const name=String(row[productCol]||'').trim();if(!name)continue;
      if(summaryRows.has(norm(name)))break;
      const quantity=parseQuantity(row[finalCol]);
      if(!Number.isFinite(quantity))throw new Error('Cantidad final inválida en la fila '+(header+index+2)+': '+name);
      rows.push({nombre:name,cantidad:quantity,fila:header+index+2});
    }
    if(!rows.length)throw new Error('La hoja INV no contiene productos debajo de los encabezados.');
    return rows;
  }
  function havanaTimestamp(value){
    const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if(!m)throw new Error('Indica la fecha y hora real de inicio de la jornada.');
    const naive=Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]));
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Havana',timeZoneName:'longOffset'}).formatToParts(new Date(naive));
    const label=(parts.find(p=>p.type==='timeZoneName')||{}).value||'GMT-05:00';
    const off=label.match(/GMT([+-])(\d{2}):?(\d{2})/);
    const minutes=off?(Number(off[2])*60+Number(off[3]))*(off[1]==='-'?-1:1):-300;
    return new Date(naive-minutes*60000).toISOString();
  }
  function currentWarehouse(){
    const select=$('bc7-warehouse');if(!select)return '';
    if(select.value)return select.value;
    const option=Array.from(select.options||[]).find(o=>norm(o.textContent).includes('la cueva'));
    if(option){select.value=option.value;return select.value;}
    return '';
  }
  async function loadPeople(){
    let people=[];
    if(window.__BC7_JORNADA__&&typeof window.__BC7_JORNADA__.refreshResponsibleStaff==='function'){
      people=asArray(await window.__BC7_JORNADA__.refreshResponsibleStaff());
    }
    if(!people.length)people=asArray(window.__BC_M29_STAFF_CACHE__);
    if(!people.length&&window.__BC_M29_STAFF_CACHE_LOADED__!==true)people=asArray(window._cache&&window._cache.usuarios);
    return people.filter(u=>{
      if(!u||!u.id||u.activo===false||u.archivado===true)return false;
      let role=u.rol||u.role_name||u.nombre_rol||u.role||'';
      if(role&&typeof role==='object')role=role.nombre||role.name||'';
      return norm(role).includes('dependienta')||norm(role)==='dueno';
    });
  }
  function showModal(people){
    style();
    modal=document.createElement('div');modal.id='bc7-period-modal';modal.className='bc7-period-overlay';
    const warehouse=currentWarehouse();
    const whName=$('bc7-warehouse')?.selectedOptions?.[0]?.textContent||'La Cueva';
    modal.innerHTML='<div class="bc7-period-modal" role="dialog" aria-modal="true" aria-labelledby="bc7-period-title">'+
      '<h3 id="bc7-period-title">Registrar jornada ya iniciada</h3>'+
      '<p class="bc7-period-muted"><b>Columna Fin del cuadre anterior:</b> se importará únicamente esta cantidad por producto/familia. Las transferencias se vincularán por su ID y no se volverán a ejecutar.</p>'+
      '<div class="bc7-period-grid">'+
      '<label class="bc7-period-field">Almacén<select id="bc7-period-warehouse"><option value="'+esc(warehouse)+'">'+esc(whName)+'</option></select></label>'+
      '<label class="bc7-period-field">Responsable<select id="bc7-period-person"><option value="">Selecciona una responsable</option>'+people.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nombre||p.nombre_usuario||p.email||p.id)+'</option>').join('')+'</select></label>'+
      '<label class="bc7-period-field">Inicio del período<input id="bc7-period-start" type="date" value="2026-11-09" required></label>'+
      '<label class="bc7-period-field">Final del período<input id="bc7-period-end" type="date" value="2026-11-10" required></label>'+
      '<label class="bc7-period-field">Fecha y hora real de inicio y conteo inicial (hora de Cuba)<input id="bc7-period-started" type="datetime-local" value="" required><small class="bc7-period-muted">Debe coincidir con el momento de referencia del inventario inicial; se usa para decidir qué entradas ocurrieron después.</small></label>'+
      '<label class="bc7-period-field">Inventario anterior (.xlsx o .csv)<input id="bc7-period-file" type="file" accept=".xlsx,.csv" required></label>'+
      '</div>'+
      '<div class="bc7-period-box"><b>Inventario inicial heredado</b><div id="bc7-period-inventory-preview" class="bc7-period-muted">Selecciona el Excel de Adriana para revisar sus cantidades.</div></div>'+
      '<div class="bc7-period-box"><b>Entradas existentes en el período</b><p class="bc7-period-muted">Las entradas de 09:07 y 15:16 son posteriores al inventario heredado. La de 07:15 ya forma parte del cierre de Adriana y no se vinculará de nuevo.</p><div id="bc7-period-transfer-list" class="bc7-period-muted">Primero selecciona fechas para consultar las entradas.</div></div>'+
      '<label class="bc7-period-field">Observación administrativa<input id="bc7-period-note" maxlength="1000" value="Apertura retroactiva: inventario final de Adriana (7–8 nov. 2026) como inventario inicial de Sheyla (9–10 nov. 2026)."></label>'+
      '<p id="bc7-period-result" class="bc7-period-muted" role="status" aria-live="polite"></p>'+
      '<div class="bc7-period-actions"><button type="button" data-bc7-period-cancel>Cancelar</button><button type="button" class="primary" id="bc7-period-preview">Revisar inventario y entradas</button><button type="button" class="primary" id="bc7-period-confirm" disabled>Confirmar apertura</button></div>'+
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-bc7-period-cancel]'))closeModal();});
    $('bc7-period-file').addEventListener('change',async e=>{
      parsed=null;
      const file=e.target.files&&e.target.files[0];if(!file)return;
      const box=$('bc7-period-inventory-preview');box.textContent='Leyendo archivo…';
      try{parsed=await parseInventoryFile(file);box.textContent=parsed.length+' productos leídos de la columna Fin. Pulsa «Revisar inventario y entradas» para relacionarlos con el catálogo.';}
      catch(err){box.innerHTML='<span class="bc7-period-error">'+esc(err.message||err)+'</span>';}
      updateConfirm();
    });
    $('bc7-period-started').addEventListener('change',updateConfirm);
    $('bc7-period-person').addEventListener('change',updateConfirm);
    $('bc7-period-preview').addEventListener('click',previewOpening);
    $('bc7-period-confirm').addEventListener('click',confirmOpening);
    $('bc7-period-start').addEventListener('change',()=>{preview=null;updateConfirm();});
    $('bc7-period-end').addEventListener('change',()=>{preview=null;updateConfirm();});
    $('bc7-period-warehouse').addEventListener('change',()=>{preview=null;updateConfirm();});
    updateConfirm();
  }
  function closeModal(){modal?.remove();modal=null;preview=null;parsed=null;productsByName.clear();}
  function selectedTransferIds(){
    return Array.from(modal.querySelectorAll('[data-bc7-period-transfer]:checked')).map(x=>x.value);
  }
  function updateConfirm(){
    const btn=$('bc7-period-confirm');if(!btn)return;
    const hasUnmappedPositive=!!parsed&&parsed.some(row=>Number(row.cantidad)>0&&!row.producto_id);
    const rootsReady=!!preview&&asArray(preview.productos).length>0;
    const start=$('bc7-period-start')?.value,end=$('bc7-period-end')?.value,started=$('bc7-period-started')?.value;
    btn.disabled=!(preview&&parsed&&parsed.length>0&&rootsReady&&!hasUnmappedPositive&&start&&end&&end>=start&&started&&$('bc7-period-person')?.value&&$('bc7-period-warehouse')?.value);
  }
  async function previewOpening(){
    const result=$('bc7-period-result');const btn=$('bc7-period-preview');
    if(!parsed){result.textContent='Selecciona primero el Excel del inventario anterior.';return;}
    const warehouse=$('bc7-period-warehouse').value,start=$('bc7-period-start').value,end=$('bc7-period-end').value;
    if(!warehouse||!start||!end||end<start){result.textContent='Completa el almacén y un período válido.';return;}
    btn.disabled=true;result.textContent='Consultando catálogo agrupado y transferencias…';
    try{
      preview=await callRpc('bc7_previsualizar_apertura_existente',{p_almacen_id:warehouse,p_fecha_inicio:start,p_fecha_fin:end});
      const products=asArray(preview&&preview.productos);
      if(!products.length)throw new Error('El catálogo no devolvió productos/familias activos para este almacén.');
      productsByName=new Map();
      products.forEach(p=>{const key=norm(p.nombre);if(!productsByName.has(key))productsByName.set(key,[]);productsByName.get(key).push(p);});
      parsed.forEach(row=>{
        const matches=productsByName.get(norm(row.nombre))||[];
        row.producto_id=matches.length===1?String(matches[0].producto_id):'';
        row.omitir=!row.producto_id&&Number(row.cantidad)===0;
      });
      const familyCount=products.filter(p=>p.es_familia===true).length;
      const unmatched=parsed.filter(row=>Number(row.cantidad)>0&&!row.producto_id);
      const tableRows=parsed.map((row,index)=>{
        const options=['<option value="">Selecciona producto/familia…</option>'];
        products.forEach(product=>{
          const id=String(product.producto_id);
          const selected=id===String(row.producto_id)?' selected':'';
          const family=product.es_familia?' · total de familia':'';
          const stockRef=' · stock sistema (referencia): '+Number(product.stock_sistema||0);
          options.push('<option value="'+esc(id)+'"'+selected+'>'+esc(product.nombre+family+stockRef)+'</option>');
        });
        if(row.omitir)options.push('<option value="__omit" selected>Omitir: 0 unidades</option>');
        const selector='<select data-bc7-period-map="'+index+'" aria-label="Relacionar '+esc(row.nombre)+'">'+options.join('')+'</select>';
        const status=row.producto_id?'<span class="bc7-period-ok">Relacionado</span>':(row.omitir?'<span class="bc7-period-muted">Sin stock: omitido</span>':'<span class="bc7-period-error">Pendiente</span>');
        return '<tr><td>'+esc(row.nombre)+'</td><td><b>'+esc(row.cantidad)+'</b></td><td>'+selector+'</td><td>'+status+'</td></tr>';
      }).join('');
      const total=parsed.reduce((sum,row)=>sum+Number(row.cantidad||0),0);
      $('bc7-period-inventory-preview').innerHTML=
        '<b>'+parsed.length+' filas del Excel · '+products.length+' productos/familias en catálogo</b>'+
        '<p class="bc7-period-muted">Total de la columna Fin: <b>'+esc(total)+'</b> unidades. '+familyCount+' familias tienen sabores y se contarán como un solo producto, sin repartir cantidades.</p>'+
        (unmatched.length?'<p class="bc7-period-error">'+unmatched.length+' líneas con cantidad positiva necesitan relación con el catálogo. Si un producto no existe, habrá que darlo de alta antes de abrir la jornada.</p>':'<p class="bc7-period-ok">Todas las cantidades positivas están relacionadas.</p>')+
        '<div class="bc7-period-table-wrap"><table class="bc7-period-table"><thead><tr><th>Nombre del Excel</th><th>Fin</th><th>Producto de BattleCruiser</th><th>Estado</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>';
      modal.querySelectorAll('[data-bc7-period-map]').forEach(select=>{
        select.addEventListener('change',()=>{
          const index=Number(select.getAttribute('data-bc7-period-map'));
          if(!parsed[index])return;
          parsed[index].producto_id=select.value&&select.value!=='__omit'?select.value:'';
          parsed[index].omitir=select.value==='__omit';
          const statusCell=select.closest('tr')?.querySelector('td:last-child');
          if(statusCell)statusCell.innerHTML=parsed[index].producto_id?'<span class="bc7-period-ok">Relacionado</span>':(parsed[index].omitir?'<span class="bc7-period-muted">Sin stock: omitido</span>':'<span class="bc7-period-error">Pendiente</span>');
          updateConfirm();
          const pending=parsed.filter(row=>Number(row.cantidad)>0&&!row.producto_id).length;
          result.textContent=pending?pending+' productos con cantidad positiva necesitan relación.':'Relación completa. Revisa las transferencias antes de confirmar.';
        });
      });
      renderTransfers();
      result.textContent=unmatched.length?'Revisa las relaciones pendientes y las transferencias.':'Previsualización lista. Revisa las transferencias.';
    }catch(e){preview=null;result.textContent=e.message||'No se pudo cargar la previsualización.';}
    finally{btn.disabled=false;updateConfirm();}
  }
  function renderTransfers(){
    const host=$('bc7-period-transfer-list'),rows=asArray(preview&&preview.transferencias);
    if(!rows.length){host.textContent='No hay transferencias completadas hacia este almacén en las fechas elegidas.';return;}
    host.innerHTML=rows.map(t=>{
      const time=String(t.hora_local||'').slice(0,5),date=String(t.fecha_local||'').slice(0,10);
      if(date==='2026-11-09'&&time==='07:15'){
        return '<div class="bc7-period-transfer"><span><b>Entrada 07:15 · registro de jornada anterior</b><br>Ya incluida en el inventario final de Adriana (7–8 nov.); no se vinculará.</span><small>No sumar</small></div>';
      }
      const suggested=date==='2026-11-09'&&(time==='09:07'||time==='15:16');
      return '<label class="bc7-period-transfer"><input type="checkbox" data-bc7-period-transfer value="'+esc(t.id)+'" '+(suggested?'checked':'')+'><span><b>'+esc(date)+' · '+esc(time)+'</b><br>'+esc(t.origen||'Almacén de origen')+' · '+esc(t.lineas||0)+' líneas</span><small>'+esc(t.unidades||0)+' unidades</small></label>';
    }).join('');
  }
  async function confirmOpening(){
    const btn=$('bc7-period-confirm'),result=$('bc7-period-result');
    const start=$('bc7-period-start').value,end=$('bc7-period-end').value;
    const started=$('bc7-period-started').value;
    const person=$('bc7-period-person').value,warehouse=$('bc7-period-warehouse').value;
    if(!parsed||!preview||!person||!started){result.textContent='Faltan datos para confirmar.';return;}
    const totals=new Map(asArray(preview.productos).map(product=>[String(product.producto_id),0]));
    parsed.forEach(row=>{
      if(row.producto_id&&totals.has(String(row.producto_id))){
        totals.set(String(row.producto_id),totals.get(String(row.producto_id))+Number(row.cantidad||0));
      }
    });
    const lines=asArray(preview.productos).map(product=>({
      producto_id:String(product.producto_id),cantidad:String(totals.get(String(product.producto_id))||0)
    }));
    const ids=selectedTransferIds();
    const label=peopleName(person);
    const sourceTotal=parsed.reduce((sum,row)=>sum+Number(row.cantidad||0),0);
    if(!confirm('Vas a abrir la jornada '+start+' a '+end+' con responsable '+label+'.\nSe importarán '+parsed.length+' filas de la columna Fin ('+sourceTotal+' unidades), agrupadas en '+lines.length+' productos/familias. Se vincularán '+ids.length+' transferencias existentes. La entrada de 07:15 no se repetirá y el stock general no se modificará. ¿Confirmas?'))return;
    btn.disabled=true;result.textContent='Registrando apertura…';
    try{
      const data=await callRpc('bc7_admin_abrir_jornada_existente',{
        p_almacen_id:warehouse,p_fecha_inicio:start,p_fecha_fin:end,
        p_inicio_real_at:havanaTimestamp(started),p_responsable_id:person,
        p_lineas:lines,p_transferencias_ids:ids,
        p_observacion:$('bc7-period-note').value.trim()||null
      });
      result.innerHTML='<span class="bc7-period-ok">Jornada registrada. ID: '+esc(data.sesion_id)+'</span>';
      notify('Jornada abierta y vinculada correctamente. El stock global no se modificó.','ok');
      const sessionId=data&&data.sesion_id;
      closeModal();
      const refresh=document.querySelector('[data-bc7-refresh]');if(refresh)refresh.click();
      if(sessionId&&window.__BC7_JORNADA__?.openForSession)await window.__BC7_JORNADA__.openForSession(sessionId);
    }catch(e){result.textContent=e.message||'No se pudo registrar la jornada.';btn.disabled=false;}
  }
  function peopleName(id){
    const list=asArray(window.__BC_M29_STAFF_CACHE__).concat(asArray(window._cache&&window._cache.usuarios));
    const p=list.find(x=>x&&String(x.id)===String(id));
    return p?(p.nombre||p.nombre_usuario||p.email||'responsable'):'responsable seleccionada';
  }
  async function open(){
    if(!navigator.onLine){notify('Conecta el dispositivo para registrar una apertura.','error');return;}
    if(!currentWarehouse()){notify('Selecciona La Cueva en el almacén del panel administrativo antes de abrir el formulario.','error');return;}
    try{
      const people=await loadPeople();
      if(!people.length)throw new Error('No se pudo cargar la lista de dependientas activas.');
      showModal(people);
      const person=$('bc7-period-person');
      const sheyla=people.find(p=>norm(p.nombre||p.nombre_usuario||'').includes('sheyla'));
      if(sheyla)person.value=sheyla.id;
    }catch(e){notify(e.message||'No se pudo abrir el formulario.','error');}
  }
  document.addEventListener('click',e=>{
    const b=e.target&&e.target.closest?e.target.closest('#bc7-period-open-button'):null;
    if(b){e.preventDefault();open();}
  });
  function boot(){
    insertButton();
    const observer=new MutationObserver(insertButton);
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
