// BattleCruiser — M55: Importación masiva de productos (CSV / XLSX / XLS)
// Owner único: este módulo (botón, modal, parser, validación, importación).
// Reutiliza ejecutarOperacion("producto" | "producto_actualizar") — misma lógica de negocio.
// NO crea RPC bulk, NO modifica M44/M47, NO importa offline.
(function(){
  'use strict';
  if(window.__bcM55ProductosImport)return;
  window.__bcM55ProductosImport=true;

  const MAX_ROWS=2000;
  const PREVIEW_ROWS=12;
  const FIELDS=[
    {key:'nombre',label:'Nombre',required:true,aliases:['nombre','name','producto','product','descripcion','descripción']},
    {key:'categoria',label:'Categoría',required:false,aliases:['categoria','categoría','category','cat']},
    {key:'unidad',label:'Unidad',required:false,aliases:['unidad','unit','uom','medida']},
    {key:'precio_normal',label:'Precio normal',required:true,aliases:['precio_normal','precio normal','precio','price','pvp','precio_venta']},
    {key:'precio_mayorista',label:'Precio mayorista',required:false,aliases:['precio_mayorista','precio mayorista','mayorista','wholesale']},
    {key:'activo',label:'Activo',required:false,aliases:['activo','active','estado','status']}
  ];
  const STYLE_ID='bc-m55-import-css';
  let state=null; // {fileName,headers,rows,map,policy,validated}

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
  function canCreate(){return typeof tienePermiso==='function'&&tienePermiso('productos','crear')}
  function canEdit(){return typeof tienePermiso==='function'&&tienePermiso('productos','editar')}
  function online(){return typeof estaRealmenteDesconectado==='function'? !estaRealmenteDesconectado(): navigator.onLine}

  function injectCss(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #tab-productos .bc-m55-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
      #tab-productos .bc-m55-btn{padding:8px 14px;border-radius:8px;border:1px solid rgba(212,176,92,.28);background:rgba(212,176,92,.1);color:var(--text);font-size:13px;cursor:pointer;font-weight:600}
      #tab-productos .bc-m55-btn:hover{border-color:var(--gold);color:var(--gold-bright)}
      #tab-productos .bc-m55-btn.secondary{background:transparent;font-weight:500;color:var(--mist)}
      .bc-m55-overlay{position:fixed;inset:0;background:rgba(6,14,11,.78);z-index:9200;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto}
      .bc-m55-modal{background:var(--stone);border:1px solid rgba(212,176,92,.3);border-radius:14px;width:min(920px,100%);margin:24px auto;padding:18px 18px 16px;box-shadow:0 24px 60px rgba(0,0,0,.55)}
      .bc-m55-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
      .bc-m55-head h3{margin:0;font-size:18px;color:var(--gold)}
      .bc-m55-head p{margin:4px 0 0;font-size:12px;color:var(--mist)}
      .bc-m55-close{background:transparent;border:none;color:var(--mist);font-size:22px;cursor:pointer;line-height:1}
      .bc-m55-step{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mist);margin-bottom:10px;font-family:'IBM Plex Mono',monospace}
      .bc-m55-drop{border:1px dashed rgba(212,176,92,.35);border-radius:10px;padding:22px;text-align:center;background:var(--void);color:var(--mist);font-size:13px}
      .bc-m55-drop input{display:block;margin:12px auto 0;max-width:100%}
      .bc-m55-meta{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0;font-size:12.5px}
      .bc-m55-chip{background:var(--void);border:1px solid rgba(212,176,92,.18);border-radius:8px;padding:6px 10px;color:var(--text)}
      .bc-m55-chip.warn{border-color:rgba(212,176,92,.4);color:var(--gold-bright)}
      .bc-m55-chip.err{border-color:rgba(196,74,90,.4);color:var(--wine)}
      .bc-m55-chip.ok{border-color:rgba(159,196,173,.4);color:var(--sage)}
      .bc-m55-table-wrap{overflow-x:auto;max-height:280px;border:1px solid rgba(212,176,92,.15);border-radius:8px;margin:10px 0}
      .bc-m55-table{width:100%;border-collapse:collapse;font-size:12px;min-width:480px}
      .bc-m55-table th,.bc-m55-table td{padding:6px 8px;border-bottom:1px solid rgba(212,176,92,.1);text-align:left;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}
      .bc-m55-table th{color:var(--mist);font-family:'IBM Plex Mono',monospace;font-size:10px;text-transform:uppercase;position:sticky;top:0;background:var(--stone-2)}
      .bc-m55-map{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin:10px 0}
      .bc-m55-map label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mist);text-transform:uppercase}
      .bc-m55-map select{padding:7px 8px;background:var(--void);border:1px solid rgba(212,176,92,.2);border-radius:6px;color:var(--text);font-size:13px}
      .bc-m55-policy{display:flex;flex-direction:column;gap:6px;margin:10px 0;font-size:13px}
      .bc-m55-policy label{display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--text)}
      .bc-m55-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px}
      .bc-m55-actions button{padding:9px 14px;border-radius:8px;border:1px solid rgba(212,176,92,.28);background:rgba(212,176,92,.12);color:var(--text);cursor:pointer;font-size:13px;font-weight:600}
      .bc-m55-actions button.ghost{background:transparent;color:var(--mist);font-weight:500}
      .bc-m55-actions button:disabled{opacity:.45;cursor:default}
      .bc-m55-msg{font-size:12.5px;min-height:16px;margin-top:8px;color:var(--mist)}
      .bc-m55-msg.err{color:var(--wine)}
      .bc-m55-msg.ok{color:var(--sage)}
      .bc-m55-progress{margin:10px 0;font-size:12.5px;color:var(--mist)}
      .bc-m55-errors{max-height:160px;overflow-y:auto;font-size:12px;background:var(--void);border-radius:8px;padding:8px;margin-top:8px}
      .bc-m55-errors li{margin:2px 0;color:var(--wine)}
    `;
    document.head.appendChild(s);
  }

  function ensureButton(){
    const tab=document.getElementById('tab-productos');
    if(!tab||tab.querySelector('.bc-m55-bar'))return;
    if(!canCreate()&&!canEdit())return;
    const form=document.getElementById('form-producto');
    const bar=document.createElement('div');
    bar.className='bc-m55-bar';
    bar.innerHTML='<button type="button" class="bc-m55-btn" id="bc-m55-open">Importar productos</button><button type="button" class="bc-m55-btn secondary" id="bc-m55-template">Descargar plantilla CSV</button>';
    if(form)form.after(bar);else tab.prepend(bar);
    document.getElementById('bc-m55-open').onclick=openModal;
    document.getElementById('bc-m55-template').onclick=downloadTemplate;
  }

  function downloadTemplate(){
    const header='nombre,categoria,unidad,precio_normal,precio_mayorista,activo\n';
    const sample='Ejemplo Agua 500ml,Bebidas,unidad,1.50,1.20,true\n';
    const blob=new Blob([header+sample],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='plantilla_productos_battlecruiser.csv';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  }

  function closeModal(){
    document.getElementById('bc-m55-overlay')?.remove();
    state=null;
  }

  function openModal(){
    if(!online()){
      if(typeof setMsg==='function')setMsg('msg-productos','❌ No se puede importar productos sin Internet.',false);
      return;
    }
    if(!canCreate()&&!canEdit()){
      if(typeof setMsg==='function')setMsg('msg-productos','Sin permiso para crear o editar productos.',false);
      return;
    }
    document.getElementById('bc-m55-overlay')?.remove();
    state={fileName:'',headers:[],rows:[],map:{},policy:'create_only',validated:null};
    const ov=document.createElement('div');
    ov.id='bc-m55-overlay';ov.className='bc-m55-overlay';
    ov.innerHTML=`<div class="bc-m55-modal" role="dialog" aria-label="Importar productos">
      <div class="bc-m55-head"><div><h3>Importar productos</h3><p>Desde Excel (.xlsx / .xls) o CSV — con previsualización y confirmación</p></div>
      <button type="button" class="bc-m55-close" id="bc-m55-x" aria-label="Cerrar">×</button></div>
      <div id="bc-m55-body"></div>
      <p class="bc-m55-msg" id="bc-m55-msg"></p>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#bc-m55-x').onclick=closeModal;
    ov.onclick=e=>{if(e.target===ov)closeModal()};
    renderStepFile();
  }

  function setMsgLocal(text,ok){
    const el=document.getElementById('bc-m55-msg');
    if(!el)return;
    el.textContent=text||'';
    el.className='bc-m55-msg'+(ok===true?' ok':ok===false?' err':'');
  }

  function renderStepFile(){
    const body=document.getElementById('bc-m55-body');
    body.innerHTML=`<div class="bc-m55-step">Paso 1 — Archivo</div>
      <div class="bc-m55-drop">
        <div>Seleccioná un archivo tabular. No se insertará nada hasta que confirmes.</div>
        <div style="margin-top:6px;font-size:11px">Formatos: .csv · .xlsx · .xls · máx. ${MAX_ROWS} filas</div>
        <input type="file" id="bc-m55-file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      </div>
      <div class="bc-m55-actions"><button type="button" class="ghost" id="bc-m55-cancel">Cancelar</button></div>`;
    document.getElementById('bc-m55-cancel').onclick=closeModal;
    document.getElementById('bc-m55-file').onchange=async function(){
      const f=this.files&&this.files[0];
      if(!f)return;
      setMsgLocal('Leyendo archivo…');
      try{
        await parseFile(f);
        setMsgLocal('');
        renderStepMap();
      }catch(err){
        setMsgLocal(err.message||'No se pudo leer el archivo.',false);
      }
    };
  }

  async function parseFile(file){
    const name=(file.name||'').toLowerCase();
    state.fileName=file.name||'archivo';
    if(name.endsWith('.csv')||file.type==='text/csv'||file.type==='text/plain'){
      const text=await file.text();
      const parsed=parseCsv(text);
      state.headers=parsed.headers;
      state.rows=parsed.rows;
    }else if(name.endsWith('.xlsx')||name.endsWith('.xls')){
      const XLSX=await loadSheetJS();
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:'array',raw:false});
      const sheet=wb.Sheets[wb.SheetNames[0]];
      if(!sheet)throw new Error('El libro no tiene hojas.');
      const aoa=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
      if(!aoa.length)throw new Error('Archivo vacío.');
      state.headers=(aoa[0]||[]).map(h=>String(h==null?'':h).trim());
      state.rows=aoa.slice(1).filter(r=>r.some(c=>String(c||'').trim()!=='')).map(r=>{
        const o={};
        state.headers.forEach((h,i)=>{o[h]=r[i]==null?'':String(r[i]).trim()});
        return o;
      });
    }else{
      throw new Error('Formato no soportado. Usá CSV, XLSX o XLS.');
    }
    if(!state.headers.length)throw new Error('No se detectaron columnas (encabezados).');
    if(!state.rows.length)throw new Error('El archivo no tiene filas de datos.');
    if(state.rows.length>MAX_ROWS)throw new Error('El archivo supera el límite de '+MAX_ROWS+' filas ('+state.rows.length+').');
    state.map=autoMap(state.headers);
  }

  function parseCsv(text){
    if(!text||!String(text).trim())throw new Error('Archivo vacío.');
    let t=String(text).replace(/^\uFEFF/,'');
    const firstLine=(t.split(/\r?\n/).find(l=>l.trim())||'');
    const commas=(firstLine.match(/,/g)||[]).length;
    const semis=(firstLine.match(/;/g)||[]).length;
    const delim=semis>commas?';':',';
    const lines=[];
    let cur='',inQ=false;
    for(let i=0;i<t.length;i++){
      const c=t[i];
      if(c==='"'){
        if(inQ&&t[i+1]==='"'){cur+='"';i++}
        else inQ=!inQ;
      }else if((c==='\n'||(c==='\r'&&t[i+1]==='\n'))&&!inQ){
        if(c==='\r')i++;
        lines.push(cur);cur='';
      }else if(c==='\r'&&!inQ){
        lines.push(cur);cur='';
      }else cur+=c;
    }
    if(cur.length||t.endsWith('\n'))lines.push(cur);
    const splitLine=line=>{
      const cells=[];let cell='',q=false;
      for(let i=0;i<line.length;i++){
        const c=line[i];
        if(c==='"'){
          if(q&&line[i+1]==='"'){cell+='"';i++}else q=!q;
        }else if(c===delim&&!q){cells.push(cell);cell=''}
        else cell+=c;
      }
      cells.push(cell);
      return cells.map(x=>x.trim());
    };
    const nonEmpty=lines.filter(l=>l.trim()!=='');
    if(!nonEmpty.length)throw new Error('Archivo vacío.');
    const headers=splitLine(nonEmpty[0]).map(h=>h.replace(/^"|"$/g,''));
    const rows=[];
    for(let i=1;i<nonEmpty.length;i++){
      const cells=splitLine(nonEmpty[i]);
      if(cells.every(c=>!c))continue;
      const o={};
      headers.forEach((h,idx)=>{o[h]=cells[idx]==null?'':cells[idx]});
      rows.push(o);
    }
    return{headers,rows};
  }

  function loadSheetJS(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('SheetJS no disponible'));
      s.onerror=()=>reject(new Error('No se pudo cargar el lector de Excel (CDN). Probá CSV o revisá la conexión.'));
      document.head.appendChild(s);
    });
  }

  function autoMap(headers){
    const map={};
    const used=new Set();
    FIELDS.forEach(f=>{
      const hit=headers.find(h=>{
        const nh=norm(h);
        return f.aliases.some(a=>nh===norm(a))&&!used.has(h);
      });
      if(hit){map[f.key]=hit;used.add(hit)}
      else map[f.key]='';
    });
    return map;
  }

  function renderStepMap(){
    const body=document.getElementById('bc-m55-body');
    const opts='<option value="">— no mapear —</option>'+state.headers.map(h=>'<option value="'+esc(h)+'">'+esc(h)+'</option>').join('');
    const mapHtml=FIELDS.map(f=>{
      const sel=state.map[f.key]||'';
      const opts2=state.headers.map(h=>'<option value="'+esc(h)+'"'+(h===sel?' selected':'')+'>'+esc(h)+'</option>').join('');
      return '<label>'+esc(f.label)+(f.required?' *':'')+'<select data-field="'+f.key+'"><option value="">— no mapear —</option>'+opts2+'</select></label>';
    }).join('');
    const previewHeaders=state.headers;
    const previewRows=state.rows.slice(0,PREVIEW_ROWS);
    body.innerHTML=`<div class="bc-m55-step">Paso 2 — Mapeo y previsualización</div>
      <div class="bc-m55-meta">
        <span class="bc-m55-chip">Archivo: ${esc(state.fileName)}</span>
        <span class="bc-m55-chip">Filas: ${state.rows.length}</span>
        <span class="bc-m55-chip">Columnas: ${state.headers.length}</span>
      </div>
      <div class="bc-m55-map">${mapHtml}</div>
      <div class="bc-m55-table-wrap"><table class="bc-m55-table"><thead><tr>${previewHeaders.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead>
      <tbody>${previewRows.map(r=>'<tr>'+previewHeaders.map(h=>'<td>'+esc(r[h])+'</td>').join('')+'</tr>').join('')}</tbody></table></div>
      <p class="muted" style="font-size:11px">Mostrando ${Math.min(PREVIEW_ROWS,state.rows.length)} de ${state.rows.length} filas</p>
      <div class="bc-m55-step" style="margin-top:12px">Política de duplicados (clave: nombre normalizado)</div>
      <div class="bc-m55-policy">
        <label><input type="radio" name="bc-m55-pol" value="create_only" checked> Solo crear nuevos (omitir si el nombre ya existe)</label>
        <label><input type="radio" name="bc-m55-pol" value="update_existing" ${canEdit()?'':'disabled'}> Solo actualizar existentes (omitir nombres nuevos)</label>
        <label><input type="radio" name="bc-m55-pol" value="create_and_update" ${canEdit()&&canCreate()?'':'disabled'}> Crear nuevos y actualizar existentes</label>
      </div>
      <div class="bc-m55-actions">
        <button type="button" class="ghost" id="bc-m55-back1">Volver</button>
        <button type="button" id="bc-m55-validate">Validar filas</button>
      </div>`;
    body.querySelectorAll('select[data-field]').forEach(sel=>{
      sel.onchange=()=>{state.map[sel.dataset.field]=sel.value};
    });
    document.getElementById('bc-m55-back1').onclick=renderStepFile;
    document.getElementById('bc-m55-validate').onclick=()=>{
      const pol=body.querySelector('input[name="bc-m55-pol"]:checked');
      state.policy=pol?pol.value:'create_only';
      if(!state.map.nombre){setMsgLocal('Debés mapear la columna Nombre.',false);return}
      if(!state.map.precio_normal){setMsgLocal('Debés mapear la columna Precio normal.',false);return}
      state.validated=validateAll();
      renderStepConfirm();
    };
  }

  function parsePrice(raw){
    if(raw==null||String(raw).trim()==='')return{ok:false,empty:true};
    let s=String(raw).trim().replace(/[$€£\s]/g,'');
    if(/^\d{1,3}(\.\d{3})+,\d+$/.test(s))s=s.replace(/\./g,'').replace(',','.');
    else if(/^\d+,\d+$/.test(s))s=s.replace(',','.');
    else if(/^\d{1,3}(,\d{3})+\.\d+$/.test(s))s=s.replace(/,/g,'');
    const n=Number(s);
    if(!Number.isFinite(n))return{ok:false,empty:false};
    if(n<0)return{ok:false,empty:false,neg:true};
    return{ok:true,value:Math.round(n*100)/100};
  }

  function parseActivo(raw){
    if(raw==null||String(raw).trim()==='')return true;
    const v=norm(raw);
    if(['0','false','no','inactivo','inactive','n','off'].includes(v))return false;
    if(['1','true','si','sí','yes','activo','active','y','on'].includes(v))return true;
    return null;
  }

  function findCategoriaId(name){
    if(!name||!String(name).trim())return{id:null,ok:true,empty:true};
    const cats=(_cache&&_cache.categorias)||[];
    const n=norm(name);
    const hit=cats.find(c=>norm(c.nombre)===n);
    if(hit)return{id:hit.id,ok:true};
    return{id:null,ok:false,name:String(name).trim()};
  }

  function existingByName(){
    const map=new Map();
    ((_cache&&_cache.productos)||[]).forEach(p=>{
      const k=norm(p.nombre);
      if(k&&!map.has(k))map.set(k,p);
    });
    return map;
  }

  function validateAll(){
    const existing=existingByName();
    const results=[];
    const seenInFile=new Map();
    state.rows.forEach((row,idx)=>{
      const get=k=>{const col=state.map[k];return col?row[col]:''};
      const errors=[];
      const warnings=[];
      const nombre=String(get('nombre')||'').trim();
      if(!nombre)errors.push('Nombre vacío');
      const pn=parsePrice(get('precio_normal'));
      if(pn.empty)errors.push('Precio normal vacío');
      else if(pn.neg)errors.push('Precio normal negativo');
      else if(!pn.ok)errors.push('Precio normal inválido');
      else if(!(pn.value>0))errors.push('Precio normal debe ser mayor a 0');
      let pmVal=null;
      const pmRaw=get('precio_mayorista');
      if(pmRaw!=null&&String(pmRaw).trim()!==''){
        const pm=parsePrice(pmRaw);
        if(!pm.ok)errors.push('Precio mayorista inválido');
        else if(pm.neg)errors.push('Precio mayorista negativo');
        else pmVal=pm.value;
      }else warnings.push('Precio mayorista ausente');
      const cat=findCategoriaId(get('categoria'));
      if(!cat.ok)errors.push('Categoría no encontrada: '+cat.name);
      const unidad=String(get('unidad')||'').trim()||null;
      const act=parseActivo(get('activo'));
      if(act===null)errors.push('Valor de Activo no reconocido');
      const key=norm(nombre);
      const dupFile=key&&seenInFile.has(key);
      if(dupFile)warnings.push('Nombre duplicado en el archivo (fila '+(seenInFile.get(key)+1)+')');
      if(key)seenInFile.set(key,idx);
      const exist=key?existing.get(key):null;
      let action='create';
      if(exist){
        if(state.policy==='create_only'){action='skip';warnings.push('Ya existe — se omitirá')}
        else if(state.policy==='update_existing'||state.policy==='create_and_update'){
          action='update';
          if(!canEdit())errors.push('Sin permiso para editar');
        }
      }else{
        if(state.policy==='update_existing'){action='skip';warnings.push('No existe — se omitirá')}
        else if(!canCreate())errors.push('Sin permiso para crear');
      }
      const status=errors.length?'ERROR':(action==='skip'?'SKIP':'VALID');
      results.push({
        idx,nombre,unidad,categoria_id:cat.id,precio_normal:pn.ok?pn.value:null,precio_mayorista:pmVal,
        activo:act===null?true:act,existingId:exist?exist.id:null,action,status,errors,warnings
      });
    });
    return results;
  }

  function renderStepConfirm(){
    const v=state.validated;
    const valid=v.filter(r=>r.status==='VALID');
    const errs=v.filter(r=>r.status==='ERROR');
    const skips=v.filter(r=>r.status==='SKIP');
    const creates=valid.filter(r=>r.action==='create').length;
    const updates=valid.filter(r=>r.action==='update').length;
    const warnCount=v.reduce((n,r)=>n+r.warnings.length,0);
    const body=document.getElementById('bc-m55-body');
    const errList=errs.slice(0,40).map(r=>'<li>Fila '+(r.idx+1)+' ('+esc(r.nombre||'sin nombre')+'): '+esc(r.errors.join('; '))+'</li>').join('');
    body.innerHTML=`<div class="bc-m55-step">Paso 3 — Confirmación</div>
      <div class="bc-m55-meta">
        <span class="bc-m55-chip ok">A importar: ${valid.length}</span>
        <span class="bc-m55-chip">Crear: ${creates}</span>
        <span class="bc-m55-chip">Actualizar: ${updates}</span>
        <span class="bc-m55-chip">Omitir: ${skips.length}</span>
        <span class="bc-m55-chip err">Errores: ${errs.length}</span>
        <span class="bc-m55-chip warn">Advertencias: ${warnCount}</span>
      </div>
      <p style="font-size:13px;color:var(--text)">Se procesarán <b>${valid.length}</b> filas válidas. Las ${errs.length} con error crítico <b>no</b> se importarán.</p>
      ${errs.length?'<ul class="bc-m55-errors">'+errList+(errs.length>40?'<li>… y '+(errs.length-40)+' más</li>':'')+'</ul>':''}
      <div class="bc-m55-actions">
        <button type="button" class="ghost" id="bc-m55-back2">Volver al mapeo</button>
        <button type="button" id="bc-m55-run" ${valid.length?''':'disabled'}>Confirmar importación</button>
      </div>
      <div class="bc-m55-progress" id="bc-m55-progress"></div>`;
    document.getElementById('bc-m55-back2').onclick=renderStepMap;
    document.getElementById('bc-m55-run').onclick=runImport;
  }

  async function runImport(){
    if(!online()){setMsgLocal('❌ No se puede importar productos sin Internet.',false);return}
    const valid=state.validated.filter(r=>r.status==='VALID');
    const btn=document.getElementById('bc-m55-run');
    const prog=document.getElementById('bc-m55-progress');
    if(btn)btn.disabled=true;
    let created=0,updated=0,failed=0;
    const failRows=[];
    for(let i=0;i<valid.length;i++){
      const r=valid[i];
      if(prog)prog.textContent='Importando '+(i+1)+' / '+valid.length+'…';
      try{
        if(r.action==='create'){
          const res=await ejecutarOperacion('producto',{
            p_nombre:r.nombre,
            p_categoria_id:r.categoria_id,
            p_unidad:r.unidad,
            p_precio_normal:r.precio_normal,
            p_precio_mayorista:r.precio_mayorista
          });
          if(!res.ok){failed++;failRows.push({idx:r.idx,nombre:r.nombre,msg:(res.error&&res.error.message)||'Error al crear'});continue}
          if(res.offline){failed++;failRows.push({idx:r.idx,nombre:r.nombre,msg:'Se encoló offline — la importación requiere conexión estable'});continue}
          created++;
          if(r.activo===false&&res.data&&typeof ejecutarOperacion==='function'){
            await ejecutarOperacion('producto_estado',{p_producto_id:res.data,p_activo:false});
          }
        }else if(r.action==='update'){
          const res=await ejecutarOperacion('producto_actualizar',{
            p_producto_id:r.existingId,
            p_nombre:r.nombre,
            p_categoria_id:r.categoria_id,
            p_unidad:r.unidad,
            p_precio_normal:r.precio_normal,
            p_precio_mayorista:r.precio_mayorista
          });
          if(!res.ok){failed++;failRows.push({idx:r.idx,nombre:r.nombre,msg:(res.error&&res.error.message)||'Error al actualizar'});continue}
          if(res.offline){failed++;failRows.push({idx:r.idx,nombre:r.nombre,msg:'Se encoló offline — requiere conexión'});continue}
          updated++;
        }
      }catch(e){
        failed++;
        failRows.push({idx:r.idx,nombre:r.nombre,msg:e.message||String(e)});
      }
    }
    if(typeof refrescarProductos==='function'){
      try{await refrescarProductos()}catch(_){}
    }
    const skipped=state.validated.filter(r=>r.status==='SKIP').length;
    const rejected=state.validated.filter(r=>r.status==='ERROR').length;
    renderStepResult({created,updated,failed,skipped,rejected,failRows,fileName:state.fileName,total:state.rows.length});
  }

  function renderStepResult(s){
    const body=document.getElementById('bc-m55-body');
    const fails=s.failRows.slice(0,50).map(f=>'<li>Fila '+(f.idx+1)+' ('+esc(f.nombre)+'): '+esc(f.msg)+'</li>').join('');
    body.innerHTML=`<div class="bc-m55-step">Resultado</div>
      <div class="bc-m55-meta">
        <span class="bc-m55-chip ok">Creados: ${s.created}</span>
        <span class="bc-m55-chip ok">Actualizados: ${s.updated}</span>
        <span class="bc-m55-chip">Omitidos: ${s.skipped}</span>
        <span class="bc-m55-chip err">Rechazados (validación): ${s.rejected}</span>
        <span class="bc-m55-chip err">Fallidos (servidor): ${s.failed}</span>
      </div>
      <p style="font-size:12.5px;color:var(--mist)">Archivo: ${esc(s.fileName)} · Filas leídas: ${s.total}</p>
      ${s.failRows.length?'<ul class="bc-m55-errors">'+fails+'</ul>':''}
      <div class="bc-m55-actions">
        <button type="button" id="bc-m55-done">Cerrar</button>
      </div>`;
    document.getElementById('bc-m55-done').onclick=()=>{
      closeModal();
      if(typeof setMsg==='function'){
        setMsg('msg-productos','Importación: '+s.created+' creados, '+s.updated+' actualizados, '+s.failed+' fallidos.',s.failed===0);
      }
    };
    setMsgLocal('Importación finalizada.',s.failed===0);
  }

  function boot(){
    injectCss();
    ensureButton();
    // Reintentar si el tab se monta tarde o permisos cargan después
    setTimeout(ensureButton,800);
    setTimeout(ensureButton,2000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,600));
  else setTimeout(boot,600);
})();
