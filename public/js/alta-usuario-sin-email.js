// BattleCruiser — Alta de usuarios SIN correo (v9.2.46)
// Un solo flujo: Usuario + Contraseña + Rol → Edge Function crear-usuario-sin-email
// Sustituye el handler legacy de auth.js (signUp con email).
(function () {
  'use strict';

  var FORM_ID = 'form-nuevo-usuario';
  var MSG_ID = 'msg-nuevo-usuario';
  var HANDLER_FLAG = 'bcAltaSinEmail';

  function setMsg(text, ok) {
    var el = document.getElementById(MSG_ID);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('ok', !!ok);
    el.classList.toggle('error', !ok && !!text);
  }

  function ensureFormFields() {
    var form = document.getElementById(FORM_ID);
    if (!form) return null;

    var email = document.getElementById('nuevo-usuario-email');
    if (email) {
      var wrap = email.closest('label') || email.parentElement;
      if (wrap && wrap !== form && wrap.querySelectorAll('input').length <= 1) {
        wrap.remove();
      } else {
        email.remove();
      }
    }
    form.querySelectorAll('input[type="email"]').forEach(function (n) {
      n.remove();
    });

    var nombre = document.getElementById('nuevo-usuario-nombre');
    if (nombre) {
      nombre.placeholder = 'Usuario';
      nombre.setAttribute('autocomplete', 'off');
      nombre.type = 'text';
      nombre.required = true;
    }

    var pass = document.getElementById('nuevo-usuario-password');
    if (pass) {
      pass.placeholder = 'Contraseña (mínimo 6 caracteres)';
      pass.required = true;
      pass.minLength = 6;
    }

    var rol = document.getElementById('nuevo-usuario-rol');
    if (!rol) {
      rol = document.createElement('select');
      rol.id = 'nuevo-usuario-rol';
      rol.required = true;
      rol.setAttribute('aria-label', 'Rol');
      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = 'Seleccionar rol…';
      rol.appendChild(ph);
      if (pass && pass.parentNode === form) {
        form.insertBefore(rol, pass.nextSibling);
      } else {
        form.appendChild(rol);
      }
    }

    if (!document.getElementById('nuevo-usuario-cancelar')) {
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.id = 'nuevo-usuario-cancelar';
      cancel.className = 'cc-accion';
      cancel.textContent = 'Cancelar';
      cancel.addEventListener('click', function () {
        var modal = document.getElementById('ud-modal-crear');
        if (modal) modal.classList.remove('open');
        form.reset();
        setMsg('', false);
      });
      var submit = form.querySelector('button[type="submit"]');
      if (submit) {
        submit.textContent = 'Crear usuario';
        form.insertBefore(cancel, submit);
      } else {
        form.appendChild(cancel);
      }
    }

    return form;
  }

  function poblarRoles() {
    var sel = document.getElementById('nuevo-usuario-rol');
    if (!sel) return;
    var actual = sel.value;
    var roles = (typeof _rolesCache !== 'undefined' && Array.isArray(_rolesCache)) ? _rolesCache : [];
    var activos = roles.filter(function (r) { return r.activo !== false; });
    sel.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Seleccionar rol…';
    sel.appendChild(ph);
    activos.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r.id;
      o.textContent = r.nombre || r.id;
      sel.appendChild(o);
    });
    if (actual) sel.value = actual;
  }

  async function asegurarRoles() {
    if (typeof refrescarRoles === 'function') {
      try { await refrescarRoles(false); } catch (_) {}
    } else if (typeof refrescarRolesAdmin === 'function') {
      try { await refrescarRolesAdmin(); } catch (_) {}
    }
    poblarRoles();
  }

  function bindHandler(form) {
    if (form.dataset[HANDLER_FLAG] === '1') return;
    form.dataset[HANDLER_FLAG] = '1';

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();

      setMsg('');
      var nombreEl = document.getElementById('nuevo-usuario-nombre');
      var passEl = document.getElementById('nuevo-usuario-password');
      var rolEl = document.getElementById('nuevo-usuario-rol');
      var nombre = nombreEl ? nombreEl.value.trim() : '';
      var password = passEl ? passEl.value : '';
      var roleId = rolEl ? rolEl.value.trim() : '';

      if (!nombre) {
        setMsg('El usuario es obligatorio.', false);
        return;
      }
      if (!password || password.length < 6) {
        setMsg('La contraseña debe tener al menos 6 caracteres.', false);
        return;
      }
      if (!roleId) {
        setMsg('Debés seleccionar un rol.', false);
        return;
      }

      if (typeof tienePermiso === 'function' && !tienePermiso('usuarios', 'crear')) {
        setMsg('No tenés permiso para crear usuarios.', false);
        return;
      }

      if (typeof showLoading === 'function') showLoading();
      try {
        var sessionRes = await client.auth.getSession();
        var session = sessionRes && sessionRes.data && sessionRes.data.session;
        if (!session || !session.access_token) {
          setMsg('Se perdió la sesión. Cerrá sesión y volvé a entrar.', false);
          return;
        }

        var invoke = await client.functions.invoke('crear-usuario-sin-email', {
          body: { nombre: nombre, password: password, role_id: roleId },
        });

        var data = invoke.data;
        var error = invoke.error;

        if (error) {
          var detail = '';
          try {
            if (error.context && typeof error.context.json === 'function') {
              var j = await error.context.json();
              detail = (j && (j.error || j.message)) || '';
            } else if (error.context && error.context.body) {
              var parsed = typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body;
              detail = (parsed && (parsed.error || parsed.message)) || '';
            }
          } catch (_) {}
          setMsg(detail || error.message || 'No se pudo crear el usuario.', false);
          console.error('[Battlecruiser] crear-usuario-sin-email', error, data);
          return;
        }

        if (data && data.error) {
          setMsg(String(data.error), false);
          return;
        }

        if (!data || data.ok !== true) {
          setMsg((data && data.message) || 'Respuesta inesperada al crear el usuario.', false);
          console.error('[Battlecruiser] crear-usuario-sin-email respuesta', data);
          return;
        }

        setMsg('Usuario creado correctamente.', true);
        form.reset();
        poblarRoles();
        if (typeof refrescarUsuarios === 'function') await refrescarUsuarios();
        setTimeout(function () {
          var modal = document.getElementById('ud-modal-crear');
          if (modal) modal.classList.remove('open');
        }, 900);
      } catch (err) {
        setMsg(
          'Error al crear el usuario (' + (err && err.message ? err.message : 'desconocido') + ').',
          false
        );
        console.error('[Battlecruiser] alta sin email', err);
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    }, true);
  }

  function run() {
    var form = ensureFormFields();
    if (!form) return;
    bindHandler(form);
    asegurarRoles();
  }

  document.addEventListener('click', function (e) {
    if (e.target && (e.target.id === 'ud-scroll-crear' || e.target.closest('#ud-scroll-crear'))) {
      setTimeout(function () {
        run();
        asegurarRoles();
      }, 50);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(run, 300);
      setTimeout(run, 1200);
    });
  } else {
    setTimeout(run, 300);
    setTimeout(run, 1200);
  }
})();
