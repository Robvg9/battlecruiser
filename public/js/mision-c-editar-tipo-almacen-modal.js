// BattleCruiser — Misión C extensión
// Edición del tipo de almacén mediante ventana modal.
(function(){
  'use strict';
  const STYLE='bc-mision-c-modal-style';
  const ROOT='bc-almacen-tipo-modal';
  const TIPOS=[
    ['almacenamiento','Almacenamiento','Reserva interna para reposición'],
    ['minorista','Minorista','Punto de venta al consumidor'],
    ['mayorista','Mayorista','Punto de venta mayorista']
  ];
  let bound=false;

  function selectedId(){
    const sel=document.getElementById('alm-selector');
    return sel && sel.value ? sel.value : null;
  }
  function cacheAlmacenes(){
    return (typeof _cache!=='undefined' && Array.isArray(_cache.almacenes)) ? _cache.almacenes : [];
  }
  function inject(){
    if(document.getElementById(STYLE)) return;
    const s=document.createElement('style');s.id=STYLE;s.textContent=`
      #${ROOT}{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.58)}
      #${ROOT}.hidden{display:none!important}
      .bc-alm-modal{width:min(520px,100%);background:var(--bc-surface,#10181d);color:var(--bc-text,#eeeae0);border:1px solid var(--bc-border,rgba(184,160,106,.22));border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.4);padding:22px}
      .bc-alm-modal h3{margin:0 0 6px;font-weight:800}.bc-alm-modal p{margin:0 0 18px;color:var(--bc-muted,#a9afb0)}
      .bc-alm-tipos{display:grid;gap:9px;margin:16px 0}.bc-alm-tipo{display:flex;align-items:center;gap:12px;width:100%;padding:13px 14px;border:1px solid var(--bc-border);border-radius:10px;background:var(--bc-surface-2,#162128);color:var(--bc-text);text-align:left;cursor:pointer;font-weight:800}.bc-alm-tipo:hover{border-color:var(--bc-accent,#d9c48c)}.bc-alm-tipo.selected{outline:2px solid var(--bc-accent,#d9c48c);background:var(--bc-accent-soft,rgba(184,160,106,.14))}.bc-alm-tipo small{display:block;color:var(--bc-muted);font-weight:600;margin-top:2px}.bc-alm-radio{width:18px;height:18px;accent-color:var(--bc-accent,#d9c48c)}
      .bc-alm-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.bc-alm-modal-actions button{font-weight:800}.bc-alm-modal-status{min-height:20px;margin-top:8px;font-weight:700}
    `;document.head.appendChild(s);
  }
  function ensure(){
    let root=document.getElementById(ROOT);if(root)return root;
    root=document.createElement('div');root.id=ROOT;root.className='hidden';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
    root.innerHTML=`<div class="bc-alm-modal">
      <h3>Editar tipo de almacén</h3><p id="bc-alm-modal-nombre"></p>
      <div class="bc-alm-tipos">${TIPOS.map(t=>`<button type="button" class="bc-alm-tipo" data-tipo="${t[0]}"><input class="bc-alm-radio" type="radio" name="bc-alm-tipo" value="${t[0]}"><span>${t[1]}<small>${t[2]}</small></span></button>`).join('')}</div>
      <div class="bc-alm-modal-status" id="bc-alm-modal-status"></div>
      <div class="bc-alm-modal-actions"><button type="button" class="cc-accion" id="bc-alm-modal-cancelar">Cancelar</button><button type="button" id="bc-alm-modal-guardar">Guardar tipo</button></div>
    </div>`;
    document.body.appendChild(root);return root;
  }
  function close(){const r=document.getElementById(ROOT);if(r)r.classList.add('hidden');}
  function open(){
    const id=selectedId();if(!id)return;
    const a=cacheAlmacenes().find(x=>String(x.id)===String(id));if(!a)return;
    const r=ensure();r.querySelector('#bc-alm-modal-nombre').textContent=a.nombre||'Almacén';r.querySelector('#bc-alm-modal-status').textContent='';
    r.querySelectorAll('.bc-alm-tipo').forEach(b=>{const sel=b.dataset.tipo===a.tipo || (a.tipo==='venta'&&b.dataset.tipo==='minorista');b.classList.toggle('selected',sel);b.querySelector('input').checked=sel;});
    r.classList.remove('hidden');
  }
  async function save(){
    const r=document.getElementById(ROOT),id=selectedId();if(!r||!id)return;
    const tipo=r.querySelector('input[name="bc-alm-tipo"]:checked');const status=r.querySelector('#bc-alm-modal-status');const btn=r.querySelector('#bc-alm-modal-guardar');
    if(!tipo){status.textContent='Seleccioná un tipo de almacén.';return;}
    btn.disabled=true;status.textContent='Guardando…';
    try{
      if(typeof editarAlmacen!=='function')throw new Error('Función de actualización no disponible');
      const resultado=await editarAlmacen(id,{p_tipo:tipo.value});
      if(!resultado || !resultado.ok)throw new Error(typeof explicarError==='function'?explicarError(resultado&&resultado.error,'editar almacén'):'No se pudo actualizar');
      status.textContent=resultado.offline?'Cambio guardado; se sincronizará al volver la conexión.':'Tipo de almacén actualizado.';
      if(!resultado.offline)setTimeout(close,250);
    }catch(e){status.textContent=e&&e.message?e.message:'No se pudo actualizar el tipo.';}
    finally{btn.disabled=false;}
  }
  function bind(){
    if(bound)return;bound=true;
    document.addEventListener('click',function(e){
      const btn=e.target.closest('#alm-editar-btn');
      if(btn){e.preventDefault();e.stopImmediatePropagation();open();return;}
      const tipo=e.target.closest('.bc-alm-tipo');
      if(tipo){e.preventDefault();const r=ensure();r.querySelectorAll('.bc-alm-tipo').forEach(b=>b.classList.remove('selected'));tipo.classList.add('selected');tipo.querySelector('input').checked=true;return;}
      if(e.target.id==='bc-alm-modal-cancelar')close();
      if(e.target.id==='bc-alm-modal-guardar')save();
      if(e.target.id===ROOT)close();
    },true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  }
  function init(){inject();ensure();bind();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.addEventListener('pageshow',init);
})();
