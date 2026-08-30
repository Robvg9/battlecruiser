// BattleCruiser — Roles dentro de Usuarios (v9.2.33 · Micro-misión 001)
// Gestión de Roles y Permisos vía modal (no card inferior permanente).
// Reutiliza IDs, handlers y RPCs de usuarios-permisos-rest.js (B3/M11).
// Flujo: Usuarios → botón Roles → modal Roles y Permisos → Nuevo Rol → modal Nuevo Rol
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
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-panel{position:relative;z-index:1;width:100%;max-width:420px;max-height:min(90vh,480px);overflow-y:auto;background:linear-gradient(180deg,var(--stone-2),var(--stone));border:1px solid rgba(201,162,77,.28);border-radius:16px;padding:20px 20px 16px;box-shadow:0 24px 64px rgba(0,0,0,.55)}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-head h3{margin:0;font-family:Cormorant Garamond,serif;font-size:1.25rem;font-weight:600;color:var(--gold-bright)}',
      '#' + MODAL_NUEVO_ROL_ID + ' .bc-roles-close{width:36px;height:36px;border-radius:8px;border:1px solid rgba(201,162,77,.28);background:rgba(201,162,77,.08);color:var(--text);cursor:pointer;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol{display:flex;flex-direction:column;gap:10px;margin:0}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol #rol-nombre{width:100%;box-sizing:border-box;border-radius:10px;padding:11px 12px}',
      '#' + MODAL_NUEVO_ROL_ID + ' #form-nuevo-rol button[type=submit]{width:100%;border-radius:10px;padding:12px;font-weight:600}',
      '#' + MODAL_NUEVO_ROL_ID + ' #msg-roles-nuevo{margin:10px 0 0;min-height:18px}',
      '#tab-usuarios > #bc-roles-en-usuarios{display:none!important}',
      '#bc-roles-en-usuarios{display:none!important}',
      '#tab-usuarios .cc-bloque:has(#form-nuevo-rol):not(.bc-roles-panel){display:none!important}',
      '.ud-btn-secondary{background:rgba(201,162,77,.1)!important;color:var(--gold-bright)!important;border:1px solid rgba(201,162,77,.35)!important;font-weight:600;padding:10px 16px!important;border-radius:10px!important;cursor:pointer}',
      '.ud-btn-secondary:hover{border-color:var(--gold);background:rgba(201,162,77,.16)!important}'
    ].join('');
    document.head.appendChild(s);
  }

  function openRolesModal() {
    var modal = document.getElementById(MODAL_ROLES_ID);
    if (!modal) { unificar(); modal = document.getElementById(MODAL_ROLES_ID); }
    if (!modal) return;
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
    if (input) setTimeout(function () { input.focus(); }, 40);
  }

  function closeNuevoRolModal() {
    var modal = document.getElementById(MODAL_NUEVO_ROL_ID);
    if (modal) modal.classList.remove('open');
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
        '<button type="button" class="bc-roles-close" data-bc-roles-close="1" aria-label="Cerrar">×</button></div>' +
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
    if (input) input.placeholder = 'Nombre del rol (ej. Encargado, Dependienta)';
    var submit = form.querySelector('button[type="submit"]');
    if (submit) {
      var t = (submit.textContent || '').trim();
      if (t === 'Crear rol' || t === '+ Crear rol') submit.textContent = 'Crear rol';
    }

    var config = document.getElementById('tab-config');
    if (config) {
      config.querySelectorAll('h3').forEach(function (el) {
        if (/Roles y permisos/i.test(el.textContent || '')) {
          var bloque = el.closest('.cc-bloque');
          if (bloque && !bloque.querySelector('#lista-categorias') && !bloque.querySelector('#form-categoria')) {
            if (!bloque.contains(form) && !bloque.contains(lista)) bloque.style.display = 'none';
            else el.remove();
          } else el.remove();
        }
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

  function onUsuariosTab() { unificar(); injectRolesButton(); wireHeroRolesButton(); }

  function wireNav() {
    var tabs = document.getElementById('tabs');
    if (!tabs || tabs.dataset.bcRolesNav === '1') return;
    tabs.dataset.bcRolesNav = '1';
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn[data-tab="usuarios"]');
      if (btn) setTimeout(onUsuariosTab, 0);
    });
  }

  function injectRolesButton() {
    ensureRolesCss();
    var actions = document.querySelector('#ud-hero .ud-hero-actions');
    if (!actions) {
      var tab = document.getElementById('tab-usuarios');
      if (!tab) return;
      var hero = document.getElementById('ud-hero');
      if (!hero) {
        hero = document.createElement('div');
        hero.id = 'ud-hero';
        hero.className = 'ud-hero';
        hero.innerHTML = '<div><h2>Usuarios</h2><p>Gestioná usuarios, roles y permisos del sistema.</p></div><div class="ud-hero-actions"></div>';
        tab.insertBefore(hero, tab.firstChild);
        actions = hero.querySelector('.ud-hero-actions');
      } else {
        actions = hero.querySelector('.ud-hero-actions');
        if (!actions) {
          actions = document.createElement('div');
          actions.className = 'ud-hero-actions';
          hero.appendChild(actions);
        }
      }
    }
    if (!document.getElementById('ud-btn-roles')) {
      var rolesBtn = document.createElement('button');
      rolesBtn.type = 'button';
      rolesBtn.className = 'ud-btn-secondary';
      rolesBtn.id = 'ud-btn-roles';
      rolesBtn.textContent = 'Roles';
      actions.appendChild(rolesBtn);
    }
    var nuevo = document.getElementById('ud-scroll-crear');
    if (nuevo && /nuevo usuario/i.test(nuevo.textContent || '')) {
      nuevo.textContent = '+ Nuevo Usuario';
    }
  }

  function wireHeroRolesButton() {
    injectRolesButton();
    var btn = document.getElementById('ud-btn-roles');
    if (btn && !btn.dataset.bcRolesBound) {
      btn.dataset.bcRolesBound = '1';
      btn.addEventListener('click', function () {
        unificar();
        openRolesModal();
      });
    }
  }

  function boot() {
    unificar();
    wireNav();
    injectRolesButton();
    wireHeroRolesButton();
    var panel = document.getElementById('tab-usuarios');
    if (panel && panel.classList.contains('visible')) onUsuariosTab();
    setTimeout(wireHeroRolesButton, 400);
    setTimeout(wireHeroRolesButton, 1200);
  }

  window.bcOpenRolesModal = openRolesModal;
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
