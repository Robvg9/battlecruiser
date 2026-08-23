// BattleCruiser — Usuarios Dashboard (v9.2.34)
// Visual tipo admin moderno (referencia dashboard). Reutiliza IDs/handlers B3.
// No crea RPC ni segundo sistema de permisos.
(function () {
  'use strict';

  function css() {
    if (document.getElementById('bc-usuarios-dash-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-usuarios-dash-css';
    s.textContent = [
      '#tab-usuarios.bc-udash{max-width:1200px;padding-bottom:24px}',
      '#tab-usuarios.bc-udash > .pendientes-header{display:none!important}',
      '#tab-usuarios.bc-udash > #msg-usuarios{margin:0 0 10px}',
      '.ud-hero{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}',
      '.ud-hero h2{margin:0;font-family:Cormorant Garamond,serif;font-size:1.75rem;font-weight:600;color:var(--text);letter-spacing:.02em}',
      '.ud-hero p{margin:4px 0 0;font-size:13px;color:var(--mist);max-width:420px;line-height:1.4}',
      '.ud-hero-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.ud-btn-primary{background:linear-gradient(180deg,var(--gold-bright),var(--gold))!important;color:#211605!important;border:none!important;font-weight:600;padding:10px 16px!important;border-radius:10px!important;cursor:pointer;box-shadow:0 4px 14px rgba(201,162,77,.22)}',
      '.ud-btn-primary:hover{filter:brightness(1.05)}',
      '.ud-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px}',
      '@media(min-width:720px){.ud-kpis{grid-template-columns:repeat(4,1fr)}}',
      '.ud-kpi{background:rgba(12,28,24,.6);border:1px solid rgba(201,162,77,.14);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-height:88px}',
      '.ud-kpi-top{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.ud-kpi-label{font-size:12px;color:var(--mist);letter-spacing:.02em}',
      '.ud-kpi-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(201,162,77,.1);color:var(--gold);font-size:14px}',
      '.ud-kpi-value{font-family:Cormorant Garamond,serif;font-size:1.85rem;font-weight:600;color:var(--text);line-height:1}',
      '.ud-kpi-sub{font-size:11.5px;color:var(--mist)}',
      '.ud-kpi-sub .ok{color:#9dcc9a}',
      '.ud-card{background:rgba(12,28,24,.55);border:1px solid rgba(201,162,77,.14);border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 8px 28px rgba(0,0,0,.16)}',
      '.ud-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}',
      '.ud-card-head h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.15rem;font-weight:600;color:var(--gold-bright)}',
      '.ud-card-head .muted{margin:0;font-size:12.5px}',
      '#tab-usuarios.bc-udash #form-nuevo-usuario{display:grid;grid-template-columns:1fr;gap:10px}',
      '@media(min-width:700px){#tab-usuarios.bc-udash #form-nuevo-usuario{grid-template-columns:1fr 1fr 1fr auto;align-items:end}}',
      '#tab-usuarios.bc-udash #form-nuevo-usuario input{width:100%;box-sizing:border-box;border-radius:10px;padding:11px 12px}',
      '#tab-usuarios.bc-udash #form-nuevo-usuario button[type=submit]{grid-column:1/-1;justify-self:end;min-width:140px}',
      '@media(min-width:700px){#tab-usuarios.bc-udash #form-nuevo-usuario button[type=submit]{grid-column:auto}}',
      '#lista-usuarios.ud-table{display:block;gap:0;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:12px;border:1px solid rgba(201,162,77,.12)}',
      '#lista-usuarios.ud-table .ud-thead{display:none}',
      '@media(min-width:720px){#lista-usuarios.ud-table .ud-thead{display:grid;grid-template-columns:minmax(160px,2fr) minmax(100px,1fr) 90px minmax(100px,1fr) auto;gap:10px;padding:10px 14px;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--gold-dim);border-bottom:1px solid rgba(201,162,77,.16);background:rgba(6,16,14,.5)}}',
      '#lista-usuarios.ud-table .usuario-item{display:grid;grid-template-columns:1fr;gap:8px;margin:0;border-radius:0;border:none;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;padding:12px 14px;box-shadow:none}',
      '#lista-usuarios.ud-table .usuario-item:hover{background:rgba(201,162,77,.05);box-shadow:none;border-color:transparent;border-bottom-color:rgba(255,255,255,.05)}',
      '@media(min-width:720px){#lista-usuarios.ud-table .usuario-item{grid-template-columns:minmax(160px,2fr) minmax(100px,1fr) 90px minmax(100px,1fr) auto;align-items:center}}',
      '#lista-usuarios.ud-table .usuario-principal{display:contents}',
      '#lista-usuarios.ud-table .usuario-nombre{font-family:Inter,system-ui,sans-serif;font-size:14px;font-weight:600;color:var(--text)}',
      '#lista-usuarios.ud-table .usuario-principal > .muted{display:contents;font-size:13px}',
      '#lista-usuarios.ud-table .usr-rol-select{padding:6px 8px;border-radius:8px;font-size:12.5px;background:rgba(201,162,77,.08);border:1px solid rgba(201,162,77,.22);color:var(--text);max-width:140px}',
      '#lista-usuarios.ud-table .ud-badge-activo{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:#9dcc9a}',
      '#lista-usuarios.ud-table .ud-badge-inactivo{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:#e8a0a0}',
      '#lista-usuarios.ud-table .usuario-acciones{justify-content:flex-end}',
      '#lista-usuarios.ud-table .usr-estado-btn{padding:6px 10px;font-size:12px;border-radius:8px}',
      '#lista-usuarios.ud-table .usuario-inactivo{opacity:.75}',
      '#lista-usuarios.ud-table .lista-estado{padding:24px;text-align:center}',
      '#bc-roles-en-usuarios{margin-top:0!important}',
      '#bc-roles-en-usuarios.ud-roles-card > h3{font-family:Cormorant Garamond,serif;font-size:1.15rem;color:var(--gold-bright);margin:0 0 6px}',
      '#bc-roles-en-usuarios.ud-roles-card > .muted{font-size:12.5px;margin:0 0 12px}',
      '#form-nuevo-rol{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px!important}',
      '#form-nuevo-rol #rol-nombre{flex:1 1 180px;min-width:0;border-radius:10px;padding:10px 12px}',
      '#form-nuevo-rol button[type=submit]{flex:0 0 auto;white-space:nowrap}',
      '#lista-roles{display:flex;flex-direction:column;gap:0;border-radius:12px;border:1px solid rgba(201,162,77,.12);overflow:hidden}',
      '#lista-roles .rol-item{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:0;border-radius:0;border:none;border-bottom:1px solid rgba(255,255,255,.05);padding:12px 14px;background:transparent}',
      '#lista-roles .rol-item:last-of-type{border-bottom:none}',
      '#lista-roles .rol-item:hover{background:rgba(201,162,77,.05)}',
      '#lista-roles .rol-item .usuario-nombre{font-family:Inter,system-ui,sans-serif;font-size:14px;font-weight:600}',
      '#lista-roles .rol-item .usuario-acciones{display:flex;flex-wrap:wrap;gap:6px}',
      '#lista-roles .rol-item .cc-accion{padding:6px 10px;font-size:12px;border-radius:8px;white-space:nowrap}',
      '#lista-roles .rol-permisos-panel{margin:0;border-radius:0;border:none;border-top:1px solid rgba(201,162,77,.14)}',
      '.ud-resumen{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:center}',
      '.ud-resumen-item{text-align:center}',
      '.ud-resumen-item .v{font-family:Cormorant Garamond,serif;font-size:1.6rem;font-weight:600;color:var(--text)}',
      '.ud-resumen-item .l{font-size:11.5px;color:var(--mist);margin-top:2px}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureShell() {
    var tab = document.getElementById('tab-usuarios');
    if (!tab) return null;
    tab.classList.add('bc-udash');

    if (!document.getElementById('ud-hero')) {
      var hero = document.createElement('div');
      hero.id = 'ud-hero';
      hero.className = 'ud-hero';
      hero.innerHTML =
        '<div><h2>Usuarios</h2><p>Gestioná usuarios, roles y permisos del sistema.</p></div>' +
        '<div class="ud-hero-actions"><button type="button" class="ud-btn-primary" id="ud-scroll-crear">+ Nuevo usuario</button></div>';
      tab.insertBefore(hero, tab.firstChild);
      hero.querySelector('#ud-scroll-crear').addEventListener('click', function () {
        var f = document.getElementById('form-nuevo-usuario');
        if (f) {
          f.scrollIntoView({ behavior: 'smooth', block: 'center' });
          var n = document.getElementById('nuevo-usuario-nombre');
          if (n) n.focus();
        }
      });
    }

    if (!document.getElementById('ud-kpis')) {
      var kpis = document.createElement('div');
      kpis.id = 'ud-kpis';
      kpis.className = 'ud-kpis';
      kpis.innerHTML =
        '<div class="ud-kpi"><div class="ud-kpi-top"><span class="ud-kpi-label">Usuarios activos</span><span class="ud-kpi-icon">👥</span></div><div class="ud-kpi-value" id="ud-kpi-activos">—</div><div class="ud-kpi-sub" id="ud-kpi-activos-sub">En el sistema</div></div>' +
        '<div class="ud-kpi"><div class="ud-kpi-top"><span class="ud-kpi-label">Roles</span><span class="ud-kpi-icon">🛡️</span></div><div class="ud-kpi-value" id="ud-kpi-roles">—</div><div class="ud-kpi-sub">Configurados</div></div>' +
        '<div class="ud-kpi"><div class="ud-kpi-top"><span class="ud-kpi-label">Permisos</span><span class="ud-kpi-icon">🔑</span></div><div class="ud-kpi-value" id="ud-kpi-perms">—</div><div class="ud-kpi-sub">Celdas de matriz</div></div>' +
        '<div class="ud-kpi"><div class="ud-kpi-top"><span class="ud-kpi-label">Inactivos</span><span class="ud-kpi-icon">📉</span></div><div class="ud-kpi-value" id="ud-kpi-inactivos">—</div><div class="ud-kpi-sub">Usuarios desactivados</div></div>';
      var heroEl = document.getElementById('ud-hero');
      if (heroEl && heroEl.nextSibling) tab.insertBefore(kpis, heroEl.nextSibling);
      else tab.appendChild(kpis);
    }

    var form = document.getElementById('form-nuevo-usuario');
    if (form && !form.closest('#ud-card-crear')) {
      var card = document.createElement('div');
      card.id = 'ud-card-crear';
      card.className = 'ud-card';
      card.innerHTML = '<div class="ud-card-head"><h3>Crear nuevo usuario</h3></div>';
      form.parentNode.insertBefore(card, form);
      card.appendChild(form);
      var msgN = document.getElementById('msg-nuevo-usuario');
      if (msgN) card.appendChild(msgN);
    }

    var lista = document.getElementById('lista-usuarios');
    if (lista && !lista.closest('#ud-card-lista')) {
      var cardL = document.createElement('div');
      cardL.id = 'ud-card-lista';
      cardL.className = 'ud-card';
      cardL.innerHTML = '<div class="ud-card-head"><h3>Usuarios del sistema</h3><p class="muted">Rol, estado y acciones</p></div>';
      lista.parentNode.insertBefore(cardL, lista);
      cardL.appendChild(lista);
      lista.classList.add('ud-table');
    }

    var roles = document.getElementById('bc-roles-en-usuarios');
    if (roles) {
      roles.classList.add('ud-card', 'ud-roles-card');
      roles.classList.remove('cc-bloque');
    }

    if (!document.getElementById('ud-resumen')) {
      var res = document.createElement('div');
      res.id = 'ud-resumen';
      res.className = 'ud-card';
      res.innerHTML =
        '<div class="ud-card-head"><h3>Resumen rápido</h3></div>' +
        '<div class="ud-resumen">' +
        '<div class="ud-resumen-item"><div class="v" id="ud-res-u">—</div><div class="l">Usuarios activos</div></div>' +
        '<div class="ud-resumen-item"><div class="v" id="ud-res-r">—</div><div class="l">Roles configurados</div></div>' +
        '<div class="ud-resumen-item"><div class="v" id="ud-res-p">—</div><div class="l">Permisos (matriz)</div></div>' +
        '</div>';
      tab.appendChild(res);
    }

    return tab;
  }

  function paintUserRows() {
    var lista = document.getElementById('lista-usuarios');
    if (!lista) return;
    lista.classList.add('ud-table');

    if (!lista.querySelector('.ud-thead') && lista.querySelector('.usuario-item')) {
      var head = document.createElement('div');
      head.className = 'ud-thead';
      head.innerHTML = '<span>Usuario</span><span>Rol</span><span>Estado</span><span></span><span>Acciones</span>';
      lista.insertBefore(head, lista.firstChild);
    }

    lista.querySelectorAll('.usuario-item').forEach(function (item) {
      var muted = item.querySelector('.usuario-principal > .muted');
      if (!muted) return;
      muted.childNodes.forEach(function (n) {
        if (n.nodeType === 3) {
          var t = n.textContent || '';
          if (/Activo|Inactivo|🟢|🔴/.test(t)) {
            var span = document.createElement('span');
            var activo = /Activo|🟢/.test(t) && !/Inactivo|🔴/.test(t);
            span.className = activo ? 'ud-badge-activo' : 'ud-badge-inactivo';
            span.textContent = (activo ? '● Activo' : '● Inactivo');
            n.replaceWith(span);
          } else if (/^[·\s]+$/.test(t)) {
            n.textContent = '';
          }
        }
      });
    });
  }

  function updateKpis() {
    var users = (typeof _usuariosCache !== 'undefined' && Array.isArray(_usuariosCache)) ? _usuariosCache : [];
    var roles = (typeof _rolesCache !== 'undefined' && Array.isArray(_rolesCache)) ? _rolesCache : [];
    var activos = users.filter(function (u) { return u.activo !== false; }).length;
    var inactivos = users.length - activos;
    var permsApprox = roles.length ? roles.length * 14 * 4 : 0;

    function set(id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = String(v);
    }
    set('ud-kpi-activos', activos);
    set('ud-kpi-roles', roles.length);
    set('ud-kpi-perms', permsApprox || '—');
    set('ud-kpi-inactivos', inactivos);
    set('ud-res-u', activos);
    set('ud-res-r', roles.length);
    set('ud-res-p', permsApprox || '—');
    var sub = document.getElementById('ud-kpi-activos-sub');
    if (sub) sub.innerHTML = users.length ? ('<span class="ok">' + activos + ' de ' + users.length + '</span> en total') : 'Sin datos aún';
  }

  function softRoleLabels() {
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
      if (/^Eli/.test(t) && t.length < 12) b.textContent = 'Eliminar';
    });
  }

  function run() {
    css();
    ensureShell();
    paintUserRows();
    updateKpis();
    softRoleLabels();
  }

  function watch() {
    var lista = document.getElementById('lista-usuarios');
    if (lista && lista.dataset.udWatch !== '1') {
      lista.dataset.udWatch = '1';
      var t = null;
      new MutationObserver(function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () { paintUserRows(); updateKpis(); }, 50);
      }).observe(lista, { childList: true, subtree: true });
    }
    var roles = document.getElementById('lista-roles');
    if (roles && roles.dataset.udWatch !== '1') {
      roles.dataset.udWatch = '1';
      var t2 = null;
      new MutationObserver(function () {
        if (t2) clearTimeout(t2);
        t2 = setTimeout(function () { softRoleLabels(); updateKpis(); }, 50);
      }).observe(roles, { childList: true, subtree: true });
    }
    var tabs = document.getElementById('tabs');
    if (tabs && tabs.dataset.udNav !== '1') {
      tabs.dataset.udNav = '1';
      tabs.addEventListener('click', function (e) {
        if (e.target.closest('.tab-btn[data-tab="usuarios"]')) setTimeout(run, 30);
      });
    }
  }

  function boot() {
    run();
    watch();
    setTimeout(run, 500);
    setTimeout(run, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 250); });
  } else {
    setTimeout(boot, 250);
  }
})();
