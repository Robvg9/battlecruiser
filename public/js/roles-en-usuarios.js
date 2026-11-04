// BattleCruiser — Roles dentro de Administración.
// Gestión de Roles y Permisos vía el modal único de Administración.
// Reutiliza IDs, handlers y RPCs de usuarios-permisos-rest.js (B3/M11).
// Usuarios conserva la asignación del rol a cada cuenta.
// v9.2.33.1: restaurar + Nuevo Usuario (race con dashboard) + input rol compacto
(function () {
  'use strict';

  var MODAL_ROLES_ID = 'bc-modal-roles-permisos';
  var MODAL_NUEVO_ROL_ID = 'bc-modal-nuevo-rol';

  function ensureRolesCss() {
    if (document.getElementById('bc-roles-modal-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-roles-modal-css';
    s.textContent = [
      '#' + MODAL_ROLES_ID + '{position:fixed;inset:0;z-index:1250;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
      '#' + MODAL_ROLES_ID + '.open{display:flex}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-backdrop{position:absolute;inset:0;background:rgba(6,14,11,.72);backdrop-filter:blur(3px)}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-panel{position:relative;z-index:1;width:100%;max-width:720px;max-height:min(90vh,720px);overflow-y:auto;background:linear-gradient(180deg,var(--stone-2),var(--stone));border:1px solid rgba(201,162,77,.28);border-radius:16px;padding:20px 20px 16px;box-shadow:0 24px 64px rgba(0,0,0,.55)}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-head h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.35rem;font-weight:600;color:var(--gold-bright)}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-close{width:36px;height:36px;border-radius:8px;border:1px solid rgba(201,162,77,.28);background:rgba(201,162,77,.08);color:var(--text);cursor:pointer;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-close:hover{border-color:var(--gold);color:var(--gold-bright)}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-hint{margin:0 0 12px;font-size:12.5px;color:var(--mist)}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}',
      '#' + MODAL_ROLES_ID + ' #lista-roles{display:flex;flex-direction:column;gap:0;border-radius:12px;border:1px solid rgba(201,162,77,.12);overflow:hidden}',
      '#' + MODAL_ROLES_ID + ' #msg-roles{margin:10px 0 0;min-height:18px}',
      '#' + MODAL_NUEVO_ROL_ID + '{position:fixed;inset:0;z-index:1300;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
      '#' + MODAL_NUEVO_ROL_ID + '.open{display:flex}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-backdrop{position:absolute;inset:0;background:rgba(6,14,11,.6);backdrop-filter:blur(2px)}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-panel{position:relative;z-index:1;width:100%;max-width:360px;max-height:min(90vh,420px);overflow-y:auto;background:linear-gradient(180deg,var(--stone-2),var(--stone));border:1px solid rgba(201,162,77,.28);border-radius:16px;padding:20px 20px 16px;box-shadow:0 24px 64px rgba(0,0,0,.55)}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-head h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.25rem;font-weight:600;color:var(--gold-bright)}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-close{width:36px;height:36px;border-radius:8px;border:1px solid rgba(201,162,77,.28);background:rgba(201,162,77,.08);color:var(--text);cursor:pointer;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol{display:flex;flex-direction:column;gap:10px;margin:0}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol #rol-nombre{display:block;width:100%;max-width:100%;box-sizing:border-box;height:40px;min-height:40px;max-height:40px;line-height:1.3;border-radius:10px;padding:8px 12px;font-size:14px;resize:none;overflow:hidden}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol button[type=submit]{width:100%;border-radius:10px;padding:10px 12px;font-weight:600}',
      '#' + MODAL_NUEVO_ROL_ID + ' #msg-roles-nuevo{margin:10px 0 0;min-height:18px}',
      '#tab-usuarios > #bc-roles-en-usuarios{display:none!important}',
      '#bc-roles-en-usuarios{display:none!important}',
      '#tab-usuarios .cc-bloque:has(#form-nuevo-rol):not(.bc-roles-panel){display:none!important}',
      '.ud-btn-secondary{background:rgba(201,162,77,.1)!important;color:var(--gold-bright)!important;border:1px solid rgba(201,162,77,.35)!important;font-weight:600;padding:10px 16px!important;border-radius:10px!important;cursor:pointer}',
      '.ud-btn-secondary:hover{border-color:var(--gold);background:rgba(201,162,77,.16)!important}',
      '#ud-hero .ud-hero-actions{display:flex!important;gap:8px;flex-wrap:wrap;align-items:center}',
      '#ud-scroll-crear{display:inline-flex!important}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-panel{display:flex;flex-direction:column;gap:8px;width:min(760px,100%);max-height:min(84vh,680px);max-height:min(84dvh,680px);overflow:hidden;padding:13px 14px 12px;border-radius:12px}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-head{margin:0 0 2px}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-head h3{font-size:1.18rem;line-height:1.1}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-close{width:32px;height:32px}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-hint{margin:0;font-size:10.5px;line-height:1.3}',
      '#' + MODAL_ROLES_ID + ' .bc-roles-actions{margin:0;gap:6px}',
      '#' + MODAL_ROLES_ID + ' #lista-roles{max-height:min(46vh,320px);overflow:auto;overscroll-behavior:contain}',
      '#' + MODAL_ROLES_ID + ' #lista-roles .rol-item{gap:6px;padding:8px 10px}',
      '#' + MODAL_ROLES_ID + ' #lista-roles .rol-item .usuario-acciones{gap:5px}',
      '#' + MODAL_ROLES_ID + ' #lista-roles .rol-item .cc-accion{min-height:30px;padding:5px 8px;font-size:10.5px}',
      '#' + MODAL_ROLES_ID + ' #lista-roles .rol-permisos-panel{max-height:240px;overflow:auto;overscroll-behavior:contain;padding:8px}',
      '#' + MODAL_ROLES_ID + ' #lista-roles .permisos-tabla{font-size:10px}',
      '#' + MODAL_ROLES_ID + ' #lista-roles .permisos-tabla th,#' + MODAL_ROLES_ID + ' #lista-roles .permisos-tabla td{padding:5px 6px}',
      '#' + MODAL_ROLES_ID + ' #lista-roles .permisos-tabla input[type=checkbox]{width:14px;height:14px}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-panel{max-height:min(78vh,360px);max-height:min(78dvh,360px);padding:14px;gap:8px;border-radius:12px}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-head{margin:0 0 2px}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-head h3{font-size:1.1rem}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-close{width:32px;height:32px}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol{gap:7px}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol #rol-nombre{height:36px;min-height:36px;max-height:36px;font-size:12px}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol button[type=submit]{min-height:36px;padding:8px 10px}',
      '@media(max-width:650px){#' + MODAL_ROLES_ID + '{align-items:flex-end;padding:8px}#' + MODAL_ROLES_ID + ' .bc-roles-panel{width:100%;max-height:min(86vh,700px);max-height:min(86dvh,700px);border-radius:12px 12px 10px 10px}#' + MODAL_NUEVO_ROL_ID + '{align-items:flex-end;padding:8px}#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-panel{width:100%;max-width:420px;max-height:min(70vh,360px);max-height:min(70dvh,360px)}}'
    ].join('');
    s.textContent += '\n' +
      '#'+MODAL_ROLES_ID+' .bc-roles-head{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '#'+MODAL_ROLES_ID+' .bc-roles-head-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}' +
      '#'+MODAL_ROLES_ID+' .bc-roles-help-trigger{width:32px;height:32px;border-radius:50%;border:1px solid rgba(201,162,77,.4);background:rgba(201,162,77,.1);color:var(--gold-bright);font-size:17px;line-height:1;cursor:pointer}' +
      '#bc-modal-roles-help{position:fixed;inset:0;z-index:1450;display:none;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}' +
      '#bc-modal-roles-help.open{display:flex}' +
      '#bc-modal-roles-help .bc-roles-help-backdrop{position:absolute;inset:0;background:rgba(4,10,8,.78);backdrop-filter:blur(3px)}' +
      '#bc-modal-roles-help .bc-roles-help-panel{position:relative;z-index:1;width:min(620px,100%);max-height:min(82dvh,640px);overflow:auto;padding:14px;border:1px solid rgba(201,162,77,.28);border-radius:13px;background:linear-gradient(180deg,var(--stone-2),var(--stone));box-shadow:0 24px 64px rgba(0,0,0,.55)}' +
      '#bc-modal-roles-help .bc-roles-help-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}' +
      '#bc-modal-roles-help .bc-roles-help-head h3{margin:0;font-size:1.15rem;color:var(--gold-bright)}' +
      '#bc-roles-help-content{font-size:12px;line-height:1.5}' +
      '#bc-roles-help-content p{margin:6px 0}' +
      '@media(max-width:650px){#bc-modal-roles-help{align-items:flex-end;padding:8px}#bc-modal-roles-help .bc-roles-help-panel{max-height:78dvh;border-radius:12px}}';
    document.head.appendChild(s);
  }

  function openRolesModal() {
    var modal = document.getElementById(MODAL_ROLES_ID);
    if (!modal) { unificar(); modal = document.getElementById(MODAL_ROLES_ID); }
    if (!modal) return;
    ensureRolesHelpModal();
    relocateSmartPermissionsHelp();
    modal.classList.add('open');
    if (typeof refrescarRolesAdmin === 'function') refrescarRolesAdmin();
  }

  function closeRolesModal() {
    var modal = document.getElementById(MODAL_ROLES_ID);
    if (modal) modal.classList.remove('open');
  }

  function openNuevoRolModal() {
    var modal = document.getElementById(MODAL_NUEVO_ROL_ID);
    if (!modal) { unificar(); modal = document.getElementById(MODAL_NUEVO_ROL_ID); }
    if (!modal) return;
    modal.classList.add('open');
    var input = document.getElementById('rol-nombre');
    if (input) {
      if (input.tagName === 'TEXTAREA') {
        var replacement = document.createElement('input');
        replacement.type = 'text';
        replacement.id = input.id;
        replacement.name = input.name || '';
        replacement.placeholder = input.placeholder || 'Nombre del rol';
        replacement.required = input.required;
        replacement.value = input.value || '';
        replacement.className = input.className || '';
        input.parentNode.replaceChild(replacement, input);
        input = replacement;
      }
      input.setAttribute('type', 'text');
      input.setAttribute('rows', '1');
      setTimeout(function () { input.focus(); }, 40);
    }
  }

  function closeNuevoRolModal() {
    var modal = document.getElementById(MODAL_NUEVO_ROL_ID);
    if (modal) modal.classList.remove('open');
  }

  function ensureRolesHelpModal() {
    var modal = document.getElementById('bc-modal-roles-help');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bc-modal-roles-help';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'bc-modal-roles-help-title');
      modal.innerHTML =
        '<div class="bc-roles-help-backdrop" data-bc-roles-help-close="1"></div>' +
        '<section class="bc-roles-help-panel">' +
        '<header class="bc-roles-help-head"><h3 id="bc-modal-roles-help-title">Cómo funcionan los permisos</h3>' +
        '<button type="button" class="bc-roles-close" data-bc-roles-help-close="1" aria-label="Cerrar ayuda">×</button></header>' +
        '<div id="bc-roles-help-content">' +
        '<div id="bc-roles-help-default"><p><strong>Ver:</strong> consultar información.</p><p><strong>Crear:</strong> registrar información nueva.</p><p><strong>Editar:</strong> modificar registros existentes.</p><p><strong>Borrar:</strong> eliminar cuando las reglas y referencias del negocio lo permitan.</p><p>Los permisos se configuran para el rol seleccionado. Después de guardar, ese rol aplica a las cuentas que lo tengan asignado.</p></div>' +
        '</div></section>';
      document.body.appendChild(modal);
      ensureRolesHelpModal();
      modal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-bc-roles-help-close') === '1') closeRolesHelp();
      });
    }
    var info = document.getElementById('bc-btn-roles-help');
    if (info && !info.dataset.bcHelpBound) {
      info.dataset.bcHelpBound = '1';
      info.addEventListener('click', function (e) {
        e.preventDefault();
        ensureRolesHelpModal();
        relocateSmartPermissionsHelp();
        openRolesHelp();
      });
    }
    return modal;
  }

  function openRolesHelp() {
    var modal = ensureRolesHelpModal();
    if (!modal) return;
    modal.classList.add('open');
    var close = modal.querySelector('[data-bc-roles-help-close="1"].bc-roles-close');
    if (close) close.focus();
  }

  function closeRolesHelp() {
    var modal = document.getElementById('bc-modal-roles-help');
    if (modal) modal.classList.remove('open');
  }

  function relocateSmartPermissionsHelp() {
    // La ayuda es una explicación estática y única. No se deben mover al modal
    // matrices generadas por cada rol: eso clonaba visualmente permisos 4-5 veces.
    var host = document.getElementById('bc-roles-help-content');
    if (!host) return false;
    var marker = 'data-bc-roles-help-single';
    if (host.querySelector('[' + marker + '="1"]')) return true;
    host.innerHTML =
      '<div ' + marker + '="1" class="bc-roles-help-guide">' +
        '<p><strong>Ver:</strong> permite consultar la información del módulo.</p>' +
        '<p><strong>Crear:</strong> permite registrar operaciones o elementos nuevos.</p>' +
        '<p><strong>Editar:</strong> permite modificar registros existentes.</p>' +
        '<p><strong>Borrar:</strong> permite eliminar registros cuando las reglas del negocio lo admiten.</p>' +
        '<p>Los permisos se asignan al rol seleccionado. Los usuarios heredan los permisos del rol que tengan asignado.</p>' +
        '<p><strong>Perfiles:</strong> Solo lectura consulta; Operación registra operaciones; Inventario gestiona existencias; Administrador operativo administra las funciones operativas habilitadas.</p>' +
      '</div>';
    return true;
  }

  function ensureSmartPermissionsObserver() {
    var admin = document.getElementById('tab-config');
    if (!admin || admin.dataset.bcSmartPermissionsObserver === '1') return;
    admin.dataset.bcSmartPermissionsObserver = '1';
    if (typeof MutationObserver !== 'function') return;
    var observer = new MutationObserver(function () {
      relocateSmartPermissionsHelp();
    });
    observer.observe(admin, { childList: true, subtree: true });
  }

  function openNuevoUsuarioModal() {
    var form = document.getElementById('form-nuevo-usuario');
    var msgN = document.getElementById('msg-nuevo-usuario');
    if (!form) return;

    var modal = document.getElementById('ud-modal-crear');
    if (!modal) {
      var block = form.closest('.cc-bloque') || form.closest('#ud-card-crear') || form.parentNode;
      if (block && block.id !== 'tab-usuarios' && !block.id.startsWith('ud-modal')) {
        block.style.display = 'none';
        block.setAttribute('aria-hidden', 'true');
      }
      modal = document.createElement('div');
      modal.id = 'ud-modal-crear';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'ud-modal-crear-title');
      modal.innerHTML =
        '<div class="ud-modal-backdrop" data-ud-close="1"></div>' +
        '<div class="ud-modal-panel">' +
        '<div class="ud-modal-head"><h3 id="ud-modal-crear-title">Crear nuevo usuario</h3>' +
        '<button type="button" class="ud-modal-close" data-ud-close="1" aria-label="Cerrar">×</button></div>' +
        '<div class="ud-modal-body"></div>' +
        '</div>';
      document.body.appendChild(modal);
      var body = modal.querySelector('.ud-modal-body');
      body.appendChild(form);
      if (msgN) body.appendChild(msgN);
      modal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-ud-close') === '1') {
          modal.classList.remove('open');
        }
      });
    }
    modal.classList.add('open');
    var n = document.getElementById('nuevo-usuario-nombre');
    if (n) setTimeout(function () { n.focus(); }, 40);
  }

  function unificar() {
    ensureRolesCss();
    var form = document.getElementById('form-nuevo-rol');
    var lista = document.getElementById('lista-roles');
    var msg = document.getElementById('msg-roles');
    if (!form || !lista) return;

    var modal = document.getElementById(MODAL_ROLES_ID);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = MODAL_ROLES_ID;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'bc-modal-roles-title');
      modal.innerHTML =
        '<div class="bc-roles-backdrop" data-bc-roles-close="1"></div>' +
        '<div class="bc-roles-panel">' +
        '<div class="bc-roles-head"><h3 id="bc-modal-roles-title">Roles y Permisos</h3>' +
        '<div class="bc-roles-head-actions"><button type="button" class="bc-roles-help-trigger" id="bc-btn-roles-help" aria-label="Ayuda sobre los permisos" title="Ayuda sobre los permisos">ⓘ</button>' +
        '<button type="button" class="bc-roles-close" data-bc-roles-close="1" aria-label="Cerrar">×</button></div></div>' +
        '<p class="bc-roles-hint">Gestioná roles existentes y asignales permisos. Después asigná el rol a cada usuario en la lista de Usuarios.</p>' +
        '<div class="bc-roles-actions"><button type="button" class="cc-accion ud-btn-primary" id="bc-btn-abrir-nuevo-rol">+ Nuevo Rol</button></div>' +
        '<div class="bc-roles-body" id="bc-roles-lista-wrap"></div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-bc-roles-close') === '1') closeRolesModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var help = document.getElementById('bc-modal-roles-help');
        if (help && help.classList.contains('open')) { closeRolesHelp(); return; }
        var nr = document.getElementById(MODAL_NUEVO_ROL_ID);
        if (nr && nr.classList.contains('open')) { closeNuevoRolModal(); return; }
        if (modal.classList.contains('open')) closeRolesModal();
      });
      var btnNuevo = modal.querySelector('#bc-btn-abrir-nuevo-rol');
      if (btnNuevo) btnNuevo.addEventListener('click', function () { openNuevoRolModal(); });
    }

    var bodyWrap = document.getElementById('bc-roles-lista-wrap');
    if (bodyWrap) {
      if (lista.parentElement !== bodyWrap) bodyWrap.appendChild(lista);
      if (msg && msg.parentElement !== bodyWrap) bodyWrap.appendChild(msg);
    }

    var modalNuevo = document.getElementById(MODAL_NUEVO_ROL_ID);
    if (!modalNuevo) {
      modalNuevo = document.createElement('div');
      modalNuevo.id = MODAL_NUEVO_ROL_ID;
      modalNuevo.setAttribute('role', 'dialog');
      modalNuevo.setAttribute('aria-modal', 'true');
      modalNuevo.setAttribute('aria-labelledby', 'bc-modal-nuevo-rol-title');
      modalNuevo.innerHTML =
        '<div class="bc-roles-backdrop" data-bc-nuevo-rol-close="1"></div>' +
        '<div class="bc-roles-panel">' +
        '<div class="bc-roles-head"><h3 id="bc-modal-nuevo-rol-title">Nuevo Rol</h3>' +
        '<button type="button" class="bc-roles-close" data-bc-nuevo-rol-close="1" aria-label="Cerrar">×</button></div>' +
        '<div class="bc-nuevo-rol-body" id="bc-nuevo-rol-body"></div>' +
        '<p class="msg" id="msg-roles-nuevo"></p>' +
        '</div>';
      document.body.appendChild(modalNuevo);
      modalNuevo.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-bc-nuevo-rol-close') === '1') closeNuevoRolModal();
      });
    }

    var nuevoBody = document.getElementById('bc-nuevo-rol-body');
    if (nuevoBody && form.parentElement !== nuevoBody) nuevoBody.appendChild(form);

    var input = document.getElementById('rol-nombre');
    if (input) {
      if (input.tagName === 'TEXTAREA') {
        var replacement = document.createElement('input');
        replacement.type = 'text';
        replacement.id = input.id;
        replacement.name = input.name || '';
        replacement.placeholder = 'Nombre del rol';
        replacement.required = true;
        replacement.value = input.value || '';
        input.parentNode.replaceChild(replacement, input);
        input = replacement;
      }
      input.placeholder = 'Nombre del rol';
      input.setAttribute('type', 'text');
    }
    var submit = form.querySelector('button[type="submit"]');
    if (submit) {
      var t = (submit.textContent || '').trim();
      if (t === 'Crear rol' || t === '+ Crear rol') submit.textContent = 'Crear rol';
    }

    var config = document.getElementById('tab-config');
    if (config) {
      config.querySelectorAll('h3').forEach(function (el) {
        if (!/Roles y permisos/i.test(el.textContent || '')) return;
        var bloque = el.closest('.cc-bloque');
        if (!bloque || bloque.querySelector('#lista-categorias') || bloque.querySelector('#form-categoria')) return;

        // Roles stays discoverable under Configuración, while its existing form/list
        // remain in the single established modal to avoid duplicate IDs or handlers.
        bloque.style.display = '';
        bloque.removeAttribute('aria-hidden');
        var entry = document.getElementById('bc-btn-config-roles');
        if (!entry) {
          entry = document.createElement('button');
          entry.type = 'button';
          entry.id = 'bc-btn-config-roles';
          entry.className = 'cc-accion ud-btn-secondary';
          entry.textContent = 'Administrar roles y permisos';
          entry.addEventListener('click', openRolesModal);
        }
        if (entry.parentElement !== bloque) bloque.appendChild(entry);
      });
    }
    var legacy = document.getElementById('bc-roles-en-usuarios');
    if (legacy) {
      legacy.style.display = 'none';
      legacy.setAttribute('aria-hidden', 'true');
    }

    if (msg && !msg.dataset.bcNuevoRolWatch) {
      msg.dataset.bcNuevoRolWatch = '1';
      new MutationObserver(function () {
        if (msg.classList.contains('ok') && (msg.textContent || '').trim()) {
          var texto = (msg.textContent || '').toLowerCase();
          if (/rol creado|creado/.test(texto)) setTimeout(closeNuevoRolModal, 600);
        }
      }).observe(msg, { attributes: true, childList: true, characterData: true, subtree: true });
    }
  }

  function onUsuariosTab() { unificar(); injectHeroButtons(); wireHeroButtons(); }

  function wireNav() {
    var tabs = document.getElementById('tabs');
    if (!tabs || tabs.dataset.bcRolesNav === '1') return;
    tabs.dataset.bcRolesNav = '1';
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn[data-tab="usuarios"]');
      if (btn) setTimeout(onUsuariosTab, 0);
    });
  }

  function injectHeroButtons() {
    ensureRolesCss();
    var tab = document.getElementById('tab-usuarios');
    if (!tab) return;

    var hero = document.getElementById('ud-hero');
    if (!hero) {
      hero = document.createElement('div');
      hero.id = 'ud-hero';
      hero.className = 'ud-hero';
      hero.innerHTML =
        '<div><h2>Usuarios</h2><p>Gestiona las cuentas y el acceso asignado a cada persona.</p></div>' +
        '<div class="ud-hero-actions"></div>';
      tab.insertBefore(hero, tab.firstChild);
    }

    var actions = hero.querySelector('.ud-hero-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'ud-hero-actions';
      hero.appendChild(actions);
    }

    var nuevo = document.getElementById('ud-scroll-crear');
    if (!nuevo) {
      nuevo = document.createElement('button');
      nuevo.type = 'button';
      nuevo.className = 'ud-btn-primary';
      nuevo.id = 'ud-scroll-crear';
      nuevo.textContent = '+ Nuevo Usuario';
      actions.insertBefore(nuevo, actions.firstChild);
    } else {
      nuevo.textContent = '+ Nuevo Usuario';
      nuevo.classList.add('ud-btn-primary');
      nuevo.style.display = '';
      nuevo.removeAttribute('hidden');
      if (nuevo.parentElement !== actions) {
        actions.insertBefore(nuevo, actions.firstChild);
      } else if (actions.firstChild !== nuevo) {
        actions.insertBefore(nuevo, actions.firstChild);
      }
    }

    // Role management has one canonical entry in Administration.
    // Remove any stale shortcut left by a previously cached module.
    var legacyRolesButton = document.getElementById('ud-btn-roles');
    if (legacyRolesButton) legacyRolesButton.remove();
  }

  function wireHeroButtons() {
    injectHeroButtons();

    var nuevo = document.getElementById('ud-scroll-crear');
    if (nuevo && !nuevo.dataset.bcNuevoBound) {
      nuevo.dataset.bcNuevoBound = '1';
      nuevo.addEventListener('click', function (e) {
        e.preventDefault();
        openNuevoUsuarioModal();
      });
    }

  }

  function boot() {
    unificar();
    ensureRolesHelpModal();
    relocateSmartPermissionsHelp();
    ensureSmartPermissionsObserver();
    wireNav();
    injectHeroButtons();
    wireHeroButtons();
    var panel = document.getElementById('tab-usuarios');
    if (panel && panel.classList.contains('visible')) onUsuariosTab();
    setTimeout(wireHeroButtons, 400);
    setTimeout(wireHeroButtons, 1200);
    setTimeout(wireHeroButtons, 2500);
  }

  window.bcOpenRolesModal = openRolesModal;
  window.bcOpenRolesHelp = openRolesHelp;
  window.bcCloseRolesHelp = closeRolesHelp;
  window.bcCloseRolesModal = closeRolesModal;
  window.bcOpenNuevoRolModal = openNuevoRolModal;
  window.bcCloseNuevoRolModal = closeNuevoRolModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 200);
      setTimeout(boot, 800);
    });
  } else {
    setTimeout(boot, 200);
    setTimeout(boot, 800);
  }
})();
