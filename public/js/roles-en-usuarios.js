// BattleCruiser — Roles dentro de Usuarios (v9.2.32)
// Mueve el bloque #form-nuevo-rol / #lista-roles desde Configuración a Usuarios.
// No crea un segundo sistema: reutiliza IDs, handlers y RPCs de usuarios-permisos.js (B3/M11).
(function () {
  'use strict';

  function unificar() {
    var usuarios = document.getElementById('tab-usuarios');
    var form = document.getElementById('form-nuevo-rol');
    var lista = document.getElementById('lista-roles');
    var msg = document.getElementById('msg-roles');
    if (!usuarios || !form || !lista) return;
    if (usuarios.contains(form) && usuarios.contains(lista)) return;

    // Contenedor único bajo Usuarios
    var bloque = document.getElementById('bc-roles-en-usuarios');
    if (!bloque) {
      bloque = document.createElement('div');
      bloque.id = 'bc-roles-en-usuarios';
      bloque.className = 'cc-bloque';
      var h = document.createElement('h3');
      h.textContent = 'Roles y permisos';
      var hint = document.createElement('p');
      hint.className = 'muted';
      hint.style.margin = '0 0 10px';
      hint.textContent = 'Creá un rol, asignale permisos y después asignalo a cada usuario en la lista de arriba.';
      bloque.appendChild(h);
      bloque.appendChild(hint);
      usuarios.appendChild(bloque);
    }

    // Mejorar placeholders del formulario existente (sin clonar handlers)
    var input = document.getElementById('rol-nombre');
    if (input) input.placeholder = 'Nombre del rol (ej. Encargado, Dependienta)';
    var submit = form.querySelector('button[type="submit"]');
    if (submit && submit.textContent.trim() === 'Crear rol') submit.textContent = '+ Crear rol';

    // Reubicar nodos reales (conserva listeners de safeInit admin-roles)
    if (form.parentElement !== bloque) bloque.appendChild(form);
    if (msg && msg.parentElement !== bloque) bloque.appendChild(msg);
    if (lista.parentElement !== bloque) bloque.appendChild(lista);

    // Quitar título huérfano en Config si quedó vacío el bloque original
    var config = document.getElementById('tab-config');
    if (config) {
      config.querySelectorAll('h3').forEach(function (el) {
        if (/Roles y permisos/i.test(el.textContent || '')) el.remove();
      });
    }
  }

  function onUsuariosTab() {
    unificar();
    if (typeof refrescarRolesAdmin === 'function') refrescarRolesAdmin();
  }

  function wireNav() {
    var tabs = document.getElementById('tabs');
    if (!tabs || tabs.dataset.bcRolesNav === '1') return;
    tabs.dataset.bcRolesNav = '1';
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn[data-tab="usuarios"]');
      if (btn) setTimeout(onUsuariosTab, 0);
    });
  }

  function boot() {
    unificar();
    wireNav();
    // Si ya está visible Usuarios
    var panel = document.getElementById('tab-usuarios');
    if (panel && panel.classList.contains('visible')) onUsuariosTab();
  }

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
