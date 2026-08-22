/* BattleCruiser — Historiales: fila + detalle */
(function(){
  'use strict';
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtDate(v){ if(!v) return '—'; const d=new Date(v); if(Number.isNaN(d.getTime())) return esc(v); return d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}); }
  function fmtTime(v){ if(!v) return ''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}); }
  function openDetail(data,title='Detalle del movimiento'){
    let el=document.getElementById('historial-detalle-modal');
    if(!el){ el=document.createElement('div'); el.id='historial-detalle-modal'; el.innerHTML='<div class="historial-detalle-backdrop"></div><section class="historial-detalle-card" role="dialog" aria-modal="true"><button type="button" class="historial-detalle-close" aria-label="Cerrar">×</button><h2></h2><div class="historial-detalle-body"></div></section>'; document.body.appendChild(el); el.querySelector('.historial-detalle-close').onclick=()=>el.remove(); el.querySelector('.historial-detalle-backdrop').onclick=()=>el.remove(); }
    el.querySelector('h2').textContent=title;
    const body=el.querySelector('.historial-detalle-body');
    const rows=[];
    const walk=(obj,path='')=>{ if(obj==null) return; if(Array.isArray(obj)){ obj.forEach((x,i)=>walk(x,`${path}[${i}]`)); return; } if(typeof obj==='object'){ Object.entries(obj).forEach(([k,v])=>walk(v,path?`${path}.${k}`:k)); return; } rows.push(`<div class="historial-detalle-row"><span>${esc(path)}</span><strong>${esc(obj)}</strong></div>`); };
    walk(data);
    body.innerHTML=rows.join('')||'<p>Sin detalles disponibles.</p>';
  }
  function bind(container){ if(!container || container.dataset.historialDetalleBound==='1') return; container.dataset.historialDetalleBound='1'; container.addEventListener('click',e=>{ const row=e.target.closest('[data-historial-detail]'); if(!row || !container.contains(row)) return; let data; try{ data=JSON.parse(row.getAttribute('data-historial-detail')||'{}'); }catch(_){ data={detalle:row.getAttribute('data-historial-detail')}; } openDetail(data,row.getAttribute('data-historial-title')||row.dataset.tipo||'Detalle del movimiento'); }); }
  window.BattleCruiserHistorialDetalle={openDetail,bind,fmtDate,fmtTime,esc};
})();
