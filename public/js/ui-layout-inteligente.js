// BattleCruiser — UI Layout Inteligente (v9.2.33)
// Organización visual: Usuarios/Roles + cards/listas/secciones en todo el software.
// No toca lógica de negocio ni RPC.
(function () {
  'use strict';

  function inject() {
    if (document.getElementById('bc-ui-layout-inteligente')) return;
    var s = document.createElement('style');
    s.id = 'bc-ui-layout-inteligente';
    s.textContent = [
      '.tab-panel{max-width:1100px}',
      '.tab-panel > .pendientes-header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}',
      '.tab-panel > .pendientes-header h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.45rem;font-weight:600;letter-spacing:.02em;color:var(--text)}',
      '.tab-panel > .muted:first-of-type{margin:0 0 14px;font-size:13px;line-height:1.45;color:var(--mist)}',
      '.cc-bloque{background:rgba(12,28,24,.55);border:1px solid rgba(201,162,77,.14);border-radius:14px;padding:16px 16px 14px;margin-bottom:16px;box-shadow:0 8px 28px rgba(0,0,0,.18)}',
      '.cc-bloque > h3{margin:0 0 10px;font-family:Cormorant Garamond,serif;font-size:1.15rem;font-weight:600;color:var(--gold-bright);letter-spacing:.02em}',
      '.cc-bloque > .muted{margin:0 0 12px;font-size:12.5px;line-height:1.4}',
      '.inline-form{display:grid;grid-template-columns:1fr;gap:10px;align-items:stretch}',
      '@media(min-width:640px){.inline-form{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}}',
      '.inline-form input,.inline-form select,.inline-form textarea{min-width:0;width:100%;box-sizing:border-box}',
      '.inline-form button[type=submit],.inline-form > button:last-child{grid-column:1/-1}',
      '@media(min-width:640px){.inline-form button[type=submit],.inline-form > button:last-child{grid-column:auto;min-width:140px}}',
      '.inline-form button[type=submit]{font-weight:600;letter-spacing:.02em}',
      '.lista{display:flex;flex-direction:column;gap:10px}',
      '.lista-item{border-radius:12px;border:1px solid rgba(201,162,77,.12);background:rgba(8,20,17,.65);padding:12px 14px;transition:border-color .15s ease,box-shadow .15s ease}',
      '.lista-item:hover{border-color:rgba(201,162,77,.28);box-shadow:0 4px 16px rgba(0,0,0,.2)}',
      '#lista-usuarios{display:grid;grid-template-columns:1fr;gap:12px}',
      '@media(min-width:560px){#lista-usuarios{grid-template-columns:1fr 1fr}}',
      '@media(min-width:900px){#lista-usuarios{grid-template-columns:1fr 1fr 1fr}}',
      '#lista-usuarios .usuario-item{display:flex;flex-direction:column;gap:10px;min-height:0;margin:0}',
      '#lista-usuarios .usuario-principal{display:flex;flex-direction:column;gap:6px;width:100%}',
      '#lista-usuarios .usuario-nombre{font-family:Cormorant Garamond,serif;font-size:1.2rem;font-weight:600;color:var(--text);line-height:1.2}',
      '#lista-usuarios .usuario-principal > .muted{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12.5px}',
      '#lista-usuarios .usr-rol-select{max-width:100%;min-width:0;flex:1 1 120px;padding:7px 10px;border-radius:8px;background:var(--void);border:1px solid rgba(201,162,77,.25);color:var(--text);font-size:13px}',
      '#lista-usuarios .usuario-acciones{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}',
      '#lista-usuarios .usr-estado-btn{margin:0;padding:7px 12px;border-radius:8px;font-size:12.5px}',
      '#lista-usuarios .usuario-inactivo{opacity:.72;border-style:dashed}',
      '#bc-roles-en-usuarios{margin-top:8px}',
      '#lista-roles{display:flex;flex-direction:column;gap:12px}',
      '#lista-roles .rol-item{display:flex;flex-direction:column;gap:12px;align-items:stretch}',
      '@media(min-width:720px){#lista-roles .rol-item{flex-direction:row;align-items:center;justify-content:space-between;gap:16px}}',
      '#lista-roles .rol-item .usuario-principal{flex:1;min-width:0}',
      '#lista-roles .rol-item .usuario-nombre{font-family:Cormorant Garamond,serif;font-size:1.15rem;font-weight:600}',
      '#lista-roles .rol-item .usuario-acciones{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-start}',
      '@media(min-width:720px){#lista-roles .rol-item .usuario-acciones{justify-content:flex-end;max-width:58%}}',
      '#lista-roles .rol-item .cc-accion{margin:0;padding:8px 12px;border-radius:8px;font-size:12.5px;white-space:nowrap}',
      '#lista-roles .rol-permisos-panel{margin-top:4px;padding:14px;border-radius:12px;border:1px solid rgba(201,162,77,.18);background:rgba(6,16,14,.75);overflow-x:auto}',
      '#lista-roles .permisos-tabla{width:100%;border-collapse:collapse;font-size:12.5px}',
      '#lista-roles .permisos-tabla th{text-align:left;padding:8px 10px;color:var(--gold-dim);font-weight:500;border-bottom:1px solid rgba(201,162,77,.2);white-space:nowrap}',
      '#lista-roles .permisos-tabla td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}',
      '#lista-roles .permisos-tabla tr:hover td{background:rgba(201,162,77,.05)}',
      '#lista-roles .permisos-tabla input[type=checkbox]{width:16px;height:16px;accent-color:var(--gold)}',
      '#lista-roles #rol-permisos-guardar-btn{margin-top:12px;padding:10px 16px;border-radius:8px;font-weight:600}',
      '#tab-usuarios .cc-bloque:first-of-type{margin-top:4px}',
      '#form-nuevo-usuario{margin-bottom:4px}',
      '#form-nuevo-rol{margin-bottom:8px}',
      '.cc-accion{border-radius:8px;border:1px solid rgba(201,162,77,.28);background:rgba(201,162,77,.08);color:var(--text);padding:8px 12px;font-size:12.5px;cursor:pointer;transition:background .15s,border-color .15s,color .15s}',
      '.cc-accion:hover{background:rgba(201,162,77,.16);border-color:rgba(201,162,77,.45);color:var(--gold-bright)}',
      '.btn-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.pendientes-header{border-bottom:1px solid rgba(201,162,77,.16);padding-bottom:10px;margin-bottom:12px}',
      '.pendientes-header h3{font-family:Cormorant Garamond,serif;font-weight:600}',
      '.msg{font-size:13px;line-height:1.4;margin:8px 0}',
      '.msg.ok{color:#9dcc9a}',
      '.msg.error{color:#e8a0a0}',
      '#tab-productos .inline-form,#tab-almacenes .inline-form,#tab-transferencias .inline-form,#tab-vales .inline-form{margin-bottom:12px}',
      '#tab-ventas .venta-vista-toggle{display:flex;gap:8px;margin-bottom:12px}',
      '#tab-ventas .venta-vista-btn{flex:1;border-radius:10px;padding:10px 12px}',
      '.rol-permisos-panel{-webkit-overflow-scrolling:touch}',
      '.lista-estado{text-align:center;padding:28px 16px;color:var(--mist);font-size:13.5px;line-height:1.45}',
      '.app-footer{opacity:.85;font-size:11px;letter-spacing:.03em}'
    ].join('');
    document.head.appendChild(s);
  }

  function softLabelsUsuarios() {
    document.querySelectorAll('#lista-roles .rol-permisos-btn').forEach(function (b) {
      var t = (b.textContent || '').trim();
      if (t === 'Ver/editar permisos') b.textContent = 'Permisos';
      if (t === 'Ocultar permisos') b.textContent = 'Cerrar';
    });
    document.querySelectorAll('#lista-roles .rol-renombrar-btn').forEach(function (b) {
      if ((b.textContent || '').trim() === 'Renombrar') b.textContent = 'Nombre';
    });
    document.querySelectorAll('#lista-roles .rol-eliminar-btn').forEach(function (b) {
      var t = (b.textContent || '').trim();
      if (t.indexOf('Eli') === 0 && t.length < 10) b.textContent = 'Eliminar';
    });
  }

  function watchRoles() {
    var lista = document.getElementById('lista-roles');
    if (!lista || lista.dataset.bcLayoutWatch === '1') return;
    lista.dataset.bcLayoutWatch = '1';
    var t = null;
    new MutationObserver(function () {
      if (t) clearTimeout(t);
      t = setTimeout(softLabelsUsuarios, 40);
    }).observe(lista, { childList: true, subtree: true });
  }

  function run() {
    inject();
    softLabelsUsuarios();
    watchRoles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      run();
      setTimeout(run, 400);
      setTimeout(run, 1200);
    });
  } else {
    run();
    setTimeout(run, 400);
    setTimeout(run, 1200);
  }
})();
