// BattleCruiser — Mi Cuenta, v1.0. Read-only authenticated profile view.
(function miCuenta() {
  'use strict';
  if (window.__BCMiCuentaLoaded) return;
  window.__BCMiCuentaLoaded = true;

  var modal = null;
  var lastFocus = null;

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
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    var button = document.getElementById('mi-cuenta-btn');
    if (button) button.setAttribute('aria-expanded', 'false');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
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
    if (modal || !document.body) return modal;
    modal = document.getElementById('bc-mi-cuenta-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bc-mi-cuenta-modal';
      modal.className = 'bc-account-overlay hidden';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = [
        '<section class="bc-account-card" role="dialog" aria-modal="true" aria-labelledby="bc-account-title">',
          '<header class="bc-account-header">',
            '<div><p class="bc-account-eyebrow">Perfil actual</p><h2 class="bc-account-title" id="bc-account-title">Mi Cuenta</h2></div>',
            '<button type="button" class="bc-account-close" id="bc-account-close" aria-label="Cerrar Mi Cuenta">×</button>',
          '</header>',
          '<p class="bc-account-message" id="bc-account-message" role="status" aria-live="polite"></p>',
          '<dl class="bc-account-details">',
            '<div><dt>Nombre</dt><dd id="bc-account-name">Cargando…</dd></div>',
            '<div><dt>Rol</dt><dd id="bc-account-role">Cargando…</dd></div>',
            '<div><dt>Estado</dt><dd id="bc-account-status">Cargando…</dd></div>',
          '</dl>',
          '<p class="bc-account-note">Por seguridad, esta pantalla no muestra contraseñas, tokens ni secretos de sesión.</p>',
          '<div class="bc-account-actions">',
            '<button type="button" id="bc-account-back">Volver</button>',
            '<button type="button" class="bc-account-primary" id="bc-account-password">Cambiar contraseña</button>',
          '</div>',
        '</section>'
      ].join('');
      document.body.appendChild(modal);
    }

    var close = document.getElementById('bc-account-close');
    var back = document.getElementById('bc-account-back');
    var password = document.getElementById('bc-account-password');
    if (close) close.addEventListener('click', closeModal);
    if (back) back.addEventListener('click', closeModal);
    if (password) password.addEventListener('click', function () {
      closeModal();
      var trigger = document.getElementById('change-pass-btn');
      if (trigger) trigger.click();
      else {
        var passPanel = document.getElementById('pass-panel');
        if (passPanel) passPanel.classList.remove('hidden');
      }
    });
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal();
    });
    return modal;
  }

  function openModal() {
    if (!buildModal()) return;
    lastFocus = document.activeElement;
    renderProfile();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    var button = document.getElementById('mi-cuenta-btn');
    if (button) button.setAttribute('aria-expanded', 'true');
    var close = document.getElementById('bc-account-close');
    if (close && typeof close.focus === 'function') close.focus();
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