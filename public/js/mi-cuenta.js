// BattleCruiser — Mi Cuenta, v1.3. Read-only profile view using the shared modal lifecycle.
(function miCuenta() {
  'use strict';
  if (window.__BCMiCuentaLoaded) return;
  window.__BCMiCuentaLoaded = true;

  var modal = null;
  var modalController = null;

  function firstText(obj, keys) {
    if (!obj) return '';
    for (var i = 0; i < keys.length; i += 1) {
      var value = obj[keys[i]];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (value && typeof value.nombre === 'string' && value.nombre.trim()) return value.nombre.trim();
    }
    return '';
  }

  function currentProfile() {
    var user = null;
    try {
      if (typeof _usuarioActual !== 'undefined' && _usuarioActual) user = _usuarioActual;
    } catch (e) {}
    if (!user && window._usuarioActual && typeof window._usuarioActual === 'object') user = window._usuarioActual;
    if (!user || typeof user !== 'object') return null;
    return {
      name: firstText(user, ['nombre', 'name', 'display_name']),
      role: firstText(user, ['rol', 'rol_nombre', 'role']),
      active: typeof user.activo === 'boolean' ? user.activo : null
    };
  }

  function closeModal() {
    if (!modalController || !modalController.isOpen()) return;
    modalController.close();
  }

  function renderProfile() {
    var profile = currentProfile();
    var name = document.getElementById('bc-account-name');
    var role = document.getElementById('bc-account-role');
    var status = document.getElementById('bc-account-status');
    var message = document.getElementById('bc-account-message');
    if (name) name.textContent = profile && profile.name ? profile.name : 'Perfil no disponible';
    if (role) role.textContent = profile && profile.role ? profile.role : 'No disponible';
    if (status) {
      if (profile && profile.active === true) status.textContent = 'Activa';
      else if (profile && profile.active === false) status.textContent = 'Deshabilitada';
      else status.textContent = 'No disponible';
    }
    if (message) {
      message.textContent = profile
        ? 'Información tomada del contexto de la sesión actual. Esta vista no permite cambiar el rol ni los permisos.'
        : 'El perfil no está disponible en memoria en este momento. Comprueba la conexión y vuelve a abrir Mi Cuenta.';
    }
  }

  function buildModal() {
    if (modal && modalController) return modal;
    if (!document.body) return null;
    modal = document.getElementById('bc-mi-cuenta-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bc-mi-cuenta-modal';
      modal.className = 'bc-account-overlay bc-modal-overlay hidden';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = [
        '<section class="bc-account-card bc-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="bc-account-title" tabindex="-1">',
          '<header class="bc-account-header">',
            '<div><p class="bc-account-eyebrow">Perfil actual</p><h2 class="bc-account-title" id="bc-account-title">Mi Cuenta</h2></div>',
            '<button type="button" class="bc-account-close" id="bc-account-close" data-bc-modal-close aria-label="Cerrar Mi Cuenta">×</button>',
          '</header>',
          '<p class="bc-account-message" id="bc-account-message" role="status" aria-live="polite"></p>',
          '<dl class="bc-account-details">',
            '<div><dt>Nombre</dt><dd id="bc-account-name">Cargando…</dd></div>',
            '<div><dt>Rol</dt><dd id="bc-account-role">Cargando…</dd></div>',
            '<div><dt>Estado</dt><dd id="bc-account-status">Cargando…</dd></div>',
          '</dl>',
          '<p class="bc-account-note">Por seguridad, esta pantalla no muestra contraseñas, tokens ni secretos de sesión.</p>',
          '<div class="bc-account-actions">',
            '<button type="button" id="bc-account-back" data-bc-modal-close>Volver</button>',
            '<button type="button" class="bc-account-primary" id="bc-account-password">Cambiar contraseña</button>',
          '</div>',
        '</section>'
      ].join('');
      document.body.appendChild(modal);
    }

    if (!window.BCModalManager || typeof window.BCModalManager.create !== 'function') {
      console.error('[BattleCruiser] No se cargó el controlador compartido de modales; Mi Cuenta permanece cerrada.');
      return null;
    }

    var password = document.getElementById('bc-account-password');
    if (password && password.dataset.bcPasswordActionBound !== '1') {
      password.dataset.bcPasswordActionBound = '1';
      password.addEventListener('click', function () {
        closeModal();
        var passPanel = document.getElementById('pass-panel');
        if (!passPanel) return;
        passPanel.classList.remove('hidden');
        if (typeof passPanel.scrollIntoView === 'function') {
          passPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        var input = passPanel.querySelector('input');
        if (input && typeof input.focus === 'function') input.focus();
      });
    }

    if (!modalController) {
      modalController = window.BCModalManager.create(modal, {
        dialogSelector: '.bc-account-card',
        initialFocusSelector: '#bc-account-close',
        returnFocusSelector: '#mi-cuenta-btn',
        closeSelector: '[data-bc-modal-close]',
        closeOnEscape: true,
        closeOnBackdrop: true,
        trapFocus: true,
        lockScroll: true,
        onOpen: function () {
          var button = document.getElementById('mi-cuenta-btn');
          if (button) button.setAttribute('aria-expanded', 'true');
        },
        onClose: function () {
          var button = document.getElementById('mi-cuenta-btn');
          if (button) button.setAttribute('aria-expanded', 'false');
        }
      });
    }
    return modal;
  }

  function openModal() {
    if (!buildModal() || !modalController) return;
    renderProfile();
    modalController.open();
  }

  function boot() {
    var button = document.getElementById('mi-cuenta-btn');
    if (!button || button.dataset.bcMiCuentaBound === '1') return;
    button.dataset.bcMiCuentaBound = '1';
    button.addEventListener('click', openModal);
    buildModal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
