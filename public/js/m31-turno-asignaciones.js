// BattleCruiser — M31: asignaciones de trabajadoras por sesión
(function(){
  'use strict';
  const API=()=>window.BattleCruiserTurnoAPI;
  const ROOT_ID='ciclos-m18-root';
  function root(){return document.getElementById(ROOT_ID)}
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
  function users(){return ((_cache&&_cache.usuarios)||[]).filter(u=>u.activo!==false && !u.archivado)}
  function close(){const x=document.getElementById('m31-bg');if(x)x.remove()}
  function open(title,html,ok){
    close();const bg=document.createElement('div');bg.id='m31-bg';bg.className='tm-modal-bg';
    bg.innerHTML='<div class="tm-modal" role="dialog"><h3>'+esc(title)+'</h3>'+html+'<div class="tm-actions"><button class="cc-accion" id="m31-ok">Guardar asignaciones</button><button class="cc-accion tm-back" id="m31-cancel">Cancelar</button></div><p id="m31-msg" class="tm-msg"></p></div>';
    document.body.appendChild(bg);bg.querySelector('#m31-cancel').onclick=close;bg.querySelector('#m31-ok').onclick=()=>ok(bg);bg.onclick=e=>{if(e.target===bg)close()};
  }
  async function configure(turnoId){
    if(!turnoId)return;
    let sessions=[];try{sessions=await API().listarSesionesTurno(turnoId)}catch(e){return alert('No se pudieron cargar las sesiones: '+(e.message||e))}
    const us=users();
    const html='<p class="muted">Asigna una trabajadora a cada sesión. Las sesiones sin asignar no pueden iniciarse.</p>'+sessions.map(s=>{
      const uid=s.usuario_id||s.asignado_id||'';
      const opts='<option value="">No asignada</option>'+us.map(u=>'<option value="'+esc(u.id)+'"'+(String(u.id)===String(uid)?' selected':'')+'>'+esc(u.nombre||u.email||u.id)+'</option>').join('');
      return '<div class="field m31-session"><label>Día '+esc(s.dia_n)+' · '+esc(s.bloque||'')+' · '+esc(s.fecha||'')+'</label><select data-sid="'+esc(s.id)+'">'+opts+'</select></div>'
    }).join('');
    open('Asignar trabajadoras a las sesiones',html,async function(bg){
      const selects=[...bg.querySelectorAll('select[data-sid]')];const m=bg.querySelector('#m31-msg');
      try{
        for(const sel of selects){const uid=sel.value;if(!uid)continue;await API().asignarSesion(sel.dataset.sid,uid)}
        close();
        if(window.BattleCruiserTurnosMaestro&&window.BattleCruiserTurnosMaestro.open)await window.BattleCruiserTurnosMaestro.open(turnoId,false);
      }catch(e){if(m){m.textContent=e.message||String(e);m.className='tm-msg error'}}
    });
  }
  function decorate(){
    const r=root();if(!r||r.querySelector('[data-m31-config]'))return;
    const card=r.querySelector('.tm-wrap .tm-card');if(!card)return;
    const heading=[...card.querySelectorAll('h4')].find(x=>x.textContent.trim()==='Sesiones de trabajo');if(!heading)return;
    const turnoId=window.__BC_TURNO_DETAIL_ID||null;if(!turnoId)return;
    const b=document.createElement('button');b.type='button';b.className='cc-accion';b.dataset.m31Config='1';b.textContent='Asignar trabajadoras';
    heading.insertAdjacentElement('afterend',b);b.onclick=()=>configure(turnoId);
  }
  function patchOpen(){
    const api=window.BattleCruiserTurnosMaestro;if(!api||typeof api.open!=='function'||api.open.__m31)return;
    const old=api.open;const wrapped=async function(id,legacy){window.__BC_TURNO_DETAIL_ID=id;const r=await old(id,legacy);requestAnimationFrame(decorate);return r};wrapped.__m31=true;wrapped._original=old;api.open=wrapped;
  }
  function init(){
    if(!document.getElementById('m31-style')){const s=document.createElement('style');s.id='m31-style';s.textContent='.m31-session{margin-bottom:9px}.m31-session select{width:100%}';document.head.appendChild(s)}
    patchOpen();decorate();
    const observer=new MutationObserver(()=>{patchOpen();decorate()});
    const r=root();if(r)observer.observe(r,{childList:true,subtree:true});
    window.addEventListener('pageshow',patchOpen);
  }
  setTimeout(init,300);
})();