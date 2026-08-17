from pathlib import Path
import subprocess

BASE='bebd6ea9ba6fb32c63deb5f0728c0de503b76551'

def sh(*args, capture=False):
    return subprocess.check_output(args, text=True) if capture else subprocess.check_call(args)

def replace_once(path, old, new, label):
    p=Path(path); s=p.read_text()
    if old not in s: raise RuntimeError(f'{label}: anchor not found')
    p.write_text(s.replace(old,new,1))

def append_added_tests(head,label):
    patch=sh('git','diff','--unified=0',BASE,head,'--','test/b2.3-centro-control.test.js',capture=True)
    lines=[]
    for line in patch.splitlines(True):
        if line.startswith('+++'): continue
        if line.startswith('+'): lines.append(line[1:])
    with open('test/b2.3-centro-control.test.js','a',encoding='utf-8') as f: f.writelines(lines)

# R3: merge feature directly into the current main implementation, preserving R1/R2/R4.
p=Path('public/app.js'); s=p.read_text()
replace_once('public/app.js','''    <div class="resumen-card ${bajoMinimo.length ? "alerta" : ""}"><div class="valor">${bajoMinimo.length}</div><div class="etiqueta">Bajo mínimo</div></div>''','''    <div class="resumen-card ${bajoMinimo.length ? "alerta resumen-card-accion" : ""}" ${bajoMinimo.length ? 'data-ir-tab="inventario" role="button" tabindex="0"' : ""}><div class="valor">${bajoMinimo.length}</div><div class="etiqueta">Bajo mínimo</div>${bajoMinimo.length ? '<div class="muted">Tocá para ver inventario</div>' : ""}</div>''','R3 card')
old='''    } else {
      alertasEl.innerHTML = "";
      bajoMinimo.forEach((s) => {
        const div = document.createElement("div");
        div.className = "lista-item";
        div.innerHTML = `<span>${s.productos.nombre} <span class="muted">· ${s.almacenes.nombre}</span></span>
          <span class="muted" style="color:var(--wine)">${money(s.cantidad)} ⚠</span>`;
        alertasEl.appendChild(div);
      });
    }
  }'''
new='''    } else {
      alertasEl.innerHTML = "";
      const cab = document.createElement("div");
      cab.className = "lista-item alerta-cabecera";
      cab.innerHTML = '<span class="cc-asunto-tipo">' + bajoMinimo.length + ' producto(s) bajo mínimo</span>' + '<button type="button" class="cc-accion alerta-ir-btn" data-ir-tab="inventario">Ver inventario</button>';
      alertasEl.appendChild(cab);
      bajoMinimo.forEach((s) => {
        const div = document.createElement("div");
        div.className = "lista-item alerta-item";
        div.setAttribute("data-ir-tab", "inventario"); div.setAttribute("role", "button"); div.setAttribute("tabindex", "0");
        div.innerHTML = `<span>${s.productos.nombre} <span class="muted">· ${s.almacenes.nombre}</span></span><span class="muted" style="color:var(--wine)">${money(s.cantidad)} ⚠</span>`;
        alertasEl.appendChild(div);
      });
    }
  }'''
replace_once('public/app.js',old,new,'R3 alert block')
marker='// ---- Navegación por tabs ----'
helper='''function irATab(tab) { if (!tab) return; const btn=document.querySelector('.tab-btn[data-tab="'+tab+'"]'); if (btn) btn.click(); }\n\n'''
if 'function irATab(tab)' not in s: s=s.replace(marker,helper+marker,1)
marker2='// ---- Menú lateral desplegable — reemplaza los tabs horizontales ----'
listener='''safeInit("resumen-alertas-accion",()=>{const panel=document.getElementById("tab-resumen");if(!panel)return;const manejar=target=>{const a=target.closest("[data-ir-tab]");if(a)irATab(a.getAttribute("data-ir-tab"));};panel.addEventListener("click",e=>manejar(e.target));panel.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){manejar(e.target);if(e.target.closest("[data-ir-tab]"))e.preventDefault();}});});\n\n'''
if 'safeInit("resumen-alertas-accion"' not in s: s=s.replace(marker2,listener+marker2,1)
p.write_text(s)

# R3 clean CSS.
p=Path('public/style.css'); s=p.read_text(); marker='.resumen-card.alerta .valor { color: var(--wine); }'
css='''.resumen-card-accion{cursor:pointer;transition:transform .08s ease}.resumen-card-accion:hover{transform:translateY(-1px)}.resumen-card-accion:focus-visible{outline:2px solid var(--gold);outline-offset:2px}.alerta-item{cursor:pointer;transition:background .08s ease}.alerta-item:hover{background:rgba(201,162,77,.07)}.alerta-item:focus-visible{outline:2px solid var(--gold);outline-offset:2px}.alerta-cabecera{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(125,24,24,.06)}.alerta-cabecera .cc-asunto-tipo{font-size:11px;color:var(--wine)}\n'''
if '.resumen-card-accion' not in s: s=s.replace(marker,marker+'\n'+css,1)
p.write_text(s)

sh('git','add','public/app.js','public/style.css'); sh('git','commit','-m','integrate R3: actionable low-stock alerts')

# R5: its non-test files apply cleanly and add searchable sales history.
patch=sh('git','diff','--binary',BASE,'8b38f00384626b25b3f6adcd622aec096f05b65c','--','public/app.js','public/index.html','public/style.css',capture=True)
Path('/tmp/r5.patch').write_text(patch); sh('git','apply','--3way','--index','/tmp/r5.patch'); sh('git','commit','-m','integrate R5: searchable sales history')

# R7: add detail/audit while preserving R5 search renderer.
p=Path('public/app.js'); s=p.read_text()
old='''    div.className = "lista-item";
    div.innerHTML = `<span>${v.almacenes ? v.almacenes.nombre : "—"} <span class="muted">· #${v.id ? idCorto(v.id) : "—"}</span></span>
      <span class="muted">${fechaCorta(v.fecha)} · $${money(v.total)}</span>`;'''
new='''    div.className = "lista-item lista-item-accion venta-item";
    div.setAttribute("data-venta-id", v.id || ""); div.setAttribute("role","button"); div.setAttribute("tabindex","0");
    div.innerHTML = `<span>${v.almacenes ? v.almacenes.nombre : "—"} <span class="muted">· #${v.id ? idCorto(v.id) : "—"}</span></span><span class="muted">${fechaCorta(v.fecha)} · $${money(v.total)}</span>`;'''
replace_once('public/app.js',old,new,'R7 sales row')
marker='// Un solo listener delegado para +/-, edición directa y "Quitar" dentro del\n// carrito'
listener='''safeInit("ventas-historial-detalle",()=>{const lista=document.getElementById("lista-ventas");if(!lista)return;const abrir=target=>{const item=target.closest(".venta-item[data-venta-id]");if(item&&item.getAttribute("data-venta-id"))mostrarDetalleVenta(item.getAttribute("data-venta-id"));};lista.addEventListener("click",e=>abrir(e.target));lista.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){if(e.target.closest(".venta-item[data-venta-id]")){e.preventDefault();abrir(e.target);}}});});\n\n'''
if 'safeInit("ventas-historial-detalle"' not in s: s=s.replace(marker,listener+marker,1)
marker2='// ============================================================\n// Sesión 21 — Pestaña "Configuración"'
detail=r'''let _ventaDetalleCargandoId=null;
function redondearCentavos(n){const v=Number(n);return Number.isFinite(v)?Math.round((v+Number.EPSILON)*100)/100:0;}
function mostrarDetalleVenta(ventaId){const cont=document.getElementById("venta-detalle");if(!cont)return;const venta=(_cache.ventas||[]).find(v=>v.id===ventaId);if(!venta){cont.innerHTML='<p class="lista-estado">No se encontró la venta.</p><button type="button" class="cc-accion venta-detalle-cerrar-btn">Volver</button>';cont.classList.remove("hidden");_enlazarCerrarVentaDetalle();return;}const fh=venta.fecha?new Date(venta.fecha).toLocaleString("es",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";cont.innerHTML='<div class="detalle-cabecera"><span class="detalle-tipo">Venta #'+(venta.id?idCorto(venta.id):"—")+'</span><button type="button" class="detalle-cerrar-btn venta-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button></div><div class="detalle-cuerpo"><div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">'+escHtml(venta.id||"—")+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">'+escHtml(fh)+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Almacén</span><span class="detalle-valor">'+escHtml(venta.almacenes?venta.almacenes.nombre:"—")+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Total registrado</span><span class="detalle-valor">$'+money(venta.total||0)+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Líneas</span><span class="detalle-valor" id="venta-detalle-lineas"><span class="muted">Cargando…</span></span></div></div><div class="venta-auditoria" id="venta-detalle-auditoria"></div>';cont.classList.remove("hidden");_enlazarCerrarVentaDetalle();if(navigator.onLine)_cargarLineasVenta(ventaId,venta.fecha,venta.total);else _renderAuditoriaVenta(null,venta.total,false);cont.focus();}
async function _cargarLineasVenta(ventaId,fechaVenta,totalRegistrado){if(_ventaDetalleCargandoId===ventaId)return;_ventaDetalleCargandoId=ventaId;const el=document.getElementById("venta-detalle-lineas");if(!el){_ventaDetalleCargandoId=null;return;}try{const fecha=fechaVenta?new Date(fechaVenta).toISOString().slice(0,10):null;const {data,error}=await client.rpc("reporte_ventas",{p_desde:fecha,p_hasta:fecha,p_almacen_id:null,p_producto_id:null,p_limite:200,p_offset:0});if(error){el.innerHTML='<span class="muted">No se pudieron cargar las líneas.</span>';_renderAuditoriaVenta(null,totalRegistrado,true);return;}const venta=(data||[]).find(v=>v.id===ventaId);const lineas=venta&&Array.isArray(venta.lineas)?venta.lineas:[];if(!lineas.length)el.innerHTML='<span class="muted">Sin líneas registradas para esta venta.</span>';else el.innerHTML='<div class="venta-lineas-lista">'+lineas.map(l=>'<div class="venta-linea"><span class="venta-linea-producto">'+escHtml(l.producto||"—")+'</span><span class="venta-linea-cant">'+(l.cantidad||0)+' u</span><span class="venta-linea-precio">$'+money(l.precio_unitario||0)+'</span><span class="venta-linea-subtotal">$'+money(l.subtotal||0)+'</span></div>').join("")+'</div>';_renderAuditoriaVenta(lineas,totalRegistrado,true);}catch(e){el.innerHTML='<span class="muted">No se pudieron cargar las líneas.</span>';_renderAuditoriaVenta(null,totalRegistrado,true);}finally{_ventaDetalleCargandoId=null;}}
function _renderAuditoriaVenta(lineas,totalRegistrado,lineasCargadas){const cont=document.getElementById("venta-detalle-auditoria");if(!cont)return;const totalReg=redondearCentavos(totalRegistrado);if(!lineasCargadas){cont.innerHTML='<h4 class="venta-auditoria-titulo">Auditoría de la venta</h4><div class="detalle-fila"><span class="detalle-etiqueta">Total registrado</span><span class="detalle-valor">$'+money(totalReg)+'</span></div><div class="venta-auditoria-estado estado-info">🔵 Líneas no disponibles sin conexión</div>';return;}if(!lineas||!lineas.length){cont.innerHTML='<h4 class="venta-auditoria-titulo">Auditoría de la venta</h4><div class="detalle-fila"><span class="detalle-etiqueta">Total registrado</span><span class="detalle-valor">$'+money(totalReg)+'</span></div><div class="venta-auditoria-estado estado-neutro">⚪ Sin líneas disponibles</div>';return;}const totalLineas=redondearCentavos(lineas.reduce((s,l)=>s+(Number(l.subtotal)||0),0));const diferencia=redondearCentavos(totalReg-totalLineas);const coincide=Math.abs(diferencia)<0.01;const estado=coincide?'<div class="venta-auditoria-estado estado-ok">✅ TOTAL COINCIDE</div>':'<div class="venta-auditoria-estado estado-alerta">🟠 DIFERENCIA DETECTADA</div>';cont.innerHTML='<h4 class="venta-auditoria-titulo">Auditoría de la venta</h4><div class="detalle-fila"><span class="detalle-etiqueta">Total registrado</span><span class="detalle-valor">$'+money(totalReg)+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Total de productos</span><span class="detalle-valor">$'+money(totalLineas)+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Diferencia</span><span class="detalle-valor">$'+money(Math.abs(diferencia))+'</span></div>'+estado;}
function _enlazarCerrarVentaDetalle(){const cont=document.getElementById("venta-detalle");if(!cont)return;cont.querySelectorAll(".venta-detalle-cerrar-btn").forEach(btn=>btn.addEventListener("click",cerrarDetalleVenta));}
function cerrarDetalleVenta(){const cont=document.getElementById("venta-detalle");if(cont){cont.classList.add("hidden");cont.innerHTML="";}_ventaDetalleCargandoId=null;}

'''
if 'function mostrarDetalleVenta(ventaId)' not in s: s=s.replace(marker2,detail+marker2,1)
p.write_text(s)

# R7 HTML container.
p=Path('public/index.html'); s=p.read_text(); anchor='<div id="lista-ventas" class="lista"></div>'
if 'id="venta-detalle"' not in s:s=s.replace(anchor,anchor+'\n      <div id="venta-detalle" class="venta-detalle hidden" role="dialog" aria-label="Detalle de venta"></div>',1)
p.write_text(s)

# R10: transfer/vale render functions from R10 patch only; skip its sales render/listener.
patch=sh('git','diff','--binary',BASE,'9c711a56592361732516fb5bb0612a3ae01fedb3','--','public/app.js',capture=True)
lines=patch.splitlines(True); out=[]; h=[]; keep=False
for line in lines:
    if line.startswith('@@ '):
        keep=('-3261' in line or '-3329' in line)
    if keep: out.append(line)
Path('/tmp/r10code.patch').write_text(''.join(out))
sh('git','apply','--3way','--index','/tmp/r10code.patch')
# R10 HTML search controls.
patch=sh('git','diff','--binary',BASE,'9c711a56592361732516fb5bb0612a3ae01fedb3','--','public/index.html',capture=True)
Path('/tmp/r10html.patch').write_text(patch); sh('git','apply','--3way','--index','/tmp/r10html.patch')

# Add R10 filtering + R8 actionable movement rows/details.
p=Path('public/app.js'); s=p.read_text()
# Add filter state and helper/listeners before the common cart listener.
marker='// Un solo listener delegado para +/-, edición directa y "Quitar" dentro del\n// carrito'
extra='''let _trfBusqueda="", _valesBusqueda="";\nfunction actualizarContador(elId,visibles,total){const el=document.getElementById(elId);if(!el)return;el.textContent=total===0?"":(visibles===total?total+(total===1?" elemento":" elementos"):"Mostrando "+visibles+" de "+total);}\nsafeInit("movimientos-buscadores-trf-vales",()=>{[{i:"trf-buscar",l:"lista-transferencias",v:"trf",r:renderTransferenciasLista},{i:"vales-buscar",l:"lista-vales",v:"vale",r:renderValesLista}].forEach(c=>{const input=document.getElementById(c.i),lista=document.getElementById(c.l);if(!input||!lista)return;input.addEventListener("input",()=>{if(c.v==="trf")_trfBusqueda=input.value||"";else _valesBusqueda=input.value||"";c.r();});lista.addEventListener("click",e=>{if(e.target.closest(".mov-ver-todas-btn")){if(c.v==="trf")_trfBusqueda="";else _valesBusqueda="";input.value="";c.r();}});});});\n\n'''
if 'movimientos-buscadores-trf-vales' not in s:s=s.replace(marker,extra+marker,1)
# Replace transfer render body with filtered version while preserving R8 actionable rows.
start=s.find('function renderTransferenciasLista()')
end=s.find('safeInit("form-transferencia"',start)
if start<0 or end<0: raise RuntimeError('transfer render not found')
tr='''function renderTransferenciasLista(){const lista=document.getElementById("lista-transferencias");if(!lista)return;const todas=_cache.transferencias||[];if(!todas.length){setEmpty("lista-transferencias","Todavía no hay transferencias registradas.");actualizarContador("trf-contador",0,0);return;}const q=_trfBusqueda.trim().toLowerCase();const filtradas=q?todas.filter(t=>{const o=t.origen&&t.origen.nombre?t.origen.nombre.toLowerCase():"",d=t.destino&&t.destino.nombre?t.destino.nombre.toLowerCase():"",e=t.estado?t.estado.toLowerCase():"",f=t.fecha?fechaCorta(t.fecha).toLowerCase():"",id=t.id?t.id.toLowerCase():"";return o.includes(q)||d.includes(q)||e.includes(q)||f.includes(q)||id.includes(q);}):todas;if(!filtradas.length){lista.innerHTML='<p class="lista-estado">🔎 No encontramos transferencias con esos criterios.</p><button type="button" class="cc-accion mov-ver-todas-btn">Ver todas</button>';actualizarContador("trf-contador",0,todas.length);return;}lista.innerHTML="";filtradas.forEach(t=>{const div=document.createElement("div");div.className="lista-item lista-item-accion mov-item";div.setAttribute("data-mov-tipo","transferencia");div.setAttribute("data-mov-id",t.id||"");div.setAttribute("role","button");div.setAttribute("tabindex","0");div.innerHTML=`<span>${t.origen?t.origen.nombre:"—"} → ${t.destino?t.destino.nombre:"—"} <span class="muted">· #${t.id?idCorto(t.id):"—"}</span></span><span class="muted">${fechaCorta(t.fecha)} · ${escHtml(t.estado||"")}</span>`;lista.appendChild(div);});actualizarContador("trf-contador",filtradas.length,todas.length);}\n\n'''
s=s[:start]+tr+s[end:]
start=s.find('function renderValesLista()'); end=s.find('safeInit("form-vale"',start)
if start<0 or end<0: raise RuntimeError('vale render not found')
vr='''function renderValesLista(){const lista=document.getElementById("lista-vales");if(!lista)return;const todas=_cache.vales||[];if(!todas.length){setEmpty("lista-vales","Todavía no hay vales de salida registrados.");actualizarContador("vales-contador",0,0);return;}const q=_valesBusqueda.trim().toLowerCase();const filtradas=q?todas.filter(v=>{const p=v.productos&&v.productos.nombre?v.productos.nombre.toLowerCase():"",a=v.almacenes&&v.almacenes.nombre?v.almacenes.nombre.toLowerCase():"",t=v.tipo?v.tipo.toLowerCase():"",f=v.fecha?fechaCorta(v.fecha).toLowerCase():"",id=v.id?v.id.toLowerCase():"";return p.includes(q)||a.includes(q)||t.includes(q)||f.includes(q)||id.includes(q);}):todas;if(!filtradas.length){lista.innerHTML='<p class="lista-estado">🔎 No encontramos vales con esos criterios.</p><button type="button" class="cc-accion mov-ver-todas-btn">Ver todos</button>';actualizarContador("vales-contador",0,todas.length);return;}lista.innerHTML="";filtradas.forEach(v=>{const div=document.createElement("div");div.className="lista-item lista-item-accion mov-item";div.setAttribute("data-mov-tipo","vale");div.setAttribute("data-mov-id",v.id||"");div.setAttribute("role","button");div.setAttribute("tabindex","0");div.innerHTML=`<span>${v.productos?v.productos.nombre:"—"} <span class="muted">· ${v.almacenes?v.almacenes.nombre:"—"} · #${v.id?idCorto(v.id):"—"}</span></span><span class="muted">${fechaCorta(v.fecha)} · ${escHtml(v.tipo||"")} · ${money(v.cantidad)}</span>`;lista.appendChild(div);});actualizarContador("vales-contador",filtradas.length,todas.length);}\n\n'''
s=s[:start]+vr+s[end:]
# R8 details.
marker='// Un solo listener delegado para +/-, edición directa y "Quitar" dentro del\n// carrito'
detail2=r'''function mostrarDetalleTransferencia(movId){const cont=document.getElementById("transferencia-detalle");if(!cont)return;const mov=(_cache.transferencias||[]).find(t=>t.id===movId);if(!mov)return;const fh=mov.fecha?new Date(mov.fecha).toLocaleString("es",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";cont.innerHTML='<div class="detalle-cabecera"><span class="detalle-tipo">Transferencia #'+idCorto(mov.id)+'</span><button type="button" class="detalle-cerrar-btn mov-detalle-cerrar-btn">&times;</button></div><div class="detalle-cuerpo"><div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">'+escHtml(mov.id)+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">'+escHtml(fh)+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Estado</span><span class="detalle-valor">'+escHtml(mov.estado||"—")+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Almacén origen</span><span class="detalle-valor">'+escHtml(mov.origen?mov.origen.nombre:"—")+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Almacén destino</span><span class="detalle-valor">'+escHtml(mov.destino?mov.destino.nombre:"—")+'</span></div></div>';cont.classList.remove("hidden");_enlazarCerrarMovDetalle(cont);}
function mostrarDetalleVale(movId){const cont=document.getElementById("vale-detalle");if(!cont)return;const mov=(_cache.vales||[]).find(v=>v.id===movId);if(!mov)return;const fh=mov.fecha?new Date(mov.fecha).toLocaleString("es",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";cont.innerHTML='<div class="detalle-cabecera"><span class="detalle-tipo">Vale #'+idCorto(mov.id)+'</span><button type="button" class="detalle-cerrar-btn mov-detalle-cerrar-btn">&times;</button></div><div class="detalle-cuerpo"><div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">'+escHtml(mov.id)+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">'+escHtml(fh)+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Tipo</span><span class="detalle-valor">'+escHtml(mov.tipo||"—")+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Producto</span><span class="detalle-valor">'+escHtml(mov.productos?mov.productos.nombre:"—")+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Almacén</span><span class="detalle-valor">'+escHtml(mov.almacenes?mov.almacenes.nombre:"—")+'</span></div><div class="detalle-fila"><span class="detalle-etiqueta">Cantidad</span><span class="detalle-valor">'+money(mov.cantidad||0)+' u</span></div></div>';cont.classList.remove("hidden");_enlazarCerrarMovDetalle(cont);}
function cerrarDetalleMov(cont){if(cont){cont.classList.add("hidden");cont.innerHTML="";}}
function _enlazarCerrarMovDetalle(cont){if(!cont)return;cont.querySelectorAll(".mov-detalle-cerrar-btn").forEach(b=>b.addEventListener("click",()=>cerrarDetalleMov(cont)));}
safeInit("movimientos-detalle",()=>{["lista-transferencias","lista-vales"].forEach(id=>{const lista=document.getElementById(id);if(!lista)return;const abrir=target=>{const item=target.closest(".mov-item[data-mov-id]");if(!item)return;const idm=item.getAttribute("data-mov-id");if(item.getAttribute("data-mov-tipo")==="transferencia")mostrarDetalleTransferencia(idm);else mostrarDetalleVale(idm);};lista.addEventListener("click",e=>abrir(e.target));lista.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){if(e.target.closest(".mov-item[data-mov-id]")){e.preventDefault();abrir(e.target);}}});});});

'''
if 'function mostrarDetalleTransferencia(movId)' not in s:s=s.replace(marker,detail2+marker,1)
p.write_text(s)

# R8 containers and R10 search HTML.
p=Path('public/index.html'); s=p.read_text()
if 'id="transferencia-detalle"' not in s:s=s.replace('<div id="lista-transferencias" class="lista"></div>','<div id="lista-transferencias" class="lista"></div><div id="transferencia-detalle" class="mov-detalle hidden" role="dialog" aria-label="Detalle de transferencia"></div>',1)
if 'id="vale-detalle"' not in s:s=s.replace('<div id="lista-vales" class="lista"></div>','<div id="lista-vales" class="lista"></div><div id="vale-detalle" class="mov-detalle hidden" role="dialog" aria-label="Detalle de vale"></div>',1)
# R10 search controls (safe direct insertion).
s=s.replace('<h3>Historial de ventas</h3>','<h3>Historial de ventas</h3><div class="mov-buscador-controles"><input id="ventas-buscar" type="text" placeholder="Buscar por #referencia, almacén o fecha…" autocomplete="off"><span id="ventas-contador" class="muted mov-contador"></span></div>',1) if 'id="ventas-buscar"' not in s else s
s=s.replace('</form>\n      <div id="lista-transferencias"','</form><div class="mov-buscador-controles"><input id="trf-buscar" type="text" placeholder="Buscar por #referencia, origen, destino o estado…" autocomplete="off"><span id="trf-contador" class="muted mov-contador"></span></div>\n      <div id="lista-transferencias"',1) if 'id="trf-buscar"' not in s else s
s=s.replace('</form>\n      <div id="lista-vales"','</form><div class="mov-buscador-controles"><input id="vales-buscar" type="text" placeholder="Buscar por #referencia, producto, tipo o almacén…" autocomplete="off"><span id="vales-contador" class="muted mov-contador"></span></div>\n      <div id="lista-vales"',1) if 'id="vales-buscar"' not in s else s
p.write_text(s)

# R9: recent movements become actionable. R13 is intentionally skipped because R3 already contains the same stock-alert behavior; R6 is subsumed by R7; R11/R12 by R8.
p=Path('public/app.js'); s=p.read_text(); start=s.find('    const movs = [',s.find('const movsEl')); end=s.find('    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8);',start)
if start<0 or end<0: raise RuntimeError('R9 movement block not found')
end+=len('    ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8);')
new='''    const movs = [\n      ...(_cache.ventas || []).map(v=>({tipo:"venta",id:v.id,fecha:v.fecha,texto:`Venta: ${v.almacenes&&v.almacenes.nombre?v.almacenes.nombre:"—"}`,estado:"$"+money(v.total)})),\n      ..._cache.transferencias.map(t=>({tipo:"transferencia",id:t.id,fecha:t.fecha,texto:`Transferencia: ${t.origen?t.origen.nombre:"—"} → ${t.destino?t.destino.nombre:"—"}`,estado:t.estado})),\n      ..._cache.vales.map(v=>({tipo:"vale",id:v.id,fecha:v.fecha,texto:`Vale (${v.tipo||"?"}): ${v.productos?v.productos.nombre:"—"} · ${v.almacenes?v.almacenes.nombre:"—"}`,estado:money(v.cantidad)})),\n    ].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,8);'''
s=s[:start]+new+s[end:]
old='''        const div = document.createElement("div");\n        div.className = "lista-item";\n        div.innerHTML = `<span>${fechaCorta(m.fecha)}</span>\n          <span class="muted">${m.texto} · ${m.estado}</span>`;'''
new2='''        const div = document.createElement("div");\n        const tabDestino=m.tipo==="venta"?"ventas":m.tipo==="transferencia"?"transferencias":"vales";\n        div.className="lista-item lista-item-accion resumen-mov-item"; div.setAttribute("data-mov-tipo",m.tipo); div.setAttribute("data-mov-id",m.id||""); div.setAttribute("data-mov-tab",tabDestino); div.setAttribute("role","button"); div.setAttribute("tabindex","0");\n        div.innerHTML=`<span>${fechaCorta(m.fecha)} <span class="muted">· ${escHtml(m.tipo)}</span></span><span class="muted">${m.texto} · ${m.estado}</span>`;'''
if old not in s: raise RuntimeError('R9 row anchor not found')
s=s.replace(old,new2,1)
marker='// Un solo listener delegado para +/-, edición directa y "Quitar" dentro del\n// carrito'
nav='''safeInit("resumen-movs-accion",()=>{const el=document.getElementById("resumen-movs-lista");if(!el)return;const go=target=>{const item=target.closest(".resumen-mov-item[data-mov-tab]");if(!item)return;const b=document.querySelector('.tab-btn[data-tab="'+item.getAttribute("data-mov-tab")+'"]');if(b)b.click();};el.addEventListener("click",e=>go(e.target));el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){if(e.target.closest(".resumen-mov-item[data-mov-tab]")){e.preventDefault();go(e.target);}}});});\n\n'''
if 'safeInit("resumen-movs-accion"' not in s:s=s.replace(marker,nav+marker,1)
p.write_text(s)

# Tests: R3 + R5 + R7 + R8 + R9 + R10; no duplicated R6/R11/R12/R13 tests.
for head,label in [('d167621afd2c6b30306a177313f68243c96a23ac','r3'),('8b38f00384626b25b3f6adcd622aec096f05b65c','r5'),('d18cd8e627df7e3cc0bdf76093c2835d2167a6d7','r7'),('de87edf057da8d2024c1ef522089f4ee04ebda0d','r8'),('1a63532037493ea9e4861fa534b829e736686b11','r9'),('9c711a56592361732516fb5bb0612a3ae01fedb3','r10')]: append_added_tests(head,label)
sh('git','add','test/b2.3-centro-control.test.js'); sh('git','commit','-m','integrate legacy mission tests R3-R10')

# Verify before touching main.
sh('node','--check','public/app.js'); sh('npm','test')

# Remove the temporary integration machinery and push the finished main.
sh('git','rm','.github/integrate_legacy.py','.github/workflows/_integrate_legacy_missions.yml')
sh('git','commit','-m','docs: legacy integration complete [skip ci]')
sh('git','push','origin','HEAD:main')
